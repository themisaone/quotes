const fs = require("fs");
const path = require("path");
const { getAllowedTypes, loadModesFromFile } = require("../modeConfig");

function createDefaultSettings() {
  return {
    noteTypes: [
      {
        value: "quote",
        label: "Quotes",
        icon: "💬",
        behavior: "quote",
        core: true,
        subTypes: [
          { value: "BOOK", label: "Book", icon: "📖" },
          { value: "MOVIE-TV", label: "Movies & TV", icon: "🎬" },
          { value: "ASSORTED", label: "Assorted", icon: "📝" },
        ],
      },
      { value: "note", label: "Notes", icon: "📝", behavior: "generic", core: true },
      { value: "historical", label: "Historical Notes", icon: "📜", behavior: "generic", core: true },
      {
        value: "training",
        label: "Training",
        icon: "💪",
        behavior: "training",
        core: true,
        subTypes: [
          { value: "WEIGHTS", label: "Weights", icon: "🏋️" },
          { value: "CARDIO", label: "Cardio", icon: "🏃" },
        ],
      },
      { value: "puzzle", label: "Puzzles", icon: "🧩", behavior: "generic", core: true },
      {
        value: "job",
        label: "Job Notes",
        icon: "📌",
        behavior: "generic",
        core: true,
        defaultDisplayMode: "list-pane",
      },
      {
        value: "tegneserie",
        label: "Tegneserier",
        icon: "💥",
        behavior: "generic",
        core: true,
        defaultDisplayMode: "cards",
      },
      {
        value: "DNEVNIK",
        label: "Dnevnik",
        icon: "📌",
        behavior: "diary",
        core: true,
        subTypes: [
          { value: "SLEEP", label: "Sleep", icon: "🌙" },
          { value: "ASSORTED", label: "Assorted", icon: "📝", isDefault: true },
        ],
        defaultDisplayMode: "calendar",
      },
    ],
    downscaleQuoteImages: true,
    externalStorageThreshold: 1,
    compactMode: false,
    enableTagOperations: true,
    enableQuoteMetaSearches: false,
    displayQuotesByRealSize: false,
    showLongQuotesExpanded: false,
    displayScoreInCards: false,
    enableWordWrap: true,
    wordWrapChars: 66,
    colors: {
      button: "#1e40af",
      header: "#166534",
      tag: "#2d6a4f",
      delete: "#ef4444",
      cancel: "#6b7280",
      activeCounter: "#dc2626",
      totalCounter: "#047857",
      menu: "#2c3e50",
      appBg: "#f8fafc",
      modalFooter: "#fde68a",
    },
  };
}

function syncModesForSettings(settings, {
  modesFile,
  modesState,
  activeModeName,
  setAllowedTypes,
} = {}) {
  const currentTypeValues = settings.noteTypes.map((t) => t.value);
  const modesData = loadModesFromFile(modesFile);

  if (!modesData.ALL) modesData.ALL = [];
  for (const val of currentTypeValues) {
    if (!modesData.ALL.includes(val)) modesData.ALL.push(val);
  }

  for (const modeName of Object.keys(modesData)) {
    modesData[modeName] = modesData[modeName].filter((v) => currentTypeValues.includes(v));
  }

  fs.writeFileSync(modesFile, JSON.stringify(modesData, null, 2));

  if (modesState) {
    for (const [k, v] of Object.entries(modesData)) modesState[k] = v;
    for (const k of Object.keys(modesState)) {
      if (!modesData[k]) delete modesState[k];
    }
  }

  if (setAllowedTypes && modesState && activeModeName) {
    setAllowedTypes(getAllowedTypes(modesState, activeModeName));
  }

  return modesData;
}

