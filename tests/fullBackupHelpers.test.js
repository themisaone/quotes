"use strict";

process.env.DB_BACKEND = "postgres";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  assertSafeArchivePath,
  buildIntegrityEntries,
  copyTree,
  resolveRuntimePaths,
  verifyIntegrity,
} = require("../scripts/full-backup-helpers");
const { parseArgs: parseBackupArgs, postgresArgs } = require("../scripts/full-backup");
const { parseArgs: parseRestoreArgs, replaceDirectory } = require("../scripts/full-restore");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-full-backup-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("runtime paths use the configured vault and SQLite database", () => {
  const result = resolveRuntimePaths({
    options: { backend: "sqlite" },
    localConfig: {
      vaultPath: "/vault",
      sqlite: { enabled: true, path: "/database/archive.sqlite" },
    },
    rootDir: "/app",
    env: {},
  });

  assert.deepEqual(result, {
    backend: "sqlite",
    vaultPath: "/vault",
    attachmentsPath: "/vault/attachments",
    sqlitePath: "/database/archive.sqlite",
  });
});

test("backup and restore arguments require explicit restore application", () => {
  assert.deepEqual(
    parseBackupArgs(["--backend", "sqlite", "--output", "safe.tar.gz", "--dry-run"]),
    {
      output: "safe.tar.gz",
      backend: "sqlite",
      attachments: "",
      vault: "",
      sqlitePath: "",
      dryRun: true,
      help: false,
    },
  );
  const restore = parseRestoreArgs(["safe.tar.gz", "--skip-database"]);
  assert.equal(restore.apply, false);
  assert.equal(restore.skipDatabase, true);
});

test("PostgreSQL dump arguments make a restorable plain SQL snapshot", () => {
  const args = postgresArgs({
    DB_HOST: "db",
    DB_PORT: "5433",
    DB_USER: "notes",
    DB_NAME: "archive",
  }, "/tmp/archive.sql");
  assert.ok(args.includes("--clean"));
  assert.ok(args.includes("--if-exists"));
  assert.deepEqual(args.slice(-2), ["--file", "/tmp/archive.sql"]);
  assert.equal(args.includes("secret"), false);
});

test("integrity metadata detects changed files", (t) => {
  const directory = temporaryDirectory(t);
  fs.mkdirSync(path.join(directory, "attachments"));
  fs.writeFileSync(path.join(directory, "attachments", "one.txt"), "original");
  const manifest = {
    integrity: { algorithm: "sha256", files: buildIntegrityEntries(directory) },
  };
  verifyIntegrity(directory, manifest);
  fs.writeFileSync(path.join(directory, "attachments", "one.txt"), "changed");
  assert.throws(() => verifyIntegrity(directory, manifest), /check failed/);
});

test("archive paths cannot escape the extraction directory", () => {
  assert.equal(assertSafeArchivePath("note-archive-backup/database/archive.sqlite"),
    "note-archive-backup/database/archive.sqlite");
  assert.throws(() => assertSafeArchivePath("../outside"), /Unsafe archive path/);
  assert.throws(() => assertSafeArchivePath("/absolute"), /Unsafe archive path/);
});

test("tree replacement retains the previous attachment directory", (t) => {
  const directory = temporaryDirectory(t);
  const source = path.join(directory, "source");
  const target = path.join(directory, "attachments");
  fs.mkdirSync(source);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, "new.txt"), "new");
  fs.writeFileSync(path.join(target, "old.txt"), "old");

  const previous = replaceDirectory(source, target, "stamp");
  assert.equal(fs.readFileSync(path.join(target, "new.txt"), "utf8"), "new");
  assert.equal(fs.readFileSync(path.join(previous, "old.txt"), "utf8"), "old");
});

test("copyTree rejects symbolic links", (t) => {
  const directory = temporaryDirectory(t);
  const source = path.join(directory, "source");
  fs.mkdirSync(source);
  fs.symlinkSync("/tmp", path.join(source, "escape"));
  assert.throws(() => copyTree(source, path.join(directory, "target")), /Symbolic links/);
});
