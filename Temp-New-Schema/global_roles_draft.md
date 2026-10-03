# Starter Global Roles: APPROVED by John 2026-10-03

Last updated: 2026-10-03

These are the roles every Slater user gets out of the box (`roles.owner_id = NULL`). Users add their own custom roles on top (confirmed requirement). Session 1 seeds exactly this list.

How to read this:
- **Category** is fixed to `staff`, `crew` or `talent`. It decides which Contacts filter a person shows up under.
- **Department** groups crew roles in the picker (`roles.department`, nullable text). Staff and talent roles have no department. Custom roles may set one or leave it empty (shown under "Other").
- **Abbr** is optional. Where there is one, it is what prints on tight layouts (call sheet columns, pills).
- **Order** is the display order inside the category. Numbers are spaced by 10 so new roles can slot in later without renumbering.

Totals: 74 roles. 16 staff, 48 crew, 10 talent. (An earlier message said 73; that was an arithmetic slip, the list itself never changed.)

---

## Staff (16)

Producer-side and client-side people. These cover today's Key Personnel cards.

| Order | Name | Abbr | Note |
|---|---|---|---|
| 10 | Executive Producer | EP | Today's default KP card |
| 20 | Producer | | Today's default KP card |
| 30 | Managing Producer | MNG PRD | Old projects say "Mng. Producer" (alias) |
| 40 | Engineer in Charge | EIC | Broadcast meaning, confirmed by John |
| 50 | Senior Producer | Sr. Producer | |
| 60 | Associate Producer | AP | |
| 70 | Line Producer | | |
| 80 | Production Manager | PM | |
| 90 | Production Coordinator | | |
| 100 | Project Manager | | No abbr to avoid clashing with PM |
| 110 | Account Manager | | |
| 120 | Director | | |
| 130 | Creative Director | CD | |
| 140 | Writer | | |
| 150 | Client Contact | | Client-side lead on a project |
| 160 | Client Stakeholder | | Approvers, execs |

## Crew (48)

### Department: Camera
| Order | Name | Abbr |
|---|---|---|
| 1010 | Director of Photography | DP |
| 1020 | Camera Operator | Cam Op |
| 1030 | 1st Assistant Camera | 1st AC |
| 1040 | 2nd Assistant Camera | 2nd AC |
| 1050 | Digital Imaging Technician | DIT |
| 1060 | Steadicam Operator | |
| 1070 | Drone Operator | |
| 1080 | Jib / Crane Operator | |
| 1090 | Photographer | |

### Department: Lighting and Grip
| Order | Name | Abbr |
|---|---|---|
| 1110 | Gaffer | |
| 1120 | Key Grip | |
| 1130 | Best Boy Electric | BBE |
| 1140 | Best Boy Grip | BBG |
| 1150 | Electric | |
| 1160 | Grip | |
| 1170 | Grip / Electric | G&E |

### Department: Audio
| Order | Name | Abbr |
|---|---|---|
| 1210 | Sound Mixer | |
| 1220 | Boom Operator | |
| 1230 | A1 (Audio Engineer) | A1 |
| 1240 | A2 (Audio Assistant) | A2 |

### Department: Live and Broadcast
| Order | Name | Abbr |
|---|---|---|
| 1310 | Technical Director | TD |
| 1320 | Broadcast Engineer | |
| 1330 | Video Engineer / Shader | V1 |
| 1340 | Graphics Operator | GFX |
| 1350 | Replay Operator | EVS |
| 1360 | Streaming Engineer | |
| 1370 | Playback Operator | |
| 1380 | Teleprompter Operator | Prompter |
| 1390 | Stage Manager | SM |
| 1400 | Floor Manager | FM |
| 1410 | LED / Screens Technician | |
| 1420 | IT / Network Technician | |

### Department: Art, Wardrobe and Makeup
| Order | Name | Abbr |
|---|---|---|
| 1510 | Production Designer | |
| 1520 | Art Director | |
| 1530 | Set Dresser | |
| 1540 | Prop Master | |
| 1550 | Wardrobe Stylist | |
| 1560 | Hair and Makeup Artist | HMU |

### Department: Production Support
| Order | Name | Abbr |
|---|---|---|
| 1610 | Assistant Director | 1st AD |
| 1620 | Script Supervisor | |
| 1630 | Production Assistant | PA |
| 1640 | Location Manager | |
| 1650 | Craft Services | Crafty |
| 1660 | Driver | |

### Department: Post
| Order | Name | Abbr |
|---|---|---|
| 1710 | Editor | |
| 1720 | Assistant Editor | AE |
| 1730 | Motion Graphics Artist | |
| 1740 | Colorist | |

## Talent (10)

| Order | Name | Abbr |
|---|---|---|
| 2010 | Host | |
| 2020 | Presenter | |
| 2030 | Speaker | |
| 2040 | Moderator | |
| 2050 | On-Camera Talent | |
| 2060 | Actor | |
| 2070 | Voiceover Artist | VO |
| 2080 | Interview Subject | |
| 2090 | Subject Matter Expert | SME |
| 2100 | Panelist | |

---

## John's answers (2026-10-03)

1. Alias list for migration matching: YES. Migration-only lookup (e.g. "Mng. Producer" -> Managing Producer, "Cam Op"/"Camera" -> Camera Operator, "Sound"/"Audio" -> Sound Mixer), filled in from real free text found in the Session 6 prod-dump rehearsal.
2. EIC = Engineer in Charge (broadcast). Stays under Staff.
3. Department grouping: YES. `roles.department` nullable text column added to the schema draft.
4. Editor moves to Crew, Post department.
5. List is fine for now, as long as users can add their own roles (already in the design: per-user custom roles).
