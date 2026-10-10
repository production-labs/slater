#!/usr/bin/env node
// Data model rewrite, Session 6: copy every user's OLD contacts blob +
// agencies into the v2 tables and link their projects.
//
//   node scripts/migrate-contacts-data.js [--dry-run] [--allow-remote]
//
// Prerequisite: the v2 schema (scripts/migrate-data-model.js).
//
// ONE transaction for everything. Commits only if, inside that transaction:
//   1. users.contacts, agencies, receipts, licenses are byte-for-byte unchanged;
//   2. every project's data is unchanged apart from the added link keys
//      (contact_id / role_id / contact_ack on cards, location_id on days,
//      agency_org_id / client_org_id) -- card text is never touched;
//   3. scripts/verify-data-model-migration.js passes for EVERY user.
// Otherwise it rolls back and nothing changes. --dry-run always rolls back.
// Refuses a non-local database without --allow-remote.
//
// Additive only: the old blob, agencies table, projects.agency_id and
// data.agency_id / client_company / client all stay as rollback.
// A user who already has migrated rows (client_uid 'mig:...') is skipped.
//
// Rules (SESSION_STATUS.md):
//   - Single-line text trimmed + inner whitespace collapsed; multiline
//     (notes, hospital, invoicing text) kept as typed. Empty -> NULL.
//   - Addresses: recognizable US/CA state -> postal code + country; no
//     state -> user's default country; unrecognized -> blank + reported.
//   - Agencies -> organizations (is_agency), default agency ->
//     users.default_organization_id. Companies -> organizations; a company
//     with an agency's name merges into it (agency values win). Project
//     client text matching no org -> ONE new org per distinct value.
//   - People: one contact per old entry, EXCEPT identical copies (same name
//     + phone + email, no conflicting address/talent title) become ONE
//     contact with all their roles (John, 2026-10-10). Staff/crew role text -> built-in role by
//     name, abbreviation or ALIAS; no match = dropped + reported (no custom
//     roles are created). Talent title -> contacts.title; role = talent role
//     with that exact name, else Interview Subject.
//   - Locations: old phone/email appended to notes; old hospital NOT copied
//     (John, 2026-10-10): left empty so the fixed lookup fills it on first use.
//   - Projects (same rules as public/project-people-v2.js linkLegacy):
//     card -> contact by unique exact name (active contacts), contact_ack =
//     that contact's updated_at; role by name/abbreviation (+ alias), card's
//     category then built-in breaks ties; talent role = contact's first
//     talent role; day -> location by unique exact name.

require('dotenv').config({ quiet: true });
const Regions = require('../public/regions');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_REMOTE = args.has('--allow-remote');
// Decided by John 2026-10-10 (were rehearsal switches).
const MERGE_IDENTICAL = true;
const BLANK_HOSPITALS = true;

// Old free text (lowercased, spaces collapsed) -> built-in role name.
// Only used when the text doesn't already match a role name/abbreviation.
// Rule (John, 2026-10-10): an alias only where the old text is the SAME
// industry-standard job under another name. Company-specific labels (Content,
// Stream Tech, V-Cam Op, Mng. Producer, ...) are dropped and reported; John
// re-adds those as custom roles himself. Not aliased on purpose: Graphic
// Designer (a different job from Motion Graphics Artist). ASL 1/2 and
// "A1 - Agency Contact" added 2026-10-10 (John: industry standard; ASL
// Interpreter was added to the built-in list for it).
const ALIASES = {
  'prod': 'Producer',
  'camera': 'Camera Operator',
  'sound': 'Sound Mixer',
  'audio': 'Sound Mixer',
  'virtual event prod.': 'Virtual Event Producer',
  'motion designer': 'Motion Graphics Artist',
  'asl 1': 'ASL Interpreter',
  'asl 2': 'ASL Interpreter',
  'a1 - agency contact': 'A1 (Audio Engineer)',
};

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(2); }
const target = new URL(process.env.DATABASE_URL);
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(target.hostname);
if (!isLocal && !ALLOW_REMOTE) { console.error('Refusing to run against a non-local database without --allow-remote.'); process.exit(2); }

