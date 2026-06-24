const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_MODES,
  normalizeModeName,
  loadModesFromFile,
  resolveInitialMode,
  getAllowedTypes,
} = require("../src/modeConfig");

test("normalizeModeName trims and uppercases mode names", () => {
  assert.equal(normalizeModeName(" training "), "TRAINING");
  assert.equal(normalizeModeName(null), "");
});

test("resolveInitialMode prioritizes env mode over local config", () => {
  assert.equal(
    resolveInitialMode({
      envMode: "quotes",
      localConfig: { activeMode: "training" },
    }),
    "QUOTES"
  );
});

test("resolveInitialMode uses local activeMode when env mode is absent", () => {
  assert.equal(
    resolveInitialMode({ localConfig: { activeMode: "notes" } }),
    "NOTES"
  );
});

test("resolveInitialMode falls back to DEFAULT", () => {
  assert.equal(resolveInitialMode(), "DEFAULT");
});

test("loadModesFromFile loads configured modes or falls back to defaults", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-modes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const modesFile = path.join(dir, "modes.json");
  const modes = { CUSTOM: ["note"] };
  fs.writeFileSync(modesFile, JSON.stringify(modes));

  assert.deepEqual(loadModesFromFile(modesFile), modes);
  assert.deepEqual(loadModesFromFile(path.join(dir, "missing.json")), DEFAULT_MODES);
});

test("getAllowedTypes returns selected mode types or the default fallback", () => {
  const modes = { DEFAULT: ["quote"], TRAINING: ["training"] };

  assert.deepEqual(getAllowedTypes(modes, "TRAINING"), ["training"]);
  assert.deepEqual(getAllowedTypes(modes, "UNKNOWN"), ["quote"]);
  assert.deepEqual(getAllowedTypes({ CUSTOM: ["note"] }, "UNKNOWN"), ["note"]);
});
