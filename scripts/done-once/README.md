# `scripts/done-once/` — archival tooling

Scripts here are **not** part of `npm start` or any build step. They were kept for reference if you ever need the same transformation again.

## CSS split (do not re-run on the current tree unless you re-merge CSS)

| File | Role |
|------|------|
| `split-css.js` | Split a monolithic `public/style.css` into base + `style.mobile.css` + `style.medium.css` by top-level `@media`. |
| `split-base-css.js` | Split the (already responsive-split) `public/style.css` into feature files (`style.sidemenu.css`, …). **Hard-coded line ranges** must match the file you feed in. |

```bash
node scripts/done-once/split-css.js
node scripts/done-once/split-base-css.js
```

`style.small.css` is never emitted (hand-maintained).

**Run from repository root** (paths resolve to `public/`).

**Re-runnable housekeeping** (e.g. H2 → title): see **`scripts/safe-housekeeping/README.md`**.
