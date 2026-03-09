const fs = require('fs');
const path = require('path');

/**
 * Parse ENEX file and convert to JSON format compatible with the notes import system
 * 
 * This script parses Evernote ENEX export files and converts them to a format
 * that can be directly imported using the "Restore Data" feature.
 * 
 * Usage: node scripts/parse-enex.js <enex-file> [output-json-file] [training-type] [batch-size] [max-attachment-mb]
 * 
 * Examples:
 *   node scripts/parse-enex.js 2026.enex training-2026.json
 *   node scripts/parse-enex.js 2026.enex training-2026.json CARDIO
 *   node scripts/parse-enex.js 2026.enex training-2026.json WEIGHTS 50
 *   node scripts/parse-enex.js large.enex output.json WEIGHTS 100 10  (skip attachments > 10 MB)
 * 
 * Parameters:
 *   - batch-size: Number of notes per file (default: 0 = no splitting)
 *                 Use this for large ENEX files to avoid server size limits
 *   - max-attachment-mb: Skip notes with attachments larger than this (default: 0 = no limit)
 *                        Useful to exclude huge PDF/video files
 * 
 * Default training type: WEIGHTS
 * Available training types: WEIGHTS, CARDIO, FLEXIBILITY, SPORTS
 */

// Helper to parse HTML entities
function decodeHtml(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Helper to convert ENML/HTML to plain text or simple HTML
function enmlToHtml(enml) {
  if (!enml) return '';
  
  // Extract content from CDATA
  const cdataMatch = enml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (!cdataMatch) return '';
  
  let content = cdataMatch[1];
  
  // Remove the XML declaration and DOCTYPE
  content = content.replace(/<\?xml[^>]*\?>/g, '');
  content = content.replace(/<!DOCTYPE[^>]*>/g, '');
  
  // Remove the <en-note> wrapper
  content = content.replace(/<en-note[^>]*>/g, '').replace(/<\/en-note>/g, '');
  
  // Remove the style display:none div (Evernote metadata)
  content = content.replace(/<div style="display:none;[^"]*">[\s\S]*?<\/div>/g, '');
  
  // Convert <br/> to proper HTML breaks
  content = content.replace(/<br\s*\/?>/g, '<br>');
  
  // Clean up empty tags and unnecessary attributes
  content = content.replace(/<div[^>]*>\s*<br>\s*<\/div>/g, '<p><br></p>');
  content = content.replace(/<div([^>]*)>/g, '<p>');
  content = content.replace(/<\/div>/g, '</p>');
  
  // Clean up multiple consecutive <br> tags in paragraphs
  content = content.replace(/<p>\s*<br>\s*<\/p>/g, '<p><br></p>');
  
  // Remove empty spans with special attributes
  content = content.replace(/<span[^>]*--en-markholder[^>]*>[\s\S]*?<\/span>/g, '');
  
  // Decode HTML entities
  content = decodeHtml(content);
  
  return content.trim();
}

// Parse date from title (e.g., "2026.01.29 Torsdag" or "2026.01.26")
function parseDate(title) {
  const match = title.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    return `${year}-${month}-${day}`; // ISO format for database
  }
  return null;
}

// Extract text content from XML node
function getTextContent(xmlString, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlString.match(regex);
  return match ? match[1].trim() : null;
}

// Extract resource (attachment) from note
function extractResource(noteXml) {
  // Count total resources
  const allResources = noteXml.match(/<resource>/g);
  const resourceCount = allResources ? allResources.length : 0;
  
  // Only extract the first resource (app only supports one attachment per note)
  const resourceMatch = noteXml.match(/<resource>([\s\S]*?)<\/resource>/);
  if (!resourceMatch) return null;
  
  const resourceXml = resourceMatch[1];
  
  // Extract base64 data
  const dataMatch = resourceXml.match(/<data encoding="base64">([\s\S]*?)<\/data>/);
  if (!dataMatch) return null;
  
  // Clean up the base64 data (remove newlines and whitespace)
  const base64Data = dataMatch[1].replace(/\s+/g, '');
  
  // Calculate file size (base64 is ~33% larger than original)
  const base64Size = base64Data.length;
  const actualSize = (base64Size * 3) / 4; // Approximate original file size
  const sizeKB = (actualSize / 1024).toFixed(2);
  const sizeMB = (actualSize / (1024 * 1024)).toFixed(2);
  const sizeDisplay = actualSize > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
  
  // Extract MIME type
  const mimeType = getTextContent(resourceXml, 'mime');
  
  // Extract filename (just for console logging)
  const filename = getTextContent(resourceXml, 'file-name');
  
  if (!base64Data || !mimeType) return null;
  
  console.log(`   📎 Found attachment: ${filename || 'unnamed'} (${mimeType}) - ${sizeDisplay}`);
  
  // Warn if multiple attachments exist
  if (resourceCount > 1) {
    console.log(`   ⚠️  WARNING: Note has ${resourceCount} attachments, only the first one will be imported!`);
  }
  
  // Warn if file is very large
  if (actualSize > 50 * 1024 * 1024) {
    console.log(`   ⚠️  WARNING: Large file! This may cause import issues (>${sizeMB} MB)`);
  }
  
  // Determine attachment type based on MIME type
  let attachmentType = 'other';
  if (mimeType.startsWith('image/')) {
    attachmentType = 'image';
  } else if (mimeType === 'application/pdf') {
    attachmentType = 'pdf';
  } else if (mimeType.startsWith('video/')) {
    attachmentType = 'video';
  } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || filename?.match(/\.(xlsx?|csv)$/i)) {
    attachmentType = 'document';
  } else if (mimeType.includes('word') || mimeType.includes('document') || filename?.match(/\.(docx?|txt|rtf)$/i)) {
    attachmentType = 'document';
  }
  
  // Format as data URL for the image field (compatible with the app's attachment system)
  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  
  return {
    dataUrl,
    attachmentType
  };
}

