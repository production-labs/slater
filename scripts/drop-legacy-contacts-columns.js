#!/usr/bin/env node
// Data model rewrite, cleanup Stage 2: drop the old (v1) Contacts / Agency
// storage that nothing has read since Stage 1 (2026-10-20, commit d035f8c).
//
//   node scripts/drop-legacy-contacts-columns.js              # local DATABASE_URL only
//   node scripts/drop-legacy-contacts-columns.js --dry-run    # do everything, then ROLLBACK
//   node scripts/drop-legacy-contacts-columns.js --allow-remote
//                                                             # required for any non-local DB
//   --allow-unlinked   don't refuse when a project still has data.agency_id but no
//                      agency_org_id (local dev only: 8 never-migrated projects)
//
// Drops:
//   projects.agency_id (+ FK projects_agency_id_fkey)   dead since before v2
//   agencies table                                     replaced by organizations
//   users.contacts (JSONB blob)                        replaced by contacts/organizations/locations
//   organizations.legacy_agency_id, legacy_source      migration bookkeeping
//   contacts.legacy_bucket                             migration bookkeeping
//   projects.data -> 'agency_id'                        old link inside the bundle (server strips it on save anyway)
//
// ONE transaction. Locks the touched tables first (writes wait a moment,
// lock_timeout 5s). Fingerprints every other public table (except sessions)
// plus the touched tables minus the dropped parts, before and after: any
// difference, or any column lost beyond the list above, rolls back. Takes
// a moment, not a maintenance window. Safe to re-run: everything is IF EXISTS.
//
// The undo is the backup taken right before (pg_dump), not this script.

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_REMOTE = args.has('--allow-remote');
const ALLOW_UNLINKED = args.has('--allow-unlinked');

// table -> columns this script drops. Everything else must survive intact.
const DROP_COLUMNS = {
  projects: ['agency_id'],
  users: ['contacts'],
  organizations: ['legacy_agency_id', 'legacy_source'],
  contacts: ['legacy_bucket'],
};
const DROP_TABLES = ['agencies'];
const SKIP_TABLES = ['sessions', ...DROP_TABLES]; // sessions change with every request

