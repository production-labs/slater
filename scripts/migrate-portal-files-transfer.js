#!/usr/bin/env node
// V1.5 step 6b: reshape portal_files for client -> producer file TRANSFER.
//
//   node scripts/migrate-portal-files-transfer.js              # local DATABASE_URL only
//   node scripts/migrate-portal-files-transfer.js --dry-run    # do everything, then ROLLBACK
//   node scripts/migrate-portal-files-transfer.js --allow-remote
//                                                              # required for any non-local DB
//
// Changes to portal_files only:
//   DROP   direction (+ its CHECK, + portal_files_project_idx which included it)
//          Deliverables are links now (step 6a), so every row is a client upload.
//          Refuses to run if any 'deliverable' row exists (it would silently
//          become a client upload).
//   ADD    expires_at     TIMESTAMPTZ NOT NULL, default NOW() + 14 days.
//                         Existing rows (if any) get created_at + 14 days.
//   ADD    downloaded_at  TIMESTAMPTZ (producer's first download)
//   ADD    upload_id      TEXT (R2 multipart upload id while pending)
//   ADD    CHECK portal_files_size_cap: size_bytes <= 5 GiB
//   INDEX  portal_files_project_idx (project_id, created_at DESC)  re-created
//          portal_files_expires_idx (expires_at)                   for the delete sweep
//
// ONE transaction. Locks portal_files exclusively and every other public table
// (except sessions) in SHARE mode, fingerprints them all before and after: any
// difference beyond the changes above rolls back. Safe to re-run.
//
// scripts/data-model/schema.sql already describes the new shape (fresh
// databases get it directly). The undo is the backup taken right before
// (pg_dump), not this script.

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_REMOTE = args.has('--allow-remote');

const TABLE = 'portal_files';
const DROPPED = ['direction'];
const ADDED = ['expires_at', 'downloaded_at', 'upload_id'];
const SIZE_CAP_BYTES = 5 * 1024 ** 3; // 5 GiB, matches schema.sql
const SKIP_TABLES = ['sessions']; // sessions change with every request

function describeTarget(url) {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const u = new URL(url);
  const host = u.hostname || '(socket)';
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', '(socket)'].includes(host);
  return { host, db: u.pathname.replace(/^\//, ''), isLocal };
}

const ident = s => '"' + s.replace(/"/g, '""') + '"';

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

async function indexDef(c, name) {
  const r = await c.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`, [name]);
  return r.rows.length ? r.rows[0].indexdef : null;
}

// Row count + md5 of every row. For portal_files, the dropped and added
// columns are left out, so only the intended change is allowed.
async function fingerprint(c, tables) {
  const out = {};
  for (const t of tables) {
    let row = `to_jsonb(x)`;
    if (t === TABLE) for (const col of [...DROPPED, ...ADDED]) row += ` - ${c.escapeLiteral(col)}`;
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

    const tables = await publicTables(c);
    if (!tables.includes(TABLE)) throw new Error(`${TABLE} does not exist. Run scripts/migrate-data-model.js first.`);

    // Lock first so nothing changes between the checks and the changes.
    await c.query(`LOCK TABLE ${ident(TABLE)} IN ACCESS EXCLUSIVE MODE`);
    for (const t of tables.filter(t => t !== TABLE)) await c.query(`LOCK TABLE ${ident(t)} IN SHARE MODE`);

    // ---------------------------------------------------------------- before
    const colsBefore = {};
    for (const t of tables) colsBefore[t] = await columns(c, t);
    const before = await fingerprint(c, tables);

    const hasDirection = colsBefore[TABLE].includes('direction');
    if (hasDirection) {
      const deliverables = (await c.query(
        `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE direction = 'deliverable'`)).rows[0].n;
      if (deliverables) {
        throw new Error(`${deliverables} portal_files row(s) are 'deliverable'. Dropping direction would turn them into client uploads. Look at them first.`);
      }
    }
    const oversize = (await c.query(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE size_bytes > $1`, [SIZE_CAP_BYTES])).rows[0].n;
    if (oversize) throw new Error(`${oversize} portal_files row(s) are over 5 GiB; the size cap would reject them.`);

    console.log(`\n${TABLE}: ${before[TABLE].n} row(s); direction ${hasDirection ? 'present' : 'already dropped'}; ` +
      `missing: ${ADDED.filter(col => !colsBefore[TABLE].includes(col)).join(', ') || '(none)'}`);

    // --------------------------------------------------------------- changes
    await c.query(`DROP INDEX IF EXISTS portal_files_project_idx`); // old one included direction
    await c.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS direction`); // its CHECK goes with it

    await c.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    const backfilled = (await c.query(
      `UPDATE ${TABLE} SET expires_at = created_at + INTERVAL '14 days' WHERE expires_at IS NULL`)).rowCount;
    await c.query(`ALTER TABLE ${TABLE} ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '14 days')`);
    await c.query(`ALTER TABLE ${TABLE} ALTER COLUMN expires_at SET NOT NULL`);

    await c.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ`);
    await c.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS upload_id TEXT`);

    await c.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS portal_files_size_cap`);
    await c.query(`ALTER TABLE ${TABLE} ADD CONSTRAINT portal_files_size_cap CHECK (size_bytes IS NULL OR size_bytes <= ${SIZE_CAP_BYTES})`);

    await c.query(`CREATE INDEX IF NOT EXISTS portal_files_project_idx ON ${TABLE} (project_id, created_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS portal_files_expires_idx ON ${TABLE} (expires_at)`);

    // ----------------------------------------------------------------- after
    const problems = [];
    const after = await fingerprint(c, tables);
    for (const t of tables) {
      if (JSON.stringify(before[t]) !== JSON.stringify(after[t])) {
        problems.push(`table "${t}" changed beyond the intended changes (before ${JSON.stringify(before[t])}, after ${JSON.stringify(after[t])})`);
      }
      const now = await columns(c, t);
      const allowedLost = t === TABLE ? DROPPED : [];
      const allowedGained = t === TABLE ? ADDED : [];
      const lost = colsBefore[t].filter(col => !now.includes(col) && !allowedLost.includes(col));
      const gained = now.filter(col => !colsBefore[t].includes(col) && !allowedGained.includes(col));
      if (lost.length) problems.push(`${t} lost unexpected columns: ${lost.join(', ')}`);
      if (gained.length) problems.push(`${t} gained unexpected columns: ${gained.join(', ')}`);
    }

    // Final shape of portal_files, whether this run or an earlier one did the work.
    const finalCols = await columns(c, TABLE);
    DROPPED.filter(col => finalCols.includes(col)).forEach(col => problems.push(`${TABLE} still has ${col}`));
    ADDED.filter(col => !finalCols.includes(col)).forEach(col => problems.push(`${TABLE} is missing ${col}`));
    const exp = (await c.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'expires_at'`, [TABLE])).rows[0];
    if (!exp || exp.is_nullable !== 'NO' || !/14 days/.test(exp.column_default || '')) {
      problems.push(`expires_at should be NOT NULL with a 14-day default (got ${JSON.stringify(exp)})`);
    }
    const projIdx = await indexDef(c, 'portal_files_project_idx');
    if (!projIdx || /direction/.test(projIdx) || !/created_at DESC/.test(projIdx)) problems.push(`portal_files_project_idx wrong: ${projIdx}`);
    if (!(await indexDef(c, 'portal_files_expires_idx'))) problems.push('portal_files_expires_idx missing');

    console.log(`Backfilled expires_at on ${backfilled} existing row(s).`);
    console.log(`${TABLE} columns now: ${finalCols.join(', ')}`);
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