// Parse the ENEX file
function parseEnex(enexPath, trainingType = 'WEIGHTS', maxAttachmentSizeMB = 0) {
  console.log(`📖 Reading ENEX file: ${enexPath}`);
  console.log(`🏋️  Default training type: ${trainingType}`);
  if (maxAttachmentSizeMB > 0) {
    console.log(`⚠️  Will skip notes with attachments > ${maxAttachmentSizeMB} MB`);
  }
  
  const content = fs.readFileSync(enexPath, 'utf-8');
  
  // Split by <note> tags
  const noteMatches = content.match(/<note>[\s\S]*?<\/note>/g);
  
  if (!noteMatches) {
    console.error('❌ No notes found in ENEX file');
    return [];
  }
  
  console.log(`✅ Found ${noteMatches.length} notes in ENEX file\n`);
  
  const notes = [];
  let skipped = 0;
  let skippedLargeAttachments = 0;
  const largeAttachments = [];
  
  noteMatches.forEach((noteXml, index) => {
    const title = getTextContent(noteXml, 'title');
    const contentXml = getTextContent(noteXml, 'content');
    const created = getTextContent(noteXml, 'created');
    
    const noteDate = parseDate(title);
    
    if (!noteDate) {
      console.warn(`⚠️  Skipping note ${index + 1}: Could not parse date from title "${title}"`);
      skipped++;
      return;
    }
    
    const htmlContent = enmlToHtml(contentXml);
    
    if (!htmlContent) {
      console.warn(`⚠️  Skipping note ${index + 1}: Empty content for date ${noteDate}`);
      skipped++;
      return;
    }
    
    // Extract attachment/resource if present
    const resourceData = extractResource(noteXml);
    
    // Check if attachment is too large
    if (maxAttachmentSizeMB > 0 && resourceData) {
      const attachmentSizeMB = (resourceData.dataUrl.length * 3 / 4) / (1024 * 1024);
      if (attachmentSizeMB > maxAttachmentSizeMB) {
        console.warn(`⚠️  Skipping note ${index + 1}: Attachment too large (${attachmentSizeMB.toFixed(2)} MB > ${maxAttachmentSizeMB} MB limit)`);
        largeAttachments.push({
          title,
          date: noteDate,
          size: attachmentSizeMB.toFixed(2)
        });
        skippedLargeAttachments++;
        return;
      }
    }
    
    // Create note object compatible with the import system
    // IMPORTANT: This format must match what the server expects in /api/import/json
    const note = {
      quote: htmlContent,              // Main content (HTML)
      note_type: 'training',           // Type of note: 'training', 'quote', 'note', 'puzzle'
      note_date: noteDate,             // Date in YYYY-MM-DD format
      type: trainingType,              // Training type: WEIGHTS, CARDIO, FLEXIBILITY, SPORTS
      note: title,                     // Additional note/comment (original Evernote title)
      author_name: null,               // Not used for training notes
      source_name: null,               // Not used for training notes
      // For images: use same data for both (app may downscale image for thumbnail)
      // For PDFs/docs: only use image_full, leave image as null (no thumbnail needed)
      image: resourceData && resourceData.attachmentType === 'image' ? resourceData.dataUrl : null,
      image_full: resourceData ? resourceData.dataUrl : null,      // Full attachment data
      storage_type: resourceData ? 'base64' : null,                // Indicate base64 storage
      attachment_type: resourceData ? resourceData.attachmentType : null,  // Type: image, pdf, document, video, other
      created_at: new Date(noteDate).toISOString(),
      updated_at: new Date().toISOString()
    };
    
    notes.push(note);
    console.log(`✓ Parsed note ${index + 1}: ${noteDate} - ${title}`);
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   - Total notes found: ${noteMatches.length}`);
  console.log(`   - Successfully parsed: ${notes.length}`);
  console.log(`   - Skipped (no date/empty): ${skipped}`);
  if (skippedLargeAttachments > 0) {
    console.log(`   - Skipped (large attachments): ${skippedLargeAttachments}`);
    console.log(`\n📎 Large attachments that were skipped:`);
    largeAttachments.forEach(att => {
      console.log(`      • ${att.date}: ${att.title} (${att.size} MB)`);
    });
  }
  
  return notes;
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Usage: node scripts/parse-enex.js <enex-file> [output-json-file] [training-type] [batch-size] [max-attachment-mb]');
    console.error('');
    console.error('Examples:');
    console.error('   node scripts/parse-enex.js 2026.enex training-2026.json');
    console.error('   node scripts/parse-enex.js 2026.enex training-2026.json CARDIO');
    console.error('   node scripts/parse-enex.js 2026.enex training-2026.json WEIGHTS 50');
    console.error('   node scripts/parse-enex.js 2016.enex output.json WEIGHTS 20 10  (skip attachments > 10 MB)');
    console.error('');
    console.error('Parameters:');
    console.error('   batch-size: Split into multiple files (e.g., 50 notes per file)');
    console.error('               Use this for large ENEX files to avoid server limits');
    console.error('   max-attachment-mb: Skip notes with attachments > this size (MB)');
    console.error('                      Useful to exclude huge PDF/video files');
    console.error('');
    console.error('Available training types: WEIGHTS, CARDIO, FLEXIBILITY, SPORTS');
    console.error('Default: WEIGHTS');
    process.exit(1);
  }
  
  const enexPath = args[0];
  const outputPath = args[1] || enexPath.replace('.enex', '-import.json');
  const trainingType = (args[2] || 'WEIGHTS').toUpperCase();
  const batchSize = args[3] ? parseInt(args[3]) : 0;
  const maxAttachmentMB = args[4] ? parseInt(args[4]) : 0;
  
  // Validate training type
  const validTypes = ['WEIGHTS', 'CARDIO', 'FLEXIBILITY', 'SPORTS'];
  if (!validTypes.includes(trainingType)) {
    console.error(`❌ Invalid training type: ${trainingType}`);
    console.error(`   Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(enexPath)) {
    console.error(`❌ File not found: ${enexPath}`);
    process.exit(1);
  }
  
  try {
    const notes = parseEnex(enexPath, trainingType, maxAttachmentMB);
    
    if (notes.length === 0) {
      console.error('❌ No notes were successfully parsed');
      process.exit(1);
    }
    
    // Determine if we need to split into multiple files
    const shouldSplit = batchSize > 0 && notes.length > batchSize;
    
    if (shouldSplit) {
      // Split into batches
      const batches = [];
      for (let i = 0; i < notes.length; i += batchSize) {
        batches.push(notes.slice(i, i + batchSize));
      }
      
      console.log(`\n📦 Splitting into ${batches.length} files (${batchSize} notes each)...\n`);
      
      const outputFiles = [];
      const baseOutputPath = outputPath.replace(/\.json$/, '');
      
      batches.forEach((batch, index) => {
        const batchNumber = index + 1;
        const batchOutputPath = `${baseOutputPath}-part${batchNumber}.json`;
        
        const importData = {
          data: {
            quotes: batch,
            authors: [],
            sources: [],
            tags: []
          },
          counts: {
            quotes: batch.length,
            authors: 0,
            sources: 0,
            tags: 0
          }
        };
        
        fs.writeFileSync(batchOutputPath, JSON.stringify(importData, null, 2), 'utf-8');
        const fileSize = (fs.statSync(batchOutputPath).size / 1024).toFixed(2);
        console.log(`   ✅ Part ${batchNumber}: ${batch.length} notes → ${batchOutputPath} (${fileSize} KB)`);
        outputFiles.push(batchOutputPath);
      });
      
      console.log(`\n✅ Successfully created ${batches.length} JSON files!`);
      console.log(`   Total notes: ${notes.length}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Import each file separately using "Restore Data"`);
      console.log(`   2. Files to import:`);
      outputFiles.forEach((file, index) => {
        console.log(`      ${index + 1}. ${file}`);
      });
      console.log(`\n💡 All notes are set to training type: ${trainingType}`);
      
    } else {
      // Single file output (original behavior)
      const importData = {
        data: {
          quotes: notes,
          authors: [],
          sources: [],
          tags: []
        },
        counts: {
          quotes: notes.length,
          authors: 0,
          sources: 0,
          tags: 0
        }
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(importData, null, 2), 'utf-8');
      
      console.log(`\n✅ Successfully created JSON file: ${outputPath}`);
      console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Review the file (optional): cat ${outputPath} | less`);
      console.log(`   2. Open your Notes app in the browser`);
      console.log(`   3. Click "Restore Data" (📥) in the left menu`);
      console.log(`   4. Select this file: ${outputPath}`);
      console.log(`   5. Click to import`);
      console.log(`\n💡 All notes are set to training type: ${trainingType}`);
      console.log(`   You can edit individual notes after import if needed.`);
    }
    
  } catch (error) {
    console.error('❌ Error parsing ENEX file:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
