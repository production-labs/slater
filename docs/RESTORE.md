# Restoring a Slater backup

> **Restoring to production replaces ALL current data.** Every user, project, agency, receipt, license and login session is replaced with the contents of the backup. Anything created or changed after that backup was taken is gone. Take a fresh backup of production first (step 4a) so the restore itself can be undone.

This procedure is deliberately manual. There is no restore button in the admin dashboard.

Every command below was rehearsed against a copy of real production data on 2026-09-27, including a deliberately truncated backup to confirm a failed restore leaves the database untouched.

## 1. Download a backup

Admin dashboard > Backups > **Download**. Each link is signed when you click it and works for 5 minutes. Files are named `slater-YYYY-MM-DD-HHMMSS.sql.gz` (UTC) and contain a plain SQL dump, gzipped.

```
gunzip -k slater-2026-09-27-021459.sql.gz
```

## 2. Use the Postgres 18 tools, not the default ones

Production runs Postgres 18. The `psql` on your PATH is version 16 and so is the local database server. Both will fail on these files (you'll see errors like `unrecognized configuration parameter "transaction_timeout"` or `invalid command \restrict`).

Always use the full path:

```
/opt/homebrew/opt/postgresql@18/bin/psql --version
```

It should print `psql (PostgreSQL) 18.x`.

## 3. Always restore to a scratch database first

This proves the file is good before production is involved. It runs a throwaway Postgres 18 server on port 5433 that doesn't touch your normal local database.

```
PG=/opt/homebrew/opt/postgresql@18/bin
export PGHOST=/tmp PGPORT=5433 PGUSER=postgres
$PG/initdb -D /tmp/slater-scratch -U postgres --auth=trust
$PG/pg_ctl -D /tmp/slater-scratch -o "-p 5433 -k /tmp" -l /tmp/slater-scratch.log start
$PG/createdb scratch
$PG/psql -d scratch -v ON_ERROR_STOP=1 -q -f slater-2026-09-27-021459.sql
```

It should finish with no `ERROR` lines. Then check the row counts look right:

```
$PG/psql -d scratch -c "select (select count(*) from users) users, (select count(*) from projects) projects, (select count(*) from agencies) agencies, (select count(*) from receipts) receipts, (select count(*) from licenses) licenses;"
```

When you're done:

```
$PG/pg_ctl -D /tmp/slater-scratch stop
rm -rf /tmp/slater-scratch /tmp/slater-scratch.log
unset PGHOST PGPORT PGUSER
```

If the scratch restore fails, stop. Do not try that file against production. Try the previous day's backup instead.

## 4. Restoring production

Run these from the `~/Sites/slater` folder. The commands use `railway run` so the database password is pulled from Railway and never copied or pasted.

### 4a. Take a fresh backup of production first

```
railway run --service Postgres --environment production -- sh -c '/opt/homebrew/opt/postgresql@18/bin/pg_dump "$DATABASE_PUBLIC_URL" --no-owner --no-privileges -f pre-restore-$(date -u +%Y%m%d-%H%M%S).sql'
```

Keep that file until you're sure the restore is what you wanted. It's your undo.

### 4b. The public database proxy

Steps 4a and 4c connect from your Mac, so they need Postgres's public TCP proxy (`DATABASE_PUBLIC_URL`). If it has been removed, turn it on temporarily:

```
railway tcp-proxy create --port 5432 --service Postgres
```

Remove it again when you're done (`railway tcp-proxy list --service Postgres`, then `railway tcp-proxy delete <id> --service Postgres --yes`).

### 4c. The running app, and the restore itself

**The app can stay running.** The restore runs as a single transaction. The app's requests pause for the few seconds it takes, then see the restored data. If anything fails partway through (a truncated file, a typo, a dropped connection), the whole thing rolls back and production is left exactly as it was.

The thing to plan around is people, not the software: anything users do between your fresh backup (4a) and the restore is lost, and everyone is logged out because login sessions are restored too. Do it at a quiet time.

```
railway run --service Postgres --environment production -- sh -c '/opt/homebrew/opt/postgresql@18/bin/psql "$DATABASE_PUBLIC_URL" -1 -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" -f slater-2026-09-27-021459.sql'
```

`-1` makes it one transaction and `ON_ERROR_STOP` makes any error abort it. Don't remove either.

### 4d. Check it worked

- Run the row-count query from step 3 against production (swap `-d scratch` for `"$DATABASE_PUBLIC_URL"` inside `railway run` as above) and compare it with the scratch database.
- Log in to Slater and open a couple of projects.
- Open the admin dashboard and confirm the user and license counts.
- If you turned on the TCP proxy in 4b, remove it.

## What's in a backup

- A plain SQL `pg_dump` of the whole production database, made with `--no-owner --no-privileges`, then gzipped.
- It includes the `sessions` table, so restoring also restores login sessions.
- Made daily at 09:00 UTC by the `slater-backup` Railway service and kept for 90 days in the `slater-backups` R2 bucket. See `backup/README.md` for how the job itself works.
