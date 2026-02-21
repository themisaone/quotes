# Side Menu Navigation with Authors & Books Views

## Summary
Added a side menu with three views: Quotes (default), Authors, and Books. Each author/book card shows the total number of quotes.

## Changes Made

### 1. Backend (`server.js`)
Updated `/api/authors` and `/api/books` endpoints to include quote counts:

```javascript
// Authors with quote count
SELECT a.*, COUNT(q.id) as quote_count
FROM authors a
LEFT JOIN quotes q ON a.id = q.author_id
GROUP BY a.id ORDER BY a.name ASC

// Books with quote count
SELECT b.*, COUNT(q.id) as quote_count
FROM books b
LEFT JOIN quotes q ON b.id = q.book_id
GROUP BY b.id ORDER BY b.name ASC
```

### 2. HTML Structure (`public/index.html`)

#### New Layout
```html
<div class="app-layout">
    <!-- Side Menu -->
    <nav class="side-menu">
        <h2>📚 My Collection</h2>
        <ul>
            <li><button data-view="quotes">💬 Quotes</button></li>
            <li><button data-view="authors">✍️ Authors</button></li>
            <li><button data-view="books">📖 Books</button></li>
        </ul>
    </nav>
    
    <!-- Main Content -->
    <div class="main-content">
        <!-- Quotes View (default) -->
        <div id="quotesView">...</div>
        
        <!-- Authors View -->
        <div id="authorsView" style="display:none">
            <div id="authorsList" class="cards-grid"></div>
        </div>
        
        <!-- Books View -->
        <div id="booksView" style="display:none">
            <div id="booksList" class="cards-grid"></div>
        </div>
    </div>
</div>
```

### 3. CSS (`public/style.css`)

#### Side Menu Styling
```css
--side-menu-width: 200px;

.app-layout {
    display: flex;
    min-height: 100vh;
}

.side-menu {
    width: 200px;
    position: fixed;
    height: 100vh;
    background: white;
    border-right: 1px solid #e2e8f0;
}

.menu-item {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    transition: all 0.2s;
}

.menu-item.active {
    background: var(--primary-color);
    color: white;
}

.main-content {
    margin-left: 200px;
    flex: 1;
}
```

#### Cards Grid
```css
.cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
}

.author-card, .book-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
    cursor: pointer;
}

.card-image {
    width: 120px;
    height: 120px;
    border-radius: 50%; /* circular for authors */
    object-fit: cover;
}

.book-card .card-image {
    border-radius: 8px; /* square for books */
}
```

### 4. JavaScript (`public/app.js`)

#### View Switching
```javascript
function setupMenuNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
            
            // Update active state
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchView(view) {
    // Hide all views
    document.getElementById('quotesView').style.display = 'none';
    document.getElementById('authorsView').style.display = 'none';
    document.getElementById('booksView').style.display = 'none';
    
    // Show selected view and load data
    if (view === 'quotes') {
        document.getElementById('quotesView').style.display = 'block';
    } else if (view === 'authors') {
        document.getElementById('authorsView').style.display = 'block';
        loadAuthors();
    } else if (view === 'books') {
        document.getElementById('booksView').style.display = 'block';
        loadBooks();
    }
}
```

#### Loading & Displaying Authors
```javascript
async function loadAuthors() {
    const response = await fetch(`${API_URL}/authors`);
    const authors = await response.json();
    displayAuthors(authors);
}

function displayAuthors(authors) {
    authorsList.innerHTML = authors.map(author => `
        <div class="author-card" onclick="openAuthorModal(...)">
            ${author.image ? `<img src="${author.image}" class="card-image">` : '<div class="card-image">✍️</div>'}
            <div class="card-name">${author.name}</div>
            <div class="card-quote-count">${author.quote_count} quotes</div>
        </div>
    `).join('');
}
```

#### Loading & Displaying Books
Similar to authors, but with book-specific styling.

## User Experience

### Side Menu
- Fixed left sidebar (200px wide)
- Three navigation buttons:
  - 💬 Quotes (active by default)
  - ✍️ Authors
  - ✍️ Books
- Active button highlighted in blue
- Hover effects on all buttons

### Quotes View (Default)
- Same as before
- All existing functionality intact

### Authors View
- Grid of author cards
- Each card shows:
  - Profile image (circular) or ✍️ emoji if no image
  - Author name
  - Quote count (e.g., "5 quotes")
- Clicking card opens author edit modal
- Cards have hover effect (lift up slightly)

### Books View
- Grid of book cards
- Each card shows:
  - Book cover (square) or 📖 emoji if no image
  - Book title
  - Quote count (e.g., "12 quotes")
- Clicking card opens book edit modal
- Cards have hover effect (lift up slightly)

### Responsive Design
- Mobile: Side menu stacks on top
- Desktop: Side menu fixed on left

## Technical Details

### Quote Count Query
Uses `LEFT JOIN` and `COUNT()` to aggregate quotes per author/book:
```sql
COUNT(q.id) as quote_count
FROM authors a
LEFT JOIN quotes q ON a.id = q.author_id
GROUP BY a.id
```

### View Management
- Only one view visible at a time
- Data loads on-demand when switching to Authors/Books
- Quotes view always shows by default

### Image Handling
- If author/book has image: Display it
- If no image: Show emoji placeholder (✍️ or 📖)
- Circular images for authors
- Square/rounded images for books

## Files Modified

1. **server.js** - Updated authors/books endpoints with quote counts
2. **public/index.html** - Added side menu and view containers
3. **public/style.css** - Added layout, menu, and card grid styles
4. **public/app.js** - Added view switching and display functions

---

**Status**: ✅ Complete
**Date**: 2026-02-21
