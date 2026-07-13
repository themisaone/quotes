const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  cleanupStaleSubtypes,
  createDefaultSettings,
  normalizeSettingsForRuntime,
  registerSettingsRoutes,
} = require("../src/routes/settings");

const silentLogger = {
  error() {},
  warn() {},
  log() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-settings-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

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

  registerSettingsRoutes(app, {
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

function makeSettingsDeps(t, overrides = {}) {
  const dir = makeTempDir(t);
  const defaultSettingsFile = path.join(dir, "config", "settings.json");
  const defaultPalettesDir = path.join(dir, "palettes");
  const modesFile = path.join(dir, "modes.json");
  let localConfig = overrides.localConfig || {};
  const fileStorageCalls = [];

  fs.mkdirSync(path.dirname(defaultSettingsFile), { recursive: true });
  fs.writeFileSync(
    modesFile,
    JSON.stringify(overrides.modes || { DEFAULT: ["quote"], ALL: ["quote"] }, null, 2)
  );

  return {
    dir,
    defaultSettingsFile,
    defaultPalettesDir,
    modesFile,
    getLocalConfig: () => localConfig,
    options: {
      pool: overrides.pool || { async query() { return { rowCount: 0 }; } },
      fileStorage: {
        setAttachmentsDir(value) {
          fileStorageCalls.push(["setAttachmentsDir", value]);
        },
        ensureDirectories() {
          fileStorageCalls.push(["ensureDirectories"]);
        },
      },
      getSettingsFile() {
        const vaultPath = localConfig.vaultPath;
        return vaultPath
          ? path.join(vaultPath, "config", "settings.json")
          : defaultSettingsFile;
      },
      readLocalConfig() {
        return localConfig;
      },
      writeLocalConfig(nextConfig) {
        localConfig = nextConfig;
      },
      defaultSettingsFile,
      defaultPalettesDir,
      modesFile,
      modesState: { ...(overrides.modes || { DEFAULT: ["quote"], ALL: ["quote"] }) },
      getActiveModeName: () => overrides.activeModeName || "DEFAULT",
      setAllowedTypes: overrides.setAllowedTypes || (() => {}),
    },
    fileStorageCalls,
  };
}

test("GET /api/settings creates default settings when none exist", async (t) => {
  const deps = makeSettingsDeps(t);
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, { routePath: "/api/settings" });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.body.noteTypes), true);
  assert.equal(response.body.appFont, "system");
  assert.equal(response.body.displayQuotesMultipleAddButton, false);
  assert.equal(fs.existsSync(deps.defaultSettingsFile), true);
});

test("createDefaultSettings includes every built-in mode note type", () => {
  const settingsTypes = new Set(createDefaultSettings().noteTypes.map((type) => type.value));
  const builtInModes = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/modes.json"), "utf8"),
  );
  const modeTypes = new Set(Object.values(builtInModes).flat());

  for (const type of modeTypes) {
    assert.equal(settingsTypes.has(type), true, `${type} missing from default noteTypes`);
  }
});

test("GET /api/settings falls back to default file when vault path is missing", async (t) => {
  const deps = makeSettingsDeps(t, {
    localConfig: { vaultPath: path.join(makeTempDir(t), "missing-vault") },
  });
  fs.writeFileSync(
    deps.defaultSettingsFile,
    JSON.stringify({ noteTypes: [{ value: "fallback" }] })
  );
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, { routePath: "/api/settings" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { noteTypes: [{ value: "fallback" }] });
  assert.equal(fs.existsSync(deps.getLocalConfig().vaultPath), false);
});

test("GET /api/settings upgrades legacy DNEVNIK runtime settings", async (t) => {
  const deps = makeSettingsDeps(t);
  const routes = makeRouteCollector(deps.options);
  fs.writeFileSync(deps.defaultSettingsFile, JSON.stringify({
    noteTypes: [
      {
        value: "DNEVNIK",
        label: "Dnevnik",
        icon: "📕",
        behavior: "generic",
        displaySettings: { showLongExpanded: true },
      },
    ],
  }));

  const response = await invoke(routes, { routePath: "/api/settings" });
  const dnevnik = response.body.noteTypes.find((type) => type.value === "DNEVNIK");
  const persisted = JSON.parse(fs.readFileSync(deps.defaultSettingsFile, "utf8"));
  const persistedDnevnik = persisted.noteTypes.find((type) => type.value === "DNEVNIK");

  assert.equal(response.status, 200);
  assert.equal(dnevnik.behavior, "diary");
  assert.equal(dnevnik.icon, "📕");
  assert.equal(dnevnik.defaultDisplayMode, "calendar");
  assert.deepEqual(dnevnik.displaySettings, { showLongExpanded: true });
  assert.deepEqual(
    dnevnik.subTypes.map((type) => [type.value, type.label, type.isDefault === true]),
    [["SLEEP", "Sleep", false], ["ASSORTED", "Assorted", true]],
  );
  assert.equal(persistedDnevnik.behavior, "diary");
});

