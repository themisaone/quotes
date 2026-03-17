const fs = require('fs');
const path = require('path');

// ─── Load configured note types from settings.json ─────────────────────────

function loadNoteTypes() {
  const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (Array.isArray(settings.noteTypes)) {
      return settings.noteTypes.map(t => t.value.toLowerCase());
    }
  } catch (e) {
    // settings.json missing or unreadable — fall back to built-in list
  }
  return ['quote', 'note', 'training', 'puzzle', 'historical'];
}

function loadTrainingSubTypes() {
  const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (Array.isArray(settings.trainingTypes)) {
      return settings.trainingTypes.map(t => t.value.toUpperCase());
    }
  } catch (e) {}
  return ['WEIGHTS', 'CARDIO', 'MIX', 'HOME', 'OVERVIEW/DOC'];
}

/**
 * Parse ENEX file and convert to JSON format compatible with the notes import system
 *
 * Usage:
 *   node scripts/parse-enex.js <enex-file> [output-json] [note_type] [sub_type] [batch-size] [max-mb]
 *
 * Parameters:
 *   note_type   - lowercase note type: training, historical, note, puzzle  (default: training)
 *   sub_type    - optional sub-type, only used for training: WEIGHTS, CARDIO, MIX, ...
 *   batch-size  - split output into files of N notes each (default: 0 = no split)
 *   max-mb      - skip notes with attachments larger than this (default: 0 = no limit)
 *
 * Examples:
 *   node scripts/parse-enex.js 2026.enex weights.json training WEIGHTS
 *   node scripts/parse-enex.js hist.enex  hist.json   historical
 *   node scripts/parse-enex.js big.enex   out.json    training WEIGHTS --split-mb=20
 *   node scripts/parse-enex.js big.enex   out.json    training WEIGHTS --split-mb=20 --skip-mb=50
 *
 * Notes for non-training types (historical, note, puzzle, etc.):
 *   - Date in title is optional (notes without a date are NOT skipped)
 *   - Falls back to the ENEX <created> timestamp if no date in title
 *   - No note_date or training sub-type fields are written
 */

// ─── Helpers ───────────────────────────────────────────────────────────────

