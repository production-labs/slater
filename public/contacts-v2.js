// Contacts v2 (data-model-rewrite, Session 3)
//
// Two-pane contacts manager (People / Organizations / Locations) on /api/v2.
// Replaces the bucket-based Contacts modal at cutover. Until then it is OFF by
// default and only opens when enabled for this browser:
//   ?contacts=v2   turn on   (remembered in localStorage)
//   ?contacts=v1   turn off
// Project tab agency/client pickers read organizations from this store
// (project-orgs-v2.js, Session 4; listens for 'slater:v2-changed').
// Crew / talent / key personnel cards and schedule day locations read the
// store too (project-people-v2.js, Session 5).
//
// Saving: per record. Only the fields the user changed are sent, with the
// baseline updated_at. If the record changed elsewhere (409 conflict), the
// changed fields are re-applied on top of the server's current copy and sent
// again: fields only the other device changed are kept, fields only this
// device changed win, and a field changed on both takes this (newer) edit.
// That is the agreed three-way merge rule, applied to one online save.
// Offline queueing and background sync come in Session 7.

(function () {
  'use strict';

  var FLAG_KEY = 'slater_contacts_v2';
  (function readUrlFlag() {
    var v = new URLSearchParams(location.search).get('contacts');
    if (v === 'v2') localStorage.setItem(FLAG_KEY, '1');
    else if (v === 'v1') localStorage.removeItem(FLAG_KEY);
  })();

  // ---------------------------------------------------------------- utils
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function toast(msg, kind) {
    if (typeof setStatus === 'function') setStatus(msg, kind || 'ok');
  }
  function confirmBox(title, msg, onOk) {
    if (typeof showModal === 'function') showModal(title, msg, onOk);
    else if (window.confirm(title + '\n\n' + msg)) onOk();
  }
  function byText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ------------------------------------------------------------------ API
  function req(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/v2' + path, opts).then(function (r) {
      if (r.status >= 502 && r.status <= 504) throw offlineError(method);
      return r.json().catch(function () { return null; }).then(function (data) {
        if (!r.ok) {
          var e = new Error((data && data.error) || ('Request failed (' + r.status + ')'));
          e.status = r.status; e.data = data;
          throw e;
        }
        return data;
      });
    }, function () { throw offlineError(method); });
  }
  // Couldn't reach Slater's server. The offline panel (connection.js) already
  // says so: reads fail quietly (what's on this device stays on screen); only
  // a write that didn't happen gets a message.
  function offlineError(method) {
    var e = new Error(method === 'GET' ? "You're offline." : "You're offline, so this wasn't saved.");
    e.offline = true;
    return e;
  }

  // ---------------------------------------------------------------- store
  var TABLES = ['contacts', 'organizations', 'locations', 'roles'];
  var store = { contacts: {}, organizations: {}, locations: {}, roles: {}, defaultOrgId: null, settings: { default_country: 'US' }, cursor: null, loaded: false, archivedLoaded: {} };

  // Other parts of the app (project organization pickers) listen for
  // 'slater:v2-changed' to redraw when the store changes. Batched per tick.
  var notifyPending = false;
  function notify() {
    if (notifyPending) return;
    notifyPending = true;
    setTimeout(function () {
      notifyPending = false;
      window.dispatchEvent(new CustomEvent('slater:v2-changed'));
    }, 0);
  }
  // Returns how many rows were new or changed. Sync pulls overlap their
  // window by 10s, so recently edited rows come back again unchanged; those
  // don't count (and don't trigger redraws).
  function absorb(table, rows) {
    var changed = 0;
    (rows || []).forEach(function (r) {
      var cur = store[table][r.id];
      if (!cur || r.updated_at > cur.updated_at) changed++;
      if (!cur || r.updated_at >= cur.updated_at) store[table][r.id] = r;
    });
    if (changed) notify();
    return changed;
  }
  // Permanent deletes from any device arrive as tombstones: drop local copies.
  function applyDeleted(list) {
    var changed = 0;
    (list || []).forEach(function (d) { if (store[d.table] && store[d.table][d.id]) { delete store[d.table][d.id]; changed++; } });
    if (changed) notify();
    return changed;
  }
  // Resolves true when anything in the store changed, so callers can skip
  // redrawing (a needless redraw replaces the list under a click in progress).
  function sync() {
    var q = store.cursor ? '?since=' + encodeURIComponent(store.cursor) : '';
    return req('GET', '/sync' + q).then(function (d) {
      var changed = !store.loaded;
      if (!store.cursor) TABLES.forEach(function (t) { store[t] = {}; });
      TABLES.forEach(function (t) { if (absorb(t, d[t])) changed = true; });
      if (applyDeleted(d.deleted)) changed = true;
      if (store.defaultOrgId !== d.default_organization_id) { store.defaultOrgId = d.default_organization_id; changed = true; }
      if (d.settings && JSON.stringify(d.settings) !== JSON.stringify(store.settings)) { store.settings = d.settings; changed = true; }
      if (d.cursor) store.cursor = d.cursor;
      store.loaded = true;
      if (changed) notify();
      return changed;
    });
  }
  // One sync at a time; callers that arrive mid-sync share it.
  var syncing = null;
  function syncShared() {
    if (!syncing) syncing = sync().then(function (ch) { syncing = null; return ch; }, function (e) { syncing = null; throw e; });
    return syncing;
  }
  function loadArchived(table) {
    if (store.archivedLoaded[table]) return Promise.resolve();
    return req('GET', '/' + table + '?since=' + encodeURIComponent('1970-01-01T00:00:00.000000Z')).then(function (d) {
      absorb(table, d.rows);
      applyDeleted(d.deleted);
      store.archivedLoaded[table] = true;
    });
  }
  function rows(table, includeArchived) {
    return Object.keys(store[table]).map(function (k) { return store[table][k]; })
      .filter(function (r) { return includeArchived || !r.archived_at; });
  }

  // Normalization mirrors the server so "changed?" comparisons are exact.
  var MULTILINE = { gear_kit: 1, notes: 1, hospital: 1, invoicing_text: 1 };
  function norm(key, v) {
    if (key === 'role_ids') return (v || []).slice();
    if (key === 'is_agency') return !!v;
    if (key === 'organization_id') return v === '' || v == null ? null : Number(v);
    if (key === 'country') return v ? String(v).trim().toUpperCase() || null : null;
    if (v == null) return null;
    v = String(v);
    if (!MULTILINE[key]) v = v.replace(/\s+/g, ' ').trim(); // same as the server
    return v === '' ? null : v;
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function changedFields(baseline, edited) {
    var out = {};
    Object.keys(edited).forEach(function (k) {
      if (!same(norm(k, baseline[k]), norm(k, edited[k]))) out[k] = norm(k, edited[k]);
    });
    // The server normalizes state against country, so send them as a pair.
    if (('state' in out || 'country' in out) && 'state' in edited && 'country' in edited) {
      out.state = norm('state', edited.state); out.country = norm('country', edited.country);
    }
    return out;
  }

  // A save is described as a "change" first, then sent. The same description
  // is what the offline queue keeps, so a queued save goes out exactly as it
  // would have: a create carries its client_uid (a retried POST can't make a
  // duplicate); an update carries only the changed fields + the base
  // updated_at, so the agreed merge rule (409 -> retry on top of the newer
  // row) applies when it's finally sent.
  function describeChange(table, baseline, edited, clientUid) {
    if (!baseline) {
      var body = {};
      Object.keys(edited).forEach(function (k) { body[k] = norm(k, edited[k]); });
      body.client_uid = clientUid || uuid();
      return { table: table, op: 'create', body: body, label: body.name || '' };
    }
    return { table: table, op: 'update', id: baseline.id, changes: changedFields(baseline, edited), base: baseline.updated_at, label: edited.name || baseline.name || '' };
  }
  function sendChange(ch) {
    var table = ch.table;
    if (ch.op === 'create') {
      return req('POST', '/' + table, ch.body).then(function (row) {
        absorb(table, [row]);
        return { row: row, merged: false };
      });
    }
    var changes = ch.changes;
    if (!Object.keys(changes).length) return Promise.resolve({ row: store[table][ch.id], merged: false, unchanged: true });
    var base = ch.base, merged = false, attempts = 0;
    function attempt() {
      attempts++;
      var body = Object.assign({}, changes, { base_updated_at: base });
      return req('PATCH', '/' + table + '/' + ch.id, body).then(function (row) {
        absorb(table, [row]);
        return { row: row, merged: merged };
      }, function (e) {
        var cur = e.data && e.data.current;
        if (cur) absorb(table, [cur]);
        if (e.status === 409 && e.data && e.data.error === 'conflict' && attempts < 3) {
          base = cur.updated_at; merged = true;
          return attempt();
        }
        if (e.status === 409 && e.data && e.data.error === 'archived') {
          e.message = 'This was archived on another device. Restore it first to keep editing.';
        }
        throw e;
      });
    }
    return attempt();
  }
  function saveRecord(table, baseline, edited) {
    var ch = describeChange(table, baseline, edited);
    if (ch.op === 'update' && !Object.keys(ch.changes).length) return Promise.resolve({ row: baseline, merged: false, unchanged: true });
    return sendChange(ch);
  }

  // ------------------------------------------------- offline save queue
  // A Save that can't reach the server (Session 7) is kept in localStorage
  // under QUEUE_KEY and sent when the connection is back (or on the next
  // visit). The form then counts as saved, so Contacts can be closed and work
  // goes on. [{ qid, table, op, body | id+changes+base, label, at }]
  var QUEUE_KEY = 'slater_pending_contacts';
  function queueLoad() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; } catch (e) { return []; } }
  function queueStore(q) {
    try { if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); else localStorage.removeItem(QUEUE_KEY); }
    catch (e) { toast('This device is out of storage, so the offline save can\'t be kept. Reconnect before closing Slater.', 'err'); }
    if (window.SlaterConn) SlaterConn.changed();
  }
  // Add a change, or replace the queued one for the same form (qid).
  // Each entry records the tab that queued it (tabs share localStorage); a tab
  // sends its own entries and those of tabs that are gone (SlaterConn.mayTake).
  function myTab() { return window.SlaterConn ? SlaterConn.tabId : 'local'; }
  function mayTake(x) { return window.SlaterConn ? SlaterConn.mayTake(x.owner) : true; }
  function queuePut(ch, qid) {
    var q = queueLoad();
    var i = qid ? q.findIndex(function (x) { return x.qid === qid; }) : -1;
    ch.qid = qid || uuid(); ch.at = Date.now(); ch.owner = myTab(); ch.user = window._slaterUserId || null;
    if (i >= 0) q[i] = ch; else q.push(ch);
    queueStore(q);
    return ch.qid;
  }
  function queueDrop(qid) { queueStore(queueLoad().filter(function (x) { return x.qid !== qid; })); }
  var flushingQueue = null;
  function flushQueue() {
    if (flushingQueue) return flushingQueue;
    function next() {
      var ch = queueLoad().filter(mayTake)[0];
      if (!ch) return Promise.resolve(true);
      return sendChange(ch).then(function (res) {
        queueDrop(ch.qid);
        var row = res && res.row;
        // The form that queued it is still open: point it at the real record.
        if (row && ui.queuedQid === ch.qid) {
          ui.queuedQid = null; ui.queuedForm = null;
          if (TAB_TABLE[ui.tab] === ch.table) {
            ui.sel = row.id; ui.baseline = row;
            if (!ui.dirty) { ui.formRoles = ui.tab === 'people' ? (row.role_ids || []).slice() : []; ui.formLogo = ui.tab === 'organizations' ? row.logo : null; }
          }
        }
        return next();
      }, function (e) {
        if (e.offline) return false; // still offline: keep the rest for later
        // Refused for good (archived elsewhere, invalid...): say so, don't drop silently.
        queueDrop(ch.qid);
        if (window.SlaterConn) {
          SlaterConn.notice('cq-' + ch.qid, 'Couldn\'t save your offline changes to <strong>' + esc(ch.label || 'a contact') + '</strong>: ' + esc(e.message),
            [{ label: 'Dismiss', fn: function () { SlaterConn.clearNotice('cq-' + ch.qid); } }]);
        }
        return next();
      });
    }
    flushingQueue = next().then(function (ok) {
      flushingQueue = null;
      // Redraw the form only if nobody is typing in it.
      if (root && root.classList.contains('open')) { if (ui.dirty) { renderTabs(); renderList(); } else renderAll(); }
      return ok;
    },
      function (e) { flushingQueue = null; throw e; });
    return flushingQueue;
  }

  // ---------------------------------------------------------------- roles
  var CAT_LABEL = { staff: 'Staff', crew: 'Crew', talent: 'Talent' };
  function role(id) { return store.roles[id] || null; }
  function roleLabel(r) { return r ? (r.abbreviation || r.name) : 'Archived role'; }
  function contactCategories(c) {
    var cats = {};
    (c.role_ids || []).forEach(function (id) { var r = role(id); if (r) cats[r.category] = 1; });
    return Object.keys(cats);
  }
  function roleGroups(list) {
    // Staff, then crew by department (in seed order), then talent.
    var groups = {};
    list.forEach(function (r) {
      var key = r.category === 'crew' ? 'crew|' + (r.department || 'Other') : r.category;
      (groups[key] = groups[key] || []).push(r);
    });
    var order = Object.keys(groups).sort(function (a, b) {
      function rank(k) {
        var cat = k.split('|')[0];
        var base = cat === 'staff' ? 0 : cat === 'crew' ? 1 : 2;
        var minSort = Math.min.apply(null, groups[k].map(function (r) { return r.is_global ? r.sort_order : 99999; }));
        return base * 1e6 + minSort;
      }
      return rank(a) - rank(b);
    });
    return order.map(function (k) {
      var parts = k.split('|');
      var label = parts[0] === 'crew' ? 'Crew: ' + parts[1] : CAT_LABEL[parts[0]];
      var items = groups[k].sort(function (a, b) {
        return (a.is_global === b.is_global ? 0 : a.is_global ? -1 : 1) || (a.sort_order - b.sort_order) || byText(a.name.toLowerCase(), b.name.toLowerCase());
      });
      return { label: label, items: items };
    });
  }
  function crewDepartments() {
    var seen = {}, out = [];
    rows('roles').filter(function (r) { return r.category === 'crew' && r.department; })
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .forEach(function (r) { if (!seen[r.department]) { seen[r.department] = 1; out.push(r.department); } });
    return out;
  }

  // ------------------------------------------------------------ constants
  var PROJECT_TYPES = [
    ['', 'No default'], ['location_shoot', 'Location Shoot'], ['post_production', 'Post Production'],
    ['live_broadcast_location', 'Live Broadcast: On Location'], ['live_broadcast_studio', 'Live Broadcast: In Studio'],
    ['webinar', 'Webinar'],
  ];
  var TIMEZONES = [
    ['', 'No default'], ['ET', 'Eastern Time'], ['CT', 'Central Time'], ['MT', 'Mountain Time'], ['PT', 'Pacific Time'],
    ['AKT', 'Alaska Time'], ['HT', 'Hawaii Time'], ['GMT', 'Greenwich Mean Time'], ['CET', 'Central European Time'],
  ];
  var UNION_SUGGESTIONS = ['Non-union', 'IATSE', 'IATSE Local 600', 'IATSE Local 488', 'IATSE Local 15', 'IBEW', 'NABET-CWA', 'SAG-AFTRA', 'DGA', 'Teamsters Local 399'];
  var TRAVEL_SUGGESTIONS = ['Local only', 'Regional (drive)', 'Will travel (domestic)', 'Will travel (international, has passport)'];

  var TAB_TABLE = { people: 'contacts', organizations: 'organizations', locations: 'locations', roles: 'roles' };
  var TAB_NOUN = { people: 'person', organizations: 'organization', locations: 'location', roles: 'role' };

  // ---------------------------------------------------------------- state
  var ui = {
    tab: 'people',
    sel: null,              // record id, 'new', or null
    baseline: null,         // record as loaded (null when new)
    formRoles: [],          // people: ordered role ids in the form
    formLogo: null,         // organizations: logo data URL in the form
    dirty: false,
    saving: false,
    q: '', cat: 'all', state: '', showArchived: false,
    pickerIdx: -1,
  };
  var root = null;

  // ---------------------------------------------------------------- shell
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'contacts-modal';
    root.id = 'contacts-v2-modal';
    root.innerHTML =
      '<div class="contacts-box cv2-box">' +
        '<div class="contacts-head"><h3>Contacts</h3>' +
          '<div class="cv2-head-actions"><button class="rb" data-act="close" style="font-size:18px" title="Close">&#x2715;</button></div>' +
        '</div>' +
        '<div class="cv2-tabs" id="cv2-tabs"></div>' +
        '<div class="cv2-main" id="cv2-main">' +
          '<div class="cv2-listpane"><div class="cv2-listtools" id="cv2-tools"></div><div class="cv2-list" id="cv2-list"></div></div>' +
          '<div class="cv2-detailpane" id="cv2-detail"></div>' +
        '</div>' +
        '<datalist id="cv2-union-list">' + UNION_SUGGESTIONS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
        '<datalist id="cv2-travel-list">' + TRAVEL_SUGGESTIONS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
        '<datalist id="cv2-dept-list"></datalist>' +
        '<input type="file" id="cv2-logo-file" accept="image/*" style="display:none">' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeydown);
    // Pressing on an item in any pick list (roles, state, country) must not
    // take focus from the input: the blur handlers below close the list
    // ~150ms after blur, and a real (human-speed) click often takes longer
    // than that, so the release landed on nothing and the pick was lost.
    // preventDefault on mousedown keeps focus; listPress also stops the
    // timers from closing a list while a press (mouse or touch) is in progress.
    var listPress = false;
    root.addEventListener('mousedown', function (e) {
      if (e.target.closest('.cv2-picker-list')) e.preventDefault();
    });
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.cv2-picker-list')) listPress = true;
    });
    document.addEventListener('pointerup', function () { setTimeout(function () { listPress = false; }, 0); }, true);
    document.addEventListener('pointercancel', function () { listPress = false; }, true);
    // The picker opens on click / typing / ArrowDown only, never just on
    // focus: after a pick, focus returns to the input, and an auto-opened
    // list would cover the fields below and swallow the next click.
    root.addEventListener('focusout', function (e) {
      if (ui.tab === 'locations' && /^cv2f_(address|city|state|zip|country)$/.test(e.target.id)) setTimeout(function () { hospLookup(false); }, 200);
      // Timers re-check focus: a stale timer (field left, then re-entered or
      // re-rendered within 150ms) must not close the list now in use.
      function stillIn(id) { return document.activeElement && document.activeElement.id === id; }
      if (e.target.id === 'cv2-role-input') setTimeout(function () { if (!listPress && !stillIn('cv2-role-input')) closePicker(); }, 150);
      if (e.target.id === 'cv2f_state' || e.target.id === 'cv2f_country') {
        e.target.removeAttribute('data-fresh'); // next click selects all again
        var k = e.target.id.slice(5);
        setTimeout(function () { if (listPress || stillIn('cv2f_' + k)) return; closeTA(k); commitTA(k); }, 150);
      }
    });
    document.getElementById('cv2-logo-file').addEventListener('change', onLogoFile);
  }

  // opts (Session 5 follow-up, schedule day "+" button):
  //   newLocation: { name }  start a new location with this name filled in
  //   onCreated(row)         called once when that new record is created;
  //                          Contacts then closes and returns to the project
  function open(tab, opts) {
    build();
    opts = opts || {};
    if (tab && TAB_TABLE[tab] && tab !== ui.tab && !ui.dirty) {
      ui.tab = tab; ui.sel = null; ui.baseline = null; ui.q = ''; ui.cat = 'all'; ui.state = '';
    }
    ui.onCreated = null;
    root.classList.add('open');
    if (opts.newLocation && ui.tab === 'locations' && !ui.dirty) {
      var prefill = function () {
        select('new');
        var n = document.getElementById('cv2f_name');
        if (n) { n.value = opts.newLocation.name || ''; updateDirty(); }
        var a = document.getElementById('cv2f_address'); if (a) a.focus();
        ui.onCreated = opts.onCreated || null;
      };
      if (store.loaded) { renderAll(); prefill(); return syncShared().then(function (ch) { if (ch) { renderTabs(); renderList(); } }); }
      return syncShared().then(function () { renderAll(); prefill(); }, function (e) { if (!e.offline) toast('Could not load contacts: ' + e.message, 'err'); });
    }
    if (!store.loaded) {
      document.getElementById('cv2-list').innerHTML = '<div class="cv2-loading">Loading contacts...</div>';
      document.getElementById('cv2-detail').innerHTML = '';
    }
    renderAll();
    syncShared().then(function (ch) { if (ch) renderAll(); }, function (e) {
      if (!store.loaded) document.getElementById('cv2-list').innerHTML = '<div class="cv2-empty">Could not load contacts.<br>' + esc(e.message) + '</div>';
      else if (!e.offline) toast('Could not refresh contacts: ' + e.message, 'err');
    });
  }
  function close() {
    guard(function () {
      root.classList.remove('open');
      ui.sel = null; ui.baseline = null; ui.dirty = false; ui.onCreated = null; ui.queuedQid = null; ui.queuedForm = null;
    });
  }
  function guard(fn) {
    if (!ui.dirty) return fn();
    confirmBox('Unsaved changes', 'Discard your changes to this ' + TAB_NOUN[ui.tab] + '?', function () {
      ui.dirty = false; fn();
    });
  }

  function renderAll() {
    if (!root) return;
    renderTabs(); renderTools(); renderList(); renderDetail();
  }

  function renderTabs() {
    var counts = { people: rows('contacts').length, organizations: rows('organizations').length, locations: rows('locations').length, roles: rows('roles').length };
    var LABELS = { people: 'People', organizations: 'Organizations', locations: 'Locations', roles: 'Roles' };
    document.getElementById('cv2-tabs').innerHTML = ['people', 'organizations', 'locations', 'roles'].map(function (t) {
      var label = LABELS[t];
      return '<button class="cv2-tab' + (ui.tab === t ? ' active' : '') + '" data-act="tab" data-tab="' + t + '">' + label +
        (store.loaded ? '<span class="cv2-count">' + counts[t] + '</span>' : '') + '</button>';
    }).join('');
  }

  function renderTools() {
    var html = '<div class="cv2-searchrow"><input class="cv2-input" id="cv2-q" placeholder="Search ' + (ui.tab === 'people' ? 'name, role, city, company...' : ui.tab === 'roles' ? 'roles or abbreviations' : ui.tab) + '" value="' + esc(ui.q) + '" autocomplete="off">' +
      '<button class="lb primary cv2-small" data-act="new" title="Add">+ New</button></div>';
    if (ui.tab === 'people') {
      var all = rows('contacts');
      var counts = { all: all.length, staff: 0, crew: 0, talent: 0, none: 0 };
      var states = {};
      all.forEach(function (c) {
        var cats = contactCategories(c);
        if (!cats.length) counts.none++;
        cats.forEach(function (k) { counts[k]++; });
        if (c.state) states[c.state.toUpperCase()] = 1;
      });
      html += '<div class="cv2-chips">' + [['all', 'All'], ['staff', 'Staff'], ['crew', 'Crew'], ['talent', 'Talent'], ['none', 'Uncategorized']].map(function (p) {
        return '<button class="cv2-chip' + (ui.cat === p[0] ? ' active' : '') + '" data-act="cat" data-cat="' + p[0] + '">' + p[1] + ' ' + counts[p[0]] + '</button>';
      }).join('') + '</div>';
      var stateOpts = Object.keys(states).sort();
      html += '<div class="cv2-filterrow"><div class="select-wrap"><select class="cv2-input" id="cv2-state"><option value="">All states</option>' +
        stateOpts.map(function (s) { return '<option' + (ui.state === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
        '</select></div>' + archToggle() + '</div>';
    } else if (ui.tab === 'roles') {
      var rl = rows('roles');
      var rc = { all: rl.length, mine: 0, staff: 0, crew: 0, talent: 0 };
      rl.forEach(function (r) { rc[r.category]++; if (!r.is_global) rc.mine++; });
      html += '<div class="cv2-chips">' + [['all', 'All'], ['mine', 'Your roles'], ['staff', 'Staff'], ['crew', 'Crew'], ['talent', 'Talent']].map(function (p) {
        return '<button class="cv2-chip' + (ui.cat === p[0] ? ' active' : '') + '" data-act="cat" data-cat="' + p[0] + '">' + p[1] + ' ' + rc[p[0]] + '</button>';
      }).join('') + '</div>';
      html += '<div class="cv2-filterrow" style="justify-content:flex-end">' + archToggle('Show deleted') + '</div>';
    } else {
      html += '<div class="cv2-filterrow" style="justify-content:flex-end">' + archToggle() + '</div>';
    }
    document.getElementById('cv2-tools').innerHTML = html;
  }
  function archToggle(label) {
    return '<label class="cv2-archtoggle"><input type="checkbox" id="cv2-arch"' + (ui.showArchived ? ' checked' : '') + '> ' + (label || 'Show archived') + '</label>';
  }

  // ----------------------------------------------------------------- list
  function sortKey(c) { return (c.sort_last_name || c.name || '').toLowerCase() + '\u0000' + (c.name || '').toLowerCase(); }
  function orgName(id) { var o = store.organizations[id]; return o ? o.name : ''; }

  function filteredRows() {
    var table = TAB_TABLE[ui.tab];
    var q = ui.q.trim().toLowerCase();
    var list = rows(table, ui.showArchived);
    if (ui.tab === 'people') {
      list = list.filter(function (c) {
        var cats = contactCategories(c);
        if (ui.cat === 'none' && cats.length) return false;
        if (ui.cat !== 'all' && ui.cat !== 'none' && cats.indexOf(ui.cat) === -1) return false;
        if (ui.state && (c.state || '').toUpperCase() !== ui.state) return false;
        if (!q) return true;
        var hay = [c.name, c.title, c.email, c.phone, c.city, c.state, c.country && Regions.countryName(c.country), c.union_status, orgName(c.organization_id)]
          .concat((c.role_ids || []).map(function (id) { var r = role(id); return r ? r.name + ' ' + (r.abbreviation || '') : ''; }))
          .join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      list.sort(function (a, b) { return byText(sortKey(a), sortKey(b)); });
    } else if (ui.tab === 'roles') {
      list = list.filter(function (r) {
        if (r.archived_at && r.is_global) return false; // retired built-ins never listed
        if (ui.cat === 'mine' && r.is_global) return false;
        if (['staff', 'crew', 'talent'].indexOf(ui.cat) !== -1 && r.category !== ui.cat) return false;
        return !q || [r.name, r.abbreviation, r.department].join(' ').toLowerCase().indexOf(q) !== -1;
      });
    } else {
      if (q) list = list.filter(function (r) { return [r.name, r.city, r.state, r.country && Regions.countryName(r.country), r.address, r.website].join(' ').toLowerCase().indexOf(q) !== -1; });
      list.sort(function (a, b) { return byText((a.name || '').toLowerCase(), (b.name || '').toLowerCase()); });
    }
    return list;
  }

  function roleUsers(roleId) {
    return rows('contacts').filter(function (c) { return (c.role_ids || []).indexOf(roleId) !== -1; })
      .sort(function (a, b) { return byText(sortKey(a), sortKey(b)); });
  }
  function roleRowHtml(r) {
    var n = roleUsers(r.id).length;
    var cls = 'cv2-row' + (String(ui.sel) === String(r.id) ? ' active' : '') + (r.archived_at ? ' archived' : '');
    var name = esc(r.name) + (r.abbreviation ? ' <span class="cv2-pill-abbr">' + esc(r.abbreviation) + '</span>' : '') +
      (r.archived_at ? '<span class="cv2-badge">Deleted</span>' : '') + (!r.is_global ? '<span class="cv2-badge accent">Yours</span>' : '');
    var sub = [CAT_LABEL[r.category], r.department, n ? n + (n === 1 ? ' person' : ' people') : ''].filter(Boolean).join(' · ');
    return '<div class="' + cls + '" data-act="select" data-id="' + r.id + '"><div class="cv2-row-main"><div class="cv2-row-name">' + name + '</div>' +
      '<div class="cv2-row-sub">' + esc(sub) + '</div></div></div>';
  }
  function renderRoleList(el, list) {
    var mine = list.filter(function (r) { return !r.is_global; })
      .sort(function (a, b) { return byText(a.category + a.name.toLowerCase(), b.category + b.name.toLowerCase()); });
    var builtIn = list.filter(function (r) { return r.is_global; });
    var html = '';
    if (mine.length) html += '<div class="cv2-picker-group" style="padding:10px 12px 4px">Your roles</div>' + mine.map(roleRowHtml).join('');
    else if (ui.cat === 'mine') html += '<div class="cv2-empty">You have no custom roles.<br>Use <strong>+ New</strong>, or create one from a person\'s role picker.</div>';
    roleGroups(builtIn).forEach(function (g) {
      html += '<div class="cv2-picker-group" style="padding:10px 12px 4px">' + esc(g.label) + '</div>' + g.items.map(roleRowHtml).join('');
    });
    el.innerHTML = html || '<div class="cv2-empty">Nothing matches these filters.</div>';
  }

  function renderList() {
    var el = document.getElementById('cv2-list');
    if (!store.loaded) return;
    var list = filteredRows();
    if (ui.tab === 'roles') return renderRoleList(el, list);
    var waiting = queueLoad().filter(function (x) { return x.table === TAB_TABLE[ui.tab]; });
    var waitNote = waiting.length ? '<div class="cv2-waiting">' + waiting.length + ' waiting to save (offline): ' +
      esc(waiting.map(function (x) { return x.label || 'Untitled'; }).join(', ')) + '</div>' : '';
    if (!list.length) {
      var anyAtAll = rows(TAB_TABLE[ui.tab], true).length;
      el.innerHTML = waitNote + '<div class="cv2-empty">' + (anyAtAll || ui.q || ui.cat !== 'all' || ui.state
        ? 'Nothing matches these filters.'
        : 'No ' + (ui.tab === 'people' ? 'people' : ui.tab) + ' yet.<br>Use <strong>+ New</strong> to add one.') + '</div>';
      return;
    }
    el.innerHTML = waitNote + list.map(function (r) {
      var cls = 'cv2-row' + (String(ui.sel) === String(r.id) ? ' active' : '') + (r.archived_at ? ' archived' : '');
      var name = esc(r.name) + (r.archived_at ? '<span class="cv2-badge">Archived</span>' : '');
      var sub, lead = '';
      if (ui.tab === 'people') {
        var roles = (r.role_ids || []).map(function (id) { return roleLabel(role(id)); });
        sub = [roles.join(', '), r.title, orgName(r.organization_id), placeLine(r)].filter(Boolean).join(' · ');
      } else if (ui.tab === 'organizations') {
        lead = r.logo ? '<img class="cv2-row-logo" src="' + esc(r.logo) + '" alt="">' : '<div class="cv2-row-logo empty">' + esc((r.name || '?').charAt(0).toUpperCase()) + '</div>';
        if (r.is_agency) name += '<span class="cv2-badge">Agency</span>';
        if (store.defaultOrgId === r.id) name += '<span class="cv2-badge accent">Default</span>';
        sub = [r.website, placeLine(r)].filter(Boolean).join(' · ');
      } else {
        sub = [r.address, placeLine(r)].filter(Boolean).join(' · ');
      }
      return '<div class="' + cls + '" data-act="select" data-id="' + r.id + '">' + lead +
        '<div class="cv2-row-main"><div class="cv2-row-name">' + name + '</div>' +
        (sub ? '<div class="cv2-row-sub">' + esc(sub) + '</div>' : '') + '</div></div>';
    }).join('');
  }

  // --------------------------------------------------------------- detail
  function fieldHtml(label, key, value, opts) {
    opts = opts || {};
    var id = 'cv2f_' + key;
    var attrs = ' id="' + id + '" data-field="' + key + '" autocomplete="off"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '');
    var control;
    if (opts.type === 'textarea') {
      control = '<textarea' + attrs + ' rows="' + (opts.rows || 3) + '">' + esc(value) + '</textarea>';
    } else if (opts.type === 'select') {
      control = '<div class="select-wrap"><select' + attrs + '>' + opts.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(value == null ? '' : value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></div>';
    } else {
      control = '<input type="' + (opts.inputType || 'text') + '"' + attrs + ' value="' + esc(value) + '"' +
        (opts.cls ? ' class="' + opts.cls + '"' : '') + (opts.list ? ' list="' + opts.list + '"' : '') + '>';
    }
    return '<div class="fl"><label for="' + id + '">' + esc(label) + (opts.required ? ' <span class="cv2-req">*</span>' : '') + '</label>' + control + '</div>';
  }

  function renderDetail() {
    var el = document.getElementById('cv2-detail');
    var main = document.getElementById('cv2-main');
    main.classList.toggle('show-detail', ui.sel != null);
    if (!store.loaded) { el.innerHTML = ''; return; }
    if (ui.sel == null) {
      el.innerHTML = '<div class="cv2-empty" style="margin:auto">Select a ' + TAB_NOUN[ui.tab] + ' to view or edit,<br>or use <strong>+ New</strong>.</div>';
      return;
    }
    var r = ui.baseline || {};
    var isNew = ui.sel === 'new';
    var archived = !!r.archived_at;
    var title = isNew ? 'New ' + TAB_NOUN[ui.tab] : (r.name || '');
    var body = '';
    if (archived) body += '<div class="cv2-banner warn">' + (ui.tab === 'roles'
      ? 'This role is deleted. It no longer appears in the role picker. Restore it to use or edit it again, or delete it permanently.'
      : 'This ' + TAB_NOUN[ui.tab] + ' is archived. It is hidden from lists and pickers. Restore it to edit, or delete it permanently.') + '</div>';
    if (ui.tab === 'people') body += personForm(r);
    else if (ui.tab === 'organizations') body += orgForm(r, isNew);
    else if (ui.tab === 'roles') body += roleForm(r, isNew);
    else body += locationForm(r);

    var foot = '';
    var builtIn = ui.tab === 'roles' && !isNew && r.is_global;
    if (builtIn) {
      foot = '<span class="cv2-hint" style="margin:0">Built-in roles can\'t be changed. Use <strong>+ New</strong> to add your own.</span>';
    } else if (archived) {
      foot = '<button class="lb danger" data-act="purge">Delete permanently</button>' +
        '<span class="cv2-spacer"></span><button class="lb primary" data-act="restore">Restore</button>';
    } else {
      foot = (isNew ? '' : '<button class="lb danger" data-act="archive">' + (ui.tab === 'roles' ? 'Delete' : 'Archive') + '</button>') +
        '<span class="cv2-spacer"></span><span class="cv2-dirty" id="cv2-dirty"></span>' +
        (isNew ? '<button class="lb" data-act="cancel-new">Cancel</button>' : '') +
        '<button class="lb primary" data-act="save" id="cv2-save">' + (isNew ? 'Create' : 'Save') + '</button>';
    }
    el.innerHTML =
      '<div class="cv2-detail-head"><button class="lb cv2-small cv2-back" data-act="back">&#8249; Back</button>' +
        '<div class="cv2-detail-title">' + esc(title) + '</div></div>' +
      '<div class="cv2-detail-body" id="cv2-form">' + body + '</div>' +
      '<div class="cv2-detail-foot">' + foot + '</div>';

    if (archived || builtIn) el.querySelectorAll('#cv2-form input, #cv2-form textarea, #cv2-form select').forEach(function (x) { x.disabled = true; });
    // Archived: no editing actions either (logo, default agency...), but
    // "go to person" links stay usable.
    if (archived) el.querySelectorAll('#cv2-form button:not(.cv2-link)').forEach(function (x) { x.disabled = true; });
    if (ui.tab === 'people') renderPills();
    updateDirty();
  }

  // ------------------------------------------------------------ addresses
  // State: US/CA get a type-ahead of states/provinces and store the postal
  // code (typing "washington" saves WA and sets the country). Any other
  // country: free text. Country: type-ahead, stored as the ISO code.
  // Shared list + rules: public/regions.js (also used by the server).
  var Regions = window.SlaterRegions;
  function defaultCountry() { return (store.settings && store.settings.default_country) || 'US'; }
  function stateLabel(country) { return country === 'CA' ? 'Province' : (country === 'US' || !country) ? 'State' : 'State / region'; }
  function addressHtml(r) {
    var isNew = ui.sel === 'new';
    var country = isNew ? defaultCountry() : (r.country || null);
    return '' +
      fieldHtml('Address', 'address', r.address) +
      '<div class="cv2-grid4">' +
        fieldHtml('City', 'city', r.city) +
        '<div class="fl"><label for="cv2f_state" id="cv2-state-label">' + stateLabel(country) + '</label>' +
          '<div class="cv2-picker"><input type="text" id="cv2f_state" data-field="state" autocomplete="off" value="' + esc(r.state) + '">' +
          '<div class="cv2-picker-list" id="cv2-ta-state"></div></div></div>' +
        fieldHtml('Zip', 'zip', r.zip) +
        '<div class="fl"><label for="cv2f_country">Country</label>' +
          '<div class="cv2-picker"><input type="text" id="cv2f_country" data-field="country" autocomplete="off" data-code="' + esc(country || '') + '" value="' + esc(country ? Regions.countryName(country) : '') + '">' +
          '<div class="cv2-picker-list" id="cv2-ta-country"></div></div></div>' +
      '</div>';
  }
  function countryInput() { return document.getElementById('cv2f_country'); }
  function currentCountry() {
    var el = countryInput();
    if (!el) return null;
    var typed = el.value.trim();
    if (!typed) return null;
    return Regions.resolveCountry(typed) || el.getAttribute('data-code') || null;
  }
  function setCountry(code) {
    var el = countryInput();
    if (!el) return;
    el.setAttribute('data-code', code || '');
    el.value = code ? Regions.countryName(code) : '';
    var lbl = document.getElementById('cv2-state-label');
    if (lbl) lbl.textContent = stateLabel(code);
  }
  // State + country from the form, normalized exactly like the server does.
  function readAddress() {
    var st = document.getElementById('cv2f_state');
    if (!st) return null;
    return Regions.normalizeAddress(st.value, currentCountry());
  }
  // "Seattle, WA" at home; "London, United Kingdom" abroad.
  function placeLine(r) {
    var parts = [r.city, r.state].filter(Boolean).join(', ');
    if (r.country && r.country !== defaultCountry()) parts = [parts, Regions.countryName(r.country)].filter(Boolean).join(', ');
    return parts;
  }

  var ta = { key: null, idx: -1 };
  function taItems(key) {
    var el = document.getElementById('cv2f_' + key);
    var q = el ? el.value : '';
    if (key === 'country') {
      return Regions.searchCountries(q, 60).map(function (c) { return { value: c.code, label: c.name, meta: c.code }; });
    }
    var country = currentCountry();
    if (country && !Regions.hasRegionList(country)) return []; // free text abroad
    return Regions.searchRegions(q, country, 80).map(function (r) {
      return { value: r.code, label: r.name, meta: r.code + (r.country === country ? '' : ' · ' + (r.country === 'CA' ? 'Canada' : 'US')), country: r.country };
    });
  }
  function openTA(key) {
    var list = document.getElementById('cv2-ta-' + key);
    if (!list) return;
    if (ta.key !== key) { ta.key = key; ta.idx = -1; }
    var items = taItems(key);
    if (!items.length) { list.classList.remove('open'); return; }
    list.innerHTML = items.map(function (it, i) {
      return '<div class="cv2-picker-item' + (i === ta.idx ? ' active' : '') + '" data-act="ta-pick" data-key="' + key + '" data-idx="' + i + '">' +
        '<span>' + esc(it.label) + '</span><span class="cv2-pi-meta">' + esc(it.meta) + '</span></div>';
    }).join('');
    list.classList.add('open');
    var active = list.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  function closeTA(only) {
    ['state', 'country'].forEach(function (k) {
      if (only && k !== only) return;
      var l = document.getElementById('cv2-ta-' + k); if (l) l.classList.remove('open');
    });
    if (!only || ta.key === only) { ta.key = null; ta.idx = -1; }
  }
  function pickTA(key, idx) {
    var it = taItems(key)[idx];
    if (!it) return;
    if (key === 'country') {
      setCountry(it.value);
    } else {
      document.getElementById('cv2f_state').value = it.value;
      if (it.country && currentCountry() !== it.country) setCountry(it.country);
    }
    closeTA();
    updateDirty();
  }
  // On leaving a field: tidy what was typed ("washington" -> WA + US).
  function commitTA(key) {
    if (key === 'country') {
      var el = countryInput();
      if (!el) return;
      var typed = el.value.trim();
      if (!typed) setCountry(null);
      else {
        var code = Regions.resolveCountry(typed);
        if (code) setCountry(code);
        else { setCountry(el.getAttribute('data-code') || null); toast('Unknown country "' + typed + '". Pick one from the list.', 'err'); }
      }
    } else {
      var a = readAddress();
      if (!a) return;
      document.getElementById('cv2f_state').value = a.state || '';
      if (a.country !== currentCountry()) setCountry(a.country);
    }
    updateDirty();
  }

  function personForm(c) {
    var orgOpts = [['', 'None']].concat(rows('organizations')
      .sort(function (a, b) { return byText(a.name.toLowerCase(), b.name.toLowerCase()); })
      .map(function (o) { return [String(o.id), o.name]; }));
    if (c.organization_id && !store.organizations[c.organization_id]) orgOpts.push([String(c.organization_id), '(archived organization)']);
    else if (c.organization_id && store.organizations[c.organization_id].archived_at) orgOpts.push([String(c.organization_id), orgName(c.organization_id) + ' (archived)']);
    return '' +
      '<div class="cv2-grid2">' +
        fieldHtml('Name', 'name', c.name, { required: true, placeholder: 'Full name' }) +
        fieldHtml('Sort as', 'sort_last_name', c.sort_last_name, { placeholder: 'Optional, e.g. last name' }) +
      '</div>' +
      '<div class="fl"><label>Roles</label>' +
        '<div class="cv2-pills" id="cv2-pills"></div>' +
        '<div class="cv2-picker"><input class="cv2-input" id="cv2-role-input" placeholder="Add a role: type to search, or create your own" autocomplete="off">' +
          '<div class="cv2-picker-list" id="cv2-picker-list"></div></div>' +
        '<div id="cv2-newrole"></div>' +
      '</div>' +
      '<div class="cv2-hint">The first role is the primary one. Click a role to make it primary.</div>' +
      '<div class="cv2-grid2">' +
        fieldHtml('Title', 'title', c.title, { placeholder: 'Job title, e.g. VP of Marketing' }) +
        fieldHtml('Organization', 'organization_id', c.organization_id == null ? '' : String(c.organization_id), { type: 'select', options: orgOpts }) +
      '</div>' +
      '<div class="cv2-grid2">' +
        fieldHtml('Phone', 'phone', c.phone, { cls: 'fmt-phone', placeholder: '(206) 555-0100', inputType: 'tel' }) +
        fieldHtml('Email', 'email', c.email, { inputType: 'email' }) +
      '</div>' +
      addressHtml(c) +
      '<div class="cv2-section">Production details</div>' +
      '<div class="cv2-grid2">' +
        fieldHtml('Union status', 'union_status', c.union_status, { list: 'cv2-union-list', placeholder: 'e.g. IATSE Local 600, Non-union' }) +
        fieldHtml('Travel availability', 'travel_availability', c.travel_availability, { list: 'cv2-travel-list', placeholder: 'e.g. Will travel (domestic)' }) +
      '</div>' +
      fieldHtml('Gear / kit', 'gear_kit', c.gear_kit, { type: 'textarea', placeholder: 'e.g. Owns FX6 package, 2x Aputure 600d, sound cart' }) +
      fieldHtml('Notes', 'notes', c.notes, { type: 'textarea', rows: 4 });
  }

  function orgForm(o, isNew) {
    var logo = ui.formLogo;
    var logoHtml = logo
      ? '<img class="cv2-logo-img" src="' + esc(logo) + '" alt="Logo">'
      : '<div class="cv2-logo-empty" data-act="logo-upload">Logo</div>';
    var people = isNew ? [] : rows('contacts').filter(function (c) { return c.organization_id === o.id; })
      .sort(function (a, b) { return byText(sortKey(a), sortKey(b)); });
    var isDefault = !isNew && store.defaultOrgId === o.id;
    var agencyChecked = isNew ? false : !!o.is_agency;
    return '' +
      '<div class="cv2-logo">' + logoHtml + '<div><div class="cv2-logo-btns">' +
        '<button class="lb cv2-small" data-act="logo-upload">' + (logo ? 'Replace logo' : 'Upload logo') + '</button>' +
        (logo ? '<button class="lb cv2-small" data-act="logo-crop">Crop</button><button class="lb cv2-small" data-act="logo-remove">Remove</button>' : '') +
      '</div><div class="cv2-hint" style="margin:6px 0 0">Square crop, saved at 512 x 512. Used on call sheets and docs.</div></div></div>' +
      fieldHtml('Name', 'name', o.name, { required: true, placeholder: 'Organization name' }) +
      '<label class="cv2-check"><input type="checkbox" id="cv2f_is_agency" data-field="is_agency"' + (agencyChecked ? ' checked' : '') + '>' +
        '<span>This is an agency<br><span style="color:var(--text-muted);font-size:11px">Agencies can be picked as the producing agency on a project. Any organization can be a client.</span></span></label>' +
      (isDefault ? '<div class="cv2-banner">This is your default agency for new projects. <button class="lb cv2-small" data-act="clear-default" style="margin-left:6px">Clear default</button></div>'
        : (!isNew && o.is_agency ? '<div style="margin:-4px 0 14px"><button class="lb cv2-small" data-act="set-default">Make default agency</button></div>' : '')) +
      '<div class="cv2-grid2">' +
        fieldHtml('Website', 'website', o.website, { placeholder: 'example.com' }) +
        fieldHtml('Phone', 'phone', o.phone, { cls: 'fmt-phone', inputType: 'tel' }) +
      '</div>' +
      addressHtml(o) +
      fieldHtml('Notes', 'notes', o.notes, { type: 'textarea' }) +
      '<div id="cv2-agency-section"' + (agencyChecked ? '' : ' style="display:none"') + '>' +
        '<div class="cv2-section">Agency details</div>' +
        '<div class="cv2-hint">Printed on call sheets and expense reports when this agency produces a project.</div>' +
        '<div class="cv2-grid3">' +
          fieldHtml('Billing contact', 'contact_name', o.contact_name) +
          fieldHtml('Contact email', 'contact_email', o.contact_email, { inputType: 'email' }) +
          fieldHtml('Contact phone', 'contact_phone', o.contact_phone, { cls: 'fmt-phone', inputType: 'tel' }) +
        '</div>' +
        fieldHtml('Invoicing email', 'invoicing_email', o.invoicing_email, { inputType: 'email' }) +
        fieldHtml('Invoicing text', 'invoicing_text', o.invoicing_text, { type: 'textarea', placeholder: 'Custom invoicing instructions for the call sheet (optional)' }) +
        '<div class="cv2-grid2">' +
          fieldHtml('Default project type', 'default_project_type', o.default_project_type || '', { type: 'select', options: PROJECT_TYPES }) +
          fieldHtml('Timezone', 'timezone', o.timezone || '', { type: 'select', options: TIMEZONES }) +
        '</div>' +
      '</div>' +
      (people.length ? '<div class="cv2-section">People at this organization</div><div class="cv2-linklist">' +
        people.map(function (c) { return '<button class="cv2-link" data-act="goto-person" data-id="' + c.id + '">' + esc(c.name) + '</button>'; }).join('') + '</div>' : '');
  }

  function roleForm(r, isNew) {
    var cat = isNew ? (['staff', 'crew', 'talent'].indexOf(ui.cat) !== -1 ? ui.cat : 'crew') : r.category;
    document.getElementById('cv2-dept-list').innerHTML = crewDepartments().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('');
    var users = isNew ? [] : roleUsers(r.id);
    return '' +
      (!isNew && r.is_global ? '<div class="cv2-banner">Built-in role. Every Slater account has it.</div>' : '') +
      '<div class="cv2-grid2">' +
        fieldHtml('Role name', 'name', r.name, { required: true, placeholder: 'e.g. Drone Pilot (FAA Part 107)' }) +
        fieldHtml('Abbreviation', 'abbreviation', r.abbreviation, { placeholder: 'Optional, e.g. DP' }) +
      '</div>' +
      '<div class="cv2-grid2">' +
        fieldHtml('Category', 'category', cat, { type: 'select', options: [['staff', 'Staff'], ['crew', 'Crew'], ['talent', 'Talent']] }) +
        '<div id="cv2-dept-wrap"' + (cat === 'crew' ? '' : ' style="display:none"') + '>' +
          fieldHtml('Department', 'department', r.department, { list: 'cv2-dept-list', placeholder: 'Optional, e.g. Camera' }) + '</div>' +
      '</div>' +
      '<div class="cv2-hint">Category decides where people with this role appear (Staff, Crew or Talent filters). Department groups crew roles in the picker.</div>' +
      (isNew ? '' : '<div class="cv2-section">People with this role</div>' + (users.length
        ? '<div class="cv2-linklist">' + users.map(function (c) { return '<button class="cv2-link" data-act="goto-person" data-id="' + c.id + '">' + esc(c.name) + '</button>'; }).join('') + '</div>'
        : '<div class="cv2-hint" style="margin:0">Nobody has this role yet.</div>'));
  }

  function locationForm(l) {
    return '' +
      fieldHtml('Name', 'name', l.name, { required: true, placeholder: 'e.g. Building 92, Studio B' }) +
      addressHtml(l) +
      '<div class="fl"><label for="cv2f_hospital">Nearest hospital' +
        (l.archived_at ? '' : ' <button type="button" class="cv2-inline-btn" data-act="hosp-lookup" title="Find the nearest emergency room for this address">Look up</button>') +
        ' <span class="cv2-hosp-status" id="cv2-hosp-status"></span></label>' +
        '<textarea id="cv2f_hospital" data-field="hospital" rows="3" placeholder="Looked up from the address when you enter one. You can type or correct it.">' + esc(l.hospital) + '</textarea></div>' +
      fieldHtml('Notes', 'notes', l.notes, { type: 'textarea', placeholder: 'Parking, load-in, access, contacts on site...' });
  }

  // Read the open form into a plain object of fields.
  var FORM_FIELDS = {
    people: ['name', 'sort_last_name', 'title', 'organization_id', 'phone', 'email', 'address', 'city', 'state', 'zip', 'country', 'union_status', 'travel_availability', 'gear_kit', 'notes'],
    organizations: ['name', 'is_agency', 'website', 'phone', 'address', 'city', 'state', 'zip', 'country', 'notes', 'contact_name', 'contact_email', 'contact_phone', 'invoicing_email', 'invoicing_text', 'default_project_type', 'timezone'],
    locations: ['name', 'address', 'city', 'state', 'zip', 'country', 'hospital', 'notes'],
    roles: ['name', 'abbreviation', 'category', 'department'],
  };
  function readForm() {
    var out = {};
    FORM_FIELDS[ui.tab].forEach(function (k) {
      var el = document.getElementById('cv2f_' + k);
      if (!el) return;
      if (k === 'state' || k === 'country') return; // handled by readAddress()
      out[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    var addr = readAddress();
    if (addr) { out.state = addr.state; out.country = addr.country; }
    if (ui.tab === 'people') out.role_ids = ui.formRoles.slice();
    if (ui.tab === 'organizations') out.logo = ui.formLogo;
    if (ui.tab === 'roles' && out.category !== 'crew') out.department = null; // departments are for crew
    return out;
  }
  function updateDirty() {
    var save = document.getElementById('cv2-save');
    var label = document.getElementById('cv2-dirty');
    if (!save) { ui.dirty = false; return; }
    var form = readForm();
    if (ui.queuedQid && ui.queuedForm) {
      // Saved offline (queued): unsaved only if changed since that Save.
      ui.dirty = Object.keys(form).some(function (k) {
        return JSON.stringify(norm(k, form[k])) !== JSON.stringify(norm(k, ui.queuedForm[k]));
      });
    } else if (ui.sel === 'new') {
      ui.dirty = Object.keys(form).some(function (k) {
        var v = norm(k, form[k]);
        if (k === 'country') return v != null && v !== defaultCountry();
        if (k === 'category') return false; // pre-selected, not a user edit
        return k === 'role_ids' ? v.length > 0 : k === 'is_agency' ? v : v != null;
      });
    } else {
      ui.dirty = Object.keys(changedFields(ui.baseline, form)).length > 0;
    }
    save.disabled = ui.saving || (ui.sel !== 'new' && !ui.dirty);
    if (label) label.textContent = ui.dirty ? 'Unsaved changes' : '';
  }

  // ------------------------------------------------------- role pills/picker
  function renderPills() {
    var el = document.getElementById('cv2-pills');
    if (!el) return;
    if (!ui.formRoles.length) { el.innerHTML = '<span class="cv2-pills-empty">No roles yet. This person shows as Uncategorized.</span>'; return; }
    var disabled = ui.baseline && ui.baseline.archived_at;
    el.innerHTML = ui.formRoles.map(function (id, i) {
      var r = role(id);
      return '<span class="cv2-pill' + (i === 0 ? ' primary' : '') + '" data-act="pill-primary" data-id="' + id + '" title="' + (i === 0 ? 'Primary role' : 'Click to make primary') + '">' +
        esc(r ? r.name : 'Removed role') + (r && r.archived_at ? ' <span class="cv2-pill-cat">' + (r.is_global ? 'retired' : 'deleted') + '</span>' : '') +
        (r && r.abbreviation && r.abbreviation !== r.name ? ' <span class="cv2-pill-abbr">' + esc(r.abbreviation) + '</span>' : '') +
        (r ? ' <span class="cv2-pill-cat">' + esc(CAT_LABEL[r.category]) + '</span>' : '') +
        (disabled ? '' : '<button data-act="pill-remove" data-id="' + id + '" title="Remove role">&#x2715;</button>') + '</span>';
    }).join('');
  }

  function pickerItems() {
    var input = document.getElementById('cv2-role-input');
    var q = (input ? input.value : '').trim().toLowerCase();
    var avail = rows('roles').filter(function (r) { return ui.formRoles.indexOf(r.id) === -1; });
    if (q) avail = avail.filter(function (r) {
      return r.name.toLowerCase().indexOf(q) !== -1 || (r.abbreviation || '').toLowerCase().indexOf(q) !== -1 ||
        (r.department || '').toLowerCase().indexOf(q) !== -1;
    });
    var groups = roleGroups(avail);
    var exact = q && rows('roles').some(function (r) { return r.name.toLowerCase() === q; });
    return { groups: groups, create: q && !exact ? input.value.trim() : null };
  }
  function openPicker() {
    var list = document.getElementById('cv2-picker-list');
    if (!list) return;
    var p = pickerItems();
    var html = '', idx = 0;
    p.groups.forEach(function (g) {
      html += '<div class="cv2-picker-group">' + esc(g.label) + '</div>';
      g.items.forEach(function (r) {
        html += '<div class="cv2-picker-item' + (idx === ui.pickerIdx ? ' active' : '') + '" data-act="pick-role" data-id="' + r.id + '" data-idx="' + idx + '">' +
          '<span>' + esc(r.name) + '</span><span class="cv2-pi-meta">' + esc([r.abbreviation, r.is_global ? '' : 'custom'].filter(Boolean).join(' · ')) + '</span></div>';
        idx++;
      });
    });
    if (p.create) {
      html += '<div class="cv2-picker-item create' + (idx === ui.pickerIdx ? ' active' : '') + '" data-act="create-role" data-idx="' + idx + '">+ Create role "' + esc(p.create) + '"</div>';
      idx++;
    }
    if (!idx) html = '<div class="cv2-picker-group">No more roles to add</div>';
    list.innerHTML = html;
    list.classList.add('open');
    var active = list.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  function closePicker() {
    var list = document.getElementById('cv2-picker-list');
    if (list) list.classList.remove('open');
    ui.pickerIdx = -1;
  }
  function addRole(id) {
    if (ui.formRoles.indexOf(id) === -1) ui.formRoles.push(id);
    var input = document.getElementById('cv2-role-input');
    if (input) input.value = '';
    closePicker();
    renderPills(); updateDirty();
    if (input) input.focus();
  }

  function showNewRoleForm(name) {
    closePicker();
    var guessCat = ['staff', 'crew', 'talent'].indexOf(ui.cat) !== -1 ? ui.cat : 'crew';
    document.getElementById('cv2-dept-list').innerHTML = crewDepartments().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('');
    document.getElementById('cv2-newrole').innerHTML =
      '<div class="cv2-newrole"><div style="font-size:12px;font-weight:600">New custom role</div>' +
        '<div class="cv2-grid2">' +
          '<div class="fl"><label>Role name</label><input id="cv2-nr-name" value="' + esc(name) + '" autocomplete="off"></div>' +
          '<div class="fl"><label>Abbreviation</label><input id="cv2-nr-abbr" placeholder="Optional" autocomplete="off"></div>' +
          '<div class="fl"><label>Category</label><div class="select-wrap"><select id="cv2-nr-cat">' +
            ['staff', 'crew', 'talent'].map(function (c) { return '<option value="' + c + '"' + (c === guessCat ? ' selected' : '') + '>' + CAT_LABEL[c] + '</option>'; }).join('') +
          '</select></div></div>' +
          '<div class="fl" id="cv2-nr-dept-wrap"' + (guessCat === 'crew' ? '' : ' style="display:none"') + '><label>Department</label><input id="cv2-nr-dept" list="cv2-dept-list" placeholder="Optional, e.g. Camera" autocomplete="off"></div>' +
        '</div>' +
        '<div class="cv2-newrole-btns"><button class="lb cv2-small" data-act="newrole-cancel">Cancel</button><button class="lb primary cv2-small" data-act="newrole-save">Create role</button></div>' +
      '</div>';
    document.getElementById('cv2-nr-name').focus();
  }
  function saveNewRole() {
    var name = document.getElementById('cv2-nr-name').value.trim();
    if (!name) { toast('Role name is required.', 'err'); return; }
    var cat = document.getElementById('cv2-nr-cat').value;
    var body = {
      name: name,
      abbreviation: document.getElementById('cv2-nr-abbr').value,
      category: cat,
      department: cat === 'crew' ? document.getElementById('cv2-nr-dept').value : null,
    };
    req('POST', '/roles', body).then(function (r) {
      absorb('roles', [r]);
      document.getElementById('cv2-newrole').innerHTML = '';
      addRole(r.id);
      toast('Role "' + r.name + '" created.');
    }, function (e) {
      if (e.status === 409 && e.data && e.data.id) {
        document.getElementById('cv2-newrole').innerHTML = '';
        sync().then(function () { addRole(e.data.id); renderTools(); });
        return;
      }
      toast(e.message, 'err');
    });
  }

  // ------------------------------------------------------ nearest hospital
  // Locations look up their nearest ER from the address (app.js
  // findNearestHospital). Automatic only while the hospital box is empty, so
  // a typed or corrected hospital is never replaced; "Look up" replaces it on
  // request. The result is a normal form edit: Save / Create keeps it.
  // hosp.auto = the text this lookup put in the box (for this record). If
  // the box still holds exactly that and the address changes, the hospital
  // is looked up again; anything typed by hand is left alone.
  var hosp = { key: null, busy: false, auto: null, sel: null };
  function hospLookup(force) {
    if (ui.tab !== 'locations' || ui.sel == null || typeof findNearestHospital !== 'function') return;
    if (ui.baseline && ui.baseline.archived_at) return;
    var box = document.getElementById('cv2f_hospital');
    if (!box) return;
    if (hosp.sel !== ui.sel) { hosp.sel = ui.sel; hosp.auto = null; hosp.key = null; }
    var replaceable = !box.value.trim() || (hosp.auto != null && box.value === hosp.auto);
    if (!force && !replaceable) return;
    var f = readForm();
    // Wait for enough address to pin down the place: a zip, or city + state.
    if (!f.zip && !(f.city && f.state)) {
      if (force) hospStatus('Add a city and state, or a zip, first.', true);
      return;
    }
    var key = [f.address, f.city, f.state, f.zip, f.country].join('|');
    if (hosp.busy || (!force && key === hosp.key)) return; // auto: once per address
    hosp.key = key; hosp.busy = true;
    var sel = ui.sel;
    hospStatus('Looking up...');
    findNearestHospital(f).then(function (text) {
      hosp.busy = false;
      var b = document.getElementById('cv2f_hospital');
      if (!b || ui.sel !== sel) return;
      if (!force && b.value.trim() && b.value !== hosp.auto) { hospStatus(''); return; } // typed meanwhile
      b.value = text;
      hosp.auto = text;
      hospStatus('Found. Check it, then ' + (sel === 'new' ? 'Create.' : 'Save.'));
      updateDirty();
      recheck();
    }, function (e) {
      hosp.busy = false;
      if (ui.sel === sel) hospStatus((e && e.message ? e.message : 'Lookup failed.') + ' You can type it in.', true);
      recheck();
    });
    // The address changed while this lookup ran: look up the new one.
    function recheck() {
      if (ui.sel !== sel || ui.tab !== 'locations') return;
      var g = readForm();
      if ([g.address, g.city, g.state, g.zip, g.country].join('|') !== key) setTimeout(function () { hospLookup(false); }, 0);
    }
  }
  function hospStatus(msg, isErr) {
    var el = document.getElementById('cv2-hosp-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
  }

  // ------------------------------------------------------------- actions
  function select(id) {
    guard(function () {
      ui.onCreated = null; // leaving the prefilled new location
      ui.queuedQid = null; ui.queuedForm = null;
      var table = TAB_TABLE[ui.tab];
      ui.sel = id;
      ui.baseline = id === 'new' ? null : store[table][id] || null;
      ui.formRoles = ui.tab === 'people' && ui.baseline ? (ui.baseline.role_ids || []).slice() : [];
      ui.formLogo = ui.tab === 'organizations' && ui.baseline ? ui.baseline.logo : null;
      ui.dirty = false;
      renderList(); renderDetail();
      if (id === 'new') { var n = document.getElementById('cv2f_name'); if (n) n.focus(); }
    });
  }
  function switchTab(tab) {
    if (tab === ui.tab) return;
    guard(function () {
      ui.tab = tab; ui.sel = null; ui.baseline = null; ui.q = ''; ui.cat = 'all'; ui.state = ''; ui.dirty = false; ui.queuedQid = null; ui.queuedForm = null;
      var table = TAB_TABLE[tab];
      if (ui.showArchived && !store.archivedLoaded[table]) loadArchived(table).then(renderAll);
      renderAll();
    });
  }

  function save() {
    if (ui.saving) return Promise.resolve();
    var form = readForm();
    if (!norm('name', form.name)) {
      toast('Name is required.', 'err');
      var n = document.getElementById('cv2f_name'); if (n) n.focus();
      return;
    }
    var table = TAB_TABLE[ui.tab];
    var wasNew = ui.sel === 'new';
    var queued = ui.queuedQid && queueLoad().filter(function (x) { return x.qid === ui.queuedQid; })[0];
    var ch = describeChange(table, wasNew ? null : ui.baseline, form, queued && queued.op === 'create' ? queued.body.client_uid : null);
    if (ch.op === 'update' && !Object.keys(ch.changes).length && !queued) { ui.dirty = false; updateDirty(); toast('Saved.'); return Promise.resolve(); }
    // Offline, or this form already has a save waiting: queue it (replacing
    // the waiting one, so a new record can't be created twice).
    if (window.SlaterConn && !SlaterConn.online) { queueOffline(ch); return Promise.resolve(); }
    if (queued) {
      // Online again, but this form's earlier save is still waiting: update it, then send in order.
      ui.queuedQid = queuePut(ch, ui.queuedQid);
      ui.queuedForm = readForm();
      ui.dirty = false; updateDirty();
      return flushQueue().then(function (ok) { if (ok) toast('Saved.'); });
    }
    ui.saving = true; updateDirty();
    return sendChange(ch).then(function (res) {
      ui.saving = false; ui.dirty = false;
      if (window.SlaterConn) SlaterConn.changed();
      if (wasNew && ui.onCreated) {
        var cb = ui.onCreated; ui.onCreated = null;
        root.classList.remove('open');
        ui.sel = null; ui.baseline = null;
        cb(res.row);
        toast('Location "' + res.row.name + '" created and added to the day.');
        return;
      }
      ui.sel = res.row.id; ui.baseline = res.row;
      ui.formRoles = ui.tab === 'people' ? (res.row.role_ids || []).slice() : [];
      ui.formLogo = ui.tab === 'organizations' ? res.row.logo : null;
      renderAll();
      toast(res.merged ? 'Saved. Also kept changes made on another device.' : 'Saved.');
    }, function (e) {
      ui.saving = false; updateDirty();
      if (e.offline) { queueOffline(ch); return; }
      toast(e.message, 'err');
    });
  }
  function queueOffline(ch) {
    if (ch.op === 'update') {
      // Same record queued earlier from another form: fold the changes together.
      var prev = queueLoad().filter(function (x) { return x.op === 'update' && x.table === ch.table && x.id === ch.id && x.qid !== ui.queuedQid; })[0];
      if (prev) { ch.changes = Object.assign({}, prev.changes, ch.changes); ch.base = prev.base; ui.queuedQid = prev.qid; }
    }
    ui.queuedQid = queuePut(ch, ui.queuedQid);
    ui.queuedForm = readForm();
    ui.dirty = false; updateDirty();
    var msg = "You're offline. Saved on this device: it goes to Slater as soon as the connection is back. You can close this and keep working.";
    if (ch.op === 'create' && ui.onCreated) { ui.onCreated = null; msg = "You're offline. The location is saved on this device and goes to Slater when the connection is back; pick it on the day then."; }
    toast(msg, 'warn'); // a notice, not an error: errors also stick in the bottom status bar
    renderList();
  }
  // Connection back (or a later visit): send the queue, then pull what changed
  // elsewhere. Lists and pickers redraw; an open form being edited is left alone.
  function retryAfterReconnect() {
    var first = queueLoad().some(mayTake) ? flushQueue() : Promise.resolve();
    return first.then(function () {
      if (!store.loaded) return;
      // A fresh pull, not syncShared(): one already in flight may have started
      // before the changes made while this device was offline.
      return (syncing || Promise.resolve()).catch(function () {}).then(sync).then(function (ch) {
        if (ch && root && root.classList.contains('open')) { renderTabs(); renderList(); }
      });
    });
  }
  if (window.SlaterConn) {
    SlaterConn.addSource('contacts', {
      pending: function () { return queueLoad().filter(function (x) { return x.owner === myTab(); }).length; },
      retry: retryAfterReconnect,
    });
    // Saves left waiting from an earlier visit.
    if (queueLoad().some(mayTake) && SlaterConn.online) setTimeout(flushQueue, 0);
  }

  function archive() {
    var r = ui.baseline;
    if (!r) return;
    var extra = ui.tab === 'organizations' && store.defaultOrgId === r.id ? ' It is your default agency; the default will be cleared.' : '';
    if (ui.tab === 'roles') {
      var users = roleUsers(r.id);
      if (users.length) {
        confirmBox('Role in use', '"' + r.name + '" is used by ' + users.map(function (c) { return c.name; }).join(', ') +
          '. Remove it from ' + (users.length === 1 ? 'that person' : 'those people') + ' first, then delete it.', null);
        return;
      }
    }
    var title = ui.tab === 'roles' ? 'Delete role' : 'Archive ' + TAB_NOUN[ui.tab];
    var msg = ui.tab === 'roles'
      ? 'Delete "' + r.name + '"? It will no longer appear in the role picker. You can restore it with Show deleted.'
      : 'Archive "' + r.name + '"? It will be hidden from lists and pickers. You can restore it any time with Show archived.' + extra;
    confirmBox(title, msg, function () {
      req('DELETE', '/' + TAB_TABLE[ui.tab] + '/' + r.id).then(function (row) {
        absorb(TAB_TABLE[ui.tab], [row]);
        if (ui.tab === 'organizations' && store.defaultOrgId === r.id) store.defaultOrgId = null;
        ui.dirty = false;
        if (ui.showArchived) { ui.baseline = row; } else { ui.sel = null; ui.baseline = null; }
        renderAll();
        toast(ui.tab === 'roles' ? 'Role deleted.' : 'Archived.');
      }, function (e) {
        if (e.status === 409 && e.data && e.data.usage) {
          var u = e.data.usage, parts = [];
          if (u.contacts) parts.push(u.contacts + (u.contacts === 1 ? ' person' : ' people'));
          if (u.projects) parts.push(u.projects + (u.projects === 1 ? ' project' : ' projects'));
          return toast('Still used by ' + parts.join(' and ') + '. Remove it there first.', 'err');
        }
        toast(e.message, 'err');
      });
    });
  }
  // Permanently delete an archived record. The server refuses while a
  // project uses it and leaves a tombstone so other devices drop it too.
  function purge() {
    var r = ui.baseline;
    if (!r || !r.archived_at) return;
    var table = TAB_TABLE[ui.tab];
    var what = ui.tab === 'people' ? 'their name, contact details, roles and notes'
      : ui.tab === 'organizations' ? 'its details and logo'
      : ui.tab === 'roles' ? 'the role' : 'its details';
    var extra = '';
    if (ui.tab === 'organizations') {
      var linked = rows('contacts', true).filter(function (c) { return c.organization_id === r.id; }).length;
      if (linked) extra = ' ' + linked + (linked === 1 ? ' person is' : ' people are') + ' linked to it and will be unlinked.';
    }
    confirmBox('Delete permanently', 'Permanently delete "' + r.name + '"? This removes ' + what + ' for good and cannot be undone.' + extra, function () {
      req('DELETE', '/' + table + '/' + r.id + '/permanent').then(function () {
        delete store[table][r.id];
        ui.sel = null; ui.baseline = null; ui.dirty = false;
        renderAll();
        toast('Deleted permanently.');
        sync().then(function (ch) { if (ch) renderAll(); }, function () {}); // pick up side effects (e.g. unlinked people)
      }, function (e) {
        var d = e.data || {};
        if (e.status === 409 && d.error === 'in_use') {
          var msg = d.projects && d.projects.length
            ? 'It is used on ' + (d.usage.projects === 1 ? 'this project' : 'these projects') + ': ' + d.projects.join(', ') +
              (d.usage.projects > d.projects.length ? ' and ' + (d.usage.projects - d.projects.length) + ' more' : '') +
              '. Remove it from ' + (d.usage.projects === 1 ? 'that project' : 'those projects') + ' first.'
            : 'It is still used by ' + d.usage.contacts + (d.usage.contacts === 1 ? ' person' : ' people') + '. Remove it from them first.';
          return confirmBox('Can\'t delete yet', '"' + r.name + '" can\'t be deleted. ' + msg, null);
        }
        if (e.status === 409 && d.error === 'not_archived') return toast('Archive it first, then delete it.', 'err');
        toast(e.message, 'err');
      });
    });
  }
  function restore() {
    var r = ui.baseline;
    req('POST', '/' + TAB_TABLE[ui.tab] + '/' + r.id + '/restore').then(function (row) {
      absorb(TAB_TABLE[ui.tab], [row]);
      ui.baseline = row;
      ui.formRoles = ui.tab === 'people' ? (row.role_ids || []).slice() : [];
      ui.formLogo = ui.tab === 'organizations' ? row.logo : null;
      renderAll();
      toast('Restored.');
    }, function (e) { toast(e.message, 'err'); });
  }
  function setDefault(orgId) {
    req('PUT', '/default-organization', { organization_id: orgId }).then(function (d) {
      store.defaultOrgId = d.organization_id;
      notify();
      renderList(); renderDetailKeepForm();
      toast(orgId ? 'Default agency set.' : 'Default agency cleared.');
    }, function (e) { toast(e.message, 'err'); });
  }
  // Re-render the detail pane without losing unsaved edits.
  function renderDetailKeepForm() {
    var form = readForm();
    renderDetail();
    Object.keys(form).forEach(function (k) {
      if (k === 'country') return setCountry(form.country);
      var el = document.getElementById('cv2f_' + k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!form[k]; else el.value = form[k] == null ? '' : form[k];
    });
    var agency = document.getElementById('cv2-agency-section');
    var chk = document.getElementById('cv2f_is_agency');
    if (agency && chk) agency.style.display = chk.checked ? '' : 'none';
    updateDirty();
  }

  // Logos: reuse the app's square crop tool (outputs 512 x 512 PNG).
  function onLogoFile(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) { cropLogo(ev.target.result); };
    reader.readAsDataURL(f);
  }
  function cropLogo(src) {
    if (typeof openCropModal !== 'function') { ui.formLogo = src; renderDetailKeepForm(); return; }
    openCropModal(src, function (cropped) { ui.formLogo = cropped; renderDetailKeepForm(); });
  }

  // -------------------------------------------------------------- events
  function onClick(e) {
    if (e.target === root) return close(); // backdrop click
    if (e.target.id === 'cv2-role-input') return openPicker();
    if (e.target.id === 'cv2f_state' || e.target.id === 'cv2f_country') {
      // Pick-from-list fields: select the current value so typing replaces it.
      if (e.target.getAttribute('data-fresh') !== '0') { e.target.select(); e.target.setAttribute('data-fresh', '0'); }
      return openTA(e.target.id.slice(5));
    }
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var act = t.getAttribute('data-act');
    var id = t.getAttribute('data-id');
    var EDIT_ACTS = ['logo-upload', 'logo-crop', 'logo-remove', 'set-default', 'clear-default', 'pill-primary', 'pill-remove', 'pick-role', 'create-role', 'ta-pick'];
    if (ui.baseline && ui.baseline.archived_at && EDIT_ACTS.indexOf(act) !== -1) return; // archived = read-only
    switch (act) {
      case 'close': return close();
      case 'tab': return switchTab(t.getAttribute('data-tab'));
      case 'cat': ui.cat = t.getAttribute('data-cat'); renderTools(); return renderList();
      case 'new': return select('new');
      case 'select': return select(Number(id));
      case 'back': return guard(function () { ui.sel = null; ui.baseline = null; renderList(); renderDetail(); });
      case 'cancel-new': return guard(function () { ui.sel = null; ui.baseline = null; ui.onCreated = null; renderList(); renderDetail(); });
      case 'save': return save();
      case 'archive': return archive();
      case 'restore': return restore();
      case 'purge': return purge();
      case 'set-default': return setDefault(ui.baseline.id);
      case 'clear-default': return setDefault(null);
      case 'goto-person':
        return guard(function () {
          ui.tab = 'people'; ui.q = ''; ui.cat = 'all'; ui.state = ''; ui.dirty = false;
          renderTabs(); renderTools(); select(Number(id));
        });
      case 'logo-upload': return document.getElementById('cv2-logo-file').click();
      case 'logo-crop': return ui.formLogo && cropLogo(ui.formLogo);
      case 'logo-remove': ui.formLogo = null; return renderDetailKeepForm();
      case 'pick-role': return addRole(Number(id));
      case 'ta-pick': return pickTA(t.getAttribute('data-key'), Number(t.getAttribute('data-idx')));
      case 'create-role': return showNewRoleForm(document.getElementById('cv2-role-input').value.trim());
      case 'newrole-cancel': document.getElementById('cv2-newrole').innerHTML = ''; return;
      case 'newrole-save': return saveNewRole();
      case 'hosp-lookup': return hospLookup(true);
      case 'pill-remove':
        e.stopPropagation();
        ui.formRoles = ui.formRoles.filter(function (x) { return x !== Number(id); });
        renderPills(); return updateDirty();
      case 'pill-primary':
        if (ui.baseline && ui.baseline.archived_at) return;
        ui.formRoles = [Number(id)].concat(ui.formRoles.filter(function (x) { return x !== Number(id); }));
        renderPills(); return updateDirty();
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'cv2-q') { ui.q = t.value; return renderList(); }
    if (t.id === 'cv2-role-input') { ui.pickerIdx = -1; return openPicker(); }
    if (t.id === 'cv2f_state' || t.id === 'cv2f_country') { ta.idx = -1; openTA(t.id.slice(5)); return setTimeout(updateDirty, 0); }
    if (t.hasAttribute('data-field')) setTimeout(updateDirty, 0); // after the global phone formatter
  }
  function onChange(e) {
    var t = e.target;
    if (t.id === 'cv2-state') { ui.state = t.value; return renderList(); }
    if (t.id === 'cv2-arch') {
      ui.showArchived = t.checked;
      var table = TAB_TABLE[ui.tab];
      if (ui.showArchived && !store.archivedLoaded[table]) {
        loadArchived(table).then(renderList, function (er) { if (!er.offline) toast(er.message, 'err'); });
      }
      return renderList();
    }
    if (t.id === 'cv2f_category') {
      var dw = document.getElementById('cv2-dept-wrap');
      if (dw) dw.style.display = t.value === 'crew' ? '' : 'none';
    }
    if (t.id === 'cv2-nr-cat') {
      document.getElementById('cv2-nr-dept-wrap').style.display = t.value === 'crew' ? '' : 'none';
      return;
    }
    if (t.id === 'cv2f_is_agency') {
      var sec = document.getElementById('cv2-agency-section');
      if (sec) sec.style.display = t.checked ? '' : 'none';
    }
    if (t.hasAttribute('data-field')) updateDirty();
  }
  function onKeydown(e) {
    var t = e.target;
    if (t.id === 'cv2f_state' || t.id === 'cv2f_country') {
      var key = t.id.slice(5);
      var list = document.getElementById('cv2-ta-' + key);
      var open = list && list.classList.contains('open');
      var n = list ? list.querySelectorAll('[data-idx]').length : 0;
      if (e.key === 'ArrowDown') { e.preventDefault(); ta.idx = open ? Math.min(ta.idx + 1, n - 1) : -1; return openTA(key); }
      if (e.key === 'ArrowUp') { e.preventDefault(); ta.idx = Math.max(ta.idx - 1, 0); return openTA(key); }
      if (e.key === 'Enter' && open) { e.preventDefault(); return pickTA(key, ta.idx >= 0 ? ta.idx : 0); }
      if (e.key === 'Escape' && open) { e.stopPropagation(); return closeTA(); }
      if (e.key === 'Tab' && open && ta.idx >= 0) { pickTA(key, ta.idx); }
      return;
    }
    if (t.id === 'cv2-role-input') {
      var items = document.querySelectorAll('#cv2-picker-list [data-idx]');
      var isOpen = document.getElementById('cv2-picker-list').classList.contains('open');
      if (e.key === 'ArrowDown') { e.preventDefault(); ui.pickerIdx = isOpen ? Math.min(ui.pickerIdx + 1, items.length - 1) : -1; return openPicker(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); ui.pickerIdx = Math.max(ui.pickerIdx - 1, 0); return openPicker(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isOpen) return;
        var pick = items[ui.pickerIdx >= 0 ? ui.pickerIdx : 0];
        if (pick) pick.click();
        return;
      }
      if (e.key === 'Escape') { e.stopPropagation(); return closePicker(); }
      if (e.key === 'Backspace' && !t.value && ui.formRoles.length) {
        ui.formRoles.pop(); renderPills(); return updateDirty();
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && ui.sel != null) { e.preventDefault(); return save(); }
    if (e.key === 'Enter' && (t.id === 'cv2-nr-name' || t.id === 'cv2-nr-abbr' || t.id === 'cv2-nr-dept')) { e.preventDefault(); return saveNewRole(); }
  }

  // ------------------------------------------------- My Info: default country
  // Adds a "Default country" select to the existing My Info modal, only when
  // the v2 flag is on (the column exists only after the new-schema migration).
  // Wraps openMyInfo / saveMyInfo from app.js; the inline onclick handlers
  // look these globals up at call time, so the wrappers take effect.
  function hookMyInfo() {
    var origOpen = window.openMyInfo, origSave = window.saveMyInfo;
    if (typeof origOpen !== 'function' || typeof origSave !== 'function') return;
    function field() {
      var sel = document.getElementById('myinfo_country');
      if (sel) return sel;
      var tz = document.getElementById('myinfo_timezone');
      if (!tz) return null;
      var tzField = tz.closest('.fl');
      var wrap = document.createElement('div');
      wrap.className = 'fl';
      wrap.style.marginBottom = '12px';
      wrap.innerHTML = '<label for="myinfo_country">Default country</label>' +
        '<div class="select-wrap"><select id="myinfo_country" style="' + esc(tz.getAttribute('style') || '') + '">' +
        Regions.countries().map(function (c) { return '<option value="' + c.code + '">' + esc(c.name) + '</option>'; }).join('') +
        '</select></div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4">New addresses start in this country. Call sheets and docs only print a country when it is different.</div>';
      tzField.parentNode.insertBefore(wrap, tzField);
      return document.getElementById('myinfo_country');
    }
    window.openMyInfo = function () {
      var out = origOpen.apply(this, arguments);
      var sel = field();
      if (sel) {
        sel.value = defaultCountry();
        sel.setAttribute('data-orig', sel.value);
        req('GET', '/settings').then(function (d) {
          store.settings = d;
          sel.value = d.default_country;
          sel.setAttribute('data-orig', d.default_country);
        }, function () { /* keep cached value */ });
      }
      return out;
    };
    window.saveMyInfo = function () {
      var sel = document.getElementById('myinfo_country');
      if (sel && sel.value && sel.value !== sel.getAttribute('data-orig')) {
        req('PUT', '/settings', { default_country: sel.value }).then(function (d) {
          store.settings = d;
          if (root && root.classList.contains('open')) renderList();
        }, function (e) { toast('Could not save default country: ' + e.message, 'err'); });
      }
      return origSave.apply(this, arguments);
    };
  }
  if (localStorage.getItem(FLAG_KEY) === '1') hookMyInfo();

  window.ContactsV2 = {
    enabled: function () { return localStorage.getItem(FLAG_KEY) === '1'; },
    open: open,
    // Used by project-orgs-v2.js (Session 4).
    sync: syncShared,
    store: store,
    defaultCountry: defaultCountry,
    // Quick-add from the project client picker: creates the organization
    // with just a name. Resolves to the new row.
    // The initial sync only brings active rows. A project can link an
    // archived organization, so fetch it on demand. Resolves to the row,
    // or null if it no longer exists.
    fetchOne: function (table, id) {
      return req('GET', '/' + table + '/' + id).then(function (row) {
        absorb(table, [row]);
        return row;
      }, function (e) { if (e.status === 404) return null; throw e; });
    },
    createOrganization: function (name) {
      return saveRecord('organizations', null, { name: name, country: defaultCountry() })
        .then(function (res) { return res.row; });
    },
    // Quick-add from project crew / talent / key personnel cards (Session 5).
    // fields: name, phone, email, title, role_ids. Resolves to the new row.
    createContact: function (fields) {
      return saveRecord('contacts', null, Object.assign({ country: defaultCountry() }, fields))
        .then(function (res) { return res.row; });
    },
    roleGroups: roleGroups,
    // Change some fields of one record (merge rules as in the screen).
    // Resolves to the saved row.
    update: function (table, id, fields) {
      var base = store[table][id];
      if (!base) return Promise.reject(new Error('Not loaded'));
      return saveRecord(table, base, Object.assign({}, base, fields)).then(function (res) { return res.row; });
    },
    _store: store, // for debugging in the console during the rewrite
  };
})();
