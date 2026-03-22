// ============= IMPORTS =============
import {
  parseUrlHash,
  updateUrlHash as updateUrlHashLib,
  updateActiveMenuState as updateActiveMenuStateLib,
  updatePageTitle as updatePageTitleLib
} from './js/lib/viewManager.js';

import {
  escapeHtml,
  getAttachmentIcon
} from './js/lib/utils.js';

import {
  readAttachmentFile as readAttachmentFileLib,
  readImageFile as readImageFileLib,
  handlePasteEvent,
  displayImage as displayImageLib,
  clearImagePreview as clearImagePreviewLib,
  displayAttachmentPreview as displayAttachmentPreviewLib,
  downscaleAndMoveToDb as downscaleAndMoveToDbLib,
  resizeImage as resizeImageLib
} from './js/lib/attachments.js';

import {
  getNoteTypeConfig,
  getNoteTypes,
  initNoteTypes,
  updateModalFieldVisibility,
  updateModalLabels,
  updateAddButtonText as updateAddButtonTextLib
} from './js/lib/noteTypes.js';

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
  getNoteTypesSettings,
  renderQuoteTypesList,
  renderTrainingTypesList,
  renderNoteTypesList,
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
  displayTags as displayTagsLib,
  addToBrowseStack as addToBrowseStackLib,
  removeFromBrowseStack as removeFromBrowseStackLib,
  clearBrowseStack as clearBrowseStackLib,
  showNotesForStack as showNotesForStackLib
} from './js/lib/tagsManager.js';

import {
  loadQuotes as loadQuotesLib,
  loadTotalCount as loadTotalCountLib,
  displayQuotes as displayQuotesLib,
  getCurrentQuotesData,
  setCurrentPage as setLibCurrentPage
} from './js/lib/displayManager.js';

import {
  populateTypeFilterCheckboxes as populateTypeFilterCheckboxesLib,
  populateTrainingTypeFilterCheckboxes as populateTrainingTypeFilterCheckboxesLib,
  clearFilters as clearFiltersLib,
  updateSourcesFilterVisibility as updateSourcesFilterVisibilityLib2,
  initializeFilterHandlers
} from './js/lib/filterManager.js';

import {
  filterByAuthor as filterByAuthorLib,
  filterBySource as filterBySourceLib,
  initializeSearchHandlers,
  registerGlobalSearchFunctions,
  clearSearchFields
} from './js/lib/searchManager.js';

import {
  initializeAutocomplete,
  setupAutocompleteInput
} from './js/lib/autocompleteManager.js';

import {
  FILTER_IDS,
  BUTTON_IDS,
  CONTAINER_IDS,
  CSS_CLASSES,
  getElementByIdSafe,
  getElementValue,
  getCheckboxState,
  getCheckedValues
} from './js/constants.js';

import {
  initializeQuillEditor,
  handleFormSubmit as handleFormSubmitLib,
  deleteQuote as deleteQuoteLib
} from './js/lib/quoteEditor.js';

import {
  initializeBulkImport,
  getBulkImportInputs
} from './js/lib/bulkImport.js';

import {
  initializeTranslationGroups
} from './js/lib/translationGroups.js';

import {
  pushState,
  initializeBackButton
} from './js/lib/historyManager.js';

import {
  showFullImage as showFullImageLib,
  showPDFViewer,
  showVideoPlayer,
  showAudioPlayer,
  downloadAttachment
} from './js/lib/attachmentViewer.js';

import {
  switchView as switchViewLib,
  setupMenuNavigation as setupMenuNavigationLib,
  handleHashChange,
  initializeHashChangeListener
} from './js/lib/pageCoordinator.js';
import { showConfirm } from './js/lib/confirmDialog.js';
// They are kept as local functions due to tight coupling with app-specific state

