// Document snapshot for before/after comparisons (data-model-rewrite).
// LOCAL DATABASE ONLY. READ-ONLY: every non-GET /api request from the page is
// blocked, so opening projects can't autosave or touch the contacts blob.
//
// Logs in as an existing user by inserting a session row (no password needed,
// nothing about the user changes; the session row is deleted at the end),
// opens each of the user's projects, generates the call sheet, workback and
// expense report, and writes each document's text to
//   /tmp/slater-doc-snapshots/<label>/<project key>.<doc>.txt
//
// Run (same puppeteer setup as e2e-contacts-v2.js):
//   NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/doc-snapshot.js <label> [v1|v2] [email]
// Compare two runs:
//   diff -r /tmp/slater-doc-snapshots/<before> /tmp/slater-doc-snapshots/<after>
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
const { Pool } = require(APP + '/node_modules/pg');
const signature = require(APP + '/node_modules/cookie-signature');
const puppeteer = require('puppeteer-core');

const label = process.argv[2];
const flag = process.argv[3] || 'v2';
const email = process.argv[4] || 'john@vandonald.com';
if (!label || !/^v[12]$/.test(flag)) { console.error('usage: doc-snapshot.js <label> [v1|v2] [email]'); process.exit(2); }
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  console.error('Refusing to run against a non-local database.'); process.exit(2);
}
const PORT = 3996, BASE = 'http://localhost:' + PORT;
const OUT = '/tmp/slater-doc-snapshots/' + label, DL = '/tmp/slater-doc-snapshots/.dl';
const DOCS = [['callsheet', 'generateDoc'], ['workback', 'generateWorkback'], ['expenses', 'generateExpenseDoc']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const db = new Pool({ connectionString: process.env.DATABASE_URL });

function docText(file) {
  return execFileSync('unzip', ['-p', file, 'word/document.xml']).toString()
    .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function main() {
  const user = (await db.query('SELECT id, email, name FROM users WHERE email=$1', [email])).rows[0];
  if (!user) throw new Error('no user ' + email);
  const keys = (await db.query('SELECT key FROM projects WHERE owner_id=$1 ORDER BY key', [user.id])).rows.map(r => r.key);
  const sid = 'docsnap-' + crypto.randomBytes(12).toString('hex');
  const expires = new Date(Date.now() + 3600e3);
  await db.query('INSERT INTO sessions (sid, sess, expire) VALUES ($1,$2,$3)', [sid, {
    cookie: { originalMaxAge: 3600e3, expires: expires.toISOString(), httpOnly: true, path: '/', sameSite: 'strict' },
    userId: user.id, userEmail: user.email, userName: user.name,
  }, expires]);

  const server = spawn('node', ['server.js'], { cwd: APP, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(250); }
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    let blocked = 0;
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/') && r.method() !== 'GET') { blocked++; return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"read-only snapshot"}' }); }
      r.continue();
    });
    await page.setCookie({ name: 'connect.sid', value: encodeURIComponent('s:' + signature.sign(sid, process.env.SESSION_SECRET || 'slater-dev-secret')), domain: 'localhost', path: '/' });
    fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
    await page.goto(BASE + '/?contacts=' + flag, { waitUntil: 'networkidle2' });

    for (const key of keys) {
      await page.evaluate(k => localStorage.setItem('slater_last_project', k), key);
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForFunction((k, f) => currentSheetKey === k && (f === 'v1' || (window.ContactsV2 && ContactsV2.store.loaded)), { timeout: 15000 }, key, flag)
        .catch(() => { throw new Error('project did not open: ' + key); });
      await sleep(1200);
      for (const [name, fn] of DOCS) {
        fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
        const err = await page.evaluate(async f => { try { await window[f](); return null; } catch (e) { return String(e && e.message || e); } }, fn);
        let file; for (let i = 0; i < 40 && !file; i++) { file = fs.readdirSync(DL).find(f => f.endsWith('.docx')); if (!file) await sleep(250); }
        fs.writeFileSync(path.join(OUT, key + '.' + name + '.txt'), file ? docText(path.join(DL, file)) : '(no document: ' + (err || 'nothing downloaded') + ')\n');
      }
      console.log('  ' + key);
    }
    console.log(keys.length + ' projects -> ' + OUT + ' (' + blocked + ' writes blocked)');
    if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await db.query('DELETE FROM sessions WHERE sid=$1', [sid]);
    await db.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