test("normalizeSettingsForRuntime preserves custom DNEVNIK fields while adding diary contract", () => {
  const settings = {
    noteTypes: [
      {
        value: "DNEVNIK",
        label: "Journal",
        icon: "📔",
        behavior: "diary",
        subTypes: [{ value: "SLEEP", icon: "💤", label: "Rest" }],
      },
    ],
  };

  const { settings: normalized, changed } = normalizeSettingsForRuntime(settings);
  const dnevnik = normalized.noteTypes[0];

  assert.equal(changed, true);
  assert.equal(dnevnik.label, "Journal");
  assert.equal(dnevnik.icon, "📔");
  assert.deepEqual(dnevnik.subTypes[0], { value: "SLEEP", icon: "💤", label: "Rest" });
  assert.equal(dnevnik.subTypes[1].value, "ASSORTED");
  assert.equal(dnevnik.subTypes[1].isDefault, true);
});

test("GET /api/settings restores DNEVNIK when existing settings predate the mode", async (t) => {
  const deps = makeSettingsDeps(t, {
    modes: {
      DEFAULT: ["quote"],
      DNEVNIK: ["DNEVNIK"],
      ALL: ["quote", "DNEVNIK"],
    },
  });
  const routes = makeRouteCollector(deps.options);
  fs.writeFileSync(deps.defaultSettingsFile, JSON.stringify({
    noteTypes: [{ value: "quote", label: "Quotes", behavior: "quote" }],
  }));

  const response = await invoke(routes, { routePath: "/api/settings" });
  const dnevnik = response.body.noteTypes.find((type) => type.value === "DNEVNIK");

  assert.equal(response.status, 200);
  assert.equal(dnevnik.behavior, "diary");
  assert.equal(dnevnik.defaultDisplayMode, "calendar");
  assert.deepEqual(dnevnik.subTypes.map((type) => type.value), ["SLEEP", "ASSORTED"]);
});

test("PUT /api/settings rejects invalid settings payloads", async (t) => {
  const deps = makeSettingsDeps(t);
  const routes = makeRouteCollector(deps.options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/settings",
    body: { colors: {} },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Invalid settings structure: noteTypes array required",
  });
});

test("PUT /api/settings writes settings and syncs modes", async (t) => {
  let allowedTypes = null;
  const deps = makeSettingsDeps(t, {
    modes: {
      DEFAULT: ["quote", "deleted"],
      ALL: ["quote", "deleted"],
      NOTES: ["note"],
      LEGACY: ["deleted"],
    },
    setAllowedTypes(types) {
      allowedTypes = types;
    },
  });
  const routes = makeRouteCollector(deps.options);
  const settings = {
    noteTypes: [{ value: "quote" }, { value: "note" }],
    colors: { button: "#111111" },
  };

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/settings",
    body: settings,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, settings });
  assert.deepEqual(JSON.parse(fs.readFileSync(deps.defaultSettingsFile, "utf8")), settings);
  assert.deepEqual(JSON.parse(fs.readFileSync(deps.modesFile, "utf8")), {
    DEFAULT: ["quote"],
    ALL: ["quote", "note"],
    NOTES: ["note"],
    LEGACY: [],
  });
  assert.deepEqual(allowedTypes, ["quote"]);
});

test("PUT /api/settings moves vault config without erasing activeMode", async (t) => {
  const vaultDir = path.join(makeTempDir(t), "vault");
  fs.mkdirSync(vaultDir, { recursive: true });
  const deps = makeSettingsDeps(t, {
    localConfig: { vaultPath: "", activeMode: "TRAINING" },
  });
  fs.writeFileSync(
    deps.defaultSettingsFile,
    JSON.stringify({ noteTypes: [{ value: "default" }] })
  );
  fs.mkdirSync(deps.defaultPalettesDir, { recursive: true });
  fs.writeFileSync(path.join(deps.defaultPalettesDir, "main.json"), "{}");
  const routes = makeRouteCollector(deps.options);
  const settings = {
    vaultPath: vaultDir,
    noteTypes: [{ value: "note" }],
  };

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/settings",
    body: settings,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(deps.getLocalConfig(), {
    vaultPath: vaultDir,
    activeMode: "TRAINING",
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(vaultDir, "config", "settings.json"), "utf8")), {
    noteTypes: [{ value: "note" }],
  });
  assert.equal(fs.existsSync(path.join(vaultDir, "palettes", "main.json")), true);
  assert.deepEqual(deps.fileStorageCalls, [
    ["setAttachmentsDir", vaultDir],
    ["ensureDirectories"],
  ]);
});

test("cleanupStaleSubtypes resets removed sub-types to ASSORTED when available", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 2 };
    },
  };

  await cleanupStaleSubtypes(
    {
      noteTypes: [
        {
          value: "quote",
          subTypes: [{ value: "BOOK" }, { value: "ASSORTED" }],
        },
      ],
    },
    pool,
    silentLogger
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["ASSORTED", "quote", ["BOOK", "ASSORTED"]]);
});