// ============= CONSTANTS =============
// Auto-detect API URL based on current host
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || '4000'}/api`;
window.API_URL = API_URL; // Make available to modules that need it

// Quill editor instance
let quillEditor = null;

// MIGRATED: Quill initialization and fullscreen setup moved to quoteEditor.js

// Quote types configuration (can be extended by user)
// Global settings cache (loaded from server on startup)
let globalSettings = null;

// Populate type dropdowns dynamically
function populateTypeDropdowns() {
  const types = getQuoteTypes();
  
  // Find all type dropdowns
  const dropdowns = [
    getElementByIdSafe('sourceType', 'populateTypeDropdowns'),      // Quote modal
    getElementByIdSafe('sourceTypeEdit', 'populateTypeDropdowns')  // Source edit modal  
    // Note: 'authorTypeFilter' removed - element doesn't exist
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
  const trainingTypeDropdown = getElementByIdSafe('trainingType');
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
// Wrapper for filterManager library
// MIGRATED: Filter checkbox population now in filterManager.js (direct library access)

// Pagination state
// Local state synced with displayManager library
let currentPage = 1; // Sync via setLibCurrentPage() when changed
let currentNoteTypeFilter = null; // null = show all types
const quotesPerPage = 20;

// Expose globally for historyManager
window.currentNoteTypeFilter = currentNoteTypeFilter;
window.currentPage = currentPage;
window.currentPage = currentPage;
window.currentNoteTypeFilter = currentNoteTypeFilter;

// Ensure currentPage stays in sync with library
function syncCurrentPage(newPage) {
  currentPage = newPage;
  window.currentPage = newPage; // Sync with global
  setLibCurrentPage(newPage);
}
let totalQuotes = 0;
let filteredQuotes = 0; // Track filtered count for pagination

// ============= MANUAL SELECTION STATE =============
let selectionMode = false;
let selectedNoteIds = new Set();
// 'filtered' | 'selected' — which scope the bulk ops modal targets
let bulkOpsScope = 'filtered';

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
      window.currentNoteTypeFilter = savedView; // Sync with global
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
  window.currentNoteTypeFilter = currentNoteTypeFilter; // Sync with global
  console.log('✅ Set view from hash:', currentNoteTypeFilter || 'all');
}

// Update URL hash when view changes
function updateUrlHash() {
  updateUrlHashLib(currentNoteTypeFilter);
}

function updateActiveMenuState() {
  updateActiveMenuStateLib(currentNoteTypeFilter);
}

function updateMainTitle() {
  updatePageTitleLib(currentNoteTypeFilter);
}

// MIGRATED: Hash change handling moved to pageCoordinator.js
initializeHashChangeListener(
  {
    handleHashNavigation,
    updateActiveMenuState,
    updateAddButtonText,
    updateMainTitle,
    updateSourcesFilterVisibility,
    toggleMetadataSearchSection,
    loadQuotes,
    loadTotalCount,
    setCurrentPage: (page) => { 
      currentPage = page;
      setLibCurrentPage(page);
    }
  },
  () => ({
    currentNoteTypeFilter,
    globalSettings
  })
);

let currentQuotesData = []; // Store current quotes for PDF export

// DOM Elements
const quoteModal = getElementByIdSafe("quoteModal");
const quoteForm = getElementByIdSafe("quoteForm");
const addQuoteBtn = getElementByIdSafe("addQuoteBtn");
const closeModal = document.querySelector(".close");
const cancelBtn = getElementByIdSafe("cancelBtn");
const quotesList = getElementByIdSafe("quotesList");
const quoteCount = getElementByIdSafe("quoteCount");
const modalTitle = getElementByIdSafe("modalTitle");

// MIGRATED: Bulk import elements moved to bulkImport.js
// Preview elements removed - no longer needed

// Form inputs
const authorInput = getElementByIdSafe("author");
const sourceInput = getElementByIdSafe("source");
const authorSuggestions = getElementByIdSafe("authorSuggestions");
const sourceSuggestions = getElementByIdSafe("sourceSuggestions");
const tagsSuggestions = getElementByIdSafe("tagsSuggestions");
const noteInput = getElementByIdSafe("comment");
const quoteImageFile = getElementByIdSafe("quoteImageFile");
const quoteImagePreview = getElementByIdSafe("quoteImagePreview");
const clearQuoteImageBtn = getElementByIdSafe("clearQuoteImage");

// State for quote image
let currentQuoteImage = "";
let currentQuoteImageFull = ""; // Store original size
let currentAttachmentType = "image"; // Track: image, pdf, document, video, audio
let currentAttachmentFileName = ""; // Track filename for non-image files

// Search inputs
const searchQuote = getElementByIdSafe("searchQuote");
const searchAuthor = getElementByIdSafe("searchAuthor");
const searchSource = getElementByIdSafe("searchSource");
const searchTags = getElementByIdSafe("searchTags");
const searchScore = getElementByIdSafe("searchScore");
const clearBtn = getElementByIdSafe("clearBtn");

// Search autocomplete suggestions
const searchAuthorSuggestions = getElementByIdSafe("searchAuthorSuggestions");
const searchSourceSuggestions = getElementByIdSafe("searchSourceSuggestions");

// State
let editingQuoteId = null;

/**
 * Build the note-type filter buttons in the left menu from the dynamic noteTypes list.
 * Inserts <li> elements before #noteTypeSeparator.
 * Also re-attaches click handlers so Settings changes take effect without a reload.
 */
function generateNoteTypeMenu() {
  const separator = document.getElementById('noteTypeSeparator');
  if (!separator) return;
  const ul = separator.parentNode;

  // Remove any previously generated items
  ul.querySelectorAll('.note-type-filter-li').forEach(li => li.remove());

  const types = getNoteTypes();
  types.forEach(type => {
    const li = document.createElement('li');
    li.className = 'note-type-filter-li';
    li.innerHTML = `<button class="menu-item note-type-filter" data-note-type="${type.value}">
      <span class="menu-icon">${type.icon}</span><span class="menu-text"> ${type.label}</span>
    </button>`;
    ul.insertBefore(li, separator);

    li.querySelector('button').addEventListener('click', () => {
      const noteType = type.value;
      currentNoteTypeFilter = noteType;
      window.currentNoteTypeFilter = noteType;
      currentPage = 1;
      setLibCurrentPage(1);

      switchView('quotes');
      saveCurrentView();
      updateUrlHash();

      document.querySelectorAll('.note-type-filter').forEach(btn => btn.classList.remove('active'));
      li.querySelector('button').classList.add('active');
      document.querySelectorAll('.menu-item[data-view]').forEach(btn => btn.classList.remove('active'));

      updateAddButtonText();
      updateMainTitle();
      updateSourcesFilterVisibility();

      const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
      toggleMetadataSearchSection(metaSearchEnabled);
      clearSearchFields();

      loadQuotes();
      loadTotalCount();
    });
  });

  // Re-apply active state if a type is already selected
  if (currentNoteTypeFilter) {
    ul.querySelectorAll('.note-type-filter').forEach(btn => {
      if (btn.dataset.noteType === currentNoteTypeFilter) btn.classList.add('active');
    });
  }

  // Also populate the "Add Note" type popup
  const noteTypePopup = document.getElementById('noteTypePopup');
  if (noteTypePopup) {
    noteTypePopup.innerHTML = types.map(type =>
      `<button class="note-type-menu-item" data-type="${type.value}">${type.icon} ${type.label}</button>`
    ).join('');

    noteTypePopup.querySelectorAll('.note-type-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const noteType = item.dataset.type;
        currentNoteTypeFilter = noteType;
        window.currentNoteTypeFilter = noteType;
        noteTypePopup.style.display = 'none';
        openAddModal();
        setTimeout(() => {
          currentNoteTypeFilter = null;
          window.currentNoteTypeFilter = null;
        }, 100);
      });
    });
  }

  // Populate the Tags view type filter dropdown
  const tagTypeFilter = document.getElementById('tagTypeFilter');
  if (tagTypeFilter) {
    // Keep the "All Types" option, replace the rest
    tagTypeFilter.innerHTML = `<option value="">🏷️ All Types</option>` +
      types.map(type => `<option value="${type.value}">${type.icon} ${type.label}</option>`).join('');
  }

  // Populate the note-type selector inside the edit/add modal
  const noteTypeSelect = document.getElementById('noteType');
  if (noteTypeSelect) {
    const prev = noteTypeSelect.value;
    noteTypeSelect.innerHTML = types.map(type => `<option value="${type.value}">${type.icon} ${type.label}</option>`).join('');
    if (prev) noteTypeSelect.value = prev;
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Load settings from file first (using settingsManager library)
  await loadSettings();
  globalSettings = getGlobalSettings(); // Sync local reference

  // Initialize dynamic note types from settings
  if (globalSettings && globalSettings.noteTypes) {
    initNoteTypes(globalSettings.noteTypes);
  }

  // Generate note type menu items dynamically
  generateNoteTypeMenu();

  // Initialize quote types in dropdowns
  populateTypeDropdowns();
  
  // Initialize quote source type filter checkboxes (direct library call)
  populateTypeFilterCheckboxesLib(getQuoteTypes);
  
  // Initialize training type filter checkboxes (direct library call)
  populateTrainingTypeFilterCheckboxesLib(getTrainingTypes);
  
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
  
  // Show/hide metadata search section based on current filter and settings
  const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
  const shouldShowMetadata = (currentNoteTypeFilter === 'quote' || currentNoteTypeFilter === null) && metaSearchEnabled;
  toggleMetadataSearchSection(shouldShowMetadata);
  
  // Initialize Quill editor using library
  quillEditor = initializeQuillEditor();
  
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
  
  // Initialize back button for history navigation
  initializeBackButton({
    switchView,
    loadQuotes,
    loadAuthors,
    loadSources,
    loadTags,
    setNoteTypeFilter: (noteType) => {
      currentNoteTypeFilter = noteType;
      window.currentNoteTypeFilter = noteType;
    },
    setCurrentPage: (page) => {
      currentPage = page;
      setLibCurrentPage(page);
    }
  });
});

// Event Listeners
function setupEventListeners() {
  // Add note button handlers with popup menu
  const addQuoteBtnTablet = getElementByIdSafe("addQuoteBtnTablet");
  const noteTypePopup = getElementByIdSafe("noteTypePopup");
  
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
  
  // Note type popup item clicks are handled by generateNoteTypeMenu().
  
  // Note type change handler (removed from modal, but keep for edit mode)
  const noteTypeSelect = getElementByIdSafe("noteType");
  if (noteTypeSelect) {
    noteTypeSelect.addEventListener("change", updateFieldVisibility);
  }
  
  // Note type filter buttons are generated by generateNoteTypeMenu() above.
  
  closeModal.addEventListener("click", closeQuoteModal);
  cancelBtn.addEventListener("click", closeQuoteModal);
  quoteForm.addEventListener("submit", handleSubmit);
  clearBtn.addEventListener("click", clearFilters);
  
  // Delete quote button in modal
  const deleteQuoteBtn = getElementByIdSafe("deleteQuoteBtn");
  if (deleteQuoteBtn) {
    deleteQuoteBtn.addEventListener("click", () => {
      const quoteId = getElementByIdSafe("quoteId").value;
      if (quoteId) {
        closeQuoteModal();
        deleteQuote(quoteId);
      }
    });
  }

  // Refresh buttons
  const refreshQuotesBtn = getElementByIdSafe("refreshQuotesBtn");
  const refreshAuthorsBtn = getElementByIdSafe("refreshAuthorsBtn");
  const refreshSourcesBtn = getElementByIdSafe("refreshSourcesBtn");
  const refreshTagsBtn = getElementByIdSafe("refreshTagsBtn");

  if (refreshQuotesBtn) {
    refreshQuotesBtn.addEventListener("click", async () => {
      refreshQuotesBtn.classList.add('refreshing');
      currentPage = 1;
      setLibCurrentPage(1);
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

  // Export PDF button - REMOVED: Moved to bulk operations modal
  // If you need export PDF, use the "Bulk Operations" button instead

  // Export JSON button
  const exportJsonBtn = getElementByIdSafe("exportJsonBtn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", exportToJson);
  }

  // Import JSON button
  const importJsonBtn = getElementByIdSafe("importJsonBtn");
  const importModal = getElementByIdSafe("importModal");
  const closeImportModal = getElementByIdSafe("closeImportModal");
  const cancelImportBtn = getElementByIdSafe("cancelImportBtn");
  const selectFileBtn = getElementByIdSafe("selectFileBtn");
  const importFileInput = getElementByIdSafe("importFileInput");

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

  // Select mode button
  const selectModeBtn = getElementByIdSafe("selectModeBtn");
  if (selectModeBtn) {
    selectModeBtn.addEventListener("click", toggleSelectionMode);
  }

  // Selection bar buttons
  const clearSelectionBtn = getElementByIdSafe("clearSelectionBtn");
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      clearSelection();
      if (selectionMode) toggleSelectionMode(); // also exit select mode
    });
  }

  const selectAllPageBtn = getElementByIdSafe("selectAllPageBtn");
  if (selectAllPageBtn) {
    selectAllPageBtn.addEventListener("click", selectAllOnPage);
  }

  const bulkTagSelectedBtn = getElementByIdSafe("bulkTagSelectedBtn");
  if (bulkTagSelectedBtn) {
    bulkTagSelectedBtn.addEventListener("click", () => {
      bulkOpsScope = 'selected';
      openBulkOperationsModal();
    });
  }

  // Bulk operations modal
  const bulkOperationsBtn = getElementByIdSafe("bulkOperationsBtn");
  const closeBulkOpsModal = getElementByIdSafe("closeBulkOpsModal");
  const cancelBulkOpsBtn = getElementByIdSafe("cancelBulkOpsBtn");
  const bulkTagExecuteBtn = getElementByIdSafe("bulkTagExecuteBtn");
  const bulkTagAddBtn = getElementByIdSafe("bulkTagAddBtn");
  const bulkUntagExecuteBtn = getElementByIdSafe("bulkUntagExecuteBtn");
  const bulkGroupExecuteBtn = getElementByIdSafe("bulkGroupExecuteBtn");
  const bulkExportPdfBtn = getElementByIdSafe("bulkExportPdfBtn");
  const bulkDeleteBtn = getElementByIdSafe("bulkDeleteBtn");

  if (bulkOperationsBtn) {
    bulkOperationsBtn.addEventListener("click", () => {
      bulkOpsScope = 'filtered'; // menu button always starts with filter scope
      openBulkOperationsModal();
    });
  }

  if (closeBulkOpsModal) {
    closeBulkOpsModal.addEventListener("click", closeBulkOperationsModal);
  }

  if (cancelBulkOpsBtn) {
    cancelBulkOpsBtn.addEventListener("click", closeBulkOperationsModal);
  }

  // Scope toggle buttons inside bulk ops modal
  const bulkScopeFiltered = document.getElementById('bulkScopeFiltered');
  const bulkScopeSelected = document.getElementById('bulkScopeSelected');
  if (bulkScopeFiltered) {
    bulkScopeFiltered.addEventListener('click', () => {
      bulkOpsScope = 'filtered';
      openBulkOperationsModal();
    });
  }
  if (bulkScopeSelected) {
    bulkScopeSelected.addEventListener('click', () => {
      bulkOpsScope = 'selected';
      openBulkOperationsModal();
    });
  }

  if (bulkTagAddBtn) {
    bulkTagAddBtn.addEventListener("click", addBulkTagFromInput);
  }

  const bulkTagInputEl = document.getElementById("bulkTagInput");
  if (bulkTagInputEl) {
    bulkTagInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addBulkTagFromInput(); }
    });
  }

  if (bulkTagExecuteBtn) {
    bulkTagExecuteBtn.addEventListener("click", handleBulkTag);
  }

  if (bulkUntagExecuteBtn) {
    bulkUntagExecuteBtn.addEventListener("click", handleBulkUntag);
  }

  if (bulkGroupExecuteBtn) {
    bulkGroupExecuteBtn.addEventListener("click", handleBulkSetGroup);
  }

  if (bulkExportPdfBtn) {
    bulkExportPdfBtn.addEventListener("click", handleBulkExportPdf);
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", handleBulkDelete);
  }

  // Close bulk operations modal on outside click
  window.addEventListener("click", (e) => {
    const bulkOpsModal = getElementByIdSafe("bulkOperationsModal");
    if (e.target === bulkOpsModal) {
      closeBulkOperationsModal();
    }
  });

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

  // MIGRATED: Bulk import initialization moved to bulkImport.js
  initializeBulkImport({
    onSuccess: (results) => {
      loadQuotes();
      loadTotalCount();
    },
    onError: (error) => {
      console.error("Bulk import failed:", error);
    }
  });

  // MIGRATED: Translation groups initialization moved to translationGroups.js
  initializeTranslationGroups({
    displayQuotes,
    updateCount: (message) => {
      quoteCount.textContent = message;
    }
  });

  // Sources view: Type filter checkboxes
  ["filterBook", "filterMovie"].forEach((id) => {
    const checkbox = getElementByIdSafe(id);
    if (checkbox) {
      checkbox.addEventListener("change", loadSources);
    }
  });

  // Sources view: Search input
  const searchSourceName = getElementByIdSafe("searchSourceName");
  if (searchSourceName) {
    searchSourceName.addEventListener("input", () => {
      clearTimeout(window.sourceSearchTimeout);
      window.sourceSearchTimeout = setTimeout(loadSources, 300);
    });
  }

  // Sources view: Sort buttons
  const sortByName = getElementByIdSafe("sortByName");
  const sortByCount = getElementByIdSafe("sortByCount");
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
  const searchAuthorName = getElementByIdSafe("searchAuthorName");
  if (searchAuthorName) {
    searchAuthorName.addEventListener("input", () => {
      clearTimeout(window.authorSearchTimeout);
      window.authorSearchTimeout = setTimeout(loadAuthors, 300);
    });
  }

  // Authors view: Sort buttons
  const sortAuthorsByName = getElementByIdSafe("sortAuthorsByName");
  const sortAuthorsByCount = getElementByIdSafe("sortAuthorsByCount");
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

  // Initialize autocomplete for all inputs
  initializeAutocomplete({
    escapeHtml,
    authorInput,
    authorSuggestions,
    sourceInput,
    sourceSuggestions,
    searchTags,
    tagsSuggestions,
    searchAuthor,
    searchAuthorSuggestions,
    searchSource,
    searchSourceSuggestions,
    ...getBulkImportInputs()
  });

  // MIGRATED: Filter dropdowns and buttons now in filterManager.js
  initializeFilterHandlers({
    loadQuotes,
    loadTotalCount,
    setCurrentPage: (page) => { 
      currentPage = page;
      setLibCurrentPage(page);
    }
  });
  
  // MIGRATED: Search inputs and training filters now in searchManager.js
  initializeSearchHandlers({
    loadQuotes,
    loadTotalCount,
    setCurrentPage: (page) => { 
      currentPage = page;
      setLibCurrentPage(page);
    },
    switchView
  });
  
  // Register global search functions for onclick handlers
  registerGlobalSearchFunctions();
  
  // Date picker sync - when date picker changes, update text input
  const noteDatePicker = getElementByIdSafe("noteDatePicker");
  const noteDateText = getElementByIdSafe("noteDate");
  
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

// ============================================
// Note Type Functions
// ============================================

// const NOTE_TYPES = {
//   quote: { icon: 'Q', label: 'Quote', color: '#3b82f6' },
//   note: { icon: 'N', label: 'Simple Note', color: '#10b981' },
//   training: { icon: 'T', label: 'Training', color: '#f59e0b' },
//   puzzle: { icon: 'P', label: 'Logical Puzzle', color: '#8b5cf6' }
// };

function updateAddButtonText() {
  updateAddButtonTextLib(currentNoteTypeFilter, updateSourcesFilterVisibility);
}

// Wrapper for filterManager library
function updateSourcesFilterVisibility() {
  updateSourcesFilterVisibilityLib2(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
}

// Wrapper with app-specific additions
function updateFieldVisibility() {
  const noteType = getElementByIdSafe('noteType').value;
  const isQuote = noteType === 'quote';
  
  // Use library function for standard field visibility
  updateModalFieldVisibility(noteType);
  
  // App-specific fields not in library
  const quoteSpecificFields = getElementByIdSafe('quoteSpecificFields');
  const translationGroupContainer = getElementByIdSafe('translationGroupContainer');
  
  if (quoteSpecificFields) {
    quoteSpecificFields.style.display = isQuote ? 'flex' : 'none';
  }
  
  // Group field is inside trainingSpecificFields, so it's automatically shown for trainings
  // For quotes, we need to show it separately - but for now, Group is only for trainings
  // (If needed for quotes in future, we can add a separate field in quoteSpecificFields)
  
  // Update labels using library
  updateModalLabels(noteType);
  
  // Update modal title based on type
  // Check the hidden input (already set by setupEditModal before this callback fires)
  // rather than the module-level editingQuoteId which is set only after setupEditModal returns
  const quoteIdInput = document.getElementById('quoteId');
  const isEditing = quoteIdInput && quoteIdInput.value;
  if (!isEditing) {
    const typeInfo = getNoteTypeConfig(noteType);
    modalTitle.textContent = `Add ${typeInfo.label}`;
  }
}

// function updateModalLabels is imported from noteTypes.js

function openAddModal() {
  // MIGRATED: Using library function
  const noteType = currentNoteTypeFilter || 'quote';
  
  // Collect all DOM elements needed by the modal renderer
  const elements = {
    modalTitle: modalTitle,
    form: quoteForm,
    quoteTextInput: getElementByIdSafe("quoteText"),
    noteInput: noteInput,
    noteTypeSelect: getElementByIdSafe("noteType"),
    authorInput: authorInput,
    sourceInput: getElementByIdSafe("source"),
    sourceTypeSelect: getElementByIdSafe("sourceType"),
    noteDateInput: getElementByIdSafe("noteDate"),
    noteDatePicker: getElementByIdSafe("noteDatePicker"),
    trainingTypeSelect: getElementByIdSafe("trainingType"),
    translationGroupInput: getElementByIdSafe("translationGroup"),
    scoreRadios: true, // Flag to indicate score radios exist
    metadataElement: getElementByIdSafe("quoteMetadata"),
    deleteBtn: getElementByIdSafe("deleteQuoteBtn"),
    quoteIdInput: getElementByIdSafe("quoteId")
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
  
  // Update attachment panel visibility based on state
  updateAttachmentPanelVisibility();
  
  // Show modal
  quoteModal.style.display = "block";
  
  // Set focus to Quote text editor after modal is displayed
  setTimeout(() => {
    if (quillEditor) {
      quillEditor.focus();
    }
  }, 100); // Small delay to ensure modal is fully rendered
}

function openEditModal(quote) {
  // MIGRATED: Using library function
  
  // Collect all DOM elements needed by the modal renderer
  const elements = {
    modalTitle: modalTitle,
    form: quoteForm,
    quoteTextInput: getElementByIdSafe("quoteText"),
    noteInput: noteInput,
    noteTypeSelect: getElementByIdSafe("noteType"),
    authorInput: authorInput,
    sourceInput: getElementByIdSafe("source"),
    sourceTypeSelect: getElementByIdSafe("sourceType"),
    noteDateInput: getElementByIdSafe("noteDate"),
    noteDatePicker: getElementByIdSafe("noteDatePicker"),
    trainingTypeSelect: getElementByIdSafe("trainingType"),
    translationGroupInput: getElementByIdSafe("translationGroup"),
    scoreRadios: true, // Flag to indicate score radios exist
    metadataElement: getElementByIdSafe("quoteMetadata"),
    deleteBtn: getElementByIdSafe("deleteQuoteBtn"),
    quoteIdInput: getElementByIdSafe("quoteId")
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

  // Render the multi-attachment strip (hidden when only one attachment)
  renderModalAttachmentStrip(quote);
  
  // Update attachment panel visibility
  updateAttachmentPanelVisibility();
  
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
  // Clear attachment strip and pending queue
  const strip = document.getElementById('modalAttachmentStrip');
  if (strip) { strip.style.display = 'none'; strip.innerHTML = ''; }
  currentModalAttachments = [];
  currentModalAttachIdx = 0;
  pendingExtraAttachments = [];
  authorSuggestions.classList.remove("show");
  sourceSuggestions.classList.remove("show");
  // Hide HTML source panel
  const htmlPanel = document.getElementById('htmlSourcePanel');
  if (htmlPanel) htmlPanel.style.display = 'none';
}

// ── HTML source viewer ──────────────────────────────────────────────────────
window.toggleHtmlSource = function() {
  const panel = document.getElementById('htmlSourcePanel');
  const area  = document.getElementById('htmlSourceArea');
  if (!panel || !area) return;
  if (panel.style.display === 'none') {
    // Show: populate with current editor HTML
    const hidden = document.getElementById('quoteText');
    area.value = hidden ? hidden.value : (quillEditor?.root?.innerHTML || '');
    panel.style.display = 'block';
    document.getElementById('viewHtmlBtn').textContent = '📄 Hide HTML';
  } else {
    panel.style.display = 'none';
    document.getElementById('viewHtmlBtn').textContent = '📄 HTML';
  }
};

window.applyHtmlSource = function() {
  const area = document.getElementById('htmlSourceArea');
  if (!area || !quillEditor) return;
  quillEditor.clipboard.dangerouslyPasteHTML(area.value);
  document.getElementById('htmlSourcePanel').style.display = 'none';
  document.getElementById('viewHtmlBtn').textContent = '📄 HTML';
};

// Clear filters functionality
function clearFilters() {
  clearFiltersLib({
    loadQuotes,
    setCurrentPage: (page) => { 
      currentPage = page;
      setLibCurrentPage(page);
    }
  });
}

// API Functions
// async function fetchWithRetry(url, options = {}, maxRetries = 3, delayMs = 500) {...}

// Helper function to add refresh animation
function addRefreshAnimation(buttonId, asyncFunction) {
  return async function() {
    const button = getElementByIdSafe(buttonId);
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

// Load and display quotes
async function loadQuotes() {
  // Clear group-view state
  window._currentGroupNotes = null;
  const mergeGroupBtn = document.getElementById('mergeGroupBtn');
  if (mergeGroupBtn) mergeGroupBtn.style.display = 'none';

  const currentSettings = getGlobalSettings();
  const quotes = await loadQuotesLib(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, currentSettings);
  currentQuotesData = getCurrentQuotesData(); // Sync for PDF export
  
  // Sync local state for pagination (loadQuotesLib calls loadTotalCount internally)
  const filteredCountElement = getElementByIdSafe("filteredQuotesCount");
  if (filteredCountElement) {
    filteredQuotes = parseInt(filteredCountElement.textContent) || 0;
  }
  const totalCountElement = getElementByIdSafe("totalQuotesCount");
  if (totalCountElement) {
    totalQuotes = parseInt(totalCountElement.textContent) || 0;
  }
  
  // Display quotes using app wrapper (which adds click handlers)
  displayQuotes(quotes);

  // Re-apply selection highlights after DOM rebuild
  if (selectedNoteIds.size > 0) {
    document.querySelectorAll('.quote-card').forEach(card => {
      if (selectedNoteIds.has(parseInt(card.dataset.quoteId, 10))) {
        card.classList.add('selected');
      }
    });
  }
  
  // Update pagination controls after loading quotes
  updatePaginationControls();
  
  // Push current state to history (AFTER successful load)
  pushState();
}

// Load total count
async function loadTotalCount() {
  await loadTotalCountLib(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
  
  // Sync local state for pagination
  const filteredCountElement = getElementByIdSafe("filteredQuotesCount");
  if (filteredCountElement) {
    filteredQuotes = parseInt(filteredCountElement.textContent) || 0;
  }
  const totalCountElement = getElementByIdSafe("totalQuotesCount");
  if (totalCountElement) {
    totalQuotes = parseInt(totalCountElement.textContent) || 0;
  }
  
  updatePaginationControls();
}

async function handleSubmit(e) {
  e.preventDefault();

  // Check if this is a training note without year/month tags
  const noteTypeSelect = getElementByIdSafe('noteType');
  const currentNoteType = noteTypeSelect?.value;
  
  if (currentNoteType === 'training') {
    // Get selected tags
    const tagsValue = getElementByIdSafe('tags')?.value || '';
    const tags = tagsValue.split(',').map(t => t.trim()).filter(t => t);
    
    // Check for year tag (4-digit number)
    const hasYearTag = tags.some(tag => /^\d{4}$/.test(tag));
    
    // Check for month tag (month names)
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december',
                        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const hasMonthTag = tags.some(tag => monthNames.includes(tag.toLowerCase()));
    
    // Warn if missing year or month
    if (!hasYearTag || !hasMonthTag) {
      const missing = [];
      if (!hasYearTag) missing.push('YEAR');
      if (!hasMonthTag) missing.push('MONTH');
      
      const proceed = await showConfirm(
        `This training note is missing ${missing.join(' and ')} tag(s).\n\nWithout these tags, it will be difficult to find later.`,
        { icon: '⚠️', title: 'Missing tags', confirmLabel: 'Save anyway' }
      );
      
      if (!proceed) {
        return; // Don't save, let user add tags
      }
    }
  }

  // If this note already has multiple attachments managed by the strip,
  // do NOT send attachment fields in PUT — they are handled by note_attachments.
  // Sending them would overwrite position=0 with whatever strip item was last previewed.
  const attachmentsAlreadyManaged = editingQuoteId && currentModalAttachments.length > 1;

  const state = {
    editingQuoteId,
    currentQuoteImage:    attachmentsAlreadyManaged ? undefined : currentQuoteImage,
    currentQuoteImageFull: attachmentsAlreadyManaged ? undefined : currentQuoteImageFull,
    currentAttachmentType: attachmentsAlreadyManaged ? undefined : currentAttachmentType,
    globalSettings
  };

  const callbacks = {
    onSuccess: async (newNote) => {
      // Upload any queued attachments (add-mode multi-attach)
      if (pendingExtraAttachments.length > 0) {
        const noteId = newNote?.id || editingQuoteId;
        if (noteId) {
          for (const att of pendingExtraAttachments) {
            try { await postAttachmentToNote(noteId, att); } catch (_) {}
          }
          pendingExtraAttachments = [];
        }
      }
      closeQuoteModal();
      loadQuotes();
      loadTotalCount();
    },
    onError: (error) => {
      alert("Failed to save quote: " + error);
    }
  };

  await handleFormSubmitLib(e, { apiUrl: API_URL, state, callbacks });
}

async function deleteQuote(id) {
  const callbacks = {
    onSuccess: () => {
      closeQuoteModal();
      loadQuotes();
      loadTotalCount();
    },
    onError: (error) => {
      alert("Failed to delete quote: " + error);
    }
  };
  
  await deleteQuoteLib(id, API_URL, callbacks);
}

// ============================================
// MIGRATED: Translation group functions moved to translationGroups.js

// Display Functions
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
      const btnEl = getElementByIdSafe(btnId);
      
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

      // Ctrl/Cmd+Click or selection mode → toggle selection
      if (selectionMode || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        clearTimeout(clickTimer);
        clickCount = 0;
        toggleNoteSelection(card, card.dataset.quoteId);
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
  const quoteEl = getElementByIdSafe(`quote-${quoteId}`);
  const btnEl = getElementByIdSafe(`expand-${quoteId}`);
  const isExpanded = quoteEl.dataset.expanded === "true";

  if (!window.fullQuotes[quoteId]) {
    // Fetch full quote if not in cache
    fetch(`${API_URL}/quotes/${quoteId}`)
      .then((res) => res.json())
      .then((quote) => {
        window.fullQuotes[quoteId] = quote.note_text;
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
// MIGRATED: Download attachment function moved to attachmentViewer.js
window.downloadAttachment = downloadAttachment;

// Show full-size image in modal (make it global for onclick)
// MIGRATED: Attachment viewer functions moved to attachmentViewer.js
// Wrapper to pass downscale callback
window.showFullImage = function (imageSrc, quoteId = null, attachmentType = 'image') {
  showFullImageLib(imageSrc, quoteId, attachmentType, {
    onDownscale: async (quoteId, imageUrl, filePath, modal) => {
      await downscaleAndMoveToDb(quoteId, imageUrl, filePath, modal);
    }
  });
};

// Show PDF viewer
// MIGRATED: PDF, Video, Audio viewers moved to attachmentViewer.js

// ============= ATTACHMENT HANDLING WRAPPERS =============
// These wrappers bridge app-specific state with the attachments library

async function downscaleAndMoveToDb(quoteId, imageUrl, filePath, modal) {
  return downscaleAndMoveToDbLib(quoteId, imageUrl, filePath, modal, API_URL, loadQuotes);
}

function readAttachmentFile(file, type) {
  const callbacks = {
    onImageLoaded: (result) => {
      if (type === "quote") {
        currentQuoteImageFull = result.full;
        currentQuoteImage = result.thumbnail;
        currentAttachmentType = result.type;
        currentAttachmentFileName = result.filename;
        displayImage(quoteImagePreview, result.thumbnail);
        updateAttachmentPanelVisibility(); // Update panel visibility when image loads
      } else if (type === "author") {
        currentAuthorImage = result.image;
        displayImage(authorImagePreview, result.image);
      } else if (type === "source") {
        currentSourceImage = result.image;
        displayImage(sourceImagePreview, result.image);
      }
    },
    onAttachmentLoaded: (result, icon, filename, size) => {
      currentQuoteImageFull = result.full;
      currentQuoteImage = result.thumbnail;
      currentAttachmentType = result.type;
      currentAttachmentFileName = result.filename;
      displayAttachmentPreview(quoteImagePreview, icon, filename, size);
      updateAttachmentPanelVisibility(); // Update panel visibility when attachment loads
    }
  };
  
  return readAttachmentFileLib(file, type, globalSettings, callbacks);
}

function readImageFile(file, type) {
  const callbacks = {
    onImageLoaded: (result) => {
      if (type === "quote") {
        currentQuoteImageFull = result.full;
        currentQuoteImage = result.thumbnail;
        currentAttachmentType = result.type;
        currentAttachmentFileName = result.filename;
        displayImage(quoteImagePreview, result.thumbnail);
        updateAttachmentPanelVisibility(); // Update panel visibility when image loads
      } else if (type === "author") {
        currentAuthorImage = result.image;
        window.currentAuthorImage = result.image; // Keep window object in sync
        displayImage(authorImagePreview, result.image);
        // Show clear button
        if (clearAuthorImageBtn) clearAuthorImageBtn.style.display = 'flex';
        toggleAuthorAttachmentPanel();
      } else if (type === "source") {
        currentSourceImage = result.image;
        window.currentSourceImage = result.image; // Keep window object in sync
        displayImage(sourceImagePreview, result.image);
        // Show clear button
        if (clearSourceImageBtn) clearSourceImageBtn.style.display = 'flex';
        toggleSourceAttachmentPanel();
      }
    }
  };
  
  return readImageFileLib(file, type, globalSettings, callbacks);
}

// Handle Paste - wrapper for library function
function handlePaste(e, type) {
  // Has existing attachment: paste adds a NEW attachment (edit → API, add → queue)
  if (type === "quote" && (currentQuoteImage || currentQuoteImageFull)) {
    const pasteCallbacks = {
      onImageLoaded: async (result) => {
        const attData = {
          thumbnail:       result.thumbnail,
          attachment_full: result.full,
          attachment_type: result.type || 'image',
          filename:        result.filename || 'pasted-image.jpg',
        };
        try {
          if (editingQuoteId) {
            await postAttachmentToNote(editingQuoteId, attData);
          } else {
            pendingExtraAttachments.push(attData);
            renderPendingStrip();
            updateAttachmentPanelVisibility();
          }
        } catch (err) {
          alert('Could not add pasted attachment: ' + err.message);
        }
      },
    };
    handlePasteEvent(e, type, globalSettings, pasteCallbacks);
    return;
  }

  const callbacks = {
    onImageLoaded: (result) => {
      if (type === "quote") {
        currentQuoteImageFull = result.full;
        currentQuoteImage = result.thumbnail;
        currentAttachmentType = result.type;
        currentAttachmentFileName = result.filename;
        displayImage(quoteImagePreview, result.thumbnail);
        updateImageIndicator();
      } else if (type === "author") {
        currentAuthorImage = result.image;
        window.currentAuthorImage = result.image; // Keep window object in sync
        displayImage(authorImagePreview, result.image);
        // Show clear button
        if (clearAuthorImageBtn) clearAuthorImageBtn.style.display = 'flex';
        toggleAuthorAttachmentPanel();
      } else if (type === "source") {
        currentSourceImage = result.image;
        window.currentSourceImage = result.image; // Keep window object in sync
        displayImage(sourceImagePreview, result.image);
        // Show clear button
        if (clearSourceImageBtn) clearSourceImageBtn.style.display = 'flex';
        toggleSourceAttachmentPanel();
      }
    }
  };
  
  handlePasteEvent(e, type, globalSettings, callbacks);
}

// Display Image - wrapper for library function
function displayImage(container, base64Image) {
  displayImageLib(container, base64Image, escapeHtml);
}

// Clear Image Preview - wrapper for library function with app-specific state management
function clearImagePreview(container, type) {
  // Clear the image data
  if (type === "quote") {
    currentQuoteImage = "";
    currentQuoteImageFull = "";
  }
  
  clearImagePreviewLib(container, type);
}

// Display Attachment Preview - wrapper for library function
function displayAttachmentPreview(container, icon, filename, size) {
  displayAttachmentPreviewLib(container, icon, filename, size, escapeHtml);
}

// Resize Image - wrapper for library function
function resizeImage(img, maxDimension) {
  return resizeImageLib(img, maxDimension);
}

// Clear Author Image
function clearAuthorImage() {
  console.log('🗑️ Clearing author image');
  currentAuthorImage = null;
  window.currentAuthorImage = null; // Keep window object in sync
  clearImagePreview(authorImagePreview, "author");
  // Hide clear button
  if (clearAuthorImageBtn) clearAuthorImageBtn.style.display = 'none';
  toggleAuthorAttachmentPanel(); // Update panel state
}

// Clear Source Image
function clearSourceImage() {
  console.log('🗑️ Clearing source image');
  currentSourceImage = null;
  window.currentSourceImage = null; // Keep window object in sync
  clearImagePreview(sourceImagePreview, "source");
  // Hide clear button
  if (clearSourceImageBtn) clearSourceImageBtn.style.display = 'none';
  toggleSourceAttachmentPanel(); // Update panel state
}

// Toggle Author Attachment Panel
function toggleAuthorAttachmentPanel() {
  if (!authorAttachmentContainer || !toggleAuthorAttachmentBtn) return;
  
  const hasImage = authorImagePreview && authorImagePreview.querySelector('img');
  const isOpen = authorAttachmentContainer.style.display !== 'none';
  
  console.log('🔄 toggleAuthorAttachmentPanel:', { 
    hasImage: !!hasImage, 
    isOpen,
    containerDisplay: authorAttachmentContainer.style.display,
    previewHasClass: authorImagePreview?.classList.contains('has-image')
  });
  
  if (hasImage) {
    // If image exists, keep panel open and hide toggle button
    authorAttachmentContainer.style.display = 'block';
    toggleAuthorAttachmentBtn.style.display = 'none';
    console.log('✅ Image exists - panel open, button hidden');
  } else {
    // If no image, toggle panel and show/update button
    if (isOpen) {
      authorAttachmentContainer.style.display = 'none';
      toggleAuthorAttachmentBtn.textContent = '▶';
      toggleAuthorAttachmentBtn.title = 'Show author picture';
      console.log('📦 No image, panel was open - closing it');
    } else {
      authorAttachmentContainer.style.display = 'block';
      toggleAuthorAttachmentBtn.textContent = '◀';
      toggleAuthorAttachmentBtn.title = 'Hide author picture';
      console.log('📦 No image, panel was closed - opening it');
    }
    toggleAuthorAttachmentBtn.style.display = 'block';
  }
}

// Toggle Source Attachment Panel
function toggleSourceAttachmentPanel() {
  if (!sourceAttachmentContainer || !toggleSourceAttachmentBtn) return;
  
  const hasImage = sourceImagePreview && sourceImagePreview.querySelector('img');
  const isOpen = sourceAttachmentContainer.style.display !== 'none';
  
  if (hasImage) {
    // If image exists, keep panel open and hide toggle button
    sourceAttachmentContainer.style.display = 'block';
    toggleSourceAttachmentBtn.style.display = 'none';
  } else {
    // If no image, toggle panel and show/update button
    if (isOpen) {
      sourceAttachmentContainer.style.display = 'none';
      toggleSourceAttachmentBtn.textContent = '▶';
      toggleSourceAttachmentBtn.title = 'Show source cover';
    } else {
      sourceAttachmentContainer.style.display = 'block';
      toggleSourceAttachmentBtn.textContent = '◀';
      toggleSourceAttachmentBtn.title = 'Hide source cover';
    }
    toggleSourceAttachmentBtn.style.display = 'block';
  }
}

// ============= AUTHOR/SOURCE EDIT MODALS =============

// Author Modal Elements (only those needed for image handling and paste detection)
const authorModal = getElementByIdSafe("authorModal");
const authorImageFile = getElementByIdSafe("authorImageFile");
const authorImagePreview = getElementByIdSafe("authorImagePreview");
const clearAuthorImageBtn = getElementByIdSafe("clearAuthorImage");
const toggleAuthorAttachmentBtn = getElementByIdSafe(BUTTON_IDS.TOGGLE_AUTHOR_ATTACHMENT_BTN);
const authorAttachmentContainer = getElementByIdSafe(CONTAINER_IDS.AUTHOR_ATTACHMENT_CONTAINER);

// Source Modal Elements (only those needed for image handling, autocomplete, and paste detection)
const sourceModal = getElementByIdSafe("sourceModal");
const sourceTypeEdit = getElementByIdSafe("sourceTypeEdit"); // Used by autocomplete
const sourceImageFile = getElementByIdSafe("sourceImageFile");
const sourceImagePreview = getElementByIdSafe("sourceImagePreview");
const clearSourceImageBtn = getElementByIdSafe("clearSourceImage");
const toggleSourceAttachmentBtn = getElementByIdSafe(BUTTON_IDS.TOGGLE_SOURCE_ATTACHMENT_BTN);
const sourceAttachmentContainer = getElementByIdSafe(CONTAINER_IDS.SOURCE_ATTACHMENT_CONTAINER);

// State for images
let currentAuthorImage = null;
let currentSourceImage = null;

// Expose to window for entityModal.js
window.currentAuthorImage = currentAuthorImage;
window.currentSourceImage = currentSourceImage;

// NOTE: Form elements (authorForm, authorIdInput, sourceForm, etc.) are now handled by entityModal.js

// Setup modal event listeners
// NOTE: Form submit, close, and delete handlers are now set up by setupAuthorModalHandlers() and setupSourceModalHandlers()
// via entityModal.js - no need for duplicate handlers here

// Image-related handlers (not yet in entityModal.js)
authorImageFile.addEventListener("change", handleAuthorFileSelect);
clearAuthorImageBtn.addEventListener("click", clearAuthorImage);
sourceImageFile.addEventListener("change", handleSourceFileSelect);
clearSourceImageBtn.addEventListener("click", clearSourceImage);

// Toggle button handlers
if (toggleAuthorAttachmentBtn) {
  toggleAuthorAttachmentBtn.addEventListener("click", toggleAuthorAttachmentPanel);
}
if (toggleSourceAttachmentBtn) {
  toggleSourceAttachmentBtn.addEventListener("click", toggleSourceAttachmentPanel);
}

// Click on preview to open file dialog (no full-size view for author/source)
authorImagePreview.addEventListener("click", () => {
  // Only open file dialog if placeholder is showing (no image loaded)
  const hasPlaceholder = authorImagePreview.querySelector('.image-placeholder');
  if (hasPlaceholder) {
    authorImageFile.click();
  }
  // If image exists, do nothing (user must use X button to remove it first)
});

sourceImagePreview.addEventListener("click", () => {
  // Only open file dialog if placeholder is showing (no image loaded)
  const hasPlaceholder = sourceImagePreview.querySelector('.image-placeholder');
  if (hasPlaceholder) {
    sourceImageFile.click();
  }
  // If image exists, do nothing (user must use X button to remove it first)
});

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

// Make library modal functions global for onclick handlers in HTML
window.openAuthorModal = openAuthorModalLib;
window.openSourceModal = openSourceModalLib;

// Make toggle functions global for modal configs
window.toggleAuthorAttachmentPanel = toggleAuthorAttachmentPanel;
window.toggleSourceAttachmentPanel = toggleSourceAttachmentPanel;

// NOTE: The following functions have been moved to authorModal.js and sourceModal.js:
// - openAuthorModal() - Now handled by openAuthorModalLib
// - closeAuthorEditModal() - Now handled by entityModal.js
// - handleAuthorSubmit() - Now handled by entityModal.js
// - openSourceModal() - Now handled by openSourceModalLib
// - closeSourceEditModal() - Now handled by entityModal.js
// - handleSourceSubmit() - Now handled by entityModal.js

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

// MIGRATED: Attachment functions moved to attachments.js and wrapped above

// ============= BULK IMPORT FUNCTIONS =============

// MIGRATED: Bulk import functions moved to bulkImport.js

// ============= QUOTE IMAGE HANDLING =============

// Handle quote image file selection
quoteImageFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Edit mode + existing attachment → add via API immediately
  if (editingQuoteId && (currentQuoteImage || currentQuoteImageFull)) {
    await addAttachmentFromFile(file, editingQuoteId);
    quoteImageFile.value = "";
    return;
  }

  // Add mode + existing primary attachment → queue for upload after save
  if (!editingQuoteId && (currentQuoteImage || currentQuoteImageFull)) {
    await queuePendingAttachment(file);
    quoteImageFile.value = "";
    return;
  }

  // Normal flow — set as the primary attachment
  readAttachmentFile(file, "quote");
});

// Handle quote image paste
getElementByIdSafe("quoteModal").addEventListener("paste", (e) => {
  handlePaste(e, "quote");
});

// Clear quote image
clearQuoteImageBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!await showConfirm('Remove the main attachment from this note?', { icon: '📎', title: 'Remove attachment', danger: true })) return;
  currentQuoteImage = "";
  currentQuoteImageFull = "";
  currentAttachmentType = "image";
  currentAttachmentFileName = "";
  clearImagePreview(quoteImagePreview, "quote");
  quoteImageFile.value = "";
  updateAttachmentPanelVisibility(); // Update panel visibility when image is cleared
});

// ── Modal attachment strip for multi-attachment notes ─────────────────────

let currentModalAttachments = [];   // full attachments[] array for open note
let currentModalAttachIdx  = 0;     // which one is active in the main preview
let pendingExtraAttachments = [];   // queued attachments on a new (unsaved) note

function renderModalAttachmentStrip(note) {
  const strip = document.getElementById('modalAttachmentStrip');
  if (!strip) return;

  const atts = (note && note.attachments && note.attachments.length > 0)
    ? note.attachments
    : null;

  currentModalAttachments = atts || [];
  currentModalAttachIdx   = 0;

  if (!atts || atts.length <= 1) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  strip.style.display = 'flex';
  strip.innerHTML = atts.map((att, idx) => {
    const isImg  = (att.attachment_type || 'image') === 'image';
    const thumb  = att.thumbnail || att.attachment_full || '';
    const thumbTag = isImg && thumb
      ? `<img src="${thumb}" alt="attachment ${idx+1}">`
      : `<div class="modal-att-icon">${att.attachment_type === 'pdf' ? '📄' : att.attachment_type === 'video' ? '🎬' : '📎'}</div>`;
    const activeCls = idx === 0 ? ' active' : '';
    const primaryBadge = idx === 0 ? `<div class="modal-att-primary-badge" title="Primary">★</div>` : '';
    return `<div class="modal-att-item${activeCls}" data-att-idx="${idx}" title="${idx === 0 ? 'Primary (click others to change)' : 'Click to make primary'}">
      ${thumbTag}
      <button type="button" class="modal-att-del" title="Delete this attachment" onclick="event.stopPropagation(); deleteModalAttachment(${idx})">✕</button>
      ${primaryBadge}
    </div>`;
  }).join('');

  // Click on strip item → make it the primary (and update preview)
  strip.querySelectorAll('.modal-att-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-att-del') || e.target.classList.contains('modal-att-del')) return;
      if (e.target.closest('.modal-att-del')) return;
      const idx = parseInt(item.dataset.attIdx);
      selectModalAttachment(idx);
    });
  });
}

async function selectModalAttachment(idx) {
  // In add-mode the strip is rendered from pendingExtraAttachments, not currentModalAttachments.
  // allItems[0] = primary, allItems[1..] = pending
  const isAddMode = !editingQuoteId && pendingExtraAttachments.length > 0;
  const allItems = isAddMode
    ? [{ thumbnail: currentQuoteImage, attachment_full: currentQuoteImageFull,
         attachment_type: currentAttachmentType, _isPrimary: true },
       ...pendingExtraAttachments]
    : currentModalAttachments;

  const att = allItems[idx];
  if (!att) return;

  // Show selected attachment in main preview immediately
  const previewThumb = att.thumbnail || att.attachment_full || '';
  const previewType  = att.attachment_type || 'image';
  if (previewType !== 'image') {
    displayAttachmentPreview(quoteImagePreview, getAttachmentIcon(previewType), 'Attachment', '');
  } else if (previewThumb) {
    displayImage(quoteImagePreview, previewThumb);
  }

  // Highlight active item right away for instant feedback
  const strip = document.getElementById('modalAttachmentStrip');
  if (strip) {
    strip.querySelectorAll('.modal-att-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
  }

  if (idx === 0) return; // Already primary — nothing to do

  // In edit mode: persist the change to the DB so the card shows correctly after save
  if (editingQuoteId && att.id) {
    try {
      const resp = await fetch(
        `/api/notes/${editingQuoteId}/attachments/${att.id}/make-primary`,
        { method: 'PATCH' }
      );
      if (resp.ok) {
        const updatedList = await resp.json();
        // Refresh currentModalAttachments so subsequent saves are consistent
        currentModalAttachments = updatedList;
        currentModalAttachIdx = 0;
        // Sync flat state with new position=0
        const newFirst = updatedList[0] || {};
        currentQuoteImage     = newFirst.thumbnail      || '';
        currentQuoteImageFull = newFirst.attachment_full || '';
        currentAttachmentType = newFirst.attachment_type || 'image';
        // Re-render strip (active highlight on the new position=0)
        renderModalAttachmentStrip({ attachments: updatedList });
        loadQuotes(); // refresh card in list
      }
    } catch (err) {
      console.warn('make-primary failed:', err);
    }
    return;
  }

  // Add-mode with pending queue: swap selected pending item to be the new primary
  if (!editingQuoteId) {
    // idx corresponds to allItems[idx] where allItems = [primary, ...pending]
    const pendingIdx = idx - 1; // 0-based index into pendingExtraAttachments
    if (pendingIdx >= 0 && pendingIdx < pendingExtraAttachments.length) {
      const newPrimary = pendingExtraAttachments[pendingIdx];
      const oldPrimary = {
        thumbnail:       currentQuoteImage,
        attachment_full: currentQuoteImageFull,
        attachment_type: currentAttachmentType,
        filename:        currentAttachmentFileName,
      };
      // Swap
      currentQuoteImage     = newPrimary.thumbnail      || '';
      currentQuoteImageFull = newPrimary.attachment_full || '';
      currentAttachmentType = newPrimary.attachment_type || 'image';
      pendingExtraAttachments[pendingIdx] = oldPrimary;
      renderPendingStrip();
      updateAttachmentPanelVisibility();
    }
  }
}

async function deleteModalAttachment(idx) {
  if (!editingQuoteId) return;
  const att = currentModalAttachments[idx];
  if (!att) return;
  const label = att.attachment_filename || att.attachment_type || `attachment ${idx + 1}`;
  if (!await showConfirm(`"${label}" will be removed from this note.`, { title: 'Remove attachment', danger: true })) return;

  try {
    const resp = await fetch(`/api/notes/${editingQuoteId}/attachments/${att.id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error(await resp.text());

    // Refresh note data and re-render the strip
    const updated = await fetch(`/api/quotes/${editingQuoteId}`).then(r => r.json());
    renderModalAttachmentStrip(updated);
    // Switch preview to first remaining attachment
    if (currentModalAttachments.length > 0) {
      selectModalAttachment(0);
    } else {
      currentQuoteImage = ''; currentQuoteImageFull = '';
      clearImagePreview(quoteImagePreview, 'quote');
    }
    updateAttachmentPanelVisibility();
    // Refresh card in list
    loadQuotes();
  } catch (err) {
    alert('Could not delete attachment: ' + err.message);
  }
}

