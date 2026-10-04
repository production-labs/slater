// Permanent delete support for the v2 routes.
//
// Rules (John, 2026-10-03):
//   - Only ARCHIVED records can be permanently deleted (archive is the
//     everyday "remove"; delete is the deliberate second step).
//   - Refused while any of the user's projects references the record.
//   - The row is removed with all its details; a tombstone in
//     deleted_records (table, id, time) lets offline devices drop their copy.

const { HttpError } = require('./fields');

const OVERLAP = "interval '10 seconds'";

// Projects whose data mentions <refKey> = id anywhere in the document
// (crew / talent / KP entries, schedule days, ...). The exact JSON layout of
// those links is decided in Sessions 4-5, so search the whole document.
// Matches the id stored as a number or as a string.
async function projectsReferencing(db, userId, refKey, id) {
  const path = `lax $.** ? (@.${refKey} == $id || @.${refKey} == $sid)`;
  const r = await db.query(
    `SELECT key, COALESCE(NULLIF(label, ''), data->>'project_title', key) AS label FROM projects
      WHERE owner_id = $1 AND jsonb_path_exists(data, $2::jsonpath, jsonb_build_object('id', $3::int, 'sid', $3::text))
      ORDER BY updated_at DESC NULLS LAST`,
    [userId, path, id]);
  return r.rows;
}

function refuseIfUsed(projects) {
  if (projects.length) {
    throw new HttpError(409, 'in_use', {
      usage: { projects: projects.length },
      projects: projects.slice(0, 10).map(p => p.label),
    });
  }
}

async function tombstone(db, userId, table, id) {
  await db.query(
    'INSERT INTO deleted_records (owner_id, table_name, record_id) VALUES ($1, $2, $3)', [userId, table, id]);
}

// Tombstones newer than (since - overlap). table = null for all tables.
async function pullDeleted(db, userId, since, table) {
  if (!since) return [];
  const r = await db.query(
    `SELECT table_name AS table, record_id AS id, deleted_at FROM deleted_records
      WHERE owner_id = $1 AND deleted_at > $2::timestamptz - ${OVERLAP}
        AND ($3::text IS NULL OR table_name = $3)
      ORDER BY deleted_at`, [userId, since, table || null]);
  return r.rows;
}

module.exports = { projectsReferencing, refuseIfUsed, tombstone, pullDeleted };
