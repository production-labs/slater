# Data Model Rewrite: Session Status

Last updated: 2026-10-03

## Where we are

- Branch: `data-model-rewrite` (created from `main`). Confirm you are on it before any change. As of 2026-09-30, branch is 1 commit behind `main` (missing `6565fa5`, the autosave-overwrite fix) -- fast-forward/rebase before starting Session 1, no conflicts expected.
- Phase: **all 12 questions answered (2026-09-30). Ready to start Session 1.** No code written, nothing committed.
- Draft schema: `Temp-New-Schema/slater_schema_draft.sql` -- updated to v2 on 2026-10-03 with all 12 answers. Awaiting John's review (see "Draft v2 changes" below).

## Hard rules (from John)

- All work on this branch. `main` stays deployable (Railway auto-deploys main, live users).
- Do NOT add new-schema migrations to `server.js` startup until John says to merge.
- Migration must be additive: `users.contacts`, `projects.agency_id`, `data.client_company` stay as rollback. Nothing dropped until John confirms, at least a week after ship.
- Rehearse against a restored production dump, not dev data. Procedure: `docs/RESTORE.md` (Postgres 18 client at `/opt/homebrew/opt/postgresql@18/bin`; system psql 16 fails).
- Write the per-user row-count verification (old blob buckets vs new table rows) BEFORE the migration itself.

## Decisions already made (do not relitigate)

