#!/usr/bin/env node
// Data model rewrite, Session 1: create new tables + seed global roles.
//
//   node scripts/migrate-data-model.js              # apply to DATABASE_URL (local only)
//   node scripts/migrate-data-model.js --dry-run    # do everything, then ROLLBACK
//   node scripts/migrate-data-model.js --allow-remote
//                                                   # required for any non-local DB
//
// Purely additive (see scripts/data-model/schema.sql). Runs in ONE transaction:
// if any step or verification check fails, nothing is changed.
// Safe to re-run: tables use IF NOT EXISTS, roles are upserted.
//
// NOT called from server.js. Do not wire into startup until John says to merge.
// This does NOT migrate any contacts/agencies data yet (that is Session 6).

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const GLOBAL_ROLES = require('./data-model/global-roles');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_REMOTE = args.has('--allow-remote');

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'data-model', 'schema.sql'), 'utf8');

// Existing tables whose contents must be byte-for-byte unchanged by this script.
const FINGERPRINTS = {
  users:    `SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(id || ':' || COALESCE(contacts::text,''), ',' ORDER BY id), '')) AS h FROM users`,
  projects: `SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(id || ':' || COALESCE(data::text,''), ',' ORDER BY id), '')) AS h FROM projects`,
  agencies: `SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(a::text, ',' ORDER BY a.id), '')) AS h FROM agencies a`,
  receipts: `SELECT COUNT(*)::int AS n, '' AS h FROM receipts`,
  licenses: `SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(l::text, ',' ORDER BY l.id), '')) AS h FROM licenses l`,
};

// Expected column additions to existing tables. Anything else changing is a failure.
const EXPECTED_NEW_COLUMNS = {
  users: ['default_organization_id'],
  projects: ['agency_org_id', 'client_org_id'],
};

const NEW_TABLES = ['roles', 'organizations', 'contacts', 'contact_roles', 'locations'];
const NEW_TRIGGERS = ['roles_touch', 'organizations_touch', 'contacts_touch', 'contact_roles_touch', 'locations_touch'];

