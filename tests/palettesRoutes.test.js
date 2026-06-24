const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getPaletteFilePath,
  registerPaletteRoutes,
} = require("../src/routes/palettes");

const silentLogger = {
  error() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-palettes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeRouteCollector(palettesDir) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    put(routePath, handler) {
      routes.set(`PUT ${routePath}`, handler);
    },
    delete(routePath, handler) {
      routes.set(`DELETE ${routePath}`, handler);
    },
  };

  registerPaletteRoutes(app, {
    getPalettesDir: () => palettesDir,
    logger: silentLogger,
  });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, params = {}, body }) {
  const registeredPath = routePath.replace(/\/[^/]+$/, "/:name");
  const key = routePath === "/api/palettes"
    ? `${method} /api/palettes`
    : `${method} ${registeredPath}`;
  const handler = routes.get(key);
  assert.equal(typeof handler, "function", `missing route: ${key}`);

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

  await handler({ params, body }, res);
  return { status: res.statusCode, body: res.body };
}

test("getPaletteFilePath resolves names inside the palette directory", (t) => {
  const dir = makeTempDir(t);

  assert.equal(getPaletteFilePath(dir, "my-palette"), path.join(dir, "my-palette.json"));
  assert.throws(() => getPaletteFilePath(dir, "../secret"), /Invalid palette name/);
  assert.throws(() => getPaletteFilePath(dir, ""), /Palette name required/);
});

test("GET /api/palettes returns sorted JSON palette names", async (t) => {
  const dir = makeTempDir(t);
  fs.writeFileSync(path.join(dir, "zeta.json"), "{}");
  fs.writeFileSync(path.join(dir, "alpha.json"), "{}");
  fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
  const routes = makeRouteCollector(dir);

  const response = await invoke(routes, { routePath: "/api/palettes" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, ["alpha", "zeta"]);
});

test("GET /api/palettes returns an empty list when the directory is absent", async (t) => {
  const dir = path.join(makeTempDir(t), "missing");
  const routes = makeRouteCollector(dir);

  const response = await invoke(routes, { routePath: "/api/palettes" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("PUT and GET /api/palettes/:name save and load palettes", async (t) => {
  const dir = makeTempDir(t);
  const routes = makeRouteCollector(dir);
  const palette = { name: "main", colors: { button: "#111111" } };

  const putResponse = await invoke(routes, {
    method: "PUT",
    routePath: "/api/palettes/main",
    params: { name: "main" },
    body: palette,
  });
  const getResponse = await invoke(routes, {
    routePath: "/api/palettes/main",
    params: { name: "main" },
  });

  assert.equal(putResponse.status, 200);
  assert.deepEqual(putResponse.body, { success: true });
  assert.deepEqual(getResponse.body, palette);
});

test("DELETE /api/palettes/:name removes an existing palette", async (t) => {
  const dir = makeTempDir(t);
  fs.writeFileSync(path.join(dir, "main.json"), "{}");
  const routes = makeRouteCollector(dir);

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/palettes/main",
    params: { name: "main" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true });
  assert.equal(fs.existsSync(path.join(dir, "main.json")), false);
});

test("palette routes reject names containing path separators", async (t) => {
  const dir = makeTempDir(t);
  const routes = makeRouteCollector(dir);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/palettes/bad",
    params: { name: "../bad" },
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid palette name" });
  assert.equal(fs.existsSync(path.join(dir, "..", "bad.json")), false);
});
