const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for image uploads
app.use(express.static(path.join(__dirname, "../public")));

// ============= AUTHORS API =============

// Get all authors (with optional search)
app.get("/api/authors", async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
            SELECT a.*, 
                   COUNT(q.id) as quote_count
            FROM authors a
            LEFT JOIN quotes q ON a.id = q.author_id
        `;
    const params = [];

    if (search) {
      query += " WHERE a.name ILIKE $1";
      params.push(`%${search}%`);
    }

    query += " GROUP BY a.id ORDER BY a.name ASC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching authors:", error);
    res.status(500).json({ error: "Failed to fetch authors" });
  }
});

// Get single author
app.get("/api/authors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT a.*, COUNT(q.id) as quote_count 
      FROM authors a 
      LEFT JOIN quotes q ON a.id = q.author_id 
      WHERE a.id = $1 
      GROUP BY a.id
    `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching author:", error);
    res.status(500).json({ error: "Failed to fetch author" });
  }
});

// Create or get author
app.post("/api/authors", async (req, res) => {
  try {
    const { name, image = "" } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Author name is required" });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO authors (name, image) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), authors.image)
       RETURNING *`,
      [name.trim(), image],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating author:", error);
    res.status(500).json({ error: "Failed to create author" });
  }
});

// Update author
app.put("/api/authors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { name, image } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL
    if (image && !image.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    const result = await pool.query(
      `UPDATE authors 
       SET name = COALESCE($1, name),
           image = COALESCE($2, image)
       WHERE id = $3
       RETURNING *`,
      [name, image, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating author:", error);
    res.status(500).json({ error: "Failed to update author" });
  }
});

// Delete author (only if no quotes)
app.delete("/api/authors/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if author has any quotes
    const quoteCheck = await pool.query(
      "SELECT COUNT(*) as count FROM quotes WHERE author_id = $1",
      [id],
    );

    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete author with existing quotes" });
    }

    const result = await pool.query(
      "DELETE FROM authors WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }

    res.json({ message: "Author deleted successfully" });
  } catch (error) {
    console.error("Error deleting author:", error);
    res.status(500).json({ error: "Failed to delete author" });
  }
});

// ============= SOURCES API =============

// Get all sources (with optional search and type filter)
app.get("/api/sources", async (req, res) => {
  try {
    const { search, type } = req.query;
    let query = `
            SELECT s.*, 
                   COUNT(q.id) as quote_count,
                   (
                       SELECT a.name 
                       FROM quotes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id, a.name 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_name,
                   (
                       SELECT a.id 
                       FROM quotes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_id
            FROM sources s
            LEFT JOIN quotes q ON s.id = q.source_id
            WHERE 1=1
        `;
    const params = [];
    let paramCounter = 1;

    if (search) {
      query += ` AND s.name ILIKE $${paramCounter}`;
      params.push(`%${search}%`);
      paramCounter++;
    }

    if (type) {
      query += ` AND s.type = $${paramCounter}`;
      params.push(type);
      paramCounter++;
    }

    query += " GROUP BY s.id ORDER BY s.name ASC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching sources:", error);
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

// Get single source
app.get("/api/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT s.*, COUNT(q.id) as quote_count 
      FROM sources s 
      LEFT JOIN quotes q ON s.id = q.source_id 
      WHERE s.id = $1 
      GROUP BY s.id
    `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching source:", error);
    res.status(500).json({ error: "Failed to fetch source" });
  }
});

// Create or get source
app.post("/api/sources", async (req, res) => {
  try {
    const { name, image = "", type = "BOOK" } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Source name is required" });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO sources (name, image, type) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), sources.image), type = COALESCE(NULLIF($3, ''), sources.type)
       RETURNING *`,
      [name.trim(), image, type],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating source:", error);
    res.status(500).json({ error: "Failed to create source" });
  }
});

// Update source
app.put("/api/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { name, image, type } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL
    if (image && !image.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    const result = await pool.query(
      `UPDATE sources 
       SET name = COALESCE($1, name),
           image = COALESCE($2, image),
           type = COALESCE($3, type)
       WHERE id = $4
       RETURNING *`,
      [name, image, type, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating source:", error);
    res.status(500).json({ error: "Failed to update source" });
  }
});

// Delete source (only if no quotes)
app.delete("/api/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if source has any quotes
    const quoteCheck = await pool.query(
      "SELECT COUNT(*) as count FROM quotes WHERE source_id = $1",
      [id],
    );

    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete source with existing quotes" });
    }

    const result = await pool.query(
      "DELETE FROM sources WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }

    res.json({ message: "Source deleted successfully" });
  } catch (error) {
    console.error("Error deleting source:", error);
    res.status(500).json({ error: "Failed to delete source" });
  }
});

// ============= QUOTES API =============

// Get total quote count
app.get("/api/quotes/count", async (req, res) => {
  try {
    const { quote, author, source, tags, types } = req.query;

    let query = `
      SELECT COUNT(*) as count
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    if (quote) {
      query += ` AND q.quote ILIKE $${paramCounter}`;
      params.push(`%${quote}%`);
      paramCounter++;
    }

    if (author) {
      query += ` AND a.name ILIKE $${paramCounter}`;
      params.push(`%${author}%`);
      paramCounter++;
    }

    if (source) {
      query += ` AND s.name ILIKE $${paramCounter}`;
      params.push(`%${source}%`);
      paramCounter++;
    }

    if (tags) {
      // Split tags by comma and search for each individually (AND logic)
      const searchTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
      searchTags.forEach((tag) => {
        query += ` AND q.tags ILIKE $${paramCounter}`;
        params.push(`%${tag}%`);
        paramCounter++;
      });
    }

    // Filter by types if provided
    if (types) {
      const typeArray = types.split(",").filter((t) => t);
      if (typeArray.length > 0 && typeArray.length < 3) {
        // Only filter if not all selected
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(typeArray);
        paramCounter++;
      }
    }

    const result = await pool.query(query, params);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error("Error fetching quote count:", error);
    res.status(500).json({ error: "Failed to fetch quote count" });
  }
});

// Get all quotes with optional filtering (with author and source details)
app.get("/api/quotes", async (req, res) => {
  try {
    const {
      quote,
      author,
      source,
      tags,
      date,
      types,
      limit = 20,
      offset = 0,
    } = req.query;

    let query = `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    if (quote) {
      query += ` AND q.quote ILIKE $${paramCounter}`;
      params.push(`%${quote}%`);
      paramCounter++;
    }

    if (author) {
      query += ` AND a.name ILIKE $${paramCounter}`;
      params.push(`%${author}%`);
      paramCounter++;
    }

    if (source) {
      query += ` AND s.name ILIKE $${paramCounter}`;
      params.push(`%${source}%`);
      paramCounter++;
    }

    if (tags) {
      // Split tags by comma and search for each individually (AND logic)
      const searchTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
      console.log("Searching for tags:", searchTags); // Debug log
      searchTags.forEach((tag) => {
        query += ` AND q.tags ILIKE $${paramCounter}`;
        params.push(`%${tag}%`);
        paramCounter++;
      });
    }

    if (date) {
      query += ` AND q.date = $${paramCounter}`;
      params.push(date);
      paramCounter++;
    }

    // Filter by types if provided
    if (types) {
      const typeArray = types.split(",").filter((t) => t);
      if (typeArray.length > 0 && typeArray.length < 3) {
        // Only filter if not all selected
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(typeArray);
        paramCounter++;
      }
    }

    query += ` ORDER BY q.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

// Get single quote by ID
app.get("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

// Create new quote
app.post("/api/quotes", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      quote,
      author,
      source,
      sourceType = "BOOK",
      tags = "",
      image = "",
      image_full = "",
      note = "",
    } = req.body;

    if (!quote) {
      return res.status(400).json({ error: "Quote text is required" });
    }

    let authorId = null;
    let sourceId = null;

    // Create or get author if provided
    if (author && author.trim()) {
      const authorResult = await client.query(
        `INSERT INTO authors (name) 
         VALUES ($1) 
         ON CONFLICT (name) DO UPDATE SET name = authors.name
         RETURNING id`,
        [author.trim()],
      );
      authorId = authorResult.rows[0].id;
    }

    // Create or get source if provided
    if (source && source.trim()) {
      const sourceResult = await client.query(
        `INSERT INTO sources (name, type) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type
         RETURNING id`,
        [source.trim(), sourceType],
      );
      sourceId = sourceResult.rows[0].id;
    }

    // Create the quote - store type in quotes table now
    const result = await client.query(
      `INSERT INTO quotes (quote, author_id, source_id, tags, image, image_full, note, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [quote, authorId, sourceId, tags, image, image_full, note, sourceType],
    );

    await client.query("COMMIT");

    // Fetch the complete quote with author and source details
    const completeQuote = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `,
      [result.rows[0].id],
    );

    res.status(201).json(completeQuote.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating quote:", error);
    res.status(500).json({ error: "Failed to create quote" });
  } finally {
    client.release();
  }
});

// Update quote
app.put("/api/quotes/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      quote,
      author,
      source,
      sourceType,
      sourceId,
      tags,
      image,
      image_full,
      note,
    } = req.body;

    console.log("UPDATE QUOTE - Received data:", {
      id,
      source,
      sourceType,
      sourceId,
    });

    let authorId = null;
    let newSourceId = null;

    // Handle author update
    if (author !== undefined) {
      if (author && author.trim()) {
        const authorResult = await client.query(
          `INSERT INTO authors (name) 
           VALUES ($1) 
           ON CONFLICT (name) DO UPDATE SET name = authors.name
           RETURNING id`,
          [author.trim()],
        );
        authorId = authorResult.rows[0].id;
      }
    }

    // Handle source update - simpler now since type is stored in quotes table
    if (source !== undefined) {
      console.log("Processing source update:", {
        source,
        sourceType,
        sourceId,
      });
      if (source && source.trim()) {
        // Create or get source by name
        const sourceResult = await client.query(
          `INSERT INTO sources (name, type) 
           VALUES ($1, $2) 
           ON CONFLICT (name) DO UPDATE SET name = sources.name
           RETURNING id`,
          [source.trim(), sourceType || "BOOK"],
        );
        newSourceId = sourceResult.rows[0].id;
        console.log("Source processed:", newSourceId);
      }
    }

    // Update the quote
    const updateFields = [];
    const params = [];
    let paramCounter = 1;

    if (quote !== undefined) {
      updateFields.push(`quote = $${paramCounter}`);
      params.push(quote);
      paramCounter++;
    }

    if (author !== undefined) {
      updateFields.push(`author_id = $${paramCounter}`);
      params.push(authorId);
      paramCounter++;
    }

    if (source !== undefined) {
      updateFields.push(`source_id = $${paramCounter}`);
      params.push(newSourceId);
      paramCounter++;
    }

    if (tags !== undefined) {
      updateFields.push(`tags = $${paramCounter}`);
      params.push(tags);
      paramCounter++;
    }

    if (image !== undefined) {
      updateFields.push(`image = $${paramCounter}`);
      params.push(image);
      paramCounter++;
    }

    if (image_full !== undefined) {
      updateFields.push(`image_full = $${paramCounter}`);
      params.push(image_full);
      paramCounter++;
    }

    if (note !== undefined) {
      updateFields.push(`note = $${paramCounter}`);
      params.push(note);
      paramCounter++;
    }

    if (sourceType !== undefined) {
      updateFields.push(`type = $${paramCounter}`);
      params.push(sourceType);
      paramCounter++;
    }

    // Always update updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(id);
    const result = await client.query(
      `UPDATE quotes SET ${updateFields.join(", ")} WHERE id = $${paramCounter} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }

    await client.query("COMMIT");

    // Fetch the complete quote with author and source details
    const completeQuote = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `,
      [id],
    );

    res.json(completeQuote.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating quote:", error);
    res.status(500).json({ error: "Failed to update quote" });
  } finally {
    client.release();
  }
});

// Delete quote
app.delete("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM quotes WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }

    res.json({ message: "Quote deleted successfully", quote: result.rows[0] });
  } catch (error) {
    console.error("Error deleting quote:", error);
    res.status(500).json({ error: "Failed to delete quote" });
  }
});

