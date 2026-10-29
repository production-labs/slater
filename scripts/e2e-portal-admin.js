// End-to-end test: Client Portal, producer controls (V1.5 step 5b).
// LOCAL DATABASE ONLY. Creates two temporary users and deletes them afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-portal-admin.js
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3993, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'portaladmin-e2e-' + STAMP + '@example.invalid';
const OTHER = 'portaladmin-e2e-other-' + STAMP + '@example.invalid';
const PASS = 'e2e-pass-' + STAMP;
let server, browser, passed = 0;
const userIds = [], fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/pa-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rel(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  const mkUser = async (email, name) => { const id = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, [email, hash, name])).rows[0].id; userIds.push(id); return id; };
  const userId = await mkUser(EMAIL, 'Admin Tester');
  const otherId = await mkUser(OTHER, 'Other Tester');

  const KEY = 'cs_pa_' + STAMP, OTHER_KEY = 'cs_pa_other_' + STAMP;
  const data = {
    project_title: 'Portal Admin Test', project_type: 'location_shoot', client_company: 'Acme',
    schedule_days: [{ id: 'sday_1', date_iso: rel(10), label: 'Shoot Day' }],
    urls: [
      { name: 'Review link', url: 'https://example.com/review', notes: '' },
      { name: 'Internal drive', url: 'https://example.com/drive', notes: '' },
    ],
  };
  const projectId = (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [KEY, 'Portal Admin Test', data, userId])).rows[0].id;
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Other',$2,$3)`, [OTHER_KEY, { project_title: 'Other' }, otherId]);
  const portalRow = async () => (await db.query('SELECT * FROM portals WHERE project_id=$1', [projectId])).rows[0];
  const serverData = async () => (await db.query('SELECT data FROM projects WHERE key=$1', [KEY])).rows[0].data;

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1400, height: 1000 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);

  const panel = () => page.$eval('#portal-admin', el => el.innerText);
  const click = async (a) => { await page.click('#portal-admin [data-pa="' + a + '"]'); };
  const confirmModal = async () => { await page.waitForSelector('#modal-overlay.open', { timeout: 3000 }); await page.click('#modal-ok'); };
  const waitText = (re) => page.waitForFunction(src => new RegExp(src).test(document.getElementById('portal-admin').innerText), { timeout: 5000 }, re.source);
  const portalStatus = async (token) => (await fetch(BASE + '/api/portal/' + token)).status;

  await step('Project tab shows the portal as off with a turn-on button', async () => {
    await waitText(/Turn on client portal/);
    assert(!(await portalRow()), 'portal row exists already');
  });

  let token1;
  await step('Turning it on makes a working link', async () => {
    await click('enable');
    await waitText(/Portal is on/);
    const row = await portalRow();
    assert(row && row.token && !row.password_hash, 'no row / unexpected password');
    token1 = row.token;
    const shown = await page.$eval('#pa-link', el => el.value);
    assert(shown === BASE + '/portal/' + token1, 'link shown: ' + shown);
    assert((await portalStatus(token1)) === 200, 'public portal not reachable');
    await page.evaluate(() => { if (sidebarOpen && typeof toggleSidebar === 'function') toggleSidebar(); });
    await sleep(300);
    await page.$eval('#portal-admin', el => el.scrollIntoView());
    await page.screenshot({ path: SHOTS + '/pa-on.png' });
  });

  await step('Posting an update shows it here and on the client portal', async () => {
    await page.type('#pa-update', 'Rough cut is coming Friday.\nSecond line.');
    await click('post');
    await waitText(/Rough cut is coming Friday/);
    assert((await page.$eval('#pa-update', el => el.value)) === '', 'textarea not cleared');
    const j = await (await fetch(BASE + '/api/portal/' + token1)).json();
    assert(j.updates.length === 1 && j.updates[0].body === 'Rough cut is coming Friday.\nSecond line.' && j.updates[0].author === 'Admin Tester', JSON.stringify(j.updates));
  });

  await step('A half-written update survives other panel actions', async () => {
    await page.type('#pa-update', 'draft text');
    await click('pw-open');
    await click('pw-cancel');
    assert((await page.$eval('#pa-update', el => el.value)) === 'draft text', 'draft lost');
    await page.$eval('#pa-update', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  });

  await step('Typing in the panel does not autosave the project', async () => {
    const before = (await db.query('SELECT updated_at FROM projects WHERE key=$1', [KEY])).rows[0].updated_at;
    await page.type('#pa-update', 'x');
    await sleep(2500);
    const after = (await db.query('SELECT updated_at FROM projects WHERE key=$1', [KEY])).rows[0].updated_at;
    assert(+before === +after, 'project saved on panel typing');
    await page.$eval('#pa-update', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  });

  await step('Too-short password is refused; a real one locks the portal', async () => {
    await click('pw-open');
    await page.type('#pa-pw', 'abc');
    await click('pw-save');
    await sleep(300);
    assert(!(await portalRow()).password_hash, 'short password saved');
    await page.$eval('#pa-pw', el => { el.value = ''; });
    await page.type('#pa-pw', 'letmein99');
    await page.keyboard.press('Enter');
    await waitText(/On\. Your client enters it/);
    const row = await portalRow();
    assert(row.password_hash && await bcrypt.compare('letmein99', row.password_hash), 'hash wrong');
    assert((await portalStatus(token1)) === 401, 'portal not locked');
  });

  await step('The status API never sends the password hash', async () => {
    const j = await page.evaluate(async k => (await fetch('/api/portal-admin/' + k)).json(), KEY);
    assert(j.has_password === true && !('password_hash' in j) && !JSON.stringify(j).includes('$2'), JSON.stringify(j).slice(0, 200));
  });

  await step('Removing the password opens the portal again', async () => {
    await click('pw-remove');
    await confirmModal();
    await waitText(/None\. The link alone/);
    assert(!(await portalRow()).password_hash, 'hash still set');
    assert((await portalStatus(token1)) === 200, 'portal still locked');
  });

  await step('URL "Show on client portal" checkbox saves with the project and controls the portal', async () => {
    await page.evaluate(() => st('urls'));
    const boxes = await page.$$('#url-list input[type=checkbox][id$="_portal"]');
    assert(boxes.length === 2, 'checkboxes ' + boxes.length);
    await boxes[0].click();
    await page.evaluate(() => autosaveNow());
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) { await sleep(250); const d = await serverData(); ok = d.urls && d.urls[0].visible_to_client === true && d.urls[1].visible_to_client === false; }
    assert(ok, 'urls not saved: ' + JSON.stringify((await serverData()).urls));
    const j = await (await fetch(BASE + '/api/portal/' + token1)).json();
    assert(j.links.length === 1 && j.links[0].name === 'Review link', JSON.stringify(j.links));
    await page.evaluate(() => st('project'));
    await waitText(/1 link shared/);
  });

  await step('Checkbox state survives reloading the project', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
    const checks = await page.$$eval('#url-list input[type=checkbox][id$="_portal"]', els => els.map(e => e.checked));
    assert(JSON.stringify(checks) === '[true,false]', JSON.stringify(checks));
    await waitText(/Portal is on/);
  });

  let token2;
  await step('Making a new link kills the old one', async () => {
    await click('regen');
    await confirmModal();
    await page.waitForFunction(t => { const i = document.getElementById('pa-link'); return i && !i.value.endsWith(t); }, { timeout: 5000 }, token1);
    token2 = (await portalRow()).token;
    assert(token2 && token2 !== token1, 'token unchanged');
    assert((await portalStatus(token1)) === 404, 'old link still works');
    assert((await portalStatus(token2)) === 200, 'new link broken');
  });

  await page.$eval('#portal-admin', el => el.scrollIntoView()); await page.screenshot({ path: SHOTS + '/pa-full.png' });
  await step('Deleting an update removes it from the portal', async () => {
    await click('del-update');
    await confirmModal();
    await page.waitForFunction(() => !document.querySelector('#portal-admin .pa-update'), { timeout: 5000 });
    const j = await (await fetch(BASE + '/api/portal/' + token2)).json();
    assert(j.updates.length === 0, 'update still on portal');
  });

  await step('Turning it off kills the link; turning on again makes a different one', async () => {
    await page.type('#pa-update', 'kept update');
    await click('post');
    await waitText(/kept update/);
    await click('disable');
    await confirmModal();
    await waitText(/Turn on client portal/);
    assert(!(await portalRow()), 'row still there');
    assert((await portalStatus(token2)) === 404, 'link still works');
    assert(/earlier update is kept/.test(await panel()), 'kept-updates note missing');
    await click('enable');
    await waitText(/Portal is on/);
    const t3 = (await portalRow()).token;
    assert(t3 !== token2 && t3 !== token1, 'reused token');
    const j = await (await fetch(BASE + '/api/portal/' + t3)).json();
    assert(j.updates.length === 1 && j.updates[0].body === 'kept update', 'update not kept');
  });

  await step("Another user's project can't be touched", async () => {
    const res = await page.evaluate(async k => {
      const out = [];
      for (const [m, p, b] of [['GET', ''], ['POST', '/enable'], ['POST', '/regenerate'], ['PUT', '/password', { password: 'hijacked1' }], ['POST', '/updates', { body: 'hi' }], ['DELETE', '']]) {
        const r = await fetch('/api/portal-admin/' + k + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
        out.push(r.status);
      }
      return out;
    }, OTHER_KEY);
    assert(res.every(s => s === 404), JSON.stringify(res));
    assert((await db.query('SELECT count(*)::int n FROM portals WHERE owner_id=$1', [otherId])).rows[0].n === 0, 'portal made for other user');
  });

  await step('Logged out: every producer route is refused', async () => {
    const r = await fetch(BASE + '/api/portal-admin/' + KEY + '/enable', { method: 'POST' });
    assert(r.status === 401, 'status ' + r.status);
  });

  await step('A new unsaved project shows "save first"', async () => {
    await page.evaluate(() => libNew());
    await waitText(/Save this project first/);
  });

  if (/Error/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error/i.test(l)).join('\n'));
  if (serverLog.includes(token1) || (token2 && serverLog.includes(token2))) { fails.push('token in server log'); console.log('  FAIL portal token appeared in the server log'); }
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { for (const id of userIds) { await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409|401/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
