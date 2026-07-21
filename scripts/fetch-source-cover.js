#!/usr/bin/env node
/**
 * Fetch a book cover from Open Library and store it on a source row.
 *
 * Usage:
 *   node scripts/fetch-source-cover.js --id 356
 *   node scripts/fetch-source-cover.js --title "1Q84" --author "Haruki Murakami"
 *   node scripts/fetch-source-cover.js --id 356 --dry-run
 */

const path = require("path");
const { readLocalConfig } = require("../src/localConfig");
const { fetchBookCoverDataUrl } = require("../src/bookCoverFetch");
const { processEntityImageForStorage } = require("../src/entityImageStorage");
const fileStorage = require("../src/fileStorage");

function initVaultAttachmentsDir() {
  const { vaultPath } = readLocalConfig();
  if (vaultPath && String(vaultPath).trim()) {
    fileStorage.setAttachmentsDir(String(vaultPath).trim());
  }
}
const { resolveSqlitePath } = require("../src/db/sqlite");

function describeDbTarget() {
  const backend = String(process.env.DB_BACKEND || "postgres").trim().toLowerCase();
  if (backend === "sqlite") {
    try {
      return `sqlite (${resolveSqlitePath()})`;
    } catch {
      return "sqlite";
    }
  }
  if (backend === "postgres" || backend === "pg") {
    const host = process.env.DB_HOST || "localhost";
    const port = process.env.DB_PORT || "5432";
    const name = process.env.DB_NAME || "(unset)";
    return `postgres (${host}:${port}/${name})`;
  }
  return backend;
}

function parseArgs(argv) {
  const args = {
    id: null,
    title: null,
    author: null,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--id") args.id = argv[++i];
    else if (token === "--title") args.title = argv[++i];
    else if (token === "--author") args.author = argv[++i];
    else if (token === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

async function lookupPrimaryAuthor(pool, sourceId) {
  const result = await pool.query(
    `
      SELECT a.name
      FROM notes q
      JOIN authors a ON q.author_id = a.id
      WHERE q.source_id = $1
      GROUP BY a.id, a.name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `,
    [sourceId]
  );
  return result.rows[0]?.name || null;
}

async function main() {
  const args = parseArgs(process.argv);
  initVaultAttachmentsDir();
  const pool = require(path.join(__dirname, "..", "src", "db"));

  console.log(`Database: ${describeDbTarget()}`);

  let sourceId = args.id;
  let title = args.title;
  let author = args.author;

  if (sourceId) {
    const sourceResult = await pool.query(
      "SELECT id, name, type FROM sources WHERE id = $1",
      [sourceId]
    );
    if (sourceResult.rows.length === 0) {
      throw new Error(`Source id ${sourceId} not found`);
    }
    const source = sourceResult.rows[0];
    title = title || source.name;
    if (!author) {
      author = await lookupPrimaryAuthor(pool, source.id);
    }
  }

  if (!title) {
    throw new Error("Provide --title or --id");
  }
  if (!author) {
    throw new Error("Author is required (--author or linked notes on the source)");
  }

  console.log(`Looking up cover for "${title}" by ${author}...`);
  const coverResult = await fetchBookCoverDataUrl({ title, author });
  if (!coverResult) {
    throw new Error(`No cover found for "${title}" by ${author}`);
  }

  console.log(`Matched: ${coverResult.match.title}`);
  console.log(`Authors: ${(coverResult.match.authors || []).join(", ") || "(unknown)"}`);
  console.log(`Cover URL: ${coverResult.match.coverUrl}`);
  console.log(`Data URL length: ${coverResult.dataUrl.length} chars`);

  if (args.dryRun) {
    console.log("Dry run — database not updated.");
    return;
  }

  if (!sourceId) {
    const lookup = await pool.query(
      "SELECT id FROM sources WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [title]
    );
    if (lookup.rows.length === 0) {
      throw new Error(`Source "${title}" not found in database (use --id to create manually first)`);
    }
    sourceId = lookup.rows[0].id;
  }

  await pool.query("UPDATE sources SET image = $1 WHERE id = $2", [
    processEntityImageForStorage(coverResult.dataUrl, "sources", sourceId),
    sourceId,
  ]);

  console.log(`Updated source id ${sourceId} with cover image.`);
  if (typeof pool.end === "function") {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
