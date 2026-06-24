#!/usr/bin/env node
/**
 * Migration Runner
 * Runs all pending database migrations in order
 *
 * Usage:
 *   node migrations/run-migrations.js
 *   npm run migrate
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const migrationsDir = __dirname;

function listMigrationFiles({ migrationsPath = migrationsDir, fsImpl = fs } = {}) {
  return fsImpl
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".js") && file !== "run-migrations.js")
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function recordMigration(client, filename) {
  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
    [filename]
  );
}

function loadMigration(file, migrationsPath) {
  return require(path.join(migrationsPath, file));
}

async function runMigrationFile(file, { client, migrationsPath, logger = console }) {
  const migration = loadMigration(file, migrationsPath);

  if (typeof migration.migrate === "function") {
    await migration.migrate({ client, logger });
  } else {
    logger.log(`✅ ${file} executed`);
  }
}

async function runMigrations({
  pool,
  migrationsPath = migrationsDir,
  fsImpl = fs,
  logger = console,
  quietWhenNoPending = false,
} = {}) {
  if (!quietWhenNoPending) {
    logger.log("🔄 Starting migration runner...\n");
  }

  const files = listMigrationFiles({ migrationsPath, fsImpl });

  if (files.length === 0) {
    if (!quietWhenNoPending) logger.log("No migrations found.");
    return { files: [], pending: [], ran: [] };
  }

  const migrationPool = pool || require("../src/db");
  const client = await migrationPool.connect();
  let applied;
  try {
    await ensureMigrationsTable(client);
    applied = await getAppliedMigrations(client);
  } finally {
    client.release();
  }

  const pending = files.filter((file) => !applied.has(file));
  if (pending.length === 0) {
    logger.log("✅ No pending migrations\n");
    return { files, pending, ran: [] };
  }

  const skippedCount = files.length - pending.length;
  if (skippedCount > 0) {
    logger.log(`Skipping ${skippedCount} already-applied migration(s).`);
  }

  logger.log(`Found ${pending.length} pending migration(s):\n`);
  pending.forEach((file) => logger.log(`  - ${file}`));
  logger.log("");

  const ran = [];
  for (const file of pending) {
    logger.log(`\n📋 Running: ${file}`);
    logger.log("─".repeat(50));

    const migrationClient = await migrationPool.connect();
    try {
      await migrationClient.query("BEGIN");
      await runMigrationFile(file, { client: migrationClient, migrationsPath, logger });
      await recordMigration(migrationClient, file);
      await migrationClient.query("COMMIT");
      ran.push(file);
    } catch (error) {
      await migrationClient.query("ROLLBACK").catch(() => {});
      logger.error(`\n❌ Migration failed: ${file}`);
      logger.error(error.message);
      throw error;
    } finally {
      migrationClient.release();
    }
  }

  logger.log("\n" + "═".repeat(50));
  logger.log("✅ All pending migrations completed successfully!");
  logger.log("═".repeat(50) + "\n");

  return { files, pending, ran };
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration runner failed:", error);
      process.exit(1);
    });
}

module.exports = {
  ensureMigrationsTable,
  getAppliedMigrations,
  listMigrationFiles,
  recordMigration,
  runMigrationFile,
  runMigrations,
};
