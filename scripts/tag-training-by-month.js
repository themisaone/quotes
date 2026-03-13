#!/usr/bin/env node
/**
 * Tag Training Notes by Month
 * 
 * This script tags all training notes with their corresponding month name
 * based on the note_date field.
 * 
 * Usage: node scripts/tag-training-by-month.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'quotes_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function tagTrainingByMonth() {
  console.log('🏋️ Starting to tag training notes by month...\n');
  
  const client = await pool.connect();
  
  try {
    // Read and execute the SQL script
    const sqlPath = path.join(__dirname, 'tag-training-by-month.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
tagTrainingByMonth();
