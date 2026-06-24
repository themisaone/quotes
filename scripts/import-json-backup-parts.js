#!/usr/bin/env node
/**
 * Import one or more split NoteArchive JSON backup parts through the running app.
 *
 * Intended for large restores where the browser import path is too heavy. Start
 * the target service first, split the backup into <=100MB parts, then run this
 * script against the part directory.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'http://localhost:4000';

function usage() {
  console.log(`
Import split JSON backup parts through /api/import/json.

Usage:
  node scripts/import-json-backup-parts.js <parts-dir|part.json...> [options]

Options:
  --url=URL             App base URL or full import URL (default: ${DEFAULT_URL})
  --replace-existing    Update matching authors/sources/tags instead of skipping them
  --dry-run             Validate and list files without posting anything
  --include-all-json    When input is a directory, import every .json file
  --from=N              Start at part number N
  --to=N                Stop at part number N
  -h, --help            Show this help

Directory inputs default to files named like *_1.json, *_2.json, ... so the
original unsplit backup is not imported by accident.
`);
}

function parsePositiveInt(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    url: process.env.IMPORT_URL || DEFAULT_URL,
    replaceExisting: false,
    dryRun: false,
    includeAllJson: false,
    from: 1,
    to: Infinity,
  };

  const args = argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else if (arg === '--replace-existing') {
      options.replaceExisting = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--include-all-json') {
      options.includeAllJson = true;
    } else if (arg === '--url') {
      const value = args[++index];
      if (!value) throw new Error('--url requires a value');
      options.url = value;
    } else if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
    } else if (arg === '--from') {
      const value = args[++index];
      if (!value) throw new Error('--from requires a value');
      options.from = parsePositiveInt(value, '--from');
    } else if (arg.startsWith('--from=')) {
      options.from = parsePositiveInt(arg.slice('--from='.length), '--from');
    } else if (arg === '--to') {
      const value = args[++index];
      if (!value) throw new Error('--to requires a value');
      options.to = parsePositiveInt(value, '--to');
    } else if (arg.startsWith('--to=')) {
      options.to = parsePositiveInt(arg.slice('--to='.length), '--to');
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputs.push(path.resolve(arg));
    }
  }

  if (options.inputs.length === 0) {
    throw new Error('Provide a part directory or one or more part files');
  }
  if (options.from > options.to) {
    throw new Error('--from cannot be greater than --to');
  }

  return options;
}

function normalizeImportUrl(inputUrl) {
  const raw = String(inputUrl || DEFAULT_URL).trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const parsed = new URL(withScheme);
  if (parsed.pathname.replace(/\/+$/, '') === '/api/import/json') {
    return parsed.toString();
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/api/import/json`;
  return parsed.toString();
}

function partNumberForFile(filePath) {
  const name = path.basename(filePath);
  const match = name.match(/(?:^|[_-])(\d+)\.json$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isJsonFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.json';
}

function collectPartFiles(inputs, { includeAllJson = false, from = 1, to = Infinity } = {}) {
  const files = [];

  for (const input of inputs) {
    if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);
    const stat = fs.statSync(input);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input)) {
        const file = path.join(input, entry);
        if (!fs.statSync(file).isFile() || !isJsonFile(file)) continue;
        const part = partNumberForFile(file);
        if (!includeAllJson && part === null) continue;
        if (part !== null && (part < from || part > to)) continue;
        files.push(file);
      }
    } else if (stat.isFile()) {
      if (!isJsonFile(input)) throw new Error(`Not a JSON file: ${input}`);
      const part = partNumberForFile(input);
      if (!includeAllJson && part === null) {
        throw new Error(`File does not look like a split part: ${input}. Use --include-all-json to import it anyway.`);
      }
      if (part !== null && (part < from || part > to)) continue;
      files.push(input);
    } else {
      throw new Error(`Input is not a file or directory: ${input}`);
    }
  }

  const unique = [...new Set(files.map((file) => path.resolve(file)))];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  unique.sort((a, b) => {
    const partA = partNumberForFile(a);
    const partB = partNumberForFile(b);
    if (partA !== null && partB !== null && partA !== partB) return partA - partB;
    return collator.compare(path.basename(a), path.basename(b));
  });
  return unique;
}

function readBackupPart(filePath) {
  const backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = backup?.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`${path.basename(filePath)} is missing data`);
  }
  if (!Array.isArray(data.authors)) throw new Error(`${path.basename(filePath)} data.authors must be an array`);
  if (!Array.isArray(data.sources)) throw new Error(`${path.basename(filePath)} data.sources must be an array`);
  if (!Array.isArray(data.quotes)) throw new Error(`${path.basename(filePath)} data.quotes must be an array`);
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    throw new Error(`${path.basename(filePath)} data.tags must be an array when present`);
  }
  return backup;
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function emptyTotals() {
  return {
    authors: { created: 0, skipped: 0, updated: 0, errors: 0 },
    sources: { created: 0, skipped: 0, updated: 0, errors: 0 },
    tags: { created: 0, skipped: 0, updated: 0, errors: 0 },
    quotes: { created: 0, skipped: 0, updated: 0, errors: 0 },
  };
}

function addStats(totals, stats = {}) {
  for (const section of Object.keys(totals)) {
    for (const key of Object.keys(totals[section])) {
      totals[section][key] += Number(stats?.[section]?.[key] || 0);
    }
  }
}

function summarizeStats(stats = {}) {
  const q = stats.quotes || {};
  const a = stats.authors || {};
  const s = stats.sources || {};
  const t = stats.tags || {};
  return [
    `notes ${q.created || 0} created, ${q.skipped || 0} skipped`,
    `authors ${a.created || 0}/${a.skipped || 0}`,
    `sources ${s.created || 0}/${s.skipped || 0}`,
    `tags ${t.created || 0}/${t.skipped || 0}`,
  ].join(' | ');
}

async function postBackupPart(filePath, {
  importUrl,
  replaceExisting = false,
  fetchImpl = global.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('This script requires Node.js with global fetch support');
  }

  const backup = readBackupPart(filePath);
  const payload = {
    data: backup.data,
    options: { replaceExisting },
  };

  const response = await fetchImpl(importUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }

  if (!response.ok) {
    const detail = body.details || body.error || body.raw || response.statusText;
    throw new Error(`Import failed for ${path.basename(filePath)} (${response.status}): ${detail}`);
  }

  return body;
}

async function importParts(files, {
  importUrl,
  replaceExisting = false,
  dryRun = false,
  logger = console,
  fetchImpl = global.fetch,
} = {}) {
  const totals = emptyTotals();

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const backup = readBackupPart(file);
    const size = fs.statSync(file).size;
    const count = backup.data.quotes.length;
    logger.log(`[${index + 1}/${files.length}] ${path.basename(file)} — ${count} note(s), ${formatSize(size)}`);

    if (dryRun) continue;

    const result = await postBackupPart(file, {
      importUrl,
      replaceExisting,
      fetchImpl,
    });
    addStats(totals, result.stats);
    logger.log(`  OK: ${summarizeStats(result.stats)}`);
    if (Array.isArray(result.warnings)) {
      for (const warning of result.warnings) logger.warn(`  Warning: ${warning}`);
    }
  }

  return totals;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  const files = collectPartFiles(options.inputs, options);
  if (files.length === 0) {
    console.error('No backup part files found.');
    process.exit(1);
  }

  const importUrl = normalizeImportUrl(options.url);
  console.log(`Import URL: ${importUrl}`);
  console.log(`Files: ${files.length}`);
  if (options.dryRun) console.log('Dry run: no data will be imported.');

  const totals = await importParts(files, {
    importUrl,
    replaceExisting: options.replaceExisting,
    dryRun: options.dryRun,
  });

  if (!options.dryRun) {
    console.log('\nDone.');
    console.log(`Totals: ${summarizeStats(totals)}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  addStats,
  collectPartFiles,
  emptyTotals,
  importParts,
  normalizeImportUrl,
  parseArgs,
  partNumberForFile,
  postBackupPart,
  readBackupPart,
  summarizeStats,
};
