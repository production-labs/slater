// End-to-end browser test: receipt photos are stored by expense position, so
// saves remove rows at positions that no longer have a photo (otherwise a
// deleted expense's receipt shows up on the next expense in its spot). Also:
// if the photos couldn't be loaded, a save must not remove anything.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-receipts-prune.js
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3996, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'prune-e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/prune-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IMG_A = 'data:image/png;base64,QUFB', IMG_B = 'data:image/png;base64,QkJC', IMG_OLD = 'data:image/png;base64,T0xE';

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Prune Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const KEY = 'cs_prune_' + STAMP;
  const data = { project_type: 'location_shoot', project_title: 'Prune', label: 'Prune', schedule_days: [], wb_items: [],
    expenses: [{ vendor: 'A', amount: 1 }, { vendor: 'B', amount: 2 }] };
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [KEY, 'Prune', JSON.stringify(data), userId]);
  const addRow = (i, img) => db.query(`INSERT INTO receipts (project_key, expense_index, image_data, owner_id) VALUES ($1,$2,$3,$4)`, [KEY, i, img, userId]);
  await addRow(0, IMG_A); await addRow(1, IMG_B); await addRow(5, IMG_OLD); // 5 = leftover from long ago
  const rows = async () => (await db.query('SELECT expense_index i, image_data img FROM receipts WHERE project_key=$1 ORDER BY 1', [KEY])).rows;
  const waitRows = async (want, label) => {
    let r;
    for (let n = 0; n < 40; n++) { r = await rows(); if (JSON.stringify(r) === JSON.stringify(want)) return; await sleep(150); }
    throw new Error(label + ': ' + JSON.stringify(r));
  };

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  let failReceiptLoad = false;
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (failReceiptLoad && req.method() === 'GET' && req.url().endsWith('/api/receipts/' + KEY)) req.respond({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
    else req.continue();
  });

  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  const open = async () => {
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
    await sleep(500);
  };
  const cardPhotos = () => page.evaluate(() => expenses.map(id => document.getElementById(id + '_vendor').value + ':' + (document.getElementById(id + '_receipt_data').value || '-')));
  const removeFirst = () => page.evaluate(() => { const id = expenses[0]; expenses = expenses.filter(e => e !== id); document.getElementById(id).remove(); autosaveNow(); });

  await step('photos load onto the right cards', async () => {
    await open();
    await page.waitForFunction(k => _receiptsLoaded[k], { timeout: 5000 }, KEY);
    const c = await cardPhotos();
    assert(c.join() === 'A:' + IMG_A + ',B:' + IMG_B, c.join());
  });

  await step('deleting expense A removes its photo; B keeps its own; old leftover row is cleaned up', async () => {
    await removeFirst();
    await waitRows([{ i: 0, img: IMG_B }], 'rows after delete');
  });

  await step('after reopening, B shows its own photo', async () => {
    await open();
    await page.waitForFunction(k => _receiptsLoaded[k], { timeout: 5000 }, KEY);
    const c = await cardPhotos();
    assert(c.join() === 'B:' + IMG_B, c.join());
  });

  await step('a new expense without a photo does not inherit an old one', async () => {
    await page.evaluate(() => { addExpense({ vendor: 'C' }); autosaveNow(); });
    await sleep(800);
    await open();
    await page.waitForFunction(k => _receiptsLoaded[k], { timeout: 5000 }, KEY);
    const c = await cardPhotos();
    assert(c.join() === 'B:' + IMG_B + ',C:-', c.join());
    await waitRows([{ i: 0, img: IMG_B }], 'rows after adding C');
  });

  await step('if the photos fail to load, a save removes nothing', async () => {
    failReceiptLoad = true;
    await open();
    await page.evaluate(() => { document.getElementById(expenses[0] + '_vendor').value = 'B edited'; autosaveNow(); });
    await sleep(1200);
    assert(!(await page.evaluate(k => !!_receiptsLoaded[k], KEY)), 'should not count as loaded');
    await waitRows([{ i: 0, img: IMG_B }], 'rows kept');
    failReceiptLoad = false;
  });

  await step('prune route refuses a bad keep list', async () => {
    const s = await page.evaluate(async k => (await fetch('/api/receipts/' + k + '/prune', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep: 'all' }) })).status, KEY);
    assert(s === 400, 'status ' + s);
    await waitRows([{ i: 0, img: IMG_B }], 'rows untouched');
  });

  await step('no page errors', async () => {
    const real = consoleErrors.filter(e => !/Failed to load resource/.test(e));
    assert(!real.length, real.join(' | '));
  });
}

main().catch(e => { fails.push('crashed'); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM receipts WHERE owner_id=$1', [userId]); await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.error('cleanup', e.message); }
  await db.end();
  console.log(`\n${passed} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
});
