# Cutover: moving contacts and agencies to the new data model

> **This changes production.** Every user's contacts, companies, locations and agencies are copied into new tables and their projects are linked to them. The old data is never changed or deleted, and every step before "Flip the switch" can be walked away from with nothing lost. Read the whole page before starting.

This is the procedure agreed in John's answers #11 (SESSION_STATUS.md): a short maintenance window, a fresh backup, the migration, the verification, a smoke test, and only then turning off the old way of saving contacts.

Written 2026-10-10 (Session 6). Steps marked **[Session 8]** depend on work that isn't built yet; Session 8 must deliver them as described or update this page.

## Before the day

These can be done any time before the window. None of them change production data.

### 1. Everything is merged and deployed

- Sessions 7 and 8 are finished, tested, and merged from `data-model-rewrite` to `main`, and Railway has deployed `main`.
- **[Session 8]** The new behavior is behind an on/off switch on the `slater` service in Railway (proposed name: `CONTACTS_V2_CUTOVER`), **off** by default. Off = Slater behaves exactly as today. On = everyone gets the new Contacts screen, the old contacts and agency saving is refused, and the old "contacts come back" merge code no longer runs. This is what lets the code be deployed before the window: merging must not switch anyone over by itself.
- Production still runs fine with the switch off and the new tables not created yet (Sessions 2 to 5 were built to allow this). Open a project and generate a call sheet to be sure.

### 2. Tools on your Mac

```
cd ~/Sites/slater
git checkout main && git pull
npm install
/opt/homebrew/opt/postgresql@18/bin/psql --version     # must print 18.x
railway status                                          # must show the Slater project
npm i --prefix /tmp/cv2-e2e puppeteer-core              # for the document comparison
```

### 3. Production dry run (optional, recommended)

The day before, run both scripts against production with `--dry-run`. They do all the work inside a transaction, print the full report, then roll back. Nothing changes. This proves the connection works and shows today's real numbers.

If `railway run` complains about the database proxy, see step 4b of `docs/RESTORE.md`.

```
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate-data-model.js --allow-remote --dry-run'
```

This one only tests the schema. The data migration can't be dry-run on production until the schema exists, so its dry run happens in the window (step 7).

Every script prints its `Target:` first. **It must be the Railway proxy host (`...proxy.rlwy.net`), not `localhost`.** If it says localhost, stop: the variable didn't come through and you are looking at your own Mac.

## On the day

Allow about an hour. Write down the time each step finishes.

### 4. Close Slater everywhere

Close every Slater tab on every device (laptop, phone, iPad). Make sure nobody else with an account (Jen) has it open. From here until step 10, nothing should save to production.

### 5. Fresh backup

Not last night's nightly: one taken now (answers #11, step 1).

```
railway run --service Postgres --environment production -- sh -c '/opt/homebrew/opt/postgresql@18/bin/pg_dump "$DATABASE_PUBLIC_URL" --no-owner --no-privileges -f pre-cutover-$(date -u +%Y%m%d-%H%M%S).sql'
```

Keep this file somewhere safe for at least a month. It is the undo for everything below.

### 6. Rehearse on that exact backup (local, about 10 minutes)

The same scripts against a copy of the backup on your Mac, plus a before/after comparison of every document. Same scratch server as `docs/RESTORE.md` step 3.

```
PG=/opt/homebrew/opt/postgresql@18/bin
F=pre-cutover-XXXXXXXX-XXXXXX.sql            # the file from step 5
$PG/initdb -D /tmp/slater-scratch -U postgres --auth=trust
$PG/pg_ctl -D /tmp/slater-scratch -o "-p 5433 -k /tmp" -l /tmp/slater-scratch.log start
$PG/createdb -h /tmp -p 5433 -U postgres scratch
$PG/psql -h /tmp -p 5433 -U postgres -d scratch -v ON_ERROR_STOP=1 -q -f $F
S=postgres://postgres@localhost:5433/scratch

DATABASE_URL=$S NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/doc-snapshot.js cutover-before v1
DATABASE_URL=$S node scripts/migrate-data-model.js
DATABASE_URL=$S node scripts/migrate-contacts-data.js
DATABASE_URL=$S node scripts/verify-data-model-migration.js
DATABASE_URL=$S NODE_PATH=/tmp/cv2-e2e/node_modules node scripts/doc-snapshot.js cutover-after v2
diff -r /tmp/slater-doc-snapshots/cutover-before /tmp/slater-doc-snapshots/cutover-after && echo DOCS IDENTICAL
```

Go on only if:
- the migration ends with `Verification passed. Committed.`
- the verification ends with `VERIFICATION PASSED for every user.`
- the documents print `DOCS IDENTICAL`.

