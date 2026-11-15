# AGENTS.md — Slater Project Context

This file provides persistent context for Codex (Codey) sessions on the Slater project. Read this file at the start of every session.

---

## What is Slater?

**Slater** is a cloud-based production management web application for video producers, film producers, and live event production professionals. Tagline: "The producer's toolbox."

It was built by John McDonald, Executive Producer at Worktank (a Seattle-based video production company whose primary client is Microsoft). John is also the founder of **Production Labs LLC**, a Washington state single-member LLC, which owns Slater as a commercial SaaS product.

---

## Business Context

- **Company:** Production Labs LLC
- **Owner:** John McDonald
- **State:** Washington (Tacoma area)
- **EIN:** Obtained
- **UBI:** Obtained
- **Business bank:** Chase Business Checking
- **Email:** johnm@productionlabs.io (Microsoft 365 Business Basic)
- **Support email:** hello@productionlabs.io (alias)
- **Domains:** productionlabs.io + productionlab.io (Cloudflare)
- **GitHub:** github.com/production-labs/slater (private repo)
- **Live URL:** https://slater.productionlabs.io
- **Hosting:** Railway (Hobby tier) — auto-deploys from GitHub main branch
- **Database:** Railway PostgreSQL (internal network)
- **Transactional email:** Resend (hello@productionlabs.io)

---

## Project Structure

```
~/Sites/slater/
├── server.js              # Express server — main entry point
├── .env                   # Environment variables (never commit)
├── package.json           # start script: node server.js
├── AGENTS.md              # This file
├── public/
│   ├── index.html         # App shell (markup only; logic lives in app.js)
│   ├── app.js             # Main frontend logic (vanilla JS)
│   ├── styles.css         # Main styles
│   ├── connection.js      # Offline/connection-drop handling, save queues (loaded first)
│   ├── contacts-v2.js/.css # Contacts screen (People / Organizations / Locations)
│   ├── project-orgs-v2.js # Project tab agency + client pickers
│   ├── project-people-v2.js # Crew/Talent/KP contact + role pickers
│   ├── booking-conflicts.js # Double-booking warnings across projects
│   ├── timezones.js       # The one time zone list (SlaterTZ); also required by routes/portal.js
│   ├── projects-overview.js/.css # V1.5 Projects Overview dashboard + closeout checklist
│   ├── portal.js/.css     # Client portal (public-facing)
│   ├── portal-admin.js    # Client portal (producer-facing admin panel, Project tab)
│   ├── client-readiness.js # Shared rule: is a workback item the client's, is it their turn, does it need approval
│   ├── account.js         # My Info > Your data: Download my data (.zip) + Delete account
│   ├── fonts/             # Self-hosted Geist (geist.css + Geist-Variable.woff2 + license)
│   ├── login.html         # Login page with forgot password flow
│   ├── reset-password.html # Password reset page
│   ├── admin.html         # Admin dashboard
│   └── admin-login.html   # Admin login page
├── routes/
│   ├── projects.js        # CRUD for projects (filtered by owner_id)
│   ├── receipts.js        # Receipt image storage (filtered by owner_id)
│   ├── ocr.js             # Receipt OCR via Anthropic API
│   ├── users.js           # Auth, registration, password reset
│   ├── licenses.js        # License key validation and device management
│   ├── adminBackups.js    # Admin: list/download nightly backups (R2)
│   ├── portal.js          # Public client portal (token + password gate)
│   ├── portalUploads.js   # Client file uploads to R2 (start/sign/complete/cancel)
│   ├── transfers.js       # R2 client for the slater-transfers bucket
│   ├── account.js         # Delete account (deleteAccount(), also used by admin delete) + export extras
│   └── v2/                # Contacts, organizations, locations, roles, sync
├── scripts/               # Tests (test-v2-api, test-client-readiness, e2e-*), doc-snapshot, ui-snapshot (before/after screenshots), migrate-data-model
└── docs/                  # RESTORE.md; v1.5-client-portal-plan.md; archive/data-model-rewrite/ (finished 2026-10-21)
```

