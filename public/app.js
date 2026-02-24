// Auto-detect API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || '4000'}/api`;

// Pagination state
let currentPage = 1;
const quotesPerPage = 20;
let totalQuotes = 0;
let filteredQuotes = 0; // Track filtered count for pagination
let currentQuotesData = []; // Store current quotes for PDF export

// DOM Elements
const quoteModal = document.getElementById("quoteModal");
const quoteForm = document.getElementById("quoteForm");
const addQuoteBtn = document.getElementById("addQuoteBtn");
const closeModal = document.querySelector(".close");
const cancelBtn = document.getElementById("cancelBtn");
const quotesList = document.getElementById("quotesList");
const quoteCount = document.getElementById("quoteCount");
const modalTitle = document.getElementById("modalTitle");

// Bulk import elements
const bulkModal = document.getElementById("bulkModal");
const bulkForm = document.getElementById("bulkForm");
const addBulkBtn = document.getElementById("addBulkBtn");
const closeBulkModal = document.querySelector(".close-bulk");
const cancelBulkBtn = document.getElementById("cancelBulkBtn");
const previewBulkBtn = document.getElementById("previewBulkBtn");
const bulkAuthorInput = document.getElementById("bulkAuthor");
const bulkSourceInput = document.getElementById("bulkSource");
const bulkQuotesInput = document.getElementById("bulkQuotes");
const bulkAuthorSuggestions = document.getElementById("bulkAuthorSuggestions");
const bulkSourceSuggestions = document.getElementById("bulkSourceSuggestions");
const bulkPreview = document.getElementById("bulkPreview");
const previewList = document.getElementById("previewList");

// Form inputs
const authorInput = document.getElementById("author");
const sourceInput = document.getElementById("source");
const authorSuggestions = document.getElementById("authorSuggestions");
const sourceSuggestions = document.getElementById("sourceSuggestions");
const tagsSuggestions = document.getElementById("tagsSuggestions");
const noteInput = document.getElementById("note");
const quoteImageFile = document.getElementById("quoteImageFile");
const quoteImagePreview = document.getElementById("quoteImagePreview");
const clearQuoteImageBtn = document.getElementById("clearQuoteImage");

// State for quote image
let currentQuoteImage = "";
let currentQuoteImageFull = ""; // Store original size

// Search inputs
const searchQuote = document.getElementById("searchQuote");
const searchAuthor = document.getElementById("searchAuthor");
const searchSource = document.getElementById("searchSource");
const searchTags = document.getElementById("searchTags");
const clearBtn = document.getElementById("clearBtn");

// State
let editingQuoteId = null;
let searchTimeout = null;
let autocompleteTimeout = null;
let currentFocus = -1;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadQuotes();
  loadTotalCount();
  setupEventListeners();
  setupMenuNavigation();
});

// Event Listeners
function setupEventListeners() {
  addQuoteBtn.addEventListener("click", openAddModal);
  closeModal.addEventListener("click", closeQuoteModal);
  cancelBtn.addEventListener("click", closeQuoteModal);
  quoteForm.addEventListener("submit", handleSubmit);
  clearBtn.addEventListener("click", clearFilters);
  
  // Delete quote button in modal
  const deleteQuoteBtn = document.getElementById("deleteQuoteBtn");
  if (deleteQuoteBtn) {
    deleteQuoteBtn.addEventListener("click", () => {
      const quoteId = document.getElementById("quoteId").value;
      if (quoteId) {
        closeQuoteModal();
        deleteQuote(quoteId);
      }
    });
  }

  // Refresh buttons
  const refreshQuotesBtn = document.getElementById("refreshQuotesBtn");
  const refreshAuthorsBtn = document.getElementById("refreshAuthorsBtn");
  const refreshSourcesBtn = document.getElementById("refreshSourcesBtn");
  const refreshTagsBtn = document.getElementById("refreshTagsBtn");

  if (refreshQuotesBtn) {
    refreshQuotesBtn.addEventListener("click", () => {
      currentPage = 1;
      loadQuotes();
      loadTotalCount();
    });
  }

  // Export PDF button
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", exportToPdf);
  }

  // Export JSON button
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", exportToJson);
  }

  // Import JSON button
  const importJsonBtn = document.getElementById("importJsonBtn");
  const importModal = document.getElementById("importModal");
  const closeImportModal = document.getElementById("closeImportModal");
  const cancelImportBtn = document.getElementById("cancelImportBtn");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const importFileInput = document.getElementById("importFileInput");

  if (importJsonBtn) {
    importJsonBtn.addEventListener("click", () => {
      importModal.style.display = "block";
    });
  }

  if (closeImportModal) {
    closeImportModal.addEventListener("click", () => {
      importModal.style.display = "none";
    });
  }

  if (cancelImportBtn) {
    cancelImportBtn.addEventListener("click", () => {
      importModal.style.display = "none";
    });
  }

  if (selectFileBtn) {
    selectFileBtn.addEventListener("click", () => {
      importFileInput.click();
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener("change", handleImportFile);
  }

  if (refreshAuthorsBtn) {
    refreshAuthorsBtn.addEventListener("click", loadAuthors);
  }

  if (refreshSourcesBtn) {
    refreshSourcesBtn.addEventListener("click", loadSources);
  }

  if (refreshTagsBtn) {
    refreshTagsBtn.addEventListener("click", loadTags);
  }

  // Bulk import listeners
  addBulkBtn.addEventListener("click", openBulkModal);
  closeBulkModal.addEventListener("click", closeBulkImportModal);
  cancelBulkBtn.addEventListener("click", closeBulkImportModal);
  previewBulkBtn.addEventListener("click", previewBulkQuotes);
  bulkForm.addEventListener("submit", handleBulkSubmit);

  // Autocomplete for bulk import
  bulkAuthorInput.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, "bulkAuthor");
  });
  bulkAuthorInput.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, bulkAuthorSuggestions, "bulkAuthor");
  });

  bulkSourceInput.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, "bulkSource");
  });
  bulkSourceInput.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, bulkSourceSuggestions, "bulkSource");
  });

  // Search with debounce
  [searchQuote, searchAuthor, searchSource, searchTags].forEach((input) => {
    input.addEventListener("input", debounceSearch);
  });

  // Type filter checkboxes
  ["filterQuoteBook", "filterQuoteMovie", "filterQuoteAssorted"].forEach(
    (id) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener("change", () => {
          currentPage = 1; // Reset to first page
          loadQuotes();
          loadTotalCount(); // Update counts
        });
      }
    },
  );

  // Sources view: Type filter checkboxes
  ["filterBook", "filterMovie"].forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener("change", loadSources);
    }
  });

  // Sources view: Search input
  const searchSourceName = document.getElementById("searchSourceName");
  if (searchSourceName) {
    searchSourceName.addEventListener("input", () => {
      clearTimeout(window.sourceSearchTimeout);
      window.sourceSearchTimeout = setTimeout(loadSources, 300);
    });
  }

  // Sources view: Sort buttons
  const sortByName = document.getElementById("sortByName");
  const sortByCount = document.getElementById("sortByCount");
  if (sortByName) {
    sortByName.addEventListener("click", () => {
      window.sourceSortBy = "name";
      sortByName.classList.add("active");
      sortByCount.classList.remove("active");
      loadSources();
    });
  }
  if (sortByCount) {
    sortByCount.addEventListener("click", () => {
      window.sourceSortBy = "count";
      sortByCount.classList.add("active");
      sortByName.classList.remove("active");
      loadSources();
    });
  }

  // Authors view: Search input
  const searchAuthorName = document.getElementById("searchAuthorName");
  if (searchAuthorName) {
    searchAuthorName.addEventListener("input", () => {
      clearTimeout(window.authorSearchTimeout);
      window.authorSearchTimeout = setTimeout(loadAuthors, 300);
    });
  }

  // Authors view: Sort buttons
  const sortAuthorsByName = document.getElementById("sortAuthorsByName");
  const sortAuthorsByCount = document.getElementById("sortAuthorsByCount");
  if (sortAuthorsByName) {
    sortAuthorsByName.addEventListener("click", () => {
      window.authorSortBy = "name";
      sortAuthorsByName.classList.add("active");
      sortAuthorsByCount.classList.remove("active");
      loadAuthors();
    });
  }
  if (sortAuthorsByCount) {
    sortAuthorsByCount.addEventListener("click", () => {
      window.authorSortBy = "count";
      sortAuthorsByCount.classList.add("active");
      sortAuthorsByName.classList.remove("active");
      loadAuthors();
    });
  }

  // Autocomplete for author
  authorInput.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, "author");
  });

  authorInput.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, authorSuggestions, "author");
  });

  // Autocomplete for source
  sourceInput.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, "source");
  });

  sourceInput.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, sourceSuggestions, "source");
  });

  // Autocomplete for tags search
  searchTags.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, "tags");
  });

  searchTags.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, tagsSuggestions, "tags");
  });

  // Close suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper")) {
      authorSuggestions.classList.remove("show");
      sourceSuggestions.classList.remove("show");
      bulkAuthorSuggestions.classList.remove("show");
      bulkSourceSuggestions.classList.remove("show");
    }
  });

  // Close modal on outside click
  window.addEventListener("click", (e) => {
    if (e.target === quoteModal) {
      closeQuoteModal();
    }
  });
}