window.deleteModalAttachment = deleteModalAttachment;

// ── Pending-attachment queue (add-mode only) ──────────────────────────────

async function queuePendingAttachment(file) {
  const globalSettings = getGlobalSettings();
  return new Promise((resolve) => {
    const callbacks = {
      onImageLoaded: (result) => {
        pendingExtraAttachments.push({
          thumbnail:       result.thumbnail,
          attachment_full: result.full,
          attachment_type: result.type || 'image',
          filename:        result.filename || file.name,
        });
        renderPendingStrip();
        resolve();
      },
      onAttachmentLoaded: (result) => {
        pendingExtraAttachments.push({
          thumbnail:       result.thumbnail || null,
          attachment_full: result.full,
          attachment_type: result.type || 'image',
          filename:        result.filename || file.name,
        });
        renderPendingStrip();
        resolve();
      },
    };
    readAttachmentFileLib(file, 'quote', globalSettings, callbacks);
  });
}

function renderPendingStrip() {
  const strip = document.getElementById('modalAttachmentStrip');
  if (!strip) return;
  if (pendingExtraAttachments.length === 0) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  strip.style.display = 'flex';
  // allItems: [primary, ...pending]  — idx=0 is always the primary
  const allItems = [
    { thumbnail: currentQuoteImage, attachment_full: currentQuoteImageFull,
      attachment_type: currentAttachmentType, _isPrimary: true },
    ...pendingExtraAttachments,
  ];

  strip.innerHTML = allItems.map((att, idx) => {
    const isImg = (att.attachment_type || 'image') === 'image';
    const thumb = att.thumbnail || att.attachment_full || '';
    const thumbTag = isImg && thumb
      ? `<img src="${thumb}" alt="attachment ${idx + 1}">`
      : `<div class="modal-att-icon">${att.attachment_type === 'pdf' ? '📄' : att.attachment_type === 'video' ? '🎬' : '📎'}</div>`;
    const activeCls  = idx === 0 ? ' active' : '';
    const titleAttr  = idx === 0 ? 'Primary — click others to change' : 'Click to make this the primary attachment';
    const primaryBadge = idx === 0 ? `<div class="modal-att-primary-badge" title="Primary">★</div>` : '';
    // Delete button only on non-primary (pending) items
    const delBtn = idx === 0 ? '' :
      `<button type="button" class="modal-att-del" title="Remove" onclick="event.stopPropagation(); removePendingAttachment(${idx - 1})">✕</button>`;
    return `<div class="modal-att-item${activeCls}" data-pending-idx="${idx}" title="${titleAttr}">
      ${thumbTag}${delBtn}${primaryBadge}
    </div>`;
  }).join('');

  // Wire up click handlers — clicking makes that item the primary
  strip.querySelectorAll('.modal-att-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.modal-att-del')) return;
      const idx = parseInt(item.dataset.pendingIdx);
      selectModalAttachment(idx);
    });
  });
}

