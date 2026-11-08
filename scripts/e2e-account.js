// End-to-end test: My Info > Download my data, and Delete account
// (routes/account.js, public/account.js), plus the admin delete that shares it.
// Storage is the stand-in from scripts/e2e-fake-s3.js; emails go to a file.
//
// LOCAL DATABASE ONLY. Creates temporary users and deletes them afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-account.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3984, BASE = 'http://localhost:' + PORT;
const S3_PORT = 3983, BUCKET = 'slater-e2e';
const SHOTS = '/tmp/cv2-e2e/shots', DL = '/tmp/cv2-e2e/acct-dl', UNZ = '/tmp/cv2-e2e/acct-unzip';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const MAIL = '/tmp/cv2-e2e/acct-mail-' + STAMP + '.jsonl';
const fakeS3 = require('./e2e-fake-s3').create(S3_PORT, BUCKET);
const fake = fakeS3.state;
let server, browser, passed = 0, serverLog = '';
const userIds = [], licenseIds = [], fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/acct-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mails = () => (fs.existsSync(MAIL) ? fs.readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const count = async (sql, args) => (await db.query(sql, args)).rows[0].n;
// A tiny real JPEG-ish payload (bytes are what matter, not the picture).
const RECEIPT_BYTES = crypto.randomBytes(900);
const RECEIPT = 'data:image/jpeg;base64,' + RECEIPT_BYTES.toString('base64');

async function mkLicense(key) {
  const id = (await db.query(`INSERT INTO licenses (key, plan, max_devices) VALUES ($1,'beta',3) RETURNING id`, [key])).rows[0].id;
  licenseIds.push(id); return id;
}
async function mkUser(email, name, pass, licenseId, licenseKey) {
  const id = (await db.query(`INSERT INTO users (email, password_hash, name, license_id, license_key) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, await bcrypt.hash(pass, 4), name, licenseId, licenseKey])).rows[0].id;
  userIds.push(id); return id;
}
// Everything a user owns, by table. Used to prove a delete is complete.
async function footprint(userId) {
  const out = {};
  for (const t of ['projects', 'receipts', 'contacts', 'organizations', 'locations', 'roles', 'portals', 'portal_files', 'portal_updates', 'portal_responses', 'portal_recipients', 'deleted_records']) {
    out[t] = await count(`SELECT COUNT(*)::int AS n FROM ${t} WHERE owner_id=$1`, [userId]);
  }
  out.users = await count('SELECT COUNT(*)::int AS n FROM users WHERE id=$1', [userId]);
  out.sessions = await count("SELECT COUNT(*)::int AS n FROM sessions WHERE sess::jsonb->>'userId' = $1::text", [userId]);
  out.reset_tokens = await count('SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id=$1', [userId]);
  return out;
}
const empty = f => Object.values(f).every(n => n === 0);

// A user with one of everything: project (portal, update, responses, files in
// storage incl. an unfinished upload, receipt), contact with a built-in and a
// custom role, organization, location, reset token.
async function seed(userId, label) {
  const KEY = 'cs_acct_' + label + '_' + STAMP;
  const data = {
    project_title: label + ' Summit Shoot', project_type: 'location_shoot', client_company: 'Acme', billing_code: '=1+1',
    kickoff_date_iso: '2026-11-01', schedule_days: [{ id: 'sday_1', date_iso: '2026-12-02', label: 'Shoot Day' }],
    wb_items: [{ uuid: 'u-script', item: 'Approve script', owner: 'Client', mode: 'manual', manual_date: '2026-11-20', status: 'Not Started' }],
    crew: [{ id: 1, name: 'Pat Grip', position: 'Grip' }],
    expenses: [
      { date: '2026-11-03', vendor: 'Gas & Go, "North"', cat: 'Fuel', amount: 54.5, reimbursable: true, paid_by: 'Me', receipt: '' },
      { date: '2026-11-04', vendor: 'Lunch', cat: 'Meals', amount: '12.25', reimbursable: false, paid_by: '', receipt: '' },
    ],
  };
  const projectId = (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [KEY, data.project_title, data, userId])).rows[0].id;
  await db.query('INSERT INTO receipts (project_key, expense_index, image_data, owner_id) VALUES ($1,0,$2,$3)', [KEY, RECEIPT, userId]);
  await db.query('INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)', [projectId, userId, crypto.randomBytes(32).toString('base64url')]);
  await db.query(`INSERT INTO portal_updates (project_id, owner_id, author_name, body) VALUES ($1,$2,'Jo','Shoot is confirmed')`, [projectId, userId]);
  await db.query(`INSERT INTO portal_responses (project_id, owner_id, wb_item_uuid, kind, responder_name, note) VALUES ($1,$2,'u-script','changes_requested','Pat Client','Shorter intro please')`, [projectId, userId]);
  const readyKey = 'portal/' + projectId + '/' + label + '-ready', pendKey = 'portal/' + projectId + '/' + label + '-pending';
  fake.objects.set(readyKey, crypto.randomBytes(200));
  const mpu = 'mpu-' + label + '-' + STAMP;
  fake.mpus.set(mpu, { key: pendKey, parts: new Map() });
  await db.query(`INSERT INTO portal_files (project_id, owner_id, filename, content_type, size_bytes, r2_key, uploaded_by_name, status, ready_at, expires_at)
                  VALUES ($1,$2,'Logo pack.zip','application/zip',200,$3,'Pat Client','ready',NOW(),NOW() + INTERVAL '14 days')`, [projectId, userId, readyKey]);
  await db.query(`INSERT INTO portal_files (project_id, owner_id, filename, content_type, size_bytes, r2_key, uploaded_by_name, status, upload_id, expires_at)
                  VALUES ($1,$2,'Big.mov','video/quicktime',9000,$3,'Pat Client','pending',$4,NOW() + INTERVAL '14 days')`, [projectId, userId, pendKey, mpu]);
  const orgId = (await db.query(`INSERT INTO organizations (owner_id, name, is_agency, website) VALUES ($1,$2,false,'acme.example') RETURNING id`, [userId, label + ' Acme Corp'])).rows[0].id;
  const contactId = (await db.query(`INSERT INTO contacts (owner_id, organization_id, name, email, notes) VALUES ($1,$2,$3,'pat@example.invalid','Line one\nLine "two"') RETURNING id`,
    [userId, orgId, '=HYPERLINK("http://evil.example","' + label + ' Pat")'])).rows[0].id;
  const builtIn = (await db.query(`SELECT id, name FROM roles WHERE owner_id IS NULL ORDER BY id LIMIT 1`)).rows[0];
  const custom = (await db.query(`INSERT INTO roles (owner_id, name, category) VALUES ($1,$2,'crew') RETURNING id, name`, [userId, label + ' Drone Wrangler'])).rows[0];
  await db.query('INSERT INTO contact_roles (contact_id, role_id, sort_order) VALUES ($1,$2,0),($1,$3,1)', [contactId, builtIn.id, custom.id]);
  await db.query(`INSERT INTO locations (owner_id, name, city, hospital) VALUES ($1,$2,'Tacoma','St. Joseph')`, [userId, label + ' Stage 4']);
  await db.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,NOW() + INTERVAL '1 hour')`, [userId, crypto.randomBytes(16).toString('hex')]);
  return { KEY, projectId, readyKey, pendKey, mpu, builtIn, custom };
}

async function signIn(ctx, email, pass) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const s = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, email, pass);
  assert(s === 200, 'login ' + s);
  return page;
}
const csvRows = file => {
  const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  // Small CSV reader (quotes, doubled quotes, newlines in cells).
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

async function main() {
  await fakeS3.listen();
  const PASS = 'e2e-pass-' + STAMP;
  const A = 'acct-a-' + STAMP + '@example.invalid', B = 'acct-b-' + STAMP + '@example.invalid';
  const keyA = 'SLTR-E2EA-' + String(STAMP).slice(-8);
  const licA = await mkLicense(keyA);
  const licShared = await mkLicense('SLTR-E2ES-' + String(STAMP).slice(-8));
  const userA = await mkUser(A, 'Alex Producer', PASS, licA, keyA);
  const userB = await mkUser(B, 'Blake Other', PASS, licShared, 'SLTR-E2ES-' + String(STAMP).slice(-8));
  const a = await seed(userA, 'A');
  const b = await seed(userB, 'B');

  server = spawn('node', ['server.js'], {
    cwd: APP, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APP_URL: BASE, PORTAL_EMAIL_LOG: MAIL, PORTAL_JOBS_INTERVAL_MS: '600000',
      R2_TRANSFER_ENDPOINT: fakeS3.url, R2_TRANSFER_BUCKET: BUCKET,
      R2_TRANSFER_ACCESS_KEY_ID: 'e2e-key', R2_TRANSFER_SECRET_ACCESS_KEY: 'e2e-secret',
    }),
  });
  server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctxA = await browser.createBrowserContext();
  const page = await signIn(ctxA, A, PASS); global.__page = page;
  await page.evaluate(k => { localStorage.setItem('slater_last_project', k); localStorage.setItem('slater_wb_templates', JSON.stringify([{ name: 'My template', items: [] }])); }, a.KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => currentSheetKey === k && window.ContactsV2 && ContactsV2.store.loaded, { timeout: 15000 }, a.KEY);
  // A second signed-in device for A: it must be signed out by the delete too.
  const ctxA2 = await browser.createBrowserContext();
  const page2 = await signIn(ctxA2, A, PASS);

  // ── Download my data ──────────────────────────────────────────────────────
  let files = {};
  await step('My Info has "Your data": Download my data builds a .zip', async () => {
    await page.evaluate(() => openMyInfo());
    await page.waitForSelector('#acct-export-btn', { visible: true });
    fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
    await page.click('#acct-export-btn');
    await page.waitForFunction(() => /Downloaded:/.test(document.getElementById('acct-export-status').textContent), { timeout: 15000 });
    let zipName; for (let i = 0; i < 40 && !zipName; i++) { zipName = fs.readdirSync(DL).find(f => f.endsWith('.zip')); if (!zipName) await sleep(250); }
    assert(zipName && /^Slater_My_Data_\d{4}-\d{2}-\d{2}\.zip$/.test(zipName), 'zip ' + zipName);
    fs.rmSync(UNZ, { recursive: true, force: true }); fs.mkdirSync(UNZ, { recursive: true });
    execFileSync('unzip', ['-q', path.join(DL, zipName), '-d', UNZ]);
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(UNZ, path.join(d, e.name))]);
    for (const f of walk(UNZ)) files[f] = path.join(UNZ, f);
    for (const f of ['README.txt', 'Slater_Backup.json', 'contacts.csv', 'organizations.csv', 'locations.csv', 'projects.csv', 'expenses.csv', 'client-responses.csv', 'account.json']) assert(files[f], 'missing ' + f + ' in ' + Object.keys(files).join());
    const status = await page.$eval('#acct-export-status', el => el.textContent);
    assert(/1 project, 1 person, 1 receipt\./.test(status), status);
    await page.$eval('.acct-sec', el => el.scrollIntoView());
    await page.screenshot({ path: SHOTS + '/acct-myinfo.png' });
  });

  await step('Backup file is the same as "Export backup" and has only this user\'s data', async () => {
    const j = JSON.parse(fs.readFileSync(files['Slater_Backup.json'], 'utf8'));
    assert(j.version === 1 && Object.keys(j.projects).join() === a.KEY, 'projects ' + Object.keys(j.projects).join());
    assert(j.projects[a.KEY].expenses[0].receipt === RECEIPT, 'receipt merged into backup');
    assert(j.contacts_v2.contacts.length === 1 && /A Pat/.test(j.contacts_v2.contacts[0].name), 'contacts');
    assert(j.templates.length === 1 && j.templates[0].name === 'My template', 'templates from the browser');
    assert(!JSON.stringify(j).includes('B Summit') && !JSON.stringify(j).includes('B Acme'), "other user's data leaked");
  });

  await step('Spreadsheets: contacts with role names + organization, formulas defused, quotes and newlines intact', async () => {
    const c = csvRows(files['contacts.csv']);
    assert(c[0][0] === 'Name' && c[0][1] === 'Roles' && c.length === 2, JSON.stringify(c).slice(0, 200));
    const [name, roles, org, , , , , , , , , , , , notes] = c[1];
    assert(name.startsWith("'=HYPERLINK"), 'formula not defused: ' + name);
    assert(roles === a.builtIn.name + '; ' + a.custom.name, 'roles ' + roles);
    assert(org === 'A Acme Corp', 'org ' + org);
    assert(notes === 'Line one\nLine "two"', 'notes ' + JSON.stringify(notes));
    const o = csvRows(files['organizations.csv']), l = csvRows(files['locations.csv']), p = csvRows(files['projects.csv']);
    assert(o[1][0] === 'A Acme Corp' && o[1][1] === 'Client' && o[1][2] === 'acme.example', JSON.stringify(o[1]));
    assert(l[1][0] === 'A Stage 4' && l[1][6] === 'St. Joseph', JSON.stringify(l[1]));
    assert(p[1][0] === 'A Summit Shoot' && p[1][1] === 'Location Shoot' && p[1][4] === "'=1+1" && p[1][7] === '2026-12-02' && p[1][13] === '66.75', JSON.stringify(p[1]));
  });

  await step('Expenses list every expense; the receipt is a real file with the original bytes', async () => {
    const e = csvRows(files['expenses.csv']);
    assert(e.length === 3, 'rows ' + e.length);
    assert(e[1][2] === 'Gas & Go, "North"' && e[1][4] === '54.5' && e[1][5] === 'Yes', JSON.stringify(e[1]));
    const rf = e[1][7];
    assert(/^receipts\/A Summit Shoot\/01 2026-11-03 Gas & Go, North\.jpg$/.test(rf), 'receipt path ' + rf);
    assert(fs.readFileSync(files[rf]).equals(RECEIPT_BYTES), 'receipt bytes differ');
    assert(e[2][7] === '' && e[2][5] === 'No', 'no-receipt row ' + JSON.stringify(e[2]));
  });

  await step('Portal history: client responses and producer updates are included', async () => {
    const r = csvRows(files['client-responses.csv']);
    assert(r[1][0] === 'A Summit Shoot' && r[1][1] === 'Approve script' && r[1][2] === 'Changes requested' && r[1][4] === 'Shorter intro please', JSON.stringify(r[1]));
    const acct = JSON.parse(fs.readFileSync(files['account.json'], 'utf8'));
    assert(acct.profile.email === A && acct.profile.name === 'Alex Producer' && !('password_hash' in acct.profile), 'profile ' + JSON.stringify(acct.profile));
    assert(acct.portal_updates.length === 1 && acct.portal_updates[0].body === 'Shoot is confirmed', 'updates');
    assert(acct.portal_files.length === 1 && acct.portal_files[0].filename === 'Logo pack.zip', 'files list (ready only)');
  });

  // ── Delete: refusals first ────────────────────────────────────────────────
  const del = (p, body) => p.evaluate(async b => {
    const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, body);

  await step('Delete account opens a confirm box; a wrong password deletes nothing', async () => {
    await page.click('#acct-del-open');
    await page.waitForSelector('#acct-del', { visible: true });
    await page.type('#acct-del-pw', 'not-my-password');
    await page.click('#acct-del-go');
    await page.waitForFunction(() => /password isn't right/.test(document.getElementById('acct-del-err').textContent), { timeout: 5000 });
    await page.screenshot({ path: SHOTS + '/acct-delete-box.png' });
    const f = await footprint(userA);
    assert(f.users === 1 && f.projects === 1 && f.portal_files === 2 && fake.objects.has(a.readyKey), JSON.stringify(f));
    assert((await del(page, {})).status === 400, 'no password should be 400');
  });

  await step('Storage down: refused with a clear message, the account and its data stay', async () => {
    fake.failDeletes = true;
    try {
      await page.$eval('#acct-del-pw', el => { el.value = ''; });
      await page.type('#acct-del-pw', PASS);
      await page.click('#acct-del-go');
      await page.waitForFunction(() => /couldn't reach file storage/.test(document.getElementById('acct-del-err').textContent), { timeout: 8000 });
    } finally { fake.failDeletes = false; }
    const f = await footprint(userA);
    assert(f.users === 1 && f.projects === 1 && f.portal_files === 2 && f.contacts === 1, JSON.stringify(f));
    assert(await count('SELECT COUNT(*)::int AS n FROM licenses WHERE id=$1', [licA]) === 1, 'license gone');
  });

  // ── Delete for real ───────────────────────────────────────────────────────
  await step('Correct password: everything of this user is deleted, storage cleaned, signed out, sent to login', async () => {
    await page.$eval('#acct-del-pw', el => { el.value = ''; });
    await page.type('#acct-del-pw', PASS);
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.click('#acct-del-go')]);
    assert(/\/login\?account_deleted=1$/.test(page.url()), 'url ' + page.url());
    await page.waitForSelector('#deleted-msg', { visible: true });
    await page.screenshot({ path: SHOTS + '/acct-login-after.png' });
    const f = await footprint(userA);
    assert(empty(f), 'left behind: ' + JSON.stringify(Object.fromEntries(Object.entries(f).filter(([, n]) => n))));
    assert(await count('SELECT COUNT(*)::int AS n FROM contact_roles WHERE role_id=$1', [a.custom.id]) === 0, 'contact_roles left');
    assert(!fake.objects.has(a.readyKey), 'stored file still there');
    assert(!fake.mpus.has(a.mpu), 'unfinished upload not aborted');
  });

  await step('Signed out on every device; this browser\'s Slater copies are cleared', async () => {
    const me1 = await page.evaluate(async () => (await fetch('/api/users/me')).status);
    const me2 = await page2.evaluate(async () => (await fetch('/api/users/me')).status);
    assert(me1 === 401 && me2 === 401, 'still signed in: ' + me1 + '/' + me2);
    const left = await page.evaluate(() => Object.keys(localStorage).filter(k => /^slater/i.test(k)));
    assert(left.length === 0, 'localStorage left: ' + left.join());
  });

  await step('License key is retired (can\'t register again); a confirmation email went out', async () => {
    assert(await count('SELECT COUNT(*)::int AS n FROM licenses WHERE id=$1', [licA]) === 0, 'license still there');
    const r = await fetch(BASE + '/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'again-' + STAMP + '@example.invalid', password: 'whatever123', license_key: keyA }) });
    assert(r.status === 400 && /Invalid license key/.test((await r.json()).error), 'register with old key: ' + r.status);
    await sleep(300);
    const m = mails().filter(x => x.to === A);
    assert(m.length === 1 && m[0].subject === 'Your Slater account has been deleted' && /Hi Alex,/.test(m[0].html), JSON.stringify(m.map(x => x.subject)));
  });

  await step("The other user's data, files and license are untouched", async () => {
    const f = await footprint(userB);
    assert(f.users === 1 && f.projects === 1 && f.receipts === 1 && f.contacts === 1 && f.portal_files === 2 && f.portal_responses === 1, JSON.stringify(f));
    assert(fake.objects.has(b.readyKey) && fake.mpus.has(b.mpu), "B's stored files touched");
    assert(await count('SELECT COUNT(*)::int AS n FROM licenses WHERE id=$1', [licShared]) === 1, "B's license gone");
  });

  // ── Shared license + admin delete (same routine) ──────────────────────────
  await step('Admin delete removes everything too (incl. storage), but keeps a license another account still uses', async () => {
    const C = 'acct-c-' + STAMP + '@example.invalid';
    const userC = await mkUser(C, 'Casey Shared', PASS, licShared, 'SLTR-E2ES-' + String(STAMP).slice(-8));
    const c = await seed(userC, 'C');
    const actx = await browser.createBrowserContext();
    const ap = await actx.newPage();
    await ap.goto(BASE + '/admin/login');
    const lg = await ap.evaluate(async s => (await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: s }) })).status, process.env.ADMIN_SECRET);
    assert(lg === 200, 'admin login ' + lg);
    fake.failDeletes = true;
    const refused = await ap.evaluate(async id => (await fetch('/api/admin/users/' + id, { method: 'DELETE' })).status, userC);
    fake.failDeletes = false;
    assert(refused === 503 && (await footprint(userC)).users === 1, 'storage-down admin delete: ' + refused);
    const ok = await ap.evaluate(async id => (await fetch('/api/admin/users/' + id, { method: 'DELETE' })).status, userC);
    assert(ok === 200, 'admin delete ' + ok);
    assert(empty(await footprint(userC)), 'admin delete left data');
    assert(!fake.objects.has(c.readyKey) && !fake.mpus.has(c.mpu), 'admin delete left stored files');
    assert(await count('SELECT COUNT(*)::int AS n FROM licenses WHERE id=$1', [licShared]) === 1, 'shared license deleted');
    const again = await ap.evaluate(async id => (await fetch('/api/admin/users/' + id, { method: 'DELETE' })).status, userC);
    assert(again === 404, 'second delete ' + again);
    await actx.close();
  });

  await step('Delete needs a signed-in user; export-extra too', async () => {
    const r1 = await fetch(BASE + '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"x"}' });
    const r2 = await fetch(BASE + '/api/account/export-extra');
    assert(r1.status === 401 && r2.status === 401, r1.status + '/' + r2.status);
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  if (/Error|failed/i.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error|failed/i.test(l)).slice(0, 20).join('\n'));
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { fakeS3.close(); } catch (_) {}
  try {
    for (const id of userIds) { await db.query('DELETE FROM receipts WHERE owner_id=$1', [id]); await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); }
    for (const id of licenseIds) await db.query('DELETE FROM licenses WHERE id=$1', [id]);
  } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  try { fs.unlinkSync(MAIL); } catch (_) {}
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409|401|400|403|503/.test(e));
  if (relevant.length) console.log('\nBrowser errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
