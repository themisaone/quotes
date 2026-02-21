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

async function runMigrations() {
  console.log("🔄 Starting migration runner...\n");

  // Get all migration files and sort them
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".js") && file !== "run-migrations.js")
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  console.log(`Found ${files.length} migration(s):\n`);
  files.forEach((file) => console.log(`  - ${file}`));
  console.log("");

  // Run each migration
  for (const file of files) {
    console.log(`\n📋 Running: ${file}`);
    console.log("─".repeat(50));

    try {
      const migration = require(path.join(migrationsDir, file));

      if (typeof migration.migrate === "function") {
        await migration.migrate();
      } else {
        // If migration doesn't export a function, just require it (it will run)
        console.log(`✅ ${file} executed`);
      }
    } catch (error) {
      console.error(`\n❌ Migration failed: ${file}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("✅ All migrations completed successfully!");
  console.log("═".repeat(50) + "\n");
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

module.exports = { runMigrations };
