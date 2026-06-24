const fs = require("fs");
const path = require("path");

function getPaletteFilePath(palettesDir, name) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const error = new Error("Palette name required");
    error.status = 400;
    throw error;
  }
  if (/[\\/]/.test(trimmedName)) {
    const error = new Error("Invalid palette name");
    error.status = 400;
    throw error;
  }

  const dir = path.resolve(palettesDir);
  const file = path.resolve(dir, `${trimmedName}.json`);
  if (!file.startsWith(`${dir}${path.sep}`)) {
    const error = new Error("Invalid palette name");
    error.status = 400;
    throw error;
  }
  return file;
}

function registerPaletteRoutes(app, { getPalettesDir, logger = console }) {
  if (!app) throw new Error("Express app is required");
  if (!getPalettesDir) throw new Error("getPalettesDir is required");

  app.get("/api/palettes", (req, res) => {
    try {
      const dir = getPalettesDir();
      if (!fs.existsSync(dir)) return res.json([]);
      const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""))
        .sort();
      res.json(files);
    } catch (e) {
      logger.error("GET /api/palettes:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/palettes/:name", (req, res) => {
    try {
      const file = getPaletteFilePath(getPalettesDir(), req.params.name);
      if (!fs.existsSync(file)) return res.status(404).json({ error: "Palette not found" });
      res.json(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {
      logger.error("GET /api/palettes/:name:", e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.put("/api/palettes/:name", (req, res) => {
    try {
      const dir = getPalettesDir();
      fs.mkdirSync(dir, { recursive: true });
      const file = getPaletteFilePath(dir, req.params.name);
      fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (e) {
      logger.error("PUT /api/palettes/:name:", e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.delete("/api/palettes/:name", (req, res) => {
    try {
      const file = getPaletteFilePath(getPalettesDir(), req.params.name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      res.json({ success: true });
    } catch (e) {
      logger.error("DELETE /api/palettes/:name:", e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = {
  getPaletteFilePath,
  registerPaletteRoutes,
};
