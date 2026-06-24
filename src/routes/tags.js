function normalizeTagName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTagQueryList(value) {
  const rawValue = Array.isArray(value) ? value.join(",") : value;
  if (!rawValue) return [];
  return rawValue
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function registerTagRoutes(app, { pool, logger = console }) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");

  // Get tags that co-occur with ALL of the given tags on notes of a given type.
  // Used by the browse-tags feature.
  // Query: ?tags=tag1,tag2&type=historical
  app.get("/api/tags/co-occurring", async (req, res) => {
    try {
      const tagList = parseTagQueryList(req.query.tags);
      if (tagList.length === 0) return res.json([]);

      // Find notes that have ALL of the requested tags (no note_type filter -
      // the tag's own type may differ from note_type depending on import origin).
      // Then return other tags that appear on those notes, optionally filtered
      // by tag type so the browse strip stays within the chosen tag category.
      const params = [tagList, tagList.length];
      let tagTypeClause = "";
      if (req.query.type) {
        params.push(req.query.type);
        tagTypeClause = `AND t.type = $${params.length}`;
      }

      const result = await pool.query(
        `
      SELECT t.id, t.name, t.type,
             COUNT(DISTINCT nt.note_id) AS quote_count
      FROM tags t
      JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id IN (
        SELECT nt2.note_id
        FROM note_tags nt2
        JOIN tags t2 ON t2.id = nt2.tag_id
        WHERE t2.name = ANY($1::text[])
        GROUP BY nt2.note_id
        HAVING COUNT(DISTINCT t2.name) = $2
      )
      AND t.name != ALL($1::text[])
      ${tagTypeClause}
      GROUP BY t.id, t.name, t.type
      ORDER BY quote_count DESC, t.name
    `,
        params
      );

      res.json(result.rows);
    } catch (err) {
      logger.error("co-occurring tags error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get all tags with quote counts
  app.get("/api/tags", async (req, res) => {
    try {
      const { type, search } = req.query;

      let query = `
      SELECT t.id, t.name, t.type, COUNT(qt.note_id)::int as quote_count
      FROM tags t
      LEFT JOIN note_tags qt ON t.id = qt.tag_id
    `;

      const params = [];
      const conditions = [];
      let paramCounter = 1;

      if (type) {
        conditions.push(`t.type = $${paramCounter}`);
        params.push(type);
        paramCounter++;
      }

      if (search) {
        conditions.push(`t.name ILIKE $${paramCounter}`);
        params.push(`%${search}%`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += `
      GROUP BY t.id, t.name, t.type
      ORDER BY t.name ASC
    `;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      logger.error("Error fetching tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Create new tag
  app.post("/api/tags", async (req, res) => {
    try {
      const name = normalizeTagName(req.body && req.body.name);

      if (!name) {
        return res.status(400).json({ error: "Tag name is required" });
      }

      const result = await pool.query(
        `INSERT INTO tags (name) 
       VALUES ($1) 
       ON CONFLICT (name) DO UPDATE SET name = tags.name
       RETURNING *`,
        [name]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error("Error creating tag:", error);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  // Rename tag (with auto-merge detection)
  app.put("/api/tags/:id", async (req, res) => {
    const name = normalizeTagName(req.body && req.body.name);
    if (!name) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { id } = req.params;

      const tagCheck = await client.query(
        "SELECT id, name FROM tags WHERE id = $1",
        [id]
      );

      if (tagCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Tag not found" });
      }

      const oldName = tagCheck.rows[0].name;

      const existingTag = await client.query(
        "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1) AND id != $2",
        [name, id]
      );

      if (existingTag.rows.length > 0) {
        const targetTagId = existingTag.rows[0].id;

        await client.query(
          `
        INSERT INTO note_tags (note_id, tag_id)
        SELECT note_id, $1
        FROM note_tags
        WHERE tag_id = $2
        ON CONFLICT (note_id, tag_id) DO NOTHING
      `,
          [targetTagId, id]
        );

        await client.query("DELETE FROM tags WHERE id = $1", [id]);
        await client.query("COMMIT");

        return res.json({
          merged: true,
          oldName,
          newName: existingTag.rows[0].name,
          targetTagId,
          message: `Tag "${oldName}" merged into existing tag "${existingTag.rows[0].name}"`,
        });
      }

      await client.query("UPDATE tags SET name = $1 WHERE id = $2", [name, id]);
      await client.query("COMMIT");

      return res.json({
        merged: false,
        oldName,
        newName: name,
        message: `Tag renamed from "${oldName}" to "${name}"`,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Error renaming tag:", error);
      res.status(500).json({ error: "Failed to rename tag" });
    } finally {
      client.release();
    }
  });

  // Delete tag
  app.delete("/api/tags/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { id } = req.params;

      const result = await client.query(
        "DELETE FROM tags WHERE id = $1 RETURNING name",
        [id]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Tag not found" });
      }

      await client.query("COMMIT");

      res.json({
        message: `Tag "${result.rows[0].name}" deleted successfully`,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Error deleting tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    } finally {
      client.release();
    }
  });

  // Add tag to all quotes that have another tag
  app.post("/api/tags/bulk-add", async (req, res) => {
    const sourceTagName = normalizeTagName(req.body && req.body.sourceTagName);
    const targetTagName = normalizeTagName(req.body && req.body.targetTagName);

    if (!sourceTagName || !targetTagName) {
      return res
        .status(400)
        .json({ error: "Both source and target tag names are required" });
    }

    if (sourceTagName.toLowerCase() === targetTagName.toLowerCase()) {
      return res
        .status(400)
        .json({ error: "Source and target tags cannot be the same" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let sourceTag = await client.query(
        "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
        [sourceTagName]
      );

      if (sourceTag.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: `Source tag "${sourceTagName}" not found` });
      }

      sourceTag = sourceTag.rows[0];

      let targetTag = await client.query(
        "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
        [targetTagName]
      );

      if (targetTag.rows.length === 0) {
        const newTag = await client.query(
          "INSERT INTO tags (name) VALUES ($1) RETURNING id, name",
          [targetTagName]
        );
        targetTag = newTag.rows[0];
      } else {
        targetTag = targetTag.rows[0];
      }

      const result = await client.query(
        `
      INSERT INTO note_tags (note_id, tag_id)
      SELECT qt.note_id, $1
      FROM note_tags qt
      WHERE qt.tag_id = $2
      ON CONFLICT (note_id, tag_id) DO NOTHING
      RETURNING note_id
    `,
        [targetTag.id, sourceTag.id]
      );

      const affectedCount = result.rows.length;

      await client.query("COMMIT");

      res.json({
        success: true,
        affectedCount,
        sourceTag: sourceTag.name,
        targetTag: targetTag.name,
        message: `Added tag "${targetTag.name}" to ${affectedCount} note(s) that have tag "${sourceTag.name}"`,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Error bulk adding tag:", error);
      res.status(500).json({ error: "Failed to bulk add tag" });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  normalizeTagName,
  parseTagQueryList,
  registerTagRoutes,
};
