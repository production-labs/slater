// My Info > Your data (V1.5, 2026-11-07): "Download my data" and "Delete
// account". Server side: routes/account.js. Pause / Cancel come with Paddle.
//
// Download my data builds a .zip in the browser (JSZip from lib/vendors.js):
//   Slater_Backup.json   same file as the footer's "Export backup"
//                        (buildExportPayload in app.js); Import backup reads it
//   contacts.csv, organizations.csv, locations.csv, projects.csv, expenses.csv,
//   client-responses.csv  for Excel / Google Sheets
//   receipts/<project>/   receipt images as ordinary files
//   account.json         profile + client portal history (updates, responses,
//                        list of client files still stored)
//   README.txt
(function () {
  'use strict';

  var TYPE_LABELS = { post_production: 'Post Production', location_shoot: 'Location Shoot', live_broadcast_location: 'Live Broadcast: On Location', live_broadcast_studio: 'Live Broadcast: In Studio', webinar: 'Webinar' };

  function $(id) { return document.getElementById(id); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // One CSV cell. Text that a spreadsheet would run as a formula (= + - @,
  // tab, return at the start) gets a leading apostrophe; numbers stay numbers.
  function cell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // Excel opens UTF-8 CSVs correctly only with a byte-order mark.
  function csv(header, rows) {
    return '﻿' + [header].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function safeName(s, max) {
    s = String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return (s || 'Untitled').slice(0, max || 60).trim();
  }
  function projTitle(p, key) { return (p && (p.project_title || p.label)) || key; }
  function archived(r) { return r && r.archived_at ? 'Yes' : ''; }

  function contactsCsv(c) {
    var orgs = {}, roles = {};
    (c.organizations || []).forEach(function (o) { orgs[o.id] = o.name; });
    (c.roles || []).forEach(function (r) { roles[r.id] = r.name; });
    var rows = (c.contacts || []).map(function (p) {
      return [p.name, (p.role_ids || []).map(function (id) { return roles[id]; }).filter(Boolean).join('; '),
        orgs[p.organization_id] || '', p.title, p.email, p.phone, p.address, p.city, p.state, p.zip, p.country,
        p.union_status, p.gear_kit, p.travel_availability, p.notes, archived(p)];
    });
    return csv(['Name', 'Roles', 'Organization', 'Title', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Country',
      'Union status', 'Gear / kit', 'Travel', 'Notes', 'Archived'], rows);
  }
  function orgsCsv(c) {
    return csv(['Name', 'Type', 'Website', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Country', 'Billing contact',
      'Billing contact email', 'Billing contact phone', 'Invoicing email', 'Invoicing notes', 'Notes', 'Archived'],
    (c.organizations || []).map(function (o) {
      return [o.name, o.is_agency ? 'Agency' : 'Client', o.website, o.phone, o.address, o.city, o.state, o.zip, o.country,
        o.contact_name, o.contact_email, o.contact_phone, o.invoicing_email, o.invoicing_text, o.notes, archived(o)];
    }));
  }
  function locationsCsv(c) {
    return csv(['Name', 'Address', 'City', 'State', 'ZIP', 'Country', 'Nearest hospital', 'Notes', 'Archived'],
      (c.locations || []).map(function (l) { return [l.name, l.address, l.city, l.state, l.zip, l.country, l.hospital, l.notes, archived(l)]; }));
  }
  function projectsCsv(projects) {
    return csv(['Project', 'Type', 'Company', 'Client name', 'Billing code', 'Kickoff', 'Due date', 'First day', 'Last day',
      'Schedule days', 'Crew', 'Talent', 'Workback items', 'Expenses total'],
    Object.keys(projects).map(function (k) {
      var p = projects[k] || {};
      var days = (p.schedule_days || []).map(function (d) { return d && d.date_iso; }).filter(Boolean).sort();
      var total = (p.expenses || []).reduce(function (s, e) { var n = parseFloat(e && e.amount); return s + (isFinite(n) ? n : 0); }, 0);
      return [projTitle(p, k), TYPE_LABELS[p.project_type] || p.project_type || '', p.client_company, p.client_name, p.billing_code,
        p.kickoff_date_iso, p.video_due_date_iso, days[0] || '', days[days.length - 1] || '', (p.schedule_days || []).length,
        (p.crew || []).length, (p.talent || []).length, (p.wb_items || []).filter(function (w) { return w && w.item; }).length,
        Math.round(total * 100) / 100];
    }));
  }

  // Receipts become files; expenses.csv names the file next to each expense.
  function receiptExt(dataUrl) {
    var m = /^data:([\w.+-]+\/[\w.+-]+);base64,/.exec(dataUrl || '');
    if (!m) return null;
    return { mime: m[1], ext: ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'application/pdf': 'pdf' })[m[1]] || 'bin' };
  }
  function expensesAndReceipts(projects, zip) {
    var rows = [], count = 0, used = {};
    Object.keys(projects).forEach(function (k) {
      var p = projects[k] || {}, title = projTitle(p, k);
      var folder = safeName(title, 60);
      while (used[folder] && used[folder] !== k) folder = folder + ' (' + k.slice(-4) + ')';
      used[folder] = k;
      (p.expenses || []).forEach(function (e, i) {
        if (!e) return;
        var file = '';
        var t = receiptExt(e.receipt);
        if (t) {
          file = 'receipts/' + folder + '/' + String(i + 1).padStart(2, '0') + ' ' + safeName((e.date || '') + ' ' + (e.vendor || 'receipt'), 50) + '.' + t.ext;
          zip.file(file, e.receipt.slice(e.receipt.indexOf(',') + 1), { base64: true });
          count++;
        }
        var amt = parseFloat(e.amount);
        rows.push([title, e.date, e.vendor, e.cat, isFinite(amt) ? amt : e.amount, e.reimbursable ? 'Yes' : 'No', e.paid_by, file]);
      });
    });
    return { csv: csv(['Project', 'Date', 'Vendor', 'Category', 'Amount', 'Reimbursable', 'Paid by', 'Receipt file'], rows), receipts: count };
  }
  function responsesCsv(extra, projects) {
    function itemName(key, uuid) {
      var w = ((projects[key] || {}).wb_items || []).filter(function (x) { return x && x.uuid === uuid; })[0];
      return w ? w.item : '';
    }
    return csv(['Project', 'Workback item', 'Answer', 'From', 'Note', 'When', 'Handled'],
      (extra.portal_responses || []).map(function (r) {
        return [projTitle(projects[r.project_key], r.project_key), itemName(r.project_key, r.wb_item_uuid),
          r.kind === 'approved' ? 'Approved' : 'Changes requested', r.responder_name, r.note, r.created_at, r.acknowledged_at || ''];
      }));
  }

  var README =
    'Your Slater data, downloaded {DATE}.\r\n\r\n' +
    'Slater_Backup.json   Everything in one file. To bring it back into Slater: Import backup\r\n' +
    '                     (bottom of any project page). Not meant to be read by hand.\r\n' +
    'contacts.csv         People: roles, organization, contact details, notes.\r\n' +
    'organizations.csv    Agencies and client companies.\r\n' +
    'locations.csv        Locations.\r\n' +
    'projects.csv         One line per project: type, client, key dates, counts, expense total.\r\n' +
    'expenses.csv         Every expense on every project; "Receipt file" points into receipts/.\r\n' +
    'receipts/            Receipt images, one folder per project.\r\n' +
    'client-responses.csv Approvals and change requests from client portals.\r\n' +
    'account.json         Your profile and client portal history (producer updates, client\r\n' +
    '                     answers, and a list of client files still stored; those are deleted\r\n' +
    '                     14 days after upload, so download any you need from the Portal tab).\r\n\r\n' +
    'The .csv files open in Excel, Numbers or Google Sheets.\r\n' +
    'Workback templates are saved in your browser, so this file has the ones from the browser\r\n' +
    'you downloaded it in.\r\n';

  var busy = false;
  async function exportData() {
    if (busy) return;
    var btn = $('acct-export-btn'), st = $('acct-export-status');
    function say(t, cls) { st.textContent = t; st.className = 'acct-status' + (cls ? ' ' + cls : ''); }
    busy = true; btn.disabled = true; say('Gathering your data...');
    try {
      var payload = await buildExportPayload();
      if (!payload) throw new Error('offline');
      if (!payload.contacts_v2) throw new Error('contacts');
      var r = await fetch('/api/account/export-extra', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error('extra');
      var extra = await r.json();
      say('Building the .zip...');
      var zip = new JSZip(), c = payload.contacts_v2, projects = payload.projects;
      zip.file('README.txt', README.replace('{DATE}', today()));
      zip.file('Slater_Backup.json', JSON.stringify(payload, null, 2));
      zip.file('contacts.csv', contactsCsv(c));
      zip.file('organizations.csv', orgsCsv(c));
      zip.file('locations.csv', locationsCsv(c));
      zip.file('projects.csv', projectsCsv(projects));
      var ex = expensesAndReceipts(projects, zip);
      zip.file('expenses.csv', ex.csv);
      zip.file('client-responses.csv', responsesCsv(extra, projects));
      zip.file('account.json', JSON.stringify(Object.assign({ exported: new Date().toISOString() }, extra), null, 2));
      var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'Slater_My_Data_' + today() + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      var n = Object.keys(projects).length;
      say('Downloaded: ' + n + ' project' + (n === 1 ? '' : 's') + ', ' + (c.contacts || []).length + ((c.contacts || []).length === 1 ? ' person, ' : ' people, ') + ex.receipts + ' receipt' + (ex.receipts === 1 ? '' : 's') + '.', 'ok');
    } catch (e) {
      say("Couldn't build the download" + (e && e.message === 'offline' ? ' (no connection)' : '') + '. Nothing was changed. Please try again.', 'err');
    } finally {
      busy = false; btn.disabled = false;
    }
  }

  function openDelete() {
    $('acct-del').hidden = false; $('acct-del-open').hidden = true;
    $('acct-del-err').textContent = ''; $('acct-del-pw').value = '';
    $('acct-del-pw').focus();
    $('acct-del').scrollIntoView({ block: 'nearest' });
  }
  function closeDelete() {
    $('acct-del').hidden = true; $('acct-del-open').hidden = false;
    $('acct-del-pw').value = ''; $('acct-del-err').textContent = '';
  }
  var deleting = false;
  async function confirmDelete() {
    if (deleting) return;
    var pw = $('acct-del-pw').value, err = $('acct-del-err'), go = $('acct-del-go');
    if (!pw) { err.textContent = 'Enter your password.'; return; }
    deleting = true; go.disabled = true; go.textContent = 'Deleting...'; err.textContent = '';
    try {
      var r = await fetch('/api/account/delete', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) {
        // Slater's copies on this device: cached projects, unsaved changes,
        // templates, last project, sort order... all slater_* keys.
        try {
          Object.keys(localStorage).forEach(function (k) { if (/^slater/i.test(k)) localStorage.removeItem(k); });
          Object.keys(sessionStorage).forEach(function (k) { if (/^slater/i.test(k)) sessionStorage.removeItem(k); });
        } catch (e) {}
        if (window.SlaterConn && SlaterConn.allowLeave) SlaterConn.allowLeave();
        location.replace('/login?account_deleted=1');
        return;
      }
      err.textContent =
        r.status === 403 ? "That password isn't right. Your account was not deleted." :
        r.status === 429 ? (j.error || 'Too many attempts. Try again in 15 minutes.') :
        r.status === 503 ? "We couldn't reach file storage to delete your client portal files, so your account was not deleted. Please try again in a few minutes." :
        r.status === 401 ? 'You have been signed out. Sign in again, then try again.' :
        'Something went wrong and your account was not deleted. Please try again.';
    } catch (e) {
      err.textContent = 'No connection. Your account was not deleted.';
    }
    deleting = false; go.disabled = false; go.textContent = 'Delete my account';
  }

  window.Account = { exportData: exportData, openDelete: openDelete, closeDelete: closeDelete, confirmDelete: confirmDelete,
    _csv: csv, _cell: cell, _safeName: safeName };
})();
