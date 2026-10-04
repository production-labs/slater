#!/usr/bin/env node
// DEV ONLY: copy one user's OLD contacts blob + agencies into the v2 tables,
// so the new Contacts screen can be tested with real data before the real
// migration (Session 6). LOCAL DATABASE ONLY. Not the migration itself:
// role matching here is name/abbreviation plus a tiny alias list.
//
//   node scripts/dev-copy-contacts-to-v2.js john@vandonald.com          copy (re-runnable: skips rows already copied)
//   node scripts/dev-copy-contacts-to-v2.js john@vandonald.com --wipe   remove everything this script created
//
// Every row it creates is tagged client_uid = 'devcopy:...', so --wipe never
// touches records created by hand in the new screen. Custom roles it created
// are removed by --wipe only if nothing else uses them.

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const email = process.argv[2];
const WIPE = process.argv.includes('--wipe');
if (!email || email.startsWith('--')) { console.error('Usage: node scripts/dev-copy-contacts-to-v2.js <email> [--wipe]'); process.exit(2); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ALIASES = { 'prod': 'Producer' }; // Session 6 grows this from real data
const BUCKET_CAT = { staff: 'staff', crew: 'crew', talent: 'talent' };
const ROLE_FIELD = { staff: 'role', crew: 'position', talent: 'title' };
const t = v => (v == null ? '' : String(v)).trim();
const n = v => t(v) || null;

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const u = await c.query('SELECT id, contacts FROM users WHERE lower(email) = lower($1)', [email]);
    if (!u.rows.length) throw new Error('No user ' + email);
    const userId = u.rows[0].id;

    if (WIPE) {
      const created = await c.query(`SELECT DISTINCT cr.role_id FROM contact_roles cr JOIN contacts ct ON ct.id = cr.contact_id
                                      WHERE ct.owner_id = $1 AND ct.client_uid LIKE 'devcopy:%'`, [userId]);
      const del = {};
      for (const tb of ['contacts', 'locations']) {
        del[tb] = (await c.query(`DELETE FROM ${tb} WHERE owner_id = $1 AND client_uid LIKE 'devcopy:%'`, [userId])).rowCount;
      }
      await c.query(`UPDATE users SET default_organization_id = NULL WHERE id = $1 AND default_organization_id IN
                     (SELECT id FROM organizations WHERE owner_id = $1 AND client_uid LIKE 'devcopy:%')`, [userId]);
      del.organizations = (await c.query(`DELETE FROM organizations WHERE owner_id = $1 AND client_uid LIKE 'devcopy:%'`, [userId])).rowCount;
      const ids = created.rows.map(r => r.role_id);
      del.roles = (await c.query(`DELETE FROM roles r WHERE r.owner_id = $1 AND r.id = ANY($2)
                                  AND NOT EXISTS (SELECT 1 FROM contact_roles cr WHERE cr.role_id = r.id)`, [userId, ids])).rowCount;
      await c.query('COMMIT');
      console.log('Wiped dev copy:', del);
      return;
    }

    const blob = u.rows[0].contacts || {};
    const report = { contacts: 0, organizations: 0, locations: 0, skipped: 0, rolesMatched: {}, rolesCreated: [], notes: [] };

    // Role lookup: global + user's custom, by lower(name) and lower(abbreviation).
    const roleRows = (await c.query('SELECT id, name, abbreviation, category FROM roles WHERE (owner_id IS NULL OR owner_id = $1) AND archived_at IS NULL', [userId])).rows;
    const byKey = new Map();
    for (const r of roleRows) {
      byKey.set(r.name.toLowerCase(), r);
      if (r.abbreviation) { const k = r.abbreviation.toLowerCase(); if (!byKey.has(k)) byKey.set(k, r); }
    }
    async function roleFor(text, category) {
      const key = t(text).toLowerCase();
      if (!key) return null;
      const viaAlias = ALIASES[key] && byKey.get(ALIASES[key].toLowerCase());
      const hit = viaAlias || byKey.get(key);
      if (hit) { report.rolesMatched[text] = hit.name; return hit.id; }
      const ins = await c.query(`INSERT INTO roles (owner_id, name, category, sort_order) VALUES ($1, $2, $3, 9000)
                                 ON CONFLICT (owner_id, lower(name)) WHERE owner_id IS NOT NULL DO UPDATE SET name = roles.name
                                 RETURNING id, name, abbreviation, category`, [userId, t(text), category]);
      const r = ins.rows[0];
      byKey.set(key, r);
      report.rolesCreated.push(`${r.name} (${category})`);
      return r.id;
    }
    async function insert(table, uid, cols) {
      const keys = Object.keys(cols);
      const r = await c.query(
        `INSERT INTO ${table} (owner_id, client_uid, ${keys.join(', ')}) VALUES ($1, $2, ${keys.map((_, i) => '$' + (i + 3)).join(', ')})
         ON CONFLICT (owner_id, client_uid) WHERE client_uid IS NOT NULL DO NOTHING RETURNING id`,
        [userId, uid, ...keys.map(k => cols[k])]);
      if (!r.rows.length) { report.skipped++; return null; }
      report[table]++;
      return r.rows[0].id;
    }

    // Agencies -> organizations (is_agency), keep default.
    const orgByName = new Map();
    const agencies = (await c.query('SELECT * FROM agencies WHERE user_id = $1 ORDER BY id', [userId])).rows;
    for (const a of agencies) {
      const id = await insert('organizations', 'devcopy:agency:' + a.id, {
        name: n(a.name) || 'Untitled agency', is_agency: true, logo: n(a.logo), website: n(a.website),
        address: n(a.address), city: n(a.city), state: n(a.state), zip: n(a.zip),
        contact_name: n(a.contact_name), contact_email: n(a.contact_email), contact_phone: n(a.contact_phone),
        invoicing_email: n(a.invoicing_email), invoicing_text: n(a.invoicing_text),
        default_project_type: n(a.default_project_type), timezone: n(a.timezone) === 'none' ? null : n(a.timezone),
        legacy_agency_id: a.id, legacy_source: 'agency',
      });
      if (id) {
        orgByName.set(t(a.name).toLowerCase(), id);
        if (a.is_default) await c.query('UPDATE users SET default_organization_id = $2 WHERE id = $1 AND default_organization_id IS NULL', [userId, id]);
      }
    }
    // Companies -> organizations (merge into an agency with the same name).
    (blob.companies || []).forEach((co, i) => { co.__i = i; });
    for (const co of blob.companies || []) {
      if (!t(co.name)) continue;
      const existing = orgByName.get(t(co.name).toLowerCase());
      if (existing) {
        await c.query(`UPDATE organizations SET logo = COALESCE(logo, $2), website = COALESCE(website, $3), notes = COALESCE(notes, $4) WHERE id = $1`,
          [existing, n(co.logo), n(co.website), n(co.notes)]);
        report.notes.push(`Company "${co.name}" merged into agency of the same name`);
        continue;
      }
      const id = await insert('organizations', 'devcopy:company:' + co.__i, {
        name: t(co.name), is_agency: false, logo: n(co.logo), website: n(co.website), notes: n(co.notes), legacy_source: 'contacts.companies',
      });
      if (id) orgByName.set(t(co.name).toLowerCase(), id);
    }

    // People.
    for (const bucket of ['staff', 'crew', 'talent']) {
      const list = blob[bucket] || [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!t(p.name)) continue;
        // Talent "title" is a job title, not a production role (John, decision A):
        // it goes to contacts.title; role = a talent role with that exact name
        // if one exists (e.g. "Host"), otherwise Interview Subject.
        const isTalent = bucket === 'talent';
        const roleText = isTalent ? null : p[ROLE_FIELD[bucket]];
        const id = await insert('contacts', `devcopy:${bucket}:${i}`, {
          name: t(p.name), email: n(p.email), phone: n(p.phone), address: n(p.address), notes: n(p.notes),
          title: isTalent ? n(p.title) : null, legacy_bucket: bucket,
        });
        if (!id) continue;
        let rid;
        if (isTalent) {
          const exact = byKey.get(t(p.title).toLowerCase());
          rid = exact && exact.category === 'talent' ? exact.id : byKey.get('interview subject').id;
        } else {
          rid = await roleFor(roleText, BUCKET_CAT[bucket]);
        }
        if (rid) await c.query('INSERT INTO contact_roles (contact_id, role_id, sort_order) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING', [id, rid]);
      }
    }

    // Locations (old phone/email have no column yet: kept in notes).
    const locs = blob.locations || [];
    for (let i = 0; i < locs.length; i++) {
      const l = locs[i];
      if (!t(l.name)) continue;
      const extra = [t(l.phone) && 'Phone: ' + t(l.phone), t(l.email) && 'Email: ' + t(l.email)].filter(Boolean).join('\n');
      if (extra) report.notes.push(`Location "${l.name}": phone/email kept in notes (no column yet)`);
      await insert('locations', 'devcopy:location:' + i, {
        name: t(l.name), address: n(l.address), city: n(l.city), state: n(l.state), zip: n(l.zip), hospital: n(l.hospital),
        notes: [t(l.notes), extra].filter(Boolean).join('\n\n') || null,
      });
    }

    await c.query('COMMIT');
    console.log(`Copied for ${email}: ${report.contacts} people, ${report.organizations} organizations, ${report.locations} locations` +
      (report.skipped ? ` (${report.skipped} already copied, skipped)` : ''));
    console.log('Roles matched:', Object.entries(report.rolesMatched).map(([k, v]) => `${k} -> ${v}`).join(', ') || 'none');
    console.log('Custom roles created:', report.rolesCreated.join(', ') || 'none');
    report.notes.forEach(x => console.log('Note:', x));
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Failed, nothing changed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
