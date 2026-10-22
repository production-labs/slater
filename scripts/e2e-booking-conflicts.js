// End-to-end browser test for double-booking warnings (public/booking-conflicts.js).
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-booking-conflicts.js
// Screenshots land in /tmp/cv2-e2e/shots (bc-*).
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
const EMAIL = 'bce2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/bc-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Dates a year out so "past dates are ignored" never kicks in.
const Y = new Date().getFullYear() + 1;
const D = (m, d) => Y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'BC Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage(); global.__page = page;
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);

  const shot = n => page.screenshot({ path: path.join(SHOTS, 'bc-' + n + '.png') });
  const api = (method, url, body) => page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, method, url, body);
  const dialogOpen = () => page.evaluate(() => { const m = document.getElementById('bc-modal'); return !!(m && m.classList.contains('open')); });
  const dialogText = () => page.$eval('#bc-modal', e => e.textContent);
  const clickDialog = label => page.evaluate(l => { [...document.querySelectorAll('#bc-modal-btns button')].find(b => b.textContent === l).click(); }, label);
  const setStatus = (cardId, val) => page.evaluate((id, v) => {
    const s = document.getElementById(id + '_status'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, cardId, val);
  const strip = cardId => page.evaluate(id => { const s = document.querySelector('#' + id + ' .bc-strip'); return s ? { cls: s.className, text: s.textContent } : null; }, cardId);
  const badge = tab => page.evaluate(t => { const b = document.querySelector('.app-nav-item[data-tab="' + t + '"] .bc-nav-badge'); return b ? { cls: b.className, text: b.textContent } : null; }, tab);
  const settle = () => sleep(700); // refresh is debounced 400ms

  // ------------------------------------------------------------------ setup
  let maria, ken, tess, pat, quinn, keyA, keyB;
  await step('setup: contacts and two projects', async () => {
    maria = (await api('POST', '/api/v2/contacts', { name: 'Maria Lopez' })).body;
    ken = (await api('POST', '/api/v2/contacts', { name: 'Ken Staff' })).body;
    tess = (await api('POST', '/api/v2/contacts', { name: 'Tess Talent' })).body;
    pat = (await api('POST', '/api/v2/contacts', { name: 'Pat Grip' })).body;
    quinn = (await api('POST', '/api/v2/contacts', { name: 'Quinn Sound' })).body;
    assert(maria.id && ken.id && tess.id && pat.id, 'contacts created');
    keyA = 'cs_bcA_' + STAMP; keyB = 'cs_bcB_' + STAMP;
    const A = {
      project_type: 'location_shoot', project_title: 'Alpha Summit', label: 'Alpha Summit',
      schedule_days: [{ id: 'sday_1', date_iso: D(3, 10), end_date_iso: D(3, 11), label: 'Shoot', category: 'shoot_day' }],
      crew: [{ id: 'crew_1', name: 'Maria Lopez', position: 'DP', status: 'confirmed', contact_id: maria.id },
             { id: 'crew_2', name: 'Pat Grip', position: 'Grip', status: 'pencil', contact_id: pat.id },
             { id: 'crew_3', name: 'Quinn Sound', position: 'Sound', status: 'contacted', contact_id: quinn.id }],
      kp_cards: [{ _id: 'kp_1', role: 'EP', name: 'Ken Staff', status: 'pencil', contact_id: ken.id },
                 { _id: 'kp_2', role: 'Producer', name: 'Quinn Sound', status: 'tbd', contact_id: quinn.id }], // Quinn twice on Alpha
      talent: [{ id: 'talent_1', name: 'Tess Talent', title: 'Host', status: 'hold', contact_id: tess.id }],
    };
    const B = {
      project_type: 'location_shoot', project_title: 'Bravo Launch', label: 'Bravo Launch',
      schedule_days: [
        { id: 'sday_1', date_iso: D(3, 11), label: 'Day 1', category: 'shoot_day' },
        { id: 'sday_2', date_iso: D(4, 20), label: 'Day 2', category: 'shoot_day' },
      ],
      crew: [{ id: 'crew_1', name: 'Maria Lopez', position: 'DP', status: 'confirmed', contact_id: maria.id },
             { id: 'crew_9', name: 'Quinn Sound', position: 'Sound', status: 'tbd', contact_id: quinn.id }],
      kp_cards: [{ _id: 'kp_1', role: 'EP', name: 'Ken Staff', status: 'confirmed', contact_id: ken.id }],
      talent: [{ id: 'talent_1', name: 'Tess Talent', title: 'Host', status: 'tbd', contact_id: tess.id }],
    };
    for (const [k, d] of [[keyA, A], [keyB, B]]) {
      await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [k, d.label, JSON.stringify(d), userId]);
    }
  });

  await page.evaluate(k => localStorage.setItem('slater_last_project', k), keyB);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, keyB);
  await page.waitForFunction(k => window._allProjectsCache && _allProjectsCache[k], { timeout: 10000 }, keyA);
  await settle();
  const ids = await page.evaluate(() => ({
    crew: crew.find(c => document.getElementById(c + '_name').value === 'Maria Lopez'),
    quinn: crew.find(c => document.getElementById(c + '_name').value === 'Quinn Sound'),
    kp: kp[0], talent: talent[0], day1: scheduleDays[0], day2: scheduleDays[1] }));

  await step('opening a project shows existing double bookings without a dialog', async () => {
    assert(!(await dialogOpen()), 'no dialog on load');
    const c = await strip(ids.crew);
    assert(c && /bc-red/.test(c.cls), 'crew strip is red: ' + JSON.stringify(c));
    assert(/Alpha Summit/.test(c.text) && /Confirmed/.test(c.text) && /Open project/.test(c.text), 'crew strip text: ' + c.text);
    const k = await strip(ids.kp);
    assert(k && /bc-amber/.test(k.cls), 'KP strip is amber (pencil elsewhere): ' + JSON.stringify(k));
    const t = await strip(ids.talent);
    assert(t && /bc-amber/.test(t.cls) && /Already booked on another project/.test(t.text), 'TBD talent booked elsewhere gets an amber strip: ' + JSON.stringify(t));
  });

  await step('nav badges and schedule day marker', async () => {
    const cb = await badge('crew'), pb = await badge('project');
    assert(cb && cb.text === '1' && /bc-red/.test(cb.cls), 'crew badge ' + JSON.stringify(cb));
    assert(pb && pb.text === '1' && /bc-amber/.test(pb.cls), 'project badge ' + JSON.stringify(pb));
    const tb = await badge('talent');
    assert(tb && tb.text === '1' && /bc-amber/.test(tb.cls), 'talent badge ' + JSON.stringify(tb));
    const m1 = await page.evaluate(d => (document.getElementById(d + '_bc_marker') || {}).textContent || '', ids.day1);
    const m2 = await page.evaluate(d => document.getElementById(d + '_bc_marker'), ids.day2);
    assert(/Maria Lopez/.test(m1) && /Ken Staff/.test(m1) && /Tess Talent/.test(m1), 'day 1 marker: ' + m1);
    assert(!/Quinn/.test(m1), 'quiet notes stay off the Schedule line: ' + m1);
    assert(!m2, 'day 2 has no marker');
    await page.evaluate(() => st('crew')); await shot('crew-tab');
  });

  await step('someone only TBD / Contacted elsewhere gets a quiet note, nothing else', async () => {
    const q = await strip(ids.quinn);
    assert(q && /bc-note/.test(q.cls) && /not booked there yet/.test(q.text) && /Contacted/.test(q.text), 'quiet note: ' + JSON.stringify(q));
    const lines = await page.evaluate(id => document.querySelectorAll('#' + id + ' .bc-strip .bc-line').length, ids.quinn);
    assert(lines === 1, 'listed twice on Alpha, shown once: ' + lines + ' lines');
    await setStatus(ids.quinn, 'confirmed');
    await settle();
    assert(!(await dialogOpen()), 'no dialog for a quiet note');
    const cb = await badge('crew');
    assert(cb && cb.text === '1', 'crew count unchanged: ' + JSON.stringify(cb));
    await setStatus(ids.quinn, 'tbd');
    await settle();
  });

  await step('booking someone already booked asks first; Cancel puts the old status back', async () => {
    await setStatus(ids.talent, 'confirmed');
    assert(await dialogOpen(), 'dialog opened');
    const t = await dialogText();
    assert(/Tess Talent is already booked/.test(t) && /Alpha Summit/.test(t) && /1st Hold/.test(t), 'dialog text: ' + t);
    await settle(); // the debounced refresh runs while the dialog is open
    assert(/Alpha Summit/.test(await dialogText()), 'dialog keeps its details after the refresh');
    await shot('confirm-dialog');
    await clickDialog('Cancel');
    await settle();
    assert(await page.$eval('#' + ids.talent + '_status', e => e.value) === 'tbd', 'status reverted to TBD');
    const s = await strip(ids.talent);
    assert(s && /bc-amber/.test(s.cls), 'back to the amber TBD strip after cancel');
    assert(!(await dialogOpen()), 'no second dialog');
  });

  await step('Book anyway keeps the status and shows the strip', async () => {
    await setStatus(ids.talent, 'confirmed');
    assert(await dialogOpen(), 'dialog opened');
    await clickDialog('Book anyway');
    await settle();
    assert(!(await dialogOpen()), 'no follow-up dialog');
    assert(await page.$eval('#' + ids.talent + '_status', e => e.value) === 'confirmed', 'status kept');
    const s = await strip(ids.talent);
    assert(s && /bc-red/.test(s.cls), 'talent strip red');
    const tb = await badge('talent');
    assert(tb && tb.text === '1', 'talent badge');
  });

  await step('a non-booking status change does not ask', async () => {
    await setStatus(ids.talent, 'declined');
    await settle();
    assert(!(await dialogOpen()), 'no dialog for Declined');
    assert(!(await strip(ids.talent)), 'declined clears strip');
  });

  await step('leaving someone off the day clears it; putting them back shows a notice', async () => {
    await page.evaluate((d, c) => setDayExcludedCrew(d, [c]), ids.day1, ids.crew);
    await settle();
    assert(!(await strip(ids.crew)), 'crew strip gone when left off the day');
    assert(!(await dialogOpen()), 'no dialog when a conflict goes away');
    await page.evaluate(d => setDayExcludedCrew(d, []), ids.day1);
    await settle();
    assert(await dialogOpen(), 'notice shown');
    const t = await dialogText();
    assert(/Maria Lopez is already booked/.test(t) && /Alpha Summit/.test(t), 'notice text: ' + t);
    await clickDialog('OK');
  });

  await step('moving a day onto a booked date shows a notice', async () => {
    // Leave Maria off day 1 so only the date change can create her conflict.
    await page.evaluate((d, c) => setDayExcludedCrew(d, [c]), ids.day1, ids.crew);
    await settle();
    assert(!(await strip(ids.crew)), 'precondition: no crew conflict');
    await page.evaluate((d, iso) => { const e = document.getElementById(d + '_date_iso'); e.value = iso; e.dispatchEvent(new Event('change', { bubbles: true })); }, ids.day2, D(3, 10));
    await settle();
    assert(await dialogOpen(), 'notice after date change');
    const t = await dialogText();
    assert(/Maria Lopez/.test(t), 'notice names Maria: ' + t);
    await shot('date-notice');
    await clickDialog('OK');
    const c = await strip(ids.crew);
    assert(c && /bc-red/.test(c.cls), 'crew strip back');
  });

  await step('key personnel status dropdown asks too', async () => {
    await setStatus(ids.kp, 'tbd');
    await settle();
    assert(!(await dialogOpen()), 'no dialog for TBD');
    const k = await strip(ids.kp);
    assert(k && /Already booked on another project/.test(k.text), 'TBD KP still warned: ' + JSON.stringify(k));
    await setStatus(ids.kp, 'hold');
    assert(await dialogOpen(), 'dialog for KP');
    await clickDialog('Cancel');
    await settle();
    assert(await page.$eval('#' + ids.kp + '_status', e => e.value) === 'tbd', 'KP reverted');
  });

  await step('adding someone booked elsewhere warns right away, even at TBD', async () => {
    const before = await page.evaluate(() => crew.slice());
    await page.evaluate(() => addCrew());
    const id = await page.evaluate(b => crew.find(c => b.indexOf(c) === -1), before);
    await page.$eval('#' + id + '_name', e => e.focus());
    await page.type('#' + id + '_name', 'Pat');
    const handle = await page.waitForFunction(t => [...document.querySelectorAll('.ac-list.open .ac-item')].find(e => e.textContent.includes(t)), { timeout: 5000 }, 'Pat Grip');
    const b = await handle.asElement().boundingBox();
    await page.mouse.move(b.x + 10, b.y + 5); await page.mouse.down(); await sleep(150); await page.mouse.up();
    await settle();
    assert(await page.$eval('#' + id + '_status', e => e.value) === 'tbd', 'new card is TBD');
    assert(await dialogOpen(), 'dialog right after picking');
    const t = await dialogText();
    assert(/Pat Grip is already booked/.test(t) && /Alpha Summit/.test(t) && /Pencil/.test(t), 'dialog text: ' + t);
    await shot('add-tbd');
    await clickDialog('OK');
    const s = await strip(id);
    assert(s && /bc-amber/.test(s.cls) && /Already booked on another project/.test(s.text), 'amber strip on new card: ' + JSON.stringify(s));
    await setStatus(id, 'confirmed');
    assert(await dialogOpen(), 'booking them still asks');
    await clickDialog('Book anyway');
    await settle();
    assert(!(await dialogOpen()), 'no follow-up');
    const s2 = await strip(id);
    assert(s2 && /Possible double booking/.test(s2.text), 'pencil elsewhere stays amber once booked: ' + JSON.stringify(s2));
  });

  await step('same person in a second role here: own strip, counted once, no new pop-up', async () => {
    const before = await page.evaluate(() => crew.slice());
    await page.evaluate(() => addCrew());
    const id = await page.evaluate(b => crew.find(c => b.indexOf(c) === -1), before);
    await page.$eval('#' + id + '_name', e => e.focus());
    await page.type('#' + id + '_name', 'Maria');
    const handle = await page.waitForFunction(t => [...document.querySelectorAll('.ac-list.open .ac-item')].find(e => e.textContent.includes(t)), { timeout: 5000 }, 'Maria Lopez');
    const b = await handle.asElement().boundingBox();
    await page.mouse.move(b.x + 10, b.y + 5); await page.mouse.down(); await sleep(150); await page.mouse.up();
    await settle();
    assert(!(await dialogOpen()), 'already warned about Maria: no pop-up');
    const s = await strip(id);
    assert(s && /Alpha Summit/.test(s.text), 'second card has its own strip');
    const cb = await badge('crew');
    assert(cb && cb.text === '2', 'crew count is people (Maria, Pat), not cards: ' + JSON.stringify(cb));
    const m = await page.evaluate(d => (document.getElementById(d + '_bc_marker') || {}).textContent || '', ids.day2);
    assert((m.match(/Maria Lopez/g) || []).length === 1, 'Maria named once on the day: ' + m);
  });

  await step('Open project link switches to the other project', async () => {
    await page.evaluate(id => document.querySelector('#' + id + ' .bc-open').click(), ids.crew);
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, keyA);
    await settle();
    const c = await page.evaluate(() => { const s = document.querySelector('#' + crew[0] + ' .bc-strip'); return s ? s.textContent : ''; });
    assert(/Bravo Launch/.test(c), 'strip on Alpha points back at Bravo: ' + c);
  });

  await step('Rundown Crew tab lists every conflict across projects', async () => {
    await page.evaluate(() => { if (!sidebarOpen) toggleSidebar(); switchDailyTab('crew'); });
    await page.waitForSelector('#daily-body .bc-rundown', { timeout: 8000 });
    const r = await page.evaluate(() => ({
      head: document.querySelector('.bc-rundown-head').textContent,
      people: [...document.querySelectorAll('.bc-rundown-person')].map(e => ({ cls: e.className, text: e.textContent })),
    }));
    // Maria: Confirmed on both (red). Pat: Confirmed vs Pencil, Ken: TBD vs Pencil (amber).
    // Tess is Declined on Bravo; Quinn is only TBD / Contacted on both: left out.
    assert(r.head === 'Conflicts (3)', 'head: ' + r.head + ' ' + JSON.stringify(r.people.map(p => p.text)));
    assert(/^Maria Lopez/.test(r.people[0].text) && /bc-red/.test(r.people[0].cls), 'red first: ' + r.people[0].text);
    assert(/Alpha Summit/.test(r.people[0].text) && /Bravo Launch/.test(r.people[0].text), 'both projects named');
    const names = r.people.map(p => p.text).join(' | ');
    assert(/Pat Grip/.test(names) && /Ken Staff/.test(names) && !/Quinn|Tess/.test(names), 'who is listed: ' + names);
    assert((names.match(/Maria Lopez/g) || []).length === 1, 'Maria (two roles on Bravo) listed once');
    await shot('rundown');
    await page.evaluate(() => [...document.querySelectorAll('.bc-rundown-proj a')].find(a => a.textContent === 'Bravo Launch').click());
    await sleep(300);
    // The app's usual "Unsaved Changes" prompt when switching projects.
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save & Open' && x.offsetParent); if (b) b.click(); });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, keyB);
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
