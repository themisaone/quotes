// ============= IMPORTS =============
import {
  parseUrlHash,
  updateUrlHash as updateUrlHashLib,
  updateActiveMenuState as updateActiveMenuStateLib,
  updatePageTitle as updatePageTitleLib,
  initializeView
  // Note: updateAddButtonText imported from noteTypes.js instead
  // Note: switchView not imported - keeping local version for now
  // Note: setupHashChangeListener not imported - keeping local version
} from './js/lib/viewManager.js';

import {
  escapeHtml,
  resolveAttachmentUrl,
  getAttachmentIcon
} from './js/lib/utils.js';

import {
  NOTE_TYPES,
  getNoteTypeConfig,
  updateModalFieldVisibility,
  updateModalLabels,
  updateAddButtonText as updateAddButtonTextLib,
  updateSourcesFilterVisibility as updateSourcesFilterVisibilityLib
} from './js/lib/noteTypes.js';

import {
  fetchWithRetry
} from './js/lib/api.js';

import {
  createQuoteCard as createQuoteCardLib
} from './js/lib/cardRenderer.js';

import {
  setupAddModal,
  setupEditModal
} from './js/lib/modalRenderer.js';

import {
  exportToPdf as exportToPdfLib,
  exportToJson as exportToJsonLib,
  handleImportFile as handleImportFileLib
} from './js/lib/dataManager.js';

import {
  loadSettings,
  getGlobalSettings,
  getQuoteTypes,
  getTrainingTypes,
  renderQuoteTypesList,
  renderTrainingTypesList,
  setupTypeManagementListeners,
  toggleMetadataSearchSection,
  applyQuoteSizingMode,
  toggleTagOperationsPanel,
  initializeSettings as initializeSettingsLib
} from './js/lib/settingsManager.js';

import {
  openAuthorModal as openAuthorModalLib,
  setupAuthorModalHandlers
} from './js/lib/authorModal.js';

import {
  openSourceModal as openSourceModalLib,
  setupSourceModalHandlers
} from './js/lib/sourceModal.js';

import {
  loadTags as loadTagsLib,
  filterByTag as filterByTagLib,
  deleteTag as deleteTagLib,
  setupTagOperations
} from './js/lib/tagsManager.js';

import {
  loadQuotes as loadQuotesLib,
  loadTotalCount as loadTotalCountLib,
  displayQuotes as displayQuotesLib,
  getCurrentQuotesData
} from './js/lib/displayManager.js';

// Note: displayImage, clearImagePreview, displayAttachmentPreview NOT imported
// They are kept as local functions due to tight coupling with app-specific state
// Note: Export/Import functions kept local - too complex and app-specific for library

// ============= CONSTANTS =============
// Auto-detect API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || '4000'}/api`;

// Quill editor instance
let quillEditor = null;

// Initialize Quill editor after DOM is loaded
function initializeQuillEditor() {
  quillEditor = new Quill('#quoteEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'header': [1, 2, 3, false] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
      ]
    },
    placeholder: 'Enter the quote text...'
  });
  
  // Update hidden field when content changes
  quillEditor.on('text-change', function() {
    const html = quillEditor.root.innerHTML;
    document.getElementById('quoteText').value = html;
  });
  
  // Setup fullscreen editor toggle
  setupFullscreenEditor();
}

function setupFullscreenEditor() {
  const toggleBtn = document.getElementById('toggleFullscreenEditor');
  const editorGroup = document.querySelector('.quote-editor-group');
  
  if (!toggleBtn || !editorGroup) return;
  
  let isFullscreen = false;
  
  toggleBtn.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    
    if (isFullscreen) {
      // Enter fullscreen
      editorGroup.classList.add('fullscreen');
      toggleBtn.textContent = '✕';
      toggleBtn.title = 'Exit Fullscreen (Esc)';
      
      // Focus editor
      if (quillEditor) {
        quillEditor.focus();
      }
    } else {
      // Exit fullscreen
      editorGroup.classList.remove('fullscreen');
      toggleBtn.textContent = '⛶';
      toggleBtn.title = 'Fullscreen Editor';
    }
  });
  
  // Exit fullscreen with Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullscreen) {
      toggleBtn.click();
    }
  });
}

// Quote types configuration (can be extended by user)
// Global settings cache (loaded from server on startup)
let globalSettings = null;

// Populate type dropdowns dynamically
function populateTypeDropdowns() {
  const types = getQuoteTypes();
  
  // Find all type dropdowns
  const dropdowns = [
    document.getElementById('sourceType'),      // Quote modal
    document.getElementById('sourceTypeEdit'), // Source edit modal  
    document.getElementById('authorTypeFilter') // Author filter (if exists)
  ].filter(Boolean); // Remove nulls
  
  dropdowns.forEach(dropdown => {
    const currentValue = dropdown.value;
    
    // Clear existing options except "Clear Type" if it exists
    dropdown.innerHTML = '';
    
    // Add "Clear Type" option for quote modal (to go back to Assorted/null)
    if (dropdown.id === 'sourceType') {
      const clearOption = document.createElement('option');
      clearOption.value = '';
      clearOption.textContent = '✖️ Clear Type (Assorted)';
      dropdown.appendChild(clearOption);
    }
    
    // Add all types
    types.forEach(type => {
      const option = document.createElement('option');
      option.value = type.value;
      option.textContent = `${type.icon} ${type.label}`;
      dropdown.appendChild(option);
    });
    
    // Restore previous value if it exists
    if (currentValue) {
      dropdown.value = currentValue;
    }
  });
  
  // Populate training type dropdown
  const trainingTypeDropdown = document.getElementById('trainingType');
  if (trainingTypeDropdown) {
    const trainingTypes = getTrainingTypes();
    const currentValue = trainingTypeDropdown.value;
    
    trainingTypeDropdown.innerHTML = '<option value="">Select type...</option>';
    
    trainingTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.value;
      option.textContent = `${type.icon} ${type.label}`;
      trainingTypeDropdown.appendChild(option);
    });
    
    if (currentValue) {
      trainingTypeDropdown.value = currentValue;
    }
  }
}

// Populate type filter checkboxes in search area
function populateTypeFilterCheckboxes() {
  const types = getQuoteTypes();
  const container = document.querySelector('.type-filter-options');
  
  if (!container) return;
  
  // Store current checked states
  const checkedStates = {};
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    checkedStates[cb.id] = cb.checked;
  });
  
  // Clear and rebuild
  container.innerHTML = '';
  
  types.forEach(type => {
    const checkboxId = `filterQuote${type.value.replace(/-/g, '')}`;
    const label = document.createElement('label');
    label.className = 'type-filter-option';
    label.innerHTML = `
      <input type="checkbox" id="${checkboxId}" data-type="${type.value}" ${checkedStates[checkboxId] !== false ? 'checked' : ''}>
      <span>${type.icon} ${type.label}</span>
    `;
    container.appendChild(label);
    
    // Re-attach event listener
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', () => {
      typeFilterChanged = true;
    });
  });
}

function populateTrainingTypeFilterCheckboxes() {
  const trainingTypes = getTrainingTypes();
  const container = document.querySelector('.training-type-filter-options');
  
  if (!container) return;
  
  // Store current checked states
  const checkedStates = {};
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    checkedStates[cb.id] = cb.checked;
  });
  
  // Clear and rebuild
  container.innerHTML = '';
  
  trainingTypes.forEach(type => {
    const checkboxId = `filterTraining${type.value}`;
    const label = document.createElement('label');
    label.className = 'type-filter-option';
    label.innerHTML = `
      <input type="checkbox" id="${checkboxId}" data-type="${type.value}" ${checkedStates[checkboxId] !== false ? 'checked' : ''}>
      <span>${type.icon} ${type.label}</span>
    `;
    container.appendChild(label);
    
    // Re-attach event listener
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', () => {
      loadQuotes();
    });
  });
}

// Populate training years from database
async function populateTrainingYears() {
  try {
    console.log("🗓️ Populating training years...");
    const response = await fetchWithRetry(`${API_URL}/quotes/training-years`);
    const data = await response.json();
    console.log("🗓️ Training years data:", data);
    
    const yearSelect = document.getElementById('trainingYearFilter');
    if (!yearSelect) {
      console.log("⚠️ Year select element not found!");
      return;
    }
    
    if (!data.years || data.years.length === 0) {
      console.log("⚠️ No years data received");
      return;
    }
    
    // Keep the "All Years" option
    yearSelect.innerHTML = '<option value="">📅 All Years</option>';
    
    // Add years in descending order (newest first)
    data.years.sort((a, b) => b - a).forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });
    
    console.log(`✅ Populated ${data.years.length} years`);
  } catch (error) {
    console.error("❌ Error loading training years:", error);
  }
}

// Pagination state
// Local state synced with displayManager library
let currentPage = 1; // Sync via setLibCurrentPage() when changed
let currentNoteTypeFilter = null; // null = show all types
const quotesPerPage = 20;

// Ensure currentPage stays in sync with library
function syncCurrentPage(newPage) {
  currentPage = newPage;
  setLibCurrentPage(newPage);
}
let totalQuotes = 0;
let filteredQuotes = 0; // Track filtered count for pagination

// ============= VIEW STATE MANAGEMENT =============