async function removePendingAttachment(pendingIdx) {
  const att = pendingExtraAttachments[pendingIdx];
  const label = att?.name || att?.filename || `attachment ${pendingIdx + 1}`;
  if (!await showConfirm(`"${label}" has not been saved yet and will be discarded.`, { title: 'Remove attachment', danger: true })) return;
  pendingExtraAttachments.splice(pendingIdx, 1);
  renderPendingStrip();
}
window.removePendingAttachment = removePendingAttachment;

// ── Merge Modal ───────────────────────────────────────────────────────────────

let mergeModalNotes    = [];   // notes shown in the merge modal
let mergeMainNoteId    = null; // which note is marked as Main

function openMergeModal(notes) {
  if (!notes || notes.length < 2) {
    alert('Select at least 2 notes to merge.');
    return;
  }
  mergeModalNotes = notes;
  mergeMainNoteId = notes[0].id; // first is pre-selected as main
  renderMergeNotesList();
  document.getElementById('mergeCountLabel').textContent = `${notes.length} notes`;
  document.getElementById('mergeModal').style.display = 'block';
}

function closeMergeModal() {
  document.getElementById('mergeModal').style.display = 'none';
  mergeModalNotes = [];
  mergeMainNoteId = null;
  // Re-enable button without touching its inner HTML (the span#mergeCountLabel must stay)
  const btn = document.getElementById('executeMergeBtn');
  if (btn) btn.disabled = false;
  const lbl = document.getElementById('mergeCountLabel');
  if (lbl) lbl.textContent = '';
}
window.closeMergeModal = closeMergeModal;