async function cleanupStaleSubtypes(settings, pool, logger = console) {
  for (const nt of settings.noteTypes) {
    if (!Array.isArray(nt.subTypes) || nt.subTypes.length === 0) continue;
    const validValues = nt.subTypes.map((s) => s.value.toUpperCase());
    const fallback = validValues.includes("ASSORTED") ? "ASSORTED" : null;
    const updated = await pool.query(
      `UPDATE notes
          SET type = $1
        WHERE note_type = $2
          AND type IS NOT NULL
          AND UPPER(type) != ALL($3::text[])
        RETURNING id, type`,
      [fallback, nt.value, validValues]
    );
    if (updated.rowCount > 0) {
      logger.log(
        `⚙️  Reset ${updated.rowCount} note(s) of type "${nt.value}" to "${fallback ?? "NULL"}" (sub-type removed from settings)`
      );
    }
  }
}

function copyPalettes(defaultPalettesDir, destPalettes) {
  fs.mkdirSync(destPalettes, { recursive: true });
  if (!fs.existsSync(defaultPalettesDir)) return;

  for (const f of fs.readdirSync(defaultPalettesDir)) {
    if (!f.endsWith(".json")) continue;
    const dest = path.join(destPalettes, f);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(defaultPalettesDir, f), dest);
    }
  }
}

function registerSettingsRoutes(app, {
  pool,
  fileStorage,
  getSettingsFile,
  readLocalConfig,
  writeLocalConfig,
  defaultSettingsFile,
  defaultPalettesDir,
  modesFile,
  modesState,
  getActiveModeName,
  setAllowedTypes,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");

  app.get("/api/settings", (req, res) => {
    try {
      const defaultSettings = createDefaultSettings();
      const settingsFile = getSettingsFile();
      if (fs.existsSync(settingsFile)) {
        return res.json(JSON.parse(fs.readFileSync(settingsFile, "utf8")));
      }

      const { vaultPath } = readLocalConfig();
      const vaultRoot = vaultPath && String(vaultPath).trim();
      if (vaultRoot && !fs.existsSync(vaultRoot)) {
        if (fs.existsSync(defaultSettingsFile)) {
          return res.json(JSON.parse(fs.readFileSync(defaultSettingsFile, "utf8")));
        }
        return res.json(defaultSettings);
      }

      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
      res.json(defaultSettings);
    } catch (error) {
      logger.error("Error reading settings:", error);
      res.status(500).json({ error: "Failed to read settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const settings = { ...(req.body || {}) };

      if (!settings.noteTypes || !Array.isArray(settings.noteTypes)) {
        return res.status(400).json({ error: "Invalid settings structure: noteTypes array required" });
      }

      if (settings.vaultPath !== undefined) {
        const oldLocalConfig = readLocalConfig();
        const oldVaultPath = oldLocalConfig.vaultPath || "";
        const newVaultPath = settings.vaultPath || "";
        if (newVaultPath !== oldVaultPath) {
          writeLocalConfig({ ...oldLocalConfig, vaultPath: newVaultPath });
          if (newVaultPath) {
            const destSettings = path.join(newVaultPath, "config", "settings.json");
            fs.mkdirSync(path.dirname(destSettings), { recursive: true });
            if (!fs.existsSync(destSettings) && fs.existsSync(defaultSettingsFile)) {
              fs.copyFileSync(defaultSettingsFile, destSettings);
            }
            copyPalettes(defaultPalettesDir, path.join(newVaultPath, "palettes"));
          }
          fileStorage.setAttachmentsDir(newVaultPath);
          fileStorage.ensureDirectories();
        }
        delete settings.vaultPath;
      }

      const settingsFile = getSettingsFile();
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

      try {
        syncModesForSettings(settings, {
          modesFile,
          modesState,
          activeModeName: getActiveModeName?.(),
          setAllowedTypes,
        });
      } catch (modeErr) {
        logger.warn("⚠️  Could not sync modes.json:", modeErr.message);
      }

      try {
        await cleanupStaleSubtypes(settings, pool, logger);
      } catch (cleanupErr) {
        logger.warn("⚠️  Could not clean up stale sub-types in notes:", cleanupErr.message);
      }

      res.json({ success: true, settings });
    } catch (error) {
      logger.error("Error saving settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });
}

module.exports = {
  createDefaultSettings,
  syncModesForSettings,
  cleanupStaleSubtypes,
  registerSettingsRoutes,
};
