#!/usr/bin/env node
// Data model rewrite, Session 6: per-user verification of the contacts +
// agencies migration (old users.contacts blob + agencies table -> v2 tables).
//
//   DATABASE_URL=... node scripts/verify-data-model-migration.js [--verbose]
//
// READ ONLY: everything runs inside BEGIN READ ONLY, so it is safe to point at
// production (cutover step 4, John's answers #11). Exit 0 = pass, 1 = failed
// checks, 2 = could not run.
//
// Written BEFORE the migration (hard rule). It does not reuse the migration's
// matching code: it checks the result against the OLD data, which the
// migration never changes.
//
// Provenance: every row the migration creates carries
//   client_uid = 'mig:' + refs joined by '|'
// where a ref names one old record:
//   staff.<i> / crew.<i> / talent.<i>   users.contacts bucket entry (0-based index)
//   locations.<i>                       users.contacts.locations entry
//   companies.<i>                       users.contacts.companies entry
//   agency.<id>                         agencies row
//   client.<uri-encoded name>           distinct project client text with no org
// A contact made from several identical old entries lists all of them, so the
// check is exact either way: every old entry must be named by exactly one row.
//
// FAIL (exit 1): an old record missing or claimed twice; a detail that didn't
// carry over (name, phone, email, address, notes, title, logo, agency fields,
// hospital); merged entries that disagree; a project agency/client link that
// is missing or wrong; a link in a project pointing at a row the owner can't
// use; the default agency not carried over.
// REPORT only: role matches and dropped roles, project link coverage,
// contact_ack differences (normal once the user edits contacts), rows created
// by hand after the migration.

require('dotenv').config({ quiet: true });
const Regions = require('../public/regions');

const VERBOSE = process.argv.includes('--verbose');
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(2); }
// Exported verifyUser/printUser are also run by scripts/migrate-contacts-data.js
// INSIDE its transaction: it commits only if every user passes.
const { pool } = require('../routes/v2/db'); // same timestamp format the app sees

// --- normalization (same rules as routes/v2/fields.js) ----------------------
const line = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const key = v => line(v).toLowerCase();
const multi = v => { const s = v == null ? '' : String(v); return s.trim() === '' ? '' : s; };
const db = v => (v == null ? '' : String(v)); // stored value, NULL as ''
const BUCKETS = ['staff', 'crew', 'talent'];
const ROLE_FIELD = { staff: 'role', crew: 'position', talent: 'title' };

function expectAddress(state, country, defaultCountry) {
  const r = Regions.normalizeAddress(line(state), country || null);
  if (!r.state && !r.country) return { state: '', country: defaultCountry };
  return { state: r.state || '', country: r.country || '' };
}
function parseRefs(uid) {
  if (!uid || !uid.startsWith('mig:')) return null;
  return uid.slice(4).split('|').filter(Boolean);
}
function hasData(o, fields) { return fields.some(f => line(o[f]) !== ''); }

