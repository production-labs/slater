// Project people + schedule locations on v2 (data-model-rewrite, Session 5)
//
// Only active with the v2 contacts flag (?contacts=v2). Flag off: this file
// does nothing and the old name autocomplete (contacts blob buckets) and the
// old location list are used.
//
// Crew, talent and key personnel cards (app.js addCrew / addTalent / addKP):
//   - Name field: searches ALL v2 contacts; people with a role in the card's
//     category (crew / talent / staff for key personnel) are listed first.
//     Picking one fills name, phone and email and links the card
//     (hidden <id>_contact_id). Typing over the name drops the link.
//     A name that isn't a contact offers "+ Add ... to contacts".
//   - Role field (crew Position, key personnel Role): picker over built-in
//     and custom roles, card's category first. Picking writes the role's
//     abbreviation (else its name) and links it (hidden <id>_role_id). Free
//     text still works; an exact name/abbreviation match links on blur.
//   - Talent Title stays free text (a job title, not a role). Picking a
//     contact fills it from the contact's title (else their talent role) and
//     links their first talent role.
//   - The card keeps the text it was saved with (that's what docs print).
//     When the linked contact has changed since (<id>_contact_ack holds the
//     contact's updated_at the card last agreed with), the card shows
//     "Details changed in Contacts" with Update / Dismiss.
//
// Projects saved before Session 5 are linked on load the way the Session 6
// migration will: a contact or location by exact name (trim + lowercase,
// only when exactly one matches), a role by exact name or abbreviation. The
// card text is not changed, and contact_ack is set at link time so existing
// differences don't prompt. Like Session 4, these links are saved with the
// project's next save, not immediately.
//
// Schedule days: app.js reads locations through ProjectPeopleV2.locations()
// / location() / locationByName() and stores <day>_location_id.