// Save current view to localStorage
function saveCurrentView() {
  try {
    localStorage.setItem('lastNoteTypeFilter', currentNoteTypeFilter || 'all');
    console.log('✅ Saved view:', currentNoteTypeFilter || 'all');
  } catch (error) {
    console.error('Error saving view:', error);
  }
}

// Restore last view from localStorage
function restoreLastView() {
  try {
    const savedView = localStorage.getItem('lastNoteTypeFilter');
    if (savedView && savedView !== 'all') {
      currentNoteTypeFilter = savedView;
      console.log('✅ Restored view:', currentNoteTypeFilter);
      return true;
    }
  } catch (error) {
    console.error('Error restoring view:', error);
  }
  return false;
}

// Handle URL hash navigation
// ============= NAVIGATION (Now using viewManager.js) =============
function handleHashNavigation() {
  // MIGRATED: Now using parseUrlHash() from viewManager.js
  currentNoteTypeFilter = parseUrlHash();
  console.log('✅ Set view from hash:', currentNoteTypeFilter || 'all');
}

// Update URL hash when view changes
// MIGRATED: Using library function
function updateUrlHash() {
  updateUrlHashLib(currentNoteTypeFilter);
}

// MIGRATED: Using library function  
function updateActiveMenuState() {
  updateActiveMenuStateLib(currentNoteTypeFilter);
}

// MIGRATED: Using library function
function updateMainTitle() {
  updatePageTitleLib(currentNoteTypeFilter);
}

// Listen for hash changes (browser back/forward)
window.addEventListener('hashchange', () => {
  console.log('🔄 Hash changed:', window.location.hash);
  handleHashNavigation();
  updateActiveMenuState();
  updateAddButtonText();
  updateMainTitle();
  updateSourcesFilterVisibility();
  currentPage = 1;
  loadQuotes();
  loadTotalCount();
});
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
// Preview button removed - no longer needed
const bulkAuthorInput = document.getElementById("bulkAuthor");
const bulkSourceInput = document.getElementById("bulkSource");
const bulkQuotesInput = document.getElementById("bulkQuotes");
const bulkAuthorSuggestions = document.getElementById("bulkAuthorSuggestions");
const bulkSourceSuggestions = document.getElementById("bulkSourceSuggestions");
// Preview elements removed - no longer needed

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
let currentAttachmentType = "image"; // Track: image, pdf, document, video, audio
let currentAttachmentFileName = ""; // Track filename for non-image files
let typeFilterChanged = false; // Track if type filter has changed

// Search inputs
const searchQuote = document.getElementById("searchQuote");
const searchAuthor = document.getElementById("searchAuthor");
const searchSource = document.getElementById("searchSource");
const searchTags = document.getElementById("searchTags");
const searchScore = document.getElementById("searchScore");
const clearBtn = document.getElementById("clearBtn");

// State
let editingQuoteId = null;
let searchTimeout = null;
let autocompleteTimeout = null;
let currentFocus = -1;

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Load settings from file first (using settingsManager library)
  await loadSettings();
  globalSettings = getGlobalSettings(); // Sync local reference
  
  // Initialize quote types in dropdowns
  populateTypeDropdowns();
  
  // Initialize quote source type filter checkboxes
  populateTypeFilterCheckboxes();
  
  // Initialize training type filter checkboxes
  populateTrainingTypeFilterCheckboxes();
  
  // Handle URL hash navigation (takes priority over saved view)
  if (window.location.hash) {
    handleHashNavigation();
  } else {
    // Restore last view if no hash is present
    restoreLastView();
  }
  
  // Update UI based on restored/navigated view
  updateActiveMenuState();
  updateAddButtonText();
  updateMainTitle();
  updateSourcesFilterVisibility();
  
  // Initialize sources filter visibility
  updateSourcesFilterVisibility();
  
  // Initialize Quill editor
  initializeQuillEditor();
  
  // Check if we're on a tablet (769px-1100px)
  const isTablet = window.matchMedia("(min-width: 769px) and (max-width: 1100px)").matches;
  
  if (isTablet) {
    // Show menu view on tablets
    switchView("menu");
  } else {
    // Show quotes view on desktop/mobile
    loadQuotes();
    loadTotalCount();
  }
  
  setupEventListeners();
  setupMenuNavigation();
});

// Event Listeners
function setupEventListeners() {
  // Add note button handlers with popup menu
  const addQuoteBtnTablet = document.getElementById("addQuoteBtnTablet");
  const noteTypePopup = document.getElementById("noteTypePopup");
  
  function handleAddNoteClick(e) {
    e.stopPropagation();
    
    // If on "All Notes" view, show popup menu
    if (currentNoteTypeFilter === null) {
      noteTypePopup.style.display = noteTypePopup.style.display === 'block' ? 'none' : 'block';
    } else {
      // Direct open with current filter type
      openAddModal();
    }
  }
  
  addQuoteBtn.addEventListener("click", handleAddNoteClick);
  if (addQuoteBtnTablet) {
    addQuoteBtnTablet.addEventListener("click", handleAddNoteClick);
  }
  
  // Close popup when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest('#addQuoteBtn') && !e.target.closest('#addQuoteBtnTablet') && !e.target.closest('#noteTypePopup')) {
      noteTypePopup.style.display = 'none';
    }
  });
  
  // Handle popup menu item clicks
  document.querySelectorAll('.note-type-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteType = item.dataset.type;
      currentNoteTypeFilter = noteType;
      noteTypePopup.style.display = 'none';
      openAddModal();
      // Reset filter after opening modal so next click shows popup again
      setTimeout(() => { currentNoteTypeFilter = null; }, 100);
    });
  });
  
  // Note type change handler (removed from modal, but keep for edit mode)
  const noteTypeSelect = document.getElementById("noteType");
  if (noteTypeSelect) {
    noteTypeSelect.addEventListener("change", updateFieldVisibility);
  }
  
  // Note type filter buttons in menu
  const noteTypeFilters = document.querySelectorAll('.note-type-filter');
  noteTypeFilters.forEach(button => {
    button.addEventListener('click', () => {
      const noteType = button.dataset.noteType;
      currentNoteTypeFilter = noteType;
      currentPage = 1;
      
      // Save view and update URL
      saveCurrentView();
      updateUrlHash();
      
      // Update active state
      document.querySelectorAll('.note-type-filter').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update button text
      updateAddButtonText();
      
      // Update UI
      updateAddButtonText();
      updateMainTitle();
      updateSourcesFilterVisibility();
      
      // Load filtered quotes
      loadQuotes();
      loadTotalCount();
    });
  });
  
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
    refreshQuotesBtn.addEventListener("click", async () => {
      refreshQuotesBtn.classList.add('refreshing');
      currentPage = 1;
      try {
        await loadQuotes();
        await loadTotalCount();
      } finally {
        setTimeout(() => {
          refreshQuotesBtn.classList.remove('refreshing');
        }, 500);
      }
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
    refreshAuthorsBtn.addEventListener("click", async () => {
      refreshAuthorsBtn.classList.add('refreshing');
      try {
        await loadAuthors();
      } finally {
        setTimeout(() => {
          refreshAuthorsBtn.classList.remove('refreshing');
        }, 500);
      }
    });
  }

  if (refreshSourcesBtn) {
    refreshSourcesBtn.addEventListener("click", async () => {
      refreshSourcesBtn.classList.add('refreshing');
      try {
        await loadSources();
      } finally {
        setTimeout(() => {
          refreshSourcesBtn.classList.remove('refreshing');
        }, 500);
      }
    });
  }

  if (refreshTagsBtn) {
    refreshTagsBtn.addEventListener("click", async () => {
      refreshTagsBtn.classList.add('refreshing');
      try {
        await loadTags();
      } finally {
        setTimeout(() => {
          refreshTagsBtn.classList.remove('refreshing');
        }, 500);
      }
    });
  }

  // Bulk import listeners
  addBulkBtn.addEventListener("click", openBulkModal);
  
  // Tablet-specific bulk button (same functionality)
  const addBulkBtnTablet = document.getElementById("addBulkBtnTablet");
  if (addBulkBtnTablet) {
    addBulkBtnTablet.addEventListener("click", openBulkModal);
  }
  
  closeBulkModal.addEventListener("click", closeBulkImportModal);
  cancelBulkBtn.addEventListener("click", closeBulkImportModal);
  // Preview button removed - direct import works great!
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
  [searchQuote, searchAuthor, searchSource, searchTags, searchScore].forEach((input) => {
    input.addEventListener("input", debounceSearch);
  });

  // NOTE: Type filter checkboxes are now handled by the dropdown logic below (line ~396)
  // The old individual listeners have been removed to avoid conflicts

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

  // Type filter dropdown
  const typeFilterToggle = document.getElementById("typeFilterToggle");
  const typeFilterDropdown = document.getElementById("typeFilterDropdown");
  const typeSelectAllBtn = document.getElementById("typeSelectAllBtn");
  const typeCheckboxes = document.querySelectorAll('.type-filter-option input[type="checkbox"]');

  if (typeFilterToggle && typeFilterDropdown) {
    // Toggle dropdown
    typeFilterToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = typeFilterDropdown.classList.contains("show");
      
      typeFilterDropdown.classList.toggle("show");
      typeFilterToggle.classList.toggle("open");
      
      // If closing and changes were made, reload quotes
      if (wasOpen && typeFilterChanged) {
        // Log current checkbox states
        const checkedTypes = Array.from(typeCheckboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.id);
        console.log("Reloading with types:", checkedTypes);
        
        currentPage = 1;
        loadQuotes();
        loadTotalCount();
        typeFilterChanged = false;
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".type-filter-dropdown-container")) {
        const wasOpen = typeFilterDropdown.classList.contains("show");
        
        if (wasOpen) {
          console.log("=== CLOSING DROPDOWN ===");
          // Log current checkbox states BEFORE closing
          const states = {};
          typeCheckboxes.forEach(cb => {
            states[cb.id] = cb.checked;
          });
          console.log("Checkbox states:", states);
        }
        
        typeFilterDropdown.classList.remove("show");
        typeFilterToggle.classList.remove("open");
        
        // If closing and changes were made, reload quotes
        if (wasOpen && typeFilterChanged) {
          // Log current checkbox states
          const checkedTypes = Array.from(typeCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.id);
          console.log("Reloading with types:", checkedTypes);
          
          currentPage = 1;
          loadQuotes();
          loadTotalCount();
          typeFilterChanged = false;
        }
      }
    });

    // Select All button functionality
    if (typeSelectAllBtn) {
      typeSelectAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Query checkboxes dynamically (they're populated after page load)
        const checkboxes = document.querySelectorAll('.type-filter-option input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = true;
        });
        typeFilterChanged = true;
      });
    }

    // Deselect All button functionality
    const typeDeselectAllBtn = document.getElementById("typeDeselectAllBtn");
    if (typeDeselectAllBtn) {
      typeDeselectAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Query checkboxes dynamically (they're populated after page load)
        const checkboxes = document.querySelectorAll('.type-filter-option input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
        typeFilterChanged = true;
      });
    }

    // Update when individual checkboxes change (handled in populateTypeFilterCheckboxes)
  }
  
  // Training Type Filter Dropdown
  const trainingTypeFilterToggle = document.getElementById("trainingTypeFilterToggle");
  const trainingTypeFilterDropdown = document.getElementById("trainingTypeFilterDropdown");
  if (trainingTypeFilterToggle && trainingTypeFilterDropdown) {
    trainingTypeFilterToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      trainingTypeFilterDropdown.classList.toggle("show");
      trainingTypeFilterToggle.classList.toggle("open");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#trainingTypesFilterContainer")) {
        trainingTypeFilterDropdown.classList.remove("show");
        trainingTypeFilterToggle.classList.remove("open");
      }
    });

    // Select All button for training types
    const trainingTypeSelectAllBtn = document.getElementById("trainingTypeSelectAllBtn");
    if (trainingTypeSelectAllBtn) {
      trainingTypeSelectAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const checkboxes = document.querySelectorAll('.training-type-filter-options input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = true;
        });
        loadQuotes();
      });
    }

    // Deselect All button for training types
    const trainingTypeDeselectAllBtn = document.getElementById("trainingTypeDeselectAllBtn");
    if (trainingTypeDeselectAllBtn) {
      trainingTypeDeselectAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const checkboxes = document.querySelectorAll('.training-type-filter-options input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
        loadQuotes();
      });
    }
  }
  
  // Training date filters
  const trainingYearFilter = document.getElementById('trainingYearFilter');
  const trainingMonthFilter = document.getElementById('trainingMonthFilter');
  
  if (trainingYearFilter) {
    // Populate years when switching to training view
    trainingYearFilter.addEventListener('focus', async () => {
      if (trainingYearFilter.options.length === 1) {
        await populateTrainingYears();
      }
    });
    
    trainingYearFilter.addEventListener('change', () => {
      // Enable/disable month filter based on year selection
      if (trainingMonthFilter) {
        if (trainingYearFilter.value) {
          trainingMonthFilter.disabled = false;
        } else {
          trainingMonthFilter.disabled = true;
          trainingMonthFilter.value = '';
        }
      }
      loadQuotes();
      loadTotalCount();
    });
  }
  
  if (trainingMonthFilter) {
    trainingMonthFilter.addEventListener('change', () => {
      loadQuotes();
      loadTotalCount();
    });
  }
  
  // Date picker sync - when date picker changes, update text input
  const noteDatePicker = document.getElementById("noteDatePicker");
  const noteDateText = document.getElementById("noteDate");
  
  if (noteDatePicker && noteDateText) {
    noteDatePicker.addEventListener("change", () => {
      const pickerValue = noteDatePicker.value; // YYYY-MM-DD
      if (pickerValue) {
        const [year, month, day] = pickerValue.split('-');
        noteDateText.value = `${day}.${month}.${year}`; // Convert to dd.mm.yyyy
      }
    });
  }

  // Note: Modal can only be closed via Cancel button, X button, or Save button
  // This prevents accidental data loss from clicking outside the modal
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