// ============= TAGS API =============

// Get all tags with quote counts
app.get("/api/tags", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tags FROM quotes WHERE tags IS NOT NULL AND tags != ''
    `);

    // Parse tags and count them
    const tagCounts = {};
    result.rows.forEach((row) => {
      const tags = row.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
      tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Convert to array and sort by count (descending)
    const tagsArray = Object.entries(tagCounts)
      .map(([name, count]) => ({
        name,
        quote_count: count,
      }))
      .sort((a, b) => b.quote_count - a.quote_count);

    res.json(tagsArray);
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// ============= DATA EXPORT/IMPORT (JSON) =============

// Export all data as JSON
app.get("/api/export/json", async (req, res) => {
  try {
    console.log("JSON export requested...");

    // Fetch all authors
    const authorsResult = await pool.query("SELECT * FROM authors ORDER BY id");

    // Fetch all sources
    const sourcesResult = await pool.query("SELECT * FROM sources ORDER BY id");

    // Fetch all quotes with full details
    const quotesResult = await pool.query(`
      SELECT q.*, 
             a.name as author_name, 
             s.name as source_name
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      ORDER BY q.id
    `);

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      counts: {
        authors: authorsResult.rows.length,
        sources: sourcesResult.rows.length,
        quotes: quotesResult.rows.length,
      },
      data: {
        authors: authorsResult.rows,
        sources: sourcesResult.rows,
        quotes: quotesResult.rows,
      },
    };

    console.log(
      `Exported ${exportData.counts.authors} authors, ${exportData.counts.sources} sources, ${exportData.counts.quotes} quotes`,
    );

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=quotes_backup_${new Date().toISOString().split("T")[0]}.json`,
    );
    res.json(exportData);
  } catch (error) {
    console.error("Error exporting data:", error);
    res
      .status(500)
      .json({ error: "Failed to export data", details: error.message });
  }
});

