#!/usr/bin/env node

/**
 * Add YEAR tags to all training notes based on their note_date
 * 
 * This script automatically creates year tags (e.g., "2014", "2015", etc.)
 * and associates them with training notes based on the note_date field.
 * 
 * Usage: node scripts/add-year-tags.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'quotes_db',
  user: process.env.DB_USER || 'lewel_admin',
  password: process.env.DB_PASSWORD || 'lewel_admin_dev',
});

async function addYearTags() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔍 Finding all training notes with dates...');
    
    // Get all training notes with dates
    const notesResult = await client.query(`
      SELECT id, note_date, comment
      FROM notes
      WHERE note_type = 'training'
        AND note_date IS NOT NULL
      ORDER BY note_date
    `);
    
    console.log(`📊 Found ${notesResult.rows.length} training notes with dates\n`);
    
    const yearStats = {};
    let totalTagsAdded = 0;
    
    for (const note of notesResult.rows) {
      const year = new Date(note.note_date).getFullYear().toString();
      
      // Find or create year tag
      const tagResult = await client.query(`
        INSERT INTO tags (name, type)
        VALUES ($1, 'training')
        ON CONFLICT (name, type) DO UPDATE SET name = tags.name
        RETURNING id
      `, [year]);
      
      const tagId = tagResult.rows[0].id;
      
      // Check if note already has this tag
      const existingResult = await client.query(`
        SELECT 1 FROM note_tags
        WHERE note_id = $1 AND tag_id = $2
      `, [note.id, tagId]);
      
      if (existingResult.rows.length === 0) {
        // Add tag to note
        await client.query(`
          INSERT INTO note_tags (note_id, tag_id)
          VALUES ($1, $2)
        `, [note.id, tagId]);
        
        if (!yearStats[year]) {
          yearStats[year] = 0;
        }
        yearStats[year]++;
        totalTagsAdded++;
        
        console.log(`  ✓ Added "${year}" tag to: ${note.comment?.substring(0, 50)}...`);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Done!`);
    console.log(`\n📊 Summary by year:`);
    Object.keys(yearStats).sort().forEach(year => {
      console.log(`   ${year}: ${yearStats[year]} notes tagged`);
    });
    console.log(`\n   Total tags added: ${totalTagsAdded}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addYearTags().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
