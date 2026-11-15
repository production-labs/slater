// Schedule tab on phones (2026-11-15, John's design): each day is a read-only summary card.
//
//   header   date badge, the day's name (big), "Tue, Nov 17 · Shoot Day", Edit
//   main     the day schedule if there is one, else the key times (Call / Cameras up /
//            Wrap, or Start / End ...); then the location (tap = Maps)
//   More details  everything else, read-only and grouped (times, location notes,
//                 hospital, people, settings, add to calendar)
//
// Edit turns the existing desktop card (every field, unchanged save logic) into a
// full-screen editor with Done at the top and Delete day at the bottom. Kickoff and
// Project Due Date get a one-line summary and edit in place.
//
// The summary is always rendered; CSS shows it on phones only (<=768px), so desktop
// is untouched. It reads the card's own fields, so it can never disagree with them.
(function () {
  'use strict';

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_UP = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function checked(id) { var e = $(id); return !!(e && e.checked); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function ic(name, cls) { return typeof icon === 'function' ? icon(name, cls) : ''; }
  function parse(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fmtDay(iso) { if (!iso) return ''; var d = parse(iso); return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); }
  function zoneAbbr(iso) {
    var zone = typeof tzIana === 'function' ? tzIana(val('timezone')) : '';
    if (!zone || !window.SlaterTZ) return '';
    return SlaterTZ.abbr(zone, iso ? new Date(iso + 'T20:00:00Z') : new Date());
  }
  // The device's own map app (public/maps-link.js); Google Maps web if that file is missing.
  function mapsUrl(q) { return window.SlaterMaps ? SlaterMaps.url(q) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
  function mapsTarget() { return !window.SlaterMaps || SlaterMaps.opensNewTab() ? ' target="_blank" rel="noopener"' : ''; }

  // The day's key times, labelled the way its day type labels them.
  function keyTimes(dayId) {
    var cat = val(dayId + '_category') || 'shoot_day';
    var cfg = (window.CATEGORY_CONFIG || {})[cat] || {};
    var ids = { f1: '_call_time', f2: '_golive', f3: '_wrap' };
    var out = [];
    ['f1', 'f2', 'f3'].forEach(function (f) {
      var c = cfg[f];
      if (!c || !c.show) return;
      var t = val(dayId + ids[f]);
      if (!t) return;
      var lblEl = $(dayId + '_' + f + '_lbl');
      // A label element also holds the " · PST" tag (refreshAllTimeHints): read its own text only.
      var own = lblEl ? (lblEl.tagName === 'INPUT' ? lblEl.value : [].filter.call(lblEl.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('')) : '';
      var label = own.trim() || c.label || '';
      out.push({ label: label, time: t });
    });
    return out;
  }
  function schedEntries(dayId) {
    return ((typeof daySchedItems !== 'undefined' ? daySchedItems : {})[dayId] || []).map(function (eid) {
      return { time: val(eid + '_time'), desc: val(eid + '_desc') };
    }).filter(function (e) { return e.time || e.desc; });
  }
  function timeRows(rows, abbr) {
    return '<div class="ssum-times">' + rows.map(function (r, i) {
      return '<div class="ssum-trow"><span class="ssum-t">' + esc(r.time) + '</span><span class="ssum-d">' + esc(r.label) + '</span></div>';
    }).join('') + '</div>';
  }
  function detailRow(label, value) {
    return value ? '<div class="ssum-drow"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>' : '';
  }
  function group(title, inner) {
    return inner ? '<div class="ssum-group"><div class="ssum-gtitle">' + esc(title) + '</div>' + inner + '</div>' : '';
  }

  // ── Day cards ───────────────────────────────────────────────────────────────

  function setup(dayId) {
    var card = $(dayId);
    if (!card || card.querySelector('.ssum')) return;
    var sum = document.createElement('div');
    sum.className = 'ssum';
    card.insertBefore(sum, card.firstChild);
    // Editor chrome (phones only): Done bar on top, Delete day at the bottom.
    var bar = document.createElement('div');
    bar.className = 'ssum-editbar';
    bar.innerHTML = '<span>Edit day</span><button type="button" class="lb accent">Done</button>';
    bar.querySelector('button').onclick = function () { done(dayId); };
    card.insertBefore(bar, sum.nextSibling);
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'lb danger ssum-delete';
    del.innerHTML = ic('trash-2', 'btn-icon') + ' Delete day';
    del.onclick = function () {
      var name = val(dayId + '_label') || 'this day';
      showModal('Delete day', 'Delete "' + name + '"? This cannot be undone.', function () {
        document.body.classList.remove('ssum-editing');
        removeScheduleDay(dayId);
      });
    };
    card.appendChild(del);
    setTimeout(function () { render(dayId); }, 0);
  }

  function render(dayId) {
    var card = $(dayId), sum = card && card.querySelector('.ssum');
    if (!sum) return;
    var dateIso = val(dayId + '_date_iso'), endIso = val(dayId + '_end_date_iso');
    var name = val(dayId + '_label') || 'Untitled activity';
    var catSel = $(dayId + '_category');
    var catText = catSel && catSel.selectedOptions && catSel.selectedOptions[0] && catSel.value ? catSel.selectedOptions[0].textContent : '';
    var main = checked(dayId + '_main_event') && val('project_type') !== 'post_production';
    var abbr = zoneAbbr(dateIso);
    var d = dateIso ? parse(dateIso) : null;
    // Subtitle: day (or range) · day type · time zone of the times shown.
    var sub = [fmtDay(dateIso) + (endIso && endIso > dateIso ? ' to ' + fmtDay(endIso) : ''), catText, abbr].filter(Boolean).join(' · ');

    var entries = schedEntries(dayId);
    var times = keyTimes(dayId);
    var mainHtml = entries.length
      ? timeRows(entries.map(function (e) { return { time: e.time, label: e.desc }; }), abbr)
      : times.length ? timeRows(times, abbr) : '';

    var loc = typeof getDayLoc === 'function' ? getDayLoc(dayId) : null;
    var locName = (loc && loc.name) || val(dayId + '_loc_id');
    var addr = loc && typeof dayLocAddress === 'function' ? dayLocAddress(loc) : '';
    var locHtml = locName || addr
      ? '<a class="ssum-loc" href="' + esc(mapsUrl([locName, addr].filter(Boolean).join(', '))) + '"' + mapsTarget() + '>' +
          ic('map-pin', 'ssum-loc-ic') + '<span><b>' + esc(locName || addr) + '</b>' + (locName && addr ? '<span>' + esc(addr) + '</span>' : '') + '</span></a>'
      : '';

    // More details: everything the main view doesn't show.
    var dTimes = (entries.length ? times.map(function (t) { return detailRow(t.label, t.time); }).join('') : '') +
      detailRow('Breakfast', val(dayId + '_breakfast')) + detailRow('Lunch', val(dayId + '_lunch')) +
      detailRow('Sunrise', val(dayId + '_sunrise')) + detailRow('Sunset', val(dayId + '_sunset'));
    var hosp = (($(dayId + '_hospital') || {}).textContent || '').trim();
    var dLoc = (val(dayId + '_loc_notes') ? '<div class="ssum-note">' + esc(val(dayId + '_loc_notes')) + '</div>' : '') +
      (hosp ? '<div class="ssum-drow ssum-stack"><span>Nearest hospital</span><b>' + esc(hosp).replace(/\n/g, '<br>') + '</b></div>' : '');
    var counts = (($(dayId + '_staff_counts') || {}).textContent || '').trim();
    var dPeople = '<div class="ssum-drow"><span>' + esc(counts || 'Cast & crew') + '</span><button type="button" class="lb ssum-staff">Edit cast &amp; crew</button></div>';
    var yes = function (b) { return b ? 'Yes' : 'No'; };
    var dSettings = detailRow('Client attends in person', yes(checked(dayId + '_client_in_person'))) +
      detailRow('Exclude from call sheet', yes(checked(dayId + '_exclude_callsheet'))) +
      detailRow('Show blacks required', yes(checked(dayId + '_show_blacks'))) +
      (val('project_type') !== 'post_production' ? detailRow('Main event', yes(main)) : '');

    var open = sum.dataset.open === '1';
    sum.innerHTML =
      '<div class="ssum-head">' +
        '<div class="ssum-cal"><div>' + (d ? MON_UP[d.getMonth()] : '---') + '</div><div>' + (d ? d.getDate() : '--') + '</div></div>' +
        '<div class="ssum-titles"><div class="ssum-title">' + esc(name) + (main ? ' <span class="ssum-star" title="Main event">&#9733;</span>' : '') + '</div>' +
          (sub ? '<div class="ssum-sub">' + esc(sub) + '</div>' : '') + '</div>' +
        '<button type="button" class="lb ssum-edit">Edit</button>' +
      '</div>' +
      (mainHtml || locHtml ? '<div class="ssum-main">' + mainHtml + locHtml + '</div>' : '<div class="ssum-main ssum-empty">No times or location yet. Tap Edit to add them.</div>') +
      '<button type="button" class="ssum-more" aria-expanded="' + open + '">More details ' + ic(open ? 'chevron-up' : 'chevron-down', 'ssum-chev') + '</button>' +
      '<div class="ssum-details"' + (open ? '' : ' hidden') + '>' +
        group(entries.length ? 'Times' : 'Meals and light', dTimes) +
        group('Location', dLoc) +
        group('People', dPeople) +
        group('Settings', dSettings) +
        '<button type="button" class="lb ssum-ics">' + ic('calendar-plus', 'btn-icon') + ' Add to my calendar</button>' +
      '</div>';
    sum.querySelector('.ssum-edit').onclick = function () { edit(dayId); };
    sum.querySelector('.ssum-more').onclick = function () { sum.dataset.open = open ? '' : '1'; render(dayId); };
    var st = sum.querySelector('.ssum-staff'); if (st) st.onclick = function () { openDayStaffModal(dayId); };
    var cal = sum.querySelector('.ssum-ics'); if (cal) cal.onclick = function () { generateDayICS(dayId); };
  }

  function edit(dayId) {
    var card = $(dayId);
    if (!card) return;
    card.style.transform = ''; card.style.transition = '';   // a just-added card may still be animating
    card.classList.add('ssum-edit-on');
    document.body.classList.add('ssum-editing');
    card.scrollTop = 0;
  }
  function done(dayId) {
    var card = $(dayId);
    document.body.classList.remove('ssum-editing');
    if (!card) return;
    card.classList.remove('ssum-edit-on');
    render(dayId);
    renderPinned();
    if (typeof autosaveTrigger === 'function') autosaveTrigger();
    card.scrollIntoView({ block: 'center' });
  }

  // "+ Add day" (phones): a new day after the last one, opened straight into the editor.
  function addDay() {
    var before = (typeof scheduleDays !== 'undefined' ? scheduleDays : []).slice();
    var last = before[before.length - 1] || null;
    insertScheduleDay(last);
    var added = (typeof scheduleDays !== 'undefined' ? scheduleDays : []).filter(function (id) { return before.indexOf(id) < 0; })[0];
    if (added) setTimeout(function () { setup(added); edit(added); }, 260);
  }

  // ── Kickoff / Project Due Date ──────────────────────────────────────────────

  var PINNED = [
    { block: 'kickoff-block', title: 'Kickoff', iconName: 'flag', date: 'kickoff_date_iso', time: 'kickoff_time' },
    { block: 'video-due-block', title: 'Project Due Date', iconName: 'film', date: 'video_due_date_iso', time: 'video_due_time' },
  ];
  function renderPinned() {
    PINNED.forEach(function (p) {
      var block = $(p.block);
      if (!block) return;
      var sum = block.querySelector('.ssum-pin');
      if (!sum) {
        sum = document.createElement('div');
        sum.className = 'ssum-pin';
        block.insertBefore(sum, block.firstChild);
      }
      var iso = val(p.date), t = val(p.time), editing = block.classList.contains('ssum-pin-editing');
      var line = [fmtDay(iso) || 'No date yet', t ? t + (zoneAbbr(iso) ? ' ' + zoneAbbr(iso) : '') : ''].filter(Boolean).join(' · ');
      sum.innerHTML = '<div class="ssum-pin-l">' + ic(p.iconName, 'ssum-pin-ic') + '<div><div class="ssum-pin-t">' + esc(p.title) + '</div>' +
        '<div class="ssum-pin-s">' + esc(line) + '</div></div></div>' +
        '<button type="button" class="lb' + (editing ? ' accent' : '') + '">' + (editing ? 'Done' : 'Edit') + '</button>';
      sum.querySelector('button').onclick = function () {
        block.classList.toggle('ssum-pin-editing');
        if (!block.classList.contains('ssum-pin-editing') && typeof autosaveTrigger === 'function') autosaveTrigger();
        renderPinned();
      };
    });
  }

  function renderAll() {
    (typeof scheduleDays !== 'undefined' ? scheduleDays : []).forEach(function (id) { setup(id); render(id); });
    renderPinned();
  }

  window.ScheduleMobile = { setup: setup, render: render, renderAll: renderAll, renderPinned: renderPinned, edit: edit, done: done, addDay: addDay };
  renderAll();
})();
