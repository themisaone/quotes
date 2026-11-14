"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildImportMap,
  renderIndexHtml,
} = require("../src/frontendAssets");

function makePublicDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-assets-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "js", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app.js"), "import './js/lib/a.js';\n");
  fs.writeFileSync(path.join(dir, "js", "constants.js"), "export const X = 1;\n");
  fs.writeFileSync(path.join(dir, "js", "lib", "a.js"), "export const a = 1;\n");
  fs.writeFileSync(path.join(dir, "js", "lib", "README.md"), "not a module\n");
  fs.writeFileSync(path.join(dir, "style.css"), "body {}\n");
  fs.writeFileSync(
    path.join(dir, "index.html"),
    [
      '<link rel="stylesheet" href="style.css?v=old" />',
      '<link rel="stylesheet" href="missing.css" />',
      '<link rel="stylesheet" href="https://cdn.example/x.css" />',
      "<!-- importmap -->",
    ].join("\n"),
  );
  return dir;
}

test("import map gives each module exactly one versioned URL", (t) => {
  const dir = makePublicDir(t);
  const { imports } = buildImportMap(dir);
  assert.deepEqual(Object.keys(imports), ["/app.js", "/js/constants.js", "/js/lib/a.js"]);
  for (const [key, value] of Object.entries(imports)) {
    assert.match(value, new RegExp(`^${key.replace(/[.]/g, "\\.")}\\?v=[0-9a-z]+$`));
  }
});

test("module version changes when the file changes", (t) => {
  const dir = makePublicDir(t);
  const file = path.join(dir, "js", "lib", "a.js");
  const before = buildImportMap(dir).imports["/js/lib/a.js"];
  const later = new Date(fs.statSync(file).mtimeMs + 5000);
  fs.utimesSync(file, later, later);
  assert.notEqual(buildImportMap(dir).imports["/js/lib/a.js"], before);
});

test("index.html gets the import map and versioned local stylesheets", (t) => {
  const dir = makePublicDir(t);
  const html = renderIndexHtml(dir);
  assert.match(html, /<script type="importmap">[\s\S]*"\/js\/lib\/a\.js"/);
  assert.doesNotMatch(html, /<!-- importmap -->/);
  assert.match(html, /href="style\.css\?v=[0-9a-z]+"/);
  assert.doesNotMatch(html, /\?v=old/);
  assert.match(html, /href="missing\.css"/);
  assert.match(html, /href="https:\/\/cdn\.example\/x\.css"/);
});

test("public JS sources import modules without ?v= suffixes", () => {
  const publicDir = path.join(__dirname, "..", "public");
  const offenders = [];
  for (const file of require("../src/frontendAssets").listModuleFiles(publicDir)) {
    const text = fs.readFileSync(file, "utf8");
    if (/\.m?js\?v=/.test(text)) offenders.push(path.relative(publicDir, file));
  }
  assert.deepEqual(offenders, []);
});
