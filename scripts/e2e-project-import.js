// End-to-end browser test: bulk project import from a spreadsheet
// (public/project-import.js).
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-project-import.js
//
// Builds a real .xlsx (true Excel date and time cells, mixed-case and
// synonym headers, a blank row, an unknown column) with the same SheetJS
// build the app vendors, imports it through the UI with the browser in
// Pacific time, and checks what landed in the database, that the project
// open at the time was never touched, and that the app's own code reads
// the imported projects the way it reads hand-made ones.
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3993, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
const XLSX_FILE = '/tmp/cv2-e2e/import-test.xlsx', CSV_FILE = '/tmp/cv2-e2e/import-test.csv';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'pie2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/pi-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The vendored SheetJS, loaded the way the browser loads it.
function loadXLSX() {
  const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(APP + '/public/lib/xlsx.full.min.js', 'utf8'), ctx);
  return ctx.XLSX;
}
// Excel serial for a calendar date (1900 system), computed in UTC so this
// script's own time zone can't shift it.
const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

function buildWorkbook(X) {
  const header = ['project title', 'Project Type', 'AGENCY', 'Client', 'Billing Code', 'Kickoff', 'Event Date', 'Go Live Time', 'Template', 'Internal Notes'];
  const rows = [
    /* r2 */ ['Keynote Shoot', 'Location Shoot', 'Bravo Agency', 'Contoso Client', 'PO-1', serial(2026, 11, 20), serial(2026, 12, 1), 0.375, 'Location Shoot (Preset)', ''],
    /* r3 */ ['Highlight Video', 'post production', '', 'Contoso Client', '', '12/10/2026', '2027-01-15', '5pm', 'My Post Template', ''],
    /* r4 */ ['', '', '', '', '', '', '', '', '', 'spacer row, only an unknown column'],
    /* r5 */ ['Twin Test', 'Webinar', 'Nope Agency', 'Twin Co', '', '', '', '', 'No Such Template', ''],
    /* r6 */ ['', 'Location Shoot', '', '', '', '', '', '', '', ''],
    /* r7 */ ['Bad Type', 'Podcast', '', '', '', '', '', '', '', ''],
    /* r8 */ ['Dup Project', 'Location Shoot', 'Bravo Agency', 'Contoso Client', '', '', serial(2026, 12, 1), '', '', ''],
    /* r9 */ ['Bad Date', 'Webinar', '', '', '', '', '13/45/2026', 'noonish', '', ''],
    /* r10 */ ['Keynote Shoot', 'Location Shoot', 'Bravo Agency', 'Contoso Client', '', '', serial(2026, 12, 1), '', '', ''],
  ];
  const ws = X.utils.aoa_to_sheet([header].concat(rows));
  // Give the number cells real Excel date / time formats, like a typed-in sheet.
  ['F2', 'G2', 'G8', 'G10'].forEach(a => { ws[a].z = 'yyyy-mm-dd'; });
  ws.H2.z = 'h:mm AM/PM';
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Projects');
  fs.writeFileSync(XLSX_FILE, Buffer.from(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))));
  fs.writeFileSync(CSV_FILE, 'Project Title,Project Type,Due / Event Date,Due / Event Time\nCSV Shoot,Location Shoot,2026-12-03,2:30 PM\n');
}

