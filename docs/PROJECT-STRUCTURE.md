# Project Structure Reorganization

## Overview

The project has been reorganized from a flat structure to a more maintainable directory layout.

## New Structure

```
quotes/
├── src/                    # Application source code
│   ├── server.js          # Express server (main entry point)
│   └── db.js              # PostgreSQL database connection pool
│
├── public/                # Static frontend files (served by Express)
│   ├── index.html         # Main HTML page
│   ├── app.js             # Frontend JavaScript (SPA logic)
│   ├── style.css          # CSS styles
│   └── favicon.svg        # Application icon
│
├── migrations/            # Database schema migrations
│   ├── 003_books_to_sources.js   # Renamed books table to sources
│   └── 004_add_type_to_quotes.js # Moved type field to quotes table
│
├── scripts/               # Utility and setup scripts
│   ├── migrate*.js        # Old migration scripts
│   ├── setup.js           # Database setup utility
│   ├── setup.sh           # Shell setup script
│   ├── start.sh           # Server start script
│   ├── imageProcessor.js  # Deprecated image processing
│   └── update-image-columns.js
│
├── docs/                  # Project documentation
│   ├── OVERVIEW.md
│   ├── SETUP.md
│   ├── QUICKSTART.md
│   ├── BULK-IMPORT.md
│   ├── PAGINATION.md
│   ├── SIDE-MENU-NAVIGATION.md
│   └── ... (all other .md files)
│
├── node_modules/          # Dependencies (gitignored)
├── package.json           # NPM configuration and scripts
├── package-lock.json      # Dependency lock file
└── README.md             # Main project readme
```

## Key Changes

### 1. Source Code (`src/`)
- Moved `server.js` and `db.js` into a dedicated `src/` directory
- Updated `package.json` scripts to point to `src/server.js`
- Updated `server.js` to use `path.join(__dirname, '../public')` for static files

### 2. Documentation (`docs/`)
- All `.md` documentation files moved to `docs/` directory
- `README.md` remains in root for visibility
- Includes feature documentation, migration guides, and setup instructions

### 3. Scripts (`scripts/`)
- Old migration scripts (`migrate*.js`)
- Setup utilities (`setup.js`, `setup.sh`)
- Deprecated utilities (`imageProcessor.js`)
- Utility scripts (`update-image-columns.js`)

### 4. Migrations (`migrations/`)
- Contains current, active database migrations
- Named with numeric prefixes (003, 004, etc.)
- Should be run in order

### 5. Public (`public/`)
- Unchanged - still contains frontend assets
- Served statically by Express

## Updated NPM Scripts

```json
{
  "start": "node src/server.js",
  "dev": "nodemon src/server.js",
  "migrate": "node scripts/migrate.js",
  "setup": "node scripts/setup.js"
}
```

## Benefits

1. **Clearer Organization**: Related files are grouped together
2. **Easier Navigation**: Developers can quickly find what they need
3. **Separation of Concerns**: Source, scripts, docs, and public files are distinct
4. **Maintainability**: Easier to manage and scale the project
5. **Professional Structure**: Follows common Node.js project conventions

## Migration Notes

- All file paths in `package.json` have been updated
- `server.js` now uses `path.join()` for cross-platform compatibility
- No database changes required - this is purely a file organization update
- All existing functionality remains unchanged