// ============================================
// Note Type Functions
// ============================================

// MIGRATED: Now imported from noteTypes.js
// const NOTE_TYPES = {
//   quote: { icon: 'Q', label: 'Quote', color: '#3b82f6' },
//   note: { icon: 'N', label: 'Simple Note', color: '#10b981' },
//   training: { icon: 'T', label: 'Training', color: '#f59e0b' },
//   puzzle: { icon: 'P', label: 'Logical Puzzle', color: '#8b5cf6' }
// };

// MIGRATED: Wrapper using noteTypes.js
function updateAddButtonText() {
  updateAddButtonTextLib(currentNoteTypeFilter, updateSourcesFilterVisibility);
}

// MIGRATED: Wrapper using noteTypes.js
function updateSourcesFilterVisibility() {
  updateSourcesFilterVisibilityLib(currentNoteTypeFilter, populateTrainingYears);
}

// MIGRATED: Wrapper using noteTypes.js (with app-specific additions)
function updateFieldVisibility() {
  const noteType = document.getElementById('noteType').value;
  const isQuote = noteType === 'quote';
  
  // Use library function for standard field visibility
  updateModalFieldVisibility(noteType);
  
  // App-specific fields not in library
  const quoteSpecificFields = document.getElementById('quoteSpecificFields');
  const translationGroupContainer = document.getElementById('translationGroupContainer');
  
  if (quoteSpecificFields) {
    quoteSpecificFields.style.display = isQuote ? 'flex' : 'none';
  }
  
  if (translationGroupContainer) {
    translationGroupContainer.style.display = isQuote ? 'block' : 'none';
  }
  
  // Update labels using library
  updateModalLabels(noteType);
  
  // Update modal title based on type
  if (!editingQuoteId) {
    const typeInfo = getNoteTypeConfig(noteType);
    modalTitle.textContent = `Add New ${typeInfo.label}`;
  }
}

// MIGRATED: Now using library function directly
// function updateModalLabels is imported from noteTypes.js

function openAddModal() {
  // MIGRATED: Using library function
  const noteType = currentNoteTypeFilter || 'quote';
  
  // Collect all DOM elements needed by the modal renderer
  const elements = {
    modalTitle: modalTitle,
    form: quoteForm,
    quoteTextInput: document.getElementById("quoteText"),
    noteInput: noteInput,
    noteTypeSelect: document.getElementById("noteType"),
    authorInput: authorInput,
    sourceInput: document.getElementById("source"),
    sourceTypeSelect: document.getElementById("sourceType"),
    noteDateInput: document.getElementById("noteDate"),
    noteDatePicker: document.getElementById("noteDatePicker"),
    trainingTypeSelect: document.getElementById("trainingType"),
    translationGroupInput: document.getElementById("translationGroup"),
    scoreRadios: true, // Flag to indicate score radios exist
    metadataElement: document.getElementById("quoteMetadata"),
    deleteBtn: document.getElementById("deleteQuoteBtn"),
    quoteIdInput: document.getElementById("quoteId")
  };
  
  // Setup modal using library
  const state = setupAddModal(
    noteType, 
    currentNoteTypeFilter, 
    elements, 
    quillEditor,
    updateFieldVisibility,
    updateModalLabels
  );
  
  // Update app state
  editingQuoteId = state.editingQuoteId;
  currentQuoteImage = state.currentQuoteImage;
  currentQuoteImageFull = state.currentQuoteImageFull;
  currentAttachmentType = state.currentAttachmentType || "image";
  currentAttachmentFileName = state.currentAttachmentFileName || "";
  
  // Clear image preview (app-specific)
  clearImagePreview(quoteImagePreview, "quote");
  
  // Clear selected tags (app-specific)
  selectedTagsArray = [];
  updateSelectedTagsDisplay();
  
  // Reset image section (app-specific)
  const imageSection = document.getElementById('imageSection');
  const toggleIcon = document.getElementById('imageToggleIcon');
  if (imageSection) imageSection.style.display = 'none';
  if (toggleIcon) toggleIcon.textContent = '▶';
  
  // Update image indicator (app-specific)
  updateImageIndicator();
  
  // Show modal
  quoteModal.style.display = "block";
}

