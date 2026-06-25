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

function isSqlitePool(pool) {
  return pool?.dialect === "sqlite";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function readJsonFile(fsImpl, file) {
  if (!file) return { exists: false, data: null, error: null };
  try {
    if (!fsImpl.existsSync(file)) return { exists: false, data: null, error: null };
    return {
      exists: true,
      data: JSON.parse(fsImpl.readFileSync(file, "utf8")),
      error: null,
    };
  } catch (error) {
    return { exists: true, data: null, error: error.message };
  }
}

function collectSettingsTypes(settings) {
  return uniqueSorted(
    Array.isArray(settings?.noteTypes)
      ? settings.noteTypes.map((type) => type?.value)
      : []
  );
}

function collectModeTypes(modes) {
  return uniqueSorted(
    modes && typeof modes === "object" && !Array.isArray(modes)
      ? Object.values(modes).flat()
      : []
  );
}

function diffValues(source, target) {
  const targetSet = new Set(target);
  return source.filter((value) => !targetSet.has(value));
}

async function buildVaultHealthReport({
  pool,
  fileStorage,
  fsImpl,
  getSettingsFile,
  modesFile,
  modesState,
  readLocalConfig,
} = {}) {
  const settingsFile = getSettingsFile?.() || null;
  const settingsJson = readJsonFile(fsImpl, settingsFile);
  const settingsTypes = collectSettingsTypes(settingsJson.data);

  const modesJson = modesState
    ? { exists: true, data: modesState, error: null }
    : readJsonFile(fsImpl, modesFile);
  const modeTypes = collectModeTypes(modesJson.data);

  const countsResult = await pool.query(
    `SELECT COALESCE(note_type, 'quote') AS note_type, COUNT(*) AS count
       FROM notes
      GROUP BY COALESCE(note_type, 'quote')
      ORDER BY note_type`
  );
  const countsByNoteType = countsResult.rows.map((row) => ({
    noteType: row.note_type || "quote",
    count: Number(row.count || 0),
  }));
  const dbTypes = uniqueSorted(countsByNoteType.map((row) => row.noteType));

  const mismatches = {
    modesMissingFromSettings: diffValues(modeTypes, settingsTypes),
    dbMissingFromSettings: diffValues(dbTypes, settingsTypes),
    settingsMissingFromModes: diffValues(settingsTypes, modeTypes),
    dbMissingFromModes: diffValues(dbTypes, modeTypes),
  };

  const issues = [];
  if (!settingsFile) {
    issues.push({ severity: "error", code: "settings_file_unknown", message: "Active settings file path is not available." });
  } else if (!settingsJson.exists) {
    issues.push({ severity: "error", code: "settings_file_missing", message: "Active settings file does not exist." });
  } else if (settingsJson.error) {
    issues.push({ severity: "error", code: "settings_parse_error", message: settingsJson.error });
  }

  if (!modesState && modesFile && !modesJson.exists) {
    issues.push({ severity: "error", code: "modes_file_missing", message: "config/modes.json does not exist." });
  } else if (modesJson.error) {
    issues.push({ severity: "error", code: "modes_parse_error", message: modesJson.error });
  }

  if (mismatches.modesMissingFromSettings.length > 0) {
    issues.push({
      severity: "warning",
      code: "modes_missing_from_settings",
      message: `Mode types missing from active settings: ${mismatches.modesMissingFromSettings.join(", ")}`,
    });
  }
  if (mismatches.dbMissingFromSettings.length > 0) {
    issues.push({
      severity: "error",
      code: "db_missing_from_settings",
      message: `Database note types missing from active settings: ${mismatches.dbMissingFromSettings.join(", ")}`,
    });
  }
  if (mismatches.settingsMissingFromModes.length > 0) {
    issues.push({
      severity: "warning",
      code: "settings_missing_from_modes",
      message: `Settings note types missing from modes: ${mismatches.settingsMissingFromModes.join(", ")}`,
    });
  }
  if (mismatches.dbMissingFromModes.length > 0) {
    issues.push({
      severity: "error",
      code: "db_missing_from_modes",
      message: `Database note types missing from modes: ${mismatches.dbMissingFromModes.join(", ")}`,
    });
  }

  const status = issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.length > 0
      ? "warning"
      : "ok";
  const localConfig = readLocalConfig?.() || {};

  return {
    ok: status === "ok",
    status,
    backend: pool.dialect || "postgres",
    sqliteFile: pool.filename || null,
    vaultPath: localConfig.vaultPath || null,
    settingsFile,
    settingsFileExists: settingsJson.exists,
    settingsParseError: settingsJson.error,
    modesFile: modesFile || null,
    modesFileExists: modesJson.exists,
    modesParseError: modesJson.error,
    attachmentsDir: fileStorage.getAttachmentsDir(),
    configuredTypes: {
      settings: settingsTypes,
      modes: modeTypes,
      db: dbTypes,
    },
    countsByNoteType,
    mismatches,
    issues,
  };
}

function getPruneUnusedEntityQueries(pool) {
  if (isSqlitePool(pool)) {
    return {
      authors: `
      DELETE FROM authors
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = authors.id)
      RETURNING id
    `,
      sources: `
      DELETE FROM sources
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = sources.id)
      RETURNING id
    `,
      tags: `
      DELETE FROM tags
      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = tags.id)
      RETURNING id
    `,
    };
  }

  return {
    authors: `
      DELETE FROM authors a
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)
      RETURNING id
    `,
    sources: `
      DELETE FROM sources s
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)
      RETURNING id
    `,
    tags: `
      DELETE FROM tags t
      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)
      RETURNING id
    `,
  };
}

function getAttachmentRehomeSelectForUpdate(pool) {
  return isSqlitePool(pool)
    ? ATTACHMENT_REHOME_SELECT_SQL
    : `${ATTACHMENT_REHOME_SELECT_SQL} FOR UPDATE OF na`;
}

function registerMaintenanceRoutes(app, {
  pool,
  fileStorage,
  fsImpl,
  getSettingsFile,
  modesFile,
  modesState,
  readLocalConfig,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!fsImpl) throw new Error("fsImpl is required");

  app.get("/api/maintenance/runtime-info", (req, res) => {
    const localConfig = readLocalConfig?.() || {};
    res.json({
      ok: true,
      backend: pool.dialect || "postgres",
      sqliteFile: pool.filename || null,
      vaultPath: localConfig.vaultPath || null,
      activeMode: localConfig.activeMode || null,
    });
  });

  app.get("/api/maintenance/health", async (req, res) => {
    try {
      const report = await buildVaultHealthReport({
        pool,
        fileStorage,
        fsImpl,
        getSettingsFile,
        modesFile,
        modesState,
        readLocalConfig,
      });
      res.json(report);
    } catch (error) {
      logger.error("maintenance health:", error);
      res.status(500).json({ error: error.message || "Health check failed" });
    }
  });

  app.post("/api/maintenance/prune-unused-entities", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const pruneQueries = getPruneUnusedEntityQueries(pool);

      const authorsResult = await client.query(pruneQueries.authors);
      const sourcesResult = await client.query(pruneQueries.sources);
      const tagsResult = await client.query(pruneQueries.tags);

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
        const result = await client.query(getAttachmentRehomeSelectForUpdate(pool));
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
  buildVaultHealthReport,
  registerMaintenanceRoutes,
};
