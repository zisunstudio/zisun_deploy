#!/bin/bash
set -e

echo "==> Waiting for PostgreSQL at ${POSTGRES_SERVER:-db}:${POSTGRES_PORT:-5432}..."
until pg_isready -h "${POSTGRES_SERVER:-db}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-zisun_db}"; do
  echo "   PostgreSQL not ready — retrying in 2s..."
  sleep 2
done
echo "==> PostgreSQL is ready."

echo "==> Waiting for Redis..."
REDIS_HOST=$(echo "${REDIS_URL:-redis://redis:6379/0}" | sed 's|redis://||' | sed 's|:.*||' | sed 's|.*@||')
REDIS_PORT=$(echo "${REDIS_URL:-redis://redis:6379/0}" | sed 's|.*:||' | sed 's|/.*||')
until redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG; do
  echo "   Redis not ready — retrying in 2s..."
  sleep 2
done
echo "==> Redis is ready."

echo "==> Running Alembic migrations..."
alembic upgrade head
echo "==> Migrations complete."

echo "==> Starting ZISUN backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"