// Autocomplete Functions
async function fetchSuggestions(search, type, container, input) {
  try {
    const endpoint = type === "authors" ? "authors" : "sources";
    const url = `${API_URL}/${endpoint}?search=${encodeURIComponent(search)}`;
    const response = await fetch(url);
    const items = await response.json();

    // Hide if no results
    if (!items || items.length === 0) {
      container.classList.remove("show");
      container.innerHTML = "";
      return;
    }

    displaySuggestions(items, container, input, type);
  } catch (error) {
    console.error(`Error fetching ${type} suggestions:`, error);
    container.classList.remove("show");
    container.innerHTML = "";
  }
}

function displaySuggestions(items, container, input, type) {
  currentFocus = -1;

  if (items.length === 0) {
    container.classList.remove("show");
    return;
  }

  // Limit to max 10 suggestions
  const limitedItems = items.slice(0, 10);

  container.innerHTML = limitedItems
    .map(
      (item) =>
        `<div class="autocomplete-item" data-value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>`,
    )
    .join("");

  // Add click handlers
  container.querySelectorAll(".autocomplete-item").forEach((item) => {
    item.addEventListener("click", () => {
      input.value = item.dataset.value;
      container.classList.remove("show");
    });
  });

  container.classList.add("show");
}

function handleAutocompleteKeys(e, container, type) {
  const items = container.querySelectorAll(".autocomplete-item");

  if (e.key === "ArrowDown") {
    e.preventDefault();
    currentFocus++;
    if (currentFocus >= items.length) currentFocus = 0;
    setActive(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    currentFocus--;
    if (currentFocus < 0) currentFocus = items.length - 1;
    setActive(items);
  } else if (e.key === "Enter") {
    if (currentFocus > -1 && items[currentFocus]) {
      e.preventDefault();
      items[currentFocus].click();
    }
  } else if (e.key === "Escape") {
    container.classList.remove("show");
  }
}

function setActive(items) {
  items.forEach((item, index) => {
    item.classList.remove("active");
    if (index === currentFocus) {
      item.classList.add("active");
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1; // Reset to first page when searching
    loadQuotes();
  }, 300);
}

function openAddModal() {
  modalTitle.textContent = "Add New Quote";
  editingQuoteId = null;
  quoteForm.reset();
  currentQuoteImage = "";
  currentQuoteImageFull = "";
  clearImagePreview(quoteImagePreview, "quote");
  
  // Hide metadata for new quotes
  const metadataEl = document.getElementById("quoteMetadata");
  if (metadataEl) {
    metadataEl.style.display = "none";
  }
  
  // Hide delete button for new quotes
  const deleteQuoteBtn = document.getElementById("deleteQuoteBtn");
  if (deleteQuoteBtn) {
    deleteQuoteBtn.style.display = "none";
  }
  
  quoteModal.style.display = "block";
}

function openEditModal(quote) {
  modalTitle.textContent = "Edit Quote";
  editingQuoteId = quote.id;
  
  // Set the hidden quoteId input for delete button
  document.getElementById("quoteId").value = quote.id;

  // Display metadata (created/updated dates)
  const metadataEl = document.getElementById("quoteMetadata");
  const createdDate = quote.created_at ? new Date(quote.created_at).toLocaleString() : "";
  const updatedDate = quote.updated_at ? new Date(quote.updated_at).toLocaleString() : "";
  if (createdDate || updatedDate) {
    metadataEl.innerHTML = `${createdDate ? `Created: ${createdDate}` : ''} ${createdDate && updatedDate ? ' | ' : ''} ${updatedDate ? `Updated: ${updatedDate}` : ''}`;
    metadataEl.style.display = "block";
  }

  document.getElementById("quoteText").value = quote.quote;
  document.getElementById("author").value = quote.author_name || "";
  document.getElementById("source").value = quote.source_name || "";
  document.getElementById("sourceType").value = quote.source_type || "BOOK";
  document.getElementById("tags").value = quote.tags || "";
  noteInput.value = quote.note || "";

  // Store source_id for updating
  window.currentSourceId = quote.source_id || null;

  // Set quote images if exist
  currentQuoteImage = quote.image || "";
  currentQuoteImageFull = quote.image_full || "";

  if (currentQuoteImage) {
    displayImage(quoteImagePreview, currentQuoteImage);
  } else {
    clearImagePreview(quoteImagePreview, "quote");
  }
  
  // Show delete button for editing
  const deleteQuoteBtn = document.getElementById("deleteQuoteBtn");
  if (deleteQuoteBtn) {
    deleteQuoteBtn.style.display = "inline-block";
  }

  quoteModal.style.display = "block";
}

function closeQuoteModal() {
  quoteModal.style.display = "none";
  quoteForm.reset();
  editingQuoteId = null;
  authorSuggestions.classList.remove("show");
  sourceSuggestions.classList.remove("show");
}

function clearFilters() {
  searchQuote.value = "";
  searchAuthor.value = "";
  searchSource.value = "";
  searchTags.value = "";
  currentPage = 1;
  loadQuotes();
}

// API Functions
async function loadQuotes() {
  try {
    const params = new URLSearchParams();

    if (searchQuote.value) params.append("quote", searchQuote.value);
    if (searchAuthor.value) params.append("author", searchAuthor.value);
    if (searchSource.value) params.append("source", searchSource.value);
    if (searchTags.value) params.append("tags", searchTags.value);

    // Add type filter
    const selectedTypes = [];
    if (document.getElementById("filterQuoteBook")?.checked)
      selectedTypes.push("BOOK");
    if (document.getElementById("filterQuoteMovie")?.checked)
      selectedTypes.push("MOVIE");
    if (document.getElementById("filterQuoteAssorted")?.checked)
      selectedTypes.push("ASSORTED");
    if (selectedTypes.length > 0 && selectedTypes.length < 3) {
      params.append("types", selectedTypes.join(","));
    }

    // Add pagination params
    const offset = (currentPage - 1) * quotesPerPage;
    params.append("limit", quotesPerPage);
    params.append("offset", offset);

    const response = await fetch(`${API_URL}/quotes?${params.toString()}`);
    const quotes = await response.json();

    currentQuotesData = quotes; // Store for PDF export

    displayQuotes(quotes);
    await loadTotalCount(); // Update counts whenever quotes are loaded
  } catch (error) {
    console.error("Error loading quotes:", error);
    quotesList.innerHTML =
      '<div class="no-quotes">Failed to load quotes. Please try again.</div>';
  }
}

async function loadTotalCount() {
  try {
    // Get total count (no filters)
    const totalResponse = await fetch(`${API_URL}/quotes/count`);
    if (!totalResponse.ok) {
      throw new Error(`HTTP error! status: ${totalResponse.status}`);
    }
    const totalData = await totalResponse.json();
    totalQuotes = totalData.count;

    // Get filtered count (with current search filters)
    const params = new URLSearchParams();
    if (searchQuote.value) params.append("quote", searchQuote.value);
    if (searchAuthor.value) params.append("author", searchAuthor.value);
    if (searchSource.value) params.append("source", searchSource.value);
    if (searchTags.value) params.append("tags", searchTags.value);

    // Add type filter
    const selectedTypes = [];
    if (document.getElementById("filterQuoteBook")?.checked)
      selectedTypes.push("BOOK");
    if (document.getElementById("filterQuoteMovie")?.checked)
      selectedTypes.push("MOVIE");
    if (document.getElementById("filterQuoteAssorted")?.checked)
      selectedTypes.push("ASSORTED");
    if (selectedTypes.length > 0 && selectedTypes.length < 3) {
      params.append("types", selectedTypes.join(","));
    }

    const filteredResponse = await fetch(
      `${API_URL}/quotes/count?${params.toString()}`,
    );
    const filteredData = await filteredResponse.json();
    filteredQuotes = filteredData.count; // Store globally for pagination

    // Update both counts
    const totalCountElement = document.getElementById("totalQuotesCount");
    const filteredCountElement = document.getElementById("filteredQuotesCount");

    if (totalCountElement) {
      totalCountElement.textContent = totalQuotes;
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = filteredQuotes;
    }

    updatePaginationControls(); // Update pagination with filtered count
  } catch (error) {
    console.error("Error loading total count:", error);
    const totalCountElement = document.getElementById("totalQuotesCount");
    const filteredCountElement = document.getElementById("filteredQuotesCount");
    if (totalCountElement) {
      totalCountElement.textContent = "?";
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = "?";
    }
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  const quoteData = {
    quote: document.getElementById("quoteText").value,
    author: document.getElementById("author").value,
    source: document.getElementById("source").value,
    sourceType: document.getElementById("sourceType").value,
    sourceId: window.currentSourceId || null,
    tags: document.getElementById("tags").value,
    note: noteInput.value,
    image: currentQuoteImage,
    image_full: currentQuoteImageFull,
  };

  console.log("Submitting quote data:", quoteData);

  try {
    let response;
    if (editingQuoteId) {
      response = await fetch(`${API_URL}/quotes/${editingQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    } else {
      response = await fetch(`${API_URL}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    }

    if (response.ok) {
      closeQuoteModal();
      loadQuotes();
      loadTotalCount(); // Update total count
    } else {
      const errorData = await response.json();
      alert(
        "Failed to save quote: " + (errorData.error || "Please try again."),
      );
    }
  } catch (error) {
    console.error("Error saving quote:", error);
    alert("Failed to save quote. Please try again.");
  }
}

async function deleteQuote(id) {
  if (!confirm("Are you sure you want to delete this quote?")) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/quotes/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadQuotes();
      loadTotalCount(); // Update total count
    } else {
      alert("Failed to delete quote. Please try again.");
    }
  } catch (error) {
    console.error("Error deleting quote:", error);
    alert("Failed to delete quote. Please try again.");
  }
}

// Display Functions
function displayQuotes(quotes) {
  quoteCount.textContent = `(${quotes.length})`;

  if (quotes.length === 0) {
    quotesList.innerHTML =
      '<div class="no-quotes">No quotes found. Add your first quote!</div>';
    return;
  }

  quotesList.innerHTML = quotes.map((quote) => createQuoteCard(quote)).join("");

  // Add click handlers to quote cards (open edit modal)
  document.querySelectorAll(".quote-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Don't open modal if clicking on interactive elements
      if (e.target.closest('.author-link') || 
          e.target.closest('.source-link') || 
          e.target.closest('.expand-btn') ||
          e.target.closest('.quote-image-thumb')) {
        return;
      }
      
      const quoteId = card.dataset.quoteId;
      const quote = quotes.find((q) => q.id == quoteId);
      if (quote) {
        openEditModal(quote);
      }
    });
  });

  // Add click handlers to author/source names
  document.querySelectorAll(".author-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openAuthorModal(link.dataset.id, link.dataset.name);
    });
  });

  document.querySelectorAll(".source-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openSourceModal(
        link.dataset.id,
        link.dataset.name,
        link.dataset.type || "BOOK",
      );
    });
  });
}