function openEditModal(quote) {
  // MIGRATED: Using library function
  
  // Collect all DOM elements needed by the modal renderer
  const elements = {
    modalTitle: modalTitle,
    form: quoteForm,
    quoteTextInput: document.getElementById("quoteText"),
    noteInput: noteInput,
    noteTypeSelect: document.getElementById("noteType"),
    authorInput: authorInput,
    sourceInput: document.getElementById("source"),
    sourceTypeSelect: document.getElementById("sourceType"),
    noteDateInput: document.getElementById("noteDate"),
    noteDatePicker: document.getElementById("noteDatePicker"),
    trainingTypeSelect: document.getElementById("trainingType"),
    translationGroupInput: document.getElementById("translationGroup"),
    scoreRadios: true, // Flag to indicate score radios exist
    metadataElement: document.getElementById("quoteMetadata"),
    deleteBtn: document.getElementById("deleteQuoteBtn"),
    quoteIdInput: document.getElementById("quoteId")
  };
  
  // Setup modal using library
  const state = setupEditModal(
    quote,
    elements,
    quillEditor,
    updateFieldVisibility,
    updateModalLabels,
    populateTagsForEdit
  );
  
  // Update app state
  editingQuoteId = state.editingQuoteId;
  currentQuoteImage = state.currentQuoteImage;
  currentQuoteImageFull = state.currentQuoteImageFull;
  currentAttachmentType = state.currentAttachmentType || "image";
  currentAttachmentFileName = state.currentAttachmentFileName || "";
  window.currentSourceId = state.currentSourceId;
  
  // Display attachment preview (app-specific)
  if (currentQuoteImage || currentQuoteImageFull) {
    // Check if it's an icon thumbnail (non-image attachment)
    if (currentAttachmentType !== 'image') {
      // Show icon preview for PDFs, docs, etc.
      const icon = getAttachmentIcon(currentAttachmentType);
      displayAttachmentPreview(quoteImagePreview, icon, "Attachment", "");
    } else if (currentQuoteImage) {
      displayImage(quoteImagePreview, currentQuoteImage);
    }
  } else {
    clearImagePreview(quoteImagePreview, "quote");
  }
  
  // Reset image section (app-specific)
  const imageSection = document.getElementById('imageSection');
  const toggleIcon = document.getElementById('imageToggleIcon');
  if (imageSection) imageSection.style.display = 'none';
  if (toggleIcon) toggleIcon.textContent = '▶';
  
  // Update image indicator (app-specific)
  updateImageIndicator();
  
  // Show modal
  quoteModal.style.display = "block";
}

function closeQuoteModal() {
  quoteModal.style.display = "none";
  quoteForm.reset();
  editingQuoteId = null;
  currentQuoteImage = "";
  currentQuoteImageFull = "";
  currentAttachmentType = "image";
  currentAttachmentFileName = "";
  clearImagePreview(quoteImagePreview, "quote");
  authorSuggestions.classList.remove("show");
  sourceSuggestions.classList.remove("show");
}

function clearFilters() {
  searchQuote.value = "";
  searchAuthor.value = "";
  searchSource.value = "";
  searchTags.value = "";
  searchScore.value = "";
  
  // Reset training date filters
  const trainingYearFilter = document.getElementById('trainingYearFilter');
  const trainingMonthFilter = document.getElementById('trainingMonthFilter');
  if (trainingYearFilter) {
    trainingYearFilter.value = "";
  }
  if (trainingMonthFilter) {
    trainingMonthFilter.value = "";
    trainingMonthFilter.disabled = true;
  }
  
  currentPage = 1;
  loadQuotes();
}

// API Functions
// MIGRATED: fetchWithRetry is now imported from api.js
// async function fetchWithRetry(url, options = {}, maxRetries = 3, delayMs = 500) {...}

// Helper function to add refresh animation
function addRefreshAnimation(buttonId, asyncFunction) {
  return async function() {
    const button = document.getElementById(buttonId);
    if (button) {
      button.classList.add('refreshing');
    }
    
    try {
      await asyncFunction();
    } finally {
      if (button) {
        setTimeout(() => {
          button.classList.remove('refreshing');
        }, 500); // Keep green for 500ms after completion
      }
    }
  };
}

// MIGRATED: Wrapper for displayManager library
// MIGRATED: Wrapper for displayManager library
async function loadQuotes() {
  const currentSettings = getGlobalSettings();
  const quotes = await loadQuotesLib(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, currentSettings);
  currentQuotesData = getCurrentQuotesData(); // Sync for PDF export
  
  // Display quotes using app wrapper (which adds click handlers)
  displayQuotes(quotes);
}

