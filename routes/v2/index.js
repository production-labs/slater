// v2 API: new data model (contacts, organizations, roles, locations).
// Mounted at /api/v2 behind requireAuth. Lives alongside the old
// /api/contacts and /api/agencies endpoints, which are untouched until
// cutover (Session 8). Nothing in the frontend calls v2 yet (Session 3+).
//
//   GET /api/v2/sync ?since=<cursor>
//     One round trip for offline sync. Same rules as each resource's
//     GET (see resource.js), across all four tables, plus the user's
//     default organization id. Use the returned cursor for the next call.
//
//   GET /api/v2/default-organization        -> { organization_id }
//   PUT /api/v2/default-organization        { organization_id: <id> | null }
//     Must be an active organization with is_agency = true.

const express = require('express');
const { pool, tx } = require('./db');
const { HttpError, handle } = require('./fields');
const { maxCursor } = require('./resource');
const { contacts, organizations, locations } = require('./resources');
const roles = require('./roles');

const router = express.Router();

router.use('/contacts', contacts.router);
router.use('/organizations', organizations.router);
router.use('/locations', locations.router);
router.use('/roles', roles.router);

async function getDefaultOrg(db, userId) {
  const r = await db.query('SELECT default_organization_id FROM users WHERE id = $1', [userId]);
  return r.rows[0] ? r.rows[0].default_organization_id : null;
}

router.get('/sync', handle(async (req, res) => {
  const userId = req.session.userId;
  const since = req.query.since || null;
  // One REPEATABLE READ snapshot so all four lists are mutually consistent.
  const out = await (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const [c, o, l, r, d] = [
        await contacts.pull(client, userId, since),
        await organizations.pull(client, userId, since),
        await locations.pull(client, userId, since),
        await roles.pull(client, userId, since),
        await getDefaultOrg(client, userId),
      ];
      await client.query('COMMIT');
      return { contacts: c, organizations: o, locations: l, roles: r, default_organization_id: d };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })();
  out.cursor = maxCursor([...out.contacts, ...out.organizations, ...out.locations, ...out.roles], since);
  res.json(out);
}));

router.get('/default-organization', handle(async (req, res) => {
  res.json({ organization_id: await getDefaultOrg(pool, req.session.userId) });
}));

router.put('/default-organization', handle(async (req, res) => {
  const userId = req.session.userId;
  const raw = req.body ? req.body.organization_id : undefined;
  if (raw === undefined) throw new HttpError(400, 'organization_id is required (use null to clear)');
  const orgId = raw === null ? null : Number(raw);
  if (orgId !== null && (!Number.isInteger(orgId) || orgId <= 0)) throw new HttpError(400, 'Invalid organization_id');

  await tx(async client => {
    if (orgId !== null) {
      const r = await client.query(
        'SELECT is_agency FROM organizations WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL', [orgId, userId]);
      if (!r.rows.length) throw new HttpError(404, 'Organization not found');
      if (!r.rows[0].is_agency) throw new HttpError(400, 'Default organization must be an agency');
    }
    await client.query('UPDATE users SET default_organization_id = $2 WHERE id = $1', [userId, orgId]);
  });
  res.json({ organization_id: orgId });
}));

module.exports = router;
