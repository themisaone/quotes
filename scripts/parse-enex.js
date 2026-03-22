const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const THUMBNAIL_MAX_PX = 240;

/**
 * Downscale a base64 data-URL image to THUMBNAIL_MAX_PX on the longest side.
 * Returns a JPEG base64 data-URL. Falls back to the original on any error.
 */
async function generateThumbnail(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const comma  = dataUrl.indexOf(',');
    const input  = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    const meta   = await sharp(input).metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    if (longest <= THUMBNAIL_MAX_PX) return dataUrl; // already small
    const out = await sharp(input)
      .resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (err) {
    process.stdout.write(`\n⚠️  Thumbnail generation failed: ${err.message}\n`);
    return dataUrl; // fallback to original
  }
}

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
 *   node scripts/parse-enex.js <enex-file> [output-json] [note_type] [sub_type] [tag ...] [--flags]
 *
 * Parameters:
 *   note_type   - lowercase note type: training, historical, note, puzzle  (default: training)
 *   sub_type    - optional sub-type, only used for training: WEIGHTS, CARDIO, MIX, ...
 *   tag ...     - zero or more extra tags applied to ALL notes (e.g. 2013 archiv)
 *
 * Named flags:
 *   --split-mb=N   split output into files of N MB each       (default: 30)
 *   --skip-mb=N    skip notes with attachments larger than N MB (default: off)
 *
 * Examples:
 *   node scripts/parse-enex.js 2013.enex 2013enex.json training WEIGHTS 2013
 *   node scripts/parse-enex.js 2026.enex weights.json  training WEIGHTS
 *   node scripts/parse-enex.js hist.enex  hist.json    historical
 *   node scripts/parse-enex.js big.enex   out.json     training WEIGHTS --split-mb=20 --skip-mb=50
 *
 * Date handling for training notes:
 *   - Title date (YYYY.MM.DD) is used when present
 *   - Falls back to ENEX <created> timestamp when title has no date (no longer skipped)
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

// Returns ISO string if dateStr is a valid date, otherwise null
function safeISODate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

