#!/usr/bin/env node
/**
 * Find vault image attachments *visually similar* to images in a **candidate directory**
 * (64-bit difference hash / dHash). Put one or many images in that folder (single image = one file in the folder).
 *
 * Each run:
 *   1) Re-hash every image under the vault attachments root (no disk cache — vault may have changed).
 *   2) For each candidate image, compare against that in-memory vault index and print matches.
 *
 *   node scripts/find-similar-attachment-images.js /path/to/candidate-folder
 *   node scripts/find-similar-attachment-images.js ./incoming --max-dist 14 --top 20
 *   node scripts/find-similar-attachment-images.js ./incoming --only tegneserie
 *
 * Vault attachments root (first match wins):
 *   1) --dir PATH          → PATH (the real …/attachments folder)
 *   2) --vault PATH        → PATH/attachments
 *   3) config/local.json   → vaultPath + /attachments
 *   4) ./attachments
 *
 * Options:
 *   --max-dist N     Max Hamming distance (default: 12).
 *   --likely-max N   Hamming ≤ N → [likely]; above N (still ≤ max-dist) → [potential] (verify visually).
 *                    Default N scales with max-dist (~upper third of the range is “potential”).
 *   --top N          Max matches printed per candidate (default: 30).
 *   --only TYPE      Comma-separated subfolders under attachments (e.g. tegneserie,note).
 *   --concurrency N  Parallel sharp jobs (default: 6).
 *   --flat-candidates Only images directly in the candidate folder (default: recursive).
 *
 * Note id resolution (each matching vault path):
 *   - Loads `file:…` paths from PostgreSQL (`note_attachments` + `notes` flat columns).
 *   - If no DB row matches, tries basename pattern `123.jpg` / `123_a0.jpg` → note id 123.
 *   --database-url URL   Postgres URL (overrides DATABASE_URL).
 *   --no-db              Skip DB; filename heuristic only.
 *
 * DB: uses `DATABASE_URL`, or `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`
 * from `.env` (loaded from repo root). Same pattern as other scripts in `scripts/`.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

/** @returns {bigint} */
async function dHashOfFile(filePath) {
  const { data, info } = await sharp(filePath)
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 9 || info.height !== 8 || info.channels !== 1) {
    throw new Error(`unexpected raw ${info.width}x${info.height}x${info.channels}`);
  }
  let hash = 0n;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left > right) hash |= 1n << BigInt(bit);
      bit++;
    }
  }
  return hash;
}

function hamming64(a, b) {
  let x = a ^ b;
  let n = 0;
  for (let i = 0; i < 64; i++) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

function bigIntToHex64(h) {
  return h.toString(16).padStart(16, "0");
}

/** Upper third of 0..maxDist treated as “potential” band when --likely-max omitted. */
function defaultLikelyMaxHamming(maxDist) {
  if (maxDist <= 0) return 0;
  return Math.max(0, maxDist - Math.ceil(maxDist / 3));
}

/**
 * @param {number} maxDist
 * @param {string | undefined} flagVal raw --likely-max value
 */
function resolveLikelyMaxHamming(maxDist, flagVal) {
  let n;
  if (flagVal != null && flagVal !== "" && flagVal !== true) {
    n = parseInt(String(flagVal), 10);
    if (Number.isNaN(n) || n < 0) n = defaultLikelyMaxHamming(maxDist);
  } else {
    n = defaultLikelyMaxHamming(maxDist);
  }
  if (maxDist <= 0) return 0;
  if (n >= maxDist) n = Math.max(0, maxDist - 1);
  return n;
}

function matchConfidenceLabel(dist, likelyMax) {
  return dist <= likelyMax ? "likely" : "potential";
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq !== -1) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

function readDefaultAttachmentsDir() {
  const localPath = path.join(__dirname, "../config/local.json");
  try {
    const j = JSON.parse(fs.readFileSync(localPath, "utf8"));
    if (j.vaultPath && String(j.vaultPath).trim()) {
      return path.resolve(String(j.vaultPath).trim(), "attachments");
    }
  } catch {
    /* ignore */
  }
  return path.resolve(__dirname, "../attachments");
}

/** Recursive walk; flat=true → only direct files under rootDir. */
async function collectImageFiles(rootDir, flat) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!flat) await walk(full);
      } else if (ent.isFile() && IMAGE_RE.test(ent.name)) {
        out.push(full);
      }
    }
  }
  if (flat) {
    let entries;
    try {
      entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const ent of entries) {
      const full = path.join(rootDir, ent.name);
      if (ent.isFile() && IMAGE_RE.test(ent.name)) out.push(full);
    }
    return out;
  }
  await walk(rootDir);
  return out;
}

