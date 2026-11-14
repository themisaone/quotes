const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  THEME_TOKENS_ROUTE,
  readThemeTokens,
  registerThemeOverrideRoute,
} = require("../src/themeOverrides");

const silentLogger = { log() {}, error() {} };
const TEMPLATE_FILE = path.join(__dirname, "../config/theme-tokens.template.css");

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-theme-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function invokeRoute(themeDir, templateFile) {
  let handler;
  const app = { get(routePath, fn) { if (routePath === THEME_TOKENS_ROUTE) handler = fn; } };
  registerThemeOverrideRoute(app, { getThemeDir: () => themeDir, templateFile, logger: silentLogger });
  assert.equal(typeof handler, "function");

  const res = {
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    send(body) { this.body = body; },
  };
  handler({}, res);
  return res;
}

test("seeds the commented template on first request and serves it as uncached CSS", (t) => {
  const themeDir = path.join(makeTempDir(t), "theme");
  const res = invokeRoute(themeDir, TEMPLATE_FILE);

  assert.equal(res.body, fs.readFileSync(TEMPLATE_FILE, "utf8"));
  assert.equal(fs.readFileSync(path.join(themeDir, "tokens.css"), "utf8"), res.body);
  assert.match(res.headers["content-type"], /^text\/css/);
  assert.match(res.headers["cache-control"], /no-cache/);
});

test("serves the user's edits instead of re-seeding", (t) => {
  const themeDir = makeTempDir(t);
  fs.writeFileSync(path.join(themeDir, "tokens.css"), ":root { --radius-lg: 0; }");

  assert.equal(invokeRoute(themeDir, TEMPLATE_FILE).body, ":root { --radius-lg: 0; }");
});

test("falls back to empty CSS when there is neither a file nor a template", (t) => {
  const themeDir = makeTempDir(t);

  assert.equal(
    readThemeTokens({ themeDir, templateFile: path.join(themeDir, "missing.css"), logger: silentLogger }),
    ""
  );
});

test("template only contains commented-out declarations", () => {
  const withoutComments = fs.readFileSync(TEMPLATE_FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(withoutComments, /--[\w-]+\s*:/);
});