// parseEnex writes output files incrementally as batches fill up — no large in-memory array.
// Returns { outputFiles, totalParsed, totalFound, skipped, skippedLargeAttachments, largeAttachments }
async function parseEnex(enexPath, noteTypeArg, subTypeArg, maxAttachmentSizeMB = 0, splitBytes, baseOutputPath, extraTags = []) {
  const { noteType, subType, isTraining } = resolveType(noteTypeArg, subTypeArg);

  // Build tag_objects from extra tags (applied to every note)
  const tagObjects = extraTags.map(t => ({ name: t, type: noteType }));

  console.log(`📖 Reading ENEX file: ${enexPath}`);
  if (isTraining) {
    console.log(`🏋️  Note type: training  /  Sub-type: ${subType}`);
  } else {
    console.log(`📋 Note type: ${noteType}  (no sub-type)`);
  }
  if (tagObjects.length > 0) {
    console.log(`🏷️  Tags applied to all notes: ${extraTags.join(', ')}`);
  }
  if (maxAttachmentSizeMB > 0) {
    console.log(`⚠️  Will skip notes with attachments > ${maxAttachmentSizeMB} MB`);
  }
  console.log('');

  const fileSize = fs.statSync(enexPath).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
  console.log(`📂 File size: ${fileSizeMB} MB — using streaming parser\n`);

  // ── Incremental batch writer ──────────────────────────────────────────────
  const outputFiles = [];
  let batchNum = 0;
  let currentBatch = [];
  let currentBatchBytes = 0;

  const flushBatch = () => {
    if (currentBatch.length === 0) return;
    batchNum++;
    const batchPath = `${baseOutputPath}-part${batchNum}.json`;
    const importData = {
      data: { quotes: currentBatch, authors: [], sources: [], tags: [] },
      counts: { quotes: currentBatch.length, authors: 0, sources: 0, tags: 0 }
    };
    fs.writeFileSync(batchPath, JSON.stringify(importData, null, 2), 'utf-8');
    const mb = (fs.statSync(batchPath).size / (1024 * 1024)).toFixed(2);
    process.stdout.write(`\n💾 Part ${batchNum}: ${currentBatch.length} notes → ${batchPath}  (${mb} MB)\n`);
    outputFiles.push(batchPath);
    currentBatch = [];
    currentBatchBytes = 0;
  };

  const addNote = (note) => {
    const noteBytes = Buffer.byteLength(JSON.stringify(note), 'utf8');
    if (noteBytes >= splitBytes) {
      // Single note exceeds threshold — flush pending batch first, write note alone
      if (currentBatch.length > 0) flushBatch();
      const mb = (noteBytes / (1024 * 1024)).toFixed(1);
      const noteTitle = note.comment || '(no title)';
      const noteDate  = note.created_at ? note.created_at.slice(0, 10) : 'unknown date';
      const attachInfo = note.attachment_type ? ` | attachment: ${note.attachment_type}` : '';
      process.stdout.write(`\n⚠️  Oversized note (${mb} MB) — placed in its own file\n`);
      process.stdout.write(`   Title : ${noteTitle}\n`);
      process.stdout.write(`   Date  : ${noteDate}${attachInfo}\n`);
      currentBatch = [note];
      currentBatchBytes = noteBytes;
      flushBatch();
      return;
    }
    if (currentBatch.length > 0 && currentBatchBytes + noteBytes > splitBytes) {
      flushBatch();
    }
    currentBatch.push(note);
    currentBatchBytes += noteBytes;
  };
  // ─────────────────────────────────────────────────────────────────────────

  let totalFound = 0;
  let totalParsed = 0;
  let skipped = 0;
  let skippedLargeAttachments = 0;
  const largeAttachments = [];

  await streamNoteBlocks(enexPath, fileSize, async (noteXml, index) => {
    totalFound = index;
    const title = getTextContent(noteXml, 'title') || `Note ${index}`;
    const contentXml = getTextContent(noteXml, 'content');
    const created = getTextContent(noteXml, 'created');

    const dateFromTitle = parseDateFromTitle(title);
    const dateFromCreated = parseDateFromCreated(created);
    const noteDate = dateFromTitle || dateFromCreated;

    if (isTraining && !dateFromTitle && dateFromCreated) {
      process.stdout.write(`\n   ℹ️  No date in title "${title}" — using <created> date: ${dateFromCreated}\n`);
    }

    const htmlContent = enmlToHtml(contentXml);
    if (!htmlContent) {
      console.warn(`\n⚠️  Skipping note ${index}: Empty content — "${title}"`);
      skipped++;
      return;
    }

    const resources = extractAllResources(noteXml);

    if (maxAttachmentSizeMB > 0 && resources.length > 0) {
      const tooLarge = resources.find(r => r.sizeMB > maxAttachmentSizeMB);
      if (tooLarge) {
        console.warn(`\n⚠️  Skipping note ${index}: Attachment too large (${tooLarge.sizeMB.toFixed(2)} MB > ${maxAttachmentSizeMB} MB limit)`);
        largeAttachments.push({ title, date: noteDate || 'unknown', size: tooLarge.sizeMB.toFixed(2) });
        skippedLargeAttachments++;
        return;
      }
    }

    const baseNote = isTraining
      ? {
          note_text: htmlContent,
          note_type: 'training',
          note_date: noteDate,
          type: subType,
          comment: title,
          author_name: null,
          source_name: null,
          created_at: safeISODate(noteDate) || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(tagObjects.length > 0 ? { tag_objects: tagObjects } : {})
        }
      : {
          note_text: htmlContent,
          note_type: noteType,
          comment: title,
          author_name: null,
          source_name: null,
          created_at: safeISODate(noteDate) || (created ? parseEnexDate(created) : new Date().toISOString()),
          updated_at: new Date().toISOString(),
          ...(tagObjects.length > 0 ? { tag_objects: tagObjects } : {})
        };

    const attachmentDefaults = {
      thumbnail: null,
      attachment_full: null,
      storage_type: null,
      attachment_type: null
    };

    if (resources.length === 0) {
      addNote({ ...attachmentDefaults, ...baseNote });
      totalParsed++;
      return;
    }

    if (resources.length === 1) {
      const r = resources[0];
      const thumb = r.attachmentType === 'image' ? await generateThumbnail(r.dataUrl) : null;
      addNote({
        ...baseNote,
        // Flat fields (backward compat with importer)
        thumbnail: thumb,
        attachment_full: r.dataUrl,
        storage_type: 'base64',
        attachment_type: r.attachmentType,
        // Structured attachments array for note_attachments table
        attachments: [{
          position: 0,
          thumbnail: thumb,
          attachment_full: r.dataUrl,
          attachment_type: r.attachmentType,
          filename: r.filename || null,
        }]
      });
      totalParsed++;
      return;
    }

    // Multiple attachments → ONE note with an attachments[] array (no more splitting)
    const attachmentsArr = [];
    for (const [ai, r] of resources.entries()) {
      const thumb = r.attachmentType === 'image' ? await generateThumbnail(r.dataUrl) : null;
      attachmentsArr.push({
        position: ai,
        thumbnail: thumb,
        attachment_full: r.dataUrl,
        attachment_type: r.attachmentType,
        filename: r.filename || null,
      });
    }
    const firstAtt = attachmentsArr[0];
    addNote({
      ...baseNote,
      // Flat fields from first attachment (backward compat)
      thumbnail: firstAtt.thumbnail,
      attachment_full: firstAtt.attachment_full,
      storage_type: 'base64',
      attachment_type: firstAtt.attachment_type,
      // Full array for proper multi-attachment import
      attachments: attachmentsArr,
    });
    totalParsed++;
  });

  // Flush any remaining notes
  flushBatch();

  process.stdout.write('\n');
  console.log(`\n📊 Summary:`);
  console.log(`   Total found   : ${totalFound}`);
  console.log(`   Parsed OK     : ${totalParsed}`);
  console.log(`   Skipped       : ${skipped}`);
  if (skippedLargeAttachments > 0) {
    console.log(`   Skipped (size): ${skippedLargeAttachments}`);
    console.log(`\n   📎 Skipped due to size:`);
    largeAttachments.forEach(a => console.log(`      • [${a.date}] ${a.title} (${a.size} MB)`));
  }

  return { outputFiles, totalParsed, totalFound, skipped, skippedLargeAttachments, largeAttachments };
}

