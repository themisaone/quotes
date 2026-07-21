#!/usr/bin/env node
/**
 * Move author/source images from DB base64 to vault files.
 *
 * Usage:
 *   node scripts/migrate-entity-images-to-vault.js --dry-run
 *   node scripts/migrate-entity-images-to-vault.js --apply
 */

const path = require("path");
const { readLocalConfig } = require("../src/localConfig");
const { processEntityImageForStorage } = require("../src/entityImageStorage");
const fileStorage = require("../src/fileStorage");

function initVaultAttachmentsDir() {
  const { vaultPath } = readLocalConfig();
  if (vaultPath && String(vaultPath).trim()) {
    fileStorage.setAttachmentsDir(String(vaultPath).trim());
  }
}

function parseArgs(argv) {
  return { apply: argv.includes("--apply"), dryRun: !argv.includes("--apply") };
}

async function migrateTable(pool, table, folder, dryRun, logger = console) {
  const { rows } = await pool.query(
    `SELECT id, name, image FROM ${table} WHERE image IS NOT NULL AND image <> '' ORDER BY id`
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (fileStorage.isFilePath(row.image)) {
      skipped += 1;
      continue;
    }
    if (!String(row.image).startsWith("data:")) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      logger.log(`[${table}] ${row.id} ${row.name} → would migrate`);
      migrated += 1;
      continue;
    }

    const stored = processEntityImageForStorage(row.image, folder, row.id);
    logger.log(`[${table}] ${row.id} ${row.name} → ${stored}`);
    await pool.query(`UPDATE ${table} SET image = $1 WHERE id = $2`, [stored, row.id]);
    migrated += 1;
  }

  return { migrated, skipped, total: rows.length };
}

async function main() {
  const args = parseArgs(process.argv);
  initVaultAttachmentsDir();
  const pool = require(path.join(__dirname, "..", "src", "db"));

  console.log(`Database backend: ${process.env.DB_BACKEND || "postgres"}`);
  console.log(`Vault attachments: ${fileStorage.getAttachmentsDir()}`);
  console.log(args.dryRun ? "Dry run — no DB updates." : "Applying migration...");

  const authors = await migrateTable(pool, "authors", "authors", args.dryRun);
  const sources = await migrateTable(pool, "sources", "sources", args.dryRun);

  console.log("\n--- Summary ---");
  console.log(
    `Authors: ${authors.migrated} migrated, ${authors.skipped} skipped, ${authors.total} with image`
  );
  console.log(
    `Sources: ${sources.migrated} migrated, ${sources.skipped} skipped, ${sources.total} with image`
  );

  if (typeof pool.end === "function") {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { migrateTable, parseArgs };
