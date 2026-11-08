// End-to-end browser test: workback Owner suggestions + "Client review"
// (2026-11-07). The Owner box suggests the client company, the client contact
// and Key Personnel (anything else can be typed); client tasks get a "Client
// review" box (edit panel) / Review switch (table view); new tasks start
// unticked, tasks saved before the box existed stay approvable.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-wb-owner.js
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3981, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'wbo-e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/wbo-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Owner Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const KEY = 'cs_wbo_' + STAMP;
  const data = {
    project_type: 'location_shoot', project_title: 'Owner Test', label: 'Owner Test',
    client_company: 'Contoso', client_name: 'Olga Masek', kickoff_date_iso: '2026-11-20',
    schedule_days: [{ id: 'sday_1', date_iso: '2026-12-01', label: 'Shoot' }],
    kp_cards: [
      { role: 'EP', name: 'Jo Owner', email: 'jo@example.invalid' },
      { role: 'Producer', name: 'Shaun <b>Parker</b>' },
      { role: 'PA', name: '' },
    ],
    crew: [{ id: 1, name: 'Crew Person', position: 'Grip' }],
    talent: [{ id: 1, name: 'Talent Person', position: 'Host' }],
    // Saved before the box existed: no client_review at all.
    wb_items: [
      { uuid: 'u-legacy', item: 'Approve script', owner: 'Client', mode: 'anchor', days: 10, status: 'Not Started' },
      { uuid: 'u-ours', item: 'Edit cut 1', owner: 'Jo Owner', mode: 'anchor', days: 5, status: 'Not Started' },
    ],
  };
  await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [KEY, data.label, JSON.stringify(data), userId]);
  const serverData = async () => (await db.query('SELECT data FROM projects WHERE key=$1', [KEY])).rows[0].data;
  const saved = async uuid => ((await serverData()).wb_items || []).find(w => w.uuid === uuid);

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.setViewport({ width: 1500, height: 950 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), KEY);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, KEY);
  await page.evaluate(() => { st('workback'); wbSetView('list'); });
  await sleep(300);
  const select = uuid => page.evaluate(u => wbSelectItem(wbItems.find(w => _wbData[w].uuid === u)), uuid);
  const ownerInput = '#wb-edit-panel input[list="wb-owner-opts"]';
  // Replace the Owner box's text the way a person would: select all, type.
  const setOwner = async (value, delay) => {
    await page.focus(ownerInput);
    await page.$eval(ownerInput, el => el.select());
    await page.type(ownerInput, value, { delay: delay || 0 });
  };
  const saveNow = async () => { await page.evaluate(() => autosaveNow()); await sleep(600); };

  await step('Owner suggestions: client company, client contact, then Key Personnel (no crew, no talent, no blanks)', async () => {
    await select('u-ours');
    await page.focus(ownerInput);
    const opts = await page.$$eval('#wb-owner-opts option', os => os.map(o => [o.value, o.label]));
    assert(JSON.stringify(opts) === JSON.stringify([
      ['Contoso', 'Client company'], ['Olga Masek', 'Client contact · Contoso'],
      ['Jo Owner', 'Key Personnel · EP'], ['Shaun <b>Parker</b>', 'Key Personnel · Producer'],
    ]), JSON.stringify(opts));
    assert(!(await page.$('#wb-owner-opts b')), 'KP name rendered as HTML');
  });

  await step('An item saved before the box existed shows "Client review" ticked (still approvable)', async () => {
    await select('u-legacy');
    const r = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('wb-ep-review')).display !== 'none', on: document.getElementById('wb-ep-review-cb').checked }));
    assert(r.shown && r.on, JSON.stringify(r));
    await select('u-ours');
    assert(await page.evaluate(() => getComputedStyle(document.getElementById('wb-ep-review')).display === 'none'), 'review box shown for our own task');
  });

  await step('New task: picking the client contact shows "Client review" unticked; typing keeps the cursor in the box', async () => {
    // "+ Add workback item" with nothing selected must open the NEW task
    // (it used to open the last task in the list).
    const added = await page.evaluate(() => { _wbSelectedId = null; wbRender(); wbAddItem(); return { item: _wbData[_wbSelectedId].item, owner: _wbData[_wbSelectedId].owner, n: wbItems.length }; });
    assert(added.item === '' && added.owner === '' && added.n === 3, 'Add opened the wrong task: ' + JSON.stringify(added));
    await sleep(200);
    await setOwner('Olga Masek', 15);
    const r = await page.evaluate(sel => ({
      focused: document.activeElement === document.querySelector(sel), value: document.querySelector(sel).value,
      shown: getComputedStyle(document.getElementById('wb-ep-review')).display !== 'none',
      on: document.getElementById('wb-ep-review-cb').checked, data: _wbData[_wbSelectedId].client_review,
    }), ownerInput);
    assert(r.focused && r.value === 'Olga Masek', 'cursor left the box / value ' + JSON.stringify(r));
    assert(r.shown && !r.on && r.data === false, JSON.stringify(r));
    await page.$eval('#wb-edit-panel', el => el.scrollIntoView());
    await page.screenshot({ path: SHOTS + '/wbo-edit-panel.png' });
  });

  let newUuid;
  await step('Ticking "Client review" saves client_review: true; a Key Personnel owner hides the box again', async () => {
    await page.evaluate(() => { _wbData[_wbSelectedId].item = 'Approve rough cut'; });
    newUuid = await page.evaluate(() => _wbData[_wbSelectedId].uuid);
    await page.click('#wb-ep-review-cb');
    await saveNow();
    const s = await saved(newUuid);
    assert(s && s.client_review === true && s.owner === 'Olga Masek', JSON.stringify(s));
    assert(!('client_review' in (await saved('u-legacy'))), 'legacy item got a client_review on save');
    await setOwner('Jo Owner');
    assert(await page.evaluate(() => getComputedStyle(document.getElementById('wb-ep-review')).display === 'none'), 'box still shown');
    await setOwner('contoso');
    assert(await page.evaluate(() => document.getElementById('wb-ep-review-cb').checked), 'tick lost when owner changed back');
  });

  await step('Table view: client tasks have a Review switch; clicking it toggles and saves', async () => {
    await page.evaluate(() => wbSetView('table'));
    await sleep(300);
    const pills = await page.$$eval('#tab-workback tr .t-review', els => els.map(e => ({ on: e.classList.contains('on'), row: e.closest('tr').innerText.split('\n').join(' ') })));
    assert(pills.length === 2 && pills.every(p => p.on), 'pills ' + JSON.stringify(pills));
    const legacyBtn = await page.evaluateHandle(() => [...document.querySelectorAll('#tab-workback tr .t-review')].find(b => /Approve script/.test(b.closest('tr').innerText)));
    await legacyBtn.click();
    await saveNow();
    assert((await saved('u-legacy')).client_review === false, 'legacy toggle not saved');
    assert(!(await page.evaluate(() => [...document.querySelectorAll('#tab-workback tr .t-review')].find(b => /Approve script/.test(b.closest('tr').innerText)).classList.contains('on'))), 'pill not updated');
    assert(await page.evaluate(() => !document.querySelector('#tab-workback td.t-editing')), 'clicking the switch opened the owner editor');
    await page.screenshot({ path: SHOTS + '/wbo-table.png' });
  });

  await step('Table view owner editor offers the same suggestions and escapes names', async () => {
    const ownerTd = () => page.evaluateHandle(() => [...document.querySelectorAll('#tab-workback tr')].find(r => /Edit cut 1/.test(r.innerText)).querySelectorAll('td')[3]);
    await (await ownerTd()).click();          // selects the row (the table redraws)
    await sleep(300);
    await (await ownerTd()).click({ count: 2, clickCount: 2 }); // newer puppeteer: count

    await page.waitForSelector('#tab-workback td.t-editing input[list="wb-owner-opts"]');
    await page.$eval('#tab-workback td.t-editing input', el => el.select());
    await page.keyboard.type('Shaun <b>Parker</b>');
    await page.keyboard.press('Enter');
    await sleep(200);
    const cell = await page.evaluate(() => { const r = [...document.querySelectorAll('#tab-workback tr')].find(r => /Edit cut 1/.test(r.innerText)); return { text: r.querySelector('.t-owner-name').textContent, bold: !!r.querySelector('.t-owner-name b'), pill: !!r.querySelector('.t-review') }; });
    assert(cell.text === 'Shaun <b>Parker</b>' && !cell.bold && !cell.pill, JSON.stringify(cell));
  });

  await step('Templates keep "Client review": saved with the tick, loaded with it; others load unticked', async () => {
    await page.evaluate(() => { window.prompt = () => 'Review template'; saveCurrentAsTemplate(); });
    const t = await page.evaluate(() => tmplLoad().find(x => x.name === 'Review template'));
    const byItem = Object.fromEntries(t.items.map(i => [i.item, i.client_review === true]));
    assert(byItem['Approve rough cut'] === true && byItem['Approve script'] === false && byItem['Edit cut 1'] === false, JSON.stringify(t.items));
    const loaded = Object.fromEntries(await page.evaluate(tt => wbItemsFromTemplate(tt).map(i => [i.item, i.client_review]), t));
    assert(loaded['Approve rough cut'] === true && loaded['Approve script'] === false && loaded['Edit cut 1'] === false, JSON.stringify(loaded));
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404/.test(e));
  if (relevant.length) console.log('\nBrowser errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
