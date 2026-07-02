const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.DB_BACKEND = "postgres";

const {
  createPoolForEnv,
  formatStartupError,
} = require("../src/db");
const {
  acquireSqliteFileLock,
  createSqlitePool,
  normalizeBackendName,
  normalizeSqlAndParams,
  resolveSqlitePath,
  SqliteDatabaseLockedError,
} = require("../src/db/sqlite");
const {
  getDefaultMigrationsPath,
  runMigrations,
} = require("../migrations/run-migrations");

process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning" || !/SQLite/.test(warning.message)) {
    throw warning;
  }
});

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-db-backend-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("DB backend helpers default to Postgres and resolve SQLite paths", () => {
  assert.equal(normalizeBackendName(undefined), "postgres");
  assert.equal(normalizeBackendName(" SQLITE "), "sqlite");

  const pgPool = createPoolForEnv({ DB_BACKEND: "postgres" });
  assert.equal(pgPool.dialect, "postgres");
  pgPool.end();

  assert.equal(
    resolveSqlitePath({
      localConfig: {
        vaultPath: "/tmp/misa-vault",
        sqlite: { enabled: true },
      },
    }),
    "/tmp/misa-vault/archive.sqlite",
  );
  assert.equal(
    resolveSqlitePath({
      localConfig: {
        vaultPath: "/tmp/misa-vault",
        sqlite: {
          enabled: true,
          path: "/tmp/misa-db/archive.sqlite",
        },
      },
    }),
    "/tmp/misa-db/archive.sqlite",
  );
  assert.equal(
    resolveSqlitePath({
      localConfig: {
        sqlite: {
          enabled: true,
          path: "local-data/archive.sqlite",
        },
      },
      cwd: "/tmp/misa-app",
    }),
    "/tmp/misa-app/local-data/archive.sqlite",
  );
  assert.equal(
    resolveSqlitePath({ localConfig: {}, cwd: "/tmp/misa-app" }),
    "/tmp/misa-app/data/archive.sqlite",
  );
});

test("SQLite vault path requires explicit local config opt-in", () => {
  assert.throws(
    () => resolveSqlitePath({ localConfig: { vaultPath: "/tmp/real-vault" } }),
    /sqlite\.enabled is true/,
  );
  assert.throws(
    () => resolveSqlitePath({ localConfig: { sqlite: { path: "/tmp/archive.sqlite" } } }),
    /sqlite\.enabled is true/,
  );
});

test("normalizeSqlAndParams converts common Postgres placeholders for SQLite", () => {
  assert.deepEqual(
    normalizeSqlAndParams(
      "SELECT * FROM notes WHERE id = ANY($1::int[]) AND note_text ILIKE $2",
      [[3, 4], "%ada%"],
    ),
    {
      sql: "SELECT * FROM notes WHERE id IN (?, ?) AND note_text LIKE ?",
      params: [3, 4, "%ada%"],
    },
  );

  assert.deepEqual(
    normalizeSqlAndParams("SELECT setval($1::regclass, $2)", ["seq", 7]),
    {
      sql: "SELECT setval(?, ?)",
      params: ["seq", 7],
    },
  );
});

test("normalizeSqlAndParams converts core Postgres-only predicates for SQLite", () => {
  assert.deepEqual(
    normalizeSqlAndParams(
      "SELECT COUNT(qt.note_id)::int as quote_count FROM tags t WHERE t.name != ALL($1::text[])",
      [["alpha", "beta"]],
    ),
    {
      sql: "SELECT COUNT(qt.note_id) as quote_count FROM tags t WHERE t.name NOT IN (?, ?)",
      params: ["alpha", "beta"],
    },
  );

  assert.deepEqual(
    normalizeSqlAndParams(
      "SELECT * FROM tags t WHERE t.name ~ '^[0-9]{4}$' AND t.name ILIKE ANY(ARRAY[$1, $2])",
      ["%2026%", "%2025%"],
    ),
    {
      sql: "SELECT * FROM tags t WHERE length(t.name) = 4 AND t.name NOT GLOB '*[^0-9]*' AND (t.name LIKE ? OR t.name LIKE ?)",
      params: ["%2026%", "%2025%"],
    },
  );

  assert.deepEqual(
    normalizeSqlAndParams(
      "ORDER BY EXTRACT(DAY FROM tq.note_date) DESC LIMIT $1",
      [20],
    ),
    {
      sql: "ORDER BY CAST(strftime('%d', tq.note_date) AS INTEGER) DESC LIMIT ?",
      params: [20],
    },
  );
});

