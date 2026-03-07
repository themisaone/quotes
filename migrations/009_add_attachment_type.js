/**
 * Migration 009: Add attachment_type to quotes table
 * 
 * Adds support for multiple attachment types (images, PDFs, documents, etc.)
 * Defaults to 'image' for backward compatibility with existing quotes
 */

module.exports = {
  name: '009_add_attachment_type',
  
  async up(client) {
    console.log('Starting migration 009: Adding attachment_type to quotes...');
    
    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quotes' 
      AND column_name = 'attachment_type'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('⏭️  Skipping: attachment_type column already exists');
      return;
    }
    
    // Add attachment_type column with default 'image'
    await client.query(`
      ALTER TABLE quotes 
      ADD COLUMN attachment_type VARCHAR(20) DEFAULT 'image'
    `);
    
    console.log('  - Added attachment_type column (default: image)');
    
    // Set existing records with attachments to 'image' type
    await client.query(`
      UPDATE quotes 
      SET attachment_type = 'image' 
      WHERE image IS NOT NULL OR image_full IS NOT NULL
    `);
    
    console.log('  - Set existing attachments to type: image');
    
    console.log('✅ Migration 009 completed: attachment_type column added!');
    console.log('   Supported types: image, pdf, document, video, audio');
  },
  
  async down(client) {
    console.log('Rolling back migration 009...');
    await client.query('ALTER TABLE quotes DROP COLUMN IF EXISTS attachment_type');
    console.log('✅ Rollback complete');
  }
};
