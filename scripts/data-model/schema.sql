-- ============================================================
-- Slater data model: contacts, organizations, roles, locations
-- Schema v2, approved 2026-10-03.
--
-- Do not run this file directly. It is executed by
-- scripts/migrate-data-model.js inside a single transaction
-- (along with the global role seed). NOT wired into server.js
-- startup until John says to merge.
--
-- Everything here is additive: no existing table or column is
-- dropped or altered in a destructive way. users.contacts,
-- agencies, projects.agency_id and projects.data.client_company
-- all stay as rollback.
--
-- Written idempotently (IF NOT EXISTS) so the script can be
-- re-run during rehearsal against a restored prod dump.
-- ============================================================



-- ------------------------------------------------------------
-- SYNC SUPPORT: updated_at trigger
--
-- Per-record offline sync (answers #8, #9) depends on updated_at
-- moving on EVERY write, including archives (tombstones). A
-- trigger guarantees that instead of trusting every code path to
-- remember. clock_timestamp() rather than NOW() so two writes in
-- one transaction still get distinct, ordered stamps.
--
-- Known gap, handled in Session 2 (not schema): a row stamped
-- inside a slow transaction can commit AFTER a client has pulled
-- with a cursor past that stamp. The pull endpoint should overlap
-- its window (updated_at > cursor - interval '10 seconds') and the
-- client dedupes by id. Cheap and enough at our scale.
--
-- The per-device "last synced at" cursor and the three-way-merge
-- baseline live client-side (localStorage/IndexedDB). No table.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION slater_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- ROLES
-- Global starter list (owner_id NULL) plus per-user custom roles.
-- Category lives here; a contact's category is derived from its
-- roles. A contact with no roles shows as "Uncategorized" in the
-- UI (answer #2). That is a derived label, not a stored value.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global
  name          TEXT NOT NULL,                  -- "Director of Photography"
  abbreviation  TEXT,                           -- "DP", optional (answer #3)
  category      TEXT NOT NULL
                  CHECK (category IN ('staff', 'crew', 'talent')),
  department    TEXT,                           -- picker grouping, mainly crew: "Camera",
                                                -- "Audio", "Live and Broadcast", ...
                                                -- NULL = ungrouped ("Other" in the UI)
  sort_order    INTEGER NOT NULL DEFAULT 0,     -- ordering within a category
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two partial unique indexes instead of v1's COALESCE(owner_id, 0)
-- trick, which relied on no user ever having id 0.
-- Note: a user CAN create a custom role with the same name as a
-- global one. The picker should warn, not block (Session 5).
CREATE UNIQUE INDEX IF NOT EXISTS roles_global_name_uniq
  ON roles (lower(name)) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_user_name_uniq
  ON roles (owner_id, lower(name)) WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS roles_owner_idx ON roles (owner_id);

DROP TRIGGER IF EXISTS roles_touch ON roles;
CREATE TRIGGER roles_touch BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION slater_touch_updated_at();

-- "In-use roles cannot be deleted" is enforced two ways:
--   1. contact_roles.role_id deferred foreign key (below).
--   2. Project crew/talent/KP entries reference role_id inside
--      projects.data JSONB, which no FK can see. The delete
--      endpoint must also check projects.data (Session 2).
-- Users archive (archived_at) rather than delete in normal use.
-- Global roles are read-only to users; no hide-a-global-role
-- feature for now.


-- ------------------------------------------------------------
-- ORGANIZATIONS
-- Agencies + companies merged. Whether an org acts as agency or
-- client is decided per project. is_agency (answer #6) only
-- filters the AGENCY picker; the client picker shows every org.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                   SERIAL PRIMARY KEY,
  owner_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  is_agency            BOOLEAN NOT NULL DEFAULT FALSE,
  logo                 TEXT,                    -- base64 PNG, 512x512 square crop (answer #12)
  website              TEXT,
  phone                TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT,
  zip                  TEXT,
  country              TEXT CHECK (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2
  notes                TEXT,

  -- Billing contact: plain fields, not a linked contact (answer #5).
  -- Carried over from agencies.contact_*; printed on the call sheet
  -- and expense report.
  contact_name         TEXT,
  contact_email        TEXT,
  contact_phone        TEXT,

  -- Agency settings. Only meaningful when is_agency = true.
  invoicing_email      TEXT,
  invoicing_text       TEXT,
  default_project_type TEXT,
  timezone             TEXT,

  -- Migration bookkeeping only. Lets verification and rollback map
  -- old ids to new rows. Safe to drop after cutover is confirmed.
  legacy_agency_id     INTEGER,                 -- agencies.id, if migrated from there
  legacy_source        TEXT,                    -- 'agency' | 'contacts.companies' | 'project.client_company'

  -- Offline-create idempotency: the client stamps a UUID on records
  -- it creates; a retried POST with the same client_uid returns the
  -- existing row instead of creating a duplicate.
  client_uid           TEXT,

  archived_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizations_owner_sync_idx
  ON organizations (owner_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_client_uid_uniq
  ON organizations (owner_id, client_uid) WHERE client_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_name_idx
  ON organizations (owner_id, lower(name));
CREATE INDEX IF NOT EXISTS organizations_agency_idx
  ON organizations (owner_id) WHERE is_agency AND archived_at IS NULL;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country TEXT CHECK (country ~ '^[A-Z]{2}$');

DROP TRIGGER IF EXISTS organizations_touch ON organizations;
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION slater_touch_updated_at();

-- No `type` column (dropped per answer #6). No is_client column.
-- No is_default column: see users.default_organization_id below.


-- ------------------------------------------------------------
-- CONTACTS
-- People. No bucket column: category comes from roles.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id     INTEGER REFERENCES organizations(id) ON DELETE SET NULL,

  -- Single full name plus optional sort key (answer #1).
  -- Sort uses COALESCE(sort_last_name, name).
  name                TEXT NOT NULL,
  sort_last_name      TEXT,

  email               TEXT,
  phone               TEXT,

  -- Location, for city/state filtering only. No geocoding.
  -- address carried over because the old contact blob has it.
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  country             TEXT CHECK (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2
  -- Job title, mostly for talent / interview subjects and client contacts
  -- ("Chief Executive Officer and President"). Not a production role.
  title               TEXT,

  -- Production fields, full UI in Session 3 (answer #7).
  -- Free text rather than enums/booleans: "IATSE 600", "Non-union",
  -- "Local 44 + SAG-AFTRA"; "Owns FX6 kit + lighting package";
  -- "PNW only", "Will travel, has passport". Structured filters
  -- can come later if real data shows a pattern.
  union_status        TEXT,
  gear_kit            TEXT,
  travel_availability TEXT,
  notes               TEXT,

  -- Explicitly NOT here: day rate, W-9 (answer #7).

  -- Migration bookkeeping only. Old bucket the record came from
  -- ('staff' | 'crew' | 'talent') so row-count verification can
  -- compare per bucket exactly. Safe to drop after cutover.
  legacy_bucket       TEXT,

  client_uid          TEXT,                     -- offline-create idempotency (see organizations)

  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync pull: "this user's rows changed since cursor", including
-- archived rows (tombstones), so no archived_at filter here.
CREATE INDEX IF NOT EXISTS contacts_owner_sync_idx
  ON contacts (owner_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_client_uid_uniq
  ON contacts (owner_id, client_uid) WHERE client_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_org_idx
  ON contacts (organization_id);
CREATE INDEX IF NOT EXISTS contacts_sort_idx
  ON contacts (owner_id, lower(COALESCE(sort_last_name, name)));
CREATE INDEX IF NOT EXISTS contacts_city_state_idx
  ON contacts (owner_id, lower(state), lower(city));

-- Added after the first dev runs (John, 2026-10-03). Keeps re-runs working
-- on databases whose contacts table predates the column.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT CHECK (country ~ '^[A-Z]{2}$');

-- Addresses (contacts, organizations, locations), John 2026-10-03:
--   country: ISO 3166-1 alpha-2 code, NULL = unknown (treated as the user's
--     default country). New records start with users.default_country.
--   state: for US and CA, the 2-letter postal code (WA, BC); for every
--     other country free text as typed. public/regions.js normalizes.
--   Docs print the country only when it differs from the user's default.

DROP TRIGGER IF EXISTS contacts_touch ON contacts;
CREATE TRIGGER contacts_touch BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION slater_touch_updated_at();


-- ------------------------------------------------------------
-- CONTACT_ROLES
-- Multi-role pills on the Contact profile (answer #2 follow-up).
-- Profile-level only: project assignments stay one role per entry.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_roles (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- DEFERRED check, not RESTRICT: both block deleting an in-use role,
  -- but RESTRICT (and plain NO ACTION) check before the cascade from
  -- a deleted user has removed that user's contacts, so deleting a
  -- whole user would fail. Deferred checks at COMMIT, after the cascade.
  -- Found by scripts/test-v2-api.js.
  role_id     INTEGER NOT NULL REFERENCES roles(id)
                ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  sort_order  INTEGER NOT NULL DEFAULT 0,       -- pill order; first pill = primary display
  PRIMARY KEY (contact_id, role_id)
);

CREATE INDEX IF NOT EXISTS contact_roles_role_idx ON contact_roles (role_id);

-- Sync: role pills sync as part of the contact record, not as
-- their own rows. Any insert/delete here bumps the parent
-- contact's updated_at so the change rides along on the next pull.
-- (v1 had is_primary; replaced by sort_order, one concept fewer.)
-- Ownership (a contact may only use global roles or its owner's
-- custom roles) is checked in the API, not by constraint.
CREATE OR REPLACE FUNCTION slater_touch_contact_from_roles()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts SET updated_at = clock_timestamp()
   WHERE id = COALESCE(NEW.contact_id, OLD.contact_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_roles_touch ON contact_roles;
CREATE TRIGGER contact_roles_touch
  AFTER INSERT OR UPDATE OR DELETE ON contact_roles
  FOR EACH ROW EXECUTE FUNCTION slater_touch_contact_from_roles();


-- ------------------------------------------------------------
-- LOCATIONS
-- Was the contacts.locations bucket. Fields match what that
-- bucket and the schedule day card actually use today.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  zip          TEXT,
  country      TEXT CHECK (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2
  hospital     TEXT,                            -- same key as today (loc.hospital); auto-populated
  notes        TEXT,
  client_uid   TEXT,                            -- offline-create idempotency (see organizations)
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS locations_owner_sync_idx
  ON locations (owner_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS locations_client_uid_uniq
  ON locations (owner_id, client_uid) WHERE client_uid IS NOT NULL;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS country TEXT CHECK (country ~ '^[A-Z]{2}$');

DROP TRIGGER IF EXISTS locations_touch ON locations;
CREATE TRIGGER locations_touch BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION slater_touch_updated_at();

-- parking_notes dropped (not tracked today).
-- Schedule day cards reference locations by loc_id inside
-- projects.data. Migration maps old loc ids to new locations.id.


-- ------------------------------------------------------------
-- DELETED_RECORDS (sync tombstones for permanent deletes)
-- Permanently deleting an archived contact / organization /
-- location / custom role removes the row and every personal detail
-- in it. Only this marker remains (which table, which id, when), so
-- devices that were offline learn the record is gone and drop their
-- copy instead of pushing it back (the old "deleted contacts come
-- back" bug). Sync pulls return markers newer than the cursor.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deleted_records (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL
                CHECK (table_name IN ('contacts', 'organizations', 'locations', 'roles')),
  record_id   INTEGER NOT NULL,
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS deleted_records_owner_sync_idx
  ON deleted_records (owner_id, deleted_at);


-- ------------------------------------------------------------
-- USERS: additions
-- ------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_organization_id INTEGER
    REFERENCES organizations(id) ON DELETE SET NULL;

-- Default country for new addresses and for deciding when docs print a
-- country. Everyone starts as US; editable in My Info.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_country TEXT NOT NULL DEFAULT 'US'
    CHECK (default_country ~ '^[A-Z]{2}$');

-- Replaces agencies.is_default. One default per user, enforced by
-- structure. The picker should only offer is_agency orgs here.
-- users.contacts (JSONB) is NOT dropped: rollback for at least a
-- week after cutover.


-- ------------------------------------------------------------
-- PROJECTS: additions
-- ------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS agency_org_id INTEGER
    REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_org_id INTEGER
    REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_agency_org_idx ON projects (agency_org_id);
CREATE INDEX IF NOT EXISTS projects_client_org_idx ON projects (client_org_id);

-- Renamed from v1's organization_id / client_organization_id so
-- neither name is ambiguous.
--
-- Migration sources (corrected from v1, verified in app.js):
--   agency_org_id <- projects.data->>'agency_id' (the LIVE link),
--                    mapped via organizations.legacy_agency_id.
--                    NOT projects.agency_id: that column exists but
--                    nothing reads or writes it.
--   client_org_id <- projects.data->>'client_company', falling back
--                    to data->>'client' on older projects. Match per
--                    user by trim+lowercase against orgs; unmatched
--                    values create ONE org per distinct value, plus
--                    a report for John. No fuzzy auto-merge.
--
-- Kept for rollback, not dropped: projects.agency_id,
-- data.agency_id, data.client_company, data.client.


-- ------------------------------------------------------------
-- PROJECT PERSON ENTRIES (no DDL: stays in projects.data JSONB)
--
-- crew, talent and kp_cards stay inside projects.data. Each entry
-- gains contact_id and role_id alongside the existing snapshot
-- fields. Booking status stays on the entry.
--
--   {
--     contact_id: 42,          -- NEW. NULL if not linked to a contact.
--     role_id:    17,          -- NEW. NULL if free-text one-off (answer #4).
--     position:   "Gaffer",    -- existing free text: crew `position`,
--                              -- talent `title`, kp `role`. Kept as
--                              -- snapshot / one-off fallback.
--     name, phone, email,      -- snapshot at time of booking
--     status: ...              -- unchanged
--   }
--
-- Snapshots stay: a March call sheet shows March's phone number.
-- One role per project entry; multi-role is profile-level only.
--
-- Deferred: a GIN index for "every project with contact 42":
--   CREATE INDEX projects_data_gin ON projects USING GIN (data jsonb_path_ops);
--   query: data @> '{"crew":[{"contact_id":42}]}'
-- Add only when a feature needs it. Revisit a real project_people
-- table for the V2 Team tier.
-- ------------------------------------------------------------

