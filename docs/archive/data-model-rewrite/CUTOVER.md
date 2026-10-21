# Cutover: moving contacts and agencies to the new data model

> **ARCHIVED (2026-10-21). Do not follow this runbook.** The cutover ran on 2026-10-17. The old tables/columns it relies on were dropped on 2026-10-21, and the scripts it calls (`migrate-contacts-data.js`, `verify-data-model-migration.js`) were retired (still in git history, before the commit that archived this file). Kept for the record only. Full history: `SESSION_STATUS.md` in this folder.

> **This changes production.** Every user's contacts, companies, locations and agencies are copied into new tables and their projects are linked to them. The old data is never changed or deleted, and every step before "Flip the switch" can be walked away from with nothing lost. Read the whole page before starting.

This is the procedure agreed in John's answers #11 (SESSION_STATUS.md): a short maintenance window, a fresh backup, the migration, the verification, a smoke test, and only then turning off the old way of saving contacts.

Written 2026-10-10 (Session 6). The switch (steps 1, 10, 11.5) was built in Session 8, 2026-10-17. Last full rehearsal (step 6 on the 2026-10-17 nightly backup, Session 9): all three checks passed.

## Before the day

These can be done any time before the window. None of them change production data.

### 1. Everything is merged and deployed

- Sessions 7, 8 and 9 are finished, tested, and merged from `data-model-rewrite` to `main`, and Railway has deployed `main`.
- The new behavior is behind a switch: the variable `CONTACTS_V2_CUTOVER` on the `slater` service in Railway. **Don't add it yet.** Not set (or `off`) = Slater behaves exactly as today, and `?contacts=v2` in the address bar does nothing. `on` = everyone gets the new Contacts screens, old contacts and agency saving is refused, and the old "contacts come back" merge code no longer runs. (`test` is for your Mac only: it keeps the per-browser `?contacts=v2` / `?contacts=v1` toggle. Never use it on Railway.) This is what lets the code be deployed before the window: merging doesn't switch anyone over by itself.
- After Railway deploys the merge, reload any Slater tab that was open from before it (or just close them all). Tabs from before the merge don't know about the switch.
- Production still runs fine with the switch off and the new tables not created yet (Sessions 2 to 5 were built to allow this). Open a project and generate a call sheet to be sure.

The merge itself (any day before the window; it changes nothing users see):

```
cd ~/Sites/slater
git checkout main && git pull
git merge --no-ff data-model-rewrite
git push                      # Railway deploys main in 2-3 minutes
```

Then in Railway > `slater` > Deployments > the new one > Logs, look for `Contacts cutover switch: off`. Log in, open a real project, generate its call sheet. Checked in advance (Session 9, 2026-10-17): every call sheet, workback and expense report for all 19 production projects is identical between the code that was live on `main` and this branch with the switch off.

### 2. Tools on your Mac

```
cd ~/Sites/slater
git checkout main && git pull
npm install
/opt/homebrew/opt/postgresql@18/bin/psql --version     # must print 18.x
railway status                                          # must show Project: striking-eagerness, Environment: production
npm i --prefix /tmp/cv2-e2e puppeteer-core              # for the document comparison
```

### 3. Production dry run (optional, recommended)

The day before, run both scripts against production with `--dry-run`. They do all the work inside a transaction, print the full report, then roll back. Nothing changes. This proves the connection works and shows today's real numbers.

If `railway run` complains about the database proxy, see step 4b of `docs/RESTORE.md`.

```
railway run --service Postgres --environment production -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate-data-model.js --allow-remote --dry-run'
```

This one only tests the schema. The data migration can't be dry-run on production until the schema exists, so its dry run happens in the window (step 7). While it runs (a few seconds) a save from an open Slater tab waits for it, then goes through.

It must end with `Verification passed. DRY RUN: rolled back, nothing was changed.` Done 2026-10-17 (Session 9): passed, 81 built-in roles, existing data unchanged (2 users, 19 projects, 5 agencies, 9 receipts, 10 licenses).

Every script prints its `Target:` first. **It must be the Railway proxy host (`...proxy.rlwy.net`), not `localhost`.** If it says localhost, stop: the variable didn't come through and you are looking at your own Mac.

## On the day

Allow about an hour. Write down the time each step finishes.

### 4. Close Slater everywhere

Close every Slater tab on every device (laptop, phone, iPad). Make sure nobody else with an account (Jen) has it open. From here until step 10, nothing should save to production.

### 5. Fresh backup

Not last night's nightly: one taken now (answers #11, step 1).

**Save it outside `~/Sites/slater`.** It's a full copy of everyone's data; inside the project folder, the usual `git add -A` would put it on GitHub.

Run it from `~/Sites/slater` (`railway` only knows the project there); the file goes to `~/Slater-backups`:

```
mkdir -p ~/Slater-backups
railway run --service Postgres --environment production -- sh -c '/opt/homebrew/opt/postgresql@18/bin/pg_dump "$DATABASE_PUBLIC_URL" --no-owner --no-privileges -f ~/Slater-backups/pre-cutover-$(date -u +%Y%m%d-%H%M%S).sql'
ls -l ~/Slater-backups/     # note the file name; it should be a few MB (2026-10-17: about 3.7 MB), not tiny
```

Keep this file for at least a month. It is the undo for everything below.

### 6. Rehearse on that exact backup (local, about 10 minutes)

The same scripts against a copy of the backup on your Mac, plus a before/after comparison of every document. Same scratch server as `docs/RESTORE.md` step 3.