// MIGRATED: Wrapper for displayManager library (maintains pagination state)
async function loadTotalCount() {
  await loadTotalCountLib(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
  
  // Sync local state for pagination
  const filteredCountElement = document.getElementById("filteredQuotesCount");
  if (filteredCountElement) {
    filteredQuotes = parseInt(filteredCountElement.textContent) || 0;
  }
  const totalCountElement = document.getElementById("totalQuotesCount");
  if (totalCountElement) {
    totalQuotes = parseInt(totalCountElement.textContent) || 0;
  }
  
  updatePaginationControls();
}

async function handleSubmit(e) {
  e.preventDefault();

  const noteType = document.getElementById("noteType").value;
  
  // Parse note_date from dd.mm.yyyy format to YYYY-MM-DD for training notes
  let parsedNoteDate = null;
  if (noteType === 'training') {
    const noteDateInput = document.getElementById("noteDate").value;
    if (noteDateInput) {
      // Parse dd.mm.yyyy format
      const match = noteDateInput.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (match) {
        const [_, day, month, year] = match;
        parsedNoteDate = `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
      }
    }
  }
  
  const quoteData = {
    quote: document.getElementById("quoteText").value,
    author: document.getElementById("author").value,
    source: document.getElementById("source").value,
    sourceType: noteType === 'training' ? document.getElementById("trainingType").value || "ASSORTED" : (document.getElementById("sourceType").value || "ASSORTED"),
    sourceId: window.currentSourceId || null,
    tags: document.getElementById("tags").value,
    note: noteInput.value,
    score: document.querySelector('input[name="quoteScore"]:checked')?.value || "0",
    image: currentQuoteImage,
    image_full: currentQuoteImageFull,
    attachment_type: currentAttachmentType,
    note_type: noteType,
    note_date: parsedNoteDate,
    translation_group: document.getElementById("translationGroup").value.trim() || null,
    storageThresholdMB: globalSettings?.externalStorageThreshold || 1,
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

// ============================================
// Translation Functions
// ============================================

// ============================================
// Translation Group Functions
// ============================================

async function showTranslationGroup(groupName) {
  // Filter quotes to show only those in this translation group
  try {
    const response = await fetch(`${API_URL}/quotes?translation_group=${encodeURIComponent(groupName)}&limit=100`);
    const quotes = await response.json();
    
    // Display the quotes
    displayQuotes(quotes);
    
    // Show info message
    quoteCount.textContent = `(${quotes.length} in group "${groupName}")`;
    
    // Optionally scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading translation group:', error);
    alert('Failed to load translation group');
  }
}
// Make global for onclick handlers
window.showTranslationGroup = showTranslationGroup;

// Display Functions
// MIGRATED: Wrapper that calls library then applies app-specific post-processing
function displayQuotes(quotes) {
  quoteCount.textContent = `(${quotes.length})`;

  if (quotes.length === 0) {
    quotesList.innerHTML =
      '<div class="no-quotes">No quotes found. Add your first quote!</div>';
    return;
  }

  // Get current settings from settingsManager
  const currentSettings = getGlobalSettings();
  
  // Use library for basic rendering (pass globalSettings for score display)
  displayQuotesLib(quotes, currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, currentSettings);

  // Apply app-specific settings and post-processing
  const realSizeEnabled = currentSettings?.displayQuotesByRealSize === true;
  applyQuoteSizingMode(realSizeEnabled);

  const imageLongEnabled = globalSettings?.displayImageQuotesLong === true;
  if (imageLongEnabled) {
    document.querySelectorAll('.quote-card.has-image').forEach((card) => {
      card.classList.add('expanded-card');
    });
  }

  const expandLongEnabled = globalSettings?.showLongQuotesExpanded === true;
  if (expandLongEnabled) {
    document.querySelectorAll('.quote-text.collapsible').forEach((quoteText) => {
      const numericId = quoteText.id.replace('quote-', '');
      const btnId = `expand-${numericId}`;
      const btnEl = document.getElementById(btnId);
      
      if (btnEl) {
        quoteText.classList.remove('collapsible');
        quoteText.dataset.expanded = "true";
        btnEl.innerHTML = "▲ Show less";
      }
    });
  }

  // Add click handlers to quote cards (open edit modal)
  document.querySelectorAll(".quote-card").forEach((card) => {
    let longPressTimer;
    let longPressTriggered = false;
    let clickTimer;
    let clickCount = 0;
    
    // Desktop: double-click to expand card
    card.addEventListener("dblclick", (e) => {
      e.preventDefault();
      clearTimeout(clickTimer);
      clickCount = 0;
      toggleCardExpand(card);
    });
    
    // Tablet/Mobile: long press to expand card
    card.addEventListener("touchstart", (e) => {
      longPressTriggered = false;
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        toggleCardExpand(card);
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, 700); // 700ms long press
    }, { passive: true });
    
    card.addEventListener("touchend", () => {
      clearTimeout(longPressTimer);
    });
    
    card.addEventListener("touchmove", () => {
      clearTimeout(longPressTimer);
    });
    
    card.addEventListener("click", (e) => {
      // Don't open modal if long press was triggered (tablet)
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }
      
      // Don't open modal if clicking on interactive elements
      if (e.target.closest('.author-link') || 
          e.target.closest('.source-link') || 
          e.target.closest('.expand-btn') ||
          e.target.closest('.quote-image-thumb')) {
        return;
      }
      
      // Detect double-click on desktop - delay single click
      clickCount++;
      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          // Single click - open modal
          clickCount = 0;
          const quoteId = card.dataset.quoteId;
          const quote = quotes.find((q) => q.id == quoteId);
          if (quote) {
            openEditModal(quote);
          }
        }, 250); // Wait 250ms to see if double-click happens
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

// ============= CARD RENDERING =============
// MIGRATED: Using library function - pass context as parameters
function createQuoteCard(quote) {
  return createQuoteCardLib(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings);
}

// Store full quotes for expand/collapse
window.fullQuotes = {};

// Toggle card expand to full width
function toggleCardExpand(card) {
  card.classList.toggle('expanded-card');
}

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
      // Collapse - use CSS to hide overflow
      quoteEl.classList.add('collapsible');
      quoteEl.dataset.expanded = "false";
      btnEl.innerHTML = "▼ Show more";
    } else {
      // Expand - remove height restriction
      quoteEl.classList.remove('collapsible');
      quoteEl.dataset.expanded = "true";
      btnEl.innerHTML = "▲ Show less";
    }
  }
}
// Make global for onclick handlers
window.toggleQuoteExpand = toggleQuoteExpand;

// Download attachment (for non-image files like Excel, Word, PDF, etc.)
window.downloadAttachment = function(dataUrl, filename, quoteId = null) {
  try {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    alert('Failed to download attachment. Please try again.');
  }
};

// Show full-size image in modal (make it global for onclick)
window.showFullImage = function (imageSrc, quoteId = null, attachmentType = 'image') {
  // Handle file references from external storage
  let actualSrc = imageSrc;
  let isExternalFile = false;
  let filePath = null;
  let mimeType = 'image/jpeg';
  
  if (imageSrc && imageSrc.startsWith('file:')) {
    isExternalFile = true;
    // Parse: "file:quotes/123.jpg:image/jpeg" -> "/attachments/quotes/123.jpg"
    const parts = imageSrc.split(':');
    filePath = parts[1]; // "quotes/123_full.jpg"
    mimeType = parts[2] || 'image/jpeg';
    actualSrc = `/attachments/${filePath}`;
  }
  
  // For PDFs, show PDF viewer
  if (attachmentType === 'pdf' || mimeType === 'application/pdf') {
    showPDFViewer(actualSrc, filePath);
    return;
  }
  
  // For videos, show video player
  if (attachmentType === 'video' || mimeType.startsWith('video/')) {
    showVideoPlayer(actualSrc, filePath);
    return;
  }
  
  // For audio, show audio player
  if (attachmentType === 'audio' || mimeType.startsWith('audio/')) {
    showAudioPlayer(actualSrc, filePath);
    return;
  }
  
  // For other file types (documents, Excel, etc.), open in new tab
  // The browser will either display it or prompt to download/open with app
  if (attachmentType === 'document' || attachmentType === 'other') {
    // Extract MIME type from data URL to determine file extension
    let extension = 'bin';
    let filename = 'attachment';
    
    if (actualSrc.startsWith('data:')) {
      const mimeMatch = actualSrc.match(/^data:([^;]+);/);
      if (mimeMatch) {
        const mime = mimeMatch[1];
        // Map MIME types to extensions
        const mimeToExt = {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
          'application/vnd.ms-excel': 'xls',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          'application/msword': 'doc',
          'application/vnd.oasis.opendocument.spreadsheet': 'ods',
          'application/vnd.oasis.opendocument.text': 'odt',
          'text/csv': 'csv',
          'text/plain': 'txt',
          'application/zip': 'zip',
          'application/x-zip-compressed': 'zip',
        };
        extension = mimeToExt[mime] || 'bin';
        
        // Create a descriptive filename based on extension
        const typeNames = {
          'xlsx': 'spreadsheet',
          'xls': 'spreadsheet',
          'docx': 'document',
          'doc': 'document',
          'ods': 'spreadsheet',
          'odt': 'document',
          'csv': 'data',
          'txt': 'text',
          'zip': 'archive'
        };
        filename = `${typeNames[extension] || 'attachment'}.${extension}`;
      }
    }
    
    const link = document.createElement('a');
    link.href = actualSrc;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }
  
  // Default: Image viewer
  const modal = document.createElement("div");
  modal.className = "image-modal";
  
  // Add downscale button if it's an external image file
  const downscaleButton = isExternalFile && quoteId && attachmentType === 'image' ? `
    <button id="downscaleImageBtn" class="btn btn-primary" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 10001; padding: 0.75rem 1.5rem; font-size: 1rem;">
      📦 Downscale to 1024px & Move to DB
    </button>
  ` : '';
  
  modal.innerHTML = `
        <div class="image-modal-content">
            <span class="image-modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <img src="${actualSrc}" alt="Full size image">
            ${downscaleButton}
        </div>
    `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
  
  // Setup downscale button handler
  if (isExternalFile && quoteId && attachmentType === 'image') {
    const btn = document.getElementById('downscaleImageBtn');
    if (btn) {
      btn.onclick = async (e) => {
        e.stopPropagation();
        await downscaleAndMoveToDb(quoteId, actualSrc, filePath, modal);
      };
    }
  }
};

// Show PDF viewer
function showPDFViewer(pdfSrc, filePath) {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  
  const filename = filePath ? filePath.split('/').pop() : 'document.pdf';
  
  modal.innerHTML = `
    <div class="image-modal-content" style="max-width: 90vw; max-height: 90vh; width: auto; height: auto;">
      <div style="background: #333; padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
        <span style="color: white; font-weight: 500;">📄 ${escapeHtml(filename)}</span>
        <span class="image-modal-close" onclick="this.parentElement.parentElement.parentElement.remove()" style="position: static; color: white; font-size: 2rem; cursor: pointer;">&times;</span>
      </div>
      <div style="background: white; padding: 0; height: 80vh; border-radius: 0 0 8px 8px;">
        <embed src="${pdfSrc}" type="application/pdf" width="100%" height="100%" style="border: none; border-radius: 0 0 8px 8px;" />
      </div>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.appendChild(modal);
}

// Show video player
function showVideoPlayer(videoSrc, filePath) {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  
  const filename = filePath ? filePath.split('/').pop() : 'video';
  
  modal.innerHTML = `
    <div class="image-modal-content">
      <div style="background: #333; padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
        <span style="color: white; font-weight: 500;">🎬 ${escapeHtml(filename)}</span>
        <span class="image-modal-close" onclick="this.parentElement.parentElement.parentElement.remove()" style="position: static; color: white; font-size: 2rem; cursor: pointer;">&times;</span>
      </div>
      <video controls style="max-width: 90vw; max-height: 80vh; border-radius: 0 0 8px 8px;">
        <source src="${videoSrc}">
        Your browser does not support the video tag.
      </video>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.appendChild(modal);
}

// Show audio player
function showAudioPlayer(audioSrc, filePath) {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  
  const filename = filePath ? filePath.split('/').pop() : 'audio';
  
  modal.innerHTML = `
    <div class="image-modal-content" style="max-width: 500px;">
      <div style="background: #333; padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
        <span style="color: white; font-weight: 500;">🎵 ${escapeHtml(filename)}</span>
        <span class="image-modal-close" onclick="this.parentElement.parentElement.parentElement.remove()" style="position: static; color: white; font-size: 2rem; cursor: pointer;">&times;</span>
      </div>
      <div style="background: #f9f9f9; padding: 2rem; border-radius: 0 0 8px 8px;">
        <audio controls style="width: 100%;">
          <source src="${audioSrc}">
          Your browser does not support the audio tag.
        </audio>
      </div>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.appendChild(modal);
}

async function downscaleAndMoveToDb(quoteId, imageUrl, filePath, modal) {
  const btn = document.getElementById('downscaleImageBtn');
  if (!btn) return;
  
  try {
    // Update button state
    btn.disabled = true;
    btn.textContent = '⏳ Processing...';
    
    // Load the image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    // Resize to 1024px (longest side)
    const resized1024 = resizeImage(img, 1024);
    const thumbnail240 = resizeImage(img, 240);
    
    console.log(`📦 Downscaling external image: ${filePath}`);
    console.log(`   Original: ${img.width}x${img.height}`);
    console.log(`   New: max 1024px, size: ${(resized1024.length / 1024).toFixed(0)} KB`);
    
    // Send to server
    const response = await fetch(`${API_URL}/quotes/${quoteId}/downscale-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: thumbnail240,
        image_full: resized1024,
        oldFilePath: filePath
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to downscale image');
    }
    
    // Success!
    btn.textContent = '✅ Moved to DB!';
    btn.style.background = '#10b981';
    
    // Close modal after 1 second
    setTimeout(() => {
      modal.remove();
      // Reload quotes to show updated image
      if (typeof loadQuotes === 'function') {
        loadQuotes();
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error downscaling image:', error);
    btn.disabled = false;
    btn.textContent = '❌ Error - Try Again';
    btn.style.background = '#ef4444';
  }
}

// MIGRATED: Now imported from utils.js
// function escapeHtml(text) {
//   const div = document.createElement("div");
//   div.textContent = text;
//   return div.innerHTML;
// }

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

// Note: Modals can only be closed via their Cancel/X/Save buttons
// This prevents accidental data loss from clicking outside the modals
// (Rename modal still allows click-outside-to-close as it's a quick action)

// Open Author Modal
async function openAuthorModal(authorId, authorName, quoteCount = null) {
  return openAuthorModalLib(authorId, authorName, quoteCount);
}
// Make global for onclick handlers
window.openAuthorModal = openAuthorModal;

// Open Source Modal
async function openSourceModal(
  sourceId,
  sourceName,
  sourceType,
  quoteCount = null,
) {
  return openSourceModalLib(sourceId, sourceName, sourceType, quoteCount);
}
// Make global for onclick handlers
window.openSourceModal = openSourceModal;

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
    description: document.getElementById('authorDescription').value || '',
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
// Read attachment file (images, PDFs, documents, etc.)
function readAttachmentFile(file, type) {
  if (type !== "quote") {
    // For author/source, only images allowed
    readImageFile(file, type);
    return;
  }
  
  // Determine attachment type
  const mimeType = file.type;
  let attachmentType = "document"; // default
  
  if (mimeType.startsWith("image/")) {
    attachmentType = "image";
  } else if (mimeType === "application/pdf") {
    attachmentType = "pdf";
  } else if (mimeType.startsWith("video/")) {
    attachmentType = "video";
  } else if (mimeType.startsWith("audio/")) {
    attachmentType = "audio";
  }
  
  currentAttachmentType = attachmentType;
  currentAttachmentFileName = file.name;
  
  console.log(`📎 Reading ${attachmentType} file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  
  // Handle images differently - downscale if needed
  if (attachmentType === "image") {
    readImageFile(file, type);
    return;
  }
  
  // For non-images (PDF, docs, videos), read as-is
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64Data = e.target.result;
    
    // Store full file
    currentQuoteImageFull = base64Data;
    
    // Create icon/preview for thumbnail
    const icon = getAttachmentIcon(attachmentType);
    const sizeText = formatFileSize(base64Data.length);
    
    currentQuoteImage = createIconThumbnail(icon, file.name, sizeText);
    
    // Display preview
    displayAttachmentPreview(quoteImagePreview, icon, file.name, sizeText);
    updateImageIndicator();
    
    console.log(`✅ Loaded ${attachmentType}: ${file.name}, Size: ${sizeText}`);
  };
  
  reader.readAsDataURL(file);
}

// MIGRATED: Now imported from utils.js
// Get icon for attachment type
// function getAttachmentIcon(type) {
//   const icons = {
//     pdf: "📄",
//     document: "📝",
//     video: "🎬",
//     audio: "🎵",
//     image: "🖼️"
//   };
//   return icons[type] || "📎";
// }

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// Create icon thumbnail (base64 icon for cards)
function createIconThumbnail(icon, filename, size) {
  // Create a small canvas with icon
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  
  // Background
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, 240, 240);
  
  // Icon
  ctx.font = "80px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, 120, 100);
  
  // Filename (truncated)
  ctx.font = "14px Arial";
  ctx.fillStyle = "#333";
  const truncated = filename.length > 20 ? filename.substring(0, 17) + "..." : filename;
  ctx.fillText(truncated, 120, 160);
  
  // Size
  ctx.font = "12px Arial";
  ctx.fillStyle = "#666";
  ctx.fillText(size, 120, 180);
  
  return canvas.toDataURL("image/png");
}

// Display attachment preview
// MIGRATED: displayAttachmentPreview is now imported from attachments.js
// function displayAttachmentPreview(container, icon, filename, size) {...}

function readImageFile(file, type) {
  if (!file.type.match("image.*")) {
    alert("Please select an image file");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // For quote images, check if downscaling is enabled
      if (type === "quote") {
        // Check setting from globalSettings (default: true/checked = downscale)
        const shouldDownscale = globalSettings?.downscaleQuoteImages !== false;
        
        if (shouldDownscale) {
          // DOWNSCALING ON: Resize to save space
          // Store full-size limited to 1024px (saves DB space!)
          const fullSize = resizeImage(img, 1024);
          currentQuoteImageFull = fullSize;

          // Create thumbnail for display (240px)
          const thumbnail = resizeImage(img, 240);
          currentQuoteImage = thumbnail;
          
          console.log(`✅ DOWNSCALING ON: Full=${(fullSize.length/1024).toFixed(0)}KB, Thumb=${(thumbnail.length/1024).toFixed(0)}KB`);
        } else {
          // DOWNSCALING OFF: Store raw images at full size
          // Store original/raw image (may trigger external storage if > 2 MB)
          currentQuoteImageFull = e.target.result;
          
          // Still create thumbnail for cards (240px) - keeps cards small!
          const thumbnail = resizeImage(img, 240);
          currentQuoteImage = thumbnail;
          
          console.log(`✅ DOWNSCALING OFF: Full=${(e.target.result.length/1024/1024).toFixed(2)}MB, Thumb=${(thumbnail.length/1024).toFixed(0)}KB`);
        }
        
        displayImage(quoteImagePreview, currentQuoteImage);
        updateImageIndicator();
      } else {
        // For author/source, always resize to 300px
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
// MIGRATED: Now imported from utils.js
/**
 * Convert file storage reference to URL
 * Handles both base64 and file: references
 */
// function resolveAttachmentUrl(attachment) {
//   if (!attachment) return null;
//   
//   // If it's already a base64 data URL, return as-is
//   if (attachment.startsWith('data:')) {
//     return attachment;
//   }
//   
//   // If it's a file reference (e.g., "file:quotes/360_full.png:image/png")
//   if (attachment.startsWith('file:')) {
//     const parts = attachment.split(':');
//     if (parts.length >= 2) {
//       const path = parts[1]; // e.g., "quotes/360_full.png"
//       return `/attachments/${path}`;
//     }
//   }
//   
//   // Unknown format - return as-is
//   return attachment;
// }

// Note: Using local implementations as they have app-specific state management
// The library versions in attachments.js are too generic
function displayImage(container, base64Image) {
  const imageUrl = resolveAttachmentUrl(base64Image);
  if (imageUrl) {
    container.innerHTML = `<img src="${imageUrl}" alt="Preview">`;
    container.classList.add("has-image");
  }
}

// Clear Image Preview
function clearImagePreview(container, type) {
  const icon = type === "author" ? "📷" : type === "source" ? "📚" : "📎";
  const placeholder = type === "quote" ? "Paste image (Ctrl+V) or click to upload file" : "Paste image (Ctrl+V) or click to upload";

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
                <p>${placeholder}</p>
            </div>
        `;
  }
  container.classList.remove("has-image");
}

function displayAttachmentPreview(container, icon, filename, size) {
  const truncated = filename.length > 30 ? filename.substring(0, 27) + "..." : filename;
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 1rem; background: #f9f9f9;">
      <div style="font-size: 60px; margin-bottom: 0.5rem;">${icon}</div>
      <div style="font-size: 14px; font-weight: 500; text-align: center; margin-bottom: 0.25rem;">${escapeHtml(truncated)}</div>
      <div style="font-size: 12px; color: #666;">${size}</div>
    </div>
  `;
  container.classList.add("has-image");
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
  // Preview section removed - no longer needed
  
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

// Preview function removed - no longer needed as direct import works great!

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
    readAttachmentFile(file, "quote");
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
  currentAttachmentType = "image";
  currentAttachmentFileName = "";
  clearImagePreview(quoteImagePreview, "quote");
  quoteImageFile.value = "";
  updateImageIndicator();
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
      
      // Reset note type filter when clicking "All Notes"
      if (view === "quotes") {
        currentNoteTypeFilter = null;
        // Remove active state from all note type filters
        document.querySelectorAll('.note-type-filter').forEach(btn => btn.classList.remove('active'));
        // Update button text
        updateAddButtonText();
        
        // Save view and update URL
        saveCurrentView();
        updateUrlHash();
        
        // Update UI
        updateAddButtonText();
        updateMainTitle();
        updateSourcesFilterVisibility();
      }
      
      switchView(view);

      // Update active state only for view navigation items
      menuItems.forEach((mi) => mi.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchView(view) {
  // Get all view elements
  const menuView = document.getElementById("menuView");
  const quotesView = document.getElementById("quotesView");
  const authorsView = document.getElementById("authorsView");
  const sourcesView = document.getElementById("sourcesView");
  const tagsView = document.getElementById("tagsView");
  const settingsView = document.getElementById("settingsView");

  // Hide all views
  if (menuView) menuView.style.display = "none";
  if (quotesView) quotesView.style.display = "none";
  if (authorsView) authorsView.style.display = "none";
  if (sourcesView) sourcesView.style.display = "none";
  if (tagsView) tagsView.style.display = "none";
  if (settingsView) settingsView.style.display = "none";

  // Show selected view and load data
  if (view === "menu" && menuView) {
    menuView.style.display = "block";
  } else if (view === "quotes" && quotesView) {
    quotesView.style.display = "block";
    loadQuotes();
    loadTotalCount();
    // Check if Metadata Search should be shown from globalSettings
    const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
    toggleMetadataSearchSection(metaSearchEnabled);
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
    const filterPoetry = document.getElementById("filterPoetry");
    const filterLyrics = document.getElementById("filterLyrics");
    const filterJokes = document.getElementById("filterJokes");

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
    if (filterPoetry && !filterPoetry.hasAttribute("data-listener")) {
      filterPoetry.addEventListener("change", loadSources);
      filterPoetry.setAttribute("data-listener", "true");
    }
    if (filterLyrics && !filterLyrics.hasAttribute("data-listener")) {
      filterLyrics.addEventListener("change", loadSources);
      filterLyrics.setAttribute("data-listener", "true");
    }
    if (filterJokes && !filterJokes.hasAttribute("data-listener")) {
      filterJokes.addEventListener("change", loadSources);
      filterJokes.setAttribute("data-listener", "true");
    }
  } else if (view === "tags" && tagsView) {
    tagsView.style.display = "block";
    loadTags();
    // Check if Tag Operations should be shown from globalSettings
    const tagOpsEnabled = globalSettings?.enableTagOperations !== false;
    toggleTagOperationsPanel(tagOpsEnabled);
  } else if (view === "settings" && settingsView) {
    settingsView.style.display = "block";
    // Re-render type lists to ensure they show current settings (using settingsManager library)
    renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes);
    renderTrainingTypesList(populateTrainingTypeFilterCheckboxes);
    // Setup event listeners for add buttons
    setupTypeManagementListeners(populateTypeDropdowns, populateTypeFilterCheckboxes, populateTrainingTypeFilterCheckboxes);
  }
}

async function loadAuthors() {
  try {
    const response = await fetch(`${API_URL}/authors`);
    let authors = await response.json();
    
    // Store total count
    const totalCount = authors.length;

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
    
    // Store filtered count
    const filteredCount = authors.length;

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
    
    // Update counters
    const totalCountElement = document.getElementById("totalAuthorsCount");
    const filteredCountElement = document.getElementById("filteredAuthorsCount");
    if (totalCountElement) {
      totalCountElement.textContent = totalCount;
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = filteredCount;
    }
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
    const filterMovie = document.getElementById("filterMovie")?.checked !== false;
    const filterPoetry = document.getElementById("filterPoetry")?.checked !== false;
    const filterLyrics = document.getElementById("filterLyrics")?.checked !== false;
    const filterJokes = document.getElementById("filterJokes")?.checked !== false;

    const response = await fetch(`${API_URL}/sources`);
    let sources = await response.json();
    
    // Store total count
    const totalCount = sources.length;

    // Filter by type if filters exist AND at least one is unchecked
    if (document.getElementById("filterBook")) {
      // Only apply filter if not all are checked (i.e., user is actually filtering)
      if (!filterBook || !filterMovie || !filterPoetry || !filterLyrics || !filterJokes) {
        sources = sources.filter((source) => {
          if (!source.type) return filterBook; // Default to BOOK if no type
          if (source.type === "BOOK") return filterBook;
          if (source.type === "MOVIE-TV") return filterMovie;
          if (source.type === "POETRY") return filterPoetry;
          if (source.type === "LYRICS") return filterLyrics;
          if (source.type === "JOKES") return filterJokes;
          if (source.type === "ASSORTED") return true; // Always show ASSORTED
          return false;
        });
      }
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
    
    // Store filtered count
    const filteredCount = sources.length;

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
    
    // Update counters
    const totalCountElement = document.getElementById("totalSourcesCount");
    const filteredCountElement = document.getElementById("filteredSourcesCount");
    if (totalCountElement) {
      totalCountElement.textContent = totalCount;
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = filteredCount;
    }
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
        source.type === "MOVIE-TV" ? "🎬" :
        source.type === "ASSORTED" ? "📝" :
        source.type === "POETRY" ? "📜" :
        source.type === "LYRICS" ? "🎵" :
        source.type === "JOKES" ? "😂" :
        "📖";
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

// ============= TAGS PAGE - MIGRATED TO tagsManager.js =============
async function loadTags() {
  return loadTagsLib();
}

function filterByTag(tagName) {
  return filterByTagLib(tagName);
}
// Make global for onclick handlers
window.filterByTag = filterByTag;

async function deleteTag(id, name) {
  return deleteTagLib(id, name);
}
// Make global for onclick handlers
window.deleteTag = deleteTag;

// filterByAuthor and filterBySource stay here (not part of tags module)
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
// Make global for onclick handlers
window.filterByAuthor = filterByAuthor;

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
// Make global for onclick handlers
window.filterBySource = filterBySource;

// ============= RENAME FUNCTIONALITY =============

let renameContext = {
  type: null, // 'tag', 'author', 'source'
  id: null,
  oldName: null
};

// deleteTag moved above (see TAGS PAGE section)

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

// ============= EXPORT TO PDF =============

async function exportToPdf() {
  // Gather search field values
  const searchFields = {
    quote: searchQuote.value,
    author: searchAuthor.value,
    source: searchSource.value,
    tags: searchTags.value,
    score: searchScore.value,
  };

  // Get selected quote types
  const selectedTypes = [];
  const typeCheckboxes = document.querySelectorAll('.type-filter-option input[type="checkbox"]');
  typeCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      selectedTypes.push(checkbox.dataset.type);
    }
  });

  // Get selected training types
  const selectedTrainingTypes = [];
  const trainingTypeCheckboxes = document.querySelectorAll('.training-type-filter-options input[type="checkbox"]');
  trainingTypeCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      selectedTrainingTypes.push(checkbox.dataset.type);
    }
  });

  // Call library function
  await exportToPdfLib({
    searchFields,
    currentNoteTypeFilter,
    selectedTypes,
    selectedTrainingTypes,
    exportBtn: document.getElementById("exportPdfBtn"),
    getQuoteTypes,
  });
}

// ============= JSON EXPORT/IMPORT =============

async function exportToJson() {
  await exportToJsonLib({
    currentNoteTypeFilter,
    exportBtn: document.getElementById("exportJsonBtn"),
  });
}

async function handleImportFile(event) {
  await handleImportFileLib(event, {
    importProgress: document.getElementById("importProgress"),
    importStatus: document.getElementById("importStatus"),
    selectFileBtn: document.getElementById("selectFileBtn"),
    replaceExistingCheckbox: document.getElementById("replaceExisting"),
    importModal: document.getElementById("importModal"),
    onImportComplete: () => {
      currentPage = 1;
      loadQuotes();
      loadTotalCount();
    },
  });
}

// Welcome Quote Feature
async function showWelcomeQuote(force = false) {
  try {
    // Only show automatically if not already shown in this session
    if (!force && sessionStorage.getItem('welcomeQuoteShown')) {
      return;
    }
    
    // Fetch a random quote
    const response = await fetch(`${API_URL}/quotes/random`);
    if (!response.ok) {
      console.log("No quotes available for welcome screen");
      return;
    }

    const quote = await response.json();
    
    // Get overlay elements
    const overlay = document.getElementById("welcomeQuoteOverlay");
    const container = overlay.querySelector(".welcome-quote-container");
    
    // Clear container and create quote card HTML
    container.innerHTML = "";
    const cardHTML = createQuoteCard(quote);
    container.innerHTML = cardHTML;
    
    // Get the card element and style it
    const card = container.querySelector(".quote-card");
    card.style.maxWidth = "800px";
    card.style.margin = "0 auto";
    
    // Add click handler to edit the quote
    card.addEventListener("click", () => {
      overlay.style.display = "none";
      openEditModal(quote);
    });
    
    // Show overlay
    overlay.style.display = "flex";
    
    // Mark as shown in this session (only for automatic display)
    if (!force) {
      sessionStorage.setItem('welcomeQuoteShown', 'true');
    }
    
    // Function to close overlay
    function closeOverlay(e) {
      // Don't close if clicking on the card itself
      if (e.target === overlay) {
        overlay.style.display = "none";
        overlay.removeEventListener("click", closeOverlay);
        document.removeEventListener("keydown", handleKeyPress);
      }
    }
    
    // Handle keyboard events
    function handleKeyPress(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        overlay.style.display = "none";
        overlay.removeEventListener("click", closeOverlay);
        document.removeEventListener("keydown", handleKeyPress);
      }
    }
    
    // Close on click outside
    overlay.addEventListener("click", closeOverlay);
    document.addEventListener("keydown", handleKeyPress);
    
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
    randomQuoteBtn.addEventListener("click", () => showWelcomeQuote(true));
  }
});

// Search tags functionality
let allTags = [];
let currentSortBy = "name";

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchSourcesInput");
  const sortByName = document.getElementById("sortTagsByName");
  const sortByCount = document.getElementById("sortTagsByCount");
  
  if (searchInput) {
    searchInput.addEventListener("input", filterTags);
  }
  
  if (sortByName) {
    sortByName.addEventListener("click", () => {
      currentSortBy = "name";
      sortByName.classList.add("active");
      sortByCount.classList.remove("active");
      filterTags();
    });
  }
  
  if (sortByCount) {
    sortByCount.addEventListener("click", () => {
      currentSortBy = "count";
      sortByCount.classList.add("active");
      sortByName.classList.remove("active");
      filterTags();
    });
  }
});

function filterTags() {
  const searchValue = document.getElementById("searchSourcesInput")?.value.toLowerCase() || "";
  
  let filteredTags = allTags.filter(tag => 
    tag.name.toLowerCase().includes(searchValue)
  );
  
  if (currentSortBy === "count") {
    filteredTags.sort((a, b) => b.quote_count - a.quote_count);
  } else {
    filteredTags.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Update counters
  const totalCountElement = document.getElementById("totalTagsCount");
  const filteredCountElement = document.getElementById("filteredTagsCount");
  if (totalCountElement) {
    totalCountElement.textContent = allTags.length;
  }
  if (filteredCountElement) {
    filteredCountElement.textContent = filteredTags.length;
  }
  
  displayTags(filteredTags);
}

// Tag Management for Quote Modal
let selectedTagsArray = [];

function initializeTagInput() {
  const tagInput = document.getElementById('tagInput');
  const addTagBtn = document.getElementById('addTagBtn');
  const tagInputSuggestions = document.getElementById('tagInputSuggestions');
  
  if (!tagInput || !addTagBtn) return;
  
  // Autocomplete for tag input - match ONLY existing tags
  tagInput.addEventListener('input', async (e) => {
    const search = e.target.value.trim();
    
    if (search.length < 1) {
      tagInputSuggestions.classList.remove('show');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/tags?search=${encodeURIComponent(search)}`);
      const tags = await response.json();
      
      if (!tags || tags.length === 0) {
        tagInputSuggestions.classList.remove('show');
        tagInputSuggestions.innerHTML = '';
        return;
      }
      
      // Show only exact tag matches (not partial matches from comma-separated strings)
      const exactMatches = tags.filter(tag => 
        tag.name && tag.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 10);
      
      if (exactMatches.length === 0) {
        tagInputSuggestions.classList.remove('show');
        return;
      }
      
      tagInputSuggestions.innerHTML = exactMatches
        .map(tag => `<div class="autocomplete-item" data-value="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</div>`)
        .join('');
      
      // Add click handlers
      tagInputSuggestions.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          tagInput.value = item.dataset.value;
          tagInputSuggestions.classList.remove('show');
          addTagFromInput();
        });
      });
      
      tagInputSuggestions.classList.add('show');
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  });
  
  // Add tag on button click
  addTagBtn.addEventListener('click', addTagFromInput);
  
  // Add tag on Enter key
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === 'Escape') {
      tagInputSuggestions.classList.remove('show');
    }
  });
  
  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tagInput') && !e.target.closest('#tagInputSuggestions')) {
      tagInputSuggestions.classList.remove('show');
    }
  });
}