function createQuoteCard(quote) {
  const tags = quote.tags
    ? quote.tags
        .split(",")
        .map((tag) => `<span class="tag">${tag.trim()}</span>`)
        .join("")
    : "";

  const author = quote.author_name || "";
  const source = quote.source_name || "";
  const sourceType = quote.source_type || "BOOK";
  const sourceIcon =
    sourceType === "MOVIE" ? "🎬" : sourceType === "ASSORTED" ? "📝" : "📖";

  // Check if quote is long (more than 10 lines)
  const lines = quote.quote.split("\n");
  const isLongQuote = lines.length > 10;
  const shortQuote = isLongQuote
    ? lines.slice(0, 10).join("\n") + "\n..."
    : quote.quote;
  const quoteId = `quote-${quote.id}`;
  const expandBtnId = `expand-${quote.id}`;

  return `
        <div class="quote-card" data-quote-id="${quote.id}" style="cursor: pointer;">
            ${quote.note ? `<div class="quote-note-title">${escapeHtml(quote.note)}</div>` : ''}
            <div class="quote-main-content">
                <div class="quote-text-column">
                    <div class="quote-text ${isLongQuote ? "collapsible" : ""}" id="${quoteId}" data-expanded="false">${escapeHtml(isLongQuote ? shortQuote : quote.quote)}</div>
                    ${isLongQuote ? `<button class="expand-btn" id="${expandBtnId}" onclick="event.stopPropagation(); toggleQuoteExpand('${quote.id}')">▼ Show more</button>` : ""}
                </div>
                <div class="quote-side-column">
                    ${author ? `<div class="meta-item"><span class="meta-label">✍️ Author:</span> <span class="meta-value clickable author-link" data-id="${quote.author_id}" data-name="${escapeHtml(author)}">${escapeHtml(author)}</span></div>` : ""}
                    ${source ? `<div class="meta-item"><span class="meta-label">Source:</span> <span class="meta-value clickable source-link" data-id="${quote.source_id}" data-name="${escapeHtml(source)}" data-type="${sourceType}">${sourceIcon} ${escapeHtml(source)}</span></div>` : ""}
                    ${quote.image ? `<div class="quote-image-thumb" onclick="event.stopPropagation(); showFullImage('${quote.image_full || quote.image}')"><img src="${quote.image}" alt="Quote image"></div>` : ""}
                </div>
            </div>
            ${tags ? `<div class="quote-tags-section">${tags}</div>` : ''}
        </div>
    `;
}

// Store full quotes for expand/collapse
window.fullQuotes = {};

function toggleQuoteExpand(quoteId) {
  const quoteEl = document.getElementById(`quote-${quoteId}`);
  const btnEl = document.getElementById(`expand-${quoteId}`);
  const isExpanded = quoteEl.dataset.expanded === "true";

  if (!window.fullQuotes[quoteId]) {
    // Fetch full quote if not in cache
    fetch(`${API_URL}/quotes/${quoteId}`)
      .then((res) => res.json())
      .then((quote) => {
        window.fullQuotes[quoteId] = quote.quote;
        doToggle();
      });
  } else {
    doToggle();
  }

  function doToggle() {
    if (isExpanded) {
      // Collapse
      const shortText = window.fullQuotes[quoteId].substring(0, 400) + "...";
      quoteEl.innerHTML = escapeHtml(shortText);
      quoteEl.dataset.expanded = "false";
      btnEl.innerHTML = "▼ Show more";
    } else {
      // Expand
      quoteEl.innerHTML = escapeHtml(window.fullQuotes[quoteId]);
      quoteEl.dataset.expanded = "true";
      btnEl.innerHTML = "▲ Show less";
    }
  }
}

// Show full-size image in modal (make it global for onclick)
window.showFullImage = function (imageSrc) {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  modal.innerHTML = `
        <div class="image-modal-content">
            <span class="image-modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <img src="${imageSrc}" alt="Full size image">
        </div>
    `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============= AUTHOR/SOURCE EDIT MODALS =============

// Author Modal Elements
const authorModal = document.getElementById("authorModal");
const authorForm = document.getElementById("authorForm");
const authorIdInput = document.getElementById("authorId");
const authorNameInput = document.getElementById("authorName");
const authorImageFile = document.getElementById("authorImageFile");
const authorImagePreview = document.getElementById("authorImagePreview");
const closeAuthorModal = document.querySelector(".close-author");
const cancelAuthorBtn = document.getElementById("cancelAuthorBtn");
const clearAuthorImageBtn = document.getElementById("clearAuthorImage");

// Source Modal Elements
const sourceModal = document.getElementById("sourceModal");
const sourceForm = document.getElementById("sourceForm");
const sourceIdInput = document.getElementById("sourceId");
const sourceNameInput = document.getElementById("sourceName");
const sourceTypeEdit = document.getElementById("sourceTypeEdit");
const sourceImageFile = document.getElementById("sourceImageFile");
const sourceImagePreview = document.getElementById("sourceImagePreview");
const closeSourceModal = document.querySelector(".close-source");
const cancelSourceBtn = document.getElementById("cancelSourceBtn");
const clearSourceImageBtn = document.getElementById("clearSourceImage");

// State for images
let currentAuthorImage = null;
let currentSourceImage = null;

// Setup modal event listeners
closeAuthorModal.addEventListener("click", closeAuthorEditModal);
cancelAuthorBtn.addEventListener("click", closeAuthorEditModal);
authorForm.addEventListener("submit", handleAuthorSubmit);
authorImageFile.addEventListener("change", handleAuthorFileSelect);
clearAuthorImageBtn.addEventListener("click", clearAuthorImage);

closeSourceModal.addEventListener("click", closeSourceEditModal);
cancelSourceBtn.addEventListener("click", closeSourceEditModal);
sourceForm.addEventListener("submit", handleSourceSubmit);
sourceImageFile.addEventListener("change", handleSourceFileSelect);
clearSourceImageBtn.addEventListener("click", clearSourceImage);

// Delete button event listeners
document
  .getElementById("deleteAuthorBtn")
  .addEventListener("click", handleDeleteAuthor);
document
  .getElementById("deleteSourceBtn")
  .addEventListener("click", handleDeleteSource);

// Click on preview to open file dialog
authorImagePreview.addEventListener("click", () => authorImageFile.click());
sourceImagePreview.addEventListener("click", () => sourceImageFile.click());

// Paste image functionality
document.addEventListener("paste", (e) => {
  if (authorModal.style.display === "block") {
    handlePaste(e, "author");
  } else if (sourceModal.style.display === "block") {
    handlePaste(e, "source");
  }
});

// Close modals on outside click
window.addEventListener("click", (e) => {
  if (e.target === authorModal) {
    closeAuthorEditModal();
  }
  if (e.target === sourceModal) {
    closeSourceEditModal();
  }
  if (e.target === bulkModal) {
    closeBulkImportModal();
  }
});

// Open Author Modal
async function openAuthorModal(authorId, authorName, quoteCount = null) {
  try {
    const response = await fetch(`${API_URL}/authors/${authorId}`);
    const author = await response.json();

    authorIdInput.value = author.id;
    authorNameInput.value = author.name;
    currentAuthorImage = author.image;

    if (author.image) {
      displayImage(authorImagePreview, author.image);
    } else {
      clearImagePreview(authorImagePreview, "author");
    }

    // If quoteCount is not provided, fetch it from the API response
    if (quoteCount === null && author.quote_count !== undefined) {
      quoteCount = parseInt(author.quote_count) || 0;
    }

    // Show/hide delete button based on quote count
    const deleteBtn = document.getElementById("deleteAuthorBtn");
    if (quoteCount !== null && quoteCount === 0) {
      deleteBtn.style.display = "inline-block";
      deleteBtn.dataset.authorId = author.id;
      deleteBtn.dataset.authorName = author.name;
    } else {
      deleteBtn.style.display = "none";
    }

    authorModal.style.display = "block";
  } catch (error) {
    console.error("Error loading author:", error);
    alert("Failed to load author details");
  }
}

// Open Source Modal
async function openSourceModal(
  sourceId,
  sourceName,
  sourceType,
  quoteCount = null,
) {
  try {
    const response = await fetch(`${API_URL}/sources/${sourceId}`);
    const source = await response.json();

    sourceIdInput.value = source.id;
    sourceNameInput.value = source.name;
    sourceTypeEdit.value = source.type || "BOOK";
    currentSourceImage = source.image;

    if (source.image) {
      displayImage(sourceImagePreview, source.image);
    } else {
      clearImagePreview(sourceImagePreview, "source");
    }

    // If quoteCount is not provided, fetch it from the API response
    if (quoteCount === null && source.quote_count !== undefined) {
      quoteCount = parseInt(source.quote_count) || 0;
    }

    // Show/hide delete button based on quote count
    const deleteBtn = document.getElementById("deleteSourceBtn");
    if (quoteCount !== null && quoteCount === 0) {
      deleteBtn.style.display = "inline-block";
      deleteBtn.dataset.sourceId = source.id;
      deleteBtn.dataset.sourceName = source.name;
    } else {
      deleteBtn.style.display = "none";
    }

    sourceModal.style.display = "block";
  } catch (error) {
    console.error("Error loading source:", error);
    alert("Failed to load source details");
  }
}

// Close Author Modal
function closeAuthorEditModal() {
  authorModal.style.display = "none";
  authorForm.reset();
  currentAuthorImage = null;
  clearImagePreview(authorImagePreview, "author");
}

// Close Source Modal
function closeSourceEditModal() {
  sourceModal.style.display = "none";
  sourceForm.reset();
  currentSourceImage = null;
  clearImagePreview(sourceImagePreview, "source");
}

// Handle Author Form Submit
async function handleAuthorSubmit(e) {
  e.preventDefault();

  const authorId = authorIdInput.value;
  const authorData = {
    name: authorNameInput.value,
    image: currentAuthorImage || "",
  };

  try {
    const response = await fetch(`${API_URL}/authors/${authorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authorData),
    });

    if (response.ok) {
      closeAuthorEditModal();
      loadQuotes(); // Reload to show updated author info
    } else {
      alert("Failed to update author");
    }
  } catch (error) {
    console.error("Error updating author:", error);
    alert("Failed to update author");
  }
}

// Handle Source Form Submit
async function handleSourceSubmit(e) {
  e.preventDefault();

  const sourceId = sourceIdInput.value;
  const sourceData = {
    name: sourceNameInput.value,
    type: sourceTypeEdit.value,
    image: currentSourceImage || "",
  };

  try {
    const response = await fetch(`${API_URL}/sources/${sourceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sourceData),
    });

    if (response.ok) {
      closeSourceEditModal();
      loadQuotes(); // Reload to show updated source info
    } else {
      alert("Failed to update source");
    }
  } catch (error) {
    console.error("Error updating source:", error);
    alert("Failed to update source");
  }
}