function renderMergeNotesList() {
  const list = document.getElementById('mergeNotesList');
  if (!list) return;
  list.innerHTML = mergeModalNotes.map(note => {
    const isMain  = note.id === mergeMainNoteId;
    const thumb   = note.thumbnail
      ? `<img src="${note.thumbnail}" class="merge-note-thumb" alt="">`
      : `<div class="merge-note-thumb merge-note-nothumb">${note.attachment_type === 'pdf' ? '📄' : note.attachment_type === 'video' ? '🎬' : '📝'}</div>`;
    const title   = note.comment || note.note_date || `Note #${note.id}`;
    const snippet = (note.note_text || '').replace(/<[^>]+>/g, '').slice(0, 80);
    const attCount = note.attachments?.length || (note.thumbnail || note.attachment_full ? 1 : 0);
    const attBadge = attCount ? `<span class="merge-note-att-badge">📎 ${attCount}</span>` : '';
    return `<div class="merge-note-row ${isMain ? 'merge-note-main' : ''}" data-note-id="${note.id}" onclick="selectMergeMain(${note.id})">
      <div class="merge-note-main-radio">${isMain ? '★' : '○'}</div>
      ${thumb}
      <div class="merge-note-info">
        <div class="merge-note-title">${escapeHtml(title)}${attBadge}</div>
        <div class="merge-note-snippet">${escapeHtml(snippet)}</div>
      </div>
      ${isMain ? '<div class="merge-note-main-label">MAIN</div>' : ''}
    </div>`;
  }).join('');
}

function selectMergeMain(noteId) {
  mergeMainNoteId = noteId;
  renderMergeNotesList();
}
window.selectMergeMain = selectMergeMain;

