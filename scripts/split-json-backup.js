#!/usr/bin/env node
/**
 * Split a NoteArchive JSON backup into multiple valid backup files (~N MB each)
 * by dividing data.quotes only. Each part keeps the same authors, sources, and
 * tags so imports resolve names; import order: _1, _2, … (duplicates are skipped).
 *
 * Large backups are read with a streaming JSON parser (stream-json) so Node does
 * not load the entire file as one string (avoids ERR_STRING_TOO_LONG / heap blowups).
 *
 * Usage:
 *   node scripts/split-json-backup.js <backup.json> [output-dir] [--mb=30]
 *
 * Examples:
 *   node scripts/split-json-backup.js ~/Downloads/all_notes_backup_2026-05-11.json
 *   node scripts/split-json-backup.js ./backup.json ./chunks --mb=25
 *
 * Very large inputs may still need more heap for in-memory quote objects:
 *   node --max-old-space-size=8192 scripts/split-json-backup.js huge.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/pick.js');
const { streamArray } = require('stream-json/streamers/stream-array.js');
const { streamValues } = require('stream-json/streamers/stream-values.js');

function usage() {
  console.log(`
Split a JSON backup into parts named <base>_1.json, <base>_2.json, …

Usage:
  node scripts/split-json-backup.js <backup.json> [output-directory] [--mb=30]

Arguments:
  backup.json      Input file (export format: data.authors, sources, quotes).
  output-directory Optional. Default: same directory as the input file.

Flags:
  --mb=N           Target max size per part in megabytes (default: 30).
  -h, --help       Show this help.

Each output file is a complete backup shape (valid for the app import UI).
Import part 1 first, then part 2, … (authors/sources/tags overlap is OK).
`);
}

function parseArgs(argv) {
  let input = null;
  let outDir = null;
  let mb = 30;

  for (const a of argv.slice(2)) {
    if (a === '-h' || a === '--help') {
      usage();
      process.exit(0);
    }
    if (a.startsWith('--mb=')) {
      mb = parseFloat(a.slice(5));
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      usage();
      process.exit(1);
    }
    if (!input) input = a;
    else if (!outDir) outDir = a;
    else {
      console.error('Too many positional arguments.');
      usage();
      process.exit(1);
    }
  }

  if (!input) {
    usage();
    process.exit(1);
  }
  if (!Number.isFinite(mb) || mb <= 0) {
    console.error('--mb must be a positive number.');
    process.exit(1);
  }
  return { input: path.resolve(input), outDir: outDir ? path.resolve(outDir) : null, mb };
}

function byteLength(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/** First matching value for a root or nested path (once: true recommended for scalars). */
function streamPickValue(inputPath, filter, { once = true } = {}) {
  return new Promise((resolve, reject) => {
    let value;
    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter, once }),
      streamValues(),
    ]);
    pipeline.on('data', (d) => {
      value = d.value;
    });
    pipeline.on('end', () => resolve(value));
    pipeline.on('error', reject);
  });
}

/** Collect all array elements under path (e.g. data.authors). */
function streamPickArray(inputPath, filter) {
  return new Promise((resolve, reject) => {
    const arr = [];
    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter }),
      streamArray(),
    ]);
    pipeline.on('data', (d) => {
      arr.push(d.value);
    });
    pipeline.on('end', () => resolve(arr));
    pipeline.on('error', reject);
  });
}

function validateBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Root must be an object');
  const { data } = raw;
  if (!data || typeof data !== 'object') throw new Error('Missing data');
  if (!Array.isArray(data.authors)) throw new Error('data.authors must be an array');
  if (!Array.isArray(data.sources)) throw new Error('data.sources must be an array');
  if (!Array.isArray(data.quotes)) throw new Error('data.quotes must be an array');
  if (!Array.isArray(data.tags)) {
    raw.data.tags = [];
  }
}

function buildPart(base, authors, sources, tags, quotesSlice, meta) {
  const { part, parts } = meta;
  const out = {
    version: base.version || '2.0',
    exportedAt: base.exportedAt || new Date().toISOString(),
    noteTypeFilter: base.noteTypeFilter != null ? base.noteTypeFilter : 'all',
    splitBackup: { part, parts },
    counts: {
      authors: authors.length,
      sources: sources.length,
      tags: tags.length,
      quotes: quotesSlice.length,
    },
    data: {
      authors,
      sources,
      tags,
      quotes: quotesSlice,
    },
  };
  return out;
}

