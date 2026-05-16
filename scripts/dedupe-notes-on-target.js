#!/usr/bin/env node
/**
 * Find duplicate notes on **one** database (usually the target after sync
 * re-imports) and optionally merge + delete extras.
 *
 * Uses a **body fingerprint** (same fields as sync-db-notes **except**
 * `note_title` is omitted) so pairs like id 2062 (no title) and 6865 (same body
 * + title) are detected together.
 *
 * **Empty bodies are ignored:** notes whose `note_text` is empty / whitespace-only,
 * or only HTML with no visible text after tags are stripped, are **excluded**
 * from duplicate grouping (otherwise many placeholders share one fingerprint).
 *
 * Rules per duplicate group (same body_fp):
 *   - **Keeper:** lowest `id` (stable, original row).
 *   - **Patch:** If keeper has empty `note_title` and any duplicate has a
 *     non-empty title, set keeper’s `note_title` from the longest non-empty
 *     title among the group.
 *   - **Delete:** All other ids in the group (`note_tags` / `note_attachments`
 *     CASCADE). Orphan files under the vault for deleted ids may remain; clean
 *     separately if needed.
 *
 * Usage:
 *   node scripts/dedupe-notes-on-target.js --url "$DATABASE_URL"
 *   node scripts/dedupe-notes-on-target.js --url "$DATABASE_URL" --apply
 *
 * Env: DATABASE_URL (used if --url omitted)
 *
 * Options:
 *   --verbose   Log every group (default: summary + first 30 groups)
 *   --limit N   Process at most N duplicate groups (apply + dry-run)
 */

const { Pool } = require("pg");

const BODY_FP_SQL = `
  md5(concat_ws(E'\\x1e',
    COALESCE(n.note_type, ''),
    COALESCE(n.type, ''),
    COALESCE(n.note_date::text, ''),
    COALESCE(n.note_text, ''),
    COALESCE(n.comment, ''),
    COALESCE(n.translation_group, ''),
    COALESCE(a.name, ''),
    COALESCE(s.name, '')
  ))
`;

function parseArgs(argv) {
  const o = {
    url: process.env.DATABASE_URL || "",
    apply: false,
    verbose: false,
    limit: Infinity,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--url") o.url = next();
    else if (a === "--apply") o.apply = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--limit") o.limit = parseInt(next(), 10) || 0;
    else if (a === "--help" || a === "-h") o.help = true;
  }
  return o;
}

function usage() {
  console.log(`Usage:
  node scripts/dedupe-notes-on-target.js --url <postgres-url> [--apply] [--verbose] [--limit N]
Env: DATABASE_URL
`);
}

async function findDuplicateGroups(client) {
  const { rows } = await client.query(`
    WITH annotated AS (
      SELECT
        n.id,
        (${BODY_FP_SQL}) AS body_fp
      FROM notes n
      LEFT JOIN authors a ON a.id = n.author_id
      LEFT JOIN sources s ON s.id = n.source_id
      WHERE char_length(
        trim(regexp_replace(COALESCE(n.note_text, ''), '<[^>]+>', '', 'gi'))
      ) > 0
    )
    SELECT body_fp, array_agg(id ORDER BY id) AS ids, COUNT(*)::int AS cnt
    FROM annotated
    GROUP BY body_fp
    HAVING COUNT(*) > 1
    ORDER BY MIN(id)
  `);
  return rows;
}

async function pickBestTitle(client, ids) {
  const { rows } = await client.query(
    `SELECT note_title FROM notes
     WHERE id = ANY($1::int[])
       AND note_title IS NOT NULL
       AND trim(note_title) <> ''
     ORDER BY length(note_title) DESC
     LIMIT 1`,
    [ids],
  );
  return rows[0]?.note_title || null;
}

async function keeperTitle(client, keeperId) {
  const { rows } = await client.query(
    `SELECT NULLIF(trim(COALESCE(note_title, '')), '') AS t FROM notes WHERE id = $1`,
    [keeperId],
  );
  return rows[0]?.t || null;
}

async function attachmentRowCount(client, noteId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM note_attachments WHERE note_id = $1`,
    [noteId],
  );
  return rows[0]?.c ?? 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    return;
  }
  if (!opts.url) {
    console.error("❌ Pass --url or set DATABASE_URL");
    usage();
    process.exit(1);
  }

  const pool = new Pool({ connectionString: opts.url });
  const client = await pool.connect();

  try {
    const groups = await findDuplicateGroups(client);
    const capped = groups.slice(0, opts.limit);

    let totalExtra = 0;
    for (const g of groups) totalExtra += g.cnt - 1;

    console.log("");
    console.log(`Duplicate body-fingerprint groups: ${groups.length}`);
    console.log(`Extra rows that would be removed (sum of group_size - 1): ${totalExtra}`);
    console.log("(Rows with empty or markup-only note_text are not grouped.)");
    console.log(opts.apply ? "Mode: APPLY" : "Mode: DRY RUN (no writes)");
    console.log("");

    let shown = 0;
    const maxShow = opts.verbose ? Infinity : 30;

    const runGroup = async (g) => {
      const ids = g.ids;
      const keeper = ids[0];
      const losers = ids.slice(1);
      const bestTitle = await pickBestTitle(client, ids);
      const kt = await keeperTitle(client, keeper);
      const willPatch = !kt && bestTitle;

      let warn = "";
      for (const lid of losers) {
        const [kc, lc] = await Promise.all([
          attachmentRowCount(client, keeper),
          attachmentRowCount(client, lid),
        ]);
        if (lc > kc) {
          warn = ` ⚠ loser id=${lid} has more note_attachments (${lc}) than keeper (${kc}) — review before apply`;
          break;
        }
      }

      if (shown < maxShow || opts.verbose) {
        console.log(
          `  fp=${g.body_fp} ids=[${ids.join(",")}] keeper=${keeper} delete=${losers.join(",")}` +
            (willPatch ? ` patch_title=${JSON.stringify(bestTitle)}` : "") +
            warn,
        );
        shown++;
      }

      if (opts.apply) {
        if (willPatch) {
          await client.query(`UPDATE notes SET note_title = $1 WHERE id = $2`, [
            bestTitle,
            keeper,
          ]);
        }
        if (losers.length) {
          await client.query(`DELETE FROM notes WHERE id = ANY($1::int[])`, [losers]);
        }
      }
    };

    if (opts.apply) await client.query("BEGIN");
    try {
      for (const g of capped) {
        await runGroup(g);
      }
      if (opts.apply) await client.query("COMMIT");
    } catch (err) {
      if (opts.apply) await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    if (!opts.verbose && groups.length > shown) {
      console.log(`  … (${groups.length - shown} more groups omitted; use --verbose)`);
    }

    if (opts.apply && capped.length < groups.length) {
      console.warn(
        `\n⚠ --limit stopped after ${capped.length} groups; ${groups.length - capped.length} groups not processed. Re-run without --limit.`,
      );
    }

    console.log("");
    if (!opts.apply) {
      console.log("Re-run with --apply to patch titles on keepers and delete duplicate rows.");
    } else {
      console.log("✅ Apply finished.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