function underOnlyTypes(absFile, attachmentsRoot, onlyTypes) {
  if (!onlyTypes.length) return true;
  const rel = path.relative(attachmentsRoot, absFile);
  const top = rel.split(path.sep)[0];
  return onlyTypes.includes(top);
}

/** Normalize relative vault path for map keys (DB uses forward slashes). */
function normalizeVaultRel(rel) {
  return String(rel).replace(/\\/g, "/");
}

/**
 * Extract relative path from DB storage value `file:<path>:<mime>`.
 * Uses last ":" so paths without extra colons still work with `image/jpeg`.
 */
function fileRefRelPath(value) {
  if (!value || typeof value !== "string" || !value.startsWith("file:")) return null;
  const rest = value.slice("file:".length);
  const idx = rest.lastIndexOf(":");
  if (idx <= 0) return null;
  return normalizeVaultRel(rest.slice(0, idx));
}

/**
 * @returns {Map<string, Set<number>>}
 */
async function loadRelPathToNoteIds(pool) {
  const map = new Map();
  function add(rel, noteId) {
    if (rel == null || noteId == null || Number.isNaN(Number(noteId))) return;
    const k = normalizeVaultRel(rel);
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(Number(noteId));
  }

  const { rows: attRows } = await pool.query(
    `SELECT note_id, attachment_full, thumbnail FROM note_attachments`,
  );
  for (const r of attRows) {
    const p1 = fileRefRelPath(r.attachment_full);
    const p2 = fileRefRelPath(r.thumbnail);
    if (p1) add(p1, r.note_id);
    if (p2) add(p2, r.note_id);
  }

  const { rows: noteRows } = await pool.query(
    `SELECT id, attachment_full, thumbnail FROM notes`,
  );
  for (const r of noteRows) {
    const p1 = fileRefRelPath(r.attachment_full);
    const p2 = fileRefRelPath(r.thumbnail);
    if (p1) add(p1, r.id);
    if (p2) add(p2, r.id);
  }

  return map;
}

