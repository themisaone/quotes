"use strict";

function registerFullBackupRoutes(app, {
  createBackup,
  logger = console,
} = {}) {
  if (!app) throw new Error("Express app is required");
  if (typeof createBackup !== "function") throw new Error("createBackup is required");

  let backupInProgress = false;

  app.post("/api/backup/full", async (req, res) => {
    if (backupInProgress) {
      return res.status(409).json({
        error: "A full backup is already running in this server process",
      });
    }

    backupInProgress = true;
    try {
      const result = await createBackup({});
      const manifest = result.manifest || {};
      return res.json({
        ok: true,
        archivePath: result.archivePath,
        archiveBytes: result.archiveBytes,
        createdAt: manifest.createdAt,
        backend: manifest.database?.backend,
        attachmentFiles: manifest.attachments?.fileCount || 0,
      });
    } catch (error) {
      logger.error("Full backup failed:", error);
      return res.status(500).json({ error: error.message });
    } finally {
      backupInProgress = false;
    }
  });
}

module.exports = {
  registerFullBackupRoutes,
};
