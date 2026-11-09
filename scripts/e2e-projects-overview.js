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
      wb_items: [
        // First item, no kickoff: nothing before it, so it's with the client now.
        { uuid: 'p0', item: 'Approve storyboards', owner: 'Client', mode: 'manual', manual_date: rel(16), status: 'Not Started' },
        { uuid: 'p1', item: 'V2 drafts', owner: 'Kevin', mode: 'manual', manual_date: rel(18), status: 'Not Started' },
        // After our V2 drafts, not due yet: coming up, not held up.
        { uuid: 'p2', item: 'Approve V2 drafts', owner: 'Client', mode: 'sequential', seq_anchor_uuid: 'p1', due: rel(19), status: 'Not Started' },
      ],
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

  await step('upcoming card: overdue, client step held up by us (owner = client name), crew, open role, expenses', async () => {
    const t = await card(K.shoot);
    assert(t, 'shoot card missing');
    assert(/1 overdue/.test(t), 'overdue: ' + t);
    // Approve Script V2 follows Script V1, which is ours and overdue.
    assert(/1 client step held up by us/.test(t) && !/with client/.test(t), 'held up: ' + t);
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
    // Active, Next 7 days, Overdue, Unconfirmed, With clients, Held up by us
    assert(JSON.stringify(k) === JSON.stringify(['2', '1', '1', '2', '1', '1']), 'kpis ' + JSON.stringify(k));
    const sub = await page.$$eval('#po-root .po-kpi', els => els[4].querySelector('.po-kpi-s').textContent);
    assert(sub === 'across 1 project, 2 coming up', 'with clients sub (coming up includes the held-up one): ' + sub);
    const post = await card(K.post);
    assert(/1 with client/.test(post) && !/held up/.test(post), 'post card: ' + post);
  });

  await step('portfolio timeline has a lane per upcoming project; range chips work', async () => {
    let lanes = await page.$$eval('#po-root .po-pt-lane', els => els.length);
    assert(lanes === 2, '6w lanes ' + lanes);
    await page.click('#po-root [data-chip="range"][data-val="2w"]');
    lanes = await page.$$eval('#po-root .po-pt-lane', els => els.length);
    assert(lanes === 1, '2w lanes (post project is 20 days out) ' + lanes);
    await page.click('#po-root [data-chip="range"][data-val="6w"]');
  });

  await step('portfolio timeline: single-day items are not ranges; chained items run from their "After:"', async () => {
    const bars = await page.$$eval('#po-root .po-pt-bar', els => els.map(e => ({ tip: e.getAttribute('data-tip'), width: parseFloat(e.style.width) })));
    const bar = name => bars.find(b => b.tip.includes('<b>' + name + '</b>'));
    ['Script V1', 'Approve Script V2', 'V2 drafts', 'Approve storyboards'].forEach(n => {
      const b = bar(n);
      assert(b, 'bar missing: ' + n);
      assert(!b.tip.includes('→') && b.width === 0.6, n + ' should be one day: ' + JSON.stringify(b));
    });
    const chained = bar('Approve V2 drafts');
    assert(chained && chained.tip.includes('→') && chained.width > 0.6, 'chained item should be a range: ' + JSON.stringify(chained));
  });

  await step('bar start rule: chained items resolve every kind of "After:" on a project that is not open', async () => {
    const got = await page.evaluate(() => {
      const sheet = {
        kickoff_date_iso: '2026-11-02', video_due_date_iso: '2026-12-01',
        schedule_days: [{ id: 'sday_1', date_iso: '2026-11-10' }],
        wb_items: [
          { uuid: 'a', item: 'Anchor', mode: 'anchor', due: '2026-11-20' },
          { uuid: 'm', item: 'Manual', mode: 'manual', manual_date: '2026-11-21', due: '2026-11-21' },
          { uuid: 'k', item: 'After kickoff', mode: 'sequential', seq_anchor_uuid: 'kickoff', due: '2026-11-04' },
          { uuid: 'd', item: 'After day', mode: 'sequential', seq_anchor_uuid: 'pin_sday_1', due: '2026-11-12' },
          { uuid: 'v', item: 'After due', mode: 'sequential', seq_anchor_uuid: 'video_due', due: '2026-12-03' },
          // Points at an item further down the list.
          { uuid: 'l', item: 'After later row', mode: 'sequential', seq_anchor_uuid: 'z', due: '2026-11-26' },
          { uuid: 'z', item: 'Later row', mode: 'manual', manual_date: '2026-11-25', due: '2026-11-25' },
          { uuid: 'n', item: 'No link', mode: 'sequential', due: '2026-11-05' },
        ],
      };
      return projectWorkbackDates(sheet).items.reduce((o, i) => (o[i.uuid] = i.start, o), {});
    });
    const want = { a: '2026-11-20', m: '2026-11-21', k: '2026-11-02', d: '2026-11-10', v: '2026-12-01', l: '2026-11-25', z: '2026-11-25', n: '2026-11-02' };
    assert(JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  });

  await step('double bookings show on the cards and count as needing attention', async () => {
    // Injected into the in-page cache only (not the database), so the counts
    // the other steps check stay as they are. Removed again at the end.
    const X = { a: 'cs_po_dblA_' + STAMP, b: 'cs_po_dblB_' + STAMP, c: 'cs_po_dblC_' + STAMP, d: 'cs_po_dblD_' + STAMP };
    const day = [{ id: 'sday_1', date_iso: rel(10), label: 'Shoot', category: 'shoot_day' }];
    const inject = {
      // 9001: Confirmed here, 1st Hold on B -> red. 9002: Pencil here (KP), Confirmed on C -> possible.
      [X.a]: { project_title: 'Dbl Alpha', schedule_days: day,
        crew: [{ id: 'c1', position: 'DP', name: 'Dana Dbl', contact_id: 9001, status: 'confirmed' }],
        kp_cards: [{ _id: 'k1', role: 'Producer', name: 'Kim Dbl', contact_id: 9002, status: 'pencil' }] },
      [X.b]: { project_title: 'Dbl Bravo', schedule_days: day,
        crew: [{ id: 'c1', position: 'DP', name: 'Dana Dbl', contact_id: 9001, status: 'hold' }] },
      [X.c]: { project_title: 'Dbl Charlie', schedule_days: day,
        talent: [{ id: 't1', title: 'Host', name: 'Kim Dbl', contact_id: 9002, status: 'confirmed' }] },
      // 9003 is only on this project: no clash.
      [X.d]: { project_title: 'Dbl Delta', schedule_days: day,
        crew: [{ id: 'c1', position: 'PA', name: 'Tess Dbl', contact_id: 9003, status: 'tbd' }] },
    };
    await page.evaluate(inj => {
      Object.keys(inj).forEach(k => { _allProjectsCache[k] = { label: inj[k].project_title, data: inj[k] }; });
      ProjectsOverview.refresh();
    }, inject);
    try {
      const edge = k => page.$eval('#po-root .po-pc[data-open="' + k + '"] .po-edge', el => el.className);
      const a = await card(X.a), b = await card(X.b), c = await card(X.c), d = await card(X.d);
      assert(/1 double-booked/.test(a) && /1 possible double booking/.test(a), 'alpha flags: ' + a);
      assert(/red/.test(await edge(X.a)), 'alpha edge ' + (await edge(X.a)));
      assert(/1 double-booked/.test(b) && !/possible/.test(b), 'bravo flags: ' + b);
      assert(/red/.test(await edge(X.b)), 'bravo edge ' + (await edge(X.b)));
      assert(/1 possible double booking/.test(c) && !/double-booked/.test(c), 'charlie flags: ' + c);
      assert(/yellow/.test(await edge(X.c)), 'charlie edge ' + (await edge(X.c)));
      assert(/On track/.test(d) && !/double/.test(d), 'delta has no clash: ' + d);
      const tip = await page.$eval('#po-root .po-pc[data-open="' + X.a + '"] .po-flag.red', el => el.title);
      assert(/Dana Dbl/.test(tip) && /Dbl Bravo/.test(tip), 'tooltip names who and where: ' + tip);

      await page.click('#po-root [data-chip="filter"][data-val="attention"]');
      const shown = await page.$$eval('#po-root .po-list .po-pc', els => els.map(e => e.dataset.open));
      [X.a, X.b, X.c, K.shoot].forEach(k => assert(shown.includes(k), 'needs attention missing ' + k + ': ' + shown));
      [X.d, K.post].forEach(k => assert(!shown.includes(k), 'needs attention should not show ' + k));
      await page.screenshot({ path: SHOTS + '/po-double-bookings.png' });
    } finally {
      await page.evaluate(keys => { keys.forEach(k => { delete _allProjectsCache[k]; }); }, Object.values(X));
      await page.click('#po-root [data-chip="filter"][data-val="all"]');
    }
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
    // Due one calendar day out. On a Friday or Saturday that is a weekend day
    // (This Weekend); it used to fall between groups and vanish.
    assert(/Approve Script V2/.test(t), 'due-tomorrow item in Rundown: ' + t.replace(/\s+/g, ' ').slice(0, 300));
    assert(!/Kickoff deck/.test(t), 'complete item left out');
  });

  await step('Rundown date groups are right on every day of the week (no gaps at weekends)', async () => {
    // Mon 2026-11-02 .. Sun 2026-11-08, then each date from the day before to
    // 16 days out. Expected group by hand-written rule, compared to the app's.
    const bad = await page.evaluate(() => {
      const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
      const out = [];
      for (let day = 2; day <= 8; day++) {
        const now = new Date(2026, 10, day, 15, 30);
        const r = rundownRanges(now);
        for (let n = -1; n <= 16; n++) {
          const due = new Date(2026, 10, day + n), dow = due.getDay(), nowDow = now.getDay();
          // Hand-written expectation.
          // Next business day: Monday from a Friday (3 days) or Saturday (2), else 1 day.
          const nextBiz = nowDow === 5 ? 3 : nowDow === 6 ? 2 : 1;
          const toSunday = 7 - nowDow; // on a Sunday: next Sunday
          let want;
          if (n < 0) want = 'overdue';
          else if (n === 0) want = 'today';
          else if (n < nextBiz) want = 'weekend';
          else if (n === nextBiz) want = 'tomorrow';
          else if (n <= toSunday) want = 'this-week';
          else if (n <= toSunday + 7) want = 'next-week';
          else want = null;
          if (want === 'weekend' && dow !== 0 && dow !== 6) out.push('test bug: weekday in weekend ' + iso(due));
          const got = rundownBucket(iso(due), r);
          if (got !== want) out.push(iso(now) + ' (' + 'SuMoTuWeThFrSa'.substr(nowDow * 2, 2) + ') due ' + iso(due) + ': got ' + got + ', want ' + want);
          if (n > 0 && n <= 7 && got === null) out.push('GAP ' + iso(now) + ' due ' + iso(due));
        }
        // Heading: "Due Tomorrow" Sun-Thu, "Due Monday" Fri/Sat.
        if (r.tomorrowIsNextDay !== !(now.getDay() === 5 || now.getDay() === 6)) out.push('tomorrowIsNextDay wrong on ' + iso(now));
      }
      return out;
    });
    assert(bad.length === 0, bad.slice(0, 6).join(' | '));
  });

  await step('Rundown shows a This Weekend group (with the day) and "Due Monday" when tomorrow is a weekend day', async () => {
    // Pretend the next calendar day is a weekend day: Approve Script V2 (due in
    // 1 day) belongs to This Weekend, and the next business day is 2 days out.
    const t = await page.evaluate(rel => {
      const real = window.rundownRanges;
      window.rundownRanges = () => ({ today: rel[0], tomorrow: rel[2], tomorrowIsNextDay: false, endOfWeek: rel[2], endOfNextWeek: rel[9] });
      try { refreshSidebar(); } finally { window.rundownRanges = real; }
      const sec = [...document.querySelectorAll('#daily-body .daily-section')].map(s => s.innerText.replace(/\s+/g, ' '));
      refreshSidebar();
      return sec;
    }, Array.from({ length: 10 }, (_, n) => rel(n)));
    const wk = t.find(s => /^THIS WEEKEND \(1\)/i.test(s));
    assert(wk && /Approve Script V2/.test(wk), 'weekend group: ' + JSON.stringify(t).slice(0, 400));
    const d = new Date(rel(1) + 'T12:00:00');
    const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate();
    assert(wk.includes(label), 'weekend item shows its day (' + label + '): ' + wk);
    assert(!t.some(s => /^DUE TOMORROW/i.test(s)), 'still says Due Tomorrow: ' + JSON.stringify(t).slice(0, 300));
    const order = t.map(s => s.split(' (')[0].toUpperCase());
    assert(order.indexOf('OVERDUE') < order.indexOf('THIS WEEKEND'), 'order ' + order.join());
  });

  await step('"Due Monday" heading is used for the next business day after a weekend', async () => {
    const t = await page.evaluate(rel => {
      const real = window.rundownRanges;
      // Pretend the next business day (Approve Script V2, 1 day out) is a Monday after a weekend.
      window.rundownRanges = () => ({ today: rel[0], tomorrow: rel[1], tomorrowIsNextDay: false, endOfWeek: rel[1], endOfNextWeek: rel[8] });
      try { refreshSidebar(); } finally { window.rundownRanges = real; }
      const s = document.getElementById('daily-body').innerText.replace(/\s+/g, ' ');
      refreshSidebar();
      return s;
    }, Array.from({ length: 10 }, (_, n) => rel(n)));
    assert(/DUE MONDAY \(1\) Approve Script V2/i.test(t), t.slice(0, 300));
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