function guessNoteIdFromRel(rel) {
  const base = path.basename(rel);
  const m = base.match(/^(\d+)(?:_a\d+)?\.(jpe?g|png|gif|webp)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * @param {string} rel - vault-relative path
 * @param {Map<string, Set<number>> | null} relPathToNoteIds - null if DB map not loaded
 * @param {boolean} noDbFlag - `--no-db` was passed
 */
function noteIdLineForMatch(rel, relPathToNoteIds, noDbFlag) {
  const k = normalizeVaultRel(rel);
  if (relPathToNoteIds) {
    const ids = relPathToNoteIds.get(k);
    if (ids && ids.size) {
      return `note id: ${[...ids].sort((a, b) => a - b).join(", ")}`;
    }
  }
  const guessed = guessNoteIdFromRel(rel);
  if (guessed != null) {
    const hint =
      relPathToNoteIds != null
        ? " (filename pattern; no matching file:… row in DB for this path)"
        : noDbFlag
          ? " (filename pattern)"
          : " (filename pattern; connect DB to confirm)";
    return `note id: ${guessed}${hint}`;
  }
  if (relPathToNoteIds === null) {
    if (noDbFlag) return "note id: — (--no-db)";
    return "note id: — (set DATABASE_URL or DB_* in .env, or --database-url, to look up from DB)";
  }
  return "note id: — (no DB row and basename does not look like <id>.jpg or <id>_aN.jpg)";
}

function createDbPool(flags) {
  const fromFlag = flags["database-url"] || flags["db-url"];
  const url = fromFlag != null ? String(fromFlag) : process.env.DATABASE_URL || "";
  if (url.trim()) {
    return new Pool({ connectionString: url.trim() });
  }
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  if (!host || !user || database == null || database === "") {
    return null;
  }
  return new Pool({
    host,
    port: parseInt(String(process.env.DB_PORT || "5432"), 10) || 5432,
    user,
    password: password || "",
    database,
  });
}

async function poolMap(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) break;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return ret;
}

/**
 * Fresh vault index every run (no JSON cache).
 * @returns {Promise<Array<{ rel: string, abs: string, hash: bigint }>>}
 */
async function buildVaultIndex(attachmentsRoot, onlyTypes, concurrency) {
  const allFiles = (await collectImageFiles(attachmentsRoot, false)).filter((p) =>
    underOnlyTypes(p, attachmentsRoot, onlyTypes),
  );
  const rows = (
    await poolMap(allFiles, concurrency, async (abs) => {
      const rel = path.relative(attachmentsRoot, abs);
      try {
        const hash = await dHashOfFile(abs);
        return { rel, abs: path.resolve(abs), hash };
      } catch (e) {
        console.warn(`skip vault (unreadable): ${rel} — ${e.message || e}`);
        return null;
      }
    })
  ).filter(Boolean);
  return rows;
}

function matchesForCandidate(candHash, candAbs, vaultIndex, maxDist, topN) {
  const candResolved = path.resolve(candAbs);
  const rows = [];
  for (const v of vaultIndex) {
    if (v.abs === candResolved) continue;
    const dist = hamming64(candHash, v.hash);
    rows.push({ rel: v.rel, dist });
  }
  return rows
    .filter((r) => r.dist <= maxDist)
    .sort((a, b) => a.dist - b.dist || a.rel.localeCompare(b.rel))
    .slice(0, topN);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (!positional.length) {
    console.error(`Usage: node ${path.basename(process.argv[1])} <candidate-directory> [options]\n`);
    console.error(String(fs.readFileSync(__filename, "utf8")).match(/\/\*\*([\s\S]*?)\*\//)[1]);
    process.exit(1);
  }

  const candidateDir = path.resolve(positional[0]);
  if (!fs.existsSync(candidateDir)) {
    console.error(`Not found: ${candidateDir}`);
    process.exit(1);
  }

  let st;
  try {
    st = await fs.promises.stat(candidateDir);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  if (!st.isDirectory()) {
    console.error(
      "Candidate path must be a **directory** (put one or more images inside, then pass the folder path).",
    );
    process.exit(1);
  }

  const flatCandidates = !!flags["flat-candidates"];
  const candidateFiles = await collectImageFiles(candidateDir, flatCandidates);
  candidateFiles.sort((a, b) => a.localeCompare(b));

  if (!candidateFiles.length) {
    console.error("No image files found in candidate directory.");
    process.exit(1);
  }

  let attachmentsRoot;
  if (flags.dir) attachmentsRoot = path.resolve(String(flags.dir));
  else if (flags.vault) attachmentsRoot = path.resolve(String(flags.vault), "attachments");
  else attachmentsRoot = readDefaultAttachmentsDir();

  if (!fs.existsSync(attachmentsRoot)) {
    console.error(`Attachments directory does not exist:\n  ${attachmentsRoot}`);
    process.exit(1);
  }

  const maxDist = flags["max-dist"] != null ? parseInt(String(flags["max-dist"]), 10) : 12;
  const likelyMaxHamming = resolveLikelyMaxHamming(maxDist, flags["likely-max"]);
  const topN = flags.top != null ? parseInt(String(flags.top), 10) : 30;
  const concurrency = flags.concurrency != null ? parseInt(String(flags.concurrency), 10) : 6;
  const onlyRaw = flags.only;
  const onlyTypes =
    typeof onlyRaw === "string"
      ? onlyRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  console.log(`Attachments root: ${attachmentsRoot}`);
  console.log(
    `Candidate dir:    ${candidateDir} (${candidateFiles.length} image(s)${flatCandidates ? ", flat" : ", recursive"})`,
  );
  console.log(
    `max-dist=${maxDist}  likely-max=${likelyMaxHamming}  top=${topN}  concurrency=${concurrency}`,
  );
  console.log(
    `  → [likely] if Hamming ≤ ${likelyMaxHamming}; [potential] if ${likelyMaxHamming + 1}–${maxDist} (dHash can misfire — inspect potentials).`,
  );
  if (onlyTypes.length) console.log(`only types:       ${onlyTypes.join(", ")}`);
  console.log("(Vault hashes are recomputed on every run — no persistent cache.)\n");

  let relPathToNoteIds = /** @type {Map<string, Set<number>> | null} */ (null);
  if (!flags["no-db"]) {
    const pool = createDbPool(flags);
    if (pool) {
      try {
        relPathToNoteIds = await loadRelPathToNoteIds(pool);
        console.log(
          `DB path → note id map: ${relPathToNoteIds.size} distinct file path(s) from note_attachments + notes.\n`,
        );
      } catch (e) {
        console.warn(`DB note-id lookup failed (${e.message || e}); continuing without DB.\n`);
        relPathToNoteIds = null;
      } finally {
        await pool.end().catch(() => {});
      }
    } else {
      console.log(
        "(No DATABASE_URL / DB_* in environment — note ids use filename heuristic only; see --database-url.)\n",
      );
    }
  } else {
    console.log("(--no-db: skipping PostgreSQL note id lookup.)\n");
  }

  console.log("Hashing vault images…");
  const vaultIndex = await buildVaultIndex(attachmentsRoot, onlyTypes, concurrency);
  console.log(`Vault index: ${vaultIndex.length} image(s) in memory.\n`);

  let candFail = 0;
  for (let ci = 0; ci < candidateFiles.length; ci++) {
    const candAbs = path.resolve(candidateFiles[ci]);
    const label = path.relative(candidateDir, candAbs) || candAbs;
    const sep = "═".repeat(72);
    console.log(sep);
    console.log(`Candidate ${ci + 1}/${candidateFiles.length}: ${label}`);
    console.log(sep);

    let candHash;
    try {
      candHash = await dHashOfFile(candAbs);
    } catch (e) {
      candFail++;
      console.warn(`  SKIP (unreadable): ${e.message || e}\n`);
      continue;
    }
    console.log(`dHash (hex): ${bigIntToHex64(candHash)}`);

    const matches = matchesForCandidate(candHash, candAbs, vaultIndex, maxDist, topN);
    if (!matches.length) {
      console.log(`No vault matches with distance ≤ ${maxDist}.\n`);
      continue;
    }
    console.log(`Matches (distance ≤ ${maxDist}, up to ${topN}):\n`);
    for (const m of matches) {
      const conf = matchConfidenceLabel(m.dist, likelyMaxHamming);
      console.log(`${m.dist}\t[${conf}]\t${m.rel}`);
      console.log(`\t${noteIdLineForMatch(m.rel, relPathToNoteIds, !!flags["no-db"])}`);
    }
    console.log("");
  }

  console.log("─".repeat(72));
  console.log(`Done. ${candidateFiles.length} candidate(s), ${candFail} unreadable.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
