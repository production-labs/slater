// End-to-end browser test: the status line under an expense card when a
// receipt is read (or can't be). /api/ocr is faked per test, so no Anthropic
// call is made. LOCAL DATABASE ONLY. Creates a temporary user and deletes it.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-receipt-ocr.js
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
const EMAIL = 'ocr-e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/ocr-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// What the fake /api/ocr answers next: { status, body (string) }
let fakeOcr = null;

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'OCR Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const KEY = 'cs_ocr_' + STAMP;
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`,
    [KEY, 'OCR', JSON.stringify({ project_type: 'location_shoot', project_title: 'OCR', label: 'OCR', schedule_days: [], wb_items: [], expenses: [] }), userId]);

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().endsWith('/api/ocr') && req.method() === 'POST' && fakeOcr) {
      const f = fakeOcr;
      setTimeout(() => req.respond({ status: f.status, contentType: f.type || 'application/json', body: f.body }), 300);
    } else req.continue();
  });

  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
  await page.evaluate(() => mobileNavGo('expenses'));
  await sleep(300);

  // Adds an expense card and "picks" a file for it. kind: 'png' | 'pdf' | 'bad'
  const upload = (kind) => page.evaluate(async (kind) => {
    addExpense();
    const id = expenses[expenses.length - 1];
    let file;
    if (kind === 'png') {
      const c = document.createElement('canvas'); c.width = 40; c.height = 60;
      c.getContext('2d').fillRect(0, 0, 10, 10);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      file = new File([blob], 'r.png', { type: 'image/png' });
    } else if (kind === 'pdf') {
      file = new File(['%PDF-1.4 fake'], 'r.pdf', { type: 'application/pdf' });
    } else {
      file = new File(['not an image'], 'r.heic', { type: 'image/heic' });
    }
    handleReceiptUpload(id, { files: [file] });
    return id;
  }, kind);
  const note = id => page.evaluate(id => { const el = document.getElementById(id + '_ocr_note'); return { text: el.textContent, kind: el.dataset.kind, shown: getComputedStyle(el).display !== 'none' }; }, id);
  const waitNote = (id, kind) => page.waitForFunction((id, k) => (document.getElementById(id + '_ocr_note').dataset.kind || '') === k, { timeout: 5000 }, id, kind);

  await step('success: shows "Reading receipt..." then fills fields and hides the line', async () => {
    fakeOcr = { status: 200, body: JSON.stringify({ vendor: 'Joe Diner', date: '2030-02-03', amount: 24.5, category: 'Meals' }) };
    const id = await upload('png');
    await waitNote(id, 'busy');
    const busy = await note(id);
    assert(busy.shown && /Reading receipt/.test(busy.text), JSON.stringify(busy));
    await waitNote(id, '');
    const n = await note(id);
    assert(!n.shown, 'line should be hidden: ' + JSON.stringify(n));
    const v = await page.evaluate(id => document.getElementById(id + '_vendor').value, id);
    assert(v === 'Joe Diner', 'vendor ' + v);
  });

  await step('server error (e.g. bad API key) shows the warning', async () => {
    fakeOcr = { status: 402, body: JSON.stringify({ error: 'invalid x-api-key' }) };
    const id = await upload('png');
    await waitNote(id, 'warn');
    const n = await note(id);
    assert(n.shown && /Couldn't read this receipt/.test(n.text), JSON.stringify(n));
    await (await page.$('#' + id)).screenshot({ path: SHOTS + '/ocr-warn-phone.png' });
  });

  await step('non-JSON error page shows the warning', async () => {
    fakeOcr = { status: 502, type: 'text/html', body: '<html>Bad gateway</html>' };
    const id = await upload('png');
    await waitNote(id, 'warn');
    assert(/Couldn't read this receipt/.test((await note(id)).text));
  });

  await step('nothing found on the receipt shows its own message', async () => {
    fakeOcr = { status: 200, body: JSON.stringify({ vendor: '', date: '', amount: null, category: 'Other' }) };
    const id = await upload('png');
    await waitNote(id, 'warn');
    assert(/Couldn't find any details/.test((await note(id)).text));
  });

  await step('typing in the card clears a warning', async () => {
    fakeOcr = { status: 500, body: JSON.stringify({ error: 'OCR failed' }) };
    const id = await upload('png');
    await waitNote(id, 'warn');
    await page.type('#' + id + '_vendor', 'Cab');
    await waitNote(id, '');
  });

  await step('PDF receipt says it is not read automatically', async () => {
    const id = await upload('pdf');
    await waitNote(id, 'warn');
    assert(/PDF receipts/.test((await note(id)).text));
  });

  await step('an image the browser cannot open says so', async () => {
    const id = await upload('bad');
    await waitNote(id, 'warn');
    assert(/Couldn't open this image/.test((await note(id)).text));
  });

  await step('newest expense shows on top; saved order and receipt slots unchanged', async () => {
    const r = await page.evaluate(() => {
      loadExpenses([{ vendor: 'First' }, { vendor: 'Second', receipt: 'data:image/png;base64,AAAA' }]);
      addExpense({ vendor: 'Third' });
      const shown = [...document.querySelectorAll('#expense-list .exp-card')].map(c => c.querySelector('.exp-vendor').value);
      const saved = getExpenses().map(e => e.vendor + (e.receipt ? '+r' : ''));
      return { shown, saved };
    });
    assert(r.shown.join() === 'Third,Second,First', 'shown ' + r.shown.join());
    assert(r.saved.join() === 'First,Second+r,Third', 'saved ' + r.saved.join());
  });

  await step('no page errors', async () => {
    const real = consoleErrors.filter(e => !/Failed to load resource/.test(e));
    assert(!real.length, real.join(' | '));
  });
}

main().catch(e => { fails.push('crashed'); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.error('cleanup', e.message); }
  await db.end();
  console.log(`\n${passed} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
});
