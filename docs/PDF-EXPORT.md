# PDF Export Feature

## Overview

The PDF export feature allows you to export your quotes collection as a beautifully formatted PDF document, organized by author and source.

## Features

- 📄 **Export filtered quotes** - Only exports quotes matching your current search criteria
- 👤 **Grouped by Author** - Quotes organized by author with profile pictures
- 📚 **Grouped by Source** - Within each author, quotes grouped by source (book, movie, etc.)
- 🎨 **Professional formatting** - Clean, readable layout with proper typography
- 🔍 **Filter information** - PDF shows what filters were applied
- 📅 **Timestamped** - Generated date included in header

## How to Use

1. **Apply filters** (optional)
   - Search by quote text, author, source, or tags
   - Select source types (Books, Movies, Assorted)

2. **Click "📄 Export to PDF"** button
   - Located in the header next to "Add Multiple Quotes"

3. **Wait for generation**
   - Button shows "⏳ Generating PDF..."
   - Usually takes 5-10 seconds depending on number of quotes

4. **PDF downloads automatically**
   - Saved as `quotes_YYYY-MM-DD.pdf`
   - Opens in your default PDF viewer

## PDF Structure

### Header

- **Title**: "📚 Quotes Collection"
- **Generated Date**: When the PDF was created
- **Filters Applied**: Shows any active search filters

### Body

- **Organized by Author**
  - Author name with profile picture (if available)
  - Blue underline separator

- **Organized by Source** (within each author)
  - Source name with type icon (📖 Book, 🎬 Movie, 📝 Assorted)
  - Grouped quotes from that source

- **Quote Cards**
  - Quote text (with proper line breaks)
  - Tags (if any)
  - Blue left border for emphasis

### Example Structure:

```
📚 Quotes Collection
Generated on February 21, 2026

Filters Applied:
- Tags: motivation

═══════════════════════════════════

[Author Photo] George Carlin
─────────────────────────────────

  📝 Assorted
  ┌─────────────────────────────────
  │ "I wanna live. I don't wanna die.
  │  That's the whole meaning of life!"
  │ Tags: motivation, life
  └─────────────────────────────────

[Author Photo] Viktor Frankl
─────────────────────────────────

  📖 Man's Search for Meaning
  ┌─────────────────────────────────
  │ "Those who have a 'why' to live,
  │  can bear with almost any 'how'."
  │ Tags: motivation, philosophy
  └─────────────────────────────────
```

## Technical Details

### Backend (`src/server.js`)

**Endpoint**: `POST /api/export/pdf`

**Request Body**:

```json
{
  "quotes": [...],  // Array of quote objects
  "filters": {      // Optional filters used
    "quote": "...",
    "author": "...",
    "source": "...",
    "tags": "..."
  }
}
```

**Response**: Binary PDF file

**Technology**: Uses Puppeteer (headless Chrome) to convert HTML to PDF

### Frontend (`public/app.js`)

**Function**: `exportToPdf()`

**Process**:

1. Fetch ALL quotes matching current filters (no pagination)
2. Send quotes + filter info to backend
3. Backend generates PDF using Puppeteer
4. Frontend receives PDF as blob
5. Automatically downloads file

### Dependencies

**New Package**: `puppeteer` (installed via npm)

- Headless browser for PDF generation
- High-quality rendering with CSS support
- Image embedding support

## Customization

### Styling

Edit the `generatePdfHtml()` function in `src/server.js` to customize:

- Colors (currently uses Tailwind-inspired palette)
- Fonts (currently uses Segoe UI)
- Layout (margins, spacing, borders)
- Page breaks (authors on new pages)

### Margins

Current PDF margins:

```javascript
margin: {
  top: '20mm',
  right: '15mm',
  bottom: '20mm',
  left: '15mm'
}
```

### Paper Size

Currently: A4

Change in `src/server.js`:

```javascript
format: "Letter"; // or 'A3', 'Legal', etc.
```

## Deployment Considerations

### Railway/Heroku

Puppeteer requires Chrome/Chromium. Add to your Dockerfile or buildpacks:

**Railway** (uses Nixpacks):
Add `puppeteer` to `package.json` - it will automatically install Chrome

**Heroku**:
Add buildpack:

```bash
heroku buildpacks:add jontewks/puppeteer
```

Or use Puppeteer's `browserless` mode.

### Performance

- **Small collections (<100 quotes)**: 2-5 seconds
- **Medium collections (100-500 quotes)**: 5-10 seconds
- **Large collections (500+ quotes)**: 10-20 seconds

### Memory Usage

Puppeteer uses ~100-200MB per PDF generation.

For high-traffic sites, consider:

- Queueing system (Bull, RabbitMQ)
- Rate limiting
- Caching generated PDFs

## Troubleshooting

### PDF Generation Fails

**Error**: `Failed to generate PDF`

**Solutions**:

1. Check Puppeteer installation: `npm list puppeteer`
2. Check Chrome/Chromium availability
3. Check server logs for detailed error
4. Increase server memory (Railway: upgrade plan)

### Images Missing in PDF

**Cause**: Base64 images not loading

**Solution**: Ensure images are stored as complete base64 strings including data URI prefix:

```
data:image/jpeg;base64,/9j/4AAQ...
```

### PDF Layout Broken

**Cause**: CSS not rendering correctly

**Solution**: Use inline styles only (no external stylesheets)

### Timeout Errors

**Cause**: Too many quotes or slow server

**Solution**: Increase Puppeteer timeout:

```javascript
await page.setContent(html, {
  waitUntil: "networkidle0",
  timeout: 60000, // 60 seconds
});
```

## Future Enhancements

Potential improvements:

- ✨ Custom cover page
- 📊 Statistics page (quote count, top authors, etc.)
- 🎨 Theme selection (light, dark, minimal)
- 📑 Table of contents
- 🔖 Bookmarks for each author
- 📤 Email PDF option
- 💾 Save to cloud (Google Drive, Dropbox)
- 🖼️ Better image handling (full-size quote images)

## Example Use Cases

1. **Personal backup** - Save your favorite quotes
2. **Gift** - Share curated quotes with friends
3. **Publishing** - Prepare quotes for a book/blog
4. **Archival** - Keep offline copy of your collection
5. **Studying** - Print quotes for reference
6. **Sharing** - Email PDF to colleagues

## Performance Tips

- Export during off-peak hours for large collections
- Apply filters to reduce quote count
- Consider splitting large collections into multiple PDFs (e.g., by author)

## License Note

Generated PDFs are for personal use. Respect copyright of quoted authors and sources when sharing or publishing.
