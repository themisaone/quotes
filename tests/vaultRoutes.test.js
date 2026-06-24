const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectDirectoryStats,
  copyDirectoryContents,
  getCopyDestinationState,
  readSettingsSummary,
  registerVaultRoutes,
} = require("../src/routes/vault");

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-vault-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
  };

  registerVaultRoutes(app, options);
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

test("collectDirectoryStats counts nested files and bytes", (t) => {
  const dir = makeTempDir(t);
  fs.mkdirSync(path.join(dir, "nested"));
  fs.writeFileSync(path.join(dir, "one.txt"), "12345");
  fs.writeFileSync(path.join(dir, "nested", "two.txt"), "123");

  assert.deepEqual(collectDirectoryStats(dir), {
    totalFiles: 2,
    totalBytes: 8,
  });
});

test("readSettingsSummary extracts note type metadata", (t) => {
  const dir = makeTempDir(t);
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({ noteTypes: [{ value: "quote" }, { value: "note" }] })
  );

  assert.deepEqual(readSettingsSummary(settingsFile), {
    settingsNoteTypeCount: 2,
    settingsNoteTypeValues: ["quote", "note"],
    settingsParseError: null,
  });
});

test("readSettingsSummary reports parse errors without throwing", (t) => {
  const dir = makeTempDir(t);
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(settingsFile, "{bad json");

  const summary = readSettingsSummary(settingsFile);

  assert.equal(summary.settingsNoteTypeCount, null);
  assert.equal(summary.settingsNoteTypeValues, null);
  assert.equal(typeof summary.settingsParseError, "string");
});

test("GET /api/vault/info returns vault, settings, palette, and file stats", async (t) => {
  const vaultRoot = makeTempDir(t);
  const attachmentsDir = path.join(vaultRoot, "attachments");
  const settingsFile = path.join(vaultRoot, "config", "settings.json");
  const palettesDir = path.join(vaultRoot, "palettes");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.mkdirSync(path.join(attachmentsDir, "note"), { recursive: true });
  fs.mkdirSync(palettesDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentsDir, "note", "1.txt"), "1234");
  fs.writeFileSync(settingsFile, JSON.stringify({ noteTypes: [{ value: "note" }] }));

  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => attachmentsDir,
    },
    readLocalConfig: () => ({ vaultPath: vaultRoot }),
    getSettingsFile: () => settingsFile,
    getPalettesDir: () => palettesDir,
  });

  const response = await invoke(routes, { routePath: "/api/vault/info" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    vaultPath: vaultRoot,
    vaultRootExists: true,
    attachmentsDir,
    settingsFile,
    settingsFileExists: true,
    settingsNoteTypeCount: 1,
    settingsNoteTypeValues: ["note"],
    settingsParseError: null,
    palettesDir,
    isDefault: false,
    totalFiles: 1,
    totalSizeMB: "0.0",
  });
});

test("POST /api/vault/validate accepts default storage", async (t) => {
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => "/default/attachments",
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/validate",
    body: { vaultPath: "" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    valid: true,
    isDefault: true,
    message: "Will use default: /default/attachments",
  });
});

test("POST /api/vault/validate creates missing writable paths", async (t) => {
  const dir = path.join(makeTempDir(t), "new-vault");
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => "/default/attachments",
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/validate",
    body: { vaultPath: ` ${dir} ` },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    valid: true,
    message: "Path is accessible ✓",
  });
  assert.equal(fs.existsSync(dir), true);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test("getCopyDestinationState identifies same and nested destinations", (t) => {
  const sourceDir = path.join(makeTempDir(t), "attachments");
  const nestedDest = path.join(sourceDir, "nested-copy");

  assert.deepEqual(getCopyDestinationState(sourceDir, `${sourceDir}${path.sep}`), {
    sameLocation: true,
  });
  assert.throws(
    () => getCopyDestinationState(sourceDir, nestedDest),
    /Destination cannot be inside source directory/
  );
  assert.deepEqual(getCopyDestinationState(sourceDir, path.join(makeTempDir(t), "copy")), {
    sameLocation: false,
  });
});

test("copyDirectoryContents recursively copies and overwrites files", (t) => {
  const sourceDir = path.join(makeTempDir(t), "source");
  const destinationDir = path.join(makeTempDir(t), "destination");
  fs.mkdirSync(path.join(sourceDir, "note"), { recursive: true });
  fs.mkdirSync(path.join(destinationDir, "note"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "root.txt"), "root");
  fs.writeFileSync(path.join(sourceDir, "note", "one.txt"), "new");
  fs.writeFileSync(path.join(destinationDir, "note", "one.txt"), "old");

  const result = copyDirectoryContents(sourceDir, destinationDir);

  assert.deepEqual(result, { moved: 2, errors: [] });
  assert.equal(fs.readFileSync(path.join(destinationDir, "root.txt"), "utf8"), "root");
  assert.equal(fs.readFileSync(path.join(destinationDir, "note", "one.txt"), "utf8"), "new");
});

test("copyDirectoryContents records partial copy errors and continues", () => {
  const fakeFs = {
    existsSync(value) {
      return value === "/source" || value === "/source/good.txt" || value === "/source/bad.txt";
    },
    mkdirSync() {},
    readdirSync(value) {
      assert.equal(value, "/source");
      return ["good.txt", "bad.txt"];
    },
    statSync(value) {
      return { isDirectory: () => false, value };
    },
    copyFileSync(from) {
      if (from === "/source/bad.txt") {
        throw new Error("copy failed");
      }
    },
  };

  const result = copyDirectoryContents("/source", "/dest", { fsImpl: fakeFs, pathImpl: path });

  assert.deepEqual(result, {
    moved: 1,
    errors: ["bad.txt: copy failed"],
  });
});

test("POST /api/vault/move rejects missing paths", async (t) => {
  const sourceDir = path.join(makeTempDir(t), "source");
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => sourceDir,
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/move",
    body: { newPath: "" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "newPath required" });
});

test("POST /api/vault/move returns success for the current attachment path", async (t) => {
  const sourceDir = path.join(makeTempDir(t), "source");
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => sourceDir,
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/move",
    body: { newPath: `${sourceDir}${path.sep}` },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    moved: 0,
    message: "Already at that path",
  });
});

test("POST /api/vault/move copies attachment files recursively", async (t) => {
  const sourceDir = path.join(makeTempDir(t), "source");
  const destinationDir = path.join(makeTempDir(t), "destination");
  fs.mkdirSync(path.join(sourceDir, "note"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "note", "1.txt"), "hello");
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => sourceDir,
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/move",
    body: { newPath: destinationDir },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    moved: 1,
    errors: [],
    message: `Copied 1 file(s) to ${destinationDir}`,
  });
  assert.equal(fs.readFileSync(path.join(destinationDir, "note", "1.txt"), "utf8"), "hello");
});

test("POST /api/vault/move rejects destinations inside the source directory", async (t) => {
  const sourceDir = path.join(makeTempDir(t), "source");
  const destinationDir = path.join(sourceDir, "copy");
  const routes = makeRouteCollector({
    fileStorage: {
      DEFAULT_ATTACHMENTS_DIR: "/default/attachments",
      getAttachmentsDir: () => sourceDir,
    },
    readLocalConfig: () => ({}),
    getSettingsFile: () => "/default/settings.json",
    getPalettesDir: () => "/default/palettes",
  });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/vault/move",
    body: { newPath: destinationDir },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Destination cannot be inside source directory",
  });
});
