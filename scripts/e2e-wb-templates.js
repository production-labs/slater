// End-to-end browser test: workback templates ("Load template" and "Save
// current as template"), especially on Post Production.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-wb-templates.js
//
// Fixed 2026-11-05: template items are "days before" the anchor date (the
// Due Date on Post Production). Before, Post Production loaded them in its
// default "sequential" mode, which ignored the days and chained items one
// business day apart from kickoff.
const path = require('path');
const fs = require('fs');
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
const EMAIL = 'wbt-e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/wbt-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DUE = '2027-01-15', EVENT = '2026-12-01';

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Template Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const K = { post: 'cs_wbt_post_' + STAMP, shoot: 'cs_wbt_shoot_' + STAMP };
  const seed = {
    [K.post]: { project_type: 'post_production', project_title: 'Post Template Test', label: 'Post Template Test',
      kickoff_date_iso: '2026-12-10', video_due_date_iso: DUE, schedule_days: [], wb_items: [] },
    [K.shoot]: { project_type: 'location_shoot', project_title: 'Shoot Template Test', label: 'Shoot Template Test',
      kickoff_date_iso: '2026-11-20', schedule_days: [{ id: 'sday_1', date_iso: EVENT, label: 'Shoot', category: 'shoot_day' }], wb_items: [] },
  };
  for (const [key, data] of Object.entries(seed)) {
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

  const openProject = async key => {
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    await sleep(300);
  };
  await openProject(K.post);

  await step('"Load template" on Post Production lands the preset on the Due Date', async () => {
    const r = await page.evaluate(due => {
      loadTemplate(WB_PRESETS.post_production);
      const by = {}; wbItems.forEach(id => { by[_wbData[id].item] = _wbData[id]; });
      return { final: by['Final delivery'].due, lock: by['Picture lock'].due, kickoff: by['Project kickoff / assets received'].due,
        want: { lock: wbBusinessDaysBefore(due, 6), kickoff: wbBusinessDaysBefore(due, 30) },
        modes: [...new Set(wbItems.map(id => _wbData[id].mode))] };
    }, DUE);
    assert(r.final === DUE, 'Final delivery on the due date: ' + r.final);
    assert(r.lock === r.want.lock && r.kickoff === r.want.kickoff, 'offsets: ' + JSON.stringify(r));
    assert(r.modes.length === 1 && r.modes[0] === 'anchor', 'modes ' + r.modes);
  });

  await step('the loaded template survives a save and a page reload', async () => {
    const before = await page.evaluate(() => wbItems.map(id => _wbData[id].due));
    await page.evaluate(() => libSave());
    let saved;
    for (let i = 0; i < 20; i++) { saved = await serverData(K.post); if ((saved.wb_items || []).length) break; await sleep(250); }
    assert(saved.wb_items.length === 12 && saved.wb_items.every(w => w.mode === 'anchor'), 'saved items ' + saved.wb_items.length);
    await openProject(K.post);
    const after = await page.evaluate(() => wbItems.map(id => _wbData[id].due));
    assert(JSON.stringify(before) === JSON.stringify(after), 'dates before ' + before + ' after ' + after);
  });

  await step('saving a chained workback as a template, then loading it, keeps the same dates', async () => {
    const r = await page.evaluate(() => {
      // A hand-built chained (sequential) workback, the Post Production
      // default, plus one fixed-date item.
      wbLoadItems([
        { item: 'Assets in', mode: 'sequential', seq_days: 2 },
        { item: 'Rough cut', mode: 'sequential', seq_days: 5 },
        { item: 'Locked on a date', mode: 'manual', manual_date: '2027-01-08' },
      ]);
      const before = wbItems.map(id => _wbData[id].due);
      const origPrompt = window.prompt; window.prompt = () => 'Chained Round Trip';
      try { saveCurrentAsTemplate(); } finally { window.prompt = origPrompt; }
      const saved = tmplLoad().find(t => t.name === 'Chained Round Trip');
      wbLoadItems([]);
      loadTemplate(saved);
      return { before, after: wbItems.map(id => _wbData[id].due), saved };
    });
    assert(r.saved && r.saved.days_before === true, 'saved template marked days_before: ' + JSON.stringify(r.saved));
    assert(r.before.every(Boolean) && JSON.stringify(r.before) === JSON.stringify(r.after), 'dates before ' + r.before + ' after ' + r.after);
  });

  await step('an old all-zero template (saved before the fix) still loads the old way', async () => {
    const modes = await page.evaluate(() => {
      loadTemplate({ name: 'Old chained', items: [{ item: 'A', owner: '', days: 0 }, { item: 'B', owner: '', days: 0 }] });
      return wbItems.map(id => _wbData[id].mode);
    });
    assert(JSON.stringify(modes) === '["sequential","sequential"]', 'legacy template on Post Production: ' + modes);
    const edited = await page.evaluate(() => {
      loadTemplate({ name: 'Edited', days_before: true, items: [{ item: 'A', days: 0 }, { item: 'B', days: 0 }] });
      return wbItems.map(id => _wbData[id].due);
    });
    assert(JSON.stringify(edited) === JSON.stringify([DUE, DUE]), 'a days_before template with zeros means "on the due date": ' + edited);
  });

  await step('non-Post Production is unchanged: preset counts back from the event day', async () => {
    await openProject(K.shoot);
    const r = await page.evaluate(() => {
      loadTemplate(WB_PRESETS.location_shoot);
      return { sel: document.getElementById('wb_day_select').value, due: wbItems.map(id => [_wbData[id].item, _wbData[id].due, _wbData[id].days, _wbData[id].mode]) };
    });
    assert(r.sel === 'sday_1', 'anchor ' + r.sel);
    const shoot = r.due.find(x => x[0] === 'Shoot day');
    assert(shoot && shoot[1] === EVENT, 'Shoot day on the event date: ' + JSON.stringify(shoot));
    assert(r.due.every(x => x[3] === 'anchor' && (x[2] >= 0 ? x[1] <= EVENT : x[1] > EVENT)), 'items relative to the event: ' + JSON.stringify(r.due));
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
