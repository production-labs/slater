/* Client Portal page (V1.5). Public: reached by /portal/<token>.
   Everything from the server is put on the page as text (textContent /
   attributes via el()), never as HTML. External links open without a
   referrer, so the portal link never leaks to the sites they point at.
   Server side: routes/portal.js. */
(function () {
  'use strict';

  var token = (location.pathname.split('/')[2] || '');
  var API = '/api/portal/' + encodeURIComponent(token);
  var app = document.getElementById('app');
  var tip = document.getElementById('tip');
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── helpers ──────────────────────────────────────────────────────────────
  // el('div', { class: 'x', href: '...' }, child, 'text', [more]) -> element
  function el(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
      if (k === 'class') n.className = attrs[k];
      else if (k === 'style') n.style.cssText = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) add(n, arguments[i]);
    return n;
  }
  function add(n, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(n, x); }); return; }
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function ext(href, attrs) {
    return Object.assign({ href: href, target: '_blank', rel: 'noopener noreferrer' }, attrs || {});
  }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function todayIso() { return isoOf(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return isoOf(d); }
  function fmt(s) { var d = parse(s); return MON[d.getMonth()] + ' ' + d.getDate(); }
  function fmtY(s) { return fmt(s) + ', ' + parse(s).getFullYear(); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }
  function ago(ts) {
    var mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (!(mins >= 0)) return '';
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' minutes ago';
    var h = Math.round(mins / 60);
    if (h < 24) return h + (h === 1 ? ' hour' : ' hours') + ' ago';
    var d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function when(ts) {
    var d = new Date(ts);
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function screen(title, text) {
    app.textContent = '';
    add(app, el('div', { class: 'pt-status' }, el('h1', null, title), el('p', null, text)));
  }

  // ── load ─────────────────────────────────────────────────────────────────
  function load() {
    fetch(API, { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 404) return screen('This link isn\'t active', 'Ask your producer for a new link.');
      if (r.status === 401) return lockScreen();
      if (r.status === 429) return screen('Too many requests', 'Please wait a few minutes and try again.');
      if (!r.ok) return screen('Something went wrong', 'Please try again in a moment.');
      return r.json().then(render);
    }).catch(function () { screen('Can\'t connect', 'Check your connection and try again.'); });
  }

  function lockScreen() {
    app.textContent = '';
    document.title = 'Project portal';
    var input = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' });
    var err = el('div', { class: 'err', role: 'alert' });
    var btn = el('button', { type: 'submit' }, 'View project');
    var form = el('form', { class: 'pt-lock', onsubmit: function (e) {
      e.preventDefault();
      if (!input.value) return;
      btn.disabled = true; err.textContent = '';
      fetch(API + '/unlock', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      }).then(function (r) {
        btn.disabled = false;
        if (r.ok) return load();
        if (r.status === 429) err.textContent = 'Too many tries. Please wait 15 minutes.';
        else if (r.status === 404) return load();
        else { err.textContent = 'That password isn\'t right.'; input.select(); }
      }).catch(function () { btn.disabled = false; err.textContent = 'Can\'t connect. Try again.'; });
    } },
      el('h1', null, 'Project portal'),
      el('p', null, 'Enter the password your producer gave you.'),
      input, err, btn);
    add(app, form);
    input.focus();
  }

  // ── render ───────────────────────────────────────────────────────────────
  function render(d) {
    var today = todayIso();
    document.title = d.project.title + (d.client.name ? ' | ' + d.client.name : '');
    app.textContent = '';
    add(app, masthead(d));
    var uploader = d.uploads && d.uploads.enabled ? makeUploader(d) : null;
    if (d.waiting.length) add(app, waitingBand(d.waiting, today, uploader));

    var body = el('div', { class: 'wrap' });
    if (d.timeline.length) add(body, timelineSection(d.timeline, today));
    var side = sideCards(d);
    if (d.schedule.length || side.length) {
      add(body, el('section', null, el('div', { class: 'cols' },
        el('div', null,
          el('div', { class: 'sec-head' }, el('div', { class: 'sec-title' }, 'What happens when')),
          d.schedule.length ? scheduleList(d.schedule, today) : el('div', { class: 'deliv' }, el('div', { class: 'deliv-txt' }, 'Dates coming soon'))),
        el('div', null, side))));
    }
    if (d.updates.length) add(body, updatesSection(d));
    var files = filesSection(d, uploader);
    if (files) add(body, files);
    add(body, el('section', null,
      el('div', { class: 'sec-head' },
        el('div', { class: 'sec-title' }, 'Deliverables'),
        d.key_date ? el('div', { class: 'sec-aside' }, 'Expected ' + fmt(d.key_date)) : null),
      el('div', { class: 'deliv' }, el('div', { class: 'deliv-txt' }, 'Your producer will share final files through a link on this page'))));
    add(app, body);

    add(app, el('footer', null, el('div', { class: 'wrap' }, el('div', { class: 'foot-txt' },
      [d.client.name ? 'Project portal for ' + d.client.name : 'Project portal',
       d.producer.name ? 'Produced by ' + d.producer.name : null,
       'Powered by Slater'].filter(Boolean).join('  ·  ')))));
  }

  function masthead(d) {
    var logo = d.client.logo
      ? el('div', { class: 'brand-logo img' }, el('img', { src: d.client.logo, alt: d.client.name || '' }))
      : el('div', { class: 'brand-logo' }, initials(d.client.name || d.project.title) || '?');
    return el('div', { class: 'masthead' }, el('div', { class: 'wrap' }, el('div', { class: 'masthead-inner' },
      el('div', { class: 'brand' }, logo, el('div', { class: 'brand-text' },
        d.client.name ? el('div', { class: 'brand-client' }, d.client.name) : null,
        el('div', { class: 'brand-project' }, d.project.title))),
      el('div', { class: 'masthead-meta' },
        d.producer.name ? el('div', { class: 'masthead-by' }, 'Produced by ', el('strong', null, d.producer.name)) : null,
        d.project.updated_at ? el('div', { class: 'masthead-updated' }, 'Updated ' + ago(d.project.updated_at)) : null))));
  }

  function dueLabel(due, today) {
    var n = daysBetween(today, due);
    if (n < 0) return { text: 'Overdue', cls: '' };
    if (n === 0) return { text: 'Due today', cls: '' };
    if (n === 1) return { text: 'Tomorrow', cls: '' };
    if (n < 7) return { text: 'Due ' + DOW[parse(due).getDay()], cls: '' };
    return { text: fmt(due), cls: 'later' };
  }

  function waitingBand(list, today, uploader) {
    return el('div', { class: 'action-band' }, el('div', { class: 'wrap' }, el('div', { class: 'action-inner' },
      el('div', { class: 'action-head' },
        el('div', { class: 'action-title' }, 'Waiting on you'),
        el('div', { class: 'action-sub' }, list.length + (list.length === 1 ? ' item' : ' items'))),
      el('div', { class: 'action-list' }, list.map(function (w) { return actionRow(w, today, uploader); })))));
  }

  // "You sent N files for this" + a link that sends files tagged to the item.
  // Progress shows in the Send files section, which the page scrolls to.
  function itemFilesLine(w, u) {
    var count = w.files || 0;
    var label = el('span', { class: 'action-files-count' });
    function show() { label.textContent = count ? 'You sent ' + count + (count === 1 ? ' file' : ' files') + ' for this. ' : ''; }
    show();
    u.onItemSent(w.uuid, function () { count++; show(); });
    var picker = el('input', { type: 'file', multiple: 'multiple', class: 'drop-input', 'aria-label': 'Choose files for ' + w.item });
    picker.addEventListener('change', function () {
      if (!picker.files.length) return;
      u.enqueue(picker.files, { uuid: w.uuid, name: w.item });
      picker.value = '';
      u.queue.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    var send = el('button', { type: 'button', class: 'action-link action-send-files', onclick: function () { if (u.askName()) picker.click(); } }, 'Send files for this');
    return el('div', { class: 'action-note action-files' }, label, send, picker);
  }

  // One "Waiting on you" row: Approve / Request changes, or what was sent.
  function actionRow(w, today, uploader) {
    var due = dueLabel(w.due, today);
    var row = el('div', { class: 'action-item' });
    var main = el('div', { class: 'action-row' });
    var formSlot = el('div');
    function closeForm() { formSlot.textContent = ''; btns.style.display = ''; }
    function openForm(kind) {
      btns.style.display = 'none';
      formSlot.textContent = '';
      var f = responseForm(w, kind, closeForm);
      add(formSlot, f);
      f._firstField.focus();
    }
    var btns = el('div', { class: 'action-btns' },
      el('button', { type: 'button', class: 'action-btn primary', onclick: function () { openForm('approved'); } }, 'Approve'),
      el('button', { type: 'button', class: 'action-btn', onclick: function () { openForm('changes_requested'); } }, 'Request changes'));
    var note;
    if (w.response) {
      btns.style.display = 'none';
      note = el('div', { class: 'action-note sent' },
        (w.response.kind === 'approved' ? 'You approved this ' : 'You asked for changes ') + ago(w.response.at) + '. Your producer will confirm. ',
        el('button', { type: 'button', class: 'action-link', onclick: function () { note.remove(); btns.style.display = ''; } }, 'Change your answer'));
    } else {
      note = el('div', { class: 'action-note' }, 'Due ' + fmtY(w.due));
    }
    add(main, [
      el('div', { class: 'action-due ' + due.cls }, due.text),
      el('div', { class: 'action-body' }, el('div', { class: 'action-name' }, w.item),
        (w.links && w.links.length) ? el('div', { class: 'action-links' }, w.links.map(function (l) {
          return el('a', ext(l.url, { class: 'action-review' }), '↗ ' + l.name);
        })) : null,
        note,
        uploader && w.uuid ? itemFilesLine(w, uploader) : null),
      btns]);
    add(row, [main, formSlot]);
    return row;
  }

  function savedName() { try { return localStorage.getItem('slater_portal_name') || ''; } catch (_) { return ''; } }
  function saveName(n) { try { localStorage.setItem('slater_portal_name', n); } catch (_) {} }

  function responseForm(w, kind, onCancel) {
    var approving = kind === 'approved';
    var name = el('input', { type: 'text', maxlength: '200', placeholder: 'Your name', autocomplete: 'name', 'aria-label': 'Your name' });
    name.value = savedName();
    var note = el('textarea', { rows: '3', maxlength: '5000',
      placeholder: approving ? 'Note for your producer (optional)' : 'What needs to change?',
      'aria-label': approving ? 'Note (optional)' : 'What needs to change' });
    var err = el('div', { class: 'err', role: 'alert' });
    var send = el('button', { type: 'submit', class: 'action-btn primary' }, approving ? 'Send approval' : 'Send request');
    var form = el('form', { class: 'action-form', onsubmit: function (e) {
      e.preventDefault();
      var n = name.value.trim(), t = note.value.trim();
      err.textContent = '';
      if (!n) { err.textContent = 'Please add your name.'; name.focus(); return; }
      if (!approving && !t) { err.textContent = 'Please say what needs to change.'; note.focus(); return; }
      send.disabled = true;
      fetch(API + '/respond', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: w.uuid, kind: kind, name: n, note: t }),
      }).then(function (r) {
        send.disabled = false;
        if (r.ok) { saveName(n); return load(); }
        if (r.status === 401 || r.status === 404) return load();
        if (r.status === 409) { err.textContent = 'This item has changed. Reloading...'; setTimeout(load, 1200); return; }
        if (r.status === 429) { err.textContent = 'Too many tries. Please wait a few minutes.'; return; }
        err.textContent = 'That didn\'t send. Please try again.';
      }).catch(function () { send.disabled = false; err.textContent = 'Can\'t connect. Try again.'; });
    } },
      el('div', { class: 'action-form-title' }, approving ? 'Approve "' + w.item + '"' : 'Request changes to "' + w.item + '"'),
      name, note, err,
      el('div', { class: 'action-form-btns' },
        el('button', { type: 'button', class: 'action-btn', onclick: onCancel }, 'Cancel'), send));
    form._firstField = name.value ? note : name;
    return form;
  }

  // Zoom: a window of N weeks starting a few days before today (days before /
  // after today), or the whole project. The client's pick is remembered.
  var TL_RANGES = { '2w': [3, 11], '4w': [5, 23], '6w': [7, 35], 'all': null };
  var TL_CHOICES = [['2w', '2 weeks'], ['4w', '4 weeks'], ['6w', '6 weeks'], ['all', 'Whole project']];
  function tlRange() { try { var r = localStorage.getItem('slater_portal_tl_range'); return r in TL_RANGES ? r : 'all'; } catch (_) { return 'all'; } }
  function setTlRange(r) { try { localStorage.setItem('slater_portal_tl_range', r); } catch (_) {} }

  function timelineSection(nodes, today) {
    var range = tlRange();
    var frame = el('div', { class: 'tl-frame' });
    var aside = el('div', { class: 'sec-aside tl-more' });
    var chips = el('div', { class: 'tl-chips', role: 'group', 'aria-label': 'Timeline zoom' });
    TL_CHOICES.forEach(function (c) {
      add(chips, el('button', { type: 'button', class: 'tl-chip', 'data-range': c[0], onclick: function () {
        range = c[0]; setTlRange(range); draw();
      } }, c[1]));
    });
    var legend = el('div', { class: 'tl-legend' },
      el('div', { class: 'lg' }, el('span', { class: 'lg-dot ms' }), 'Key date'),
      el('div', { class: 'lg' }, el('span', { class: 'lg-dot client' }), 'Needs you'),
      el('div', { class: 'lg' }, el('span', { class: 'lg-dot' }), 'Our work'));

    function draw() {
      chips.querySelectorAll('.tl-chip').forEach(function (b) {
        var on = b.getAttribute('data-range') === range;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var r = TL_RANGES[range], start, end;
      if (r) { start = addDays(today, -r[0]); end = addDays(today, r[1]); }
      else {
        // Whole project: first to last date, always including today.
        var first = nodes[0].date, last = nodes[nodes.length - 1].date;
        start = today < first ? today : first; end = today > last ? today : last;
        if (daysBetween(start, end) < 6) { start = addDays(start, -3); end = addDays(end, 3); }
      }
      var before = nodes.filter(function (n) { return n.date < start; }).length;
      var after = nodes.filter(function (n) { return n.date > end; });
      var shown = nodes.filter(function (n) { return n.date >= start && n.date <= end; });
      aside.textContent = after.length
        ? after.length + (after.length === 1 ? ' more date' : ' more dates') + ' after ' + fmt(end)
        : before ? before + (before === 1 ? ' earlier date' : ' earlier dates') + ' before ' + fmt(start) : '';
      frame.textContent = '';
      add(frame, [drawLine(shown, today, start, end, range), legend]);
    }
    draw();

    return el('section', null,
      el('div', { class: 'sec-head' },
        el('div', { class: 'sec-title' }, 'Project timeline'),
        el('div', { class: 'tl-head-r' }, aside, chips)),
      frame);
  }

  function drawLine(nodes, today, start, end, range) {
    var span = daysBetween(start, end);
    var pct = function (iso) { return daysBetween(start, iso) / span * 100; };
    var tp = pct(today);

    var tl = el('div', { class: 'tl' },
      el('div', { class: 'tl-track tl-track-past', style: 'left:0;width:' + tp + '%' }),
      el('div', { class: 'tl-track tl-track-future', style: 'left:' + tp + '%;right:0' }),
      el('div', { class: 'tl-today', style: 'left:' + tp + '%' }),
      el('div', { class: 'tl-today-flag', style: 'left:' + tp + '%' }, 'TODAY'));

    // Captions alternate above / below and skip when too close to the last
    // caption on the same side. Every node keeps its tooltip.
    var lastCap = { above: -100, below: -100 }, side = 'above';
    nodes.forEach(function (n) {
      var x = pct(n.date);
      var past = n.date < today || n.done;
      var cls = 'tl-node ' + (n.kind === 'milestone' ? 'milestone' : n.kind === 'client' ? 'client' : '') + (past ? ' done' : '');
      var note = n.kind === 'milestone' ? 'Key date' : n.kind === 'client' ? (n.done ? 'Done' : 'Needs you') : 'Our work';
      var node = el('div', { class: cls, style: 'left:' + x + '%', tabindex: '0', 'aria-label': n.label + ', ' + fmt(n.date) + ', ' + note });
      node.addEventListener('mouseenter', function () {
        tip.textContent = '';
        add(tip, [el('b', null, n.label), el('span', null, fmt(n.date) + ' · ' + note)]);
        tip.style.display = 'block';
      });
      node.addEventListener('mousemove', function (e) {
        tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 265) + 'px';
        tip.style.top = (e.clientY - 16) + 'px';
      });
      node.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      add(tl, node);
      if (n.kind === 'ours') return; // our steps: tooltip only, keeps the line readable
      if (x - lastCap[side] < 12) side = side === 'above' ? 'below' : 'above';
      if (x - lastCap[side] < 12) return;
      lastCap[side] = x;
      // Near either end, anchor the caption inward so it stays in the box.
      var edge = x < 8 ? ' edge-l' : x > 92 ? ' edge-r' : '';
      add(tl, el('div', { class: 'tl-cap ' + side + edge, style: 'left:' + x + '%' }, el('strong', null, n.label), fmt(n.date)));
      side = side === 'above' ? 'below' : 'above';
    });
    if (!nodes.length) add(tl, el('div', { class: 'tl-empty' }, 'Nothing scheduled in these weeks'));

    // Dates along the bottom: every 2 days on 2 weeks, weekly on 4 and 6,
    // and whole weeks spaced to fit (at most ~8 labels) on the whole project.
    var axis = el('div', { class: 'tl-axis', 'aria-hidden': 'true' });
    var step = range === '2w' ? 2 : range === 'all' ? 7 * Math.max(1, Math.ceil(span / 7 / 8)) : 7;
    for (var w = start; w <= end; w = addDays(w, step)) {
      add(axis, el('div', { class: 'tl-wk', style: 'left:' + pct(w) + '%' }, fmt(w)));
    }
    return el('div', null, tl, axis);
  }

  function scheduleList(rows, today) {
    return el('div', { class: 'sched' }, rows.map(function (s) {
      var d = parse(s.date);
      var past = (s.end_date || s.date) < today;
      var detail = [s.end_date ? 'Through ' + DOW[parse(s.end_date).getDay()] + ' ' + fmt(s.end_date) : '', s.location, s.time].filter(Boolean).join('  ·  ');
      var tag = s.client_item ? (s.done ? el('div', { class: 'sched-tag done' }, 'Complete') : el('div', { class: 'sched-tag you' }, 'Waiting on you')) : null;
      return el('div', { class: 'sched-row' + (past && !(s.client_item && !s.done) ? ' is-past' : '') },
        el('div', { class: 'sched-date' },
          el('div', { class: 'sched-mon' }, MON[d.getMonth()]),
          el('div', { class: 'sched-day' }, d.getDate()),
          el('div', { class: 'sched-dow' }, DOW[d.getDay()])),
        el('div', { class: 'sched-body' },
          el('div', { class: 'sched-name' }, s.label),
          detail ? el('div', { class: 'sched-detail' }, detail) : null,
          tag));
    }));
  }

  function sideCards(d) {
    var out = [];
    if (d.team.length) {
      out.push(el('div', { class: 'side-team' }, el('div', { class: 'sec-head' }, el('div', { class: 'sec-title' }, 'Your team')),
        el('div', { class: 'card' }, d.team.map(function (p) {
          return el('div', { class: 'person' },
            el('div', { class: 'person-av' }, initials(p.name)),
            el('div', { class: 'person-info' },
              el('div', { class: 'person-name' }, p.name),
              p.role ? el('div', { class: 'person-role' }, p.role) : null,
              (p.email || p.phone) ? el('div', { class: 'person-links' },
                p.email ? el('a', { href: 'mailto:' + p.email }, 'Email') : null,
                p.phone ? el('a', { href: 'tel:' + p.phone.replace(/[^0-9+]/g, '') }, p.phone) : null) : null));
        }))));
    }
    if (d.links.length) {
      out.push(el('div', { class: 'card' }, el('div', { class: 'card-t' }, 'Links'), d.links.map(function (l) {
        var host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch (_) {}
        return el('a', ext(l.url, { class: 'lnk' }),
          el('div', { class: 'lnk-ico' }, '↗'),
          el('div', { class: 'lnk-text' },
            el('div', { class: 'lnk-name' }, l.name),
            el('div', { class: 'lnk-sub' }, l.notes || host)));
      })));
    }
    if (d.venues.length) {
      out.push(el('div', { class: 'card' }, el('div', { class: 'card-t' }, d.venues.length === 1 ? 'Venue' : 'Venues'), d.venues.map(function (v) {
        var q = [v.name, v.address, v.city_line].filter(Boolean).join(', ');
        return el('div', { class: 'venue' },
          el('div', { class: 'venue-name' }, v.name),
          (v.address || v.city_line) ? el('div', { class: 'venue-addr' }, v.address, v.address && v.city_line ? el('br') : null, v.city_line) : null,
          el('a', ext('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), { class: 'venue-map' }), 'Open in Maps'));
      })));
    }
    return out;
  }

  function updatesSection(d) {
    var replyTo = (d.team.filter(function (p) { return p.email; })[0] || {}).email;
    function note(u, older) {
      return el('div', { class: 'note' + (older ? ' older' : '') },
        el('div', { class: 'note-meta' },
          el('div', { class: 'note-av' }, initials(u.author)),
          el('div', { class: 'note-who' }, u.author),
          el('div', { class: 'note-when' }, when(u.at))),
        el('div', { class: 'note-body' }, u.body),
        !older && replyTo ? el('a', { class: 'note-reply', href: 'mailto:' + replyTo + '?subject=' + encodeURIComponent('Re: ' + d.project.title) }, 'Reply by email') : null);
    }
    var sec = el('section', null, el('div', { class: 'sec-head' }, el('div', { class: 'sec-title' }, 'Latest update')), note(d.updates[0], false));
    if (d.updates.length > 1) {
      var more = el('button', { class: 'more-btn', type: 'button', onclick: function () {
        more.remove();
        add(sec, d.updates.slice(1).map(function (u) { return note(u, true); }));
      } }, 'Earlier updates (' + (d.updates.length - 1) + ')');
      add(sec, more);
    }
    return sec;
  }

  // ── send files (step 6b) ─────────────────────────────────────────────────
  // Files go from this browser straight to storage in parts (presigned URLs
  // from our server), never through Slater's server. Server: routes/portalUploads.js.
  var PARALLEL_PARTS = 4, SIGN_BATCH = 20, PART_TRIES = 4;
  var activeUploads = 0;
  window.addEventListener('beforeunload', function (e) {
    if (activeUploads > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  function fmtSize(n) {
    if (n < 1024) return n + ' bytes';
    var u = ['KB', 'MB', 'GB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + u[i];
  }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'http_' + r.status); e.status = r.status; e.code = j.error; throw e; }
        return j;
      });
    });
  }
  function uploadError(e) {
    var c = e && e.code, s = e && e.status;
    if (c === 'too_large') return 'Over 5 GB. Please send this one with WeTransfer or Frame.io.';
    if (c === 'project_full') return 'This project has reached its upload limit. Please contact your producer.';
    if (c === 'size_mismatch') return 'The file changed while it was sending. Please try again.';
    if (c === 'uploads_unavailable') return 'Sending files isn\'t available right now.';
    if (c === 'cancelled') return 'Cancelled';
    if (c === 'not_waiting') return 'This item isn\'t waiting on you anymore. Reload the page to see what changed.';
    if (s === 429) return 'Too many uploads at once. Please wait a few minutes.';
    if (c === 'storage_blocked') return 'Your browser couldn\'t reach our file storage. Please try again later.';
    return 'That didn\'t send. Please try again.';
  }

  // PUT one part; resolves with its ETag. onProgress(bytesSoFar).
  function putPart(url, blob, onProgress, track) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      track(x);
      x.open('PUT', url);
      x.upload.onprogress = function (e) { onProgress(e.loaded); };
      x.onload = function () {
        track(null, x);
        var etag = x.getResponseHeader('ETag');
        if (x.status >= 200 && x.status < 300 && etag) return resolve(etag);
        var err = new Error('part_' + x.status); err.status = x.status;
        if (x.status >= 200 && x.status < 300) err.code = 'storage_blocked'; // ETag hidden: bucket CORS
        reject(err);
      };
      x.onerror = function () { track(null, x); var err = new Error('network'); err.code = 'network'; reject(err); };
      x.onabort = function () { track(null, x); var err = new Error('cancelled'); err.code = 'cancelled'; reject(err); };
      x.send(blob);
    });
  }

  // Upload one file. job: { file, name, onProgress(fraction), cancelled }.
  function sendFile(job) {
    var file = job.file, xhrs = [], id = null, partBytes, parts, signed = {}, batches = {}, failed = false;
    job.cancel = function () {
      job.cancelled = true;
      xhrs.slice().forEach(function (x) { x.abort(); });
      if (id) api('DELETE', '/uploads/' + id).catch(function () {});
    };
    function track(x, done) {
      if (x) xhrs.push(x);
      else xhrs = xhrs.filter(function (y) { return y !== done; });
    }
    function urlFor(n, fresh) {
      if (!fresh && signed[n]) return Promise.resolve(signed[n]);
      var b = Math.floor((n - 1) / SIGN_BATCH);
      if (fresh || !batches[b]) {
        var want = [];
        for (var i = b * SIGN_BATCH + 1; i <= Math.min(parts, (b + 1) * SIGN_BATCH); i++) want.push(i);
        batches[b] = api('POST', '/uploads/' + id + '/parts', { parts: want }).then(function (j) {
          Object.keys(j.urls).forEach(function (k) { signed[k] = j.urls[k]; });
        });
      }
      return batches[b].then(function () { return signed[n]; });
    }
    var loaded = {};
    function report() {
      var sum = 0;
      Object.keys(loaded).forEach(function (k) { sum += loaded[k]; });
      job.onProgress(Math.min(1, sum / file.size));
    }
    function sendPart(n, attempt) {
      if (job.cancelled) return Promise.reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
      if (failed) return Promise.reject(new Error('stopped'));
      var blob = file.slice((n - 1) * partBytes, Math.min(file.size, n * partBytes));
      return urlFor(n, attempt > 1).then(function (url) {
        return putPart(url, blob, function (b) { loaded[n] = b; report(); }, track);
      }).catch(function (e) {
        loaded[n] = 0; report();
        if (e.code === 'cancelled' || e.code === 'storage_blocked' || e.status === 401 || e.status === 404 || attempt >= PART_TRIES) throw e;
        return new Promise(function (r) { setTimeout(r, 1000 * attempt * attempt); })
          .then(function () { return sendPart(n, attempt + 1); });
      });
    }

    return api('POST', '/uploads', { filename: file.name, size: file.size, content_type: file.type, name: job.name, item: job.item ? job.item.uuid : undefined })
      .then(function (j) {
        id = j.id; partBytes = j.part_bytes; parts = j.parts;
        if (job.cancelled) { job.cancel(); throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); }
        var etags = new Array(parts), next = 1;
        function worker() {
          if (next > parts) return Promise.resolve();
          var n = next++;
          return sendPart(n, 1).then(function (etag) { etags[n - 1] = { part: n, etag: etag }; return worker(); });
        }
        var pool = [];
        for (var w = 0; w < Math.min(PARALLEL_PARTS, parts); w++) pool.push(worker());
        return Promise.all(pool).then(function () {
          return api('POST', '/uploads/' + id + '/complete', { parts: etags });
        });
      })
      .catch(function (e) {
        failed = true;  // stop the other parts
        xhrs.slice().forEach(function (x) { x.abort(); });
        if (id && e.code !== 'size_mismatch') api('DELETE', '/uploads/' + id).catch(function () {});
        throw e;
      });
  }

  function sentRow(f) {
    return el('div', { class: 'sent-row' },
      el('div', { class: 'sent-name' }, f.name),
      el('div', { class: 'sent-meta' }, [fmtSize(f.size), f.by, f.at ? when(f.at) : ''].filter(Boolean).join('  ·  ')),
      f.item ? el('div', { class: 'sent-for' }, 'For "' + f.item + '"') : null);
  }

  // The upload queue, shared by the "Send files" section and the "Send files
  // for this" link on each waiting item. Built once per render.
  function makeUploader(d) {
    var up = d.uploads, u = {}, counters = {};
    u.name = el('input', { type: 'text', maxlength: '200', placeholder: 'Your name', autocomplete: 'name', 'aria-label': 'Your name', class: 'drop-name' });
    u.name.value = savedName();
    u.err = el('div', { class: 'err', role: 'alert' });
    u.queue = el('div', { class: 'up-list' });
    u.sentList = el('div', { class: 'sent-list' });
    u.sentBlock = el('div', { class: 'sent', style: d.sent.length ? '' : 'display:none' },
      el('div', { class: 'card-t' }, 'You sent'), u.sentList);
    add(u.sentList, d.sent.map(sentRow));

    // A waiting item's "You sent N files" line, bumped when one finishes.
    u.onItemSent = function (uuid, fn) { counters[uuid] = fn; };

    // The name, or '' after pointing the client at the name field.
    u.askName = function () {
      u.err.textContent = '';
      var n = u.name.value.trim();
      if (n) { saveName(n); return n; }
      u.err.textContent = 'Please add your name first, then choose your files.';
      u.name.scrollIntoView({ block: 'center' });
      u.name.focus();
      return '';
    };

    var waiting = [], running = false;
    // item: { uuid, name } when sent for a "Waiting on you" item, else null.
    u.enqueue = function (fileList, item) {
      var n = u.askName();
      if (!n) return;
      Array.prototype.forEach.call(fileList, function (file) {
        var bar = el('div', { class: 'up-bar-fill' });
        var status = el('div', { class: 'up-status' }, 'Waiting');
        var job = { file: file, name: n, item: item || null, cancelled: false };
        var cancel = el('button', { type: 'button', class: 'action-link up-cancel', onclick: function () {
          if (job.cancel) job.cancel(); else { job.cancelled = true; done('Cancelled', 'cancelled'); }
        } }, 'Cancel');
        var row = el('div', { class: 'up-row' },
          el('div', { class: 'up-top' }, el('div', { class: 'up-name' }, file.name), el('div', { class: 'up-size' }, fmtSize(file.size)), cancel),
          item ? el('div', { class: 'up-for' }, 'For "' + item.name + '"') : null,
          el('div', { class: 'up-bar' }, bar), status);
        function done(text, cls) { cancel.remove(); status.textContent = text; row.classList.add(cls); }
        job.onProgress = function (f) { bar.style.width = (f * 100).toFixed(1) + '%'; status.textContent = Math.floor(f * 100) + '%'; };
        job.done = done;
        add(u.queue, row);
        if (file.size > up.max_bytes) return done(uploadError({ code: 'too_large' }), 'failed');
        if (file.size === 0) return done('This file is empty.', 'failed');
        waiting.push(job);
      });
      run();
    };
    // One file at a time (its parts go in parallel), in the order chosen.
    function run() {
      if (running) return;
      var job = waiting.shift();
      if (!job) return;
      if (job.cancelled) return run();
      running = true; activeUploads++;
      job.onProgress(0);
      sendFile(job).then(function () {
        job.onProgress(1);
        job.done('Sent', 'sent');
        u.sentBlock.style.display = '';
        u.sentList.insertBefore(sentRow({ name: job.file.name, size: job.file.size, by: job.name, at: new Date().toISOString(), item: job.item ? job.item.name : '' }), u.sentList.firstChild);
        if (job.item && counters[job.item.uuid]) counters[job.item.uuid]();
      }, function (e) {
        // Link turned off or password changed mid-upload: start over from the top.
        if (e.status === 401 || e.status === 404) { waiting.length = 0; setTimeout(load, 0); return; }
        job.done(uploadError(e), e.code === 'cancelled' ? 'cancelled' : 'failed');
      }).then(function () { running = false; activeUploads--; run(); });
    }
    return u;
  }

  function filesSection(d, u) {
    var up = d.uploads || {};
    var sent = d.sent || [];
    if (!u && !sent.length) return null;

    var sec = el('section', { class: 'files' },
      el('div', { class: 'sec-head' },
        el('div', { class: 'sec-title' }, u ? 'Send files to your producer' : 'Files you sent'),
        u ? el('div', { class: 'sec-aside' }, 'Up to ' + fmtSize(up.max_bytes) + ' per file  ·  kept ' + up.keep_days + ' days') : null));

    if (!u) {
      add(sec, el('div', { class: 'sent' }, el('div', { class: 'card-t' }, 'You sent'), el('div', { class: 'sent-list' }, sent.map(sentRow))));
      return sec;
    }
    {
      var input = el('input', { type: 'file', multiple: 'multiple', class: 'drop-input', 'aria-label': 'Choose files to send' });
      var zone = el('label', { class: 'drop' },
        input,
        el('div', { class: 'drop-main' }, 'Drag files here or ', el('span', { class: 'drop-pick' }, 'choose files')),
        el('div', { class: 'drop-sub' }, 'Bigger than ' + fmtSize(up.max_bytes) + '? Send it with WeTransfer or Frame.io and email your producer the link.'));
      function enqueue(files) { u.enqueue(files, null); input.value = ''; }

      input.addEventListener('change', function () { if (input.files.length) enqueue(input.files); });
      ['dragenter', 'dragover'].forEach(function (t) {
        zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (t) {
        zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove('over'); });
      });
      zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) enqueue(e.dataTransfer.files); });

      add(sec, el('div', { class: 'drop-wrap' }, u.name, zone, u.err, u.queue));
    }
    add(sec, u.sentBlock);
    return sec;
  }

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) screen('This link isn\'t active', 'Ask your producer for a new link.');
  else load();
})();
