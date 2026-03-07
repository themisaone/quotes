# Hybrid File Storage Implementation Guide

## Overview

This system implements **intelligent hybrid storage** for attachments:
- **Small files (< 2 MB)**: Stored in PostgreSQL as base64
- **Large files (≥ 2 MB)**: Stored in `attachments/` folder

**✨ No new database columns needed!** Uses existing `image`, `image_full` fields with smart pattern detection.

## 🎯 The Pattern

### Existing columns store EITHER base64 OR file reference:

**Small file (< 2 MB):**
```
image_full = "data:image/jpeg;base64,/9j/4AAQ..."
```

**Large file (≥ 2 MB):**
```
image_full = "file:quotes/123_full.jpg:image/jpeg"
image_full = "file:quotes/456_video.mp4:video/mp4"
image_full = "file:quotes/789_doc.pdf:application/pdf"
```

Format: `file:{path}:{mimeType}`

## ✅ What's Done

1. **File storage helper**: `src/fileStorage.js`
   - Handles all file operations (save, read, delete)
   - Automatic size detection and routing
   - Pattern detection (`file:` prefix)
   
2. **Directory structure**: `attachments/quotes/`, `authors/`, `sources/`
   
3. **Git ignore**: `attachments/` excluded from version control

## 🔧 How to Use

### Import the helper at the top of `src/server.js`:

```javascript
const fileStorage = require("./fileStorage");
```

### Update Quote Creation/Update

**Before** (storing in DB only):
```javascript
const result = await pool.query(
  `INSERT INTO quotes (quote, author_id, image, image_full, ...) 
   VALUES ($1, $2, $3, $4, ...)`,
  [quoteText, authorId, thumbnailBase64, fullBase64, ...]
);
```

**After** (hybrid storage):
```javascript
// Get the new quote ID
const result = await pool.query(
  `INSERT INTO quotes (quote, author_id, ...) 
   VALUES ($1, $2, ...) 
   RETURNING id`,
  [quoteText, authorId, ...]
);
const quoteId = result.rows[0].id;

// Process images - returns EITHER base64 OR "file:path:type"
const thumb = fileStorage.processForStorage(thumbnailBase64, 'quotes', quoteId, '');
const full = fileStorage.processForStorage(fullBase64, 'quotes', quoteId, '_full');

// Update with processed values
await pool.query(
  `UPDATE quotes SET image = $1, image_full = $2 WHERE id = $3`,
  [thumb, full, quoteId]
);
```

### Retrieve Attachments

**When fetching quotes**, the system automatically handles both:

```javascript
const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [id]);
const quote = result.rows[0];

// Retrieve images (works for both base64 and file references!)
quote.image = fileStorage.retrieveFromStorage(quote.image);
quote.image_full = fileStorage.retrieveFromStorage(quote.image_full);

res.json(quote); // Frontend gets base64 either way
```

### Delete Attachments

**When deleting quotes**, clean up external files:

```javascript
const quote = await pool.query('SELECT * FROM quotes WHERE id = $1', [id]);

// Delete external files if they exist (no-op if base64)
fileStorage.deleteAttachment(quote.rows[0].image);
fileStorage.deleteAttachment(quote.rows[0].image_full);

// Then delete from database
await pool.query('DELETE FROM quotes WHERE id = $1', [id]);
```

### Serve Attachments to Frontend

Add a static route in `src/server.js`:

```javascript
// Serve attachments folder (for file: references)
app.use('/attachments', express.static(path.join(__dirname, '../attachments')));
```

## 📊 How It Works

### Automatic Size Detection

```javascript
const result = fileStorage.processForStorage(base64String, 'quotes', 123, '_full');

// If file < 2 MB:
// "data:image/jpeg;base64,/9j/4AAQ..."

// If file ≥ 2 MB:
// "file:quotes/123_full.jpg:image/jpeg"
```

### File Structure

```
attachments/
├── quotes/
│   ├── 1.jpg           (large thumbnail, if needed)
│   ├── 1_full.jpg      (large full-size image)
│   ├── 2_full.mp4      (video attachment)
│   └── 3_full.pdf      (PDF document)
├── authors/
│   └── 5.jpg           (large author image)
└── sources/
    └── 8.png           (large source image)
```

## 🎨 Frontend Display (Future: Multiple Attachment Types)

```javascript
function displayAttachment(value, container) {
  if (value.startsWith('file:')) {
    const parts = value.split(':');
    const path = parts[1];
    const mimeType = parts[2];
    
    if (mimeType.startsWith('image/')) {
      container.innerHTML = `<img src="/attachments/${path}">`;
    } else if (mimeType.startsWith('video/')) {
      container.innerHTML = `<video controls src="/attachments/${path}"></video>`;
    } else if (mimeType === 'application/pdf') {
      container.innerHTML = `<a href="/attachments/${path}" target="_blank">View PDF</a>`;
    } else {
      container.innerHTML = `<a href="/attachments/${path}" download>Download File</a>`;
    }
  } else {
    // It's base64 - display as image
    container.innerHTML = `<img src="${value}">`;
  }
}
```

## 🔐 Backup Strategy

### Option 1: Separate Backups
```bash
# Database backup
pg_dump quotes_db > backup.sql

# Attachments backup
cp -r attachments/ ~/Dropbox/quotes-attachments-backup/
```

### Option 2: Combined Backup
```bash
# Backup everything together
tar -czf quotes-backup-$(date +%Y%m%d).tar.gz attachments/ backup.sql
```

## 🚀 Railway Deployment

When deploying to Railway with this system:

1. **Use Railway persistent volume** for `attachments/` folder
2. **Mount volume** at `/app/attachments`
3. **Keep PostgreSQL** for database (Railway managed)
4. Add static route to serve attachments
5. Both systems stay in sync!

## 📈 Benefits

✅ **No migration needed!** Works with existing schema  
✅ **Backward compatible!** Old base64 data still works  
✅ **Database stays small**: Only small files in DB  
✅ **Fast queries**: Less data to transfer  
✅ **Support any file type**: Images, videos, PDFs, docs  
✅ **Type information included**: Know mime type for display  
✅ **Transparent**: Frontend gets base64 either way  
✅ **Railway-ready**: Can deploy anytime with volume  

## 🎯 Pattern Detection

```javascript
// Check if it's a file reference
if (value.startsWith('file:')) {
  // It's in filesystem
  const parts = value.split(':');
  const path = parts[1];       // "quotes/123.jpg"
  const mimeType = parts[2];   // "image/jpeg"
}
```

---

**Ready to implement!** The infrastructure is in place - just need to integrate into server endpoints.