// --- per-user checks --------------------------------------------------------
async function verifyUser(c, user) {
  const fails = [], notes = [], stats = {};
  const fail = m => fails.push(m);
  const blob = user.contacts || {};
  const defaultCountry = user.default_country || 'US';
  const q = async (sql, args) => (await c.query(sql, args)).rows;

  // ---------------------------------------------------------------- people
  const PERSON_FIELDS = ['name', 'phone', 'email', 'address', 'notes', 'role', 'position', 'title'];
  const oldPeople = new Map(); // ref -> { bucket, i, e }
  const skippedBlank = [];
  for (const b of BUCKETS) {
    (Array.isArray(blob[b]) ? blob[b] : []).forEach((e, i) => {
      e = e || {};
      if (!hasData(e, PERSON_FIELDS)) { skippedBlank.push(`${b}.${i}`); return; }
      oldPeople.set(`${b}.${i}`, { bucket: b, i, e });
    });
  }
  const contacts = await q(`SELECT * FROM contacts WHERE owner_id = $1 ORDER BY id`, [user.id]);
  const roleRows = await q(`SELECT cr.contact_id, r.id, r.name, r.abbreviation, r.owner_id, r.category
                              FROM contact_roles cr JOIN roles r ON r.id = cr.role_id
                              JOIN contacts ct ON ct.id = cr.contact_id
                             WHERE ct.owner_id = $1 ORDER BY cr.contact_id, cr.sort_order`, [user.id]);
  const rolesOf = new Map();
  for (const r of roleRows) {
    if (r.owner_id != null && r.owner_id !== user.id) fail(`contact ${r.contact_id} holds another user's role "${r.name}" (${r.id})`);
    if (!rolesOf.has(r.contact_id)) rolesOf.set(r.contact_id, []);
    rolesOf.get(r.contact_id).push(r);
  }

  const claimed = new Map(); // ref -> contact id
  const migContacts = [], handMade = [];
  for (const ct of contacts) {
    const refs = parseRefs(ct.client_uid);
    if (!refs) { handMade.push(ct); continue; }
    migContacts.push(ct);
    const srcs = [];
    for (const ref of refs) {
      if (claimed.has(ref)) fail(`old ${ref} claimed by contacts ${claimed.get(ref)} AND ${ct.id}`);
      claimed.set(ref, ct.id);
      const s = oldPeople.get(ref);
      if (!s) fail(`contact ${ct.id} "${ct.name}" names old ${ref}, which doesn't exist (or is blank)`);
      else srcs.push(s);
    }
    if (!srcs.length) continue;
    const label = `contact ${ct.id} "${ct.name}" (from ${refs.join(', ')})`;

    // Merged entries must be the same person: same name, phone, email.
    for (const f of ['name', 'phone', 'email']) {
      const vals = [...new Set(srcs.map(s => key(s.e[f])))];
      if (vals.length > 1) fail(`${label}: merged entries disagree on ${f}: ${vals.map(v => JSON.stringify(v)).join(' vs ')}`);
    }
    // Details carried over. Name falls back for entries that had no name.
    const expName = line(srcs[0].e.name) || 'Unnamed';
    if (db(ct.name) !== expName) fail(`${label}: name "${ct.name}", expected "${expName}"`);
    for (const f of ['phone', 'email']) {
      if (db(ct[f]) !== line(srcs[0].e[f])) fail(`${label}: ${f} "${db(ct[f])}", expected "${line(srcs[0].e[f])}"`);
    }
    // Address: every non-empty old value must be the stored one.
    const addrs = [...new Set(srcs.map(s => line(s.e.address)).filter(Boolean))];
    if (addrs.length > 1) fail(`${label}: merged entries have different addresses: ${addrs.join(' / ')}`);
    if (db(ct.address) !== (addrs[0] || '')) fail(`${label}: address "${db(ct.address)}", expected "${addrs[0] || ''}"`);
    // Notes: multiline, kept as typed; every old note must be in there.
    const oldNotes = srcs.map(s => multi(s.e.notes)).filter(Boolean);
    if (!oldNotes.length && ct.notes != null) fail(`${label}: has notes but the old entries had none`);
    for (const n of oldNotes) if (!db(ct.notes).includes(n)) fail(`${label}: old notes missing: ${JSON.stringify(n.slice(0, 60))}`);
    // Talent title -> contacts.title (decision A). Non-talent: no title.
    const titles = [...new Set(srcs.filter(s => s.bucket === 'talent').map(s => line(s.e.title)).filter(Boolean))];
    if (titles.length > 1) fail(`${label}: merged talent entries have different titles: ${titles.join(' / ')}`);
    if (db(ct.title) !== (titles[0] || '')) fail(`${label}: title "${db(ct.title)}", expected "${titles[0] || ''}"`);
    if (!BUCKETS.includes(ct.legacy_bucket) || !srcs.some(s => s.bucket === ct.legacy_bucket)) {
      fail(`${label}: legacy_bucket "${ct.legacy_bucket}" doesn't match its old entries`);
    }
    // Address rule: no state in the old blob -> user's default country.
    const a = expectAddress(null, null, defaultCountry);
    if (db(ct.state) !== a.state || db(ct.country) !== a.country) {
      fail(`${label}: state/country "${db(ct.state)}"/"${db(ct.country)}", expected "${a.state}"/"${a.country}"`);
    }
    if (ct.archived_at) notes.push(`${label} is archived`);
    ct._srcs = srcs;
  }
  for (const [ref, s] of oldPeople) {
    if (!claimed.has(ref)) fail(`old ${ref} "${line(s.e.name)}" was not migrated`);
  }
  stats.people = {
    old: Object.fromEntries(BUCKETS.map(b => [b, [...oldPeople.values()].filter(s => s.bucket === b).length])),
    accounted: [...claimed.keys()].filter(r => oldPeople.has(r)).length,
    contacts: migContacts.length,
    merged: migContacts.filter(ct => (parseRefs(ct.client_uid) || []).length > 1).length,
    handMade: handMade.length,
    skippedBlank,
  };

  // Role report (not a failure: unmatched roles are dropped by design).
  const roleReport = [];
  for (const ct of migContacts) {
    if (!ct._srcs) continue;
    const old = [...new Set(ct._srcs.map(s => `${s.bucket}: ${line(s.e[ROLE_FIELD[s.bucket]]) || '(blank)'}`))];
    const got = (rolesOf.get(ct.id) || []).map(r => r.name + (r.owner_id ? ' [custom]' : ''));
    roleReport.push({ name: ct.name, old, got });
  }
  stats.roles = roleReport;
  // The migration creates no custom roles (decided 2026-10-03); list any.
  stats.customRoles = (await q(`SELECT name FROM roles WHERE owner_id = $1 ORDER BY name`, [user.id])).map(r => r.name);

  // --------------------------------------------------------- organizations
  const agencies = await q(`SELECT * FROM agencies WHERE user_id = $1 ORDER BY id`, [user.id]);
  const companies = Array.isArray(blob.companies) ? blob.companies : [];
  const orgs = await q(`SELECT * FROM organizations WHERE owner_id = $1 ORDER BY id`, [user.id]);
  const orgClaim = new Map();
  const orgByRef = new Map();
  const migOrgs = orgs.filter(o => parseRefs(o.client_uid));
  for (const o of migOrgs) {
    for (const ref of parseRefs(o.client_uid)) {
      if (orgClaim.has(ref)) fail(`old ${ref} claimed by organizations ${orgClaim.get(ref)} AND ${o.id}`);
      orgClaim.set(ref, o.id); orgByRef.set(ref, o);
    }
  }
  const tz = v => (line(v) === 'none' ? '' : line(v));
  for (const a of agencies) {
    const o = orgByRef.get(`agency.${a.id}`);
    const label = `agency ${a.id} "${a.name}"`;
    if (!o) { fail(`${label} was not migrated`); continue; }
    if (!o.is_agency) fail(`${label}: org ${o.id} is not marked as an agency`);
    if (o.legacy_agency_id !== a.id) fail(`${label}: org ${o.id} legacy_agency_id ${o.legacy_agency_id}`);
    if (db(o.name) !== (line(a.name) || 'Untitled agency')) fail(`${label}: name "${o.name}"`);
    for (const f of ['website', 'address', 'city', 'zip', 'contact_name', 'contact_email', 'contact_phone', 'default_project_type']) {
      if (db(o[f]) !== line(a[f])) fail(`${label}: ${f} "${db(o[f])}", expected "${line(a[f])}"`);
    }
    if (db(o.invoicing_text) !== multi(a.invoicing_text)) fail(`${label}: invoicing_text differs`);
    if (db(o.invoicing_email) !== line(a.invoicing_email)) fail(`${label}: invoicing_email "${db(o.invoicing_email)}"`);
    if (db(o.timezone) !== tz(a.timezone)) fail(`${label}: timezone "${db(o.timezone)}", expected "${tz(a.timezone)}"`);
    if (db(o.logo) !== db(a.logo || '')) fail(`${label}: logo differs (${db(o.logo).length} vs ${db(a.logo).length} chars)`);
    const ad = expectAddress(a.state, null, defaultCountry);
    if (db(o.state) !== ad.state || db(o.country) !== ad.country) fail(`${label}: state/country "${db(o.state)}"/"${db(o.country)}", expected "${ad.state}"/"${ad.country}"`);
    if (!ad.country) notes.push(`${label}: state "${line(a.state)}" not recognized, country left blank`);
  }
  // Default agency -> users.default_organization_id.
  const def = agencies.find(a => a.is_default);
  const defOrg = def && orgByRef.get(`agency.${def.id}`);
  if (def && defOrg && user.default_organization_id !== defOrg.id) {
    fail(`default agency "${def.name}" -> users.default_organization_id is ${user.default_organization_id}, expected ${defOrg.id}`);
  }
  if (!def && user.default_organization_id != null && !orgs.find(o => o.id === user.default_organization_id && !parseRefs(o.client_uid))) {
    fail(`no default agency in the old data, but default_organization_id = ${user.default_organization_id}`);
  }
  companies.forEach((co, i) => {
    co = co || {};
    const label = `company ${i} "${line(co.name)}"`;
    if (!hasData(co, ['name', 'logo', 'website', 'notes'])) return;
    const o = orgByRef.get(`companies.${i}`);
    if (!o) { fail(`${label} was not migrated`); return; }
    if (key(o.name) !== key(co.name || 'Unnamed company')) fail(`${label}: landed in org ${o.id} "${o.name}"`);
    // Merged into an agency of the same name: the agency's own values win,
    // the company's fill gaps. Otherwise the company's values exactly.
    const merged = parseRefs(o.client_uid).some(r => r.startsWith('agency.'));
    for (const [f, norm] of [['logo', db], ['website', line], ['notes', multi]]) {
      const want = norm(co[f]);
      if (!want) continue;
      if (merged ? !db(o[f]) : db(o[f]) !== want) fail(`${label}: ${f} didn't carry over`);
      else if (merged && db(o[f]) !== want) notes.push(`${label}: ${f} differs from agency "${o.name}" (agency's kept)`);
    }
  });
  const dupCompanies = companies.map(co => key(co && co.name)).filter((k, i, a) => k && a.indexOf(k) !== i);
  if (dupCompanies.length) notes.push(`duplicate company names in the old data: ${[...new Set(dupCompanies)].join(', ')}`);

  // ------------------------------------------------------------ locations
  const LOC_FIELDS = ['name', 'address', 'city', 'state', 'zip', 'hospital', 'notes', 'phone', 'email'];
  const oldLocs = Array.isArray(blob.locations) ? blob.locations : [];
  const locs = await q(`SELECT * FROM locations WHERE owner_id = $1 ORDER BY id`, [user.id]);
  const locClaim = new Map();
  for (const l of locs) {
    const refs = parseRefs(l.client_uid);
    if (!refs) continue;
    for (const ref of refs) {
      if (locClaim.has(ref)) fail(`old ${ref} claimed by locations ${locClaim.get(ref)} AND ${l.id}`);
      locClaim.set(ref, l);
    }
  }
  oldLocs.forEach((e, i) => {
    e = e || {};
    if (!hasData(e, LOC_FIELDS)) return;
    const l = locClaim.get(`locations.${i}`);
    const label = `location ${i} "${line(e.name)}"`;
    if (!l) { fail(`${label} was not migrated`); return; }
    if (db(l.name) !== (line(e.name) || 'Unnamed location')) fail(`${label}: name "${l.name}"`);
    for (const f of ['address', 'city', 'zip']) if (db(l[f]) !== line(e[f])) fail(`${label}: ${f} "${db(l[f])}", expected "${line(e[f])}"`);
    const ad = expectAddress(e.state, null, defaultCountry);
    if (db(l.state) !== ad.state || db(l.country) !== ad.country) fail(`${label}: state/country "${db(l.state)}"/"${db(l.country)}", expected "${ad.state}"/"${ad.country}"`);
    if (!ad.country) notes.push(`${label}: state "${line(e.state)}" not recognized, country left blank`);
    // Hospital: copied as-is, OR left empty on purpose (the app then looks it
    // up on first use). Any other value is wrong.
    const h = multi(e.hospital);
    if (db(l.hospital) !== h && l.hospital != null) fail(`${label}: hospital "${db(l.hospital)}", expected "${h}" or empty`);
    if (h && l.hospital == null) notes.push(`${label}: old hospital "${line(h)}" left empty (looked up on first use)`);
    // Notes keep the old notes plus the old phone/email (no columns for them).
    for (const part of [multi(e.notes), line(e.phone), line(e.email)].filter(Boolean)) {
      if (!db(l.notes).includes(part)) fail(`${label}: notes missing ${JSON.stringify(part.slice(0, 60))}`);
    }
  });
  for (const [ref, l] of locClaim) {
    const m = /^locations\.(\d+)$/.exec(ref);
    if (!m || !hasData(oldLocs[+m[1]] || {}, LOC_FIELDS)) fail(`location ${l.id} "${l.name}" names old ${ref}, which doesn't exist`);
  }
  stats.locations = { old: oldLocs.filter(e => hasData(e || {}, LOC_FIELDS)).length, migrated: locClaim.size, total: locs.length };

  // ------------------------------------------------------------- projects
  const projects = await q(`SELECT id, key, label, data, agency_org_id, client_org_id FROM projects WHERE owner_id = $1 ORDER BY id`, [user.id]);
  const contactById = new Map(contacts.map(x => [x.id, x]));
  const orgById = new Map(orgs.map(x => [x.id, x]));
  const locById = new Map(locs.map(x => [x.id, x]));
  const usableRoles = new Map((await q(`SELECT id, name, abbreviation, category FROM roles WHERE owner_id IS NULL OR owner_id = $1`, [user.id])).map(r => [r.id, r]));
  const cov = { cards: 0, cardsLinked: 0, roles: 0, rolesLinked: 0, days: 0, daysLinked: 0, ackDiffers: 0 };
  const unlinked = { people: new Map(), roles: new Map(), locations: new Map() };
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const migratedClient = new Map(); // client key -> org (for the report)

  for (const p of projects) {
    const d = p.data || {};
    const label = `project "${p.label || d.project_title || p.key}"`;

    // Agency: data.agency_id is the live link (not projects.agency_id).
    const aid = Number(d.agency_id) || null;
    const ag = aid && agencies.find(a => a.id === aid);
    const wantAgency = ag ? orgByRef.get(`agency.${ag.id}`) : null;
    if (aid && !ag) notes.push(`${label}: data.agency_id ${aid} is not one of this user's agencies; agency left empty`);
    if (ag && !wantAgency) fail(`${label}: agency "${ag.name}" has no migrated organization to link to`);
    else if ((wantAgency ? wantAgency.id : null) !== p.agency_org_id) {
      fail(`${label}: agency_org_id ${p.agency_org_id}, expected ${wantAgency ? wantAgency.id : null}`);
    }
    // Client: client_company, else the older client field.
    const ctext = line(d.client_company) || line(d.client);
    if (ctext) {
      const o = p.client_org_id && orgById.get(p.client_org_id);
      if (!o) fail(`${label}: client "${ctext}" has no client_org_id`);
      else if (key(o.name) !== key(ctext)) fail(`${label}: client "${ctext}" linked to org "${o.name}"`);
      else if ((parseRefs(o.client_uid) || []).some(r => r.startsWith('client.'))) migratedClient.set(key(ctext), o);
    } else if (p.client_org_id != null) {
      fail(`${label}: no client text but client_org_id = ${p.client_org_id}`);
    }
    for (const [k, col] of [['agency_org_id', p.agency_org_id], ['client_org_id', p.client_org_id]]) {
      if (k in d && (Number(d[k]) || null) !== col) notes.push(`${label}: data.${k} = ${d[k]} but column = ${col} (column wins)`);
    }

    // Cards.
    const cards = [['crew', d.crew, 'position'], ['talent', d.talent, null], ['kp', d.kp_cards, 'role']];
    for (const [kind, list, rf] of cards) {
      for (const e of Array.isArray(list) ? list : []) {
        if (!e) continue;
        const nm = line(e.name);
        if (nm) {
          cov.cards++;
          if (e.contact_id) {
            const ct = contactById.get(Number(e.contact_id));
            if (!ct) fail(`${label}: ${kind} "${nm}" linked to contact ${e.contact_id}, not one of this user's`);
            else {
              cov.cardsLinked++;
              if (key(ct.name) !== key(nm)) notes.push(`${label}: ${kind} card "${nm}" is linked to "${ct.name}"`);
              if (e.contact_ack !== ct.updated_at) cov.ackDiffers++;
            }
          } else bump(unlinked.people, `${kind}: ${nm}`);
        }
        const rtext = rf ? line(e[rf]) : '';
        if (rtext) cov.roles++;
        if (e.role_id) {
          const r = usableRoles.get(Number(e.role_id));
          if (!r) fail(`${label}: ${kind} "${nm}" role_id ${e.role_id} is not usable by this user`);
          else if (rtext) cov.rolesLinked++;
        } else if (rtext) bump(unlinked.roles, `${kind}: ${rtext}`);
      }
    }
    // Schedule days.
    for (const day of Array.isArray(d.schedule_days) ? d.schedule_days : []) {
      const nm = line(day && (day.loc_name || day.loc_id));
      if (!nm) continue;
      cov.days++;
      if (day.location_id) {
        const l = locById.get(Number(day.location_id));
        if (!l) fail(`${label}: day location_id ${day.location_id} is not one of this user's locations`);
        else { cov.daysLinked++; if (key(l.name) !== key(nm)) notes.push(`${label}: day "${nm}" linked to location "${l.name}"`); }
      } else bump(unlinked.locations, nm);
    }
  }
  stats.projects = projects.length;
  stats.coverage = cov;
  stats.unlinked = unlinked;
  stats.clientOrgs = [...migratedClient.values()].map(o => o.name);
  stats.orgs = { agencies: agencies.length, companies: companies.filter(co => hasData(co || {}, ['name', 'logo', 'website', 'notes'])).length, migrated: migOrgs.length, total: orgs.length };

  // Likely duplicates left as separate contacts (for John to merge by hand).
  const byName = new Map();
  for (const ct of contacts) if (!ct.archived_at) { const k = key(ct.name); byName.set(k, (byName.get(k) || []).concat(ct)); }
  stats.dupNames = [...byName.values()].filter(v => v.length > 1).map(v => `${v[0].name} (${v.length}: ${v.map(x => x.legacy_bucket || 'new').join(', ')})`);

  return { fails, notes, stats };
}

