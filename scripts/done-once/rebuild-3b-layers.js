#!/usr/bin/env node
// One-shot: rebuild Step 3b CSS from HEAD.
// - Wrap each file in the right @layer
// - In components: keep !important only on rules whose selector mentions
//   ql- / quill / #lpPaneQuill; strip it everywhere else
// - Responsive sheets keep all !important (intra-file duplicates)

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "../../public");

const LAYERS = {
  "style.css": "base",
  "style.tokens.css": "modes",
  "style.sidemenu.css": "components",
  "style.search.css": "components",
  "style.buttons.css": "components",
  "style.modal.css": "components",
  "style.cards.css": "components",
  "style.selection.css": "components",
  "style.attachments.css": "components",
  "style.entities.css": "components",
  "style.settings.css": "components",
  "style.dialogs.css": "components",
  "style.views.css": "components",
  "style.containers.css": "components",
  "style.mobile.css": "responsive",
  "style.small.css": "responsive",
  "style.medium.css": "responsive",
};

function gitShow(rel) {
  return execFileSync("git", ["show", `HEAD:public/${rel}`], {
    cwd: path.join(__dirname, "../.."),
    encoding: "utf8",
  });
}

function unwrapLayer(text) {
  if (!text.startsWith("@layer ")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return `${text.slice(start + 1, end).replace(/^\n/, "").replace(/\n$/, "")}\n`;
}

function wrapLayer(layer, text) {
  return `@layer ${layer} {\n${text.replace(/\s+$/, "")}\n}\n`;
}

function skipComment(s, i) {
  if (!s.startsWith("/*", i)) return i;
  const j = s.indexOf("*/", i + 2);
  return j < 0 ? s.length : j + 2;
}

function findMatchingBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    i = skipComment(s, i);
    if (i >= s.length) break;
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// On ql/quill rules, keep !important only for properties that fight the CDN
// skin (colour, chrome). Drop it for font/overflow/margin so @layer responsive
// can still win those at phone/medium widths (!important reverses layer order).
// Quill lives in @layer vendor, so font/overflow/margin win without !important.
// Keep !important only for SVG icon colour chrome that Quill sets aggressively.
const QL_KEEP_IMPORTANT = /^(color|fill|stroke|background|background-color|background-image|border|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|box-shadow|caret-color)\b/i;

function processBody(body, mode, stats) {
  // mode: false = strip all; 'ql' = keep CDN-chrome props; 'all' = keep every !important
  return body.replace(/([\w-]+)\s*:\s*([^;]+);/g, (decl, prop) => {
    if (!decl.includes("!important")) return decl;
    const keep = mode === "all" || (mode === "ql" && QL_KEEP_IMPORTANT.test(prop));
    if (keep) {
      stats.kept++;
      return decl;
    }
    stats.stripped++;
    return decl.replace(/\s*!important/g, "");
  });
}

function transformChunk(chunk, stats) {
  let out = "";
  let pos = 0;
  const n = chunk.length;
  while (pos < n) {
    const nextComment = chunk.indexOf("/*", pos);
    const nextAt = chunk.indexOf("@", pos);
    const nextBrace = chunk.indexOf("{", pos);

    // leading comments / whitespace before next construct
    const candidates = [nextComment, nextAt, nextBrace].filter((x) => x >= 0);
    if (!candidates.length) {
      out += chunk.slice(pos);
      break;
    }
    const next = Math.min(...candidates);

    if (nextComment === next) {
      out += chunk.slice(pos, next);
      pos = skipComment(chunk, next);
      out += chunk.slice(next, pos);
      continue;
    }

    if (nextAt === next && (nextBrace < 0 || nextAt < nextBrace)) {
      out += chunk.slice(pos, next);
      const brace = chunk.indexOf("{", next);
      if (brace < 0) {
        out += chunk.slice(next);
        break;
      }
      const close = findMatchingBrace(chunk, brace);
      out += chunk.slice(next, brace + 1);
      out += transformChunk(chunk.slice(brace + 1, close), stats);
      out += "}";
      pos = close + 1;
      continue;
    }

    // normal rule: selector is [pos, nextBrace)
    const sel = chunk.slice(pos, nextBrace);
    const close = findMatchingBrace(chunk, nextBrace);
    const body = chunk.slice(nextBrace + 1, close);
    let mode = false;
    if (/search-field-clear|search-input-clear|results-counts/i.test(sel)) mode = "all";
    else if (/ql-|quill|#lpPaneQuill/i.test(sel)) mode = "ql";
    out += sel + "{" + processBody(body, mode, stats) + "}";
    pos = close + 1;
  }
  return out;
}

for (const [name, layer] of Object.entries(LAYERS)) {
  const head = unwrapLayer(gitShow(name));
  if (layer === "responsive" || layer === "base" || layer === "modes") {
    fs.writeFileSync(path.join(root, name), wrapLayer(layer, head));
    console.log(`${name}: HEAD → @${layer}`);
    continue;
  }
  const stats = { kept: 0, stripped: 0 };
  const transformed = transformChunk(head, stats);
  fs.writeFileSync(path.join(root, name), wrapLayer(layer, transformed));
  console.log(`${name}: @${layer} kept=${stats.kept} stripped=${stats.stripped}`);
}
