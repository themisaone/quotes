"use strict";

/**
 * Serves index.html with cache-busting computed from file modification times:
 *  - an import map giving every ES module exactly one versioned URL, so a module
 *    can never load twice under different ?v= suffixes;
 *  - ?v= on the local stylesheet links.
 * Source files import each other by plain relative path, without ?v=.
 */

const fs = require("fs");
const path = require("path");

const IMPORT_MAP_PLACEHOLDER = "<!-- importmap -->";

function fileVersion(file, fsImpl = fs) {
  return Math.floor(fsImpl.statSync(file).mtimeMs).toString(36);
}

function listModuleFiles(publicDir, fsImpl = fs) {
  const files = [];
  const appJs = path.join(publicDir, "app.js");
  if (fsImpl.existsSync(appJs)) files.push(appJs);

  function visit(dir) {
    if (!fsImpl.existsSync(dir)) return;
    for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.m?js$/.test(entry.name)) files.push(full);
    }
  }
  visit(path.join(publicDir, "js"));
  return files.sort();
}

function toUrlPath(publicDir, file) {
  return "/" + path.relative(publicDir, file).split(path.sep).join("/");
}

function buildImportMap(publicDir, fsImpl = fs) {
  const imports = {};
  for (const file of listModuleFiles(publicDir, fsImpl)) {
    const urlPath = toUrlPath(publicDir, file);
    imports[urlPath] = `${urlPath}?v=${fileVersion(file, fsImpl)}`;
  }
  return { imports };
}

function versionStylesheets(html, publicDir, fsImpl = fs) {
  return html.replace(
    /(<link rel="stylesheet" href=")([^"?:]+\.css)(?:\?v=[^"]*)?(")/g,
    (match, start, href, end) => {
      const file = path.join(publicDir, href);
      if (!fsImpl.existsSync(file)) return match;
      return `${start}${href}?v=${fileVersion(file, fsImpl)}${end}`;
    },
  );
}

function renderIndexHtml(publicDir, fsImpl = fs) {
  const html = fsImpl.readFileSync(path.join(publicDir, "index.html"), "utf8");
  const importMap = JSON.stringify(buildImportMap(publicDir, fsImpl), null, 2);
  const mapTag = `<script type="importmap">\n${importMap}\n</script>`;
  return versionStylesheets(html, publicDir, fsImpl).replace(IMPORT_MAP_PLACEHOLDER, () => mapTag);
}

function registerIndexRoute(app, { publicDir, fsImpl = fs } = {}) {
  app.get(["/", "/index.html"], (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.type("html").send(renderIndexHtml(publicDir, fsImpl));
  });
}

module.exports = {
  IMPORT_MAP_PLACEHOLDER,
  buildImportMap,
  listModuleFiles,
  registerIndexRoute,
  renderIndexHtml,
  versionStylesheets,
};
