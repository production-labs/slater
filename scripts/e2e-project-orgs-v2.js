// End-to-end browser test for the Project tab organization pickers
// (data-model-rewrite, Session 4). LOCAL DATABASE ONLY.
//
// Drives real Chrome through the Project tab with ?contacts=v2 and checks the
// database (projects.agency_org_id / client_org_id + the bundle mirror) after
// each step. Also downloads a call sheet and checks the agency block in it.
// Creates two temporary users and deletes them afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-project-orgs-v2.js
// Screenshots land in /tmp/cv2-e2e/shots (po2-*).
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3997, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots', DL = '/tmp/cv2-e2e/dl';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'po2e2e-' + STAMP + '@example.invalid', OTHER = 'po2e2e-other-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, otherId, passed = 0;
const fails = [], consoleErrors = [];

// 1x1 PNG logo
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/po2-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function docText(file) {
  return execFileSync('unzip', ['-p', file, 'word/document.xml']).toString()
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'PO2 Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  otherId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'PO2 Other') RETURNING id`, [OTHER, hash])).rows[0].id;
  const foreignOrg = (await db.query(`INSERT INTO organizations (owner_id, name, is_agency) VALUES ($1,'Not Yours Inc',true) RETURNING id`, [otherId])).rows[0].id;

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
  const shot = n => page.screenshot({ path: path.join(SHOTS, 'po2-' + n + '.png') });
  const api = (method, url, body) => page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, method, url, body);
  const proj = async key => (await db.query('SELECT * FROM projects WHERE key=$1', [key])).rows[0];
  const openProject = async key => {
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    await sleep(300);
  };
  const saveNow = async key => {
    await page.evaluate(() => autosaveNow());
    // wait for the server copy to reflect the form
    await page.waitForFunction(async k => {
      const r = await fetch('/api/projects/' + k); if (!r.ok) return false;
      const row = await r.json(); return JSON.stringify(row.data.agency_org_id) === JSON.stringify(_orgLinks.agency_org_id || null)
        && JSON.stringify(row.data.client_org_id) === JSON.stringify(_orgLinks.client_org_id || null);
    }, { timeout: 8000, polling: 300 }, key);
  };
  const agencyOptions = () => page.$$eval('#project_agency_id option', os => os.map(o => ({ v: o.value, t: o.textContent })));

  // Organizations made through the real API.
  let agA, agB, cli;
  await step('setup: agencies, a client and a default agency via /api/v2', async () => {
    agA = (await api('POST', '/api/v2/organizations', { name: 'Alpha Agency', is_agency: true, logo: LOGO, address: '1 Front St', city: 'Toronto', state: 'Ontario', country: 'CA', contact_name: 'Bea Billing', contact_phone: '(416) 555-0100', invoicing_email: 'ap@alpha.example', invoicing_text: 'Invoice Alpha within 5 days.', timezone: 'ET', default_project_type: 'webinar' })).body;
    agB = (await api('POST', '/api/v2/organizations', { name: 'Bravo Agency', is_agency: true, city: 'Seattle', state: 'WA', country: 'US', contact_name: 'Bo Bravo', invoicing_email: 'ap@bravo.example' })).body;
    cli = (await api('POST', '/api/v2/organizations', { name: 'Contoso Client', logo: LOGO })).body;
    assert(agA.id && agB.id && cli.id, 'orgs created');
    assert(agA.state === 'ON' && agA.country === 'CA', 'address normalized');
    const d = await api('PUT', '/api/v2/default-organization', { organization_id: agA.id });
    assert(d.status === 200, 'default ' + d.status);
  });

  console.log('\nFlag off');
  let keyOld;
  await step('flag off: old pickers, save leaves the org columns empty', async () => {
    await page.goto(BASE + '/?contacts=v1', { waitUntil: 'networkidle2' });
    await page.evaluate(() => libNew());
    await sleep(300);
    const opts = await agencyOptions();
    assert(!opts.some(o => o.t.includes('Alpha')), 'old dropdown must not list v2 orgs: ' + JSON.stringify(opts));
    assert(!(await page.$('.po2-hint')), 'no v2 hint element');
    await page.type('#project_title', 'Old Flag Project');
    await page.type('#client_company', 'Contoso Client');
    await page.evaluate(() => libSave());
    await page.waitForFunction(() => !!currentSheetKey, { timeout: 5000 });
    keyOld = await page.evaluate(() => currentSheetKey);
    let row; for (let i = 0; i < 20 && !row; i++) { row = await proj(keyOld); if (!row) await sleep(250); }
    assert(row, 'saved');
    assert(row.agency_org_id === null && row.client_org_id === null, 'columns stay null: ' + row.agency_org_id + '/' + row.client_org_id);
    assert(row.data.client_company === 'Contoso Client', 'old text saved');
  });

  console.log('\nFlag on');
  let key;
  await step('new project: agency dropdown lists agencies only, default preselected + its defaults applied', async () => {
    await page.goto(BASE + '/?contacts=v2', { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.removeItem('slater_last_project'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.evaluate(() => libNew());
    await page.waitForFunction(id => document.getElementById('project_agency_id').value === String(id), { timeout: 5000 }, agA.id);
    const opts = await agencyOptions();
    const names = opts.map(o => o.t);
    assert(names.includes('Alpha Agency (default)') && names.includes('Bravo Agency'), JSON.stringify(names));
    assert(!names.some(n => /Contoso|Not Yours/.test(n)), 'client + foreign orgs not offered: ' + JSON.stringify(names));
    assert(await page.$eval('#project_type', e => e.value) === 'webinar', 'default project type applied');
    await shot('01-new-project');
  });

  await step('save: agency link lands in the column AND the bundle mirror', async () => {
    await page.type('#project_title', 'V2 Picker Project');
    await page.evaluate(() => libSave());
    await page.waitForFunction(() => !!currentSheetKey, { timeout: 5000 });
    key = await page.evaluate(() => currentSheetKey);
    let row; for (let i = 0; i < 20; i++) { row = await proj(key); if (row && row.agency_org_id) break; await sleep(250); }
    assert(row.agency_org_id === agA.id, 'column ' + row.agency_org_id);
    assert(row.data.agency_org_id === agA.id, 'mirror ' + row.data.agency_org_id);
    assert(row.data.agency_id === null, 'rollback agency_id null for a v2-only org: ' + row.data.agency_id);
  });

  await step('client picker: type, pick from list -> linked, saved', async () => {
    await page.click('#client_company');
    await page.type('#client_company', 'cont');
    await T('.ac-list.open .ac-item');
    const items = await page.$$eval('.ac-list.open .ac-item', els => els.map(e => e.textContent));
    assert(items[0].startsWith('Contoso Client'), JSON.stringify(items));
    await shot('02-client-picker');
    // human-speed click
    const el = await page.$('.ac-list.open .ac-item');
    const b = await el.boundingBox();
    await page.mouse.move(b.x + 10, b.y + 5); await page.mouse.down(); await sleep(300); await page.mouse.up();
    assert(await page.$eval('#client_company', e => e.value) === 'Contoso Client', 'text');
    assert(await page.evaluate(() => _orgLinks.client_org_id) === cli.id, 'linked');
    await saveNow(key);
    const row = await proj(key);
    assert(row.client_org_id === cli.id && row.data.client_org_id === cli.id, 'saved link');
    assert(row.data.client_company === 'Contoso Client', 'rollback text');
  });

  await step('client branding: logo found, no warning', async () => {
    await page.click('#doc_branding_client');
    await sleep(100);
    const st = await page.evaluate(() => ({ warn: getComputedStyle(document.getElementById('branding-warning')).display, logo: !!lookupCompanyLogo(document.getElementById('client_company').value) }));
    assert(st.warn === 'none' && st.logo, JSON.stringify(st));
  });

  await step('editing the text unlinks; unknown name shows hint; "+ Add" creates + links the org', async () => {
    await page.$eval('#client_company', e => { e.focus(); e.select(); });
    await page.keyboard.press('Backspace');
    await page.type('#client_company', 'Fabrikam Films');
    assert(await page.evaluate(() => _orgLinks.client_org_id) === null, 'unlinked while typing');
    await T('.ac-item.po2-add');
    await page.evaluate(() => document.getElementById('client_company').blur());
    await T('.po2-hint');
    assert(/Not in your organizations/.test(await page.$eval('.po2-hint', e => e.textContent)), 'hint');
    await shot('03-unlinked-hint');
    await page.click('#client_company');
    await T('.ac-item.po2-add');
    await page.$eval('.ac-item.po2-add', e => e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await page.waitForFunction(() => !!_orgLinks.client_org_id, { timeout: 5000 });
    const org = (await db.query(`SELECT * FROM organizations WHERE owner_id=$1 AND name='Fabrikam Films'`, [userId])).rows[0];
    assert(org && !org.is_agency, 'org created, not an agency');
    assert(await page.evaluate(() => _orgLinks.client_org_id) === org.id, 'linked to new org');
    assert(await page.$eval('.po2-hint', e => getComputedStyle(e).display) === 'none', 'hint hidden');
    // Client branding with no logo warns
    assert(await page.$eval('#branding-warning', e => e.textContent).then(t => /No logo/.test(t)), 'no-logo warning');
  });

  await step('exact name typed (any case) links on blur', async () => {
    await page.$eval('#client_company', e => { e.focus(); e.select(); });
    await page.keyboard.press('Backspace');
    await page.type('#client_company', '  contoso   CLIENT ');
    await page.evaluate(() => document.getElementById('client_company').blur());
    await sleep(100);
    assert(await page.evaluate(() => _orgLinks.client_org_id) === cli.id, 'linked by exact name');
    assert(await page.$eval('#client_company', e => e.value) === 'Contoso Client', 'text normalized to org name');
  });

  await step('change agency -> saved; docs read the picked agency', async () => {
    await page.select('#project_agency_id', String(agB.id));
    await saveNow(key);
    assert((await proj(key)).agency_org_id === agB.id, 'column B');
    const info = await page.evaluate(() => getAgencyInfo());
    assert(info.name === 'Bravo Agency' && info.billing_contact === 'Bo Bravo' && info.billing_email === 'ap@bravo.example', JSON.stringify(info));
    assert(!info.country_label, 'US agency prints no country for a US user');
    await page.select('#project_agency_id', String(agA.id));
    const infoA = await page.evaluate(() => getAgencyInfo());
    assert(infoA.country_label === 'Canada' && infoA.invoicing_text === 'Invoice Alpha within 5 days.', JSON.stringify(infoA));
    await saveNow(key);
  });

  await step('call sheet .docx prints the org agency block (name, address, country, phone)', async () => {
    await page.click('#doc_branding_agency');
    await page.evaluate(() => generateDoc());
    let file; for (let i = 0; i < 40 && !file; i++) { file = fs.readdirSync(DL).find(f => f.endsWith('.docx')); if (!file) await sleep(250); }
    assert(file, 'call sheet downloaded');
    const text = docText(path.join(DL, file));
    for (const s of ['Alpha Agency', '1 Front St', 'Toronto, ON', 'Canada', '(416) 555-0100', 'Invoice Alpha within 5 days.']) assert(text.includes(s), 'missing in call sheet: ' + s);
    fs.unlinkSync(path.join(DL, file));
  });

  await step('expense report .docx prints the org billing contact', async () => {
    await page.evaluate(() => addExpense({ date: '2026-10-01', vendor: 'Test Vendor', amount: '12.50', cat: 'Meals' }));
    await page.evaluate(() => generateExpenseDoc());
    let file; for (let i = 0; i < 40 && !file; i++) { file = fs.readdirSync(DL).find(f => f.endsWith('.docx')); if (!file) await sleep(250); }
    assert(file, 'expense report downloaded');
    const text = docText(path.join(DL, file));
    assert(text.includes('Alpha Agency') && text.includes('Bea Billing'), 'agency + billing contact in expense report');
    fs.unlinkSync(path.join(DL, file));
  });

  console.log('\nSource of truth');
  await step('org rename shows up when the project reopens (link, not text)', async () => {
    const cur = (await api('GET', '/api/v2/organizations/' + cli.id)).body;
    const r = await api('PATCH', '/api/v2/organizations/' + cli.id, { name: 'Contoso Ltd', base_updated_at: cur.updated_at });
    assert(r.status === 200, 'rename ' + r.status);
    await openProject(key);
    await page.waitForFunction(() => document.getElementById('client_company').value === 'Contoso Ltd', { timeout: 5000 });
  });

  await step('column wins over a disagreeing bundle copy on load', async () => {
    await db.query(`UPDATE projects SET data = jsonb_set(data, '{client_org_id}', to_jsonb($2::int)) WHERE key=$1`, [key, agB.id]);
    const r = await api('GET', '/api/projects/' + key);
    assert(r.body.data.client_org_id === cli.id, 'GET overlays column: ' + r.body.data.client_org_id);
  });

  await step('old-format save (no link keys) keeps the links', async () => {
    const before = await proj(key);
    const data = Object.assign({}, before.data); delete data.agency_org_id; delete data.client_org_id;
    data.client_company = 'Typed On Old Device';
    const r = await api('POST', '/api/projects/' + key, { label: before.label, data });
    assert(r.status === 200, 'save ' + r.status);
    const after = await proj(key);
    assert(after.agency_org_id === agA.id && after.client_org_id === cli.id, 'columns kept');
    assert(after.data.agency_org_id === agA.id && after.data.client_org_id === cli.id, 'mirror restored');
  });

  await step("another user's organization is refused (stored as no link + warning)", async () => {
    const before = await proj(key);
    const data = Object.assign({}, before.data, { agency_org_id: foreignOrg, client_org_id: 'abc' });
    const r = await api('POST', '/api/projects/' + key, { label: before.label, data });
    assert(r.status === 200, 'save ' + r.status);
    assert((r.body.org_link_warnings || []).length === 2, JSON.stringify(r.body.org_link_warnings));
    const after = await proj(key);
    assert(after.agency_org_id === null && after.client_org_id === null, 'not linked');
    assert(after.data.agency_org_id === null && after.data.client_org_id === null, 'mirror null');
    // put the links back for the next steps
    await api('POST', '/api/projects/' + key, { label: before.label, data: Object.assign({}, before.data, { agency_org_id: agA.id, client_org_id: cli.id }) });
  });

  await step('linked client org cannot be permanently deleted (project named)', async () => {
    await api('DELETE', '/api/v2/organizations/' + cli.id);
    const r = await api('DELETE', '/api/v2/organizations/' + cli.id + '/permanent');
    assert(r.status === 409 && r.body.error === 'in_use', r.status + ' ' + JSON.stringify(r.body));
    assert(JSON.stringify(r.body).includes('V2 Picker Project'), 'project named');
  });

  await step('archived client stays shown with a hint; archived agency stays selectable as (archived)', async () => {
    await api('DELETE', '/api/v2/organizations/' + agA.id);
    try {
      await openProject(key);
      await page.waitForFunction(id => [...document.querySelectorAll('#project_agency_id option')].some(o => o.value === String(id) && /\(archived\)/.test(o.textContent)), { timeout: 5000 }, agA.id);
      assert(await page.$eval('#project_agency_id', e => e.value) === String(agA.id), 'still selected');
      await page.waitForFunction(() => /archived/.test((document.querySelector('.po2-hint') || {}).textContent || ''), { timeout: 5000 });
      // docs still use the archived agency, not the default fallback
      assert((await page.evaluate(() => getAgencyInfo())).name === 'Alpha Agency', 'docs use linked archived agency');
      await shot('04-archived');
    } finally {
      await api('POST', '/api/v2/organizations/' + agA.id + '/restore');
      await api('POST', '/api/v2/organizations/' + cli.id + '/restore');
    }
  });

  console.log('\nBefore the migration');
  await step('old project links by old agency id + exact client name on load', async () => {
    const legacyAgency = (await db.query(`INSERT INTO agencies (user_id, name) VALUES ($1,'Legacy Agency') RETURNING id`, [userId])).rows[0].id;
    const org = (await db.query(`INSERT INTO organizations (owner_id, name, is_agency, legacy_agency_id, legacy_source) VALUES ($1,'Legacy Agency',true,$2,'agency') RETURNING id`, [userId, legacyAgency])).rows[0].id;
    const k = 'cs_po2legacy_' + STAMP;
    await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,'Legacy Project',$2,$3)`,
      [k, JSON.stringify({ project_title: 'Legacy Project', project_type: 'location_shoot', agency_id: String(legacyAgency), client_company: 'contoso ltd' }), userId]);
    await openProject(k);
    assert(await page.$eval('#project_agency_id', e => e.value) === String(org), 'agency auto-linked');
    assert(await page.evaluate(() => _orgLinks.client_org_id) === cli.id, 'client auto-linked');
    await saveNow(k);
    const row = await proj(k);
    assert(row.agency_org_id === org && row.client_org_id === cli.id, 'saved to columns');
    assert(row.data.agency_id === String(legacyAgency), 'rollback agency_id = old agency id: ' + row.data.agency_id);
  });

  console.log('\nAgencies button');
  await step('Agencies button opens Contacts on the Organizations tab', async () => {
    await page.evaluate(() => openAgencyManager());
    await T('#contacts-v2-modal.open');
    await sleep(300);
    const active = await page.$eval('#contacts-v2-modal', e => (e.querySelector('[data-tab].active, .active[data-tab]') || {}).textContent || '');
    assert(/Organizations/.test(active), 'active tab: ' + active);
    await shot('05-agencies-button');
  });

  await step('editing an org in Contacts refreshes the project dropdown', async () => {
    const cur = (await api('GET', '/api/v2/organizations/' + agB.id)).body;
    await api('PATCH', '/api/v2/organizations/' + agB.id, { name: 'Bravo Agency Renamed', base_updated_at: cur.updated_at });
    await page.evaluate(() => ContactsV2.sync());
    await page.waitForFunction(() => [...document.querySelectorAll('#project_agency_id option')].some(o => o.textContent === 'Bravo Agency Renamed'), { timeout: 5000 });
  });

  if (/Error|org link warnings/.test(serverLog)) console.log('\nServer log (errors/warnings):\n' + serverLog.split('\n').filter(l => /Error|warn/i.test(l)).join('\n'));
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  for (const id of [userId, otherId]) {
    try { if (id) { await db.query('DELETE FROM projects WHERE owner_id=$1', [id]); await db.query('DELETE FROM agencies WHERE user_id=$1', [id]); await db.query('DELETE FROM users WHERE id=$1', [id]); } } catch (e) { console.log('cleanup error ' + e.message); }
  }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
