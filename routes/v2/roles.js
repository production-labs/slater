// Roles: global (owner_id NULL, read-only) + the user's custom roles.
//
//   GET    /            ?since=   global + own; with since, includes archived (tombstones)
//   POST   /                      create custom role (re-creating an archived
//                                 custom role with the same name revives it)
//   PATCH  /:id                   own custom roles only; requires base_updated_at
//   DELETE /:id                   own only; refused (409) while in use by any
//                                 contact or project entry; otherwise archived
//   POST   /:id/restore           own only
//
// "In use" must check projects.data JSONB too: crew / talent / kp_cards
// entries carry role_id there (Session 5), and no foreign key can see that.

const express = require('express');
const { pool, tx } = require('./db');
const { HttpError, clean, parseId, handle } = require('./fields');
const { maxCursor } = require('./resource');
const { projectsReferencing, refuseIfUsed, tombstone, pullDeleted } = require('./purge');

const CATEGORIES = ['staff', 'crew', 'talent'];
const SPEC = {
  name:         { type: 'text', required: true },
  abbreviation: { type: 'text' },
  category:     { type: 'text', required: true },
  department:   { type: 'text' },
};
const SELECT = `id, owner_id, (owner_id IS NULL) AS is_global, name, abbreviation, category,
                department, sort_order, archived_at, created_at, updated_at`;

function checkCategory(values) {
  if ('category' in values && !CATEGORIES.includes(values.category)) {
    throw new HttpError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  }
}

async function pull(db, userId, since) {
  const r = since
    ? await db.query(
        `SELECT ${SELECT} FROM roles
          WHERE (owner_id IS NULL OR owner_id = $1)
            AND updated_at > $2::timestamptz - interval '10 seconds'
          ORDER BY updated_at, id`, [userId, since])
    : await db.query(
        // Active roles, plus archived/retired ones still attached to one of
        // this user's contacts (so their pills can show the real name).
        `SELECT ${SELECT} FROM roles
          WHERE (owner_id IS NULL OR owner_id = $1)
            AND (archived_at IS NULL OR EXISTS (
                  SELECT 1 FROM contact_roles cr JOIN contacts c ON c.id = cr.contact_id
                   WHERE cr.role_id = roles.id AND c.owner_id = $1))
          ORDER BY category, sort_order, lower(name)`, [userId]);
  return r.rows;
}

