/* Client Portal, producer controls (V1.5 step 5b).
   A "Client portal" section at the bottom of the Project tab: turn the portal
   on/off, copy/open the link, make a new link, set/remove a password, post
   updates. Each action saves straight to /api/portal-admin (not part of the
   project autosave). Which URLs the client sees is a checkbox on each URL card
   (app.js, urls[].visible_to_client).
   Public side: routes/portal.js. Plan: docs/v1.5-client-portal-plan.md */
(function () {
  'use strict';

  var root = null;
  var state = null;       // last status from the server, for the open project
  var forKey = null;      // which project `state` belongs to
  var busy = false;
  var showPw = false;     // password form open
  var draft = '';         // unposted update text, survives re-renders

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function when(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function link() { return state && state.token ? window.location.origin + '/portal/' + state.token : ''; }
  function key() { return (typeof currentSheetKey !== 'undefined') ? currentSheetKey : null; }
  function toast(m, t) { if (typeof setStatus === 'function') setStatus(m, t || 'ok'); }
  function sharedLinkCount() {
    try { return getUrls().filter(function (u) { return u.visible_to_client === true; }).length; }
    catch (e) { return 0; }
  }

  async function call(method, path, body) {
    var k = key();
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var r;
    try { r = await fetch('/api/portal-admin/' + encodeURIComponent(k) + (path || ''), opts); }
    catch (e) { return { error: 'offline' }; }
    var j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) return { error: (j && j.error) || ('http_' + r.status), status: r.status };
    if (k === key()) { state = j; forKey = k; }
    return j;
  }

  async function act(method, path, body, okMsg) {
    if (busy) return null;
    busy = true; render();
    var j = await call(method, path, body);
    busy = false;
    if (j && j.error) {
      var msg = j.error === 'offline' ? "Couldn't reach Slater. Check your connection and try again."
        : j.error === 'bad_password' ? 'Password needs at least 6 characters.'
        : j.error === 'not_found' ? 'Save this project first, then try again.'
        : "That didn't work. Please try again.";
      toast(msg, 'err');
    } else if (okMsg) toast(okMsg, 'ok');
    render();
    return j;
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function render() {
    if (!root) return;
    var k = key();
    if (!k) {
      root.innerHTML = '<p class="pa-note">Save this project first, then you can turn on a client portal for it.</p>';
      return;
    }
    if (!state || forKey !== k) {
      root.innerHTML = '<p class="pa-note">Loading...</p>';
      return;
    }
    if (state.error) {
      root.innerHTML = '<p class="pa-note">' + (state.error === 'not_found'
        ? 'This project hasn\'t reached the server yet. It will once it saves; then reopen the project.'
        : 'Couldn\'t load the portal settings. <button class="lb" data-pa="retry">Try again</button>') + '</p>';
      return;
    }
    var dis = busy ? ' disabled' : '';
    if (!state.enabled) {
      root.innerHTML =
        '<p class="pa-note">Give your client a private page for this project: key dates, items waiting on them, your updates, and any links you choose to share. Crew, talent, call times, expenses, notes and internal-only items are never shown.</p>' +
        '<button class="lb primary" data-pa="enable"' + dis + '>Turn on client portal</button>' +
        (state.updates.length ? '<p class="pa-note pa-small">Your ' + state.updates.length + ' earlier update' + (state.updates.length === 1 ? ' is' : 's are') + ' kept and will show again.</p>' : '');
      return;
    }
    var n = sharedLinkCount();
    var h = '';
    h += '<div class="pa-row pa-on"><span class="pa-dot"></span> Portal is on. Anyone with this link' + (state.has_password ? ' and the password' : '') + ' can see it.</div>';
    h += '<div class="pa-link-row"><input type="text" id="pa-link" class="pa-link" readonly value="' + esc(link()) + '">' +
      '<button class="lb" data-pa="copy"' + dis + '>Copy link</button>' +
      '<button class="lb" data-pa="open"' + dis + '>Open</button></div>';

    // Password
    h += '<div class="pa-block"><div class="pa-label">Password</div>';
    if (showPw) {
      h += '<div class="pa-link-row"><input type="password" id="pa-pw" class="pa-link" placeholder="At least 6 characters" autocomplete="new-password" maxlength="200">' +
        '<button class="lb primary" data-pa="pw-save"' + dis + '>Save</button>' +
        '<button class="lb" data-pa="pw-cancel"' + dis + '>Cancel</button></div>' +
        '<p class="pa-note pa-small">Send it to your client separately from the link.' + (state.has_password ? ' Changing it signs out anyone already viewing.' : '') + '</p>';
    } else if (state.has_password) {
      h += '<div class="pa-row">On. Your client enters it once per browser (remembered 30 days). ' +
        '<button class="lb" data-pa="pw-open"' + dis + '>Change</button> <button class="lb danger" data-pa="pw-remove"' + dis + '>Remove</button></div>';
    } else {
      h += '<div class="pa-row">None. The link alone opens the portal. <button class="lb" data-pa="pw-open"' + dis + '>Set a password</button></div>';
    }
    h += '</div>';

    // Shared links
    h += '<div class="pa-block"><div class="pa-label">Links</div><div class="pa-row">' +
      (n ? n + ' link' + (n === 1 ? '' : 's') + ' shared.' : 'No links shared.') +
      ' Tick "Show on client portal" on a card in the URLs tab to share it. <button class="lb" data-pa="urls">Go to URLs</button></div></div>';

    // Updates
    h += '<div class="pa-block"><div class="pa-label">Updates</div>' +
      '<textarea id="pa-update" class="pa-text" rows="3" maxlength="10000" placeholder="Write an update for your client. The newest one shows at the top of the portal.">' + esc(draft) + '</textarea>' +
      '<div class="pa-actions"><button class="lb primary" data-pa="post"' + dis + '>Post update</button></div>';
    if (state.updates.length) {
      h += '<div class="pa-updates">' + state.updates.map(function (u, i) {
        return '<div class="pa-update">' +
          '<div class="pa-update-head"><span>' + esc(u.author_name) + ' &middot; ' + esc(when(u.created_at)) + (i >= 10 ? ' &middot; <em>not shown (portal shows the latest 10)</em>' : '') + '</span>' +
          '<button class="rb" title="Delete update" data-pa="del-update" data-id="' + u.id + '"' + dis + '>&#x2715;</button></div>' +
          '<div class="pa-update-body">' + esc(u.body) + '</div></div>';
      }).join('') + '</div>';
    }
    h += '</div>';

    // Link management
    h += '<div class="pa-block pa-danger-zone">' +
      '<button class="lb" data-pa="regen"' + dis + '>Make a new link</button>' +
      '<button class="lb danger" data-pa="disable"' + dis + '>Turn off portal</button></div>';

    root.innerHTML = h;
  }

  // ── actions ───────────────────────────────────────────────────────────────
  function onClick(e) {
    var b = e.target.closest('[data-pa]');
    if (!b || !root.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-pa');
    if (a === 'retry') return load();
    if (a === 'enable') return act('POST', '/enable', undefined, 'Client portal is on.');
    if (a === 'copy') {
      var url = link();
      var done = function () { toast('Portal link copied.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { selectLink(); });
      } else selectLink();
      return;
    }
    if (a === 'open') { window.open(link(), '_blank', 'noopener,noreferrer'); return; }
    if (a === 'pw-open') { showPw = true; render(); var pw = document.getElementById('pa-pw'); if (pw) pw.focus(); return; }
    if (a === 'pw-cancel') { showPw = false; render(); return; }
    if (a === 'pw-save') {
      var v = (document.getElementById('pa-pw') || {}).value || '';
      if (v.length < 6) { toast('Password needs at least 6 characters.', 'err'); return; }
      return act('PUT', '/password', { password: v }, 'Portal password saved.').then(function (j) {
        if (j && !j.error) { showPw = false; render(); }
      });
    }
    if (a === 'pw-remove') {
      return showModal('Remove password', 'Remove the portal password? Anyone with the link will be able to open the portal.', function () {
        act('PUT', '/password', { password: null }, 'Portal password removed.');
      });
    }
    if (a === 'urls') { st('urls'); return; }
    if (a === 'post') {
      var ta = document.getElementById('pa-update');
      var body = ta ? ta.value.trim() : '';
      if (!body) { toast('Write something first.', 'err'); return; }
      return act('POST', '/updates', { body: body }, 'Update posted.').then(function (j) {
        if (j && !j.error) { draft = ''; render(); }
      });
    }
    if (a === 'del-update') {
      var id = b.getAttribute('data-id');
      return showModal('Delete update', 'Delete this update? Your client will no longer see it.', function () {
        act('DELETE', '/updates/' + encodeURIComponent(id), undefined, 'Update deleted.');
      });
    }
    if (a === 'regen') {
      return showModal('Make a new link', 'The current link will stop working right away. You will need to send your client the new one.', function () {
        act('POST', '/regenerate', undefined, 'New portal link made. Send it to your client.');
      });
    }
    if (a === 'disable') {
      return showModal('Turn off client portal', 'The link will stop working right away. Your posted updates are kept, but turning the portal back on makes a new link.', function () {
        act('DELETE', '', undefined, 'Client portal is off.');
      });
    }
  }

  function selectLink() {
    var i = document.getElementById('pa-link');
    if (i) { i.focus(); i.select(); }
    toast('Press Cmd+C to copy the link.', 'ok');
  }

  async function load() {
    var k = key();
    showPw = false;
    if (forKey !== k) draft = '';
    if (!k) { state = null; forKey = null; render(); return; }
    if (forKey !== k) { state = null; forKey = k; }
    render();
    var j = await call('GET', '');
    if (k !== key()) return; // switched projects meanwhile
    if (j && j.error) { state = j; forKey = k; }
    render();
  }

  function init() {
    root = document.getElementById('portal-admin');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('input', function (e) { if (e.target.id === 'pa-update') draft = e.target.value; });
    root.addEventListener('keydown', function (e) {
      if (e.target.id === 'pa-pw' && e.key === 'Enter') { e.preventDefault(); var s = root.querySelector('[data-pa="pw-save"]'); if (s) s.click(); }
    });
    load();
  }

  window.PortalAdmin = {
    onProjectLoaded: function () { load(); },
    // URL checkbox ticked/unticked: refresh the shared count.
    urlsChanged: function () { if (state && state.enabled && forKey === key()) render(); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
