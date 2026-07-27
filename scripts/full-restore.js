#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readLocalConfig } = require("../src/localConfig");
const {
  assertSafeArchivePath,
  copyTree,
  resolvePath,
  resolveRuntimePaths,
  timestamp,
  verifyIntegrity,
} = require("./full-backup-helpers");

const rootDir = path.resolve(__dirname, "..");

function usage() {
  console.log(`Inspect or restore a complete Note Archive backup.

Usage:
  npm run restore -- <backup.tar.gz> [options]

Options:
  --apply               Perform the restore (without this, only inspect and verify)
  --backend <name>      postgres or sqlite (default: DB_BACKEND)
  --attachments <dir>   Override the destination attachments directory
  --vault <dir>         Override the destination vault directory
  --sqlite-path <file>  Override the destination SQLite database path
  --skip-database       Restore only files
  --skip-attachments    Restore only the database
  -h, --help            Show this help

Stop the app before --apply. Existing SQLite and attachment data is renamed to
*.before-restore-<time> instead of being deleted. PostgreSQL restore runs in one
transaction and requires the target database to already exist.
`);
}

function parseArgs(argv) {
  const options = {
    archive: "",
    apply: false,
    backend: "",
    attachments: "",
    vault: "",
    sqlitePath: "",
    skipDatabase: false,
    skipAttachments: false,
    help: false,
  };
  const valueFlags = new Map([
    ["--backend", "backend"],
    ["--attachments", "attachments"],
    ["--vault", "vault"],
    ["--sqlite-path", "sqlitePath"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--skip-database") options.skipDatabase = true;
    else if (arg === "--skip-attachments") options.skipAttachments = true;
    else if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[valueFlags.get(arg)] = value;
      index += 1;
    } else if (!arg.startsWith("-") && !options.archive) options.archive = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && !options.archive) throw new Error("Backup archive path is required");
  if (options.skipDatabase && options.skipAttachments) {
    throw new Error("Cannot use both --skip-database and --skip-attachments");
  }
  return options;
}

function runCommand(command, args, { env = process.env } = {}) {
  const result = spawnSync(command, args, { env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function inspectTarPaths(archivePath) {
  const result = runCommand("tar", ["-tzf", archivePath]);
  const paths = result.stdout.split(/\r?\n/).filter(Boolean);
  for (const entry of paths) assertSafeArchivePath(entry);
  const verbose = runCommand("tar", ["-tvzf", archivePath]);
  for (const line of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
    if (!["-", "d"].includes(line[0])) {
      throw new Error("Backup archive contains links or unsupported filesystem entries");
    }
  }
  if (!paths.includes("note-archive-backup/manifest.json")) {
    throw new Error("Archive is not a Note Archive full backup");
  }
  return paths;
}

function postgresRestoreArgs(env, dumpFile) {
  return [
    "--host", env.DB_HOST || "localhost",
    "--port", String(env.DB_PORT || 5432),
    "--username", env.DB_USER || "postgres",
    "--dbname", env.DB_NAME || "quotes_db",
    "--set", "ON_ERROR_STOP=on",
    "--single-transaction",
    "--file", dumpFile,
  ];
}

function replaceDirectory(source, target, backupSuffix) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const incoming = `${target}.restoring-${process.pid}`;
  if (fs.existsSync(incoming)) {
    throw new Error(`Temporary restore directory already exists: ${incoming}`);
  }
  copyTree(source, incoming);

  let previous = "";
  try {
    if (fs.existsSync(target)) {
      previous = `${target}.before-restore-${backupSuffix}`;
      if (fs.existsSync(previous)) throw new Error(`Safety copy already exists: ${previous}`);
      fs.renameSync(target, previous);
    }
    fs.renameSync(incoming, target);
  } catch (error) {
    if (previous && !fs.existsSync(target) && fs.existsSync(previous)) {
      fs.renameSync(previous, target);
    }
    throw error;
  }
  return previous;
}

function replaceSqlite(source, target, backupSuffix) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const lockPath = `${target}.lock`;
  if (fs.existsSync(lockPath)) {
    throw new Error(`SQLite lock exists; stop the app before restoring: ${lockPath}`);
  }
  const incoming = `${target}.restoring-${process.pid}`;
  fs.copyFileSync(source, incoming);
  let previous = "";
  try {
    if (fs.existsSync(target)) {
      previous = `${target}.before-restore-${backupSuffix}`;
      if (fs.existsSync(previous)) throw new Error(`Safety copy already exists: ${previous}`);
      fs.renameSync(target, previous);
    }
    fs.renameSync(incoming, target);
  } catch (error) {
    if (previous && !fs.existsSync(target) && fs.existsSync(previous)) {
      fs.renameSync(previous, target);
    }
    throw error;
  }
  return previous;
}

function restoreVaultFiles(stageDir, vaultPath) {
  if (!vaultPath) return [];
  const restored = [];
  const settings = path.join(stageDir, "vault", "config", "settings.json");
  if (fs.existsSync(settings)) {
    const target = path.join(vaultPath, "config", "settings.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(settings, target);
    restored.push(target);
  }
  const palettes = path.join(stageDir, "vault", "palettes");
  if (fs.existsSync(palettes)) {
    copyTree(palettes, path.join(vaultPath, "palettes"));
    restored.push(path.join(vaultPath, "palettes"));
  }
  return restored;
}

async function restoreFullBackup(options, {
  env = process.env,
  logger = console,
  localConfig = readLocalConfig(),
} = {}) {
  const archivePath = resolvePath(options.archive, { cwd: rootDir, env });
  if (!fs.existsSync(archivePath)) throw new Error(`Backup not found: ${archivePath}`);
  inspectTarPaths(archivePath);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "note-archive-restore-"));
  try {
    runCommand("tar", ["-xzf", archivePath, "-C", workDir]);
    const stageDir = path.join(workDir, "note-archive-backup");
    const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, "manifest.json"), "utf8"));
    if (manifest.format !== "note-archive-full-backup" || manifest.formatVersion !== 1) {
      throw new Error("Unsupported full-backup manifest");
    }
    verifyIntegrity(stageDir, manifest);

    const runtime = resolveRuntimePaths({ options, localConfig, rootDir, env });
    if (!options.skipDatabase && manifest.database.backend !== runtime.backend) {
      throw new Error(
        `Backup contains ${manifest.database.backend}, but the target backend is ${runtime.backend}`,
      );
    }

    logger.log(`Verified backup from ${manifest.createdAt}`);
    logger.log(
      `Contents: ${manifest.database.backend} database and ` +
      `${manifest.attachments.fileCount} attachment files`,
    );
    logger.log(`Database target: ${runtime.backend}${runtime.sqlitePath ? ` (${runtime.sqlitePath})` : ""}`);
    logger.log(`Attachments target: ${runtime.attachmentsPath}`);
    if (!options.apply) {
      logger.log("Inspection only. Re-run with --apply after stopping the app.");
      return { applied: false, manifest, runtime };
    }

    const suffix = timestamp();
    const safetyCopies = [];
    if (!options.skipDatabase) {
      const databaseFile = path.join(
        stageDir,
        ...assertSafeArchivePath(manifest.database.file).split("/"),
      );
      if (runtime.backend === "sqlite") {
        const previous = replaceSqlite(databaseFile, runtime.sqlitePath, suffix);
        if (previous) safetyCopies.push(previous);
      } else {
        const pgEnv = { ...env, PGPASSWORD: env.DB_PASSWORD || "postgres" };
        runCommand("psql", postgresRestoreArgs(env, databaseFile), { env: pgEnv });
      }
    }

    if (!options.skipAttachments) {
      const attachmentsSource = path.join(stageDir, "attachments");
      const previous = replaceDirectory(attachmentsSource, runtime.attachmentsPath, suffix);
      if (previous) safetyCopies.push(previous);
      restoreVaultFiles(stageDir, runtime.vaultPath || rootDir);
    }

    logger.log("Restore complete.");
    if (safetyCopies.length) {
      logger.log(`Previous data kept at:\n${safetyCopies.map((file) => `  ${file}`).join("\n")}`);
    }
    return { applied: true, manifest, runtime, safetyCopies };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  await restoreFullBackup(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Restore failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  inspectTarPaths,
  parseArgs,
  postgresRestoreArgs,
  replaceDirectory,
  replaceSqlite,
  restoreFullBackup,
  runCommand,
};
