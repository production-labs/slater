// Generic per-user, per-record resource for the v2 data model
// (contacts, organizations, locations). One router per table.
//
// Endpoints (all scoped to req.session.userId):
//   GET    /            ?since=<cursor>   list / sync pull
//   GET    /:id
//   POST   /                             create (optional client_uid for idempotent retries)
//   PATCH  /:id                          partial update; requires base_updated_at
//   DELETE /:id                          archive (soft delete = sync tombstone)
//   POST   /:id/restore                  un-archive
//
// Sync contract (Session 7 builds the client half):
//   - Without ?since: active rows only (initial load).
//   - With ?since: every row changed after (since - 10s), INCLUDING archived
//     rows, so deletes propagate as tombstones. The 10s overlap covers rows
//     stamped inside a slow transaction that committed after the client's
//     last pull. Clients dedupe by id and keep the newer updated_at.
//   - Response cursor = newest updated_at in the response (or the given since).
//   - PATCH must send base_updated_at = the updated_at the edit started from.
//     If the row has moved on since, the server changes nothing and answers
//     409 { error: "conflict", current: <server row> }. The client three-way
//     merges (baseline vs local vs current) and retries with the new base.
//   - Archive is not base-checked: delete beats a concurrent edit. Restore
//     exists if that was wrong.

const express = require('express');
const { pool, tx } = require('./db');
const { HttpError, clean, parseId, handle } = require('./fields');

const OVERLAP = "interval '10 seconds'";
const CLIENT_UID_MAX = 100;

