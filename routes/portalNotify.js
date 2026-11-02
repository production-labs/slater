// Client Portal: background jobs + producer emails (V1.5 step 6b).
//
// One timer in the app process (start(), from server.js) runs every minute:
//
//   1. SWEEP   files past expires_at: R2 object + row deleted. Pending uploads
//              abandoned for 24 h: multipart aborted, row deleted. (The
//              bucket's 14-day lifecycle rule is the backstop for both.)
//   2. NOTIFY  one email per project per batch, to the account owner (always)
//              and the Key Personnel picked in the project's portal panel
//              (portal_recipients, by email; only addresses still on one of the
//              project's KP cards). A batch = new files + new client answers
//              (approve / request changes). It goes out once the project has
//              been quiet for 10 minutes, or an hour after the first thing in
//              it, whichever is first. Answers the client replaced, or that the
//              producer already handled in the app, are left out.
//              Rows are claimed (notified_at) in a transaction with a per-
//              project advisory lock, so two app instances overlapping during
//              a deploy can't both send. If the owner's email fails, the batch
//              rolls back and is retried next minute.
//
// Email download links (GET /f/:token, mounted in server.js, no login): one
// per file per recipient, HMAC-signed with a key derived from SESSION_SECRET.
// A link works while the file exists and isn't expired, then 404s. It
// redirects to a 5-minute R2 link (saves as a file) and records the first
// download (downloaded_at / downloaded_by). Tokens never appear in logs.
//
// Env: APP_URL (links), RESEND_API_KEY / RESEND_FROM_EMAIL (sending).
// Testing: PORTAL_EMAIL_LOG=<file> writes emails there as JSON lines instead of
// sending; PORTAL_JOBS_INTERVAL_MS, PORTAL_NOTIFY_QUIET_SECONDS,
// PORTAL_NOTIFY_MAX_WAIT_SECONDS shorten the timings; PORTAL_JOBS=off disables.

const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { rateLimit } = require('express-rate-limit');
const transfers = require('./transfers');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const INTERVAL_MS = num(process.env.PORTAL_JOBS_INTERVAL_MS, 60 * 1000);
const QUIET_S = num(process.env.PORTAL_NOTIFY_QUIET_SECONDS, 10 * 60);
const MAX_WAIT_S = num(process.env.PORTAL_NOTIFY_MAX_WAIT_SECONDS, 60 * 60);
const PENDING_HOURS = 24;
const LOCK_NS = 61001; // advisory lock namespace for portal emails
const MAX_RECIPIENTS = 10;

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

// ── Download links ──────────────────────────────────────────────────────────
const LINK_KEY = crypto.createHash('sha256')
  .update('slater-portal-file-link:' + (process.env.SESSION_SECRET || 'slater-dev-secret')).digest();
const emailTag = (email) => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('base64url').slice(0, 16);

// who: 'o' (account owner) or 'k' + emailTag(kp email). The signature covers
// the file's random R2 key, so a link can't outlive its file or be moved.
function signLink(file, who) {
  const body = Buffer.from(file.id + '.' + who).toString('base64url');
  const sig = crypto.createHmac('sha256', LINK_KEY).update(body + '|' + file.r2_key).digest('base64url').slice(0, 32);
  return body + '.' + sig;
}
function readLink(token) {
  const m = /^([A-Za-z0-9_-]{4,80})\.([A-Za-z0-9_-]{32})$/.exec(token || '');
  if (!m) return null;
  const [id, who] = Buffer.from(m[1], 'base64url').toString().split('.');
  if (!/^\d{1,10}$/.test(id || '') || !/^(o|k[A-Za-z0-9_-]{16})$/.test(who || '')) return null;
  return { id: Number(id), who, body: m[1], sig: m[2] };
}
function linkOk(parsed, r2Key) {
  const want = Buffer.from(crypto.createHmac('sha256', LINK_KEY).update(parsed.body + '|' + r2Key).digest('base64url').slice(0, 32));
  const got = Buffer.from(parsed.sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
const fileUrl = (file, who) => appUrl() + '/f/' + signLink(file, who);

const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: 'Too many requests. Please wait a few minutes.',
});

function notFoundPage(res) {
  res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Link expired</title>' +
    '<div style="font-family:-apple-system,sans-serif;max-width:420px;margin:18vh auto;padding:0 24px;text-align:center;color:#555">' +
    '<h1 style="font-size:18px;color:#222">This link has expired</h1>' +
    '<p style="font-size:14px">The file was deleted (files are kept 14 days), or the link isn\'t right.</p></div>');
}