async function executeMerge() {
  if (!mergeMainNoteId || mergeModalNotes.length < 2) return;
  const otherIds = mergeModalNotes.filter(n => n.id !== mergeMainNoteId).map(n => n.id);
  const appendTexts = document.getElementById('mergeAppendTexts')?.checked ?? true;
  const mergeTags   = document.getElementById('mergeTags')?.checked ?? true;

  const btn = document.getElementById('executeMergeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Merging… <span id="mergeCountLabel"></span>'; }

  try {
    const resp = await fetch('/api/notes/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainNoteId: mergeMainNoteId, otherNoteIds: otherIds, appendTexts, mergeTags }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const mergedNote = await resp.json();

    closeMergeModal();
    clearSelection();
    loadQuotes();
    loadTotalCount();

    // Open the merged note for cleanup
    setTimeout(() => openEditModal(mergedNote), 400);

  } catch (err) {
    alert('Merge failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = `🔀 Merge <span id="mergeCountLabel">${mergeModalNotes.length} notes</span>`; }
  }
}
window.executeMerge = executeMerge;

function openMergeModalFromSelection() {
  // Collect full note objects for selected IDs
  const notes = [...selectedNoteIds]
    .map(id => currentQuotesData?.find(n => n.id === id))
    .filter(Boolean);
  if (notes.length < 2) {
    // currentQuotesData may not have all; fall back to fetching
    fetchNotesByIds([...selectedNoteIds]).then(openMergeModal);
    return;
  }
  openMergeModal(notes);
}
window.openMergeModalFromSelection = openMergeModalFromSelection;

function openMergeModalFromGroup() {
  const notes = window._currentGroupNotes;
  if (!notes || notes.length < 2) {
    alert('No group loaded or group has fewer than 2 notes.');
    return;
  }
  openMergeModal(notes);
}
window.openMergeModalFromGroup = openMergeModalFromGroup;

async function fetchNotesByIds(ids) {
  const results = await Promise.all(
    ids.map(id => fetch(`${API_URL}/quotes/${id}`).then(r => r.json()).catch(() => null))
  );
  return results.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a file, generate thumbnail + full via the attachments library,
 * POST it to /api/notes/:id/attachments, then refresh the strip.
 */
async function addAttachmentFromFile(file, noteId) {
  const globalSettings = getGlobalSettings();

  return new Promise((resolve) => {
    const callbacks = {
      onImageLoaded: async (result) => {
        try {
          await postAttachmentToNote(noteId, {
            thumbnail:       result.thumbnail,
            attachment_full: result.full,
            attachment_type: result.type || 'image',
            filename:        result.filename || file.name,
          });
          resolve();
        } catch (err) {
          alert('Could not add attachment: ' + err.message);
          resolve();
        }
      },
      onAttachmentLoaded: async (result) => {
        try {
          await postAttachmentToNote(noteId, {
            thumbnail:       result.thumbnail || null,
            attachment_full: result.full,
            attachment_type: result.type || 'image',
            filename:        result.filename || file.name,
          });
          resolve();
        } catch (err) {
          alert('Could not add attachment: ' + err.message);
          resolve();
        }
      },
    };
    readAttachmentFileLib(file, 'quote', globalSettings, callbacks);
  });
}

async function postAttachmentToNote(noteId, attData) {
  const globalSettings = getGlobalSettings();
  const resp = await fetch(`/api/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...attData,
      storageThresholdMB: globalSettings?.storageThresholdMB || 1,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());

  // Refresh the strip with the updated note
  const updated = await fetch(`/api/quotes/${noteId}`).then(r => r.json());
  renderModalAttachmentStrip(updated);
  // Reload cards to reflect changes
  loadQuotes();
}

// ──────────────────────────────────────────────────────────────────────────

// Toggle attachment panel
const toggleAttachmentBtn = getElementByIdSafe(BUTTON_IDS.TOGGLE_ATTACHMENT_BTN, 'setupEventListeners');
if (toggleAttachmentBtn) {
  toggleAttachmentBtn.addEventListener('click', toggleAttachmentPanel);
}

// Handle click on modal image preview - open full-size viewer if image exists, otherwise open file dialog
quoteImagePreview.addEventListener('click', (e) => {
  // If there's an image attached, open the viewer
  if (currentQuoteImage || currentQuoteImageFull) {
    e.preventDefault();
    e.stopPropagation();
    const imageSrc = currentQuoteImageFull || currentQuoteImage;
    showFullImage(imageSrc, editingQuoteId, currentAttachmentType);
  } else {
    // No image - open file dialog
    quoteImageFile.click();
  }
});

// MIGRATED: Autocomplete functions (including tag autocomplete) moved to autocompleteManager.js

// ============= PAGINATION =============

function updatePaginationControls() {
  const paginationContainer = getElementByIdSafe("paginationControls");
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
  const totalPages = Math.ceil(filteredQuotes / quotesPerPage);
  if (page < 1 || page > totalPages) return;
  
  // Update both local and library currentPage
  currentPage = page;
  setLibCurrentPage(page);
  
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
      
      // Reset note type filter when clicking "All Notes" (app-specific logic)
      if (view === "quotes") {
        currentNoteTypeFilter = null;
        window.currentNoteTypeFilter = null; // Sync with global
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
      
      // MIGRATED: Core view switching logic now in pageCoordinator.js
      switchView(view);

      // Update active state only for view navigation items (not note-type filters)
      document.querySelectorAll('.menu-item[data-view]').forEach((mi) => mi.classList.remove("active"));
      item.classList.add("active");
      
      // Remove active state from note type filters when switching to non-quotes views
      if (view !== "quotes") {
        document.querySelectorAll('.note-type-filter').forEach(btn => btn.classList.remove('active'));
      }
    });
  });
}

// MIGRATED: View switching logic moved to pageCoordinator.js
function switchView(view) {
  switchViewLib(
    view,
    {
      loadQuotes,
      loadTotalCount,
      loadAuthors,
      loadSources,
      loadTags,
      toggleMetadataSearchSection,
      toggleTagOperationsPanel,
      renderQuoteTypesList,
      renderTrainingTypesList,
      renderNoteTypesList: () => renderNoteTypesList(generateNoteTypeMenu),
      setupTypeManagementListeners,
      rebuildNoteTypeMenu: generateNoteTypeMenu,
      populateTypeDropdowns,
      populateTypeFilterCheckboxes: () => populateTypeFilterCheckboxesLib(getQuoteTypes),
      populateTrainingTypeFilterCheckboxes: () => populateTrainingTypeFilterCheckboxesLib(getTrainingTypes)
    },
    {
      globalSettings
    }
  );
}
// Make global for filterByTag functionality
window.switchView = switchView;
window.loadQuotes = loadQuotes;
window.setLibCurrentPage = setLibCurrentPage;

/**
 * Switch the active note-type filter programmatically.
 * Used by filterByTag so clicking a tag in the Tags view respects the
 * type filter that was active there.
 * @param {string|null} noteType
 */
window.setNoteTypeFilter = function(noteType) {
  currentNoteTypeFilter = noteType || null;
  window.currentNoteTypeFilter = currentNoteTypeFilter;
  currentPage = 1;
  setLibCurrentPage(1);
  // Sync active state on the left-menu note-type buttons
  document.querySelectorAll('.note-type-filter').forEach(btn => {
    btn.classList.toggle('active', noteType ? btn.dataset.noteType === noteType : false);
  });
  // Keep "All Notes" button active when no type is selected
  const allNotesBtn = document.querySelector('.menu-item[data-view="quotes"]');
  if (allNotesBtn) allNotesBtn.classList.toggle('active', !noteType);
  updateAddButtonText?.();
  updateMainTitle?.();
  updateSourcesFilterVisibility?.();
};

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
    const totalCountElement = getElementByIdSafe("totalAuthorsCount");
    const filteredCountElement = getElementByIdSafe("filteredAuthorsCount");
    if (totalCountElement) {
      totalCountElement.textContent = totalCount;
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = filteredCount;
    }
  } catch (error) {
    console.error("Error loading authors:", error);
    getElementByIdSafe("authorsList").innerHTML =
      '<div class="no-items">Failed to load authors.</div>';
  }
}

function displayAuthors(authors) {
  const authorsList = getElementByIdSafe("authorsList");

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
    const filterBook = getElementByIdSafe("filterBook")?.checked !== false;
    const filterMovie = getElementByIdSafe("filterMovie")?.checked !== false;
    const filterPoetry = getElementByIdSafe("filterPoetry")?.checked !== false;
    const filterLyrics = getElementByIdSafe("filterLyrics")?.checked !== false;
    const filterJokes = getElementByIdSafe("filterJokes")?.checked !== false;

    const response = await fetch(`${API_URL}/sources`);
    let sources = await response.json();
    
    // Store total count
    const totalCount = sources.length;

    // Filter by type if filters exist AND at least one is unchecked
    if (getElementByIdSafe("filterBook")) {
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
    const totalCountElement = getElementByIdSafe("totalSourcesCount");
    const filteredCountElement = getElementByIdSafe("filteredSourcesCount");
    if (totalCountElement) {
      totalCountElement.textContent = totalCount;
    }
    if (filteredCountElement) {
      filteredCountElement.textContent = filteredCount;
    }
  } catch (error) {
    console.error("Error loading sources:", error);
    getElementByIdSafe("sourcesList").innerHTML =
      '<div class="no-items">Failed to load sources.</div>';
  }
}

function displaySources(sources) {
  const sourcesList = getElementByIdSafe("sourcesList");

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
async function loadTags(typeFilter = null) {
  // If no explicit filter is passed, respect whatever the tag-type dropdown currently shows
  const effective = typeFilter !== null
    ? typeFilter
    : (document.getElementById('tagTypeFilter')?.value || null);
  await loadTagsLib(effective);
  // Re-apply client-side search text filter if the user has typed something
  const searchVal = document.getElementById('searchSourcesInput')?.value;
  if (searchVal) filterTags();
}

// Make global for onclick handlers (direct library access)
window.filterByTag = filterByTagLib;
window.addToBrowseStack = addToBrowseStackLib;
window.removeFromBrowseStack = removeFromBrowseStackLib;
window.clearBrowseStack = clearBrowseStackLib;
window.showNotesForStack = showNotesForStackLib;

async function deleteTag(id, name) {
  return deleteTagLib(id, name);
}
// Make global for onclick handlers
window.deleteTag = deleteTag;

// MIGRATED: Filter functions now in searchManager.js (make library functions global for onclick handlers)
window.filterByAuthor = filterByAuthorLib;
window.filterBySource = filterBySourceLib;

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
  const modal = getElementByIdSafe('renameModal');
  const title = getElementByIdSafe('renameModalTitle');
  const input = getElementByIdSafe('renameInput');
  const warning = getElementByIdSafe('renameWarning');
  
  title.textContent = `Rename ${type}`;
  input.value = currentName;
  warning.style.display = 'none';
  
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function hideRenameModal() {
  const modal = getElementByIdSafe('renameModal');
  modal.style.display = 'none';
  renameContext = { type: null, id: null, oldName: null };
}

async function performRename() {
  const input = getElementByIdSafe('renameInput');
  const newName = input.value.trim();
  
  if (!newName) {
    alert('Please enter a name');
    return;
  }
  
  if (newName === renameContext.oldName) {
    hideRenameModal();
    return;
  }
  
  const confirmBtn = getElementByIdSafe('renameConfirmBtn');
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
  const renameModal = getElementByIdSafe('renameModal');
  const renameCancelBtn = getElementByIdSafe('renameCancelBtn');
  const renameConfirmBtn = getElementByIdSafe('renameConfirmBtn');
  const renameInput = getElementByIdSafe('renameInput');
  
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
  const renameTagBtn = getElementByIdSafe('renameTagBtn');
  const renameTagInput = getElementByIdSafe('renameTagInput');
  const renameTagNewName = getElementByIdSafe('renameTagNewName');
  
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
  const addTagToTaggedBtn = getElementByIdSafe('addTagToTaggedBtn');
  const sourceTagInput = getElementByIdSafe('sourceTagInput');
  const targetTagInput = getElementByIdSafe('targetTagInput');
  
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
      
      if (!await showConfirm(confirmMessage, { icon: '🏷️', title: 'Add tag to notes', confirmLabel: 'Add tag' })) {
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
  await exportToPdfLib({
    currentNoteTypeFilter,
    exportBtn: getElementByIdSafe("exportPdfBtn", "exportToPdf"),
    getQuoteTypes,
    getTrainingTypes,
  });
}

// ============= JSON EXPORT/IMPORT =============

async function exportToJson() {
  await exportToJsonLib({
    currentNoteTypeFilter,
    exportBtn: getElementByIdSafe("exportJsonBtn"),
  });
}

async function handleImportFile(event) {
  await handleImportFileLib(event, {
    importProgress: getElementByIdSafe("importProgress"),
    importStatus: getElementByIdSafe("importStatus"),
    selectFileBtn: getElementByIdSafe("selectFileBtn"),
    importModal: getElementByIdSafe("importModal"),
    onImportComplete: () => {
      currentPage = 1;
      setLibCurrentPage(1);
      loadQuotes();
      loadTotalCount();
    },
  });
}

// ============= MANUAL SELECTION =============

function toggleSelectionMode() {
  selectionMode = !selectionMode;
  document.body.classList.toggle('selection-mode', selectionMode);
  const btn = document.getElementById('selectModeBtn');
  if (btn) {
    btn.classList.toggle('active', selectionMode);
    btn.textContent = selectionMode ? '✕ Exit Select' : '☑ Select';
  }
  if (!selectionMode) {
    clearSelection();
  }
}

function toggleNoteSelection(card, noteId) {
  const id = parseInt(noteId, 10);
  if (selectedNoteIds.has(id)) {
    selectedNoteIds.delete(id);
    card.classList.remove('selected');
  } else {
    selectedNoteIds.add(id);
    card.classList.add('selected');
  }
  updateSelectionBar();
}

function selectAllOnPage() {
  document.querySelectorAll('.quote-card').forEach(card => {
    const id = parseInt(card.dataset.quoteId, 10);
    if (id) {
      selectedNoteIds.add(id);
      card.classList.add('selected');
    }
  });
  updateSelectionBar();
}

function clearSelection() {
  selectedNoteIds.clear();
  document.querySelectorAll('.quote-card.selected').forEach(c => c.classList.remove('selected'));
  updateSelectionBar();
}

function updateSelectionBar() {
  const bar = document.getElementById('selectionBar');
  const countEl = document.getElementById('selectionCount');
  if (!bar) return;
  const count = selectedNoteIds.size;
  if (count > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = count;
  } else {
    bar.style.display = 'none';
  }
  // Keep bulk-scope-selected count in sync if modal is open
  const selCount = document.getElementById('bulkScopeSelectedCount');
  if (selCount) selCount.textContent = count;
}

// ============= BULK OPERATIONS =============

function getCurrentFilters() {
  // Helper to get value silently for optional elements (no warnings)
  // Uses raw getElementById for elements that only exist in certain views
  const getOptionalValue = (id) => {
    const element = document.getElementById(id);
    return element?.value || '';
  };
  
  // Helper to get metadata checkbox state (checkbox + condition)
  // Returns 'true' if checked and condition is 'has', 'false' if checked and condition is 'not'
  const getMetadataState = (checkboxId, conditionId) => {
    const checkbox = document.getElementById(checkboxId);
    const condition = document.getElementById(conditionId);
    if (!checkbox || !checkbox.checked) return '';
    return condition?.value === 'not' ? 'false' : 'true';
  };
  
  const filters = {
    note_type: currentNoteTypeFilter,
    author_id: getOptionalValue(FILTER_IDS.AUTHOR_FILTER), // Only exists in quotes view
    source_id: getOptionalValue(FILTER_IDS.SOURCE_FILTER), // Only exists in quotes view
    search: getElementValue(FILTER_IDS.SEARCH_QUOTE),
    tag: getElementValue(FILTER_IDS.SEARCH_TAGS),
    types: getCheckedValues(CSS_CLASSES.TYPE_CHECKBOX).join(','),
    training_types: getCheckedValues(CSS_CLASSES.TRAINING_TYPE_CHECKBOX).join(','),
    year: getOptionalValue(FILTER_IDS.YEAR_FILTER), // Only exists in training view
    month: getOptionalValue(FILTER_IDS.MONTH_FILTER), // Only exists in training view
    score: getElementValue(FILTER_IDS.SEARCH_SCORE),
    hasAuthor: getMetadataState(FILTER_IDS.HAS_AUTHOR_CHECKBOX, FILTER_IDS.HAS_AUTHOR_CONDITION),
    hasSource: getMetadataState(FILTER_IDS.HAS_SOURCE_CHECKBOX, FILTER_IDS.HAS_SOURCE_CONDITION),
    hasNote: getMetadataState(FILTER_IDS.HAS_NOTE_CHECKBOX, FILTER_IDS.HAS_NOTE_CONDITION),
    hasTags: getMetadataState(FILTER_IDS.HAS_TAGS_CHECKBOX, FILTER_IDS.HAS_TAGS_CONDITION),
    hasImage: getMetadataState(FILTER_IDS.HAS_IMAGE_CHECKBOX, FILTER_IDS.HAS_IMAGE_CONDITION),
    hasImageType: getMetadataState(FILTER_IDS.HAS_IMAGE_TYPE_CHECKBOX, FILTER_IDS.HAS_IMAGE_TYPE_CONDITION),
    hasTranslationGroup: getMetadataState(FILTER_IDS.HAS_TRANSLATION_GROUP_CHECKBOX, FILTER_IDS.HAS_TRANSLATION_GROUP_CONDITION),
    hasMultipleAttachments: getMetadataState(FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CHECKBOX, FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CONDITION),
  };
  
  return filters;
}

function getFilterSummary() {
  const filters = getCurrentFilters();
  const parts = [];
  
  if (filters.note_type) parts.push(`Type: ${filters.note_type}`);
  if (filters.author_id && filters.author_id !== 'all') {
    const authorSelect = getElementByIdSafe("authorFilter", "getFilterSummary");
    const authorName = authorSelect?.options[authorSelect.selectedIndex]?.text || 'Unknown';
    parts.push(`Author: ${authorName}`);
  }
  if (filters.source_id && filters.source_id !== 'all') {
    const sourceSelect = getElementByIdSafe("sourceFilter", "getFilterSummary");
    const sourceName = sourceSelect?.options[sourceSelect.selectedIndex]?.text || 'Unknown';
    parts.push(`Source: ${sourceName}`);
  }
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  if (filters.tag) parts.push(`Tags: ${filters.tag}`);
  if (filters.year) parts.push(`Year: ${filters.year}`);
  if (filters.month && filters.year) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    parts.push(`Month: ${months[parseInt(filters.month) - 1]}`);
  }
  if (filters.score) parts.push(`Score: ${filters.score}`);
  
  return parts.length > 0 ? parts.join(' | ') : 'No filters applied';
}

async function openBulkOperationsModal() {
  const modal = getElementByIdSafe("bulkOperationsModal");
  const countElement = getElementByIdSafe("bulkOpsCount");
  const filtersElement = getElementByIdSafe("bulkOpsFilters");
  const scopeRow = document.getElementById('bulkOpsScopeRow');
  const scopeLabel = document.getElementById('bulkOpsScopeLabel');
  
  modal.style.display = "block";
  countElement.textContent = "...";
  filtersElement.textContent = "";

  // Show/hide scope toggle based on whether there are selected notes
  const hasSelection = selectedNoteIds.size > 0;
  if (scopeRow) scopeRow.style.display = hasSelection ? 'block' : 'none';

  // Populate scope button counts
  const selCountEl = document.getElementById('bulkScopeSelectedCount');
  if (selCountEl) selCountEl.textContent = selectedNoteIds.size;

  // Sync scope button active states
  _syncScopeBtns();

  try {
    if (bulkOpsScope === 'selected') {
      // Selected scope — count is already known
      countElement.textContent = selectedNoteIds.size;
      if (scopeLabel) scopeLabel.textContent = 'Selected notes:';
      if (filtersElement) filtersElement.textContent = `${selectedNoteIds.size} notes manually selected`;
    } else {
      // Filter scope — fetch from server
      if (scopeLabel) scopeLabel.textContent = 'Currently filtered:';
      const filters = getCurrentFilters();
      const response = await fetch(`${API_URL}/quotes/bulk-count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters })
      });
      const result = await response.json();
      countElement.textContent = result.count || 0;
      // Keep scope filtered count in sync
      const filtCountEl = document.getElementById('bulkScopeFilteredCount');
      if (filtCountEl) filtCountEl.textContent = result.count || 0;
      if (filtersElement) filtersElement.textContent = getFilterSummary();
    }
    
    // Setup autocomplete
    const bulkTagInput = getElementByIdSafe("bulkTagInput");
    const bulkTagSuggestions = getElementByIdSafe("bulkTagSuggestions");
    if (bulkTagInput && bulkTagSuggestions) {
      setupAutocompleteInput(bulkTagInput, bulkTagSuggestions, 'tags', currentNoteTypeFilter);
    }
    const bulkUntagInput = getElementByIdSafe("bulkUntagInput");
    const bulkUntagSuggestions = getElementByIdSafe("bulkUntagSuggestions");
    if (bulkUntagInput && bulkUntagSuggestions) {
      setupAutocompleteInput(bulkUntagInput, bulkUntagSuggestions, 'tags', currentNoteTypeFilter);
    }
    
  } catch (error) {
    console.error("Error fetching filtered count:", error);
    countElement.textContent = "Error";
  }
}