Read the migration report while you're here. It lists the merged duplicates, the aliases used, and the roles that were dropped (people keep their contact, just without that role). On the 2026-10-10 rehearsal those were Content, Stream Tech, V-Cam Op, Mng. Producer and Graphic Designer. Those are the custom roles to re-add in step 11.

If anything fails, stop. Nothing has touched production. Keep the output and fix it on the branch first.

Tear down when done: `$PG/pg_ctl -D /tmp/slater-scratch stop && rm -rf /tmp/slater-scratch /tmp/slater-scratch.log`

### 7. Run it on production

Three commands, each one only if the one before succeeded. Check the `Target:` line each time.

**a. Schema** (new tables + built-in roles; existing data untouched, checked by the script):

```
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate-data-model.js --allow-remote'
```

Must end with `Verification passed. Committed.`

**b. Data, dry run first, then for real:**

```
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate-contacts-data.js --allow-remote --dry-run'
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate-contacts-data.js --allow-remote'
```

The dry run's numbers should match the rehearsal in step 6 exactly (same backup, same data). The real run must end with `Verification passed. Committed.` If it says `rolled back`, nothing was changed: stop and keep the output.

The script runs in one transaction and only commits if the old data is unchanged, project card text is unchanged, and the verification passes inside that same transaction. Running it twice is safe: users who already have migrated records are skipped.

### 8. Verify on production (answers #11, step 4)

```
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/verify-data-model-migration.js'
```

Read only. Must end with `VERIFICATION PASSED for every user.` Do not continue until it does.

### 9. Restart the app

Railway > `slater` service > restart (or redeploy the current deployment).

**Required.** The server checks once, at startup, whether the new project columns exist, and remembers the answer. A server that started before step 7a keeps acting as if they don't exist until it restarts.

### 10. Flip the switch [Session 8]

Railway > `slater` service > Variables: set `CONTACTS_V2_CUTOVER=on`. Railway redeploys on its own. Wait for the deploy to finish.

### 11. Smoke test (answers #11, step 5)

Log in on your laptop.

1. **Contacts:** the new screen opens with no `?contacts=v2` in the address bar. People, Organizations, Locations and Roles all have your data. On the 2026-10-10 data: 34 people, 7 organizations, 8 locations for John.
2. **Smith Tower hospital:** Contacts > Locations > "Worktank HQ - Smith Tower" > **Look up**. The old saved hospital (Swedish Medical Center Ballard) was wrong and was deliberately not carried over. Expect Harborview. Each project's Smith Tower days pick it up the next time that project is opened and saved.
3. **A real active project:** open it. Crew, talent and key personnel cards show "Linked". The agency and client are filled in. Schedule days show their locations.
4. **Documents:** generate the call sheet, workback and expense report for that project. They should look exactly as before (step 6 already proved the text is identical).
5. **Old saving is refused [Session 8]:** an old tab or device that reopens Slater must reload into the new screen, not save in the old format. Session 8 defines exactly how to check this.
6. **Phone:** log in on your phone and open Contacts and the same project.

### 12. After the window

- Re-add your company-specific roles as custom roles: Contacts > Roles > + New. From the rehearsal: Content, Stream Tech, V-Cam Op, Managing Producer (Kiko Toledo's MNG PRD), and Graphic Designer if you want it. Then give them back to the people listed in the migration report.
- If you turned on the database proxy for this (`docs/RESTORE.md` 4b), remove it.
- Note the date. **Nothing old is dropped for at least a week** (answers #11, step 7): `users.contacts`, the `agencies` table, `projects.agency_id`, `data.agency_id`, `data.client_company` and `data.client` all stay. Dropping them is its own later task, with its own backup first.
- The bookkeeping columns (`contacts.legacy_bucket`, `organizations.legacy_agency_id` / `legacy_source`) and the `mig:` values in `client_uid` stay until then too. The verification script needs them.

## If something goes wrong

**Before step 10 (switch still off):** nothing users see has changed. The app ignores the new tables while the switch is off, and the old data was never touched. Fix the problem on the branch and come back another day. A partly-run step 7 has either committed fully or rolled back fully; there is no in-between. To start completely clean anyway, restore the step 5 backup (`docs/RESTORE.md` step 4).

**After step 10:** set `CONTACTS_V2_CUTOVER=off`. Slater goes back to the old contacts and agencies, which are exactly as they were at step 5. **Anything you changed in Contacts after the switch is not in the old data**, so write down what you changed. Then fix and redo the switch.

**Last resort:** restore the step 5 backup (`docs/RESTORE.md` step 4). Everything done in Slater after step 5 is lost, including project edits.
