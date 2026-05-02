#!/usr/bin/env node
/* eslint-disable */
/**
 * One-shot script to split public/style.css into:
 *   - public/style.css         (base / desktop, no @media blocks)
 *   - public/style.mobile.css  (all max-width @media queries)
 *   - public/style.medium.css  (all (min-width: 768px) and (max-width: 1100px) @media queries)
 *
 * It walks the source character-by-character, tracking brace depth and
 * string/comment state, so each top-level @media block is preserved exactly
 * as written (including any preceding comments on the immediately-prior lines
 * if they look like a header for the block).
 *
 * Re-run with: node scripts/split-css.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'style.css');
const OUT_BASE = path.join(ROOT, 'public', 'style.css');
const OUT_MOBILE = path.join(ROOT, 'public', 'style.mobile.css');
const OUT_MEDIUM = path.join(ROOT, 'public', 'style.medium.css');

const src = fs.readFileSync(SRC, 'utf8');

// ── Locate every top-level @media block ──────────────────────────────────
// Returns array of { start, end, header, body } where start/end are byte
// offsets into src and header is the raw "@media (...)" prelude.
function findMediaBlocks(text) {
  const blocks = [];
  let i = 0;
  const n = text.length;
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  let inDouble = false;

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inSingle) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
    if (ch === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }

    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; continue; }

    // Look for "@media" at top level only.
    if (depth === 0 && ch === '@' && text.startsWith('@media', i)) {
      const start = i;
      // advance to the opening `{` of this media block
      let j = i + '@media'.length;
      while (j < n && text[j] !== '{') j++;
      if (j >= n) break;
      const headerEnd = j;
      const header = text.slice(start, headerEnd).trim();
      // walk balanced braces of the @media block
      let d = 0;
      let k = j;
      let inLC = false, inBC = false, inS = false, inD = false;
      while (k < n) {
        const c = text[k];
        const nx = text[k + 1];
        if (inLC) { if (c === '\n') inLC = false; k++; continue; }
        if (inBC) { if (c === '*' && nx === '/') { inBC = false; k += 2; continue; } k++; continue; }
        if (inS)  { if (c === '\\') { k += 2; continue; } if (c === "'") inS = false; k++; continue; }
        if (inD)  { if (c === '\\') { k += 2; continue; } if (c === '"') inD = false; k++; continue; }
        if (c === '/' && nx === '*') { inBC = true; k += 2; continue; }
        if (c === '/' && nx === '/') { inLC = true; k += 2; continue; }
        if (c === "'") { inS = true; k++; continue; }
        if (c === '"') { inD = true; k++; continue; }
        if (c === '{') { d++; k++; continue; }
        if (c === '}') { d--; k++; if (d === 0) break; continue; }
        k++;
      }
      const end = k; // exclusive end (just after the closing brace)
      blocks.push({ start, end, header });
      i = end;
      continue;
    }

    i++;
  }
  return blocks;
}

// Decide which output file a media block belongs in.
// Convention used in this codebase:
//   - "(min-width: 768px) and (max-width: 1100px)" → medium
//   - any "max-width: ..." query (mobile, 480, 720, 767, 900) → mobile
//   - anything else → base (left in place); none currently exist
function classify(header) {
  const h = header.replace(/\s+/g, ' ');
  const isMedium = /min-width:\s*768px/.test(h) && /max-width:\s*1100px/.test(h);
  if (isMedium) return 'medium';
  if (/max-width:/.test(h)) return 'mobile';
  return 'unknown';
}

// Pull a leading comment block (if it directly precedes a @media block) so
// the comment travels with the block to its new file.  Walk backwards from
// `start` over whitespace, then if we hit a `*/`, capture the matching `/*`.
function extendStartToLeadingComment(text, start) {
  let i = start - 1;
  // skip whitespace immediately before the block
  while (i >= 0 && /[ \t\r\n]/.test(text[i])) i--;
  if (i < 1) return start;
  if (text[i] !== '/' || text[i - 1] !== '*') return start;
  // walk back to matching /*
  let j = i - 1;
  while (j >= 1) {
    if (text[j] === '*' && text[j - 1] === '/') { j -= 1; break; }
    j--;
  }
  if (j < 0) return start;
  // make sure no non-whitespace exists between the comment end and `start`
  // (already guaranteed by our whitespace skip above), so adopt j as new start
  // but we need to also consume any whitespace BEFORE the comment so the gap
  // is preserved at the original location -- nope, leave that alone (the gap
  // becomes the join-point between siblings in the base file).
  return j;
}

const blocks = findMediaBlocks(src);
console.log(`Found ${blocks.length} top-level @media blocks.`);

// Optionally extend each block's start to swallow an immediately-preceding
// comment that looks like a header for the block.
for (const b of blocks) {
  const extended = extendStartToLeadingComment(src, b.start);
  if (extended !== b.start) {
    b.start = extended;
  }
}

// Validate: ensure no block overlaps another (they shouldn't, since we
// extended only into whitespace before each one).
blocks.sort((a, b) => a.start - b.start);
for (let i = 1; i < blocks.length; i++) {
  if (blocks[i].start < blocks[i - 1].end) {
    throw new Error(`Block overlap detected at index ${i}`);
  }
}

// Build output strings.
const baseChunks = [];
const mobileChunks = [];
const mediumChunks = [];

let cursor = 0;
for (const b of blocks) {
  if (b.start > cursor) {
    baseChunks.push(src.slice(cursor, b.start));
  }
  const kind = classify(b.header);
  const chunk = src.slice(b.start, b.end);
  if (kind === 'medium') {
    mediumChunks.push(chunk);
  } else if (kind === 'mobile') {
    mobileChunks.push(chunk);
  } else {
    console.warn(`Unknown @media kind, leaving in base: ${b.header}`);
    baseChunks.push(chunk);
  }
  cursor = b.end;
}
if (cursor < src.length) {
  baseChunks.push(src.slice(cursor));
}

const banner = (label) => `/* ============================================================
   ${label}
   Generated by scripts/split-css.js — see ARCHITECTURE.md for the
   responsive-CSS file layout.  Order in index.html matters:
       style.css  →  style.mobile.css  →  style.medium.css
   ============================================================ */\n\n`;

const baseOut   = banner('Misa Notes — base / desktop styles') + baseChunks.join('').replace(/\n{3,}/g, '\n\n');
const mobileOut = banner('Misa Notes — mobile + tablet (max-width queries)') + mobileChunks.join('\n\n');
const mediumOut = banner('Misa Notes — medium screens (768px – 1100px)') + mediumChunks.join('\n\n');

fs.writeFileSync(OUT_BASE, baseOut);
fs.writeFileSync(OUT_MOBILE, mobileOut);
fs.writeFileSync(OUT_MEDIUM, mediumOut);

console.log('Wrote:');
for (const p of [OUT_BASE, OUT_MOBILE, OUT_MEDIUM]) {
  const stat = fs.statSync(p);
  const lines = fs.readFileSync(p, 'utf8').split('\n').length;
  console.log(`  ${path.relative(ROOT, p).padEnd(28)} ${String(lines).padStart(5)} lines  ${String(stat.size).padStart(8)} bytes`);
}