// Import data from JSON
app.post("/api/import/json", async (req, res) => {
  const client = await pool.connect();

  try {
    console.log("JSON import requested...");
    const { data, options } = req.body;

    if (!data || !data.authors || !data.sources || !data.quotes) {
      return res.status(400).json({ error: "Invalid import data structure" });
    }

    await client.query("BEGIN");

    const stats = {
      authors: { created: 0, updated: 0, skipped: 0 },
      sources: { created: 0, updated: 0, skipped: 0 },
      quotes: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    // Import authors
    console.log(`Importing ${data.authors.length} authors...`);
    for (const author of data.authors) {
      try {
        if (options?.replaceExisting) {
          // Replace: upsert by name
          const result = await client.query(
            `INSERT INTO authors (name, image) 
             VALUES ($1, $2) 
             ON CONFLICT (name) DO UPDATE 
             SET image = EXCLUDED.image
             RETURNING id, (xmax = 0) as inserted`,
            [author.name, author.image],
          );
          if (result.rows[0].inserted) {
            stats.authors.created++;
          } else {
            stats.authors.updated++;
          }
        } else {
          // Skip if exists
          const existing = await client.query(
            "SELECT id FROM authors WHERE name = $1",
            [author.name],
          );
          if (existing.rows.length > 0) {
            stats.authors.skipped++;
          } else {
            await client.query(
              "INSERT INTO authors (name, image) VALUES ($1, $2)",
              [author.name, author.image],
            );
            stats.authors.created++;
          }
        }
      } catch (error) {
        stats.errors.push(`Author "${author.name}": ${error.message}`);
      }
    }

    // Import sources
    console.log(`Importing ${data.sources.length} sources...`);
    for (const source of data.sources) {
      try {
        if (options?.replaceExisting) {
          const result = await client.query(
            `INSERT INTO sources (name, type, image) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (name) DO UPDATE 
             SET type = EXCLUDED.type, image = EXCLUDED.image
             RETURNING id, (xmax = 0) as inserted`,
            [source.name, source.type, source.image],
          );
          if (result.rows[0].inserted) {
            stats.sources.created++;
          } else {
            stats.sources.updated++;
          }
        } else {
          const existing = await client.query(
            "SELECT id FROM sources WHERE name = $1",
            [source.name],
          );
          if (existing.rows.length > 0) {
            stats.sources.skipped++;
          } else {
            await client.query(
              "INSERT INTO sources (name, type, image) VALUES ($1, $2, $3)",
              [source.name, source.type, source.image],
            );
            stats.sources.created++;
          }
        }
      } catch (error) {
        stats.errors.push(`Source "${source.name}": ${error.message}`);
      }
    }

    // Import quotes
    console.log(`Importing ${data.quotes.length} quotes...`);
    for (const quote of data.quotes) {
      try {
        // Get author_id
        let authorId = null;
        if (quote.author_name) {
          const authorResult = await client.query(
            "SELECT id FROM authors WHERE name = $1",
            [quote.author_name],
          );
          if (authorResult.rows.length > 0) {
            authorId = authorResult.rows[0].id;
          }
        }

        // Get source_id
        let sourceId = null;
        if (quote.source_name) {
          const sourceResult = await client.query(
            "SELECT id FROM sources WHERE name = $1",
            [quote.source_name],
          );
          if (sourceResult.rows.length > 0) {
            sourceId = sourceResult.rows[0].id;
          }
        }

        // Check if quote already exists (by text + author)
        const existing = await client.query(
          "SELECT id FROM quotes WHERE quote = $1 AND author_id = $2",
          [quote.quote, authorId],
        );

        if (existing.rows.length > 0) {
          if (options?.replaceExisting) {
            await client.query(
              `UPDATE quotes 
               SET source_id = $1, type = $2, tags = $3, image = $4, image_full = $5, note = $6, updated_at = CURRENT_TIMESTAMP
               WHERE id = $7`,
              [
                sourceId,
                quote.type,
                quote.tags,
                quote.image,
                quote.image_full,
                quote.note,
                existing.rows[0].id,
              ],
            );
            stats.quotes.updated++;
          } else {
            stats.quotes.skipped++;
          }
        } else {
          await client.query(
            `INSERT INTO quotes (quote, author_id, source_id, type, tags, image, image_full, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              quote.quote,
              authorId,
              sourceId,
              quote.type,
              quote.tags,
              quote.image,
              quote.image_full,
              quote.note,
              quote.created_at || new Date(),
              quote.updated_at || new Date(),
            ],
          );
          stats.quotes.created++;
        }
      } catch (error) {
        stats.errors.push(
          `Quote "${quote.quote.substring(0, 50)}...": ${error.message}`,
        );
      }
    }

    await client.query("COMMIT");

    console.log("Import completed:", stats);
    res.json({
      success: true,
      message: "Import completed",
      stats,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error importing data:", error);
    res
      .status(500)
      .json({ error: "Failed to import data", details: error.message });
  } finally {
    client.release();
  }
});

// ============= PDF EXPORT =============

app.post("/api/export/pdf", async (req, res) => {
  try {
    console.log("PDF export requested...");
    const { quotes, filters } = req.body;

    if (!quotes || quotes.length === 0) {
      return res.status(400).json({ error: "No quotes provided" });
    }

    console.log(`Generating PDF for ${quotes.length} quotes...`);

    // Import puppeteer
    const puppeteer = require("puppeteer");

    // Group quotes by author
    const groupedByAuthor = {};
    quotes.forEach((quote) => {
      const authorKey = quote.author_name || "Unknown Author";
      if (!groupedByAuthor[authorKey]) {
        groupedByAuthor[authorKey] = {
          authorName: authorKey,
          authorImage: quote.author_image,
          sources: {},
        };
      }

      const sourceKey = quote.source_name || "No Source";
      if (!groupedByAuthor[authorKey].sources[sourceKey]) {
        groupedByAuthor[authorKey].sources[sourceKey] = {
          sourceName: sourceKey,
          sourceType: quote.source_type || "BOOK",
          sourceImage: quote.source_image,
          quotes: [],
        };
      }

      groupedByAuthor[authorKey].sources[sourceKey].quotes.push(quote);
    });

    // Generate HTML for PDF
    console.log("Generating HTML...");
    const html = generatePdfHtml(groupedByAuthor, filters);

    // Launch puppeteer
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    console.log("Loading content...");
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Generate PDF
    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
      printBackground: true,
    });

    await browser.close();
    console.log(`PDF generated successfully: ${pdfBuffer.length} bytes`);

    // Send PDF with proper headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=quotes.pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer, "binary");
  } catch (error) {
    console.error("Error generating PDF:", error);
    res
      .status(500)
      .json({ error: "Failed to generate PDF", details: error.message });
  }
});

function generatePdfHtml(groupedByAuthor, filters) {
  const typeIcon = {
    BOOK: "📖",
    MOVIE: "🎬",
    ASSORTED: "📝",
  };

  let filterInfo = "";
  if (filters && Object.keys(filters).length > 0) {
    filterInfo =
      '<div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 10pt;">';
    filterInfo +=
      '<h3 style="margin: 0 0 8px 0; color: #374151; font-size: 12pt;">Filters Applied:</h3>';
    if (filters.quote)
      filterInfo += `<p style="margin: 4px 0; font-size: 10pt;"><strong>Quote:</strong> ${filters.quote}</p>`;
    if (filters.author)
      filterInfo += `<p style="margin: 4px 0; font-size: 10pt;"><strong>Author:</strong> ${filters.author}</p>`;
    if (filters.source)
      filterInfo += `<p style="margin: 4px 0; font-size: 10pt;"><strong>Source:</strong> ${filters.source}</p>`;
    if (filters.tags)
      filterInfo += `<p style="margin: 4px 0; font-size: 10pt;"><strong>Tags:</strong> ${filters.tags}</p>`;
    filterInfo += "</div>";
  }

  let authorsHtml = "";
  Object.values(groupedByAuthor).forEach((author) => {
    authorsHtml += `
      <div style="page-break-before: always; margin-bottom: 30px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #3b82f6;">
          ${
            author.authorImage
              ? `<img src="${author.authorImage}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 15px;">`
              : '<div style="width: 60px; height: 60px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 28px; margin-right: 15px;">✍️</div>'
          }
          <h2 style="margin: 0; color: #1f2937; font-size: 16pt;">${escapeHtml(author.authorName)}</h2>
        </div>
    `;

    Object.values(author.sources).forEach((source) => {
      authorsHtml += `
        <div style="margin-bottom: 20px; margin-left: 15px;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            ${
              source.sourceImage
                ? `<img src="${source.sourceImage}" style="width: 50px; height: 75px; object-fit: cover; border-radius: 3px; margin-right: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">`
                : ""
            }
            <h3 style="margin: 0; color: #4b5563; font-size: 13pt;">
              ${typeIcon[source.sourceType] || "📖"} ${escapeHtml(source.sourceName)}
            </h3>
          </div>
      `;

      source.quotes.forEach((quote) => {
        authorsHtml += `
          <div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-left: 3px solid #3b82f6; border-radius: 3px;">
            <p style="margin: 0 0 8px 0; font-style: italic; color: #1f2937; line-height: 1.5; white-space: pre-wrap; font-size: 11pt;">"${escapeHtml(quote.quote)}"</p>
            ${quote.tags ? `<p style="margin: 4px 0 0 0; font-size: 9pt; color: #6b7280;">Tags: ${escapeHtml(quote.tags)}</p>` : ""}
          </div>
        `;
      });

      authorsHtml += "</div>";
    });

    authorsHtml += "</div>";
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.5;
          color: #333;
          max-width: 100%;
          font-size: 11pt;
        }
        h1 {
          color: #1f2937;
          font-size: 20pt;
          margin-bottom: 8px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 15px;
          border-bottom: 3px solid #3b82f6;
        }
        .date {
          color: #6b7280;
          font-size: 10pt;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📚 Quotes Collection</h1>
        <p class="date">Generated on ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}</p>
      </div>
      
      ${filterInfo}
      ${authorsHtml}
    </body>
    </html>
  `;
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
