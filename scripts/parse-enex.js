const fs = require('fs');
const path = require('path');

/**
 * Parse ENEX file and convert to JSON format compatible with the notes import system
 * 
 * This script parses Evernote ENEX export files and converts them to a format
 * that can be directly imported using the "Restore Data" feature.
 * 
 * Usage: node scripts/parse-enex.js <enex-file> [output-json-file] [training-type]
 * 
 * Examples:
 *   node scripts/parse-enex.js 2026.enex training-2026.json
 *   node scripts/parse-enex.js 2026.enex training-2026.json CARDIO
 *   node scripts/parse-enex.js 2026.enex training-2026.json WEIGHTS
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

// Parse the ENEX file
function parseEnex(enexPath, trainingType = 'WEIGHTS') {
  console.log(`📖 Reading ENEX file: ${enexPath}`);
  console.log(`🏋️  Default training type: ${trainingType}`);
  
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
      image: null,                     // Base64 image data (if any)
      image_full: null,                // Full-size image data (if any)
      created_at: new Date(noteDate).toISOString(),
      updated_at: new Date().toISOString()
    };
    
    notes.push(note);
    console.log(`✓ Parsed note ${index + 1}: ${noteDate} - ${title}`);
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   - Total notes found: ${noteMatches.length}`);
  console.log(`   - Successfully parsed: ${notes.length}`);
  console.log(`   - Skipped: ${skipped}`);
  
  return notes;
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Usage: node scripts/parse-enex.js <enex-file> [output-json-file] [training-type]');
    console.error('');
    console.error('Examples:');
    console.error('   node scripts/parse-enex.js 2026.enex training-2026.json');
    console.error('   node scripts/parse-enex.js 2026.enex training-2026.json CARDIO');
    console.error('');
    console.error('Available training types: WEIGHTS, CARDIO, FLEXIBILITY, SPORTS');
    console.error('Default: WEIGHTS');
    process.exit(1);
  }
  
  const enexPath = args[0];
  const outputPath = args[1] || enexPath.replace('.enex', '-import.json');
  const trainingType = (args[2] || 'WEIGHTS').toUpperCase();
  
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
    const notes = parseEnex(enexPath, trainingType);
    
    if (notes.length === 0) {
      console.error('❌ No notes were successfully parsed');
      process.exit(1);
    }
    
    // Create the JSON structure for import (compatible with Restore Data format)
    // This format matches the export from /api/export/json
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
    
    // Write to output file
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
    
  } catch (error) {
    console.error('❌ Error parsing ENEX file:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