// Handle Delete Author
async function handleDeleteAuthor(e) {
  const authorId = e.target.dataset.authorId;
  const authorName = e.target.dataset.authorName;

  if (
    !confirm(
      `Are you sure you want to delete author "${authorName}"? This action cannot be undone.`,
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/authors/${authorId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      closeAuthorEditModal();
      loadAuthors(); // Reload authors list
      alert("Author deleted successfully");
    } else {
      const error = await response.json();
      alert(error.error || "Failed to delete author");
    }
  } catch (error) {
    console.error("Error deleting author:", error);
    alert("Failed to delete author");
  }
}

// Handle Delete Source
async function handleDeleteSource(e) {
  const sourceId = e.target.dataset.sourceId;
  const sourceName = e.target.dataset.sourceName;

  console.log("Attempting to delete source:", sourceId, sourceName);

  if (
    !confirm(
      `Are you sure you want to delete source "${sourceName}"? This action cannot be undone.`,
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/sources/${sourceId}`, {
      method: "DELETE",
    });

    console.log("Delete response status:", response.status);

    if (response.ok) {
      closeSourceEditModal();
      loadSources(); // Reload sources list
      alert("Source deleted successfully");
    } else {
      const error = await response.json();
      console.error("Delete error:", error);
      alert(error.error || "Failed to delete source");
    }
  } catch (error) {
    console.error("Error deleting source:", error);
    alert("Failed to delete source: " + error.message);
  }
}

// Handle File Select
function handleAuthorFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    readImageFile(file, "author");
  }
}

function handleSourceFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    readImageFile(file, "source");
  }
}

// Read Image File
function readImageFile(file, type) {
  if (!file.type.match("image.*")) {
    alert("Please select an image file");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // For quote images, store ORIGINAL as full-size and create thumbnail
      if (type === "quote") {
        // Store original full-size WITHOUT downscaling
        currentQuoteImageFull = e.target.result; // Original base64

        // Create thumbnail for display (240px)
        const thumbnail = resizeImage(img, 240);
        currentQuoteImage = thumbnail;
        displayImage(quoteImagePreview, thumbnail);
      } else {
        // For author/source, just thumbnail
        const resizedBase64 = resizeImage(img, 300);

        if (type === "author") {
          currentAuthorImage = resizedBase64;
          displayImage(authorImagePreview, resizedBase64);
        } else if (type === "source") {
          currentSourceImage = resizedBase64;
          displayImage(sourceImagePreview, resizedBase64);
        }
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Resize image to fit within maxDimension (longest side)
function resizeImage(img, maxDimension) {
  const canvas = document.createElement("canvas");
  let width = img.width;
  let height = img.height;

  // Calculate new dimensions
  if (width > height) {
    if (width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    }
  } else {
    if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to base64 with compression
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Handle Paste
function handlePaste(e, type) {
  const items = e.clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      readImageFile(blob, type);
      break;
    }
  }
}

// Display Image
function displayImage(container, base64Image) {
  container.innerHTML = `<img src="${base64Image}" alt="Preview">`;
  container.classList.add("has-image");
}

// Clear Image Preview
function clearImagePreview(container, type) {
  const icon = type === "author" ? "📷" : type === "source" ? "📚" : "🖼️";

  // Clear the image data
  if (type === "quote") {
    currentQuoteImage = "";
    currentQuoteImageFull = "";
  }

  // Check if it's the compact preview
  const isCompact = container.classList.contains("image-preview-compact");

  if (isCompact) {
    container.innerHTML = `
            <div class="image-placeholder-compact">
                <span>${icon}</span>
                <p>Paste (Ctrl+V) or click 📁</p>
            </div>
        `;
  } else {
    container.innerHTML = `
            <div class="image-placeholder">
                <span>${icon}</span>
                <p>Paste image (Ctrl+V) or click to upload</p>
            </div>
        `;
  }
  container.classList.remove("has-image");
}

// Clear Author Image
function clearAuthorImage() {
  currentAuthorImage = "";
  clearImagePreview(authorImagePreview, "author");
}

// Clear Source Image
function clearSourceImage() {
  currentSourceImage = "";
  clearImagePreview(sourceImagePreview, "source");
}

// ============= BULK IMPORT FUNCTIONS =============

function openBulkModal() {
  bulkForm.reset();
  bulkPreview.style.display = "none";
  previewList.innerHTML = "";
  
  // Clear autocomplete suggestions
  if (bulkAuthorSuggestions) {
    bulkAuthorSuggestions.innerHTML = "";
    bulkAuthorSuggestions.style.display = "none";
  }
  if (bulkSourceSuggestions) {
    bulkSourceSuggestions.innerHTML = "";
    bulkSourceSuggestions.style.display = "none";
  }
  
  bulkModal.style.display = "block";
}

function closeBulkImportModal() {
  bulkModal.style.display = "none";
}

function previewBulkQuotes() {
  const quotesText = bulkQuotesInput.value.trim();

  if (!quotesText) {
    alert("Please paste some quotes first!");
    return;
  }

  // Split by --- separator
  const quotes = quotesText
    .split(/\n---\n/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  if (quotes.length === 0) {
    alert(
      "No quotes found. Make sure to separate quotes with --- on its own line.",
    );
    return;
  }

  // Update count
  document.getElementById("quoteCount").textContent = quotes.length;

  // Show preview
  previewList.innerHTML = quotes
    .map(
      (quote, index) => `
        <div class="preview-quote">
            <span class="preview-quote-number">${index + 1}.</span>
            ${escapeHtml(quote)}
        </div>
    `,
    )
    .join("");

  bulkPreview.style.display = "block";
}

async function handleBulkSubmit(e) {
  e.preventDefault();

  const author = bulkAuthorInput.value.trim();
  const source = bulkSourceInput.value.trim();
  const sourceType = document.getElementById("bulkSourceType").value;
  const quotesText = bulkQuotesInput.value.trim();

  if (!author) {
    alert("Please enter an author name.");
    return;
  }

  if (!quotesText) {
    alert("Please paste some quotes.");
    return;
  }

  // Split quotes by separator
  const quotes = quotesText
    .split(/\n---\n/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  if (quotes.length === 0) {
    alert(
      "No quotes found. Make sure to separate quotes with --- on its own line.",
    );
    return;
  }

  // Confirm before adding
  if (
    !confirm(
      `Add ${quotes.length} quotes by ${author}${source ? " from " + source : ""}?`,
    )
  ) {
    return;
  }

  // Disable form while processing
  const submitBtn = bulkForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Adding quotes...";

  try {
    let successCount = 0;
    let errorCount = 0;

    // Add quotes one by one
    for (let i = 0; i < quotes.length; i++) {
      try {
        const response = await fetch(`${API_URL}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quote: quotes[i],
            author: author,
            source: source,
            sourceType: sourceType,
            tags: "",
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to add quote ${i + 1}`);
        }

        // Update button text with progress
        submitBtn.textContent = `Adding quotes... (${i + 1}/${quotes.length})`;
      } catch (error) {
        errorCount++;
        console.error(`Error adding quote ${i + 1}:`, error);
      }
    }

    // Show results
    if (errorCount === 0) {
      alert(`✅ Successfully added all ${successCount} quotes!`);
    } else {
      alert(`Added ${successCount} quotes. ${errorCount} failed.`);
    }

    // Close modal and reload quotes
    closeBulkImportModal();
    loadQuotes();
    loadTotalCount(); // Update total count
  } catch (error) {
    console.error("Bulk import error:", error);
    alert("Failed to add quotes. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// Update autocomplete to handle bulk import fields
const originalDebounceAutocomplete = debounceAutocomplete;

function debounceAutocomplete(value, type) {
  clearTimeout(autocompleteTimeout);
  autocompleteTimeout = setTimeout(() => {
    if (value.length < 1) {
      // Hide suggestions if input is too short
      if (type === "author") authorSuggestions.classList.remove("show");
      else if (type === "source") sourceSuggestions.classList.remove("show");
      else if (type === "bulkAuthor")
        bulkAuthorSuggestions.classList.remove("show");
      else if (type === "bulkSource")
        bulkSourceSuggestions.classList.remove("show");
      else if (type === "tags") tagsSuggestions.classList.remove("show");
      return;
    }

    if (type === "author") {
      fetchSuggestions(value, "authors", authorSuggestions, authorInput);
    } else if (type === "source") {
      fetchSuggestions(value, "sources", sourceSuggestions, sourceInput);
    } else if (type === "bulkAuthor") {
      fetchSuggestions(
        value,
        "authors",
        bulkAuthorSuggestions,
        bulkAuthorInput,
      );
    } else if (type === "bulkSource") {
      fetchSuggestions(
        value,
        "sources",
        bulkSourceSuggestions,
        bulkSourceInput,
      );
    } else if (type === "tags") {
      fetchTagSuggestions(value, tagsSuggestions, searchTags);
    }
  }, 300);
}

// ============= QUOTE IMAGE HANDLING =============

// Handle quote image file selection
quoteImageFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    readImageFile(file, "quote");
  }
});

// Handle quote image paste
document.getElementById("quoteModal").addEventListener("paste", (e) => {
  handlePaste(e, "quote");
});

// Clear quote image
clearQuoteImageBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  currentQuoteImage = "";
  currentQuoteImageFull = "";
  clearImagePreview(quoteImagePreview, "quote");
  quoteImageFile.value = "";
});

// ============= TAG AUTOCOMPLETE =============

async function fetchTagSuggestions(search, container, input) {
  try {
    // Extract the last tag being typed (after the last comma)
    const lastCommaIndex = search.lastIndexOf(",");
    const currentTag =
      lastCommaIndex >= 0
        ? search.substring(lastCommaIndex + 1).trim()
        : search.trim();

    if (currentTag.length < 2) {
      container.classList.remove("show");
      return;
    }

    const response = await fetch(`${API_URL}/tags`);
    const tags = await response.json();

    // Filter tags that match the current tag being typed
    const filteredTags = tags.filter((tag) =>
      tag.name.toLowerCase().includes(currentTag.toLowerCase()),
    );

    displayTagSuggestions(filteredTags, container, input, search, currentTag);
  } catch (error) {
    console.error("Error fetching tag suggestions:", error);
  }
}

function displayTagSuggestions(tags, container, input, fullValue, currentTag) {
  currentFocus = -1;

  if (tags.length === 0) {
    container.classList.remove("show");
    return;
  }

  container.innerHTML = tags
    .map(
      (tag) =>
        `<div class="autocomplete-item" data-value="${escapeHtml(tag.name)}">
            ${escapeHtml(tag.name)} <span style="color: var(--text-secondary);">(${tag.quote_count})</span>
        </div>`,
    )
    .join("");

  container.classList.add("show");

  // Add click handlers
  container.querySelectorAll(".autocomplete-item").forEach((item) => {
    item.addEventListener("click", () => {
      // Replace only the last tag being typed
      const lastCommaIndex = fullValue.lastIndexOf(",");
      let newValue;
      if (lastCommaIndex >= 0) {
        // Keep everything before the last comma and append the selected tag
        newValue =
          fullValue.substring(0, lastCommaIndex + 1) + " " + item.dataset.value;
      } else {
        // No comma, just replace the entire value
        newValue = item.dataset.value;
      }

      input.value = newValue;
      container.classList.remove("show");
      debounceSearch(); // Trigger search after selection
    });
  });
}

// ============= PAGINATION =============

function updatePaginationControls() {
  const paginationContainer = document.getElementById("paginationControls");
  if (!paginationContainer) return;

  // Use filteredQuotes for pagination calculations
  const totalPages = Math.ceil(filteredQuotes / quotesPerPage);
  const startItem =
    filteredQuotes === 0 ? 0 : (currentPage - 1) * quotesPerPage + 1;
  const endItem = Math.min(currentPage * quotesPerPage, filteredQuotes);

  if (filteredQuotes === 0) {
    paginationContainer.innerHTML = "";
    return;
  }

  paginationContainer.innerHTML = `
        <div class="pagination-info">
            Showing ${startItem}-${endItem} of ${filteredQuotes} quotes
        </div>
        <div class="pagination-buttons">
            <button class="btn btn-secondary" id="firstPageBtn" ${currentPage === 1 ? "disabled" : ""}>First</button>
            <button class="btn btn-secondary" id="prevPageBtn" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
            <span class="page-info">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary" id="nextPageBtn" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
            <button class="btn btn-secondary" id="lastPageBtn" ${currentPage >= totalPages ? "disabled" : ""}>Last</button>
        </div>
    `;

  // Add event listeners
  document
    .getElementById("firstPageBtn")
    ?.addEventListener("click", () => goToPage(1));
  document
    .getElementById("prevPageBtn")
    ?.addEventListener("click", () => goToPage(currentPage - 1));
  document
    .getElementById("nextPageBtn")
    ?.addEventListener("click", () => goToPage(currentPage + 1));
  document
    .getElementById("lastPageBtn")
    ?.addEventListener("click", () => goToPage(totalPages));
}

function goToPage(page) {
  const totalPages = Math.ceil(totalQuotes / quotesPerPage);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadQuotes();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
// ============= MENU NAVIGATION =============

function setupMenuNavigation() {
  const menuItems = document.querySelectorAll(".menu-item[data-view]");
  console.log("Menu items found:", menuItems.length);

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      console.log("Switching to view:", view);
      switchView(view);

      // Update active state only for view navigation items
      menuItems.forEach((mi) => mi.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchView(view) {
  // Get all view elements
  const quotesView = document.getElementById("quotesView");
  const authorsView = document.getElementById("authorsView");
  const sourcesView = document.getElementById("sourcesView");
  const tagsView = document.getElementById("tagsView");

  // Hide all views
  if (quotesView) quotesView.style.display = "none";
  if (authorsView) authorsView.style.display = "none";
  if (sourcesView) sourcesView.style.display = "none";
  if (tagsView) tagsView.style.display = "none";

  // Show selected view and load data
  if (view === "quotes" && quotesView) {
    quotesView.style.display = "block";
    loadQuotes();
    loadTotalCount();
  } else if (view === "authors" && authorsView) {
    authorsView.style.display = "block";
    loadAuthors();
  } else if (view === "sources" && sourcesView) {
    sourcesView.style.display = "block";
    loadSources();

    // Setup source type filters
    const filterBook = document.getElementById("filterBook");
    const filterMovie = document.getElementById("filterMovie");
    const filterAssorted = document.getElementById("filterAssorted");

    if (filterBook && !filterBook.hasAttribute("data-listener")) {
      filterBook.addEventListener("change", loadSources);
      filterBook.setAttribute("data-listener", "true");
    }
    if (filterMovie && !filterMovie.hasAttribute("data-listener")) {
      filterMovie.addEventListener("change", loadSources);
      filterMovie.setAttribute("data-listener", "true");
    }
    if (filterAssorted && !filterAssorted.hasAttribute("data-listener")) {
      filterAssorted.addEventListener("change", loadSources);
      filterAssorted.setAttribute("data-listener", "true");
    }
  } else if (view === "tags" && tagsView) {
    tagsView.style.display = "block";
    loadTags();
  }
}

async function loadAuthors() {
  try {
    const response = await fetch(`${API_URL}/authors`);
    let authors = await response.json();

    // Filter by search term
    const searchTerm = document
      .getElementById("searchAuthorName")
      ?.value.toLowerCase()
      .trim();
    if (searchTerm) {
      authors = authors.filter((author) =>
        author.name.toLowerCase().includes(searchTerm),
      );
    }

    // Sort authors
    const sortBy = window.authorSortBy || "name"; // Default to name
    if (sortBy === "name") {
      authors.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "count") {
      authors.sort(
        (a, b) =>
          (parseInt(b.quote_count) || 0) - (parseInt(a.quote_count) || 0),
      );
    }

    displayAuthors(authors);
  } catch (error) {
    console.error("Error loading authors:", error);
    document.getElementById("authorsList").innerHTML =
      '<div class="no-items">Failed to load authors.</div>';
  }
}

function displayAuthors(authors) {
  const authorsList = document.getElementById("authorsList");

  if (!authorsList) {
    console.error("authorsList element not found!");
    return;
  }

  if (authors.length === 0) {
    authorsList.innerHTML = '<div class="no-items">No authors found.</div>';
    return;
  }

  authorsList.innerHTML = authors
    .map(
      (author) => `
        <div class="card author-card" onclick="openAuthorModal(${author.id}, '${escapeHtml(author.name)}', ${parseInt(author.quote_count) || 0})">
            <div class="card-image">
                ${author.image ? `<img src="${author.image}" alt="${escapeHtml(author.name)}">` : "✍️"}
            </div>
            <div class="card-name">
                <a href="#" onclick="event.stopPropagation(); filterByAuthor('${escapeHtml(author.name)}'); return false;" class="card-link">
                    ${escapeHtml(author.name)}
                </a>
            </div>
            <div class="card-quote-count">${parseInt(author.quote_count) || 0} quotes</div>
        </div>
    `,
    )
    .join("");

  // Original code commented out for testing
  /*
    if (authors.length === 0) {
        authorsList.innerHTML = '<div class="no-quotes">No authors found.</div>';
        return;
    }
    
    const html = authors.map(author => {
        const quoteCount = parseInt(author.quote_count) || 0;
        return `
            <div class="author-card" onclick="openAuthorModal(${author.id}, '${escapeHtml(author.name).replace(/'/g, "\\'")}')">
                ${author.image ? `<img src="${author.image}" alt="${escapeHtml(author.name)}" class="card-image">` : '<div class="card-image">✍️</div>'}
                <div class="card-name">${escapeHtml(author.name)}</div>
                <div class="card-quote-count">${quoteCount} quote${quoteCount !== 1 ? 's' : ''}</div>
            </div>
        `;
    }).join('');
    
    console.log('Setting authorsList HTML, length:', html.length);
    authorsList.innerHTML = html;
    
    // Force a test with simple visible content
    setTimeout(() => {
        console.log('After setting HTML - offsetHeight:', authorsList.offsetHeight);
        console.log('First child:', authorsList.firstChild);
    }, 100);
    */
}

async function loadSources() {
  try {
    // Get checked source types
    const filterBook = document.getElementById("filterBook")?.checked !== false;
    const filterMovie =
      document.getElementById("filterMovie")?.checked !== false;

    const response = await fetch(`${API_URL}/sources`);
    let sources = await response.json();

    // Filter by type if filters exist
    if (document.getElementById("filterBook")) {
      sources = sources.filter((source) => {
        if (!source.type) return filterBook; // Default to BOOK if no type
        if (source.type === "BOOK") return filterBook;
        if (source.type === "MOVIE") return filterMovie;
        return false;
      });
    }

    // Filter by search term
    const searchTerm = document
      .getElementById("searchSourceName")
      ?.value.toLowerCase()
      .trim();
    if (searchTerm) {
      sources = sources.filter((source) =>
        source.name.toLowerCase().includes(searchTerm),
      );
    }

    // Sort sources
    const sortBy = window.sourceSortBy || "name"; // Default to name
    if (sortBy === "name") {
      sources.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "count") {
      sources.sort(
        (a, b) =>
          (parseInt(b.quote_count) || 0) - (parseInt(a.quote_count) || 0),
      );
    }

    displaySources(sources);
  } catch (error) {
    console.error("Error loading sources:", error);
    document.getElementById("sourcesList").innerHTML =
      '<div class="no-items">Failed to load sources.</div>';
  }
}

function displaySources(sources) {
  const sourcesList = document.getElementById("sourcesList");

  if (!sourcesList) {
    console.error("sourcesList element not found!");
    return;
  }

  if (sources.length === 0) {
    sourcesList.innerHTML = '<div class="no-items">No sources found.</div>';
    return;
  }

  sourcesList.innerHTML = sources
    .map((source) => {
      const typeIcon =
        source.type === "MOVIE"
          ? "🎬"
          : source.type === "ASSORTED"
            ? "📝"
            : "📖";
      return `
        <div class="card source-card" onclick="openSourceModal(${source.id}, '${escapeHtml(source.name)}', '${source.type}', ${parseInt(source.quote_count) || 0})">
            <div class="card-image">
                ${source.image ? `<img src="${source.image}" alt="${escapeHtml(source.name)}">` : typeIcon}
            </div>
            <div class="card-name">
                <a href="#" onclick="event.stopPropagation(); filterBySource('${escapeHtml(source.name)}'); return false;" class="card-link">
                    ${escapeHtml(source.name)}
                </a>
            </div>
            <div class="card-quote-count">${parseInt(source.quote_count) || 0} quotes</div>
            ${
              source.primary_author_name
                ? `
                <div class="card-author">
                    <a href="#" onclick="event.stopPropagation(); filterByAuthor('${escapeHtml(source.primary_author_name)}'); return false;">
                        by ${escapeHtml(source.primary_author_name)}
                    </a>
                </div>
            `
                : ""
            }
        </div>
    `;
    })
    .join("");
}

async function loadTags() {
  try {
    const response = await fetch(`${API_URL}/tags`);
    const tags = await response.json();
    displayTags(tags);
  } catch (error) {
    console.error("Error loading tags:", error);
    document.getElementById("tagsList").innerHTML =
      '<div class="no-items">Failed to load tags.</div>';
  }
}

function displayTags(tags) {
  const tagsList = document.getElementById("tagsList");

  if (!tagsList) {
    console.error("tagsList element not found!");
    return;
  }

  if (tags.length === 0) {
    tagsList.innerHTML = '<div class="no-items">No tags found.</div>';
    return;
  }

  tagsList.innerHTML = tags
    .map(
      (tag) => `
        <div class="tag-card" onclick="filterByTag('${escapeHtml(tag.name)}')">
            <div class="tag-card-name">
                <span class="tag-card-icon">🏷️</span>
                <span>${escapeHtml(tag.name)}</span>
            </div>
            <div class="tag-card-actions">
                <div class="tag-card-count">${tag.quote_count} quotes</div>
                <button class="tag-edit-btn" onclick="event.stopPropagation(); editTag(${tag.id}, '${escapeHtml(tag.name)}')" title="Rename tag">✏️</button>
            </div>
        </div>
    `,
    )
    .join("");
  
  // Setup tag operation autocompletes
  setupTagOperationsAutocomplete(tags);
}

// Store all tags for autocomplete
let allTagsForOperations = [];

function setupTagOperationsAutocomplete(tags) {
  allTagsForOperations = tags;
  
  const renameTagInput = document.getElementById('renameTagInput');
  const sourceTagInput = document.getElementById('sourceTagInput');
  const targetTagInput = document.getElementById('targetTagInput');
  
  if (renameTagInput) {
    setupTagAutocomplete(renameTagInput, 'renameTagSuggestions', false);
  }
  
  if (sourceTagInput) {
    setupTagAutocomplete(sourceTagInput, 'sourceTagSuggestions', false);
  }
  
  if (targetTagInput) {
    setupTagAutocomplete(targetTagInput, 'targetTagSuggestions', true); // Allow new tags
  }
}

let tagAutocompleteTimeout;

function setupTagAutocomplete(input, suggestionsId, allowNew) {
  const suggestionsDiv = document.getElementById(suggestionsId);
  if (!suggestionsDiv) return;
  
  input.addEventListener('input', () => {
    clearTimeout(tagAutocompleteTimeout);
    tagAutocompleteTimeout = setTimeout(() => {
      const value = input.value.trim().toLowerCase();
      
      if (value.length === 0) {
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.classList.remove('show');
        return;
      }
      
      const matches = allTagsForOperations.filter(tag => 
        tag.name.toLowerCase().includes(value)
      );
      
      if (matches.length === 0) {
        if (allowNew) {
          suggestionsDiv.innerHTML = `<div class="autocomplete-item create-new">
            <span>✨ Create new tag: "${escapeHtml(input.value)}"</span>
          </div>`;
          suggestionsDiv.classList.add('show');
        } else {
          suggestionsDiv.innerHTML = '<div class="autocomplete-item no-match">No matching tags found</div>';
          suggestionsDiv.classList.add('show');
        }
        return;
      }
      
      suggestionsDiv.innerHTML = matches.map(tag => `
        <div class="autocomplete-item" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">
          ${escapeHtml(tag.name)} <span class="tag-count">(${tag.quote_count})</span>
        </div>
      `).join('');
      
      suggestionsDiv.classList.add('show');
      
      // Add click handlers
      suggestionsDiv.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const tagName = item.getAttribute('data-tag-name') || input.value;
          input.value = tagName;
          input.setAttribute('data-tag-id', item.getAttribute('data-tag-id') || '');
          input.setAttribute('data-tag-name', tagName);
          suggestionsDiv.classList.remove('show');
        });
      });
    }, 200);
  });
  
  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.classList.remove('show');
    }
  });
}

function filterByTag(tagName) {
  console.log("Filtering by tag:", tagName);
  
  // Switch to quotes view and filter by tag
  switchView("quotes");
  
  // Clear other filters
  document.getElementById("searchQuote").value = "";
  document.getElementById("searchAuthor").value = "";
  document.getElementById("searchSource").value = "";
  
  // Set tag filter
  document.getElementById("searchTags").value = tagName;
  currentPage = 1;
  
  setTimeout(() => {
    loadQuotes();
  }, 50);

  // Update active menu item
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.view === "quotes") {
      item.classList.add("active");
    }
  });
}

function filterByAuthor(authorName) {
  console.log("Filtering by author:", authorName);
  
  // Switch to quotes view and filter by author
  switchView("quotes");
  
  // Clear other filters
  document.getElementById("searchQuote").value = "";
  document.getElementById("searchSource").value = "";
  document.getElementById("searchTags").value = "";
  
  // Set author filter
  const authorField = document.getElementById("searchAuthor");
  authorField.value = authorName;
  
  console.log("Author field value:", authorField.value);
  
  // Reset pagination and force reload
  currentPage = 1;
  
  // Small delay to ensure view switch completes
  setTimeout(() => {
    console.log("Loading quotes for author:", authorName);
    loadQuotes();
  }, 50);

  // Update active menu item
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.view === "quotes") {
      item.classList.add("active");
    }
  });
}

function filterBySource(sourceName) {
  console.log("Filtering by source:", sourceName);
  
  // Switch to quotes view and filter by source
  switchView("quotes");
  
  // Clear other filters
  document.getElementById("searchQuote").value = "";
  document.getElementById("searchAuthor").value = "";
  document.getElementById("searchTags").value = "";
  
  // Set source filter
  document.getElementById("searchSource").value = sourceName;
  currentPage = 1;
  
  setTimeout(() => {
    loadQuotes();
  }, 50);

  // Update active menu item
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.view === "quotes") {
      item.classList.add("active");
    }
  });
}

// ============= RENAME FUNCTIONALITY =============

let renameContext = {
  type: null, // 'tag', 'author', 'source'
  id: null,
  oldName: null
};

function editTag(id, name) {
  renameContext = { type: 'tag', id, oldName: name };
  showRenameModal('Tag', name);
}

function editAuthor(id, name) {
  renameContext = { type: 'author', id, oldName: name };
  showRenameModal('Author', name);
}

function editSource(id, name) {
  renameContext = { type: 'source', id, oldName: name };
  showRenameModal('Source', name);
}

function showRenameModal(type, currentName) {
  const modal = document.getElementById('renameModal');
  const title = document.getElementById('renameModalTitle');
  const input = document.getElementById('renameInput');
  const warning = document.getElementById('renameWarning');
  
  title.textContent = `Rename ${type}`;
  input.value = currentName;
  warning.style.display = 'none';
  
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function hideRenameModal() {
  const modal = document.getElementById('renameModal');
  modal.style.display = 'none';
  renameContext = { type: null, id: null, oldName: null };
}

async function performRename() {
  const input = document.getElementById('renameInput');
  const newName = input.value.trim();
  
  if (!newName) {
    alert('Please enter a name');
    return;
  }
  
  if (newName === renameContext.oldName) {
    hideRenameModal();
    return;
  }
  
  const confirmBtn = document.getElementById('renameConfirmBtn');
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = '⏳ Renaming...';
  confirmBtn.disabled = true;
  
  try {
    let endpoint, refreshFunction;
    
    switch (renameContext.type) {
      case 'tag':
        endpoint = `tags/${renameContext.id}`;
        refreshFunction = loadTags;
        break;
      case 'author':
        endpoint = `authors/${renameContext.id}`;
        refreshFunction = loadAuthors;
        break;
      case 'source':
        endpoint = `sources/${renameContext.id}`;
        refreshFunction = loadSources;
        break;
    }
    
    const response = await fetch(`${API_URL}/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to rename');
    }
    
    const result = await response.json();
    
    hideRenameModal();
    
    // Show appropriate message
    if (result.merged) {
      showNotification(
        `✅ ${result.message}\n\nAll quotes have been moved to the existing ${renameContext.type}.`,
        'success'
      );
    } else {
      showNotification(
        `✅ ${result.message}`,
        'success'
      );
    }
    
    // Refresh the view
    refreshFunction();
    
  } catch (error) {
    console.error('Error renaming:', error);
    showNotification(`❌ ${error.message}`, 'error');
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 14px;
    max-width: 400px;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Event listeners for rename modal
document.addEventListener('DOMContentLoaded', () => {
  const renameModal = document.getElementById('renameModal');
  const renameCancelBtn = document.getElementById('renameCancelBtn');
  const renameConfirmBtn = document.getElementById('renameConfirmBtn');
  const renameInput = document.getElementById('renameInput');
  
  // Cancel button
  renameCancelBtn.addEventListener('click', hideRenameModal);
  
  // Confirm button
  renameConfirmBtn.addEventListener('click', performRename);
  
  // Enter key to confirm
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performRename();
    } else if (e.key === 'Escape') {
      hideRenameModal();
    }
  });
  
  // Click outside to close
  renameModal.addEventListener('click', (e) => {
    if (e.target === renameModal) {
      hideRenameModal();
    }
  });
});

