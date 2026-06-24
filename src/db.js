require("dotenv").config();
const { createPostgresPool } = require("./db/postgres");
const {
  createSqlitePool,
  normalizeBackendName,
} = require("./db/sqlite");

function createPoolForEnv(env = process.env) {
  const backend = normalizeBackendName(env.DB_BACKEND);
  if (backend === "sqlite") return createSqlitePool();
  if (backend === "postgres" || backend === "pg") return createPostgresPool(env);
  throw new Error(`Unsupported DB_BACKEND "${env.DB_BACKEND}"`);
}

function formatStartupError(error) {
  if (error?.code === "SQLITE_DB_LOCKED") {
    return [
      "",
      "🔒 SQLite archive is already in use.",
      "",
      `Database: ${error.dbPath}`,
      `Locked by process: ${error.pid}`,
      "",
      "Stop the running Note Archive service that uses this SQLite file, then start this one again.",
      "If you are sure no service is running, remove the stale lock file:",
      `  ${error.lockPath}`,
      "",
    ].join("\n");
  }

  return null;
}

function createDefaultPool() {
  try {
    return createPoolForEnv();
  } catch (error) {
    const friendlyMessage = formatStartupError(error);
    if (friendlyMessage) {
      console.error(friendlyMessage);
      process.exit(1);
    }
    throw error;
  }
}

const pool = createDefaultPool();

module.exports = pool;
module.exports.createPoolForEnv = createPoolForEnv;
module.exports.formatStartupError = formatStartupError;