(function () {
  'use strict';
  if (typeof orgsV2On !== 'function' || !orgsV2On()) return;

  var CV2 = window.ContactsV2;
  if (!CV2) { console.warn('project-people-v2: ContactsV2 missing'); return; }
  var store = CV2.store;

  // card kind -> role field suffix + role category
  var KINDS = {
    crew:   { roleField: '_position', cat: 'crew',   label: 'crew' },
    talent: { roleField: null,        cat: 'talent', label: 'talent' },
    kp:     { roleField: '_role',     cat: 'staff',  label: 'key personnel' },
  };
  function kindOf(id) { return KINDS[String(id).split('_')[0]] ? String(id).split('_')[0] : null; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }
  function setVal(id, v) { var e = el(id); if (e) e.value = v == null ? '' : String(v); }
  // app.js keeps these as top-level `let`s: shared by name, not on window.
  function cardIds() {
    /* global kp, crew, talent, scheduleDays */
    return [].concat(typeof kp !== 'undefined' ? kp : [], typeof crew !== 'undefined' ? crew : [], typeof talent !== 'undefined' ? talent : []);
  }
  function dayIds() { return typeof scheduleDays !== 'undefined' ? scheduleDays.slice() : []; }
  function all(table) {
    return Object.keys(store[table]).map(function (k) { return store[table][k]; });
  }
  function active(table) { return all(table).filter(function (r) { return !r.archived_at; }); }
  function saved() { if (typeof autosaveTrigger === 'function') autosaveTrigger(); }
  function status(msg, kind) { if (typeof setStatus === 'function') setStatus(msg, kind || 'ok'); }

  // ------------------------------------------------------------------ roles
  function role(id) { return id ? store.roles[id] || null : null; }
  function roleText(r) { return r ? (r.abbreviation || r.name) : ''; }
  // Exact name or abbreviation. Several hits: prefer the card's category,
  // then built-in roles; still ambiguous = no link.
  function roleByText(text, cat) {
    var k = key(text);
    if (!k) return null;
    var hits = active('roles').filter(function (r) { return key(r.name) === k || key(r.abbreviation) === k; });
    if (hits.length > 1) { var inCat = hits.filter(function (r) { return r.category === cat; }); if (inCat.length) hits = inCat; }
    if (hits.length > 1) { var glob = hits.filter(function (r) { return r.is_global; }); if (glob.length) hits = glob; }
    return hits.length === 1 ? hits[0] : null;
  }
  function contactRoles(c) { return (c.role_ids || []).map(role).filter(Boolean); }
  function firstRoleIn(c, cat) { return contactRoles(c).filter(function (r) { return r.category === cat; })[0] || null; }

  // --------------------------------------------------------------- contacts
  function contact(id) { return id ? store.contacts[id] || null : null; }
  function contactByName(name) {
    var k = key(name);
    if (!k) return null;
    var hits = active('contacts').filter(function (c) { return key(c.name) === k; });
    return hits.length === 1 ? hits[0] : null; // duplicates never auto-link
  }

  // Linked rows missing from the store (archived) are fetched once.
  var fetched = {};
  function ensure(table, id) {
    if (!id || !store.loaded || store[table][id] || fetched[table + id]) return;
    fetched[table + id] = 'loading';
    CV2.fetchOne(table, id).then(function (row) {
      fetched[table + id] = row ? 'ok' : 'gone';
    }, function () { delete fetched[table + id]; });
  }

  // ------------------------------------------------------- card link state
  function link(id) {
    return { contactId: Number(val(id + '_contact_id')) || null, roleId: Number(val(id + '_role_id')) || null, ack: val(id + '_contact_ack') };
  }
  function setLink(id, c, roleId) {
    setVal(id + '_contact_id', c ? c.id : '');
    setVal(id + '_contact_ack', c ? c.updated_at : '');
    if (roleId !== undefined) setVal(id + '_role_id', roleId || '');
  }

  // What the card would show if it followed the contact right now.
  function expected(id, c) {
    var e = { name: c.name || '', phone: c.phone || '', email: c.email || '' };
    if (kindOf(id) === 'talent') { var tr = firstRoleIn(c, 'talent'); e.title = c.title || (tr ? tr.name : ''); }
    return e;
  }
  var FIELD_LABEL = { name: 'name', phone: 'phone', email: 'email', title: 'title' };
  function differences(id, c) {
    var e = expected(id, c), out = [];
    Object.keys(e).forEach(function (f) {
      if (key(val(id + '_' + f)) !== key(e[f])) out.push(f);
    });
    return out;
  }

  // ------------------------------------------------------------ name picker
  var openList = null; // the one list currently open

  function attach(id) {
    var kind = kindOf(id);
    if (!kind) return;
    // Attaching wraps the inputs (moves them in the page), which would drop
    // the cursor of someone typing. If a field of this card has focus, wait.
    var act = document.activeElement, rf0 = KINDS[kind].roleField;
    if (act && !act._pv2 && (act.id === id + '_name' || (rf0 && act.id === id + rf0))) {
      if (!act._pv2wait) {
        act._pv2wait = true;
        act.addEventListener('blur', function () { act._pv2wait = false; setTimeout(function () { attach(id); }, 0); }, { once: true });
      }
      return;
    }
    var nameEl = el(id + '_name');
    if (nameEl && !nameEl._pv2) attachName(id, kind, nameEl);
    var rf = KINDS[kind].roleField;
    var roleEl = rf && el(id + rf);
    if (roleEl && !roleEl._pv2) attachRole(id, kind, roleEl);
    if (store.loaded) renderCard(id);
  }

  function makeList(input, extraClass) {
    var wrap = document.createElement('div'); wrap.className = 'ac-wrap' + (extraClass ? ' ' + extraClass : '');
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    var list = document.createElement('div'); list.className = 'ac-list pv2-list'; wrap.appendChild(list);
    return list;
  }
  function keyNav(input, list, state) {
    input.addEventListener('keydown', function (e) {
      if (!list.classList.contains('open')) return;
      var items = list.querySelectorAll('.ac-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); state.idx = Math.min(state.idx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.idx = Math.max(state.idx - 1, 0); }
      else if (e.key === 'Enter' && state.idx >= 0 && items[state.idx]) { e.preventDefault(); items[state.idx].dispatchEvent(new MouseEvent('mousedown', { cancelable: true })); return; }
      else if (e.key === 'Escape') { close(list, state); return; }
      else return;
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', i === state.idx);
      if (items[state.idx]) items[state.idx].scrollIntoView({ block: 'nearest' });
    });
  }
  function close(list, state) { list.classList.remove('open'); if (state) state.idx = -1; if (openList === list) openList = null; }
  function show(list, state) {
    if (openList && openList !== list) openList.classList.remove('open');
    state.idx = -1;
    list.classList.toggle('open', list.children.length > 0);
    openList = list.children.length ? list : null;
  }
  function item(list, html, cls, onPick) {
    var d = document.createElement('div'); d.className = 'ac-item' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    // mousedown + preventDefault: pick before the input's blur closes the list
    d.addEventListener('mousedown', function (e) { e.preventDefault(); onPick(); });
    list.appendChild(d);
  }

  function attachName(id, kind, nameEl) {
    nameEl._pv2 = true;
    var list = makeList(nameEl), st = { idx: -1 };
    var cat = KINDS[kind].cat;

    // Card has a linked role (crew / key personnel): only people with that
    // role, listed even before typing. "Show all contacts" lifts the filter
    // until the list closes.
    function roleFilter() {
      var r = kind === 'talent' ? null : role(link(id).roleId);
      return r && !st.showAll ? r : null;
    }
    function matches(q) {
      var k = key(q), rf = roleFilter();
      var pool = active('contacts');
      if (rf) pool = pool.filter(function (c) { return (c.role_ids || []).indexOf(rf.id) !== -1; });
      else if (!k) return [];
      var hits = !k ? pool : pool.filter(function (c) {
        return key(c.name).indexOf(k) !== -1 || key(c.sort_last_name).indexOf(k) === 0;
      });
      hits.sort(function (a, b) {
        var ca = firstRoleIn(a, cat) ? 0 : 1, cb = firstRoleIn(b, cat) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        var sa = key(a.name).indexOf(k) === 0 ? 0 : 1, sb = key(b.name).indexOf(k) === 0 ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return key(a.name) < key(b.name) ? -1 : key(a.name) > key(b.name) ? 1 : 0;
      });
      return hits.slice(0, roleFilter() && !k ? 50 : 8);
    }
    function render() {
      list.innerHTML = '';
      var q = nameEl.value, k = key(q), rf = roleFilter();
      var cardRole = kind === 'talent' ? null : role(link(id).roleId);
      if (!store.loaded || (!k && !rf)) { close(list, st); return; }
      if (rf) {
        var h = document.createElement('div'); h.className = 'pv2-group'; h.textContent = 'People with the role ' + rf.name; list.appendChild(h);
      }
      var ms = matches(q);
      ms.forEach(function (c) {
        var roles = contactRoles(c).map(roleText).join(', ');
        item(list, '<strong>' + esc(c.name) + '</strong><span>' + esc([roles, c.phone, c.email].filter(Boolean).join(' \u00b7 ')) + '</span>', '', function () { pick(c); });
      });
      if (rf && !ms.length) {
        var none = document.createElement('div'); none.className = 'pv2-empty';
        none.textContent = k ? 'No one with this role matches "' + q.trim() + '".' : 'No one in Contacts has this role yet.';
        list.appendChild(none);
      }
      if (k && !active('contacts').some(function (c) { return key(c.name) === k; })) {
        item(list, '<strong>+ Add "' + esc(q.trim()) + '" to contacts</strong>', 'po2-add', function () { addTyped(); });
      }
      if (cardRole) {
        item(list, st.showAll ? 'Only people with the role ' + esc(cardRole.name) : 'Show all contacts', 'pv2-more', function () { st.showAll = !st.showAll; render(); });
      }
      show(list, st);
    }
    function pick(c) {
      close(list, st);
      // Keep the browser from autofilling the other fields after a pick.
      var others = document.querySelectorAll('input[autocomplete="new-password"]');
      others.forEach(function (o) { if (o !== nameEl) o.setAttribute('readonly', ''); });
      fillFromContact(id, c, true);
      setTimeout(function () { others.forEach(function (o) { o.removeAttribute('readonly'); }); }, 200);
      saved();
    }
    function addTyped() {
      close(list, st);
      var name = nameEl.value.trim();
      if (!name) return;
      var existing = contactByName(name);
      if (existing) { pick(existing); return; }
      var l = link(id);
      var fields = { name: name, phone: val(id + '_phone').trim(), email: val(id + '_email').trim() };
      if (kind === 'talent') fields.title = val(id + '_title').trim();
      var r = role(l.roleId);
      if (r && !r.archived_at && kind !== 'talent') fields.role_ids = [r.id];
      CV2.createContact(fields).then(function (row) {
        setLink(id, row);
        if (kind === 'talent') setVal(id + '_role_id', '');
        renderCard(id);
        saved();
        status('Added "' + row.name + '" to contacts.');
      }, function (e) { status('Could not add contact: ' + e.message, 'err'); });
    }

    nameEl.addEventListener('input', function () {
      // Editing the name breaks the link until a contact is picked again.
      if (link(id).contactId) {
        // A different person is being typed in: clear what came from the
        // old contact so it can't stick to the new name (or be saved with
        // it by "+ Add to contacts"). Edits made on the card are kept.
        clearFromContact(id, contact(link(id).contactId));
        setLink(id, null);
        if (kind === 'talent') setVal(id + '_role_id', '');
        renderCard(id);
      }
      render();
    });
    function openOnEntry() { if (!link(id).contactId && (key(nameEl.value) || roleFilter())) render(); }
    nameEl.addEventListener('focus', openOnEntry);
    nameEl.addEventListener('click', function () { if (!list.classList.contains('open')) openOnEntry(); });
    nameEl.addEventListener('blur', function () {
      close(list, st);
      st.showAll = false;
      // Exact name of one contact: link it, keep what's typed in the card.
      if (!link(id).contactId && store.loaded) {
        var c = contactByName(nameEl.value);
        if (c) { linkQuietly(id, c); fillEmpty(id, c); renderCard(id); saved(); }
      }
    });
    keyNav(nameEl, list, st);
  }

  // Picked from the list: the card takes the contact's details.
  function fillFromContact(id, c, fromPick) {
    var kind = kindOf(id);
    setVal(id + '_name', c.name);
    setVal(id + '_phone', c.phone || '');
    setVal(id + '_email', c.email || '');
    if (kind === 'talent') {
      var tr = firstRoleIn(c, 'talent');
      setVal(id + '_title', c.title || (tr ? tr.name : ''));
      setLink(id, c, tr ? tr.id : null);
    } else {
      setLink(id, c);
      // An empty role slot takes the person's role in this category.
      var rf = KINDS[kind].roleField;
      if (fromPick && !val(id + rf).trim()) {
        var r = firstRoleIn(c, KINDS[kind].cat);
        if (r) { setVal(id + rf, roleText(r)); setVal(id + '_role_id', r.id); }
      }
    }
    if (fromPick) fillNotes(id, c);
    renderCard(id);
  }
  function notesLine(c) { return String(c.notes || '').split(/\s*\n+\s*/).filter(Boolean).join('; '); }
  function clearFromContact(id, c) {
    if (!c) return;
    var e = expected(id, c);
    ['phone', 'email', 'title'].forEach(function (f) {
      if (f in e && val(id + '_' + f).trim() && key(val(id + '_' + f)) === key(e[f])) setVal(id + '_' + f, '');
    });
    var n = el(id + '_notes');
    if (n && c.notes && n.value.trim() === notesLine(c)) n.value = '';
  }
  // Contact notes go into an EMPTY card Notes field (one line; project notes
  // typed on the card are never replaced). Key personnel cards have no notes.
  function fillNotes(id, c) {
    var n = el(id + '_notes');
    if (!n || n.value.trim() || !c.notes) return;
    n.value = notesLine(c);
  }
  // Linked by typed name: only fill fields the card doesn't have yet.
  function fillEmpty(id, c) {
    ['phone', 'email'].concat(kindOf(id) === 'talent' ? ['title'] : []).forEach(function (f) {
      var want = expected(id, c)[f];
      if (want && !val(id + '_' + f).trim()) setVal(id + '_' + f, want);
    });
    fillNotes(id, c);
  }
  function linkQuietly(id, c) {
    setLink(id, c);
    if (kindOf(id) === 'talent' && !link(id).roleId) { var tr = firstRoleIn(c, 'talent'); if (tr) setVal(id + '_role_id', tr.id); }
  }

  // ------------------------------------------------------------ role picker
  function attachRole(id, kind, roleEl) {
    roleEl._pv2 = true;
    var list = makeList(roleEl, 'pv2-role-wrap'), st = { idx: -1 };
    var cat = KINDS[kind].cat;

    function render() {
      list.innerHTML = '';
      if (!store.loaded) { close(list, st); return; }
      var k = key(roleEl.value);
      var avail = active('roles');
      if (k) avail = avail.filter(function (r) {
        return key(r.name).indexOf(k) !== -1 || key(r.abbreviation).indexOf(k) !== -1 || key(r.department).indexOf(k) !== -1;
      });
      var groups = CV2.roleGroups(avail);
      // The card's own category first, the rest in the usual order.
      groups.sort(function (a, b) {
        return (a.items[0].category === cat ? 0 : 1) - (b.items[0].category === cat ? 0 : 1);
      });
      groups.forEach(function (g) {
        var h = document.createElement('div'); h.className = 'pv2-group'; h.textContent = g.label; list.appendChild(h);
        g.items.forEach(function (r) {
          item(list, '<strong>' + esc(r.name) + '</strong>' + (r.abbreviation || !r.is_global ? '<span>' + esc([r.abbreviation, r.is_global ? '' : 'custom'].filter(Boolean).join(' · ')) + '</span>' : ''), '', function () { pick(r); });
        });
      });
      show(list, st);
    }
    function pick(r) {
      close(list, st);
      roleEl.value = roleText(r);
      setVal(id + '_role_id', r.id);
      saved();
    }
    roleEl.addEventListener('focus', render);
    roleEl.addEventListener('input', function () { setVal(id + '_role_id', ''); render(); });
    roleEl.addEventListener('blur', function () {
      close(list, st);
      if (!val(id + '_role_id') && store.loaded) {
        var r = roleByText(roleEl.value, cat);
        if (r) { roleEl.value = roleText(r); setVal(id + '_role_id', r.id); saved(); }
      }
    });
    keyNav(roleEl, list, st);
  }

  // ------------------------------------------------- "details changed" bar
  function renderCard(id) {
    var card = el(id);
    if (!card) return;
    var l = link(id);
    ensure('contacts', l.contactId);
    ensure('roles', l.roleId);
    var bar = el(id + '_pv2bar');
    var c = contact(l.contactId);
    var diffs = c && l.ack !== c.updated_at ? differences(id, c) : [];
    if (!diffs.length) { if (bar) bar.remove(); markLinked(id, !!c); return; }
    if (!bar) {
      bar = document.createElement('div'); bar.id = id + '_pv2bar'; bar.className = 'pv2-bar';
      bar.addEventListener('mousedown', function (e) {
        var b = e.target.closest('[data-pv2]');
        if (!b) return;
        e.preventDefault();
        var cc = contact(link(id).contactId);
        if (!cc) return;
        if (b.getAttribute('data-pv2') === 'update') {
          fillFromContact(id, cc, false);
        } else {
          setVal(id + '_contact_ack', cc.updated_at);
          renderCard(id);
        }
        saved();
      });
      card.appendChild(bar);
    }
    bar.innerHTML = '<span>Details changed in Contacts: ' + esc(diffs.map(function (f) { return FIELD_LABEL[f] + ' (' + (expected(id, c)[f] || 'blank') + ')'; }).join(', ')) + '</span>' +
      '<span class="pv2-bar-btns"><button type="button" class="lb primary cv2-small" data-pv2="update">Update</button><button type="button" class="lb cv2-small" data-pv2="dismiss">Dismiss</button></span>';
    markLinked(id, true);
  }
  var LINKED_TIP = 'Linked to this person in Contacts. If their phone, email or other details change there, this card offers to update. Typing a different name removes the link.';
  function markLinked(id, on) {
    var nameEl = el(id + '_name');
    if (!nameEl) return;
    nameEl.classList.toggle('pv2-linked', on);
    nameEl.title = on ? LINKED_TIP : '';
    var fl = nameEl.closest('.fl'), label = fl && fl.querySelector('label');
    if (!label) return;
    var tag = label.querySelector('.pv2-tag');
    if (on && !tag) {
      tag = document.createElement('span'); tag.className = 'pv2-tag'; tag.textContent = 'Linked'; tag.title = LINKED_TIP;
      label.appendChild(tag);
    } else if (!on && tag) tag.remove();
  }

  // --------------------------------------------------- legacy links on load
  var pendingLegacy = false;
  function linkLegacy() {
    if (!store.loaded) { pendingLegacy = true; return; }
    pendingLegacy = false;
    cardIds().forEach(function (id) {
      var kind = kindOf(id);
      if (!kind) return;
      var l = link(id);
      if (!l.contactId) {
        var c = contactByName(val(id + '_name'));
        if (c) linkQuietly(id, c);
      }
      var rf = KINDS[kind].roleField;
      if (rf && !l.roleId) {
        var r = roleByText(val(id + rf), KINDS[kind].cat);
        if (r) setVal(id + '_role_id', r.id); // text stays as saved
      }
    });
    dayIds().forEach(function (dayId) {
      var idEl = el(dayId + '_location_id');
      if (!idEl || idEl.value) return;
      var loc = locationByName(val(dayId + '_loc_id'));
      if (loc) idEl.value = String(loc.id);
    });
  }

  // -------------------------------------------------------------- locations
  function locationByName(name) {
    var k = key(name);
    if (!k) return null;
    var hits = active('locations').filter(function (l) { return key(l.name) === k; });
    return hits.length === 1 ? hits[0] : null;
  }
  // Linked id wins (also archived ones); else a unique name match.
  function location(id, name) {
    id = Number(id) || null;
    if (id) { ensure('locations', id); var row = store.locations[id]; if (row) return row; }
    return locationByName(name);
  }
  // A location picked on a schedule day with no hospital on file: look it up
  // once and save it to the location in Contacts. The day then shows it via
  // refreshDayLocDisplay. Never replaces a hospital that's already there.
  var hospBusy = {};
  function fillLocationHospital(loc) {
    if (!loc || !loc.id || loc.hospital || hospBusy[loc.id] || typeof findNearestHospital !== 'function') return;
    if (!(loc.address || loc.zip || (loc.city && loc.state))) return;
    hospBusy[loc.id] = true;
    findNearestHospital(loc).then(function (text) {
      var cur = store.locations[loc.id];
      if (!cur || cur.hospital) return;
      return CV2.update('locations', loc.id, { hospital: text }).then(function (row) {
        status('Nearest hospital saved to "' + row.name + '" in Contacts.');
      });
    }).catch(function (e) {
      status('Nearest hospital for "' + loc.name + '": ' + (e && e.message ? e.message : 'lookup failed.') + ' Add it in Contacts.', 'err');
    }).then(function () { delete hospBusy[loc.id]; });
  }
  function locations() {
    return active('locations').filter(function (l) { return !!l.name; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (pendingLegacy) linkLegacy();
    cardIds().forEach(function (id) { attach(id); renderCard(id); });
    if (typeof refreshDayLocDisplay === 'function') dayIds().forEach(refreshDayLocDisplay);
  }

  window.ProjectPeopleV2 = {
    attach: attach,
    render: render,
    locations: locations,
    location: location,
    locationByName: locationByName,
    fillLocationHospital: fillLocationHospital,
    onProjectLoaded: function () { linkLegacy(); render(); },
  };

  window.addEventListener('slater:v2-changed', render);
  CV2.sync().catch(function (e) { if (!e.offline) status('Could not load contacts: ' + e.message, 'err'); });
  // Cards created before this file loaded (startup) got the old autocomplete
  // only if acAttach ran first; attach() skips inputs that already have it.
  render();
})();
