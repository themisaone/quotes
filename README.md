# Quotes Database

A simple and elegant quote collection and management system built with PostgreSQL, Node.js/Express, and vanilla JavaScript.

## Features

- 📝 Add, edit, and delete quotes
- 🔍 Search and filter by quote text, author, book, tags, and date
- 📚 Beautiful, modern UI with responsive design
- 🎯 Shows 20 latest quotes by default
- 🏷️ Tag support for organizing quotes
- 📅 Date tracking for when quotes were added

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (already installed and running)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure database connection:
   - Copy `.env.example` to `.env` if needed
   - Update database credentials in `.env` file:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quotes_db
DB_USER=postgres
DB_PASSWORD=postgres
PORT=4000
```

3. Create the database:
```bash
createdb quotes_db
```
Or using psql:
```sql
CREATE DATABASE quotes_db;
```

4. Run database migration:
```bash
npm run migrate
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:4000
```

## API Endpoints

- `GET /api/quotes` - Get all quotes (with optional filters)
  - Query params: `quote`, `author`, `book`, `tags`, `date`, `limit`
- `GET /api/quotes/:id` - Get single quote
- `POST /api/quotes` - Create new quote
- `PUT /api/quotes/:id` - Update quote
- `DELETE /api/quotes/:id` - Delete quote

## Database Schema

The `quotes` table contains:
- `id` - Auto-incrementing primary key
- `quote` - The quote text (required)
- `author` - Author name (optional)
- `book` - Book title (optional)
- `tags` - Comma-separated tags (optional)
- `date` - Date of the quote (defaults to current date)
- `created_at` - Timestamp when quote was added

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Styling**: Modern CSS with CSS Grid and Flexbox
# quotes
