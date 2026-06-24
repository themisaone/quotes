const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeTagName,
  parseTagQueryList,
  registerTagRoutes,
} = require("../src/routes/tags");

const silentLogger = {
  error() {},
};

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

test("tag route helpers trim names and parse comma query lists", () => {
  assert.equal(normalizeTagName(" alpha "), "alpha");
  assert.equal(normalizeTagName(42), "");
  assert.deepEqual(parseTagQueryList(" alpha, beta ,, gamma "), [
    "alpha",
    "beta",
    "gamma",
  ]);
  assert.deepEqual(parseTagQueryList(["alpha,beta", "gamma"]), [
    "alpha",
    "beta",
    "gamma",
  ]);
});

test("GET /api/tags/co-occurring returns empty without tags", async () => {
  const pool = {
    async query() {
      throw new Error("query should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/tags/co-occurring",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("GET /api/tags delegates list query with search and type filters", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, name: "alpha", type: "quote", quote_count: 2 }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/tags",
    query: { search: "alp", type: "quote" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    { id: 1, name: "alpha", type: "quote", quote_count: 2 },
  ]);
  assert.deepEqual(calls[0].params, ["quote", "%alp%"]);
  assert.match(calls[0].sql, /t\.type = \$1/);
  assert.match(calls[0].sql, /t\.name ILIKE \$2/);
});

test("POST /api/tags requires a name and trims inserts", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, name: params[0] }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const invalid = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags",
    body: { name: "   " },
  });
  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags",
    body: { name: " alpha " },
  });

  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "Tag name is required" });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, name: "alpha" });
  assert.deepEqual(calls[0].params, ["alpha"]);
});

test("PUT /api/tags/:id validates name before opening a transaction", async () => {
  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/tags/:id",
    params: { id: "1" },
    body: { name: " " },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Tag name is required" });
});

test("PUT /api/tags/:id rolls back and releases when tag is missing", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/tags/:id",
    params: { id: "99" },
    body: { name: "missing" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Tag not found" });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, name FROM tags WHERE id = $1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PUT /api/tags/:id merges into an existing tag", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("SELECT id, name FROM tags WHERE id")) {
        return { rows: [{ id: 1, name: "Old" }] };
      }
      if (sql.startsWith("SELECT id, name FROM tags WHERE LOWER")) {
        return { rows: [{ id: 2, name: "Existing" }] };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/tags/:id",
    params: { id: "1" },
    body: { name: "Existing" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    merged: true,
    oldName: "Old",
    newName: "Existing",
    targetTagId: 2,
    message: 'Tag "Old" merged into existing tag "Existing"',
  });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, name FROM tags WHERE id = $1",
    "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1) AND id != $2",
    "\n        INSERT INTO note_tags (note_id, tag_id)\n        SELECT note_id, $1\n        FROM note_tags\n        WHERE tag_id = $2\n        ON CONFLICT (note_id, tag_id) DO NOTHING\n      ",
    "DELETE FROM tags WHERE id = $1",
    "COMMIT",
    "RELEASE",
  ]);
});

test("DELETE /api/tags/:id rolls back and releases when tag is missing", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/tags/:id",
    params: { id: "99" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Tag not found" });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "DELETE FROM tags WHERE id = $1 RETURNING name",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("POST /api/tags/bulk-add validates before opening a transaction", async () => {
  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags/bulk-add",
    body: { sourceTagName: "alpha", targetTagName: " Alpha " },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Source and target tags cannot be the same",
  });
});

test("POST /api/tags/bulk-add rolls back and releases when source tag is missing", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags/bulk-add",
    body: { sourceTagName: " missing ", targetTagName: "target" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Source tag "missing" not found' });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("POST /api/tags/bulk-add creates missing target tag and reports affected count", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("SELECT id, name FROM tags WHERE LOWER")) {
        if (params[0] === "source") return { rows: [{ id: 1, name: "source" }] };
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO tags")) {
        return { rows: [{ id: 2, name: params[0] }] };
      }
      if (sql.includes("INSERT INTO note_tags")) {
        return { rows: [{ note_id: 10 }, { note_id: 11 }] };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/tags/bulk-add",
    body: { sourceTagName: "source", targetTagName: " target " },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    affectedCount: 2,
    sourceTag: "source",
    targetTag: "target",
    message: 'Added tag "target" to 2 note(s) that have tag "source"',
  });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
    "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
    "INSERT INTO tags (name) VALUES ($1) RETURNING id, name",
    "\n      INSERT INTO note_tags (note_id, tag_id)\n      SELECT qt.note_id, $1\n      FROM note_tags qt\n      WHERE qt.tag_id = $2\n      ON CONFLICT (note_id, tag_id) DO NOTHING\n      RETURNING note_id\n    ",
    "COMMIT",
    "RELEASE",
  ]);
});
