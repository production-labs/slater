# Built-in Global Roles: APPROVED by John (revised 2026-10-03)

These are the roles every Slater account gets (`roles.owner_id = NULL`). Users can add their own custom roles (role picker or the Roles tab in Contacts). Source of truth for the seed: `scripts/data-model/global-roles.js`.

- **Category** (`staff` / `crew` / `talent`) decides which Contacts filter a person appears under.
- **Department** groups crew roles in the picker. Staff and talent roles have none.
- **Abbreviation** in parentheses. Optional.

Totals: 80 roles. 14 staff, 55 crew, 11 talent.

## Staff (14)
Executive Producer (EP), Producer, Senior Producer (Sr. Producer), Line Producer, Associate Producer (AP), Production Manager (PM), Production Coordinator, Post Producer, Engineer in Charge (EIC), Director, Assistant Director (1st AD), Creative Director (CD), Writer, Showrunner

## Crew (55)
- **Camera (9):** Director of Photography (DP), Camera Operator (Cam Op), 1st Assistant Camera (1st AC), 2nd Assistant Camera (2nd AC), Digital Imaging Technician (DIT), Steadicam Operator, Drone Operator, Media Manager, Photographer
- **Lighting and Grip (7):** Lighting Director (LD), Gaffer, Best Boy Electric (BBE), Key Grip, Best Boy Grip (BBG), Electrician, Grip
- **Audio (5):** A1 (Audio Engineer) (A1), A2 (Audio Assistant) (A2), Sound Mixer, Boom Operator, RF Technician
- **Live and Broadcast (10):** Technical Director (TD), Broadcast Engineer, Video Engineer / Shader (V1), Graphics Operator (GFX), Streaming Engineer, Playback Operator, Teleprompter Operator (Prompter), Stage Manager (SM), LED / Screens Technician, Virtual Event Producer
- **Art and Wardrobe (5):** Production Designer, Art Director, Set Dresser, Prop Master, Wardrobe Stylist
- **Production Support (8):** 2nd Assistant Director (2nd AD), Script Supervisor, Production Assistant (PA), Location Manager, Hair and Makeup Artist (HMU), Captioner (CART), Craft Services (Crafty), Driver
- **Post (11):** Editor, Assistant Editor (AE), Motion Graphics Artist, Animator, Colorist, VFX Artist, Audio Post Mixer, Sound Designer, Dialogue Editor, ADR Mixer, Composer

## Talent (11)
Host, Emcee (MC), Presenter, Moderator, Panelist, Subject Matter Expert (SME), Interview Subject, Executive, Actor, Voiceover Artist (VO), Background / Extra

## History
- First list (74 roles) approved earlier on 2026-10-03; replaced by this list the same day.
- Roles retired from the first list (archived by the seed, never hard-deleted): Account Manager, Client Contact, Client Stakeholder, Electric (now Electrician), Floor Manager, Grip / Electric, IT / Network Technician, Jib / Crane Operator, Managing Producer, On-Camera Talent, Project Manager, Replay Operator, Speaker.
- OPEN: Managing Producer (MNG PRD) is on two of John's contacts in the old data (John McDonald, Kiko Toledo). Under the drop rule they migrate with no role unless it is added back.
