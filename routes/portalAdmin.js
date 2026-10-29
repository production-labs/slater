// Client Portal: the PRODUCER side (V1.5 step 5b, 2026-10-28).
//
// Mounted at /api/portal-admin behind requireAuth. Every route finds the
// project by key AND owner_id, so a producer can only touch their own
// portals. The public side (what the client sees) is routes/portal.js.
//
//   GET    /:key                 portal status + posted updates
//   POST   /:key/enable          turn the portal on (makes a link)
//   DELETE /:key                 turn it off (old link stops working;
//                                posted updates are kept for next time)
//   POST   /:key/regenerate      new link, old one stops working
//   PUT    /:key/password        { password } sets it, null/"" removes it
//   POST   /:key/updates         { body } posts an update
//   DELETE /:key/updates/:id     removes an update
//   POST   /:key/responses/:id/ack   client response seen (confirmed or
//                                    dismissed); it drops off every list
//   GET    /responses/pending   unconfirmed client responses, all projects
//                               (for the Rundown)
//
// Client responses (approve / request changes) are written by the PUBLIC
// side and include text the client typed. The browser must treat
// responder_name and note as plain text, never HTML.
//
// The token is never logged. The password hash never leaves the server;
// the browser only learns whether one is set.

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PW_MIN = 6, PW_MAX = 200, BODY_MAX = 10000;
const newToken = () => crypto.randomBytes(32).toString('base64url');

async function findProject(req) {
  const r = await pool.query('SELECT id FROM projects WHERE key = $1 AND owner_id = $2',
    [req.params.key, req.session.userId]);
  return r.rows[0] || null;
}

async function status(projectId, ownerId) {
  const [p, u, r] = await Promise.all([
    pool.query('SELECT token, password_hash IS NOT NULL AS has_password, created_at FROM portals WHERE project_id = $1 AND owner_id = $2', [projectId, ownerId]),
    pool.query('SELECT id, author_name, body, created_at FROM portal_updates WHERE project_id = $1 AND owner_id = $2 ORDER BY created_at DESC, id DESC', [projectId, ownerId]),
    pool.query(`SELECT id, wb_item_uuid, kind, responder_name, note, created_at FROM portal_responses
                 WHERE project_id = $1 AND owner_id = $2 AND acknowledged_at IS NULL ORDER BY created_at DESC, id DESC`, [projectId, ownerId]),
  ]);
  const row = p.rows[0];
  return {
    enabled: !!row,
    token: row ? row.token : null,
    has_password: row ? row.has_password : false,
    enabled_at: row ? row.created_at : null,
    updates: u.rows,
    responses: r.rows,
  };
}

// Wraps a handler: finds the project (404 if it isn't this user's) and
// answers with the fresh status unless the handler already responded.
function withProject(fn) {
  return async (req, res) => {
    try {
      const project = await findProject(req);
      if (!project) return res.status(404).json({ error: 'not_found' });
      const out = await fn(req, res, project);
      if (res.headersSent) return;
      if (out === false) return;
      res.json(await status(project.id, req.session.userId));
    } catch (err) {
      console.error('Portal admin failed:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'server_error' });
    }
  };
}

// Every project's unconfirmed client responses, newest first, with the
// workback item's current name and status looked up from the project.
router.get('/responses/pending', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.wb_item_uuid, r.kind, r.responder_name, r.note, r.created_at,
              p.key AS project_key, COALESCE(NULLIF(p.data->>'project_title', ''), p.label) AS project_title,
              wi.item AS item, wi.status AS item_status
         FROM portal_responses r
         JOIN projects p ON p.id = r.project_id AND p.owner_id = r.owner_id
         LEFT JOIN LATERAL (
           SELECT e->>'item' AS item, e->>'status' AS status
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'wb_items') = 'array' THEN p.data->'wb_items' ELSE '[]'::jsonb END) e
            WHERE e->>'uuid' = r.wb_item_uuid LIMIT 1) wi ON TRUE
        WHERE r.owner_id = $1 AND r.acknowledged_at IS NULL
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 200`, [req.session.userId]);
    res.json(r.rows);
  } catch (err) {
    console.error('Portal responses failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/:key', withProject(async () => {}));

router.post('/:key/enable', withProject(async (req, res, project) => {
  await pool.query(
    `INSERT INTO portals (project_id, owner_id, token) VALUES ($1, $2, $3)
     ON CONFLICT (project_id) DO NOTHING`,
    [project.id, req.session.userId, newToken()]);
}));

router.delete('/:key', withProject(async (req, res, project) => {
  await pool.query('DELETE FROM portals WHERE project_id = $1 AND owner_id = $2', [project.id, req.session.userId]);
}));

router.post('/:key/regenerate', withProject(async (req, res, project) => {
  const r = await pool.query('UPDATE portals SET token = $1 WHERE project_id = $2 AND owner_id = $3',
    [newToken(), project.id, req.session.userId]);
  if (!r.rowCount) { res.status(409).json({ error: 'portal_off' }); return false; }
}));

router.put('/:key/password', withProject(async (req, res, project) => {
  const raw = req.body ? req.body.password : null;
  let hash = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    if (typeof raw !== 'string' || raw.length < PW_MIN || raw.length > PW_MAX) {
      res.status(400).json({ error: 'bad_password', min: PW_MIN, max: PW_MAX }); return false;
    }
    hash = await bcrypt.hash(raw, 12);
  }
  const r = await pool.query('UPDATE portals SET password_hash = $1 WHERE project_id = $2 AND owner_id = $3',
    [hash, project.id, req.session.userId]);
  if (!r.rowCount) { res.status(409).json({ error: 'portal_off' }); return false; }
}));

router.post('/:key/updates', withProject(async (req, res, project) => {
  const body = req.body && typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > BODY_MAX) { res.status(400).json({ error: 'bad_body', max: BODY_MAX }); return false; }
  const u = await pool.query('SELECT name, dba, email FROM users WHERE id = $1', [req.session.userId]);
  const me = u.rows[0] || {};
  const author = String(me.name || me.dba || 'Your producer').trim().slice(0, 200);
  await pool.query('INSERT INTO portal_updates (project_id, owner_id, author_name, body) VALUES ($1, $2, $3, $4)',
    [project.id, req.session.userId, author, body]);
}));

router.delete('/:key/updates/:id', withProject(async (req, res, project) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'bad_id' }); return false; }
  await pool.query('DELETE FROM portal_updates WHERE id = $1 AND project_id = $2 AND owner_id = $3',
    [id, project.id, req.session.userId]);
}));

router.post('/:key/responses/:id/ack', withProject(async (req, res, project) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'bad_id' }); return false; }
  await pool.query(
    `UPDATE portal_responses SET acknowledged_at = NOW()
      WHERE id = $1 AND project_id = $2 AND owner_id = $3 AND acknowledged_at IS NULL`,
    [id, project.id, req.session.userId]);
}));

module.exports = router;
