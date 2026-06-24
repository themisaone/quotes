const fs = require("fs");
const path = require("path");
const { readLocalConfig } = require("../localConfig");

class SqliteDatabaseLockedError extends Error {
  constructor({ pid, dbPath, lockPath }) {
    super(
      `SQLite database is already locked by process ${pid}: ${dbPath}. ` +
        "Stop the other service before starting another one."
    );
    this.name = "SqliteDatabaseLockedError";
    this.code = "SQLITE_DB_LOCKED";
    this.pid = pid;
    this.dbPath = dbPath;
    this.lockPath = lockPath;
  }
}

function resolveSqlitePath({
  localConfig = readLocalConfig(),
  cwd = process.cwd(),
} = {}) {
  const vaultPath = localConfig?.vaultPath && String(localConfig.vaultPath).trim();

  if (vaultPath) {
    if (localConfig?.sqlite?.enabled !== true) {
      throw new Error(
        "DB_BACKEND=sqlite refuses to use config/local.json vaultPath unless localConfig.sqlite.enabled is true"
      );
    }
    return path.join(path.resolve(vaultPath), "archive.sqlite");
  }

  return path.join(cwd, "data", "archive.sqlite");
}

function normalizeBackendName(value) {
  return String(value || "postgres").trim().toLowerCase();
}

function normalizeSqlAndParams(sql, params = []) {
  const flatParams = [];
  let normalized = String(sql)
    .replace(/\bILIKE\b/gi, "LIKE")
    .replace(/::[a-zA-Z_][\w]*(?:\[\])?/g, "")
    .replace(
      /([A-Za-z_][\w."]*)\s*~\s*'\^\[0-9\]\{4\}\$'/g,
      "length($1) = 4 AND $1 NOT GLOB '*[^0-9]*'"
    )
    .replace(
      /EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+)\)/gi,
      "CAST(strftime('%d', $1) AS INTEGER)"
    )
    .replace(/FOR\s+UPDATE\b/gi, "");

  normalized = normalized.replace(
    /([A-Za-z_][\w."]*)\s+LIKE\s+ANY\s*\(\s*ARRAY\s*\[([^\]]+)\]\s*\)/gi,
    (match, expression, placeholders) => {
      const parts = placeholders.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length === 0) return "0";
      return `(${parts.map((placeholder) => `${expression} LIKE ${placeholder}`).join(" OR ")})`;
    }
  );

  normalized = normalized.replace(
    /=\s*ANY\(\$(\d+)(?:::[^)]+)?\)|(?:!=|<>)\s*ALL\(\$(\d+)(?:::[^)]+)?\)|\$(\d+)(?:::[a-zA-Z_][\w]*(?:\[\])?)?/g,
    (match, anyIndex, notAllIndex, paramIndex) => {
      if (anyIndex) {
        const values = params[Number(anyIndex) - 1];
        if (!Array.isArray(values) || values.length === 0) {
          return "IN (SELECT NULL WHERE 0)";
        }
        flatParams.push(...values);
        return `IN (${values.map(() => "?").join(", ")})`;
      }

      if (notAllIndex) {
        const values = params[Number(notAllIndex) - 1];
        if (!Array.isArray(values) || values.length === 0) {
          return "NOT IN (SELECT NULL WHERE 0)";
        }
        flatParams.push(...values);
        return `NOT IN (${values.map(() => "?").join(", ")})`;
      }

      flatParams.push(params[Number(paramIndex) - 1]);
      return "?";
    }
  );

  return { sql: normalized, params: flatParams };
}

function isReadQuery(sql) {
  const first = String(sql).trim().split(/\s+/, 1)[0]?.toUpperCase();
  return first === "SELECT" || first === "WITH" || first === "PRAGMA";
}

function hasReturning(sql) {
  return /\bRETURNING\b/i.test(sql);
}

function createSqliteResultFromRows(rows) {
  return { rows: rows.map((row) => ({ ...row })), rowCount: rows.length };
}

