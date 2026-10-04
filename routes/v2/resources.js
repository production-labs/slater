// Contacts, organizations and locations on the generic resource factory.

const { makeResource } = require('./resource');
const { HttpError } = require('./fields');

const MAX_ROLES_PER_CONTACT = 50;

// ---------------------------------------------------------------- contacts
// role_ids: ordered array of role ids (pill order; first = primary display).
// POST: optional, defaults to []. PATCH: replaces the whole set when present.
// Allowed roles: global, or the user's own custom roles. Archived roles may
// stay on a contact that already has them but cannot be newly added.

function readRoleIds(body) {
  const v = body.role_ids;
  if (!Array.isArray(v)) throw new HttpError(400, 'role_ids must be an array of role ids');
  if (v.length > MAX_ROLES_PER_CONTACT) throw new HttpError(400, 'Too many roles');
  const ids = v.map(Number);
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw new HttpError(400, 'role_ids must be an array of role ids');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'role_ids contains duplicates');
  return ids;
}

async function setContactRoles(client, userId, contactId, body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'role_ids')) return;
  const ids = readRoleIds(body);

  const cur = await client.query(
    'SELECT role_id FROM contact_roles WHERE contact_id = $1 ORDER BY sort_order, role_id', [contactId]);
  const current = cur.rows.map(r => r.role_id);
  if (current.length === ids.length && current.every((x, i) => x === ids[i])) return; // unchanged

  if (ids.length) {
    const ok = await client.query(
      `SELECT id FROM roles
        WHERE id = ANY($1) AND (owner_id IS NULL OR owner_id = $2)
          AND (archived_at IS NULL OR id = ANY($3))`, [ids, userId, current]);
    if (ok.rows.length !== ids.length) {
      const okSet = new Set(ok.rows.map(r => r.id));
      throw new HttpError(400, 'Unknown or unavailable role', { role_ids: ids.filter(i => !okSet.has(i)) });
    }
  }
  await client.query('DELETE FROM contact_roles WHERE contact_id = $1', [contactId]);
  if (ids.length) {
    await client.query(
      `INSERT INTO contact_roles (contact_id, role_id, sort_order)
       SELECT $1, r, o::int - 1 FROM unnest($2::int[]) WITH ORDINALITY AS x(r, o)`, [contactId, ids]);
  }
  // The contact_roles trigger has already bumped contacts.updated_at.
}

const contacts = makeResource({
  table: 'contacts',
  spec: {
    organization_id:     { type: 'orgRef' },
    name:                { type: 'text', required: true },
    sort_last_name:      { type: 'text' },
    email:               { type: 'text' },
    phone:               { type: 'text' },
    address:             { type: 'text' },
    city:                { type: 'text' },
    state:               { type: 'text' },
    zip:                 { type: 'text' },
    title:               { type: 'text' },
    union_status:        { type: 'text' },
    gear_kit:            { type: 'text', multiline: true },
    travel_availability: { type: 'text' },
    notes:               { type: 'text', multiline: true },
  },
  extraSelect: `(SELECT COALESCE(array_agg(cr.role_id ORDER BY cr.sort_order, cr.role_id), '{}')
                   FROM contact_roles cr WHERE cr.contact_id = t.id) AS role_ids`,
  afterWrite: setContactRoles,
});

// ----------------------------------------------------------- organizations
// Archiving the user's default organization clears the default.

const organizations = makeResource({
  table: 'organizations',
  spec: {
    name:                 { type: 'text', required: true },
    is_agency:            { type: 'bool' },
    logo:                 { type: 'image' },
    website:              { type: 'text' },
    phone:                { type: 'text' },
    address:              { type: 'text' },
    city:                 { type: 'text' },
    state:                { type: 'text' },
    zip:                  { type: 'text' },
    notes:                { type: 'text', multiline: true },
    contact_name:         { type: 'text' },
    contact_email:        { type: 'text' },
    contact_phone:        { type: 'text' },
    invoicing_email:      { type: 'text' },
    invoicing_text:       { type: 'text', multiline: true },
    default_project_type: { type: 'text' },
    timezone:             { type: 'text' },
  },
  onArchive: async (client, userId, id) => {
    await client.query(
      'UPDATE users SET default_organization_id = NULL WHERE id = $1 AND default_organization_id = $2', [userId, id]);
  },
});

// --------------------------------------------------------------- locations

const locations = makeResource({
  table: 'locations',
  spec: {
    name:     { type: 'text', required: true },
    address:  { type: 'text' },
    city:     { type: 'text' },
    state:    { type: 'text' },
    zip:      { type: 'text' },
    hospital: { type: 'text', multiline: true },
    notes:    { type: 'text', multiline: true },
  },
});

module.exports = { contacts, organizations, locations };