```
PG=/opt/homebrew/opt/postgresql@18/bin
F=~/Slater-backups/pre-cutover-XXXXXXXX-XXXXXX.sql   # the file from step 5
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

The restore prints a few small `set_config` / `setval` tables. That's normal; an error would say `ERROR` and stop.

Go on only if:
- the migration ends with `Verification passed. Committed.`
- the verification ends with `VERIFICATION PASSED for every user.`
- the documents print `DOCS IDENTICAL`.

Read the migration report while you're here (save it: add `> ~/Slater-backups/migration-report.txt` to the `migrate-contacts-data.js` line, then open that file). It lists the merged duplicates, the aliases used, and the roles that were dropped (people keep their contact, just without that role). On the 2026-10-17 rehearsal those were Content, Stream Tech, V-Cam Op / V Cam Op, MNG PRD / Mng. Producer, Graphic Designer, Producer / TD and MP Prod (plus "Client Services" on one key personnel card). Those are the custom roles to re-add in step 12.

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

### 9. Open the test tab for step 11.5

Log in on your laptop and open a **test** project (not a real one) in one tab. Leave it open. It's on the old screens (the switch is still off); step 11.5 uses it to check that a tab left open across the switch can't save the old way. This is the only Slater tab open until step 11.

(The app restart that the new tables need happens by itself in step 10: changing a Railway variable redeploys. The server checks for the new tables and project columns once, at startup.)

### 10. Flip the switch

Railway > `slater` service > Variables: add `CONTACTS_V2_CUTOVER` with the value `on`. Railway redeploys on its own. Wait for the deploy to finish.

Then check the deploy log (Railway > `slater` > Deployments > the new one > Logs). It must say:

```
Contacts cutover switch: on (new tables found)
```

If it instead says `CONTACTS_V2_CUTOVER=on, BUT THE NEW TABLES ARE NOT IN THIS DATABASE`, the server has refused the switch and is running as `off` (safe: everyone still has the old screens). Step 7a didn't run against this database. Stop and work out why before going on.

### 11. Smoke test (answers #11, step 5)

Log in on your laptop.

Use a **new** tab (not the step 9 one, which is for item 5).

1. **Contacts:** the new screen opens with no `?contacts=v2` in the address bar. People, Organizations, Locations and Roles all have your data. On the 2026-10-17 data: 35 people, 10 organizations, 8 locations for John (the step 7b report has today's numbers).
2. **Smith Tower hospital:** Contacts > Locations > "Worktank HQ - Smith Tower" > **Look up**. The old saved hospital (Swedish Medical Center Ballard) was wrong and was deliberately not carried over. Expect Harborview. Each project's Smith Tower days pick it up the next time that project is opened and saved.
3. **A real active project:** open it. Crew, talent and key personnel cards show "Linked". The agency and client are filled in. Schedule days show their locations.
4. **Documents:** generate the call sheet, workback and expense report for that project. They should look exactly as before (step 6 already proved the text is identical).
5. **Old saving is refused:** a tab that was open before the switch still shows the old screens until it reloads, and the server refuses its saves. To check: go to the step 9 tab and type in its project title. Within about 10 seconds a red panel at the bottom says **"Slater has been updated. Reload this page to keep working."** Click **Reload**. The tab comes back on the new screens and the title you typed is saved (open the project in another tab to confirm). Old contacts and agency saves from such a tab are refused the same way. Automated version: `scripts/e2e-cutover.js`.
6. **Phone:** log in on your phone and open Contacts and the same project.

### 12. After the window

- Re-add your company-specific roles as custom roles: Contacts > Roles > + New. From the 2026-10-17 rehearsal: Content, Stream Tech, V-Cam Op, Managing Producer (Kiko Toledo's MNG PRD), Producer / TD (Michael Ganyo), MP Prod (Alex Altebef), and Graphic Designer (Michelle Poole) if you want it. Then give them back to the people listed in the migration report ("Contacts whose old role didn't match"). Jen's account has the same kind of list.
- If you turned on the database proxy for this (`docs/RESTORE.md` 4b), remove it.
- Note the date. **Nothing old is dropped for at least a week** (answers #11, step 7): `users.contacts`, the `agencies` table, `projects.agency_id`, `data.agency_id`, `data.client_company` and `data.client` all stay. Dropping them is its own later task, with its own backup first.
- The bookkeeping columns (`contacts.legacy_bucket`, `organizations.legacy_agency_id` / `legacy_source`) and the `mig:` values in `client_uid` stay until then too. The verification script needs them.

## If something goes wrong

**Before step 10 (switch still off):** nothing users see has changed. The app ignores the new tables while the switch is off, and the old data was never touched. Fix the problem on the branch and come back another day. A partly-run step 7 has either committed fully or rolled back fully; there is no in-between. To start completely clean anyway, restore the step 5 backup (`docs/RESTORE.md` step 4).

**After step 10:** set `CONTACTS_V2_CUTOVER=off` (or delete the variable). Slater goes back to the old contacts and agencies, which are exactly as they were at step 5. **Anything you changed in Contacts after the switch is not in the old data**, so write down what you changed. Then fix and redo the switch. Tabs left open from the "on" period get the same "Slater has been updated" panel; their project edits are saved after they reload. Project edits made while the switch was on stay (the projects are shared by both screens).

**Last resort:** restore the step 5 backup (`docs/RESTORE.md` step 4). Everything done in Slater after step 5 is lost, including project edits.
