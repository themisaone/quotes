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

function normalizeDbNoteType(value) {
  if (value === null || value === undefined) {
    return {
      raw: null,
      noteType: "<NULL>",
      isBlank: true,
    };
  }

  const raw = String(value);
  if (raw.trim() === "") {
    return {
      raw,
      noteType: "<blank>",
      isBlank: true,
    };
  }

  return {
    raw,
    noteType: raw,
    isBlank: false,
  };
}

function diffValues(source, target) {
  const targetSet = new Set(target);
  return source.filter((value) => !targetSet.has(value));
}

function resolveActiveModeTypes({
  modes,
  localConfig,
  getModeName,
  getAllowedTypes,
} = {}) {
  const activeMode = typeof getModeName === "function"
    ? getModeName()
    : localConfig?.activeMode || null;
  const allowedTypes = typeof getAllowedTypes === "function"
    ? getAllowedTypes()
    : activeMode && modes && typeof modes === "object"
      ? modes[activeMode]
      : null;

  return {
    activeMode,
    allowedTypes: uniqueSorted(Array.isArray(allowedTypes) ? allowedTypes : []),
  };
}

function buildInvalidNoteTypeSampleQuery(allowedTypes) {
  const params = [];
  const conditions = [
    "note_type IS NULL",
    "TRIM(note_type) = ''",
  ];

  if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
    const placeholders = allowedTypes.map((_, index) => `$${index + 1}`).join(", ");
    conditions.push(`note_type NOT IN (${placeholders})`);
    params.push(...allowedTypes);
  }

  return {
    query: `
      SELECT id, note_title, note_type
      FROM notes
      WHERE ${conditions.map((condition) => `(${condition})`).join(" OR ")}
      ORDER BY id
      LIMIT 25
    `,
    params,
  };
}

async function buildVaultHealthReport({
  pool,
  fileStorage,
  fsImpl,
  getSettingsFile,
  modesFile,
  modesState,
  readLocalConfig,
  getModeName,
  getAllowedTypes,
} = {}) {
  const localConfig = readLocalConfig?.() || {};
  const settingsFile = getSettingsFile?.() || null;
  const settingsJson = readJsonFile(fsImpl, settingsFile);
  const settingsTypes = collectSettingsTypes(settingsJson.data);

  const modesJson = modesState
    ? { exists: true, data: modesState, error: null }
    : readJsonFile(fsImpl, modesFile);
  const modeTypes = collectModeTypes(modesJson.data);

  const activeModeInfo = resolveActiveModeTypes({
    modes: modesJson.data,
    localConfig,
    getModeName,
    getAllowedTypes,
  });

  const countsResult = await pool.query(
    `SELECT note_type, COUNT(*) AS count
       FROM notes
      GROUP BY note_type
      ORDER BY note_type`
  );
  const countsByNoteType = countsResult.rows.map((row) => {
    const normalized = normalizeDbNoteType(row.note_type);
    return {
      noteType: normalized.noteType,
      rawNoteType: normalized.raw,
      count: Number(row.count || 0),
      isBlank: normalized.isBlank,
    };
  });
  const dbTypes = uniqueSorted(
    countsByNoteType
      .filter((row) => !row.isBlank)
      .map((row) => row.rawNoteType)
  );

  const activeAllowedSet = new Set(activeModeInfo.allowedTypes);
  const notVisibleTypes = countsByNoteType
    .filter((row) => row.isBlank || (activeAllowedSet.size > 0 && !activeAllowedSet.has(row.rawNoteType)))
    .map((row) => ({
      noteType: row.noteType,
      rawNoteType: row.rawNoteType,
      count: row.count,
      reason: row.isBlank ? "blank" : "not_in_active_mode",
    }));
  const notVisibleCount = notVisibleTypes.reduce((sum, row) => sum + row.count, 0);
  let notVisibleSamples = [];

  if (notVisibleCount > 0) {
    const sampleQuery = buildInvalidNoteTypeSampleQuery(activeModeInfo.allowedTypes);
    const sampleResult = await pool.query(sampleQuery.query, sampleQuery.params);
    notVisibleSamples = sampleResult.rows.map((row) => ({
      id: row.id,
      title: row.note_title || null,
      noteType: normalizeDbNoteType(row.note_type).noteType,
      rawNoteType: row.note_type ?? null,
    }));
  }

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
  if (notVisibleCount > 0) {
    const typeSummary = notVisibleTypes
      .map((row) => `${row.noteType} (${row.count})`)
      .join(", ");
    const sampleIds = notVisibleSamples.map((row) => `#${row.id}`).join(", ");
    issues.push({
      severity: "error",
      code: "db_note_types_not_visible",
      message: `Database contains ${notVisibleCount} note(s) not visible in active mode ${activeModeInfo.activeMode || "(unknown)"}: ${typeSummary}${sampleIds ? `. Sample IDs: ${sampleIds}` : ""}`,
    });
  }

  const status = issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.length > 0
      ? "warning"
      : "ok";

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
    activeMode: activeModeInfo.activeMode,
    activeModeTypes: activeModeInfo.allowedTypes,
    countsByNoteType,
    noteTypeVisibility: {
      notVisibleCount,
      notVisibleTypes,
      sampleNotes: notVisibleSamples,
    },
    mismatches,
    issues,
  };
}

