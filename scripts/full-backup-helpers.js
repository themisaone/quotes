"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function expandHome(value, env = process.env) {
  const text = String(value || "").trim();
  const homeDir = env.HOME || env.USERPROFILE || "";
  if (text === "~") return homeDir || text;
  if (text.startsWith("~/") || text.startsWith("~\\")) {
    return path.join(homeDir, text.slice(2));
  }
  return text;
}

function resolvePath(value, { cwd = process.cwd(), env = process.env } = {}) {
  return path.resolve(cwd, expandHome(value, env));
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function resolveRuntimePaths({
  options = {},
  localConfig = {},
  rootDir,
  env = process.env,
} = {}) {
  const backend = String(options.backend || env.DB_BACKEND || "postgres")
    .trim()
    .toLowerCase();
  if (!["postgres", "pg", "sqlite"].includes(backend)) {
    throw new Error(`Unsupported database backend: ${backend}`);
  }

  const vaultValue = options.vault || localConfig.vaultPath || "";
  const vaultPath = vaultValue ? resolvePath(vaultValue, { cwd: rootDir, env }) : "";
  const attachmentsValue = options.attachments || (
    vaultPath ? path.join(vaultPath, "attachments") : path.join(rootDir, "attachments")
  );

  let sqlitePath = "";
  if (backend === "sqlite") {
    const sqliteValue = options.sqlitePath || localConfig?.sqlite?.path || (
      vaultPath ? path.join(vaultPath, "archive.sqlite") : path.join(rootDir, "data", "archive.sqlite")
    );
    sqlitePath = resolvePath(sqliteValue, { cwd: rootDir, env });
  }

  return {
    backend: backend === "pg" ? "postgres" : backend,
    vaultPath,
    attachmentsPath: resolvePath(attachmentsValue, { cwd: rootDir, env }),
    sqlitePath,
  };
}

function walkRegularFiles(root, { fsImpl = fs, pathImpl = path } = {}) {
  if (!fsImpl.existsSync(root)) return [];
  const files = [];

  function visit(current, relativeDir) {
    const entries = fsImpl.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = pathImpl.join(current, entry.name);
      const relative = pathImpl.join(relativeDir, entry.name).replace(/\\/g, "/");
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not supported in full backups: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push({ absolute, relative });
      else throw new Error(`Unsupported filesystem entry in backup: ${absolute}`);
    }
  }

  visit(root, "");
  return files;
}

function copyTree(source, target, { fsImpl = fs, pathImpl = path } = {}) {
  fsImpl.mkdirSync(target, { recursive: true });

  function visit(sourceDir, targetDir) {
    const entries = fsImpl.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourceEntry = pathImpl.join(sourceDir, entry.name);
      const targetEntry = pathImpl.join(targetDir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not supported in full backups: ${sourceEntry}`);
      }
      if (entry.isDirectory()) {
        fsImpl.mkdirSync(targetEntry, { recursive: true });
        visit(sourceEntry, targetEntry);
      } else if (entry.isFile()) {
        fsImpl.copyFileSync(sourceEntry, targetEntry);
      } else {
        throw new Error(`Unsupported filesystem entry in backup: ${sourceEntry}`);
      }
    }
  }

  visit(source, target);
}

function sha256File(file, { fsImpl = fs } = {}) {
  const hash = crypto.createHash("sha256");
  const fd = fsImpl.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fsImpl.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fsImpl.closeSync(fd);
  }
  return hash.digest("hex");
}

function buildIntegrityEntries(stageDir, { fsImpl = fs, pathImpl = path } = {}) {
  return walkRegularFiles(stageDir, { fsImpl, pathImpl })
    .filter((file) => file.relative !== "manifest.json")
    .map((file) => ({
      path: file.relative,
      bytes: fsImpl.statSync(file.absolute).size,
      sha256: sha256File(file.absolute, { fsImpl }),
    }));
}

function assertSafeArchivePath(relativePath) {
  const value = String(relativePath || "").replace(/\\/g, "/");
  if (!value || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return normalized;
}

function verifyIntegrity(stageDir, manifest, { fsImpl = fs, pathImpl = path } = {}) {
  const entries = manifest?.integrity?.files;
  if (manifest?.integrity?.algorithm !== "sha256" || !Array.isArray(entries)) {
    throw new Error("Backup manifest has no supported integrity information");
  }

  for (const entry of entries) {
    const safePath = assertSafeArchivePath(entry.path);
    const file = pathImpl.join(stageDir, ...safePath.split("/"));
    if (!fsImpl.existsSync(file) || !fsImpl.statSync(file).isFile()) {
      throw new Error(`Backup is missing ${safePath}`);
    }
    const size = fsImpl.statSync(file).size;
    if (size !== entry.bytes) throw new Error(`Backup size check failed for ${safePath}`);
    if (sha256File(file, { fsImpl }) !== entry.sha256) {
      throw new Error(`Backup checksum failed for ${safePath}`);
    }
  }
}

function directoryStats(root, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const files = walkRegularFiles(root, options);
  return {
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + fsImpl.statSync(file.absolute).size, 0),
  };
}

module.exports = {
  assertSafeArchivePath,
  buildIntegrityEntries,
  copyTree,
  directoryStats,
  expandHome,
  resolvePath,
  resolveRuntimePaths,
  sha256File,
  timestamp,
  verifyIntegrity,
  walkRegularFiles,
};
