// Double-booking warnings (V1.5, 2026-10-21)
//
// Same person (linked to a Contact) booked on two projects with overlapping
// schedule days. Checked for key personnel, crew and talent.
//
//   - On the open project, anyone on it counts (any status but Declined), so
//     adding someone already booked elsewhere warns right away, even at TBD.
//   - On other projects, bookings count: Pencil, 1st Hold or Confirmed.
//   - Red: Confirmed or 1st Hold on both projects. Amber: anything less on
//     either side (a Pencil, or TBD / Contacted on the open project).
//   - Note (quiet): they're only TBD / Contacted on the other project. Shown
//     on the card, nowhere else: no pop-up, no nav count, no Schedule line.
//   - A person's days are the project's schedule days (start to end date),
//     minus days they're left off in Edit Crew. Days left off the call sheet
//     still count. "Deadline" days aren't work days, so they don't count.
//     Past dates are ignored.
//   - Cards typed in by hand (not linked to a Contact) aren't checked: there's
//     no reliable way to know two typed names are the same person.
//
// Other projects come from window._allProjectsCache (the Rundown's copy of
// every project, loaded at login). The open project is read from the form.
//
// How it's shown:
//   - Setting a booked status on someone who's booked elsewhere asks first
//     (Book anyway / Cancel). Cancel puts the old status back.
//   - Any other edit that creates a new double booking (adding or picking a
//     person, a date change, a new day, putting someone back on a day, loading
//     a crew config) shows a notice.
//   - Ongoing: a strip on the card, a count on the Project / Crew / Talent
//     nav items, and a line on the matching Schedule day cards.
//   Opening a project or the Rundown copy finishing loading doesn't pop up
//   anything: what's already there is shown by the strips and counts.

