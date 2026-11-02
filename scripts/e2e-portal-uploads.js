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

// ── Fake S3 (just what the app + browser use) ───────────────────────────────
const fake = { mpus: new Map(), objects: new Map(), log: [], exposeEtag: true, putDelayMs: 0 };
function xml(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/xml' }); res.end('<?xml version="1.0" encoding="UTF-8"?>' + body); }
function startFakeS3() {
  s3server = http.createServer((req, res) => {
    const u = new URL(req.url, S3);
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (fake.exposeEtag) res.setHeader('Access-Control-Expose-Headers', 'ETag');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'PUT');
      if (req.headers['access-control-request-headers']) res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
      res.writeHead(204); return res.end();
    }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const prefix = '/' + BUCKET + '/';
      const key = u.pathname.startsWith(prefix) ? decodeURIComponent(u.pathname.slice(prefix.length)) : null;
      fake.log.push({ method: req.method, path: u.pathname, query: u.search, origin: origin || '', bytes: body.length });
      if (!key) return xml(res, 400, '<Error><Code>InvalidBucketName</Code></Error>');
      const q = u.searchParams;
      if (req.method === 'POST' && q.has('uploads')) {
        const id = 'mpu-' + crypto.randomBytes(8).toString('hex');
        fake.mpus.set(id, { key, parts: new Map(), contentType: req.headers['content-type'] });
        return xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${BUCKET}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (req.method === 'PUT' && q.has('partNumber')) {
        const mpu = fake.mpus.get(q.get('uploadId'));
        if (!mpu || mpu.key !== key) return xml(res, 404, '<Error><Code>NoSuchUpload</Code></Error>');
        if (fake.putDelayMs) await sleep(fake.putDelayMs);
        const etag = '"' + md5(body) + '"';
        mpu.parts.set(Number(q.get('partNumber')), { body, etag });
        res.writeHead(200, { ETag: etag }); return res.end();
      }
      if (req.method === 'POST' && q.has('uploadId')) {
        const mpu = fake.mpus.get(q.get('uploadId'));
        if (!mpu || mpu.key !== key) return xml(res, 404, '<Error><Code>NoSuchUpload</Code></Error>');
        const text = body.toString();
        const listed = [...text.matchAll(/<PartNumber>(\d+)<\/PartNumber>\s*<ETag>([^<]*)<\/ETag>|<ETag>([^<]*)<\/ETag>\s*<PartNumber>(\d+)<\/PartNumber>/g)]
          .map(m => ({ n: Number(m[1] || m[4]), etag: (m[2] || m[3]).replace(/&quot;/g, '"') }));
        for (const p of listed) {
          const have = mpu.parts.get(p.n);
          if (!have || have.etag !== p.etag) return xml(res, 400, '<Error><Code>InvalidPart</Code></Error>');
        }
        fake.objects.set(key, Buffer.concat(listed.sort((a, b) => a.n - b.n).map(p => mpu.parts.get(p.n).body)));
        fake.mpus.delete(q.get('uploadId'));
        return xml(res, 200, `<CompleteMultipartUploadResult><Bucket>${BUCKET}</Bucket><Key>${key}</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`);
      }
      if (req.method === 'DELETE' && q.has('uploadId')) { fake.mpus.delete(q.get('uploadId')); res.writeHead(204); return res.end(); }
      if (req.method === 'DELETE') { fake.objects.delete(key); res.writeHead(204); return res.end(); }
      if (req.method === 'HEAD') {
        const o = fake.objects.get(key);
        res.writeHead(o ? 200 : 404, o ? { 'Content-Length': o.length } : {}); return res.end();
      }
      if (req.method === 'GET') {
        const o = fake.objects.get(key);
        if (!o) return xml(res, 404, '<Error><Code>NoSuchKey</Code></Error>');
        res.writeHead(200, { 'Content-Length': o.length }); return res.end(o);
      }
      xml(res, 405, '<Error><Code>MethodNotAllowed</Code></Error>');
    });
  });
  return new Promise(r => s3server.listen(S3_PORT, r));
}

async function main() {
  await startFakeS3();
  const hash = await bcrypt.hash('e2e-pass-' + STAMP, 10);
  const mkUser = async (email, name) => { const id = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, [email, hash, name])).rows[0].id; userIds.push(id); return id; };
  const userId = await mkUser('portalup-e2e-' + STAMP + '@example.invalid', 'Uploads Tester');
  const mkProject = async (key, title) => (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [key, title, { project_title: title, client_company: 'Acme' }, userId])).rows[0].id;
  const projectId = await mkProject('cs_up_' + STAMP, 'Uploads Test');
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
    PORT: String(PORT),
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
    const input = await page.$('.drop-input');
    await input.uploadFile(small);
    await page.waitForFunction(() => /add your name/.test(document.querySelector('.drop-wrap .err').textContent), { timeout: 3000 });
    assert((await page.$$('.up-row')).length === 0, 'rows appeared');
    assert((await rows()).length === 0, 'db rows created');
  });

  await step('Sends two files (one in 3 parts) straight to storage; both show "Sent"', async () => {
    await page.type('.drop-name', 'Pat Client');
    const putsBefore = fake.log.filter(l => l.method === 'PUT').length;
    const input = await page.$('.drop-input');
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
    assert(p.sent.every(f => JSON.stringify(Object.keys(f).sort()) === '["at","by","name","size"]'), 'sent keys ' + JSON.stringify(p.sent[0]));
    assert(!/portal\/\d+\/|r2_key|upload_id|X-Amz/.test(JSON.stringify(p)), 'storage details in the payload');
    assert(await page.$eval('.drop-name', n => n.value) === 'Pat Client', 'name not remembered');
  });

  await step('Cancel mid-upload: row shows Cancelled; storage upload aborted; no db row', async () => {
    fake.putDelayMs = 4000;
    const before = (await rows()).length;
    const input = await page.$('.drop-input');
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
    const input = await page.$('.drop-input');
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

  await page.screenshot({ path: SHOTS + '/up-portal.png', fullPage: true });
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
