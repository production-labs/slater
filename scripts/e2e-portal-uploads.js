// End-to-end test: Client Portal file uploads (V1.5 step 6b).
// Client sends files from the portal page; bytes go browser -> storage in
// parts (presigned URLs), never through the app server.
//
// R2 is replaced by a small fake S3 server in this process (multipart upload,
// CORS, ETag), so this runs without real credentials. It does NOT check
// signatures: do one real-R2 run before going live (see the plan doc).
//
// LOCAL DATABASE ONLY. Creates temporary users and deletes them afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-portal-uploads.js
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3989, BASE = 'http://localhost:' + PORT;
const S3_PORT = 3988, S3 = 'http://localhost:' + S3_PORT, BUCKET = 'slater-e2e';
const TMP = '/tmp/cv2-e2e/uploads';
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const GiB = 1024 ** 3;
let server, browser, s3server, passed = 0;
const userIds = [], fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/up-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end) { if (await fn()) return; await sleep(100); }
  throw new Error('timed out waiting for ' + (what || 'condition'));
}
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

// ── Fake S3 (scripts/e2e-fake-s3.js) ─────────────────────────────────────────
const fakeS3 = require("./e2e-fake-s3").create(S3_PORT, BUCKET);
const fake = fakeS3.state;
function startFakeS3() { s3server = fakeS3.server; return fakeS3.listen(); }