async function fetchOwn(db, userId, id, lock) {
  const r = await db.query(`SELECT ${SELECT} FROM roles WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  const row = r.rows[0];
  if (!row || (row.owner_id !== null && row.owner_id !== userId)) throw new HttpError(404, 'Not found');
  if (row.owner_id === null) throw new HttpError(403, 'Built-in roles cannot be changed');
  return row;
}

async function usage(db, userId, roleId) {
  const c = await db.query(
    `SELECT COUNT(*)::int AS n FROM contact_roles cr JOIN contacts ct ON ct.id = cr.contact_id
      WHERE cr.role_id = $1 AND ct.owner_id = $2`, [roleId, userId]);
  const needle = JSON.stringify([{ role_id: roleId }]);
  const p = await db.query(
    `SELECT COUNT(*)::int AS n FROM projects
      WHERE owner_id = $1
        AND (data->'crew' @> $2::jsonb OR data->'talent' @> $2::jsonb OR data->'kp_cards' @> $2::jsonb)`,
    [userId, needle]);
  return { contacts: c.rows[0].n, projects: p.rows[0].n };
}

const router = express.Router();

router.get('/', handle(async (req, res) => {
  const since = req.query.since || null;
  const rows = await pull(pool, req.session.userId, since);
  const deleted = await pullDeleted(pool, req.session.userId, since, 'roles');
  res.json({ rows, deleted, cursor: maxCursor(rows.concat(deleted.map(d => ({ updated_at: d.deleted_at }))), since) });
}));

router.post('/', handle(async (req, res) => {
  const userId = req.session.userId;
  const values = clean(SPEC, req.body, { partial: false });
  checkCategory(values);

  const out = await tx(async client => {
    const ex = await client.query(
      `SELECT id, archived_at FROM roles WHERE owner_id = $1 AND lower(name) = lower($2) FOR UPDATE`,
      [userId, values.name]);
    if (ex.rows.length && !ex.rows[0].archived_at) {
      throw new HttpError(409, 'You already have a role with that name', { id: ex.rows[0].id });
    }
    let id;
    if (ex.rows.length) {
      id = ex.rows[0].id;
      await client.query(
        `UPDATE roles SET name = $2, abbreviation = $3, category = $4, department = $5, archived_at = NULL
          WHERE id = $1`, [id, values.name, values.abbreviation, values.category, values.department]);
    } else {
      const ins = await client.query(
        `INSERT INTO roles (owner_id, name, abbreviation, category, department, sort_order)
         VALUES ($1, $2, $3, $4, $5, 9000) RETURNING id`,
        [userId, values.name, values.abbreviation, values.category, values.department]);
      id = ins.rows[0].id;
    }
    const r = await client.query(`SELECT ${SELECT} FROM roles WHERE id = $1`, [id]);
    return { created: !ex.rows.length, row: r.rows[0] };
  });
  res.status(out.created ? 201 : 200).json(out.row);
}));

router.patch('/:id', handle(async (req, res) => {
  const userId = req.session.userId;
  const id = parseId(req.params.id);
  const base = req.body && req.body.base_updated_at;
  if (!base || typeof base !== 'string') throw new HttpError(400, 'base_updated_at is required');
  const values = clean(SPEC, req.body, { partial: true });
  checkCategory(values);

  const row = await tx(async client => {
    await fetchOwn(client, userId, id, true);
    const chk = await client.query('SELECT (updated_at = $2::timestamptz) AS ok, archived_at FROM roles WHERE id = $1', [id, base]);
    if (!chk.rows[0].ok) {
      const cur = await client.query(`SELECT ${SELECT} FROM roles WHERE id = $1`, [id]);
      throw new HttpError(409, 'conflict', { current: cur.rows[0] });
    }
    const setCols = Object.keys(values);
    if (setCols.length) {
      await client.query(
        `UPDATE roles SET ${setCols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...setCols.map(c => values[c])]);
    }
    const r = await client.query(`SELECT ${SELECT} FROM roles WHERE id = $1`, [id]);
    return r.rows[0];
  });
  res.json(row);
}));

router.delete('/:id', handle(async (req, res) => {
  const userId = req.session.userId;
  const id = parseId(req.params.id);
  const row = await tx(async client => {
    await fetchOwn(client, userId, id, true);
    const used = await usage(client, userId, id);
    if (used.contacts || used.projects) {
      throw new HttpError(409, 'in_use', { usage: used });
    }
    await client.query('UPDATE roles SET archived_at = clock_timestamp() WHERE id = $1 AND archived_at IS NULL', [id]);
    const r = await client.query(`SELECT ${SELECT} FROM roles WHERE id = $1`, [id]);
    return r.rows[0];
  });
  res.json(row);
}));

// Permanently delete an archived custom role nobody uses.
router.delete('/:id/permanent', handle(async (req, res) => {
  const userId = req.session.userId;
  const id = parseId(req.params.id);
  await tx(async client => {
    const row = await fetchOwn(client, userId, id, true);
    if (!row.archived_at) throw new HttpError(409, 'not_archived');
    const used = await usage(client, userId, id);
    if (used.contacts) throw new HttpError(409, 'in_use', { usage: used });
    refuseIfUsed(await projectsReferencing(client, userId, 'role_id', id));
    await client.query('DELETE FROM roles WHERE id = $1 AND owner_id = $2', [id, userId]);
    await tombstone(client, userId, 'roles', id);
  });
  res.json({ deleted: true, id });
}));

router.post('/:id/restore', handle(async (req, res) => {
  const userId = req.session.userId;
  const id = parseId(req.params.id);
  await fetchOwn(pool, userId, id, false);
  await pool.query('UPDATE roles SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL', [id]);
  const r = await pool.query(`SELECT ${SELECT} FROM roles WHERE id = $1`, [id]);
  res.json(r.rows[0]);
}));

module.exports = { router, pull };
