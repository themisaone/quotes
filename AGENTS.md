# Repository Guidelines

## Project Structure & Module Organization

This Node.js/Express app uses PostgreSQL and a vanilla JavaScript single-page frontend.

- `src/` holds backend code: `server.js`, route modules in `src/routes/`, DB, storage, mode, and text helpers.
- `public/` holds `index.html`, `app.js`, split CSS files, and ES modules in `public/js/lib/`.
- `migrations/` contains schema setup and the runner.
- `config/` stores mode and settings JSON; machine-local values may be generated here.
- `attachments/` stores uploaded user files.
- `scripts/` contains import, maintenance, backup, and housekeeping utilities.
- `tests/` contains Node test-runner coverage for helpers and import seams.

## Build, Test, and Development Commands

- `npm install` installs Node dependencies.
- `npm test`: run the Node-native test suite.
- `npm run migrate`: apply database migrations.
- `npm start`: run migrations, then start port `4000`.
- `npm run dev`: run migrations, then start `nodemon`.
- `npm run all`, `npm run quotes`, `npm run notes`, `npm run training`: start fixed note-type modes.
- `docker compose up -d`: start the Docker deployment.

There is no separate frontend build step; static assets are served directly from `public/`.

## Coding Style & Naming Conventions

Use 2-space indentation and match nearby JavaScript style. Backend files use CommonJS; frontend files in `public/js/lib/` use browser ES modules. Prefer `camelCase` for functions and variables, `UPPER_CASE` for mode constants, and descriptive file names.

When editing frontend modules, preserve cache-busting import suffixes such as `?v=YYYYMMDDx`. Imports of the same module must use the same suffix string or browser module state can split.

## Testing Guidelines

Use `npm test` for automated checks. Current tests are lightweight and avoid a live database; add `*.test.js` files under `tests/` for pure helpers and import seams. Before submitting DB or UI changes, also run `npm run migrate` and manually verify affected flows. For database scripts, prefer dry-run modes before flags such as `--apply`.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive sentence-style messages without strict prefixes, for example `Added simple search`. Keep commits focused on one user-visible change or fix.

Pull requests should include a summary, manual verification steps, screenshots for UI changes, and notes about migrations, environment variables, or data-moving scripts.

## Security & Configuration Tips

Use `.env.example` as the template for local secrets and database credentials. Do not commit private exports, real credentials, or user attachment data. Treat `attachments/`, imported backups, and generated PDFs as potentially sensitive.
