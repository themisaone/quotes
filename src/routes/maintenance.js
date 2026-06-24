const {
  applyAttachmentRehomePlan,
  buildAttachmentRehomePlan,
} = require("../attachmentRehome");

const ATTACHMENT_REHOME_SELECT_SQL = `SELECT
           na.id AS attachment_id,
           na.note_id,
           na.position,
           na.thumbnail,
           na.attachment_full,
           na.attachment_type,
           na.filename,
           n.note_type
         FROM note_attachments na
         JOIN notes n ON n.id = na.note_id
         WHERE na.attachment_full LIKE 'file:%'
            OR na.thumbnail LIKE 'file:%'
         ORDER BY na.note_id, na.position, na.id`;

function registerMaintenanceRoutes(app, {
  pool,
  fileStorage,
  fsImpl,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!fsImpl) throw new Error("fsImpl is required");

  app.post("/api/maintenance/prune-unused-entities", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const authorsResult = await client.query(`
      DELETE FROM authors a
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)
      RETURNING id
    `);
      const sourcesResult = await client.query(`
      DELETE FROM sources s
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)
      RETURNING id
    `);
      const tagsResult = await client.query(`
      DELETE FROM tags t
      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)
      RETURNING id
    `);

      await client.query("COMMIT");
      res.json({
        ok: true,
        authorsRemoved: authorsResult.rowCount,
        sourcesRemoved: sourcesResult.rowCount,
        tagsRemoved: tagsResult.rowCount,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("prune-unused-entities:", error);
      res.status(500).json({ error: error.message || "Prune failed" });
    } finally {
      client.release();
    }
  });

  app.post("/api/maintenance/rehome-attachments", async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    const attachmentsDir = fileStorage.getAttachmentsDir();

    try {
      if (dryRun) {
        const result = await pool.query(ATTACHMENT_REHOME_SELECT_SQL);
        const plan = buildAttachmentRehomePlan(result.rows, {
          attachmentsDir,
          existsSync: fsImpl.existsSync,
        });

        return res.json({
          ok: true,
          dryRun: true,
          ...plan,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(`${ATTACHMENT_REHOME_SELECT_SQL} FOR UPDATE OF na`);
        const plan = buildAttachmentRehomePlan(result.rows, {
          attachmentsDir,
          existsSync: fsImpl.existsSync,
        });
        const applied = await applyAttachmentRehomePlan(plan, {
          client,
          attachmentsDir,
          fsImpl,
        });
        await client.query("COMMIT");
        return res.json({
          ok: true,
          dryRun: false,
          ...plan,
          applied,
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error("Attachment rehome failed:", error);
      res.status(500).json({ error: "Failed to rehome attachments" });
    }
  });
}

module.exports = {
  ATTACHMENT_REHOME_SELECT_SQL,
  registerMaintenanceRoutes,
};
