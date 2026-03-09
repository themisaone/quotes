/**
 * Cleanup duplicate attachment data
 * 
 * For non-image attachments (PDFs, Excel, etc.), the old import script
 * stored the SAME data in both 'image' and 'image_full' fields.
 * 
 * This script cleans up by setting 'image' to NULL for non-image attachments,
 * keeping only 'image_full' (which is what we display).
 * 
 * This can significantly reduce database size for training notes with PDFs.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function cleanupDuplicateAttachments() {
  console.log('🧹 Starting cleanup of duplicate attachment data...\n');
  
  try {
    // First, show what we'll be cleaning
    const countQuery = `
      SELECT 
        attachment_type,
        COUNT(*) as count,
        SUM(LENGTH(image)) / 1024 / 1024 as total_mb
      FROM quotes
      WHERE attachment_type IS NOT NULL 
        AND attachment_type != 'image'
        AND image IS NOT NULL
      GROUP BY attachment_type
    `;
    
    const countResult = await pool.query(countQuery);
    
    if (countResult.rows.length === 0) {
      console.log('✅ No duplicate data found - database is already clean!');
      await pool.end();
      return;
    }
    
    console.log('📊 Found duplicate data for non-image attachments:\n');
    let totalMB = 0;
    countResult.rows.forEach(row => {
      console.log(`   ${row.attachment_type}: ${row.count} notes, ~${parseFloat(row.total_mb).toFixed(2)} MB wasted`);
      totalMB += parseFloat(row.total_mb);
    });
    console.log(`\n   💾 Total wasted space: ~${totalMB.toFixed(2)} MB\n`);
    
    // Now clean up
    console.log('🔄 Cleaning up - setting image=NULL for non-image attachments...\n');
    
    const updateQuery = `
      UPDATE quotes
      SET image = NULL
      WHERE attachment_type IS NOT NULL 
        AND attachment_type != 'image'
        AND image IS NOT NULL
      RETURNING id, attachment_type, note_date
    `;
    
    const updateResult = await pool.query(updateQuery);
    
    console.log(`✅ Cleanup complete! Updated ${updateResult.rows.length} records:\n`);
    
    // Group by type
    const byType = {};
    updateResult.rows.forEach(row => {
      if (!byType[row.attachment_type]) byType[row.attachment_type] = 0;
      byType[row.attachment_type]++;
    });
    
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} notes cleaned`);
    });
    
    console.log(`\n💡 Database space freed: ~${totalMB.toFixed(2)} MB`);
    console.log('✅ All non-image attachments now use only image_full (no duplicate data)');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the cleanup
cleanupDuplicateAttachments()
  .then(() => {
    console.log('\n✅ Cleanup script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup script failed:', error);
    process.exit(1);
  });
