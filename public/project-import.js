// Bulk project import from a spreadsheet (.xlsx/.xls/.csv).
//
// Deliberately does not touch the currently-open project or the live form
// at all: every row is built into a plain project `data` object (the same
// shape `gather()` produces) in memory, then saved with the existing
// API.saveProject(key, label, data) call -- the exact path a manual
// "New Project" + Save already uses. No new server route, no new data
// shape. Org-name and workback-template matching reuse the same data the
// manual pickers already use (ContactsV2.store, WB_PRESETS, tmplLoad()),
// so a row resolves to a link only when a manual pick would also find it.
//
// Crew, talent, KP and schedule days are intentionally out of scope -- an
// imported project always starts with those empty, same as "New Project".
// Workback is populated only if a template name matches; otherwise it's
// left empty, same as not clicking "Load template".

(function () {
  'use strict';

  var TYPE_LABELS = [
    { value: 'post_production',          label: 'Post Production' },
    { value: 'location_shoot',           label: 'Location Shoot' },
    { value: 'live_broadcast_location',  label: 'Live Broadcast: On Location' },
    { value: 'live_broadcast_studio',    label: 'Live Broadcast: In Studio' },
    { value: 'webinar',                  label: 'Webinar' },
  ];

  // Canonical column name -> accepted header synonyms (normalized: lower,
  // trimmed, collapsed whitespace).
  var COLUMNS = [
    { key: 'title',    label: 'Project Title',      synonyms: ['project title', 'title', 'project name', 'name'] },
    { key: 'type',     label: 'Project Type',       synonyms: ['project type', 'type'] },
    { key: 'agency',   label: 'Agency',             synonyms: ['agency', 'agency name'] },
    { key: 'client',   label: 'Client Company',     synonyms: ['client company', 'client', 'client name', 'company'] },
    { key: 'billing',  label: 'Billing Code',        synonyms: ['billing code', 'billing', 'po number', 'po #', 'po'] },
    { key: 'kickoff',  label: 'Kickoff Date',        synonyms: ['kickoff date', 'kickoff'] },
    { key: 'due',      label: 'Due / Event Date',     synonyms: ['due date', 'video due date', 'due', 'event date', 'go live date', 'live date', 'due / event date', 'due/event date'] },
    { key: 'dueTime',  label: 'Due / Event Time',     synonyms: ['due time', 'video due time', 'event time', 'go live time', 'live time', 'due / event time', 'due/event time'] },
    { key: 'template', label: 'Workback Template',   synonyms: ['workback template', 'template', 'workback'] },
  ];

  function normKey(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function typeByLabel(raw) {
    var k = normKey(raw);
    if (!k) return null;
    var hit = TYPE_LABELS.find(function (t) { return normKey(t.label) === k || t.value === k.replace(/\s+/g, '_'); });
    return hit ? hit.value : null;
  }

  // ---- organization lookup (reuses the already-loaded Contacts store) ----
  // Same rule as the project pickers (project-orgs-v2.js byName): exact
  // name after trim/lowercase, active orgs only, and an ambiguous name
  // never auto-links. Returns { org, count } so the preview can tell
  // "not found" apart from "matches more than one".
  function findOrg(name, requireAgency) {
    var store = window.ContactsV2 && window.ContactsV2.store;
    var k = normKey(name);
    if (!k || !store) return { org: null, count: 0 };
    var hits = Object.keys(store.organizations).map(function (id) { return store.organizations[id]; })
      .filter(function (o) { return !o.archived_at && normKey(o.name) === k && (!requireAgency || o.is_agency); });
    return { org: hits.length === 1 ? hits[0] : null, count: hits.length };
  }
  function orgMissMessage(what, name, count) {
    return count > 1
      ? what + ' "' + name + '" matches ' + count + ' organizations in Contacts -- left unlinked. Rename one of them or pick it on the Project tab.'
      : what + ' "' + name + '" not found in Contacts -- left unlinked.';
  }

  // The user's default agency, exactly as New Project picks it
  // (project-orgs-v2.js applyDefault): only if it's still active and still
  // an agency.
  function defaultAgency() {
    var store = window.ContactsV2 && window.ContactsV2.store;
    if (!store || !store.defaultOrgId) return null;
    var d = store.organizations[store.defaultOrgId];
    return d && !d.archived_at && d.is_agency ? d : null;
  }

  // ---- workback template lookup (built-in presets, then the user's own) ----
  function findTemplate(name) {
    var name2 = String(name || '').trim();
    if (!name2) return null;
    var k = normKey(name2);
    var presetHit = Object.keys(WB_PRESETS).map(function (pk) { return WB_PRESETS[pk]; })
      .find(function (p) { return normKey(p.name) === k; });
    if (presetHit) return presetHit;
    var custom = (typeof tmplLoad === 'function' ? tmplLoad() : []) || [];
    return custom.find(function (t) { return normKey(t.name) === k; }) || null;
  }

  // Same items the "Load template" button makes: wbItemsFromTemplate() in
  // app.js decides the mode (anchor, i.e. "days before"; or, for a legacy
  // all-zero template, the project type's default, which wbAdd() would
  // pick: sequential for Post Production, else anchor). The rest mirrors
  // wbAdd()'s defaults and wbGetItems()'s saved shape.
  function buildWbItems(tmpl, projectType) {
    return wbItemsFromTemplate(tmpl).map(function (it) {
      var mode = it.mode || (projectType === 'post_production' ? 'sequential' : 'anchor');
      return {
        item: it.item || '', owner: it.owner || '', uuid: generateWbUuid(),
        mode: mode, days: it.days, seq_days: 1,
        seq_anchor_uuid: '', manual_date: '',
        status: it.status || 'Not Started', internal: false,
        due: '', dueFmt: '',
      };
    });
  }

  // Matches sd()/syncDayDate() in app.js exactly, so an imported schedule
  // day's display date looks identical to one typed in manually.
  function formatDisplayDate(iso) {
    var d = new Date(iso + 'T12:00:00');
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Date and time cells are read as Excel's raw numbers (days since the
  // workbook epoch, with the time as the fraction) and decoded with
  // SheetJS's own SSF.parse_date_code. That's exact. Letting the library
  // build JavaScript Date objects instead (cellDates) runs the value
  // through the browser time zone, which can shift times by minutes in
  // US zones (the 1899 epoch has odd historical offsets).
  // _date1904 is set per workbook (old Mac Excel files count from 1904).
  var _date1904 = false;

  // 'YYYY-MM-DD' if y/m/d is a real calendar date in a sane year, else null.
  function iso(y, m, d) {
    y = +y; m = +m; d = +d;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function plausibleYear(y) { return y >= 2000 && y <= 2100; }

  // Normalizes a time cell the same way the Kickoff/Due time fields do on
  // blur (normalizeTimeStr in app.js). Returns null if it can't be read.
  function parseTimeCell(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      var p = XLSX.SSF.parse_date_code(v, { date1904: _date1904 });
      if (!p) return null;
      return (p.H % 12 || 12) + ':' + String(p.M).padStart(2, '0') + ' ' + (p.H >= 12 ? 'PM' : 'AM');
    }
    var s = String(v).trim();
    var n = normalizeTimeStr(s);
    // normalizeTimeStr hands back anything it doesn't recognize unchanged;
    // only accept results in its own "h:mm AM/PM" form.
    return /^\d{1,2}:\d{2} (AM|PM)$/.test(n) ? n : null;
  }

  // Returns 'YYYY-MM-DD', '' for blank, or null if it can't be read.
  function parseDateCell(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      var p = XLSX.SSF.parse_date_code(v, { date1904: _date1904 });
      return p && plausibleYear(p.y) ? iso(p.y, p.m, p.d) : null;
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return plausibleYear(+m[1]) ? iso(m[1], +m[2], +m[3]) : null;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); // US m/d/yy or m/d/yyyy
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      return plausibleYear(y) ? iso(y, +m[1], +m[2]) : null;
    }
    var d = new Date(s); // e.g. "December 1, 2026"
    if (!isNaN(d.getTime()) && plausibleYear(d.getFullYear())) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return null;
  }

  // ---- row -> project data (same shape gather() produces) ----
  function buildRow(raw, rowNum) {
    var warnings = [];
    var fatal = [];

    var title = String(raw.title || '').trim();
    if (!title) fatal.push('Missing project title.');

    var projectType = typeByLabel(raw.type);
    if (!projectType) fatal.push('Unrecognized project type "' + (raw.type || '') + '". Must be one of: ' + TYPE_LABELS.map(function (t) { return t.label; }).join(', ') + '.');

    // Blank Agency = the default agency, same as New Project. A named agency
    // that can't be matched is left unlinked (no fallback to the default:
    // the sheet asked for something specific).
    var agencyOrg = null;
    var usedDefaultAgency = false;
    var agencyName = String(raw.agency || '').trim();
    if (agencyName) {
      var am = findOrg(agencyName, true);
      agencyOrg = am.org;
      if (!agencyOrg) warnings.push(orgMissMessage('Agency', agencyName, am.count));
    } else {
      agencyOrg = defaultAgency();
      usedDefaultAgency = !!agencyOrg;
    }

    var clientOrg = null;
    var clientName = String(raw.client || '').trim();
    if (clientName) {
      var cm = findOrg(clientName, false);
      clientOrg = cm.org;
      if (!clientOrg) warnings.push(orgMissMessage('Client company', clientName, cm.count));
    }

    var kickoffIso = '';
    if (String(raw.kickoff || '').trim()) {
      var k = parseDateCell(raw.kickoff);
      if (k === null) warnings.push('Could not read Kickoff Date "' + raw.kickoff + '" -- left blank.');
      else kickoffIso = k;
    }

    // "Due / Event Date" means different things by project type, same as
    // the two pinned date fields already do in the app: Post Production
    // has a single pinned Due Date; every other type's equivalent is an
    // event/go-live day on the Schedule tab. For non-Post-Production
    // types this creates exactly one schedule day -- the same minimal day
    // a user would add by hand with just a date and go-live time filled
    // in -- which also gives the workback template a real event date to
    // anchor to instead of falling back to Kickoff Date.
    var dueIso = '';
    var dueTimeNorm = '';
    var scheduleDay = null;
    if (String(raw.due || '').trim()) {
      var dd = parseDateCell(raw.due);
      if (dd === null) warnings.push('Could not read Due / Event Date "' + raw.due + '" -- left blank.');
      else dueIso = dd;
    }
    if (String(raw.dueTime || '').trim()) {
      if (!dueIso) warnings.push('Due / Event Time given without a Due / Event Date -- ignored.');
      else {
        var t = parseTimeCell(raw.dueTime);
        if (t === null) warnings.push('Could not read Due / Event Time "' + raw.dueTime + '" -- left blank.');
        else dueTimeNorm = t;
      }
    }
    if (dueIso) {
      if (projectType === 'post_production') {
        // handled below, written straight to video_due_date_iso/_time
      } else {
        // sday_1: the project's only day. Ids are per project, and on load
        // addScheduleDay keeps an sday_<n> id and moves its counter past it.
        scheduleDay = {
          id: 'sday_1', date_iso: dueIso, date: formatDisplayDate(dueIso),
          end_date_iso: '', end_date: '', label: '', call_time: '',
          golive: dueTimeNorm, wrap: '', breakfast: '', lunch: '', sunrise: '', sunset: '',
          loc_id: '', loc_name: '', location_id: undefined, hospital: '', loc_notes: '',
          show_blacks: false, exclude_callsheet: false, client_remote: false,
          excluded_crew: [], excluded_talent: [], excluded_kp: [],
          category: 'shoot_day', f1_label: '', f2_label: '', f3_label: '', sched_entries: [],
        };
      }
    }

    var wbItems = [];
    var tmplName = String(raw.template || '').trim();
    if (tmplName) {
      var tmpl = findTemplate(tmplName);
      if (!tmpl) {
        warnings.push('Workback template "' + tmplName + '" not found -- workback left empty.');
      } else {
        wbItems = buildWbItems(tmpl, projectType || 'location_shoot');
        // Template items count back from the anchor: the Due Date for Post
        // Production, the event day for everything else. Without one the
        // app anchors to Kickoff Date, i.e. counts back from the kickoff.
        var anchored = projectType === 'post_production' ? !!dueIso : !!scheduleDay;
        if (projectType && !anchored) {
          warnings.push(projectType === 'post_production'
            ? 'No Due Date given, so workback dates will count back from the Kickoff Date. Set the Due Date on the Schedule tab, then review workback dates.'
            : 'No Due / Event Date given, so workback dates will count back from the Kickoff Date rather than the event date. Add a Due / Event Date (or a schedule day on the Schedule tab), then review workback dates.');
          if (!kickoffIso) warnings.push('No Kickoff Date given either -- workback items will show with no computed date until one is set.');
        }
      }
    }

    var billing = String(raw.billing || '').trim();
    var data = null;
    if (!fatal.length) {
      data = {
        project_type: projectType,
        doc_branding: 'agency',
        project_title: title,
        client: clientOrg ? clientOrg.name : String(raw.client || '').trim(),
        client_company: clientOrg ? clientOrg.name : String(raw.client || '').trim(),
        client_name: '',
        billing_code: billing,
        kp_cards: getDefaultKP(),
        hospital: '', breakfast: '8:00 am', lunch: '12:00 pm', sunrise: '', sunset: '',
        crew: [],
        crew_summary: { tbd: 0, contacted: 0, pencil: 0, hold: 0, confirmed: 0, declined: 0, total: 0 },
        talent: [],
        // New Project's rule: 'PT', unless the default agency was applied and
        // it has a timezone (applyAgencyDefaults in app.js). An agency named
        // in the sheet doesn't change it, same as picking one by hand.
        timezone: (usedDefaultAgency && agencyOrg.timezone && agencyOrg.timezone !== 'none') ? agencyOrg.timezone : 'PT',
        kickoff_date_iso: kickoffIso, kickoff_time: '',
        video_due_date_iso: projectType === 'post_production' ? dueIso : '',
        video_due_time: projectType === 'post_production' ? dueTimeNorm : '',
        schedule_days: scheduleDay ? [scheduleDay] : [],
        wb_day_select: '', wb_direction: 'back',
        wb_items: wbItems, wb_items_for_doc: [],
        internal_pins: {}, closeout: {},
        urls: [], expenses: [], notes: [],
        agency_org_id: agencyOrg ? agencyOrg.id : null,
        client_org_id: clientOrg ? clientOrg.id : null,
      };
      // Same label a manual Save gives it ("Company | Title | 12/01/26"):
      // the Rundown and the project list read the date off the end of it.
      data.label = libLabel(data);
    }

    return {
      rowNum: rowNum, title: title, label: data ? data.label : '', raw: raw, data: data,
      warnings: warnings, fatal: fatal, include: !fatal.length,
      agencyNote: usedDefaultAgency ? 'Default agency: ' + agencyOrg.name : '',
    };
  }

  // ---- spreadsheet parsing ----
  function remapHeaders(sheetRows) {
    if (!sheetRows.length) return { rows: [], notes: [] };
    var sampleKeys = Object.keys(sheetRows[0]);
    var map = {}; // original header -> canonical key
    sampleKeys.forEach(function (h) {
      var nk = normKey(h);
      var col = COLUMNS.find(function (c) { return c.synonyms.indexOf(nk) !== -1; });
      if (col) map[h] = col.key;
    });
    var rows = [];
    sheetRows.forEach(function (row) {
      var out = {};
      Object.keys(row).forEach(function (h) { if (map[h]) out[map[h]] = row[h]; });
      // Rows with nothing in any recognized column (e.g. only a notes
      // column filled in, or leftover formatting) are skipped silently.
      if (!Object.keys(out).some(function (k) { return String(out[k]).trim() !== ''; })) return;
      // SheetJS's __rowNum__ is the 0-based sheet row, so the preview's
      // "Row" matches the row number shown in Excel even after skips.
      out.__row = (typeof row.__rowNum__ === 'number') ? row.__rowNum__ + 1 : null;
      rows.push(out);
    });
    // File-level notes for the preview: headers that weren't recognized,
    // and two headers that mean the same column (only the last one is used).
    var notes = [];
    var ignored = sampleKeys.filter(function (h) { return !map[h] && !/^__EMPTY/.test(h); });
    if (ignored.length) notes.push('Ignored columns (not recognized): ' + ignored.join(', ') + '.');
    COLUMNS.forEach(function (c) {
      var dupes = sampleKeys.filter(function (h) { return map[h] === c.key; });
      if (dupes.length > 1) notes.push('Columns ' + dupes.join(' and ') + ' both mean "' + c.label + '"; only "' + dupes[dupes.length - 1] + '" was used.');
    });
    if (!sampleKeys.some(function (h) { return map[h] === 'title'; })) notes.push('No "Project Title" column found. Check the first row of the sheet holds the column headers.');
    return { rows: rows, notes: notes };
  }

  // Existing project labels (lowercased), for the duplicate check. Same
  // comparison a manual Save makes before it asks "Overwrite existing
  // sheet?". Falls back to this browser's project list if the server can't
  // be reached.
  function existingLabels() {
    return API.getProjects().then(function (list) {
      if (!list) list = Object.keys(libLoad()).map(function (k) { return { label: libLoad()[k].label }; });
      var set = {};
      list.forEach(function (p) { if (p.label) set[normKey(p.label)] = true; });
      return set;
    });
  }

  // Unchecks (but doesn't block) rows that would duplicate an existing
  // project or an earlier row in the same file.
  function flagDuplicates(rows, existing) {
    var seen = {};
    rows.forEach(function (r) {
      if (!r.data) return;
      var k = normKey(r.label);
      if (existing[k]) {
        r.warnings.unshift('A project named "' + r.label + '" already exists. Left unchecked so it isn\'t imported twice; tick it to import anyway (this adds a second project, it doesn\'t overwrite).');
        r.include = false;
      } else if (seen[k]) {
        r.warnings.unshift('Same project as row ' + seen[k] + ' in this file. Left unchecked; tick it to import anyway.');
        r.include = false;
      }
      if (!seen[k]) seen[k] = r.rowNum;
    });
  }

  function downloadSampleTemplate() {
    var headerRow = COLUMNS.map(function (c) { return c.label; });
    var sample = [
      ['Fall Keynote Shoot', 'Location Shoot', 'Acme Agency', 'Acme Corp', 'PO-1234', '2026-11-20', '2026-12-01', '9:00 AM', 'Location Shoot (Preset)'],
      ['Q1 Highlight Video', 'Post Production', '', 'Acme Corp', '', '2026-12-10', '2027-01-15', '5:00 PM', 'Post Production (Preset)'],
    ];
    var ws = XLSX.utils.aoa_to_sheet([headerRow].concat(sample));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, 'Slater Project Import Template.xlsx');
  }

  // ---- modal state/rendering ----
  var _rows = [];
  var _fileName = '';
  var _fileNotes = [];
  var _busy = false; // an import is saving; don't let a reopen reset it

  function open() {
    if (_busy) { document.getElementById('import-modal').classList.add('open'); return; }
    _rows = []; _fileName = ''; _fileNotes = [];
    if (typeof window.XLSX === 'undefined') {
      renderError('The spreadsheet library did not load. Refresh the page and try again.');
    } else {
      renderPick();
      // Warm the contacts cache so org matching has fresh data; harmless if
      // it's already loaded or if offline (matching just falls back to
      // "not found" and the row is flagged, same as today).
      if (window.ContactsV2 && typeof window.ContactsV2.sync === 'function') {
        window.ContactsV2.sync().catch(function () {});
      }
    }
    document.getElementById('import-modal').classList.add('open');
  }

  function close() {
    document.getElementById('import-modal').classList.remove('open');
  }

  function renderError(msg) {
    document.getElementById('import-body').innerHTML = '<p style="color:var(--accent)">' + esc(msg) + '</p>';
    document.getElementById('import-foot').innerHTML = '<button class="lb" onclick="ProjectImport.close()">Close</button>';
  }

  function renderPick() {
    var colList = COLUMNS.map(function (c, i) {
      var req = (c.key === 'title' || c.key === 'type') ? ' <strong>(required)</strong>' : '';
      return '<li><strong>' + esc(c.label) + '</strong>' + req + '</li>';
    }).join('');
    document.getElementById('import-body').innerHTML =
      '<p style="margin-top:0">Import several projects at once from a spreadsheet. Each row becomes a new project ' +
      '-- crew, talent and detailed scheduling are not imported and are left empty, same as starting a project from scratch. ' +
      'Workback only fills in if the Workback Template column names a template you already have.</p>' +
      '<p style="font-size:12px;color:var(--film-can)">"Due / Event Date" means different things by project type: for Post Production it sets the ' +
      'pinned Due Date; for every other type it creates a single schedule day (the event/go-live day) so a Workback Template has a real event date to anchor to, ' +
      'instead of falling back to Kickoff Date.</p>' +
      '<p style="font-size:12px;color:var(--film-can)">Columns (first row = headers, any order):</p>' +
      '<ul style="font-size:12px;color:var(--text-primary);margin-top:0">' + colList + '</ul>' +
      '<p style="margin-bottom:8px"><button class="lb" onclick="ProjectImport._downloadSample()"><i data-lucide="download" class="lucide btn-icon"></i> Download sample template</button></p>' +
      '<input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" style="display:block" onchange="ProjectImport._onFile(this)">' +
      '<div id="import-pick-status" style="margin-top:8px;font-size:12px;color:var(--film-can)"></div>';
    document.getElementById('import-foot').innerHTML = '<button class="lb" onclick="ProjectImport.close()">Cancel</button>';
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function onFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    _fileName = file.name;
    var status = document.getElementById('import-pick-status');
    if (status) status.textContent = 'Reading ' + file.name + '...';
    var reader = new FileReader();
    reader.onload = function (ev) {
      var parsed, sheetName;
      try {
        // Raw cell values: dates and times stay Excel numbers, decoded
        // exactly in parseDateCell / parseTimeCell (see note there).
        var wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        _date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
        sheetName = wb.SheetNames[0];
        var json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: true, blankrows: false });
        parsed = remapHeaders(json);
      } catch (e) {
        if (status) status.textContent = 'Could not read that file: ' + e.message;
        return;
      }
      if (!parsed.rows.length) {
        if (status) status.textContent = 'No rows found in "' + sheetName + '". Check the file has a header row and at least one data row.';
        return;
      }
      if (status) status.textContent = 'Checking against your Contacts and projects...';
      // Org matching needs the Contacts store loaded (right after login it
      // may not be yet), and the duplicate check needs the project list.
      // If either fails, carry on: matching then reports "not found" and
      // duplicates go unflagged, rather than blocking the import.
      var contactsReady = (window.ContactsV2 && typeof window.ContactsV2.sync === 'function')
        ? window.ContactsV2.sync().catch(function () {}) : Promise.resolve();
      Promise.all([contactsReady, existingLabels().catch(function () { return {}; })]).then(function (res) {
        _fileNotes = parsed.notes;
        if (window.ContactsV2 && window.ContactsV2.store && !window.ContactsV2.store.loaded) {
          _fileNotes = _fileNotes.concat(['Your Contacts could not be loaded, so agencies and clients could not be matched. Close this, check your connection, and try again.']);
        }
        _rows = parsed.rows.map(function (r, i) { return buildRow(r, r.__row || i + 2); }); // fallback: header is row 1
        flagDuplicates(_rows, res[1]);
        renderPreview();
      });
    };
    reader.onerror = function () { if (status) status.textContent = 'Could not read that file.'; };
    reader.readAsArrayBuffer(file);
  }

  function renderPreview() {
    var okCount = _rows.filter(function (r) { return r.include; }).length;
    var rowsHtml = _rows.map(function (r, idx) {
      var typeLabel = (TYPE_LABELS.find(function (t) { return t.value === (r.data && r.data.project_type); }) || {}).label || esc(r.raw.type || '');
      var issues = r.fatal.concat(r.warnings);
      var issuesHtml = issues.length
        ? '<div style="font-size:11px;color:' + (r.fatal.length ? 'var(--accent)' : 'var(--accent-yellow)') + ';margin-top:2px">' + issues.map(esc).join('<br>') + '</div>'
        : '<div style="font-size:11px;color:#1baf7a;margin-top:2px">Ready</div>';
      if (r.agencyNote && r.data) issuesHtml += '<div style="font-size:11px;color:var(--film-can);margin-top:2px">' + esc(r.agencyNote) + '</div>';
      // Show the name it will actually get in the project list.
      var nameHtml = esc(r.title || '(no title)') +
        (r.label && r.label !== r.title ? '<div style="font-size:11px;color:var(--film-can);margin-top:2px">' + esc(r.label) + '</div>' : '');
      var checkbox = r.fatal.length
        ? '<input type="checkbox" disabled title="Fix this row in the spreadsheet and re-upload">'
        : '<input type="checkbox" ' + (r.include ? 'checked' : '') + ' onchange="ProjectImport._toggleRow(' + idx + ', this.checked)">';
      return '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:6px 8px;text-align:center">' + checkbox + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;color:var(--film-can)">' + r.rowNum + '</td>' +
        '<td style="padding:6px 8px;font-size:12px">' + nameHtml + '</td>' +
        '<td style="padding:6px 8px;font-size:12px">' + esc(typeLabel) + '</td>' +
        '<td style="padding:6px 8px">' + issuesHtml + '</td>' +
        '</tr>';
    }).join('');

    var notesHtml = _fileNotes.length
      ? '<div style="font-size:12px;color:var(--accent-yellow);margin-bottom:8px">' + _fileNotes.map(esc).join('<br>') + '</div>' : '';
    document.getElementById('import-body').innerHTML =
      '<p style="margin-top:0;font-size:12px;color:var(--film-can)">' + esc(_fileName) + ': ' + _rows.length + ' row(s) found, ' + okCount + ' selected to import.</p>' +
      notesHtml +
      '<div style="max-height:40vh;overflow-y:auto;border:1px solid var(--border);border-radius:6px">' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface-2);text-align:left">' +
      '<th style="padding:6px 8px;font-size:11px">Import</th><th style="padding:6px 8px;font-size:11px">Row</th>' +
      '<th style="padding:6px 8px;font-size:11px">Title</th><th style="padding:6px 8px;font-size:11px">Type</th>' +
      '<th style="padding:6px 8px;font-size:11px">Notes</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div id="import-progress" style="margin-top:10px;font-size:12px;color:var(--film-can)"></div>';

    document.getElementById('import-foot').innerHTML =
      '<button class="lb" onclick="ProjectImport._backToPick()">Back</button>' +
      '<button class="lb" onclick="ProjectImport.close()">Cancel</button>' +
      '<button class="lb primary" id="import-commit-btn" onclick="ProjectImport._commit()">Import ' + okCount + ' project' + (okCount === 1 ? '' : 's') + '</button>';
  }

  function toggleRow(idx, checked) {
    if (_rows[idx]) _rows[idx].include = checked;
    var btn = document.getElementById('import-commit-btn');
    if (btn) {
      var n = _rows.filter(function (r) { return r.include; }).length;
      btn.textContent = 'Import ' + n + ' project' + (n === 1 ? '' : 's');
    }
  }

  function backToPick() { renderPick(); }

  function commit() {
    var toImport = _rows.filter(function (r) { return r.include && r.data; });
    if (!toImport.length) return;
    _busy = true;
    // Lock the whole footer (Back/Cancel too) while saving.
    document.getElementById('import-foot').innerHTML = '<button class="lb primary" disabled>Importing...</button>';
    document.querySelectorAll('#import-body input[type=checkbox]').forEach(function (cb) { cb.disabled = true; });
    var progressEl = document.getElementById('import-progress');
    var created = [];
    var failed = [];
    var baseTs = Date.now();

    function next(i) {
      if (i >= toImport.length) return finish();
      var r = toImport[i];
      if (progressEl) progressEl.textContent = 'Importing ' + (i + 1) + ' of ' + toImport.length + ': ' + r.title + '...';
      // Not doSave()'s plain "cs_<Date.now()>": a fast batch runs ahead of
      // the clock, so a manual Save a moment later could produce the same
      // key, and the server treats a same-owner key as an update, i.e. it
      // would overwrite the imported project. The suffix rules that out.
      // Nothing parses project keys beyond the "cs_" prefix.
      var key = 'cs_' + baseTs + '_' + i + '_' + Math.random().toString(36).slice(2, 7);
      r.data.savedAt = Date.now(); // doSave() stamps this too
      API.saveProject(key, r.label, r.data).then(function (result) {
        if (result && result.key) created.push(r);
        else failed.push(r.title + ' (server did not confirm the save)');
        next(i + 1);
      }, function () {
        failed.push(r.title + ' (network error)');
        next(i + 1);
      });
    }

    function finish() {
      _busy = false;
      if (typeof libRefreshDropdown === 'function') libRefreshDropdown(currentSheetKey || null);
      // Same refresh used after login: repopulates _allProjectsCache so
      // Rundown / booking conflicts / Projects Overview see the new
      // projects without the user needing to reload the page.
      if (created.length && typeof fetchAllProjectsForRundown === 'function') fetchAllProjectsForRundown();
      var skipped = _rows.filter(function (r) { return !r.include; }).length;
      var html = '<p style="margin-top:0">Imported <strong>' + created.length + '</strong> of ' + toImport.length + ' selected project(s).</p>';
      if (failed.length) html += '<p style="color:var(--accent)">Failed: ' + failed.map(esc).join(', ') + '</p>';
      if (skipped) html += '<p style="color:var(--film-can);font-size:12px">' + skipped + ' row(s) were left out (unchecked or had errors) and were not imported.</p>';
      // The preview's warnings, kept for the projects that were actually
      // created, so the follow-up list survives closing the preview.
      // (Duplicate notes are dropped: a ticked duplicate was a choice.)
      var followUps = created.map(function (r) {
        var w = r.warnings.filter(function (x) { return !/already exists|Same project as row/.test(x); });
        return w.length ? '<li><strong>' + esc(r.label) + '</strong><br>' + w.map(esc).join('<br>') + '</li>' : '';
      }).join('');
      if (followUps) html += '<p style="margin-bottom:4px">Needs a look:</p><ul style="font-size:12px;color:var(--accent-yellow);margin-top:0">' + followUps + '</ul>';
      html += '<p style="font-size:12px;color:var(--film-can)">New projects: Crew and Talent are intentionally left empty by this import. On the Schedule tab, only the single event/go-live day from the Due / Event Date column (if given) was created -- add any other shoot days, locations and call times by hand, then review workback dates if a template was applied.</p>';
      document.getElementById('import-body').innerHTML = html;
      document.getElementById('import-foot').innerHTML = '<button class="lb primary" onclick="ProjectImport.close()">Done</button>';
      if (typeof setStatus === 'function') setStatus('Imported ' + created.length + ' project(s).', failed.length ? 'err' : 'ok');
    }

    next(0);
  }

  window.ProjectImport = {
    open: open,
    close: close,
    _onFile: onFile,
    _toggleRow: toggleRow,
    _backToPick: backToPick,
    _commit: commit,
    _downloadSample: downloadSampleTemplate,
  };
})();
