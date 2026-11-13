const fs = require("fs");
const path = require("path");

function getPresentationFilePath(presentationsDir, name) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const error = new Error("Presentation id required");
    error.status = 400;
    throw error;
  }
  if (/[\\/]/.test(trimmedName)) {
    const error = new Error("Invalid presentation id");
    error.status = 400;
    throw error;
  }

  const dir = path.resolve(presentationsDir);
  const file = path.resolve(dir, `${trimmedName}.json`);
  if (!file.startsWith(`${dir}${path.sep}`)) {
    const error = new Error("Invalid presentation id");
    error.status = 400;
    throw error;
  }
  return file;
}

function readPresentationManifest(presentationsDir, name) {
  const file = getPresentationFilePath(presentationsDir, name);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const id = String(parsed.id || name).trim();
  return {
    id,
    label: String(parsed.label || id),
    description: String(parsed.description || ""),
  };
}

function listPresentationManifests(presentationsDir) {
  if (!fs.existsSync(presentationsDir)) return [];
  return fs.readdirSync(presentationsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .map((name) => readPresentationManifest(presentationsDir, name))
    .filter(Boolean);
}

function copyJsonDir(defaultDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(defaultDir)) return;

  for (const f of fs.readdirSync(defaultDir)) {
    if (!f.endsWith(".json")) continue;
    const dest = path.join(destDir, f);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(defaultDir, f), dest);
    }
  }
}

function resolvePresentationManifests(getCardPresentationsDir, defaultCardPresentationsDir) {
  const dir = getCardPresentationsDir();
  let manifests = listPresentationManifests(dir);

  if (
    manifests.length === 0
    && defaultCardPresentationsDir
    && path.resolve(defaultCardPresentationsDir) !== path.resolve(dir)
  ) {
    copyJsonDir(defaultCardPresentationsDir, dir);
    manifests = listPresentationManifests(dir);
  }

  if (manifests.length === 0 && defaultCardPresentationsDir) {
    manifests = listPresentationManifests(defaultCardPresentationsDir);
  }

  return { dir, manifests };
}

function registerCardPresentationRoutes(app, {
  getCardPresentationsDir,
  defaultCardPresentationsDir,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!getCardPresentationsDir) throw new Error("getCardPresentationsDir is required");

  app.get("/api/card-presentations", (req, res) => {
    try {
      const { manifests } = resolvePresentationManifests(
        getCardPresentationsDir,
        defaultCardPresentationsDir
      );
      res.json(manifests);
    } catch (e) {
      logger.error("GET /api/card-presentations:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/card-presentations/:id", (req, res) => {
    try {
      const { dir, manifests } = resolvePresentationManifests(
        getCardPresentationsDir,
        defaultCardPresentationsDir
      );
      let manifest = readPresentationManifest(dir, req.params.id);
      if (!manifest && defaultCardPresentationsDir) {
        manifest = readPresentationManifest(defaultCardPresentationsDir, req.params.id);
      }
      if (!manifest) {
        manifest = manifests.find((entry) => entry.id === req.params.id) || null;
      }
      if (!manifest) return res.status(404).json({ error: "Presentation not found" });
      res.json(manifest);
    } catch (e) {
      logger.error("GET /api/card-presentations/:id:", e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = {
  copyJsonDir,
  getPresentationFilePath,
  listPresentationManifests,
  readPresentationManifest,
  resolvePresentationManifests,
  registerCardPresentationRoutes,
};
