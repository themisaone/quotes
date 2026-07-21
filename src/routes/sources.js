const {
  isValidEntityImagePayload,
  pickEntityImagePayload,
} = require("../entityPayload");
const {
  deleteEntityImageFile,
  resolveEntityImageUpdate,
} = require("../entityImageStorage");
const {
  buildEntityDeleteSuccessMessage,
  buildSourceMergeResponse,
  buildSourceUpdateQuery,
  buildSourceUpdateResponse,
  buildSourcesListQuery,
} = require("../entityQueries");
const { fetchBookCoverDataUrl } = require("../bookCoverFetch");

async function lookupPrimaryAuthorName(pool, sourceId) {
  const result = await pool.query(
    `
      SELECT a.name
      FROM notes q
      JOIN authors a ON q.author_id = a.id
      WHERE q.source_id = $1
      GROUP BY a.id, a.name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `,
    [sourceId]
  );
  return result.rows[0]?.name || null;
}

function registerSourceRoutes(app, { pool, logger = console, fetchBookCover = fetchBookCoverDataUrl }) {
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
      const imageInput = pickEntityImagePayload(req.body);
      const imagePayload = imageInput !== undefined ? imageInput : thumbnail;

      if (!name) {
        return res.status(400).json({ error: "Source name is required" });
      }
      if (!isValidEntityImagePayload(imagePayload)) {
        return res.status(400).json({ error: "Invalid image format" });
      }

      const result = await pool.query(
        `INSERT INTO sources (name, image, type) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), sources.image), type = COALESCE(NULLIF($3, ''), sources.type)
       RETURNING *`,
        [name.trim(), "", type]
      );

      let source = result.rows[0];
      if (imagePayload) {
        const storedImage = resolveEntityImageUpdate(
          source.image,
          imagePayload,
          "sources",
          source.id
        );
        if (storedImage !== undefined) {
          const updated = await pool.query(
            "UPDATE sources SET image = $1 WHERE id = $2 RETURNING *",
            [storedImage, source.id]
          );
          source = updated.rows[0];
        }
      }

      res.status(201).json(source);
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
      const oldImage = sourceCheck.rows[0].image;

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
          deleteEntityImageFile(sourceCheck.rows[0].image);
          await client.query("DELETE FROM sources WHERE id = $1", [id]);
          await client.query("COMMIT");

          return res.json(buildSourceMergeResponse({
            oldName,
            targetSource: existingSource.rows[0],
          }));
        }
      }

      const storedImage = resolveEntityImageUpdate(oldImage, thumbnail, "sources", id);

      const { query, params, updateFields } = buildSourceUpdateQuery({
        id,
        name,
        type,
        image: storedImage,
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

  app.post("/api/sources/:id/fetch-cover", async (req, res) => {
    try {
      const { id } = req.params;
      const requestedAuthor = typeof req.body?.author === "string"
        ? req.body.author.trim()
        : "";

      const sourceResult = await pool.query(
        "SELECT id, name, image, type FROM sources WHERE id = $1",
        [id]
      );

      if (sourceResult.rows.length === 0) {
        return res.status(404).json({ error: "Source not found" });
      }

      const source = sourceResult.rows[0];
      if (source.type && source.type !== "BOOK") {
        return res.status(400).json({ error: "Cover fetch is only supported for BOOK sources" });
      }

      const author = requestedAuthor || await lookupPrimaryAuthorName(pool, id);
      if (!author) {
        return res.status(400).json({
          error: "Author is required to fetch a book cover (none linked to this source yet)",
        });
      }

      const coverResult = await fetchBookCover({
        title: source.name,
        author,
      });

      if (!coverResult) {
        return res.status(404).json({
          error: `No cover found for "${source.name}" by ${author}`,
        });
      }

      const storedImage = resolveEntityImageUpdate(
        source.image,
        coverResult.dataUrl,
        "sources",
        id
      );

      const updateResult = await pool.query(
        "UPDATE sources SET image = $1 WHERE id = $2 RETURNING *",
        [storedImage, id]
      );

      res.json({
        source: updateResult.rows[0],
        match: {
          source: coverResult.match.source,
          title: coverResult.match.title,
          authors: coverResult.match.authors,
          coverUrl: coverResult.match.coverUrl,
        },
        authorUsed: author,
      });
    } catch (error) {
      logger.error("Error fetching source cover:", error);
      res.status(500).json({ error: "Failed to fetch source cover" });
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

      deleteEntityImageFile(result.rows[0].image);

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
