const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getPresentationFilePath,
  registerCardPresentationRoutes,
} = require("../src/routes/cardPresentations");

const silentLogger = {
  error() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-card-presentations-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeRouteCollector(presentationsDir, defaultCardPresentationsDir) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
  };

  registerCardPresentationRoutes(app, {
    getCardPresentationsDir: () => presentationsDir,
    defaultCardPresentationsDir,
    logger: silentLogger,
  });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, params = {} }) {
  const registeredPath = routePath.replace(/\/[^/]+$/, "/:id");
  const key = routePath === "/api/card-presentations"
    ? `${method} /api/card-presentations`
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

  await handler({ params }, res);
  return { status: res.statusCode, body: res.body };
}

test("getPresentationFilePath resolves ids inside the presentations directory", (t) => {
  const dir = makeTempDir(t);

  assert.equal(getPresentationFilePath(dir, "paper-curl"), path.join(dir, "paper-curl.json"));
  assert.throws(() => getPresentationFilePath(dir, "../secret"), /Invalid presentation id/);
  assert.throws(() => getPresentationFilePath(dir, ""), /Presentation id required/);
});

test("GET /api/card-presentations returns sorted presentation manifests", async (t) => {
  const dir = makeTempDir(t);
  fs.writeFileSync(path.join(dir, "paper-curl.json"), JSON.stringify({
    id: "paper-curl",
    label: "Paper curl",
    description: "Curled corner",
  }));
  fs.writeFileSync(path.join(dir, "classical.json"), JSON.stringify({
    id: "classical",
    label: "Classic",
    description: "Flat cards",
  }));

  const routes = makeRouteCollector(dir);
  const { status, body } = await invoke(routes, { routePath: "/api/card-presentations" });

  assert.equal(status, 200);
  assert.deepEqual(body.map((entry) => entry.id), ["classical", "paper-curl"]);
  assert.equal(body[1].label, "Paper curl");
});

test("GET /api/card-presentations seeds vault dir from defaults when empty", async (t) => {
  const defaultsDir = makeTempDir(t);
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-card-presentations-vault-"));
  t.after(() => fs.rmSync(vaultDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(defaultsDir, "classical.json"), JSON.stringify({
    id: "classical",
    label: "Classic",
    description: "Flat cards",
  }));
  fs.writeFileSync(path.join(defaultsDir, "paper-curl.json"), JSON.stringify({
    id: "paper-curl",
    label: "Paper curl",
    description: "Curled corner",
  }));

  const routes = makeRouteCollector(vaultDir, defaultsDir);
  const { status, body } = await invoke(routes, { routePath: "/api/card-presentations" });

  assert.equal(status, 200);
  assert.deepEqual(body.map((entry) => entry.id), ["classical", "paper-curl"]);
  assert.equal(fs.existsSync(path.join(vaultDir, "classical.json")), true);
  assert.equal(fs.existsSync(path.join(vaultDir, "paper-curl.json")), true);
});

test("GET /api/card-presentations/:id returns one manifest", async (t) => {
  const dir = makeTempDir(t);
  fs.writeFileSync(path.join(dir, "classical.json"), JSON.stringify({
    id: "classical",
    label: "Classic",
    description: "Flat cards",
  }));

  const routes = makeRouteCollector(dir);
  const { status, body } = await invoke(routes, {
    routePath: "/api/card-presentations/classical",
    params: { id: "classical" },
  });

  assert.equal(status, 200);
  assert.equal(body.id, "classical");
  assert.equal(body.label, "Classic");
});
