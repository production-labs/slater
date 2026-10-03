// Starter global roles (roles.owner_id = NULL), approved by John 2026-10-03.
// Source of truth for the seed. Re-running the migration updates existing
// global roles to match this list (matched by lowercased name) and inserts
// missing ones. Roles removed from this list are NOT deleted from the DB;
// the migration reports them instead.
//
// Entries are [name, abbreviation]. Crew entries take their department
// from the group they sit in. sort_order is assigned from position: category base + 10 per entry,
// with each crew department starting on its own hundred.

const STAFF = [
  ['Executive Producer', 'EP'],
  ['Producer', null],
  ['Managing Producer', 'MNG PRD'],
  ['Engineer in Charge', 'EIC'],
  ['Senior Producer', 'Sr. Producer'],
  ['Associate Producer', 'AP'],
  ['Line Producer', null],
  ['Production Manager', 'PM'],
  ['Production Coordinator', null],
  ['Project Manager', null],
  ['Account Manager', null],
  ['Director', null],
  ['Creative Director', 'CD'],
  ['Writer', null],
  ['Client Contact', null],
  ['Client Stakeholder', null],
];

// [department, base sort_order, roles]
const CREW_DEPARTMENTS = [
  ['Camera', 1000, [
    ['Director of Photography', 'DP'],
    ['Camera Operator', 'Cam Op'],
    ['1st Assistant Camera', '1st AC'],
    ['2nd Assistant Camera', '2nd AC'],
    ['Digital Imaging Technician', 'DIT'],
    ['Steadicam Operator', null],
    ['Drone Operator', null],
    ['Jib / Crane Operator', null],
    ['Photographer', null],
  ]],
  ['Lighting and Grip', 1100, [
    ['Gaffer', null],
    ['Key Grip', null],
    ['Best Boy Electric', 'BBE'],
    ['Best Boy Grip', 'BBG'],
    ['Electric', null],
    ['Grip', null],
    ['Grip / Electric', 'G&E'],
  ]],
  ['Audio', 1200, [
    ['Sound Mixer', null],
    ['Boom Operator', null],
    ['A1 (Audio Engineer)', 'A1'],
    ['A2 (Audio Assistant)', 'A2'],
  ]],
  ['Live and Broadcast', 1300, [
    ['Technical Director', 'TD'],
    ['Broadcast Engineer', null],
    ['Video Engineer / Shader', 'V1'],
    ['Graphics Operator', 'GFX'],
    ['Replay Operator', 'EVS'],
    ['Streaming Engineer', null],
    ['Playback Operator', null],
    ['Teleprompter Operator', 'Prompter'],
    ['Stage Manager', 'SM'],
    ['Floor Manager', 'FM'],
    ['LED / Screens Technician', null],
    ['IT / Network Technician', null],
  ]],
  ['Art, Wardrobe and Makeup', 1500, [
    ['Production Designer', null],
    ['Art Director', null],
    ['Set Dresser', null],
    ['Prop Master', null],
    ['Wardrobe Stylist', null],
    ['Hair and Makeup Artist', 'HMU'],
  ]],
  ['Production Support', 1600, [
    ['Assistant Director', '1st AD'],
    ['Script Supervisor', null],
    ['Production Assistant', 'PA'],
    ['Location Manager', null],
    ['Craft Services', 'Crafty'],
    ['Driver', null],
  ]],
  ['Post', 1700, [
    ['Editor', null],
    ['Assistant Editor', 'AE'],
    ['Motion Graphics Artist', null],
    ['Colorist', null],
  ]],
];

const TALENT = [
  ['Host', null],
  ['Presenter', null],
  ['Speaker', null],
  ['Moderator', null],
  ['On-Camera Talent', null],
  ['Actor', null],
  ['Voiceover Artist', 'VO'],
  ['Interview Subject', null],
  ['Subject Matter Expert', 'SME'],
  ['Panelist', null],
];

function build() {
  const out = [];
  STAFF.forEach(([name, abbreviation], i) =>
    out.push({ name, abbreviation, category: 'staff', department: null, sort_order: 10 * (i + 1) }));
  CREW_DEPARTMENTS.forEach(([department, base, roles]) =>
    roles.forEach(([name, abbreviation], i) =>
      out.push({ name, abbreviation, category: 'crew', department, sort_order: base + 10 * (i + 1) })));
  TALENT.forEach(([name, abbreviation], i) =>
    out.push({ name, abbreviation, category: 'talent', department: null, sort_order: 2000 + 10 * (i + 1) }));
  return out;
}

module.exports = build();