// ============= TAG OPERATIONS =============

// Handle rename tag from operations panel
document.addEventListener('DOMContentLoaded', () => {
  const renameTagBtn = document.getElementById('renameTagBtn');
  const renameTagInput = document.getElementById('renameTagInput');
  const renameTagNewName = document.getElementById('renameTagNewName');
  
  if (renameTagBtn && renameTagInput && renameTagNewName) {
    // Auto-fill new name when tag is selected
    renameTagInput.addEventListener('change', () => {
      renameTagNewName.value = renameTagInput.value;
    });
    
    renameTagBtn.addEventListener('click', async () => {
      const tagId = renameTagInput.getAttribute('data-tag-id');
      const oldName = renameTagInput.getAttribute('data-tag-name') || renameTagInput.value;
      const newName = renameTagNewName.value.trim();
      
      if (!tagId) {
        alert('Please select a tag to rename');
        return;
      }
      
      if (!newName) {
        alert('Please enter a new name');
        return;
      }
      
      const originalText = renameTagBtn.textContent;
      renameTagBtn.textContent = '⏳ Renaming...';
      renameTagBtn.disabled = true;
      
      try {
        const response = await fetch(`${API_URL}/tags/${tagId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to rename tag');
        }
        
        const result = await response.json();
        
        if (result.merged) {
          showNotification(
            `✅ ${result.message}\n\nAll quotes have been moved to the existing tag.`,
            'success'
          );
        } else {
          showNotification(`✅ ${result.message}`, 'success');
        }
        
        // Reset form
        renameTagInput.value = '';
        renameTagInput.removeAttribute('data-tag-id');
        renameTagInput.removeAttribute('data-tag-name');
        renameTagNewName.value = '';
        
        // Reload tags
        loadTags();
        
      } catch (error) {
        console.error('Error renaming tag:', error);
        showNotification(`❌ ${error.message}`, 'error');
      } finally {
        renameTagBtn.textContent = originalText;
        renameTagBtn.disabled = false;
      }
    });
  }
  
  // Handle add tag to tagged quotes
  const addTagToTaggedBtn = document.getElementById('addTagToTaggedBtn');
  const sourceTagInput = document.getElementById('sourceTagInput');
  const targetTagInput = document.getElementById('targetTagInput');
  
  if (addTagToTaggedBtn && sourceTagInput && targetTagInput) {
    addTagToTaggedBtn.addEventListener('click', async () => {
      const sourceTagId = sourceTagInput.getAttribute('data-tag-id');
      const sourceTagName = sourceTagInput.value.trim();
      const targetTagValue = targetTagInput.value.trim();
      const targetTagId = targetTagInput.getAttribute('data-tag-id');
      
      if (!sourceTagId || !sourceTagName) {
        alert('Please select the source tag (quotes that have this tag)');
        return;
      }
      
      if (!targetTagValue) {
        alert('Please enter or select the target tag (tag to add)');
        return;
      }
      
      // Check if creating new tag or using existing
      const isNewTag = !targetTagId;
      
      let confirmMessage;
      if (isNewTag) {
        confirmMessage = `Create new tag "${targetTagValue}" and add it to all quotes that have "${sourceTagName}"?`;
      } else {
        confirmMessage = `Add tag "${targetTagValue}" to all quotes that have "${sourceTagName}"?\n\nThis will not remove the existing tag.`;
      }
      
      if (!confirm(confirmMessage)) {
        return;
      }
      
      const originalText = addTagToTaggedBtn.textContent;
      addTagToTaggedBtn.textContent = '⏳ Processing...';
      addTagToTaggedBtn.disabled = true;
      
      try {
        // If new tag, create it first
        let finalTargetTagId = targetTagId;
        
        if (isNewTag) {
          const createResponse = await fetch(`${API_URL}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetTagValue })
          });
          
          if (!createResponse.ok) {
            throw new Error('Failed to create new tag');
          }
          
          const newTag = await createResponse.json();
          finalTargetTagId = newTag.id;
        }
        
        // Now add the tag to all quotes with source tag
        const response = await fetch(`${API_URL}/tags/bulk-add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sourceTagId: sourceTagId, 
            targetTagId: finalTargetTagId 
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add tags');
        }
        
        const result = await response.json();
        
        showNotification(
          `✅ ${result.message}`,
          'success'
        );
        
        // Reset form
        sourceTagInput.value = '';
        sourceTagInput.removeAttribute('data-tag-id');
        sourceTagInput.removeAttribute('data-tag-name');
        targetTagInput.value = '';
        targetTagInput.removeAttribute('data-tag-id');
        targetTagInput.removeAttribute('data-tag-name');
        
        // Reload tags (counts may have changed)
        loadTags();
        
      } catch (error) {
        console.error('Error adding tags:', error);
        showNotification(`❌ ${error.message}`, 'error');
      } finally {
        addTagToTaggedBtn.textContent = originalText;
        addTagToTaggedBtn.disabled = false;
      }
    });
  }
});

// ============= PDF EXPORT =============

async function exportToPdf() {
  try {
    const exportBtn = document.getElementById("exportPdfBtn");
    const originalText = exportBtn.textContent;
    exportBtn.textContent = "⏳ Generating PDF...";
    exportBtn.disabled = true;

    // Fetch ALL quotes that match current filters (no pagination)
    const params = new URLSearchParams();

    if (searchQuote.value) params.append("quote", searchQuote.value);
    if (searchAuthor.value) params.append("author", searchAuthor.value);
    if (searchSource.value) params.append("source", searchSource.value);
    if (searchTags.value) params.append("tags", searchTags.value);

    // Add type filter
    const selectedTypes = [];
    if (document.getElementById("filterQuoteBook")?.checked)
      selectedTypes.push("BOOK");
    if (document.getElementById("filterQuoteMovie")?.checked)
      selectedTypes.push("MOVIE");
    if (document.getElementById("filterQuoteAssorted")?.checked)
      selectedTypes.push("ASSORTED");
    if (selectedTypes.length > 0 && selectedTypes.length < 3) {
      params.append("types", selectedTypes.join(","));
    }

    // Request ALL quotes (set very high limit)
    params.append("limit", "10000");

    const response = await fetch(`${API_URL}/quotes?${params.toString()}`);
    const allQuotes = await response.json();

    console.log(`Exporting ${allQuotes.length} quotes to PDF...`);

    if (allQuotes.length === 0) {
      alert("No quotes to export!");
      exportBtn.textContent = originalText;
      exportBtn.disabled = false;
      return;
    }

    // Prepare filters object for display in PDF
    const filters = {};
    if (searchQuote.value) filters.quote = searchQuote.value;
    if (searchAuthor.value) filters.author = searchAuthor.value;
    if (searchSource.value) filters.source = searchSource.value;
    if (searchTags.value) filters.tags = searchTags.value;

    // Send to server for PDF generation
    const pdfResponse = await fetch(`${API_URL}/export/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quotes: allQuotes,
        filters: filters,
      }),
    });

    if (!pdfResponse.ok) {
      const errorData = await pdfResponse.json();
      throw new Error(errorData.error || "Failed to generate PDF");
    }

    // Download the PDF
    const blob = await pdfResponse.blob();

    // Ensure blob is recognized as PDF
    const pdfBlob = new Blob([blob], { type: "application/pdf" });
    const url = window.URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotes_${new Date().toISOString().split("T")[0]}.pdf`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);

    exportBtn.textContent = originalText;
    exportBtn.disabled = false;
  } catch (error) {
    console.error("Error exporting PDF:", error);
    alert("Failed to export PDF. Please try again.");
    const exportBtn = document.getElementById("exportPdfBtn");
    exportBtn.textContent = "📄 Export to PDF";
    exportBtn.disabled = false;
  }
}

// ============= JSON EXPORT/IMPORT =============

async function exportToJson() {
  try {
    const exportBtn = document.getElementById("exportJsonBtn");
    const originalText = exportBtn.textContent;
    exportBtn.textContent = "⏳ Exporting...";
    exportBtn.disabled = true;

    const response = await fetch(`${API_URL}/export/json`);

    if (!response.ok) {
      throw new Error("Failed to export data");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotes_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);

    exportBtn.textContent = originalText;
    exportBtn.disabled = false;

    alert("✅ Backup created successfully!");
  } catch (error) {
    console.error("Error exporting JSON:", error);
    alert("Failed to create backup. Please try again.");
    const exportBtn = document.getElementById("exportJsonBtn");
    exportBtn.textContent = "💾 Backup Data";
    exportBtn.disabled = false;
  }
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const importProgress = document.getElementById("importProgress");
  const importStatus = document.getElementById("importStatus");
  const selectFileBtn = document.getElementById("selectFileBtn");

  try {
    selectFileBtn.textContent = "⏳ Reading file...";
    selectFileBtn.disabled = true;

    // Read file
    const text = await file.text();
    const backupData = JSON.parse(text);

    // Validate structure
    if (
      !backupData.data ||
      !backupData.data.authors ||
      !backupData.data.sources ||
      !backupData.data.quotes
    ) {
      throw new Error("Invalid backup file format");
    }

    // Show confirmation
    const replaceExisting = document.getElementById("replaceExisting").checked;
    const message =
      `About to import:\n\n` +
      `• ${backupData.counts.authors} authors\n` +
      `• ${backupData.counts.sources} sources\n` +
      `• ${backupData.counts.quotes} quotes\n\n` +
      `Mode: ${replaceExisting ? "Replace existing entries" : "Skip duplicates"}\n\n` +
      `This may take a while. Continue?`;

    if (!confirm(message)) {
      selectFileBtn.textContent = "Select Backup File";
      selectFileBtn.disabled = false;
      event.target.value = "";
      return;
    }

    // Show progress
    importProgress.style.display = "block";
    importStatus.innerHTML = "<p>⏳ Importing data...</p>";
    selectFileBtn.textContent = "⏳ Importing...";

    // Send to server
    const response = await fetch(`${API_URL}/import/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: backupData.data,
        options: {
          replaceExisting: replaceExisting,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Import failed");
    }

    // Show results
    importStatus.innerHTML = `
            <div style="background: #d1fae5; padding: 15px; border-radius: 8px; margin-top: 10px;">
                <h4 style="margin-top: 0; color: #065f46;">✅ Import Completed!</h4>
                <p><strong>Authors:</strong> ${result.stats.authors.created} created, ${result.stats.authors.updated} updated, ${result.stats.authors.skipped} skipped</p>
                <p><strong>Sources:</strong> ${result.stats.sources.created} created, ${result.stats.sources.updated} updated, ${result.stats.sources.skipped} skipped</p>
                <p><strong>Quotes:</strong> ${result.stats.quotes.created} created, ${result.stats.quotes.updated} updated, ${result.stats.quotes.skipped} skipped</p>
                ${result.stats.errors.length > 0 ? `<p style="color: #dc2626;"><strong>Errors:</strong> ${result.stats.errors.length}</p>` : ""}
            </div>
        `;

    selectFileBtn.textContent = "Select Backup File";
    selectFileBtn.disabled = false;
    event.target.value = "";

    // Reload data
    setTimeout(() => {
      document.getElementById("importModal").style.display = "none";
      currentPage = 1;
      loadQuotes();
      loadTotalCount();
      alert("✅ Data restored successfully! Page will refresh.");
      location.reload();
    }, 3000);
  } catch (error) {
    console.error("Error importing JSON:", error);
    importStatus.innerHTML = `
            <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin-top: 10px;">
                <h4 style="margin-top: 0; color: #991b1b;">❌ Import Failed</h4>
                <p>${error.message}</p>
            </div>
        `;
    selectFileBtn.textContent = "Select Backup File";
    selectFileBtn.disabled = false;
    event.target.value = "";
  }
}