const linkRouter = express.Router();
linkRouter.get('/:token', linkLimiter, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
  try {
    const p = readLink(req.params.token);
    if (!p) return notFoundPage(res);
    const r = await pool.query(
      `SELECT f.id, f.r2_key, f.filename, p.data, u.name AS owner_name
         FROM portal_files f
         JOIN projects p ON p.id = f.project_id AND p.owner_id = f.owner_id
         JOIN users u ON u.id = f.owner_id
        WHERE f.id = $1 AND f.status = 'ready' AND f.expires_at > NOW()`, [p.id]);
    const file = r.rows[0];
    if (!file || !linkOk(p, file.r2_key) || !transfers.isConfigured()) return notFoundPage(res);
    let who = 'Producer';
    if (p.who === 'o') who = file.owner_name || 'Producer';
    else {
      const kp = kpCards(file.data).find(k => 'k' + emailTag(k.email) === p.who);
      who = kp ? (kp.name || kp.email) : 'Key personnel';
    }
    const url = await transfers.signDownload(file.r2_key, file.filename);
    await pool.query(
      `UPDATE portal_files SET downloaded_at = COALESCE(downloaded_at, NOW()),
              downloaded_by = COALESCE(downloaded_by, $2) WHERE id = $1`, [file.id, String(who).slice(0, 200)]);
    res.redirect(302, url);
  } catch (err) {
    console.error('Portal file link failed:', err.message);
    if (!res.headersSent) res.status(502).type('text').send('Something went wrong. Please try again in a moment.');
  }
});

// ── Recipients ──────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
function kpCards(data) {
  const list = data && Array.isArray(data.kp_cards) ? data.kp_cards : [];
  return list
    .filter(k => k && typeof k.email === 'string' && EMAIL_RE.test(k.email.trim()))
    .map(k => ({ name: String(k.name || '').trim().slice(0, 200), role: String(k.role || '').trim().slice(0, 200), email: k.email.trim().toLowerCase() }));
}

// Picked addresses that are still on a KP card of this project (the owner's
// own address is skipped: they always get the owner email).
async function kpRecipients(client, projectId, data, ownerEmail) {
  const picked = (await client.query('SELECT email FROM portal_recipients WHERE project_id = $1', [projectId])).rows.map(r => r.email);
  const seen = new Set([String(ownerEmail || '').toLowerCase()]);
  const out = [];
  for (const k of kpCards(data)) {
    if (picked.includes(k.email) && !seen.has(k.email)) { seen.add(k.email); out.push(k); }
  }
  return out.slice(0, MAX_RECIPIENTS);
}