async function loadBackupWithoutQuotes(inputPath) {
  const version = await streamPickValue(inputPath, 'version', { once: true });
  const exportedAt = await streamPickValue(inputPath, 'exportedAt', { once: true });
  const noteTypeFilter = await streamPickValue(inputPath, 'noteTypeFilter', { once: true });
  const counts = await streamPickValue(inputPath, 'counts', { once: true });
  const splitBackup = await streamPickValue(inputPath, 'splitBackup', { once: true });
  const authors = await streamPickArray(inputPath, 'data.authors');
  const sources = await streamPickArray(inputPath, 'data.sources');
  const tags = await streamPickArray(inputPath, 'data.tags');

  const base = {
    version: version != null ? version : '2.0',
    exportedAt: exportedAt != null ? exportedAt : new Date().toISOString(),
    noteTypeFilter: noteTypeFilter != null ? noteTypeFilter : 'all',
    counts: counts && typeof counts === 'object' ? counts : {},
    splitBackup,
  };

  const data = {
    authors: authors || [],
    sources: sources || [],
    tags: tags || [],
    quotes: [],
  };

  return { base, data };
}

/** Stream data.quotes; call onQuote(quote) for each; resolves when done. */
function streamQuotes(inputPath, onQuote) {
  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter: 'data.quotes' }),
      streamArray(),
    ]);
    pipeline.on('data', (d) => {
      try {
        onQuote(d.value);
      } catch (e) {
        reject(e);
      }
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });
}

async function main() {
  const { input, outDir, mb } = parseArgs(process.argv);
  const targetBytes = mb * 1024 * 1024;

  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  const dir = outDir || path.dirname(input);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`Reading ${input} (streaming) …`);

  let { base, data } = await loadBackupWithoutQuotes(input);
  const authors = data.authors;
  const sources = data.sources;
  const tags = data.tags;

  const full = {
    ...base,
    data: { authors, sources, tags, quotes: [] },
  };
  try {
    validateBackup(full);
  } catch (e) {
    console.error('Not a recognized backup:', e.message);
    process.exit(1);
  }

  const emptyQuotesDoc = buildPart(base, authors, sources, tags, [], { part: 1, parts: 1 });
  const baseBytes = byteLength(emptyQuotesDoc);

  if (baseBytes >= targetBytes) {
    console.error(
      `Metadata alone (${(baseBytes / 1024 / 1024).toFixed(2)} MB) exceeds target ${mb} MB. Increase --mb.`,
    );
    process.exit(1);
  }

  const quoteSlices = [];
  let chunk = [];

  await streamQuotes(input, (quote) => {
    const trial = chunk.length === 0 ? [quote] : [...chunk, quote];
    let doc = buildPart(base, authors, sources, tags, trial, { part: 1, parts: 1 });
    let sz = byteLength(doc);

    if (sz > targetBytes) {
      if (chunk.length > 0) {
        quoteSlices.push(chunk);
        chunk = [quote];
        doc = buildPart(base, authors, sources, tags, chunk, { part: 1, parts: 1 });
        sz = byteLength(doc);
        if (sz > targetBytes) {
          console.warn(
            `⚠️  Note (id=${quote.id}) alone is ${(sz / 1024 / 1024).toFixed(2)} MB > ${mb} MB — writing it as its own part.`,
          );
          quoteSlices.push(chunk);
          chunk = [];
        }
      } else {
        console.warn(
          `⚠️  Note (id=${quote.id}) alone is ${(sz / 1024 / 1024).toFixed(2)} MB > ${mb} MB — writing it as its own part.`,
        );
        quoteSlices.push(trial);
        chunk = [];
      }
      return;
    }

    chunk = trial;
  });

  if (chunk.length > 0) {
    quoteSlices.push(chunk);
  }

  const parts = quoteSlices.length;
  const baseName = path.basename(input, path.extname(input));
  const ext = path.extname(input) || '.json';

  let quoteCount = 0;
  for (const s of quoteSlices) quoteCount += s.length;
  console.log(`Splitting ${quoteCount} notes into ${parts} part(s) (~≤ ${mb} MB each, UTF-8 bytes)…\n`);

  for (let p = 0; p < parts; p++) {
    const slice = quoteSlices[p];
    const doc = buildPart(base, authors, sources, tags, slice, { part: p + 1, parts });
    const outPath = path.join(dir, `${baseName}_${p + 1}${ext}`);
    fs.writeFileSync(outPath, JSON.stringify(doc), 'utf8');
    const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');
    console.log(
      `  Wrote ${path.basename(outPath)}  —  ${slice.length} notes  —  ${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  console.log(`\nDone. Import ${baseName}_1${ext} first, then _2, … in order.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
