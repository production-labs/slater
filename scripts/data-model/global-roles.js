// Built-in global roles (roles.owner_id = NULL). List revised by John 2026-10-03.
// Source of truth for the seed. Re-running the migration updates existing
// global roles to match this list (matched by lowercased name), inserts
// missing ones, and ARCHIVES global roles that are no longer on the list
// (archived roles stay attached to anyone who has them, but can't be newly
// picked). Nothing is hard-deleted.
//
// Entries are [name, abbreviation]. Crew entries take their department
// from the group they sit in. sort_order is assigned from position:
// category base + 10 per entry, with each crew department on its own hundred.

const STAFF = [
  ['Executive Producer', 'EP'],
  ['Producer', null],
  ['Senior Producer', 'Sr. Producer'],
  ['Line Producer', null],
  ['Associate Producer', 'AP'],
  ['Production Manager', 'PM'],
  ['Production Coordinator', null],
  ['Post Producer', null],
  ['Engineer in Charge', 'EIC'],
  ['Director', null],
  ['Assistant Director', '1st AD'],
  ['Creative Director', 'CD'],
  ['Writer', null],
  ['Showrunner', null],
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
    ['Media Manager', null],
    ['Photographer', null],
  ]],
  ['Lighting and Grip', 1100, [
    ['Lighting Director', 'LD'],
    ['Gaffer', null],
    ['Best Boy Electric', 'BBE'],
    ['Key Grip', null],
    ['Best Boy Grip', 'BBG'],
    ['Electrician', null],
    ['Grip', null],
  ]],
  ['Audio', 1200, [
    ['A1 (Audio Engineer)', 'A1'],
    ['A2 (Audio Assistant)', 'A2'],
    ['Sound Mixer', null],
    ['Boom Operator', null],
    ['RF Technician', null],
  ]],
  ['Live and Broadcast', 1300, [
    ['Technical Director', 'TD'],
    ['Broadcast Engineer', null],
    ['Video Engineer / Shader', 'V1'],
    ['Graphics Operator', 'GFX'],
    ['Streaming Engineer', null],
    ['Playback Operator', null],
    ['Teleprompter Operator', 'Prompter'],
    ['Stage Manager', 'SM'],
    ['LED / Screens Technician', null],
    ['Virtual Event Producer', null],
  ]],
  ['Art and Wardrobe', 1500, [
    ['Production Designer', null],
    ['Art Director', null],
    ['Set Dresser', null],
    ['Prop Master', null],
    ['Wardrobe Stylist', null],
  ]],
  ['Production Support', 1600, [
    ['2nd Assistant Director', '2nd AD'],
    ['Script Supervisor', null],
    ['Production Assistant', 'PA'],
    ['Location Manager', null],
    ['Hair and Makeup Artist', 'HMU'],
    ['Captioner', 'CART'],
    ['Craft Services', 'Crafty'],
    ['Driver', null],
  ]],
  ['Post', 1700, [
    ['Editor', null],
    ['Assistant Editor', 'AE'],
    ['Motion Graphics Artist', null],
    ['Animator', null],
    ['Colorist', null],
    ['VFX Artist', null],
    ['Audio Post Mixer', null],
    ['Sound Designer', null],
    ['Dialogue Editor', null],
    ['ADR Mixer', null],
    ['Composer', null],
  ]],
];

const TALENT = [
  ['Host', null],
  ['Emcee', 'MC'],
  ['Presenter', null],
  ['Moderator', null],
  ['Panelist', null],
  ['Subject Matter Expert', 'SME'],
  ['Interview Subject', null],
  ['Executive', null],
  ['Actor', null],
  ['Voiceover Artist', 'VO'],
  ['Background / Extra', null],
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