const { pool } = require('../routes/v2/db'); // UTC + microsecond ISO timestamps, as the app sees them
const { verifyUser, printUser } = require('./verify-data-model-migration');

const line = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const key = v => line(v).toLowerCase();
const n = v => line(v) || null;                                        // single-line -> NULL if empty
const m = v => { const s = v == null ? '' : String(v); return s.trim() === '' ? null : s; }; // multiline
const BUCKETS = ['staff', 'crew', 'talent'];
const ROLE_FIELD = { staff: 'role', crew: 'position', talent: 'title' };
const PERSON_FIELDS = ['name', 'phone', 'email', 'address', 'notes', 'role', 'position', 'title'];
const LOC_FIELDS = ['name', 'address', 'city', 'state', 'zip', 'hospital', 'notes', 'phone', 'email'];
const hasData = (o, f) => f.some(k => line(o[k]) !== '');
const LINK_KEYS = ['contact_id', 'role_id', 'contact_ack'];

// Stable JSON (sorted keys) so "unchanged" means unchanged, whatever key order jsonb returns.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// A project's data with the keys this script may add taken out again.
function stripLinks(data, added) {
  const d = JSON.parse(JSON.stringify(data));
  for (const k of ['agency_org_id', 'client_org_id']) if (added.top.has(k)) delete d[k];
  for (const [list, i, k] of added.cards) delete d[list][i][k];
  for (const i of added.days) delete d.schedule_days[i].location_id;
  return d;
}

const FINGERPRINTS = {
  users_contacts: `SELECT COUNT(*)::int n, md5(COALESCE(string_agg(id || ':' || COALESCE(contacts::text, ''), ',' ORDER BY id), '')) h FROM users`,
  agencies: `SELECT COUNT(*)::int n, md5(COALESCE(string_agg(a::text, ',' ORDER BY a.id), '')) h FROM agencies a`,
  receipts: `SELECT COUNT(*)::int n, md5(COALESCE(string_agg(id::text || md5(COALESCE(image_data, '')), ',' ORDER BY id), '')) h FROM receipts`,
  licenses: `SELECT COUNT(*)::int n, md5(COALESCE(string_agg(l::text, ',' ORDER BY l.id), '')) h FROM licenses l`,
  project_rows: `SELECT COUNT(*)::int n, md5(COALESCE(string_agg(id || ':' || key || ':' || COALESCE(owner_id::text, '') || ':' || COALESCE(agency_id::text, ''), ',' ORDER BY id), '')) h FROM projects`,
};
async function fingerprint(c) {
  const out = {};
  for (const [k, sql] of Object.entries(FINGERPRINTS)) out[k] = (await c.query(sql)).rows[0];
  return out;
}

