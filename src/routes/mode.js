function registerModeRoutes(app, {
  getModeState,
  applyMode,
  readLocalConfig,
  writeLocalConfig,
  modeLocked = false,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!getModeState) throw new Error("getModeState is required");
  if (!applyMode) throw new Error("applyMode is required");

  app.get("/api/mode", (req, res) => {
    const { modeName, allowedTypes, modes } = getModeState();
    res.json({
      mode: modeName,
      allowedTypes,
      allModes: modes,
      modeLocked,
    });
  });

  app.put("/api/mode", (req, res) => {
    const { mode } = req.body || {};
    if (!mode) return res.status(400).json({ error: "mode required" });

    const { modes } = getModeState();
    if (!applyMode(mode)) {
      return res.status(400).json({
        error: `Unknown mode "${mode}". Available: ${Object.keys(modes).join(", ")}`,
      });
    }

    const { modeName, allowedTypes } = getModeState();
    try {
      const local = readLocalConfig ? readLocalConfig() : {};
      writeLocalConfig?.({ ...local, activeMode: modeName });
    } catch (e) {
      logger.warn("Could not persist mode:", e.message);
    }

    logger.log(`🎛️  Mode switched to: ${modeName} — types: [${allowedTypes.join(", ")}]`);
    res.json({ mode: modeName, allowedTypes });
  });
}

module.exports = {
  registerModeRoutes,
};
