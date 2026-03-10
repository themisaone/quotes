const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pool = require("./db");
const fileStorage = require("./fileStorage");
const {
  checkTagTablesExist,
  getOrCreateTagIds,
  associateTagsWithQuote,
  getTagsForQuote,
  getTagsForQuotes,
  parseTagInput,
} = require("./tagHelpers");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// Settings file path
const SETTINGS_FILE = path.join(__dirname, '../config/settings.json');

// Ensure config directory exists
const configDir = path.dirname(SETTINGS_FILE);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "100mb" })); // Increased limit for bulk imports with attachments
app.use(express.urlencoded({ limit: "100mb", extended: true })); // Also increase URL-encoded limit
app.use(express.static(path.join(__dirname, "../public")));
// Serve attachments folder for large files
app.use('/attachments', express.static(path.join(__dirname, '../attachments')));

// API to get storage configuration (returns default, actual value set by user in Settings)
app.get('/api/config/storage', (req, res) => {
  res.json({
    defaultMaxDbSizeMB: fileStorage.DEFAULT_MAX_SIZE_MB
  });
});

// Get all settings
app.get('/api/settings', (req, res) => {
  try {
    // Default settings
    const defaultSettings = {
      quoteTypes: [
        { value: 'BOOK', label: 'Book', icon: '📖' },
        { value: 'MOVIE-TV', label: 'Movies & TV', icon: '🎬' },
        { value: 'POETRY', label: 'Poetry', icon: '📜' },
        { value: 'LYRICS', label: 'Lyrics', icon: '🎵' },
        { value: 'JOKES', label: 'Jokes', icon: '😂' },
        { value: 'ASSORTED', label: 'Assorted', icon: '📝' }
      ],
      downscaleQuoteImages: true,
      externalStorageThreshold: 1,
      compactMode: false,
      enableTagOperations: true,
      enableQuoteMetaSearches: false,
      displayQuotesByRealSize: false,
      displayImageQuotesLong: false,
      showLongQuotesExpanded: false,
      displayScoreInCards: false,
      colors: {
        button: '#1e40af',
        header: '#166534',
        tag: '#2d6a4f',
        delete: '#ef4444',
        cancel: '#6b7280',
        activeCounter: '#dc2626',
        totalCounter: '#047857',
        menu: '#2c3e50',
        appBg: '#f8fafc'
      }
    };
    
    // Read from file if exists
    if (fs.existsSync(SETTINGS_FILE)) {
      const fileContent = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(fileContent);
      res.json(settings);
    } else {
      // Create file with defaults
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      res.json(defaultSettings);
    }
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Save settings
app.put('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    
    // Validate settings structure
    if (!settings.quoteTypes || !Array.isArray(settings.quoteTypes)) {
      return res.status(400).json({ error: 'Invalid settings structure' });
    }
    
    // Write to file
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    
    console.log('✅ Settings saved to file');
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Helper function to retrieve images from hybrid storage
function retrieveQuoteImages(quote) {
  // Convert thumbnail to base64 (for cards - always need it)
  if (quote.image) {
    quote.image = fileStorage.retrieveFromStorage(quote.image);
  }
  // Keep image_full as-is (file: reference or base64)
  // Frontend will handle file: references by loading from /attachments/
  // This avoids sending huge base64 strings for large files!
  return quote;
}

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

// Update author (rename with auto-merge detection)
app.put("/api/authors/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    let { name, description, image } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL if provided
    if (image && !image.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    // Check if author exists
    const authorCheck = await client.query(
      "SELECT id, name, image FROM authors WHERE id = $1",
      [id]
    );
    
    if (authorCheck.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }
    
    const oldName = authorCheck.rows[0].name;
    
    // If name is being changed, check for merge
    if (name && name.trim() !== oldName) {
      const trimmedName = name.trim();
      
      // Check if target name already exists
      const existingAuthor = await client.query(
        "SELECT id, name FROM authors WHERE LOWER(name) = LOWER($1) AND id != $2",
        [trimmedName, id]
      );
      
      if (existingAuthor.rows.length > 0) {
        // Author with this name exists - need to merge
        const targetAuthorId = existingAuthor.rows[0].id;
        
        // Move all quotes from old author to existing author
        await client.query(
          "UPDATE quotes SET author_id = $1 WHERE author_id = $2",
          [targetAuthorId, id]
        );
        
        // Delete the old author
        await client.query("DELETE FROM authors WHERE id = $1", [id]);
        
        await client.query("COMMIT");
        
        return res.json({
          merged: true,
          oldName,
          newName: existingAuthor.rows[0].name,
          targetAuthorId,
          message: `Author "${oldName}" merged into existing author "${existingAuthor.rows[0].name}"`
        });
      }
    }
    
    // Simple update (rename and/or image update and/or description update)
    const result = await client.query(
      `UPDATE authors 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           image = COALESCE($3, image)
       WHERE id = $4
       RETURNING *`,
      [name?.trim(), description?.trim() || '', image, id]
    );

    await client.query("COMMIT");

    res.json({
      merged: false,
      oldName,
      newName: result.rows[0].name,
      author: result.rows[0],
      message: name ? `Author renamed from "${oldName}" to "${result.rows[0].name}"` : "Author updated"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating author:", error);
    res.status(500).json({ error: "Failed to update author" });
  } finally {
    client.release();
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

// Update source (rename with auto-merge detection)
app.put("/api/sources/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    let { name, image, type } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL if provided
    if (image && !image.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    // Check if source exists
    const sourceCheck = await client.query(
      "SELECT id, name, image, type FROM sources WHERE id = $1",
      [id]
    );
    
    if (sourceCheck.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }
    
    const oldName = sourceCheck.rows[0].name;
    
    // If name is being changed, check for merge
    if (name && name.trim() !== oldName) {
      const trimmedName = name.trim();
      
      // Check if target name already exists
      const existingSource = await client.query(
        "SELECT id, name FROM sources WHERE LOWER(name) = LOWER($1) AND id != $2",
        [trimmedName, id]
      );
      
      if (existingSource.rows.length > 0) {
        // Source with this name exists - need to merge
        const targetSourceId = existingSource.rows[0].id;
        
        // Move all quotes from old source to existing source
        await client.query(
          "UPDATE quotes SET source_id = $1 WHERE source_id = $2",
          [targetSourceId, id]
        );
        
        // Delete the old source
        await client.query("DELETE FROM sources WHERE id = $1", [id]);
        
        await client.query("COMMIT");
        
        return res.json({
          merged: true,
          oldName,
          newName: existingSource.rows[0].name,
          targetSourceId,
          message: `Source "${oldName}" merged into existing source "${existingSource.rows[0].name}"`
        });
      }
    }
    
    // Simple update (rename and/or image/type update)
    const result = await client.query(
      `UPDATE sources 
       SET name = COALESCE($1, name),
           image = COALESCE($2, image),
           type = COALESCE($3, type)
       WHERE id = $4
       RETURNING *`,
      [name?.trim(), image, type, id]
    );

    await client.query("COMMIT");

    res.json({
      merged: false,
      oldName,
      newName: result.rows[0].name,
      source: result.rows[0],
      message: name ? `Source renamed from "${oldName}" to "${result.rows[0].name}"` : "Source updated"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating source:", error);
    res.status(500).json({ error: "Failed to update source" });
  } finally {
    client.release();
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
    const { quote, author, source, tags, score, types, note_type, training_types, hasAuthor, hasSource, hasNote, hasTags, hasImage } = req.query;
    
    // Build filtered count query (with all filters)
    let query = `
      SELECT COUNT(*) as count
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    // Note type filter
    if (note_type) {
      query += ` AND q.note_type = $${paramCounter}`;
      params.push(note_type);
      paramCounter++;
    }

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
        query += ` AND EXISTS (
          SELECT 1 FROM quote_tags qt 
          JOIN tags t ON qt.tag_id = t.id 
          WHERE qt.quote_id = q.id AND t.name ILIKE $${paramCounter}
        )`;
        params.push(`%${tag}%`);
        paramCounter++;
      });
    }
    
    // Filter by types if provided (quote source types)
    if (types && note_type !== 'training') {
      const typeArray = types.split(",").filter((t) => t);
      const totalTypes = 6; // BOOK, MOVIE-TV, POETRY, LYRICS, JOKES, ASSORTED
      if (typeArray.length > 0 && typeArray.length < totalTypes) {
        // Only filter if not all selected
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(typeArray);
        paramCounter++;
      }
    }
    
    // Training types filter (for training notes)
    if (training_types && note_type === 'training') {
      const trainingTypeArray = training_types.split(",").filter((t) => t);
      if (trainingTypeArray.length > 0) {
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(trainingTypeArray);
        paramCounter++;
      }
    }
    
    // Year filter for training notes
    if (req.query.year) {
      query += ` AND EXTRACT(YEAR FROM q.note_date) = $${paramCounter}`;
      params.push(parseInt(req.query.year));
      paramCounter++;
    }
    
    // Month filter for training notes (only applies if year is also set)
    if (req.query.month && req.query.year) {
      query += ` AND EXTRACT(MONTH FROM q.note_date) = $${paramCounter}`;
      params.push(parseInt(req.query.month));
      paramCounter++;
    }

    // Score filter with enhanced syntax
    if (score) {
      // Enhanced score search syntax:
      // "5" = exact match (5)
      // "5+" = 5 and higher (5, 6)
      // "3-5" = range (3, 4, 5)
      
      if (score.includes('-')) {
        // Range: "3-5"
        const [min, max] = score.split('-').map(s => s.trim());
        if (min && max && !isNaN(min) && !isNaN(max)) {
          query += ` AND q.score >= $${paramCounter} AND q.score <= $${paramCounter + 1}`;
          params.push(min, max);
          paramCounter += 2;
        }
      } else if (score.endsWith('+')) {
        // Minimum: "5+"
        const min = score.replace('+', '').trim();
        if (min && !isNaN(min)) {
          query += ` AND q.score >= $${paramCounter}`;
          params.push(min);
          paramCounter++;
        }
      } else {
        // Exact match: "5"
        query += ` AND q.score = $${paramCounter}`;
        params.push(score.trim());
        paramCounter++;
      }
    }

    // Metadata filters
    if (hasAuthor === 'true') {
      query += ` AND q.author_id IS NOT NULL`;
    } else if (hasAuthor === 'false') {
      query += ` AND q.author_id IS NULL`;
    }

    if (hasSource === 'true') {
      query += ` AND q.source_id IS NOT NULL`;
    } else if (hasSource === 'false') {
      query += ` AND q.source_id IS NULL`;
    }

    if (hasNote === 'true') {
      query += ` AND q.note IS NOT NULL AND q.note != ''`;
    } else if (hasNote === 'false') {
      query += ` AND (q.note IS NULL OR q.note = '')`;
    }

    if (hasTags === 'true') {
      query += ` AND EXISTS (SELECT 1 FROM quote_tags WHERE quote_id = q.id)`;
    } else if (hasTags === 'false') {
      query += ` AND NOT EXISTS (SELECT 1 FROM quote_tags WHERE quote_id = q.id)`;
    }

    if (hasImage === 'true') {
      query += ` AND q.image IS NOT NULL AND q.image != ''`;
    } else if (hasImage === 'false') {
      query += ` AND (q.image IS NULL OR q.image = '')`;
    }

    // Get filtered count
    const filteredResult = await pool.query(query, params);
    const filteredCount = parseInt(filteredResult.rows[0].count);
    
    // Get type-specific total (only note_type filter, no other filters)
    let typeTotal = null;
    if (note_type) {
      const typeQuery = `SELECT COUNT(*) as count FROM quotes WHERE note_type = $1`;
      const typeResult = await pool.query(typeQuery, [note_type]);
      typeTotal = parseInt(typeResult.rows[0].count);
    }
    
    // Get grand total (no filters)
    const totalQuery = `SELECT COUNT(*) as count FROM quotes`;
    const totalResult = await pool.query(totalQuery);
    const grandTotal = parseInt(totalResult.rows[0].count);
    
    res.json({ 
      count: filteredCount,
      typeTotal: typeTotal,
      grandTotal: grandTotal
    });
  } catch (error) {
    console.error("Error fetching quote count:", error);
    res.status(500).json({ error: "Failed to fetch quote count" });
  }
});

// Get available years from training notes (MUST come before /api/quotes general route)
app.get("/api/quotes/training-years", async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT EXTRACT(YEAR FROM note_date) as year
      FROM quotes
      WHERE note_type = 'training' AND note_date IS NOT NULL
      ORDER BY year DESC
    `;
    const result = await pool.query(query);
    const years = result.rows.map(row => parseInt(row.year));
    res.json({ years });
  } catch (error) {
    console.error("Error fetching training years:", error);
    res.status(500).json({ error: "Failed to fetch training years" });
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
      score,
      date,
      types,
      note_type,
      training_types,
      translation_group,
      hasAuthor,
      hasSource,
      hasNote,
      hasTags,
      hasImage,
      limit = 20,
      offset = 0,
    } = req.query;
    
    let query = `
      SELECT DISTINCT q.*, 
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
      const searchTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
      console.log("Searching for tags:", searchTags); // Debug log
      
      if (searchTags.length > 0) {
        // Use the new tag system - search using JOIN
        query = query.replace(
          "FROM quotes q",
          `FROM quotes q
           INNER JOIN quote_tags qt ON q.id = qt.quote_id
           INNER JOIN tags t ON qt.tag_id = t.id`
        );
        
        // For each tag, require a match (AND logic)
        searchTags.forEach((tag) => {
          query += ` AND EXISTS (
            SELECT 1 FROM quote_tags qt2
            INNER JOIN tags t2 ON qt2.tag_id = t2.id
            WHERE qt2.quote_id = q.id AND t2.name ILIKE $${paramCounter}
          )`;
        params.push(`%${tag}%`);
        paramCounter++;
      });
      }
    }

    if (date) {
      query += ` AND q.date = $${paramCounter}`;
      params.push(date);
      paramCounter++;
    }

    if (score) {
      // Enhanced score search syntax:
      // "5" = exact match (5)
      // "5+" = 5 and higher (5, 6)
      // "3-5" = range (3, 4, 5)
      
      if (score.includes('-')) {
        // Range: "3-5"
        const [min, max] = score.split('-').map(s => s.trim());
        if (min && max && !isNaN(min) && !isNaN(max)) {
          query += ` AND q.score >= $${paramCounter} AND q.score <= $${paramCounter + 1}`;
          params.push(min, max);
          paramCounter += 2;
        }
      } else if (score.endsWith('+')) {
        // Minimum: "5+"
        const min = score.replace('+', '').trim();
        if (min && !isNaN(min)) {
          query += ` AND q.score >= $${paramCounter}`;
          params.push(min);
          paramCounter++;
        }
      } else {
        // Exact match: "5"
        query += ` AND q.score = $${paramCounter}`;
        params.push(score.trim());
        paramCounter++;
      }
    }
    
    // Filter by types if provided
    if (types) {
      const typeArray = types.split(",").filter((t) => t);
      const totalTypes = 6; // BOOK, MOVIE-TV, POETRY, LYRICS, JOKES, ASSORTED
      if (typeArray.length > 0 && typeArray.length < totalTypes) {
        // Only filter if not all selected
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(typeArray);
        paramCounter++;
      }
    }

    // Metadata filters
    if (hasAuthor === 'true') {
      query += ` AND q.author_id IS NOT NULL`;
    } else if (hasAuthor === 'false') {
      query += ` AND q.author_id IS NULL`;
    }

    if (hasSource === 'true') {
      query += ` AND q.source_id IS NOT NULL`;
    } else if (hasSource === 'false') {
      query += ` AND q.source_id IS NULL`;
    }

    if (hasNote === 'true') {
      query += ` AND q.note IS NOT NULL AND q.note != ''`;
    } else if (hasNote === 'false') {
      query += ` AND (q.note IS NULL OR q.note = '')`;
    }

    if (hasTags === 'true') {
      query += ` AND EXISTS (SELECT 1 FROM quote_tags WHERE quote_id = q.id)`;
    } else if (hasTags === 'false') {
      query += ` AND NOT EXISTS (SELECT 1 FROM quote_tags WHERE quote_id = q.id)`;
    }

    if (hasImage === 'true') {
      query += ` AND q.image IS NOT NULL AND q.image != ''`;
    } else if (hasImage === 'false') {
      query += ` AND (q.image IS NULL OR q.image = '')`;
    }
    
    // Translation group filter
    if (translation_group) {
      query += ` AND q.translation_group = $${paramCounter}`;
      params.push(translation_group);
      paramCounter++;
    }
    
    // Note type filter
    if (note_type) {
      query += ` AND q.note_type = $${paramCounter}`;
      params.push(note_type);
      paramCounter++;
    }
    
    // Training types filter (like source types but for training notes)
    if (training_types) {
      const trainingTypeArray = training_types.split(",").filter((t) => t);
      if (trainingTypeArray.length > 0) {
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(trainingTypeArray);
        paramCounter++;
      }
    }
    
    // Year filter for training notes
    if (req.query.year) {
      query += ` AND EXTRACT(YEAR FROM q.note_date) = $${paramCounter}`;
      params.push(parseInt(req.query.year));
      paramCounter++;
    }
    
    // Month filter for training notes (only applies if year is also set)
    if (req.query.month && req.query.year) {
      query += ` AND EXTRACT(MONTH FROM q.note_date) = $${paramCounter}`;
      params.push(parseInt(req.query.month));
      paramCounter++;
    }

    // Sort by note_date for training notes (newest first), otherwise by updated_at
    if (note_type === 'training') {
      query += ` ORDER BY q.note_date DESC, q.updated_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    } else {
      query += ` ORDER BY q.updated_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    }
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Add tags to each quote
    if (result.rows.length > 0) {
      const hasNewTables = await checkTagTablesExist();
      
      if (hasNewTables) {
        const quoteIds = result.rows.map(q => q.id);
        const tagsMap = await getTagsForQuotes(quoteIds);
        
        const quotesWithTags = result.rows.map(quote => {
          const quoteTags = tagsMap.get(quote.id) || [];
          // Retrieve images from hybrid storage
          const quoteWithImages = retrieveQuoteImages(quote);
          return {
            ...quoteWithImages,
            tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (quote.tags || ""),
            tag_objects: quoteTags,
          };
        });
        
        res.json(quotesWithTags);
      } else {
        // Fallback: tags already in quote.tags from old column
        // Still need to retrieve images
        const quotesWithImages = result.rows.map(retrieveQuoteImages);
        res.json(quotesWithImages);
      }
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

// Get random quote (must be before /:id route)
app.get("/api/quotes/random", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.note_type = 'quote'
      ORDER BY RANDOM()
      LIMIT 1
    `
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No quotes found" });
    }

    // Add tags to response
    const hasNewTables = await checkTagTablesExist();
    if (hasNewTables) {
      const quoteTags = await getTagsForQuote(result.rows[0].id);
      // Retrieve images from hybrid storage
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      const quoteWithTags = {
        ...quoteWithImages,
        tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (result.rows[0].tags || ""),
        tag_objects: quoteTags,
      };
      res.json(quoteWithTags);
    } else {
      // Fallback: use tags from old column, but still retrieve images
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      res.json(quoteWithImages);
    }
  } catch (error) {
    console.error("Error fetching random quote:", error);
    res.status(500).json({ error: "Failed to fetch random quote" });
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

    // Add tags to response
    const hasNewTables = await checkTagTablesExist();
    if (hasNewTables) {
      const quoteTags = await getTagsForQuote(id);
      // Retrieve images from hybrid storage
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      const quoteWithTags = {
        ...quoteWithImages,
        tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (result.rows[0].tags || ""),
        tag_objects: quoteTags,
      };
      res.json(quoteWithTags);
    } else {
      // Fallback: use tags from old column, but still retrieve images
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      res.json(quoteWithImages);
    }
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
      attachment_type = "image",
      note = "",
      score = null,
      note_type = "quote",
      note_date = null,
      translation_group = null,
      storageThresholdMB = 1, // From frontend settings
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

    // Create the quote - still store tags column for backward compatibility
    // Insert the quote first to get ID
    const result = await client.query(
      `INSERT INTO quotes (quote, author_id, source_id, note, type, score, note_type, note_date, translation_group) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [quote, authorId, sourceId, note, sourceType, score, note_type, note_date, translation_group],
    );

    const quoteId = result.rows[0].id;

    // Process attachments with hybrid storage using user's threshold
    const processedImage = fileStorage.processForStorage(image, 'quotes', quoteId, '', storageThresholdMB);
    const processedImageFull = fileStorage.processForStorage(image_full, 'quotes', quoteId, '_full', storageThresholdMB);

    console.log(`📦 Quote ${quoteId} attachment processing (type: ${attachment_type}, threshold: ${storageThresholdMB} MB):`);
    console.log(`   Thumbnail: ${image ? `${(image.length/1024).toFixed(0)}KB` : 'none'} → ${processedImage ? (processedImage.startsWith('file:') ? processedImage : `${(processedImage.length/1024).toFixed(0)}KB base64`) : 'none'}`);
    console.log(`   Full: ${image_full ? `${(image_full.length/1024/1024).toFixed(2)}MB` : 'none'} → ${processedImageFull ? (processedImageFull.startsWith('file:') ? processedImageFull : `${(processedImageFull.length/1024).toFixed(0)}KB base64`) : 'none'}`);

    // Update quote with processed attachments and attachment type
    await client.query(
      `UPDATE quotes SET image = $1, image_full = $2, attachment_type = $3 WHERE id = $4`,
      [processedImage, processedImageFull, attachment_type, quoteId]
    );

    // Handle tags using new tag system (if tables exist)
    const tagNames = parseTagInput(tags);
    if (tagNames.length > 0) {
      const tagIds = await getOrCreateTagIds(tagNames, client);
      if (tagIds.length > 0) {
        await associateTagsWithQuote(quoteId, tagIds, client);
      }
    }

    await client.query("COMMIT");

    // Fetch the complete quote with author, source, and tags
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
      [quoteId],
    );

    // Add tags to response
    const quoteTags = await getTagsForQuote(quoteId);
    // Retrieve images from hybrid storage
    const quoteWithImages = retrieveQuoteImages(completeQuote.rows[0]);
    const quoteWithTags = {
      ...quoteWithImages,
      tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : "",
      tag_objects: quoteTags,
    };
    res.status(201).json(quoteWithTags);
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
      attachment_type,
      note,
      score,
      note_type,
      note_date,
      translation_group,
      storageThresholdMB = 1, // From frontend settings
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

    // Handle tags
    let tagsToUpdate = null;
    if (tags !== undefined) {
      tagsToUpdate = tags;
    }

    // Process images through hybrid storage if provided
    if (image !== undefined && image) {
      const processedImage = fileStorage.processForStorage(image, 'quotes', id, '', storageThresholdMB);
      updateFields.push(`image = $${paramCounter}`);
      params.push(processedImage);
      paramCounter++;
    } else if (image !== undefined) {
      // Empty string means clear the image
      updateFields.push(`image = $${paramCounter}`);
      params.push(image);
      paramCounter++;
    }

    if (image_full !== undefined && image_full) {
      const processedImageFull = fileStorage.processForStorage(image_full, 'quotes', id, '_full', storageThresholdMB);
      updateFields.push(`image_full = $${paramCounter}`);
      params.push(processedImageFull);
      paramCounter++;
    } else if (image_full !== undefined) {
      // Empty string means clear the image
      updateFields.push(`image_full = $${paramCounter}`);
      params.push(image_full);
      paramCounter++;
    }

    if (note !== undefined) {
      updateFields.push(`note = $${paramCounter}`);
      params.push(note);
      paramCounter++;
    }

    if (score !== undefined) {
      updateFields.push(`score = $${paramCounter}`);
      params.push(score);
      paramCounter++;
    }
    
    if (sourceType !== undefined) {
      updateFields.push(`type = $${paramCounter}`);
      params.push(sourceType);
      paramCounter++;
    }
    
    if (attachment_type !== undefined) {
      updateFields.push(`attachment_type = $${paramCounter}`);
      params.push(attachment_type);
      paramCounter++;
    }
    
    if (note_type !== undefined) {
      updateFields.push(`note_type = $${paramCounter}`);
      params.push(note_type);
      paramCounter++;
    }
    
    if (note_date !== undefined) {
      updateFields.push(`note_date = $${paramCounter}`);
      params.push(note_date);
      paramCounter++;
    }
    
    // Handle translation_group with rename propagation
    let oldTranslationGroup = null;
    if (translation_group !== undefined) {
      // First, get the current translation_group value
      const currentQuote = await client.query(
        'SELECT translation_group FROM quotes WHERE id = $1',
        [id]
      );
      
      if (currentQuote.rows.length > 0) {
        oldTranslationGroup = currentQuote.rows[0].translation_group;
        
        // If translation_group is changing (and old one exists), update all quotes in the old group
        if (oldTranslationGroup && oldTranslationGroup !== translation_group) {
          console.log(`Renaming translation group "${oldTranslationGroup}" to "${translation_group}" for all quotes in group`);
          await client.query(
            `UPDATE quotes 
             SET translation_group = $1 
             WHERE translation_group = $2`,
            [translation_group, oldTranslationGroup]
          );
        }
      }
      
      updateFields.push(`translation_group = $${paramCounter}`);
      params.push(translation_group);
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

    // Handle tags update if provided (only if new tables exist)
    if (tagsToUpdate !== null) {
      console.log("UPDATE TAGS - Input:", tagsToUpdate);
      const tagNames = parseTagInput(tagsToUpdate);
      console.log("UPDATE TAGS - Parsed tag names:", tagNames);
      const tagIds = await getOrCreateTagIds(tagNames, client);
      console.log("UPDATE TAGS - Tag IDs:", tagIds);
      
      // Always update associations, even if empty (to clear tags)
      if (tagIds.length > 0) {
        await associateTagsWithQuote(id, tagIds, client);
        console.log("UPDATE TAGS - Associated tags with quote");
      } else {
        // Clear all tag associations if no tags provided
        const hasNewTables = await checkTagTablesExist();
        if (hasNewTables) {
          await client.query("DELETE FROM quote_tags WHERE quote_id = $1", [id]);
          console.log("UPDATE TAGS - Cleared all tag associations");
        }
      }
    }

    await client.query("COMMIT");

    // Fetch the complete quote with author, source, and tags
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

    // Add tags to response
    const hasNewTables = await checkTagTablesExist();
    if (hasNewTables) {
      const quoteTags = await getTagsForQuote(id);
      // Retrieve images from hybrid storage
      const quoteWithImages = retrieveQuoteImages(completeQuote.rows[0]);
      const quoteWithTags = {
        ...quoteWithImages,
        tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (completeQuote.rows[0].tags || ""),
        tag_objects: quoteTags,
      };
      res.json(quoteWithTags);
    } else {
      // Fallback: use tags from old column, but still retrieve images
      const quoteWithImages = retrieveQuoteImages(completeQuote.rows[0]);
      res.json(quoteWithImages);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating quote:", error);
    res.status(500).json({ error: "Failed to update quote" });
  } finally {
    client.release();
  }
});

// Downscale and move image from external storage to DB
app.post("/api/quotes/:id/downscale-image", async (req, res) => {
  try {
    const { id } = req.params;
    const { image, image_full, oldFilePath } = req.body;
    
    console.log(`📦 Downscaling and moving external image to DB for quote ${id}`);
    console.log(`   Old file: ${oldFilePath}`);
    console.log(`   New size: ${(image_full.length / 1024).toFixed(0)} KB`);
    
    // Update quote with new base64 images (no need to process, already downscaled)
    await pool.query(
      `UPDATE quotes SET image = $1, image_full = $2 WHERE id = $3`,
      [image, image_full, id]
    );
    
    // Delete old files from attachments
    if (oldFilePath) {
      // Delete the full-size image
      fileStorage.deleteFromFilesystem(oldFilePath);
      
      // Also delete the thumbnail if it exists
      const thumbPath = oldFilePath.replace('_full.jpg', '.jpg');
      fileStorage.deleteFromFilesystem(thumbPath);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error downscaling image:", error);
    res.status(500).json({ error: "Failed to downscale image" });
  }
});

// Get translations for a quote (by translation_group)
app.get("/api/quotes/:id/translations", async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the translation_group of this quote
    const quoteResult = await pool.query(
      "SELECT translation_group, language FROM quotes WHERE id = $1",
      [id]
    );
    
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    const { translation_group, language: currentLanguage } = quoteResult.rows[0];
    
    if (!translation_group) {
      // No translation group - return empty array
      return res.json([]);
    }
    
    // Get all quotes in the same translation group (except this one)
    const result = await pool.query(
      `SELECT q.id, q.quote, q.language, q.type,
              a.name as author_name,
              s.name as source_name
       FROM quotes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.translation_group = $1 AND q.id != $2
       ORDER BY q.language`,
      [translation_group, id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching translations:", error);
    res.status(500).json({ error: "Failed to fetch translations" });
  }
});

// Delete quote
app.delete("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, fetch the quote to get image references
    const quote = await pool.query("SELECT image, image_full FROM quotes WHERE id = $1", [id]);
    
    if (quote.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    // Delete external files if they exist (no-op if base64)
    fileStorage.deleteAttachment(quote.rows[0].image);
    fileStorage.deleteAttachment(quote.rows[0].image_full);
    
    // Delete the quote from database
    const result = await pool.query(
      "DELETE FROM quotes WHERE id = $1 RETURNING *",
      [id],
    );

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
      SELECT t.id, t.name, COUNT(qt.quote_id)::int as quote_count
      FROM tags t
      LEFT JOIN quote_tags qt ON t.id = qt.tag_id
      GROUP BY t.id, t.name
      ORDER BY t.name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// Create new tag
app.post("/api/tags", async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }
    
    const result = await pool.query(
      `INSERT INTO tags (name) 
       VALUES ($1) 
       ON CONFLICT (name) DO UPDATE SET name = tags.name
       RETURNING *`,
      [name.trim()]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating tag:", error);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// Rename tag (with auto-merge detection)
app.put("/api/tags/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }
    
    const trimmedName = name.trim();
    
    // Check if tag exists
    const tagCheck = await client.query(
      "SELECT id, name FROM tags WHERE id = $1",
      [id]
    );
    
    if (tagCheck.rows.length === 0) {
      return res.status(404).json({ error: "Tag not found" });
    }
    
    const oldName = tagCheck.rows[0].name;
    
    // Check if target name already exists
    const existingTag = await client.query(
      "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1) AND id != $2",
      [trimmedName, id]
    );
    
    if (existingTag.rows.length > 0) {
      // Tag with this name exists - need to merge
      const targetTagId = existingTag.rows[0].id;
      
      // Move all quote associations from old tag to existing tag
      await client.query(`
        INSERT INTO quote_tags (quote_id, tag_id)
        SELECT quote_id, $1
        FROM quote_tags
        WHERE tag_id = $2
        ON CONFLICT (quote_id, tag_id) DO NOTHING
      `, [targetTagId, id]);
      
      // Delete the old tag (cascade will remove old associations)
      await client.query("DELETE FROM tags WHERE id = $1", [id]);
      
      await client.query("COMMIT");
      
      return res.json({
        merged: true,
        oldName,
        newName: existingTag.rows[0].name,
        targetTagId,
        message: `Tag "${oldName}" merged into existing tag "${existingTag.rows[0].name}"`
      });
    } else {
      // Simple rename
      await client.query(
        "UPDATE tags SET name = $1 WHERE id = $2",
        [trimmedName, id]
      );
      
      await client.query("COMMIT");
      
      return res.json({
        merged: false,
        oldName,
        newName: trimmedName,
        message: `Tag renamed from "${oldName}" to "${trimmedName}"`
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error renaming tag:", error);
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
    
    // Get quotes that have this tag before deleting
    const quotesWithTag = await client.query(
      "SELECT quote_id FROM quote_tags WHERE tag_id = $1",
      [id]
    );
    const affectedQuoteIds = quotesWithTag.rows.map(row => row.quote_id);
    
    // Delete the tag (CASCADE will remove quote_tags entries)
    const result = await client.query(
      "DELETE FROM tags WHERE id = $1 RETURNING name",
      [id]
    );
    
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Tag not found" });
    }
    
    // Update the old tags column for affected quotes
    for (const quoteId of affectedQuoteIds) {
      const remainingTags = await client.query(
        `SELECT t.name FROM tags t 
         JOIN quote_tags qt ON t.id = qt.tag_id 
         WHERE qt.quote_id = $1 
         ORDER BY t.name`,
        [quoteId]
      );
    }
    
    await client.query("COMMIT");
    
    res.json({ 
      message: `Tag "${result.rows[0].name}" deleted successfully` 
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting tag:", error);
    res.status(500).json({ error: "Failed to delete tag" });
  } finally {
    client.release();
  }
});

// Add tag to all quotes that have another tag
app.post("/api/tags/bulk-add", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { sourceTagId, targetTagId } = req.body;
    
    if (!sourceTagId || !targetTagId) {
      return res.status(400).json({ error: "Both source and target tag IDs are required" });
    }
    
    if (sourceTagId === targetTagId) {
      return res.status(400).json({ error: "Source and target tags cannot be the same" });
    }
    
    // Get tag names for response
    const tagsInfo = await client.query(
      "SELECT id, name FROM tags WHERE id = ANY($1)",
      [[sourceTagId, targetTagId]]
    );
    
    if (tagsInfo.rows.length !== 2) {
      return res.status(404).json({ error: "One or both tags not found" });
    }
    
    const sourceTag = tagsInfo.rows.find(t => t.id == sourceTagId);
    const targetTag = tagsInfo.rows.find(t => t.id == targetTagId);
    
    // Add target tag to all quotes that have source tag (if not already present)
    const result = await client.query(`
      INSERT INTO quote_tags (quote_id, tag_id)
      SELECT qt.quote_id, $1
      FROM quote_tags qt
      WHERE qt.tag_id = $2
      ON CONFLICT (quote_id, tag_id) DO NOTHING
      RETURNING quote_id
    `, [targetTagId, sourceTagId]);
    
    const affectedCount = result.rows.length;
    
    await client.query("COMMIT");
    
    res.json({
      success: true,
      affectedCount,
      sourceTag: sourceTag.name,
      targetTag: targetTag.name,
      message: `Added tag "${targetTag.name}" to ${affectedCount} quote(s) that have tag "${sourceTag.name}"`
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error bulk adding tag:", error);
    res.status(500).json({ error: "Failed to bulk add tag" });
  } finally {
    client.release();
  }
});

// ============= DATA EXPORT/IMPORT (JSON) =============

// Export all data as JSON
app.get("/api/export/json", async (req, res) => {
  try {
    const { note_type } = req.query;
    const noteTypeFilter = note_type ? `WHERE q.note_type = $1` : '';
    const queryParams = note_type ? [note_type] : [];
    
    console.log(`JSON export requested... (note_type: ${note_type || 'all'})`);

    // Fetch all quotes with full details (filtered by note_type if provided)
    const quotesQuery = `
      SELECT q.*, 
             a.name as author_name, 
             s.name as source_name
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      ${noteTypeFilter}
      ORDER BY q.id
    `;
    
    const quotesResult = note_type 
      ? await pool.query(quotesQuery, queryParams)
      : await pool.query(quotesQuery);

    // Get unique author and source IDs from the filtered quotes
    const authorIds = [...new Set(quotesResult.rows.map(q => q.author_id).filter(id => id !== null))];
    const sourceIds = [...new Set(quotesResult.rows.map(q => q.source_id).filter(id => id !== null))];
    
    // Fetch only the authors and sources used by these quotes
    let authorsResult = { rows: [] };
    let sourcesResult = { rows: [] };
    
    if (authorIds.length > 0) {
      authorsResult = await pool.query(
        "SELECT * FROM authors WHERE id = ANY($1) ORDER BY id",
        [authorIds]
      );
    }
    
    if (sourceIds.length > 0) {
      sourcesResult = await pool.query(
        "SELECT * FROM sources WHERE id = ANY($1) ORDER BY id",
        [sourceIds]
      );
    }

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      noteTypeFilter: note_type || 'all',
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
      `Exported ${exportData.counts.authors} authors, ${exportData.counts.sources} sources, ${exportData.counts.quotes} quotes (note_type: ${note_type || 'all'})`,
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
    // Get storage threshold from settings
    const storageThresholdMB = options?.storageThresholdMB || 1;
    
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
            const quoteId = existing.rows[0].id;
            const noteType = quote.note_type || 'quote';
            const storageFolder = noteType === 'training' ? 'training' : noteType === 'note' ? 'notes' : noteType === 'puzzle' ? 'puzzles' : 'quotes';
            
            // Process attachments through storage system (respects 1 MB threshold)
            const processedImage = fileStorage.processForStorage(quote.image, storageFolder, quoteId, '', storageThresholdMB);
            const processedImageFull = fileStorage.processForStorage(quote.image_full, storageFolder, quoteId, '_full', storageThresholdMB);
            
            await client.query(
              `UPDATE quotes 
               SET source_id = $1, type = $2, image = $3, image_full = $4, note = $5, note_type = $6, note_date = $7, 
                   attachment_type = $8, updated_at = CURRENT_TIMESTAMP
               WHERE id = $9`,
              [
                sourceId,
                quote.type,
                processedImage,
                processedImageFull,
                quote.note,
                noteType,
                quote.note_date || null,
                quote.attachment_type || null,
                quoteId,
              ],
            );
            stats.quotes.updated++;
          } else {
            stats.quotes.skipped++;
          }
        } else {
          // First insert without images to get the ID
          const noteType = quote.note_type || 'quote';
          const insertResult = await client.query(
            `INSERT INTO quotes (quote, author_id, source_id, type, note, note_type, note_date, 
                                 attachment_type, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              quote.quote,
              authorId,
              sourceId,
              quote.type,
              quote.note,
              noteType,
              quote.note_date || null,
              quote.attachment_type || null,
              quote.created_at || new Date(),
              quote.updated_at || new Date(),
            ],
          );
          
          const quoteId = insertResult.rows[0].id;
          const storageFolder = noteType === 'training' ? 'training' : noteType === 'note' ? 'notes' : noteType === 'puzzle' ? 'puzzles' : 'quotes';
          
          // Now process attachments with the quote ID (respects 1 MB threshold)
          const processedImage = fileStorage.processForStorage(quote.image, storageFolder, quoteId, '', storageThresholdMB);
          const processedImageFull = fileStorage.processForStorage(quote.image_full, storageFolder, quoteId, '_full', storageThresholdMB);
          
          // Update with processed attachment references
          if (processedImage || processedImageFull) {
            await client.query(
              `UPDATE quotes SET image = $1, image_full = $2 WHERE id = $3`,
              [processedImage, processedImageFull, quoteId]
            );
          }
          
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
        // Use thumbnail (image) instead of full size
        const quoteImage = quote.image || quote.image_full;
        
        authorsHtml += `
          <div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-left: 3px solid #3b82f6; border-radius: 3px; display: flex; gap: 12px;">
            ${quoteImage ? `<div style="flex-shrink: 0;"><img src="${quoteImage}" style="width: 120px; height: auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>` : ''}
            <div style="flex: 1;">
              <div style="margin: 0 0 8px 0; font-style: italic; color: #1f2937; line-height: 1.5; font-size: 11pt;">${quote.quote}</div>
              ${quote.tags ? `<p style="margin: 4px 0 0 0; font-size: 9pt; color: #6b7280;">Tags: ${escapeHtml(quote.tags)}</p>` : ""}
            </div>
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
async function startServer() {
  try {
    // Run migrations on startup
    console.log('🔄 Running database migrations...');
    const { runMigrations } = require('../migrations/run-migrations');
    await runMigrations();
    console.log('✅ Migrations completed\n');
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Network: http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
