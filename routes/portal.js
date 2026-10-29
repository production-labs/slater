// Client Portal: the PUBLIC side (V1.5 step 5a, 2026-10-28).
//
// Mounted at /api/portal WITHOUT requireAuth: anyone with a project's link
// can reach it. Everything here is written for that:
//
//   - A portal is found only by its token (32 random bytes). Unknown token,
//     portal turned off (no row) and suspended owner all look the same: 404.
//   - Optional password (bcrypt, portals.password_hash). A correct password
//     sets a signed cookie, scoped by path to this one portal's API, good for
//     30 days. The signature covers the token and the password hash, so a new
//     link or a new password signs every client out. No server-side session.
//   - The payload is an explicit allowlist built by buildPayload(). Nothing
//     from projects.data is forwarded as-is. Never included: crew, talent,
//     expenses, notes, call times, owner names, internal items and pins,
//     links not opted in (urls[].visible_to_client), non-http(s) links.
//   - Responses are no-store, no-referrer, noindex.
//
// Clients can answer a "Waiting on you" item (step 5c): POST /:token/respond
// with Approve or Request changes. That only ever adds a portal_responses
// row; it never touches projects.data. The producer confirms in the app.
//
// Producer-side controls live in routes/portalAdmin.js (requireAuth).
// Plan: docs/v1.5-client-portal-plan.md (Part A).

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COOKIE = 'slater_portal';
const COOKIE_DAYS = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
// Its own key, derived from SESSION_SECRET, so a portal cookie can never be
// mistaken for anything else the app signs.
const KEY = crypto.createHash('sha256')
  .update('slater-portal-cookie:' + (process.env.SESSION_SECRET || 'slater-dev-secret'))
  .digest();

const TYPE_LABELS = {
  post_production: 'Post Production', location_shoot: 'Location Shoot',
  live_broadcast_location: 'Live Broadcast', live_broadcast_studio: 'Live Broadcast',
  webinar: 'Webinar',
};

// ── Limits ─────────────────────────────────────────────────────────────────
// Reading: generous, just stops anyone hammering the endpoint.
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
// Password guesses: per address AND portal.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip) + '|' + req.params.token,
  message: { error: 'too_many_attempts' },
});

// Client responses: per address AND portal. Generous for real use, stops floods.
const respondLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip) + '|' + req.params.token,
  message: { error: 'too_many_requests' },
});

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
  });
  next();
});

// ── Lookup ─────────────────────────────────────────────────────────────────
async function findPortal(token) {
  if (!TOKEN_RE.test(token || '')) return null;
  const r = await pool.query(
    `SELECT po.project_id, po.owner_id, po.token, po.password_hash,
            p.label, p.data, p.updated_at, p.client_org_id, p.agency_org_id,
            u.name AS user_name, u.dba AS user_dba, u.is_suspended
       FROM portals po
       JOIN projects p ON p.id = po.project_id AND p.owner_id = po.owner_id
       JOIN users u ON u.id = po.owner_id
      WHERE po.token = $1`, [token]);
  const row = r.rows[0];
  if (!row || row.is_suspended) return null;
  return row;
}

// ── Unlock cookie ──────────────────────────────────────────────────────────
function sign(portal, exp) {
  return crypto.createHmac('sha256', KEY)
    .update(portal.token + '|' + (portal.password_hash || '') + '|' + exp)
    .digest('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function isUnlocked(req, portal) {
  if (!portal.password_hash) return true;
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const [expStr, sig] = v.split('.');
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp < Date.now() || !sig) return false;
  const want = Buffer.from(sign(portal, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function setUnlockCookie(req, res, portal) {
  const exp = Date.now() + COOKIE_DAYS * 864e5;
  res.cookie(COOKIE, exp + '.' + sign(portal, exp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/portal/' + portal.token,
    maxAge: COOKIE_DAYS * 864e5,
  });
}

// ── Payload (the allowlist) ────────────────────────────────────────────────
function str(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max || 500);
}
function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }
function safeUrl(v) {
  const s = str(v, 2000);
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
  } catch (_) { return ''; }
}
function safeEmail(v) { const s = str(v, 200); return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : ''; }
function safeLogo(v) {
  return typeof v === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '';
}
function isClientOwner(owner, client) {
  const o = str(owner).toLowerCase();
  if (!o) return false;
  if (o === 'client') return true;
  const c = str(client).toLowerCase();
  return !!c && o === c;
}
function isDone(status) { return status === 'Complete'; }

