#!/usr/bin/env node
/**
 * Compare notes in a **source** PostgreSQL database vs a **target** database,
 * then optionally emit a Restore-compatible JSON bundle or **apply** missing
 * notes onto the target (DB rows + attachment files).
 *
 * **Source safety:** The source database connection uses PostgreSQL
 * `default_transaction_read_only=on` (SELECT-only; INSERT/UPDATE/DELETE are
 * rejected by the server). The source attachments directory is only read
 * (`readFileSync` / `existsSync`). All mutations are on the target DB and
 * target attachments path only.
 *
 * Why not match on `id` only? Two live DBs often have different SERIAL values.
 * Default matching uses a **content fingerprint** (hash of type, text, dates,
 * author/source names, etc.). Use `--match id` only when both DBs share the
 * same id space (e.g. restore clones).
 *
 * Parameters (CLI flags or environment — CLI wins):
 *
 *   --source-url / SOURCE_DATABASE_URL
 *   --target-url / TARGET_DATABASE_URL
 *   --source-attach / SOURCE_ATTACHMENTS   (the `attachments` folder: contains
 *                 `training/`, `quote/`, … — **not** the vault parent.)
 *   --target-attach / TARGET_ATTACHMENTS   (same; required for `--apply` only.)
 *
 * Modes:
 *   (default)     Report counts + first few missing fingerprints (no writes).
 *                 Also prints unique-fingerprint counts and duplicate-row hints
 *                 so a higher target *row* count than source is easy to interpret.
 *   --json-out F  Write `{"data":{authors,sources,tags,quotes}, "counts":…}` for
 *                 Restore Data / `POST /api/import/json`. Target attachments
 *                 path is **not** needed. You still need **--source-attach**
 *                 to turn `file:…` refs into base64 when files exist (see
 *                 `--max-embed-mb`). Each quote omits `id` so the importer does
 *                 not skip rows when source id + text + author match an existing
 *                 target row (that skip path never merges `note_title`).
 *   --apply       Insert missing notes on **target** + copy/write attachments
 *                 under **--target-attach**. Uses a single transaction.
 *
 * Options:
 *   --match fingerprint|id
 *   --note-type TYPE   Only consider notes where note_type = TYPE (optional).
 *   --max-embed-mb N   For `--json-out`, inline files as base64 up to N MB each
 *                      (default 8). Larger files stay as `file:rel:mime` refs;
 *                      you must copy those paths into the target attachments
 *                      tree before import.
 *   --limit N          Cap how many missing notes are exported / applied.
 *   --storage-threshold-mb N  Passed through to fileStorage.processForStorage
 *                             on `--apply` (default 1).
 *   --no-missing-details     Skip read-only “why missing?” breakdown (default prints it).
 *
 * Examples:
 *   node scripts/sync-db-notes.js \
 *     --source-url "$SRC" --source-attach /data/src/attachments \
 *     --target-url "$TGT"
 *
 *   node scripts/sync-db-notes.js ... --json-out ./missing-for-restore.json
 *
 *   node scripts/sync-db-notes.js ... --target-attach /data/tgt/attachments --apply
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const fileStorage = require("../src/fileStorage");

const FINGERPRINT_SQL = `
  md5(concat_ws(E'\\x1e',
    COALESCE(n.note_type, ''),
    COALESCE(n.type, ''),
    COALESCE(n.note_date::text, ''),
    COALESCE(n.note_text, ''),
    COALESCE(n.comment, ''),
    COALESCE(n.note_title, ''),
    COALESCE(n.translation_group, ''),
    COALESCE(a.name, ''),
    COALESCE(s.name, '')
  ))
`;

function parseArgs(argv) {
  const o = {
    match: "fingerprint",
    maxEmbedMb: 8,
    limit: Infinity,
    storageThresholdMb: 1,
    noMissingDetails: false,
    noteType: null,
    jsonOut: null,
    apply: false,
    sourceUrl: process.env.SOURCE_DATABASE_URL || "",
    targetUrl: process.env.TARGET_DATABASE_URL || "",
    sourceAttach:
      process.env.SOURCE_ATTACHMENTS ||
      process.env.SOURCE_ATTACHMENTS_DIR ||
      "",
    targetAttach:
      process.env.TARGET_ATTACHMENTS ||
      process.env.TARGET_ATTACHMENTS_DIR ||
      "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--source-url") o.sourceUrl = next();
    else if (a === "--target-url") o.targetUrl = next();
    else if (a === "--source-attach") o.sourceAttach = next();
    else if (a === "--target-attach") o.targetAttach = next();
    else if (a === "--match") o.match = next();
    else if (a === "--note-type") o.noteType = next();
    else if (a === "--json-out") o.jsonOut = next();
    else if (a === "--apply") o.apply = true;
    else if (a === "--limit") o.limit = parseInt(next(), 10) || 0;
    else if (a === "--max-embed-mb") o.maxEmbedMb = parseFloat(next()) || 8;
    else if (a === "--storage-threshold-mb")
      o.storageThresholdMb = parseFloat(next()) || 1;
    else if (a === "--no-missing-details") o.noMissingDetails = true;
    else if (a === "--help" || a === "-h") o.help = true;
  }
  return o;
}

function toPgDateOnlyString(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

function usage() {
  console.log(`Usage: node scripts/sync-db-notes.js \\
  --source-url <postgres connection string> \\
  --target-url <postgres connection string> \\
  --source-attach <path to source attachments directory> \\
  [--target-attach <path to target attachments directory>] \\
  [--json-out <file.json>] [--apply] [--limit N] [--max-embed-mb N] [--no-missing-details]

Env: SOURCE_DATABASE_URL, TARGET_DATABASE_URL, SOURCE_ATTACHMENTS, TARGET_ATTACHMENTS
`);
}

async function syncNotesIdSequence(client) {
  const { rows } = await client.query(
    "SELECT pg_get_serial_sequence('notes', 'id') AS seq",
  );
  const seq = rows[0]?.seq;
  if (!seq) return;
  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM notes), 1), true)`,
    [seq],
  );
}

function isFileRef(v) {
  return v && typeof v === "string" && v.startsWith("file:");
}

/** Parse `file:relative/path.ext:mime` */
function parseFileRef(v) {
  const without = v.slice("file:".length);
  const lastColon = without.lastIndexOf(":");
  if (lastColon === -1) return { rel: without, mime: "application/octet-stream" };
  return {
    rel: without.slice(0, lastColon),
    mime: without.slice(lastColon + 1) || "application/octet-stream",
  };
}

