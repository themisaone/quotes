# Quotes Database

A simple and elegant quote collection and management system built with PostgreSQL, Node.js/Express, and vanilla JavaScript.

## Features

- 📝 Add, edit, and delete quotes with images and notes
- 🔍 Search and filter by quote text, author, source, tags, and type
- 📚 Beautiful, modern UI with responsive design
- 👤 Manage authors with images
- 📖 Manage sources (books, movies, assorted) with images
- 🏷️ Tag system for organizing quotes
- 📊 Pagination support (20 quotes per page)
- 🎨 Multiple views: Quotes, Authors, Sources, Tags
- 🔄 Refresh buttons on all pages
- 📅 Timestamp tracking (created_at, updated_at)

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (already installed and running)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Configure database connection:
   - Create a `.env` file in the root directory
   - Add your database credentials:

```
DATABASE_URL=postgresql://username:password@localhost:5432/quotes
PORT=4000
```

3. Create the database:

```bash
createdb quotes
```

4. Run database migrations:

```bash
cd migrations
node 003_books_to_sources.js
node 004_add_type_to_quotes.js
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

## Project Structure

```
quotes/
├── src/                    # Source code
│   ├── server.js          # Express server
│   └── db.js              # Database connection
├── public/                # Frontend files
│   ├── index.html         # Main HTML
│   ├── app.js             # Frontend JavaScript
│   ├── style.css          # Styles
│   └── favicon.svg        # App icon
├── migrations/            # Database migrations
│   ├── 003_books_to_sources.js
│   └── 004_add_type_to_quotes.js
├── scripts/               # Utility scripts
│   ├── migrate.js         # Old migration scripts
│   ├── setup.js           # Setup utilities
│   └── ...
├── docs/                  # Documentation
│   └── ...
├── package.json           # Dependencies
└── README.md             # This file
```

## API Endpoints

### Quotes

- `GET /api/quotes` - Get all quotes (with filters: quote, author, source, tags, types, limit, offset)
- `GET /api/quotes/count` - Get total count of quotes (with filters)
- `GET /api/quotes/:id` - Get single quote
- `POST /api/quotes` - Create new quote
- `PUT /api/quotes/:id` - Update quote
- `DELETE /api/quotes/:id` - Delete quote

### Authors

- `GET /api/authors` - Get all authors with quote counts
- `GET /api/authors/:id` - Get single author with quote count
- `PUT /api/authors/:id` - Update author (name, image)
- `DELETE /api/authors/:id` - Delete author (only if no quotes)

### Sources

- `GET /api/sources` - Get all sources with quote counts
- `GET /api/sources/:id` - Get single source with quote count
- `PUT /api/sources/:id` - Update source (name, type, image)
- `DELETE /api/sources/:id` - Delete source (only if no quotes)

### Tags

- `GET /api/tags` - Get all tags with quote counts

## Database Schema

### quotes

- `id` - Primary key
- `quote` - Quote text (TEXT, required)
- `author_id` - Foreign key to authors table
- `source_id` - Foreign key to sources table
- `type` - Source type (BOOK|MOVIE|ASSORTED)
- `tags` - Comma-separated tags (TEXT)
- `image` - Thumbnail image (TEXT, base64)
- `image_full` - Full-size image (TEXT, base64)
- `note` - Additional notes (TEXT)
- `created_at` - Timestamp
- `updated_at` - Timestamp

### authors

- `id` - Primary key
- `name` - Author name (VARCHAR, unique)
- `image` - Author image (TEXT, base64)

### sources

- `id` - Primary key
- `name` - Source name (VARCHAR, unique)
- `type` - Source type (BOOK|MOVIE)
- `image` - Source image (TEXT, base64)

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with pg driver
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Styling**: Modern CSS with CSS Grid, Flexbox, and CSS Variables
- **Image Processing**: Client-side Canvas API for resizing
