# CLAUDE.md — Slater Project Context

This file provides persistent context for Claude Code (Codey) sessions on the Slater project. Read this file at the start of every session.

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
├── CLAUDE.md              # This file
├── public/
│   ├── index.html         # The entire Slater frontend (~1.4MB single HTML file)
│   ├── login.html         # Login page with forgot password flow
│   ├── reset-password.html # Password reset page
│   ├── admin.html         # Admin dashboard
│   └── admin-login.html   # Admin login page
└── routes/
    ├── projects.js        # CRUD for projects (filtered by owner_id)
    ├── receipts.js        # Receipt image storage (filtered by owner_id)
    ├── ocr.js             # Receipt OCR via Anthropic API
    ├── users.js           # Auth, registration, password reset
    ├── agencies.js        # Agency profile CRUD
    ├── contacts.js        # Contacts JSONB storage per user
    └── licenses.js        # License key validation and device management
```

---

## Tech Stack

- **Frontend:** Single HTML file (`public/index.html`) — vanilla JS, no framework
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (local: `slater_dev`, production: Railway)
- **Auth:** express-session + connect-pg-simple
- **Password hashing:** bcrypt
- **OCR:** Anthropic Claude Haiku (claude-haiku-4-5-20251001)
- **Email:** Resend API
- **Doc generation:** docx.js (CDN) + JSZip for Word doc patching
- **Fonts:** Geist (Google Fonts)
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
```

---

## Database Schema

```sql
users (id, email, password_hash, name, dba, phone, timezone, logo, contacts JSONB, license_id, license_key, created_at, updated_at)
agencies (id, user_id, name, contact_name, contact_email, contact_phone, address, city, state, zip, invoicing_email, invoicing_text, default_project_type, website, timezone, logo, is_default)
projects (id, key, label, data JSONB, owner_id, agency_id, created_at, updated_at)
receipts (id, project_key, expense_index, image_data, owner_id, created_at)
sessions (sid, sess, expire)
licenses (id, key, email, plan, max_devices, activated_at, expires_at, created_at)
license_devices (id, license_id, device_fingerprint, user_agent, last_seen, created_at)
password_reset_tokens (id, user_id, token, expires_at, used_at, created_at)
```

---

## API Endpoints

- `/api/users` — register (requires license_key), login, logout, me, forgot-password, reset-password
- `/api/projects` — CRUD, filtered by owner_id (requireAuth)
- `/api/receipts/:projectKey` — save/load/delete (requireAuth)
- `/api/ocr` — POST image → {vendor, date, amount, category} (requireAuth)
- `/api/agencies` — CRUD + set-default (requireAuth)
- `/api/contacts` — GET/PUT contacts JSONB per user (requireAuth)
- `/api/licenses` — validate, generate-beta, devices CRUD
- `/admin` — admin dashboard (requireAdmin session)
- `/admin/login` — admin login
- `/api/admin/*` — stats, users, licenses (requireAdmin)
- `/reset-password` — password reset page

---

## Frontend Architecture (index.html)

### Key Global Variables
- `currentSheetKey` — key of currently loaded project
- `wbItems` — array of workback item IDs
- `crew` — array of crew card IDs
- `talent` — array of talent card IDs
- `expenses` — array of expense card IDs
- `_loadedAgencies` — populated on startup from API.getAgencies()
- `window._allProjectsCache` — cache of all project data for Rundown sidebar

### Server API Client
`const API = { ... }` object wraps all fetch calls to the server.

---

## Tabs (in order)
Project | Schedule | Crew | Talent | Workback | URLs | Notes | Expenses

**NOTE: Location tab was REMOVED — locations managed in Contacts, selected per schedule day card.**

---

## Project Types (5)
- `post_production` — Post Production (auto-creates pinned Video Due Date)
- `location_shoot` — Location Shoot
- `live_broadcast_location` — Live Broadcast: On Location
- `live_broadcast_studio` — Live Broadcast: In Studio
- `webinar` — Webinar

---

## Brand & Design

- **Colors:** Charcoal `#222222`, Film Can `#9D9D99`, Masking Tape `#E9DFC8`, Paper Aging `#B89F76`, Marker `#181818`, Accent Red `#D94B43`, Background `#f3f0ed`, Tape Light `#F5F0E8`
- **Font:** Geist only (Google Fonts)
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
- Per-day ICS export (📅 button on each card)
- Collapsible cards with chevron indicator

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
- Pending categories: Overdue, Due Today, Due Tomorrow, This Week, Next Week
- ALL pins visible in Rundown including internal-only
- Schedule day pins: never Overdue, auto-move to Completed when date passes
- Completed tab has search/filter
- Crew tab: active projects only, crew status per project
- Loads ALL project data on login via `window._allProjectsCache`
- "Open Project" navigates on first click (race condition fixed with navigation flag)

### Contacts
- Buckets: Staff, Crew, Talent, Locations, Companies
- Companies: name, logo (square crop), website, notes
- Stored in PostgreSQL contacts JSONB + localStorage
- Company autocomplete on Project tab for client branding

### Client Branding
- Per-project doc_branding: Agency or Client
- Warning if client selected but no logo on file

### Notes Tab
- Rich text editor with sub-bullets (Tab/Shift+Tab)
- Note search with highlighted snippets results view

### License System
- Format: `SLTR-XXXX-XXXX-XXXX`
- Required for registration
- 3-device limit with device fingerprinting
- 10 beta keys generated (plan=beta, expires 2026-12-31)

### Admin Dashboard
- At `/admin` protected by ADMIN_SECRET
- Generate keys, manage users and licenses

### Password Reset
- Forgot password flow via Resend email
- Token expires in 1 hour
- Reset page at `/reset-password?token=xxx`

### Mobile Responsive
- Breakpoint: 768px (iPhone 13 target)
- Hamburger drawer: project management only
- Bottom nav bar: Project, Schedule, Crew, Expenses, More
- Schedule cards collapsible on mobile
- Modals full screen on mobile

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

- Open Project from Rundown requires two clicks (autosave race condition — fix in progress)
- Mobile bottom nav bar (in progress)
- Post production projects: blank Day 1 card auto-created (fix in progress)
- Workback anchor date sometimes changes on its own (multiple causes, fix in progress)

---

## V1.0 Remaining

- Default workback templates (5 project types) — waiting on John's spreadsheet
- Legal pages via TermsFeed (Privacy Policy, Terms of Service, Cookie Policy)
- Update Slater footer with real legal page URLs
- Stripe setup (needs Chase bank account activation)
- Copyright registration at copyright.gov

## Legal Review Required (before EU/international users)
- International data transfer framework (SCCs vs Binding Corporate Rules)
- Data Privacy Framework (DPF) certification evaluation
- DMCA Designated Copyright Agent registration
- VAT registration evaluation for international customers

---

## V1.5 — Client Portal
Full spec: `/mnt/user-data/outputs/Slater_V1.5_Client_Portal_Spec.docx`
Mockup: `/mnt/user-data/outputs/Slater_Client_Portal_Mockup.html`

Features: unique URL per project, password protection, workback view, schedule view, producer updates, approvals, file delivery, client branding, mobile friendly.

## V2.0 — Team Tier (Premium)
Project sharing, shared contacts/configs/templates, Microsoft Entra SSO, Azure migration.