(function () {
  'use strict';

  var BOOKED = { pencil: 1, hold: 1, confirmed: 1 };
  var FIRM = { hold: 1, confirmed: 1 };
  var RANK = { tbd: 0, contacted: 1, pencil: 2, hold: 3, confirmed: 4 };
  var STATUS_LABEL = { tbd: 'TBD', contacted: 'Contacted', pencil: 'Pencil', hold: '1st Hold', confirmed: 'Confirmed' };
  var KINDS = [
    { kind: 'kp',     list: 'kp_cards', idField: '_id', excl: 'excluded_kp',     tab: 'project' },
    { kind: 'crew',   list: 'crew',     idField: 'id',  excl: 'excluded_crew',   tab: 'crew' },
    { kind: 'talent', list: 'talent',   idField: 'id',  excl: 'excluded_talent', tab: 'talent' },
  ];
  var MAX_DAYS = 60; // longest date range one schedule day can cover

  // ── Dates ──────────────────────────────────────────────────────────────
  function isoOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayIso() { return isoOf(new Date()); }
  function nextIso(iso) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return isoOf(d); }
  function validIso(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso || ''); }

  function dayDates(day) {
    var start = day && day.date_iso;
    if (!validIso(start) || day.category === 'deadline') return [];
    var end = validIso(day.end_date_iso) && day.end_date_iso > start ? day.end_date_iso : start;
    var out = [start], cur = start;
    while (cur < end && out.length < MAX_DAYS) { cur = nextIso(cur); out.push(cur); }
    return out;
  }

  function fmtDate(iso) { return typeof wbFmtDate === 'function' ? wbFmtDate(iso) : iso; }
  // ["2026-11-03","2026-11-04","2026-11-09"] -> "Tue Nov 3 to Wed Nov 4, Mon Nov 9"
  function fmtDates(isos) {
    var runs = [];
    isos.forEach(function (iso) {
      var last = runs[runs.length - 1];
      if (last && nextIso(last[1]) === iso) last[1] = iso; else runs.push([iso, iso]);
    });
    return runs.map(function (r) { return r[0] === r[1] ? fmtDate(r[0]) : fmtDate(r[0]) + ' to ' + fmtDate(r[1]); }).join(', ');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function fieldVal(id) { var e = el(id); return e ? String(e.value || '').trim() : ''; }

  // ── Bookings ───────────────────────────────────────────────────────────
  // One entry per linked card with at least one upcoming day. Only booked
  // cards, unless anyStatus (the open project: everyone but Declined).
  function bookings(data, anyStatus) {
    var days = (data && data.schedule_days) || [];
    var today = todayIso();
    var out = [];
    KINDS.forEach(function (K) {
      (data[K.list] || []).forEach(function (card) {
        var contactId = Number(card && card.contact_id);
        if (!contactId) return;
        if (anyStatus ? card.status === 'declined' : !BOOKED[card.status]) return;
        var cardId = card[K.idField];
        var dates = {}, any = false;
        days.forEach(function (day) {
          if (cardId && (day[K.excl] || []).indexOf(cardId) !== -1) return;
          dayDates(day).forEach(function (iso) { if (iso >= today) { dates[iso] = true; any = true; } });
        });
        if (any) out.push({ contactId: contactId, name: card.name || '', kind: K.kind, cardId: cardId, status: card.status, dates: dates });
      });
    });
    return out;
  }

  // The open project, straight from the form (cheaper than gather()).
  function currentData() {
    function cards(ids) {
      return ids.map(function (id) {
        return { id: id, _id: id, name: fieldVal(id + '_name'), status: fieldVal(id + '_status') || 'tbd', contact_id: fieldVal(id + '_contact_id') };
      });
    }
    /* global kp, crew, talent, getScheduleDays, currentSheetKey */
    return {
      schedule_days: typeof getScheduleDays === 'function' ? getScheduleDays() : [],
      kp_cards: cards(typeof kp !== 'undefined' ? kp : []),
      crew: cards(typeof crew !== 'undefined' ? crew : []),
      talent: cards(typeof talent !== 'undefined' ? talent : []),
    };
  }

  function projectName(entry) {
    var d = entry.data || {};
    var title = String(d.project_title || '').trim();
    if (title) return title;
    return String(entry.label || d.label || 'Untitled project').split('|')[0].trim() || 'Untitled project';
  }

  function openKey() { return typeof currentSheetKey !== 'undefined' ? currentSheetKey : null; }

  function otherBookings() {
    var cache = window._allProjectsCache || {};
    var mine = openKey();
    var out = [];
    Object.keys(cache).forEach(function (k) {
      if (k === mine) return;
      var entry = cache[k];
      if (!entry || !entry.data) return;
      var name = projectName(entry);
      bookings(entry.data, true).forEach(function (b) { b.key = k; b.project = name; out.push(b); });
    });
    return out;
  }

  // { cardId: { name, status, conflicts: [{ key, project, dates, status, severity }] } }
  function compute() {
    var mine = bookings(currentData(), true);
    var result = {};
    if (!mine.length) return result;
    var others = otherBookings();
    mine.forEach(function (m) {
      others.forEach(function (o) {
        if (o.contactId !== m.contactId) return;
        var shared = Object.keys(m.dates).filter(function (d) { return o.dates[d]; }).sort();
        if (!shared.length) return;
        var entry = result[m.cardId] || (result[m.cardId] = { name: m.name, kind: m.kind, status: m.status, contactId: m.contactId, conflicts: [] });
        // One line per other project, even when they're on it twice (say as
        // EP and Producer): all their days there, their strongest status.
        var c = entry.conflicts.filter(function (x) { return x.key === o.key; })[0];
        if (c) {
          shared.forEach(function (d) { if (c.dates.indexOf(d) === -1) c.dates.push(d); });
          c.dates.sort();
          if (RANK[o.status] > RANK[c.status]) c.status = o.status;
        } else {
          c = { key: o.key, project: o.project, dates: shared, status: o.status };
          entry.conflicts.push(c);
        }
        c.severity = !BOOKED[c.status] ? 'note' : (FIRM[m.status] && FIRM[c.status]) ? 'red' : 'amber';
      });
    });
    return result;
  }

  function worst(conflicts) {
    if (conflicts.some(function (c) { return c.severity === 'red'; })) return 'red';
    return conflicts.some(function (c) { return c.severity === 'amber'; }) ? 'amber' : 'note';
  }
  // Conflicts that warn (red / amber), leaving out quiet notes.
  function real(conflicts) { return conflicts.filter(function (c) { return c.severity !== 'note'; }); }
  function notes(conflicts) { return conflicts.filter(function (c) { return c.severity === 'note'; }); }
  // Per person and other project, not per card: someone in two roles here is
  // one person, and a status change here asks on its own (confirmStatus).
  function signature(cardId, entry, c) { return entry.contactId + '|' + c.key; }
  // Card heading: someone not yet booked here is "booked elsewhere".
  function headline(entry, sev) {
    if (sev === 'note') return 'Also on another project (not booked there yet)';
    if (!BOOKED[entry.status]) return 'Already booked on another project';
    return sev === 'red' ? 'Double-booked' : 'Possible double booking';
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  function conflictLine(c, withLink) {
    return '<div class="bc-line"><span>' + esc(fmtDates(c.dates)) + ' on <strong>' + esc(c.project) + '</strong> (' +
      esc(STATUS_LABEL[c.status] || c.status) + ')</span>' +
      (withLink ? '<a class="bc-open" data-key="' + esc(c.key) + '">Open project</a>' : '') + '</div>';
  }

  function renderCards(result) {
    document.querySelectorAll('.bc-strip[data-card]').forEach(function (s) {
      var cardId = s.getAttribute('data-card');
      if (!result[cardId]) s.parentNode.removeChild(s);
    });
    Object.keys(result).forEach(function (cardId) {
      var card = el(cardId);
      if (!card) return;
      var entry = result[cardId];
      var strip = card.querySelector('.bc-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.setAttribute('data-card', cardId);
        var row1 = card.querySelector('.contact-card-row1');
        if (row1) row1.insertAdjacentElement('afterend', strip); else card.insertBefore(strip, card.firstChild);
      }
      var sev = worst(entry.conflicts);
      strip.className = 'bc-strip bc-' + sev;
      var r = real(entry.conflicts), n = notes(entry.conflicts);
      var html = '<div class="bc-head">' + esc(headline(entry, sev)) + '</div>' +
        (sev === 'note' ? n : r).map(function (c) { return conflictLine(c, true); }).join('');
      if (sev !== 'note' && n.length) {
        html += '<div class="bc-subnote"><div class="bc-subhead">Also on (not booked there yet)</div>' +
          n.map(function (c) { return conflictLine(c, true); }).join('') + '</div>';
      }
      strip.innerHTML = html;
    });
  }

  function renderNav(result) {
    var byTab = {};
    KINDS.forEach(function (K) { byTab[K.tab] = { people: {}, count: 0, red: false }; });
    Object.keys(result).forEach(function (cardId) {
      var entry = result[cardId];
      var K = KINDS.filter(function (k) { return k.kind === entry.kind; })[0];
      var r = real(entry.conflicts);
      if (!K || !r.length) return;
      var t = byTab[K.tab];
      if (!t.people[entry.contactId]) { t.people[entry.contactId] = true; t.count++; }
      if (worst(r) === 'red') t.red = true;
    });
    Object.keys(byTab).forEach(function (tab) {
      var btn = document.querySelector('.app-nav-item[data-tab="' + tab + '"]');
      if (!btn) return;
      var badge = btn.querySelector('.bc-nav-badge');
      var t = byTab[tab];
      if (!t.count) { if (badge) badge.parentNode.removeChild(badge); return; }
      if (!badge) { badge = document.createElement('span'); btn.appendChild(badge); }
      badge.className = 'bc-nav-badge bc-' + (t.red ? 'red' : 'amber');
      badge.textContent = t.count;
      badge.title = t.count + (t.count === 1 ? ' person' : ' people') + ' double-booked';
    });
  }

  function renderDays(result) {
    var days = typeof getScheduleDays === 'function' ? getScheduleDays() : [];
    days.forEach(function (day) {
      var countEl = el(day.id + '_staff_counts');
      var marker = el(day.id + '_bc_marker');
      var dates = {};
      dayDates(day).forEach(function (d) { dates[d] = true; });
      var names = [], people = {}, red = false;
      Object.keys(result).forEach(function (cardId) {
        var entry = result[cardId];
        var K = KINDS.filter(function (k) { return k.kind === entry.kind; })[0];
        if ((day[K.excl] || []).indexOf(cardId) !== -1) return;
        var hits = real(entry.conflicts).filter(function (c) { return c.dates.some(function (d) { return dates[d]; }); });
        if (!hits.length) return;
        if (worst(hits) === 'red') red = true;
        if (people[entry.contactId]) return;
        people[entry.contactId] = true;
        names.push(entry.name || 'Unnamed');
      });
      if (!names.length || !countEl) { if (marker) marker.parentNode.removeChild(marker); return; }
      if (!marker) {
        marker = document.createElement('div');
        marker.id = day.id + '_bc_marker';
        countEl.insertAdjacentElement('afterend', marker);
      }
      marker.className = 'bc-day-marker bc-' + (red ? 'red' : 'amber');
      marker.textContent = (red ? 'Double-booked: ' : 'Possible double booking: ') + names.join(', ');
    });
  }

  // ── Dialog ─────────────────────────────────────────────────────────────
  function dialog(title, html, buttons) {
    var ov = el('bc-modal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'bc-modal';
      ov.className = 'modal-overlay';
      ov.innerHTML = '<div class="modal bc-modal"><h3 id="bc-modal-title"></h3><div id="bc-modal-body"></div><div class="modal-btns" id="bc-modal-btns"></div></div>';
      document.body.appendChild(ov);
    }
    el('bc-modal-title').textContent = title;
    el('bc-modal-body').innerHTML = html;
    var btns = el('bc-modal-btns');
    btns.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'lb' + (b.primary ? ' primary' : '');
      btn.textContent = b.label;
      btn.onclick = function () { ov.classList.remove('open'); if (b.onClick) b.onClick(); };
      btns.appendChild(btn);
    });
    ov.classList.add('open');
  }

  function personBlock(entry, conflicts) {
    var sev = worst(conflicts);
    return '<div class="bc-strip bc-' + sev + '"><div class="bc-head">' + esc(entry.name || 'This person') + '</div>' +
      conflicts.map(function (c) { return conflictLine(c, false); }).join('') + '</div>';
  }

  // ── State ──────────────────────────────────────────────────────────────
  var seen = {};        // signatures already shown (or present when the project opened)
  var lastKey;          // project the baseline belongs to
  var lastCacheKeys;    // Rundown copy's project list the baseline was taken with
  var timer = null;
  var last = {};        // last compute() result
  var quietNext = false; // next refresh only takes a baseline (project just loaded)

  function cacheKeys() { return Object.keys(window._allProjectsCache || {}).sort().join(','); }

  function signatures(result) {
    var s = {};
    Object.keys(result).forEach(function (cardId) {
      real(result[cardId].conflicts).forEach(function (c) { s[signature(cardId, result[cardId], c)] = true; });
    });
    return s;
  }

  function refresh(opts) {
    opts = opts || {};
    timer = null;
    var result = compute();
    last = result;
    renderCards(result);
    renderNav(result);
    renderDays(result);

    var now = signatures(result);
    var key = openKey(), ck = cacheKeys();
    var silent = opts.silent || quietNext || key !== lastKey || ck !== lastCacheKeys;
    lastKey = key; lastCacheKeys = ck; quietNext = false;
    if (!silent) {
      var blocks = [], names = [];
      Object.keys(result).forEach(function (cardId) {
        var entry = result[cardId];
        var fresh = real(entry.conflicts).filter(function (c) { return !seen[signature(cardId, entry, c)]; });
        if (!fresh.length) return;
        // Mark as shown now, so the same person's other card adds nothing.
        fresh.forEach(function (c) { seen[signature(cardId, entry, c)] = true; });
        blocks.push(personBlock(entry, fresh)); names.push(entry.name || 'Someone');
      });
      if (blocks.length) {
        var one = blocks.length === 1;
        dialog(one ? names[0] + ' is already booked' : 'Already booked on other projects',
          '<p class="bc-intro">' + (one ? 'They\'re' : 'These people are') + ' booked on another project on days they\'d be working here:</p>' + blocks.join(''),
          [{ label: 'OK', primary: true }]);
      }
    }
    seen = now;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, 400);
  }

  // Called from the status dropdowns before the new status takes effect
  // elsewhere. Returns nothing; calls revert() if the user cancels.
  function confirmStatus(cardId, newVal, prevVal, revert) {
    if (!BOOKED[newVal]) { schedule(); return; }
    var result = compute();
    var entry = result[cardId];
    var r = entry ? real(entry.conflicts) : [];
    if (!r.length) { schedule(); return; } // quiet notes never ask
    // Asked about here, so the follow-up refresh doesn't ask again.
    r.forEach(function (c) { seen[signature(cardId, entry, c)] = true; });
    if (timer) clearTimeout(timer);
    timer = null;
    var label = STATUS_LABEL[newVal] || newVal;
    dialog((entry.name || 'This person') + ' is already booked',
      '<p class="bc-intro">Setting them to <strong>' + esc(label) + '</strong> here overlaps with:</p>' + personBlock(entry, r),
      [
        { label: 'Cancel', onClick: function () { revert(prevVal); refresh({ silent: true }); } },
        { label: 'Book anyway', primary: true, onClick: function () { refresh({ silent: true }); } },
      ]);
  }

  function openProject(key) {
    var sel = el('lib-select');
    if (!sel || typeof libSelect !== 'function') return;
    if (key === openKey()) return;
    sel.value = key;
    libSelect();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.bc-open');
    if (!a) return;
    e.preventDefault();
    openProject(a.getAttribute('data-key'));
  });

  // A project was loaded into the form, or the Rundown copy changed: show
  // what's there, don't announce it.
  function loaded() { quietNext = true; schedule(); }

  window.BookingConflicts = {
    changed: schedule,
    loaded: loaded,
    refresh: refresh,
    confirmStatus: confirmStatus,
    // For tests / the console.
    _compute: compute,
    _bookings: bookings,
    _dayDates: dayDates,
    _fmtDates: fmtDates,
    _last: function () { return last; },
  };
})();