---

## Tech Stack

- **Frontend:** Vanilla JS, no framework (`public/index.html` shell + `app.js` and the `*-v2.js` modules)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (local: `slater_dev`, production: Railway)
- **Auth:** express-session + connect-pg-simple
- **Password hashing:** bcrypt
- **OCR:** Anthropic Claude Haiku (claude-haiku-4-5-20251001)
- **Email:** Resend API
- **File storage:** Cloudflare R2 (nightly backups bucket + `slater-transfers` bucket for portal file delivery, 14-day lifecycle)
- **Doc generation:** docx.js (CDN) + JSZip for Word doc patching
- **Fonts:** Geist, self-hosted from `public/fonts/` (variable woff2 + OFL license; no Google Fonts)
- **Hosting:** Railway (Node.js + PostgreSQL)

---

## Environment Variables (.env)

```
NODE_ENV=production
SESSION_SECRET=...
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=hello@productionlabs.io
ADMIN_SECRET=...
APP_URL=https://slater.productionlabs.io
DATABASE_URL=...
R2_TRANSFER_BUCKET=...
R2_TRANSFER_ACCESS_KEY_ID=...
R2_TRANSFER_SECRET_ACCESS_KEY=...
R2_TRANSFER_ENDPOINT=...
```

---

## Database Schema

```sql
users (id, email, password_hash, name, dba, phone, timezone, logo, license_id, license_key, created_at, updated_at, is_suspended, default_organization_id, default_country)
projects (id, key, label, data JSONB, owner_id, created_at, updated_at, agency_org_id, client_org_id)
receipts (id, project_key, expense_index, image_data, owner_id, created_at)
sessions (sid, sess, expire)
licenses (id, key, email, plan, max_devices, activated_at, expires_at, created_at)
license_devices (id, license_id, device_fingerprint, user_agent, last_seen, created_at)
password_reset_tokens (id, user_id, token, expires_at, used_at, created_at)

-- Contacts data model (v2, live since 2026-10-17). Definitions: scripts/data-model/schema.sql
organizations (id, owner_id, name, is_agency, logo, website, phone, address, city, state, zip, country, notes, contact_name, contact_email, contact_phone, invoicing_email, invoicing_text, default_project_type, timezone, client_uid, archived_at, created_at, updated_at)
contacts (id, owner_id, organization_id, name, sort_last_name, email, phone, address, city, state, zip, country, title, union_status, gear_kit, travel_availability, notes, client_uid, archived_at, created_at, updated_at)
roles (id, owner_id, name, abbreviation, category, department, sort_order, archived_at, created_at, updated_at)   -- owner_id NULL = built-in
contact_roles (contact_id, role_id, sort_order)
locations (id, owner_id, name, address, city, state, zip, country, hospital, notes, client_uid, archived_at, created_at, updated_at)
deleted_records (id, owner_id, table_name, record_id, deleted_at)   -- tombstones for sync

-- Client portal (V1.5, added 2026-10-28, LIVE on production since 2026-10-29). All cascade on projects.id.
portals (project_id PK, owner_id, token UNIQUE, password_hash, created_at, updated_at)   -- no row = portal off
portal_updates (id, project_id, owner_id, author_name, body, created_at, updated_at)
portal_responses (id, project_id, owner_id, wb_item_uuid, kind approved|changes_requested, responder_name, note, created_at, acknowledged_at)
portal_files (id, project_id, owner_id, wb_item_uuid, filename, content_type, size_bytes, r2_key UNIQUE, uploaded_by_name, status pending|ready, expires_at, downloaded_at, upload_id, created_at, ready_at)
```

