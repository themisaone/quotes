const fs = require("fs");
const path = require("path");

function collectDirectoryStats(rootDir) {
  let totalFiles = 0;
  let totalBytes = 0;

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        totalFiles++;
        totalBytes += stat.size;
      }
    }
  }

  walk(rootDir);
  return { totalFiles, totalBytes };
}

function readSettingsSummary(settingsFile) {
  let settingsNoteTypeCount = null;
  let settingsNoteTypeValues = null;
  let settingsParseError = null;

  try {
    if (fs.existsSync(settingsFile)) {
      const raw = fs.readFileSync(settingsFile, "utf8");
      const parsed = JSON.parse(raw);
      settingsNoteTypeCount = Array.isArray(parsed.noteTypes) ? parsed.noteTypes.length : 0;
      settingsNoteTypeValues = Array.isArray(parsed.noteTypes)
        ? parsed.noteTypes.map((t) => (t && t.value) || null).filter(Boolean)
        : null;
    }
  } catch (e) {
    settingsNoteTypeCount = null;
    settingsNoteTypeValues = null;
    settingsParseError = e.message;
  }

  return {
    settingsNoteTypeCount,
    settingsNoteTypeValues,
    settingsParseError,
  };
}

function getCopyDestinationState(sourceDir, destinationDir) {
  const sourcePath = path.resolve(sourceDir);
  const destinationPath = path.resolve(destinationDir);

  if (sourcePath === destinationPath) {
    return { sameLocation: true };
  }

  const relative = path.relative(sourcePath, destinationPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    const error = new Error("Destination cannot be inside source directory");
    error.status = 400;
    throw error;
  }

  return { sameLocation: false };
}

function copyDirectoryContents(sourceDir, destinationDir, { fsImpl = fs, pathImpl = path } = {}) {
  let moved = 0;
  const errors = [];

  function copyDir(from, to, relativeBase = "") {
    if (!fsImpl.existsSync(from)) return;
    fsImpl.mkdirSync(to, { recursive: true });

    for (const entry of fsImpl.readdirSync(from)) {
      const sourcePath = pathImpl.join(from, entry);
      const destinationPath = pathImpl.join(to, entry);
      const relativePath = relativeBase ? pathImpl.join(relativeBase, entry) : entry;

      if (fsImpl.statSync(sourcePath).isDirectory()) {
        copyDir(sourcePath, destinationPath, relativePath);
      } else {
        try {
          fsImpl.copyFileSync(sourcePath, destinationPath);
          moved++;
        } catch (e) {
          errors.push(`${relativePath}: ${e.message}`);
        }
      }
    }
  }

  copyDir(sourceDir, destinationDir);
  return { moved, errors };
}

function registerVaultRoutes(app, {
  fileStorage,
  readLocalConfig,
  getSettingsFile,
  getPalettesDir,
}) {
  if (!app) throw new Error("Express app is required");
  if (!fileStorage) throw new Error("fileStorage is required");

  app.get("/api/vault/info", (req, res) => {
    const attachDir = fileStorage.getAttachmentsDir();
    const { vaultPath } = readLocalConfig();
    try {
      const { totalFiles, totalBytes } = collectDirectoryStats(attachDir);
      const settingsFile = getSettingsFile();
      const vaultRoot = vaultPath && String(vaultPath).trim();
      const settingsSummary = readSettingsSummary(settingsFile);

      res.json({
        vaultPath: vaultPath || "",
        vaultRootExists: vaultRoot ? fs.existsSync(vaultRoot) : null,
        attachmentsDir: attachDir,
        settingsFile,
        settingsFileExists: fs.existsSync(settingsFile),
        ...settingsSummary,
        palettesDir: getPalettesDir(),
        isDefault: !vaultPath,
        totalFiles,
        totalSizeMB: (totalBytes / 1024 / 1024).toFixed(1),
      });
    } catch (e) {
      res.json({ vaultPath: vaultPath || "", error: e.message });
    }
  });

  app.post("/api/vault/validate", (req, res) => {
    const { vaultPath } = req.body || {};
    if (!vaultPath || !vaultPath.trim()) {
      return res.json({
        valid: true,
        isDefault: true,
        message: `Will use default: ${fileStorage.DEFAULT_ATTACHMENTS_DIR}`,
      });
    }

    const targetPath = vaultPath.trim();
    let testFile = null;
    try {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      testFile = path.join(targetPath, `.write-test-${process.pid}-${Date.now()}`);
      fs.writeFileSync(testFile, "ok", { flag: "wx" });
      fs.unlinkSync(testFile);
      res.json({ valid: true, message: "Path is accessible ✓" });
    } catch (e) {
      if (testFile && fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch (_) {}
      }
      res.json({ valid: false, message: `Cannot access path: ${e.message}` });
    }
  });

  app.post("/api/vault/move", async (req, res) => {
    const { newPath } = req.body || {};
    if (!newPath || !newPath.trim()) {
      return res.status(400).json({ error: "newPath required" });
    }

    const destinationDir = newPath.trim();
    const sourceDir = fileStorage.getAttachmentsDir();

    try {
      const { sameLocation } = getCopyDestinationState(sourceDir, destinationDir);
      if (sameLocation) {
        return res.json({ success: true, moved: 0, message: "Already at that path" });
      }

      const { moved, errors } = copyDirectoryContents(sourceDir, destinationDir);
      res.json({
        success: true,
        moved,
        errors,
        message: `Copied ${moved} file(s) to ${destinationDir}`,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = {
  collectDirectoryStats,
  copyDirectoryContents,
  getCopyDestinationState,
  readSettingsSummary,
  registerVaultRoutes,
};
