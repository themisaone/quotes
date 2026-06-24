const assert = require("node:assert/strict");
const test = require("node:test");

const { registerSourceRoutes } = require("../src/routes/sources");

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

  registerSourceRoutes(app, { pool, logger: silentLogger });
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

test("GET /api/sources delegates list query with search and type params", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, name: "Dune", type: "BOOK" }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/sources",
    query: { search: "Dune", type: "BOOK" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{ id: 1, name: "Dune", type: "BOOK" }]);
  assert.deepEqual(calls[0].params, ["%Dune%", "BOOK"]);
  assert.match(calls[0].sql, /s\.name ILIKE \$1/);
  assert.match(calls[0].sql, /s\.type = \$2/);
});

test("GET /api/sources/:id returns 404 when source is missing", async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/sources/:id",
    params: { id: "42" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Source not found" });
});

test("POST /api/sources requires a name and trims inserts", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, name: params[0], image: params[1], type: params[2] }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const invalid = await invoke(routes, {
    method: "POST",
    routePath: "/api/sources",
    body: {},
  });
  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/sources",
    body: { name: " Dune ", thumbnail: "data:image/png;base64,abc", type: "BOOK" },
  });

  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "Source name is required" });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, {
    id: 1,
    name: "Dune",
    image: "data:image/png;base64,abc",
    type: "BOOK",
  });
  assert.deepEqual(calls[0].params, ["Dune", "data:image/png;base64,abc", "BOOK"]);
});

test("PUT /api/sources/:id rejects invalid image payloads before connecting", async () => {
  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/sources/:id",
    params: { id: "1" },
    body: { image: "https://example.test/image.png" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid image format" });
});

test("PUT /api/sources/:id rolls back and releases when source is missing", async () => {
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
    routePath: "/api/sources/:id",
    params: { id: "99" },
    body: { name: "Missing" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Source not found" });
  assert.deepEqual(calls.map((c) => c.sql), [
    "BEGIN",
    "SELECT id, name, image, type FROM sources WHERE id = $1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PUT /api/sources/:id rejects empty update payloads after lookup", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [{ id: 1, name: "Dune", type: "BOOK" }] };
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
    routePath: "/api/sources/:id",
    params: { id: "1" },
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "No source fields to update" });
  assert.equal(calls.some((c) => /UPDATE sources/.test(c.sql)), false);
});

test("PUT /api/sources/:id merges into an existing source", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("SELECT id, name, image, type FROM sources")) {
        return { rows: [{ id: 1, name: "Old" }] };
      }
      if (sql.startsWith("SELECT id, name FROM sources")) {
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
    routePath: "/api/sources/:id",
    params: { id: "1" },
    body: { name: "Existing" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    merged: true,
    oldName: "Old",
    newName: "Existing",
    targetSourceId: 2,
    message: 'Source "Old" merged into existing source "Existing"',
  });
  assert.deepEqual(calls.map((c) => c.sql), [
    "BEGIN",
    "SELECT id, name, image, type FROM sources WHERE id = $1",
    "SELECT id, name FROM sources WHERE LOWER(name) = LOWER($1) AND id != $2",
    "UPDATE notes SET source_id = $1 WHERE source_id = $2",
    "DELETE FROM sources WHERE id = $1",
    "COMMIT",
    "RELEASE",
  ]);
});

test("DELETE /api/sources/:id guards linked notes and deletes unused sources", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [{ count: "2" }] };
      if (calls.length === 2) return { rows: [{ count: "0" }] };
      return { rows: [{ id: params[0], name: "Dune" }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const guarded = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/sources/:id",
    params: { id: "1" },
  });
  const deleted = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/sources/:id",
    params: { id: "1" },
  });

  assert.equal(guarded.status, 400);
  assert.deepEqual(guarded.body, { error: "Cannot delete source with existing quotes" });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { message: "Source deleted successfully" });
});