function getPruneUnusedEntityQueries() {
  return {
    authors: {
      select: `
        SELECT a.id, a.name
        FROM authors a
        WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)
        ORDER BY lower(a.name), a.id
      `,
      delete: `
        DELETE FROM authors
        WHERE id IN (
          SELECT a.id
          FROM authors a
          WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)
        )
        RETURNING id, name
      `,
    },
    sources: {
      select: `
        SELECT s.id, s.name
        FROM sources s
        WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)
        ORDER BY lower(s.name), s.id
      `,
      delete: `
        DELETE FROM sources
        WHERE id IN (
          SELECT s.id
          FROM sources s
          WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)
        )
        RETURNING id, name
      `,
    },
    tags: {
      select: `
        SELECT t.id, t.name, t.type
        FROM tags t
        WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)
        ORDER BY lower(t.name), t.type, t.id
      `,
      delete: `
        DELETE FROM tags
        WHERE id IN (
          SELECT t.id
          FROM tags t
          WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)
        )
        RETURNING id, name, type
      `,
    },
  };
}

function getAttachmentRehomeSelectForUpdate(pool) {
  return isSqlitePool(pool)
    ? ATTACHMENT_REHOME_SELECT_SQL
    : `${ATTACHMENT_REHOME_SELECT_SQL} FOR UPDATE OF na`;
}

function normalizePruneEntityRows(rows, { includeType = false } = {}) {
  return (rows || [])
    .map((row) => ({
      id: row.id,
      name: row.name || "",
      ...(includeType ? { type: row.type || null } : {}),
    }))
    .sort((left, right) => {
      const byName = String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      if (includeType) {
        const byType = String(left.type || "").localeCompare(String(right.type || ""), undefined, { sensitivity: "base" });
        if (byType !== 0) return byType;
      }
      return Number(left.id || 0) - Number(right.id || 0);
    });
}

function buildPruneUnusedEntitiesResponse({ dryRun, authors, sources, tags }) {
  const total = authors.length + sources.length + tags.length;
  return {
    ok: true,
    dryRun,
    authors,
    sources,
    tags,
    total,
    authorsRemoved: dryRun ? 0 : authors.length,
    sourcesRemoved: dryRun ? 0 : sources.length,
    tagsRemoved: dryRun ? 0 : tags.length,
    authorsWouldRemove: dryRun ? authors.length : 0,
    sourcesWouldRemove: dryRun ? sources.length : 0,
    tagsWouldRemove: dryRun ? tags.length : 0,
  };
}

function registerMaintenanceRoutes(app, {
  pool,
  fileStorage,
  fsImpl,
  getSettingsFile,
  modesFile,
  modesState,
  readLocalConfig,
  getModeName,
  getAllowedTypes,
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
        getModeName,
        getAllowedTypes,
      });
      res.json(report);
    } catch (error) {
      logger.error("maintenance health:", error);
      res.status(500).json({ error: error.message || "Health check failed" });
    }
  });

  app.post("/api/maintenance/prune-unused-entities", async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    const pruneQueries = getPruneUnusedEntityQueries();

    try {
      if (dryRun) {
        const [authorsResult, sourcesResult, tagsResult] = await Promise.all([
          pool.query(pruneQueries.authors.select),
          pool.query(pruneQueries.sources.select),
          pool.query(pruneQueries.tags.select),
        ]);

        return res.json(buildPruneUnusedEntitiesResponse({
          dryRun: true,
          authors: normalizePruneEntityRows(authorsResult.rows),
          sources: normalizePruneEntityRows(sourcesResult.rows),
          tags: normalizePruneEntityRows(tagsResult.rows, { includeType: true }),
        }));
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const authorsResult = await client.query(pruneQueries.authors.delete);
        const sourcesResult = await client.query(pruneQueries.sources.delete);
        const tagsResult = await client.query(pruneQueries.tags.delete);

        await client.query("COMMIT");
        return res.json(buildPruneUnusedEntitiesResponse({
          dryRun: false,
          authors: normalizePruneEntityRows(authorsResult.rows),
          sources: normalizePruneEntityRows(sourcesResult.rows),
          tags: normalizePruneEntityRows(tagsResult.rows, { includeType: true }),
        }));
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error("prune-unused-entities:", error);
      res.status(500).json({ error: error.message || "Prune failed" });
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
