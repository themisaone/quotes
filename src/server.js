const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for image uploads
app.use(express.static(path.join(__dirname, '../public')));

// ============= AUTHORS API =============

// Get all authors (with optional search)
app.get('/api/authors', async (req, res) => {
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
            query += ' WHERE a.name ILIKE $1';
            params.push(`%${search}%`);
        }

        query += ' GROUP BY a.id ORDER BY a.name ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching authors:', error);
        res.status(500).json({ error: 'Failed to fetch authors' });
    }
});

// Get single author
app.get('/api/authors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT a.*, COUNT(q.id) as quote_count 
      FROM authors a 
      LEFT JOIN quotes q ON a.id = q.author_id 
      WHERE a.id = $1 
      GROUP BY a.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Author not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching author:', error);
    res.status(500).json({ error: 'Failed to fetch author' });
  }
});

// Create or get author
app.post('/api/authors', async (req, res) => {
  try {
    const { name, image = '' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Author name is required' });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO authors (name, image) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), authors.image)
       RETURNING *`,
      [name.trim(), image]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating author:', error);
    res.status(500).json({ error: 'Failed to create author' });
  }
});

// Update author
app.put('/api/authors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let { name, image } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL
    if (image && !image.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const result = await pool.query(
      `UPDATE authors 
       SET name = COALESCE($1, name),
           image = COALESCE($2, image)
       WHERE id = $3
       RETURNING *`,
      [name, image, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Author not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating author:', error);
    res.status(500).json({ error: 'Failed to update author' });
  }
});

// Delete author (only if no quotes)
app.delete('/api/authors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if author has any quotes
    const quoteCheck = await pool.query(
      'SELECT COUNT(*) as count FROM quotes WHERE author_id = $1',
      [id]
    );
    
    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete author with existing quotes' });
    }
    
    const result = await pool.query(
      'DELETE FROM authors WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Author not found' });
    }
    
    res.json({ message: 'Author deleted successfully' });
  } catch (error) {
    console.error('Error deleting author:', error);
    res.status(500).json({ error: 'Failed to delete author' });
  }
});

// ============= SOURCES API =============

// Get all sources (with optional search and type filter)
app.get('/api/sources', async (req, res) => {
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

        query += ' GROUP BY s.id ORDER BY s.name ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({ error: 'Failed to fetch sources' });
    }
});

// Get single source
app.get('/api/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.*, COUNT(q.id) as quote_count 
      FROM sources s 
      LEFT JOIN quotes q ON s.id = q.source_id 
      WHERE s.id = $1 
      GROUP BY s.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching source:', error);
    res.status(500).json({ error: 'Failed to fetch source' });
  }
});

// Create or get source
app.post('/api/sources', async (req, res) => {
  try {
    const { name, image = '', type = 'BOOK' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Source name is required' });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO sources (name, image, type) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), sources.image), type = COALESCE(NULLIF($3, ''), sources.type)
       RETURNING *`,
      [name.trim(), image, type]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating source:', error);
    res.status(500).json({ error: 'Failed to create source' });
  }
});

// Update source
app.put('/api/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let { name, image, type } = req.body;

    // Image is already resized on client-side, no need to process again
    // Just validate it's a data URL
    if (image && !image.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const result = await pool.query(
      `UPDATE sources 
       SET name = COALESCE($1, name),
           image = COALESCE($2, image),
           type = COALESCE($3, type)
       WHERE id = $4
       RETURNING *`,
      [name, image, type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// Delete source (only if no quotes)
app.delete('/api/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if source has any quotes
    const quoteCheck = await pool.query(
      'SELECT COUNT(*) as count FROM quotes WHERE source_id = $1',
      [id]
    );
    
    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete source with existing quotes' });
    }
    
    const result = await pool.query(
      'DELETE FROM sources WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// ============= QUOTES API =============

// Get total quote count
app.get('/api/quotes/count', async (req, res) => {
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
      const searchTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      searchTags.forEach(tag => {
        query += ` AND q.tags ILIKE $${paramCounter}`;
        params.push(`%${tag}%`);
        paramCounter++;
      });
    }
    
    // Filter by types if provided
    if (types) {
      const typeArray = types.split(',').filter(t => t);
      if (typeArray.length > 0 && typeArray.length < 3) { // Only filter if not all selected
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(typeArray);
        paramCounter++;
      }
    }

    const result = await pool.query(query, params);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching quote count:', error);
    res.status(500).json({ error: 'Failed to fetch quote count' });
  }
});

// Get all quotes with optional filtering (with author and source details)
app.get('/api/quotes', async (req, res) => {
  try {
    const { quote, author, source, tags, date, types, limit = 20, offset = 0 } = req.query;
    
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
      const searchTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      console.log('Searching for tags:', searchTags); // Debug log
      searchTags.forEach(tag => {
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
      const typeArray = types.split(',').filter(t => t);
      if (typeArray.length > 0 && typeArray.length < 3) { // Only filter if not all selected
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
    console.error('Error fetching quotes:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Get single quote by ID
app.get('/api/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Create new quote
app.post('/api/quotes', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { quote, author, source, sourceType = 'BOOK', tags = '', image = '', image_full = '', note = '' } = req.body;
    
    if (!quote) {
      return res.status(400).json({ error: 'Quote text is required' });
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
        [author.trim()]
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
        [source.trim(), sourceType]
      );
      sourceId = sourceResult.rows[0].id;
    }

    // Create the quote - store type in quotes table now
    const result = await client.query(
      `INSERT INTO quotes (quote, author_id, source_id, tags, image, image_full, note, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [quote, authorId, sourceId, tags, image, image_full, note, sourceType]
    );

    await client.query('COMMIT');

    // Fetch the complete quote with author and source details
    const completeQuote = await pool.query(`
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(completeQuote.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating quote:', error);
    res.status(500).json({ error: 'Failed to create quote' });
  } finally {
    client.release();
  }
});

// Update quote
app.put('/api/quotes/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { quote, author, source, sourceType, sourceId, tags, image, image_full, note } = req.body;
    
    console.log('UPDATE QUOTE - Received data:', { id, source, sourceType, sourceId });

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
          [author.trim()]
        );
        authorId = authorResult.rows[0].id;
      }
    }

    // Handle source update - simpler now since type is stored in quotes table
    if (source !== undefined) {
      console.log('Processing source update:', { source, sourceType, sourceId });
      if (source && source.trim()) {
        // Create or get source by name
        const sourceResult = await client.query(
          `INSERT INTO sources (name, type) 
           VALUES ($1, $2) 
           ON CONFLICT (name) DO UPDATE SET name = sources.name
           RETURNING id`,
          [source.trim(), sourceType || 'BOOK']
        );
        newSourceId = sourceResult.rows[0].id;
        console.log('Source processed:', newSourceId);
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
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const result = await client.query(
      `UPDATE quotes SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await client.query('COMMIT');

    // Fetch the complete quote with author and source details
    const completeQuote = await pool.query(`
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM quotes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `, [id]);

    res.json(completeQuote.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating quote:', error);
    res.status(500).json({ error: 'Failed to update quote' });
  } finally {
    client.release();
  }
});

// Delete quote
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM quotes WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ message: 'Quote deleted successfully', quote: result.rows[0] });
  } catch (error) {
    console.error('Error deleting quote:', error);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

// ============= TAGS API =============

// Get all tags with quote counts
app.get('/api/tags', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tags FROM quotes WHERE tags IS NOT NULL AND tags != ''
    `);
    
    // Parse tags and count them
    const tagCounts = {};
    result.rows.forEach(row => {
      const tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    // Convert to array and sort by count (descending)
    const tagsArray = Object.entries(tagCounts).map(([name, count]) => ({
      name,
      quote_count: count
    })).sort((a, b) => b.quote_count - a.quote_count);
    
    res.json(tagsArray);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
