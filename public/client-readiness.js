// When is a client workback item actually the client's turn?
// Shared by the portal server (require('../public/client-readiness')) and the
// Projects Overview in the browser (window.SlaterReadiness), so the client's
// "Waiting on you" and the producer's "With client" always agree.
//
// The rule: a client item is ready when the step before it is done.
//   - Before it = the item it's set to follow ("After:" on a Sequential item,
//     saved as seq_anchor_uuid). Anchor and Manual items, and Sequential items
//     with no "After:", follow the item just above them in the list.
//   - A workback item is done when it's Complete or N/A (internal items count:
//     the client never sees them, only that their turn has come).
//   - A date pin (kickoff, schedule day, project due date) is done once its
//     date has arrived. Pins have no status.
//   - The first item in the list follows kickoff if there is one; otherwise
//     nothing holds it back.
// Held up by us: not ready, and the step before it is one of ours (not the
// client's) that is due today or earlier and still not done.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlaterReadiness = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }
  function isDone(status) { return status === 'Complete' || status === 'N/A'; }

  function isClientOwner(owner, client) {
    var o = txt(owner).toLowerCase();
    if (!o) return false;
    if (o === 'client') return true;
    var c = txt(client).toLowerCase();
    return !!c && o === c;
  }

  function itemDue(i) { return isoDate(i.due) || (i.mode === 'manual' ? isoDate(i.manual_date) : ''); }

  // The date of a pin an item can follow ("kickoff", "video_due", "pin_<id>"),
  // or '' if that pin no longer exists or has no date.
  function pinDate(data, ref) {
    var id = ref.indexOf('pin_') === 0 ? ref.slice(4) : ref;
    if (id === 'kickoff') return isoDate(data.kickoff_date_iso);
    if (id === 'video_due') return isoDate(data.video_due_date_iso);
    var days = Array.isArray(data.schedule_days) ? data.schedule_days : [];
    for (var n = 0; n < days.length; n++) {
      var d = days[n];
      if (d && (d.id || 'day_' + n) === id) return isoDate(d.date_iso);
    }
    return '';
  }
  function isPinRef(ref) { return ref === 'kickoff' || ref === 'video_due' || ref.indexOf('pin_') === 0; }

  // data: a project's saved data. client: its client company name (for the
  // owner match). today: 'YYYY-MM-DD'.
  // Returns an array parallel to data.wb_items: null for items that aren't the
  // client's or are already done, else { ready, heldUp }.
  function clientItemStates(data, client, today) {
    data = data || {};
    var list = Array.isArray(data.wb_items) ? data.wb_items : [];
    var byUuid = {};
    list.forEach(function (i, n) { if (i && txt(i.uuid)) byUuid[txt(i.uuid)] = n; });
    var kickoff = isoDate(data.kickoff_date_iso);

    function prevIndex(n) {
      for (var k = n - 1; k >= 0; k--) if (list[k] && txt(list[k].item)) return k;
      return -1;
    }
    // { item: index } | { date: iso } | null (nothing before it)
    function before(i, n) {
      var ref = i.mode === 'sequential' ? txt(i.seq_anchor_uuid) : '';
      if (ref && isPinRef(ref)) {
        var pd = pinDate(data, ref);
        if (pd) return { date: pd };
        return kickoff ? { date: kickoff } : null;   // pin gone: same fallback as the due-date math
      }
      if (ref && byUuid.hasOwnProperty(ref) && byUuid[ref] !== n) return { item: byUuid[ref] };
      var p = prevIndex(n);
      if (p >= 0) return { item: p };
      return kickoff ? { date: kickoff } : null;
    }

    return list.map(function (i, n) {
      if (!i || !txt(i.item) || !isClientOwner(i.owner, client) || isDone(i.status)) return null;
      var b = before(i, n);
      if (!b) return { ready: true, heldUp: false };
      if (b.date) return { ready: b.date <= today, heldUp: false };
      var p = list[b.item];
      if (isDone(p.status)) return { ready: true, heldUp: false };
      var pDue = itemDue(p);
      return { ready: false, heldUp: !isClientOwner(p.owner, client) && !!pDue && pDue <= today };
    });
  }

  return { clientItemStates: clientItemStates, isClientOwner: isClientOwner };
});
