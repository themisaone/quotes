const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  listMigrationFiles,
  runMigrations,
} = require("../migrations/run-migrations");

function withTempMigrationDir(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-migrations-"));
  for (const [filename, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), source);
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function migrationSource(label, { fail = false } = {}) {
  return `
    module.exports = {
      async migrate({ client }) {
        await client.query("MIGRATE ${label}");
        ${fail ? 'throw new Error("boom");' : ""}
      }
    };
  `;
}

function makePool(initialApplied = []) {
  const applied = new Set(initialApplied);
  const calls = [];

  return {
    applied,
    calls,
    async connect() {
      return {
        async query(sql, params = []) {
          calls.push({ sql, params });
          if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(sql)) {
            return { rows: [], rowCount: 0 };
          }
          if (sql === "SELECT filename FROM schema_migrations ORDER BY filename") {
            return {
              rows: [...applied].sort().map((filename) => ({ filename })),
              rowCount: applied.size,
            };
          }
          if (/INSERT INTO schema_migrations/.test(sql)) {
            applied.add(params[0]);
            return { rows: [], rowCount: 1 };
          }
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rows: [], rowCount: 0 };
          }
          if (sql.startsWith("MIGRATE ")) {
            return { rows: [], rowCount: 1 };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        release() {
          calls.push({ sql: "RELEASE", params: [] });
        },
      };
    },
  };
}

function makeLogger() {
  return {
    lines: [],
    errors: [],
    log(...args) {
      this.lines.push(args.join(" "));
    },
    error(...args) {
      this.errors.push(args.join(" "));
    },
  };
}

test("listMigrationFiles returns sorted top-level migration files only", (t) => {
  const dir = withTempMigrationDir(t, {
    "002_second.js": "",
    "001_first.js": "",
    "run-migrations.js": "",
    "notes.txt": "",
  });

  assert.deepEqual(listMigrationFiles({ migrationsPath: dir }), [
    "001_first.js",
    "002_second.js",
  ]);
});

test("runMigrations skips applied files and records pending migrations", async (t) => {
  const dir = withTempMigrationDir(t, {
    "001_first.js": migrationSource("001"),
    "002_second.js": migrationSource("002"),
  });
  const pool = makePool(["001_first.js"]);
  const logger = makeLogger();

  const result = await runMigrations({ pool, migrationsPath: dir, logger });

  assert.deepEqual(result.ran, ["002_second.js"]);
  assert.equal(pool.applied.has("001_first.js"), true);
  assert.equal(pool.applied.has("002_second.js"), true);
  assert.deepEqual(
    pool.calls.filter((call) => call.sql.startsWith("MIGRATE ")).map((call) => call.sql),
    ["MIGRATE 002"],
  );
  assert.equal(logger.lines.some((line) => /Skipping 1 already-applied/.test(line)), true);
});

test("runMigrations reports no pending migrations without running files", async (t) => {
  const dir = withTempMigrationDir(t, {
    "001_first.js": migrationSource("001"),
  });
  const pool = makePool(["001_first.js"]);
  const logger = makeLogger();

  const result = await runMigrations({ pool, migrationsPath: dir, logger });

  assert.deepEqual(result.ran, []);
  assert.equal(logger.lines.some((line) => /No pending migrations/.test(line)), true);
  assert.deepEqual(
    pool.calls.filter((call) => call.sql.startsWith("MIGRATE ")),
    [],
  );
});

test("runMigrations can suppress the nested runner banner for startup checks", async (t) => {
  const dir = withTempMigrationDir(t, {
    "001_first.js": migrationSource("001"),
  });
  const pool = makePool(["001_first.js"]);
  const logger = makeLogger();

  await runMigrations({ pool, migrationsPath: dir, logger, quietWhenNoPending: true });

  assert.equal(logger.lines.some((line) => /Starting migration runner/.test(line)), false);
  assert.equal(logger.lines.some((line) => /No pending migrations/.test(line)), true);
});

test("runMigrations rolls back and does not record a failed migration", async (t) => {
  const dir = withTempMigrationDir(t, {
    "001_fail.js": migrationSource("001", { fail: true }),
  });
  const pool = makePool();
  const logger = makeLogger();

  await assert.rejects(
    runMigrations({ pool, migrationsPath: dir, logger }),
    /boom/,
  );

  assert.equal(pool.applied.has("001_fail.js"), false);
  assert.equal(pool.calls.some((call) => call.sql === "ROLLBACK"), true);
  assert.equal(logger.errors.some((line) => /Migration failed: 001_fail\.js/.test(line)), true);
});