function _syncScopeBtns() {
  const btnFiltered = document.getElementById('bulkScopeFiltered');
  const btnSelected = document.getElementById('bulkScopeSelected');
  if (btnFiltered) btnFiltered.classList.toggle('bulk-scope-active', bulkOpsScope === 'filtered');
  if (btnSelected) btnSelected.classList.toggle('bulk-scope-active', bulkOpsScope === 'selected');
}

function closeBulkOperationsModal() {
  const modal = getElementByIdSafe("bulkOperationsModal");
  modal.style.display = "none";
  _clearBulkTagQueue();
  const groupInput = document.getElementById('bulkGroupInput');
  if (groupInput) groupInput.value = '';
}

// ── Multi-tag queue for bulk tagging ──────────────────────────────────────
let _bulkTagQueue = [];

function addBulkTagFromInput() {
  const input = document.getElementById('bulkTagInput');
  const value = input?.value?.trim();
  if (!value) return;
  if (_bulkTagQueue.includes(value)) { input.value = ''; return; }
  _bulkTagQueue.push(value);
  input.value = '';
  // hide autocomplete
  const sug = document.getElementById('bulkTagSuggestions');
  if (sug) sug.classList.remove('show');
  _renderBulkTagBadges();
}

function _removeBulkTag(name) {
  _bulkTagQueue = _bulkTagQueue.filter(t => t !== name);
  _renderBulkTagBadges();
}
window._removeBulkTag = _removeBulkTag;

function _renderBulkTagBadges() {
  const container = document.getElementById('bulkTagBadges');
  const applyBtn  = document.getElementById('bulkTagExecuteBtn');
  if (!container) return;

  container.innerHTML = _bulkTagQueue.map(tag => `
    <span class="bulk-tag-badge">
      ${escapeHtml(tag)}
      <span onclick="_removeBulkTag('${escapeHtml(tag).replace(/'/g, "\\'")}')">×</span>
    </span>
  `).join('');

  if (applyBtn) {
    if (_bulkTagQueue.length > 0) {
      applyBtn.style.display = 'block';
      applyBtn.textContent = `Apply ${_bulkTagQueue.length} tag${_bulkTagQueue.length > 1 ? 's' : ''} to Notes`;
    } else {
      applyBtn.style.display = 'none';
    }
  }
}

function _clearBulkTagQueue() {
  _bulkTagQueue = [];
  _renderBulkTagBadges();
  const input = document.getElementById('bulkTagInput');
  if (input) input.value = '';
}
// ─────────────────────────────────────────────────────────────────────────────

function _getBulkPayloadAndLabel() {
  if (bulkOpsScope === 'selected' && selectedNoteIds.size > 0) {
    return {
      payload: { noteIds: [...selectedNoteIds], noteType: currentNoteTypeFilter || 'quote' },
      count: selectedNoteIds.size,
      label: 'selected notes'
    };
  }
  return {
    payload: { filters: getCurrentFilters() },
    count: parseInt(document.getElementById('bulkOpsCount')?.textContent, 10) || 0,
    label: 'filtered notes'
  };
}

async function handleBulkTag() {
  // If there's still text in the input, add it to the queue first
  const tagInput = document.getElementById("bulkTagInput");
  const pendingValue = tagInput?.value?.trim();
  if (pendingValue && !_bulkTagQueue.includes(pendingValue)) {
    _bulkTagQueue.push(pendingValue);
    if (tagInput) tagInput.value = '';
    _renderBulkTagBadges();
  }

  if (_bulkTagQueue.length === 0) {
    alert("⚠️ Please add at least one tag");
    tagInput?.focus();
    return;
  }

  const { payload, count, label } = _getBulkPayloadAndLabel();

  if (count === 0) {
    alert("⚠️ No notes to tag");
    return;
  }

  const tagList = _bulkTagQueue.map(t => `"${t}"`).join(', ');
  if (!await showConfirm(`Add ${_bulkTagQueue.length} tag(s) — ${tagList} — to ${count} ${label}?`, {
    icon: '🏷️', title: 'Bulk tag notes', confirmLabel: 'Add tags'
  })) {
    return;
  }

  const applyBtn = document.getElementById('bulkTagExecuteBtn');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳ Applying…'; }

  try {
    // Apply each tag in sequence
    const results = [];
    for (const tagName of _bulkTagQueue) {
      const response = await fetch(`${API_URL}/quotes/bulk-tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, tagName })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Failed to apply tag "${tagName}"`);
      results.push(`"${tagName}" → ${result.count} notes tagged`);
    }

    _clearBulkTagQueue();
    closeBulkOperationsModal();
    loadQuotes();
    alert(`✅ Done!\n\n${results.join('\n')}`);
  } catch (error) {
    console.error("Bulk tag error:", error);
    alert(`❌ ${error.message}`);
  } finally {
    if (applyBtn) { applyBtn.disabled = false; _renderBulkTagBadges(); }
  }
}

