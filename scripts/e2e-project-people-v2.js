// End-to-end browser test for project crew / talent / key personnel and
// schedule locations on v2 (data-model-rewrite, Session 5). LOCAL DATABASE ONLY.
//
// Drives real Chrome with ?contacts=v2 and checks projects.data after saves.
// Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-project-people-v2.js
// Screenshots land in /tmp/cv2-e2e/shots (pp2-*).
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3995, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots', DL = '/tmp/cv2-e2e/dl-pp2';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'pp2e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/pp2-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function docText(file) {
  return execFileSync('unzip', ['-p', file, 'word/document.xml']).toString()
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'PP2 Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage(); global.__page = page;
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  await page.goto(BASE + '/login');
  const login = await page.evaluate(async (e, p) => (await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, EMAIL, PASS);
  assert(login === 200, 'login failed ' + login);

  const T = s => page.waitForSelector(s, { visible: true, timeout: 5000 });
  const shot = n => page.screenshot({ path: path.join(SHOTS, 'pp2-' + n + '.png') });
  const api = (method, url, body) => page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, method, url, body);
  const proj = async key => (await db.query('SELECT * FROM projects WHERE key=$1', [key])).rows[0];
  const storeLoaded = () => page.waitForFunction(() => window.ContactsV2 && ContactsV2.store.loaded, { timeout: 8000 });
  const openProject = async key => {
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    await storeLoaded();
    await sleep(300);
  };
  // Save and wait until the server copy satisfies pred(data).
  const saveUntil = async (key, pred, what) => {
    await page.evaluate(() => autosaveNow());
    for (let i = 0; i < 40; i++) {
      const row = await proj(key);
      if (row && pred(row.data)) return row.data;
      await sleep(250);
    }
    throw new Error('saved data never matched: ' + (what || pred.toString()));
  };
  const val = id => page.$eval('#' + id, e => e.value);
  // Human-speed click on the first visible list item matching text.
  const pickItem = async (text) => {
    const handle = await page.waitForFunction(t => [...document.querySelectorAll('.ac-list.open .ac-item')].find(e => e.textContent.includes(t)), { timeout: 5000 }, text);
    const el = handle.asElement();
    const b = await el.boundingBox();
    await page.mouse.move(b.x + 10, b.y + 5); await page.mouse.down(); await sleep(300); await page.mouse.up();
    await sleep(100);
  };
  const listTexts = () => page.$$eval('.ac-list.open .ac-item', els => els.map(e => e.textContent));
  const newCard = async kind => page.evaluate(k => { if (k === 'crew') { addCrew(); return crew[0]; } addTalent(); return talent[0]; }, kind);
  const typeInto = async (id, text) => { await page.$eval('#' + id, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.type('#' + id, text); };
  const blur = id => page.$eval('#' + id, e => e.blur());

  // ------------------------------------------------------------------ setup
  let R = {}, dana, gary, erin, hannah, loc1, loc2, custom;
  await step('setup: contacts, locations and a custom role via /api/v2', async () => {
    const roles = (await api('GET', '/api/v2/roles')).body.rows;
    for (const n of ['Director of Photography', 'Gaffer', 'Executive Producer', 'Producer', 'Host', 'Camera Operator']) {
      R[n] = roles.find(r => r.name === n && r.is_global); assert(R[n], 'global role ' + n);
    }
    custom = (await api('POST', '/api/v2/roles', { name: 'Drone Wrangler', category: 'crew', department: 'Camera' })).body;
    dana = (await api('POST', '/api/v2/contacts', { name: 'Dana Pham', phone: '206.555.0101', email: 'dana@example.com', role_ids: [R['Director of Photography'].id] })).body;
    gary = (await api('POST', '/api/v2/contacts', { name: 'Gary Lamp', phone: '206.555.0102', email: 'gary@example.com', role_ids: [R['Gaffer'].id] })).body;
    erin = (await api('POST', '/api/v2/contacts', { name: 'Erin Exec', phone: '206.555.0103', email: 'erin@example.com', role_ids: [R['Executive Producer'].id] })).body;
    hannah = (await api('POST', '/api/v2/contacts', { name: 'Hannah Host', phone: '206.555.0104', title: 'Chief Executive Officer', role_ids: [R['Host'].id] })).body;
    await api('POST', '/api/v2/contacts', { name: 'Sam Same', phone: '1' });
    await api('POST', '/api/v2/contacts', { name: 'Sam Same', phone: '2' });
    loc1 = (await api('POST', '/api/v2/locations', { name: 'Studio A', address: '100 Main St', city: 'Seattle', state: 'WA', zip: '98101', notes: 'Load in at back door' })).body;
    loc2 = (await api('POST', '/api/v2/locations', { name: 'Warehouse', address: '9 Dock Rd', city: 'Tacoma', state: 'WA' })).body;
    assert(dana.id && gary.id && erin.id && hannah.id && loc1.id && loc2.id && custom.id, 'created');
  });

  console.log('\nNew project');
  let key;
  await step('new project: default EP / Producer cards link to their roles, text unchanged', async () => {
    await page.goto(BASE + '/?contacts=v2', { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.removeItem('slater_last_project'));
    await page.reload({ waitUntil: 'networkidle2' });
    await storeLoaded();
    await page.evaluate(() => libNew());
    await sleep(400);
    await page.evaluate(() => { var m = document.getElementById('modal-overlay'); if (m) m.classList.remove('open'); });
    const kpCards = await page.evaluate(() => kp.map(id => ({ role: document.getElementById(id + '_role').value, role_id: document.getElementById(id + '_role_id').value })));
    assert(kpCards[0].role === 'EP' && kpCards[0].role_id === String(R['Executive Producer'].id), JSON.stringify(kpCards));
    assert(kpCards[1].role === 'Producer' && kpCards[1].role_id === String(R['Producer'].id), JSON.stringify(kpCards));
    await page.type('#project_title', 'People V2 Project');
    await page.evaluate(() => libSave());
    await page.waitForFunction(() => !!currentSheetKey, { timeout: 5000 });
    key = await page.evaluate(() => currentSheetKey);
  });

  let c1, c2, t1;
  await step('crew role picker: crew group first; picking writes the abbreviation + links', async () => {
    await page.evaluate(() => st('crew'));
    c1 = await newCard('crew');
    await page.click('#' + c1 + '_position');
    await page.type('#' + c1 + '_position', 'photo');
    await T('.ac-list.open .ac-item');
    const groups = await page.$$eval('.ac-list.open .pv2-group', els => els.map(e => e.textContent));
    assert(/^Crew/.test(groups[0]), 'crew group first: ' + JSON.stringify(groups));
    await shot('01-role-picker');
    await pickItem('Director of Photography');
    assert(await val(c1 + '_position') === 'DP', 'abbreviation written: ' + await val(c1 + '_position'));
    assert(await val(c1 + '_role_id') === String(R['Director of Photography'].id), 'role linked');
  });

  await step('name search: everyone, crew-role people first, roles shown', async () => {
    await page.click('#' + c1 + '_name');
    await page.type('#' + c1 + '_name', 'a');
    await T('.ac-list.open .ac-item');
    const items = await listTexts();
    const iDana = items.findIndex(t => t.startsWith('Dana Pham')), iHannah = items.findIndex(t => t.startsWith('Hannah Host')), iErin = items.findIndex(t => t.startsWith('Erin Exec'));
    assert(iDana !== -1 && iHannah !== -1, 'everyone searched: ' + JSON.stringify(items));
    assert(iDana < iHannah, 'crew before talent: ' + JSON.stringify(items));
    assert(iErin === -1 || iDana < iErin, 'crew before staff');
    assert(items[iDana].includes('DP'), 'roles shown: ' + items[iDana]);
    await shot('02-name-search');
  });

  await step('picking a contact fills name/phone/email and links; role slot kept', async () => {
    await typeInto(c1 + '_name', 'dan');
    await pickItem('Dana Pham');
    assert(await val(c1 + '_name') === 'Dana Pham' && await val(c1 + '_phone') === '206.555.0101' && await val(c1 + '_email') === 'dana@example.com', 'filled');
    assert(await val(c1 + '_contact_id') === String(dana.id), 'linked');
    assert(await val(c1 + '_contact_ack') === dana.updated_at, 'ack = contact updated_at');
    assert(await val(c1 + '_position') === 'DP', 'role kept');
  });

  await step("empty role slot takes the person's crew role", async () => {
    c2 = await newCard('crew');
    await page.click('#' + c2 + '_name');
    await page.type('#' + c2 + '_name', 'gary');
    await pickItem('Gary Lamp');
    assert(await val(c2 + '_position') === 'Gaffer' && await val(c2 + '_role_id') === String(R['Gaffer'].id), 'role from contact');
  });

  await step('talent: title from the contact, talent role linked', async () => {
    await page.evaluate(() => st('talent'));
    t1 = await newCard('talent');
    await page.click('#' + t1 + '_name');
    await page.type('#' + t1 + '_name', 'hann');
    await pickItem('Hannah Host');
    assert(await val(t1 + '_title') === 'Chief Executive Officer', 'title: ' + await val(t1 + '_title'));
    assert(await val(t1 + '_role_id') === String(R['Host'].id), 'talent role');
    assert(await val(t1 + '_contact_id') === String(hannah.id), 'linked');
  });

  await step('key personnel: pick Erin on the EP card', async () => {
    await page.evaluate(() => st('project'));
    const k0 = await page.evaluate(() => kp[0]);
    await page.click('#' + k0 + '_name');
    await page.type('#' + k0 + '_name', 'erin');
    await pickItem('Erin Exec');
    assert(await val(k0 + '_contact_id') === String(erin.id) && await val(k0 + '_role') === 'EP', 'linked, role kept');
  });

  await step('save: contact_id / role_id / contact_ack land in projects.data', async () => {
    const d = await saveUntil(key, d => (d.crew || []).length === 2 && (d.talent || [])[0] && d.talent[0].contact_id && d.kp_cards[0].contact_id, 'links saved');
    const byName = Object.fromEntries(d.crew.map(c => [c.name, c]));
    assert(byName['Dana Pham'].contact_id === dana.id && byName['Dana Pham'].role_id === R['Director of Photography'].id && byName['Dana Pham'].position === 'DP', JSON.stringify(byName['Dana Pham']));
    assert(byName['Gary Lamp'].role_id === R['Gaffer'].id, 'gary role');
    assert(d.talent[0].role_id === R['Host'].id && d.talent[0].title === 'Chief Executive Officer', JSON.stringify(d.talent[0]));
    assert(d.kp_cards[0].contact_id === erin.id && d.kp_cards[0].role_id === R['Executive Producer'].id, JSON.stringify(d.kp_cards[0]));
    assert(d.kp_cards[1].role_id === R['Producer'].id && !d.kp_cards[1].contact_id, 'producer slot: role only');
  });

  console.log('\nTyping');
  await step('typing over a linked name unlinks it', async () => {
    await page.evaluate(() => st('crew'));
    await page.click('#' + c2 + '_name');
    await page.keyboard.type('s');
    assert(await val(c2 + '_contact_id') === '', 'unlinked');
    await typeInto(c2 + '_name', 'Gary Lamp');
    await blur(c2 + '_name');
    await sleep(100);
    assert(await val(c2 + '_contact_id') === String(gary.id), 'exact name relinks on blur');
  });

  await step('exact name typed links on blur and fills only empty fields', async () => {
    const c = await newCard('crew');
    await page.type('#' + c + '_phone', '999');
    await page.type('#' + c + '_name', '  dana   PHAM ');
    await blur(c + '_name');
    await sleep(100);
    assert(await val(c + '_contact_id') === String(dana.id), 'linked');
    // (the app's phone formatter reformats as you type; any typed value must survive)
    assert(/999/.test(await val(c + '_phone')) && !/555/.test(await val(c + '_phone')) && await val(c + '_email') === 'dana@example.com', 'typed phone kept, empty email filled: ' + await val(c + '_phone') + ' / ' + await val(c + '_email'));
    await page.evaluate(id => { ri(id, crew); }, c);
  });

  await step('duplicate names never auto-link', async () => {
    const c = await newCard('crew');
    await page.type('#' + c + '_name', 'Sam Same');
    await blur(c + '_name');
    await sleep(100);
    assert(await val(c + '_contact_id') === '', 'not linked');
    await page.evaluate(id => { ri(id, crew); }, c);
  });

  await step('"+ Add to contacts" creates the contact with the card role and links it', async () => {
    const c = await newCard('crew');
    await page.click('#' + c + '_position');
    await page.type('#' + c + '_position', 'drone');
    await pickItem('Drone Wrangler');
    await page.type('#' + c + '_phone', '206.555.0199');
    await page.click('#' + c + '_name');
    await page.type('#' + c + '_name', 'Nina Newcomer');
    await pickItem('+ Add "Nina Newcomer" to contacts');
    await page.waitForFunction(id => !!document.getElementById(id + '_contact_id').value, { timeout: 5000 }, c);
    const row = (await db.query(`SELECT c.*, (SELECT array_agg(role_id) FROM contact_roles WHERE contact_id=c.id) AS role_ids FROM contacts c WHERE owner_id=$1 AND name='Nina Newcomer'`, [userId])).rows[0];
    assert(row && row.phone === await val(c + '_phone') && /555.?0199/.test(row.phone), 'created with the card phone: ' + JSON.stringify(row && row.phone) + ' card: ' + await val(c + '_phone'));
    assert(JSON.stringify(row.role_ids) === JSON.stringify([custom.id]), 'role: ' + JSON.stringify(row.role_ids));
    assert(await val(c + '_contact_id') === String(row.id), 'linked');
  });

  await step('free-text role stays unlinked; exact abbreviation links on blur', async () => {
    const c = await newCard('crew');
    await page.click('#' + c + '_position');
    await page.type('#' + c + '_position', 'Grip Boss Custom');
    await blur(c + '_position');
    await sleep(100);
    assert(await val(c + '_role_id') === '' && await val(c + '_position') === 'Grip Boss Custom', 'free text');
    await typeInto(c + '_position', 'cam op');
    await blur(c + '_position');
    await sleep(100);
    assert(await val(c + '_role_id') === String(R['Camera Operator'].id) && await val(c + '_position') === 'Cam Op', 'linked: ' + await val(c + '_position'));
  });

  await step('custom role used on a project cannot be deleted', async () => {
    await saveUntil(key, d => (d.crew || []).some(c => c.role_id === custom.id), 'custom role saved');
    const r = await api('DELETE', '/api/v2/roles/' + custom.id);
    assert(r.status === 409, 'refused: ' + r.status + ' ' + JSON.stringify(r.body));
  });

  console.log('\nDetails changed in Contacts');
  await step('contact phone changes -> bar on the card; Dismiss keeps the card, stays dismissed', async () => {
    const cur = (await api('GET', '/api/v2/contacts/' + dana.id)).body;
    const p = await api('PATCH', '/api/v2/contacts/' + dana.id, { phone: '206.555.7777', base_updated_at: cur.updated_at });
    assert(p.status === 200, 'patch ' + p.status);
    await page.evaluate(() => ContactsV2.sync());
    await T('#' + c1 + '_pv2bar');
    const text = await page.$eval('#' + c1 + '_pv2bar', e => e.textContent);
    assert(/phone \(206\.555\.7777\)/.test(text), text);
    await page.$eval('#' + c1, e => e.scrollIntoView({ block: 'center' }));
    await shot('03-changed-bar');
    await page.$eval('#' + c1 + '_pv2bar [data-pv2="dismiss"]', e => e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await sleep(100);
    assert(!(await page.$('#' + c1 + '_pv2bar')), 'bar gone');
    assert(await val(c1 + '_phone') === '206.555.0101', 'card kept its phone');
    await saveUntil(key, d => d.crew.some(c => c.contact_id === dana.id && c.contact_ack === p.body.updated_at), 'ack saved');
    await openProject(key);
    await page.evaluate(() => st('crew'));
    const id = await page.evaluate(n => crew.find(i => document.getElementById(i + '_name').value === n), 'Dana Pham');
    assert(!(await page.$('#' + id + '_pv2bar')), 'still dismissed after reopen');
    c1 = id;
  });

  await step('changes again -> bar returns; Update copies the new details', async () => {
    const cur = (await api('GET', '/api/v2/contacts/' + dana.id)).body;
    await api('PATCH', '/api/v2/contacts/' + dana.id, { email: 'dana@new.example', base_updated_at: cur.updated_at });
    await page.evaluate(() => ContactsV2.sync());
    await T('#' + c1 + '_pv2bar');
    await page.$eval('#' + c1 + '_pv2bar [data-pv2="update"]', e => e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await sleep(100);
    assert(await val(c1 + '_phone') === '206.555.7777' && await val(c1 + '_email') === 'dana@new.example', 'updated');
    assert(!(await page.$('#' + c1 + '_pv2bar')), 'bar gone');
    assert(await val(c1 + '_position') === 'DP', 'role slot untouched');
  });

  console.log('\nSchedule locations');
  let dayId;
  await step('day location picker lists v2 locations; pick stores location_id + shows address', async () => {
    await page.evaluate(() => st('schedule'));
    dayId = await page.evaluate(() => { addScheduleDay({ date_iso: '2026-11-02', label: 'Day 1' }); return scheduleDays[scheduleDays.length - 1]; });
    await page.click('#' + dayId + '_loc_id');
    await T('.ac-list.open .ac-item');
    const items = await listTexts();
    assert(items.includes('Studio A') && items.includes('Warehouse'), JSON.stringify(items));
    await pickItem('Warehouse');
    assert(await val(dayId + '_location_id') === String(loc2.id), 'location_id');
    assert(/9 Dock Rd, Tacoma, WA/.test(await page.$eval('#' + dayId + '_loc_info', e => e.textContent)), 'address shown');
    const d = await saveUntil(key, d => (d.schedule_days || []).some(s => s.location_id === loc2.id), 'location saved');
    assert(d.schedule_days.find(s => s.location_id === loc2.id).loc_name === 'Warehouse', 'name snapshot kept');
  });

  await step('location rename follows the link; call sheet prints the new name + address', async () => {
    const cur = (await api('GET', '/api/v2/locations/' + loc2.id)).body;
    await api('PATCH', '/api/v2/locations/' + loc2.id, { name: 'Dock Warehouse', base_updated_at: cur.updated_at });
    await openProject(key);
    const did = await page.evaluate(() => scheduleDays[0]);
    await page.waitForFunction(id => document.getElementById(id + '_loc_id').value === 'Dock Warehouse', { timeout: 5000 }, did);
    await page.evaluate(() => generateDoc());
    let file; for (let i = 0; i < 40 && !file; i++) { file = fs.readdirSync(DL).find(f => f.endsWith('.docx')); if (!file) await sleep(250); }
    assert(file, 'call sheet downloaded');
    const text = docText(path.join(DL, file));
    for (const s of ['Dock Warehouse', '9 Dock Rd', 'Dana Pham', 'DP', 'Hannah Host', 'Chief Executive Officer']) assert(text.includes(s), 'missing in call sheet: ' + s);
    fs.unlinkSync(path.join(DL, file));
  });

  await step('typing an unknown location clears it', async () => {
    const did = await page.evaluate(() => scheduleDays[0]);
    await page.evaluate(() => st('schedule'));
    await typeInto(did + '_loc_id', 'Nowhere Special');
    await blur(did + '_loc_id');
    await sleep(200);
    assert(await val(did + '_loc_id') === '' && await val(did + '_location_id') === '', 'cleared');
  });

  console.log('\nBefore the migration');
  await step('old project: people, roles and location link on load; text unchanged; no prompts', async () => {
    const k = 'cs_pp2legacy_' + STAMP;
    await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Legacy People',$2,$3)`, [k, JSON.stringify({
      project_title: 'Legacy People', project_type: 'location_shoot',
      kp_cards: [{ role: 'Executive Producer', name: 'erin exec', phone: 'old phone', email: '', status: 'confirmed' }],
      crew: [{ position: 'Director of Photography', name: 'Dana Pham', phone: '111', email: 'old@x', status: 'hold' },
             { position: 'Sound Wizard', name: 'Sam Same', status: 'tbd' }],
      talent: [{ name: 'Hannah Host', title: 'CEO', status: 'tbd' }],
      schedule_days: [{ date_iso: '2026-12-01', label: 'Day 1', loc_name: 'studio a', loc_id: 'studio a' }],
    }), userId]);
    await openProject(k);
    const st0 = await page.evaluate(() => ({
      kp: kp.map(id => ({ role: document.getElementById(id + '_role').value, role_id: document.getElementById(id + '_role_id').value, c: document.getElementById(id + '_contact_id').value, phone: document.getElementById(id + '_phone').value })),
      crew: crew.map(id => ({ pos: document.getElementById(id + '_position').value, role_id: document.getElementById(id + '_role_id').value, c: document.getElementById(id + '_contact_id').value })),
      talent: talent.map(id => ({ title: document.getElementById(id + '_title').value, role_id: document.getElementById(id + '_role_id').value, c: document.getElementById(id + '_contact_id').value })),
      day: document.getElementById(scheduleDays[0] + '_location_id').value,
      bars: document.querySelectorAll('.pv2-bar').length,
    }));
    assert(st0.kp[0].c === String(erin.id) && st0.kp[0].role_id === String(R['Executive Producer'].id) && st0.kp[0].role === 'Executive Producer' && st0.kp[0].phone === 'old phone', 'kp: ' + JSON.stringify(st0.kp));
    assert(st0.crew[0].c === String(dana.id) && st0.crew[0].pos === 'Director of Photography' && st0.crew[0].role_id === String(R['Director of Photography'].id), 'crew: ' + JSON.stringify(st0.crew));
    assert(st0.crew[1].c === '' && st0.crew[1].role_id === '', 'duplicate name + unknown role stay unlinked: ' + JSON.stringify(st0.crew[1]));
    assert(st0.talent[0].c === String(hannah.id) && st0.talent[0].title === 'CEO' && st0.talent[0].role_id === String(R['Host'].id), 'talent: ' + JSON.stringify(st0.talent));
    assert(st0.day === String(loc1.id), 'location linked');
    assert(st0.bars === 0, 'no change prompts for pre-existing differences');
    const d = await saveUntil(k, d => d.crew && d.crew[0].contact_id === dana.id, 'legacy links saved');
    assert(d.crew[0].phone === '111' && d.crew[0].status === 'hold', 'card data unchanged');
    assert(d.schedule_days[0].location_id === loc1.id, 'location_id saved');
  });

  console.log('\nCrew configs');
  await step('save config "roles and assigned crew"', async () => {
    await openProject(key);
    await page.evaluate(() => st('crew'));
    await page.evaluate(() => { const id = crew.find(i => document.getElementById(i + '_name').value === 'Gary Lamp'); document.getElementById(id + '_status').value = 'confirmed'; });
    await page.evaluate(() => saveCrewConfig());
    await T('#cc-save-name');
    await page.type('#cc-save-name', 'Full Crew');
    await shot('04-save-config');
    await page.click('input[name="cc-save-mode"][value="crew"]');
    await page.click('#modal-ok');
    await sleep(200);
    const cfg = await page.evaluate(() => crewConfigLoad().find(c => c.name === 'Full Crew'));
    assert(cfg && cfg.with_crew, 'saved with crew');
    const dana_ = cfg.items.find(i => i.name === 'Dana Pham');
    assert(dana_ && dana_.contact_id === dana.id && dana_.role_id === R['Director of Photography'].id && !('status' in dana_), JSON.stringify(dana_));
  });

  await step('save config "roles only"', async () => {
    await page.evaluate(() => saveCrewConfig());
    await T('#cc-save-name');
    await page.type('#cc-save-name', 'Roles Only');
    await page.click('#modal-ok');
    await sleep(200);
    const cfg = await page.evaluate(() => crewConfigLoad().find(c => c.name === 'Roles Only'));
    assert(cfg && !cfg.with_crew && cfg.items.every(i => !i.name && !i.contact_id), JSON.stringify(cfg));
    assert(cfg.roles.includes('DP'), 'old-format roles list kept');
  });

  await step('recall with crew on a new project: same order, people + links back, all TBD', async () => {
    const saved = await page.evaluate(() => crew.map(id => document.getElementById(id + '_name').value));
    await page.evaluate(() => libNew());
    await sleep(400);
    await page.evaluate(() => { var m = document.getElementById('modal-overlay'); if (m) m.classList.remove('open'); });
    await page.evaluate(() => { st('crew'); loadCrewConfig(crewConfigLoad().find(c => c.name === 'Full Crew')); });
    const now = await page.evaluate(() => crew.map(id => ({ name: document.getElementById(id + '_name').value, status: document.getElementById(id + '_status').value, c: document.getElementById(id + '_contact_id').value, contacted: document.getElementById(id + '_contacted_at').value })));
    assert(JSON.stringify(now.map(x => x.name)) === JSON.stringify(saved), 'order: ' + JSON.stringify(now.map(x => x.name)) + ' vs ' + JSON.stringify(saved));
    assert(now.every(x => x.status === 'tbd' && !x.contacted), 'all TBD: ' + JSON.stringify(now));
    assert(now.find(x => x.name === 'Dana Pham').c === String(dana.id), 'link kept');
    await shot('05-config-recalled');
  });

  console.log('\nFlag off');
  await step('opening + saving with the flag off keeps the links', async () => {
    await page.goto(BASE + '/?contacts=v1', { waitUntil: 'networkidle2' });
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    assert(!(await page.evaluate(() => !!window.ProjectPeopleV2)), 'v2 module off');
    await page.evaluate(() => { document.getElementById('project_title').value = 'People V2 Project (v1 edit)'; });
    const d = await saveUntil(key, d => d.project_title === 'People V2 Project (v1 edit)', 'v1 save');
    assert(d.crew.some(c => c.contact_id === dana.id) && d.kp_cards[0].contact_id === erin.id && d.talent[0].contact_id === hannah.id, 'links kept');
    assert(d.schedule_days.length >= 1, 'schedule days kept');
    await page.goto(BASE + '/?contacts=v2', { waitUntil: 'networkidle2' });
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