function addTagFromInput() {
  const tagInput = document.getElementById('tagInput');
  const tagValue = tagInput.value.trim();
  
  if (!tagValue) return;
  
  // Check if tag already added
  if (selectedTagsArray.includes(tagValue)) {
    tagInput.value = '';
    return;
  }
  
  // Add to array
  selectedTagsArray.push(tagValue);
  
  // Update display
  updateSelectedTagsDisplay();
  
  // Update hidden input
  document.getElementById('tags').value = selectedTagsArray.join(',');
  
  // Clear input
  tagInput.value = '';
  document.getElementById('tagInputSuggestions').classList.remove('show');
}

function removeTag(tagName) {
  selectedTagsArray = selectedTagsArray.filter(t => t !== tagName);
  updateSelectedTagsDisplay();
  document.getElementById('tags').value = selectedTagsArray.join(',');
}
// Make global for onclick handlers
window.removeTag = removeTag;

function updateSelectedTagsDisplay() {
  const container = document.getElementById('selectedTags');
  if (!container) return;
  
  if (selectedTagsArray.length === 0) {
    container.innerHTML = '';
    // IMPORTANT: Also clear the hidden input field!
    document.getElementById('tags').value = '';
    return;
  }
  
  container.innerHTML = selectedTagsArray.map(tag => `
    <span class="tag-removable" style="background: var(--tag-color); color: white; padding: 0.35rem 0.6rem; border-radius: 12px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer;">
      ${escapeHtml(tag)}
      <span onclick="removeTag('${escapeHtml(tag).replace(/'/g, "\\'")}')" style="font-weight: bold; cursor: pointer;">&times;</span>
    </span>
  `).join('');
  
  // Update hidden input with current tags
  document.getElementById('tags').value = selectedTagsArray.join(',');
}