function decodeHtml(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function enmlToHtml(enml) {
  if (!enml) return '';

  const cdataMatch = enml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (!cdataMatch) return '';

  let content = cdataMatch[1];

  content = content.replace(/<\?xml[^>]*\?>/g, '');
  content = content.replace(/<!DOCTYPE[^>]*>/g, '');
  content = content.replace(/<en-note[^>]*>/g, '').replace(/<\/en-note>/g, '');
  content = content.replace(/<div style="display:none;[^"]*">[\s\S]*?<\/div>/g, '');
  content = content.replace(/<br\s*\/?>/g, '<br>');
  content = content.replace(/<div[^>]*>\s*<br>\s*<\/div>/g, '<p><br></p>');
  content = content.replace(/<div([^>]*)>/g, '<p>');
  content = content.replace(/<\/div>/g, '</p>');
  content = content.replace(/<p>\s*<br>\s*<\/p>/g, '<p><br></p>');
  content = content.replace(/<span[^>]*--en-markholder[^>]*>[\s\S]*?<\/span>/g, '');
  content = decodeHtml(content);

  return content.trim();
}

// Parse date from title: "2026.01.29 Torsdag" → "2026-01-29"
function parseDateFromTitle(title) {
  const match = title.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

// Parse date from ENEX <created> tag: "20260129T120000Z" → "2026-01-29"
function parseDateFromCreated(created) {
  if (!created) return null;
  const match = created.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function getTextContent(xmlString, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlString.match(regex);
  return match ? match[1].trim() : null;
}

function extractAllResources(noteXml) {
  const resourceMatches = noteXml.match(/<resource>([\s\S]*?)<\/resource>/g);
  if (!resourceMatches) return [];

  const resources = [];

  resourceMatches.forEach((resourceXml, index) => {
    const dataMatch = resourceXml.match(/<data encoding="base64">([\s\S]*?)<\/data>/);
    if (!dataMatch) return;

    const base64Data = dataMatch[1].replace(/\s+/g, '');
    const actualSize = (base64Data.length * 3) / 4;
    const sizeKB = (actualSize / 1024).toFixed(2);
    const sizeMB = (actualSize / (1024 * 1024)).toFixed(2);
    const sizeDisplay = actualSize > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    const mimeType = getTextContent(resourceXml, 'mime');
    const filename = getTextContent(resourceXml, 'file-name');

    if (!base64Data || !mimeType) return;

    console.log(`   📎 Found attachment ${index + 1}: ${filename || 'unnamed'} (${mimeType}) - ${sizeDisplay}`);

    if (actualSize > 50 * 1024 * 1024) {
      console.log(`   ⚠️  WARNING: Very large file (${sizeMB} MB) — may cause import issues`);
    }

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

    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    resources.push({
      dataUrl,
      attachmentType,
      filename: filename || `attachment-${index + 1}`,
      sizeMB: parseFloat(sizeMB)
    });
  });

  return resources;
}

// ─── Resolve note_type and sub-type from CLI arguments ─────────────────────

/**
 * @param {string|null} noteTypeArg  - e.g. "training", "historical", "note"
 * @param {string|null} subTypeArg   - e.g. "WEIGHTS", "CARDIO" (only for training)
 */
function resolveType(noteTypeArg, subTypeArg) {
  const noteType = (noteTypeArg || 'training').toLowerCase();
  const isTraining = noteType === 'training';
  const subType = isTraining ? (subTypeArg ? subTypeArg.toUpperCase() : 'WEIGHTS') : null;
  return { noteType, subType, isTraining };
}

// ─── Core parser ───────────────────────────────────────────────────────────

function parseEnex(enexPath, noteTypeArg, subTypeArg, maxAttachmentSizeMB = 0) {
  const { noteType, subType, isTraining } = resolveType(noteTypeArg, subTypeArg);

  console.log(`📖 Reading ENEX file: ${enexPath}`);
  if (isTraining) {
    console.log(`🏋️  Note type: training  /  Sub-type: ${subType}`);
  } else {
    console.log(`📋 Note type: ${noteType}  (no sub-type)`);
  }
  if (maxAttachmentSizeMB > 0) {
    console.log(`⚠️  Will skip notes with attachments > ${maxAttachmentSizeMB} MB`);
  }
  console.log('');

  const content = fs.readFileSync(enexPath, 'utf-8');
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
    const title = getTextContent(noteXml, 'title') || `Note ${index + 1}`;
    const contentXml = getTextContent(noteXml, 'content');
    const created = getTextContent(noteXml, 'created');

    // Date handling
    const dateFromTitle = parseDateFromTitle(title);
    const dateFromCreated = parseDateFromCreated(created);
    const noteDate = dateFromTitle || dateFromCreated;

    // For training, date is required (it's how training entries are identified)
    if (isTraining && !dateFromTitle) {
      console.warn(`⚠️  Skipping note ${index + 1}: No date in title "${title}" (required for training)`);
      skipped++;
      return;
    }

    const htmlContent = enmlToHtml(contentXml);
    if (!htmlContent) {
      console.warn(`⚠️  Skipping note ${index + 1}: Empty content — "${title}"`);
      skipped++;
      return;
    }

    const resources = extractAllResources(noteXml);

    if (maxAttachmentSizeMB > 0 && resources.length > 0) {
      const tooLarge = resources.find(r => r.sizeMB > maxAttachmentSizeMB);
      if (tooLarge) {
        console.warn(`⚠️  Skipping note ${index + 1}: Attachment too large (${tooLarge.sizeMB.toFixed(2)} MB > ${maxAttachmentSizeMB} MB limit)`);
        largeAttachments.push({ title, date: noteDate || 'unknown', size: tooLarge.sizeMB.toFixed(2) });
        skippedLargeAttachments++;
        return;
      }
    }

    // Build the base note object
    const baseNote = isTraining
      ? {
          note_text: htmlContent,
          note_type: 'training',
          note_date: noteDate,
          type: subType,
          comment: title,
          author_name: null,
          source_name: null,
          created_at: noteDate ? new Date(noteDate).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      : {
          note_text: htmlContent,
          note_type: noteType,
          comment: title,
          author_name: null,
          source_name: null,
          created_at: noteDate ? new Date(noteDate).toISOString() : (created ? parseEnexDate(created) : new Date().toISOString()),
          updated_at: new Date().toISOString()
        };

    const attachmentDefaults = {
      thumbnail: null,
      attachment_full: null,
      storage_type: null,
      attachment_type: null
    };

    if (resources.length === 0) {
      notes.push({ ...attachmentDefaults, ...baseNote });
      console.log(`✓ Note ${index + 1}: "${title}"${noteDate ? ` [${noteDate}]` : ''}`);
      return;
    }

    if (resources.length === 1) {
      const r = resources[0];
      notes.push({
        ...baseNote,
        thumbnail: r.attachmentType === 'image' ? r.dataUrl : null,
        attachment_full: r.dataUrl,
        storage_type: 'base64',
        attachment_type: r.attachmentType
      });
      console.log(`✓ Note ${index + 1}: "${title}"${noteDate ? ` [${noteDate}]` : ''} + 1 attachment`);
      return;
    }

    // Multiple attachments → one note per attachment
    console.log(`   💡 ${resources.length} attachments — creating ${resources.length} notes`);
    resources.forEach((r, ai) => {
      const isFirst = ai === 0;
      notes.push({
        ...baseNote,
        note_text: isFirst ? htmlContent : `<p><em>Additional attachment from: ${title}</em></p>`,
        comment: isFirst ? title : `${title} — attachment ${ai + 1}`,
        thumbnail: r.attachmentType === 'image' ? r.dataUrl : null,
        attachment_full: r.dataUrl,
        storage_type: 'base64',
        attachment_type: r.attachmentType
      });
    });
    console.log(`✓ Note ${index + 1}: "${title}"${noteDate ? ` [${noteDate}]` : ''} → ${resources.length} notes`);
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total found   : ${noteMatches.length}`);
  console.log(`   Parsed OK     : ${notes.length}`);
  console.log(`   Skipped       : ${skipped}`);
  if (skippedLargeAttachments > 0) {
    console.log(`   Skipped (size): ${skippedLargeAttachments}`);
    console.log(`\n   📎 Skipped due to size:`);
    largeAttachments.forEach(a => console.log(`      • [${a.date}] ${a.title} (${a.size} MB)`));
  }

  return notes;
}

// Full ISO timestamp from ENEX created string "20260129T120000Z"
function parseEnexDate(created) {
  if (!created) return new Date().toISOString();
  const m = created.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString();
  }
  return new Date().toISOString();
}

// ─── Argument parser ───────────────────────────────────────────────────────

/**
 * Split argv into positional args and named flags.
 * Named flags: --split-mb=30  --skip-mb=10
 * Returns { positional: [...], flags: { 'split-mb': 30, 'skip-mb': 10 } }
 */
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-z-]+)=(.+)$/);
    if (m) {
      flags[m[1]] = m[2];
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    } else {
      // boolean flag (--flag), not needed yet
      flags[arg.slice(2)] = true;
    }
  }
  return { positional, flags };
}

// ─── Size-based splitting ──────────────────────────────────────────────────

/**
 * Split a flat array of notes into batches where each batch's JSON is ≤ maxBytes.
 * Each note is serialized individually so we know its exact contribution.
 * A single note that exceeds maxBytes on its own goes into its own file with a warning.
 */
function splitBySize(notes, maxBytes) {
  const batches = [];
  let current = [];
  let currentSize = 0;

  // Overhead of the wrapper JSON structure (approximate, conservative)
  const WRAPPER_OVERHEAD = 200;

  for (const note of notes) {
    const noteJson = JSON.stringify(note);
    const noteSize = Buffer.byteLength(noteJson, 'utf-8');

    // If adding this note would exceed the limit, flush current batch first
    if (current.length > 0 && currentSize + noteSize + WRAPPER_OVERHEAD > maxBytes) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }

    if (noteSize + WRAPPER_OVERHEAD > maxBytes && current.length === 0) {
      // Single note is too large — warn but still include it alone
      const mb = (noteSize / (1024 * 1024)).toFixed(1);
      console.warn(`   ⚠️  Note alone is ${mb} MB (exceeds split threshold) — placed in its own file`);
    }

    current.push(note);
    currentSize += noteSize + 2; // +2 for comma + newline in JSON array
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const { positional: args, flags } = parseArgs(process.argv.slice(2));

  const DEFAULT_SPLIT_MB = 30;

  if (args.length === 0) {
    console.log('Usage: node scripts/parse-enex.js <enex-file> [output] [note_type] [sub_type] [--split-mb=N] [--skip-mb=N]');
    console.log('');
    console.log('Positional:');
    console.log('  note_type    lowercase: training  historical  note  puzzle  (default: training)');
    console.log('  sub_type     training only: WEIGHTS  CARDIO  MIX  ...      (default: WEIGHTS)');
    console.log('');
    console.log('Named flags:');
    console.log(`  --split-mb=N   auto-split output when file exceeds N MB    (default: ${DEFAULT_SPLIT_MB})`);
    console.log('  --skip-mb=N    skip notes whose attachment is larger than N MB (default: off)');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/parse-enex.js 2026.enex weights.json training WEIGHTS');
    console.log('  node scripts/parse-enex.js hist.enex  hist.json   historical');
    console.log('  node scripts/parse-enex.js big.enex   out.json    training WEIGHTS --split-mb=20');
    console.log('  node scripts/parse-enex.js big.enex   out.json    training WEIGHTS --split-mb=20 --skip-mb=50');
    process.exit(1);
  }

  const enexPath       = args[0];
  const outputPath     = args[1] || enexPath.replace('.enex', '-import.json');
  const noteTypeArg    = args[2] || 'training';
  const subTypeArg     = args[3] || null;
  const splitMB        = flags['split-mb']  ? parseFloat(flags['split-mb'])  : DEFAULT_SPLIT_MB;
  const maxAttachmentMB= flags['skip-mb']   ? parseFloat(flags['skip-mb'])   : 0;

  if (!fs.existsSync(enexPath)) {
    console.error(`❌ File not found: ${enexPath}`);
    process.exit(1);
  }

  const validNoteTypes = loadNoteTypes();
  const normalizedNoteType = noteTypeArg.toLowerCase();
  if (!validNoteTypes.includes(normalizedNoteType)) {
    console.error(`❌ Unknown note type: "${normalizedNoteType}"`);
    console.error(`   Valid types: ${validNoteTypes.join(', ')}`);
    console.error(`   (Configured in config/settings.json)`);
    process.exit(1);
  }

  const { noteType, subType, isTraining } = resolveType(noteTypeArg, subTypeArg);

  if (isTraining && subTypeArg) {
    const validSubTypes = loadTrainingSubTypes();
    if (!validSubTypes.includes(subTypeArg.toUpperCase())) {
      console.error(`❌ Unknown training sub-type: "${subTypeArg.toUpperCase()}"`);
      console.error(`   Valid sub-types: ${validSubTypes.join(', ')}`);
      console.error(`   (Configured in config/settings.json)`);
      process.exit(1);
    }
  }

  try {
    const notes = parseEnex(enexPath, noteTypeArg, subTypeArg, maxAttachmentMB);

    if (notes.length === 0) {
      console.error('❌ No notes were successfully parsed');
      process.exit(1);
    }

    const splitBytes = splitMB * 1024 * 1024;
    const batches = splitBySize(notes, splitBytes);
    const baseOutputPath = outputPath.replace(/\.json$/, '');

    const makeImportData = (batch) => ({
      data: { quotes: batch, authors: [], sources: [], tags: [] },
      counts: { quotes: batch.length, authors: 0, sources: 0, tags: 0 }
    });

    if (batches.length === 1) {
      // Single file — use the exact output path the user specified
      const importData = makeImportData(batches[0]);
      fs.writeFileSync(outputPath, JSON.stringify(importData, null, 2), 'utf-8');
      const mb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);

      console.log(`\n✅ Created: ${outputPath}  (${mb} MB)`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Open the app in the browser`);
      console.log(`   2. Click "Import Notes" (📥) in the left menu`);
      console.log(`   3. Select: ${outputPath}`);
      console.log(`\n   All notes → ${isTraining ? `training / ${subType}` : noteType}`);

    } else {
      // Multiple files — suffix with -part1, -part2, ...
      console.log(`\n📦 Auto-split into ${batches.length} files (limit: ${splitMB} MB each)\n`);

      const outputFiles = [];
      batches.forEach((batch, i) => {
        const batchPath = `${baseOutputPath}-part${i + 1}.json`;
        const importData = makeImportData(batch);
        fs.writeFileSync(batchPath, JSON.stringify(importData, null, 2), 'utf-8');
        const mb = (fs.statSync(batchPath).size / (1024 * 1024)).toFixed(2);
        console.log(`   ✅ Part ${i + 1}: ${batch.length} notes → ${batchPath}  (${mb} MB)`);
        outputFiles.push(batchPath);
      });

      console.log(`\n✅ Done — ${notes.length} notes across ${batches.length} files`);
      console.log(`\n📋 Import each file separately via "Import Notes" (📥) in the app:`);
      outputFiles.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
      console.log(`\n   All notes → ${isTraining ? `training / ${subType}` : noteType}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