function makeResource(cfg) {
  // cfg: { table, spec, extraSelect?, afterWrite?(client, userId, id, body, isCreate),
  //        validate?(client, userId, values, body), onArchive?(client, userId, id) }
  const { table, spec } = cfg;
  const cols = Object.keys(spec);
  const selectList = ['t.id', ...cols.map(c => `t.${c}`), 't.client_uid', 't.archived_at', 't.created_at', 't.updated_at']
    .concat(cfg.extraSelect ? [cfg.extraSelect] : [])
    .join(', ');

  async function fetchOne(db, userId, id) {
    const r = await db.query(`SELECT ${selectList} FROM ${table} t WHERE t.id = $1 AND t.owner_id = $2`, [id, userId]);
    return r.rows[0] || null;
  }

  async function pull(db, userId, since) {
    const r = since
      ? await db.query(
          `SELECT ${selectList} FROM ${table} t
            WHERE t.owner_id = $1 AND t.updated_at > $2::timestamptz - ${OVERLAP}
            ORDER BY t.updated_at, t.id`, [userId, since])
      : await db.query(
          `SELECT ${selectList} FROM ${table} t
            WHERE t.owner_id = $1 AND t.archived_at IS NULL
            ORDER BY t.updated_at, t.id`, [userId]);
    return r.rows;
  }

  async function checkOrgRefs(db, userId, values) {
    for (const [col, def] of Object.entries(spec)) {
      if (def.type !== 'orgRef' || values[col] == null) continue;
      // Ownership only. Archived orgs are allowed so a merged record that
      // re-sends an unchanged link to a since-archived org does not fail.
      // The UI only offers active orgs for new links.
      const r = await db.query(
        'SELECT 1 FROM organizations WHERE id = $1 AND owner_id = $2',
        [values[col], userId]);
      if (!r.rows.length) throw new HttpError(400, `${col} does not match one of your organizations`);
    }
  }

  const router = express.Router();

  router.get('/', handle(async (req, res) => {
    const since = req.query.since || null;
    const rows = await pull(pool, req.session.userId, since);
    res.json({ rows, cursor: maxCursor(rows, since) });
  }));

  router.get('/:id', handle(async (req, res) => {
    const row = await fetchOne(pool, req.session.userId, parseId(req.params.id));
    if (!row) throw new HttpError(404, 'Not found');
    res.json(row);
  }));

  router.post('/', handle(async (req, res) => {
    const userId = req.session.userId;
    const values = clean(spec, req.body, { partial: false });
    let clientUid = req.body.client_uid ?? null;
    if (clientUid !== null && (typeof clientUid !== 'string' || !clientUid || clientUid.length > CLIENT_UID_MAX)) {
      throw new HttpError(400, 'client_uid must be a short string');
    }

    const result = await tx(async client => {
      await checkOrgRefs(client, userId, values);
      if (cfg.validate) await cfg.validate(client, userId, values, req.body, true);

      const insertCols = ['owner_id', 'client_uid', ...cols];
      const params = [userId, clientUid, ...cols.map(c => values[c])];
      const ins = await client.query(
        `INSERT INTO ${table} (${insertCols.join(', ')})
         VALUES (${insertCols.map((_, i) => '$' + (i + 1)).join(', ')})
         ON CONFLICT (owner_id, client_uid) WHERE client_uid IS NOT NULL DO NOTHING
         RETURNING id`, params);

      if (!ins.rows.length) {
        // Retry of a create we already have: return it untouched.
        const ex = await client.query(`SELECT id FROM ${table} WHERE owner_id = $1 AND client_uid = $2`, [userId, clientUid]);
        return { created: false, row: await fetchOne(client, userId, ex.rows[0].id) };
      }
      const id = ins.rows[0].id;
      if (cfg.afterWrite) await cfg.afterWrite(client, userId, id, req.body, true);
      return { created: true, row: await fetchOne(client, userId, id) };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  }));

  router.patch('/:id', handle(async (req, res) => {
    const userId = req.session.userId;
    const id = parseId(req.params.id);
    const base = req.body && req.body.base_updated_at;
    if (!base || typeof base !== 'string') throw new HttpError(400, 'base_updated_at is required');
    const values = clean(spec, req.body, { partial: true });

    const row = await tx(async client => {
      const lock = await client.query(
        `SELECT (updated_at = $3::timestamptz) AS base_ok, archived_at
           FROM ${table} WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [id, userId, base]);
      if (!lock.rows.length) throw new HttpError(404, 'Not found');
      if (!lock.rows[0].base_ok) {
        throw new HttpError(409, 'conflict', { current: await fetchOne(client, userId, id) });
      }
      if (lock.rows[0].archived_at) {
        throw new HttpError(409, 'archived', { current: await fetchOne(client, userId, id) });
      }

      await checkOrgRefs(client, userId, values);
      if (cfg.validate) await cfg.validate(client, userId, values, req.body, false);

      const setCols = Object.keys(values);
      if (setCols.length) {
        await client.query(
          `UPDATE ${table} SET ${setCols.map((c, i) => `${c} = $${i + 3}`).join(', ')}
            WHERE id = $1 AND owner_id = $2`,
          [id, userId, ...setCols.map(c => values[c])]);
      }
      if (cfg.afterWrite) await cfg.afterWrite(client, userId, id, req.body, false);
      return fetchOne(client, userId, id);
    });
    res.json(row);
  }));

  router.delete('/:id', handle(async (req, res) => {
    const userId = req.session.userId;
    const id = parseId(req.params.id);
    const row = await tx(async client => {
      const r = await client.query(
        `UPDATE ${table} SET archived_at = clock_timestamp()
          WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL RETURNING id`, [id, userId]);
      if (r.rows.length && cfg.onArchive) await cfg.onArchive(client, userId, id);
      const cur = await fetchOne(client, userId, id);
      if (!cur) throw new HttpError(404, 'Not found');
      return cur; // already-archived rows are returned as-is (idempotent)
    });
    res.json(row);
  }));

  router.post('/:id/restore', handle(async (req, res) => {
    const userId = req.session.userId;
    const id = parseId(req.params.id);
    await pool.query(
      `UPDATE ${table} SET archived_at = NULL WHERE id = $1 AND owner_id = $2 AND archived_at IS NOT NULL`,
      [id, userId]);
    const row = await fetchOne(pool, userId, id);
    if (!row) throw new HttpError(404, 'Not found');
    res.json(row);
  }));

  return { router, pull };
}

// Newest updated_at among rows. ISO strings in the same UTC format
// compare correctly as strings.
function maxCursor(rows, fallback) {
  let max = fallback || null;
  for (const r of rows) if (!max || r.updated_at > max) max = r.updated_at;
  return max;
}

module.exports = { makeResource, maxCursor };
