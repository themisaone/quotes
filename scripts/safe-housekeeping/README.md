# `scripts/safe-housekeeping/` — re-runnable DB tidy-ups

Small scripts you can run **from time to time** after imports or editor habits change. They are **not** wired into `npm start`.

| File | Role |
|------|------|
| `migrate-h2-to-title.js` | Non-training notes with `note_title IS NULL`: promote a leading `<h2>` into `note_title` and trim `note_text`, or set `'No title'`. **Training rows are always skipped.** |
| `tag-training-by-month.js` + `tag-training-by-month.sql` | Tag each training (with `note_date`) with the English month name (`January` … `December`). Skips `note_tags` rows that already exist. |
| `add-year-tags.js` | Add year tags (e.g. `2014`) from `note_date` for trainings; skips notes that already have that year tag. |

```bash
# H2 → title (needs `.env`; script `require`s `../../src/db` from this folder)
node scripts/safe-housekeeping/migrate-h2-to-title.js           # dry-run
node scripts/safe-housekeeping/migrate-h2-to-title.js --apply # writes

# Month / year tags (`pg` + `dotenv` only). `--dry-run` rolls back the transaction (no DB changes kept).
node scripts/safe-housekeeping/tag-training-by-month.js --dry-run
node scripts/safe-housekeeping/tag-training-by-month.js
node scripts/safe-housekeeping/add-year-tags.js --dry-run
node scripts/safe-housekeeping/add-year-tags.js
```

**`psql -f` on `tag-training-by-month.sql` commits immediately** (no dry-run). Prefer the Node runner if you want a dry run first.

See each file’s header for behaviour and idempotency notes.