async function handleBulkUntag() {
  const untagInput = getElementByIdSafe("bulkUntagInput");
  const tagName = untagInput?.value?.trim();
  
  if (!tagName) {
    alert("⚠️ Please enter a tag name to remove");
    untagInput?.focus();
    return;
  }
  
  const { payload, count, label } = _getBulkPayloadAndLabel();
  
  if (count === 0) {
    alert("⚠️ No notes to untag");
    return;
  }
  
  if (!await showConfirm(`Remove tag "${tagName}" from ${count} ${label}?`, {
    icon: '🏷️', title: 'Bulk remove tag', danger: true, confirmLabel: 'Remove'
  })) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/quotes/bulk-untag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, tagName })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      alert(`✅ ${result.message}`);
      untagInput.value = '';
      closeBulkOperationsModal();
      loadQuotes();
    } else {
      alert(`❌ Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Bulk untag error:", error);
    alert("❌ Failed to remove tag from notes. Check console for details.");
  }
}

async function handleBulkSetGroup() {
  const input = document.getElementById('bulkGroupInput');
  const groupName = input?.value?.trim();

  if (!groupName) {
    alert("⚠️ Please enter a group name");
    input?.focus();
    return;
  }

  const { payload, count, label } = _getBulkPayloadAndLabel();

  if (count === 0) {
    alert("⚠️ No notes to group");
    return;
  }

  if (!await showConfirm(`Set group "${groupName}" on ${count} ${label}?`, {
    icon: '🔗', title: 'Set Group', confirmLabel: 'Set Group'
  })) return;

  const btn = document.getElementById('bulkGroupExecuteBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Applying…'; }

  try {
    const response = await fetch(`${API_URL}/quotes/bulk-set-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, groupName })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to set group');

    if (input) input.value = '';
    closeBulkOperationsModal();
    loadQuotes();
    alert(`✅ Group "${groupName}" set on ${result.count} notes`);
  } catch (error) {
    console.error("Bulk set-group error:", error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Set Group'; }
  }
}

async function handleBulkExportPdf() {
  closeBulkOperationsModal();
  await exportToPdf();
}

async function handleBulkDelete() {
  const { payload, count, label } = _getBulkPayloadAndLabel();
  
  if (count === 0) {
    alert("No notes to delete.");
    return;
  }
  
  const confirmation = prompt(
    `⚠️ WARNING: This will PERMANENTLY delete ${count} ${label}!\n\n` +
    `Type "DELETE ${count}" to confirm:`
  );
  
  if (confirmation !== `DELETE ${count}`) {
    alert("Deletion cancelled.");
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/quotes/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      alert(`✅ ${result.message}`);
      closeBulkOperationsModal();
      clearSelection();
      currentPage = 1;
      setLibCurrentPage(1);
      loadQuotes();
      loadTotalCount();
    } else {
      alert(`❌ Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Bulk delete error:", error);
    alert("❌ Failed to delete notes. Check console for details.");
  }
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
    const overlay = getElementByIdSafe("welcomeQuoteOverlay");
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
  const randomQuoteBtn = getElementByIdSafe("randomQuoteBtn");
  if (randomQuoteBtn) {
    randomQuoteBtn.addEventListener("click", () => showWelcomeQuote(true));
  }
});

// Search tags functionality
window.allTags = []; // Make it global so tagsManager can update it
let currentSortBy = "name";

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = getElementByIdSafe("searchSourcesInput");
  const sortByName = getElementByIdSafe("sortTagsByName");
  const sortByCount = getElementByIdSafe("sortTagsByCount");
  const tagTypeFilter = getElementByIdSafe("tagTypeFilter");
  
  if (searchInput) {
    searchInput.addEventListener("input", filterTags);
  }
  
  if (tagTypeFilter) {
    tagTypeFilter.addEventListener("change", () => {
      const selectedType = tagTypeFilter.value || null;
      loadTags(selectedType);
    });
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
  const searchValue = getElementByIdSafe("searchSourcesInput")?.value.toLowerCase() || "";
  const tagTypeFilter = getElementByIdSafe("tagTypeFilter");
  const selectedType = tagTypeFilter ? tagTypeFilter.value || null : null;
  
  // Get current tags (filtered by type from last loadTags call)
  let filteredTags = window.allTags.filter(tag => 
    tag.name.toLowerCase().includes(searchValue)
  );
  
  if (currentSortBy === "count") {
    filteredTags.sort((a, b) => b.quote_count - a.quote_count);
  } else {
    filteredTags.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Update counters
  const totalCountElement = getElementByIdSafe("totalTagsCount");
  const filteredCountElement = getElementByIdSafe("filteredTagsCount");
  if (totalCountElement) {
    totalCountElement.textContent = window.allTags.length;
  }
  if (filteredCountElement) {
    filteredCountElement.textContent = filteredTags.length;
  }
  
  // Use the library's display function
  displayTagsLib(filteredTags);
}

// Tag Management for Quote Modal
let selectedTagsArray = [];

function initializeTagInput() {
  const tagInput = getElementByIdSafe('tagInput');
  const addTagBtn = getElementByIdSafe('addTagBtn');
  const tagInputSuggestions = getElementByIdSafe('tagInputSuggestions');
  
  if (!tagInput || !addTagBtn) return;
  
  // Autocomplete for tag input - match ONLY existing tags filtered by note type
  tagInput.addEventListener('input', async (e) => {
    const search = e.target.value.trim();
    
    if (search.length < 1) {
      tagInputSuggestions.classList.remove('show');
      return;
    }
    
    try {
      // Get current note type from the modal
      const noteTypeSelect = getElementByIdSafe('noteType');
      const currentModalNoteType = noteTypeSelect?.value || 'quote';
      
      // Fetch tags filtered by type
      const response = await fetch(`${API_URL}/tags?search=${encodeURIComponent(search)}&type=${currentModalNoteType}`);
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
  const tagInput = getElementByIdSafe('tagInput');
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
  getElementByIdSafe('tags').value = selectedTagsArray.join(',');
  
  // Clear input
  tagInput.value = '';
  getElementByIdSafe('tagInputSuggestions').classList.remove('show');
}

function removeTag(tagName) {
  selectedTagsArray = selectedTagsArray.filter(t => t !== tagName);
  updateSelectedTagsDisplay();
  getElementByIdSafe('tags').value = selectedTagsArray.join(',');
}
// Make global for onclick handlers
window.removeTag = removeTag;

function updateSelectedTagsDisplay() {
  const container = getElementByIdSafe('selectedTags');
  if (!container) return;
  
  if (selectedTagsArray.length === 0) {
    container.innerHTML = '';
    // IMPORTANT: Also clear the hidden input field!
    getElementByIdSafe('tags').value = '';
    return;
  }
  
  container.innerHTML = selectedTagsArray.map(tag => `
    <span class="tag-removable" style="background: var(--tag-color); color: white; padding: 0.35rem 0.6rem; border-radius: 12px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer;">
      ${escapeHtml(tag)}
      <span onclick="removeTag('${escapeHtml(tag).replace(/'/g, "\\'")}')" style="font-weight: bold; cursor: pointer;">&times;</span>
    </span>
  `).join('');
  
  // Update hidden input with current tags
  getElementByIdSafe('tags').value = selectedTagsArray.join(',');
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
  getElementByIdSafe('tags').value = selectedTagsArray.join(',');
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
  const imageSection = getElementByIdSafe('imageSection');
  const toggleIcon = getElementByIdSafe('imageToggleIcon');
  
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

// Manage attachment panel and toggle button state based on whether there's an attachment
function updateAttachmentPanelVisibility() {
  const container = document.getElementById(CONTAINER_IDS.ATTACHMENT_CONTAINER);
  const toggleBtn = document.getElementById(BUTTON_IDS.TOGGLE_ATTACHMENT_BTN);

  if (!container || !toggleBtn) return;

  const hasAttachment = currentQuoteImage || currentQuoteImageFull;

  // Panel is always shown once the user opens it or has an attachment
  toggleBtn.disabled = false;

  if (hasAttachment) {
    container.classList.remove('hidden');
    const pendingCount = pendingExtraAttachments.length;
    const extra = pendingCount > 0 ? ` (+${pendingCount})` : '';
    toggleBtn.textContent = `📎 Add more${extra}`;
    toggleBtn.title = 'Add another attachment';
  } else {
    container.classList.add('hidden');
    toggleBtn.textContent = '📎 Add attachment';
    toggleBtn.title = 'Show attachment panel';
  }
}

// Toggle attachment panel
function toggleAttachmentPanel() {
  const container = document.getElementById(CONTAINER_IDS.ATTACHMENT_CONTAINER);
  const toggleBtn = document.getElementById(BUTTON_IDS.TOGGLE_ATTACHMENT_BTN);
  if (!container || !toggleBtn) return;

  const hasAttachment = currentQuoteImage || currentQuoteImageFull;

  // Has attachment (edit or add mode): open file picker directly to add another
  if (hasAttachment) {
    quoteImageFile.click();
    return;
  }

  // Otherwise: toggle panel visibility
  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    toggleBtn.textContent = hasAttachment ? '📎 Attachment' : '📎 Hide';
    toggleBtn.title = 'Hide attachment panel';
  } else {
    container.classList.add('hidden');
    toggleBtn.textContent = '📎 Add attachment';
    toggleBtn.title = 'Show attachment panel';
  }
}

// Update image indicator in modal
function updateImageIndicator() {
  // No-op: Image indicator removed as attachment section is always visible
  // Keeping function to avoid breaking existing calls
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
  
  // Create wrapper functions for filter checkbox population
  const populateTypeFilterCheckboxesWrapper = () => populateTypeFilterCheckboxesLib(getQuoteTypes);
  const populateTrainingTypeFilterCheckboxesWrapper = () => populateTrainingTypeFilterCheckboxesLib(getTrainingTypes);
  
  // Initialize settings UI (using settingsManager library)
  initializeSettingsLib({
    loadQuotes,
    populateTypeDropdowns,
    populateTypeFilterCheckboxes: populateTypeFilterCheckboxesWrapper,
    populateTrainingTypeFilterCheckboxes: populateTrainingTypeFilterCheckboxesWrapper,
    renderNoteTypesList: () => renderNoteTypesList(generateNoteTypeMenu),
    setupTypeManagementListeners,
    rebuildNoteTypeMenu: generateNoteTypeMenu,
    renderQuoteTypesList,
    renderTrainingTypesList,
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
function _syncImageTypeFilterState() {
  const attachCheckbox  = document.getElementById('searchHasImage');
  const attachCondition = document.getElementById('searchImageCondition');
  const imageCheckbox   = document.getElementById('searchHasImageType');
  const imageCondition  = document.getElementById('searchImageTypeCondition');
  const imageItem       = document.getElementById('imageTypeFilterItem');
  const multiCheckbox   = document.getElementById('searchHasMultipleAttachments');
  const multiCondition  = document.getElementById('searchMultipleAttachmentsCondition');
  const multiItem       = document.getElementById('multipleAttachmentsFilterItem');

  const enabled = attachCheckbox?.checked && attachCondition?.value === 'has';

  if (imageCheckbox) {
    imageCheckbox.disabled = !enabled;
    if (!enabled) imageCheckbox.checked = false;
  }
  if (imageCondition) {
    imageCondition.disabled = !enabled;
  }
  if (imageItem) {
    imageItem.classList.toggle('metadata-filter-disabled', !enabled);
  }

  if (multiCheckbox) {
    multiCheckbox.disabled = !enabled;
    if (!enabled) multiCheckbox.checked = false;
  }
  if (multiCondition) {
    multiCondition.disabled = !enabled;
  }
  if (multiItem) {
    multiItem.classList.toggle('metadata-filter-disabled', !enabled);
  }
}

function setupMetadataSearchListeners() {
  const metadataCheckboxes = [
    'searchHasAuthor', 'searchHasSource', 'searchHasNote',
    'searchHasTags', 'searchHasImage', 'searchHasImageType',
    'searchHasTranslationGroup', 'searchHasMultipleAttachments'
  ];
  
  const metadataSelects = [
    'searchAuthorCondition', 'searchSourceCondition', 'searchNoteCondition',
    'searchTagsCondition', 'searchImageCondition', 'searchImageTypeCondition',
    'searchTranslationGroupCondition', 'searchMultipleAttachmentsCondition'
  ];
  
  // Add listeners to checkboxes
  metadataCheckboxes.forEach(id => {
    const checkbox = getElementByIdSafe(id);
    if (checkbox && !checkbox.hasAttribute('data-listener')) {
      checkbox.addEventListener('change', () => {
        if (id === 'searchHasImage') _syncImageTypeFilterState();
        currentPage = 1;
        setLibCurrentPage(1);
        loadQuotes();
      });
      checkbox.setAttribute('data-listener', 'true');
    }
  });
  
  // Add listeners to dropdowns
  metadataSelects.forEach(id => {
    const select = getElementByIdSafe(id);
    if (select && !select.hasAttribute('data-listener')) {
      select.addEventListener('change', () => {
        if (id === 'searchImageCondition') _syncImageTypeFilterState();
        currentPage = 1;
        setLibCurrentPage(1);
        loadQuotes();
      });
      select.setAttribute('data-listener', 'true');
    }
  });

  // Set initial state
  _syncImageTypeFilterState();
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
