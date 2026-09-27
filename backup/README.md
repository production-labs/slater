# Slater database backup job

Runs as its own Railway service (`slater-backup`), separate from the `slater`
app service. It dumps production Postgres, gzips it, uploads to the
`slater-backups` R2 bucket, prunes anything older than the retention window,
and emails on failure (plus a weekly "still alive" summary).

## Why a separate service

- Own Dockerfile, own build, own deploy lifecycle. A broken app deploy can't
  take backups down with it, and a bad backup-script change can't take the
  app down.
- The `slater` service's watch patterns exclude `backup/**`, and this
  service's watch patterns are scoped to `backup/**` only, so a push that
  touches one never redeploys the other.
- It runs on a **cron schedule** (Railway service Settings > Cron Schedule),
  not `always on`. Change the schedule there, not in code.

## Environment variables

Set on the `slater-backup` service in Railway:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Internal `.railway.internal` URL, already set |
| `RESEND_API_KEY` | `${{slater.RESEND_API_KEY}}` | Reused from the app service, already set |
| `RESEND_FROM_EMAIL` | `${{slater.RESEND_FROM_EMAIL}}` | Reused from the app service, already set |
| `NOTIFY_EMAIL` | `johnm@productionlabs.io` | Already set |
| `RETENTION_DAYS` | `90` | Already set |
| `BACKUP_PREFIX` | `slater` | Already set |
| `WEEKLY_SUMMARY_DAY` | unset (defaults to `0` = Sunday UTC) | Optional |
| `R2_ACCESS_KEY_ID` | *(John adds this in Railway)* | Not set by this repo/script |
| `R2_SECRET_ACCESS_KEY` | *(John adds this in Railway)* | Not set by this repo/script |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | *(John adds this)* |
| `R2_BUCKET` | `slater-backups` | *(John adds this)* |

The R2 credentials are never in this repo or in chat history. They're added
directly as Railway service variables.

## Manually triggering a run

Railway dashboard: slater-backup service > Deployments > Redeploy (or trigger
a deploy from the latest image). Or via CLI:

```
railway redeploy --service slater-backup --environment production --yes
```

## Restoring a backup locally (do this after any script change)

```
gunzip -k slater-2026-09-26-090000.sql.gz
createdb slater_restore_test
psql slater_restore_test < slater-2026-09-26-090000.sql
```

Then spot-check row counts / a few known rows against production and drop
the scratch database.
