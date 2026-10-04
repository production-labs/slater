#!/usr/bin/env node
// Integration test for the v2 API (Session 2). LOCAL DATABASE ONLY.
//
//   node scripts/test-v2-api.js
//
// Mounts routes/v2 on a throwaway Express app with a fake session
// (X-Test-User header), creates two temporary users, exercises every
// endpoint, then deletes everything it created. Exits non-zero on failure.
// Requires scripts/migrate-data-model.js to have been run on the same DB.

require('dotenv').config({ quiet: true });
const express = require('express');
const assert = require('assert/strict');
const { Pool } = require('pg');

const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/none');
if (!['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(url.hostname)) {
  console.error('Refusing to run tests against a non-local database.');
  process.exit(2);
}

const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const TS_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
let server, base, A, B;
let passed = 0;
const failures = [];

async function api(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': String(user) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json };
}

async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (err) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (err.message || err).split('\n').join('\n       ')); }
}

async function roleId(name) {
  const r = await admin.query('SELECT id FROM roles WHERE owner_id IS NULL AND name = $1', [name]);
  return r.rows[0].id;
}

async function setup() {
  const mk = async tag => (await admin.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', $2) RETURNING id`,
    [`v2test-${tag}-${Date.now()}@example.invalid`, 'v2 test ' + tag])).rows[0].id;
  A = await mk('a'); B = await mk('b');

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-test-user']) }; next(); });
  app.use('/api/v2', require('../routes/v2'));
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/v2`;
}

async function cleanup() {
  if (server) server.close();
  if (A || B) {
    const ids = [A, B].filter(Boolean);
    await admin.query('DELETE FROM projects WHERE owner_id = ANY($1)', [ids]);
    // Plain user delete: must cascade cleanly through contacts, contact_roles,
    // custom roles, orgs, locations (tested explicitly below as well).
    await admin.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  }
  await admin.end();
  await require('../routes/v2/db').pool.end();
}

async function run() {
  await setup();
  const DP = await roleId('Director of Photography');
  const GAFFER = await roleId('Gaffer');
  const HOST = await roleId('Host');

  console.log('\nContacts');
  let c1;
  await test('create contact with ordered roles', async () => {
    const r = await api(A, 'POST', '/contacts', { name: '  Shaun Smith ', email: 's@x.com', zip: ' 98402 ', title: 'VP of Marketing', role_ids: [GAFFER, DP], client_uid: 'uid-1' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    c1 = r.body;
    assert.equal(c1.name, 'Shaun Smith', 'name trimmed');
    assert.deepEqual(c1.role_ids, [GAFFER, DP], 'role order kept');
    assert.equal(c1.phone, null, 'missing field stored as null');
    assert.equal(c1.zip, '98402', 'zip trimmed + stored');
    assert.equal(c1.title, 'VP of Marketing', 'title stored');
    assert.match(c1.updated_at, TS_RE, 'microsecond ISO timestamp');
  });
  await test('retried create with same client_uid returns the same row', async () => {
    const r = await api(A, 'POST', '/contacts', { name: 'Shaun Smith (retry)', client_uid: 'uid-1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, c1.id);
    assert.equal(r.body.name, 'Shaun Smith', 'retry does not overwrite');
    const n = await admin.query('SELECT COUNT(*)::int n FROM contacts WHERE owner_id = $1', [A]);
    assert.equal(n.rows[0].n, 1);
  });
  await test('validation: name required, bad types, bad roles', async () => {
    assert.equal((await api(A, 'POST', '/contacts', { email: 'x' })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', { name: '   ' })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', email: { a: 1 } })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', role_ids: [999999] })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', role_ids: [DP, DP] })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', role_ids: 'DP' })).status, 400);
    assert.equal((await api(A, 'POST', '/contacts', 'not an object')).status, 400);
  });
  await test('user isolation: B cannot see, edit or archive A\'s contact', async () => {
    assert.equal((await api(B, 'GET', `/contacts/${c1.id}`)).status, 404);
    assert.equal((await api(B, 'PATCH', `/contacts/${c1.id}`, { name: 'hax', base_updated_at: c1.updated_at })).status, 404);
    assert.equal((await api(B, 'DELETE', `/contacts/${c1.id}`)).status, 404);
    const list = await api(B, 'GET', '/contacts');
    assert.equal(list.body.rows.length, 0);
  });
  await test('PATCH with current base updates only sent fields', async () => {
    const r = await api(A, 'PATCH', `/contacts/${c1.id}`, { phone: '206-555-0100', base_updated_at: c1.updated_at });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.phone, '206-555-0100');
    assert.equal(r.body.email, 's@x.com', 'unsent field untouched');
    assert.deepEqual(r.body.role_ids, [GAFFER, DP], 'roles untouched');
    assert.ok(r.body.updated_at > c1.updated_at, 'updated_at moved forward');
    c1 = r.body;
  });
  await test('PATCH with stale base is rejected with 409 + current row, nothing changes', async () => {
    const stale = '2000-01-01T00:00:00.000000Z';
    const r = await api(A, 'PATCH', `/contacts/${c1.id}`, { phone: 'WRONG', base_updated_at: stale });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'conflict');
    assert.equal(r.body.current.phone, '206-555-0100');
    assert.equal(r.body.current.updated_at, c1.updated_at);
  });
  await test('PATCH requires base_updated_at; garbage base is 400', async () => {
    assert.equal((await api(A, 'PATCH', `/contacts/${c1.id}`, { phone: '1' })).status, 400);
    assert.equal((await api(A, 'PATCH', `/contacts/${c1.id}`, { phone: '1', base_updated_at: 'nope' })).status, 400);
  });
  await test('PATCH role_ids only: replaces set and bumps updated_at', async () => {
    const r = await api(A, 'PATCH', `/contacts/${c1.id}`, { role_ids: [DP], base_updated_at: c1.updated_at });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.role_ids, [DP]);
    assert.ok(r.body.updated_at > c1.updated_at);
    c1 = r.body;
  });
  await test('exact timestamp round-trip (two quick edits both succeed)', async () => {
    let cur = c1;
    for (const p of ['1', '2', '3']) {
      const r = await api(A, 'PATCH', `/contacts/${c1.id}`, { phone: p, base_updated_at: cur.updated_at });
      assert.equal(r.status, 200, 'edit ' + p + ': ' + JSON.stringify(r.body));
      cur = r.body;
    }
    c1 = cur;
  });

  console.log('\nSync');
  let c2, cursor0;
  await test('sync pull: initial, then only changes since cursor, with tombstones', async () => {
    c2 = (await api(A, 'POST', '/contacts', { name: 'To Be Archived' })).body;
    const init = await api(A, 'GET', '/sync');
    assert.equal(init.status, 200);
    assert.equal(init.body.contacts.length, 2);
    assert.ok(init.body.roles.length >= 74, 'global roles included');
    cursor0 = init.body.cursor;
    assert.match(cursor0, TS_RE);

    // Wait past the 10s overlap? No: instead verify the overlap semantics directly.
    const arch = await api(A, 'DELETE', `/contacts/${c2.id}`);
    assert.equal(arch.status, 200);
    assert.ok(arch.body.archived_at, 'archived_at set');

    const delta = await api(A, 'GET', '/sync?since=' + encodeURIComponent(cursor0));
    const tomb = delta.body.contacts.find(x => x.id === c2.id);
    assert.ok(tomb && tomb.archived_at, 'archived contact appears as tombstone in delta');
    assert.ok(delta.body.cursor >= cursor0);

    const fresh = await api(A, 'GET', '/contacts');
    assert.ok(!fresh.body.rows.some(x => x.id === c2.id), 'initial load excludes archived');
  });
  await test('sync since far past cursor returns nothing older than window', async () => {
    const future = new Date(Date.now() + 3600e3).toISOString().replace('Z', '000Z');
    const d = await api(A, 'GET', '/sync?since=' + encodeURIComponent(future));
    assert.equal(d.status, 200);
    assert.equal(d.body.contacts.length, 0);
    assert.equal(d.body.roles.length, 0);
  });
  await test('sync with garbage since is 400', async () => {
    assert.equal((await api(A, 'GET', '/sync?since=yesterday-ish')).status, 400);
  });
  await test('archived contact: PATCH is 409 archived; DELETE idempotent; restore works', async () => {
    const cur = (await api(A, 'GET', `/contacts/${c2.id}`)).body;
    const p = await api(A, 'PATCH', `/contacts/${c2.id}`, { name: 'x', base_updated_at: cur.updated_at });
    assert.equal(p.status, 409);
    assert.equal(p.body.error, 'archived');
    assert.equal((await api(A, 'DELETE', `/contacts/${c2.id}`)).status, 200);
    const r = await api(A, 'POST', `/contacts/${c2.id}/restore`);
    assert.equal(r.status, 200);
    assert.equal(r.body.archived_at, null);
  });

  console.log('\nOrganizations');
  let agency, client, bOrg;
  await test('create agency + client org; logo validation', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const a = await api(A, 'POST', '/organizations', { name: 'Worktank', is_agency: true, logo: png, contact_name: 'Billing Person' });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.is_agency, true);
    agency = a.body;
    const c = await api(A, 'POST', '/organizations', { name: 'Microsoft' });
    assert.equal(c.body.is_agency, false, 'is_agency defaults false');
    client = c.body;
    assert.equal((await api(A, 'POST', '/organizations', { name: 'X', logo: 'http://evil/x.png' })).status, 400);
    assert.equal((await api(A, 'POST', '/organizations', { name: 'X', is_agency: 'yes' })).status, 400);
    bOrg = (await api(B, 'POST', '/organizations', { name: 'B Corp', is_agency: true })).body;
  });
  await test('contact organization_id must be the user\'s own org', async () => {
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', organization_id: bOrg.id })).status, 400);
    const ok = await api(A, 'POST', '/contacts', { name: 'Client Person', organization_id: client.id });
    assert.equal(ok.status, 201);
  });
  await test('default organization: agency only, own only, cleared on archive', async () => {
    assert.equal((await api(A, 'PUT', '/default-organization', { organization_id: client.id })).status, 400);
    assert.equal((await api(A, 'PUT', '/default-organization', { organization_id: bOrg.id })).status, 404);
    assert.equal((await api(A, 'PUT', '/default-organization', {})).status, 400);
    const ok = await api(A, 'PUT', '/default-organization', { organization_id: agency.id });
    assert.equal(ok.status, 200);
    assert.equal((await api(A, 'GET', '/sync')).body.default_organization_id, agency.id);
    await api(A, 'DELETE', `/organizations/${agency.id}`);
    assert.equal((await api(A, 'GET', '/default-organization')).body.organization_id, null);
  });

  console.log('\nLocations');
  await test('location CRUD round trip', async () => {
    const l = await api(A, 'POST', '/locations', { name: 'Building 92', city: 'Redmond', state: 'WA', hospital: 'Overlake\n1035 116th Ave NE' });
    assert.equal(l.status, 201);
    assert.equal(l.body.hospital, 'Overlake\n1035 116th Ave NE', 'multiline kept');
    const p = await api(A, 'PATCH', `/locations/${l.body.id}`, { notes: 'Load in at dock 3', base_updated_at: l.body.updated_at });
    assert.equal(p.status, 200);
    assert.equal(p.body.city, 'Redmond');
  });

  console.log('\nRoles');
  let custom;
  await test('create custom role; duplicate is 409; same name as global allowed', async () => {
    const r = await api(A, 'POST', '/roles', { name: 'Drone Pilot (FAA 107)', category: 'crew', department: 'Camera' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.is_global, false);
    custom = r.body;
    assert.equal((await api(A, 'POST', '/roles', { name: 'drone pilot (faa 107)', category: 'crew' })).status, 409);
    assert.equal((await api(A, 'POST', '/roles', { name: 'Gaffer', category: 'crew' })).status, 201);
    assert.equal((await api(A, 'POST', '/roles', { name: 'X', category: 'grip' })).status, 400);
  });
  await test('B cannot see or use A\'s custom role', async () => {
    const list = await api(B, 'GET', '/roles');
    assert.ok(!list.body.rows.some(r => r.id === custom.id));
    assert.equal((await api(B, 'POST', '/contacts', { name: 'X', role_ids: [custom.id] })).status, 400);
    assert.equal((await api(B, 'DELETE', `/roles/${custom.id}`)).status, 404);
  });
  await test('global roles are read-only', async () => {
    const g = (await api(A, 'GET', '/roles')).body.rows.find(r => r.id === HOST);
    assert.equal((await api(A, 'PATCH', `/roles/${HOST}`, { name: 'Emcee', base_updated_at: g.updated_at })).status, 403);
    assert.equal((await api(A, 'DELETE', `/roles/${HOST}`)).status, 403);
  });
  await test('rename custom role propagates (contact still references it by id)', async () => {
    const ct = (await api(A, 'POST', '/contacts', { name: 'Pilot Pat', role_ids: [custom.id] })).body;
    const r = await api(A, 'PATCH', `/roles/${custom.id}`, { name: 'Drone Pilot', base_updated_at: custom.updated_at });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    custom = r.body;
    const again = (await api(A, 'GET', `/contacts/${ct.id}`)).body;
    assert.deepEqual(again.role_ids, [custom.id]);
    custom._contact = again;
  });
  await test('in-use role cannot be deleted (contact use, then project use)', async () => {
    let d = await api(A, 'DELETE', `/roles/${custom.id}`);
    assert.equal(d.status, 409);
    assert.deepEqual(d.body.usage, { contacts: 1, projects: 0 });

    const ct = custom._contact;
    await api(A, 'PATCH', `/contacts/${ct.id}`, { role_ids: [], base_updated_at: ct.updated_at });
    await admin.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1, 'v2 test', $2, $3)`,
      ['v2test-' + Date.now(), JSON.stringify({ crew: [{ name: 'Pat', role_id: custom.id }] }), A]);
    d = await api(A, 'DELETE', `/roles/${custom.id}`);
    assert.equal(d.status, 409);
    assert.deepEqual(d.body.usage, { contacts: 0, projects: 1 });

    await admin.query('DELETE FROM projects WHERE owner_id = $1', [A]);
    d = await api(A, 'DELETE', `/roles/${custom.id}`);
    assert.equal(d.status, 200);
    assert.ok(d.body.archived_at);
  });
  await test('archived custom role: hidden from list, tombstone in sync, revived on re-create', async () => {
    assert.ok(!(await api(A, 'GET', '/roles')).body.rows.some(r => r.id === custom.id));
    const delta = await api(A, 'GET', '/sync?since=' + encodeURIComponent(cursor0));
    assert.ok(delta.body.roles.some(r => r.id === custom.id && r.archived_at));
    const again = await api(A, 'POST', '/roles', { name: 'DRONE PILOT', category: 'crew' });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, custom.id, 'same id revived');
    assert.equal(again.body.archived_at, null);
    // Archived role cannot be newly added to a contact
    await api(A, 'DELETE', `/roles/${custom.id}`);
    assert.equal((await api(A, 'POST', '/contacts', { name: 'X', role_ids: [custom.id] })).status, 400);
  });

  console.log('\nDatabase');
  await test('database blocks hard-deleting an in-use role even outside the API', async () => {
    const r = (await api(B, 'POST', '/roles', { name: 'B Locked', category: 'crew' })).body;
    await api(B, 'POST', '/contacts', { name: 'B Holder', role_ids: [r.id] });
    await assert.rejects(admin.query('DELETE FROM roles WHERE id = $1', [r.id]), /foreign key/);
  });
  await test('deleting a user cascades cleanly (custom roles linked to contacts, default org set)', async () => {
    const r = (await api(B, 'POST', '/roles', { name: 'B Custom', category: 'crew' })).body;
    await api(B, 'POST', '/contacts', { name: 'B Person', role_ids: [r.id], organization_id: bOrg.id });
    await api(B, 'POST', '/locations', { name: 'B Stage' });
    assert.equal((await api(B, 'PUT', '/default-organization', { organization_id: bOrg.id })).status, 200);
    await admin.query('DELETE FROM users WHERE id = $1', [B]);
    const left = await admin.query(
      `SELECT (SELECT COUNT(*) FROM contacts WHERE owner_id = $1) + (SELECT COUNT(*) FROM roles WHERE owner_id = $1)
            + (SELECT COUNT(*) FROM organizations WHERE owner_id = $1) AS n`, [B]);
    assert.equal(Number(left.rows[0].n), 0);
    B = null;
  });
}

run()
  .catch(err => { failures.push('crashed: ' + err.message); console.error(err); })
  .finally(async () => {
    try { await cleanup(); } catch (e) { console.error('cleanup error:', e.message); failures.push('cleanup'); }
    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
  });
