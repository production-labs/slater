// Project organization pickers on v2 (data-model-rewrite, Session 4)
//
// Only active with the v2 contacts flag (?contacts=v2). Flag off: this file
// does nothing and the old agency dropdown + company autocomplete are used.
//
// The project's links live in app.js `_orgLinks` (agency_org_id,
// client_org_id) so they survive whichever script loads first. This file:
//   - fills the existing Agency dropdown (#project_agency_id) with the user's
//     agency organizations (is_agency, active), value = organization id;
//   - turns the existing Company field (#client_company) into an organization
//     picker over ALL active organizations, with "Add ... to organizations";
//   - gives new projects the default agency (users.default_organization_id);
//   - answers getAgencyInfo() / findClientCompany() in app.js, so the call
//     sheet, workback and expense report read agency and client from the org.
//
// The Company text box keeps the org's name, which app.js saves as the old
// data.client_company (rollback, and what the docs print). Typed text that
// isn't an organization stays plain text with no link, as today, and shows a
// hint offering to add it.
//
// Projects saved before the Session 6 migration have no org ids yet. On load
// they are linked the way the migration will do it: agency by the old agency
// id (organizations.legacy_agency_id), client by exact name (trim + lowercase).

(function () {
  'use strict';
  if (typeof orgsV2On !== 'function' || !orgsV2On()) return;

  var CV2 = window.ContactsV2;
  if (!CV2) { console.warn('project-orgs-v2: ContactsV2 missing'); return; }
  var store = CV2.store;
  var Regions = window.SlaterRegions;

  var pendingDefault = false;   // new project waiting for the store to load
  var pendingLegacyMatch = false; // loaded project waiting for the store

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function org(id) { return id ? store.organizations[id] || null : null; }
  function activeOrgs() {
    return Object.keys(store.organizations).map(function (k) { return store.organizations[k]; })
      .filter(function (o) { return !o.archived_at; })
      .sort(function (a, b) { return key(a.name) < key(b.name) ? -1 : key(a.name) > key(b.name) ? 1 : 0; });
  }
  function byName(name) {
    var k = key(name);
    if (!k) return null;
    var hits = activeOrgs().filter(function (o) { return key(o.name) === k; });
    return hits.length === 1 ? hits[0] : null; // ambiguous names never auto-link
  }
  function companyInput() { return document.getElementById('client_company'); }
  function agencySelect() { return document.getElementById('project_agency_id'); }
  function changed() {
    if (typeof autosaveTrigger === 'function') autosaveTrigger();
    if (typeof updateBrandingWarning === 'function') updateBrandingWarning();
  }

  // ------------------------------------------------------------ agency
  function renderAgency() {
    var sel = agencySelect();
    if (!sel) return;
    var cur = _orgLinks.agency_org_id;
    var list = activeOrgs().filter(function (o) { return o.is_agency; });
    var html = '<option value="">No agency</option>';
    list.forEach(function (o) {
      html += '<option value="' + o.id + '">' + esc(o.name) + (o.id === store.defaultOrgId ? ' (default)' : '') + '</option>';
    });
    // Keep a linked org visible even if it's archived or no longer an agency.
    var c = org(cur);
    if (cur && list.indexOf(c) === -1) {
      var note = !c ? (fetched[cur] === 'gone' ? 'deleted' : 'loading...') : c.archived_at ? 'archived' : 'not an agency';
      html += '<option value="' + cur + '">' + esc(c ? c.name : 'Organization ' + cur) + ' (' + note + ')</option>';
    }
    sel.innerHTML = html;
    sel.value = cur ? String(cur) : '';
  }
  function onAgencyChange() {
    var v = agencySelect().value;
    _orgLinks.agency_org_id = v ? Number(v) : null;
    renderAgency();
    // app.js's inline onchange already triggers autosave + branding warning.
  }

  // ------------------------------------------------------------ client
  var list, hint, activeIdx = -1;

  function buildClientPicker() {
    var input = companyInput();
    if (!input || input._orgPicker) return;
    input._orgPicker = true;
    input.placeholder = 'Pick or type an organization';
    var wrap = document.createElement('div'); wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    list = document.createElement('div'); list.className = 'ac-list'; wrap.appendChild(list);
    hint = document.createElement('div'); hint.className = 'po2-hint'; hint.style.display = 'none';
    wrap.parentNode.insertBefore(hint, wrap.nextSibling);

    input.addEventListener('focus', function () { openList(); });
    input.addEventListener('input', function () {
      // Editing the text breaks the link until an org is picked again.
      if (_orgLinks.client_org_id) { _orgLinks.client_org_id = null; autosaveTriggerSafe(); }
      openList();
      renderHint();
    });
    input.addEventListener('blur', function () {
      closeList();
      // Exact name of an existing org: link it, as the migration will.
      if (!_orgLinks.client_org_id) {
        var m = byName(input.value);
        if (m) { link(m); return; }
      }
      renderHint();
    });
    input.addEventListener('keydown', function (e) {
      var items = list.querySelectorAll('.ac-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); mark(items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); mark(items); }
      else if (e.key === 'Enter' && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); items[activeIdx].dispatchEvent(new MouseEvent('mousedown')); }
      else if (e.key === 'Escape') { closeList(); }
    });
    hint.addEventListener('mousedown', function (e) {
      var a = e.target.closest('[data-po2-add]');
      if (a) { e.preventDefault(); addTyped(); }
    });
  }
  function autosaveTriggerSafe() { if (typeof autosaveTrigger === 'function') autosaveTrigger(); }
  function mark(items) {
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', i === activeIdx);
  }
  function matches(q) {
    var k = key(q), all = activeOrgs();
    if (!k) return all.slice(0, 8);
    return all.filter(function (o) { return key(o.name).indexOf(k) !== -1; }).slice(0, 8);
  }
  function openList() {
    var input = companyInput();
    var q = input.value, ms = matches(q);
    list.innerHTML = ''; activeIdx = -1;
    ms.forEach(function (o) {
      var item = document.createElement('div'); item.className = 'ac-item';
      item.innerHTML = '<strong>' + esc(o.name) + '</strong>' + (o.is_agency ? '<span>Agency</span>' : (o.website ? '<span>' + esc(o.website) + '</span>' : ''));
      // mousedown + preventDefault: pick before the input's blur closes the list
      item.addEventListener('mousedown', function (e) { e.preventDefault(); link(o); closeList(); });
      list.appendChild(item);
    });
    if (key(q) && !byName(q)) {
      var add = document.createElement('div'); add.className = 'ac-item po2-add';
      add.innerHTML = '<strong>+ Add "' + esc(q.trim()) + '" to organizations</strong>';
      add.addEventListener('mousedown', function (e) { e.preventDefault(); closeList(); addTyped(); });
      list.appendChild(add);
    }
    list.classList.toggle('open', list.children.length > 0);
  }
  function closeList() { if (list) { list.classList.remove('open'); activeIdx = -1; } }

  function link(o) {
    var input = companyInput();
    var was = _orgLinks.client_org_id;
    _orgLinks.client_org_id = o.id;
    input.value = o.name;
    renderHint();
    if (was !== o.id) changed();
    else if (typeof updateBrandingWarning === 'function') updateBrandingWarning();
  }
  function addTyped() {
    var input = companyInput();
    var name = input.value.trim();
    if (!name) return;
    var existing = byName(name);
    if (existing) { link(existing); return; }
    hint.textContent = 'Adding...';
    CV2.createOrganization(name).then(function (row) {
      link(row);
      if (typeof setStatus === 'function') setStatus('Added "' + row.name + '" to organizations.', 'ok');
    }, function (e) {
      renderHint();
      if (typeof setStatus === 'function') setStatus('Could not add organization: ' + e.message, 'err');
    });
  }
  function renderHint() {
    if (!hint) return;
    var input = companyInput();
    var text = input ? input.value.trim() : '';
    var c = org(_orgLinks.client_org_id);
    if (_orgLinks.client_org_id && c && c.archived_at) {
      hint.innerHTML = 'This organization is archived. Restore it in Contacts to keep it current.';
      hint.style.display = '';
    } else if (!_orgLinks.client_org_id && text && store.loaded) {
      hint.innerHTML = 'Not in your organizations. <a href="#" data-po2-add>Add it</a> to link its logo and details.';
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
    }
  }
  function renderClient() {
    var input = companyInput();
    if (!input) return;
    var c = org(_orgLinks.client_org_id);
    // Linked: the field follows the organization's current name (renames).
    if (c && document.activeElement !== input && input.value !== c.name) input.value = c.name;
    renderHint();
  }

  // ------------------------------------------------------------ project events
  function matchLegacy() {
    if (!store.loaded) { pendingLegacyMatch = true; return; }
    pendingLegacyMatch = false;
    var touched = false;
    if (!_orgLinks.agency_org_id && _orgLinks.legacy_agency_id) {
      var la = String(_orgLinks.legacy_agency_id);
      var a = Object.keys(store.organizations).map(function (k) { return store.organizations[k]; })
        .filter(function (o) { return o.legacy_agency_id != null && String(o.legacy_agency_id) === la; })[0];
      if (a) { _orgLinks.agency_org_id = a.id; touched = true; }
    }
    if (!_orgLinks.client_org_id && _orgLinks.legacy_client) {
      var m = byName(_orgLinks.legacy_client);
      if (m) { _orgLinks.client_org_id = m.id; touched = true; }
    }
    return touched;
  }
  function applyDefault() {
    if (!pendingDefault) return;
    if (!store.loaded) return;
    pendingDefault = false;
    if (currentSheetKey || _orgLinks.agency_org_id) return;
    var d = org(store.defaultOrgId);
    if (!d || d.archived_at || !d.is_agency) return;
    _orgLinks.agency_org_id = d.id;
    // Same as the old default agency: timezone, project type, header logo.
    if (typeof applyAgencyDefaults === 'function') applyAgencyDefaults(d);
  }

  // Linked orgs missing from the store (archived) are fetched once. Missing
  // = 'gone' (permanently deleted; the server's purge refuses that while
  // linked, so this only happens on stale data).
  var fetched = {};
  function ensureLinked() {
    if (!store.loaded) return;
    [_orgLinks.agency_org_id, _orgLinks.client_org_id].forEach(function (id) {
      if (!id || store.organizations[id] || fetched[id]) return;
      fetched[id] = 'loading';
      CV2.fetchOne('organizations', id).then(function (row) {
        fetched[id] = row ? 'ok' : 'gone';
        if (!row) render();
      }, function () { delete fetched[id]; });
    });
  }

  function render() {
    if (pendingLegacyMatch) matchLegacy();
    ensureLinked();
    applyDefault();
    renderAgency();
    renderClient();
    if (typeof updateBrandingWarning === 'function') updateBrandingWarning();
  }

  // ------------------------------------------------------------ doc helpers
  function countryLabel(code) {
    if (!code || code === CV2.defaultCountry()) return '';
    return Regions && Regions.countryName ? Regions.countryName(code) : code;
  }
  // Same shape as app.js getAgencyInfo(). null = no organizations at all
  // (before the migration), so app.js falls back to the old agencies.
  function agencyInfo() {
    if (!store.loaded) return null;
    var o = org(_orgLinks.agency_org_id);
    if (!o) {
      // Old behavior: no agency picked -> the default agency.
      o = org(store.defaultOrgId);
      if (!o) {
        var agencies = activeOrgs().filter(function (x) { return x.is_agency; });
        if (!agencies.length) return null;
        o = agencies[0];
      }
    }
    return {
      name:            o.name,
      address:         o.address,
      city:            o.city,
      state:           o.state,
      zip:             o.zip,
      country:         o.country,
      country_label:   countryLabel(o.country),
      phone:           o.contact_phone || o.phone,
      billing_contact: o.contact_name,
      billing_email:   o.invoicing_email,
      invoicing_text:  o.invoicing_text,
      logo:            o.logo,
      timezone:        o.timezone,
      project_type:    o.default_project_type,
    };
  }
  // Client branding record { name, logo }: the linked client org if its name
  // still matches what the doc will print, else an org with that exact name.
  function clientOrg(name) {
    var c = org(_orgLinks.client_org_id);
    if (c && (!name || key(c.name) === key(name))) return c;
    return byName(name);
  }

  // ------------------------------------------------------------ init
  function init() {
    buildClientPicker();
    var sel = agencySelect();
    if (sel) sel.addEventListener('change', onAgencyChange);
    if (!currentSheetKey) pendingDefault = true;
    render();
    window.addEventListener('slater:v2-changed', render);
    CV2.sync().catch(function (e) {
      if (typeof setStatus === 'function') setStatus('Could not load organizations: ' + e.message, 'err');
    });
  }

  window.ProjectOrgsV2 = {
    render: render,
    agencyInfo: agencyInfo,
    clientOrg: clientOrg,
    onProjectLoaded: function () {
      pendingDefault = false;
      matchLegacy();
      render();
    },
    onProjectCleared: function () {
      pendingDefault = true;
      render();
    },
  };

  init();
})();
