/* Projects Overview (V1.5).
   A read-only dashboard across every project, built from the data the
   Rundown already loads (_allProjectsCache; the open project comes from
   gather() so unsaved edits show). The only thing it writes is the Past tab's
   closeout checklist, through setProjectCloseout() in app.js.

   Mock: ~/Documents/Production Labs LLC/Slater/Mock-slater_projects_overview.html
   Plan: docs/v1.5-client-portal-plan.md (Part B) */
(function () {
  'use strict';

  var TYPE_LABELS = {
    post_production: 'Post Production', location_shoot: 'Location Shoot',
    live_broadcast_location: 'Live Broadcast', live_broadcast_studio: 'Live Broadcast',
    webinar: 'Webinar'
  };
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var RANGES = { '2w': [7, 14], '6w': [7, 35], 'q': [14, 90] }; // days before / after today

  var root = null;
  var ui = { tab: 'upcoming', filter: 'all', pastFilter: 'open', range: '6w', q: '' };

  // ── small helpers ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function fmt(s) { return s ? parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; }
  function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
  function ic(n) { return '<i data-lucide="' + n + '" class="lucide"></i>'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function ago(ms) {
    if (!ms) return '';
    var mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 60) return mins <= 1 ? 'just now' : mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return plural(hrs, 'hour') + ' ago';
    var days = Math.round(hrs / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }
  function isClientOwner(owner, client) {
    var o = (owner || '').trim().toLowerCase();
    if (!o) return false;
    if (o === 'client') return true;
    var c = (client || '').trim().toLowerCase();
    return !!c && o === c;
  }

  // ── per-project summary ───────────────────────────────────────────────────
  // Everything the cards, KPIs and timeline need, worked out once per render.
  // conflicts (optional): this project's double bookings from conflictsByProject().
  function summarize(key, label, data, today, conflicts) {
    var wb = projectWorkbackDates(data);
    var client = data.client_company || data.client || '';
    var dates = [];
    (data.schedule_days || []).forEach(function (d) {
      if (d.date_iso) dates.push(d.date_iso);
      if (d.end_date_iso) dates.push(d.end_date_iso);
    });
    if (data.video_due_date_iso) dates.push(data.video_due_date_iso);
    dates.sort();
    var keyDate = dates.length ? dates[dates.length - 1] : '';
    var dueItems = wb.items.filter(function (i) { return i.due; }).map(function (i) { return i.due; }).sort();
    var startDate = wb.kickoffIso || dueItems[0] || dates[0] || '';
    if (startDate && keyDate && startDate > keyDate) startDate = dates[0] || keyDate;

    var open = wb.items.filter(function (i) { return i.status !== 'Complete' && i.status !== 'N/A'; });
    var doneCount = wb.items.length - open.length;
    var overdue = open.filter(function (i) { return i.due && i.due < today; });
    var waiting = open.filter(function (i) { return isClientOwner(i.owner, client); });
    var nextTask = open.filter(function (i) { return i.due; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; })[0] || null;
    var nextPin = wb.pins.filter(function (p) { return p.date_iso >= today; })
      .sort(function (a, b) { return a.date_iso < b.date_iso ? -1 : 1; })[0] || null;

    function book(list, nameField) {
      var b = { c: 0, h: 0, p: 0, t: 0, total: 0, open: [] };
      (list || []).forEach(function (m) {
        var s = m.status || 'tbd';
        if (s === 'declined') return;
        b.total++;
        if (s === 'confirmed') b.c++;
        else if (s === 'hold') b.h++;
        else if (s === 'pencil') b.p++;
        else b.t++;
        if (!(m.name || '').trim() && (m[nameField] || '').trim()) b.open.push(m[nameField].trim());
      });
      return b;
    }
    var crew = book(data.crew, 'position');
    var talent = book(data.talent, 'title');

    var expense = 0, reimb = 0;
    (data.expenses || []).forEach(function (e) {
      var a = Number(e.amount) || 0;
      expense += a;
      if (e.reimbursable) reimb += a;
    });

    var daysOut = keyDate ? daysBetween(today, keyDate) : null;
    var soon = daysOut !== null && daysOut >= 0 && daysOut <= 7;
    var unconfirmedSoon = soon ? (crew.total - crew.c) + (talent.total - talent.c) : 0;
    var dbl = conflicts || { red: [], amber: [] };
    var status = (overdue.length || dbl.red.length) ? 'red'
      : (unconfirmedSoon || dbl.amber.length) ? 'yellow' : 'green';

    // Closeout: four saved flags plus derived "Workback complete".
    // null = not applicable (no pill), true = done, false = still open.
    var co = data.closeout || {};
    var closeout = {
      workback_complete: wb.items.length ? open.length === 0 : null,
      deliverables_sent: !!co.deliverables_sent,
      invoices_in: !!co.invoices_in,
      expense_report_sent: !!co.expense_report_sent,
      reimbursed: reimb > 0 ? !!co.reimbursed : null
    };
    var loose = Object.keys(closeout).filter(function (k) { return closeout[k] === false; }).length;

    return {
      key: key, label: label, data: data, client: client,
      name: data.project_title || label || 'Untitled',
      type: data.project_type || '', typeLabel: TYPE_LABELS[data.project_type] || '',
      keyDate: keyDate, startDate: startDate, daysOut: daysOut,
      past: !!keyDate && keyDate < today,
      items: wb.items, pins: wb.pins,
      pct: wb.items.length ? Math.round(doneCount / wb.items.length * 100) : null,
      overdue: overdue.length, waiting: waiting.length, nextTask: nextTask, nextPin: nextPin,
      crew: crew, talent: talent, unconfirmedSoon: unconfirmedSoon, conflicts: dbl, status: status,
      expense: expense, reimb: reimb, savedAt: data.savedAt || 0,
      closeout: closeout, loose: loose
    };
  }

  function allSummaries() {
    var today = iso(new Date());
    var out = [];
    var cache = window._allProjectsCache || {};
    var keys = Object.keys(cache);
    // currentSheetKey is a top-level `let` in app.js: global, but not on window.
    var cur = (typeof currentSheetKey !== 'undefined') ? currentSheetKey : null;
    if (cur && keys.indexOf(cur) === -1) keys.push(cur);
    var projects = [];
    keys.forEach(function (k) {
      var entry = cache[k];
      var data = (k === cur && window._formKey === cur) ? gather() : (entry && entry.data);
      if (!data) return;
      projects.push({ key: k, label: (entry && entry.label) || data.label || '', data: data });
    });
    var dbl = conflictsByProject(projects);
    projects.forEach(function (p) {
      out.push(summarize(p.key, p.label, p.data, today, dbl[p.key]));
    });
    return { today: today, list: out };
  }

  // Double bookings (crew, talent, key personnel), same rules as the Rundown's
  // Conflicts group (booking-conflicts.js). Per project, one entry per person:
  // { key: { red: [{ name, lines }], amber: [...] } }. A person goes under red
  // if any of their clashes on this project is red (Hold/Confirmed on both).
  function conflictsByProject(projects) {
    var out = {};
    if (!window.BookingConflicts || !BookingConflicts._allConflicts) return out;
    BookingConflicts._allConflicts(projects).forEach(function (person) {
      var mine = {}; // project key -> { red, lines }
      person.pairs.forEach(function (pair) {
        [[pair.a, pair.b], [pair.b, pair.a]].forEach(function (ab) {
          var m = mine[ab[0].key] || (mine[ab[0].key] = { red: false, lines: [] });
          if (pair.severity === 'red') m.red = true;
          m.lines.push(BookingConflicts._fmtDates(pair.dates) + ' on ' + ab[1].project +
            ' (' + (pair.severity === 'red' ? 'booked' : 'possible') + ')');
        });
      });
      Object.keys(mine).forEach(function (k) {
        var p = out[k] || (out[k] = { red: [], amber: [] });
        p[mine[k].red ? 'red' : 'amber'].push({ name: person.name, lines: mine[k].lines });
      });
    });
    return out;
  }

  // ── shell ─────────────────────────────────────────────────────────────────
  function build() {
    if (root) return;
    var host = document.querySelector('.app-main') || document.body;
    root = document.createElement('div');
    root.id = 'po-root';
    root.innerHTML =
      '<div class="po-top">' +
        '<div class="po-top-row">' +
          '<div><div class="po-h1">Projects Overview</div><div class="po-h1-sub" id="po-date"></div></div>' +
          '<div class="po-actions">' +
            '<label class="po-search">' + ic('search') + '<input id="po-q" placeholder="Search projects, clients..." autocomplete="off"></label>' +
            '<button class="po-btn primary" id="po-new">' + ic('plus') + 'New Project</button>' +
            '<button class="po-btn" id="po-close" title="Back to the open project">' + ic('x') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="po-tabs">' +
          '<button class="po-tab" data-tab="upcoming">Upcoming <span class="po-ct" id="po-ct-up"></span></button>' +
          '<button class="po-tab" data-tab="past">Past <span class="po-ct" id="po-ct-past"></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="po-scroll" id="po-scroll"></div>' +
      '<div class="po-tip" id="po-tip"></div>';
    host.appendChild(root);

    root.querySelector('#po-close').onclick = close;
    root.querySelector('#po-new').onclick = function () { close(); if (typeof libNew === 'function') libNew(); };
    root.querySelector('#po-q').addEventListener('input', function (e) { ui.q = e.target.value; render(); });
    root.querySelectorAll('.po-tab').forEach(function (t) {
      t.onclick = function () { ui.tab = t.dataset.tab; render(); };
    });
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen() && !document.querySelector('.modal-overlay.open, .modal.open')) close();
    });
    // Any project tab in the left nav closes the overview.
    document.querySelectorAll('.app-nav-item[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { if (isOpen()) close(); });
    });
  }

  function onClick(e) {
    var chip = e.target.closest('[data-chip]');
    if (chip) { ui[chip.dataset.chip] = chip.dataset.val; render(); return; }
    var co = e.target.closest('[data-co]');
    if (co) {
      e.stopPropagation();
      var key = co.dataset.key, field = co.dataset.co;
      setProjectCloseout(key, field, !co.classList.contains('done'));
      render();
      return;
    }
    var proj = e.target.closest('[data-open]');
    if (proj) {
      // A pill with data-open-tab (e.g. "Workback complete") opens that tab
      // instead of the Project tab.
      var tabEl = e.target.closest('[data-open-tab]');
      openProject(proj.dataset.open, tabEl ? tabEl.dataset.openTab : 'project');
    }
  }

  function openProject(key, tab) {
    tab = tab || 'project';
    close();
    if (key === currentSheetKey) { st(tab); return; }
    var sel = document.getElementById('lib-select');
    if (!sel) return;
    sel.value = key;
    if (sel.value !== key) return; // not in the dropdown (yet)
    libSelect();
    st(tab);
  }

  function isOpen() { return !!root && root.classList.contains('open'); }

  function open() {
    build();
    root.classList.add('open');
    var nav = document.getElementById('nav-overview');
    if (nav) nav.classList.add('active');
    document.querySelectorAll('.app-nav-item[data-tab]').forEach(function (b) { b.classList.add('po-dim'); });
    render();
  }

  function close() {
    if (!root) return;
    root.classList.remove('open');
    hideTip();
    var nav = document.getElementById('nav-overview');
    if (nav) nav.classList.remove('active');
    document.querySelectorAll('.app-nav-item[data-tab]').forEach(function (b) { b.classList.remove('po-dim'); });
  }

  // ── render ────────────────────────────────────────────────────────────────
  function render() {
    if (!isOpen()) return;
    var s = allSummaries();
    var q = ui.q.trim().toLowerCase();
    var match = function (p) { return !q || (p.name + ' ' + p.client).toLowerCase().indexOf(q) !== -1; };
    var up = s.list.filter(function (p) { return !p.past; }).sort(function (a, b) {
      if (!a.keyDate) return 1; if (!b.keyDate) return -1;
      return a.keyDate < b.keyDate ? -1 : a.keyDate > b.keyDate ? 1 : 0;
    });
    var past = s.list.filter(function (p) { return p.past; }).sort(function (a, b) { return a.keyDate < b.keyDate ? 1 : -1; });

    root.querySelector('#po-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    root.querySelector('#po-ct-up').textContent = up.length;
    root.querySelector('#po-ct-past').textContent = past.length;
    root.querySelectorAll('.po-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === ui.tab); });

    var body = root.querySelector('#po-scroll');
    var loading = !window._projectsLoaded && !s.list.length;
    if (loading) { body.innerHTML = '<div class="po-empty">Loading projects...</div>'; return; }
    body.innerHTML = ui.tab === 'past'
      ? renderPast(past.filter(match), past, s.today)
      : renderUpcoming(up.filter(match), up, s.today);
    if (ui.tab === 'upcoming') drawTimeline(up.filter(match), s.today);
    if (window.lucide) lucide.createIcons();
  }

  function kpi(icon, label, value, sub, cls) {
    return '<div class="po-kpi ' + (cls || '') + '"><div class="po-kpi-l">' + ic(icon) + esc(label) + '</div>' +
      '<div class="po-kpi-v">' + esc(value) + '</div><div class="po-kpi-s">' + esc(sub) + '</div></div>';
  }
  function chips(name, opts) {
    return opts.map(function (o) {
      return '<button class="po-chip' + (ui[name] === o[0] ? ' on' : '') + '" data-chip="' + name + '" data-val="' + o[0] + '">' + esc(o[1]) + '</button>';
    }).join('');
  }
  function cal(s) {
    if (!s) return '<div class="po-cal po-cal-none"><div class="po-cal-m">DATE</div><div class="po-cal-d">?</div></div>';
    var d = parse(s);
    return '<div class="po-cal"><div class="po-cal-m">' + MON[d.getMonth()] + '</div><div class="po-cal-d">' + d.getDate() + '</div></div>';
  }
  function idBlock(p, metaHtml) {
    return '<div class="po-id">' + cal(p.keyDate) + '<div class="po-t">' +
      (p.client ? '<div class="po-client">' + esc(p.client) + '</div>' : '') +
      '<div class="po-name">' + esc(p.name) + '</div>' +
      '<div class="po-meta">' + metaHtml + (p.typeLabel ? '<span class="po-ptype">' + esc(p.typeLabel) + '</span>' : '') + '</div>' +
      '</div></div>';
  }

  function renderUpcoming(list, all, today) {
    var in7 = addDays(today, 7);
    var next7 = all.filter(function (p) {
      return p.pins.some(function (pin) { return pin.date_iso >= today && pin.date_iso <= in7; });
    }).length;
    var overdueTasks = 0, overdueProjects = 0, waitItems = 0, waitProjects = 0, unconf = 0;
    all.forEach(function (p) {
      overdueTasks += p.overdue; if (p.overdue) overdueProjects++;
      waitItems += p.waiting; if (p.waiting) waitProjects++;
      unconf += p.unconfirmedSoon;
    });

    var f = ui.filter;
    var shown = list.filter(function (p) {
      if (f === 'attention') return p.status !== 'green';
      if (f === 'live') return /^live_broadcast|webinar/.test(p.type);
      if (f === 'post') return p.type === 'post_production';
      if (f === 'shoot') return p.type === 'location_shoot';
      return true;
    });

    var h = '<div class="po-kpis">' +
      kpi('clapperboard', 'Active', all.length, 'upcoming projects') +
      kpi('calendar-clock', 'Next 7 days', next7, 'events or deliveries', next7 ? 'caution' : '') +
      kpi('alert-circle', 'Overdue', overdueTasks, overdueTasks ? 'tasks across ' + plural(overdueProjects, 'project') : 'nothing overdue', overdueTasks ? 'warn' : '') +
      kpi('user-x', 'Unconfirmed', unconf, 'crew + talent, date within 7 days', unconf ? 'caution' : '') +
      kpi('hourglass', 'Waiting on clients', waitItems, waitItems ? 'items across ' + plural(waitProjects, 'project') : 'nothing with clients') +
      '</div>';

    h += '<div class="po-sec-h"><div class="po-sec-t">Portfolio timeline</div><div class="po-sec-r">' +
      chips('range', [['2w', '2 weeks'], ['6w', '6 weeks'], ['q', 'Quarter']]) + '</div></div>' +
      '<div class="po-pt"><div class="po-pt-grid" id="po-pt"></div></div>';

    h += '<div class="po-sec-h"><div class="po-sec-t">Projects</div><div class="po-sec-r">' +
      chips('filter', [['all', 'All'], ['attention', 'Needs attention'], ['live', 'Live events'], ['shoot', 'Shoots'], ['post', 'Post']]) + '</div></div>';

    if (!shown.length) {
      h += '<div class="po-empty">' + (all.length ? 'No projects match.' : 'No upcoming projects. Projects move to Past the day after their last date.') + '</div>';
      return h;
    }
    h += '<div class="po-list">' + shown.map(function (p) { return upcomingCard(p, today); }).join('') + '</div>';
    return h;
  }

  function bookBar(b) {
    if (!b.total) return '<div class="po-bk-bar"></div>';
    var w = function (n) { return (n / b.total * 100) + '%'; };
    return '<div class="po-bk-bar">' +
      '<span style="width:' + w(b.c) + ';background:var(--po-green)" title="Confirmed: ' + b.c + '"></span>' +
      '<span style="width:' + w(b.h) + ';background:var(--po-orange)" title="1st Hold: ' + b.h + '"></span>' +
      '<span style="width:' + w(b.p) + ';background:var(--accent-yellow)" title="Pencil: ' + b.p + '"></span>' +
      '<span style="width:' + w(b.t) + ';background:#4a4f55" title="TBD / Contacted: ' + b.t + '"></span></div>';
  }

  function upcomingCard(p, today) {
    var dt = p.daysOut;
    var dCls = dt === null ? '' : dt <= 3 ? 'now' : dt <= 7 ? 'soon' : '';
    var dTxt = dt === null ? 'No date set' : dt === 0 ? 'Today' : dt === 1 ? 'Tomorrow' : 'In ' + dt + ' days';

    var flags = [];
    function dblFlag(people, cls, word) {
      if (!people.length) return;
      var tip = people.map(function (x) { return x.name + ': ' + x.lines.join('; '); }).join('\n');
      flags.push('<span class="po-flag ' + cls + '" title="' + esc(tip) + '">' + ic('users') +
        people.length + ' ' + word + (people.length === 1 || word === 'double-booked' ? '' : 's') + '</span>');
    }
    dblFlag(p.conflicts.red, 'red', 'double-booked');
    dblFlag(p.conflicts.amber, 'yellow', 'possible double booking');
    if (p.overdue) flags.push('<span class="po-flag red">' + ic('alert-circle') + p.overdue + ' overdue</span>');
    if (p.unconfirmedSoon) flags.push('<span class="po-flag yellow">' + ic('user-x') + p.unconfirmedSoon + ' unconfirmed, date soon</span>');
    if (p.waiting) flags.push('<span class="po-flag yellow">' + ic('hourglass') + p.waiting + ' waiting on client</span>');
    if (!flags.length) flags.push('<span class="po-flag ok">' + ic('check-circle-2') + 'On track</span>');
    if (p.savedAt) flags.push('<span class="po-flag ok">' + ic('activity') + 'Updated ' + esc(ago(p.savedAt)) + '</span>');

    var ms = p.nextPin
      ? '<div class="po-nx">' + esc(p.nextPin.label) + '</div><div class="po-nx-s">' + esc(fmt(p.nextPin.date_iso)) + (p.nextPin.call_time ? ' · ' + esc(p.nextPin.call_time) : '') + '</div>'
      : '<div class="po-nx po-none">None scheduled</div>';
    var nt = p.nextTask;
    var task = nt
      ? '<div class="po-nx">' + esc(nt.item) + '</div><div class="po-nx-s' + (nt.due < today ? ' red' : '') + '">' + (nt.owner ? esc(nt.owner) + ' · ' : '') + 'due ' + esc(fmt(nt.due)) + '</div>'
      : '<div class="po-nx po-none">' + (p.items.length ? 'All done' : 'No workback yet') + '</div>';

    var prog = '';
    if (p.pct !== null) {
      var tp = (p.startDate && p.keyDate && p.keyDate > p.startDate)
        ? Math.max(0, Math.min(100, daysBetween(p.startDate, today) / daysBetween(p.startDate, p.keyDate) * 100)) : null;
      prog = '<div class="po-prog"><div class="po-prog-f" style="width:' + p.pct + '%"></div>' +
        (tp !== null ? '<div class="po-prog-t" style="left:' + tp + '%" title="Today"></div>' : '') + '</div>' +
        '<div class="po-prog-l"><span>Workback ' + p.pct + '% done</span>' +
        (p.startDate && p.keyDate ? '<span>' + esc(fmt(p.startDate)) + ' → ' + esc(fmt(p.keyDate)) + '</span>' : '') + '</div>';
    }
    var openRoles = p.crew.open.concat(p.talent.open);

    return '<div class="po-pc" data-open="' + esc(p.key) + '" title="Open project">' +
      '<div class="po-edge ' + (p.status === 'green' ? '' : p.status) + '"></div>' +
      '<div class="po-body">' +
        idBlock(p, '<span class="po-days ' + dCls + '">' + dTxt + '</span>') +
        '<div><div class="po-lbl">Next milestone</div>' + ms + '<div class="po-lbl" style="margin-top:9px">Next task</div>' + task + '</div>' +
        '<div><div class="po-bk">' +
          '<div class="po-bk-row"><span class="po-bk-k">Crew</span>' + bookBar(p.crew) + '<span class="po-bk-n">' + (p.crew.total ? p.crew.c + '/' + p.crew.total : 'None') + '</span></div>' +
          '<div class="po-bk-row"><span class="po-bk-k">Talent</span>' + bookBar(p.talent) + '<span class="po-bk-n">' + (p.talent.total ? p.talent.c + '/' + p.talent.total : 'None') + '</span></div>' +
          (openRoles.length ? '<div class="po-open">' + ic('circle-dashed') + 'Open: ' + esc(openRoles.join(', ')) + '</div>' : '') +
        '</div>' + prog + '</div>' +
        '<div class="po-flags">' + flags.join('') + '</div>' +
        '<div class="po-money"><div class="po-lbl" style="text-align:right">Expenses</div>' +
          '<div class="po-money-v">' + money(p.expense) + '</div>' +
          '<div class="po-money-s">' + money(p.reimb) + ' reimbursable</div></div>' +
      '</div></div>';
  }

  function renderPast(list, all, today) {
    var loose = all.filter(function (p) { return p.loose; });
    var unreported = 0, reimbDue = 0;
    all.forEach(function (p) {
      if (!p.closeout.expense_report_sent) unreported += p.expense;
      if (p.closeout.reimbursed === false) reimbDue += p.reimb;
    });
    var now = new Date();
    var qStart = iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    var closedQ = all.filter(function (p) { return !p.loose && p.keyDate >= qStart; }).length;

    var h = '<div class="po-kpis po-kpis-4">' +
      kpi('folder-open', 'Not closed out', loose.length, 'projects with loose ends', loose.length ? 'caution' : '') +
      kpi('receipt', 'Unreported expenses', money(unreported), 'expense report not sent') +
      kpi('wallet', 'Reimbursement due', money(reimbDue), 'reimbursable, not yet received', reimbDue ? 'caution' : '') +
      kpi('check-circle-2', 'Closed this quarter', closedQ, 'fully wrapped') +
      '</div>';
    h += '<div class="po-sec-h"><div class="po-sec-t">Past projects</div><div class="po-sec-r">' +
      chips('pastFilter', [['open', 'Not closed out'], ['all', 'All']]) + '</div></div>';

    var shown = ui.pastFilter === 'open' ? list.filter(function (p) { return p.loose; }) : list;
    if (!shown.length) {
      h += '<div class="po-empty">' + (ui.pastFilter === 'open' && all.length ? 'Everything is closed out.' : 'No past projects.') + '</div>';
      return h;
    }
    h += '<div class="po-list">' + shown.map(function (p) { return pastCard(p, today); }).join('') + '</div>';
    return h;
  }

  function pastCard(p, today) {
    var c = p.closeout;
    function pill(field, label, derived) {
      var v = c[field];
      if (v === null) return '';
      var cls = 'po-co ' + (v ? 'done' : 'todo');
      if (derived) {
        return '<span class="' + cls + ' derived" data-open-tab="workback" title="Set by the workback: every item Complete or N/A. Click to open the Workback tab.">' + ic(v ? 'check' : 'circle') + esc(label) + '</span>';
      }
      return '<button class="' + cls + '" data-co="' + field + '" data-key="' + esc(p.key) + '" title="Click to mark ' + (v ? 'not done' : 'done') + '">' +
        ic(v ? 'check' : 'circle') + esc(label) + '</button>';
    }
    var daysAgo = daysBetween(p.keyDate, today);
    return '<div class="po-pc past" data-open="' + esc(p.key) + '" title="Open project">' +
      '<div class="po-edge ' + (p.loose ? 'yellow' : '') + '"></div>' +
      '<div class="po-body">' +
        idBlock(p, '<span>' + plural(daysAgo, 'day') + ' ago</span>') +
        '<div><div class="po-lbl">Closeout</div><div class="po-closeout">' +
          pill('workback_complete', 'Workback complete', true) +
          pill('deliverables_sent', 'Deliverables sent') +
          pill('invoices_in', 'Crew invoices in') +
          pill('expense_report_sent', 'Expense report sent') +
          pill('reimbursed', 'Reimbursed') +
        '</div></div>' +
        '<div class="po-flags">' +
          (p.loose ? '<span class="po-flag yellow">' + ic('folder-open') + plural(p.loose, 'open item') + '</span>'
                   : '<span class="po-flag ok">' + ic('check-circle-2') + 'Closed out</span>') +
          (p.savedAt ? '<span class="po-flag ok">' + ic('activity') + 'Last touched ' + esc(ago(p.savedAt)) + '</span>' : '') +
        '</div>' +
        '<div class="po-money"><div class="po-lbl" style="text-align:right">Final expenses</div>' +
          '<div class="po-money-v">' + money(p.expense) + '</div>' +
          '<div class="po-money-s">' + money(p.reimb) + ' reimbursable</div></div>' +
      '</div></div>';
  }

  // ── portfolio timeline ────────────────────────────────────────────────────
  function drawTimeline(list, today) {
    var pt = root.querySelector('#po-pt');
    if (!pt) return;
    var r = RANGES[ui.range] || RANGES['6w'];
    var S = addDays(today, -r[0]), E = addDays(today, r[1]);
    var span = daysBetween(S, E);
    var pct = function (s) { return Math.max(0, Math.min(100, daysBetween(S, s) / span * 100)); };
    var inRange = function (a, b) { return b >= S && a <= E; };
    var tp = pct(today);

    var lanes = list.filter(function (p) {
      return p.items.some(function (i) { return i.due && inRange(i.due, i.due); }) ||
        p.pins.some(function (x) { return inRange(x.date_iso, x.date_iso); }) ||
        (p.startDate && p.keyDate && inRange(p.startDate, p.keyDate));
    });
    if (!lanes.length) {
      pt.innerHTML = '<div class="po-empty" style="grid-column:1/-1">Nothing scheduled in this window.</div>';
      return;
    }

    var h = '<div></div><div class="po-pt-axis">';
    var step = ui.range === 'q' ? 14 : 7;
    for (var w = S; w <= E; w = addDays(w, step)) h += '<div class="po-pt-wk" style="left:' + pct(w) + '%">' + esc(fmt(w)) + '</div>';
    h += '</div><div>';
    lanes.forEach(function (p) {
      var dot = p.status === 'red' ? 'var(--accent)' : p.status === 'yellow' ? 'var(--accent-yellow)' : 'var(--po-green)';
      h += '<div class="po-pt-name" data-open="' + esc(p.key) + '" title="' + esc((p.client ? p.client + ': ' : '') + p.name) + '">' +
        '<span class="po-dot" style="background:' + dot + '"></span>' + esc((p.client ? p.client + ': ' : '') + p.name) + '</div>';
    });
    h += '</div><div class="po-pt-lanes">';
    lanes.forEach(function (p) {
      h += '<div class="po-pt-lane">' +
        '<div class="po-pt-line" style="right:auto;width:' + tp + '%;background:#444"></div>' +
        '<div class="po-pt-line" style="left:' + tp + '%;background:var(--accent)"></div>';
      // Each dated workback item becomes a segment from the previous item's
      // due date (or the project start) to its own, colored by its owner.
      var prev = p.startDate;
      p.items.filter(function (i) { return i.due; })
        .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; })
        .forEach(function (i) {
          var s = prev && prev < i.due ? prev : addDays(i.due, -1);
          prev = i.due;
          if (!inRange(s, i.due)) return;
          var l = pct(s), rr = pct(i.due);
          var col = isClientOwner(i.owner, p.client) ? '#e87ba4' : (typeof wbOwnerColor === 'function' ? wbOwnerColor(i.owner) : '#888');
          var doneCls = (i.status === 'Complete' || i.status === 'N/A') ? ' done' : '';
          h += '<div class="po-pt-bar' + doneCls + '" style="left:' + l + '%;width:' + Math.max(rr - l, 0.6) + '%;background:' + col + '" ' +
            'data-tip="' + esc('<b>' + esc(i.item) + '</b><span>' + esc((i.owner || 'No owner') + ' · ' + fmt(s) + ' → ' + fmt(i.due) + ' · ' + i.status) + '</span>') + '"></div>';
        });
      p.pins.forEach(function (x) {
        if (!inRange(x.date_iso, x.date_iso)) return;
        h += '<div class="po-pt-pin" style="left:' + pct(x.date_iso) + '%" data-tip="' + esc('<b>' + esc(x.label) + '</b><span>' + esc(fmt(x.date_iso) + (x.call_time ? ' · ' + x.call_time : '')) + '</span>') + '"></div>';
      });
      h += '</div>';
    });
    h += '<div class="po-pt-overlay" style="width:' + tp + '%"></div>' +
      '<div class="po-pt-today" style="left:' + tp + '%"></div>' +
      '<div class="po-pt-today-l" style="left:' + tp + '%">TODAY</div></div>';
    pt.innerHTML = h;

    pt.querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mouseenter', function (e) { showTip(e, el.getAttribute('data-tip')); });
      el.addEventListener('mousemove', moveTip);
      el.addEventListener('mouseleave', hideTip);
    });
  }

  function showTip(e, html) {
    var t = root.querySelector('#po-tip'); t.innerHTML = html; t.style.display = 'block'; moveTip(e);
  }
  function moveTip(e) {
    var t = root.querySelector('#po-tip');
    t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY - 12) + 'px';
  }
  function hideTip() { var t = root && root.querySelector('#po-tip'); if (t) t.style.display = 'none'; }

  // Re-render when the background load of all projects finishes, so the page
  // fills in if it was opened before that.
  function refresh() { if (isOpen()) render(); }

  window.ProjectsOverview = { open: open, close: close, refresh: refresh, isOpen: isOpen, _summarize: summarize, _conflictsByProject: conflictsByProject };
})();
