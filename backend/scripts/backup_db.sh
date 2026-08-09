#!/bin/sh
# ZISUN — PostgreSQL backup loop.
# Runs a daily pg_dump, gzips it, keeps the last N locally, and (if R2/S3
# credentials are present) uploads to object storage. Designed to run as a
# long-lived container (see `db-backup` service in docker-compose.prod.yml).
#
# Required env:
#   POSTGRES_SERVER, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
# Optional env (enables offsite upload to Cloudflare R2 / any S3):
#   R2_ENDPOINT_URL, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BACKUP_BUCKET
# Tunables:
#   BACKUP_INTERVAL_SECONDS (default 86400), BACKUP_RETENTION (default 7)

set -eu

BACKUP_DIR=/backups
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION:-7}"
PORT="${POSTGRES_PORT:-5432}"

mkdir -p "$BACKUP_DIR"

# Install tooling once (alpine base). pg_dump ships with postgres image already.
if [ -n "${R2_ACCESS_KEY:-}" ] && ! command -v aws >/dev/null 2>&1; then
  echo "[backup] installing aws-cli for offsite upload..."
  apk add --no-cache aws-cli >/dev/null 2>&1 || echo "[backup] WARN: aws-cli install failed; local-only backups"
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  TS=$(date +%Y%m%d_%H%M%S)
  FILE="$BACKUP_DIR/zisun_${POSTGRES_DB}_${TS}.sql.gz"
  echo "[backup] $(date -u) starting dump -> $FILE"

  if pg_dump -h "$POSTGRES_SERVER" -p "$PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
       | gzip > "$FILE"; then
    echo "[backup] dump ok ($(du -h "$FILE" | cut -f1))"

    # Offsite upload (best-effort)
    if [ -n "${R2_ACCESS_KEY:-}" ] && [ -n "${R2_BACKUP_BUCKET:-}" ] && command -v aws >/dev/null 2>&1; then
      AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
      AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
      aws s3 cp "$FILE" "s3://${R2_BACKUP_BUCKET}/db/$(basename "$FILE")" \
        --endpoint-url "$R2_ENDPOINT_URL" \
        && echo "[backup] uploaded to R2" \
        || echo "[backup] WARN: R2 upload failed; local copy retained"
    fi
  else
    echo "[backup] ERROR: pg_dump failed"
    rm -f "$FILE"
  fi

  # Rotate: keep newest $RETENTION locally
  ls -1t "$BACKUP_DIR"/zisun_*.sql.gz 2>/dev/null | tail -n +"$((RETENTION + 1))" | while read -r old; do
    echo "[backup] pruning $old"
    rm -f "$old"
  done

  echo "[backup] sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
