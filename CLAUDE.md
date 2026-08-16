# CLAUDE.md — Slater Project Context

This file provides persistent context for Claude Code sessions on the Slater project.

---

## What is Slater?

**Slater** is a production management web application for video production companies and freelance producers. Tagline: "The producer's toolbox."

It was built by John McDonald, Executive Producer at Worktank (a Seattle-based video production company whose primary client is Microsoft). John is also the founder of **Production Labs LLC** (in formation), which will be the parent company for Slater as a commercial SaaS product.

---

## Project Structure

```
~/Sites/slater/
├── server.js              # Express server — main entry point
├── .env                   # Environment variables (never commit)
├── package.json
├── import.js              # One-time script to import projects from localStorage backup
├── public/
│   ├── index.html         # The entire Slater frontend (1.3MB single HTML file)
│   └── login.html         # Login page
└── routes/
    ├── projects.js        # CRUD for projects
    ├── receipts.js        # Receipt image storage
    ├── ocr.js             # Receipt OCR via Anthropic API
    └── users.js           # Auth, registration, agency settings
```

---

## Tech Stack

- **Frontend:** Single HTML file (`public/index.html`) — vanilla JS, no framework
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (`slater_dev` locally)
- **Auth:** express-session + connect-pg-simple (sessions stored in DB)
- **Password hashing:** bcrypt
- **OCR:** Anthropic Claude Haiku via API (claude-haiku-4-5-20251001)
- **Doc generation:** docx.js (CDN) + JSZip for Word doc patching
- **Fonts:** Geist (Google Fonts)

---

## Database Schema

```sql
-- Users (includes agency/My Info settings)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  agency_name TEXT,
  agency_address TEXT,
  agency_city TEXT,
  agency_state TEXT,
  agency_zip TEXT,
  agency_phone TEXT,
  agency_billing_contact TEXT,
  agency_timezone TEXT DEFAULT 'PT',
  agency_project_type TEXT DEFAULT 'location_shoot',
  agency_logo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,      -- e.g. cs_1784768328378
  label TEXT,                    -- display label for dropdown
  data JSONB NOT NULL DEFAULT '{}', -- full project JSON
  owner_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipts (stored separately to avoid localStorage quota issues)
CREATE TABLE receipts (
  id SERIAL PRIMARY KEY,
  project_key TEXT NOT NULL,
  expense_index INTEGER NOT NULL,
  image_data TEXT NOT NULL,      -- base64 encoded image
  owner_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_key, expense_index)
);

-- Sessions (managed by connect-pg-simple)
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
```

---

## API Endpoints

### Users (`/api/users`)
- `POST /api/users/register` — create account (invite only, no public signup)
- `POST /api/users/login` — login, creates session
- `POST /api/users/logout` — destroy session
- `GET /api/users/me` — get current user
- `GET /api/users/me/agency` — get agency/My Info settings
- `PUT /api/users/me/agency` — save agency/My Info settings

### Projects (`/api/projects`) — requires auth
- `GET /api/projects` — list all projects (key, label, updated_at)
- `GET /api/projects/:key` — get single project with full data
- `POST /api/projects/:key` — save/upsert project
- `DELETE /api/projects/:key` — delete project

### Receipts (`/api/receipts`) — requires auth
- `GET /api/receipts/:projectKey` — get all receipts for a project
- `POST /api/receipts/:projectKey/:index` — save a receipt
- `DELETE /api/receipts/:projectKey` — delete all receipts for a project

### OCR (`/api/ocr`) — requires auth
- `POST /api/ocr` — send receipt image, returns `{vendor, date, amount, category}`

---

## Frontend Architecture (index.html)

The entire frontend is a single HTML file with:
- Embedded base64 Slater logo (`const LB64`)
- fflate (bundled) for ZIP operations
- docx.js (CDN) for Word document generation
- JSZip for XML patching of generated docs
- Google Fonts (Geist)
- All app logic in vanilla JS

### Server API Client
At the top of the script, there's a `const API = { ... }` object that wraps all fetch calls to the server. All server communication goes through this object.

### Key Global Variables
- `currentSheetKey` — the key of the currently loaded project (e.g. `cs_1784768328378`)
- `expenses` — array of expense card IDs
- `wbItems` — array of workback item IDs
- `crew`, `talent`, `locs`, `urls` — arrays of card IDs for each section

### LocalStorage Keys (legacy, still used as fallback)
- `slater_callsheets` — all projects
- `slater_contacts` — contacts/address book
- `slater_agency` — agency settings
- `slater_last_project` — key of last opened project
- `slater_receipt_{projectKey}_{index}` — receipt images (being migrated to DB)

---

## Tabs (in order)
Project | Schedule | Location | Crew | Talent | Workback | URLs | Notes | Expenses

---

## Project Types (5)
- `post_production` — Post Production
- `location_shoot` — Location Shoot
- `live_broadcast_location` — Live Broadcast: On Location
- `live_broadcast_studio` — Live Broadcast: In Studio
- `webinar` — Webinar

