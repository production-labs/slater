// End-to-end test: producer emails + the 14-day sweep (V1.5 step 6b).
// The every-minute job (routes/portalNotify.js) runs with short timings, and
// emails are written to a file (PORTAL_EMAIL_LOG) instead of being sent.
// R2 is the stand-in from scripts/e2e-fake-s3.js.
//
// LOCAL DATABASE ONLY. Creates temporary users and deletes them afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-portal-notify.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3987, BASE = 'http://localhost:' + PORT;
const S3_PORT = 3986, BUCKET = 'slater-e2e';
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const MAIL = '/tmp/cv2-e2e/notify-mail-' + STAMP + '.jsonl';
const QUIET_S = 3;
const fakeS3 = require('./e2e-fake-s3').create(S3_PORT, BUCKET);
const fake = fakeS3.state;
let server, browser, passed = 0, serverLog = '';
const userIds = [], fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/nt-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end) { if (await fn()) return; await sleep(150); }
  throw new Error('timed out waiting for ' + (what || 'condition'));
}
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const mails = () => (fs.existsSync(MAIL) ? fs.readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const links = html => [...html.matchAll(/href="([^"]*\/f\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const rel = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function main() {
  await fakeS3.listen();
  const PASS = 'e2e-pass-' + STAMP;
  const EMAIL = 'portalnt-e2e-' + STAMP + '@example.invalid';
  const SAM = 'sam-' + STAMP + '@example.invalid', LEE = 'lee-' + STAMP + '@example.invalid';
  const hash = await bcrypt.hash(PASS, 10);
  const userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Jo Owner') RETURNING id`, [EMAIL, hash])).rows[0].id;
  userIds.push(userId);
  const KEY = 'cs_nt_' + STAMP;
  const wb = (uuid, item) => ({ uuid, item, owner: 'Client', mode: 'manual', manual_date: rel(3), status: 'Not Started', internal: false });
  const data = {
    project_title: 'Notify Test', client_company: 'Acme',
    wb_items: [wb('u-script', 'Approve script'), wb('u-cast', 'Approve casting')],
    kp_cards: [
      { role: 'EP', name: 'Jo Owner', email: EMAIL.toUpperCase() },  // the owner's own address: never listed twice
      { role: 'Producer', name: 'Sam Producer', email: SAM },
      { role: 'Coordinator', name: 'Lee Coord', email: LEE },
      { role: 'PA', name: 'No Email' },
    ],
  };
  const projectId = (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Notify Test',$2,$3) RETURNING id`, [KEY, data, userId])).rows[0].id;
  const TOKEN = crypto.randomBytes(32).toString('base64url');
  await db.query('INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)', [projectId, userId, TOKEN]);

  const call = (method, p, body) => fetch(BASE + '/api/portal/' + TOKEN + p, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  async function upload(filename, bytes, item) {
    const s = await (await call('POST', '/uploads', { filename, size: bytes.length, name: 'Pat <b>Client</b>', item })).json();
    const urls = (await (await call('POST', '/uploads/' + s.id + '/parts', { parts: [1] })).json()).urls;
    const put = await fetch(urls[1], { method: 'PUT', body: bytes });
    const done = await call('POST', '/uploads/' + s.id + '/complete', { parts: [{ part: 1, etag: put.headers.get('etag') }] });
    assert(done.ok, 'upload ' + done.status);
    return s.id;
  }
  const respond = (uuid, kind, note) => call('POST', '/respond', { uuid, kind, name: 'Pat Client', note });
  const fileRows = async () => (await db.query('SELECT * FROM portal_files WHERE project_id=$1 ORDER BY id', [projectId])).rows;

  server = spawn('node', ['server.js'], {
    cwd: APP, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APP_URL: BASE, PORTAL_EMAIL_LOG: MAIL,
      PORTAL_JOBS_INTERVAL_MS: '500', PORTAL_NOTIFY_QUIET_SECONDS: String(QUIET_S), PORTAL_NOTIFY_MAX_WAIT_SECONDS: '60',
      R2_TRANSFER_ENDPOINT: fakeS3.url, R2_TRANSFER_BUCKET: BUCKET,
      R2_TRANSFER_ACCESS_KEY_ID: 'e2e-key', R2_TRANSFER_SECRET_ACCESS_KEY: 'e2e-secret',
    }),
  });
  server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  // ── Producer picks who gets the emails ────────────────────────────────────
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
  await page.evaluate(() => st('portal'));
  await page.waitForSelector('#portal-admin .pa-emails', { timeout: 8000 });
  const api = (method, p, body) => page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, method, '/api/portal-admin/' + KEY + p, body);

  await step('Emails block: Key Personnel with an email, no owner row, defaulted to selected', async () => {
    // Nothing was saved yet, so the panel seeds "everyone" as the default
    // and persists it (not just a visual default).
    await until(async () => (await db.query('SELECT COUNT(*)::int AS n FROM portal_recipients WHERE project_id=$1', [projectId])).rows[0].n === 2, 5000, 'default recipients seeded');
    const rows = await page.$$eval('#portal-admin .pa-rcpt', ls => ls.map(l => ({ t: l.textContent.trim(), on: l.querySelector('input').checked, off: l.querySelector('input').disabled })));
    assert(rows.length === 2, JSON.stringify(rows));
    assert(/Sam Producer/.test(rows[0].t) && rows[0].on && !rows[0].off, 'Sam row ' + JSON.stringify(rows[0]));
    assert(/Lee Coord/.test(rows[1].t) && rows[1].on && !rows[1].off, 'Lee row ' + JSON.stringify(rows[1]));
    await page.$eval('#portal-admin .pa-emails', el => el.scrollIntoView());
    await page.screenshot({ path: SHOTS + '/nt-emails-block.png' });
  });

  await step('Unticking Lee drops him from the saved list; it survives a reload', async () => {
    await page.click(`#portal-admin [data-pa-rcpt="${LEE}"]`);
    await until(async () => (await db.query('SELECT email FROM portal_recipients WHERE project_id=$1', [projectId])).rows.map(r => r.email).join() === SAM, 5000, 'saved');
    await page.evaluate(() => PortalAdmin.onProjectLoaded());
    await page.waitForFunction(e => { const b = document.querySelector('#portal-admin [data-pa-rcpt="' + e + '"]'); return b && !b.checked; }, { timeout: 5000 }, LEE);
  });

  await step('Recipient list is validated (not a list, too many, not an email)', async () => {
    const a = await api('PUT', '/recipients', { emails: 'x' });
    const b = await api('PUT', '/recipients', { emails: Array.from({ length: 11 }, (_, i) => 'a' + i + '@example.invalid') });
    const c = await api('PUT', '/recipients', { emails: ['not an email'] });
    assert([a, b, c].every(x => x.status === 400), [a, b, c].map(x => x.status).join());
    assert((await db.query('SELECT COUNT(*)::int AS n FROM portal_recipients WHERE project_id=$1', [projectId])).rows[0].n === 1, 'list changed');
  });

  // ── One email per batch ───────────────────────────────────────────────────
  const small = crypto.randomBytes(5000), xssName = '<img src=x onerror=alert(1)>.pdf';
  let samMail, ownerMail;

  await step('Files + answers make ONE email each for you and Sam (not Lee), after a quiet spell', async () => {
    await upload('Signed release.pdf', small, 'u-script');
    await upload(xssName, crypto.randomBytes(300));
    assert((await respond('u-cast', 'approved')).ok, 'respond 1');
    assert((await respond('u-cast', 'changes_requested', 'Second choice <script>x</script>\nfor the lead')).ok, 'respond 2 (replaces 1)');
    assert((await respond('u-script', 'approved', 'Looks great')).ok, 'respond 3');
    await sleep(1200);
    assert(mails().length === 0, 'sent before the quiet spell was over');
    await until(() => mails().length >= 2, 15000, 'emails');
    await sleep(1500);
    const m = mails();
    assert(m.length === 2, 'emails: ' + m.map(x => x.to).join());
    ownerMail = m.find(x => x.to === EMAIL); samMail = m.find(x => x.to === SAM);
    assert(ownerMail && samMail, 'recipients ' + m.map(x => x.to).join());
    assert(ownerMail.subject === 'Notify Test: 2 files, 1 approval and 1 change request from Acme', ownerMail.subject);
  });

  await step('Email shows files (with item), answers (latest only), escapes client text', async () => {
    const h = samMail.html;
    assert(h.includes('Signed release.pdf') && h.includes('for &ldquo;Approve script&rdquo;'), 'file + item');
    assert(h.includes('&lt;img src=x onerror=alert(1)&gt;.pdf') && !h.includes('<img src=x'), 'filename not escaped');
    assert(h.includes('Pat &lt;b&gt;Client&lt;/b&gt;') && !h.includes('<b>Client'), 'uploader name not escaped');
    assert(h.includes('Second choice &lt;script&gt;') && !h.includes('<script>'), 'note not escaped');
    assert((h.match(/Changes requested/g) || []).length === 1 && (h.match(/>Approved</g) || []).length === 1, 'replaced answer included');
    assert(/deleted 14 days after they arrive/.test(h), 'retention line');
    assert(/added you to the emails for Notify Test/.test(h) && !/Open Slater/.test(h), 'Sam footer');
    assert(/Open Slater/.test(ownerMail.html) && !/added you/.test(ownerMail.html), 'owner footer');
    assert(ownerMail.html.includes('to mark approved items complete and see every file your client has sent.'), 'owner footer wording (approvals)');
    assert(links(h).length === 2 && links(ownerMail.html).length === 2, 'two download links each');
    assert(links(h).every(l => !links(ownerMail.html).includes(l)), 'links not per recipient');
    assert(links(h).every(l => l.startsWith(BASE + '/f/')), 'link base');
  });

  await step('Everything in the batch is marked notified (nothing sent twice)', async () => {
    const f = await fileRows();
    const r = (await db.query('SELECT notified_at FROM portal_responses WHERE project_id=$1', [projectId])).rows;
    assert(f.every(x => x.notified_at) && r.every(x => x.notified_at), 'unmarked rows');
    await sleep(2500);
    assert(mails().length === 2, 'sent again');
  });

  // ── Download links ────────────────────────────────────────────────────────
  await step("Sam's link downloads the file (attachment) and records him as the downloader", async () => {
    const link = links(samMail.html)[0];
    const r = await fetch(link, { redirect: 'manual' });
    assert(r.status === 302, 'status ' + r.status);
    const loc = r.headers.get('location');
    assert(loc.startsWith(fakeS3.url + '/' + BUCKET + '/portal/') && /response-content-disposition=attachment/.test(loc), loc.slice(0, 120));
    const got = Buffer.from(await (await fetch(loc)).arrayBuffer());
    assert(md5(got) === md5(small), 'bytes differ');
    const row = (await fileRows()).find(x => x.filename === 'Signed release.pdf');
    assert(row.downloaded_by === 'Sam Producer' && row.downloaded_at, JSON.stringify([row.downloaded_by, row.downloaded_at]));
  });

  await step('The owner downloading later keeps "Sam" as the first downloader; the panel says so', async () => {
    const r = await fetch(links(ownerMail.html)[0], { redirect: 'manual' });
    assert(r.status === 302, 'status ' + r.status);
    const row = (await fileRows()).find(x => x.filename === 'Signed release.pdf');
    assert(row.downloaded_by === 'Sam Producer', row.downloaded_by);
    await page.evaluate(() => PortalAdmin.onProjectLoaded());
    await page.waitForFunction(() => /Downloaded by Sam Producer/.test(document.getElementById('portal-admin').textContent), { timeout: 5000 });
  });

  await step('Changed, swapped or made-up links get the "expired" page', async () => {
    const [a, b] = links(samMail.html);
    const flip = a.slice(0, -1) + (a.slice(-1) === 'A' ? 'B' : 'A');
    const ta = a.split('/f/')[1], tb = b.split('/f/')[1];
    const swapped = BASE + '/f/' + ta.split('.')[0] + '.' + tb.split('.')[1]; // file A's id, file B's signature
    const statuses = [];
    for (const u of [flip, swapped, BASE + '/f/nope', BASE + '/f/' + 'x'.repeat(40) + '.' + 'y'.repeat(32)]) statuses.push((await fetch(u, { redirect: 'manual' })).status);
    assert(statuses.every(s => s === 404), statuses.join());
  });

  await step('A link stops working once the file is deleted or expires', async () => {
    const rows = await fileRows();
    const xssRow = rows.find(x => x.filename === xssName);
    const del = await api('DELETE', '/files/' + xssRow.id);
    assert(del.status === 200, 'delete ' + del.status);
    const xssLink = links(samMail.html)[1]; // files are listed in the order they arrived
    assert((await fetch(xssLink, { redirect: 'manual' })).status === 404, 'deleted file still downloads');
    const rel2 = rows.find(x => x.filename === 'Signed release.pdf');
    await db.query(`UPDATE portal_files SET expires_at = NOW() - INTERVAL '1 second' WHERE id=$1`, [rel2.id]);
    assert((await fetch(links(samMail.html)[0], { redirect: 'manual' })).status === 404, 'expired file still downloads');
  });

  // ── The sweep ─────────────────────────────────────────────────────────────
  await step('Sweep deletes expired files and abandoned uploads (storage + rows)', async () => {
    await until(async () => (await fileRows()).length === 0, 8000, 'expired file swept');
    // An abandoned upload from yesterday.
    const s = await (await call('POST', '/uploads', { filename: 'never-finished.mov', size: 100, name: 'Pat' })).json();
    const row = (await fileRows()).find(x => x.id === s.id);
    assert(fake.mpus.size === 1 && row.upload_id, 'setup');
    await db.query(`UPDATE portal_files SET created_at = NOW() - INTERVAL '25 hours' WHERE id=$1`, [s.id]);
    await until(async () => (await fileRows()).length === 0 && fake.mpus.size === 0, 8000, 'abandoned upload swept');
    const objectsLeft = [...fake.objects.keys()].filter(k => k.startsWith('portal/' + projectId + '/'));
    assert(objectsLeft.length === 0, 'objects left: ' + objectsLeft.length);
  });

  // ── What doesn't get mailed ───────────────────────────────────────────────
  await step('An answer you already handled in Slater is not emailed', async () => {
    const before = mails().length;
    assert((await respond('u-cast', 'approved', 'ok now')).ok, 'respond');
    await db.query('UPDATE portal_responses SET acknowledged_at = NOW() WHERE project_id=$1 AND acknowledged_at IS NULL', [projectId]);
    await until(async () => (await db.query('SELECT COUNT(*)::int AS n FROM portal_responses WHERE project_id=$1 AND notified_at IS NULL', [projectId])).rows[0].n === 0, 10000, 'claimed');
    await sleep(1000);
    assert(mails().length === before, 'emailed anyway');
  });

  await step('Someone removed from Key Personnel stops getting emails, even if still ticked', async () => {
    const d = (await db.query('SELECT data FROM projects WHERE id=$1', [projectId])).rows[0].data;
    d.kp_cards = d.kp_cards.filter(k => k.email !== SAM);
    await db.query('UPDATE projects SET data=$1 WHERE id=$2', [d, projectId]);
    await db.query('INSERT INTO portal_recipients (project_id, owner_id, email) VALUES ($1,$2,$3)', [projectId, userId, 'stranger@example.invalid']);
    const before = mails().length;
    assert((await respond('u-script', 'changes_requested', 'one more thing')).ok, 'respond');
    await until(() => mails().length > before, 15000, 'email');
    await sleep(1500);
    const sent = mails().slice(before).map(x => x.to);
    assert(sent.length === 1 && sent[0] === EMAIL, 'sent to ' + sent.join());
    const last = mails().pop();
    assert(/1 change request from Acme/.test(last.subject), 'subject');
    assert(last.html.includes('to review the requested changes and see every file your client has sent.'), 'owner footer wording (change requests only)');
  });

  await step('Files-only email tells the owner just to see the files', async () => {
    const { buildEmail } = require(APP + '/routes/portalNotify');
    const e = buildEmail({
      project: { title: 'T' }, client: 'Acme', responses: [], who: 'o', toOwner: true, ownerName: 'Jo',
      files: [{ id: 1, r2_key: 'k', filename: 'a.pdf', size_bytes: 10, uploaded_by_name: 'Pat', item: '', expires_at: new Date(Date.now() + 864e5).toISOString() }],
    });
    assert(e.html.includes('Open Slater</a> to see every file your client has sent for this project.'), 'files-only wording');
    assert(!/mark approved|requested changes/.test(e.html), 'mentions answers that are not there');
  });

  await step('Download link tokens never reach the server log', async () => {
    const tokens = links(samMail.html).concat(links(ownerMail.html)).map(l => l.split('/f/')[1]);
    assert(tokens.every(t => !serverLog.includes(t)), 'token logged');
    assert(/GET \/f\/\[token\]/.test(serverLog), 'link requests not logged at all?');
    assert(!serverLog.includes(TOKEN), 'portal token logged');
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  if (/Error|failed/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error|failed/i.test(l)).slice(0, 20).join('\n'));
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { fakeS3.close(); } catch (_) {}
  try { for (const id of userIds) { await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  try { fs.unlinkSync(MAIL); } catch (_) {}
  if (consoleErrors.length) console.log('\nBrowser errors:\n  ' + consoleErrors.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
