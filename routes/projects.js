const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ── Organization links ──────────────────────────────────────────────────────
// Projects are saved as one JSON bundle. The links to the project's agency
// and client organizations ALSO live in real columns,
// projects.agency_org_id / client_org_id, so the database can protect them
// (an organization in use can't be permanently deleted).
//
// The columns are the source of truth. On every save:
//   - If the bundle carries the key (data.agency_org_id / data.client_org_id,
//     sent by the project pickers), the column takes that value, but only if
//     the organization belongs to the saving user; anything else becomes
//     NULL and is reported back in `org_link_warnings`.
//   - If the key is missing (e.g. an imported backup), the column keeps its
//     value. Either way the bundle copy is rewritten to match the column.
//   - data.client_company is written by the client (the org's name).
// On load the column values are copied over the bundle copy, so the column
// wins if they ever disagree.
const LINKS = [
  { key: 'agency_org_id', col: 'agency_org_id' },
  { key: 'client_org_id', col: 'client_org_id' },
];

function overlayLinks(row) {
  if (!row || !row.data || typeof row.data !== 'object') return row;
  LINKS.forEach(l => { if (l.col in row) row.data[l.key] = row[l.col]; });
  return row;
}

function toId(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

// Get all projects (just keys and labels for the dropdown)
router.get('/', async (req, res) => {
  try {
	const result = await pool.query(
	  'SELECT key, label, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC',
	  [req.session.userId]
	);
	res.json(result.rows);
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Get a single project
router.get('/:key', async (req, res) => {
  try {
	const result = await pool.query(
	  'SELECT * FROM projects WHERE key = $1 AND owner_id = $2',
	  [req.params.key, req.session.userId]
	);
	if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
	res.json(overlayLinks(result.rows[0]));
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load project' });
  }
});

// Save a project (create or update)
router.post('/:key', async (req, res) => {
  const { key } = req.params;
  const { label } = req.body;
  let { data } = req.body;
  const userId = req.session.userId;
  try {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
	  const result = await pool.query(
	    `INSERT INTO projects (key, label, data, owner_id, updated_at)
	     VALUES ($1, $2, $3, $4, NOW())
	     ON CONFLICT (key) DO UPDATE
	     SET label = $2, data = $3, updated_at = NOW()
	     WHERE projects.owner_id = $4
	     RETURNING *`,
	    [key, label, data, userId]
	  );
	  return res.json(result.rows[0]);
	}

	const client = await pool.connect();
	try {
	  await client.query('BEGIN');
	  // Lock the existing row (if any) so two saves can't interleave links.
	  const cur = (await client.query(
	    'SELECT owner_id, agency_org_id, client_org_id FROM projects WHERE key = $1 FOR UPDATE', [key])).rows[0];
	  if (cur && cur.owner_id !== userId) {
	    // Same as before: someone else's key is never overwritten.
	    await client.query('ROLLBACK');
	    return res.json(undefined);
	  }

	  data = Object.assign({}, data);
	  delete data.agency_id; // old agencies-table link (before 2026-10-17); never read
	  const finalIds = {};
	  const warnings = [];
	  const wanted = [];
	  LINKS.forEach(l => {
	    if (Object.prototype.hasOwnProperty.call(data, l.key)) {
	      const id = toId(data[l.key]);
	      if (Number.isNaN(id)) { warnings.push({ field: l.key, value: data[l.key], reason: 'not an id' }); finalIds[l.key] = null; }
	      else { finalIds[l.key] = id; if (id) wanted.push(id); }
	    } else {
	      finalIds[l.key] = cur ? cur[l.col] : null;
	    }
	  });

	  // Only the user's own organizations (archived ones are fine).
	  const owned = new Map();
	  if (wanted.length) {
	    const r = await client.query(
	      'SELECT id FROM organizations WHERE owner_id = $1 AND id = ANY($2::int[])',
	      [userId, wanted]);
	    r.rows.forEach(o => owned.set(o.id, o));
	  }
	  LINKS.forEach(l => {
	    const id = finalIds[l.key];
	    if (Object.prototype.hasOwnProperty.call(data, l.key) && id && !owned.has(id)) {
	      warnings.push({ field: l.key, value: id, reason: 'organization not found' });
	      finalIds[l.key] = null;
	    }
	    data[l.key] = finalIds[l.key];
	  });

	  const result = await client.query(
	    `INSERT INTO projects (key, label, data, owner_id, updated_at, agency_org_id, client_org_id)
	     VALUES ($1, $2, $3, $4, NOW(), $5, $6)
	     ON CONFLICT (key) DO UPDATE
	     SET label = $2, data = $3, updated_at = NOW(), agency_org_id = $5, client_org_id = $6
	     WHERE projects.owner_id = $4
	     RETURNING *`,
	    [key, label, data, userId, finalIds.agency_org_id, finalIds.client_org_id]
	  );
	  await client.query('COMMIT');
	  const row = result.rows[0];
	  if (row && warnings.length) {
	    console.warn('Project', key, 'org link warnings:', JSON.stringify(warnings));
	    row.org_link_warnings = warnings;
	  }
	  res.json(row);
	} catch (e) {
	  await client.query('ROLLBACK').catch(() => {});
	  throw e;
	} finally {
	  client.release();
	}
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to save project' });
  }
});

// Delete a project
router.delete('/:key', async (req, res) => {
  try {
	await pool.query(
	  'DELETE FROM projects WHERE key = $1 AND owner_id = $2',
	  [req.params.key, req.session.userId]
	);
	res.json({ success: true });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