async function migrateUser(c, user, report) {
  const q = async (sql, a) => (await c.query(sql, a)).rows;
  const blob = user.contacts || {};
  const defaultCountry = user.default_country || 'US';
  const R = { people: 0, merged: [], orgs: 0, clientOrgs: [], locations: 0, rolesDropped: [], review: [], aliasUsed: new Map() };
  report.set(user.id, R);

  function address(state, label) {
    const r = Regions.normalizeAddress(line(state), null);
    if (!r.state && !r.country) return { state: null, country: defaultCountry };
    if (!r.country) R.review.push(`${label}: state "${r.state}" not recognized, country left blank`);
    return { state: r.state || null, country: r.country || null };
  }
  async function insert(table, cols) {
    const ks = Object.keys(cols);
    const r = await q(`INSERT INTO ${table} (owner_id, ${ks.join(', ')}) VALUES ($1, ${ks.map((_, i) => '$' + (i + 2)).join(', ')}) RETURNING *`,
      [user.id, ...ks.map(k => cols[k])]);
    return r[0];
  }

  // Roles: what this user can use (no custom roles exist yet at migration;
  // the query includes them anyway so the tie-break rule matches the app).
  const roles = (await q(`SELECT id, name, abbreviation, category, owner_id FROM roles
                           WHERE (owner_id IS NULL OR owner_id = $1) AND archived_at IS NULL`, [user.id]));
  function roleByText(text, cat) {
    const k = key(text);
    if (!k) return null;
    const find = kk => {
      let hits = roles.filter(r => key(r.name) === kk || key(r.abbreviation) === kk);
      if (hits.length > 1) { const inCat = hits.filter(r => r.category === cat); if (inCat.length) hits = inCat; }
      if (hits.length > 1) { const glob = hits.filter(r => r.owner_id == null); if (glob.length) hits = glob; }
      return hits.length === 1 ? hits[0] : null;
    };
    const direct = find(k);
    if (direct) return direct;
    if (ALIASES[k]) {
      const viaAlias = find(key(ALIASES[k]));
      if (viaAlias) { R.aliasUsed.set(line(text), viaAlias.name); return viaAlias; }
    }
    return null;
  }

  // ------------------------------------------------ agencies + companies
  const orgByKey = new Map();   // key(name) -> org row (for companies + client text)
  const orgRefs = new Map();    // org id -> refs
  const agencies = await q(`SELECT * FROM agencies WHERE user_id = $1 ORDER BY id`, [user.id]);
  const agencyOrg = new Map();  // agency id -> org
  for (const a of agencies) {
    const ad = address(a.state, `agency "${a.name}"`);
    const o = await insert('organizations', {
      name: n(a.name) || 'Untitled agency', is_agency: true, logo: m(a.logo), website: n(a.website),
      address: n(a.address), city: n(a.city), state: ad.state, zip: n(a.zip), country: ad.country,
      contact_name: n(a.contact_name), contact_email: n(a.contact_email), contact_phone: n(a.contact_phone),
      invoicing_email: n(a.invoicing_email), invoicing_text: m(a.invoicing_text),
      default_project_type: n(a.default_project_type), timezone: line(a.timezone) === 'none' ? null : n(a.timezone),
      legacy_agency_id: a.id, legacy_source: 'agency', client_uid: `mig:agency.${a.id}`,
    });
    R.orgs++;
    agencyOrg.set(a.id, o);
    orgRefs.set(o.id, [`agency.${a.id}`]);
    if (!orgByKey.has(key(o.name))) orgByKey.set(key(o.name), o);
    if (a.is_default) await c.query(`UPDATE users SET default_organization_id = $2 WHERE id = $1 AND default_organization_id IS NULL`, [user.id, o.id]);
  }
  const companies = Array.isArray(blob.companies) ? blob.companies : [];
  for (let i = 0; i < companies.length; i++) {
    const co = companies[i] || {};
    if (!hasData(co, ['name', 'logo', 'website', 'notes'])) continue;
    const name = n(co.name) || 'Unnamed company';
    const existing = orgByKey.get(key(name));
    if (existing) {
      // Same name as an agency (or an earlier company): fill gaps only.
      const u = await q(`UPDATE organizations SET logo = COALESCE(logo, $2), website = COALESCE(website, $3), notes = COALESCE(notes, $4)
                          WHERE id = $1 RETURNING *`, [existing.id, m(co.logo), n(co.website), m(co.notes)]);
      orgByKey.set(key(name), u[0]);
      orgRefs.get(existing.id).push(`companies.${i}`);
      continue;
    }
    const o = await insert('organizations', {
      name, is_agency: false, logo: m(co.logo), website: n(co.website), notes: m(co.notes), country: defaultCountry,
      legacy_source: 'contacts.companies', client_uid: `mig:companies.${i}`,
    });
    R.orgs++;
    orgByKey.set(key(name), o);
    orgRefs.set(o.id, [`companies.${i}`]);
  }
  // Project client text with no org yet -> one org per distinct value.
  const projects = await q(`SELECT id, key, label, data FROM projects WHERE owner_id = $1 ORDER BY id`, [user.id]);
  for (const p of projects) {
    const d = p.data || {};
    const ctext = line(d.client_company) || line(d.client);
    if (!ctext || orgByKey.has(key(ctext))) continue;
    const o = await insert('organizations', {
      name: ctext, is_agency: false, country: defaultCountry,
      legacy_source: 'project.client_company', client_uid: `mig:client.${encodeURIComponent(key(ctext))}`,
    });
    R.orgs++; R.clientOrgs.push(ctext);
    orgByKey.set(key(ctext), o);
    orgRefs.set(o.id, [`client.${encodeURIComponent(key(ctext))}`]);
  }
  // Rewrite client_uid for orgs that absorbed companies.
  for (const [id, refs] of orgRefs) {
    if (refs.length > 1) await c.query(`UPDATE organizations SET client_uid = $2 WHERE id = $1`, [id, 'mig:' + refs.join('|')]);
  }

  // ------------------------------------------------------------- people
  const entries = [];
  for (const b of BUCKETS) {
    (Array.isArray(blob[b]) ? blob[b] : []).forEach((e, i) => {
      e = e || {};
      if (hasData(e, PERSON_FIELDS)) entries.push({ bucket: b, i, e, ref: `${b}.${i}` });
    });
  }
  // Groups: one per entry, or identical copies together (see MERGE_IDENTICAL).
  const groups = [];
  for (const en of entries) {
    const g = MERGE_IDENTICAL && groups.find(gr => {
      const f = gr[0].e;
      if (key(f.name) !== key(en.e.name) || key(f.phone) !== key(en.e.phone) || key(f.email) !== key(en.e.email)) return false;
      const addr = [...new Set(gr.concat(en).map(x => line(x.e.address)).filter(Boolean))];
      const titles = [...new Set(gr.concat(en).filter(x => x.bucket === 'talent').map(x => line(x.e.title)).filter(Boolean))];
      return addr.length <= 1 && titles.length <= 1;
    });
    if (g) g.push(en); else groups.push([en]);
  }
  const interview = roles.find(r => r.owner_id == null && key(r.name) === 'interview subject');
  for (const g of groups) {
    const first = g[0].e;
    const notes = [...new Set(g.map(x => m(x.e.notes)).filter(Boolean))].join('\n\n') || null;
    const talentTitle = g.filter(x => x.bucket === 'talent').map(x => n(x.e.title)).find(Boolean) || null;
    const ct = await insert('contacts', {
      name: n(first.name) || 'Unnamed', phone: n(first.phone), email: n(first.email),
      address: g.map(x => n(x.e.address)).find(Boolean) || null, notes, title: talentTitle,
      state: null, country: defaultCountry, legacy_bucket: g[0].bucket,
      client_uid: 'mig:' + g.map(x => x.ref).join('|'),
    });
    R.people++;
    if (g.length > 1) R.merged.push(`${ct.name} (${g.map(x => x.ref).join(' + ')})`);
    const roleIds = [];
    for (const x of g) {
      let r = null;
      if (x.bucket === 'talent') {
        const exact = roleByText(x.e.title, 'talent');
        r = exact && exact.category === 'talent' && key(exact.name) === key(x.e.title) ? exact : interview;
      } else {
        const text = line(x.e[ROLE_FIELD[x.bucket]]);
        if (text) { r = roleByText(text, x.bucket); if (!r) R.rolesDropped.push(`${ct.name}: "${text}" (${x.bucket})`); }
      }
      if (r && !roleIds.includes(r.id)) roleIds.push(r.id);
    }
    for (let i = 0; i < roleIds.length; i++) {
      await c.query(`INSERT INTO contact_roles (contact_id, role_id, sort_order) VALUES ($1, $2, $3)`, [ct.id, roleIds[i], i]);
    }
  }

  // ---------------------------------------------------------- locations
  const oldLocs = Array.isArray(blob.locations) ? blob.locations : [];
  for (let i = 0; i < oldLocs.length; i++) {
    const l = oldLocs[i] || {};
    if (!hasData(l, LOC_FIELDS)) continue;
    const extra = [n(l.phone) && 'Phone: ' + n(l.phone), n(l.email) && 'Email: ' + n(l.email)].filter(Boolean).join('\n');
    const ad = address(l.state, `location "${line(l.name)}"`);
    await insert('locations', {
      name: n(l.name) || 'Unnamed location', address: n(l.address), city: n(l.city), state: ad.state, zip: n(l.zip), country: ad.country,
      hospital: BLANK_HOSPITALS ? null : m(l.hospital),
      notes: [m(l.notes), extra].filter(Boolean).join('\n\n') || null,
      client_uid: `mig:locations.${i}`,
    });
    R.locations++;
  }

  // ------------------------------------------------------------ projects
  // Read back AFTER all contact_roles inserts: those bump contacts.updated_at,
  // and contact_ack must equal the final value.
  const contacts = await q(`SELECT c.id, c.name, c.updated_at,
                                   (SELECT r.id FROM contact_roles cr JOIN roles r ON r.id = cr.role_id
                                     WHERE cr.contact_id = c.id AND r.category = 'talent' ORDER BY cr.sort_order LIMIT 1) AS talent_role
                              FROM contacts c WHERE c.owner_id = $1 AND c.archived_at IS NULL`, [user.id]);
  const locs = await q(`SELECT id, name FROM locations WHERE owner_id = $1 AND archived_at IS NULL`, [user.id]);
  const unique = (rows, name) => { const k = key(name); if (!k) return null; const h = rows.filter(r => key(r.name) === k); return h.length === 1 ? h[0] : null; };
  const KINDS = [['crew', 'position', 'crew'], ['talent', null, 'talent'], ['kp_cards', 'role', 'staff']];

  for (const p of projects) {
    const before = p.data || {};
    const d = JSON.parse(JSON.stringify(before));
    const added = { top: new Set(), cards: [], days: [] };
    const aid = Number(d.agency_id) || null;
    const agOrg = aid ? agencyOrg.get(aid) || null : null;
    const ctext = line(d.client_company) || line(d.client);
    const clOrg = ctext ? orgByKey.get(key(ctext)) : null;
    if (!('agency_org_id' in d)) { d.agency_org_id = agOrg ? agOrg.id : null; added.top.add('agency_org_id'); }
    if (!('client_org_id' in d)) { d.client_org_id = clOrg ? clOrg.id : null; added.top.add('client_org_id'); }

    for (const [list, rf, cat] of KINDS) {
      (Array.isArray(d[list]) ? d[list] : []).forEach((e, i) => {
        if (!e || typeof e !== 'object') return;
        if (!e.contact_id) {
          const ct = unique(contacts, e.name);
          if (ct) {
            e.contact_id = ct.id; added.cards.push([list, i, 'contact_id']);
            e.contact_ack = ct.updated_at; added.cards.push([list, i, 'contact_ack']);
            if (list === 'talent' && !e.role_id && ct.talent_role) { e.role_id = ct.talent_role; added.cards.push([list, i, 'role_id']); }
          }
        }
        if (rf && !e.role_id) {
          const r = roleByText(e[rf], cat);
          if (r) { e.role_id = r.id; added.cards.push([list, i, 'role_id']); }
        }
      });
    }
    (Array.isArray(d.schedule_days) ? d.schedule_days : []).forEach((day, i) => {
      if (!day || typeof day !== 'object' || day.location_id) return;
      const l = unique(locs, day.loc_name || day.loc_id);
      if (l) { day.location_id = l.id; added.days.push(i); }
    });

    // Card text untouched: taking the added keys back out must give the original.
    if (canon(stripLinks(d, added)) !== canon(before)) throw new Error(`project ${p.key}: data changed beyond link keys`);
    await c.query(`UPDATE projects SET data = $2, agency_org_id = $3, client_org_id = $4 WHERE id = $1`,
      [p.id, JSON.stringify(d), agOrg ? agOrg.id : null, clOrg ? clOrg.id : null]);
    // Re-read: what's stored must also strip back to the original.
    const stored = (await q(`SELECT data FROM projects WHERE id = $1`, [p.id]))[0].data;
    if (canon(stripLinks(stored, added)) !== canon(before)) throw new Error(`project ${p.key}: stored data differs beyond link keys`);
  }
}

