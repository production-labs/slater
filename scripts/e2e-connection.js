// End-to-end browser test for connection-drop handling (data-model-rewrite,
// Session 7): public/connection.js, the project save queue in app.js, and
// Contacts saves in contacts-v2.js. LOCAL DATABASE ONLY.
//
// Uses Chrome's real offline mode (page.setOfflineMode), so requests fail the
// way they do when Wi-Fi drops. Creates a temporary user and deletes it after.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-connection.js
// Screenshots land in /tmp/cv2-e2e/shots (conn-*).
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3994, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'conne2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
const KEY = 'cs_conn_' + STAMP;
let server, browser, userId, passed = 0, page;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await page.screenshot({ path: SHOTS + '/conn-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(200); }
  throw new Error('timed out waiting for: ' + what + (last !== undefined ? ' (last: ' + JSON.stringify(last) + ')' : ''));
}
const title = async () => (await db.query('SELECT data->>\'project_title\' t FROM projects WHERE key=$1', [KEY])).rows[0].t;

async function newPage(flagV2) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) consoleErrors.push(m.text()); });
  p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  p.on('dialog', d => { p.__dialogs = (p.__dialogs || []).concat(d.type()); d.dismiss().catch(() => {}); });
  await p.evaluate(() => 0).catch(() => {});
  await p.goto(BASE + '/' + (flagV2 ? '?contacts=v2' : '?contacts=v1'), { waitUntil: 'networkidle2' });
  return p;
}
async function openProject(p) {
  await p.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
  await sleep(300);
}
const barText = p => p.evaluate(() => { const b = document.getElementById('conn-bar'); return b && b.classList.contains('show') ? b.textContent : ''; });
// Queued project saves by project key (entries are stored per tab: "<key>::<tab>").
const pending = p => p.evaluate(() => { const raw = JSON.parse(localStorage.getItem('slater_pending_saves') || '{}'); const o = {}; Object.keys(raw).forEach(id => { o[raw[id].key || id] = raw[id]; }); return o; });
async function setTitle(p, t) {
  await p.evaluate(t => { const e = document.getElementById('project_title'); e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })); autosaveNow(); }, t);
}
async function clickBarButton(p, label) {
  const ok = await p.evaluate(l => { const b = [...document.querySelectorAll('#conn-bar button')].find(x => x.textContent === l); if (b) b.click(); return !!b; }, label);
  assert(ok, 'no "' + label + '" button in the bar');
}

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Conn Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Conn Test',$2,$3)`, [KEY, JSON.stringify({
    project_title: 'Original', project_type: 'location_shoot', savedAt: 1000,
    crew: [], talent: [], kp_cards: [], schedule_days: [{ date_iso: '2026-12-01', label: 'Day 1' }],
  }), userId]);

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, pw) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.close();
  page = await newPage(false);

  console.log('\nProjects');
  await step('online: no bar; a normal autosave reaches the server and says "Autosaved"', async () => {
    await openProject(page);
    assert(await barText(page) === '', 'bar showing while online: ' + await barText(page));
    await setTitle(page, 'Online edit');
    await until(async () => await title() === 'Online edit', 'server title');
    await until(() => page.$eval('#autosave-indicator', e => /Autosaved at/.test(e.textContent)), 'Autosaved badge');
  });

  await step('offline: bar says so, autosave says "Not saved yet", change kept on this device, server untouched', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await setTitle(page, 'Offline edit 1');
    await until(() => page.$eval('#autosave-indicator', e => /Not saved yet/.test(e.textContent)), '"Not saved yet" badge');
    const p = await pending(page);
    assert(p[KEY] && p[KEY].data.project_title === 'Offline edit 1', 'queued copy: ' + JSON.stringify(Object.keys(p)));
    assert(/Changes aren't saved yet/.test(await barText(page)), 'bar mentions unsaved changes');
    assert(await title() === 'Online edit', 'server unchanged');
    await page.screenshot({ path: SHOTS + '/conn-offline.png' });
    await page.setViewport({ width: 390, height: 844 });
    await sleep(300);
    await page.screenshot({ path: SHOTS + '/conn-offline-mobile.png' });
    const r = await page.evaluate(() => { const b = document.getElementById('conn-bar').getBoundingClientRect(); const n = document.getElementById('mobile-bottom-nav'); return { barBottom: b.bottom, navTop: n ? n.getBoundingClientRect().top : null }; });
    assert(r.navTop === null || r.barBottom <= r.navTop, 'panel overlaps the phone nav: ' + JSON.stringify(r));
    await page.setViewport({ width: 1400, height: 900 });
  });

  await step('back online: saved automatically, queue empty, "All changes saved"', async () => {
    await page.setOfflineMode(false);
    await until(async () => await title() === 'Offline edit 1', 'server got the offline edit');
    await until(async () => Object.keys(await pending(page)).length === 0, 'queue empty');
    await until(async () => /All changes saved/.test(await barText(page)), '"All changes saved"');
    await until(async () => await barText(page) === '', 'bar hides again', 8000);
  });

  await step('closing the tab with unsaved changes warns first', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await setTitle(page, 'Offline edit 2');
    await until(async () => (await pending(page))[KEY], 'queued');
    page.__dialogs = [];
    await page.close({ runBeforeUnload: true });
    await until(() => (page.__dialogs || []).includes('beforeunload'), 'beforeunload warning', 5000);
    assert(!page.isClosed(), 'page should still be open after dismissing the warning');
  });

  await step('tab closed while offline: the change is sent before the project loads next time', async () => {
    await page.close({ runBeforeUnload: false });
    assert(await title() === 'Offline edit 1', 'server still has the older copy');
    page = await newPage(false); // same browser profile: same localStorage
    await openProject(page);
    await until(async () => await title() === 'Offline edit 2', 'server got the edit from the closed tab');
    assert(await page.$eval('#project_title', e => e.value) === 'Offline edit 2', 'form shows the offline edit, not the older server copy');
    assert(Object.keys(await pending(page)).length === 0, 'queue empty');
  });

  await step('reload right after an edit (online): saved, no conflict question, nothing left queued', async () => {
    // Edit without the 10s autosave, then reload: only the unload save carries it.
    await page.evaluate(() => { const e = document.getElementById('project_title'); e.value = 'Reload edit'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await openProject(page);
    await until(async () => await title() === 'Reload edit', 'unload save reached the server');
    await until(async () => Object.keys(await pending(page)).length === 0, 'queue empty');
    await sleep(500);
    assert(!/changed on another device/.test(await barText(page)), 'false conflict: ' + await barText(page));
  });

  await step('server holds this device\'s EARLIER save while a later one is queued: sent, no conflict', async () => {
    // Close the current tab first, with its autosave off: otherwise its own
    // last-second save is a genuine "other tab" change and the question is right.
    await page.evaluate(() => { clearTimeout(_autosaveTimer); currentSheetKey = null; });
    await page.close({ runBeforeUnload: false });
    const t1 = Date.now() - 5000, t2 = Date.now() - 1000;
    await db.query(`UPDATE projects SET data = data || jsonb_build_object('project_title','Earlier mine','savedAt',$2::bigint) WHERE key=$1`, [KEY, t1]);
    const cur = (await db.query('SELECT data FROM projects WHERE key=$1', [KEY])).rows[0].data;
    // Plant the queue from the login page (the app isn't running there, so
    // nothing reacts to it until the app loads).
    const setup = await browser.newPage();
    await setup.goto(BASE + '/login');
    await setup.evaluate((k, d, t1, t2) => {
      const data = Object.assign({}, d, { project_title: 'Later mine', savedAt: t2 });
      localStorage.setItem('slater_pending_saves', JSON.stringify({ [k]: { label: 'Conn Test', data, at: t2, base: 1000, conflict: null, ours: [t1, t2] } }));
      localStorage.setItem('slater_last_project', k);
    }, KEY, cur, t1, t2);
    await setup.close();
    page = await newPage(false);
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
    try { await until(async () => await title() === 'Later mine', 'later copy sent'); }
    catch (e) { throw new Error(e.message + ' | ' + JSON.stringify(await page.evaluate(() => ({ q: localStorage.getItem('slater_pending_saves'), bar: (document.getElementById('conn-bar') || {}).textContent, online: SlaterConn.online, form: document.getElementById('project_title').value })))); }
    assert(!/changed on another device/.test(await barText(page)), 'false conflict: ' + await barText(page));
    assert(Object.keys(await pending(page)).length === 0, 'queue empty');
  });

  await step('changed on another device while offline: nothing overwritten, choice offered; "Use my version" wins', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await setTitle(page, 'Mine');
    await db.query(`UPDATE projects SET data = data || '{"project_title":"Theirs","savedAt":999999999999999}'::jsonb WHERE key=$1`, [KEY]);
    await page.setOfflineMode(false);
    await until(async () => /changed on another device/.test(await barText(page)), 'conflict notice');
    assert(await title() === 'Theirs', 'other device\'s version not overwritten');
    assert(/Conn Test|Mine/.test(await barText(page)), 'notice names the project');
    assert(!/All changes saved/.test(await barText(page)), 'must not claim everything is saved while a version is on hold');
    await page.screenshot({ path: SHOTS + '/conn-conflict.png' });
    await clickBarButton(page, 'Use my version');
    await until(async () => await title() === 'Mine', 'my version saved');
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
    assert(await page.$eval('#project_title', e => e.value) === 'Mine', 'form shows my version after reload');
    assert(Object.keys(await pending(page)).length === 0 && await barText(page) === '', 'queue empty, bar gone');
  });

  await step('"Keep the other version" drops my offline copy and shows theirs', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await setTitle(page, 'Mine 2');
    await db.query(`UPDATE projects SET data = data || '{"project_title":"Theirs 2","savedAt":999999999999999}'::jsonb WHERE key=$1`, [KEY]);
    await page.setOfflineMode(false);
    await until(async () => /changed on another device/.test(await barText(page)), 'conflict notice');
    await clickBarButton(page, 'Keep the other version');
    await sleep(500);
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY);
    assert(await page.$eval('#project_title', e => e.value) === 'Theirs 2', 'form shows the other version');
    assert(await title() === 'Theirs 2', 'server keeps the other version');
    assert(Object.keys(await pending(page)).length === 0, 'queue empty');
  });

  await step('two real tabs: "Use my version", then reloading the other tab keeps mine', async () => {
    const b = await newPage(false);
    await openProject(b);
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar in tab A');
    await setTitle(page, 'Mine (tab A)');
    await setTitle(b, 'Theirs (tab B)');
    await until(async () => await title() === 'Theirs (tab B)', 'tab B saved');
    await page.setOfflineMode(false);
    await until(async () => /changed on another device/.test(await barText(page)), 'conflict question in tab A');
    const reloaded = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    await clickBarButton(page, 'Use my version');
    await until(async () => await title() === 'Mine (tab A)', 'mine saved');
    await reloaded;
    await page.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY).catch(e => { throw new Error('tab A reload: ' + e.message); });
    // The bug John found: reloading the stale tab B saved "Theirs" back over it.
    await b.reload({ waitUntil: 'networkidle2' });
    await b.waitForFunction(k => typeof _formKey !== 'undefined' && _formKey === k, { timeout: 10000 }, KEY).catch(async e => { throw new Error('tab B reload: ' + e.message + ' ' + JSON.stringify(await b.evaluate(() => ({ fk: _formKey, ck: currentSheetKey, nav: _navigating })))); });
    await sleep(800);
    assert(await title() === 'Mine (tab A)', 'stale tab B saved over it: ' + await title());
    assert(await b.$eval('#project_title', e => e.value) === 'Mine (tab A)', 'tab B shows mine after reload');
    global.__tabB = b;
  });

  await step('a stale tab with no edits never saves over newer work when hidden', async () => {
    const b = global.__tabB;
    await setTitle(page, 'Newer from A');
    await until(async () => await title() === 'Newer from A', 'A saved');
    await b.evaluate(() => _safeUnloadAutosave()); // what hiding/closing tab B does
    await sleep(1000);
    assert(await title() === 'Newer from A', 'hidden stale tab saved over it: ' + await title());
  });

  await step('switching back to a stale tab shows the newer copy', async () => {
    const b = global.__tabB;
    assert(await b.$eval('#project_title', e => e.value) !== 'Newer from A', 'tab B should be stale before switching back');
    await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await until(() => b.$eval('#project_title', e => e.value === 'Newer from A'), 'tab B refreshed');
    assert(await title() === 'Newer from A', 'server unchanged');
    await b.close({ runBeforeUnload: false });
  });

  await step('server error while online: "Some changes aren\'t saved yet" + Try again', async () => {
    await page.setRequestInterception(true);
    const h = r => (r.method() === 'POST' && r.url().includes('/api/projects/')) ? r.respond({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.continue();
    page.on('request', h);
    await setTitle(page, 'After error');
    await until(async () => /aren't saved yet/.test(await barText(page)), 'error bar');
    assert(!/offline/i.test(await barText(page)), 'not called offline');
    page.off('request', h);
    await page.setRequestInterception(false);
    await clickBarButton(page, 'Try again');
    await until(async () => await title() === 'After error', 'saved on retry');
    await until(async () => Object.keys(await pending(page)).length === 0, 'queue empty');
  });

  await step('receipt photo upload that fails offline is kept and sent on reconnect', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.evaluate((k, i) => saveReceipts(k, [{ receipt: i }]), KEY, img);
    await until(() => page.evaluate(() => Object.keys(_pendingReceipts).length === 1), 'receipt kept');
    await page.setOfflineMode(false);
    await until(async () => (await db.query('SELECT COUNT(*)::int n FROM receipts WHERE project_key=$1', [KEY])).rows[0].n === 1, 'receipt on server');
    await until(() => page.evaluate(() => Object.keys(_pendingReceipts).length === 0), 'nothing left');
  });

  await step('logged out mid-edit: says so, keeps the change, sends it after logging back in', async () => {
    await db.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, ['%"userId":' + userId + ',%']);
    await setTitle(page, 'While logged out');
    await until(async () => /logged out/.test(await barText(page)), 'logged-out bar');
    assert((await pending(page))[KEY], 'change kept');
    assert(await title() === 'After error', 'not saved');
    assert(await page.evaluate(() => [...document.querySelectorAll('#conn-bar button')].some(b => b.textContent === 'Log in (new tab)')), 'Log in button');
    const st = await page.evaluate(async (e, pw) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })).status, EMAIL, PASS);
    assert(st === 200, 'relogin ' + st);
    // Logging in elsewhere (the bar's button opens a new tab) is noticed within ~5s; no reload needed.
    await until(async () => await title() === 'While logged out', 'sent after login', 20000);
    await until(async () => !/logged out/.test(await barText(page)), 'logged-out bar gone');
    assert(Object.keys(await pending(page)).length === 0, 'queue empty');
  });

  await step('logging out in ANOTHER tab: this tab still tries its save, says "logged out", keeps the change', async () => {
    const b = await newPage(false);
    await b.waitForFunction(() => typeof logout === 'function');
    await Promise.all([b.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), b.evaluate(() => logout())]);
    assert(/login/.test(b.url()), 'tab B went to the login page: ' + b.url());
    await setTitle(page, 'After logout elsewhere');
    await until(async () => /logged out/.test(await barText(page)), 'logged-out panel in tab A (John: no message at all)');
    assert((await pending(page))[KEY], 'change kept in the queue');
    const st = await page.evaluate(async (e, pw) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })).status, EMAIL, PASS);
    assert(st === 200, 'relogin ' + st);
    await until(async () => await title() === 'After logout elsewhere', 'sent after logging back in', 20000);
    await b.close({ runBeforeUnload: false });
  });

  await step('logging out with changes not yet sent asks first', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await setTitle(page, 'Unsent at logout');
    await until(async () => (await pending(page))[KEY], 'queued');
    await page.evaluate(() => logout());
    await page.waitForSelector('#modal-overlay.open', { visible: true, timeout: 5000 });
    const msg = await page.$eval('#modal-msg', e => e.textContent);
    assert(/haven't reached Slater yet/.test(msg), 'warning text: ' + msg);
    // "Stay logged in"
    await page.evaluate(() => document.querySelector('.modal-btns .lb:first-child').click());
    assert(/localhost:\d+\/\?/.test(page.url()) || !/login/.test(page.url()), 'still in the app');
    assert((await pending(page))[KEY], 'change still kept');
    await page.setOfflineMode(false);
    await until(async () => await title() === 'Unsent at logout', 'sent once back online');
  });

  console.log('\nContacts');
  const nContacts = async name => (await db.query(`SELECT COUNT(*)::int n FROM contacts WHERE owner_id=$1 AND name=$2`, [userId, name])).rows[0].n;
  const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('slater_pending_contacts') || '[]'));
  const contactsOpen = () => page.evaluate(() => { const r = document.querySelector('.cv2-head-actions'); return !!(r && r.offsetParent); });
  await step('Save while offline: kept on this device, Contacts can be closed with no discard prompt, saved once when back', async () => {
    await page.close({ runBeforeUnload: false });
    page = await newPage(true);
    await page.waitForFunction(() => window.ContactsV2 && ContactsV2.store.loaded, { timeout: 10000 });
    await page.evaluate(() => openContacts());
    await page.waitForSelector('[data-act="new"]', { visible: true });
    await page.click('[data-act="new"]');
    await page.type('#cv2f_name', 'Offline Olive');
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await page.click('#cv2-save');
    await until(() => page.evaluate(() => document.body.textContent.includes('Saved on this device')), 'offline save message');
    let q = await queue();
    assert(q.length === 1 && q[0].op === 'create' && q[0].body.name === 'Offline Olive', 'queued: ' + JSON.stringify(q));
    assert(await nContacts('Offline Olive') === 0, 'nothing on the server yet');
    // Close Contacts: no "Discard your changes?" prompt.
    await page.click('[data-act="close"]');
    await sleep(300);
    assert(!(await page.$('#modal-overlay.open')), 'no discard prompt');
    assert(!(await contactsOpen()), 'Contacts closed');
    // Reopen: the list says it's waiting.
    await page.evaluate(() => openContacts());
    await until(() => page.evaluate(() => /1 waiting to save \(offline\): Offline Olive/.test(document.getElementById('cv2-list').textContent)), 'waiting line in the list');
    await page.click('[data-act="close"]');
    await page.setOfflineMode(false);
    await until(async () => await nContacts('Offline Olive') === 1, 'contact saved on reconnect');
    await until(async () => (await queue()).length === 0, 'queue empty');
    await page.evaluate(() => SlaterConn._retryAll()); await sleep(800);
    assert(await nContacts('Offline Olive') === 1, 'saved exactly once (no duplicate on a second send)');
  });

  await step('offline edit to an existing contact is queued and applied; tab closed meanwhile is fine', async () => {
    const id = (await db.query(`SELECT id FROM contacts WHERE owner_id=$1 AND name='Offline Olive'`, [userId])).rows[0].id;
    await page.evaluate(() => openContacts());
    await page.waitForSelector(`[data-act="select"][data-id="${id}"]`, { visible: true });
    await page.click(`[data-act="select"][data-id="${id}"]`);
    await page.waitForSelector('#cv2f_phone', { visible: true });
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    await page.type('#cv2f_phone', '206.555.0199');
    await page.click('#cv2-save');
    await until(async () => (await queue()).length === 1, 'queued');
    assert((await queue())[0].op === 'update', 'queued as an update');
    // Close the whole tab while still offline; come back online in a new one.
    await page.close({ runBeforeUnload: false });
    page = await newPage(true);
    await until(async () => (await db.query(`SELECT phone FROM contacts WHERE id=$1`, [id])).rows[0].phone.replace(/\D/g, '') === '2065550199', 'edit applied on the next visit (phone field formats the number)');
    await until(async () => (await queue()).length === 0, 'queue empty');
    await page.waitForFunction(() => window.ContactsV2 && ContactsV2.store.loaded, { timeout: 10000 });
    await page.evaluate(() => openContacts());
    await page.waitForSelector('[data-act="new"]', { visible: true });
  });

  await step('reconnect pulls changes made elsewhere into the open Contacts list', async () => {
    await page.setOfflineMode(true);
    await until(async () => /You're offline/.test(await barText(page)), 'offline bar');
    // Reopening Contacts while offline: no error message (the panel covers it).
    await page.click('[data-act="close"]').catch(() => {});
    await page.evaluate(() => openContacts());
    await sleep(500);
    const sb = await page.evaluate(() => { const b = document.getElementById('status-bar'); return b && b.style.display !== 'none' ? b.textContent : ''; });
    assert(!/Could not/.test(sb), 'no error in the status bar while offline: ' + sb);
    await db.query(`INSERT INTO contacts (owner_id, name) VALUES ($1, 'Elsewhere Ed')`, [userId]);
    await page.setOfflineMode(false);
    try {
      await until(() => page.evaluate(() => /Elsewhere Ed/.test(document.getElementById('cv2-list').textContent)), 'new contact listed');
    const sb2 = await page.evaluate(() => { const b = document.getElementById('status-bar'); return b && b.style.display !== 'none' ? b.textContent : ''; });
    assert(!/offline/i.test(sb2), 'stale offline message left in the status bar: ' + sb2);
    } catch (e) {
      const dbg = await page.evaluate(() => ({ online: SlaterConn.online, inStore: Object.values(ContactsV2.store.contacts).map(c => c.name), cursor: ContactsV2.store.cursor, open: !!document.querySelector('#cv2-list') }));
      const row = (await db.query(`SELECT updated_at FROM contacts WHERE owner_id=$1 AND name='Elsewhere Ed'`, [userId])).rows[0];
      throw new Error(e.message + ' | ' + JSON.stringify(dbg) + ' | db updated_at ' + (row && row.updated_at.toISOString()));
    }
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try {
    if (userId) {
      await db.query('DELETE FROM receipts WHERE owner_id=$1', [userId]);
      await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]);
      await db.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, ['%"userId":' + userId + ',%']);
      await db.query('DELETE FROM users WHERE id=$1', [userId]);
    }
  } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  if (consoleErrors.length) { console.log('\nBrowser console errors:'); [...new Set(consoleErrors)].slice(0, 10).forEach(e => console.log('  ' + e)); }
  console.log(`\n${passed} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
});
