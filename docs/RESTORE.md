# Restoring a Slater backup

> **Restoring to production replaces ALL current data.** Every user, project, agency, receipt, license and login session is replaced with the contents of the backup. Anything created or changed after that backup was taken is gone. Take a fresh backup of production first (step 4a) so the restore itself can be undone.

This procedure is deliberately manual. There is no restore button in the admin dashboard.

Every command below was rehearsed against a copy of real production data on 2026-09-27, including a deliberately truncated backup to confirm a failed restore leaves the database untouched. The proxy steps and the backup command in section 4 were updated and used for real on 2026-10-25 (Postgres password rotation).

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
$PG/psql -d scratch -c "select (select count(*) from users) users, (select count(*) from projects) projects, (select count(*) from organizations) organizations, (select count(*) from contacts) contacts, (select count(*) from receipts) receipts, (select count(*) from licenses) licenses;"
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

### 4a. Turn on the public database proxy

The commands below connect from your Mac, so they need Postgres's public TCP proxy. It is normally off (removed after the October 2026 Railway incident). Check, and turn it on if it's missing:

```
railway tcp-proxy list --service Postgres --environment production
railway tcp-proxy create --port 5432 --service Postgres --environment production
```

`create` prints a **Domain** (like `interchange.proxy.rlwy.net`) and a **Proxy port** (like `11227`). Write both down. They are different every time the proxy is created. In the commands below, replace `PROXY_DOMAIN` and `PROXY_PORT` with them.

Don't use `$DATABASE_PUBLIC_URL`. Railway does not bring that variable back when the proxy is re-created, so it is empty and the command falls back to the internal address (`could not translate host name "postgres.railway.internal"`). Setting `PGHOST` and `PGPORT` to the proxy works instead, because `railway run` already supplies the user, password and database name.

Wait about 30 seconds after `create` before connecting, while the proxy finishes setting up.

### 4b. Take a fresh backup of production first

```
railway run --service Postgres --environment production -- sh -c 'PGHOST=PROXY_DOMAIN PGPORT=PROXY_PORT /opt/homebrew/opt/postgresql@18/bin/pg_dump --no-owner --no-privileges -f pre-restore-$(date -u +%Y%m%d-%H%M%S).sql'
```

Keep that file until you're sure the restore is what you wanted. It's your undo.

### 4c. The running app, and the restore itself

**The app can stay running.** The restore runs as a single transaction. The app's requests pause for the few seconds it takes, then see the restored data. If anything fails partway through (a truncated file, a typo, a dropped connection), the whole thing rolls back and production is left exactly as it was.

The thing to plan around is people, not the software: anything users do between your fresh backup (4b) and the restore is lost, and everyone is logged out because login sessions are restored too. Do it at a quiet time.

```
railway run --service Postgres --environment production -- sh -c 'PGHOST=PROXY_DOMAIN PGPORT=PROXY_PORT /opt/homebrew/opt/postgresql@18/bin/psql -1 -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" -f slater-2026-09-27-021459.sql'
```

`-1` makes it one transaction and `ON_ERROR_STOP` makes any error abort it. Don't remove either.

### 4d. Check it worked

- Run the row-count query from step 3 against production and compare it with the scratch database:
  ```
  railway run --service Postgres --environment production -- sh -c 'PGHOST=PROXY_DOMAIN PGPORT=PROXY_PORT /opt/homebrew/opt/postgresql@18/bin/psql -c "select (select count(*) from users) users, (select count(*) from projects) projects, (select count(*) from organizations) organizations, (select count(*) from contacts) contacts, (select count(*) from receipts) receipts, (select count(*) from licenses) licenses;"'
  ```
- Log in to Slater and open a couple of projects.
- Open the admin dashboard and confirm the user and license counts.

### 4e. Turn the proxy off again

```
railway tcp-proxy list --service Postgres --environment production
railway tcp-proxy delete <id> --service Postgres --environment production --yes
```

Run `list` again afterward. It should say `No TCP proxies found`.

`PROD_DATABASE_URL` in your local `.env` (used by `scripts/sync-prod-db.sh`) contains the proxy address, so it only works while the proxy is on. Next time you turn the proxy on to use that script, replace the host and port in that line with the new Domain and Proxy port.

## What's in a backup

- A plain SQL `pg_dump` of the whole production database, made with `--no-owner --no-privileges`, then gzipped.
- It includes the `sessions` table, so restoring also restores login sessions.
- Made daily at 09:00 UTC by the `slater-backup` Railway service and kept for 90 days in the `slater-backups` R2 bucket. See `backup/README.md` for how the job itself works.