- Agencies and client companies are both `organizations` (`is_agency` marks agencies). A project's agency/client link is `projects.agency_org_id` / `client_org_id`. The default agency is `users.default_organization_id`.
- Crew/talent/KP entries stay inside `projects.data` and carry `contact_id` + `role_id` alongside their snapshot fields.
- The old v1 storage (`users.contacts` JSONB, the `agencies` table, `projects.agency_id`, `data.agency_id`) was removed: code on 2026-10-20, database on 2026-10-21.
- Schema changes go through `scripts/migrate-data-model.js` (applies schema.sql + built-in roles; local only unless `--allow-remote`). Take a backup first (docs/RESTORE.md).
- `portal_files` originally had a `direction` column (deliverable vs client_upload); it was dropped (deliverables are now links, not stored files) and `expires_at`/`downloaded_at`/`upload_id` were added for the file-transfer model (14-day retention, 5 GB/file cap).

---

## API Endpoints

- `/api/users` — register (requires license_key), login, logout, me, forgot-password, reset-password
- `/api/projects` — CRUD, filtered by owner_id (requireAuth)
- `/api/receipts/:projectKey` — save/load/delete (requireAuth)
- `/api/ocr` — POST image → {vendor, date, amount, category} (requireAuth)
- `/api/v2/contacts`, `/organizations`, `/locations` — GET (`?since=`), GET/:id, POST, PATCH/:id (needs `base_updated_at`, 409 on conflict), DELETE/:id (archive), POST/:id/restore (requireAuth)
- `/api/v2/roles` — built-in (read-only) + custom roles; delete refused while in use (requireAuth)
- `/api/v2/sync?since=` — everything changed since a cursor, one snapshot; `/api/v2/settings`, `/api/v2/default-organization` (requireAuth)
- `/api/licenses` — validate, generate-beta, devices CRUD
- `/api/account` — GET export-extra (profile + portal history for Download my data), POST delete { password }: storage files first (503 + nothing deleted if storage is down), then one transaction; retires the license key unless another account uses it (requireAuth)
- `/api/portal-admin/:key` — producer-side portal management (enable/disable, regen token, password, updates, approvals, file downloads/deletes) (requireAuth)
- `/portal/:token` — public client portal (password-gated if set); file uploads, responses
- `/admin` — admin dashboard (requireAdmin session)
- `/admin/login` — admin login
- `/api/admin/*` — stats, users, licenses, backups (requireAdmin)
- `/health` — health check
- `/reset-password` — password reset page

---

## Frontend Architecture (app.js)

### Key Global Variables
- `currentSheetKey` — key of currently loaded project
- `wbItems` — array of workback item IDs
- `crew` — array of crew card IDs
- `talent` — array of talent card IDs
- `expenses` — array of expense card IDs
- `window._allProjectsCache` — cache of all project data for Rundown sidebar

### Server API Client
`const API = { ... }` object wraps all fetch calls to the server.

---

## Tabs (in order)
Project | Schedule | Crew | Talent | Workback | URLs | Notes | Expenses | Portal

**NOTE: Location tab was REMOVED — locations managed in Contacts, selected per schedule day card.**
**Portal tab added in V1.5 — producer-facing client portal management panel, lives on the Project record.**

---

## Project Types (5)
- `post_production` — Post Production (auto-creates pinned Video Due Date)
- `location_shoot` — Location Shoot
- `live_broadcast_location` — Live Broadcast: On Location
- `live_broadcast_studio` — Live Broadcast: In Studio
- `webinar` — Webinar

---

## Brand & Design

- **Two looks, on purpose (John, 2026-11-14):**
  - **App** (`public/styles.css` `:root`): dark. Background `#181818`, surfaces `#282828` / `#303030` / `#393939`, borders `#3C3C3C`, text `#F7F5EF`, muted `#6E747B`, accent orange `#FF4D00`, yellow `#FFC107`. Careful: some variable names are left over from the old light theme and no longer match their meaning (`--charcoal` is the light text color `#F7F5EF`, `--tape` is a dark surface).
  - **Client portal** (`public/portal.css`): light. Background `#FBFBFC`, cards white, ink `#181818`, accent red `#D94B43`. Keep it this way; don't match it to the app.
  - Word docs (call sheet, workback, expense report) keep their own print palette (charcoal / Masking Tape `#E9DFC8` / Tape Light `#F5F0E8`).
