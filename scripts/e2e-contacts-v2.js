// End-to-end browser test for Contacts v2 (Session 3). LOCAL DATABASE ONLY.
//
// Drives real Chrome through the new Contacts screen and checks the database
// after each step. Creates a temporary user and deletes it afterwards.
// puppeteer-core is deliberately NOT a project dependency. One-time setup:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-contacts-v2.js
// Screenshots land in /tmp/cv2-e2e/shots.
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3998, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const EMAIL = 'cv2e2e-' + Date.now() + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

function png(w, h) { // solid-ish test PNG
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 255; raw[o + 1] = x < w / 2 ? 77 : 200; raw[o + 2] = 0; } }
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'E2E Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;

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

  const T = s => page.waitForSelector(s, { visible: true, timeout: 5000 });
  const click = async s => { await T(s); try { await page.click(s); } catch (e) { await sleep(300); await T(s); await page.$eval(s, el => el.click()); } };
  const type = async (s, v) => { await T(s); await page.$eval(s, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.type(s, v); };
  const contact = async name => (await db.query(`SELECT * FROM contacts WHERE owner_id=$1 AND name=$2`, [userId, name])).rows[0];
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });

  console.log('\nFlag');
  await step('flag off: Contacts opens the OLD modal', async () => {
    await page.goto(BASE + '/?contacts=v1', { waitUntil: 'networkidle2' });
    await page.evaluate(() => openContacts());
    await sleep(400);
    const st = await page.evaluate(() => ({ old: document.getElementById('contacts-modal').classList.contains('open'), v2: !!document.querySelector('#contacts-v2-modal.open') }));
    assert(st.old && !st.v2, JSON.stringify(st));
    await page.evaluate(() => closeContacts());
  });
  await step('flag on (?contacts=v2): Contacts opens the NEW screen, empty state', async () => {
    await page.goto(BASE + '/?contacts=v2', { waitUntil: 'networkidle2' });
    await page.evaluate(() => openContacts());
    await T('#contacts-v2-modal.open .cv2-empty');
    const txt = await page.$eval('#cv2-list', e => e.textContent);
    assert(/No people yet/.test(txt), txt);
    await shot('01-empty');
  });

  console.log('\nPeople');
  await step('create a person with picked roles + a new custom role', async () => {
    await click('[data-act="new"]');
    await type('#cv2f_name', 'Shaun Smith');
    await type('#cv2f_sort_last_name', 'Smith');
    await page.click('#cv2-role-input'); await page.type('#cv2-role-input', 'DP'); await sleep(100); await page.keyboard.press('Enter');
    await page.type('#cv2-role-input', 'gaff'); await sleep(100); await page.keyboard.press('Enter');
    await page.type('#cv2-role-input', 'Drone Wrangler'); await sleep(100);
    await shot('02-picker');
    await page.keyboard.press('Enter'); // only option: + Create role
    await T('#cv2-nr-name');
    await page.select('#cv2-nr-cat', 'crew');
    await page.type('#cv2-nr-dept', 'Camera');
    await click('[data-act="newrole-save"]');
    await page.waitForFunction(() => document.querySelectorAll('#cv2-pills .cv2-pill').length === 3, { timeout: 5000 });
    await type('#cv2f_phone', '2065550100');
    await type('#cv2f_city', 'Tacoma');
    await type('#cv2f_state', 'washington');
    await type('#cv2f_zip', '98402');
    await type('#cv2f_title', 'Lighting Lead');
    await type('#cv2f_union_status', 'IATSE Local 600');
    await type('#cv2f_gear_kit', 'FX6 package\nAputure 600d x2');
    await shot('03-new-person-form');
    await click('#cv2-save');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Shaun Smith' && !document.querySelector('[data-act="cancel-new"]'), { timeout: 5000 });
    const c = await contact('Shaun Smith');
    assert(c, 'not in DB');
    assert(c.phone === '(206) 555-0100', 'phone formatted: ' + c.phone);
    assert(c.zip === '98402', 'zip: ' + c.zip);
    assert(c.state === 'WA' && c.country === 'US', 'state/country: ' + c.state + '/' + c.country);
    assert(c.title === 'Lighting Lead', 'title: ' + c.title);
    assert(c.gear_kit === 'FX6 package\nAputure 600d x2', 'gear multiline: ' + JSON.stringify(c.gear_kit));
    const roles = (await db.query(`SELECT r.name, r.owner_id, r.department FROM contact_roles cr JOIN roles r ON r.id=cr.role_id WHERE cr.contact_id=$1 ORDER BY cr.sort_order`, [c.id])).rows;
    assert(JSON.stringify(roles.map(r => r.name)) === JSON.stringify(['Director of Photography', 'Gaffer', 'Drone Wrangler']), JSON.stringify(roles));
    assert(roles[2].owner_id === userId && roles[2].department === 'Camera', 'custom role owner/dept');
    await shot('04-person-saved');
  });
  await step('click a pill to make it primary, Save button tracks dirty state', async () => {
    const disabledBefore = await page.$eval('#cv2-save', b => b.disabled);
    assert(disabledBefore, 'Save should be disabled when clean');
    const pills = await page.$$('#cv2-pills .cv2-pill');
    await pills[1].click(); // Gaffer -> primary
    await page.waitForFunction(() => !document.querySelector('#cv2-save').disabled);
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
    const c = await contact('Shaun Smith');
    const first = (await db.query(`SELECT r.name FROM contact_roles cr JOIN roles r ON r.id=cr.role_id WHERE cr.contact_id=$1 ORDER BY cr.sort_order LIMIT 1`, [c.id])).rows[0].name;
    assert(first === 'Gaffer', first);
  });
  await step('human-speed click (300ms press) on a picker item still adds the role', async () => {
    await page.click('#cv2-role-input');
    await page.type('#cv2-role-input', 'engineer in');
    await page.waitForSelector('#cv2-picker-list.open [data-act="pick-role"]', { timeout: 3000 });
    const box = await (await page.$('#cv2-picker-list [data-act="pick-role"]')).boundingBox();
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down(); await sleep(300); await page.mouse.up();
    await page.waitForFunction(() => /Engineer in Charge/.test(document.getElementById('cv2-pills').textContent), { timeout: 3000 });
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
  });
  await step('unsaved-changes guard on switching records', async () => {
    await click('[data-act="new"]'); await type('#cv2f_name', 'Talent Tina');
    await page.click('#cv2-role-input'); await page.type('#cv2-role-input', 'Host'); await sleep(100); await page.keyboard.press('Enter');
    await click('#cv2-save');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Talent Tina', { timeout: 5000 });
    await type('#cv2f_city', 'Seattle'); // dirty
    await page.click('.cv2-row[data-id]:not(.active)');
    await T('#modal-overlay.open');
    const msg = await page.$eval('#modal-msg', e => e.textContent);
    assert(/Discard your changes/.test(msg), msg);
    await page.evaluate(() => modalCancel()); // stay
    assert(await page.$eval('#cv2f_city', e => e.value) === 'Seattle', 'edit kept after cancel');
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
  });
  await step('category chips + search filter the list', async () => {
    await click('[data-act="cat"][data-cat="talent"]');
    let names = await page.$$eval('.cv2-row-name', els => els.map(e => e.textContent));
    assert(names.length === 1 && /Talent Tina/.test(names[0]), JSON.stringify(names));
    await click('[data-act="cat"][data-cat="all"]');
    await type('#cv2-q', 'gaffer');
    names = await page.$$eval('.cv2-row-name', els => els.map(e => e.textContent));
    assert(names.length === 1 && /Shaun/.test(names[0]), JSON.stringify(names));
    await page.click('#cv2-q', { clickCount: 3 }); await page.keyboard.press('Backspace');
  });

  console.log('\nOrganizations');
  await step('create agency org with cropped logo + billing contact', async () => {
    fs.writeFileSync(SHOTS + '/logo.png', png(400, 250));
    await click('[data-act="tab"][data-tab="organizations"]');
    await click('[data-act="new"]');
    await type('#cv2f_name', 'Worktank');
    await page.click('#cv2f_is_agency');
    await T('#cv2-agency-section');
    await page.click('#cv2f_state'); await page.type('#cv2f_state', 'brit'); await sleep(150);
    await page.waitForSelector('#cv2-ta-state.open [data-idx="0"]', { timeout: 3000 });
    await page.click('#cv2-ta-state [data-idx="0"]');
    assert(await page.$eval('#cv2f_state', e => e.value) === 'BC', 'picked BC');
    assert(await page.$eval('#cv2f_country', e => e.value) === 'Canada', 'country followed province');
    assert(await page.$eval('#cv2-state-label', e => e.textContent) === 'Province', 'label is Province');
    await type('#cv2f_contact_name', 'Billing Person');
    await type('#cv2f_invoicing_email', 'ap@worktank.example');
    const input = await page.$('#cv2-logo-file');
    await input.uploadFile(SHOTS + '/logo.png');
    await T('#crop-modal.open');
    await sleep(300);
    await shot('05-crop');
    await page.evaluate(() => applyCrop());
    await T('.cv2-logo-img');
    assert(await page.$eval('#cv2f_contact_name', e => e.value) === 'Billing Person', 'form kept after crop');
    await click('#cv2-save');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Worktank' && !document.querySelector('[data-act="cancel-new"]'), { timeout: 5000 });
    const o = (await db.query(`SELECT * FROM organizations WHERE owner_id=$1 AND name='Worktank'`, [userId])).rows[0];
    assert(o && o.is_agency && o.contact_name === 'Billing Person', 'org fields');
    assert(o.state === 'BC' && o.country === 'CA', 'org address: ' + o.state + '/' + o.country);
    assert(/^data:image\/png;base64,/.test(o.logo), 'logo png');
    const dims = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), o.logo);
    assert(dims[0] === 512 && dims[1] === 512, 'logo is ' + dims);
  });
  await step('make default agency', async () => {
    await click('[data-act="set-default"]');
    await T('[data-act="clear-default"]');
    const d = (await db.query('SELECT default_organization_id FROM users WHERE id=$1', [userId])).rows[0].default_organization_id;
    assert(d, 'default not set');
    await shot('06-org-saved');
  });
  await step('link person to org; org shows the person', async () => {
    await click('[data-act="tab"][data-tab="people"]');
    const rows = await page.$$('.cv2-row');
    for (const r of rows) if (/Shaun/.test(await r.evaluate(e => e.textContent))) { await r.click(); break; }
    await T('#cv2f_organization_id');
    const val = await page.$$eval('#cv2f_organization_id option', os => os.find(o => o.textContent === 'Worktank').value);
    await page.select('#cv2f_organization_id', val);
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
    const c = await contact('Shaun Smith');
    assert(String(c.organization_id) === val, 'org link');
    await click('[data-act="tab"][data-tab="organizations"]');
    await click('.cv2-row');
    await T('[data-act="goto-person"]');
    await click('[data-act="goto-person"]');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Shaun Smith', { timeout: 5000 });
  });

  console.log('\nSync / conflicts');
  await step('edit made on "another device" is merged, not overwritten', async () => {
    const c = await contact('Shaun Smith');
    // Other device changes notes (a field this browser does not touch).
    await db.query(`UPDATE contacts SET notes='Set by other device' WHERE id=$1`, [c.id]);
    await type('#cv2f_city', 'Olympia');
    await click('#cv2-save');
    await page.waitForFunction(() => /another device/.test(document.getElementById('toast').textContent), { timeout: 5000 });
    const after = await contact('Shaun Smith');
    assert(after.city === 'Olympia' && after.notes === 'Set by other device', JSON.stringify({ city: after.city, notes: after.notes }));
  });

  console.log('\nRoles tab');
  await step('built-in roles are listed read-only, grouped, with no Save/Delete', async () => {
    await click('[data-act="tab"][data-tab="roles"]');
    await page.waitForFunction(() => /Crew: Camera/.test(document.getElementById('cv2-list').textContent), { timeout: 3000 });
    const rows = await page.$$('.cv2-row');
    for (const r of rows) if (/^Gaffer/.test(await r.evaluate(e => e.querySelector('.cv2-row-name').textContent))) { await r.click(); break; }
    await T('.cv2-banner');
    await shot('10-roles-builtin');
    assert(!(await page.$('#cv2-save')) && !(await page.$('[data-act="archive"]')), 'no save/delete on built-in');
    assert(await page.$eval('#cv2f_name', e => e.disabled), 'fields disabled');
    assert(await page.$$eval('[data-act="goto-person"]', b => b.some(x => /Shaun/.test(x.textContent))), 'shows people with role');
  });
  await step('rename a custom role; people who have it update', async () => {
    await click('[data-act="cat"][data-cat="mine"]');
    await page.waitForFunction(() => /Drone Wrangler/.test(document.getElementById('cv2-list').textContent), { timeout: 3000 });
    await click('.cv2-row');
    await type('#cv2f_name', 'Drone Pilot');
    await type('#cv2f_abbreviation', 'FAA107');
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
    const r = (await db.query(`SELECT name, abbreviation FROM roles WHERE owner_id=$1 AND name='Drone Pilot'`, [userId])).rows[0];
    assert(r && r.abbreviation === 'FAA107', 'renamed in DB');
    await click('[data-act="goto-person"]');
    await page.waitForFunction(() => /Drone Pilot/.test(document.getElementById('cv2-pills').textContent), { timeout: 3000 });
  });
  await step('deleting an in-use role explains who uses it; after removing, delete + restore work', async () => {
    await click('[data-act="tab"][data-tab="roles"]');
    await click('[data-act="cat"][data-cat="mine"]');
    await click('.cv2-row');
    await click('[data-act="archive"]');
    await T('#modal-overlay.open');
    const msg = await page.$eval('#modal-msg', e => e.textContent);
    assert(/used by Shaun Smith/.test(msg), msg);
    await page.evaluate(() => modalCancel());
    // remove it from Shaun
    await click('[data-act="goto-person"]');
    await page.waitForSelector('#cv2-pills [data-act="pill-remove"]');
    const pills = await page.$$('#cv2-pills .cv2-pill');
    for (const pl of pills) if (/Drone Pilot/.test(await pl.evaluate(e => e.textContent))) { await (await pl.$('[data-act="pill-remove"]')).click(); break; }
    await click('#cv2-save');
    await page.waitForFunction(() => { const b = document.querySelector('#cv2-save'), d = document.getElementById('cv2-dirty'); return b && b.disabled && d && d.textContent === ''; }, { timeout: 5000 });
    // now delete
    await click('[data-act="tab"][data-tab="roles"]');
    await click('[data-act="cat"][data-cat="mine"]');
    await click('.cv2-row');
    await click('[data-act="archive"]');
    await T('#modal-overlay.open');
    await page.evaluate(() => document.getElementById('modal-ok').click());
    await page.waitForFunction(() => /no custom roles/.test(document.getElementById('cv2-list').textContent), { timeout: 5000 });
    const gone = (await db.query(`SELECT archived_at FROM roles WHERE owner_id=$1 AND name='Drone Pilot'`, [userId])).rows[0];
    assert(gone && gone.archived_at, 'archived in DB');
    await page.click('#cv2-arch');
    await page.waitForFunction(() => /Drone Pilot/.test(document.getElementById('cv2-list').textContent), { timeout: 5000 });
    await click('.cv2-row.archived');
    await click('[data-act="restore"]');
    await page.waitForFunction(() => !document.querySelector('.cv2-row.archived'), { timeout: 5000 });
    await page.click('#cv2-arch');
  });
  await step('+ New on the Roles tab creates a custom role', async () => {
    await click('[data-act="new"]');
    await type('#cv2f_name', 'Spider Cam Operator');
    await page.select('#cv2f_category', 'crew');
    await type('#cv2f_department', 'Camera');
    await click('#cv2-save');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Spider Cam Operator' && !document.querySelector('[data-act="cancel-new"]'), { timeout: 5000 });
    const r = (await db.query(`SELECT category, department FROM roles WHERE owner_id=$1 AND name='Spider Cam Operator'`, [userId])).rows[0];
    assert(r && r.category === 'crew' && r.department === 'Camera', JSON.stringify(r));
  });

  console.log('\nLocations / archive');
  await step('create location, archive, show archived, restore', async () => {
    await click('[data-act="tab"][data-tab="locations"]');
    await click('[data-act="new"]');
    await type('#cv2f_name', 'Building 92');
    await type('#cv2f_city', 'London');
    await page.click('#cv2f_country'); // one click selects the whole value
    await page.type('#cv2f_country', 'united k'); await sleep(150);
    await page.keyboard.press('Enter');
    assert(await page.$eval('#cv2f_country', e => e.value) === 'United Kingdom', 'country picked');
    await type('#cv2f_state', 'Greater London');
    await sleep(100);
    assert(!(await page.$('#cv2-ta-state.open')), 'no US list abroad');
    await click('#cv2-save');
    await page.waitForFunction(() => document.querySelector('.cv2-detail-title').textContent === 'Building 92' && !document.querySelector('[data-act="cancel-new"]'), { timeout: 5000 });
    await click('[data-act="archive"]');
    await T('#modal-overlay.open');
    await page.evaluate(() => document.getElementById('modal-ok').click());
    await page.waitForFunction(() => /No locations yet|Nothing matches/.test(document.getElementById('cv2-list').textContent), { timeout: 5000 });
    await page.click('#cv2-arch');
    await page.waitForFunction(() => /Building 92/.test(document.getElementById('cv2-list').textContent), { timeout: 5000 });
    await click('.cv2-row');
    await click('[data-act="restore"]');
    await page.waitForFunction(() => !document.querySelector('.cv2-row.archived'), { timeout: 5000 });
    const l = (await db.query(`SELECT archived_at, state, country FROM locations WHERE owner_id=$1`, [userId])).rows[0];
    assert(l && l.archived_at === null, 'restored in DB');
    assert(l.state === 'Greater London' && l.country === 'GB', 'abroad address: ' + l.state + '/' + l.country);
    assert(await page.$$eval('.cv2-row-sub', els => els.some(e => /London, Greater London, United Kingdom/.test(e.textContent))), 'list shows country abroad');
  });
  await step('names with HTML are shown as text, not markup', async () => {
    await click('[data-act="tab"][data-tab="people"]');
    await click('[data-act="new"]');
    await type('#cv2f_name', '<img src=x onerror="window.__xss=1">Bobby');
    await click('#cv2-save');
    await sleep(800);
    assert(!(await page.evaluate(() => window.__xss)), 'script ran');
    assert(await page.$$eval('.cv2-row-name', els => els.some(e => e.textContent.includes('<img'))), 'name not shown literally');
  });
  await step('My Info: default country setting drives new addresses', async () => {
    await page.evaluate(() => document.querySelector('#contacts-v2-modal [data-act="close"]').click());
    await page.evaluate(() => openMyInfo());
    await T('#myinfo_country');
    await page.waitForFunction(() => document.getElementById('myinfo_country').value === 'US', { timeout: 3000 });
    await page.select('#myinfo_country', 'CA');
    await page.evaluate(() => saveMyInfo());
    await page.waitForFunction(async () => (await (await fetch('/api/v2/settings')).json()).default_country === 'CA', { timeout: 5000 });
    await page.evaluate(() => openContacts());
    await click('[data-act="tab"][data-tab="people"]');
    await click('[data-act="new"]');
    assert(await page.$eval('#cv2f_country', e => e.value) === 'Canada', 'new person defaults to Canada');
    await click('[data-act="cancel-new"]');
    await page.evaluate(() => fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_country: 'US' }) }));
  });
  await step('reopen: data reloads from server', async () => {
    await page.reload({ waitUntil: 'networkidle2' });
    await page.evaluate(() => openContacts());
    await page.waitForFunction(() => document.querySelectorAll('#cv2-list .cv2-row').length === 3, { timeout: 5000 });
    await shot('07-people-list');
  });

  console.log('\nMobile');
  await step('mobile: one pane at a time, Back returns to list', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.evaluate(() => openContacts());
    await page.waitForFunction(() => document.querySelectorAll('#cv2-list .cv2-row').length === 3, { timeout: 5000 });
    await sleep(300);
    await shot('08-mobile-list');
    assert(await page.$eval('.cv2-detailpane', e => getComputedStyle(e).display === 'none'), 'detail hidden');
    await click('.cv2-row');
    await sleep(300);
    assert(await page.$eval('.cv2-listpane', e => getComputedStyle(e).display === 'none'), 'list hidden');
    await shot('09-mobile-detail');
    await click('[data-act="back"]');
    await sleep(200);
    assert(await page.$eval('.cv2-listpane', e => getComputedStyle(e).display !== 'none'), 'list back');
  });

  if (/\[v2\]/.test(serverLog)) console.log('\nServer v2 errors:\n' + serverLog.split('\n').filter(l => /\[v2\]/.test(l)).join('\n'));
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