- Agencies + companies merge into `organizations`; agency vs client decided per project.
- Contacts lose buckets; category comes from roles.
- `roles` table: global (owner_id NULL) + per-user custom; name, optional abbreviation, category. In-use roles cannot be deleted; rename propagates (reference by id).
- Contacts soft delete via `archived_at`.
- Project crew/talent/KP entries gain `contact_id`; snapshot fields stay. Booking status stays on the project entry.
- `is_default` moves to `users.default_organization_id`.
- Logos stay base64 in Postgres. No object storage. No geocoding for contacts (city/state filter only).
- Contacts support multiple roles via `contact_roles` join table (pill-style multi-select on the Contact profile). Project-level crew/talent/KP assignments stay single-role per entry.
- `organizations.type` dropped; replaced by a single `is_agency` boolean (no `is_client` field -- every org is a client candidate by default, unfiltered).
- Offline sync is per-record (not full-blob), using `updated_at` + a per-device last-synced-at cursor, with `archived_at` tombstones for deletes. Conflict resolution is a three-way merge against a cached client-side baseline, not simple last-write-wins (chosen to carry forward cleanly into V2.0 Team tier's shared-project editing).

## Key findings from codebase review

- CLAUDE.md is stale: frontend logic is in `public/app.js` (426KB) + `styles.css`; `index.html` is a 48KB shell (split in commit ab4c408).
- `projects.agency_id` is a real column (from `migrate-agencies.js`) but dead: no code reads/writes it. Live link is `data.agency_id` in the projects JSONB. Likely `REFERENCES agencies(id)` with no ON DELETE, verify on dump.
- There is no `projects.company` column. Client is `data.client_company` (older projects: `data.client`), free text matched by trim+lowercase against contacts.companies.
- No role concept exists today: crew `position`, talent `title`, kp `role` are free text. Autocomplete only on name fields (`acAttach`, app.js ~3240-3330).
- Client calls `/api/users/me/contacts`; server.js mounts `routes/contacts.js` there first (full blob replace). The per-bucket version in `routes/users.js` is dead code.
- Bug 1 confirmed: full blob PUT, last device wins.
- Bug 2 confirmed: openContacts() (app.js ~3343) and startup (~8305) only take non-empty server buckets; startup also re-uploads the merged local copy, pushing resurrections to the server.
- Bug 3 refined: Contacts modal is index-keyed; name-keying is in `mergeContactsFromSheet` (~3202) and backup import (~5172). The backfill runs on EVERY page load over all cached projects, so renamed/deleted contacts come back, and it fires one full-blob PUT per project per load. kp_cards never feed contacts (backfill reads legacy ep_/prod_ fields only).
- Agency `contact_name/email/phone` are used on call sheet and expense doc (app.js ~6511, ~7452); draft `organizations` has no place for them.
- Logos (company + agency) already go through crop tool: 240x240 PNG. Receipts use JPEG 0.82 (would kill logo transparency).
- Existing geocoding (Nominatim, sunrisesunset.io, Overpass) for hospital/sunrise stays.
- No test suite. All verification is manual.

## Draft schema changes recommended

- `locations.nearest_hospital` -> `hospital`; drop `parking_notes`.
- Roles uniqueness: two partial unique indexes instead of `COALESCE(owner_id, 0)`.
- Contacts city index should include state.
- `organizations.type` dropped, replaced with `is_agency` boolean (decided, see John's answers #6).
- Contacts: single `name` field + optional sort-last-name, no first/last split (decided, see John's answers #1).
- Agency billing contact: plain name/email/phone fields on `organizations`, not a linked contact (decided, see John's answers #5).
- New columns needed on `contacts`: union status, gear/kit, travel availability, notes (full UI, not deferred -- John's answers #7). Explicitly no day rate / W-9 columns.
- New `contact_roles` join table for multi-role pills on the Contact profile (John's answers #2 follow-up).
- Logo crop tool bumped to store 512x512 (from 240x240), same square crop + PNG format (John's answers #12).
- Sync support: `updated_at` already covers most of it; confirm each syncable table (contacts at minimum) has it, plus client-side baseline-caching logic for the three-way merge (John's answers #8, #9) -- this is app.js/client work, not schema, but worth flagging in Session 1 since it affects what the backend needs to return on fetch (needs to include `updated_at` in payloads).

## Open question answers (Claude's position)

1. Project people: stay in JSONB with `contact_id` + `role_id` added; GIN `jsonb_path_ops` on `data` if needed (`data @> '{"crew":[{"contact_id":42}]}'`). Revisit a real table for V2 Team tier.
2. Unmatched client companies: group per user by trim+lowercase, match existing orgs, else create ONE org per distinct value, output a report for John. No fuzzy auto-merge.

## John's answers

1. Names: full name field, with optional sort-last-name.
2. Unmatched free-text roles: go with recommended approach, auto-create per-user custom roles + report. Contacts with no matched role: category = "Uncategorized".
   - New decision (not in original 12, raised during this answer): contacts can have multiple roles via `contact_roles` (pill-style multi-select on the Contact profile, e.g. a person tagged both "Gaffer" and "Drone Operator"). Project-level crew/talent/KP assignments stay single-role per entry (one role_id per project assignment) -- multi-role is profile-level only, not per-project.
3. Global role list: Claude drafts a starter list covering standard video/film/event production roles; users can add their own on top. Confirmed: roles have both a full name and an optional abbreviation (e.g. "Director of Photography" / "DP") -- matches draft schema already.
4. Crew/talent/KP role input: flexible picker (recommended) -- choose from existing roles, or type a one-off free-text value.
5. Agency billing contact: plain fields on the org (name/email/phone), not linked to a Contact record. Matches current agency behavior; avoids forcing a non-production-role person into the role-derived category system.
6. `organizations.type`: dropped as a single enum. Replaced with a single boolean flag, `is_agency`. Revised during this answer: no `is_client` field needed -- every org is a client candidate by default (client/company picker shows the full org list, unfiltered), only the agency picker is filtered (`WHERE is_agency = true`). Consequence: agencies can also appear in the client picker, which is correct per the earlier per-project agency-vs-client decision. No third category added -- locations/venues stay in the separate `locations` table.
7. New contact fields: explicitly OUT -- day rate, W-9 (financial/tax data, out of scope for a project management tool, avoids compliance/liability burden). IN, with full UI built now (not deferred): union status, gear/kit, travel availability, plus a general notes field.
8. Offline use: REQUIRED. Deal with it properly rather than dropping the cache. Approach: per-record sync (not full-blob) using `updated_at` on each contact row + "last synced at" cursor per device -- pull only server rows changed since last sync, push only local rows changed since last sync. Deletes are timestamped tombstones (`archived_at`, already decided), so a stale local copy of a deleted contact is removed on sync instead of resurrected (fixes bugs 1-3). Remaining open problem: same contact edited on two offline devices before either syncs -- see Q9.
9. Concurrent edit conflict: three-way merge, not simple last-write-wins. Client caches the downloaded "baseline" copy of each contact alongside its local edits. On sync, diff baseline vs local vs server per field: local-only change wins, server-only change wins, same-field-both-changed falls back to last-write-wins for that one field only. No new schema needed beyond existing `updated_at` -- logic lives client-side via the cached baseline. Chosen explicitly because it's the same mechanism that will carry forward into V2.0 Team tier (shared projects, multiple users editing shared contacts) without rework -- row-level last-write-wins would cause real data loss once edits come from different people, not just your own devices.
10. Production dump restore: approved. Use the most recent nightly backup (per the automated daily Postgres backup service) for the rehearsal restore, not a fixed/older file -- re-check which file is "most recent" at the time Session 6 (row-count verification + migration rehearsal) actually runs.
11. Cutover mechanics: short self-imposed maintenance window, not a live/forced-reload-only cutover. Rationale: John is currently the only real user (running real jobs through Slater), so a brief window costs nothing and avoids concurrency/in-flight-edit risk from engineering around users that don't exist yet. Procedure: (1) fresh on-demand backup right before cutover, not last night's nightly; (2) John closes all his own tabs/devices first; (3) run the manual cutover script (additive only, per existing rule); (4) run row-count verification, do not proceed until old-bucket counts match new-table row counts; (5) manual smoke test -- log back in, check contacts list, generate a call sheet + workback doc on a real active project to confirm roles/orgs render correctly; (6) only then flip old write endpoints to reject, forcing any stale reopened tab to reload instead of writing the old format; (7) keep old data at least a week post-cutover before dropping anything (already agreed).
12. Logos: bump stored resolution to 512x512 (up from 240x240), keep the existing square-crop tool and PNG format unchanged. Rationale: SVG/WebP ruled out since Word doc generation (docx.js) needs PNG/JPEG for embedded images, would require server-side conversion anyway. Square crop kept as-is (no evidence of real logos being mangled by it); resolution bump is near-free since logos are simple flat graphics, stays small even at 512px, still base64 in Postgres per existing decision.

## Plan (8 sessions -- needs re-estimate, see note)

1. Schema DDL + global role seed (standalone script, not server.js). Now also includes: `organizations.is_agency`, `contact_roles` join table, new `contacts` columns (union status, gear/kit, travel availability, notes), sync-support columns.
2. New backend CRUD for contacts/orgs/roles/locations alongside old endpoint. Now also includes: per-record sync endpoints (pull-since-cursor, push-changed-rows) instead of full-blob GET/PUT.
3. Contacts modal rewrite. Now also includes: multi-role pill UI, new fields UI (union/gear/travel/notes), 512px logo crop.
4. Project-tab organization picker + branding + default org. Agency picker filtered by `is_agency`; client picker unfiltered (full org list).
5. Crew/Talent/KP role_id + contact_id wiring (flexible picker, free-text fallback), doc output diff against baseline.
6. Row-count verification, then migration script; rehearse on restored prod dump (most recent nightly backup).
7. Client-side offline sync + three-way merge logic (baseline caching, per-field diff on reconnect). **New session, not in original 8** -- this was the biggest scope addition from the Q&A (John's answers #8, #9).
8. Cutover: remove localStorage merge + name-keyed backfill; old write endpoint rejects saves; maintenance-window procedure per John's answers #11 (fresh backup, close own tabs, run script, verify row counts, smoke test, then reject old writes); full manual regression.
9. Buffer + production runbook.

Estimate: original was 12-16 working days; add ~3-5 days for the offline sync/three-way-merge session (#7 above) and the auto-create-role-plus-report logic from John's answers #2. Revised estimate: roughly 16-21 working days (about 4-5 calendar weeks). Re-estimate properly at the start of Session 1 once the draft schema is updated.

## Next step

1. ~~Fast-forward/rebase onto `main`~~ -- DONE (branch level with main as of 2026-10-03).
2. ~~Update `slater_schema_draft.sql` to reflect all 12 answers~~ -- DONE 2026-10-03 (draft v2). Ran clean twice (idempotent) against a scratch DB on PG 18; triggers and constraints smoke-tested. Pending John's review of the open points below.
3. ~~Draft the starter global role list~~ -- APPROVED 2026-10-03: `Temp-New-Schema/global_roles_draft.md` (74 roles: 16 staff, 48 crew, 10 talent). John's answers: alias list YES; EIC = Engineer in Charge (Staff); add `roles.department` (done in schema draft); Editor -> Crew/Post; list fine as long as users can add custom roles (already designed).
4. ~~Session 1 (schema DDL + role seed)~~ -- DONE 2026-10-03, applied to local `slater_dev` only (backup taken first: `/tmp/slater_dev_before_session1.dump`). Not committed to git yet.
   - `scripts/migrate-data-model.js`: runner. One transaction; fingerprints existing tables (row counts + md5 of users.contacts, projects.data, agencies, licenses) before/after and rolls back on ANY difference; checks existing tables only gained the expected columns; checks tables/triggers/role counts. `--dry-run` rolls back. Refuses non-local DB without `--allow-remote`. Idempotent (re-run: 0 inserted, 74 unchanged).
   - `scripts/data-model/schema.sql`: approved schema (moved from `Temp-New-Schema/slater_schema_draft.sql`, which is now superseded -- edit schema.sql from here on).
   - `scripts/data-model/global-roles.js`: 74 global roles, source of truth for the seed. Re-runs update changed roles; roles removed from the list are reported, never deleted.
   - Verified: dry run, real run, re-run, remote guard (exit 2), current app boots and responds on the migrated dev DB.
5. Next: Session 2 -- backend CRUD for contacts/orgs/roles/locations alongside the old endpoint, plus per-record sync endpoints (pull-since-cursor with ~10s overlap, push with baseline `updated_at` for conflict detection). Role delete must also scan `projects.data` for `role_id`.

## Draft v2 changes beyond the 12 answers (for John's review)

- `updated_at` trigger on every syncable table (uses `clock_timestamp()`), so sync never depends on code remembering to bump it. Archives bump it too (tombstones).
- `contact_roles` insert/delete bumps the parent contact's `updated_at`; role pills sync as part of the contact record. `is_primary` replaced by `sort_order` (first pill = primary).
- Sync pull must overlap its window by ~10s (slow-transaction commit gap); client dedupes by id. Session 2 concern, documented in the SQL.
- Migration bookkeeping columns: `organizations.legacy_agency_id`, `organizations.legacy_source`, `contacts.legacy_bucket`. Make the row-count verification exact; droppable after cutover.
- Project columns renamed `agency_org_id` / `client_org_id`. Migration sources corrected: `data.agency_id` (live link, not the dead `projects.agency_id`) and `data.client_company` / `data.client`.
- Kept `contacts.address` and `locations.notes` because the old blob has them (no data loss).
- Union / gear / travel are free-text fields, not enums or booleans.
- Users may create a custom role with the same name as a global one (picker warns, does not block).
- Role delete check must also scan `projects.data` for `role_id`, since JSONB is invisible to FKs (Session 2).

## Decided 2026-10-03

- Same person in two old buckets (e.g. both `crew` and `talent`, same name): migration keeps them as TWO separate contacts (one per old bucket entry, so row counts match 1:1 per `legacy_bucket`). The migration report lists likely duplicates (same trim+lowercase name across buckets) for John to merge manually later. No automatic name-based merge (that is what caused bug 3). Implies a contact-merge action in the Contacts UI eventually; not in current scope unless John asks.
- Role alias list: YES. Migration matches old free-text position/title/role against role name, abbreviation, AND a migration-only alias map (e.g. "Mng. Producer" -> Managing Producer, "Cam Op"/"Camera" -> Camera Operator, "Sound"/"Audio" -> Sound Mixer). Lives in the migration script, not the schema. Fill it in from the real free-text values found in the Session 6 prod-dump rehearsal; unmatched values still become per-user custom roles + report.
