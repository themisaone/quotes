const assert = require("node:assert/strict");
const test = require("node:test");

const { registerInstanceRoutes } = require("../src/routes/instances");

const silentLogger = {
  error() {},
};

function makeRouteCollector(instanceManager, options = {}) {
  const routes = new Map();
  const app = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler);
    },
  };

  registerInstanceRoutes(app, {
    instanceManager,
    currentPort: 4000,
    logger: silentLogger,
    terminateSelf: options.terminateSelf || (() => {}),
    shutdownDelayMs: options.shutdownDelayMs ?? 400,
  });
  return routes;
}

async function invoke(routes, { method = "GET", path, body }) {
  const handler = routes.get(`${method} ${path}`);
  assert.equal(typeof handler, "function", `missing route: ${method} ${path}`);

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
  return {
    status: res.statusCode,
    body: res.body,
  };
}

test("GET /api/instances delegates to the instance manager", async () => {
  const calls = [];
  const routes = makeRouteCollector({
    async listInstances(currentPort) {
      calls.push(currentPort);
      return { currentPort, instances: [] };
    },
  });

  const response = await invoke(routes, { path: "/api/instances" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { currentPort: 4000, instances: [] });
  assert.deepEqual(calls, [4000]);
});

test("POST /api/instances/start forwards mode and current port", async () => {
  const calls = [];
  const routes = makeRouteCollector({
    async startInstance(mode, currentPort) {
      calls.push({ mode, currentPort });
      return { started: true, mode };
    },
  });

  const response = await invoke(routes, {
    method: "POST",
    path: "/api/instances/start",
    body: { mode: "TRAINING" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { started: true, mode: "TRAINING" });
  assert.deepEqual(calls, [{ mode: "TRAINING", currentPort: 4000 }]);
});

test("POST /api/instances/start uses manager status errors", async () => {
  const routes = makeRouteCollector({
    async startInstance() {
      const error = new Error("Unknown mode");
      error.status = 400;
      throw error;
    },
  });

  const response = await invoke(routes, {
    method: "POST",
    path: "/api/instances/start",
    body: { mode: "BAD" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Unknown mode" });
});

test("POST /api/instances/stop can schedule self termination", async () => {
  let terminateCalled = false;
  const routes = makeRouteCollector(
    {
      async stopInstance(port, currentPort) {
        return { stopped: true, self: true, port, currentPort };
      },
    },
    {
      terminateSelf: () => {
        terminateCalled = true;
      },
      shutdownDelayMs: 0,
    }
  );

  const response = await invoke(routes, {
    method: "POST",
    path: "/api/instances/stop",
    body: { port: 4000 },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    stopped: true,
    self: true,
    port: 4000,
    currentPort: 4000,
  });
  assert.equal(terminateCalled, true);
});