// Printed summary for one user (also used by the migration script).
function printUser(user, { fails, notes, stats: s }) {
  const oldTotal = BUCKETS.reduce((n, b) => n + s.people.old[b], 0);
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${user.email} (user ${user.id})`);
  console.log(`  People      old: ${BUCKETS.map(b => `${b} ${s.people.old[b]}`).join(', ')} = ${oldTotal}` +
    `  ->  accounted for ${s.people.accounted}/${oldTotal} in ${s.people.contacts} contacts` +
    (s.people.merged ? ` (${s.people.merged} merged from identical copies)` : '') +
    (s.people.handMade ? `, plus ${s.people.handMade} created by hand` : ''));
  if (s.people.skippedBlank.length) console.log(`              empty old entries skipped: ${s.people.skippedBlank.join(', ')}`);
  console.log(`  Orgs        old: ${s.orgs.agencies} agencies, ${s.orgs.companies} companies  ->  ${s.orgs.migrated} migrated orgs` +
    (s.clientOrgs.length ? ` (incl. ${s.clientOrgs.length} new from project client text: ${s.clientOrgs.join(', ')})` : ''));
  console.log(`  Locations   old: ${s.locations.old}  ->  ${s.locations.migrated} migrated`);
  const cv = s.coverage;
  console.log(`  Projects    ${s.projects}: people linked ${cv.cardsLinked}/${cv.cards}, roles linked ${cv.rolesLinked}/${cv.roles}, ` +
    `schedule locations linked ${cv.daysLinked}/${cv.days}` + (cv.ackDiffers ? `; ${cv.ackDiffers} cards' contact changed since linking` : ''));
  const show = (title, m) => { if (m.size) console.log(`  ${title}: ` + [...m].map(([k, n]) => n > 1 ? `${k} (x${n})` : k).join('; ')); };
  show('Unlinked people', s.unlinked.people);
  show('Unlinked roles', s.unlinked.roles);
  show('Unlinked locations', s.unlinked.locations);
  const dropped = s.roles.filter(r => !r.got.length && r.old.some(o => !o.endsWith('(blank)')));
  if (dropped.length) console.log(`  Contacts whose old role didn't match (no role now): ` + dropped.map(r => `${r.name} [${r.old.join('; ')}]`).join(', '));
  if (s.customRoles.length) console.log(`  Custom roles: ${s.customRoles.join(', ')}`);
  if (s.dupNames.length) console.log(`  Same name, separate contacts: ${s.dupNames.join('; ')}`);
  if (VERBOSE) s.roles.forEach(r => console.log(`    role  ${r.name}: ${r.old.join('; ')}  ->  ${r.got.join(', ') || '(none)'}`));
  notes.forEach(n => console.log('  note: ' + n));
  fails.forEach(f => console.log('  FAIL: ' + f));
  console.log('');
}

