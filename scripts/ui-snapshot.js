// Screenshot snapshot for before/after comparisons of a visual change.
// LOCAL DATABASE ONLY. READ-ONLY: every non-GET /api request from the page is
// blocked, so opening projects can't autosave anything (same approach as
// scripts/doc-snapshot.js; the session row it inserts is deleted at the end).
//
// Shoots the public pages (login, password reset, admin login, client portal
// if the user has one) and, logged in as an existing user, every project tab
// of one project plus Contacts, the Projects Overview and the Rundown.
// Writes PNGs to /tmp/slater-ui-snapshots/<label>/.
//
// Run (same puppeteer setup as the e2e scripts):
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/ui-snapshot.js <label> [email] [project key]
// The project defaults to the user's largest one.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const signature = require(APP + '/node_modules/cookie-signature');
const puppeteer = require('puppeteer-core');

const [label, email = 'john@vandonald.com', keyArg] = process.argv.slice(2);
if (!label) { console.error('usage: ui-snapshot.js <label> [email] [project key]'); process.exit(2); }
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const PORT = 3995, BASE = 'http://localhost:' + PORT;
const OUT = '/tmp/slater-ui-snapshots/' + label;
const TABS = ['project', 'schedule', 'crew', 'talent', 'workback', 'urls', 'portal', 'notes', 'expenses'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const user = (await db.query('SELECT id, email, name FROM users WHERE email=$1', [email])).rows[0];
  if (!user) throw new Error('no user ' + email);
  const key = keyArg || (await db.query('SELECT key FROM projects WHERE owner_id=$1 ORDER BY length(data::text) DESC LIMIT 1', [user.id])).rows[0].key;
  const portal = (await db.query(`SELECT po.token FROM portals po JOIN projects p ON p.id=po.project_id
                                   WHERE po.owner_id=$1 AND po.password_hash IS NULL ORDER BY length(p.data::text) DESC LIMIT 1`, [user.id])).rows[0];
  const sid = 'uisnap-' + crypto.randomBytes(12).toString('hex');
  const expires = new Date(Date.now() + 3600e3);
  await db.query('INSERT INTO sessions (sid, sess, expire) VALUES ($1,$2,$3)', [sid, {
    cookie: { originalMaxAge: 3600e3, expires: expires.toISOString(), httpOnly: true, path: '/', sameSite: 'strict' },
    userId: user.id, userEmail: user.email, userName: user.name,
  }, expires]);

  const server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  let browser;
  const shots = [], errors = [], external = new Set();
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
    fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

    const newPage = async (ctx) => {
      const page = await ctx.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => d.accept().catch(() => {}));
      await page.setRequestInterception(true);
      page.on('request', r => {
        const u = new URL(r.url());
        if (u.hostname !== 'localhost') external.add(u.hostname);
        if (u.pathname.startsWith('/api/') && r.method() !== 'GET') return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"read-only snapshot"}' });
        r.continue();
      });
      return page;
    };
    const shot = async (page, name, full) => {
      await page.evaluate(() => document.fonts.ready);
      await sleep(400);
      const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '') + ' ' + f.weight));
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
      shots.push(name + '  [' + [...new Set(fonts)].join(', ') + ']');
    };

    // Public pages (fresh context: no session).
    const pub = await browser.createBrowserContext();
    const pp = await newPage(pub);
    for (const [name, url] of [['login', '/login'], ['reset-password', '/reset-password?token=x'], ['admin-login', '/admin/login']].concat(portal ? [['portal', '/portal/' + portal.token]] : [])) {
      await pp.goto(BASE + url, { waitUntil: 'networkidle0' });
      await shot(pp, 'public-' + name, name === 'portal');
    }

    // Logged-in app.
    const ctx = await browser.createBrowserContext();
    const page = await newPage(ctx);
    await page.setCookie({ name: 'connect.sid', value: encodeURIComponent('s:' + signature.sign(sid, process.env.SESSION_SECRET || 'slater-dev-secret')), domain: 'localhost', path: '/' });
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
    await page.evaluate(k => { localStorage.setItem('slater_last_project', k); localStorage.removeItem('slater_pending_saves'); }, key);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForFunction(k => currentSheetKey === k && window.ContactsV2 && ContactsV2.store.loaded, { timeout: 15000 }, key);
    await sleep(1200);
    for (const t of TABS) { await page.evaluate(n => { st(n); window.scrollTo(0, 0); }, t); await shot(page, 'app-' + TABS.indexOf(t) + '-' + t); }
    await page.evaluate(() => st('project'));
    await page.evaluate(() => { if (!sidebarOpen) toggleSidebar(); });
    await sleep(800); await shot(page, 'app-rundown');
    await page.evaluate(() => toggleSidebar());
    await page.evaluate(() => ProjectsOverview.open()); await sleep(1200); await shot(page, 'app-overview');
    await page.evaluate(() => ProjectsOverview.close());
    await page.evaluate(() => openContacts()); await sleep(1000); await shot(page, 'app-contacts');

    console.log(shots.length + ' screenshots of ' + key + ' -> ' + OUT);
    console.log('  ' + shots.join('\n  '));
    console.log('outside hosts contacted: ' + ([...external].join(', ') || 'none'));
    if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await db.query('DELETE FROM sessions WHERE sid=$1', [sid]);
    await db.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
