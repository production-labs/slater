// End-to-end browser test: the project's final date (projectFinalDate) and
// the "Main event" tick box on schedule cards, plus the "Kickoff" wording.
// LOCAL DATABASE ONLY. Creates a temporary user and deletes it afterwards.
// Same one-time setup as e2e-contacts-v2.js:
//   npm i --prefix /tmp/cv2-e2e puppeteer-core
// Run:
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/e2e-main-event.js
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const bcrypt = require(APP + '/node_modules/bcrypt');
const puppeteer = require('puppeteer-core');

const PORT = 3993, BASE = 'http://localhost:' + PORT;
const SHOTS = '/tmp/cv2-e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const EMAIL = 'main-e2e-' + STAMP + '@example.invalid', PASS = 'e2e-pass-123';
let server, browser, userId, passed = 0;
const fails = [], consoleErrors = [];

async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); try { await global.__page.screenshot({ path: SHOTS + '/main-FAIL-' + fails.length + '.png' }); } catch (_) {} }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Far enough ahead that nothing here counts as past.
const SETUP = '2030-03-04', SHOW = '2030-03-05', WRAP = '2030-03-06';
const day = (id, date_iso, category, extra) => Object.assign({ id, date_iso, category, label: id }, extra);

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  userId = (await db.query(`INSERT INTO users (email, password_hash, name) VALUES ($1,$2,'Main Event Tester') RETURNING id`, [EMAIL, hash])).rows[0].id;
  const K = { live: 'cs_me_live_' + STAMP, anchored: 'cs_me_anch_' + STAMP, post: 'cs_me_post_' + STAMP };
  const seed = {
    [K.live]: { project_type: 'live_broadcast_studio', project_title: 'Live', label: 'Live', kickoff_date_iso: '2030-01-07',
      schedule_days: [day('sday_1', SETUP, 'setup_day'), day('sday_2', SHOW, 'live_broadcast'), day('sday_3', WRAP, 'wrap_day')], wb_items: [] },
    [K.anchored]: { project_type: 'location_shoot', project_title: 'Anchored', label: 'Anchored', wb_day_select: 'sday_1',
      schedule_days: [day('sday_1', SETUP, 'setup_day'), day('sday_2', SHOW, 'shoot_day')],
      wb_items: [{ item: 'Task', mode: 'anchor', days: 2, uuid: 'wb-1', status: 'Not Started' }] },
    [K.post]: { project_type: 'post_production', project_title: 'Post', label: 'Post', video_due_date_iso: '2030-04-01',
      schedule_days: [day('sday_1', '2030-04-10', 'review_session')], wb_items: [] },
  };
  for (const [key, data] of Object.entries(seed)) {
    await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4)`, [key, data.label, JSON.stringify(data), userId]);
  }
  // Near-term projects, so the Overview and portal timelines show them.
  const offset = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const tok = () => require('crypto').randomBytes(24).toString('hex');
  const near = {
    star: { key: 'cs_me_star_' + STAMP, data: { project_type: 'live_broadcast_studio', project_title: 'Star Live', label: 'Star Live', kickoff_date_iso: offset(-5), wb_items: [],
      schedule_days: [day('sday_1', offset(9), 'setup_day'), day('sday_2', offset(10), 'live_broadcast', { main_event: true }), day('sday_3', offset(11), 'wrap_day')] }, token: tok() },
    post: { key: 'cs_me_spost_' + STAMP, data: { project_type: 'post_production', project_title: 'Star Post', label: 'Star Post', kickoff_date_iso: offset(-5), video_due_date_iso: offset(12), wb_items: [], schedule_days: [] }, token: tok() },
    plain: { key: 'cs_me_plain_' + STAMP, data: { project_type: 'location_shoot', project_title: 'No Star', label: 'No Star', video_due_date_iso: offset(14), wb_items: [],
      schedule_days: [day('sday_1', offset(10), 'shoot_day')] }, token: tok() },
  };
  for (const p of Object.values(near)) {
    const id = (await db.query(`INSERT INTO projects (key, label, data, owner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [p.key, p.data.label, JSON.stringify(p.data), userId])).rows[0].id;
    await db.query(`INSERT INTO portals (project_id, owner_id, token) VALUES ($1,$2,$3)`, [id, userId, p.token]);
  }
  const serverData = async key => (await db.query('SELECT data FROM projects WHERE key=$1', [key])).rows[0].data;

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

  const openProject = async key => {
    await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => _formKey === k, { timeout: 8000 }, key);
    await sleep(300);
  };
  await openProject(K.live);

  await step('the rule: unmarked days skip Wrap and Travel', async () => {
    const r = await page.evaluate((a, b, c) => [
      projectFinalDate({ project_type: 'location_shoot', schedule_days: [{ id: 'x', date_iso: a, category: 'shoot_day' }, { id: 'y', date_iso: b, category: 'wrap_day' }, { id: 'z', date_iso: c, category: 'travel_day' }] }),
      projectFinalDate({ project_type: 'location_shoot', schedule_days: [{ id: 'y', date_iso: b, category: 'wrap_day' }] }),
    ], SHOW, WRAP, '2030-03-07');
    assert(r[0].iso === SHOW && r[0].id === 'x', JSON.stringify(r[0]));
    assert(r[1].iso === WRAP, 'only a wrap day still gives a date: ' + JSON.stringify(r[1]));
  });

  await step('the rule: a ticked day wins, and a multi-day event ends on its end date', async () => {
    const r = await page.evaluate((a, b) => projectFinalDate({ project_type: 'webinar', schedule_days: [{ id: 'x', date_iso: a, end_date_iso: '2030-03-08', category: 'shoot_day', main_event: true }, { id: 'y', date_iso: b, category: 'shoot_day' }] }), SETUP, '2030-03-20');
    assert(r.id === 'x' && r.iso === '2030-03-08', JSON.stringify(r));
  });

  await step('the rule: Post Production uses the Due Date even with a later day', async () => {
    const r = await page.evaluate(() => projectFinalDate({ project_type: 'post_production', video_due_date_iso: '2030-04-01', schedule_days: [{ id: 'x', date_iso: '2030-04-10', category: 'review_session', main_event: true }] }));
    assert(r.iso === '2030-04-01' && r.id === 'video_due', JSON.stringify(r));
  });

  await step('project label uses the final date, not the Wrap Day', async () => {
    const label = await page.evaluate(() => libLabel(gather()));
    assert(label.includes('03/05/30') && !label.includes('03/06/30'), label);
  });

  await step('ticking Main event is one per project, shows the flag, and survives a reload', async () => {
    await page.evaluate(() => { document.getElementById('sday_1_main_event').click(); document.getElementById('sday_2_main_event').click(); });
    const r = await page.evaluate(() => ({
      one: document.getElementById('sday_1_main_event').checked, two: document.getElementById('sday_2_main_event').checked,
      flag1: getComputedStyle(document.getElementById('sday_1_main_flag')).display, flag2: getComputedStyle(document.getElementById('sday_2_main_flag')).display,
      anchor: document.getElementById('wb_day_select').value,
    }));
    assert(!r.one && r.two, 'ticks ' + JSON.stringify(r));
    assert(r.flag1 === 'none' && r.flag2 !== 'none', 'flags ' + JSON.stringify(r));
    assert(r.anchor === 'sday_2', 'empty workback follows the tick: ' + r.anchor);
    await page.evaluate(() => { st('schedule'); window.scrollTo(0, 0); });
    await sleep(300);
    await page.screenshot({ path: SHOTS + '/main-card.png' });
    await page.evaluate(() => libSave());
    let saved;
    for (let i = 0; i < 20; i++) { saved = await serverData(K.live); if (saved.schedule_days[1].main_event) break; await sleep(250); }
    assert(saved.schedule_days[1].main_event === true && !saved.schedule_days[0].main_event, 'not saved');
    await openProject(K.live);
    assert(await page.evaluate(() => document.getElementById('sday_2_main_event').checked), 'tick lost on reload');
  });

  await step('Overview: key date is the main event, but the project stays upcoming through the Wrap Day', async () => {
    const today = '2030-03-06';   // the Wrap Day, the day after the broadcast
    const r = await page.evaluate((key, t, a, b) => {
      const data = { project_type: 'live_broadcast_studio', wb_items: [], schedule_days: [
        { id: 'a', date_iso: a, category: 'live_broadcast', main_event: true }, { id: 'b', date_iso: b, category: 'wrap_day' } ] };
      const on = ProjectsOverview._summarize(key, 'x', data, t);
      const after = ProjectsOverview._summarize(key, 'x', data, '2030-03-07');
      return { key: on.keyDate, past: on.past, pastAfter: after.past };
    }, K.live, today, SHOW, WRAP);
    assert(r.key === SHOW, 'key date ' + r.key);
    assert(r.past === false, 'moved to Past during the Wrap Day');
    assert(r.pastAfter === true, 'should be Past once the Wrap Day is over');
  });

  await step('ticking Main event never moves a workback that already has items', async () => {
    await openProject(K.anchored);
    const before = await page.evaluate(() => ({ sel: document.getElementById('wb_day_select').value, due: wbItems.map(id => _wbData[id].due) }));
    await page.evaluate(() => document.getElementById('sday_2_main_event').click());
    await sleep(100);
    const after = await page.evaluate(() => ({ sel: document.getElementById('wb_day_select').value, due: wbItems.map(id => _wbData[id].due) }));
    assert(before.sel === 'sday_1' && after.sel === 'sday_1', 'anchor moved: ' + JSON.stringify([before, after]));
    assert(JSON.stringify(before.due) === JSON.stringify(after.due), 'dates moved: ' + JSON.stringify([before, after]));
  });

  await step('Post Production does not offer the tick box', async () => {
    await openProject(K.post);
    await sleep(200);
    const shown = await page.evaluate(() => document.getElementById('sday_1_main_wrap').style.display);
    assert(shown === 'none', 'display ' + shown);
  });

  const wbStars = async () => page.evaluate(() => { st('workback'); wbDrawTimeline(); return document.querySelectorAll('#wb-timeline .wb-tl-pin.star').length; });

  await step('Workback timeline: one gold star on the ticked day, moving and clearing with the tick', async () => {
    await openProject(near.star.key);
    assert(await wbStars() === 1, 'ticked day should have one star');
    const color = await page.$eval('#wb-timeline .wb-tl-pin.star', e => getComputedStyle(e).backgroundColor);
    assert(color === 'rgb(229, 168, 35)', 'not gold: ' + color);
    await sleep(200);
    await page.screenshot({ path: SHOTS + '/star-workback.png' });
    await page.evaluate(() => { document.getElementById('sday_2_main_event').click(); });
    assert(await wbStars() === 0, 'unticking should clear the star');
    await page.evaluate(() => { document.getElementById('sday_2_main_event').click(); });
    assert(await wbStars() === 1, 'ticking again should bring it back');
  });

  await step('Workback timeline: Post Production Due Date gets the star; no tick and no star otherwise', async () => {
    await openProject(near.post.key);
    assert(await wbStars() === 1, 'post due date star');
    await openProject(near.plain.key);
    assert(await wbStars() === 0, 'nothing ticked, leftover due date on a non-post project: no star');
  });

  await step('Overview timeline: stars on the main event and the Post due date only', async () => {
    await page.evaluate(() => ProjectsOverview.open());
    await page.waitForSelector('#po-pt .po-pt-pin', { timeout: 8000 });
    await sleep(400);
    const r = await page.$$eval('#po-pt .po-pt-pin.star', els => els.map(e => e.dataset.tip));
    assert(r.length === 2, 'stars ' + JSON.stringify(r));
    assert(r.some(t => t.includes('sday_2')) && r.some(t => t.includes('Project Due Date')), JSON.stringify(r));
    await (await page.$('#po-pt')).evaluate(e => e.scrollIntoView({ block: 'center' }));
    await sleep(200);
    await page.screenshot({ path: SHOTS + '/star-overview.png' });
  });

  await step('Client portal: star flag and timeline star, with no extra data sent', async () => {
    const get = async t => (await (await fetch(BASE + '/api/portal/' + t)).json());
    const a = await get(near.star.token), b = await get(near.post.token), c = await get(near.plain.token);
    assert(a.timeline.filter(n => n.star).length === 1 && a.timeline.find(n => n.star).label === 'sday_2', JSON.stringify(a.timeline));
    assert(b.timeline.filter(n => n.star).length === 1 && b.timeline.find(n => n.star).label === 'Delivery', JSON.stringify(b.timeline));
    assert(c.timeline.every(n => !n.star), JSON.stringify(c.timeline));
    assert(a.schedule.every(n => !('star' in n)), 'schedule list should not change');
    assert(a.key_date === offset(10), '"Expected" should be the main event, not the Wrap Day: ' + a.key_date);
    assert(b.key_date === offset(12), 'Post "Expected" should be the Due Date: ' + b.key_date);
    await page.goto(BASE + '/portal/' + near.star.token, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.tl-node.star', { timeout: 8000 });
    assert((await page.$$('.tl-node.star')).length === 1, 'star not drawn on the portal page');
    assert((await page.$eval('.tl-legend', e => e.innerText)).includes('Main date'), 'legend missing the star');
    await page.$eval('.tl-node.star', e => e.scrollIntoView({ block: 'center' }));
    await sleep(200);
    await page.screenshot({ path: SHOTS + '/star-portal.png' });
  });

  await step('the app says "Kickoff", never "Client Kickoff"', async () => {
    await openProject(K.live);
    const r = await page.evaluate(() => {
      document.getElementById('kickoff_date_iso').value = '2030-03-01';
      refreshWbDaySelector();
      const pins = projectWorkbackDates({ kickoff_date_iso: '2030-03-01', schedule_days: [], wb_items: [] }).pins;
      return { pin: pins[0].label, html: document.body.innerHTML.includes('Client Kickoff'), opts: [...document.getElementById('wb_day_select').options].map(o => o.textContent) };
    });
    assert(r.pin === 'Kickoff', r.pin);
    assert(!r.html, 'page still contains the old wording');
    assert(r.opts.some(o => o.startsWith('Kickoff')), r.opts.join(', '));
  });
}

main().catch(e => { fails.push('crash: ' + e.message); console.error(e); }).finally(async () => {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.kill(); } catch (_) {}
  try { if (userId) { await db.query('DELETE FROM projects WHERE owner_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); } } catch (e) { console.error(e); }
  await db.end();
  const relevant = consoleErrors.filter(e => !/favicon|ERR_|404|409/.test(e));
  if (relevant.length) console.log('\nBrowser console errors:\n  ' + relevant.join('\n  '));
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) process.exitCode = 1;
});