// ── Email ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Subject lines are plain text, but keep them on one line and short.
const oneLine = (s, max) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
function fmtSize(n) {
  if (n < 1024) return n + ' bytes';
  const u = ['KB', 'MB', 'GB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + u[i];
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function buildEmail({ project, client, files, responses, who, toOwner, ownerName }) {
  const title = oneLine(project.title, 80);
  const from = oneLine(client, 60) || 'Your client';
  const approvals = responses.filter(r => r.kind === 'approved').length;
  const changes = responses.length - approvals;
  const parts = [];
  if (files.length) parts.push(plural(files.length, 'file', 'files'));
  if (approvals) parts.push(plural(approvals, 'approval', 'approvals'));
  if (changes) parts.push(plural(changes, 'change request', 'change requests'));
  const what = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  const subject = oneLine(title + ': ' + what + ' from ' + from, 160);

  const btn = 'background:#222222;color:#ffffff;padding:7px 14px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;display:inline-block';
  let body = '';
  if (files.length) {
    const deletes = files.reduce((a, f) => (new Date(f.expires_at) < a ? new Date(f.expires_at) : a), new Date(files[0].expires_at));
    body += `<h2 style="font-size:14px;color:#222222;margin:22px 0 4px">${esc(from)} sent ${plural(files.length, 'file', 'files')}</h2>` +
      `<p style="color:#9D9D99;font-size:12px;margin:0 0 10px">Download soon: files are deleted 14 days after they arrive${files.length > 1 ? ' (the first on ' : ' ('}${esc(fmtDate(deletes))}).</p>`;
    for (const f of files) {
      body += '<div style="border:1px solid #f0ebe3;border-radius:8px;padding:12px 14px;margin:8px 0">' +
        `<div style="font-size:14px;color:#222222;font-weight:600;word-break:break-word">${esc(f.filename)}</div>` +
        `<div style="font-size:12px;color:#777777;margin:2px 0 8px">${esc(fmtSize(Number(f.size_bytes)))} &middot; ${esc(f.uploaded_by_name || 'Client')}` +
        (f.item ? ` &middot; for &ldquo;${esc(f.item)}&rdquo;` : '') + '</div>' +
        `<a href="${esc(fileUrl(f, who))}" style="${btn}">Download</a></div>`;
    }
  }
  if (responses.length) {
    body += `<h2 style="font-size:14px;color:#222222;margin:22px 0 4px">${esc(from)} answered</h2>`;
    for (const r of responses) {
      const ok = r.kind === 'approved';
      body += `<div style="border:1px solid #f0ebe3;border-left:3px solid ${ok ? '#3a9a5b' : '#E0A030'};border-radius:8px;padding:12px 14px;margin:8px 0">` +
        `<div style="font-size:13px;font-weight:700;color:${ok ? '#3a9a5b' : '#B4541A'}">${ok ? 'Approved' : 'Changes requested'}</div>` +
        `<div style="font-size:14px;color:#222222;margin-top:2px">${esc(r.item || 'A workback item')}</div>` +
        `<div style="font-size:12px;color:#777777;margin-top:2px">${esc(r.responder_name || 'Client')}</div>` +
        (r.note ? `<div style="font-size:13px;color:#444444;margin-top:8px;white-space:pre-wrap;word-break:break-word">${esc(r.note)}</div>` : '') +
        '</div>';
    }
  }
  const footer = toOwner
    ? `<p style="font-size:13px;margin:22px 0 0"><a href="${esc(appUrl())}" style="color:#222222">Open Slater</a> to confirm answers and see every file for this project.</p>`
    : `<p style="color:#9D9D99;font-size:12px;margin:22px 0 0">You're getting this because ${esc(ownerName || 'your producer')} added you to the emails for ${esc(title)} in Slater. The download links are just for you; please don't forward this email.</p>`;

  const html =
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f3f0ed">' +
    '<div style="background:#222222;padding:20px 24px;border-radius:8px 8px 0 0">' +
    '<h1 style="color:#C8A84B;font-size:22px;margin:0;letter-spacing:0.05em">SLATER</h1>' +
    `<p style="color:rgba(255,255,255,0.65);font-size:13px;margin:6px 0 0">${esc(title)}</p></div>` +
    '<div style="background:#ffffff;padding:8px 24px 24px;border-radius:0 0 8px 8px">' + body + footer +
    '<hr style="border:none;border-top:1px solid #f0ebe3;margin:20px 0">' +
    '<p style="color:#9D9D99;font-size:11px;text-align:center">Slater - The Producer\'s Toolbox - Production Labs LLC - productionlabs.io</p>' +
    '</div></div>';
  return { subject, html };
}

let resend = null;
async function deliver(to, { subject, html }) {
  if (process.env.PORTAL_EMAIL_LOG) {
    fs.appendFileSync(process.env.PORTAL_EMAIL_LOG, JSON.stringify({ to, subject, html, at: new Date().toISOString() }) + '\n');
    return;
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new Error('email not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)');
  if (!resend) { const { Resend } = require('resend'); resend = new Resend(process.env.RESEND_API_KEY); }
  const r = await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL, to, subject, html });
  if (r && r.error) throw new Error('Resend: ' + (r.error.message || JSON.stringify(r.error)));
}

// ── Jobs ────────────────────────────────────────────────────────────────────
async function sweep() {
  if (!transfers.isConfigured()) return;
  const gone = await pool.query(
    `SELECT id, r2_key, upload_id, status FROM portal_files
      WHERE (status = 'ready' AND expires_at <= NOW())
         OR (status = 'pending' AND created_at <= NOW() - make_interval(hours => $1))
      ORDER BY id LIMIT 200`, [PENDING_HOURS]);
  for (const f of gone.rows) {
    try {
      if (f.status === 'pending' && f.upload_id) await transfers.abortUpload(f.r2_key, f.upload_id).catch(() => {});
      await transfers.deleteObject(f.r2_key);
      await pool.query('DELETE FROM portal_files WHERE id = $1', [f.id]);
    } catch (err) {
      console.error('Portal sweep: could not delete file ' + f.id + ':', err.message); // retried next run
    }
  }
}

async function notifyProject(projectId) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const got = (await c.query('SELECT pg_try_advisory_xact_lock($1, $2) AS ok', [LOCK_NS, projectId])).rows[0].ok;
    if (!got) { await c.query('ROLLBACK'); return; }

    const files = (await c.query(
      `UPDATE portal_files SET notified_at = NOW()
        WHERE project_id = $1 AND status = 'ready' AND notified_at IS NULL
        RETURNING id, r2_key, filename, size_bytes, uploaded_by_name, wb_item_uuid, ready_at, expires_at`, [projectId])).rows
      .filter(f => new Date(f.expires_at) > new Date())
      .sort((a, b) => new Date(a.ready_at) - new Date(b.ready_at));
    const responses = (await c.query(
      `UPDATE portal_responses SET notified_at = NOW()
        WHERE project_id = $1 AND notified_at IS NULL
        RETURNING id, wb_item_uuid, kind, responder_name, note, created_at, acknowledged_at`, [projectId])).rows
      .filter(r => !r.acknowledged_at) // replaced by a newer answer, or already handled in the app
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!files.length && !responses.length) { await c.query('COMMIT'); return; }

    const p = (await c.query(
      `SELECT p.label, p.data, p.client_org_id, u.email AS owner_email, u.name AS owner_name, u.is_suspended,
              o.name AS client_org
         FROM projects p JOIN users u ON u.id = p.owner_id
         LEFT JOIN organizations o ON o.id = p.client_org_id AND o.owner_id = p.owner_id
        WHERE p.id = $1`, [projectId])).rows[0];
    if (!p || p.is_suspended || !p.owner_email) { await c.query('COMMIT'); return; }
    const data = p.data && typeof p.data === 'object' ? p.data : {};
    const items = new Map((Array.isArray(data.wb_items) ? data.wb_items : []).filter(i => i && i.uuid).map(i => [i.uuid, String(i.item || '').trim()]));
    files.forEach(f => { f.item = f.wb_item_uuid ? items.get(f.wb_item_uuid) || '' : ''; });
    responses.forEach(r => { r.item = items.get(r.wb_item_uuid) || ''; });
    const project = { title: String(data.project_title || '').trim() || String(p.label || '').split('|')[0].trim() || 'Your project' };
    const client = String(data.client_company || data.client || p.client_org || '').trim();
    const base = { project, client, files, responses, ownerName: p.owner_name };

    // Owner first: if that fails, nothing is marked and it all retries.
    await deliver(p.owner_email, buildEmail(Object.assign({ who: 'o', toOwner: true }, base)));
    for (const k of await kpRecipients(c, projectId, data, p.owner_email)) {
      try { await deliver(k.email, buildEmail(Object.assign({ who: 'k' + emailTag(k.email), toOwner: false }, base))); }
      catch (err) { console.error('Portal email to a key personnel address failed:', err.message); }
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Portal email for project ' + projectId + ' failed (will retry):', err.message);
  } finally {
    c.release();
  }
}

async function notify() {
  const due = await pool.query(
    `SELECT project_id FROM (
       SELECT project_id, ready_at AS t FROM portal_files WHERE status = 'ready' AND notified_at IS NULL
       UNION ALL
       SELECT project_id, created_at FROM portal_responses WHERE notified_at IS NULL
     ) e GROUP BY project_id
     HAVING MAX(t) <= NOW() - make_interval(secs => $1) OR MIN(t) <= NOW() - make_interval(secs => $2)
     LIMIT 50`, [QUIET_S, MAX_WAIT_S]);
  for (const row of due.rows) await notifyProject(row.project_id);
}

let running = false;
async function runOnce() {
  if (running) return;
  running = true;
  try { await sweep(); } catch (err) { console.error('Portal sweep failed:', err.message); }
  try { await notify(); } catch (err) { console.error('Portal notify failed:', err.message); }
  running = false;
}

function start() {
  if (process.env.PORTAL_JOBS === 'off') return;
  const t = setInterval(runOnce, INTERVAL_MS);
  t.unref();
  setTimeout(runOnce, Math.min(INTERVAL_MS, 15000)).unref();
}

module.exports = { start, runOnce, linkRouter, kpCards, buildEmail, MAX_RECIPIENTS, EMAIL_RE };
