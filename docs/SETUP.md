# Quotes Database - Setup Guide

## Quick Start

### Step 1: Configure Database Connection

The application needs to connect to PostgreSQL. You mentioned ADMINISTE already uses PostgreSQL, so we can use the same instance.

#### Find your PostgreSQL credentials:

Check if you can connect using your system user:

```bash
psql -d postgres
```

If that works, update `.env` file to:

```
DB_USER=mirjok
DB_PASSWORD=
```

Otherwise, find the credentials used by ADMINISTE and use those.

### Step 2: Create Database and Run Migration

Once you have the correct credentials in `.env`, run:

```bash
# Create the database
createdb quotes_db

# Or if using psql:
psql -d postgres -c "CREATE DATABASE quotes_db;"

# Run the migration to create tables
npm run migrate
```

### Step 3: Start the Server

```bash
npm start
```

The application will be available at: http://localhost:4000

---

## Manual Database Setup (Alternative)

If you prefer, you can manually create the database and table:

```sql
-- Connect to PostgreSQL
psql -d postgres

-- Create database
CREATE DATABASE quotes_db;

-- Connect to the new database
\c quotes_db

-- Create quotes table
CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  quote TEXT NOT NULL,
  author VARCHAR(255) DEFAULT '',
  book VARCHAR(255) DEFAULT '',
  tags TEXT DEFAULT '',
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
```

Then start the server:

```bash
npm start
```

---

## Troubleshooting

### Connection Issues

If you get "password authentication failed":

1. Check the `.env` file has correct credentials
2. Try using your system username instead of 'postgres'
3. Check PostgreSQL is running: `sudo systemctl status postgresql`

### Database Already Exists

If the database already exists, just run the migration:

```bash
npm run migrate
```

## Features

Once running, you can:

- ✨ Add new quotes with author, book, tags, and date
- 🔍 Search and filter quotes by any field
- ✏️ Edit existing quotes
- 🗑️ Delete quotes
- 📚 View 20 most recent quotes by default