- **UI conventions (2026-11-14):** every tab opens with a `.tab-head` row: title (`.sh`) left, buttons right (`.tab-actions`), one full-width rule. Button order: **+ Add** (`.lb.accent`, plus icon), then Save as template / Templates, then **Download** (`.lb`, download icon; label "Download call sheet / workback / expense report", `.docx` only in the tooltip). Empty lists use `class="empty-hint" data-empty="..."` (CSS shows the message while the list is empty) or `.empty-msg`. Workback table cells that don't apply to a row use `wbTvNaCell()` (striped, not editable, tooltip says why). No `--` placeholders in tables: leave the cell empty.
- **Font:** Geist only, every page (self-hosted: `public/fonts/geist.css`). Never add a third-party font link
- **Logo:** Film can baked in as `const LB64`
- **NEVER use em-dashes** (`—`) anywhere

---

## Word Document Generation

Three Word docs generated client-side:
1. **Call Sheet** — `generateDoc()` — respects `exclude_callsheet` flag per day
2. **Workback** — `generateWorkback()` — excludes internal-only items
3. **Expense Report** — `generateExpenseDoc()`

All docs respect per-project `doc_branding` setting (Agency or Client logo).
JSZip XML patch in `generateWorkback()` is critical — injects gridSpan attributes.

---

## Key Features Built

### Schedule Tab
- Multi-day shoot cards with dynamic CSS calendar icon (red/white, shows actual date)
- Day Details section (sunrise, sunset, breakfast, lunch — collapsed by default)
- Location dropdown from Contacts, address displayed below, hospital as plain text
- Exclude from call sheet checkbox + Show blacks required checkbox (top of card)
- Per-day crew editing modal (Edit Crew button)
- Main event: optional tick box on each schedule card (`main_event`, one per project, not on Post Production). `projectFinalDate()` in `app.js` is the one rule for the big final date (project label, Projects Overview key date, default workback anchor): Post Production = Project Due Date; otherwise the ticked day, else the last day that isn't Wrap or Travel. Ticking only moves the workback anchor while the workback is empty. Bright yellow star on all three timelines (Workback, Overview Portfolio, client portal) for the ticked Main event or the Post Production Due Date only; unticked projects get no star. Test: `scripts/e2e-main-event.js`
- Per-day ICS export (📅 button on each card). Times are written as UTC, read in the project's time zone, so calendar apps show each person's own time; no project zone = floating local times, as before
- Time zones (2026-11-14): one list in `public/timezones.js` (`SlaterTZ`, 49 zones grouped by region) feeds the Schedule tab, My Info and Organizations pickers, call sheets, ICS files and the portal server. The original eight codes (PT, ET, CT, MT, AKT, HT, GMT, CET) are still saved as codes; newer zones save as IANA names (`Asia/Tokyo`). `SlaterTZ.iana()` turns either into an IANA name; `SlaterTZ.abbr()` gives zone letters (PST, BST, IST, AEDT, else GMT+9); `SlaterTZ.toUtcMs()` is the DST-aware wall-clock to UTC conversion
- AM/PM always uppercase with a space, however typed (`upperAmPm()` / `fixProjectTimes()` in app.js, applied when a project is opened, cached for Rundown/Overview, and saved; the portal server does the same)
- Client portal times (2026-11-14): shown in the viewer's own time zone, always with the zone (`clockText()` in `public/portal.js`; the server sends UTC `start`/`end`, rules in `clientTimes()` in `routes/portal.js`). Meetings and sessions: start + end. Shoot / Live Broadcast: Cameras Up / Go Live only. Rehearsal with crew: start + end. Kickoff and Delivery: their time. Setup, Wrap and Travel days and every crew call time: never shown. Zone = the project's, else the producer's My Info default. A time that can't be read ("TBD") shows as typed. Portal passwords: at least 8 characters (same as accounts). Test: `scripts/e2e-portal.js`
- Collapsible cards with chevron indicator
- "Client attends in person" per day (unticked = no location shown on the client portal); address-less locations never become portal venues

