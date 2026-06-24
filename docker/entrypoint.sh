#!/bin/sh
set -e

# pg_isready uses libpq; SCRAM auth may need a password like psql does.
export PGPASSWORD="${DB_PASSWORD}"

echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT:-5432}..."
until pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -q; do
  sleep 2
done
echo "✅ PostgreSQL is ready"

echo "🔄 Running migrations..."
node migrations/run-migrations.js

echo "🚀 Starting server..."
export SKIP_MIGRATE=1
exec node src/server.js