// Initialize tag input when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeTagInput();
});

// Update openAddModal to reset tags
const originalOpenAddModal = openAddModal;
openAddModal = function() {
  selectedTagsArray = [];
  updateSelectedTagsDisplay();
  originalOpenAddModal();
};

// Update openEditModal to populate tags
function populateTagsForEdit(tagsString) {
  if (!tagsString || !tagsString.trim()) {
    selectedTagsArray = [];
  } else {
    selectedTagsArray = tagsString.split(',').map(t => t.trim()).filter(t => t);
  }
  updateSelectedTagsDisplay();
  document.getElementById('tags').value = selectedTagsArray.join(',');
}

// Settings Management
// ============= SETTINGS INITIALIZATION - NOW IN settingsManager.js =============
// This large function (700+ lines) has been moved to settingsManager.js
// Keeping commented for reference during transition.


// Apply button color to CSS variables
// ============= COLOR MANAGEMENT FUNCTIONS - NOW IN settingsManager.js =============
// These functions have been moved to settingsManager.js
// Keeping commented for reference during transition.


// Toggle image section in quote modal
function toggleImageSection() {
  const imageSection = document.getElementById('imageSection');
  const toggleIcon = document.getElementById('imageToggleIcon');
  
  if (imageSection.style.display === 'none' || !imageSection.style.display) {
    imageSection.style.display = 'block';
    toggleIcon.textContent = '▼';
  } else {
    imageSection.style.display = 'none';
    toggleIcon.textContent = '▶';
  }
}
// Make global for onclick handlers
window.toggleImageSection = toggleImageSection;

