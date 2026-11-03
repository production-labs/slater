// Unit test for public/client-readiness.js: when a client workback item is
// "Waiting on you" (ready), coming up, or held up by us.
// Run: node scripts/test-client-readiness.js
const assert = require('assert');
const { clientItemStates } = require('../public/client-readiness');

const T = '2026-11-10';
let pass = 0;
function check(name, data, idx, want) {
  const got = clientItemStates(data, 'Contoso', T)[idx];
  assert.deepStrictEqual(got, want, name + ': got ' + JSON.stringify(got));
  pass++; console.log('  ok  ' + name);
}
const edit = (status, due, extra) => Object.assign({ item: 'Video Edit', owner: 'Editor', uuid: 'e', status, due }, extra || {});
const review = (extra) => Object.assign({ item: 'Review rough cut', owner: 'Client', uuid: 'r', status: 'Not Started', due: '2026-11-20', mode: 'sequential' }, extra || {});

check('edit still in progress on its due date: not ready, held up by us',
  { wb_items: [edit('In Progress', T), review()] }, 1, { ready: false, heldUp: true });
check('edit in progress, due later: coming up, not held up',
  { wb_items: [edit('In Progress', '2026-11-15'), review()] }, 1, { ready: false, heldUp: false });
check('edit finished early: ready even though the review is weeks out',
  { wb_items: [edit('Complete', '2026-11-15'), review()] }, 1, { ready: true, heldUp: false });
check('step before is N/A: ready',
  { wb_items: [edit('N/A', '2026-11-15'), review()] }, 1, { ready: true, heldUp: false });
check('step before is internal-only and complete: ready',
  { wb_items: [edit('Complete', T, { internal: true }), review()] }, 1, { ready: true, heldUp: false });
check('owner matched by client company name',
  { wb_items: [edit('Complete', T), review({ owner: 'contoso' })] }, 1, { ready: true, heldUp: false });

check('"After:" points past the item above it',
  { wb_items: [edit('Complete', '2026-11-05'), { item: 'Color', owner: 'Colorist', uuid: 'c', status: 'In Progress', due: T }, review({ seq_anchor_uuid: 'e' })] },
  2, { ready: true, heldUp: false });
check('"After:" a missing item falls back to the item above',
  { wb_items: [edit('In Progress', T), review({ seq_anchor_uuid: 'gone' })] }, 1, { ready: false, heldUp: true });

const days = [{ id: 'sday_1', date_iso: '2026-11-12' }, { id: 'sday_2', date_iso: '2026-11-08' }];
check('"After:" a shoot day still ahead: coming up',
  { schedule_days: days, wb_items: [edit('Complete', T), review({ seq_anchor_uuid: 'pin_sday_1' })] }, 1, { ready: false, heldUp: false });
check('"After:" a shoot day that has arrived: ready',
  { schedule_days: days, wb_items: [edit('In Progress', T), review({ seq_anchor_uuid: 'pin_sday_2' })] }, 1, { ready: true, heldUp: false });
check('"After:" kickoff (both saved forms)',
  { kickoff_date_iso: '2026-11-11', wb_items: [review({ seq_anchor_uuid: 'pin_kickoff' }), review({ uuid: 'r2', seq_anchor_uuid: 'kickoff' })] }, 1, { ready: false, heldUp: false });
check('"After:" project due date that has arrived',
  { video_due_date_iso: T, wb_items: [edit('In Progress', T), review({ seq_anchor_uuid: 'pin_video_due' })] }, 1, { ready: true, heldUp: false });

check('anchor-mode item follows the item above it',
  { wb_items: [edit('In Progress', '2026-11-01'), review({ mode: 'anchor' })] }, 1, { ready: false, heldUp: true });
check('manual-mode item follows the item above it',
  { wb_items: [edit('Complete', '2026-11-01'), review({ mode: 'manual', manual_date: '2026-12-01', due: '' })] }, 1, { ready: true, heldUp: false });

check('first item, kickoff ahead: coming up',
  { kickoff_date_iso: '2026-11-11', wb_items: [review({ mode: 'anchor' })] }, 0, { ready: false, heldUp: false });
check('first item, kickoff passed: ready',
  { kickoff_date_iso: '2026-11-01', wb_items: [review({ mode: 'anchor' })] }, 0, { ready: true, heldUp: false });
check('first item, no kickoff: ready',
  { wb_items: [review({ mode: 'anchor' })] }, 0, { ready: true, heldUp: false });

check('client step after another open client step: coming up, not held up by us',
  { wb_items: [review({ due: '2026-11-01' }), review({ uuid: 'r2', item: 'Final approval' })] }, 1, { ready: false, heldUp: false });

const s = clientItemStates({ wb_items: [edit('In Progress', T), review({ status: 'Complete' }), { item: '', owner: 'Client' }] }, 'Contoso', T);
assert.deepStrictEqual(s, [null, null, null], 'ours / done / unnamed should be null: ' + JSON.stringify(s));
pass++; console.log('  ok  our items, done items and unnamed items have no state');

console.log('\n' + pass + ' passed');
