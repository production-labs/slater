// Shared pool for the v2 (new data model) routes.
//
// Timestamps: sync and conflict detection compare updated_at EXACTLY.
// Postgres stores microseconds; JS Date only keeps milliseconds. If we let
// node-pg turn timestamptz into Date objects, a client's baseline
// updated_at would never equal the server's again. So for this pool:
//   - every connection runs in UTC
//   - timestamptz (oid 1184) comes back as an ISO string with full
//     microsecond precision, e.g. "2026-10-03T22:21:00.123456Z"
// Clients must treat updated_at as an opaque string and echo it back
// unchanged as base_updated_at.

const { Pool, types } = require('pg');

const TIMESTAMPTZ_OID = 1184;

// Postgres UTC text form is "2026-10-03 22:21:00.12+00" (trailing zeros in
// the fraction are dropped, and a whole second has no fraction at all).
// Normalize to a fixed-width "2026-10-03T22:21:00.120000Z" so cursors also
// compare correctly as plain strings.
const PG_TS_RE = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?\+00(?::00)?$/;
function isoFromPg(s) {
  const m = PG_TS_RE.exec(s);
  if (!m) return s; // e.g. 'infinity'; never expected in practice
  return `${m[1]}T${m[2]}.${(m[3] || '').padEnd(6, '0')}Z`;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  types: {
    getTypeParser(oid, format) {
      if (oid === TIMESTAMPTZ_OID && format !== 'binary') return isoFromPg;
      return types.getTypeParser(oid, format);
    },
  },
});

pool.on('connect', client => {
  // Queued ahead of any query on this client, so ordering is safe.
  client.query("SET TIME ZONE 'UTC'");
});

// Run fn(client) inside a transaction; always releases the client.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, tx };