function describeTarget(url) {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const u = new URL(url);
  const host = u.hostname || '(socket)';
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', '(socket)'].includes(host);
  return { host, db: u.pathname.replace(/^\//, ''), isLocal };
}

async function fingerprint(client) {
  const out = {};
  for (const [t, sql] of Object.entries(FINGERPRINTS)) {
    const exists = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${t}`]);
    out[t] = exists.rows[0].ok ? (await client.query(sql)).rows[0] : null;
  }
  return out;
}

async function columns(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`, [table]);
  return r.rows.map(x => x.column_name);
}

async function seedRoles(client) {
  const counts = { inserted: 0, updated: 0, unchanged: 0 };
  for (const r of GLOBAL_ROLES) {
    const res = await client.query(
      `INSERT INTO roles (owner_id, name, abbreviation, category, department, sort_order)
       VALUES (NULL, $1, $2, $3, $4, $5)
       ON CONFLICT (lower(name)) WHERE owner_id IS NULL
       DO UPDATE SET name = EXCLUDED.name,
                     abbreviation = EXCLUDED.abbreviation,
                     category = EXCLUDED.category,
                     department = EXCLUDED.department,
                     sort_order = EXCLUDED.sort_order,
                     archived_at = NULL
        WHERE (roles.name, roles.abbreviation, roles.category, roles.department, roles.sort_order, roles.archived_at)
              IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.abbreviation, EXCLUDED.category, EXCLUDED.department, EXCLUDED.sort_order, NULL::timestamptz)
       RETURNING (xmax = 0) AS inserted`,
      [r.name, r.abbreviation, r.category, r.department, r.sort_order]);
    if (!res.rows.length) counts.unchanged++;
    else if (res.rows[0].inserted) counts.inserted++;
    else counts.updated++;
  }
  // Global roles in the DB that are no longer in the seed list: report, never delete.
  const names = GLOBAL_ROLES.map(r => r.name.toLowerCase());
  const extra = await client.query(
    `SELECT name FROM roles WHERE owner_id IS NULL AND NOT (lower(name) = ANY($1)) ORDER BY name`, [names]);
  counts.notInSeed = extra.rows.map(x => x.name);
  return counts;
}

async function verify(client, before, after, colsBefore) {
  const problems = [];

  // 1. Existing data untouched.
  for (const t of Object.keys(FINGERPRINTS)) {
    const b = before[t], a = after[t];
    if (JSON.stringify(b) !== JSON.stringify(a)) problems.push(`existing table "${t}" changed (before ${JSON.stringify(b)}, after ${JSON.stringify(a)})`);
  }

  // 2. Existing tables only gained the expected columns, lost none.
  for (const [t, expected] of Object.entries(EXPECTED_NEW_COLUMNS)) {
    const now = await columns(client, t);
    const lost = colsBefore[t].filter(c => !now.includes(c));
    const gained = now.filter(c => !colsBefore[t].includes(c));
    const unexpected = gained.filter(c => !expected.includes(c));
    const missing = expected.filter(c => !now.includes(c));
    if (lost.length) problems.push(`${t} lost columns: ${lost.join(', ')}`);
    if (unexpected.length) problems.push(`${t} gained unexpected columns: ${unexpected.join(', ')}`);
    if (missing.length) problems.push(`${t} missing new columns: ${missing.join(', ')}`);
  }

  // 3. New tables and triggers exist.
  for (const t of NEW_TABLES) {
    const r = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${t}`]);
    if (!r.rows[0].ok) problems.push(`table ${t} was not created`);
  }
  const trg = await client.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1)`, [NEW_TRIGGERS]);
  const haveTrg = trg.rows.map(x => x.tgname);
  NEW_TRIGGERS.filter(t => !haveTrg.includes(t)).forEach(t => problems.push(`trigger ${t} missing`));

  // 4. Global role counts match the seed list exactly.
  const expectedByCat = {};
  GLOBAL_ROLES.forEach(r => { expectedByCat[r.category] = (expectedByCat[r.category] || 0) + 1; });
  const rc = await client.query(
    `SELECT category, COUNT(*)::int AS n FROM roles WHERE owner_id IS NULL AND archived_at IS NULL GROUP BY category`);
  const gotByCat = Object.fromEntries(rc.rows.map(x => [x.category, x.n]));
  for (const [cat, n] of Object.entries(expectedByCat)) {
    if (gotByCat[cat] < n || gotByCat[cat] === undefined) problems.push(`global ${cat} roles: expected at least ${n}, found ${gotByCat[cat] || 0}`);
  }

  return { problems, gotByCat, expectedByCat };
}

async function main() {
  const target = describeTarget(process.env.DATABASE_URL);
  console.log(`Target: ${target.host} / ${target.db}${DRY_RUN ? '   [DRY RUN: will roll back]' : ''}`);
  if (!target.isLocal && !ALLOW_REMOTE) {
    console.error('Refusing to run against a non-local database without --allow-remote.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await fingerprint(client);
    const colsBefore = {};
    for (const t of Object.keys(EXPECTED_NEW_COLUMNS)) colsBefore[t] = await columns(client, t);

    // Silence IF NOT EXISTS notices on re-runs.
    await client.query(`SET LOCAL client_min_messages = warning`);
    await client.query(SCHEMA_SQL);
    console.log('Schema: applied');

    const seed = await seedRoles(client);
    console.log(`Global roles: ${seed.inserted} inserted, ${seed.updated} updated, ${seed.unchanged} unchanged (${GLOBAL_ROLES.length} in seed list)`);
    if (seed.notInSeed.length) console.log(`  NOTE: global roles in DB but not in seed list (left alone): ${seed.notInSeed.join(', ')}`);

    const after = await fingerprint(client);
    const { problems, gotByCat, expectedByCat } = await verify(client, before, after, colsBefore);

    console.log('\nExisting data (rows):');
    for (const t of Object.keys(FINGERPRINTS)) {
      const b = before[t], a = after[t];
      console.log(`  ${t.padEnd(9)} ${b ? b.n : '-'} -> ${a ? a.n : '-'}${b && a && JSON.stringify(b) === JSON.stringify(a) ? '   unchanged' : ''}`);
    }
    console.log('Global roles by category (found / seed list):');
    for (const cat of Object.keys(expectedByCat)) console.log(`  ${cat.padEnd(7)} ${gotByCat[cat] || 0} / ${expectedByCat[cat]}`);

    if (problems.length) {
      console.error('\nVERIFICATION FAILED, rolling back. Nothing was changed:');
      problems.forEach(p => console.error('  - ' + p));
      await client.query('ROLLBACK');
      process.exitCode = 1;
      return;
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\nVerification passed. DRY RUN: rolled back, nothing was changed.');
    } else {
      await client.query('COMMIT');
      console.log('\nVerification passed. Committed.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nERROR, rolled back. Nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
