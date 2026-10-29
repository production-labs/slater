// End-to-end test: Client Portal approvals (V1.5 step 5c).
// Client presses Approve / Request changes on the portal; the producer sees it
// in the Project tab panel, on the workback item and in the Rundown, then
// confirms (Mark complete) or dismisses.
// LOCAL DATABASE ONLY. Creates two temporary users and deletes them afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-portal-approvals.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3992, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'portalappr-e2e-' + STAMP + '@example.invalid';
const OTHER = 'portalappr-e2e-other-' + STAMP + '@example.invalid';
const PASS = 'e2e-pass-' + STAMP;
const XSS = '<img src=x onerror="window.__xss=1">Looks great';
let server, browser, passed = 0;
const userIds = [], fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/pr-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rel(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  const mkUser = async (email, name) => { const id = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, [email, hash, name])).rows[0].id; userIds.push(id); return id; };
  const userId = await mkUser(EMAIL, 'Approvals Tester');
  const otherId = await mkUser(OTHER, 'Other Tester');

  const KEY = 'cs_pr_' + STAMP;
  const wb = (uuid, item, owner, extra) => Object.assign({ uuid, item, owner, mode: 'manual', manual_date: rel(3), status: 'Not Started', internal: false }, extra || {});
  const data = {
    project_title: 'Approvals Test', project_type: 'location_shoot', client_company: 'Acme',
    schedule_days: [{ id: 'sday_1', date_iso: rel(12), label: 'Shoot Day' }],
    wb_items: [
      wb('u-script', 'Approve script', 'Client'),
      wb('u-cast', 'Approve casting', 'acme'),
      wb('u-ours', 'Edit cut 1', 'Producer'),
      wb('u-secret', 'Internal review', 'Client', { internal: true }),
    ],
  };
  const projectId = (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [KEY, 'Approvals Test', data, userId])).rows[0].id;
  const TOKEN = crypto.randomBytes(32).toString('base64url');
  await db.query('INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)', [projectId, userId, TOKEN]);
  const responses = async () => (await db.query('SELECT * FROM portal_responses WHERE project_id=$1 ORDER BY id', [projectId])).rows;
  const open = async () => (await responses()).filter(r => !r.acknowledged_at);
  const serverData = async () => (await db.query('SELECT data FROM projects WHERE key=$1', [KEY])).rows[0].data;
  const respond = (body, token) => fetch(BASE + '/api/portal/' + (token || TOKEN) + '/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = async () => (await fetch(BASE + '/api/portal/' + TOKEN)).json();

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  // ── API rules ─────────────────────────────────────────────────────────────
  await step('Only items waiting on the client can be answered', async () => {
    const ours = await respond({ uuid: 'u-ours', kind: 'approved', name: 'Pat' });
    const secret = await respond({ uuid: 'u-secret', kind: 'approved', name: 'Pat' });
    const nope = await respond({ uuid: 'nope', kind: 'approved', name: 'Pat' });
    assert(ours.status === 409 && secret.status === 409 && nope.status === 409, [ours.status, secret.status, nope.status].join());
  });

  await step('Bad input is refused (kind, missing name, changes without a note, long note)', async () => {
    const s = [];
    s.push((await respond({ uuid: 'u-script', kind: 'complete', name: 'Pat' })).status);
    s.push((await respond({ uuid: 'u-script', kind: 'approved', name: '  ' })).status);
    s.push((await respond({ uuid: 'u-script', kind: 'changes_requested', name: 'Pat', note: '' })).status);
    s.push((await respond({ uuid: 'u-script', kind: 'approved', name: 'Pat', note: 'x'.repeat(5001) })).status);
    assert(s.every(x => x === 400), s.join());
    assert((await responses()).length === 0, 'rows written');
  });

  await step('Locked portal refuses answers without the password; unknown link is 404', async () => {
    await db.query('UPDATE portals SET password_hash=$1 WHERE project_id=$2', [await bcrypt.hash('secret99', 4), projectId]);
    const r = await respond({ uuid: 'u-script', kind: 'approved', name: 'Pat' });
    await db.query('UPDATE portals SET password_hash=NULL WHERE project_id=$1', [projectId]);
    const r2 = await respond({ uuid: 'u-script', kind: 'approved', name: 'Pat' }, crypto.randomBytes(32).toString('base64url'));
    assert(r.status === 401 && r2.status === 404, r.status + '/' + r2.status);
  });

  // ── Client page ───────────────────────────────────────────────────────────
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const cctx = await browser.createBrowserContext();
  const cpage = await cctx.newPage(); global.__page = cpage;
  await cpage.setViewport({ width: 1200, height: 900 });
  cpage.on('pageerror', e => consoleErrors.push('client pageerror: ' + e.message));
  await cpage.goto(BASE + '/portal/' + TOKEN, { waitUntil: 'networkidle0' });
  const rowFor = (item) => cpage.evaluateHandle(t => [...document.querySelectorAll('.action-item')].find(r => r.querySelector('.action-name').textContent === t), item);
  const clickIn = async (item, text) => {
    const row = await rowFor(item);
    const btn = await row.evaluateHandle((r, t) => [...r.querySelectorAll('button')].find(b => b.textContent === t), text);
    await btn.click();
  };

  await step('Portal shows Approve / Request changes on each waiting item', async () => {
    const names = await cpage.$$eval('.action-item .action-name', els => els.map(e => e.textContent));
    assert(JSON.stringify(names.sort()) === JSON.stringify(['Approve casting', 'Approve script']), JSON.stringify(names));
    const btns = await cpage.$$eval('.action-item .action-btns button', els => els.map(e => e.textContent));
    assert(btns.filter(b => b === 'Approve').length === 2 && btns.filter(b => b === 'Request changes').length === 2, JSON.stringify(btns));
  });

  await step('Client approves with a name and note', async () => {
    await clickIn('Approve script', 'Approve');
    await cpage.waitForSelector('.action-form input');
    await cpage.type('.action-form input', 'Pat Client');
    await cpage.type('.action-form textarea', XSS);
    await cpage.screenshot({ path: SHOTS + '/pr-client-form.png' });
    await cpage.click('.action-form button[type=submit]');
    await cpage.waitForFunction(() => /You approved this/.test(document.body.innerText), { timeout: 5000 });
    const rows = await open();
    assert(rows.length === 1 && rows[0].kind === 'approved' && rows[0].responder_name === 'Pat Client' && rows[0].note === XSS && rows[0].wb_item_uuid === 'u-script', JSON.stringify(rows));
  });

  await step('Request changes needs a note; name is remembered', async () => {
    await clickIn('Approve casting', 'Request changes');
    await cpage.waitForSelector('.action-form input');
    assert((await cpage.$eval('.action-form input', e => e.value)) === 'Pat Client', 'name not remembered');
    await cpage.click('.action-form button[type=submit]');
    await cpage.waitForFunction(() => /say what needs to change/.test(document.querySelector('.action-form .err').textContent), { timeout: 3000 });
    await cpage.type('.action-form textarea', 'Second choice for the lead, please.');
    await cpage.click('.action-form button[type=submit]');
    await cpage.waitForFunction(() => /You asked for changes/.test(document.body.innerText), { timeout: 5000 });
    assert((await open()).length === 2, 'not 2 open');
    await cpage.screenshot({ path: SHOTS + '/pr-client-sent.png' });
  });

  await step('Changing an answer replaces the older one', async () => {
    const row = await rowFor('Approve casting');
    await (await row.$('.action-link')).click();
    await clickIn('Approve casting', 'Approve');
    await cpage.waitForSelector('.action-form textarea');
    await cpage.click('.action-form button[type=submit]');
    await cpage.waitForFunction(() => [...document.querySelectorAll('.action-item')].some(r => /Approve casting/.test(r.innerText) && /You approved this/.test(r.innerText)), { timeout: 5000 });
    const rows = await open();
    const cast = rows.filter(r => r.wb_item_uuid === 'u-cast');
    assert(cast.length === 1 && cast[0].kind === 'approved', JSON.stringify(cast));
    // Put it back to changes requested for the producer-side tests.
    const r = await respond({ uuid: 'u-cast', kind: 'changes_requested', name: 'Pat Client', note: 'Second choice for the lead, please.' });
    assert(r.status === 200, 'respond ' + r.status);
    assert((await open()).length === 2, 'open count');
  });

  // ── Producer app ──────────────────────────────────────────────────────────
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
  try { await page.waitForFunction(() => /Client responses \(2\)/.test(document.getElementById('portal-admin').textContent), { timeout: 5000 }); }
  catch (e) { console.log('PANEL HTML: ' + await page.$eval('#portal-admin', el => el.innerHTML)); console.log('ERRORS: ' + consoleErrors.join(' | ')); throw e; }

  await step('Project tab panel lists both responses; client text stays text', async () => {
    const t = await page.$eval('#portal-admin', el => el.textContent);
    assert(/Client approved/.test(t) && /Approve script/.test(t) && /Changes requested/.test(t) && /Second choice for the lead/.test(t), t.slice(0, 400));
    assert(t.includes('<img src=x'), 'note not shown as text');
    assert(!(await page.evaluate(() => window.__xss)), 'client note ran as code');
    assert(!(await page.$('#portal-admin .pa-resp img')), 'img element injected');
    await page.$eval('#portal-admin', el => el.scrollIntoView());
    await page.screenshot({ path: SHOTS + '/pr-panel.png' });
  });

  await step('Rundown shows a Client responses group across projects', async () => {
    await page.evaluate(() => { if (!sidebarOpen) toggleSidebar(); if (typeof switchDailyTab === 'function') switchDailyTab('pending'); refreshSidebar(); });
    await page.waitForFunction(() => /Client responses \(2\)/.test(document.getElementById('daily-body').textContent), { timeout: 5000 });
    const t = await page.$eval('#daily-body', el => el.textContent);
    assert(/Approvals Test/.test(t) && /Pat Client/.test(t), t.slice(0, 300));
    assert(!(await page.evaluate(() => window.__xss)) && !(await page.$('#daily-body .pa-rundown img')), 'rundown injected');
  });

  await step('Workback items carry a tag; the edit panel has Mark complete', async () => {
    await page.evaluate(() => st('workback'));
    await page.evaluate(() => wbSetView('list'));
    await sleep(200);
    const tags = await page.$$eval('.wb-list-item .pa-badge', els => els.map(e => e.textContent));
    assert(tags.includes('Client approved') && tags.includes('Changes requested'), JSON.stringify(tags));
    await page.evaluate(() => wbSetView('table'));
    await sleep(200);
    assert((await page.$$('#tab-workback tr .pa-badge')).length === 2, 'table tags missing');
    // Table view: clicking the tag opens a review box; Close leaves it alone.
    await page.click('#tab-workback tr .pa-badge.ok');
    await page.waitForSelector('#modal-overlay.open', { timeout: 3000 });
    const m = await page.evaluate(() => ({ t: document.getElementById('modal-msg').textContent, ok: document.getElementById('modal-ok').textContent }));
    assert(/Pat Client approved "Approve script"/.test(m.t) && m.t.includes('<img src=x') && m.ok === 'Mark complete', JSON.stringify(m));
    await page.evaluate(() => modalCancel());
    assert((await open()).length === 2, 'closing the box changed something');
    assert(!(await page.evaluate(() => window.__xss)), 'modal ran client text');
    await page.screenshot({ path: SHOTS + '/pr-workback-table.png' });
    await page.evaluate(() => wbSetView('list'));
    await sleep(200);
    const wid = await page.evaluate(() => wbItems.find(w => _wbData[w].uuid === 'u-script'));
    await page.evaluate(w => wbSelectItem(w), wid);
    await page.waitForSelector('#wb-edit-panel [data-pa-resp="confirm"]', { timeout: 3000 });
    await page.screenshot({ path: SHOTS + '/pr-workback.png' });
  });

  await step('Mark complete: item Complete and saved, response cleared, gone from the portal', async () => {
    await page.click('#wb-edit-panel [data-pa-resp="confirm"]');
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await sleep(250);
      const d = await serverData();
      const item = d.wb_items.find(w => w.uuid === 'u-script');
      ok = item && item.status === 'Complete' && (await open()).length === 1;
    }
    assert(ok, 'not completed/acked: ' + JSON.stringify((await serverData()).wb_items.map(w => w.status)) + ' open=' + (await open()).length);
    const p = await payload();
    assert(!p.waiting.some(w => w.uuid === 'u-script'), 'still waiting on portal');
    assert(!(await page.$('#wb-edit-panel .pa-resp')), 'edit panel still shows response');
  });

  await step("Another user can't confirm this project's responses", async () => {
    const other = await db.query('SELECT id FROM portal_responses WHERE project_id=$1 AND acknowledged_at IS NULL', [projectId]);
    const id = other.rows[0].id;
    const octx = await browser.createBrowserContext();
    const op = await octx.newPage();
    await op.goto(BASE + '/login');
    await op.evaluate(async (e, p) => fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }), OTHER, PASS);
    const res = await op.evaluate(async (k, i) => {
      const a = (await fetch('/api/portal-admin/' + k + '/responses/' + i + '/ack', { method: 'POST' })).status;
      const list = await (await fetch('/api/portal-admin/responses/pending')).json();
      return { a, n: list.length };
    }, KEY, id);
    await octx.close();
    assert(res.a === 404 && res.n === 0, JSON.stringify(res));
    assert((await open()).length === 1, 'acked by other user');
  });

  await step('"Got it" on a change request clears it everywhere', async () => {
    await page.evaluate(() => st('project'));
    await page.waitForSelector('#portal-admin [data-pa-resp="dismiss"]');
    await page.click('#portal-admin [data-pa-resp="dismiss"]');
    await page.waitForFunction(() => !/Client responses/.test(document.getElementById('portal-admin').textContent), { timeout: 5000 });
    assert((await open()).length === 0, 'still open');
    await page.waitForFunction(() => !/Client responses/.test(document.getElementById('daily-body').textContent), { timeout: 5000 });
    const d = await serverData();
    assert(d.wb_items.find(w => w.uuid === 'u-cast').status === 'Not Started', 'dismiss changed the item');
  });

  await step('A new client answer shows up in the open app on the next check', async () => {
    const r = await respond({ uuid: 'u-cast', kind: 'approved', name: 'Pat Client', note: '' });
    assert(r.status === 200, 'respond ' + r.status);
    await page.evaluate(() => PortalAdmin.poll(true));
    await page.waitForFunction(() => /Client responses \(1\)/.test(document.getElementById('portal-admin').textContent), { timeout: 5000 });
    await page.waitForFunction(() => /Client responses \(1\)/.test(document.getElementById('daily-body').textContent), { timeout: 5000 });
  });

  await step('Rundown "Open project" from another project jumps to the item', async () => {
    await page.evaluate(() => libNew());
    await sleep(300);
    await page.evaluate(() => PortalAdmin.poll(true));
    await page.waitForSelector('#daily-body [data-pa-resp="open"]', { timeout: 5000 });
    await page.click('#daily-body [data-pa-resp="open"]');
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
    await page.waitForFunction(() => _wbSelectedId && _wbData[_wbSelectedId] && _wbData[_wbSelectedId].uuid === 'u-cast', { timeout: 5000 });
    assert(await page.evaluate(() => document.getElementById('tab-workback').classList.contains('active')), 'not on workback tab');
    assert(await page.$('#wb-edit-panel [data-pa-resp="confirm"]'), 'no confirm button on jumped-to item (list view)');
  });

  if (/Error/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error/i.test(l)).join('\n'));
  if (serverLog.includes(TOKEN)) { fails.push('token in server log'); console.log('  FAIL portal token appeared in the server log'); }
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { for (const id of userIds) { await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409|401|400/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
