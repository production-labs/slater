// Connection monitor (data-model-rewrite, Session 7: connection-drop handling).
//
// Slater can't open without internet (no service worker), so "offline" here
// means an open tab that loses its connection. Goals: say so clearly, never
// lose an edit, save automatically when the connection is back, and never
// drop a save silently.
//
// Loaded BEFORE app.js. It wraps window.fetch for Slater's own /api requests
// only (map, hospital and sunrise lookups go elsewhere and don't count):
//   - a request that can't reach the server, or a 502/503/504 (Railway
//     between deploys), means OFFLINE;
//   - any other response means ONLINE again;
//   - a 401 on a SAVE (not a GET) means the login expired.
// While offline it checks back (GET /api/users/me) every 3s, backing off to
// 30s, plus right away when the browser reports the network is back.
//
// Other code registers:
//   SlaterConn.addSource(name, { pending: fn -> count, retry: fn -> Promise })
//     pending(): how many changes from this source are waiting to be sent
//       (NOT ones waiting on a decision; those are notices with keep = true).
//     retry(): send them; called when the connection comes back.
//   SlaterConn.changed()  call when a source's pending count may have changed.
//   SlaterConn.notice(id, html, actions) / clearNotice(id): extra messages
//     in the bar (e.g. a project changed on another device).
//   SlaterConn.isOfflineError(err)
(function () {
  'use strict';

  var origFetch = window.fetch.bind(window);
  var state = { online: navigator.onLine !== false, loggedOut: false, saving: false };
  var sources = {};
  var notices = {}; // id -> { html, actions: [{ label, fn }] }
  var probeTimer = null, probeDelay = 3000, savedFlashTimer = null, flashSaved = false;

  function isApi(input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(location.origin) === 0) url = url.slice(location.origin.length);
    return url.indexOf('/api/') === 0;
  }
  function methodOf(input, init) {
    return String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
  }

  window.fetch = function (input, init) {
    if (!isApi(input)) return origFetch(input, init);
    var write = methodOf(input, init) !== 'GET';
    return origFetch(input, init).then(function (r) {
      if (r.status >= 502 && r.status <= 504) goOffline();
      else {
        if (write && r.status === 401) setLoggedOut(true);
        else if (r.ok && state.loggedOut && write) setLoggedOut(false);
        goOnline();
      }
      return r;
    }, function (err) {
      if (!err || err.name !== 'AbortError') goOffline();
      throw err;
    });
  };

  function isOfflineError(e) {
    if (!e) return false;
    if (e.offline) return true;
    if (e.status >= 502 && e.status <= 504) return true;
    return e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(e.message || ''));
  }

  // ------------------------------------------------------------ state changes
  function goOffline() {
    if (state.online) { state.online = false; flashSaved = false; render(); }
    scheduleProbe();
  }
  function goOnline() {
    if (state.online) return;
    state.online = true;
    clearTimeout(probeTimer); probeTimer = null; probeDelay = 3000;
    clearOfflineStatus();
    retryAll();
  }
  // Logged out: the bar's "Log in" opens the login page in a NEW tab (leaving
  // this one would trip the unsaved-changes warning and lose memory-only
  // changes). This tab checks every 5s whether the login is back, then sends
  // everything that was waiting.
  var loginTimer = null;
  // app.js setStatus() also leaves error messages in the bottom status bar
  // until the next message. Offline ones are stale once we're back: clear them.
  function clearOfflineStatus() {
    ['status-bar', 'toast'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !/offline/i.test(el.textContent || '')) return;
      if (id === 'status-bar') el.style.display = 'none'; else el.classList.remove('show');
    });
  }
  function setLoggedOut(v) {
    if (state.loggedOut === v) return;
    state.loggedOut = v;
    render();
    clearInterval(loginTimer); loginTimer = null;
    if (v) {
      loginTimer = setInterval(function () {
        origFetch('/api/users/me', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
          if (r.ok) setLoggedOut(false);
        }, function () { /* offline: the offline probe handles that */ });
      }, 5000);
    } else if (state.online) {
      retryAll();
    }
  }

  function scheduleProbe() {
    if (probeTimer) return;
    probeTimer = setTimeout(function () {
      probeTimer = null;
      origFetch('/api/users/me', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
        if (r.status >= 502 && r.status <= 504) throw new Error('unavailable');
        goOnline();
      }, function () { throw new Error('offline'); }).catch(function () {
        probeDelay = Math.min(probeDelay * 2, 30000);
        if (!state.online) scheduleProbe();
      });
    }, probeDelay);
  }
  window.addEventListener('offline', function () { goOffline(); });
  window.addEventListener('online', function () {
    clearTimeout(probeTimer); probeTimer = null; probeDelay = 500; scheduleProbe();
  });

  // Send everything that's waiting, one source after another.
  function retryAll() {
    var hadPending = pendingCount() > 0;
    state.saving = hadPending;
    render();
    var chain = Promise.resolve();
    Object.keys(sources).forEach(function (name) {
      var s = sources[name];
      chain = chain.then(function () {
        if (!state.online || !s.retry) return;
        return Promise.resolve().then(s.retry).catch(function (e) { console.warn('retry ' + name + ' failed', e); });
      });
    });
    chain.then(function () {
      state.saving = false;
      if (hadPending && state.online && pendingCount() === 0 && !heldNotices()) {
        flashSaved = true;
        clearTimeout(savedFlashTimer);
        savedFlashTimer = setTimeout(function () { flashSaved = false; render(); }, 4000);
      }
      render();
    });
  }

  // Notices holding changes that aren't on the server (waiting on a choice).
  function heldNotices() {
    return Object.keys(notices).some(function (id) { return notices[id].keep; });
  }
  function pendingCount() {
    var n = 0;
    Object.keys(sources).forEach(function (k) { try { n += sources[k].pending() || 0; } catch (e) { /* ignore */ } });
    return n;
  }

  // ----------------------------------------------------------------- the bar
  var bar = null;
  function ensureBar() {
    if (bar || !document.body) return bar;
    var st = document.createElement('style');
    // Floating panel at the bottom, not a bar across the top: the header
    // (project picker, Save) must stay usable while offline. On phones it
    // sits above the bottom nav (56px).
    st.textContent =
      '#conn-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:100000;display:none;width:min(760px,calc(100vw - 24px));' +
        'font-family:Inter,Geist,system-ui,sans-serif;font-size:13px;line-height:1.4;border-radius:10px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.35)}' +
      '#conn-bar.show{display:block}' +
      '#conn-bar .conn-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;color:#181818;background:#F5F0E8}' +
      '#conn-bar .conn-row + .conn-row{border-top:1px solid #E9DFC8}' +
      '#conn-bar .conn-row.bad{background:#D94B43;color:#fff}' +
      '#conn-bar .conn-row.ok{background:#E9DFC8}' +
      '#conn-bar .conn-msg{flex:1;min-width:200px}' +
      '#conn-bar button{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer}' +
      '#conn-bar .conn-row.bad button{border-color:#fff}' +
      '@media (max-width:768px){#conn-bar{bottom:calc(56px + 10px + env(safe-area-inset-bottom,0px))}#conn-bar .conn-row{padding:9px 12px;font-size:12px}}';
    document.head.appendChild(st);
    bar = document.createElement('div');
    bar.id = 'conn-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-notice]');
      if (!b) return;
      var n = notices[b.getAttribute('data-notice')];
      var a = n && n.actions[Number(b.getAttribute('data-i'))];
      if (a) a.fn();
    });
    return bar;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function row(cls, html, noticeId, actions) {
    var btns = (actions || []).map(function (a, i) {
      return '<button type="button" data-notice="' + esc(noticeId) + '" data-i="' + i + '">' + esc(a.label) + '</button>';
    }).join('');
    return '<div class="conn-row ' + cls + '"><span class="conn-msg">' + html + '</span>' + btns + '</div>';
  }
  function render() {
    if (!ensureBar()) { document.addEventListener('DOMContentLoaded', render, { once: true }); return; }
    var n = pendingCount();
    var rows = [];
    if (!state.online) {
      rows.push(row('bad', n
        ? '<strong>You\'re offline.</strong> Changes aren\'t saved yet. Keep working: Slater saves them as soon as the connection is back.'
        : '<strong>You\'re offline.</strong> Anything you change now is saved as soon as the connection is back.'));
    } else if (state.loggedOut) {
      rows.push(row('bad', '<strong>You\'ve been logged out.</strong> Your changes are kept here. Log in again in a new tab and they\'ll save on their own.', 'login',
        [{ label: 'Log in (new tab)' }]));
      notices.login = { actions: [{ label: 'Log in (new tab)', fn: function () { window.open('/login', '_blank'); } }] };
    } else if (state.saving) {
      rows.push(row('', 'Back online. Saving your changes...'));
    } else if (n) {
      // Online, but a save failed anyway (e.g. a server error): say so, offer a retry.
      rows.push(row('bad', '<strong>Some changes aren\'t saved yet.</strong> They\'re kept on this device.', 'retry', [{ label: 'Try again' }]));
      notices.retry = { actions: [{ label: 'Try again', fn: retryAll }] };
    } else if (flashSaved && !heldNotices()) {
      rows.push(row('ok', 'Back online. All changes saved.'));
    }
    Object.keys(notices).forEach(function (id) {
      if (id === 'login' || id === 'retry') return;
      rows.push(row('', notices[id].html, id, notices[id].actions));
    });
    bar.innerHTML = rows.join('');
    bar.classList.toggle('show', rows.length > 0);
  }

  // Leaving the page with changes that aren't on the server: browser warning.
  window.addEventListener('beforeunload', function (e) {
    if (pendingCount() > 0 || heldNotices()) { e.preventDefault(); e.returnValue = ''; return ''; }
  });

  window.SlaterConn = {
    get online() { return state.online; },
    isOfflineError: isOfflineError,
    addSource: function (name, s) { sources[name] = s; render(); },
    changed: function () { render(); },
    // keep: true = this notice holds changes that aren't on the server (warn before leaving).
    notice: function (id, html, actions, keep) { notices[id] = { html: html, actions: actions || [], keep: !!keep }; render(); },
    clearNotice: function (id) { if (notices[id]) { delete notices[id]; render(); } },
    pendingCount: pendingCount,
    // test hook: run the reconnect path now
    _retryAll: retryAll,
  };
  if (!state.online) scheduleProbe();
  render();
})();