async function main() {
  buildWorkbook(loadXLSX());

  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Import Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const org = async (name, isAgency, tz) => (await db.query(
    `INSERT INTO organizations (owner_id, name, is_agency, timezone) VALUES ($1,$2,$3,$4) RETURNING id`, [userId, name, isAgency, tz || null])).rows[0].id;
  const O = {
    alpha: await org('Alpha Agency', true, 'ET'),   // the default agency
    bravo: await org('Bravo Agency', true, 'CT'),   // named in the sheet; its timezone must NOT be applied
    contoso: await org('Contoso Client', false),
    twin1: await org('Twin Co', false), twin2: await org('twin co', false), // ambiguous
  };
  await db.query('UPDATE users SET default_organization_id=$1 WHERE id=$2', [O.alpha, userId]);

  const K = { open: 'cs_pi_open_' + STAMP, dup: 'cs_pi_dup_' + STAMP };
  const seed = {
    [K.open]: { project_type: 'location_shoot', project_title: 'Already Open', label: 'Already Open', schedule_days: [{ id: 'sday_1', date_iso: '2026-12-20', label: 'Shoot', category: 'shoot_day' }] },
    [K.dup]: { project_type: 'location_shoot', project_title: 'Dup Project', label: 'Contoso Client | Dup Project | 12/01/26', client_company: 'Contoso Client' },
  };
  for (const [key, data] of Object.entries(seed)) {
    await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [key, data.label, JSON.stringify(data), userId]);
  }
  const before = new Set((await db.query('SELECT key FROM projects WHERE owner_id=$1', [userId])).rows.map(r => r.key));
  const newRows = async () => (await db.query('SELECT key, label, data, agency_org_id, client_org_id FROM projects WHERE owner_id=$1', [userId])).rows.filter(r => !before.has(r.key));

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); global.__page = page;
  await page.emulateTimezone('America/Los_Angeles'); // where cellDates-style parsing used to shift times
  await page.setViewport({ width: 1500, height: 950 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);

  // A saved custom workback template, where the app keeps them (localStorage).
  await page.evaluate(k => {
    localStorage.setItem('slater_wb_templates', JSON.stringify([{ id: 'tmpl_1', name: 'My Post Template', items: [{ item: 'Assets in', owner: 'Ed', days: 10 }, { item: 'First cut', owner: 'Ed', days: 5 }] }]));
    localStorage.setItem('slater_last_project', k);
  }, K.open);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, K.open);
  await page.waitForFunction(() => window.ContactsV2 && ContactsV2.store.loaded, { timeout: 8000 });
  await sleep(500);
  const openFormBefore = await page.evaluate(() => JSON.stringify(gather()));

  const previewRows = () => page.$$eval('#import-body tbody tr', trs => trs.map(tr => {
    const td = tr.querySelectorAll('td'); const cb = td[0].querySelector('input');
    return { row: td[1].innerText.trim(), name: td[2].innerText, notes: td[4].innerText, checked: cb.checked, disabled: cb.disabled };
  }));

  await step('Import button opens the modal; sample template has the documented columns', async () => {
    await page.click('#lib-action-row button[onclick="ProjectImport.open()"]');
    await page.waitForSelector('#import-modal.open #import-file-input', { timeout: 3000 });
    const sample = await page.evaluate(() => {
      const orig = XLSX.writeFile; let got = null;
      XLSX.writeFile = (wb, name) => { got = { name, rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) }; };
      try { ProjectImport._downloadSample(); } finally { XLSX.writeFile = orig; }
      return got;
    });
    assert(sample && /\.xlsx$/.test(sample.name), 'sample file name ' + (sample && sample.name));
    assert(JSON.stringify(sample.rows[0]) === JSON.stringify(['Project Title', 'Project Type', 'Agency', 'Client Company', 'Billing Code', 'Kickoff Date', 'Due / Event Date', 'Due / Event Time', 'Workback Template']), 'sample headers ' + JSON.stringify(sample.rows[0]));
    assert(sample.rows.length === 3, 'two example rows');
  });

  let rows;
  await step('preview: real Excel row numbers, blank row skipped, unknown column noted', async () => {
    const input = await page.$('#import-file-input');
    await input.uploadFile(XLSX_FILE);
    await page.waitForSelector('#import-body tbody tr', { timeout: 8000 });
    rows = await previewRows();
    assert(JSON.stringify(rows.map(r => r.row)) === JSON.stringify(['2', '3', '5', '6', '7', '8', '9', '10']), 'row numbers ' + rows.map(r => r.row));
    const body = await page.$eval('#import-body', el => el.innerText);
    assert(/Ignored columns \(not recognized\): Internal Notes/.test(body), 'ignored-column note: ' + body.slice(0, 300));
    await page.screenshot({ path: SHOTS + '/pi-preview.png' });
  });

  const R = n => rows.find(r => r.row === String(n));
  await step('preview: shows the real project name and the default agency', async () => {
    assert(/Contoso Client \| Keynote Shoot \| 12\/01\/26/.test(R(2).name), 'label shown: ' + R(2).name);
    assert(/Default agency: Alpha Agency/.test(R(3).notes), 'default agency note: ' + R(3).notes);
    assert(!/Default agency/.test(R(5).notes), 'a named-but-missing agency must not fall back to the default');
  });

  await step('preview: problems are called out, with the right rows blocked or unchecked', async () => {
    assert(R(2).checked && /Ready/.test(R(2).notes), 'row 2 ready: ' + R(2).notes);
    assert(R(3).checked, 'row 3 checked');
    assert(R(5).checked && /"Twin Co" matches 2 organizations/.test(R(5).notes) && /"Nope Agency" not found/.test(R(5).notes) && /"No Such Template" not found/.test(R(5).notes), 'row 5 notes: ' + R(5).notes);
    assert(R(6).disabled && !R(6).checked && /Missing project title/.test(R(6).notes), 'row 6 blocked');
    assert(!/Default agency/.test(R(6).notes), 'no default-agency note on a blocked row');
    assert(R(7).disabled && /Unrecognized project type "Podcast"/.test(R(7).notes), 'row 7 blocked');
    assert(!R(8).disabled && !R(8).checked && /already exists/.test(R(8).notes), 'row 8 duplicate of an existing project, unchecked: ' + R(8).notes);
    assert(R(9).checked && /Could not read Due \/ Event Date "13\/45\/2026"/.test(R(9).notes) && /Time given without a Due \/ Event Date/.test(R(9).notes), 'row 9 notes: ' + R(9).notes);
    assert(!R(10).checked && /Same project as row 2/.test(R(10).notes), 'row 10 same-file duplicate: ' + R(10).notes);
    const btn = await page.$eval('#import-commit-btn', b => b.textContent);
    assert(btn === 'Import 4 projects', 'button: ' + btn);
  });

  let made;
  await step('import saves exactly the selected rows, then shows a summary', async () => {
    await page.click('#import-commit-btn');
    await page.waitForFunction(() => /Imported/.test(document.getElementById('import-body').innerText), { timeout: 10000 });
    const body = await page.$eval('#import-body', el => el.innerText);
    assert(/Imported 4 of 4/.test(body), 'summary: ' + body);
    // Follow-ups survive the preview: Twin Test and Bad Date need a look, Keynote doesn't.
    assert(/Needs a look:/.test(body) && /Twin Co \| Twin Test[\s\S]*matches 2 organizations/.test(body) && /Bad Date[\s\S]*Could not read/.test(body), 'follow-up list: ' + body);
    assert(!/Keynote Shoot\n/.test(body.split('Needs a look:')[1] || ''), 'clean rows not listed');
    made = await newRows();
    assert(made.length === 4, 'new projects in DB: ' + made.map(r => r.label));
    await page.screenshot({ path: SHOTS + '/pi-done.png' });
  });

  const P = title => made.find(r => r.data.project_title === title);
  await step('location shoot: label, links, schedule day with exact 9:00 AM go-live, preset workback', async () => {
    const p = P('Keynote Shoot'), d = p.data;
    assert(p.label === 'Contoso Client | Keynote Shoot | 12/01/26' && d.label === p.label, 'label ' + p.label);
    assert(p.agency_org_id === O.bravo && p.client_org_id === O.contoso, 'org columns ' + p.agency_org_id + '/' + p.client_org_id);
    assert(d.timezone === 'PT', 'a named agency keeps PT, like picking it by hand: ' + d.timezone);
    assert(d.billing_code === 'PO-1' && d.kickoff_date_iso === '2026-11-20', 'billing/kickoff');
    assert(d.schedule_days.length === 1 && d.schedule_days[0].id === 'sday_1' && d.schedule_days[0].date_iso === '2026-12-01', 'schedule day ' + JSON.stringify(d.schedule_days));
    assert(d.schedule_days[0].golive === '9:00 AM', 'go-live time (time zone safe): ' + d.schedule_days[0].golive);
    assert(d.schedule_days[0].date === 'Tuesday 1 December 2026', 'display date ' + d.schedule_days[0].date);
    assert(d.video_due_date_iso === '' && d.wb_items.length === 11 && d.wb_items.every(w => w.mode === 'anchor'), 'workback ' + d.wb_items.length);
    assert(typeof d.savedAt === 'number' && /^cs_/.test(p.key), 'savedAt / key');
    assert(d.crew.length === 0 && d.talent.length === 0 && d.kp_cards.length === 2, 'crew/talent empty, default KP');
  });

  await step('post production: default agency + its timezone, due date/time, custom template', async () => {
    const p = P('Highlight Video'), d = p.data;
    assert(p.agency_org_id === O.alpha && d.timezone === 'ET', 'default agency ' + p.agency_org_id + ', tz ' + d.timezone);
    assert(d.kickoff_date_iso === '2026-12-10' && d.video_due_date_iso === '2027-01-15' && d.video_due_time === '5:00 PM', 'dates ' + d.kickoff_date_iso + ' ' + d.video_due_date_iso + ' ' + d.video_due_time);
    assert(d.schedule_days.length === 0, 'no schedule day for post');
    assert(d.wb_items.length === 2 && d.wb_items[0].item === 'Assets in' && d.wb_items[0].mode === 'sequential', 'custom template ' + JSON.stringify(d.wb_items));
    assert(p.label === 'Contoso Client | Highlight Video | 01/15/27', 'label ' + p.label);
  });

  await step('unmatched names stay as plain text with no link; ambiguous client not guessed', async () => {
    const t = P('Twin Test');
    assert(t.agency_org_id === null && t.client_org_id === null && t.data.client_company === 'Twin Co' && t.data.wb_items.length === 0, 'twin ' + JSON.stringify([t.agency_org_id, t.client_org_id, t.data.client_company]));
    const b = P('Bad Date');
    assert(b.agency_org_id === O.alpha && b.data.schedule_days.length === 0, 'bad date row');
  });

  await step('the project that was open is untouched; list and Rundown cache picked up the new ones', async () => {
    assert(await page.evaluate(() => _formKey) === K.open, 'still on the open project');
    assert(await page.evaluate(() => JSON.stringify(gather())) === openFormBefore, 'open project form changed');
    await page.waitForFunction(keys => keys.every(k => _allProjectsCache[k]), { timeout: 8000 }, made.map(r => r.key));
    const opts = await page.$$eval('#lib-select option', os => os.map(o => o.textContent));
    assert(opts.some(t => /Keynote Shoot/.test(t)) && opts.some(t => /Highlight Video/.test(t)), 'dropdown: ' + opts.join(' / '));
    assert(await page.$eval('#lib-select', s => s.value) === K.open, 'dropdown selection kept');
  });

  await step('opening the imported shoot: workback anchors to the event day, not kickoff', async () => {
    await page.click('#import-foot .lb.primary'); // Done
    const key = P('Keynote Shoot').key;
    await page.evaluate(k => { document.getElementById('lib-select').value = k; libSelect(); }, key);
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    await sleep(300);
    const s = await page.evaluate(() => ({ sel: document.getElementById('wb_day_select').value, due: Object.values(_wbData).map(d => [d.item, d.due, d.days]) }));
    assert(s.sel === 'sday_1', 'anchor selector ' + s.sel);
    const shoot = s.due.find(x => x[0] === 'Shoot day');
    assert(shoot && shoot[1] === '2026-12-01', 'Shoot day due ' + JSON.stringify(shoot));
    // Positive offsets count back from the event, negative ones forward
    // (the preset's post-shoot items). Anchored to kickoff (2026-11-20),
    // the "-5" rough cut would land before the shoot.
    assert(s.due.every(x => x[1] && (x[2] >= 0 ? x[1] <= '2026-12-01' : x[1] > '2026-12-01')), 'items relative to the event: ' + JSON.stringify(s.due));
    assert(await page.$eval('#lib-select', s => s.value) === key, 'opened from the list');
  });

  await step('a CSV file imports too (text dates and times)', async () => {
    await page.click('#lib-action-row button[onclick="ProjectImport.open()"]');
    await page.waitForSelector('#import-modal.open #import-file-input', { timeout: 3000 });
    await (await page.$('#import-file-input')).uploadFile(CSV_FILE);
    await page.waitForSelector('#import-commit-btn', { timeout: 8000 });
    await page.click('#import-commit-btn');
    await page.waitForFunction(() => /Imported 1 of 1/.test(document.getElementById('import-body').innerText), { timeout: 10000 });
    const c = (await newRows()).find(r => r.data.project_title === 'CSV Shoot');
    assert(c && c.data.schedule_days[0].date_iso === '2026-12-03' && c.data.schedule_days[0].golive === '2:30 PM', 'csv ' + (c && JSON.stringify(c.data.schedule_days)));
    assert(c.agency_org_id === O.alpha, 'csv default agency');
  });

  if (/Error/.test(serverLog)) console.log('\nServer log (errors):\n' + serverLog.split('\n').filter(l => /Error/i.test(l)).join('\n'));
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try {
    if (userId) {
      await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]);
      await db.query('UPDATE users SET default_organization_id=NULL WHERE id=$1', [userId]);
      await db.query('DELETE FROM organizations WHERE owner_id=$1', [userId]);
      await db.query('DELETE FROM users WHERE id=$1', [userId]);
    }
  } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
