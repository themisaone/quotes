/**
 * Migrate Large Attachments to External Storage
 * 
 * This script finds all attachments > threshold (default 1 MB) stored as base64 in the database
 * and moves them to the external attachments/ folder, updating the database with file references.
 * 
 * Usage: node scripts/migrate-large-attachments.js [threshold-in-MB]
 * 
 * Example:
 *   node scripts/migrate-large-attachments.js      (uses 1 MB threshold)
 *   node scripts/migrate-large-attachments.js 2    (uses 2 MB threshold)
 */

const { Pool } = require('pg');
const fileStorage = require('../src/fileStorage');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

/**
 * Get size of base64 string in bytes
 */
function getBase64Size(base64String) {
  if (!base64String || !base64String.startsWith('data:')) return 0;
  
  const base64Data = base64String.split(',')[1] || '';
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
}

/**
 * Get folder name based on note type
 */
function getFolderForNoteType(noteType) {
  if (noteType === 'training') return 'training';
  if (noteType === 'note') return 'notes';
  if (noteType === 'puzzle') return 'puzzles';
  return 'quotes'; // default for 'quote' or null
}

async function migrateLargeAttachments(thresholdMB = 1) {
  console.log(`\n🔄 Starting migration of large attachments (> ${thresholdMB} MB)...\n`);
  
  const thresholdBytes = thresholdMB * 1024 * 1024;
  
  try {
    // Fetch all quotes with base64 attachments
    const query = `
      SELECT id, note_type, image, image_full, attachment_type
      FROM quotes
      WHERE (image IS NOT NULL AND image LIKE 'data:%')
         OR (image_full IS NOT NULL AND image_full LIKE 'data:%')
      ORDER BY id
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      console.log('✅ No base64 attachments found in database - all clean!');
      return;
    }
    
    console.log(`📊 Found ${result.rows.length} quotes with base64 attachments\n`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const stats = {
      byType: {},
      totalSizeMB: 0
    };
    
    for (const row of result.rows) {
      const { id, note_type, image, image_full, attachment_type } = row;
      const folder = getFolderForNoteType(note_type || 'quote');
      
      let needsUpdate = false;
      let newImage = image;
      let newImageFull = image_full;
      let sizeMB = 0;
      
      try {
        // Check and migrate image (thumbnail)
        if (image && image.startsWith('data:')) {
          const imageSize = getBase64Size(image);
          if (imageSize > thresholdBytes) {
            console.log(`   📦 Migrating thumbnail for quote ${id} (${(imageSize / 1024 / 1024).toFixed(2)} MB)...`);
            newImage = fileStorage.processForStorage(image, folder, id, '', thresholdMB);
            needsUpdate = true;
            sizeMB += imageSize / 1024 / 1024;
          }
        }
        
        // Check and migrate image_full
        if (image_full && image_full.startsWith('data:')) {
          const fullSize = getBase64Size(image_full);
          if (fullSize > thresholdBytes) {
            console.log(`   📦 Migrating full attachment for quote ${id} (${(fullSize / 1024 / 1024).toFixed(2)} MB, type: ${note_type || 'quote'})...`);
            newImageFull = fileStorage.processForStorage(image_full, folder, id, '_full', thresholdMB);
            needsUpdate = true;
            sizeMB += fullSize / 1024 / 1024;
          }
        }
        
        if (needsUpdate) {
          // Update database with file references
          await pool.query(
            `UPDATE quotes SET image = $1, image_full = $2 WHERE id = $3`,
            [newImage, newImageFull, id]
          );
          
          migrated++;
          stats.totalSizeMB += sizeMB;
          
          const typeKey = `${note_type || 'quote'}`;
          if (!stats.byType[typeKey]) stats.byType[typeKey] = { count: 0, sizeMB: 0 };
          stats.byType[typeKey].count++;
          stats.byType[typeKey].sizeMB += sizeMB;
          
          console.log(`   ✅ Quote ${id} migrated (freed ${sizeMB.toFixed(2)} MB from DB)`);
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Error migrating quote ${id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Migration Complete!\n`);
    console.log(`   ✅ Migrated: ${migrated} attachments`);
    console.log(`   ⏭️  Skipped: ${skipped} (below ${thresholdMB} MB threshold)`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   💾 Database space freed: ${stats.totalSizeMB.toFixed(2)} MB\n`);
    
    if (Object.keys(stats.byType).length > 0) {
      console.log(`📁 Migrated by type:`);
      Object.entries(stats.byType).forEach(([type, data]) => {
        console.log(`   ${type}: ${data.count} attachments, ${data.sizeMB.toFixed(2)} MB`);
      });
    }
    
    console.log(`\n✅ All large attachments now stored in attachments/ folder!`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Main execution
const thresholdMB = parseFloat(process.argv[2] || '1');

if (isNaN(thresholdMB) || thresholdMB <= 0) {
  console.error('❌ Invalid threshold. Usage: node scripts/migrate-large-attachments.js [threshold-in-MB]');
  process.exit(1);
}

migrateLargeAttachments(thresholdMB)
  .then(() => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
