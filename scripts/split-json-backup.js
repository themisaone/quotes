#!/usr/bin/env node
/**
 * Split a NoteArchive JSON backup into multiple valid backup files by dividing
 * data.quotes only. The splitter makes one streaming pass over the input and
 * keeps only the current output part in memory.
 *
 * Usage:
 *   node scripts/split-json-backup.js <backup.json> [output-dir] [--mb=30]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const Assembler = require('../node_modules/stream-json/src/assembler.js');

const PROGRESS_INTERVAL_MS = 5000;

function usage() {
  console.log(`
Split a JSON backup into parts named <base>_1.json, <base>_2.json, ...

Usage:
  node scripts/split-json-backup.js <backup.json> [output-directory] [--mb=30]

Arguments:
  backup.json      Input file (export format: data.authors, sources, quotes).
  output-directory Optional. Default: same directory as the input file.

Flags:
  --mb=N           Target max size per part in megabytes (default: 30).
  -h, --help       Show this help.

Each output file is a complete backup shape (valid for the app import UI).
Import part 1 first, then part 2, ... (duplicates are skipped).
`);
}

function parseArgs(argv) {
  let input = null;
  let outDir = null;
  let mb = 30;

  for (const arg of argv.slice(2)) {
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg.startsWith('--mb=')) {
      mb = parseFloat(arg.slice(5));
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (!input) input = arg;
    else if (!outDir) outDir = arg;
    else throw new Error('Too many positional arguments.');
  }

  if (!input) throw new Error('Input backup path is required.');
  if (!Number.isFinite(mb) || mb <= 0) throw new Error('--mb must be a positive number.');

  return {
    input: path.resolve(input),
    outDir: outDir ? path.resolve(outDir) : null,
    mb,
  };
}

function byteLength(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

function pathEquals(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function createState() {
  return { stack: [] };
}

function stackPath(state) {
  return state.stack
    .map((entry) => entry.key)
    .filter((key) => key !== null && key !== undefined);
}

function currentValuePath(state) {
  const base = stackPath(state);
  const top = state.stack[state.stack.length - 1];
  if (!top) return base;
  if (top.type === 'object' && top.pendingKey !== null && top.pendingKey !== undefined) {
    return [...base, top.pendingKey];
  }
  if (top.type === 'array') return [...base, '[]'];
  return base;
}

function primitiveValue(token) {
  if (token.name === 'stringValue') return token.value;
  if (token.name === 'numberValue') return parseFloat(token.value);
  if (token.name === 'nullValue') return null;
  if (token.name === 'trueValue') return true;
  if (token.name === 'falseValue') return false;
  return undefined;
}

function isPrimitiveToken(token) {
  return [
    'stringValue',
    'numberValue',
    'nullValue',
    'trueValue',
    'falseValue',
  ].includes(token.name);
}

function updateState(state, token) {
  const top = state.stack[state.stack.length - 1];

  if (token.name === 'keyValue') {
    if (top?.type === 'object') top.pendingKey = token.value;
    return;
  }

  if (token.name === 'startObject' || token.name === 'startArray') {
    const parent = state.stack[state.stack.length - 1];
    const key = parent?.type === 'object' ? parent.pendingKey : null;
    if (parent?.type === 'object') parent.pendingKey = null;
    state.stack.push({
      type: token.name === 'startObject' ? 'object' : 'array',
      key,
      pendingKey: null,
    });
    return;
  }

  if (isPrimitiveToken(token)) {
    if (top?.type === 'object') top.pendingKey = null;
    return;
  }

  if (token.name === 'endObject' || token.name === 'endArray') {
    state.stack.pop();
  }
}

function buildPart(base, metadata, quotes, { part }) {
  const data = {
    authors: metadata.authors || [],
    sources: metadata.sources || [],
    tags: metadata.tags || [],
  };

  if (Array.isArray(metadata.noteTypes) && metadata.noteTypes.length > 0) {
    data.noteTypes = metadata.noteTypes;
  }
  if (metadata.settings && typeof metadata.settings === 'object' && !Array.isArray(metadata.settings)) {
    data.settings = metadata.settings;
  }

  data.quotes = quotes;

  return {
    version: base.version || '2.0',
    exportedAt: base.exportedAt || new Date().toISOString(),
    noteTypeFilter: base.noteTypeFilter != null ? base.noteTypeFilter : 'all',
    splitBackup: { part },
    counts: {
      authors: data.authors.length,
      sources: data.sources.length,
      tags: data.tags.length,
      quotes: quotes.length,
    },
    data,
  };
}

function writePart({ dir, baseName, ext, base, metadata, quotes, part, logger }) {
  const doc = buildPart(base, metadata, quotes, { part });
  const outPath = path.join(dir, `${baseName}_${part}${ext}`);
  const json = JSON.stringify(doc);
  fs.writeFileSync(outPath, json, 'utf8');
  logger.log(
    `  Wrote ${path.basename(outPath)} -- ${quotes.length} notes -- ${(byteLength(json) / 1024 / 1024).toFixed(2)} MB`,
  );
}

async function splitBackup({ input, outDir, mb, logger = console }) {
  if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);

  const dir = outDir || path.dirname(input);
  fs.mkdirSync(dir, { recursive: true });

  const targetBytes = mb * 1024 * 1024;
  const inputSize = fs.statSync(input).size;
  const baseName = path.basename(input, path.extname(input));
  const ext = path.extname(input) || '.json';

  const base = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    noteTypeFilter: 'all',
  };
  const metadata = {
    authors: [],
    sources: [],
    tags: [],
    noteTypes: [],
    settings: null,
  };

  let active = null;
  let bytesRead = 0;
  let noteCount = 0;
  let part = 1;
  let baseBytes = null;
  let currentQuotes = [];
  let currentQuoteBytes = 0;
  const state = createState();

  function computeBaseBytes() {
    return byteLength(buildPart(base, metadata, [], { part }));
  }

  function ensureBaseBytes() {
    if (baseBytes !== null) return;
    baseBytes = computeBaseBytes();
    if (baseBytes >= targetBytes) {
      throw new Error(
        `Metadata alone (${(baseBytes / 1024 / 1024).toFixed(2)} MB) exceeds target ${mb} MB. Increase --mb.`,
      );
    }
  }

  function flushPart() {
    if (currentQuotes.length === 0) return;
    writePart({ dir, baseName, ext, base, metadata, quotes: currentQuotes, part, logger });
    part++;
    currentQuotes = [];
    currentQuoteBytes = 0;
    baseBytes = computeBaseBytes();
  }

  function addQuote(quote) {
    ensureBaseBytes();
    const quoteJson = JSON.stringify(quote);
    const quoteBytes = byteLength(quoteJson);
    const commaBytes = currentQuotes.length > 0 ? 1 : 0;

    if (
      currentQuotes.length > 0 &&
      baseBytes + currentQuoteBytes + commaBytes + quoteBytes > targetBytes
    ) {
      flushPart();
    }

    if (baseBytes + quoteBytes > targetBytes) {
      logger.warn(
        `  Warning: note id=${quote?.id ?? 'unknown'} alone is ${((baseBytes + quoteBytes) / 1024 / 1024).toFixed(2)} MB > ${mb} MB; writing it as its own part.`,
      );
    }

    currentQuotes.push(quote);
    currentQuoteBytes += (currentQuotes.length > 1 ? 1 : 0) + quoteBytes;
    noteCount++;
  }

  function consumeActive(token) {
    if (!active) return;
    active.assembler.consume(token);
    if (!active.assembler.done) return;

    const value = active.assembler.current;
    if (active.kind === 'quote') {
      addQuote(value);
    } else {
      metadata[active.kind] = value;
    }
    active = null;
  }

  function maybeStartAssembler(token, valuePath) {
    if (active) return;

    const metadataArrayPaths = new Map([
      ['authors', ['data', 'authors']],
      ['sources', ['data', 'sources']],
      ['tags', ['data', 'tags']],
      ['noteTypes', ['data', 'noteTypes']],
    ]);

    if (token.name === 'startArray') {
      for (const [kind, expectedPath] of metadataArrayPaths) {
        if (pathEquals(valuePath, expectedPath)) {
          active = { kind, assembler: new Assembler() };
          return;
        }
      }
    }

    if (token.name === 'startObject') {
      if (pathEquals(valuePath, ['counts'])) {
        active = { kind: 'counts', assembler: new Assembler() };
      } else if (pathEquals(valuePath, ['data', 'settings'])) {
        active = { kind: 'settings', assembler: new Assembler() };
      } else if (pathEquals(valuePath, ['data', 'quotes', '[]'])) {
        active = { kind: 'quote', assembler: new Assembler() };
      }
    }
  }

  function capturePrimitive(token, valuePath) {
    if (!isPrimitiveToken(token)) return;
    const value = primitiveValue(token);
    if (pathEquals(valuePath, ['version'])) base.version = value;
    else if (pathEquals(valuePath, ['exportedAt'])) base.exportedAt = value;
    else if (pathEquals(valuePath, ['noteTypeFilter'])) base.noteTypeFilter = value;
  }

  logger.log(`Reading ${input} (single-pass streaming) ...`);

  const inputStream = fs.createReadStream(input);
  inputStream.on('data', (chunk) => {
    bytesRead += chunk.length;
  });

  const progressTimer = setInterval(() => {
    const pct = inputSize > 0 ? ((bytesRead / inputSize) * 100).toFixed(1) : '0.0';
    logger.log(
      `  Progress: ${(bytesRead / 1024 / 1024).toFixed(1)} / ${(inputSize / 1024 / 1024).toFixed(1)} MB (${pct}%), notes=${noteCount}, parts written=${part - 1}`,
    );
  }, PROGRESS_INTERVAL_MS);

  await new Promise((resolve, reject) => {
    const pipeline = chain([inputStream, parser()]);
    let failed = false;

    function fail(error) {
      if (failed) return;
      failed = true;
      clearInterval(progressTimer);
      inputStream.destroy(error);
      if (typeof pipeline.destroy === 'function') pipeline.destroy(error);
      reject(error);
    }

    pipeline.on('data', (token) => {
      if (failed) return;
      try {
        const valuePath = currentValuePath(state);
        maybeStartAssembler(token, valuePath);
        capturePrimitive(token, valuePath);
        consumeActive(token);
        updateState(state, token);
      } catch (error) {
        fail(error);
      }
    });
    pipeline.on('end', resolve);
    pipeline.on('error', fail);
  });

  clearInterval(progressTimer);
  flushPart();

  if (noteCount === 0) {
    ensureBaseBytes();
    writePart({ dir, baseName, ext, base, metadata, quotes: [], part, logger });
  }

  logger.log(`\nDone. Split ${noteCount} notes into ${part - 1 || 1} part(s).`);
  logger.log(`Import with: npm run import-backup-parts -- ${dir} --url http://localhost:4000`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  await splitBackup(args);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildPart,
  currentValuePath,
  parseArgs,
  splitBackup,
  updateState,
};
