#!/bin/sh
set -e

echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT:-5432}..."
until pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -q; do
  sleep 2
done
echo "✅ PostgreSQL is ready"

echo "🔄 Running migrations..."
node migrations/run-migrations.js

echo "🚀 Starting server..."
exec node src/server.js
