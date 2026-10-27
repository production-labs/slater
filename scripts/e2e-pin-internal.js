// End-to-end browser test: workback milestone pins' "Internal only" flag is
// stored in project data (internal_pins), not this browser's localStorage.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-pin-internal.js
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
const EMAIL = 'pine2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/pin-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Y = new Date().getFullYear() + 1;
const D = (m, d) => Y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Pin Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  // Each "device" is its own incognito context: separate localStorage, separate cookies.
  async function device() {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage(); global.__page = page;
    await page.setViewport({ width: 1400, height: 900 });
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    await page.goto(BASE + '/login');
    const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
    assert(login === 200, 'login failed ' + login);
    return page;
  }
  async function open(page, key, presetLocal) {
    await page.evaluate((k, pre) => {
      localStorage.setItem('slater_last_project', k);
      Object.entries(pre || {}).forEach(([a, b]) => localStorage.setItem(a, b));
    }, key, presetLocal);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
  }
  const serverData = async key => (await db.query('SELECT data FROM projects WHERE key=$1', [key])).rows[0].data;
  const save = page => page.evaluate(() => autosaveNow());
  const docPinLabels = page => page.evaluate(() => wbGetItemsForDoc().filter(i => i.isPin).map(i => i.item));

  const key = 'cs_pin_' + STAMP;
  const base = {
    project_type: 'location_shoot', project_title: 'Pin Test', label: 'Pin Test',
    kickoff_date_iso: D(2, 1),
    schedule_days: [
      { id: 'sday_1', date_iso: D(3, 10), label: 'Shoot Day', category: 'shoot_day' },
      { id: 'sday_2', date_iso: D(3, 12), label: 'Client Review', category: 'review_session' },
    ],
  };
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [key, base.label, JSON.stringify(base), userId]);

  // ---------------------------------------------------------------- device A
  const A = await device();

  await step('legacy localStorage flag is adopted on load and saved to the server', async () => {
    await open(A, key, { ['slater_pin_' + key + '_pin_sday_2']: '1' });
    const flags = await A.evaluate(() => Object.assign({}, _wbPinInternal));
    assert(flags.pin_sday_2 === true && Object.keys(flags).length === 1, 'adopted: ' + JSON.stringify(flags));
    assert(!(await docPinLabels(A)).includes('Client Review'), 'internal pin left out of the Word doc items');
    await save(A); await sleep(800);
    const d = await serverData(key);
    assert(d.internal_pins && d.internal_pins.pin_sday_2 === true, 'server has it: ' + JSON.stringify(d.internal_pins));
  });

  await step('toggling a pin in the table updates project data, not localStorage', async () => {
    await A.evaluate(() => st('workback'));
    await sleep(300);
    const before = await A.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('slater_pin_') === 0).length);
    await A.evaluate(() => { const cb = document.querySelector('#wb-tr-pin_kickoff .t-int-cell input'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    const after = await A.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('slater_pin_') === 0).length);
    assert(before === after, 'no new localStorage keys (' + before + ' -> ' + after + ')');
    await save(A); await sleep(800);
    const d = await serverData(key);
    assert(d.internal_pins.pin_kickoff === true && d.internal_pins.pin_sday_2 === true, 'server flags: ' + JSON.stringify(d.internal_pins));
    const labels = (d.wb_items_for_doc || []).filter(i => i.isPin).map(i => i.item);
    assert(labels.includes('Shoot Day') && !labels.includes('Client Kickoff') && !labels.includes('Client Review'), 'saved doc items: ' + labels.join(', '));
  });

  // ---------------------------------------------------------------- device B
  const B = await device();

  await step('a second device with empty localStorage sees the same flags', async () => {
    await open(B, key);
    await B.evaluate(() => st('workback'));
    await sleep(300);
    const checked = await B.evaluate(() => ({
      kickoff: document.querySelector('#wb-tr-pin_kickoff .t-int-cell input').checked,
      day1: document.querySelector('#wb-tr-pin_sday_1 .t-int-cell input').checked,
      day2: document.querySelector('#wb-tr-pin_sday_2 .t-int-cell input').checked,
    }));
    assert(checked.kickoff && !checked.day1 && checked.day2, 'checkboxes: ' + JSON.stringify(checked));
  });

  await step('unchecking on device B clears it; a stale legacy local flag does not bring it back', async () => {
    await B.evaluate(() => { const cb = document.querySelector('#wb-tr-pin_sday_2 .t-int-cell input'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    await save(B); await sleep(800);
    let d = await serverData(key);
    assert(!d.internal_pins.pin_sday_2 && d.internal_pins.pin_kickoff === true, 'after uncheck: ' + JSON.stringify(d.internal_pins));
    // Device A still has the old legacy key in its localStorage. Server data wins.
    await open(A, key);
    const flags = await A.evaluate(() => Object.assign({}, _wbPinInternal));
    assert(!flags.pin_sday_2 && flags.pin_kickoff === true, 'device A after reload: ' + JSON.stringify(flags));
  });

  await step('New Project starts with no internal pins', async () => {
    await A.evaluate(() => libNew());
    await sleep(300);
    const flags = await A.evaluate(() => Object.keys(_wbPinInternal).length);
    assert(flags === 0, 'flags after New: ' + flags);
  });

  if (/Error/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error/i.test(l)).join('\n'));
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
