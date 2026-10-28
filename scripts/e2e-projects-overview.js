// End-to-end browser test: Projects Overview (V1.5) and the closeout checklist.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-projects-overview.js
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
const EMAIL = 'poe2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/po-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rel(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Overview Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;

  const K = { shoot: 'cs_po_shoot_' + STAMP, post: 'cs_po_post_' + STAMP, wrapped: 'cs_po_wrapped_' + STAMP, closed: 'cs_po_closed_' + STAMP };
  const projects = {
    [K.shoot]: {
      project_type: 'location_shoot', project_title: 'Summit Shoot', label: 'Summit Shoot', client_company: 'New Frontier Firm',
      schedule_days: [{ id: 'sday_1', date_iso: rel(3), label: 'Shoot Day', category: 'shoot_day' }],
      wb_items: [
        { uuid: 'u1', item: 'Script V1', owner: 'Shaun', mode: 'manual', manual_date: rel(-1), status: 'In Progress' },
        { uuid: 'u2', item: 'Approve Script V2', owner: 'new frontier firm', mode: 'manual', manual_date: rel(1), status: 'Not Started' },
        { uuid: 'u3', item: 'Kickoff deck', owner: 'Shaun', mode: 'manual', manual_date: rel(-5), status: 'Complete' },
      ],
      crew: [
        { id: 'c1', position: 'DP', name: 'Dana', status: 'confirmed' },
        { id: 'c2', position: 'Gaffer', name: 'Gil', status: 'pencil' },
        { id: 'c3', position: 'A2', name: '', status: 'tbd' },
        { id: 'c4', position: 'PA', name: 'Pat', status: 'declined' },
      ],
      expenses: [{ amount: 100, reimbursable: true }, { amount: 50, reimbursable: false }],
    },
    [K.post]: {
      project_type: 'post_production', project_title: 'Motion Package', label: 'Motion Package', client_company: 'CSA',
      video_due_date_iso: rel(20),
      wb_items: [{ uuid: 'p1', item: 'V2 drafts', owner: 'Kevin', mode: 'manual', manual_date: rel(18), status: 'Not Started' }],
    },
    [K.wrapped]: {
      project_type: 'webinar', project_title: 'Town Hall', label: 'Town Hall', client_company: 'Microsoft',
      schedule_days: [{ id: 'sday_1', date_iso: rel(-10), label: 'Live', category: 'shoot_day' }],
      wb_items: [{ uuid: 'w1', item: 'Deck', owner: 'Client', mode: 'manual', manual_date: rel(-12), status: 'Complete' }],
      expenses: [{ amount: 200, reimbursable: true }],
    },
    [K.closed]: {
      project_type: 'live_broadcast_studio', project_title: 'All Hands', label: 'All Hands', client_company: 'Ralliant',
      schedule_days: [{ id: 'sday_1', date_iso: rel(-3), label: 'Live', category: 'shoot_day' }],
      expenses: [{ amount: 75, reimbursable: false }],
      closeout: { deliverables_sent: true, invoices_in: true, expense_report_sent: true },
    },
  };
  for (const [key, data] of Object.entries(projects)) {
    await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [key, data.label, JSON.stringify(data), userId]);
  }
  const serverData = async key => (await db.query('SELECT data FROM projects WHERE key=$1', [key])).rows[0].data;

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
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

  // Open the shoot project in the form, wait for every project to be cached.
  await page.evaluate(k => localStorage.setItem('slater_last_project', k), K.shoot);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, K.shoot);
  await page.waitForFunction(n => Object.keys(_allProjectsCache).length >= n, { timeout: 8000 }, 4);

  const text = sel => page.$eval(sel, el => el.innerText);
  const card = (key) => page.evaluate(k => { const el = document.querySelector('#po-root .po-pc[data-open="' + k + '"]'); return el ? el.innerText : null; }, key);

  await step('Overview opens from the nav with upcoming / past counts', async () => {
    await page.click('#nav-overview');
    await sleep(200);
    assert(await page.$eval('#po-root', el => el.classList.contains('open')), 'overview not open');
    assert((await text('#po-ct-up')) === '2' && (await text('#po-ct-past')) === '2', 'counts ' + (await text('#po-ct-up')) + '/' + (await text('#po-ct-past')));
    await page.screenshot({ path: SHOTS + '/po-upcoming.png' });
  });

  await step('upcoming card: overdue, waiting on client (owner = client name), crew, open role, expenses', async () => {
    const t = await card(K.shoot);
    assert(t, 'shoot card missing');
    assert(/1 overdue/.test(t), 'overdue: ' + t);
    assert(/1 waiting on client/.test(t), 'waiting: ' + t);
    assert(/1\/3/.test(t), 'crew 1/3 (declined left out): ' + t);
    assert(/Open: A2/.test(t), 'open role: ' + t);
    assert(/\$150/.test(t) && /\$100 reimbursable/.test(t), 'expenses: ' + t);
    assert(/In 3 days/.test(t) && /Shoot Day/.test(t), 'date + next milestone: ' + t);
    assert(/Script V1/.test(t), 'next task is the overdue one: ' + t);
    assert(/Workback 33% done/.test(t), 'progress: ' + t);
    const edge = await page.$eval('#po-root .po-pc[data-open="' + K.shoot + '"] .po-edge', el => el.className);
    assert(/red/.test(edge), 'red edge: ' + edge);
  });

  await step('upcoming KPIs add up across projects', async () => {
    const k = await page.$$eval('#po-root .po-kpi', els => els.map(e => e.querySelector('.po-kpi-v').innerText));
    assert(JSON.stringify(k) === JSON.stringify(['2', '1', '1', '2', '1']), 'kpis ' + JSON.stringify(k));
  });

  await step('portfolio timeline has a lane per upcoming project; range chips work', async () => {
    let lanes = await page.$$eval('#po-root .po-pt-lane', els => els.length);
    assert(lanes === 2, '6w lanes ' + lanes);
    await page.click('#po-root [data-chip="range"][data-val="2w"]');
    lanes = await page.$$eval('#po-root .po-pt-lane', els => els.length);
    assert(lanes === 1, '2w lanes (post project is 20 days out) ' + lanes);
    await page.click('#po-root [data-chip="range"][data-val="6w"]');
  });

  await step('search filters cards', async () => {
    await page.type('#po-q', 'csa');
    const n = await page.$$eval('#po-root .po-list .po-pc', els => els.length);
    assert(n === 1 && (await card(K.post)), 'search result count ' + n);
    await page.$eval('#po-q', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
  });

  await step('past tab: closed project hidden by default; pills follow the light-version rules', async () => {
    await page.click('#po-root .po-tab[data-tab="past"]');
    assert(!(await card(K.closed)), 'closed project should be hidden under "Not closed out"');
    const t = await card(K.wrapped);
    assert(t && /Workback complete/.test(t) && /Reimbursed/.test(t) && /4 open items/.test(t), 'wrapped card: ' + t);
    const k = await page.$$eval('#po-root .po-kpi', els => els.map(e => e.querySelector('.po-kpi-v').innerText));
    const now = new Date(), qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const closedQ = new Date(rel(-3) + 'T12:00:00') >= qStart ? '1' : '0';
    assert(JSON.stringify(k) === JSON.stringify(['1', '$200', '$200', closedQ]), 'past kpis ' + JSON.stringify(k));
    await page.click('#po-root [data-chip="pastFilter"][data-val="all"]');
    const c = await card(K.closed);
    assert(c && /Closed out/.test(c), 'closed card: ' + c);
    assert(!/Reimbursed/.test(c), 'no Reimbursed pill when nothing is reimbursable: ' + c);
    assert(!/Workback complete/.test(c), 'no Workback pill when there is no workback: ' + c);
    await page.screenshot({ path: SHOTS + '/po-past.png' });
  });

  await step('ticking a closeout pill on a project that is not open saves it to the server', async () => {
    await page.click('#po-root [data-co="deliverables_sent"][data-key="' + K.wrapped + '"]');
    await sleep(800);
    const d = await serverData(K.wrapped);
    assert(d.closeout && d.closeout.deliverables_sent === true, 'server closeout ' + JSON.stringify(d.closeout));
    assert(/3 open items/.test(await card(K.wrapped)), 'card re-rendered');
    assert(await page.$eval('#po-root', el => el.classList.contains('open')), 'clicking a pill must not open the project');
    // untick
    await page.click('#po-root [data-co="deliverables_sent"][data-key="' + K.wrapped + '"]');
    await sleep(800);
    assert(!(await serverData(K.wrapped)).closeout.deliverables_sent, 'untick saved');
  });

  const activeTab = () => page.evaluate(() => (document.querySelector('.sec.active') || {}).id);

  await step('clicking "Workback complete" opens that project on the Workback tab', async () => {
    await page.click('#po-root .po-pc[data-open="' + K.wrapped + '"] [data-open-tab="workback"]');
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, K.wrapped);
    assert(!(await page.$eval('#po-root', el => el.classList.contains('open'))), 'overview still open');
    assert((await activeTab()) === 'tab-workback', 'active tab ' + (await activeTab()));
  });

  await step('clicking a card opens that project on the Project tab and closes the overview', async () => {
    await page.click('#nav-overview');
    await page.click('#po-root .po-tab[data-tab="upcoming"]');
    await page.click('#po-root .po-pc[data-open="' + K.post + '"] .po-name');
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, K.post);
    assert(!(await page.$eval('#po-root', el => el.classList.contains('open'))), 'overview still open');
    assert((await activeTab()) === 'tab-project', 'active tab ' + (await activeTab()));
    // back to the wrapped project for the next step
    await page.click('#nav-overview');
    await page.click('#po-root .po-tab[data-tab="past"]');
    await page.click('#po-root .po-pc[data-open="' + K.wrapped + '"] .po-name');
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, K.wrapped);
  });

  await step('ticking a pill on the OPEN project goes through autosave and survives it', async () => {
    await page.click('#nav-overview');
    await page.click('#po-root .po-tab[data-tab="past"]');
    await page.click('#po-root [data-co="reimbursed"][data-key="' + K.wrapped + '"]');
    await page.evaluate(() => autosaveNow());
    await sleep(800);
    const d = await serverData(K.wrapped);
    assert(d.closeout && d.closeout.reimbursed === true, 'server closeout ' + JSON.stringify(d.closeout));
    assert(await page.evaluate(() => gather().closeout.reimbursed === true), 'form state has it');
  });

  await step('a project nav tab closes the overview', async () => {
    await page.click('.app-nav-item[data-tab="schedule"]');
    assert(!(await page.$eval('#po-root', el => el.classList.contains('open'))), 'overview still open');
  });

  await step('Rundown (refactored onto the shared date helper) still lists overdue + due-soon items', async () => {
    await page.evaluate(() => { if (!sidebarOpen) toggleSidebar(); else refreshSidebar(); });
    await sleep(300);
    const t = await text('#daily-body');
    assert(/Script V1/.test(t), 'overdue item in Rundown: ' + t.slice(0, 300));
    assert(/Approve Script V2/.test(t), 'due-tomorrow item in Rundown');
    assert(!/Kickoff deck/.test(t), 'complete item left out');
  });

  await step('New Project starts with an empty closeout', async () => {
    await page.evaluate(() => libNew());
    await sleep(300);
    assert(await page.evaluate(() => Object.keys(gather().closeout).length === 0), 'closeout not reset');
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