// Stream an ENEX file and call callback(noteXml, index) for each complete <note>…</note> block.
// Only one note's XML is held in memory at a time — safe for multi-GB files.
function streamNoteBlocks(enexPath, fileSize, callback) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(enexPath, {
      encoding: 'utf8',
      highWaterMark: 8 * 1024 * 1024  // 8 MB read chunks
    });

    let buffer      = '';
    let noteIndex   = 0;
    let bytesRead   = 0;
    let processing  = false;
    let streamEnded = false;

    // Process all complete notes currently in the buffer.
    // The stream is paused while we await async callbacks so memory stays bounded.
    const processBuffer = async () => {
      if (processing) return;
      processing = true;
      stream.pause();

      while (true) {
        const start = buffer.indexOf('<note>');
        if (start === -1) {
          if (buffer.length > 6) buffer = buffer.slice(buffer.length - 6);
          break;
        }
        const end = buffer.indexOf('</note>', start);
        if (end === -1) {
          buffer = buffer.slice(start);
          break;
        }

        const noteXml = buffer.slice(start, end + '</note>'.length);
        buffer = buffer.slice(end + '</note>'.length);
        noteIndex++;

        const pct = fileSize > 0 ? ((bytesRead / fileSize) * 100).toFixed(0) : '?';
        process.stdout.write(`\r   Progress: ${pct}%  |  Notes processed: ${noteIndex}   `);

        await callback(noteXml, noteIndex);
      }

      processing = false;
      if (streamEnded) {
        resolve();
      } else {
        stream.resume();
      }
    };

    stream.on('data', (chunk) => {
      buffer    += chunk;
      bytesRead += Buffer.byteLength(chunk, 'utf8');
      processBuffer().catch(reject);
    });

    stream.on('end', () => {
      streamEnded = true;
      if (!processing) resolve();
    });

    stream.on('error', reject);
  });
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


// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { positional: args, flags } = parseArgs(process.argv.slice(2));

  const DEFAULT_SPLIT_MB = 30;

  if (args.length === 0) {
    console.log('Usage: node scripts/parse-enex.js <enex-file> [output] [note_type] [sub_type] [tag ...] [--flags]');
    console.log('');
    console.log('Positional:');
    console.log('  note_type    lowercase: training  historical  note  puzzle  (default: training)');
    console.log('  sub_type     training only: WEIGHTS  CARDIO  MIX  ...      (default: WEIGHTS)');
    console.log('  tag ...      zero or more tags applied to ALL notes         (e.g. 2013  archiv)');
    console.log('');
    console.log('Named flags:');
    console.log(`  --split-mb=N   auto-split output when file exceeds N MB    (default: ${DEFAULT_SPLIT_MB})`);
    console.log('  --skip-mb=N    skip notes whose attachment is larger than N MB (default: off)');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/parse-enex.js 2013.enex 2013enex.json training WEIGHTS 2013');
    console.log('  node scripts/parse-enex.js 2026.enex weights.json  training WEIGHTS');
    console.log('  node scripts/parse-enex.js hist.enex  hist.json    historical');
    console.log('  node scripts/parse-enex.js big.enex   out.json     training WEIGHTS --split-mb=20 --skip-mb=50');
    process.exit(1);
  }

  const enexPath       = args[0];
  const outputPath     = args[1] || enexPath.replace('.enex', '-import.json');
  const noteTypeArg    = args[2] || 'training';
  const isTrainingType = noteTypeArg.toLowerCase() === 'training';
  const subTypeArg     = isTrainingType ? (args[3] || null) : null;
  const extraTags      = isTrainingType ? args.slice(4) : args.slice(3);  // tags start after sub_type for training, right after note_type otherwise
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

  const splitBytes    = splitMB * 1024 * 1024;
  const baseOutputPath = outputPath.replace(/\.json$/, '');

  try {
    const result = await parseEnex(enexPath, noteTypeArg, subTypeArg, maxAttachmentMB, splitBytes, baseOutputPath, extraTags);
    const { outputFiles, totalParsed } = result;

    if (totalParsed === 0) {
      console.error('❌ No notes were successfully parsed');
      process.exit(1);
    }

    // If exactly one part was written, rename it to the exact path the user requested
    if (outputFiles.length === 1 && outputFiles[0] !== outputPath) {
      fs.renameSync(outputFiles[0], outputPath);
      outputFiles[0] = outputPath;
      const mb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
      console.log(`\n✅ Created: ${outputPath}  (${mb} MB)`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Open the app in the browser`);
      console.log(`   2. Click "Import Notes" (📥) in the left menu`);
      console.log(`   3. Select: ${outputPath}`);
      console.log(`\n   All notes → ${isTraining ? `training / ${subType}` : noteType}`);
    } else {
      console.log(`\n✅ Done — ${totalParsed} notes across ${outputFiles.length} files`);
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

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