// Welcome Quote Feature
async function showWelcomeQuote() {
  try {
    // Fetch a random quote
    const response = await fetch(`${API_URL}/quotes/random`);
    if (!response.ok) {
      console.log("No quotes available for welcome screen");
      return;
    }

    const quote = await response.json();
    
    // Get overlay elements
    const overlay = document.getElementById("welcomeQuoteOverlay");
    const textEl = overlay.querySelector(".welcome-quote-text");
    const authorEl = overlay.querySelector(".welcome-quote-author");
    const sourceEl = overlay.querySelector(".welcome-quote-source");
    const tagsEl = overlay.querySelector(".welcome-quote-tags");
    const noteEl = overlay.querySelector(".welcome-quote-note");
    
    // Populate quote data
    textEl.textContent = quote.quoteText || quote.quote || "";
    
    // Author with icon
    if (quote.author) {
      authorEl.textContent = `✍️ ${quote.author}`;
    } else {
      authorEl.textContent = "";
    }
    
    // Source with icon based on type and conditional bullet
    if (quote.source) {
      // Determine icon based on source type
      let sourceIcon = "📝"; // Default for ASSORTED
      if (quote.type === "BOOK" || quote.source_type === "BOOK") {
        sourceIcon = "📚";
      } else if (quote.type === "MOVIE" || quote.source_type === "MOVIE") {
        sourceIcon = "🎬";
      }
      
      sourceEl.style.display = "inline";
      // Add bullet before source when author exists
      if (quote.author) {
        sourceEl.style.marginLeft = "0.5rem";
        sourceEl.textContent = `• ${sourceIcon} ${quote.source}`;
      } else {
        sourceEl.style.marginLeft = "0";
        sourceEl.textContent = `${sourceIcon} ${quote.source}`;
      }
    } else {
      sourceEl.textContent = "";
      sourceEl.style.display = "none";
    }
    
    // Tags display
    if (quote.tags && quote.tags.trim()) {
      const tags = quote.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tags.length > 0) {
        tagsEl.innerHTML = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        tagsEl.style.display = "flex";
      } else {
        tagsEl.innerHTML = "";
        tagsEl.style.display = "none";
      }
    } else {
      tagsEl.innerHTML = "";
      tagsEl.style.display = "none";
    }
    
    // Note display
    if (quote.note && quote.note.trim()) {
      noteEl.textContent = quote.note;
      noteEl.style.display = "block";
    } else {
      noteEl.textContent = "";
      noteEl.style.display = "none";
    }
    
    // Show overlay
    overlay.style.display = "flex";
    
    // Function to close overlay
    function closeOverlay() {
      overlay.style.display = "none";
      overlay.removeEventListener("click", closeOverlay);
      document.removeEventListener("keydown", handleKeyPress);
    }
    
    // Handle keyboard events
    function handleKeyPress(e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeOverlay();
      }
    }
    
    // Close on click
    overlay.addEventListener("click", closeOverlay);
    
    // Close on Escape/Enter/Space
    document.addEventListener("keydown", handleKeyPress);
    
  } catch (error) {
    console.error("Error showing welcome quote:", error);
  }
}

// Show welcome quote on app load
window.addEventListener("DOMContentLoaded", () => {
  // Show welcome quote after a short delay to ensure smooth loading
  setTimeout(showWelcomeQuote, 300);
  
  // Add event listener for Random Quote button
  const randomQuoteBtn = document.getElementById("randomQuoteBtn");
  if (randomQuoteBtn) {
    randomQuoteBtn.addEventListener("click", showWelcomeQuote);
  }
});

