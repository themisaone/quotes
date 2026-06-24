const {
  isValidEntityImagePayload,
  pickEntityImagePayload,
} = require("../entityPayload");
const {
  buildAuthorMergeResponse,
  buildAuthorUpdateQuery,
  buildAuthorUpdateResponse,
  buildAuthorsListQuery,
  buildEntityDeleteSuccessMessage,
} = require("../entityQueries");

function registerAuthorRoutes(app, { pool, logger = console }) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");

  app.get("/api/authors", async (req, res) => {
    try {
      const { search } = req.query;
      const { query, params } = buildAuthorsListQuery({ search });
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      logger.error("Error fetching authors:", error);
      res.status(500).json({ error: "Failed to fetch authors" });
    }
  });

  app.get("/api/authors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `
      SELECT a.*, COUNT(q.id) as quote_count 
      FROM authors a 
      LEFT JOIN notes q ON a.id = q.author_id 
      WHERE a.id = $1 
      GROUP BY a.id
    `,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Author not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error("Error fetching author:", error);
      res.status(500).json({ error: "Failed to fetch author" });
    }
  });

  app.post("/api/authors", async (req, res) => {
    try {
      const { name, thumbnail = "" } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Author name is required" });
      }

      const result = await pool.query(
        `INSERT INTO authors (name, image) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), authors.image)
       RETURNING *`,
        [name.trim(), thumbnail]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error("Error creating author:", error);
      res.status(500).json({ error: "Failed to create author" });
    }
  });

  app.put("/api/authors/:id", async (req, res) => {
    const thumbnail = pickEntityImagePayload(req.body);
    if (!isValidEntityImagePayload(thumbnail)) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { id } = req.params;
      const { name, description } = req.body;

      const authorCheck = await client.query(
        "SELECT id, name, image FROM authors WHERE id = $1",
        [id]
      );

      if (authorCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Author not found" });
      }

      const oldName = authorCheck.rows[0].name;

      if (name && name.trim() !== oldName) {
        const trimmedName = name.trim();
        const existingAuthor = await client.query(
          "SELECT id, name FROM authors WHERE LOWER(name) = LOWER($1) AND id != $2",
          [trimmedName, id]
        );

        if (existingAuthor.rows.length > 0) {
          const targetAuthorId = existingAuthor.rows[0].id;
          await client.query(
            "UPDATE notes SET author_id = $1 WHERE author_id = $2",
            [targetAuthorId, id]
          );
          await client.query("DELETE FROM authors WHERE id = $1", [id]);
          await client.query("COMMIT");

          return res.json(buildAuthorMergeResponse({
            oldName,
            targetAuthor: existingAuthor.rows[0],
          }));
        }
      }

      const { query, params, updateFields } = buildAuthorUpdateQuery({
        id,
        name,
        description,
        image: thumbnail,
      });
      if (updateFields.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No author fields to update" });
      }

      const result = await client.query(query, params);
      await client.query("COMMIT");

      res.json(buildAuthorUpdateResponse({
        oldName,
        author: result.rows[0],
        requestedName: name,
      }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Error updating author:", error);
      res.status(500).json({ error: "Failed to update author" });
    } finally {
      client.release();
    }
  });

  app.delete("/api/authors/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const quoteCheck = await pool.query(
        "SELECT COUNT(*) as count FROM notes WHERE author_id = $1",
        [id]
      );

      if (parseInt(quoteCheck.rows[0].count) > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete author with existing quotes" });
      }

      const result = await pool.query(
        "DELETE FROM authors WHERE id = $1 RETURNING *",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Author not found" });
      }

      res.json(buildEntityDeleteSuccessMessage("author"));
    } catch (error) {
      logger.error("Error deleting author:", error);
      res.status(500).json({ error: "Failed to delete author" });
    }
  });
}

module.exports = {
  registerAuthorRoutes,
};