// row: findPortal() row. extra: { clientOrg, agencyOrg, locations, updates, responses }
function buildPayload(row, extra) {
  const data = (row.data && typeof row.data === 'object') ? row.data : {};
  const clientOrg = extra.clientOrg || null;
  const agencyOrg = extra.agencyOrg || null;
  const clientName = str(data.client_company || data.client || (clientOrg && clientOrg.name), 200);
  const internalPins = (data.internal_pins && typeof data.internal_pins === 'object') ? data.internal_pins : {};
  const pinHidden = (id) => !!internalPins['pin_' + id];

  // Workback items the client may see: not internal, not N/A, dated.
  const items = (Array.isArray(data.wb_items) ? data.wb_items : [])
    .filter(i => i && str(i.item) && !i.internal && i.status !== 'N/A')
    .map(i => ({
      uuid: str(i.uuid, 100),
      item: str(i.item, 300),
      due: isoDate(i.due) || (i.mode === 'manual' ? isoDate(i.manual_date) : ''),
      client: isClientOwner(i.owner, clientName),
      done: isDone(i.status),
    }))
    .filter(i => i.due);

  // Key dates (pins): kickoff, schedule days, project due date. Internal ones out.
  const locById = new Map((extra.locations || []).map(l => [l.id, l]));
  const pins = [];
  if (isoDate(data.kickoff_date_iso) && !pinHidden('kickoff')) {
    pins.push({ id: 'kickoff', label: 'Kickoff', date: data.kickoff_date_iso, end_date: '', time: '', location: '' });
  }
  const venues = [];
  const seenVenue = new Set();
  (Array.isArray(data.schedule_days) ? data.schedule_days : []).forEach((day, i) => {
    if (!day || !isoDate(day.date_iso)) return;
    const id = day.id || 'day_' + i;
    if (pinHidden(id)) return;
    const loc = locById.get(Number(day.location_id));
    const locName = loc ? str(loc.name, 200) : str(day.loc_name, 200);
    const end = isoDate(day.end_date_iso);
    pins.push({
      id: 'day:' + pins.length,  // not the internal day id
      label: str(day.label, 200) || 'Day ' + (i + 1),
      date: day.date_iso,
      end_date: end && end > day.date_iso ? end : '',
      time: str(day.golive, 40),   // go-live time only; crew call times stay internal
      location: locName,
    });
    if (loc && !seenVenue.has(loc.id)) {
      seenVenue.add(loc.id);
      const cityLine = [str(loc.city, 100), [str(loc.state, 50), str(loc.zip, 20)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      venues.push({ name: str(loc.name, 200), address: str(loc.address, 300), city_line: cityLine });
    }
  });
  if (isoDate(data.video_due_date_iso) && !pinHidden('video_due')) {
    pins.push({ id: 'video_due', label: 'Delivery', date: data.video_due_date_iso, end_date: '', time: '', location: '' });
  }
  pins.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  // Latest client response per item (approvals arrive in step 5c).
  const respByUuid = new Map();
  (extra.responses || []).forEach(r => { if (!respByUuid.has(r.wb_item_uuid)) respByUuid.set(r.wb_item_uuid, r); });

  // Shared links (opted in per URL card). wb_item_uuid is used here only, to
  // put a review link beside its workback item; it isn't sent in `links`.
  const sharedLinks = (Array.isArray(data.urls) ? data.urls : [])
    .filter(u => u && u.visible_to_client === true)
    .map(u => ({ name: str(u.name, 200), url: safeUrl(u.url), notes: str(u.notes, 300), wb: str(u.wb_item_uuid, 100) }))
    .filter(u => u.url)
    .map(u => Object.assign(u, { name: u.name || new URL(u.url).hostname }));
  const links = sharedLinks.map(u => ({ name: u.name, url: u.url, notes: u.notes }));

  const waiting = items
    .filter(i => i.client && !i.done)
    .sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0)
    .map(i => {
      const r = respByUuid.get(i.uuid);
      return {
        uuid: i.uuid, item: i.item, due: i.due,
        links: i.uuid ? sharedLinks.filter(u => u.wb === i.uuid).map(u => ({ name: u.name, url: u.url })) : [],
        response: r && !r.acknowledged_at ? { kind: r.kind, at: r.created_at } : null,
      };
    });

  const timeline = pins.map(p => ({ date: p.date, label: p.label, kind: 'milestone' }))
    .concat(items.map(i => ({ date: i.due, label: i.item, kind: i.client ? 'client' : 'ours', done: i.done })))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  const team = (Array.isArray(data.kp_cards) ? data.kp_cards : [])
    .filter(k => k && str(k.name))
    .map(k => ({
      name: str(k.name, 200),
      role: str(k.role, 200),
      email: safeEmail(k.email),
      phone: str(k.phone, 40).replace(/[^0-9+()\-. ]/g, ''),
    }));

  const producer = str(agencyOrg && agencyOrg.name, 200) || str(row.user_dba, 200) || str(row.user_name, 200);

  return {
    project: {
      title: str(data.project_title, 300) || str(row.label, 300).split('|')[0].trim() || 'Project',
      type: TYPE_LABELS[data.project_type] || '',
      updated_at: row.updated_at,
    },
    client: { name: clientName, logo: safeLogo(clientOrg && clientOrg.logo) },
    producer: { name: producer },
    waiting,
    timeline,
    schedule: pins.map(p => ({ date: p.date, end_date: p.end_date, label: p.label, time: p.time, location: p.location }))
      .concat(items.filter(i => i.client).map(i => ({
        date: i.due, end_date: '', label: i.item, time: '', location: '', client_item: true, done: i.done,
      })))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
    team,
    links,
    venues,
    updates: (extra.updates || []).map(u => ({ author: str(u.author_name, 200), body: str(u.body, 10000), at: u.created_at })),
    key_date: pins.length ? (pins[pins.length - 1].end_date || pins[pins.length - 1].date) : '',
  };
}

async function loadExtras(row) {
  const data = (row.data && typeof row.data === 'object') ? row.data : {};
  const orgIds = [row.client_org_id, row.agency_org_id].filter(Boolean);
  const locIds = [...new Set((Array.isArray(data.schedule_days) ? data.schedule_days : [])
    .map(d => Number(d && d.location_id)).filter(n => Number.isInteger(n) && n > 0))];
  const [orgs, locs, updates, responses] = await Promise.all([
    orgIds.length
      ? pool.query('SELECT id, name, logo FROM organizations WHERE owner_id = $1 AND id = ANY($2::int[])', [row.owner_id, orgIds])
      : { rows: [] },
    locIds.length
      ? pool.query('SELECT id, name, address, city, state, zip FROM locations WHERE owner_id = $1 AND id = ANY($2::int[])', [row.owner_id, locIds])
      : { rows: [] },
    pool.query('SELECT author_name, body, created_at FROM portal_updates WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10', [row.project_id]),
    pool.query('SELECT wb_item_uuid, kind, created_at, acknowledged_at FROM portal_responses WHERE project_id = $1 ORDER BY created_at DESC', [row.project_id]),
  ]);
  const byId = new Map(orgs.rows.map(o => [o.id, o]));
  return {
    clientOrg: byId.get(row.client_org_id) || null,
    agencyOrg: byId.get(row.agency_org_id) || null,
    locations: locs.rows,
    updates: updates.rows,
    responses: responses.rows,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────
router.get('/:token', readLimiter, async (req, res) => {
  try {
    const portal = await findPortal(req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });
    if (!isUnlocked(req, portal)) return res.status(401).json({ error: 'locked' });
    res.json(buildPayload(portal, await loadExtras(portal)));
  } catch (err) {
    console.error('Portal load failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/:token/unlock', unlockLimiter, async (req, res) => {
  try {
    const portal = await findPortal(req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });
    if (!portal.password_hash) return res.json({ ok: true });
    const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (!pw || pw.length > 200 || !(await bcrypt.compare(pw, portal.password_hash))) {
      return res.status(401).json({ error: 'wrong_password' });
    }
    setUnlockCookie(req, res, portal);
    res.json({ ok: true });
  } catch (err) {
    console.error('Portal unlock failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Approve / Request changes on a "Waiting on you" item. The item must be one
// the client can see right now (checked against the same allowlist the page
// is built from). A newer answer replaces an older unconfirmed one for the
// same item, so the producer only sees the latest.
const NAME_MAX = 200, NOTE_MAX = 5000;
router.post('/:token/respond', respondLimiter, async (req, res) => {
  try {
    const portal = await findPortal(req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });
    if (!isUnlocked(req, portal)) return res.status(401).json({ error: 'locked' });
    const b = req.body || {};
    const kind = b.kind === 'approved' || b.kind === 'changes_requested' ? b.kind : null;
    const uuid = typeof b.uuid === 'string' ? b.uuid : '';
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const note = typeof b.note === 'string' ? b.note.trim() : '';
    if (!kind) return res.status(400).json({ error: 'bad_kind' });
    if (!name || name.length > NAME_MAX) return res.status(400).json({ error: 'bad_name' });
    if (note.length > NOTE_MAX) return res.status(400).json({ error: 'bad_note' });
    if (kind === 'changes_requested' && !note) return res.status(400).json({ error: 'note_required' });
    const waiting = buildPayload(portal, {}).waiting;
    if (!uuid || !waiting.some(w => w.uuid === uuid)) return res.status(409).json({ error: 'not_waiting' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE portal_responses SET acknowledged_at = NOW()
          WHERE project_id = $1 AND wb_item_uuid = $2 AND acknowledged_at IS NULL`,
        [portal.project_id, uuid]);
      await client.query(
        `INSERT INTO portal_responses (project_id, owner_id, wb_item_uuid, kind, responder_name, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [portal.project_id, portal.owner_id, uuid, kind, name, note || null]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Portal respond failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
module.exports.buildPayload = buildPayload;
module.exports.TOKEN_RE = TOKEN_RE;
