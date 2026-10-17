// Contacts cutover switch (data-model-rewrite, Session 8).
//
// Railway variable CONTACTS_V2_CUTOVER on the `slater` service:
//   off  (default, also anything unrecognized)
//        Exactly today's Slater for everyone: old Contacts, old agencies.
//        ?contacts=v2 does nothing. The new /api/v2 tables are not written.
//   on   Everyone gets the new Contacts / Organizations / Locations / Roles,
//        no matter what's in the URL or the browser. The old contacts blob
//        and agency saving are refused. Only allowed once the new tables
//        exist: if they don't (switch flipped before the migration), the
//        server logs a loud error and behaves as `off`.
//   test Local development only: the per-browser ?contacts=v2 / ?contacts=v1
//        toggle, nothing refused (how Sessions 3-7 were built and tested).
//
// The page learns the mode from /slater-config.js, a tiny script loaded
// before everything else in index.html (window.SLATER_CONTACTS_MODE).
//
// Stale tabs. A tab keeps the mode it loaded with. Changing the variable
// redeploys the server, but an open tab still runs the screens it started
// with. So every save from Slater's own pages says which screens sent it
// (header X-Slater-Contacts: v2 or v1, added by public/connection.js), and
// the server refuses a save from the wrong screens with
//   409 { error: 'reload_required' }
// The page shows "Slater has been updated. Reload..." and keeps the unsent
// project change in its save queue; after the reload it is sent again from
// the right screens. Refused:
//   on:  old contacts blob writes and old agency writes (always), and any
//        project write that doesn't come from the new screens (no header =
//        a tab from before this code, also refused).
//   off: any /api/v2 write, and project writes from the new screens
//        (the way back if the switch is turned off again after cutover).
//   test: nothing.

const MODES = ['off', 'on', 'test'];
const REQUIRED_TABLES = ['contacts', 'organizations', 'locations', 'roles', 'contact_roles', 'deleted_records'];

let requested = 'off';
let mode = 'off';
let ready = null;

function init(pool) {
  const raw = String(process.env.CONTACTS_V2_CUTOVER || 'off').trim().toLowerCase();
  requested = MODES.includes(raw) ? raw : 'off';
  if (raw && !MODES.includes(raw)) {
    console.error(`CONTACTS_V2_CUTOVER="${process.env.CONTACTS_V2_CUTOVER}" is not off / on / test. Using off.`);
  }
  if (requested !== 'on') {
    mode = requested;
    ready = Promise.resolve();
    console.log('Contacts cutover switch:', mode);
    return ready;
  }
  ready = pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = ANY($1)) AS tables,
       (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'projects'
           AND column_name IN ('agency_org_id', 'client_org_id')) AS cols`,
    [REQUIRED_TABLES]
  ).then(r => {
    const { tables, cols } = r.rows[0];
    if (tables === REQUIRED_TABLES.length && cols === 2) {
      mode = 'on';
      console.log('Contacts cutover switch: on (new tables found)');
    } else {
      mode = 'off';
      console.error('*'.repeat(72));
      console.error('CONTACTS_V2_CUTOVER=on, BUT THE NEW TABLES ARE NOT IN THIS DATABASE');
      console.error(`(found ${tables}/${REQUIRED_TABLES.length} tables, ${cols}/2 project columns).`);
      console.error('Run scripts/migrate-data-model.js and scripts/migrate-contacts-data.js');
      console.error('first (docs/CUTOVER.md step 7). Running with the switch OFF until then.');
      console.error('*'.repeat(72));
    }
  }).catch(err => {
    mode = 'off';
    console.error('CONTACTS_V2_CUTOVER=on, but the table check failed; running with the switch OFF:', err.message);
  });
  return ready;
}

function current() { return mode; }

// GET /slater-config.js
function configScript(req, res) {
  ready.then(() => {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(`window.SLATER_CONTACTS_MODE = ${JSON.stringify(mode)};\n`);
  });
}

const OLD_CONTACT_WRITES = [/^\/contacts(\/|$)/, /^\/users\/me\/contacts(\/|$)/, /^\/agencies(\/|$)/, /^\/users\/me\/agency\/?$/];

function refuse(res, reason) {
  return res.status(409).json({
    error: 'reload_required',
    reason,
    message: 'Slater has been updated. Reload the page to keep working.',
  });
}

// app.use('/api', guard): req.path is relative to /api.
function guard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  ready.then(() => {
    if (mode === 'test') return next();
    const p = req.path;
    const fromV2 = req.get('X-Slater-Contacts') === 'v2';
    const projectWrite = /^\/projects(\/|$)/.test(p);
    if (mode === 'on') {
      if (OLD_CONTACT_WRITES.some(re => re.test(p))) return refuse(res, 'contacts_moved');
      if (projectWrite && !fromV2) return refuse(res, 'old_screens');
    } else {
      if (/^\/v2(\/|$)/.test(p)) return refuse(res, 'contacts_v2_off');
      if (projectWrite && fromV2) return refuse(res, 'new_screens_off');
    }
    next();
  });
}

module.exports = { init, current, configScript, guard };
