/* Client Portal, producer controls (V1.5 step 5b).
   The Portal tab (#tab-portal, its own tab since 2026-11-02): turn the portal
   on/off, copy/open the link, make a new link, set/remove a password, post
   updates. Each action saves straight to /api/portal-admin (not part of the
   project autosave). Which URLs the client sees is a checkbox on each URL card
   (app.js, urls[].visible_to_client).
   Client responses (step 5c): when a client presses Approve / Request changes
   on the portal, it shows here (Portal tab panel), as a tag + box on the
   workback item, and as a "Client responses" group at the top of the
   Rundown (all projects, polled every minute). Approving never completes the
   item by itself: "Mark complete" does, then the response is confirmed.
   Client-typed text (name, note) is always escaped.
   Client files (step 6b): "Files from your client" in the panel (and the
   files sent for a workback item in its edit panel). Download goes through
   /api/portal-admin/:key/files/:id/download (a 5-minute R2 link); files are
   deleted 14 days after they arrive. Filenames are client-typed: escaped.
   Public side: routes/portal.js. Plan: docs/v1.5-client-portal-plan.md */
(function () {
  'use strict';

  var root = null;
  var state = null;       // last status from the server, for the open project
  var forKey = null;      // which project `state` belongs to
  var busy = false;
  var showPw = false;     // password form open
  var draft = '';         // unposted update text, survives re-renders
  var pendingAll = [];    // unconfirmed responses across all projects (Rundown)
  var pendingSig = '';
  var lastPoll = 0;
  var selectAfterLoad = null; // { key, uuid } from the Rundown's Open link

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

  // ── client responses ──────────────────────────────────────────────────────
  function wbIdForUuid(uuid) {
    try {
      for (var i = 0; i < wbItems.length; i++) {
        var d = _wbData[wbItems[i]];
        if (d && d.uuid === uuid) return wbItems[i];
      }
    } catch (e) {}
    return null;
  }
  function openResponses() {
    return (state && forKey === key() && !state.error && state.responses) ? state.responses : [];
  }
  function responseFor(uuid) {
    var list = openResponses();
    for (var i = 0; i < list.length; i++) if (list[i].wb_item_uuid === uuid) return list[i];
    return null;
  }
  function kindLabel(k) { return k === 'approved' ? 'Client approved' : 'Changes requested'; }

  // One response as HTML. where: 'panel' | 'item'. Client text escaped.
  function responseHtml(r, where) {
    var wid = wbIdForUuid(r.wb_item_uuid);
    var d = wid ? _wbData[wid] : null;
    var done = d && d.status === 'Complete';
    var h = '<div class="pa-resp ' + (r.kind === 'approved' ? 'ok' : 'chg') + '">';
    h += '<div class="pa-resp-head"><span class="pa-resp-kind">' + kindLabel(r.kind) + '</span>';
    if (where === 'panel') h += '<span class="pa-resp-item">' + (d ? esc(d.item || '(untitled)') : '<em>Item no longer in the workback</em>') + '</span>';
    h += '</div>';
    h += '<div class="pa-resp-meta">' + esc(r.responder_name || 'Client') + ' &middot; ' + esc(when(r.created_at)) + '</div>';
    if (r.note) h += '<div class="pa-resp-note">' + esc(r.note) + '</div>';
    h += '<div class="pa-resp-btns">';
    if (r.kind === 'approved' && d && !done) {
      h += '<button class="lb primary" data-pa-resp="confirm" data-id="' + r.id + '">Mark complete</button>';
      h += '<button class="lb" data-pa-resp="dismiss" data-id="' + r.id + '">Dismiss</button>';
    } else {
      h += '<button class="lb" data-pa-resp="dismiss" data-id="' + r.id + '">' + (r.kind === 'approved' ? 'OK' : 'Got it') + '</button>';
    }
    if (where === 'panel' && wid) h += '<button class="lb" data-pa-resp="show" data-uuid="' + esc(r.wb_item_uuid) + '">Show in workback</button>';
    h += '</div></div>';
    return h;
  }

  function responsesBlock() {
    var list = openResponses();
    if (!list.length) return '';
    return '<div class="pa-block pa-resps"><div class="pa-label">Client responses (' + list.length + ')</div>' +
      list.map(function (r) { return responseHtml(r, 'panel'); }).join('') + '</div>';
  }

  // ── client files ──────────────────────────────────────────────────────────
  function openFiles() {
    return (state && forKey === key() && !state.error && state.files) ? state.files : [];
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' bytes';
    var u = ['KB', 'MB', 'GB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + u[i];
  }
  // "Deletes in N days", from expires_at, rounded up (a new file says 14).
  // Soon = 2 days or less (shown in red).
  function leftText(expires) {
    var ms = new Date(expires).getTime() - Date.now();
    if (ms < 864e5) return { text: 'Deletes within a day', soon: true };
    var days = Math.ceil(ms / 864e5);
    return { text: 'Deletes in ' + days + (days === 1 ? ' day' : ' days'), soon: days <= 2 };
  }
  function downloadUrl(f) {
    return '/api/portal-admin/' + encodeURIComponent(key()) + '/files/' + encodeURIComponent(f.id) + '/download';
  }
  // One file as HTML. where: 'panel' | 'item'. Client text escaped.
  function fileHtml(f, where) {
    var left = leftText(f.expires_at);
    var wid = f.wb_item_uuid ? wbIdForUuid(f.wb_item_uuid) : null;
    var itemName = wid && _wbData[wid] ? (_wbData[wid].item || '(untitled)') : '';
    var dis = busy ? ' disabled' : '';
    return '<div class="pa-file">' +
      '<div class="pa-file-head"><span class="pa-file-name">' + esc(f.filename) + '</span>' +
        (f.downloaded_at
          ? '<span class="pa-file-tag done" title="First downloaded ' + esc(when(f.downloaded_at)) + '">Downloaded' + (f.downloaded_by ? ' by ' + esc(f.downloaded_by) : '') + '</span>'
          : '<span class="pa-file-tag new">New</span>') +
      '</div>' +
      '<div class="pa-file-meta">' + esc(fmtSize(f.size_bytes)) + ' &middot; ' + esc(f.uploaded_by_name || 'Client') + ' &middot; ' + esc(when(f.ready_at)) +
        ' &middot; <span class="pa-file-left' + (left.soon ? ' soon' : '') + '">' + left.text + '</span></div>' +
      (where === 'panel' && itemName ? '<div class="pa-file-meta">For &ldquo;' + esc(itemName) + '&rdquo;</div>' : '') +
      '<div class="pa-file-btns">' +
        '<a class="lb primary" href="' + esc(downloadUrl(f)) + '" data-pa-file="download" data-id="' + f.id + '">Download</a>' +
        '<button class="lb danger" data-pa-file="delete" data-id="' + f.id + '"' + dis + '>Delete</button>' +
        (where === 'panel' && wid ? '<button class="lb" data-pa-resp="show" data-uuid="' + esc(f.wb_item_uuid) + '">Show in workback</button>' : '') +
      '</div></div>';
  }
  function filesBlock() {
    var list = openFiles();
    if (!list.length) return '';
    return '<div class="pa-block pa-files"><div class="pa-label">Files from your client (' + list.length + ')</div>' +
      '<p class="pa-note pa-small">Download what you need: each file is deleted 14 days after it arrives.</p>' +
      list.map(function (f) { return fileHtml(f, 'panel'); }).join('') + '</div>';
  }
  // ── email recipients ─────────────────────────────────────────────────────
  // Key Personnel cards with an email, read live from the form (gather() in
  // app.js), so a new card or a changed address shows without a reload.
  function kpWithEmail() {
    var out = [], seen = {};
    var own = String(state && state.owner_email || '').toLowerCase();
    try {
      (gather().kp_cards || []).forEach(function (k) {
        var e = String(k.email || '').trim().toLowerCase();
        if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e) || seen[e] || e === own) return;
        seen[e] = true;
        out.push({ email: e, name: String(k.name || '').trim(), role: String(k.role || '').trim() });
      });
    } catch (e) {}
    return out;
  }
  function emailsBlock() {
    var dis = busy ? ' disabled' : '';
    var picked = (state.recipients || []);
    var kps = kpWithEmail();
    var h = '<div class="pa-block pa-emails"><div class="pa-label">Emails</div>' +
      '<p class="pa-note pa-small">When your client sends files, approves, or asks for changes, Slater emails a summary with download links. ' +
      'Several at once come as one email, about 10 minutes after the last.</p>' +
      '<label class="pa-rcpt"><input type="checkbox" checked disabled> You <span class="pa-rcpt-sub">' + esc(state.owner_email || '') + ' &middot; always</span></label>';
    kps.forEach(function (k) {
      h += '<label class="pa-rcpt"><input type="checkbox" data-pa-rcpt="' + esc(k.email) + '"' + (picked.indexOf(k.email) > -1 ? ' checked' : '') + dis + '> ' +
        esc(k.name || k.email) + ' <span class="pa-rcpt-sub">' + esc([k.role, k.email].filter(Boolean).join(' · ')) + '</span></label>';
    });
    if (!kps.length) h += '<p class="pa-note pa-small">To include your producer or others, add them with an email under Key Personnel on the Project tab.</p>';
    return h + '</div>';
  }
  function saveRecipients() {
    var emails = [];
    root.querySelectorAll('[data-pa-rcpt]').forEach(function (b) { if (b.checked) emails.push(b.getAttribute('data-pa-rcpt')); });
    return act('PUT', '/recipients', { emails: emails }, 'Email list saved.');
  }

  function deleteFile(id) {
    var f = openFiles().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!f) return;
    showModal('Delete file', 'Delete "' + f.filename + '" now? It can\'t be brought back, and your client would need to send it again.', function () {
      act('DELETE', '/files/' + encodeURIComponent(id), undefined, 'File deleted.').then(refreshWorkback);
    });
  }
  // Download: the link itself saves the file (the browser stays here); then
  // re-read the status so the file shows as Downloaded.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pa-file]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-pa-file');
    if (a === 'download') setTimeout(function () { if (!showPw) load(); }, 1500);
    else if (a === 'delete') deleteFile(b.getAttribute('data-id'));
  });

  function refreshWorkback() {
    try {
      if (typeof wbRender === 'function') wbRender();
      if (typeof _wbSelectedId !== 'undefined' && _wbSelectedId && typeof wbRenderEditPanel === 'function') wbRenderEditPanel(_wbSelectedId);
    } catch (e) {}
  }
  function refreshRundown() {
    try { if (typeof sidebarOpen !== 'undefined' && sidebarOpen && dailyTab === 'pending') refreshSidebar(); } catch (e) {}
  }

  async function ackResponse(id, completeItem) {
    var r = openResponses().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    if (completeItem) {
      var wid = wbIdForUuid(r.wb_item_uuid);
      if (wid && _wbData[wid]) {
        _wbData[wid].status = 'Complete';
        try { wbRefreshDates(); wbUpdateStats(); } catch (e) {}
        if (typeof autosaveNow === 'function') autosaveNow();
      }
    }
    var j = await act('POST', '/responses/' + encodeURIComponent(id) + '/ack', undefined, completeItem ? 'Marked complete.' : null);
    if (j && !j.error) {
      pendingAll = pendingAll.filter(function (x) { return String(x.id) !== String(id); });
      pendingSig = sig(pendingAll);
    }
    refreshWorkback();
    refreshRundown();
  }

  // The workback tag, clicked: a confirm box (table view has no edit panel).
  // showModal puts text in with textContent, so client text stays text.
  function reviewPrompt(uuid) {
    var r = responseFor(uuid);
    if (!r) return;
    var wid = wbIdForUuid(uuid);
    var d = wid ? _wbData[wid] : null;
    var item = d ? (d.item || '(untitled)') : 'this item';
    var who = r.responder_name || 'Your client';
    var canComplete = r.kind === 'approved' && d && d.status !== 'Complete';
    var msg = (r.kind === 'approved' ? who + ' approved "' + item + '"' : who + ' asked for changes to "' + item + '"') +
      ' (' + when(r.created_at) + ').' + (r.note ? '\n\n"' + r.note + '"' : '') +
      (canComplete ? '\n\nMark the item complete?' : '');
    showModal(kindLabel(r.kind), msg, function () { ackResponse(r.id, canComplete); });
    var ok = document.getElementById('modal-ok');
    if (ok) ok.textContent = canComplete ? 'Mark complete' : 'Got it';
    var cancel = document.querySelector('.modal-btns .lb:first-child');
    if (cancel) cancel.textContent = canComplete ? 'Not yet' : 'Close';
  }

  function showInWorkback(uuid) {
    var wid = wbIdForUuid(uuid);
    if (!wid) return;
    st('workback');
    setTimeout(function () { try { wbSelectItem(wid); } catch (e) {} }, 50);
  }

  // Delegated so the buttons work in the panel, the workback edit panel and the Rundown.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pa-resp]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-pa-resp');
    if (a === 'confirm') ackResponse(b.getAttribute('data-id'), true);
    else if (a === 'dismiss') ackResponse(b.getAttribute('data-id'), false);
    else if (a === 'show') showInWorkback(b.getAttribute('data-uuid'));
    else if (a === 'badge') { e.stopPropagation(); reviewPrompt(b.getAttribute('data-uuid')); }
    else if (a === 'open') openFromRundown(b.getAttribute('data-key'), b.getAttribute('data-uuid'));
  });

  // ── Portal menu count ─────────────────────────────────────────────────────
  // On the Portal menu item: client responses not yet dealt with + files not
  // yet downloaded, for the open project. Same look as the booking-conflict
  // counts (booking-conflicts.js).
  function updateNavBadge() {
    var resp = openResponses().length;
    var fresh = openFiles().filter(function (f) { return !f.downloaded_at; }).length;
    var n = resp + fresh;
    document.querySelectorAll('.app-nav-item[data-tab="portal"]').forEach(function (btn) {
      var badge = btn.querySelector('.pa-nav-badge');
      if (!n) { if (badge) badge.parentNode.removeChild(badge); return; }
      if (!badge) { badge = document.createElement('span'); btn.appendChild(badge); }
      badge.className = 'bc-nav-badge bc-red pa-nav-badge';
      badge.textContent = n;
      badge.title = [resp ? resp + (resp === 1 ? ' client response' : ' client responses') : '',
                     fresh ? fresh + (fresh === 1 ? ' new file' : ' new files') : ''].filter(Boolean).join(', ');
    });
  }

  // New files don't come with the cross-project response poll, so the poll
  // also re-reads the open project's portal (quietly; skipped while a
  // password is being typed or an action is running).
  function panelSig() {
    return openFiles().map(function (f) { return f.id + (f.downloaded_at ? 'd' : ''); }).join(',') + '|' + sig(openResponses());
  }
  async function refreshFiles() {
    var k = key();
    if (!k || busy || showPw || !state || forKey !== k || state.error) return;
    var before = panelSig();
    var j = await call('GET', '');
    if (!j || j.error || k !== key()) return;
    if (panelSig() !== before) { render(); refreshWorkback(); }
  }

  // ── all projects (Rundown) ────────────────────────────────────────────────
  function sig(list) { return list.map(function (r) { return r.id; }).join(','); }

  async function pollAll(force) {
    if (!force && Date.now() - lastPoll < 30000) return;
    lastPoll = Date.now();
    var list;
    try {
      var r = await fetch('/api/portal-admin/responses/pending', { cache: 'no-store' });
      if (!r.ok) return;
      list = await r.json();
    } catch (e) { return; }
    if (!Array.isArray(list)) return;
    await refreshFiles();
    var s2 = sig(list);
    var changed = s2 !== pendingSig;
    pendingAll = list; pendingSig = s2;
    if (!changed) return;
    // The open project got a new response: reload its panel + workback tags.
    var k = key();
    if (k && state && forKey === k && !state.error) {
      var mine = sig(list.filter(function (x) { return x.project_key === k; }));
      if (mine !== sig(openResponses())) load();
    }
    refreshRundown();
  }

  function rundownGroup() {
    if (!pendingAll.length) return null;
    var sec = document.createElement('div');
    sec.className = 'daily-section pa-rundown';
    var h = '<div class="daily-section-title client-resp">Client responses (' + pendingAll.length + ')</div>';
    pendingAll.forEach(function (r) {
      var gone = !r.item;
      h += '<div class="daily-item"><div class="daily-item-body">' +
        '<div class="daily-item-name">' + (gone ? '<em>Removed item</em>' : esc(r.item)) + '</div>' +
        '<div class="pa-rd-kind ' + (r.kind === 'approved' ? 'ok' : 'chg') + '">' + kindLabel(r.kind) + ' &middot; ' + esc(r.responder_name || 'Client') + '</div>' +
        (r.note ? '<div class="pa-rd-note">' + esc(r.note) + '</div>' : '') +
        '<div class="daily-item-meta">' + esc(r.project_title || '') + '</div>' +
        '<div class="daily-item-meta"><span class="daily-item-link" data-pa-resp="open" data-key="' + esc(r.project_key) + '" data-uuid="' + esc(r.wb_item_uuid) + '">Open project &rarr;</span></div>' +
        '</div></div>';
    });
    sec.innerHTML = h;
    return sec;
  }

  function openFromRundown(projectKey, uuid) {
    if (projectKey === key()) { showInWorkback(uuid); return; }
    selectAfterLoad = { key: projectKey, uuid: uuid };
    var r = pendingAll.filter(function (x) { return x.project_key === projectKey && x.wb_item_uuid === uuid; })[0];
    openSheetFromSidebar(projectKey, r ? r.item : '');
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
  // Every redraw also refreshes the Portal menu count.
  function render() {
    renderPanel();
    updateNavBadge();
  }
  function renderPanel() {
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
        (state.updates.length ? '<p class="pa-note pa-small">Your ' + state.updates.length + ' earlier update' + (state.updates.length === 1 ? ' is' : 's are') + ' kept and will show again.</p>' : '') +
        responsesBlock() + filesBlock();
      return;
    }
    var n = sharedLinkCount();
    var h = '';
    h += '<div class="pa-row pa-on"><span class="pa-dot"></span> Portal is on. Anyone with this link' + (state.has_password ? ' and the password' : '') + ' can see it.</div>';
    h += '<div class="pa-link-row"><input type="text" id="pa-link" class="pa-link" readonly value="' + esc(link()) + '">' +
      '<button class="lb" data-pa="copy"' + dis + '>Copy link</button>' +
      '<button class="lb" data-pa="open"' + dis + '>Open</button></div>';
    h += responsesBlock();
    h += filesBlock();
    h += emailsBlock();

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
    refreshWorkback();
    if (selectAfterLoad && selectAfterLoad.key === k) {
      var u = selectAfterLoad.uuid; selectAfterLoad = null;
      setTimeout(function () { showInWorkback(u); }, 250);
    }
  }

  function init() {
    root = document.getElementById('portal-admin');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('change', function (e) { if (e.target.hasAttribute('data-pa-rcpt')) saveRecipients(); });
    // Key Personnel edited: refresh the Emails list (names, addresses).
    document.addEventListener('change', function (e) {
      if (e.target && /^kp_\d+_/.test(e.target.id || '') && state && state.enabled && forKey === key()) render();
    });
    root.addEventListener('input', function (e) { if (e.target.id === 'pa-update') draft = e.target.value; });
    root.addEventListener('keydown', function (e) {
      if (e.target.id === 'pa-pw' && e.key === 'Enter') { e.preventDefault(); var s = root.querySelector('[data-pa="pw-save"]'); if (s) s.click(); }
    });
    load();
    pollAll(true);
    setInterval(function () { if (!document.hidden) pollAll(); }, 60000);
  }

  window.PortalAdmin = {
    onProjectLoaded: function () { load(); },
    // URL checkbox ticked/unticked: refresh the shared count.
    urlsChanged: function () { if (state && state.enabled && forKey === key()) render(); },
    // Workback list/table: tag for an item with an unconfirmed client response.
    badgeHtml: function (uuid) {
      var r = uuid && responseFor(uuid);
      return r ? '<button type="button" class="pa-badge ' + (r.kind === 'approved' ? 'ok' : 'chg') + '" data-pa-resp="badge" data-uuid="' + esc(uuid) + '" title="Client response: click to review">' + kindLabel(r.kind) + '</button>' : '';
    },
    // Workback edit panel: the response box with its buttons.
    // Workback edit panel: the response box with its buttons, then any files
    // the client sent for this item.
    editPanelHtml: function (uuid) {
      var r = uuid && responseFor(uuid);
      var files = uuid ? openFiles().filter(function (f) { return f.wb_item_uuid === uuid; }) : [];
      return (r ? '<div class="ep-sec">' + responseHtml(r, 'item') + '</div>' : '') +
        (files.length ? '<div class="ep-sec pa-files"><div class="pa-label">Files from your client (' + files.length + ')</div>' +
          files.map(function (f) { return fileHtml(f, 'item'); }).join('') + '</div>' : '');
    },
    // Rundown Pending tab: the cross-project group (or null), and a nudge to re-check.
    rundownGroup: rundownGroup,
    poll: function (force) { pollAll(!!force); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