---

## Brand & Design

- **Colors:** Charcoal `#222222`, Film Can `#9D9D99`, Masking Tape `#E9DFC8`, Paper Aging `#B89F76`, Marker `#181818`, Accent Red `#D94B43`, Background `#f3f0ed`
- **Font:** Geist only
- **Logo:** Film can with masking tape — baked in as `const LB64`, NOT user-replaceable
- **Copyright:** © 2025 Production Labs LLC. All rights reserved.
- **Never use em-dashes** in any content written for or on behalf of John

---

## Word Document Generation

Three Word docs are generated client-side using docx.js:

1. **Call Sheet** — generated by `generateDoc()` — 2 pages per shoot day
2. **Workback** — generated by `generateWorkback()` — schedule with milestone pins
3. **Expense Report** — generated by `generateExpenseDoc()` — expenses + receipt grid

All docs use:
- Agency logo (if set) or Slater logo top-left
- "Powered by SLATER" in footer
- Calibri font throughout
- A JSZip XML patch step to inject `gridSpan` attributes that docx.js doesn't write correctly

---

## Key Features

### Library System
- Projects stored with keys like `cs_1784768328378`
- Dropdown label format: `Company | Project Title | F. LastName | MM/DD/YY`
- Autosave: debounced 10s after changes, immediate on tab switch
- New | Save | Duplicate | Delete buttons

### Workback Tab
- Three item modes: Anchor, Sequential, Manual
- Schedule milestone pins (blue cards) integrated from Schedule tab
- "Internal only" checkbox on both items and pins — hides from Word doc export
- `wbGetItemsForDoc()` merges regular items + pins, filters internal-only

### Expenses Tab
- Per expense: date, vendor, category, amount, paid by, reimbursable, receipt
- Receipt images compressed to max 1200px JPEG before storage
- OCR auto-populates fields on upload
- Receipts stored in PostgreSQL `receipts` table (separate from project JSON)
- Expense report Word doc with 2x2 receipt grid

### Location Tab
- Structured address fields: address, city, state, zip (matches agency address format)
- Per-location hospital field with Nominatim/Overpass auto-lookup
- "Show blacks required" detection — compares location address to agency address
- Location autocomplete fills all fields from contacts bucket

### Notes Tab
- Rich text editor (bold, italic, underline, lists)
- Image paste: compressed to 1200px, stored as base64, 50% width, drop shadow, click to expand
- Draft persistence: saves `_note_draft` with project data

### My Info (Agency Settings)
- Modal accessed via gear icon in library bar
- Fields: Agency Name or DBA, Billing Contact Name, Address, City, State, Zip, Phone, Timezone, Default Project Type, Logo
- Settings stored in PostgreSQL `users` table per user
- Loaded from server on startup, falls back to localStorage

---

## Authentication Flow

1. Unauthenticated requests to `/` redirect to `/login`
2. Login form POSTs to `/api/users/login`
3. Session stored in `sessions` table via connect-pg-simple
4. All `/api/projects`, `/api/receipts`, `/api/ocr` routes require auth via `requireAuth` middleware
5. `/api/users/register` is unprotected (invite-only by convention, no public link)

---

## Current State (as of August 2026)

### Working
- Full CRUD for projects via PostgreSQL
- Receipt storage in PostgreSQL
- OCR via Anthropic Haiku
- User authentication with sessions
- Agency settings stored per user in PostgreSQL
- All 10 real projects migrated from localStorage
- Word doc generation for call sheet, workback, expense report

### Known Issues / TODO
- Projects are NOT yet filtered by `owner_id` — all users see all projects (critical fix needed)
- No logout button in the Slater UI yet
- Workback download button may be missing from server version
- `owner_id` not being set on new projects/receipts when saved

### Roadmap
- Filter projects by `owner_id` (next priority)
- Logout button in UI
- Set `owner_id` on save
- License key system (Gumroad) with 3-device limit
- PDF export (call sheet + workback)
- Default workback templates (5 project types)
- Azure deployment (PostgreSQL + Node.js)
- Microsoft Entra SSO
- Domain: productionlabs.io

---

## Key Personnel (for testing/default data)
- John McDonald — EP, john@vandonald.com
- Shaun Parker — Producer
- Wayne Mohammed — EIC
- Kiko Toledo — Managing Producer
- Brian Snyder — EIC (default in some forms)

---

## Important Notes for Claude Code

1. **Never use em-dashes** (`—`) anywhere in the codebase or generated content
2. The frontend (`public/index.html`) is a single large file — be careful with edits
3. Always use `var` or `function` declarations (not `const`/`let`) inside non-strict contexts in index.html to avoid Safari compatibility issues
4. The JSZip XML patch in `generateWorkback()` is critical — it injects `gridSpan` attributes that docx.js omits
5. Receipt images are stored as base64 strings — they can be large (up to ~1MB each)
6. `currentSheetKey` is the source of truth for which project is active
7. The `API` object at the top of index.html handles all server communication
8. localStorage is kept as a fallback for all server operations