function fileRefToDataUrl(value, sourceAttachRoot) {
  if (!value || !isFileRef(value)) return value;
  const { rel, mime } = parseFileRef(value);
  const full = path.join(sourceAttachRoot, rel);
  if (!fs.existsSync(full)) {
    console.warn(`  ⚠ missing source file: ${full}`);
    return value;
  }
  const buf = fs.readFileSync(full);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function maybeEmbedForJson(value, sourceAttachRoot, maxBytes) {
  if (!value || !isFileRef(value)) return { value, skippedBytes: 0 };
  const { rel, mime } = parseFileRef(value);
  const full = path.join(sourceAttachRoot, rel);
  if (!fs.existsSync(full)) {
    console.warn(`  ⚠ JSON export: file missing, leaving ref: ${rel}`);
    return { value, skippedBytes: 0 };
  }
  const st = fs.statSync(full);
  if (st.size > maxBytes) {
    console.warn(
      `  ⚠ JSON export: ${rel} (${(st.size / 1024 / 1024).toFixed(2)} MB) > max embed — leaving file: ref`,
    );
    return { value, skippedBytes: st.size };
  }
  const buf = fs.readFileSync(full);
  return {
    value: `data:${mime};base64,${buf.toString("base64")}`,
    skippedBytes: 0,
  };
}

async function loadFingerprints(pool, match, noteType) {
  const typeClause = noteType ? "AND n.note_type = $1" : "";
  const params = noteType ? [noteType] : [];

  if (match === "id") {
    const r = await pool.query(
      `SELECT n.id::text AS fp, n.id
       FROM notes n
       WHERE 1=1 ${typeClause}`,
      params,
    );
    return r.rows;
  }

  const r = await pool.query(
    `SELECT (${FINGERPRINT_SQL}) AS fp, n.id
     FROM notes n
     LEFT JOIN authors a ON a.id = n.author_id
     LEFT JOIN sources s ON s.id = n.source_id
     WHERE 1=1 ${typeClause}`,
    params,
  );
  return r.rows;
}

/** Fields that feed the fingerprint (for human-readable diff). Read-only. */
async function fetchFingerprintDetail(pool, noteId) {
  const { rows } = await pool.query(
    `
    SELECT n.id,
           (${FINGERPRINT_SQL}) AS fp,
           n.note_type,
           n.type,
           n.note_date,
           n.author_id,
           n.source_id,
           COALESCE(a.name, '') AS author_name,
           COALESCE(s.name, '') AS source_name,
           COALESCE(n.translation_group, '') AS translation_group,
           COALESCE(n.note_title, '') AS note_title,
           COALESCE(n.comment, '') AS comment,
           COALESCE(n.note_text, '') AS note_text,
           length(COALESCE(n.note_text, ''))::int AS note_text_len,
           octet_length(convert_to(COALESCE(n.note_text, ''), 'UTF8'))::int AS note_text_octets,
           md5(convert_to(COALESCE(n.note_text, ''), 'UTF8')) AS note_text_md5
    FROM notes n
    LEFT JOIN authors a ON a.id = n.author_id
    LEFT JOIN sources s ON s.id = n.source_id
    WHERE n.id = $1
    `,
    [noteId],
  );
  return rows[0] || null;
}

/** Target rows: same type/date/names/group AND exact note_title (read-only). */
async function fetchTargetPeersTitleAndShell(pool, src) {
  const title = (src.note_title || "").trim();
  if (!title) return [];
  const { rows } = await pool.query(
    `
    SELECT n.id,
           (${FINGERPRINT_SQL}) AS fp,
           COALESCE(n.note_title, '') AS note_title,
           length(COALESCE(n.comment, ''))::int AS comment_len,
           length(COALESCE(n.note_text, ''))::int AS note_text_len,
           md5(convert_to(COALESCE(n.note_text, ''), 'UTF8')) AS note_text_md5,
           COALESCE(n.note_text, '') AS note_text
    FROM notes n
    LEFT JOIN authors a ON a.id = n.author_id
    LEFT JOIN sources s ON s.id = n.source_id
    WHERE n.note_type IS NOT DISTINCT FROM $1::varchar
      AND n.type IS NOT DISTINCT FROM $2::varchar
      AND n.note_date IS NOT DISTINCT FROM $3::date
      AND COALESCE(a.name, '') = $4::text
      AND COALESCE(s.name, '') = $5::text
      AND COALESCE(n.translation_group, '') = $6::text
      AND COALESCE(n.note_title, '') = $7::text
    ORDER BY n.id
    LIMIT 15
    `,
    [
      src.note_type,
      src.type,
      src.note_date,
      src.author_name,
      src.source_name,
      src.translation_group || "",
      src.note_title || "",
    ],
  );
  return rows;
}

/** Target rows with same UTF-8 body md5 as source (read-only). Skip if body empty. */
async function fetchTargetPeersSameBodyMd5(pool, bodyMd5) {
  if (!bodyMd5) return [];
  const { rows } = await pool.query(
    `
    SELECT n.id,
           (${FINGERPRINT_SQL}) AS fp,
           COALESCE(n.note_title, '') AS note_title,
           length(COALESCE(n.comment, ''))::int AS comment_len,
           length(COALESCE(n.note_text, ''))::int AS note_text_len,
           md5(convert_to(COALESCE(n.note_text, ''), 'UTF8')) AS note_text_md5,
           COALESCE(n.note_text, '') AS note_text
    FROM notes n
    LEFT JOIN authors a ON a.id = n.author_id
    LEFT JOIN sources s ON s.id = n.source_id
    WHERE md5(convert_to(COALESCE(n.note_text, ''), 'UTF8')) = $1::text
    ORDER BY n.id
    LIMIT 15
    `,
    [bodyMd5],
  );
  return rows;
}

function firstTextDiff(a, b, maxScan = 12000) {
  const sa = (a || "").slice(0, maxScan);
  const sb = (b || "").slice(0, maxScan);
  const max = Math.min(sa.length, sb.length);
  for (let i = 0; i < max; i++) {
    if (sa[i] !== sb[i]) {
      const lo = Math.max(0, i - 30);
      const hi = i + 60;
      return {
        index: i,
        contextA: JSON.stringify(sa.slice(lo, hi)),
        contextB: JSON.stringify(sb.slice(lo, hi)),
        codeA: sa.codePointAt(i),
        codeB: sb.codePointAt(i),
      };
    }
  }
  if (sa.length !== sb.length) {
    return {
      index: max,
      reason: "length",
      lenA: (a || "").length,
      lenB: (b || "").length,
    };
  }
  return null;
}

function summarizeField(label, value, maxLen = 120) {
  const s = value == null ? "" : String(value);
  const oneLine = s.replace(/\s+/g, " ").trim();
  const tail = oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine;
  return `    ${label}: len=${s.length} ${JSON.stringify(tail)}`;
}

async function printMissingFingerprintDiagnostics(sourcePool, targetPool, missingIds) {
  console.log("");
  console.log(
    "── Missing fingerprint diagnostics (read-only SELECT on target; no writes) ──",
  );
  for (const id of missingIds) {
    const src = await fetchFingerprintDetail(sourcePool, id);
    if (!src) {
      console.log(`\n  id=${id}: not found on source`);
      continue;
    }
    console.log(`\n  Source id=${id}  fp=${src.fp}`);
    console.log(summarizeField("note_type", src.note_type));
    console.log(summarizeField("type", src.type));
    console.log(`    note_date: ${src.note_date == null ? "null" : String(src.note_date)}`);
    console.log(summarizeField("author_name", src.author_name));
    console.log(summarizeField("source_name", src.source_name));
    console.log(summarizeField("translation_group", src.translation_group));
    console.log(summarizeField("note_title", src.note_title, 200));
    console.log(summarizeField("comment", src.comment, 200));
    console.log(
      `    note_text: len=${src.note_text_len} octets=${src.note_text_octets} md5=${src.note_text_md5}`,
    );

    const trimmedTitle = (src.note_title || "").trim();
    let peerMode = "none";
    let peers = [];
    if (trimmedTitle) {
      peerMode = "title_shell";
      peers = await fetchTargetPeersTitleAndShell(targetPool, src);
    } else if (src.note_text_len > 0 && src.note_text_md5) {
      peerMode = "body_md5";
      peers = await fetchTargetPeersSameBodyMd5(targetPool, src.note_text_md5);
    }

    const sameFpOnTarget = peers.filter((p) => p.fp === src.fp);
    if (sameFpOnTarget.length) {
      console.log(
        `    WARN: target row(s) ${sameFpOnTarget.map((x) => x.id).join(",")} have the same fp as source (race or DB changed since fingerprint scan).`,
      );
    }
    const mismatched = peers.filter((p) => p.fp !== src.fp);

    if (peerMode === "none") {
      console.log(
        "    Skipping automatic peer list: empty note_title and empty or unusable note_text (cannot narrow candidates without scanning the whole table).",
      );
      continue;
    }

    if (!peers.length) {
      if (peerMode === "title_shell") {
        console.log(
          "    No target row with same shell + exact note_title as source. Check title spelling/whitespace or shell fields (author, date, type, translation_group).",
        );
      } else {
        console.log(
          "    No target row with the same note_text UTF-8 md5 as source. Body differs on target or was never synced.",
        );
      }
      continue;
    }

    if (!mismatched.length) {
      console.log(
        "    All narrow-match target row(s) share the same fingerprint as source (unexpected for a “missing” id; re-run stats or check for a race).",
      );
      continue;
    }

    const peerHeader =
      peerMode === "title_shell"
        ? `    Target candidates: same shell + exact note_title; fp differs (${mismatched.length} row(s), usually body/comment):`
        : `    Target candidates: same note_text UTF-8 md5; fp differs (${mismatched.length} row(s), usually title/shell/comment):`;
    console.log(peerHeader);
    for (const t of mismatched) {
      const sameBody = t.note_text_md5 === src.note_text_md5;
      const sameTitle = t.note_title === src.note_title;
      console.log(
        `      target id=${t.id} fp=${t.fp} sameBodyMd5=${sameBody} sameTitle=${sameTitle} commentLen tgt/src=${t.comment_len}/${(src.comment || "").length}`,
      );
      if (!sameBody) {
        const diff = firstTextDiff(src.note_text, t.note_text);
        if (diff && diff.reason === "length") {
          console.log(
            `        body length src=${diff.lenA} tgt=${diff.lenB} (compare md5 above)`,
          );
        } else if (diff) {
          console.log(
            `        first body diff near index ${diff.index}: codepoints U+${diff.codeA?.toString(16)} vs U+${diff.codeB?.toString(16)}`,
          );
          console.log(`        context src: ${diff.contextA}`);
          console.log(`        context tgt: ${diff.contextB}`);
        }
      }
      if (!sameTitle) {
        console.log(
          `        title src: ${JSON.stringify(src.note_title)}  tgt: ${JSON.stringify(t.note_title)}`,
        );
      }
    }
  }
  console.log("");
}

async function loadNoteExportRows(pool, ids) {
  if (ids.length === 0) return [];
  const notes = await pool.query(
    `SELECT n.*,
            a.name AS author_name,
            s.name AS source_name,
            COALESCE(
              json_agg(json_build_object('id', t.id, 'name', t.name, 'type', t.type))
              FILTER (WHERE t.id IS NOT NULL),
              '[]'::json
            ) AS tag_objects
     FROM notes n
     LEFT JOIN authors a ON a.id = n.author_id
     LEFT JOIN sources s ON s.id = n.source_id
     LEFT JOIN note_tags nt ON nt.note_id = n.id
     LEFT JOIN tags t ON t.id = nt.tag_id
     WHERE n.id = ANY($1::int[])
     GROUP BY n.id, a.name, s.name`,
    [ids],
  );

  const attResult = await pool.query(
    `SELECT note_id, position, thumbnail, attachment_full, attachment_type, filename
     FROM note_attachments
     WHERE note_id = ANY($1::int[])
     ORDER BY note_id, position`,
    [ids],
  );
  const byNote = new Map();
  for (const row of attResult.rows) {
    if (!byNote.has(row.note_id)) byNote.set(row.note_id, []);
    byNote.get(row.note_id).push(row);
  }

  const out = [];
  for (const note of notes.rows) {
    const attRows = byNote.get(note.id);
    const row = { ...note };
    if (attRows && attRows.length > 0) {
      row.attachments = attRows.map((att) => ({
        position: att.position,
        thumbnail: att.thumbnail,
        attachment_full: att.attachment_full,
        attachment_type: att.attachment_type,
        filename: att.filename,
      }));
      const primary = attRows.find((a) => a.position === 0) || attRows[0];
      if (primary.attachment_type) row.attachment_type = primary.attachment_type;
      delete row.thumbnail;
      delete row.attachment_full;
    }
    row.note_date = toPgDateOnlyString(row.note_date);
    // Omit source PK so JSON import always inserts a new row with full fields
    // (import skips when id + note_text + author already match target — no merge).
    delete row.id;
    out.push(row);
  }
  return out;
}

function collectAuthorsSourcesTagsFromQuotes(quotes) {
  const authors = new Map();
  const sources = new Map();
  const tags = new Map();

  for (const q of quotes) {
    if (q.author_name) {
      authors.set(q.author_name, {
        name: q.author_name,
        image: "",
        description: "",
      });
    }
    if (q.source_name) {
      sources.set(q.source_name, {
        name: q.source_name,
        type: "BOOK",
        image: "",
      });
    }
    if (Array.isArray(q.tag_objects)) {
      for (const t of q.tag_objects) {
        if (!t || !t.name) continue;
        const key = `${t.name}\x00${t.type || "quote"}`;
        tags.set(key, {
          name: t.name,
          type: t.type || q.note_type || "quote",
        });
      }
    }
  }
  return {
    authors: [...authors.values()],
    sources: [...sources.values()],
    tags: [...tags.values()],
  };
}

async function ensureAuthor(client, name) {
  if (!name) return null;
  const ex = await client.query("SELECT id FROM authors WHERE name = $1", [name]);
  if (ex.rows.length) return ex.rows[0].id;
  const ins = await client.query(
    "INSERT INTO authors (name, image, description) VALUES ($1, '', '') RETURNING id",
    [name],
  );
  return ins.rows[0].id;
}

async function ensureSource(client, name) {
  if (!name) return null;
  const ex = await client.query("SELECT id FROM sources WHERE name = $1", [name]);
  if (ex.rows.length) return ex.rows[0].id;
  const ins = await client.query(
    "INSERT INTO sources (name, type, image) VALUES ($1, 'BOOK', '') RETURNING id",
    [name],
  );
  return ins.rows[0].id;
}

async function ensureTag(client, name, tagType) {
  const r = await client.query(
    `INSERT INTO tags (name, type) VALUES ($1, $2)
     ON CONFLICT (name, type) DO UPDATE SET name = tags.name
     RETURNING id`,
    [name, tagType],
  );
  return r.rows[0].id;
}

/**
 * Resolve attachment fields to data URLs using source disk, then store on target.
 */
function resolveForApply(value, sourceAttachRoot) {
  if (!value) return null;
  if (isFileRef(value)) return fileRefToDataUrl(value, sourceAttachRoot);
  return value;
}

async function applyNote(client, note, sourceAttachRoot, storageThresholdMb) {
  const authorId = await ensureAuthor(client, note.author_name);
  const sourceId = await ensureSource(client, note.source_name);

  const importNoteTitle =
    note.note_title !== undefined &&
    note.note_title !== null &&
    String(note.note_title).trim() !== ""
      ? String(note.note_title).trim()
      : null;
  const importScore =
    note.score === undefined || note.score === null || note.score === ""
      ? null
      : String(note.score).trim() || null;
  const importNoteDate = toPgDateOnlyString(note.note_date);
  const noteType = note.note_type || "quote";

  const ins = await client.query(
    `INSERT INTO notes (note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                        attachment_type, created_at, updated_at, translation_group)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      note.note_text,
      importNoteTitle,
      authorId,
      sourceId,
      note.type,
      note.comment,
      noteType,
      importNoteDate,
      importScore,
      note.attachment_type || null,
      note.created_at || new Date(),
      note.updated_at || new Date(),
      note.translation_group || null,
    ],
  );
  const quoteId = ins.rows[0].id;

  const storageFolder = noteType || "quotes";
  const attachmentRows =
    note.attachments && note.attachments.length > 0
      ? note.attachments
      : note.thumbnail || note.attachment_full
        ? [
            {
              thumbnail: note.thumbnail,
              attachment_full: note.attachment_full,
              attachment_type: note.attachment_type,
              filename: note.filename,
              position: 0,
            },
          ]
        : [];

  let primaryThumb = null;
  let primaryFull = null;

  for (const att of attachmentRows) {
    const pos = att.position ?? 0;
    const suffix = pos === 0 ? "" : `_${pos}`;
    const thumbIn = resolveForApply(att.thumbnail, sourceAttachRoot);
    const fullIn = resolveForApply(att.attachment_full, sourceAttachRoot);
    const procThumb = fileStorage.processForStorage(
      thumbIn,
      storageFolder,
      quoteId,
      suffix ? `${suffix}` : "",
      storageThresholdMb,
      false,
    );
    const procFull = fileStorage.processForStorage(
      fullIn,
      storageFolder,
      quoteId,
      pos === 0 ? "" : `_${pos}`,
      storageThresholdMb,
      true,
    );

    await client.query(
      `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
       VALUES ($1, $2, $3, $4, $5, 'base64', $6)`,
      [
        quoteId,
        pos,
        procThumb || null,
        procFull || null,
        att.attachment_type || null,
        att.filename || null,
      ],
    );

    if (pos === 0) {
      primaryThumb = procThumb;
      primaryFull = procFull;
    }
  }

  if (primaryThumb || primaryFull) {
    await client.query(
      `UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3`,
      [primaryThumb, primaryFull, quoteId],
    );
  }

  if (note.tag_objects && note.tag_objects.length > 0) {
    for (const tagObj of note.tag_objects) {
      const tagId = await ensureTag(
        client,
        tagObj.name,
        tagObj.type || noteType,
      );
      await client.query(
        `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [quoteId, tagId],
      );
    }
  }

  return quoteId;
}

