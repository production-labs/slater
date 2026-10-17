// End-to-end browser test for the contacts cutover switch (data-model-rewrite,
// Session 8): CONTACTS_V2_CUTOVER = off / on, routes/cutover.js, and how an
// open tab behaves when the switch is flipped under it. LOCAL DATABASE ONLY.
//
// The test starts its own server and RESTARTS it with a different
// CONTACTS_V2_CUTOVER value, the way changing the Railway variable redeploys
// the app, while the same browser tab stays open. Creates a temporary user
// (and, for the safety-catch step, a temporary empty database) and deletes
// them after.
// Same one-time setup as the other browser tests:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-cutover.js
// Screenshots land in /tmp/cv2-e2e/shots (cut-*).
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3995, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'cute2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
const KEY = 'cs_cut_' + STAMP;
const EMPTY_DB = 'slater_cutover_e2e_' + STAMP;
let server, serverLog = '', browser, userId, passed = 0, page;
const fails = [], consoleErrors = [];
const requests = []; // { method, url, header } for every /api write from the page

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await page.screenshot({ path: SHOTS + '/cut-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(200); }
  throw new Error('timed out waiting for: ' + what + (last !== undefined ? ' (last: ' + JSON.stringify(last) + ')' : ''));
}

async function startServer(mode, extraEnv) {
  if (server) {
    const old = server; server = null;
    old.kill();
    await new Promise(r => old.once('exit', r));
  }
  serverLog = '';
  const env = Object.assign({}, process.env, { PORT: String(PORT), CONTACTS_V2_CUTOVER: mode }, extraEnv || {});
  server = spawn('node', ['server.js'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => { serverLog += d; });
  server.stderr.on('data', d => { serverLog += d; });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {}
    await sleep(250);
  }
  // The switch decides after a table check; wait for the config to answer.
  return (await (await fetch(BASE + '/slater-config.js')).text()).match(/"(\w+)"/)[1];
}

const serverTitle = async () => (await db.query(`SELECT data->>'project_title' t FROM projects WHERE key=$1`, [KEY])).rows[0].t;
const blob = async () => (await db.query('SELECT contacts FROM users WHERE id=$1', [userId])).rows[0].contacts || {};
const agencyCount = async () => (await db.query('SELECT COUNT(*)::int n FROM agencies WHERE user_id=$1', [userId])).rows[0].n;
const barText = p => p.evaluate(() => { const b = document.getElementById('conn-bar'); return b && b.classList.contains('show') ? b.textContent : ''; });
const pendingTitles = p => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('slater_pending_saves') || '{}')).map(e => e.data && e.data.project_title));

