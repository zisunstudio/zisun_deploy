#!/bin/bash
set -e

# Dependency waits are BOUNDED. On managed hosts (Fly + Neon/Supabase + Upstash)
# pg_isready/redis-cli may never succeed even though the app can connect fine
# (TLS `rediss://`, connection poolers, private networking). An unbounded loop
# would hang the boot forever, so we retry a fixed number of times and then
# start anyway — /health reports per-dependency status either way.
WAIT_RETRIES="${WAIT_RETRIES:-30}"

if [ "${SKIP_DEPS_WAIT:-0}" != "1" ]; then
  echo "==> Waiting for PostgreSQL at ${POSTGRES_SERVER:-db}:${POSTGRES_PORT:-5432}..."
  i=0
  until pg_isready -h "${POSTGRES_SERVER:-db}" -p "${POSTGRES_PORT:-5432}" \
        -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-zisun_db}" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$WAIT_RETRIES" ]; then
      echo "   PostgreSQL still not reporting ready after ${WAIT_RETRIES} tries — continuing."
      break
    fi
    echo "   PostgreSQL not ready — retrying in 2s (${i}/${WAIT_RETRIES})..."
    sleep 2
  done

  # Only probe Redis for plain redis:// on a reachable host. TLS/managed Redis
  # is validated by the app itself, not redis-cli.
  case "${REDIS_URL:-redis://redis:6379/0}" in
    rediss://*)
      echo "==> Redis uses TLS (rediss://) — skipping redis-cli probe."
      ;;
    *)
      REDIS_HOST=$(echo "${REDIS_URL:-redis://redis:6379/0}" | sed 's|redis://||' | sed 's|/.*||' | sed 's|.*@||' | sed 's|:.*||')
      REDIS_PORT=$(echo "${REDIS_URL:-redis://redis:6379/0}" | sed 's|.*:||' | sed 's|/.*||')
      echo "==> Waiting for Redis at ${REDIS_HOST:-redis}:${REDIS_PORT:-6379}..."
      i=0
      until redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG; do
        i=$((i + 1))
        if [ "$i" -ge "$WAIT_RETRIES" ]; then
          echo "   Redis still not reporting ready after ${WAIT_RETRIES} tries — continuing."
          break
        fi
        echo "   Redis not ready — retrying in 2s (${i}/${WAIT_RETRIES})..."
        sleep 2
      done
      ;;
  esac
fi

# On Fly, migrations run once via `release_command` in fly.toml, BEFORE new
# machines boot. Running them here too would race across machines, so Fly sets
# SKIP_MIGRATIONS=1. Docker Compose leaves it unset and migrates here.
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "==> SKIP_MIGRATIONS=1 — migrations handled by release_command."
else
  echo "==> Running Alembic migrations..."
  alembic upgrade head
  echo "==> Migrations complete."
fi

# If a command was passed (Fly process groups: worker/beat, or `docker run ... celery`)
# run that instead of the API server. Without this, ENTRYPOINT would swallow the
# command and every process group would start a web server.
if [ "$#" -gt 0 ]; then
  echo "==> Starting: $*"
  exec "$@"
fi

echo "==> Starting ZISUN backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${UVICORN_WORKERS:-1}"