function describeTarget(url) {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const u = new URL(url);
  const host = u.hostname || '(socket)';
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', '(socket)'].includes(host);
  return { host, db: u.pathname.replace(/^\//, ''), isLocal };
}

const ident = s => '"' + s.replace(/"/g, '""') + '"';

async function tableExists(c, t) {
  return (await c.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${t}`])).rows[0].ok;
}

async function columns(c, t) {
  const r = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`, [t]);
  return r.rows.map(x => x.column_name);
}

async function publicTables(c) {
  const r = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  return r.rows.map(x => x.table_name).filter(t => !SKIP_TABLES.includes(t));
}

// Row count + md5 of every row, minus the parts this script drops. Rows are
// hashed as jsonb (keys sorted), so dropping a column changes nothing else.
async function fingerprint(c, tables) {
  const out = {};
  for (const t of tables) {
    let row = `to_jsonb(x)`;
    for (const col of DROP_COLUMNS[t] || []) row += ` - ${c.escapeLiteral(col)}`;
    if (t === 'projects') row = `(${row}) || jsonb_build_object('data', x.data - 'agency_id')`;
    const r = await c.query(
      `SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(r, E'\\n' ORDER BY r), '')) AS h
         FROM (SELECT (${row})::text AS r FROM ${ident(t)} x) s`);
    out[t] = r.rows[0];
  }
  return out;
}

async function main() {
  const target = describeTarget(process.env.DATABASE_URL);
  console.log(`Target: ${target.host} / ${target.db}${DRY_RUN ? '   [DRY RUN: will roll back]' : ''}`);
  if (!target.isLocal && !ALLOW_REMOTE) {
    console.error('Refusing to run against a non-local database without --allow-remote.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL lock_timeout = '5s'`);
    await c.query(`SET LOCAL client_min_messages = warning`);

    // Lock first so nothing changes between the checks and the drops.
    const tables = await publicTables(c);
    const touched = Object.keys(DROP_COLUMNS).filter(t => tables.includes(t));
    for (const t of [...touched, ...DROP_TABLES]) {
      if (await tableExists(c, t)) await c.query(`LOCK TABLE ${ident(t)} IN ACCESS EXCLUSIVE MODE`);
    }
    for (const t of tables.filter(t => !touched.includes(t))) {
      await c.query(`LOCK TABLE ${ident(t)} IN SHARE MODE`);
    }

    // ---------------------------------------------------------------- before
    const colsBefore = {};
    for (const t of tables) colsBefore[t] = await columns(c, t);
    const before = await fingerprint(c, tables);

    const present = [];
    for (const [t, cols] of Object.entries(DROP_COLUMNS)) {
      cols.filter(col => (colsBefore[t] || []).includes(col)).forEach(col => present.push(`${t}.${col}`));
    }
    for (const t of DROP_TABLES) if (await tableExists(c, t)) present.push(`table ${t}`);
    const withOldLink = (await c.query(
      `SELECT COUNT(*)::int AS n FROM projects WHERE data ? 'agency_id'`)).rows[0].n;
    const unlinked = (await c.query(
      `SELECT key, label FROM projects WHERE data ? 'agency_id' AND agency_org_id IS NULL ORDER BY id`)).rows;

    console.log(`\nStill present: ${present.length ? present.join(', ') : '(nothing: already dropped)'}`);
    console.log(`Projects with data.agency_id: ${withOldLink}`);
    if (unlinked.length) {
      console.log(`Projects with data.agency_id but NO agency_org_id: ${unlinked.length}`);
      unlinked.forEach(p => console.log(`  - ${p.label || '(untitled)'} [${p.key}]`));
      if (!ALLOW_UNLINKED) {
        throw new Error('some projects would lose their only (old) agency link. Rerun with --allow-unlinked if that is expected (local dev).');
      }
    }

    // ----------------------------------------------------------------- drops
    const stripped = (await c.query(
      `UPDATE projects SET data = data - 'agency_id' WHERE data ? 'agency_id'`)).rowCount;
    await c.query(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_agency_id_fkey`);
    await c.query(`ALTER TABLE projects DROP COLUMN IF EXISTS agency_id`);
    for (const t of DROP_TABLES) await c.query(`DROP TABLE IF EXISTS ${ident(t)}`); // no CASCADE: anything else depending on it fails loudly
    await c.query(`ALTER TABLE users DROP COLUMN IF EXISTS contacts`);
    await c.query(`ALTER TABLE organizations DROP COLUMN IF EXISTS legacy_agency_id, DROP COLUMN IF EXISTS legacy_source`);
    await c.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS legacy_bucket`);

    // ----------------------------------------------------------------- after
    const problems = [];
    const after = await fingerprint(c, tables);
    for (const t of tables) {
      if (JSON.stringify(before[t]) !== JSON.stringify(after[t])) {
        problems.push(`table "${t}" changed beyond the drops (before ${JSON.stringify(before[t])}, after ${JSON.stringify(after[t])})`);
      }
      const now = await columns(c, t);
      const expectedGone = DROP_COLUMNS[t] || [];
      const lost = colsBefore[t].filter(col => !now.includes(col) && !expectedGone.includes(col));
      const gained = now.filter(col => !colsBefore[t].includes(col));
      const left = expectedGone.filter(col => now.includes(col));
      if (lost.length) problems.push(`${t} lost unexpected columns: ${lost.join(', ')}`);
      if (gained.length) problems.push(`${t} gained columns: ${gained.join(', ')}`);
      if (left.length) problems.push(`${t} still has: ${left.join(', ')}`);
    }
    for (const t of DROP_TABLES) if (await tableExists(c, t)) problems.push(`table ${t} still exists`);
    const leftLinks = (await c.query(`SELECT COUNT(*)::int AS n FROM projects WHERE data ? 'agency_id'`)).rows[0].n;
    if (leftLinks) problems.push(`${leftLinks} projects still have data.agency_id`);

    console.log(`\nStripped data.agency_id from ${stripped} project(s).`);
    console.log('Rows per table (before -> after):');
    for (const t of tables) {
      const same = JSON.stringify(before[t]) === JSON.stringify(after[t]);
      console.log(`  ${t.padEnd(22)} ${String(before[t].n).padStart(5)} -> ${String(after[t].n).padStart(5)}   ${same ? 'unchanged' : 'CHANGED'}`);
    }

    if (problems.length) {
      console.error('\nVERIFICATION FAILED, rolling back. Nothing was changed:');
      problems.forEach(p => console.error('  - ' + p));
      await c.query('ROLLBACK');
      process.exitCode = 1;
      return;
    }

    if (DRY_RUN) {
      await c.query('ROLLBACK');
      console.log('\nVerification passed. DRY RUN: rolled back, nothing was changed.');
    } else {
      await c.query('COMMIT');
      console.log('\nVerification passed. Committed.');
    }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\nERROR, rolled back. Nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
