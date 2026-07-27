#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readLocalConfig } = require("../src/localConfig");
const {
  buildIntegrityEntries,
  copyTree,
  directoryStats,
  resolvePath,
  resolveRuntimePaths,
  timestamp,
} = require("./full-backup-helpers");

const rootDir = path.resolve(__dirname, "..");

function usage() {
  console.log(`Create one complete Note Archive backup containing the database and attachments.

Usage:
  npm run backup -- [options]

Options:
  --output <file>       Output .tar.gz file (default: backups/note-archive-full-<time>.tar.gz)
  --backend <name>      postgres or sqlite (default: DB_BACKEND)
  --attachments <dir>   Override the active attachments directory
  --vault <dir>         Override the active vault directory
  --sqlite-path <file>  Override the active SQLite database path
  --dry-run             Show what would be backed up without creating an archive
  -h, --help            Show this help

PostgreSQL backups use pg_dump. SQLite backups use SQLite's online backup API,
so either backend can be backed up while the app is running.
`);
}

function parseArgs(argv) {
  const options = {
    output: "",
    backend: "",
    attachments: "",
    vault: "",
    sqlitePath: "",
    dryRun: false,
    help: false,
  };
  const valueFlags = new Map([
    ["--output", "output"],
    ["--backend", "backend"],
    ["--attachments", "attachments"],
    ["--vault", "vault"],
    ["--sqlite-path", "sqlitePath"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[valueFlags.get(arg)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function runCommand(command, args, { env = process.env, logger = console } = {}) {
  const result = spawnSync(command, args, { env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  if (result.stderr?.trim()) logger.warn(result.stderr.trim());
}

function postgresArgs(env, outputFile) {
  return [
    "--host", env.DB_HOST || "localhost",
    "--port", String(env.DB_PORT || 5432),
    "--username", env.DB_USER || "postgres",
    "--dbname", env.DB_NAME || "quotes_db",
    "--format=plain",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--file", outputFile,
  ];
}

async function snapshotSqlite(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`SQLite database not found: ${source}`);
  const { DatabaseSync, backup } = require("node:sqlite");
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, destination);
  } finally {
    db.close();
  }
}

function copyOptionalVaultFiles(vaultPath, stageDir) {
  const included = [];
  if (!vaultPath || !fs.existsSync(vaultPath)) return included;

  const settings = path.join(vaultPath, "config", "settings.json");
  if (fs.existsSync(settings) && fs.statSync(settings).isFile()) {
    const destination = path.join(stageDir, "vault", "config", "settings.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(settings, destination);
    included.push("vault/config/settings.json");
  }

  const palettes = path.join(vaultPath, "palettes");
  if (fs.existsSync(palettes) && fs.statSync(palettes).isDirectory()) {
    copyTree(palettes, path.join(stageDir, "vault", "palettes"));
    included.push("vault/palettes");
  }
  return included;
}

async function createFullBackup(options, {
  env = process.env,
  logger = console,
  localConfig = readLocalConfig(),
} = {}) {
  const runtime = resolveRuntimePaths({ options, localConfig, rootDir, env });
  const archivePath = options.output
    ? resolvePath(options.output, { cwd: rootDir, env })
    : path.join(rootDir, "backups", `note-archive-full-${timestamp()}.tar.gz`);

  if (path.extname(archivePath) !== ".gz" || !archivePath.endsWith(".tar.gz")) {
    throw new Error("Backup output must end in .tar.gz");
  }
  if (!fs.existsSync(runtime.attachmentsPath)) {
    throw new Error(`Attachments directory not found: ${runtime.attachmentsPath}`);
  }

  logger.log(`Database: ${runtime.backend}${runtime.sqlitePath ? ` (${runtime.sqlitePath})` : ""}`);
  logger.log(`Attachments: ${runtime.attachmentsPath}`);
  logger.log(`Archive: ${archivePath}`);
  if (options.dryRun) return { archivePath, runtime, dryRun: true };

  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  if (fs.existsSync(archivePath)) throw new Error(`Backup already exists: ${archivePath}`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "note-archive-backup-"));
  const stageDir = path.join(workDir, "note-archive-backup");
  const temporaryArchive = `${archivePath}.partial-${process.pid}`;
  fs.mkdirSync(path.join(stageDir, "database"), { recursive: true });

  try {
    let database;
    if (runtime.backend === "sqlite") {
      const relative = "database/archive.sqlite";
      await snapshotSqlite(runtime.sqlitePath, path.join(stageDir, relative));
      database = { backend: "sqlite", format: "sqlite", file: relative };
    } else {
      const relative = "database/postgres.sql";
      const pgEnv = { ...env, PGPASSWORD: env.DB_PASSWORD || "postgres" };
      runCommand("pg_dump", postgresArgs(env, path.join(stageDir, relative)), { env: pgEnv, logger });
      database = {
        backend: "postgres",
        format: "postgres-plain-sql",
        file: relative,
        databaseName: env.DB_NAME || "quotes_db",
      };
    }

    copyTree(runtime.attachmentsPath, path.join(stageDir, "attachments"));
    const attachmentStats = directoryStats(path.join(stageDir, "attachments"));
    const vaultFiles = copyOptionalVaultFiles(runtime.vaultPath || rootDir, stageDir);
    const manifest = {
      format: "note-archive-full-backup",
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      database,
      attachments: { included: true, path: "attachments", ...attachmentStats },
      vaultFiles,
      integrity: {
        algorithm: "sha256",
        files: buildIntegrityEntries(stageDir),
      },
    };
    fs.writeFileSync(
      path.join(stageDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    runCommand("tar", ["-czf", temporaryArchive, "-C", workDir, "note-archive-backup"]);
    fs.renameSync(temporaryArchive, archivePath);
    const archiveBytes = fs.statSync(archivePath).size;
    logger.log(`Backup complete: ${archivePath}`);
    logger.log(
      `${attachmentStats.fileCount} attachment files, ${(archiveBytes / 1024 / 1024).toFixed(1)} MB archive`,
    );
    return { archivePath, manifest };
  } finally {
    if (fs.existsSync(temporaryArchive)) fs.rmSync(temporaryArchive, { force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  await createFullBackup(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createFullBackup,
  parseArgs,
  postgresArgs,
  runCommand,
  snapshotSqlite,
};