function watch(p) {
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|409/.test(m.text())) consoleErrors.push(m.text()); });
  p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  p.on('dialog', d => d.accept().catch(() => {}));
  p.on('request', r => {
    if (r.url().indexOf(BASE + '/api/') === 0 && r.method() !== 'GET') requests.push({ method: r.method(), url: r.url().slice(BASE.length), header: r.headers()['x-slater-contacts'] || '' });
  });
}
async function openProject(p, query) {
  if (p.url().indexOf(BASE) !== 0) await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); // localStorage needs Slater's origin
  await p.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await p.goto(BASE + '/' + (query || ''), { waitUntil: 'networkidle2' });
  await p.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
  await sleep(400);
}
async function setTitle(p, t) {
  await p.evaluate(t => { const e = document.getElementById('project_title'); e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })); autosaveNow(); }, t);
}
async function setCrewName(p, name) {
  await p.evaluate(n => {
    const e = document.getElementById(crew[0] + '_name');
    e.value = n; e.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
}
async function clickBarButton(p, label) {
  const ok = await p.evaluate(l => { const b = [...document.querySelectorAll('#conn-bar button')].find(x => x.textContent === l); if (b) b.click(); return !!b; }, label);
  assert(ok, 'no "' + label + '" button in the bar');
}
// Page fetch through Slater's own wrapper (adds the screens header).
const pageFetch = (p, method, url, body) => p.evaluate(async (m, u, b) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}, method, url, body);

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(
    `INSERT INTO users (email, password_hash, name, contacts) VALUES ($1,$2,'Cutover Tester',$3) RETURNING id`,
    [EMAIL, hash, JSON.stringify({ crew: [{ name: 'Old Blob Person', phone: '', email: '', position: 'Gaffer' }] })])).rows[0].id;
  await db.query(`INSERT INTO agencies (user_id, name, is_default) VALUES ($1,'Blob Agency',true)`, [userId]);
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Cutover Test',$2,$3)`, [KEY, JSON.stringify({
    project_title: 'Original', project_type: 'location_shoot', savedAt: 1000,
    crew: [{ name: 'Card Person', position: 'Gaffer', phone: '', email: '', status: 'tbd' }],
    talent: [], kp_cards: [], schedule_days: [{ date_iso: '2026-12-01', label: 'Day 1' }],
  }), userId]);

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });

  console.log('\nSwitch OFF (production until cutover day)');
  assert(await startServer('off') === 'off', 'server not in off mode');
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  watch(page);
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, pw) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);

  await step('?contacts=v2 does nothing: old Contacts opens, nothing remembered for this browser', async () => {
    await openProject(page, '?contacts=v2');
    assert(await page.evaluate(() => orgsV2On()) === false, 'orgsV2On() is true');
    assert(await page.evaluate(() => localStorage.getItem('slater_contacts_v2')) === null, 'per-browser flag was stored');
    await page.evaluate(() => openContacts());
    await until(() => page.$eval('#contacts-modal', e => e.classList.contains('open')), 'old Contacts modal');
    assert(!(await page.$('#contacts-v2-modal.open')), 'new Contacts opened');
    await page.evaluate(() => closeContacts());
  });

  await step('project saves work as today (sent as old screens) and the old name merge still runs', async () => {
    requests.length = 0;
    await setCrewName(page, 'Merged By Name');
    await setTitle(page, 'Off edit');
    await until(async () => await serverTitle() === 'Off edit', 'server title');
    const save = requests.find(r => r.url.indexOf('/api/projects/') === 0);
    assert(save && save.header === 'v1', 'project save header: ' + JSON.stringify(save));
    await until(async () => ((await blob()).crew || []).some(c => c.name === 'Merged By Name'), 'old blob got the card name (today\'s behavior)');
  });

  await step('new-model saves are refused while the switch is off', async () => {
    const r = await pageFetch(page, 'POST', '/api/v2/contacts', { name: 'Should Not Exist' });
    assert(r.status === 409 && r.body && r.body.error === 'reload_required', 'status ' + r.status + ' ' + JSON.stringify(r.body));
    const n = (await db.query(`SELECT COUNT(*)::int n FROM contacts WHERE owner_id=$1`, [userId])).rows[0].n;
    assert(n === 0, n + ' v2 contacts written');
  });
  // The pageFetch above set the "reload" state in this tab (it is a stale
  // screen for the v2 API). Start the next part from a clean load.
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  // Old contacts as they stand at "cutover" (the merge above changed them on purpose).
  const blobAtCutover = JSON.stringify(await blob());
  const agenciesAtCutover = await agencyCount();
  await openProject(page);

  console.log('\nFlip ON while this tab stays open (stale tab, runbook step 11.5)');
  assert(await startServer('on') === 'on', 'server not in on mode');
  // The v2 tables have nothing for this user yet; give them one person so the
  // new screen has something to show (the real migration does this).
  await db.query(`INSERT INTO contacts (owner_id, name) VALUES ($1,'Migrated Person')`, [userId]);

  await step('stale tab: its project save is refused, the bar says to reload, the edit is kept, nothing old-format saved', async () => {
    requests.length = 0;
    await setCrewName(page, 'Stale Tab Name');
    await setTitle(page, 'Edit in stale tab');
    await until(async () => /Slater has been updated/.test(await barText(page)), 'reload bar');
    assert(/kept and saved after the reload/.test(await barText(page)), 'bar text: ' + await barText(page));
    assert(await serverTitle() === 'Off edit', 'server title changed: ' + await serverTitle());
    assert((await pendingTitles(page)).includes('Edit in stale tab'), 'edit not queued: ' + JSON.stringify(await pendingTitles(page)));
    await until(() => page.$eval('#autosave-indicator', e => /Not saved yet/.test(e.textContent)), '"Not saved yet" badge');
    assert(JSON.stringify(await blob()) === blobAtCutover, 'old contacts blob changed');
    await page.screenshot({ path: SHOTS + '/cut-stale-tab.png' });
  });

  await step('stale tab: old Contacts / agency saves are refused too', async () => {
    const r1 = await pageFetch(page, 'PUT', '/api/users/me/contacts', { crew: [] });
    assert(r1.status === 409, 'contacts PUT ' + r1.status);
    const r2 = await pageFetch(page, 'POST', '/api/agencies', { name: 'New Old Agency' });
    assert(r2.status === 409, 'agency POST ' + r2.status);
    const r3 = await pageFetch(page, 'POST', '/api/agencies/1/set-default');
    assert(r3.status === 409, 'set-default ' + r3.status);
    assert(JSON.stringify(await blob()) === blobAtCutover, 'old contacts blob changed');
    assert(await agencyCount() === agenciesAtCutover, 'agencies changed');
  });

  await step('Reload: comes back on the new screens and the kept edit is saved, in the new format', async () => {
    requests.length = 0;
    await clickBarButton(page, 'Reload');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
    assert(await page.evaluate(() => orgsV2On()) === true, 'not on the new screens after reload');
    await until(async () => await serverTitle() === 'Edit in stale tab', 'kept edit reached the server');
    await until(async () => (await pendingTitles(page)).length === 0, 'queue emptied');
    await until(async () => !/Slater has been updated/.test(await barText(page)), 'reload bar gone');
    assert(requests.filter(r => r.url.indexOf('/api/projects/') === 0).every(r => r.header === 'v2'), 'saves not marked v2: ' + JSON.stringify(requests));
    assert(await page.$eval('#project_title', e => e.value) === 'Edit in stale tab', 'form shows ' + await page.$eval('#project_title', e => e.value));
  });

  console.log('\nSwitch ON (after cutover)');
  await step('?contacts=v1 is ignored: the new Contacts screen opens with the migrated people', async () => {
    await openProject(page, '?contacts=v1');
    assert(await page.evaluate(() => orgsV2On() && ContactsV2.enabled()) === true, 'not on the new screens');
    await page.evaluate(() => openContacts());
    await until(() => page.$('#contacts-v2-modal.open'), 'new Contacts');
    await until(() => page.$eval('#contacts-v2-modal', e => /Migrated Person/.test(e.textContent)), 'migrated person listed');
    assert(!(await page.$eval('#contacts-modal', e => e.classList.contains('open'))), 'old Contacts modal open too');
    await page.screenshot({ path: SHOTS + '/cut-on-contacts.png' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const m = document.getElementById('contacts-v2-modal'); if (m) m.classList.remove('open'); });
  });

  await step('Agencies button opens Contacts > Organizations, never the old Agency Manager', async () => {
    await page.evaluate(() => openAgencyManager());
    await until(() => page.$('#contacts-v2-modal.open'), 'new Contacts');
    assert(!(await page.$eval('#agency-manager-modal', e => e.classList.contains('open'))), 'old agency manager opened');
    await page.evaluate(() => { const m = document.getElementById('contacts-v2-modal'); if (m) m.classList.remove('open'); });
  });

  await step('no old contacts traffic: load + edits + saves never touch the old blob', async () => {
    requests.length = 0;
    await openProject(page);
    await setCrewName(page, 'Never Copied');
    await setTitle(page, 'On edit');
    await until(async () => await serverTitle() === 'On edit', 'server title');
    await sleep(1500);
    const old = requests.filter(r => /\/api\/(users\/me\/contacts|contacts|agencies)/.test(r.url));
    assert(old.length === 0, 'old writes sent: ' + JSON.stringify(old));
    assert(JSON.stringify(await blob()) === blobAtCutover, 'old contacts blob changed');
    assert(!((await blob()).crew || []).some(c => c.name === 'Never Copied'), 'name copied into the blob');
  });

  await step('a second, fresh tab on the switch: also new screens, saves fine', async () => {
    const p2 = await browser.newPage();
    try {
      watch(p2);
      await openProject(p2);
      assert(await p2.evaluate(() => orgsV2On()) === true, 'second tab not on new screens');
      await setTitle(p2, 'Second tab edit');
      await until(async () => await serverTitle() === 'Second tab edit', 'server title');
      assert(await barText(p2) === '', 'bar showing: ' + await barText(p2));
    } finally { await p2.close(); }
  });

  console.log('\nFlip back OFF (the rollback in docs/CUTOVER.md)');
  await openProject(page);
  assert(await startServer('off') === 'off', 'server not back in off mode');
  await step('tab from the ON period: its saves are refused until it reloads, then it is on the old screens and its edit is saved', async () => {
    await setTitle(page, 'Edit before rollback reload');
    await until(async () => /Slater has been updated/.test(await barText(page)), 'reload bar');
    assert(await serverTitle() === 'Second tab edit', 'server title changed: ' + await serverTitle());
    await clickBarButton(page, 'Reload');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
    assert(await page.evaluate(() => orgsV2On()) === false, 'still on the new screens');
    await until(async () => await serverTitle() === 'Edit before rollback reload', 'kept edit saved after reload');
  });

  console.log('\nSafety catch');
  await step('switch ON but the new tables are missing: server stays OFF and says so loudly', async () => {
    await db.query(`CREATE DATABASE ${EMPTY_DB}`);
    const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + EMPTY_DB;
    const mode = await startServer('on', { DATABASE_URL: u.toString() });
    assert(mode === 'off', 'mode ' + mode);
    await until(() => /NEW TABLES ARE NOT IN THIS DATABASE/.test(serverLog), 'loud error in the server log');
  });

  console.log(consoleErrors.length ? '\nConsole errors:\n  ' + consoleErrors.join('\n  ') : '\nNo console errors.');
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try {
    if (userId) {
      await db.query('DELETE FROM receipts WHERE owner_id=$1', [userId]);
      await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]);
      await db.query('DELETE FROM agencies WHERE user_id=$1', [userId]);
      await db.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, ['%"userId":' + userId + ',%']);
      await db.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    await sleep(500);
    await db.query(`DROP DATABASE IF EXISTS ${EMPTY_DB}`);
  } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  console.log('\n' + passed + ' passed, ' + fails.length + ' failed' + (fails.length ? ':\n  ' + fails.join('\n  ') : ''));
  process.exit(fails.length ? 1 : 0);
});
