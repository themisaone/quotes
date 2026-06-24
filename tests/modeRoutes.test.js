const assert = require("node:assert/strict");
const test = require("node:test");

const { registerModeRoutes } = require("../src/routes/mode");

const silentLogger = {
  warn() {},
  log() {},
};

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    put(routePath, handler) {
      routes.set(`PUT ${routePath}`, handler);
    },
  };
  registerModeRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, body }) {
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

  await handler({ body }, res);
  return { status: res.statusCode, body: res.body };
}

function makeModeDeps() {
  const modes = {
    DEFAULT: ["quote", "note"],
    TRAINING: ["training"],
  };
  let modeName = "DEFAULT";
  let allowedTypes = modes.DEFAULT;
  let localConfig = { vaultPath: "/vault", activeMode: "DEFAULT" };

  return {
    getLocalConfig: () => localConfig,
    options: {
      getModeState() {
        return { modeName, allowedTypes, modes };
      },
      applyMode(nextMode) {
        const normalized = String(nextMode || "").toUpperCase();
        if (!modes[normalized]) return false;
        modeName = normalized;
        allowedTypes = modes[normalized];
        return true;
      },
      readLocalConfig() {
        return localConfig;
      },
      writeLocalConfig(nextConfig) {
        localConfig = nextConfig;
      },
      modeLocked: false,
    },
  };
}

test("GET /api/mode returns current mode state", async () => {
  const deps = makeModeDeps();
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, { routePath: "/api/mode" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    mode: "DEFAULT",
    allowedTypes: ["quote", "note"],
    allModes: {
      DEFAULT: ["quote", "note"],
      TRAINING: ["training"],
    },
    modeLocked: false,
  });
});

test("PUT /api/mode requires a mode", async () => {
  const deps = makeModeDeps();
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/mode",
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "mode required" });
});

test("PUT /api/mode rejects unknown modes", async () => {
  const deps = makeModeDeps();
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/mode",
    body: { mode: "bad" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'Unknown mode "bad". Available: DEFAULT, TRAINING',
  });
});

test("PUT /api/mode switches modes and preserves local config fields", async () => {
  const deps = makeModeDeps();
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/mode",
    body: { mode: "training" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    mode: "TRAINING",
    allowedTypes: ["training"],
  });
  assert.deepEqual(deps.getLocalConfig(), {
    vaultPath: "/vault",
    activeMode: "TRAINING",
  });
});
