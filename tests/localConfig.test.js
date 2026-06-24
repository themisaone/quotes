const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  readLocalConfig,
  writeLocalConfig,
} = require("../src/localConfig");

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-local-config-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("readLocalConfig returns empty config when file is missing or invalid", (t) => {
  const dir = makeTempDir(t);
  const localFile = path.join(dir, "config", "local.json");

  assert.deepEqual(readLocalConfig({ localFile }), {});

  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  fs.writeFileSync(localFile, "{invalid");
  assert.deepEqual(readLocalConfig({ localFile }), {});
});

test("writeLocalConfig creates parent directories and writes JSON", (t) => {
  const dir = makeTempDir(t);
  const localFile = path.join(dir, "config", "local.json");

  writeLocalConfig(
    { vaultPath: "/vault", activeMode: "ALL", sqlite: { enabled: true } },
    { localFile },
  );

  assert.deepEqual(readLocalConfig({ localFile }), {
    vaultPath: "/vault",
    activeMode: "ALL",
    sqlite: { enabled: true },
  });
});
