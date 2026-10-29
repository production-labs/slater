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
    if (d.waiting.length) add(app, waitingBand(d.waiting, today));

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
    add(body, el('section', null,
      el('div', { class: 'sec-head' },
        el('div', { class: 'sec-title' }, 'Deliverables'),
        d.key_date ? el('div', { class: 'sec-aside' }, 'Expected ' + fmt(d.key_date)) : null),
      el('div', { class: 'deliv' }, el('div', { class: 'deliv-txt' }, 'Final files will appear here when delivery is complete'))));
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

  function waitingBand(list, today) {
    return el('div', { class: 'action-band' }, el('div', { class: 'wrap' }, el('div', { class: 'action-inner' },
      el('div', { class: 'action-head' },
        el('div', { class: 'action-title' }, 'Waiting on you'),
        el('div', { class: 'action-sub' }, list.length + (list.length === 1 ? ' item' : ' items'))),
      el('div', { class: 'action-list' }, list.map(function (w) {
        var due = dueLabel(w.due, today);
        var note = w.response
          ? el('div', { class: 'action-note sent' }, (w.response.kind === 'approved' ? 'Approved ' : 'Changes requested ') + ago(w.response.at) + '. Your producer will confirm.')
          : el('div', { class: 'action-note' }, 'Due ' + fmtY(w.due));
        return el('div', { class: 'action-row' },
          el('div', { class: 'action-due ' + due.cls }, due.text),
          el('div', { class: 'action-body' }, el('div', { class: 'action-name' }, w.item), note));
      })))));
  }

  function timelineSection(nodes, today) {
    var first = nodes[0].date, last = nodes[nodes.length - 1].date;
    var start = today < first ? today : first, end = today > last ? today : last;
    if (start === end) { start = addDays(start, -3); end = addDays(end, 3); }
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
      add(tl, el('div', { class: 'tl-cap ' + side, style: 'left:' + x + '%' }, el('strong', null, n.label), fmt(n.date)));
      side = side === 'above' ? 'below' : 'above';
    });

    return el('section', null,
      el('div', { class: 'sec-head' },
        el('div', { class: 'sec-title' }, 'Project timeline'),
        el('div', { class: 'sec-aside' }, fmt(first) + ' to ' + fmtY(last))),
      el('div', { class: 'tl-frame' }, tl, el('div', { class: 'tl-legend' },
        el('div', { class: 'lg' }, el('span', { class: 'lg-dot ms' }), 'Key date'),
        el('div', { class: 'lg' }, el('span', { class: 'lg-dot client' }), 'Needs you'),
        el('div', { class: 'lg' }, el('span', { class: 'lg-dot' }), 'Our work'))));
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

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) screen('This link isn\'t active', 'Ask your producer for a new link.');
  else load();
})();