/** Pool for source DB: server-enforced read-only transactions. */
function createSourcePool(connectionString) {
  return new Pool({
    connectionString,
    options:
      "-c default_transaction_read_only=on -c application_name=sync-db-notes-source-ro",
  });
}

/** Fail fast if the server did not honor read-only (e.g. some poolers strip startup options). */
async function assertSourcePoolIsReadOnly(pool) {
  const { rows } = await pool.query(
    "SELECT current_setting('default_transaction_read_only') AS ro",
  );
  const ro = rows[0]?.ro;
  if (ro !== "on") {
    throw new Error(
      `Source database is not read-only (default_transaction_read_only=${JSON.stringify(
        ro,
      )}). Refusing to continue.`,
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    return;
  }

  if (!opts.sourceUrl || !opts.targetUrl) {
    console.error("❌ --source-url and --target-url are required.");
    usage();
    process.exit(1);
  }
  if (!opts.sourceAttach) {
    console.error("❌ --source-attach is required (path to the source `attachments` folder).");
    process.exit(1);
  }
  if (!fs.existsSync(opts.sourceAttach)) {
    console.error(`❌ Source attachments path not found: ${opts.sourceAttach}`);
    process.exit(1);
  }
  if (opts.apply && !opts.targetAttach) {
    console.error("❌ --apply requires --target-attach (path to the target `attachments` folder).");
    process.exit(1);
  }
  if (opts.apply && !fs.existsSync(opts.targetAttach)) {
    console.error(`❌ Target attachments path not found: ${opts.targetAttach}`);
    process.exit(1);
  }

  if (opts.match !== "fingerprint" && opts.match !== "id") {
    console.error('❌ --match must be "fingerprint" or "id"');
    process.exit(1);
  }

  const sourcePool = createSourcePool(opts.sourceUrl);
  const targetPool = new Pool({ connectionString: opts.targetUrl });

  try {
    await assertSourcePoolIsReadOnly(sourcePool);

    const [srcRows, tgtRows] = await Promise.all([
      loadFingerprints(sourcePool, opts.match, opts.noteType),
      loadFingerprints(targetPool, opts.match, opts.noteType),
    ]);

    const targetFp = new Set(tgtRows.map((r) => r.fp));
    const sourceFp = new Set(srcRows.map((r) => r.fp));
    const srcUnique = sourceFp.size;
    const tgtUnique = targetFp.size;

    let targetOnlyFpCount = 0;
    for (const fp of targetFp) {
      if (!sourceFp.has(fp)) targetOnlyFpCount++;
    }

    const tgtExtraRowsSameFp = tgtRows.length - tgtUnique;
    const srcExtraRowsSameFp = srcRows.length - srcUnique;

    const missing = [];

    for (const row of srcRows) {
      if (targetFp.has(row.fp)) continue;
      missing.push(row.id);
      if (missing.length >= opts.limit) break;
    }

    console.log("");
    console.log(`Source notes (filtered): ${srcRows.length}`);
    console.log(`Target notes (filtered): ${tgtRows.length}`);
    console.log(`Unique fingerprints — source: ${srcUnique}, target: ${tgtUnique}`);
    console.log(
      `Extra rows (same fingerprint as another row) — source: ${srcExtraRowsSameFp}, target: ${tgtExtraRowsSameFp}`,
    );
    console.log(
      `Fingerprints on target with no matching note on source: ${targetOnlyFpCount}`,
    );
    console.log(`Missing on target (by ${opts.match}): ${missing.length}`);
    console.log(
      "(Row counts can differ from unique fingerprints when duplicates or target-only notes exist.)",
    );
    console.log("");

    if (missing.length > 0) {
      const preview = await sourcePool.query(
        `SELECT id, note_type, left(comment, 60) AS cmt, left(note_text, 40) AS txt
         FROM notes WHERE id = ANY($1::int[]) LIMIT 8`,
        [missing.slice(0, 8)],
      );
      console.log("Sample missing source ids:");
      for (const p of preview.rows) {
        console.log(`  id=${p.id} type=${p.note_type} comment=${JSON.stringify(p.cmt)}`);
      }
      console.log("");
    }

    if (
      missing.length > 0 &&
      !opts.noMissingDetails &&
      opts.match === "fingerprint"
    ) {
      const detailIds = missing.slice(0, 40);
      if (missing.length > detailIds.length) {
        console.log(
          `(Printing fingerprint diagnostics for first ${detailIds.length} missing ids only; use --limit or --no-missing-details.)`,
        );
      }
      await printMissingFingerprintDiagnostics(
        sourcePool,
        targetPool,
        detailIds,
      );
    }

    const exportRows = await loadNoteExportRows(sourcePool, missing);

    if (opts.jsonOut) {
      const maxBytes = Math.max(0, opts.maxEmbedMb) * 1024 * 1024;
      let largeRefs = 0;
      for (const q of exportRows) {
        const processVal = (v) => {
          if (!v || !isFileRef(v)) return v;
          const { value } = maybeEmbedForJson(
            v,
            opts.sourceAttach,
            maxBytes,
          );
          if (isFileRef(value)) largeRefs++;
          return value;
        };
        if (q.attachments) {
          for (const att of q.attachments) {
            att.thumbnail = processVal(att.thumbnail);
            att.attachment_full = processVal(att.attachment_full);
          }
        } else {
          if (q.thumbnail) q.thumbnail = processVal(q.thumbnail);
          if (q.attachment_full) q.attachment_full = processVal(q.attachment_full);
        }
      }

      const { authors, sources, tags } = collectAuthorsSourcesTagsFromQuotes(exportRows);
      const bundle = {
        data: {
          authors,
          sources,
          tags,
          quotes: exportRows,
        },
        counts: {
          quotes: exportRows.length,
          authors: authors.length,
          sources: sources.length,
          tags: tags.length,
        },
      };
      fs.writeFileSync(opts.jsonOut, JSON.stringify(bundle, null, 2), "utf8");
      console.log(`✅ Wrote JSON: ${path.resolve(opts.jsonOut)}`);
      if (largeRefs > 0) {
        console.log(
          `⚠ ${largeRefs} file reference(s) left as file:… (over --max-embed-mb or missing). Copy those files into the target attachments tree before Restore, or use --apply.`,
        );
      }
    }

    if (opts.apply) {
      fileStorage.setAttachmentsDirAbsolute(opts.targetAttach);
      const client = await targetPool.connect();
      try {
        await client.query("BEGIN");
        await syncNotesIdSequence(client);
        let n = 0;
        for (const note of exportRows) {
          await applyNote(
            client,
            note,
            opts.sourceAttach,
            opts.storageThresholdMb,
          );
          n++;
          if (n % 20 === 0) console.log(`  … applied ${n}/${exportRows.length}`);
        }
        await syncNotesIdSequence(client);
        await client.query("COMMIT");
        console.log(`✅ Applied ${exportRows.length} note(s) to target.`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("❌ Apply failed:", e.message);
        throw e;
      } finally {
        client.release();
      }
    } else if (!opts.jsonOut) {
      console.log("Tip: add --json-out <file.json> to export missing notes for Restore, or --apply to write to target.");
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
