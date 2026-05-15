#!/usr/bin/env node
/**
 * Tag training notes by English month name (from `note_date`).
 *
 * Executes `tag-training-by-month.sql` (same folder) against the DB:
 * `notes`, `note_tags`, `tags`.
 *
 * **Safety:** Re-runnable — skips month tags already on a note. Uses a
 * transaction: with `--dry-run`, all changes are **rolled back** (nothing
 * persisted) after the script runs, so you see real NOTICE output from
 * PostgreSQL without committing.
 *
 * From repository root (needs `.env`):
 *   node scripts/safe-housekeeping/tag-training-by-month.js
 *   node scripts/safe-housekeeping/tag-training-by-month.js --dry-run
 *
 * Direct SQL (commits immediately — no dry-run):
 *   psql "$DATABASE_URL" -f scripts/safe-housekeeping/tag-training-by-month.sql
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'quotes_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function tagTrainingByMonth() {
  console.log(
    DRY_RUN
      ? '🔍 DRY RUN — changes will be rolled back at the end.\n'
      : '✏️  APPLY — changes will be committed.\n'
  );
  console.log('🏋️  Running month-tagging SQL…\n');

  const sqlPath = path.join(__dirname, 'tag-training-by-month.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n✅ Dry run finished — transaction rolled back (no writes kept).');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ Script completed successfully (committed).');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

tagTrainingByMonth().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