function loadNodeSqlite() {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function emitWarningExceptSqliteExperimental(warning, ...args) {
    const message = typeof warning === "string" ? warning : warning?.message;
    const type = typeof args[0] === "string" ? args[0] : warning?.name;
    if (type === "ExperimentalWarning" && /SQLite/i.test(String(message))) return;
    return originalEmitWarning.call(this, warning, ...args);
  };

  try {
    return require("node:sqlite");
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function readLockFile(fsImpl, lockPath) {
  try {
    return JSON.parse(fsImpl.readFileSync(lockPath, "utf8"));
  } catch (_) {
    return null;
  }
}

function isProcessRunning(pid, processImpl = process) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    processImpl.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function writeLockFile(fsImpl, lockPath, payload) {
  const fd = fsImpl.openSync(lockPath, "wx");
  try {
    fsImpl.writeFileSync(fd, JSON.stringify(payload, null, 2));
  } finally {
    fsImpl.closeSync(fd);
  }
}

function acquireSqliteFileLock({
  dbPath,
  fsImpl = fs,
  processImpl = process,
  now = () => new Date(),
} = {}) {
  if (!dbPath || dbPath === ":memory:") {
    return { lockPath: null, release() {} };
  }

  const lockPath = `${dbPath}.lock`;
  const payload = {
    pid: processImpl.pid,
    dbPath,
    createdAt: now().toISOString(),
  };

  try {
    writeLockFile(fsImpl, lockPath, payload);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;

    const existing = readLockFile(fsImpl, lockPath);
    if (existing?.pid && isProcessRunning(existing.pid, processImpl)) {
      throw new SqliteDatabaseLockedError({
        pid: existing.pid,
        dbPath,
        lockPath,
      });
    }

    fsImpl.unlinkSync(lockPath);
    writeLockFile(fsImpl, lockPath, payload);
  }

  let released = false;
  return {
    lockPath,
    release() {
      if (released) return;
      released = true;
      const existing = readLockFile(fsImpl, lockPath);
      if (!existing || existing.pid === processImpl.pid) {
        try {
          fsImpl.unlinkSync(lockPath);
        } catch (_) {}
      }
    },
  };
}

function executeSqliteQuery(db, rawSql, rawParams = []) {
  const trimmed = String(rawSql).trim();
  if (!trimmed) return { rows: [], rowCount: 0 };

  if (/^(BEGIN|COMMIT|ROLLBACK)(?:\s|;|$)/i.test(trimmed)) {
    db.exec(trimmed.replace(/;+\s*$/, ""));
    return { rows: [], rowCount: 0 };
  }

  const { sql, params } = normalizeSqlAndParams(trimmed, rawParams);

  if (isReadQuery(sql) || hasReturning(sql)) {
    const rows = db.prepare(sql).all(...params);
    return createSqliteResultFromRows(rows);
  }

  const info = db.prepare(sql).run(...params);
  return {
    rows: [],
    rowCount: Number(info.changes || 0),
    lastInsertRowid: info.lastInsertRowid,
  };
}

function createSqliteClient(db) {
  return {
    dialect: "sqlite",
    async query(sql, params = []) {
      return executeSqliteQuery(db, sql, params);
    },
    release() {},
  };
}

function createSqlitePool({
  filename,
  localConfig,
  cwd,
  sqliteModule,
  fsImpl = fs,
} = {}) {
  const dbPath = filename || resolveSqlitePath({ localConfig, cwd });
  fsImpl.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = sqliteModule || loadNodeSqlite();
  const fileLock = acquireSqliteFileLock({ dbPath, fsImpl });
  let db;
  try {
    db = new sqlite.DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
  } catch (error) {
    fileLock.release();
    throw error;
  }
  let closed = false;

  return {
    dialect: "sqlite",
    filename: dbPath,
    lockPath: fileLock.lockPath,
    async query(sql, params = []) {
      return executeSqliteQuery(db, sql, params);
    },
    async connect() {
      return createSqliteClient(db);
    },
    async end() {
      if (closed) return;
      closed = true;
      db.close();
      fileLock.release();
    },
    _db: db,
  };
}

module.exports = {
  acquireSqliteFileLock,
  createSqlitePool,
  executeSqliteQuery,
  isProcessRunning,
  loadNodeSqlite,
  normalizeBackendName,
  normalizeSqlAndParams,
  resolveSqlitePath,
  SqliteDatabaseLockedError,
};
