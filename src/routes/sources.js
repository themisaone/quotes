const {
  isValidEntityImagePayload,
  pickEntityImagePayload,
} = require("../entityPayload");
const {
  buildEntityDeleteSuccessMessage,
  buildSourceMergeResponse,
  buildSourceUpdateQuery,
  buildSourceUpdateResponse,
  buildSourcesListQuery,
} = require("../entityQueries");

function registerSourceRoutes(app, { pool, logger = console }) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");

  app.get("/api/sources", async (req, res) => {
    try {
      const { search, type } = req.query;
      const { query, params } = buildSourcesListQuery({ search, type });
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      logger.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  app.get("/api/sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `
      SELECT s.*, COUNT(q.id) as quote_count 
      FROM sources s 
      LEFT JOIN notes q ON s.id = q.source_id 
      WHERE s.id = $1 
      GROUP BY s.id
    `,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Source not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error("Error fetching source:", error);
      res.status(500).json({ error: "Failed to fetch source" });
    }
  });

  app.post("/api/sources", async (req, res) => {
    try {
      const { name, thumbnail = "", type = "BOOK" } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Source name is required" });
      }

      const result = await pool.query(
        `INSERT INTO sources (name, image, type) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), sources.image), type = COALESCE(NULLIF($3, ''), sources.type)
       RETURNING *`,
        [name.trim(), thumbnail, type]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error("Error creating source:", error);
      res.status(500).json({ error: "Failed to create source" });
    }
  });

  app.put("/api/sources/:id", async (req, res) => {
    const thumbnail = pickEntityImagePayload(req.body);
    if (!isValidEntityImagePayload(thumbnail)) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { id } = req.params;
      const { name, type } = req.body;

      const sourceCheck = await client.query(
        "SELECT id, name, image, type FROM sources WHERE id = $1",
        [id]
      );

      if (sourceCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Source not found" });
      }

      const oldName = sourceCheck.rows[0].name;

      if (name && name.trim() !== oldName) {
        const trimmedName = name.trim();
        const existingSource = await client.query(
          "SELECT id, name FROM sources WHERE LOWER(name) = LOWER($1) AND id != $2",
          [trimmedName, id]
        );

        if (existingSource.rows.length > 0) {
          const targetSourceId = existingSource.rows[0].id;
          await client.query(
            "UPDATE notes SET source_id = $1 WHERE source_id = $2",
            [targetSourceId, id]
          );
          await client.query("DELETE FROM sources WHERE id = $1", [id]);
          await client.query("COMMIT");

          return res.json(buildSourceMergeResponse({
            oldName,
            targetSource: existingSource.rows[0],
          }));
        }
      }

      const { query, params, updateFields } = buildSourceUpdateQuery({
        id,
        name,
        type,
        image: thumbnail,
      });
      if (updateFields.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No source fields to update" });
      }

      const result = await client.query(query, params);
      await client.query("COMMIT");

      res.json(buildSourceUpdateResponse({
        oldName,
        source: result.rows[0],
        requestedName: name,
      }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Error updating source:", error);
      res.status(500).json({ error: "Failed to update source" });
    } finally {
      client.release();
    }
  });

  app.delete("/api/sources/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const quoteCheck = await pool.query(
        "SELECT COUNT(*) as count FROM notes WHERE source_id = $1",
        [id]
      );

      if (parseInt(quoteCheck.rows[0].count) > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete source with existing quotes" });
      }

      const result = await pool.query(
        "DELETE FROM sources WHERE id = $1 RETURNING *",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Source not found" });
      }

      res.json(buildEntityDeleteSuccessMessage("source"));
    } catch (error) {
      logger.error("Error deleting source:", error);
      res.status(500).json({ error: "Failed to delete source" });
    }
  });
}

module.exports = {
  registerSourceRoutes,
};
