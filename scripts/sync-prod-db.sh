#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

# Load PROD_DATABASE_URL from .env
PROD_DATABASE_URL=$(grep -E '^PROD_DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [ -z "$PROD_DATABASE_URL" ]; then
  echo "ERROR: PROD_DATABASE_URL not found in .env" >&2
  echo "Add your Railway external connection string as PROD_DATABASE_URL in .env" >&2
  exit 1
fi

LOCAL_DB="slater_dev"
DUMP_FILE="/tmp/slater_prod_backup_$(date +%Y%m%d_%H%M%S).dump"

PG_DUMP=$(command -v pg_dump)
for candidate in /opt/homebrew/opt/postgresql@18/bin/pg_dump /usr/local/opt/postgresql@18/bin/pg_dump; do
  [ -x "$candidate" ] && PG_DUMP="$candidate" && break
done
echo "Using pg_dump: $PG_DUMP"

echo "Dumping production database..."
"$PG_DUMP" "$PROD_DATABASE_URL" --no-owner --no-acl -F c -f "$DUMP_FILE"
echo "Dump saved to $DUMP_FILE"

echo "Terminating existing connections to $LOCAL_DB..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true

echo "Dropping local database: $LOCAL_DB"
dropdb --if-exists "$LOCAL_DB"

echo "Creating local database: $LOCAL_DB"
createdb "$LOCAL_DB"

PG_RESTORE=$(command -v pg_restore)
for candidate in /opt/homebrew/opt/postgresql@18/bin/pg_restore /usr/local/opt/postgresql@18/bin/pg_restore; do
  [ -x "$candidate" ] && PG_RESTORE="$candidate" && break
done
echo "Using pg_restore: $PG_RESTORE"

echo "Restoring dump to $LOCAL_DB..."
"$PG_RESTORE" --no-owner --no-acl -d "$LOCAL_DB" "$DUMP_FILE"

echo "Cleaning up dump file..."
rm "$DUMP_FILE"

echo "Done. Local database '$LOCAL_DB' now matches production."
