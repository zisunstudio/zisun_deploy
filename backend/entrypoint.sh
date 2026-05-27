#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_SERVER:-db}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-zisun_db}"; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Waiting for Redis..."
until redis-cli -u "${REDIS_URL:-redis://redis:6379}" ping | grep -q PONG; do
  sleep 1
done
echo "Redis is ready."

echo "Running Alembic migrations..."
alembic upgrade head
echo "Migrations complete."

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