test("SQLite pool exposes a Postgres-like query/connect interface", async (t) => {
  const dir = makeTempDir(t);
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());

  assert.equal(pool.dialect, "sqlite");
  await pool.query("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");

  const inserted = await pool.query(
    "INSERT INTO items (name) VALUES ($1) RETURNING id, name",
    ["Ada"],
  );
  assert.deepEqual(inserted.rows, [{ id: 1, name: "Ada" }]);

  const selected = await pool.query(
    "SELECT id, name FROM items WHERE id = ANY($1::int[])",
    [[1, 2]],
  );
  assert.deepEqual(selected.rows, [{ id: 1, name: "Ada" }]);

  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("UPDATE items SET name = $1 WHERE id = $2", ["Grace", 1]);
  await client.query("COMMIT");
  client.release();

  const updated = await pool.query("SELECT name FROM items WHERE id = $1", [1]);
  assert.deepEqual(updated.rows, [{ name: "Grace" }]);
});

test("SQLite pool prevents two open pools for the same database file", async (t) => {
  const dir = makeTempDir(t);
  const filename = path.join(dir, "archive.sqlite");
  const firstPool = createSqlitePool({ filename });
  t.after(() => firstPool.end());

  assert.equal(fs.existsSync(`${filename}.lock`), true);
  assert.throws(() => createSqlitePool({ filename }), (error) => {
    assert.equal(error.code, "SQLITE_DB_LOCKED");
    assert.match(error.message, /SQLite database is already locked by process/);
    return true;
  });

  await firstPool.end();
  assert.equal(fs.existsSync(`${filename}.lock`), false);

  const secondPool = createSqlitePool({ filename });
  await secondPool.end();
});

test("SQLite file lock replaces stale locks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-lock-"));
  const dbPath = path.join(dir, "archive.sqlite");
  const lockPath = `${dbPath}.lock`;
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999, dbPath }));

  const fakeProcess = {
    pid: 123,
    kill(pid) {
      assert.equal(pid, 999);
      const error = new Error("not running");
      error.code = "ESRCH";
      throw error;
    },
  };

  const lock = acquireSqliteFileLock({ dbPath, processImpl: fakeProcess });
  assert.equal(lock.lockPath, lockPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, "utf8")).pid, 123);
  lock.release();
  assert.equal(fs.existsSync(lockPath), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("formatStartupError renders SQLite lock errors without stack traces", () => {
  const message = formatStartupError(new SqliteDatabaseLockedError({
    pid: 1234,
    dbPath: "/vault/archive.sqlite",
    lockPath: "/vault/archive.sqlite.lock",
  }));

  assert.match(message, /SQLite archive is already in use/);
  assert.match(message, /Database: \/vault\/archive.sqlite/);
  assert.match(message, /Locked by process: 1234/);
  assert.match(message, /\/vault\/archive\.sqlite\.lock/);
  assert.doesNotMatch(message, /\n\s+at\s+/);
});

test("migration runner uses the SQLite migration set for SQLite pools", async (t) => {
  const dir = makeTempDir(t);
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());

  assert.match(getDefaultMigrationsPath(pool), /migrations\/sqlite$/);

  const result = await runMigrations({ pool, quietWhenNoPending: true });
  assert.deepEqual(result.ran, ["001_schema.js", "002_note_format.js"]);

  const tables = await pool.query(
    "SELECT name FROM sqlite_master WHERE type = $1 AND name IN ($2, $3, $4) ORDER BY name",
    ["table", "notes", "note_attachments", "schema_migrations"],
  );
  assert.deepEqual(
    tables.rows.map((row) => row.name),
    ["note_attachments", "notes", "schema_migrations"],
  );

  const secondRun = await runMigrations({ pool, quietWhenNoPending: true });
  assert.deepEqual(secondRun.ran, []);
});