async function main() {
  console.log(`Target: ${target.hostname || '(socket)'}:${target.port || 5432} / ${target.pathname.slice(1)}` +
    `${DRY_RUN ? '   [DRY RUN: will roll back]' : ''}`);
  console.log(`Options: duplicates ${MERGE_IDENTICAL ? 'MERGED when identical' : 'kept separate'}; old hospitals ${BLANK_HOSPITALS ? 'left empty' : 'copied'}; ` +
    `aliases: ${Object.entries(ALIASES).map(([k, v]) => `${k} -> ${v}`).join(', ')}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const have = await c.query(`SELECT to_regclass('public.contacts') IS NOT NULL AS ok`);
    if (!have.rows[0].ok) throw new Error('v2 tables missing: run scripts/migrate-data-model.js first');
    // No app writes mid-migration (cutover runs in a maintenance window anyway).
    await c.query('LOCK TABLE users, agencies, projects IN SHARE ROW EXCLUSIVE MODE');
    const before = await fingerprint(c);

    const users = (await c.query(`SELECT id, email, contacts, default_country, default_organization_id FROM users ORDER BY id`)).rows;
    const report = new Map();
    const skipped = [];
    for (const u of users) {
      const already = await c.query(`SELECT (SELECT COUNT(*) FROM contacts WHERE owner_id = $1 AND client_uid LIKE 'mig:%')
                                          + (SELECT COUNT(*) FROM organizations WHERE owner_id = $1 AND client_uid LIKE 'mig:%')
                                          + (SELECT COUNT(*) FROM locations WHERE owner_id = $1 AND client_uid LIKE 'mig:%') AS n`, [u.id]);
      if (Number(already.rows[0].n)) { skipped.push(u.email); continue; }
      await migrateUser(c, u, report);
    }

    const after = await fingerprint(c);
    const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.length) throw new Error(`old data changed: ${changed.join(', ')}`);

    // Verification, inside this transaction, on the final state.
    const fresh = (await c.query(`SELECT id, email, contacts, default_country, default_organization_id FROM users ORDER BY id`)).rows;
    let failed = 0;
    for (const u of fresh) {
      const res = await verifyUser(c, u);
      failed += res.fails.length;
      printUser(u, res);
      const R = report.get(u.id);
      if (!R) { console.log('  (already migrated before this run: skipped)\n'); continue; }
      if (R.merged.length) console.log(`  Merged identical copies: ${R.merged.join('; ')}`);
      if (R.aliasUsed.size) console.log(`  Aliases used: ${[...R.aliasUsed].map(([k, v]) => `${k} -> ${v}`).join(', ')}`);
      if (R.rolesDropped.length) console.log(`  Roles dropped (person kept): ${R.rolesDropped.join('; ')}`);
      R.review.forEach(x => console.log('  review: ' + x));
      console.log('');
    }
    if (skipped.length) console.log(`Skipped (already migrated): ${skipped.join(', ')}`);
    console.log(`Old data (users.contacts, agencies, receipts, licenses, project rows): unchanged. Project data: only link keys added.`);

    if (failed) {
      await c.query('ROLLBACK');
      console.error(`\nVERIFICATION FAILED (${failed} problems). Rolled back, nothing changed.`);
      process.exitCode = 1;
    } else if (DRY_RUN) {
      await c.query('ROLLBACK');
      console.log('\nVerification passed. DRY RUN: rolled back, nothing changed.');
    } else {
      await c.query('COMMIT');
      console.log('\nVerification passed. Committed.');
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\nERROR, rolled back. Nothing changed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