// --- main ---------------------------------------------------------------------
async function main() {
  const u = new URL(process.env.DATABASE_URL);
  console.log(`Verifying: ${u.hostname || '(socket)'}:${u.port || 5432} / ${u.pathname.slice(1)}   (read only)\n`);
  const c = await pool.connect();
  let failed = 0;
  try {
    await c.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ'); // one consistent snapshot
    const have = await c.query(`SELECT to_regclass('public.contacts') IS NOT NULL AND to_regclass('public.organizations') IS NOT NULL
                                       AND to_regclass('public.locations') IS NOT NULL AS ok`);
    if (!have.rows[0].ok) { console.error('The v2 tables do not exist here. Run scripts/migrate-data-model.js first.'); process.exitCode = 2; return; }
    const users = (await c.query(`SELECT id, email, contacts, default_country, default_organization_id FROM users ORDER BY id`)).rows;

    for (const user of users) {
      const result = await verifyUser(c, user);
      failed += result.fails.length;
      printUser(user, result);
    }
    await c.query('ROLLBACK');
    console.log(failed ? `VERIFICATION FAILED: ${failed} problem(s). Do not proceed.` : 'VERIFICATION PASSED for every user.');
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Could not run verification:', e.message);
    process.exitCode = 2;
  } finally {
    c.release(); await pool.end();
  }
}

module.exports = { verifyUser, printUser, parseRefs };
if (require.main === module) main();
