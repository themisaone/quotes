const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runMigrations } = require("../migrations/run-migrations");
const { createSqlitePool } = require("../src/db/sqlite");
const { registerTagRoutes } = require("../src/routes/tags");

process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning" || !/SQLite/.test(warning.message)) {
    throw warning;
  }
});

const silentLogger = {
  error() {},
  log() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-tags-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeRouteCollector(pool) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
    put(routePath, handler) {
      routes.set(`PUT ${routePath}`, handler);
    },
    delete(routePath, handler) {
      routes.set(`DELETE ${routePath}`, handler);
    },
  };

  registerTagRoutes(app, { pool, logger: silentLogger });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, params = {}, query = {}, body = {} }) {
  const handler = routes.get(`${method} ${routePath}`);
  assert.equal(typeof handler, "function", `missing route: ${method} ${routePath}`);

  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };

  await handler({ params, query, body }, res);
  return { status: res.statusCode, body: res.body };
}

async function makeSqliteTagRoutes(t) {
  const dir = makeTempDir(t);
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());
  await runMigrations({ pool, logger: silentLogger, quietWhenNoPending: true });

  const note = await pool.query(
    "INSERT INTO notes (note_text, note_type) VALUES ($1, $2) RETURNING id",
    ["Tagged note", "quote"],
  );
  const alpha = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["alpha", "quote"],
  );
  const beta = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["beta", "quote"],
  );
  await pool.query(
    "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2), ($1, $3)",
    [note.rows[0].id, alpha.rows[0].id, beta.rows[0].id],
  );

  return {
    alphaId: alpha.rows[0].id,
    betaId: beta.rows[0].id,
    noteId: note.rows[0].id,
    pool,
    routes: makeRouteCollector(pool),
  };
}

test("SQLite tag routes list tags and co-occurring tags", async (t) => {
  const { routes } = await makeSqliteTagRoutes(t);

  const tags = await invoke(routes, {
    routePath: "/api/tags",
    query: { type: "quote", search: "a" },
  });
  assert.equal(tags.status, 200);
  assert.deepEqual(
    tags.body.map((tag) => ({
      name: tag.name,
      type: tag.type,
      quote_count: tag.quote_count,
    })),
    [
      { name: "alpha", type: "quote", quote_count: 1 },
      { name: "beta", type: "quote", quote_count: 1 },
    ],
  );

  const coOccurring = await invoke(routes, {
    routePath: "/api/tags/co-occurring",
    query: { tags: "alpha", type: "quote" },
  });
  assert.equal(coOccurring.status, 200);
  assert.deepEqual(
    coOccurring.body.map((tag) => ({
      name: tag.name,
      type: tag.type,
      quote_count: tag.quote_count,
    })),
    [{ name: "beta", type: "quote", quote_count: 1 }],
  );
});

test("SQLite tag routes create, rename, and delete type-scoped tags", async (t) => {
  const { pool, routes } = await makeSqliteTagRoutes(t);

  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags",
    body: { name: " gamma ", type: " note " },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, "gamma");
  assert.equal(created.body.type, "note");

  const duplicateCreate = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags",
    body: { name: "gamma", type: "note" },
  });
  assert.equal(duplicateCreate.status, 201);
  assert.equal(duplicateCreate.body.id, created.body.id);

  const renamed = await invoke(routes, {
    method: "PUT",
    routePath: "/api/tags/:id",
    params: { id: String(created.body.id) },
    body: { name: " delta " },
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.body, {
    merged: false,
    oldName: "gamma",
    newName: "delta",
    message: 'Tag renamed from "gamma" to "delta"',
  });

  const row = await pool.query("SELECT name, type FROM tags WHERE id = $1", [created.body.id]);
  assert.deepEqual(row.rows, [{ name: "delta", type: "note" }]);

  const deleted = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/tags/:id",
    params: { id: String(created.body.id) },
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { message: 'Tag "delta" deleted successfully' });

  const remaining = await pool.query("SELECT id FROM tags WHERE id = $1", [created.body.id]);
  assert.deepEqual(remaining.rows, []);
});

test("SQLite tag routes merge renamed tags and bulk-add target tags", async (t) => {
  const { alphaId, betaId, noteId, pool, routes } = await makeSqliteTagRoutes(t);

  const merged = await invoke(routes, {
    method: "PUT",
    routePath: "/api/tags/:id",
    params: { id: String(betaId) },
    body: { name: " alpha " },
  });
  assert.equal(merged.status, 200);
  assert.deepEqual(merged.body, {
    merged: true,
    oldName: "beta",
    newName: "alpha",
    targetTagId: alphaId,
    message: 'Tag "beta" merged into existing tag "alpha"',
  });

  const afterMerge = await pool.query("SELECT name FROM tags ORDER BY name");
  assert.deepEqual(afterMerge.rows.map((row) => row.name), ["alpha"]);

  const bulkAdded = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags/bulk-add",
    body: { sourceTagName: "alpha", targetTagName: "gamma" },
  });
  assert.equal(bulkAdded.status, 200);
  assert.deepEqual(bulkAdded.body, {
    success: true,
    affectedCount: 1,
    sourceTag: "alpha",
    targetTag: "gamma",
    message: 'Added tag "gamma" to 1 note(s) that have tag "alpha"',
  });

  const noteTags = await pool.query(
    `SELECT t.name, t.type
     FROM tags t
     JOIN note_tags nt ON nt.tag_id = t.id
     WHERE nt.note_id = $1
     ORDER BY t.name`,
    [noteId],
  );
  assert.deepEqual(noteTags.rows, [
    { name: "alpha", type: "quote" },
    { name: "gamma", type: "quote" },
  ]);
});