### Crew Tab
- Booking status: TBD (gray), Pencil (yellow), 1st Hold (orange), Confirmed (green)
- Status pills with tooltips
- Crew roster status bar with progress
- Crew configurations (save/load role templates, merge-only)
- Per-day crew exclusion via schedule card modal

### Workback Tab
- Modes: Anchor, Sequential, Manual
- Sequential "After:" dropdown — chain off any item OR schedule pin
- Pin IDs: `pin_YYYY-MM-DD` for schedule days, `video_due` for post production
- Changing a schedule day date updates all sequential anchor references
- Internal only checkbox — hides from Word doc, shows in Rundown
- All pins sorted by date in live UI
- `wbRecalc()` handles all date calculations

### Rundown Sidebar (📋 button)
- Three tabs: Pending, Completed, Crew
- Pending categories: Overdue, Due Today, This Weekend, Due Tomorrow, This Week, Next Week. "Due Tomorrow" = next business day (reads "Due Monday" on Fri/Sat); "This Weekend" (Fri/Sat only) holds the Sat/Sun in between. `rundownRanges()` / `rundownBucket()` in app.js
- ALL pins visible in Rundown including internal-only
- Schedule day pins: never Overdue, auto-move to Completed when date passes
- Completed tab has search/filter
- Crew tab: active projects only, crew status per project; "Conflicts" group at the top (all upcoming projects)
- Loads ALL project data on login via `window._allProjectsCache`
- "Open Project" navigates on first click (race condition fixed with navigation flag)

### Contacts
- Tabs: People, Organizations, Locations (`contacts-v2.js`)
- People: no buckets; category (Staff / Crew / Talent / Uncategorized) comes from their roles (multiple role pills per person); union status, gear/kit, travel, notes
- Roles: built-in list plus per-user custom roles
- Organizations: agencies and client companies in one list (`is_agency` flag); logo (512px square crop), website, billing contact, invoicing defaults
- Stored in PostgreSQL tables (see Database Schema), synced per record (`/api/v2/sync`); soft delete via archive
- Project tab agency + client pickers read Organizations; default agency per user

### Client Branding
- Per-project doc_branding: Agency or Client
- Warning if client selected but no logo on file

### Notes Tab
- Rich text editor with sub-bullets (Tab/Shift+Tab)
- Note search with highlighted snippets results view

### Client Portal (V1.5, LIVE)
- Own Portal tab on the Project record (`public/portal-admin.js`), plus the public-facing portal itself (`public/portal.js/.css`, `routes/portal.js`)
- Unique URL per project (token), optional password (remembered 30 days per browser)
- Layout: status line + "Portal is on" pill, link card (Copy/Open), left column (Client responses / Files / Updates), right column tabbed Settings (Emails / Links / Password) + separate "Portal management" card (Make a new link / Turn off portal)
- Workback view with client-friendly timeline (zoom: 2/4/6 weeks/Whole project); schedule view
- Producer updates (newest shown first, latest 10 on the portal)
- Approvals: a workback item is "the client's" when its Owner is "Client", the client company or the client contact (`SlaterReadiness.isClientOwner`). Owner is a type-or-pick box (client company, client contact, Key Personnel). Only client items with "Client review" ticked (`client_review`; absent = from before 2026-11-07 = approvable) get Approve / Request changes; new tasks start unticked. Test: `scripts/e2e-wb-owner.js`
- "Waiting on you" follows status, not the calendar: a client item is the client's turn only once the step before it is done (`public/client-readiness.js`, shared with the Overview)
- File delivery is link-based (URLs tab, "Show on client portal"); client file uploads go through R2 (`slater-transfers` bucket, 14-day retention, 5 GB/file, 200 files / 50 GiB per project cap)
- Producer panel shows files from the client with download/delete; files also show on the relevant workback item