async function main() {
  await startFakeS3();
  const PASS = 'e2e-pass-' + STAMP;
  const EMAIL = 'portalup-e2e-' + STAMP + '@example.invalid';
  const OTHER = 'portalup-e2e-other-' + STAMP + '@example.invalid';
  const hash = await bcrypt.hash(PASS, 10);
  const mkUser = async (email, name) => { const id = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, [email, hash, name])).rows[0].id; userIds.push(id); return id; };
  const userId = await mkUser(EMAIL, 'Uploads Tester');
  await mkUser(OTHER, 'Other Producer');
  const rel = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const wb = (uuid, item, extra) => Object.assign({ uuid, item, owner: 'Client', mode: 'manual', manual_date: rel(3), status: 'Not Started', internal: false }, extra || {});
  const mkProject = async (key, title, more) => (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [key, title, Object.assign({ project_title: title, client_company: 'Acme' }, more || {}), userId])).rows[0].id;
  const KEY = 'cs_up_' + STAMP;
  const projectId = await mkProject(KEY, 'Uploads Test', {
    wb_items: [wb('u-release', 'Return talent releases'), wb('u-secret', 'Internal legal check', { internal: true })],
  });
  const lockedId = await mkProject('cs_up_locked_' + STAMP, 'Locked Uploads');
  const TOKEN = crypto.randomBytes(32).toString('base64url');
  const LOCKED = crypto.randomBytes(32).toString('base64url');
  await db.query('INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)', [projectId, userId, TOKEN]);
  await db.query('INSERT INTO portals (project_id, owner_id, token, password_hash) VALUES ($1,$2,$3,$4)', [lockedId, userId, LOCKED, await bcrypt.hash('secret-pw', 10)]);

  const rows = async (pid) => (await db.query('SELECT * FROM portal_files WHERE project_id=$1 ORDER BY id', [pid || projectId])).rows;
  const call = (method, p, body, token) => fetch(BASE + '/api/portal/' + (token || TOKEN) + p, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const payload = async () => (await fetch(BASE + '/api/portal/' + TOKEN)).json();
  // Whole upload over the API, the way the page does it (for the edge cases).
  async function apiUpload(filename, bytes, declared) {
    const start = await call('POST', '/uploads', { filename, size: declared || bytes.length, name: 'Api Tester' });
    const s = await start.json();
    if (!start.ok) return { status: start.status, body: s };
    const parts = [];
    for (let n = 1; n <= s.parts; n++) {
      const urls = (await (await call('POST', '/uploads/' + s.id + '/parts', { parts: [n] })).json()).urls;
      const chunk = bytes.subarray((n - 1) * s.part_bytes, n === s.parts ? bytes.length : n * s.part_bytes);
      const put = await fetch(urls[n], { method: 'PUT', body: chunk });
      parts.push({ part: n, etag: put.headers.get('etag') });
    }
    const done = await call('POST', '/uploads/' + s.id + '/complete', { parts });
    return { status: done.status, body: await done.json(), id: s.id };
  }

  const small = path.join(TMP, 'Script notes v2.txt');
  const big = path.join(TMP, 'b-roll selects.mov');
  fs.writeFileSync(small, crypto.randomBytes(12 * 1024));
  fs.writeFileSync(big, crypto.randomBytes(40 * 1024 * 1024)); // 3 parts of 16 MiB

  const env = Object.assign({}, process.env, {
    PORT: String(PORT), PORTAL_JOBS: "off",
    R2_TRANSFER_ENDPOINT: S3, R2_TRANSFER_BUCKET: BUCKET,
    R2_TRANSFER_ACCESS_KEY_ID: 'e2e-key', R2_TRANSFER_SECRET_ACCESS_KEY: 'e2e-secret',
  });
  server = spawn('node', ['server.js'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  // ── Setup and gatekeeping ─────────────────────────────────────────────────
  await step('Portal says uploads are on (5 GiB, 14 days); nothing sent yet', async () => {
    const p = await payload();
    assert(p.uploads && p.uploads.enabled === true, JSON.stringify(p.uploads));
    assert(p.uploads.max_bytes === 5 * GiB && p.uploads.keep_days === 14, JSON.stringify(p.uploads));
    assert(Array.isArray(p.sent) && p.sent.length === 0, 'sent not empty');
  });

  await step('Without R2 settings the portal hides uploads', async () => {
    const saved = ['R2_TRANSFER_ENDPOINT', 'R2_TRANSFER_BUCKET', 'R2_TRANSFER_ACCESS_KEY_ID', 'R2_TRANSFER_SECRET_ACCESS_KEY'].map(k => [k, process.env[k]]);
    saved.forEach(([k]) => delete process.env[k]);
    try {
      const { buildPayload } = require(APP + '/routes/portal');
      const p = buildPayload({ data: {}, label: 'x' }, {});
      assert(p.uploads.enabled === false && p.sent.length === 0, JSON.stringify(p.uploads));
    } finally { saved.forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; }); }
  });

  await step('Portal page allows the storage address (and only it) for uploads', async () => {
    const csp = (await fetch(BASE + '/portal/' + TOKEN)).headers.get('content-security-policy');
    const connect = csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src'));
    assert(connect === "connect-src 'self' " + S3, connect);
  });

  await step('Start is refused: no name, empty, over 5 GiB, bad filename, fractional size', async () => {
    const r = await Promise.all([
      call('POST', '/uploads', { filename: 'a.mov', size: 10 }),
      call('POST', '/uploads', { filename: 'a.mov', size: 0, name: 'Pat' }),
      call('POST', '/uploads', { filename: 'a.mov', size: 5 * GiB + 1, name: 'Pat' }),
      call('POST', '/uploads', { filename: '\u0000\u0001', size: 10, name: 'Pat' }),
      call('POST', '/uploads', { filename: 'a.mov', size: 10.5, name: 'Pat' }),
    ]);
    assert(r.map(x => x.status).join() === '400,400,413,400,400', r.map(x => x.status).join());
    assert((await rows()).length === 0, 'rows were created');
    assert(fake.mpus.size === 0, 'storage uploads were started');
  });

  await step('Unknown link = 404; password portal without the password = 401', async () => {
    const a = await call('POST', '/uploads', { filename: 'a.mov', size: 10, name: 'Pat' }, 'x'.repeat(43));
    const b = await call('POST', '/uploads', { filename: 'a.mov', size: 10, name: 'Pat' }, LOCKED);
    assert(a.status === 404 && b.status === 401, a.status + ',' + b.status);
  });

  // ── The page ──────────────────────────────────────────────────────────────
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1200, height: 900 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/portal/' + TOKEN, { waitUntil: 'networkidle0' });

  await step('Page shows "Send files" with the size and keep-days note', async () => {
    await page.waitForSelector('.files .drop', { timeout: 5000 });
    const t = await page.$eval('.files', n => n.textContent);
    assert(/Send files to your producer/.test(t) && /5 GB per file/.test(t) && /kept 14 days/.test(t), t.slice(0, 200));
    assert(/WeTransfer or Frame\.io/.test(t), 'no big-file advice');
  });

  await step('Choosing files without a name asks for the name, sends nothing', async () => {
    await page.$eval('.drop-name', n => { n.value = ''; });
    const input = await page.$('.drop .drop-input');
    await input.uploadFile(small);
    await page.waitForFunction(() => /add your name/.test(document.querySelector('.drop-wrap .err').textContent), { timeout: 3000 });
    assert((await page.$$('.up-row')).length === 0, 'rows appeared');
    assert((await rows()).length === 0, 'db rows created');
  });

  await step('Sends two files (one in 3 parts) straight to storage; both show "Sent"', async () => {
    await page.type('.drop-name', 'Pat Client');
    const putsBefore = fake.log.filter(l => l.method === 'PUT').length;
    const input = await page.$('.drop .drop-input');
    await input.uploadFile(small, big);
    await page.waitForFunction(() => document.querySelectorAll('.up-row.sent').length === 2, { timeout: 30000 });
    const puts = fake.log.filter(l => l.method === 'PUT').slice(putsBefore);
    assert(puts.length === 4, 'expected 4 part uploads, got ' + puts.length);
    assert(puts.every(l => l.origin === BASE), 'parts did not come from the browser');
    assert(!/^PUT /m.test(serverLog), 'app server received a PUT');
  });

  await step('Stored files are byte-for-byte what was chosen', async () => {
    const r = await rows();
    assert(r.length === 2 && r.every(x => x.status === 'ready'), JSON.stringify(r.map(x => x.status)));
    const want = { 'Script notes v2.txt': fs.readFileSync(small), 'b-roll selects.mov': fs.readFileSync(big) };
    for (const x of r) {
      const stored = fake.objects.get(x.r2_key);
      assert(stored && md5(stored) === md5(want[x.filename]), 'content differs for ' + x.filename);
      assert(Number(x.size_bytes) === want[x.filename].length, 'size wrong for ' + x.filename);
    }
  });

  await step('Rows: uploader name, 14-day expiry from completion, upload id cleared', async () => {
    for (const x of await rows()) {
      assert(x.uploaded_by_name === 'Pat Client', x.uploaded_by_name);
      assert(x.upload_id === null, 'upload_id kept');
      const days = (new Date(x.expires_at) - new Date(x.ready_at)) / 864e5;
      assert(Math.abs(days - 14) < 0.01, 'expiry ' + days + ' days');
      assert(/^portal\/\d+\/[0-9a-f-]{36}$/.test(x.r2_key) && !x.r2_key.includes('Script'), 'key ' + x.r2_key);
    }
  });

  await step('Storage links are path-style, signed, with no checksum the browser cannot send', async () => {
    const put = fake.log.find(l => l.method === 'PUT');
    assert(put.path.startsWith('/' + BUCKET + '/portal/'), put.path);
    assert(/X-Amz-Signature=/.test(put.query) && /X-Amz-Expires=3600/.test(put.query), put.query.slice(0, 120));
    assert(!/checksum/i.test(put.query), 'checksum in signed URL: ' + put.query);
  });

  await step('"You sent" lists both on the page and after a reload (no download links)', async () => {
    assert((await page.$$('.sent-row')).length === 2, 'live list');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.sent-row', { timeout: 5000 });
    const names = await page.$$eval('.sent-row .sent-name', ns => ns.map(n => n.textContent));
    assert(names.length === 2 && names.includes('b-roll selects.mov') && names.includes('Script notes v2.txt'), names.join());
    const meta = await page.$eval('.sent', n => n.textContent);
    assert(/40 MB/.test(meta) && /Pat Client/.test(meta), meta);
    assert((await page.$$('.sent a')).length === 0, 'download link on client side');
    const p = await payload();
    assert(p.sent.every(f => JSON.stringify(Object.keys(f).sort()) === '["at","by","item","name","size"]'), 'sent keys ' + JSON.stringify(p.sent[0]));
    assert(!/portal\/\d+\/|r2_key|upload_id|X-Amz/.test(JSON.stringify(p)), 'storage details in the payload');
    assert(await page.$eval('.drop-name', n => n.value) === 'Pat Client', 'name not remembered');
  });

  await step('Cancel mid-upload: row shows Cancelled; storage upload aborted; no db row', async () => {
    fake.putDelayMs = 4000;
    const before = (await rows()).length;
    const input = await page.$('.drop .drop-input');
    await input.uploadFile(big);
    await until(() => fake.mpus.size === 1 && fake.log.some(l => l.method === 'OPTIONS' || l.method === 'PUT'), 8000, 'upload to start');
    await until(async () => (await rows()).length === before + 1, 5000, 'pending row');
    await page.click('.up-row:last-child .up-cancel');
    await page.waitForFunction(() => document.querySelector('.up-row:last-child').classList.contains('cancelled'), { timeout: 5000 });
    await until(async () => (await rows()).length === before && fake.mpus.size === 0, 8000, 'cleanup after cancel');
    fake.putDelayMs = 0;
  });

  await step('Storage hiding the ETag (bucket CORS wrong): clear message, nothing left behind', async () => {
    fake.exposeEtag = false;
    const before = (await rows()).length;
    const input = await page.$('.drop .drop-input');
    await input.uploadFile(small);
    await page.waitForFunction(() => { const r = document.querySelector('.up-row:last-child'); return r && r.classList.contains('failed'); }, { timeout: 10000 });
    const msg = await page.$eval('.up-row:last-child .up-status', n => n.textContent);
    assert(/couldn't reach our file storage/.test(msg), msg);
    await until(async () => (await rows()).length === before && fake.mpus.size === 0, 5000, 'cleanup after failure');
    fake.exposeEtag = true;
  });

  // ── API edge cases ────────────────────────────────────────────────────────
  await step('A file bigger than declared is rejected and deleted', async () => {
    const before = (await rows()).length;
    const objectsBefore = fake.objects.size;
    const r = await apiUpload('sneaky.bin', crypto.randomBytes(2000), 10);
    assert(r.status === 400 && r.body.error === 'size_mismatch', r.status + ' ' + JSON.stringify(r.body));
    assert((await rows()).length === before, 'row kept');
    assert(fake.objects.size === objectsBefore, 'stored object kept');
  });

  await step('Part numbers outside the file, or a wrong part list, are refused', async () => {
    const s = await (await call('POST', '/uploads', { filename: 'x.bin', size: 100, name: 'Pat' })).json();
    const a = await call('POST', '/uploads/' + s.id + '/parts', { parts: [2] });
    const b = await call('POST', '/uploads/' + s.id + '/parts', { parts: [] });
    const c = await call('POST', '/uploads/' + s.id + '/parts', { parts: Array.from({ length: 51 }, () => 1) });
    const d = await call('POST', '/uploads/' + s.id + '/complete', { parts: [] });
    const e = await call('POST', '/uploads/' + s.id + '/complete', { parts: [{ part: 2, etag: '"x"' }] });
    assert([a, b, c, d, e].every(x => x.status === 400), [a, b, c, d, e].map(x => x.status).join());
    assert((await call('DELETE', '/uploads/' + s.id)).ok, 'cancel failed');
  });

  await step("Another project's upload can't be touched through this link", async () => {
    const other = (await db.query(
      `INSERT INTO portal_files (project_id, owner_id, filename, size_bytes, r2_key, upload_id, uploaded_by_name)
       VALUES ($1,$2,'theirs.mov',100,$3,'mpu-x','Them') RETURNING id`, [lockedId, userId, 'portal/' + lockedId + '/' + crypto.randomUUID()])).rows[0].id;
    const a = await call('POST', '/uploads/' + other + '/parts', { parts: [1] });
    const b = await call('POST', '/uploads/' + other + '/complete', { parts: [{ part: 1, etag: '"x"' }] });
    const c = await call('DELETE', '/uploads/' + other);
    assert(a.status === 404 && b.status === 404 && c.status === 404, [a, b, c].map(x => x.status).join());
    assert((await rows(lockedId)).length === 1, 'their row was removed');
  });

  await step('Filenames: no paths or hidden direction characters; shown as text, not HTML', async () => {
    const r1 = await apiUpload('../../etc/pass‮wd.txt', crypto.randomBytes(50));
    const r2 = await apiUpload('<img src=x onerror="window.__xss=1">.png', crypto.randomBytes(50));
    assert(r1.status === 200 && r2.status === 200, r1.status + ',' + r2.status);
    const names = (await rows()).map(x => x.filename);
    assert(names.includes('.._.._etc_passwd.txt'), names.join(' | '));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.sent-row', { timeout: 5000 });
    const shown = await page.$$eval('.sent-row .sent-name', ns => ns.map(n => n.textContent));
    assert(shown.includes('<img src=x onerror="window.__xss=1">.png'), shown.join(' | '));
    assert(!(await page.evaluate(() => window.__xss)), 'filename ran as HTML');
  });

  await step('A project holding 50 GiB takes no more; expired files leave "You sent"', async () => {
    const ids = [];
    for (let i = 0; i < 10; i++) {
      ids.push((await db.query(
        `INSERT INTO portal_files (project_id, owner_id, filename, size_bytes, r2_key, status, ready_at)
         VALUES ($1,$2,$3,$4,$5,'ready',NOW()) RETURNING id`,
        [projectId, userId, 'filler' + i + '.mov', 5 * GiB, 'portal/' + projectId + '/' + crypto.randomUUID()])).rows[0].id);
    }
    const full = await call('POST', '/uploads', { filename: 'one-more.mov', size: 1, name: 'Pat' });
    assert(full.status === 409 && (await full.json()).error === 'project_full', 'status ' + full.status);
    await db.query(`UPDATE portal_files SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = ANY($1)`, [ids]);
    const p = await payload();
    assert(!p.sent.some(f => /^filler/.test(f.name)), 'expired files listed');
    const ok = await call('POST', '/uploads', { filename: 'one-more.mov', size: 1, name: 'Pat' });
    assert(ok.ok, 'expired files still count toward the cap: ' + ok.status);
    await call('DELETE', '/uploads/' + (await ok.json()).id);
    await db.query('DELETE FROM portal_files WHERE id = ANY($1)', [ids]);
  });

  await step('Retrying "complete" on a finished upload is harmless', async () => {
    const r = await apiUpload('again.txt', crypto.randomBytes(30));
    assert(r.status === 200, 'first ' + r.status);
    const again = await call('POST', '/uploads/' + r.id + '/complete', { parts: [{ part: 1, etag: '"whatever"' }] });
    assert(again.ok, 'retry ' + again.status);
  });

  // ── Files for a "Waiting on you" item ─────────────────────────────────────
  await step('Sending for an item that is not waiting (internal, unknown) is refused', async () => {
    const a = await call('POST', '/uploads', { filename: 'a.pdf', size: 10, name: 'Pat', item: 'u-secret' });
    const b = await call('POST', '/uploads', { filename: 'a.pdf', size: 10, name: 'Pat', item: 'nope' });
    assert(a.status === 409 && b.status === 409, a.status + ',' + b.status);
  });

  await step('Client sends a file from the waiting item; it is tagged to that item', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.action-send-files', { timeout: 5000 });
    const sentBefore = (await page.$$('.up-row.sent')).length;
    const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 3000 }), page.click('.action-send-files')]);
    await chooser.accept([small]);
    await page.waitForFunction(n => document.querySelectorAll('.up-row.sent').length === n + 1, { timeout: 15000 }, sentBefore);
    const forLine = await page.$eval('.up-row.sent:last-child .up-for', n => n.textContent);
    assert(forLine === 'For "Return talent releases"', forLine);
    const note = await page.$eval('.action-files-count', n => n.textContent);
    assert(/You sent 1 file for this/.test(note), note);
    const r = (await rows()).filter(x => x.wb_item_uuid === 'u-release');
    assert(r.length === 1 && r[0].status === 'ready' && r[0].filename === 'Script notes v2.txt', JSON.stringify(r));
  });

  await step('After a reload the item still says what was sent; "You sent" names the item', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.action-files-count', { timeout: 5000 });
    assert(/You sent 1 file for this/.test(await page.$eval('.action-files-count', n => n.textContent)), 'count lost');
    const fors = await page.$$eval('.sent-for', ns => ns.map(n => n.textContent));
    assert(fors.length === 1 && fors[0] === 'For "Return talent releases"', JSON.stringify(fors));
    const p = await payload();
    assert(p.waiting.length === 1 && p.waiting[0].files === 1, JSON.stringify(p.waiting));
    assert(!JSON.stringify(p.sent).includes('u-release'), 'item uuid in sent list');
  });

  await page.screenshot({ path: SHOTS + '/up-portal.png', fullPage: true });

  // ── Producer side ─────────────────────────────────────────────────────────
  const loginCookie = async (email) => {
    const r = await fetch(BASE + '/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
    // Read the whole reply: express-session finishes saving the session just
    // before the last byte, so using the cookie on headers alone can race.
    await r.text();
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const ready = async () => (await rows()).filter(x => x.status === 'ready');
  const pctx = await browser.createBrowserContext();
  const ppage = await pctx.newPage(); global.__page = ppage;
  await ppage.setViewport({ width: 1500, height: 1000 });
  ppage.on('console', m => { if (m.type() === 'error') consoleErrors.push('producer: ' + m.text()); });
  ppage.on('pageerror', e => consoleErrors.push('producer pageerror: ' + e.message));
  const DL = path.join(TMP, 'dl-' + STAMP);
  fs.mkdirSync(DL, { recursive: true });
  const bcdp = await browser.target().createCDPSession();
  await bcdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: pctx.id });
  await ppage.goto(BASE + '/login');
  const login = await ppage.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await ppage.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await ppage.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await ppage.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
  await ppage.evaluate(() => st('portal'));
  const panelText = () => ppage.$eval('#portal-admin', el => el.textContent);
  const fileCard = (name) => ppage.evaluateHandle(n => [...document.querySelectorAll('#portal-admin .pa-file')].find(c => c.querySelector('.pa-file-name').textContent === n), name);

  await step('Project tab lists every file: name, sender, New, 14-day countdown, item', async () => {
    const n = (await ready()).length;
    await ppage.waitForFunction(c => document.querySelectorAll('#portal-admin .pa-file').length === c && document.getElementById('portal-admin').textContent.includes(c + ' new'), { timeout: 8000 }, n);
    assert((await ppage.$$('#portal-admin .pa-file')).length === n, 'card count');
    const t = await panelText();
    assert(/b-roll selects\.mov/.test(t) && /40 MB/.test(t) && /Pat Client/.test(t), t.slice(0, 300));
    assert(/Deletes in 14 days/.test(t), 'countdown: ' + (t.match(/Deletes[^·]*/) || [''])[0]);
    assert((await ppage.$$('#portal-admin .pa-file-tag.new')).length === n, 'not all New');
    assert(t.includes('For “Return talent releases”'), 'item line missing');
    await ppage.$eval('#portal-admin', el => el.scrollIntoView());
    await ppage.screenshot({ path: SHOTS + '/up-producer-panel.png' });
  });

  await step('Client-typed filenames show as text in the producer app', async () => {
    assert((await panelText()).includes('<img src=x onerror="window.__xss=1">.png'), 'not shown as text');
    assert(!(await ppage.$('#portal-admin .pa-file img')), 'img element injected');
    assert(!(await ppage.evaluate(() => window.__xss)), 'filename ran as code');
  });

  await step('Download saves the file under its own name, bytes intact; marks it Downloaded', async () => {
    const card = await fileCard('b-roll selects.mov');
    const link = await card.$('a[data-pa-file="download"]');
    await link.click();
    await until(() => fs.readdirSync(DL).some(f => f === 'b-roll selects.mov'), 15000, 'download to finish');
    assert(md5(fs.readFileSync(path.join(DL, 'b-roll selects.mov'))) === md5(fs.readFileSync(big)), 'downloaded bytes differ');
    const get = fake.log.filter(l => l.method === 'GET').pop();
    assert(/response-content-disposition=attachment/.test(get.query) && /X-Amz-Expires=300/.test(get.query), get.query.slice(0, 200));
    await ppage.waitForFunction(() => [...document.querySelectorAll('#portal-admin .pa-file')].some(c =>
      c.querySelector('.pa-file-name').textContent === 'b-roll selects.mov' && c.querySelector('.pa-file-tag.done')), { timeout: 5000 });
    const row = (await rows()).find(x => x.filename === 'b-roll selects.mov');
    assert(row.downloaded_at, 'downloaded_at not set');
    assert(ppage.url().startsWith(BASE), 'page navigated away: ' + ppage.url());
  });

  await step('Other producers and logged-out visitors get nothing', async () => {
    const id = (await ready())[0].id;
    const other = await loginCookie(OTHER);
    const a = await fetch(BASE + '/api/portal-admin/' + KEY + '/files/' + id + '/download', { headers: { cookie: other }, redirect: 'manual' });
    const b = await fetch(BASE + '/api/portal-admin/' + KEY + '/files/' + id, { method: 'DELETE', headers: { cookie: other } });
    const c = await fetch(BASE + '/api/portal-admin/' + KEY + '/files/' + id + '/download', { redirect: 'manual' });
    assert(a.status === 404 && b.status === 404 && c.status === 401, [a.status, b.status, c.status].join());
    assert((await ready()).some(x => x.id === id), 'file was deleted');
  });

  await step("The workback item's edit panel shows the files sent for it", async () => {
    await ppage.evaluate(() => st('workback'));
    await ppage.evaluate(() => wbSetView('list'));
    await sleep(200);
    await ppage.evaluate(() => wbSelectItem(wbItems.find(w => _wbData[w].uuid === 'u-release')));
    await ppage.waitForSelector('#wb-edit-panel .pa-file', { timeout: 3000 });
    const names = await ppage.$$eval('#wb-edit-panel .pa-file-name', ns => ns.map(n => n.textContent));
    assert(names.length === 1 && names[0] === 'Script notes v2.txt', JSON.stringify(names));
    await ppage.evaluate(() => st('portal'));
  });

  await step('Delete asks first, then removes the file everywhere', async () => {
    const victim = (await ready()).find(x => x.filename === 'again.txt');
    assert(victim && fake.objects.has(victim.r2_key), 'setup');
    await ppage.evaluate(() => [...document.querySelectorAll('#portal-admin .pa-file')]
      .find(c => c.querySelector('.pa-file-name').textContent === 'again.txt')
      .querySelector('[data-pa-file="delete"]').click());
    await ppage.waitForSelector('#modal-overlay.open', { timeout: 3000 });
    assert(/again\.txt/.test(await ppage.$eval('#modal-msg', n => n.textContent)), 'modal text');
    await ppage.click('#modal-ok');
    await ppage.waitForFunction(() => ![...document.querySelectorAll('#portal-admin .pa-file-name')].some(n => n.textContent === 'again.txt'), { timeout: 5000 });
    assert(!(await rows()).some(x => x.id === victim.id), 'row kept');
    assert(!fake.objects.has(victim.r2_key), 'object kept');
  });

  await step('Portal menu count = files not yet downloaded (+ open responses); a new arrival shows without reopening', async () => {
    const badge = () => ppage.$eval('.app-nav-item[data-tab="portal"]', b => { const x = b.querySelector('.pa-nav-badge'); return x ? x.textContent + '|' + x.title : ''; });
    const fresh = (await ready()).filter(x => !x.downloaded_at).length;
    assert(fresh > 0, 'setup');
    assert((await badge()).startsWith(fresh + '|') && /new files?/.test(await badge()), 'badge ' + (await badge()) + ', want ' + fresh);
    const r = await apiUpload('late-arrival.txt', crypto.randomBytes(20));
    assert(r.status === 200, 'upload ' + r.status);
    await ppage.evaluate(() => PortalAdmin.poll(true));
    await ppage.waitForFunction(n => { const x = document.querySelector('.app-nav-item[data-tab="portal"] .pa-nav-badge'); return x && x.textContent === n; }, { timeout: 5000 }, String(fresh + 1));
    assert((await panelText()).includes('late-arrival.txt'), 'new file not in the panel');
  });

  await step('Expired files leave the list and can no longer be downloaded', async () => {
    const f = (await ready()).find(x => x.filename === '.._.._etc_passwd.txt');
    await db.query(`UPDATE portal_files SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [f.id]);
    await ppage.evaluate(() => PortalAdmin.onProjectLoaded());
    await ppage.waitForFunction(() => !document.getElementById('portal-admin').textContent.includes('etc_passwd'), { timeout: 5000 });
    const status = await ppage.evaluate(async u => (await fetch(u, { redirect: 'manual' })).status,
      '/api/portal-admin/' + KEY + '/files/' + f.id + '/download');
    assert(status === 404, 'status ' + status);
  });

  await step('An item hidden from the client is no longer named on the portal', async () => {
    const data = (await db.query('SELECT data FROM projects WHERE id=$1', [projectId])).rows[0].data;
    data.wb_items[0].internal = true;
    await db.query('UPDATE projects SET data=$1 WHERE id=$2', [data, projectId]);
    const p = await payload();
    assert(!JSON.stringify(p).includes('Return talent releases'), 'hidden item name still in the payload');
    assert(p.sent.some(f => f.name === 'Script notes v2.txt' && f.item === ''), 'file should stay, untagged');
  });
  if (/Error/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error/i.test(l)).join('\n'));
  if (serverLog.includes(TOKEN)) { fails.push('token in server log'); console.log('  FAIL portal token appeared in the server log'); }
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (s3server) s3server.close(); } catch (_) {}
  try { for (const id of userIds) { await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  // 'unsafe header "ETag"' is the browser's own message in the bucket-CORS-wrong step.
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409|401|400|413|unsafe header "ETag"/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
