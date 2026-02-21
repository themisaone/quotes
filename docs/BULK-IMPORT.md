# 📚 Bulk Import Feature

## ✅ New Feature: Add Multiple Quotes at Once!

You can now add multiple quotes from the same author/book in one go!

---

## 🎯 How It Works

### **1. Click "Add Multiple Quotes" Button**

- New button appears at the top of the page
- Opens a bulk import modal

### **2. Fill in Common Details**

- **Author** (required) - The author for all quotes
- **Book** (optional) - The book for all quotes
- Both have autocomplete from existing entries

### **3. Paste Multiple Quotes**

- Paste all your quotes in the textarea
- **Separate each quote with `---` on its own line**
- Quotes can be multi-line (line breaks preserved)

### **4. Preview (Optional)**

- Click "Preview Quotes" to see how they'll be split
- Shows count and formatted preview of each quote

### **5. Add All Quotes**

- Click "Add All Quotes"
- Confirms before adding
- Shows progress while adding
- All quotes added individually with timestamps

---

## 📝 Format Example

```
«Den som ikke sier stort, snakker heller ikke så mye dritt, det pleide far din å si,»
---
Natt og dag
Folk sa alltid at Ove og kona hans var som natt og dag.
Ove skjønte selvsagt at de mente det var han som var natten.
---
Kvinnfolk og planlegging
Men sånn var det jo med kvinnfolk.
De kunne ikke holde seg til en plan om de så ble limt fast til den,
---
Derfor
Han skrev kanskje ikke dikt til henne, han sang ingen serenader, han kom ikke hjem med dyre presanger. Men ingen annet gutt hadde noen gang kjørt tog flere timer i feil retning hver dag i månedsvis bare fordi han likte å sitte ved siden av henne mens hun snakket.
```

**Result:** 4 quotes added, all with the same author and book!

---

## ✨ Features

**1. Separator: `---`**

- ✅ Three dashes on its own line
- ✅ Must have newline before and after
- ✅ Clean, readable separator

**2. Multi-line Quotes:**

- ✅ Each quote can have multiple paragraphs
- ✅ Line breaks preserved
- ✅ Just like single quote entry

**3. Preview:**

- ✅ See how quotes will be split
- ✅ Shows count: "X quotes will be added"
- ✅ Each quote numbered and formatted
- ✅ Scrollable preview list

**4. Progress Tracking:**

- ✅ Button shows "Adding quotes... (3/10)"
- ✅ Real-time progress
- ✅ Summary at the end

**5. Error Handling:**

- ✅ Validates author is provided
- ✅ Validates quotes exist
- ✅ Confirms before adding
- ✅ Reports success/failure count

**6. Autocomplete:**

- ✅ Author field has autocomplete
- ✅ Book field has autocomplete
- ✅ Reuse existing authors/books easily

---

## 🚀 Usage Scenarios

### **Scenario 1: Copying Quotes from a Book**

1. Read book, collect multiple quotes
2. Type them all in a document with `---` between
3. Copy all at once
4. Click "Add Multiple Quotes"
5. Fill author and book
6. Paste all quotes
7. Add all at once!

### **Scenario 2: Importing from Notes**

1. Have notes with many quotes
2. Format with `---` separator
3. Bulk import to database
4. Saves tons of time!

### **Scenario 3: Same Author, Different Quotes**

1. Reading through an author's work
2. Collect multiple memorable quotes
3. Don't want to click "Add Quote" 20 times
4. Use bulk import instead!

---

## 📊 How It Processes

**Step-by-step:**

```
1. Split text by "\n---\n" (newline, dashes, newline)
2. Trim whitespace from each quote
3. Filter out empty quotes
4. Show preview (optional)
5. For each quote:
   - POST to /api/quotes
   - Same author and book
   - Empty tags (can edit later)
   - Auto-set created_at and updated_at
6. Show success/failure summary
7. Reload quotes list
```

---

## 🎨 UI Elements

**Bulk Import Modal:**

- ✅ Larger modal (`max-width: 800px`)
- ✅ Author field with autocomplete
- ✅ Book field with autocomplete
- ✅ Large textarea (15 rows)
- ✅ Helper text showing format
- ✅ Preview section (collapsible)
- ✅ Three buttons: Preview, Add All, Cancel

**Preview Display:**

- ✅ Gray background container
- ✅ Quote count at top
- ✅ Scrollable list (max 300px)
- ✅ Each quote with number and blue left border
- ✅ Italic formatting
- ✅ Preserved line breaks

---

## 💡 Tips

**Best Practices:**

1. ✅ Use `---` on its own line (not `----` or `--`)
2. ✅ Add blank line before and after `---`
3. ✅ Use Preview to verify splitting is correct
4. ✅ Start with fewer quotes to test
5. ✅ Author is required, book is optional

**Common Mistakes:**

- ❌ Using `----` (4 dashes) - won't work
- ❌ No newline before/after `---` - won't split
- ❌ Forgetting to fill author field
- ❌ Not using separator at all

**Good Separator:**

```
Quote one
---
Quote two
```

**Bad Separator:**

```
Quote one
----
Quote two
```

---

## 🔧 Technical Details

### **Splitting Logic:**

```javascript
const quotes = quotesText
  .split(/\n---\n/) // Regex: newline + three dashes + newline
  .map((q) => q.trim()) // Remove whitespace
  .filter((q) => q.length > 0); // Remove empty
```

### **Adding Process:**

```javascript
for (let i = 0; i < quotes.length; i++) {
  await fetch("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      quote: quotes[i],
      author: author,
      book: book,
      tags: "",
    }),
  });
}
```

### **Progress Display:**

```javascript
submitBtn.textContent = `Adding quotes... (${i + 1}/${quotes.length})`;
```

---

## 📝 Files Modified

**Frontend:**

- ✅ `public/index.html` - Added bulk import modal & button
- ✅ `public/style.css` - Added bulk modal styles
- ✅ `public/app.js` - Added bulk import functions

**Backend:**

- ✅ No changes needed! Uses existing POST endpoint

---

## 🎉 Result

**Save Time!**

- Before: Add 10 quotes = Click "Add" button 10 times
- After: Add 10 quotes = One bulk import!

**Perfect for:**

- ✅ Book quote collections
- ✅ Author compilations
- ✅ Importing from notes
- ✅ Any multi-quote entry

---

**Now you can add dozens of quotes in seconds!** 📚✨