### Projects Overview (V1.5, LIVE)
- Dashboard-style summary across all upcoming projects (`public/projects-overview.js/.css`)
- Per project: due/event date, next milestone, next task, graphical workback timeline, crew/talent booking status, total + reimbursable expense
- "With clients" and "Held up by us" KPIs, closeout checklist

### Booking Conflicts (LIVE 2026-10-21)
- `public/booking-conflicts.js` — crew/talent/KP double-booking warnings across projects, matched by `contact_id` over overlapping schedule days
- Pop-up on booking a conflicting person; card strips, nav counts, Schedule day lines; Rundown Crew tab "Conflicts" group

### License System
- Format: `SLTR-XXXX-XXXX-XXXX`
- Required for registration
- 3-device limit with device fingerprinting

### Admin Dashboard
- At `/admin` protected by ADMIN_SECRET
- Generate keys, manage users and licenses, list/download nightly backups (R2)

### Password Reset
- Forgot password flow via Resend email
- Token expires in 1 hour
- Reset page at `/reset-password?token=xxx`

### Mobile Responsive (phones = on-set companion; decided by John 2026-11-14)
- Scope: phones are a companion for on-set work (schedule, crew, Rundown, expenses + receipt photos). Heavy editing (workback building, templates) is done on a computer; on phones it only has to not break.
- Status 2026-11-14: fixed and checked in a simulated iPhone 13 (3 batches, all live: 4fa5968, d053886, cd23c02). WAITING ON John's real-phone test (scroll feel, tap sizes, keyboard covering fields, receipt camera flow). Ask him for results first when mobile comes up.
- Phone rule (2026-11-15): `(max-width:768px), (max-height:500px) and (pointer:coarse)`, so a phone held sideways (844px wide) still gets the phone layout. Every phone @media block, `isPhone()` (`PHONE_MQ` in app.js) and the offline banner (connection.js) use it; keep them in sync. Landscape phones: slimmer top bar and bottom nav.
- Crew / Talent card grid (2026-11-15, all screens): `#crew-list,#talent-list` auto-fill grid, cards min ~360px, max 4 columns (adapts to the Rundown opening/closing). Crew, talent and key personnel cards lay out Phone / Email / Status by their own width via container queries (wide one row, medium Phone+Status / Email, narrow stacked).
- Page scrolls (html/body are overflow:hidden on desktop only); top bar is fixed and shows the open project's name (`updateMobileTitle()`), tap it for the menu.
- Bottom nav: Schedule, Crew, Rundown, Expenses, More (More = Project, Talent, Workback, URLs, Portal, Notes; More lights up for those). `updateMobileNav()`. Phones open on Schedule.
- Rundown: a full screen between the top bar and bottom nav (`mobileOpenRundown()`), starts closed, closes when a tab is picked.
- Menu drawer: project picker + New/Save/Duplicate/Delete, then Overview, Contacts, Organizations, My Info.
- Workback: list only on phones; tapping an item swaps in a full-screen editor with an "All workback items" Back button (`wbMobileShowEditor()`/`wbMobileBack()`).
- `.desk-only` hides desk-work buttons on phones (crew/workback templates, Workback List/Table switch). `.app-content-col{overflow-x:clip}` stops anything pushing the page sideways.
- Expense card: date + amount on top, full-width description, "📷 Add receipt" button (opens camera/library).
- Schedule tab on phones (2026-11-15, John's design, `public/schedule-mobile.js`): each day is a read-only summary card (name, day/type/zone; the day schedule if any, else the key times; location, tap = maps). "More details" holds the rest. Edit turns the existing card into a full-screen editor (Done on top, Delete day at the bottom), so all save logic is the desktop code. Kickoff / Due Date: one line + Edit in place. "+ Add day" replaces the "+" dividers. Hooks in app.js: `addScheduleDay` -> `ScheduleMobile.setup`, `refreshDayLocDisplay` / `closeDayStaffModal` -> `render`, `loadFormData` / `clearForm` -> `renderAll`. `initMobileCollapse` is now a no-op.
- Maps links (`public/maps-link.js`, `SlaterMaps.url()`): Apple Maps on iPhone/iPad, `geo:` (default app) on Android, Google Maps web on computers. Used by the schedule cards and the portal venue link.
- Phone layout guard: `.app-shell{grid-template-columns:minmax(0,1fr)}` + `min-width:0` on the columns. Without it, iPhone date fields widened the page and the right margin looked tiny (John's 2026-11-15 screenshot).
- Screenshot tooling used for the survey (not in repo): iPhone 13 emulation via puppeteer `KnownDevices['iPhone 13']`, same read-only session approach as `scripts/ui-snapshot.js`.

---

## Auth Flow

1. License key required for registration
2. Sessions via connect-pg-simple
3. `requireAuth` middleware for all data routes
4. `requireAdmin` for admin routes
5. `app.set('trust proxy', 1)` required for Railway SSL — DO NOT REMOVE

---

## Deployment

### Local
```
cd ~/Sites/slater && node server.js
# http://localhost:3000
```

### Production
- Push to GitHub main → Railway auto-deploys in 2-3 minutes
- URL: https://slater.productionlabs.io

### Git Workflow
```
git add -A
git commit -m "Description"
git push
```

---

## Known Issues / In Progress

- Mobile: fixed in a simulated iPhone 2026-11-14 (see Mobile Responsive). Waiting on John's real-phone test.
- (Fixed 2026-11-07: `e2e-portal-notify` failures were stale test data; 15/15.) Cloudflare Browser Cache TTL now "Respect Existing Headers" (2026-11-07).

---

## V1.0 Remaining

- Default workback templates (5 project types) — on hold for now
- Paddle setup (payments, Pause/Cancel): deferred, later
- Copyright registration: claim filed with the US Copyright Office 2026-10-27, Case #1-15258616171, "Slater, Version 1.0" (Literary Work). Awaiting examiner review. Effective date of registration is the 2026-10-27 submission date, not the eventual certificate date. TODO: confirm the claimant on the application is Production Labs LLC, not John personally.

Done:
- Legal pages via TermsFeed (Privacy Policy, Terms of Service, Cookie Policy, Refund Policy) — live, linked in `public/index.html` footer

## Legal Review Required (before EU/international users)
- International data transfer framework (SCCs vs Binding Corporate Rules)
- Data Privacy Framework (DPF) certification evaluation
- DMCA Designated Copyright Agent registration
- VAT registration evaluation for international customers

---

## V1.5 — Client Portal

**Working plan + current status: `docs/v1.5-client-portal-plan.md` (read its PICK UP HERE section first).**
Scope: Client Portal + Project Overview. Crew portal mockup is tabled, may never be built.

Core feature set is LIVE on production: unique URL per project, password protection, workback view, schedule view, producer updates, approvals, file delivery (link-based deliverables + R2 client uploads), client branding, mobile friendly.

Resolved 2026-11-07: client-review detection (Owner type-or-pick box + "Client review" checkbox). Also built 2026-11-07: self-hosted fonts (Geist everywhere), Download my data + Delete account (My Info), Rundown "This Weekend" group.

Remaining before V1.5 is fully closed out:
- Pause / Cancel for user accounts (with Paddle billing)
- Legal fact-checks (Resend tracking, R2 bucket location, Railway log retention), DMCA agent registration, lawyer review

Scheduled alongside V1.5 (not part of the client portal spec itself): crew/talent/KP double-booking warnings (LIVE), Project Overview dashboard (LIVE).

## V2.0 — Team Tier (Premium)
Project sharing, shared contacts/configs/templates, Microsoft Entra SSO, Azure migration.
