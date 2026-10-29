// End-to-end test: Client Portal, public side (V1.5 step 5a).
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// One-time setup (same as the other e2e scripts):
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-portal.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3995, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'portale2e-' + STAMP + '@example.invalid';
let server, browser, userId, passed = 0, serverLog = '';
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newToken = () => crypto.randomBytes(32).toString('base64url');
function rel(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const api = (token, opts) => fetch(BASE + '/api/portal/' + token, opts);
const unlock = (token, password, cookie) => fetch(BASE + '/api/portal/' + token + '/unlock', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
  body: JSON.stringify({ password }),
});
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  userId = (await db.query(`INSERT INTO users (email, password_hash, name, dba) VALUES ($1,'x','Portal Tester','Tester Films') RETURNING id`, [EMAIL])).rows[0].id;
  const org = async (name, isAgency, logo) => (await db.query(
    `INSERT INTO organizations (owner_id, name, is_agency, logo) VALUES ($1,$2,$3,$4) RETURNING id`, [userId, name, isAgency, logo])).rows[0].id;
  const clientOrg = await org('New Frontier Firm', false, PNG);
  const agencyOrg = await org('Worktank', true, null);
  const locId = (await db.query(`INSERT INTO locations (owner_id, name, address, city, state, zip, notes) VALUES ($1,'Smith Tower','506 Second Ave','Seattle','WA','98104','SECRET_LOC_NOTES') RETURNING id`, [userId])).rows[0].id;

  const data = {
    project_title: 'Q4 Summit', project_type: 'live_broadcast_studio', client_company: 'New Frontier Firm',
    kickoff_date_iso: rel(-10),
    schedule_days: [
      { id: 'sday_1', date_iso: rel(8), end_date_iso: rel(9), label: 'Live Event', call_time: '5:45 AM', golive: '9:00 AM PT', location_id: locId, loc_name: 'Smith Tower', loc_notes: 'SECRET_DAY_NOTES' },
      { id: 'sday_2', date_iso: rel(5), label: 'SECRET_INTERNAL_DAY', call_time: '7:00 AM' },
    ],
    internal_pins: { pin_sday_2: true },
    wb_items: [
      { uuid: 'w-client', item: 'Approve Script V2', owner: 'new frontier firm', mode: 'manual', manual_date: rel(2), due: rel(2), status: 'Not Started' },
      { uuid: 'w-client-done', item: 'Approve Script V1', owner: 'Client', due: rel(-3), status: 'Complete' },
      { uuid: 'w-ours', item: 'Edit begins', owner: 'SecretOwnerShaun', due: rel(4), status: 'In Progress' },
      { uuid: 'w-internal', item: 'SECRET_INTERNAL_ITEM', owner: 'Client', due: rel(3), status: 'Not Started', internal: true },
      { uuid: 'w-na', item: 'SECRET_NA_ITEM', owner: 'Client', due: rel(3), status: 'N/A' },
    ],
    kp_cards: [
      { _id: 'k1', role: 'Executive Producer', name: 'John McDonald', email: 'john@example.com', phone: '(253) 555-0100' },
      { _id: 'k2', role: 'Producer', name: '<img src=x onerror="window.__xss=1">Shaun', email: 'not-an-email', phone: '206 555 0148' },
    ],
    crew: [{ id: 'c1', name: 'SECRET_CREW', position: 'DP', status: 'confirmed', phone: '555' }],
    talent: [{ id: 't1', name: 'SECRET_TALENT', title: 'Host', status: 'confirmed' }],
    expenses: [{ vendor: 'SECRET_EXPENSE', amount: 999 }],
    notes: 'SECRET_NOTES',
    urls: [
      { name: 'Script V2', url: 'https://example.com/script', notes: 'SharePoint', visible_to_client: true, wb_item_uuid: 'w-client' },
      { name: 'SECRET_HIDDEN_LINK', url: 'https://example.com/budget', wb_item_uuid: 'w-client' },
      { name: 'Rough cut', url: 'https://f.io/abc', visible_to_client: true, wb_item_uuid: 'w-internal' },
      { name: 'SECRET_JS_LINK', url: 'javascript:alert(1)', visible_to_client: true },
    ],
  };
  const mkProject = async (key, d) => (await db.query(
    `INSERT INTO projects (key, label, data, owner_id, client_org_id, agency_org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [key, d.project_title, JSON.stringify(d), userId, clientOrg, agencyOrg])).rows[0].id;
  const pid = await mkProject('cs_portal_a_' + STAMP, data);
  const pidB = await mkProject('cs_portal_b_' + STAMP, Object.assign({}, data, { project_title: 'Other' }));
  const pidC = await mkProject('cs_portal_c_' + STAMP, Object.assign({}, data, { project_title: 'Limiter' }));
  const T = newToken(), TB = newToken(), TC = newToken();
  const hash = await bcrypt.hash('open sesame', 10);
  await db.query(`INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)`, [pid, userId, T]);
  await db.query(`INSERT INTO portals (project_id, owner_id, token, password_hash) VALUES ($1,$2,$3,$4)`, [pidB, userId, TB, hash]);
  await db.query(`INSERT INTO portals (project_id, owner_id, token, password_hash) VALUES ($1,$2,$3,$4)`, [pidC, userId, TC, hash]);
  await db.query(`INSERT INTO portal_updates (project_id, owner_id, author_name, body, created_at) VALUES ($1,$2,'Shaun Parker','Older update', NOW() - interval '2 days'), ($1,$2,'Shaun Parker', E'Script V2 is posted.\nPlease review.', NOW())`, [pid, userId]);

  server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }

  let payload;
  await step('unknown, malformed and missing tokens all get the same 404', async () => {
    for (const t of [newToken(), 'short', 'has.dots.' + newToken(), encodeURIComponent("' OR 1=1 --") + 'x'.repeat(40)]) {
      const r = await api(t);
      assert(r.status === 404, t + ' -> ' + r.status);
      assert(JSON.stringify(await r.json()) === '{"error":"not_found"}', 'body');
    }
  });

  await step('API responses are no-store, no-referrer, noindex', async () => {
    const r = await api(T);
    assert(r.status === 200, 'status ' + r.status);
    assert(r.headers.get('cache-control') === 'no-store', 'cache ' + r.headers.get('cache-control'));
    assert(r.headers.get('referrer-policy') === 'no-referrer', 'referrer');
    assert(/noindex/.test(r.headers.get('x-robots-tag')), 'robots');
    payload = await r.json();
  });

  await step('payload never carries internal or private data', async () => {
    const s = JSON.stringify(payload);
    ['SECRET_', 'SecretOwner', '5:45', '7:00 AM', 'password', 'sday_', 'budget', 'javascript:', 'w-internal', 'w-na', String(userId) + ',']
      .forEach(x => assert(s.indexOf(x) === -1, 'leaked "' + x + '"'));
    assert(!('crew' in payload) && !('talent' in payload) && !('expenses' in payload) && !('notes' in payload), 'unexpected keys ' + Object.keys(payload));
    assert(JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(['client', 'key_date', 'links', 'producer', 'project', 'schedule', 'team', 'timeline', 'updates', 'venues', 'waiting']), 'top-level keys ' + Object.keys(payload).sort());
  });

  await step('payload has what the client should see', async () => {
    const p = payload;
    assert(p.project.title === 'Q4 Summit' && p.project.type === 'Live Broadcast', 'project ' + JSON.stringify(p.project));
    assert(p.client.name === 'New Frontier Firm' && p.client.logo === PNG, 'client');
    assert(p.producer.name === 'Worktank', 'producer is the agency org: ' + p.producer.name);
    assert(p.waiting.length === 1 && p.waiting[0].item === 'Approve Script V2' && p.waiting[0].response === null, 'waiting ' + JSON.stringify(p.waiting));
    const kinds = p.timeline.map(n => n.kind + ':' + n.label).join(', ');
    assert(/milestone:Kickoff/.test(kinds) && /milestone:Live Event/.test(kinds) && /client:Approve Script V2/.test(kinds) && /ours:Edit begins/.test(kinds), 'timeline ' + kinds);
    const live = p.schedule.find(s => s.label === 'Live Event');
    assert(live && live.time === '9:00 AM PT' && live.location === 'Smith Tower' && live.end_date === rel(9), 'live day ' + JSON.stringify(live));
    assert(p.venues.length === 1 && p.venues[0].city_line === 'Seattle, WA 98104', 'venue ' + JSON.stringify(p.venues));
    assert(p.links.length === 2 && p.links[0].url === 'https://example.com/script' && p.links[1].url === 'https://f.io/abc', 'links ' + JSON.stringify(p.links));
    assert(p.links.every(l => JSON.stringify(Object.keys(l).sort()) === '["name","notes","url"]'), 'link keys ' + JSON.stringify(p.links));
    assert(JSON.stringify(p.waiting[0].links) === JSON.stringify([{ name: 'Script V2', url: 'https://example.com/script' }]), 'review link beside item ' + JSON.stringify(p.waiting[0].links));
    assert(p.team.length === 2 && p.team[1].email === '', 'bad email dropped: ' + JSON.stringify(p.team));
    assert(p.updates.length === 2 && p.updates[0].body.startsWith('Script V2'), 'updates newest first');
    assert(p.key_date === rel(9), 'key date ' + p.key_date);
  });

  await step('an unconfirmed client response shows on its waiting item', async () => {
    await db.query(`INSERT INTO portal_responses (project_id, owner_id, wb_item_uuid, kind) VALUES ($1,$2,'w-client','approved')`, [pid, userId]);
    const w = (await (await api(T)).json()).waiting[0];
    assert(w.response && w.response.kind === 'approved', JSON.stringify(w));
    await db.query(`UPDATE portal_responses SET acknowledged_at = NOW() WHERE project_id = $1`, [pid]);
    assert((await (await api(T)).json()).waiting[0].response === null, 'acknowledged response still shown');
  });

  let cookie;
  await step('password: locked, wrong password refused, right one sets a scoped cookie', async () => {
    assert((await api(TB)).status === 401, 'not locked');
    assert((await unlock(TB, 'nope')).status === 401, 'wrong password accepted');
    assert((await unlock(TB, '')).status === 401, 'empty password accepted');
    const r = await unlock(TB, 'open sesame');
    assert(r.status === 200, 'right password ' + r.status);
    const sc = r.headers.get('set-cookie') || '';
    assert(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), 'cookie flags ' + sc);
    assert(sc.indexOf('Path=/api/portal/' + TB) !== -1, 'cookie path ' + sc);
    cookie = sc.split(';')[0];
    const ok = await api(TB, { headers: { Cookie: cookie } });
    assert(ok.status === 200 && (await ok.json()).project.title === 'Other', 'cookie does not unlock');
  });

  await step('a tampered cookie, or one from another portal, does not unlock', async () => {
    const [name, val] = cookie.split('=');
    const [exp, sig] = decodeURIComponent(val).split('.');
    const later = name + '=' + encodeURIComponent((Number(exp) + 1000) + '.' + sig);
    assert((await api(TB, { headers: { Cookie: later } })).status === 401, 'changed expiry accepted');
    const flipped = name + '=' + encodeURIComponent(exp + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1));
    assert((await api(TB, { headers: { Cookie: flipped } })).status === 401, 'changed signature accepted');
    assert((await api(TC, { headers: { Cookie: cookie } })).status === 401, 'B cookie opened C (same password)');
  });

  await step('changing the password signs existing clients out', async () => {
    await db.query(`UPDATE portals SET password_hash = $1 WHERE project_id = $2`, [await bcrypt.hash('new pass', 10), pidB]);
    assert((await api(TB, { headers: { Cookie: cookie } })).status === 401, 'old cookie still works');
  });

  await step('password guessing is limited to 10 per 15 minutes per portal', async () => {
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await unlock(TC, 'guess' + i)).status);
    assert(codes.slice(0, 10).every(c => c === 401) && codes[10] === 429, 'codes ' + codes);
    assert((await unlock(TC, 'open sesame')).status === 429, 'right password let through while limited');
    assert((await unlock(TB, 'new pass')).status === 200, 'limit spilled over to another portal');
  });

  await step('regenerated link, portal turned off, suspended owner: old link is dead', async () => {
    const fresh = newToken();
    await db.query(`UPDATE portals SET token = $1 WHERE project_id = $2`, [fresh, pidB]);
    assert((await api(TB)).status === 404, 'old token still works');
    assert((await api(fresh)).status === 401, 'new token not live');
    await db.query(`DELETE FROM portals WHERE project_id = $1`, [pidB]);
    assert((await api(fresh)).status === 404, 'turned-off portal still answers');
    await db.query(`UPDATE users SET is_suspended = TRUE WHERE id = $1`, [userId]);
    assert((await api(T)).status === 404, 'suspended owner portal still answers');
    await db.query(`UPDATE users SET is_suspended = FALSE WHERE id = $1`, [userId]);
    assert((await api(T)).status === 200, 'unsuspend');
  });

  await step('portal page is served with a strict content security policy', async () => {
    const r = await fetch(BASE + '/portal/' + T);
    const csp = r.headers.get('content-security-policy') || '';
    assert(r.status === 200 && /script-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-inline/.test(csp), 'csp ' + csp);
    assert(r.headers.get('referrer-policy') === 'no-referrer', 'page referrer policy');
    const html = await r.text();
    assert(html.indexOf('Q4 Summit') === -1, 'page shell should carry no project data');
  });

  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1200, height: 1400 });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  // Page loaded and the script has drawn something other than "Loading...".
  const open = async (url) => {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !/Loading\.\.\./.test(document.getElementById('app').textContent), { timeout: 8000 });
  };

  await step('page renders every section; typed-in markup stays text', async () => {
    await open('/portal/' + T);
    const t = await page.$eval('#app', e => e.textContent);
    ['Q4 Summit', 'New Frontier Firm', 'Produced by Worktank', 'Waiting on you', 'Approve Script V2', 'Project timeline',
     'What happens when', 'Live Event', 'Your team', 'John McDonald', 'Links', 'Script V2', 'Venue', 'Smith Tower',
     'Latest update', 'Earlier updates (1)', 'Deliverables'].forEach(x => assert(t.indexOf(x) !== -1, 'missing "' + x + '"'));
    assert(t.indexOf('<img src=x') !== -1, 'markup in a name should show as text');
    assert(await page.evaluate(() => window.__xss === undefined), 'XSS ran');
    assert(await page.$eval('.brand-logo img', i => i.naturalWidth === 1), 'client logo');
    const review = await page.$$eval('.action-item .action-review', as => as.map(a => a.textContent + '|' + a.href + '|' + a.rel));
    assert(review.length === 1 && review[0] === '↗ Script V2|https://example.com/script|noopener noreferrer', 'review link beside item ' + review);
    const rels = await page.$$eval('a[target=_blank]', as => as.map(a => a.rel));
    assert(rels.length >= 2 && rels.every(r => /noreferrer/.test(r)), 'external links rel ' + rels);
    await page.screenshot({ path: SHOTS + '/portal.png', fullPage: true });
  });

  await step('lock screen: wrong then right password in the browser', async () => {
    const fresh = newToken();
    await db.query(`INSERT INTO portals (project_id, owner_id, token, password_hash) VALUES ($1,$2,$3,$4)`, [pidB, userId, fresh, hash]);
    await open('/portal/' + fresh);
    assert(await page.$('.pt-lock input[type=password]'), 'no lock screen');
    assert((await page.$eval('#app', e => e.innerText)).indexOf('Other') === -1, 'project shown before unlock');
    await page.type('.pt-lock input', 'wrong');
    await page.click('.pt-lock button');
    await page.waitForFunction(() => /isn't right/.test(document.querySelector('.pt-lock .err').textContent), { timeout: 4000 });
    await page.$eval('.pt-lock input', i => { i.value = ''; });
    await page.type('.pt-lock input', 'open sesame');
    await page.click('.pt-lock button');
    await page.waitForFunction(() => /Other/.test(document.body.innerText), { timeout: 4000 });
    await page.screenshot({ path: SHOTS + '/portal-after-unlock.png' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !/Loading\.\.\./.test(document.getElementById('app').textContent), { timeout: 8000 });
    assert(!(await page.$('.pt-lock')), 'cookie should keep it unlocked on reload');
  });

  await step('dead link shows a friendly page', async () => {
    await open('/portal/' + newToken());
    assert(/isn't active/.test(await page.$eval('#app', e => e.innerText)), 'no dead-link message');
  });

  await step('server log never contains a portal token', async () => {
    [T, TB, TC].forEach(t => assert(serverLog.indexOf(t) === -1, 'token in server log'));
    assert(/\/portal\/\[token\]/.test(serverLog), 'expected redacted lines in the log');
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try {
    if (userId) {
      await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]);
      await db.query('DELETE FROM users WHERE id=$1', [userId]);
    }
  } catch (e) { console.log('cleanup error ' + e.message); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|404|401|429/.test(e));
  if (relevant.length) { fails.push('browser console errors'); console.log('\nBrowser console errors:\n  ' + relevant.join('\n  ')); }
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