// Update image indicator in modal
function updateImageIndicator() {
  const indicator = document.getElementById('imageIndicator');
  const hasAttachment = currentQuoteImage || currentQuoteImageFull;
  
  if (indicator) {
    if (hasAttachment) {
      // Show attachment type
      const typeLabel = currentAttachmentType === 'image' ? 'image' : currentAttachmentType.toUpperCase();
      indicator.textContent = `(has ${typeLabel})`;
      indicator.style.color = '#059669'; // green
    } else {
      indicator.textContent = '(no attachment)';
      indicator.style.color = 'var(--text-secondary)';
    }
  }
}

// ============= QUOTE TYPES MANAGEMENT - NOW IN settingsManager.js =============
// These functions have been moved to settingsManager.js
// Keeping commented for reference during transition.


// Initialize settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for settings to load first (this might already be done by the main DOMContentLoaded handler)
  if (!globalSettings) {
    await loadSettings();
    globalSettings = getGlobalSettings(); // Sync local reference
  }
  
  // Initialize settings UI (using settingsManager library)
  initializeSettingsLib({
    loadQuotes,
    populateTypeDropdowns,
    populateTypeFilterCheckboxes,
    populateTrainingTypeFilterCheckboxes
  });
  
  // Initialize quote types management UI (handled by initializeSettingsLib now)
  // renderQuoteTypesList();
  // renderTrainingTypesList();
  
  // Setup event listeners for add buttons (handled by initializeSettingsLib now)
  // setupTypeManagementListeners();
});

// Also check when switching to tags view
const originalSwitchView = window.switchView;
if (typeof switchView === 'function') {
  window.switchView = function(viewName) {
    originalSwitchView(viewName);
    if (viewName === 'tags') {
      const tagOpsEnabled = globalSettings?.enableTagOperations !== false;
      toggleTagOperationsPanel(tagOpsEnabled);
    }
  };
}

// Setup metadata search event listeners
function setupMetadataSearchListeners() {
  const metadataCheckboxes = [
    'searchHasAuthor', 'searchHasSource', 'searchHasNote', 
    'searchHasTags', 'searchHasImage'
  ];
  
  const metadataSelects = [
    'searchAuthorCondition', 'searchSourceCondition', 'searchNoteCondition',
    'searchTagsCondition', 'searchImageCondition'
  ];
  
  // Add listeners to checkboxes
  metadataCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox && !checkbox.hasAttribute('data-listener')) {
      checkbox.addEventListener('change', () => {
        currentPage = 1;
        loadQuotes();
      });
      checkbox.setAttribute('data-listener', 'true');
    }
  });
  
  // Add listeners to dropdowns
  metadataSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select && !select.hasAttribute('data-listener')) {
      select.addEventListener('change', () => {
        currentPage = 1;
        loadQuotes();
      });
      select.setAttribute('data-listener', 'true');
    }
  });
}

// Call when switching to quotes view or when metadata section is shown
document.addEventListener('DOMContentLoaded', () => {
  setupMetadataSearchListeners();
  
  // Setup modal handlers for Author and Source
  setupAuthorModalHandlers({
    onAuthorSaved: () => {
      loadAuthors();
      loadQuotes(); // Refresh if on quotes view
    },
    onAuthorDeleted: () => {
      loadAuthors();
      loadQuotes(); // Refresh if on quotes view
    }
  });
  
  setupSourceModalHandlers({
    onSourceSaved: () => {
      loadSources();
      loadQuotes(); // Refresh if on quotes view
    },
    onSourceDeleted: () => {
      loadSources();
      loadQuotes(); // Refresh if on quotes view
    },
    getQuoteTypes: getQuoteTypes
  });
  
  // Note: setupTagOperations() is called automatically by displayTags()
  // after autocomplete setup clones the input elements
});
