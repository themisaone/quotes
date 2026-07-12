// ============= IMPORTS =============
import {
  parseUrlHash,
  updateUrlHash as updateUrlHashLib,
  updateActiveMenuState as updateActiveMenuStateLib,
  updatePageTitle as updatePageTitleLib
} from './js/lib/viewManager.js?v=20260629mobiletitle1';

import {
  escapeHtml,
  getAttachmentIcon
} from './js/lib/utils.js?v=20260703color1';

import {
  readAttachmentFile as readAttachmentFileLib,
  readImageFile as readImageFileLib,
  handlePasteEvent,
  displayImage as displayImageLib,
  clearImagePreview as clearImagePreviewLib,
  displayAttachmentPreview as displayAttachmentPreviewLib,
  downscaleAndMoveToDb as downscaleAndMoveToDbLib,
  resizeImage as resizeImageLib
} from './js/lib/attachments.js?v=20260318l';

import {
  getNoteTypeConfig,
  getNoteTypes,
  initNoteTypes,
  updateModalFieldVisibility,
  updateModalLabels,
  updateAddButtonText as updateAddButtonTextLib,
  hasGenericSubTypeField,
  getGenericSubTypes,
  hasAuthorField,
  hasSourceField,
  hasDateField
} from './js/lib/noteTypes.js';

import {
  createQuoteCard as createQuoteCardLib
} from './js/lib/cardRenderer.js?v=20260712emptytitle1';

import {
  setupAddModal,
  setupEditModal
} from './js/lib/modalRenderer.js?v=20260704trainingdate1';

import {
  exportToPdf as exportToPdfLib,
  exportToJson as exportToJsonLib,
  handleImportFile as handleImportFileLib,
  resetImportModal,
  pruneUnusedEntitiesRequest,
  rehomeAttachmentsRequest,
  vaultHealthCheckRequest,
  runtimeInfoRequest,
} from './js/lib/dataManager.js?v=20260626datamgmt1';

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
  getDisplaySetting,
  getNoteTypeDefaultDisplayMode,
  initializeSettings as initializeSettingsLib,
  refreshSettingsForOptionsPanel
} from './js/lib/settingsManager.js?v=20260710fontselect3';

import {
  loadServicesPanel,
  wireServicesRefresh
} from './js/lib/servicesManager.js?v=20260613services5';

import {
  openAuthorModal as openAuthorModalLib,
  setupAuthorModalHandlers
} from './js/lib/authorModal.js?v=20260512modalshownotes';

import {
  openSourceModal as openSourceModalLib,
  setupSourceModalHandlers
} from './js/lib/sourceModal.js?v=20260512modalshownotes';

import { initDedupSuspectsPanel } from './js/lib/dedupSuspectsPanel.js?v=20260708noimagewide1';

import {
  loadTags as loadTagsLib,
  filterByTag as filterByTagLib,
  deleteTag as deleteTagLib,
  displayTags as displayTagsLib,
  addToBrowseStack as addToBrowseStackLib,
  removeFromBrowseStack as removeFromBrowseStackLib,
  clearBrowseStack as clearBrowseStackLib,
  showNotesForStack as showNotesForStackLib
} from './js/lib/tagsManager.js?v=20260317f';

import {
  loadQuotes as loadQuotesLib,
  loadTotalCount as loadTotalCountLib,
  displayQuotes as displayQuotesLib,
  getCurrentQuotesData,
  setCurrentPage as setLibCurrentPage,
  setQuotesPerPage,
  getQuotesPerPage
} from './js/lib/displayManager.js?v=20260712emptytitle1';

import {
  populateTypeFilterCheckboxes as populateTypeFilterCheckboxesLib,
  populateTrainingTypeFilterCheckboxes as populateTrainingTypeFilterCheckboxesLib,
  updateTrainingTypeSummary,
  updateQuoteSourcesSummary,
  clearFilters as clearFiltersLib,
  updateSourcesFilterVisibility as updateSourcesFilterVisibilityLib2,
  initializeFilterHandlers
} from './js/lib/filterManager.js?v=20260628searchscope1';

import {
  filterByAuthor as filterByAuthorLib,
  filterBySource as filterBySourceLib,
  initializeSearchHandlers,
  registerGlobalSearchFunctions,
  clearSearchFields
} from './js/lib/searchManager.js?v=20260614searchany1';

import {
  initializeAutocomplete,
  setupAutocompleteInput
} from './js/lib/autocompleteManager.js?v=20260512entityshow';

import {
  FILTER_IDS,
  BUTTON_IDS,
  CONTAINER_IDS,
  getElementByIdSafe,
  getElementValue,
  getCheckboxState
} from './js/constants.js';

import {
  initializeQuillEditor,
  handleFormSubmit as handleFormSubmitLib,
  deleteQuote as deleteQuoteLib
} from './js/lib/quoteEditor.js?v=20260703nofullscreen1';

import {
  initializeBulkImport,
  getBulkImportInputs
} from './js/lib/bulkImport.js';

import {
  initializeTranslationGroups
} from './js/lib/translationGroups.js';

import {
  showFullImage as showFullImageLib,
  showPDFViewer,
  showVideoPlayer,
  showAudioPlayer,
  downloadAttachment
} from './js/lib/attachmentViewer.js?v=20260318f';

import {
  switchView as switchViewLib,
  setupMenuNavigation as setupMenuNavigationLib,
  handleHashChange,
  initializeHashChangeListener
} from './js/lib/pageCoordinator.js?v=20260704sourcesdropdown1';
import { showConfirm, showPdfExportConfirm } from './js/lib/confirmDialog.js';
import { encryptFileBuffer, decryptFileBuffer } from './js/lib/cryptoUtils.js';
import {
  renderListPaneView,
  refreshPaneNote,
  getSelectedNoteId as getLpSelectedNoteId,
  setPendingInitialNoteId,
  resolveInitialNoteId,
  alignTrainingFiltersToDate,
  getTrainingSubMode,
  setTrainingSubMode,
  getListPanePageSize,
  restoreTrainingDateFiltersToBar
} from './js/lib/listPaneView.js?v=20260712paneautofocus2';
import {
  configurePaneEditor,
  syncPaneTextToModalHidden,
  applyPaneSavedNote,
  getPaneEditorHtml,
  getPaneEditorNoteId,
} from './js/lib/paneEditor.js?v=20260712paneautofocus2';
import {
  configurePaneAttachments,
  renderPaneAttachments,
} from './js/lib/paneAttachments.js?v=20260712paneactions2';
// They are kept as local functions due to tight coupling with app-specific state

// ── Round-1 extracted modules (May 2026 split — see lib/README.md) ────────
import { showNotification } from './js/lib/notifications.js?v=20260502a';
import { initHtmlSourceViewer } from './js/lib/htmlSourceViewer.js?v=20260502a';
import {
  initMergeModal,
  openMergeModal,
  fetchNotesByIds
} from './js/lib/mergeModal.js?v=20260502a';
import { initEncryptedAttachments } from './js/lib/encryptedAttachments.js?v=20260502a';
import { initRenameModal } from './js/lib/renameModal.js?v=20260502a';
import {
  initEntityListPage,
  loadAuthors,
  loadSources,
  displayAuthors,
  displaySources
} from './js/lib/entityListPage.js?v=20260704sourceby1';

// ============= CONSTANTS =============
// Same origin as the page (correct when port is omitted, e.g. http://localhost or reverse proxy)
const API_URL = `${window.location.origin}/api`;
window.API_URL = API_URL; // Make available to modules that need it

// ── Global UI helpers ────────────────────────────────────────────────────────

let _fetchErrorTimer = null;
window.showFetchError = function showFetchError(message) {
  const banner = document.getElementById('fetchErrorBanner');
  const msg    = document.getElementById('fetchErrorMsg');
  if (!banner || !msg) return;
  msg.textContent = `⚠️ Server error: ${message} — try restarting the server.`;
  banner.style.display = 'flex';
  clearTimeout(_fetchErrorTimer);
  _fetchErrorTimer = setTimeout(() => { banner.style.display = 'none'; }, 12000);
}

const BASE_DOCUMENT_TITLE = document.title || 'Note Archive';

function backendDisplayName(value) {
  const backend = String(value || '').trim().toLowerCase();
  if (backend === 'sqlite') return 'SQLite';
  if (backend === 'postgres') return 'Postgres';
  return 'Unknown';
}

function renderBackendIndicator(info) {
  const indicator = document.getElementById('backendIndicator');
  const backend = String(info?.backend || '').trim().toLowerCase();
  const label = backendDisplayName(backend);
  const titleParts = [`Database backend: ${label}`];

  if (backend === 'sqlite' && info?.sqliteFile) {
    titleParts.push(`SQLite file: ${info.sqliteFile}`);
  }
  if (info?.vaultPath) {
    titleParts.push(`Vault: ${info.vaultPath}`);
  }

  if (indicator) {
    indicator.textContent = `DB: ${label}`;
    indicator.dataset.backend = backend || 'unknown';
    indicator.title = titleParts.join('\n');
  }

  if (backend === 'sqlite' || backend === 'postgres') {
    document.title = `${BASE_DOCUMENT_TITLE} [${label}]`;
  }
}

function loadBackendIndicator() {
  runtimeInfoRequest()
    .then(renderBackendIndicator)
    .catch((error) => {
      console.warn('runtime info:', error);
      renderBackendIndicator({ backend: 'unknown' });
    });
}


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
  
  populateTrainingTypeDropdown();
}

function populateTrainingTypeDropdown(noteType = 'training', preselectedValue) {
  const trainingTypeDropdown = getElementByIdSafe('trainingType');
  if (trainingTypeDropdown) {
    const trainingTypes = getTrainingTypes(noteType);
    const currentValue = preselectedValue ?? trainingTypeDropdown.value;
    
    trainingTypeDropdown.innerHTML = '<option value="">Select type...</option>';
    trainingTypeDropdown.disabled = trainingTypes.length === 0;
    
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

/**
 * Populate the generic sub-type dropdown (#genericSubType) in the modal
 * for the given noteType. If the type has no sub-types the select is cleared.
 * Optionally pass a preselectedValue to restore after repopulation.
 */
function populateGenericSubTypeDropdown(noteType, preselectedValue) {
  const select = document.getElementById('genericSubType');
  if (!select) return;

  const subTypes = hasGenericSubTypeField(noteType) ? getGenericSubTypes(noteType) : [];
  const prevValue = preselectedValue ?? select.value;

  select.innerHTML = '<option value="">Select type...</option>';
  subTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = `${type.icon} ${type.label}`;
    select.appendChild(option);
  });

  if (prevValue) select.value = prevValue;
}

// Populate type filter checkboxes in search area
// Wrapper for filterManager library
// MIGRATED: Filter checkbox population now in filterManager.js (direct library access)

// Pagination state
// Local state synced with displayManager library
let currentPage = 1; // Sync via setLibCurrentPage() when changed
let currentNoteTypeFilter = null; // null = show all types
// quotesPerPage lives in displayManager — use getQuotesPerPage() to read it

// View mode: 'cards' | 'list-pane'
// Persisted in localStorage per note type so each type remembers its preference.
let currentViewMode = 'cards';

// Training stays list-pane only (Calendar/List). Diary is date-based too, but
// it can use Cards, Calendar, or List.
function isDateBehaviorType(noteType) {
  return Boolean(noteType) && hasDateField(noteType);
}

function isTrainingBehaviorType(noteType) {
  return Boolean(noteType) && getNoteTypeConfig(noteType).behavior === 'training';
}

function isListPaneOnlyType(noteType) {
  return isTrainingBehaviorType(noteType);
}

/** Quotes list views that participate in list-pane (includes All Notes / null). */
function supportsListPaneView() {
  return true;
}

function usesListPaneLayout(noteType, viewMode) {
  if (isListPaneOnlyType(noteType)) return true;
  return viewMode === 'list-pane';
}

function getStoredViewMode(noteType) {
  if (isListPaneOnlyType(noteType)) return 'list-pane';
  try {
    const stored = localStorage.getItem(`viewMode_${noteType || 'all'}`);
    if (stored === 'cards' || stored === 'list-pane') return stored;
    if (noteType) {
      const def = getNoteTypeDefaultDisplayMode(noteType);
      if (def === 'calendar' || def === 'list') return 'list-pane';
      return def;
    }
    return 'cards';
  } catch {
    if (!noteType) return 'cards';
    const def = getNoteTypeDefaultDisplayMode(noteType);
    return (def === 'calendar' || def === 'list') ? 'list-pane' : def;
  }
}

function saveViewMode(noteType, mode) {
  if (isListPaneOnlyType(noteType)) return;
  try {
    localStorage.setItem(`viewMode_${noteType || 'all'}`, mode);
  } catch {}
}

/** Header DISPLAY_MODE dropdown — All Notes and every non-date-based type. */
function hasDisplayModeToggle(noteType) {
  return !isListPaneOnlyType(noteType);
}

window.currentNoteTypeFilter = currentNoteTypeFilter;
window.currentPage = currentPage;

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

// ── Select-Action-Bar state (new stripe below Latest header) ──
// When "Select All filtered" is ON, we operate in *virtual* select-all mode:
//   effective selection = (all filtered notes) − excludedNoteIds
// When it is OFF, traditional explicit-ID selection is used (selectedNoteIds).
let selectAllFiltered = false;
let excludedNoteIds   = new Set();
// totalFilteredCount mirrors the #quoteCount / #lpListCount value; it's the
// count of the current filter set (used for the "X notes selected" display).
let totalFilteredCount = 0;

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
function handleHashNavigation(allowModeSwitch = false) {
  const parsed = parseUrlHash();
  // If the hash type is not in the current mode…
  if (parsed && window._modeAllowedTypes && !window._modeAllowedTypes.includes(parsed)) {
    if (allowModeSwitch) {
      // User explicitly changed the URL during the session → find best mode and switch
      const targetMode = findModeForType(parsed, activeMode.allModes);
      if (targetMode) {
        console.log(`🎛️ Switching mode to "${targetMode}" for hash type "${parsed}"`);
        fetch(`${API_URL}/mode`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: targetMode })
        }).then(() => window.location.reload())
          .catch(() => window.location.reload());
        return;
      }
    }
    // Startup or no matching mode → fall back silently to first allowed type
    currentNoteTypeFilter = window._modeAllowedTypes[0];
    updateUrlHashLib(currentNoteTypeFilter);
    console.log(`⚠️ Hash type "${parsed}" not in mode — using "${currentNoteTypeFilter}"`);
  } else {
    currentNoteTypeFilter = parsed;
  }
  window.currentNoteTypeFilter = currentNoteTypeFilter;
  console.log('✅ Set view from hash:', currentNoteTypeFilter || 'all');
}

// Find the most specific mode (fewest types) that contains a given note type
function findModeForType(noteType, allModes) {
  if (!allModes) return null;
  let best = null, bestLen = Infinity;
  for (const [name, types] of Object.entries(allModes)) {
    if (types.includes(noteType) && types.length < bestLen) {
      best = name;
      bestLen = types.length;
    }
  }
  return best;
}

// Update URL hash when view changes
function updateUrlHash() {
  updateUrlHashLib(currentNoteTypeFilter);
}

function updateActiveMenuState() {
  updateActiveMenuStateLib(currentNoteTypeFilter);
  syncNoteTypeFilterDropdowns();
}

function updateMainTitle() {
  updatePageTitleLib(currentNoteTypeFilter);
}

// MIGRATED: Hash change handling moved to pageCoordinator.js
initializeHashChangeListener(
  {
    handleHashNavigation: () => handleHashNavigation(true), // user-initiated: allow mode switch
    updateActiveMenuState,
    updateAddButtonText,
    updateMainTitle,
    updateSourcesFilterVisibility,
    updateViewModeToggle: () => updateViewModeToggle(),
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
const toggleQuoteModalMaximizeBtn = getElementByIdSafe("toggleQuoteModalMaximize");
const toggleQuoteDetailsBtn = getElementByIdSafe("toggleQuoteDetailsBtn");
const quotesList = getElementByIdSafe("quotesList");
const lpWrapper = getElementByIdSafe("lpWrapper");   // dedicated container for list-pane view
const quoteCount = getElementByIdSafe("quoteCount");
const columnCountSelect = getElementByIdSafe("columnCountSelect");
const displayModeSelect = getElementByIdSafe("displayModeSelect");
const trainingSubModeSelect = getElementByIdSafe("trainingSubModeSelect");
const modalTitle = getElementByIdSafe("modalTitle");

const compactSelectFacades = new WeakMap();
const compactSelectFacadeList = new Set();
let compactSelectGlobalHandlersReady = false;

function closeCompactSelectFacades(exceptWrapper = null) {
  compactSelectFacadeList.forEach(({ wrapper, button }) => {
    if (wrapper === exceptWrapper) return;
    wrapper.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  });
}

function syncCompactSelectFacade(select) {
  const facade = compactSelectFacades.get(select);
  if (!facade) return;

  const { wrapper, button, label, menu } = facade;
  const isHidden = select.hidden || select.style.display === 'none';
  wrapper.style.display = isHidden ? 'none' : '';
  wrapper.classList.toggle('gallery-active', select.classList.contains('gallery-active'));
  button.disabled = select.disabled;

  const selectedOption = select.selectedOptions?.[0] || select.options?.[select.selectedIndex] || null;
  label.textContent = selectedOption?.textContent?.trim() || '';

  menu.innerHTML = '';
  Array.from(select.options)
    .filter((option) => !option.hidden && !option.disabled)
    .forEach((option) => {
      const optionBtn = document.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'compact-select-option';
      optionBtn.dataset.value = option.value;
      optionBtn.setAttribute('role', 'option');
      optionBtn.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
      optionBtn.classList.toggle('selected', option.value === select.value);
      optionBtn.textContent = option.textContent;
      optionBtn.addEventListener('click', () => {
        if (select.value !== option.value) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncCompactSelectFacade(select);
        closeCompactSelectFacades();
      });
      menu.appendChild(optionBtn);
    });
}

function initCompactSelectFacade(select) {
  if (!select || compactSelectFacades.has(select)) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'compact-select';
  wrapper.dataset.selectId = select.id || '';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('compact-select-native');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'compact-select-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.title = select.title || select.getAttribute('aria-label') || '';

  const label = document.createElement('span');
  label.className = 'compact-select-label';
  const arrow = document.createElement('span');
  arrow.className = 'compact-select-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▼';
  button.append(label, arrow);

  const menu = document.createElement('div');
  menu.className = 'compact-select-menu';
  menu.setAttribute('role', 'listbox');

  wrapper.append(button, menu);

  const facade = { wrapper, button, label, menu };
  compactSelectFacades.set(select, facade);
  compactSelectFacadeList.add(facade);

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    syncCompactSelectFacade(select);
    const willOpen = !wrapper.classList.contains('open');
    closeCompactSelectFacades(wrapper);
    wrapper.classList.toggle('open', willOpen);
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  select.addEventListener('change', () => syncCompactSelectFacade(select));

  const observer = new MutationObserver(() => syncCompactSelectFacade(select));
  observer.observe(select, {
    attributes: true,
    attributeFilter: ['class', 'disabled', 'hidden', 'style'],
    childList: true,
    subtree: true,
  });

  if (!compactSelectGlobalHandlersReady) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.compact-select')) closeCompactSelectFacades();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCompactSelectFacades();
    });
    compactSelectGlobalHandlersReady = true;
  }

  syncCompactSelectFacade(select);
}

function initCompactToolbarSelects() {
  [displayModeSelect, trainingSubModeSelect, columnCountSelect].forEach(initCompactSelectFacade);
}

const mobileBottomSelectFacades = new WeakMap();
const mobileBottomSelectFacadeList = new Set();
let mobileBottomSelectGlobalHandlersReady = false;

function closeMobileBottomSelectFacades(exceptWrapper = null) {
  mobileBottomSelectFacadeList.forEach(({ wrapper, button }) => {
    if (wrapper === exceptWrapper) return;
    wrapper.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  });
}

function isMobileBottomSelectActive(select) {
  if (!select) return false;
  if (select.id === 'bottomNoteTypeFilter') {
    return select.classList.contains('note-type-filter-dropdown--active') && select.options.length > 0;
  }
  return select.id === 'mobileMoreMenuSelect';
}

function getMobileBottomSelectOptions(select) {
  return Array.from(select.options || [])
    .filter((option) => !option.hidden && !option.disabled)
    .filter((option) => !(select.id === 'mobileMoreMenuSelect' && option.value === ''));
}

function syncMobileBottomSelectFacade(select) {
  const facade = mobileBottomSelectFacades.get(select);
  if (!facade) return;

  const { wrapper, button, label, menu } = facade;
  const active = isMobileBottomSelectActive(select);
  wrapper.classList.toggle('mobile-select--active', active);
  wrapper.style.display = active ? '' : 'none';
  button.disabled = select.disabled || !active;

  const selectedOption = select.selectedOptions?.[0] || select.options?.[select.selectedIndex] || null;
  label.textContent = selectedOption?.textContent?.trim() || select.title || 'Select';

  menu.replaceChildren();
  getMobileBottomSelectOptions(select).forEach((option) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'mobile-select-option';
    optionBtn.dataset.value = option.value;
    optionBtn.setAttribute('role', 'option');
    optionBtn.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
    optionBtn.classList.toggle('selected', option.value === select.value);
    optionBtn.textContent = option.textContent.trim();
    optionBtn.addEventListener('click', () => {
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncMobileBottomSelectFacade(select);
      closeMobileBottomSelectFacades();
    });
    menu.appendChild(optionBtn);
  });
}

function initMobileBottomSelectFacade(select) {
  if (!select || mobileBottomSelectFacades.has(select)) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'mobile-select';
  wrapper.dataset.selectId = select.id || '';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('mobile-select-native');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-select-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.title = select.title || select.getAttribute('aria-label') || '';

  const label = document.createElement('span');
  label.className = 'mobile-select-label';
  const arrow = document.createElement('span');
  arrow.className = 'mobile-select-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▲';
  button.append(label, arrow);

  const menu = document.createElement('div');
  menu.className = 'mobile-select-menu';
  menu.setAttribute('role', 'listbox');

  wrapper.append(button, menu);

  const facade = { wrapper, button, label, menu };
  mobileBottomSelectFacades.set(select, facade);
  mobileBottomSelectFacadeList.add(facade);

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    syncMobileBottomSelectFacade(select);
    const willOpen = !wrapper.classList.contains('open');
    closeMobileBottomSelectFacades(wrapper);
    wrapper.classList.toggle('open', willOpen);
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  select.addEventListener('change', () => syncMobileBottomSelectFacade(select));

  const observer = new MutationObserver(() => syncMobileBottomSelectFacade(select));
  observer.observe(select, {
    attributes: true,
    attributeFilter: ['class', 'disabled', 'hidden', 'style'],
    childList: true,
    subtree: true,
  });

  if (!mobileBottomSelectGlobalHandlersReady) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.mobile-select')) closeMobileBottomSelectFacades();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileBottomSelectFacades();
    });
    mobileBottomSelectGlobalHandlersReady = true;
  }

  syncMobileBottomSelectFacade(select);
}

function initMobileBottomSelectFacades() {
  ['bottomNoteTypeFilter', 'mobileMoreMenuSelect']
    .map((id) => document.getElementById(id))
    .forEach(initMobileBottomSelectFacade);
}

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
const quoteImageGalleryFile = getElementByIdSafe("quoteImageGalleryFile");
const quoteCameraFile = getElementByIdSafe("quoteCameraFile");
const quoteImagePreview = getElementByIdSafe("quoteImagePreview");
const quoteAttachGalleryBtn = getElementByIdSafe("quoteAttachGalleryBtn");
const quoteAttachCameraBtn = getElementByIdSafe("quoteAttachCameraBtn");
const quoteAttachFilesBtn = getElementByIdSafe("quoteAttachFilesBtn");
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

/** Switch the quotes view to a note-type filter (or All Notes when null). */
function navigateToNoteTypeFilter(noteType) {
  currentNoteTypeFilter = noteType;
  window.currentNoteTypeFilter = noteType;
  currentPage = 1;
  setLibCurrentPage(1);

  updateViewModeToggle();
  updateBulkButtonVisibility();
  switchView('quotes');
  saveCurrentView();
  updateUrlHash();

  document.querySelectorAll('.note-type-filter').forEach(b => {
    b.classList.toggle('active', noteType && b.dataset.noteType === noteType);
  });
  document.querySelectorAll('.menu-item[data-view]').forEach(b => {
    b.classList.toggle('active', !noteType && b.dataset.view === 'quotes');
  });

  updateAddButtonText();
  updateMainTitle();
  updateSourcesFilterVisibility();

  const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
  toggleMetadataSearchSection((noteType === 'quote' || noteType === null) && metaSearchEnabled);
  clearSearchFields();
  syncNoteTypeFilterDropdowns();

  loadQuotes();
  loadTotalCount();
}

function syncNoteTypeFilterDropdowns() {
  const sel = document.getElementById('bottomNoteTypeFilter');
  if (!sel?.classList.contains('note-type-filter-dropdown--active')) return;
  sel.value = currentNoteTypeFilter || '';
  syncMobileBottomSelectFacade(sel);
}

function populateNoteTypeFilterDropdowns(types) {
  const isMulti = types.length > 1;
  const optionsHtml = isMulti
    ? (`<option value="">📦 All Notes</option>` +
      types.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join(''))
    : '';

  const row = document.getElementById('sideMenuNoteTypeRow');
  if (row) row.classList.toggle('note-type-row--active', isMulti);

  const sel = document.getElementById('bottomNoteTypeFilter');
  if (sel) {
    sel.classList.toggle('note-type-filter-dropdown--active', isMulti);
    sel.innerHTML = isMulti ? optionsHtml : '';
    syncMobileBottomSelectFacade(sel);
  }

  syncNoteTypeFilterDropdowns();
}

function populateDataExportScopeSelect() {
  const select = document.getElementById('dataExportScopeSelect');
  if (!select) return;

  const previous = select.value;
  const types = getNoteTypes();
  select.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All Notes';
  select.appendChild(allOption);

  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = `${type.icon ? `${type.icon} ` : ''}${type.label || type.value}`;
    select.appendChild(option);
  });

  if (Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function rebuildMobileMoreMenu(allowedTypes) {
  const sel = document.getElementById('mobileMoreMenuSelect');
  if (!sel) return;
  const has = (type) => allowedTypes.includes(type);
  const hasQuotes = has('quote');
  const hasTegneserie = has('tegneserie');

  const items = [
    { value: 'view:authors', label: '✍️ Authors', show: hasQuotes },
    { value: 'view:sources', label: '📚 Sources', show: hasQuotes },
    { value: 'view:tags', label: '🏷️ Tags', show: true },
    { value: 'action:random-quote', label: '🎲 Random Quote', show: hasQuotes },
    { value: 'action:random-teg', label: '🎲 Random Tegneserie', show: hasTegneserie },
    { value: 'view:settings', label: '⚙️ Options', show: true },
  ].filter(i => i.show);

  sel.innerHTML =
    '<option value="">☰ Menu</option>' +
    items.map(i => `<option value="${i.value}">${i.label}</option>`).join('');
  syncMobileBottomSelectFacade(sel);
}

function handleMobileMoreMenuAction(value) {
  if (!value) return;
  if (value.startsWith('view:')) {
    switchView(value.slice(5));
    return;
  }
  switch (value) {
    case 'action:random-quote':
      showWelcomeQuote(true);
      break;
    case 'action:random-teg':
      showWelcomeQuote(true, 'tegneserie');
      break;
    default:
      break;
  }
}

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
  const allowed = window._modeAllowedTypes || activeMode?.allowedTypes;
  const isSingleTypeMode = Array.isArray(allowed) && allowed.length === 1;

  types.forEach(type => {
    const highlightedTags = (globalSettings?.highlightedTags?.[type.value] || []);
    const hasSubTags = highlightedTags.length > 0;

    const li = document.createElement('li');
    li.className = 'note-type-filter-li';
    if (hasSubTags) li.classList.add('has-subtags');

    const row = document.createElement('div');
    row.className = 'note-type-row';

    // Button row: type button + optional expand arrow
    const btn = document.createElement('button');
    btn.className = 'menu-item note-type-filter';
    btn.dataset.noteType = type.value;
    btn.title = type.label;
    btn.innerHTML = `<span class="menu-icon">${type.icon}</span><span class="menu-text"> ${type.label}</span>`;

    let expandBtn = null;
    if (hasSubTags) {
      expandBtn = document.createElement('button');
      expandBtn.className = 'note-type-expand-btn';
      expandBtn.type = 'button';
      expandBtn.title = 'Toggle shortcuts';
      expandBtn.setAttribute('aria-label', `Toggle ${type.label} shortcuts`);
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const subList = li.querySelector('.menu-sub-list');
        const isOpen = subList.classList.toggle('expanded');
        expandBtn.classList.toggle('open', isOpen);
        expandBtn.setAttribute('aria-expanded', String(isOpen));
      });
    }
    row.appendChild(btn);
    if (expandBtn) row.appendChild(expandBtn);
    li.appendChild(row);

    // Sub-list of highlighted tags
    if (hasSubTags) {
      const subUl = document.createElement('ul');
      subUl.className = 'menu-sub-list';
      highlightedTags.forEach(tag => {
        const subLi = document.createElement('li');
        subLi.className = 'menu-sub-item';
        subLi.textContent = tag;
        subLi.title = `Filter ${type.label} by "${tag}"`;
        subLi.addEventListener('click', () => {
          window.filterByTag(tag, type.value);
        });
        subUl.appendChild(subLi);
      });
      if (isSingleTypeMode && type.value === allowed[0]) {
        subUl.classList.add('expanded');
        expandBtn?.classList.add('open');
        expandBtn?.setAttribute('aria-expanded', 'true');
      }
      li.appendChild(subUl);
    }

    ul.insertBefore(li, separator);

    btn.addEventListener('click', () => {
      navigateToNoteTypeFilter(type.value);
      btn.classList.add('active');
    });
  });

  // Re-apply active state if a type is already selected
  if (currentNoteTypeFilter) {
    ul.querySelectorAll('.note-type-filter').forEach(btn => {
      if (btn.dataset.noteType === currentNoteTypeFilter) btn.classList.add('active');
    });
  }

  // ── Tablet landing page: rebuild note-type buttons ─────────────────────
  const tabletGrid = document.getElementById('tabletBrowseGrid');
  if (tabletGrid) {
    // Wire up the static "All Notes" button (only once)
    const allNotesBtn = document.getElementById('tabletAllNotesBtn');
    if (allNotesBtn && !allNotesBtn.dataset.wired) {
      allNotesBtn.dataset.wired = '1';
      allNotesBtn.addEventListener('click', () => {
        currentNoteTypeFilter = null;
        window.currentNoteTypeFilter = null;
        console.log('📱 Tablet: All Notes clicked');
        currentPage = 1;
        setLibCurrentPage(1);
        updateViewModeToggle();
      updateBulkButtonVisibility();
        switchView('quotes');   // internally calls loadQuotes() + loadTotalCount()
        saveCurrentView();
        updateUrlHash();
        updateAddButtonText();
        updateMainTitle();
        updateSourcesFilterVisibility();
        clearSearchFields();
        // Note: switchView already triggered loadQuotes() — no second call needed
      });
    }

    // Remove previously injected type buttons
    tabletGrid.querySelectorAll('.tablet-type-btn').forEach(b => b.remove());

    // Inject one button per note type
    types.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'tablet-menu-btn tablet-type-btn';
      btn.innerHTML = `<span class="menu-btn-icon">${type.icon}</span><span class="menu-btn-text">${type.label}</span>`;
      btn.addEventListener('click', () => {
        currentNoteTypeFilter = type.value;
        window.currentNoteTypeFilter = type.value;
        console.log('📱 Tablet type button clicked:', type.value);
        currentPage = 1;
        setLibCurrentPage(1);
        updateViewModeToggle();
      updateBulkButtonVisibility();
        switchView('quotes');   // internally calls loadQuotes() + loadTotalCount()
        saveCurrentView();
        updateUrlHash();
        updateAddButtonText();
        updateMainTitle();
        updateSourcesFilterVisibility();
        const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
        toggleMetadataSearchSection(metaSearchEnabled);
        clearSearchFields();
        // Note: switchView already triggered loadQuotes() — no second call needed
      });
      tabletGrid.appendChild(btn);
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

  // Populate the Tags view type filter dropdown (filtered to mode's allowed types)
  const tagTypeFilter = document.getElementById('tagTypeFilter');
  if (tagTypeFilter) {
    const isSingleMode = types.length === 1;
    // Show "All Types" only when there are multiple types in this mode
    const allTypesOpt = isSingleMode ? '' : `<option value="">🏷️ All Types</option>`;
    tagTypeFilter.innerHTML = allTypesOpt +
      types.map(type => `<option value="${type.value}">${type.icon} ${type.label}</option>`).join('');
    // Pre-select the only type in single-type mode
    if (isSingleMode) tagTypeFilter.value = types[0].value;
  }

  // Populate phone note-type dropdowns (header + bottom bar) when 2+ types in mode
  populateNoteTypeFilterDropdowns(types);
  populateDataExportScopeSelect();

  // Populate the note-type selector inside the edit/add modal
  const noteTypeSelect = document.getElementById('noteType');
  if (noteTypeSelect) {
    const prev = noteTypeSelect.value;
    noteTypeSelect.innerHTML = types.map(type => `<option value="${type.value}">${type.icon} ${type.label}</option>`).join('');
    if (prev) noteTypeSelect.value = prev;
  }
}

// ── Mode handling ─────────────────────────────────────────────────────────
let activeMode = { mode: 'DEFAULT', allowedTypes: null };
// Exposed globally so filterManager / viewManager can gate training-specific UI
window._modeAllowedTypes = null;

/** Note types visible in menu / dropdowns for the active server mode. */
function getMenuNoteTypesForCurrentMode() {
  const allowed = activeMode?.allowedTypes || window._modeAllowedTypes;
  if (!globalSettings?.noteTypes?.length) return [];
  if (!allowed?.length) return globalSettings.noteTypes;
  const filtered = globalSettings.noteTypes.filter(t => allowed.includes(t.value));
  const useFullMenu = String(activeMode.mode || '').toUpperCase() === 'ALL';
  return useFullMenu
    ? globalSettings.noteTypes
    : (filtered.length ? filtered : globalSettings.noteTypes);
}

function applyModeMenuVisibility(allowedTypes) {
  if (!allowedTypes?.length) return;
  const has = (type) => allowedTypes.includes(type);
  const hasQuotes = has('quote');
  const hasTraining = has('training');
  const hasTegneserie = has('tegneserie');
  const isSingle = allowedTypes.length === 1;

  const elAllNotes = document.getElementById('menuItemAllNotes');
  const elAllNotesSep = document.getElementById('menuSepAllNotes');
  if (isSingle) {
    if (elAllNotes) elAllNotes.style.display = 'none';
    if (elAllNotesSep) elAllNotesSep.style.display = 'none';
  } else {
    if (elAllNotes) elAllNotes.style.display = '';
    if (elAllNotesSep) elAllNotesSep.style.display = '';
  }

  const elAuthors = document.getElementById('menuItemAuthors');
  const elSources = document.getElementById('menuItemSources');
  if (elAuthors) elAuthors.style.display = hasQuotes ? '' : 'none';
  if (elSources) elSources.style.display = hasQuotes ? '' : 'none';

  const elRandom = document.getElementById('menuItemRandomQuote');
  const elRandomTeg = document.getElementById('menuItemRandomTegneserie');
  const elUtilDiv = document.getElementById('menuDividerUtilities');
  const elUtilTitle = document.getElementById('menuTitleUtilities');
  const elUtilList = document.getElementById('menuListUtilities');
  if (elRandom) elRandom.style.display = hasQuotes ? '' : 'none';
  if (elRandomTeg) elRandomTeg.style.display = hasTegneserie ? '' : 'none';
  const utilsVisible = hasQuotes || hasTegneserie;
  if (elUtilDiv) elUtilDiv.style.display = utilsVisible ? '' : 'none';
  if (elUtilTitle) elUtilTitle.style.display = utilsVisible ? '' : 'none';
  if (elUtilList) elUtilList.style.display = utilsVisible ? '' : 'none';

  const tabRandTeg = document.getElementById('tabletRandomTegneserieBtn');
  if (tabRandTeg) tabRandTeg.style.display = hasTegneserie ? '' : 'none';

  const tabRandQuote = document.getElementById('tabletRandomQuoteBtn');
  if (tabRandQuote) tabRandQuote.style.display = hasQuotes ? '' : 'none';

  const elTrainingFilter = document.getElementById('trainingTypesFilterContainer');
  const elTrainingSummary = document.getElementById('trainingTypeSummary');
  if (elTrainingFilter) elTrainingFilter.style.display = hasTraining ? '' : 'none';
  if (elTrainingSummary) elTrainingSummary.style.display = hasTraining ? '' : 'none';

  const elQuoteFilter = document.getElementById('quoteSourcesFilterContainer');
  const elQuoteSummary = document.getElementById('quoteSourcesSummary');
  if (elQuoteFilter) elQuoteFilter.style.display = hasQuotes ? '' : 'none';
  if (elQuoteSummary) elQuoteSummary.style.display = hasQuotes ? '' : 'none';

  rebuildMobileMoreMenu(allowedTypes);
}

function applyGrandTotalCounterVisibility() {
  const allowed = window._modeAllowedTypes || activeMode?.allowedTypes;
  const isSingle = Array.isArray(allowed) && allowed.length === 1;
  const el = document.getElementById('quotesQuoteCounts');
  if (el) el.classList.toggle('quote-counts--single-type', isSingle);
  document.body.classList.toggle('mode-single-type', isSingle);
}

/** Enable phone bottom-bar dropdown nav (see style.mobile.css). */
function applyMobileBottomNavClass() {
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  document.body.classList.toggle('mobile-bottom-nav', mobile);
}

function reapplyModeUi({ rebuildMenu = false } = {}) {
  if (!activeMode?.allowedTypes?.length) return;
  const allowedTypes = activeMode.allowedTypes;
  initNoteTypes(getMenuNoteTypesForCurrentMode());
  if (rebuildMenu) generateNoteTypeMenu();
  applyModeMenuVisibility(allowedTypes);
  applyGrandTotalCounterVisibility();
  applyMobileBottomNavClass();
}

window.reapplyModeUi = reapplyModeUi;

async function loadAndApplyMode() {
  try {
    const r = await fetch(`${API_URL}/mode`);
    if (!r.ok) return;
    activeMode = await r.json();
  } catch (_) { return; }

  const { mode, allowedTypes } = activeMode;
  if (!allowedTypes || allowedTypes.length === 0) return;

  // Make allowed types available globally for filter managers
  window._modeAllowedTypes = allowedTypes;

  // Populate mode selector with all known modes, mark current.
  // Display labels can differ from the backend key — currently only ALL gets
  // a prettier label ("All types"); others show their raw key.
  const MODE_DISPLAY_LABELS = { ALL: 'ALL TYPES' };
  const modeSwitcher = document.getElementById('modeSwitcher');
  if (modeSwitcher && activeMode.allModes) {
    modeSwitcher.innerHTML = Object.keys(activeMode.allModes)
      .map(m => {
        const label = MODE_DISPLAY_LABELS[m] || m;
        return `<option value="${m}"${m === mode ? ' selected' : ''}>${label}</option>`;
      })
      .join('');
    modeSwitcher.addEventListener('change', async () => {
      const newMode = modeSwitcher.value;
      if (!newMode || newMode === mode) return;
      try {
        await fetch(`${API_URL}/mode`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode })
        });
      } catch (_) {}
      window.location.reload();
    });
  }

  // Menu note types: filtered to active mode (see getMenuNoteTypesForCurrentMode)
  if (globalSettings?.noteTypes) {
    initNoteTypes(getMenuNoteTypesForCurrentMode());
  }

  const isSingle = allowedTypes.length === 1;

  applyModeMenuVisibility(allowedTypes);

  if (isSingle) {
    setTimeout(() => {
      const typeBtn = document.querySelector(`.note-type-filter[data-note-type="${allowedTypes[0]}"]`);
      if (typeBtn && !typeBtn.classList.contains('active')) typeBtn.click();
    }, 0);
  }

  // When mode is locked via npm run <mode>, hide the mode switcher in the sidebar
  const modeRow = modeSwitcher?.closest('.side-menu-mode-row');
  if (modeRow && activeMode.modeLocked) modeRow.style.display = 'none';

  applyGrandTotalCounterVisibility();
  applyMobileBottomNavClass();
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Load settings from file first (using settingsManager library)
  await loadSettings();
  globalSettings = getGlobalSettings(); // Sync local reference

  // Initialize dynamic note types from settings (may be narrowed by mode below)
  if (globalSettings && globalSettings.noteTypes) {
    initNoteTypes(globalSettings.noteTypes);
  }

  // Fetch active mode and filter menu accordingly
  await loadAndApplyMode();

  // Generate note type menu items dynamically
  generateNoteTypeMenu();
  loadBackendIndicator();

  // Initialize quote types in dropdowns
  populateTypeDropdowns();
  
  // Initialize quote source type filter checkboxes (direct library call)
  populateTypeFilterCheckboxesLib(getQuoteTypes);
  updateQuoteSourcesSummary();
  
  // Initialize training type filter checkboxes (direct library call)
  populateTrainingTypeFilterCheckboxesLib(getTrainingTypes);
  updateTrainingTypeSummary();
  
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
  updateViewModeToggle();
  updateBulkButtonVisibility();
  applyGrandTotalCounterVisibility();
  applyMobileBottomNavClass();

  window.matchMedia('(max-width: 767px)').addEventListener('change', () => {
    applyMobileBottomNavClass();
    updateMainTitle();
  });
  
  // Show/hide metadata search section based on current filter and settings
  const metaSearchEnabled = globalSettings?.enableQuoteMetaSearches === true;
  const shouldShowMetadata = (currentNoteTypeFilter === 'quote' || currentNoteTypeFilter === null) && metaSearchEnabled;
  toggleMetadataSearchSection(shouldShowMetadata);
  
  // Initialize Quill editor using library
  quillEditor = initializeQuillEditor();
  configurePaneEditor({
    apiUrl: API_URL,
    // Text-only pane save: refresh list row only — do not touch editor/baseline
    onNoteSaved: (saved) => refreshPaneNote(saved.id, saved, { updatePaneEditor: false }),
  });
  configurePaneAttachments({
    showFull: (src, noteId, type) => window.showFullImage(src, noteId, type),
    addFromFile: (file, noteId) => addPaneAttachmentFromFile(file, noteId),
    addEncrypted: (file) => window.addEncryptedAttachment(file),
    deleteAttachment: (noteId, att, idx) => deletePaneAttachment(noteId, att, idx),
  });
  
  // Check if we're on a tablet (769px-1100px) — still used below for other
  // tablet-specific wiring decisions.
  const isTablet = window.matchMedia("(min-width: 768px) and (max-width: 1100px)").matches;

  // Side-menu collapse toggle — available on desktop and medium (on mobile the
  // side menu becomes a bottom-bar so the toggle is hidden via CSS).
  const sideMenuToggle = document.getElementById('sideMenuToggle');
  if (sideMenuToggle) {
    const sideMenuEl  = document.querySelector('.side-menu');
    const appLayoutEl = document.querySelector('.app-layout');
    const isMobile    = window.matchMedia('(max-width: 767px)').matches;
    const applyCollapsed = (collapsed) => {
      sideMenuEl.classList.toggle('menu-collapsed', collapsed);
      appLayoutEl.classList.toggle('menu-collapsed', collapsed);
      sideMenuToggle.innerHTML = collapsed ? '&#9654;' : '&#9664;';
      sideMenuToggle.title = collapsed ? 'Expand menu' : 'Collapse menu';
    };
    // Mobile layout is a bottom-bar; the collapsed state is meaningless there
    // and would fight the width:100% rule, so skip restore + wire-up entirely.
    if (!isMobile) {
      applyCollapsed(localStorage.getItem('sideMenuCollapsed') === 'true');
      sideMenuToggle.addEventListener('click', () => {
        const nowCollapsed = !sideMenuEl.classList.contains('menu-collapsed');
        applyCollapsed(nowCollapsed);
        localStorage.setItem('sideMenuCollapsed', nowCollapsed);
      });
    }
  }

  // Set up event listeners (including gallery mode) BEFORE first load
  setupEventListeners();
  setupMenuNavigation();

  // Double-click on the quote modal header also toggles maximize; the visible
  // header button is the primary affordance.
  const _quoteModalHeader = document.querySelector('#quoteModal .modal-header');
  if (_quoteModalHeader) {
    _quoteModalHeader.addEventListener('dblclick', () => {
      toggleQuoteModalMaximized();
    });
  }
  // Side-menu layout active on medium screens — no landing page needed
  // (landing page code kept; isTablet flag preserved for future use)
  loadQuotes();
  loadTotalCount();
  
  if (window._modeAllowedTypes?.includes('quote')) {
    setTimeout(() => showWelcomeQuote(), 300);
  }
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

  for (const id of ['bottomNoteTypeFilter']) {
    const sel = getElementByIdSafe(id);
    if (!sel || sel.dataset.wired) continue;
    sel.dataset.wired = '1';
    sel.addEventListener('change', () => {
      navigateToNoteTypeFilter(sel.value || null);
    });
  }

  const mobileMoreMenuSelect = getElementByIdSafe('mobileMoreMenuSelect');
  if (mobileMoreMenuSelect && !mobileMoreMenuSelect.dataset.wired) {
    mobileMoreMenuSelect.dataset.wired = '1';
    mobileMoreMenuSelect.addEventListener('change', () => {
      const action = mobileMoreMenuSelect.value;
      mobileMoreMenuSelect.value = '';
      syncMobileBottomSelectFacade(mobileMoreMenuSelect);
      handleMobileMoreMenuAction(action);
    });
  }

  // Note type change handler (removed from modal, but keep for edit mode)
  const noteTypeSelect = getElementByIdSafe("noteType");
  if (noteTypeSelect) {
    noteTypeSelect.addEventListener("change", updateFieldVisibility);
  }
  
  // Note type filter buttons are generated by generateNoteTypeMenu() above.
  
  closeModal.addEventListener("click", closeQuoteModal);
  cancelBtn.addEventListener("click", closeQuoteModal);
  if (toggleQuoteModalMaximizeBtn) {
    toggleQuoteModalMaximizeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleQuoteModalMaximized();
    });
  }
  if (toggleQuoteDetailsBtn) {
    toggleQuoteDetailsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const details = document.getElementById('quoteDetailsSection');
      if (!details) return;
      details.open = !details.open;
      syncQuoteDetailsToggle();
      const shouldReleaseFocus = e.detail > 0 ||
        (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
      if (shouldReleaseFocus) {
        e.currentTarget.blur();
      }
    });
  }
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
      // Show loading state in whichever container is active
      const activeContainer = (currentViewMode === 'list-pane' && lpWrapper && lpWrapper.style.display !== 'none')
        ? lpWrapper : quotesList;
      if (activeContainer) activeContainer.innerHTML = '<div class="loading">Loading…</div>';
      try {
        await loadQuotes();
        await loadTotalCount();
        // Brief "refreshed" toast
        const toast = document.createElement('div');
        toast.className = 'refresh-toast';
        toast.textContent = '✓ Refreshed';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
      } finally {
        setTimeout(() => {
          refreshQuotesBtn.classList.remove('refreshing');
        }, 500);
      }
    });
  }

  // Export PDF button - REMOVED: Moved to bulk operations modal
  // If you need export PDF, use the "Bulk Operations" button instead

  const dataExportJsonBtn = getElementByIdSafe("dataExportJsonBtn");
  if (dataExportJsonBtn) {
    dataExportJsonBtn.addEventListener("click", exportDataManagementJson);
  }

  const dataExportPdfBtn = getElementByIdSafe("dataExportPdfBtn");
  if (dataExportPdfBtn) {
    dataExportPdfBtn.addEventListener("click", exportDataManagementPdf);
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
      resetImportModal({
        importProgress: getElementByIdSafe("importProgress"),
        importStatus: getElementByIdSafe("importStatus"),
        selectFileBtn: getElementByIdSafe("selectFileBtn"),
        importFileInput: getElementByIdSafe("importFileInput"),
      });
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

  const vaultHealthCheckBtn = getElementByIdSafe("vaultHealthCheckBtn");
  const vaultHealthCheckResult = getElementByIdSafe("vaultHealthCheckResult");

  const formatHealthList = (values) => {
    if (!Array.isArray(values) || values.length === 0) return "none";
    return values.map(escapeHtml).join(", ");
  };

  const renderVaultHealthReport = (report) => {
    if (!vaultHealthCheckResult || !report) return;
    const statusLabel = report.status === "ok"
      ? "OK"
      : report.status === "warning"
        ? "Warnings"
        : "Errors";
    const counts = Array.isArray(report.countsByNoteType) && report.countsByNoteType.length
      ? report.countsByNoteType
          .map((row) => `${escapeHtml(row.noteType)}: ${Number(row.count || 0)}`)
          .join(", ")
      : "no notes";
    const issueLines = Array.isArray(report.issues) && report.issues.length
      ? report.issues.map((issue) => `• ${escapeHtml(issue.message || issue.code || "Issue")}`)
      : ["No settings/mode/database note-type mismatches found."];
    const mismatch = report.mismatches || {};
    const visibility = report.noteTypeVisibility || {};
    const notVisibleTypes = Array.isArray(visibility.notVisibleTypes) && visibility.notVisibleTypes.length
      ? visibility.notVisibleTypes
          .map((row) => `${escapeHtml(row.noteType)}: ${Number(row.count || 0)}`)
          .join(", ")
      : "none";
    const notVisibleSamples = Array.isArray(visibility.sampleNotes) && visibility.sampleNotes.length
      ? visibility.sampleNotes
          .map((row) => {
            const title = row.title ? ` ${row.title}` : "";
            return `#${escapeHtml(String(row.id))}${escapeHtml(title)} (${escapeHtml(row.noteType || "unknown")})`;
          })
          .join(", ")
      : "none";

    vaultHealthCheckResult.innerHTML = [
      `<strong>Status:</strong> ${escapeHtml(statusLabel)}`,
      `<strong>Backend:</strong> ${escapeHtml(report.backend || "unknown")}${report.sqliteFile ? ` (${escapeHtml(report.sqliteFile)})` : ""}`,
      `<strong>Vault:</strong> ${escapeHtml(report.vaultPath || "(default)")}`,
      `<strong>Settings:</strong> ${escapeHtml(report.settingsFile || "(unknown)")}`,
      `<strong>Attachments:</strong> ${escapeHtml(report.attachmentsDir || "(unknown)")}`,
      `<strong>Active mode:</strong> ${escapeHtml(report.activeMode || "(unknown)")}`,
      `<strong>Active mode types:</strong> ${formatHealthList(report.activeModeTypes)}`,
      `<strong>DB note counts:</strong> ${counts}`,
      `<strong>DB note types not visible in current mode:</strong> ${notVisibleTypes}`,
      `<strong>Sample not-visible note IDs:</strong> ${notVisibleSamples}`,
      "",
      `<strong>Mode types missing from settings:</strong> ${formatHealthList(mismatch.modesMissingFromSettings)}`,
      `<strong>DB types missing from settings:</strong> ${formatHealthList(mismatch.dbMissingFromSettings)}`,
      `<strong>Settings types missing from modes:</strong> ${formatHealthList(mismatch.settingsMissingFromModes)}`,
      `<strong>DB types missing from modes:</strong> ${formatHealthList(mismatch.dbMissingFromModes)}`,
      "",
      `<strong>Issues</strong>`,
      ...issueLines,
    ].join("<br>");
    vaultHealthCheckResult.classList.add("is-visible");
  };

  if (vaultHealthCheckBtn) {
    vaultHealthCheckBtn.addEventListener("click", async () => {
      const labelEl =
        vaultHealthCheckBtn.querySelector(".vault-health-btn-label") || vaultHealthCheckBtn;
      const prevLabel = labelEl.textContent;
      vaultHealthCheckBtn.disabled = true;
      labelEl.textContent = "⏳ Checking…";
      try {
        const report = await vaultHealthCheckRequest();
        renderVaultHealthReport(report);
      } catch (err) {
        console.error(err);
        if (vaultHealthCheckResult) {
          vaultHealthCheckResult.innerHTML = escapeHtml(err.message || "Vault health check failed");
          vaultHealthCheckResult.classList.add("is-visible");
        } else {
          alert(err.message || "Vault health check failed");
        }
      } finally {
        vaultHealthCheckBtn.disabled = false;
        labelEl.textContent = prevLabel;
      }
    });
  }

  const pruneUnusedEntitiesBtn = getElementByIdSafe("pruneUnusedEntitiesBtn");
  const pruneUnusedEntitiesApplyBtn = getElementByIdSafe("pruneUnusedEntitiesApplyBtn");
  const pruneUnusedEntitiesResult = getElementByIdSafe("pruneUnusedEntitiesResult");
  let lastPruneUnusedEntitiesPlan = null;

  const getPruneItemTotal = (plan) =>
    (plan?.authors?.length || 0) + (plan?.sources?.length || 0) + (plan?.tags?.length || 0);

  const formatPruneEntity = (item) =>
    escapeHtml(item?.name || `#${item?.id || "unknown"}`);

  const formatPruneTag = (item) => {
    const name = item?.name || `#${item?.id || "unknown"}`;
    return escapeHtml(item?.type ? `${name} [${item.type}]` : name);
  };

  const formatPruneList = (label, items, formatter = formatPruneEntity) => {
    const count = items?.length || 0;
    if (!count) return `<strong>${label}</strong> (0): none`;
    return `<strong>${label}</strong> (${count}): ${items.map(formatter).join(", ")}`;
  };

  const setPruneResult = (plan) => {
    if (!pruneUnusedEntitiesResult || !plan) return;
    const total = getPruneItemTotal(plan);
    const actionText = plan.dryRun === false ? "removed" : "would be removed";
    const lines = [
      `<strong>${total}</strong> unused metadata item${total === 1 ? "" : "s"} ${actionText}`,
      formatPruneList("Authors", plan.authors),
      formatPruneList("Sources", plan.sources),
      formatPruneList("Tags", plan.tags, formatPruneTag),
    ];

    if (!total) {
      lines.push("", "No unused authors, sources, or tags found.");
    }

    pruneUnusedEntitiesResult.innerHTML = lines.join("<br>");
    pruneUnusedEntitiesResult.classList.add("is-visible");
  };

  if (pruneUnusedEntitiesBtn) {
    pruneUnusedEntitiesBtn.addEventListener("click", async () => {
      const labelEl =
        pruneUnusedEntitiesBtn.querySelector(".prune-btn-label") || pruneUnusedEntitiesBtn;
      const prevLabel = labelEl.textContent;
      pruneUnusedEntitiesBtn.disabled = true;
      if (pruneUnusedEntitiesApplyBtn) pruneUnusedEntitiesApplyBtn.disabled = true;
      labelEl.textContent = "⏳ Scanning…";
      try {
        const plan = await pruneUnusedEntitiesRequest({ dryRun: true });
        lastPruneUnusedEntitiesPlan = plan;
        setPruneResult(plan);
        if (pruneUnusedEntitiesApplyBtn) {
          pruneUnusedEntitiesApplyBtn.disabled = !(getPruneItemTotal(plan) > 0);
        }
      } catch (err) {
        console.error(err);
        alert(err.message || "Prune scan failed");
      } finally {
        pruneUnusedEntitiesBtn.disabled = false;
        labelEl.textContent = prevLabel;
      }
    });
  }

  if (pruneUnusedEntitiesApplyBtn) {
    pruneUnusedEntitiesApplyBtn.addEventListener("click", async () => {
      const total = getPruneItemTotal(lastPruneUnusedEntitiesPlan);
      if (!total) {
        alert("Scan unused metadata first.");
        return;
      }

      const authorCount = lastPruneUnusedEntitiesPlan.authors?.length || 0;
      const sourceCount = lastPruneUnusedEntitiesPlan.sources?.length || 0;
      const tagCount = lastPruneUnusedEntitiesPlan.tags?.length || 0;
      if (
        !(await showConfirm(
          `Delete ${total} unused metadata item${total === 1 ? "" : "s"}?\n\nAuthors: ${authorCount}\nSources: ${sourceCount}\nTags: ${tagCount}\n\nThis cannot be undone.`,
          {
            icon: "🧹",
            title: "Apply metadata prune",
            confirmLabel: "Apply prune",
            danger: true,
          },
        ))
      ) {
        return;
      }

      const labelEl =
        pruneUnusedEntitiesApplyBtn.querySelector(".prune-apply-btn-label") || pruneUnusedEntitiesApplyBtn;
      const prevLabel = labelEl.textContent;
      pruneUnusedEntitiesApplyBtn.disabled = true;
      if (pruneUnusedEntitiesBtn) pruneUnusedEntitiesBtn.disabled = true;
      labelEl.textContent = "⏳ Applying…";
      try {
        const result = await pruneUnusedEntitiesRequest({ dryRun: false });
        lastPruneUnusedEntitiesPlan = null;
        setPruneResult(result);
        await Promise.all([loadAuthors(), loadSources(), loadTags()]);
      } catch (err) {
        console.error(err);
        alert(err.message || "Prune failed");
      } finally {
        if (pruneUnusedEntitiesBtn) pruneUnusedEntitiesBtn.disabled = false;
        pruneUnusedEntitiesApplyBtn.disabled = !(getPruneItemTotal(lastPruneUnusedEntitiesPlan) > 0);
        labelEl.textContent = prevLabel;
      }
    });
  }

  const rehomeAttachmentsScanBtn = getElementByIdSafe("rehomeAttachmentsScanBtn");
  const rehomeAttachmentsApplyBtn = getElementByIdSafe("rehomeAttachmentsApplyBtn");
  const rehomeAttachmentsResult = getElementByIdSafe("rehomeAttachmentsResult");
  let lastRehomeAttachmentsPlan = null;

  const getRehomeStatusLabel = (status) => ({
    movable: "Movable",
    missing_source: "Missing source file",
    target_exists: "Target already exists",
    invalid_reference: "Invalid file reference",
  }[status] || status || "Unknown");

  const formatRehomeItem = (item) => {
    const notePart = item.noteId ? `note #${item.noteId}` : "unknown note";
    const attachmentPart = item.attachmentId
      ? `DB attachment record #${item.attachmentId}`
      : "unknown DB attachment record";
    const columnPart = item.column ? `, DB field: ${item.column}` : "";
    const noteTypePart = item.noteType ? `, note type: ${item.noteType}` : "";
    const currentPath = item.currentPath || item.currentRef || "(empty)";
    const targetPath = item.targetPath || item.targetFolder || "";
    const pathPart = targetPath
      ? `DB current path: <code>${escapeHtml(currentPath)}</code><br>Expected path: <code>${escapeHtml(targetPath)}</code>`
      : `DB current path: <code>${escapeHtml(currentPath)}</code>`;

    return `${escapeHtml(getRehomeStatusLabel(item.status))}: ${escapeHtml(notePart)}, ${escapeHtml(attachmentPart)}${escapeHtml(columnPart)}${escapeHtml(noteTypePart)}<br>${pathPart}`;
  };

  const setRehomeResult = (plan) => {
    if (!rehomeAttachmentsResult || !plan) return;
    const applied = plan.applied;
    const lines = [
      `<strong>${plan.driftCount || 0}</strong> folder mismatch${plan.driftCount === 1 ? '' : 'es'} found`,
      `Movable: ${plan.movableCount || 0}`,
      `Missing source files: ${plan.missingSourceCount || 0}`,
      `Target collisions: ${plan.collisionCount || 0}`,
      `Invalid references: ${plan.invalidReferenceCount || 0}`,
    ];

    if (!plan.driftCount && !plan.invalidReferenceCount) {
      lines.push('', 'Attachment folders already match current note types.');
    }

    if (Array.isArray(plan.items) && plan.items.length > 0) {
      const groupedItems = [
        ["Movable", plan.items.filter((item) => item.status === "movable")],
        ["Missing source files", plan.items.filter((item) => item.status === "missing_source")],
        ["Target collisions", plan.items.filter((item) => item.status === "target_exists")],
        ["Invalid references", plan.items.filter((item) => item.status === "invalid_reference")],
      ].filter(([, items]) => items.length > 0);

      for (const [label, items] of groupedItems) {
        lines.push('', `<strong>${label}</strong>`);
        for (const item of items) {
          lines.push(formatRehomeItem(item));
        }
      }
    }

    if (applied) {
      lines.push(
        '',
        `<strong>Applied</strong>`,
        `Moved: ${applied.movedCount || 0}`,
        `Skipped: ${applied.skippedCount || 0}`,
        `Failed: ${applied.failedCount || 0}`,
      );
    }

    rehomeAttachmentsResult.innerHTML = lines.join('<br>');
    rehomeAttachmentsResult.classList.add('is-visible');
  };

  if (rehomeAttachmentsScanBtn) {
    rehomeAttachmentsScanBtn.addEventListener("click", async () => {
      const labelEl =
        rehomeAttachmentsScanBtn.querySelector(".rehome-scan-btn-label") || rehomeAttachmentsScanBtn;
      const prevLabel = labelEl.textContent;
      rehomeAttachmentsScanBtn.disabled = true;
      if (rehomeAttachmentsApplyBtn) rehomeAttachmentsApplyBtn.disabled = true;
      labelEl.textContent = "⏳ Scanning…";
      try {
        const plan = await rehomeAttachmentsRequest({ dryRun: true });
        lastRehomeAttachmentsPlan = plan;
        setRehomeResult(plan);
        if (rehomeAttachmentsApplyBtn) {
          rehomeAttachmentsApplyBtn.disabled = !(plan.movableCount > 0);
        }
      } catch (err) {
        console.error(err);
        alert(err.message || "Attachment folder scan failed");
      } finally {
        rehomeAttachmentsScanBtn.disabled = false;
        labelEl.textContent = prevLabel;
      }
    });
  }

  if (rehomeAttachmentsApplyBtn) {
    rehomeAttachmentsApplyBtn.addEventListener("click", async () => {
      const movableCount = lastRehomeAttachmentsPlan?.movableCount || 0;
      if (!movableCount) {
        alert("Scan attachment folders first.");
        return;
      }

      if (
        !(await showConfirm(
          `Move ${movableCount} attachment file${movableCount === 1 ? '' : 's'} into folders matching current note type?\n\nItems with missing files, path problems, or target collisions will be skipped.`,
          {
            icon: "📁",
            title: "Apply attachment folder changes",
            confirmLabel: "Apply",
            danger: true,
          },
        ))
      ) {
        return;
      }

      const labelEl =
        rehomeAttachmentsApplyBtn.querySelector(".rehome-apply-btn-label") || rehomeAttachmentsApplyBtn;
      const prevLabel = labelEl.textContent;
      rehomeAttachmentsApplyBtn.disabled = true;
      if (rehomeAttachmentsScanBtn) rehomeAttachmentsScanBtn.disabled = true;
      labelEl.textContent = "⏳ Applying…";
      try {
        const result = await rehomeAttachmentsRequest({ dryRun: false });
        lastRehomeAttachmentsPlan = null;
        setRehomeResult(result);
        await loadQuotes();
      } catch (err) {
        console.error(err);
        alert(err.message || "Attachment folder maintenance failed");
      } finally {
        if (rehomeAttachmentsScanBtn) rehomeAttachmentsScanBtn.disabled = false;
        labelEl.textContent = prevLabel;
      }
    });
  }

  // Select mode button
  const selectModeBtn = getElementByIdSafe("selectModeBtn");
  if (selectModeBtn) {
    selectModeBtn.addEventListener("click", toggleSelectionMode);
  }

  // ── New Select-Action-Bar wiring (below the Latest header) ───────────────
  // Each action button routes through a single dispatcher that produces the
  // correct backend payload based on the current selection (always
  // selectedNoteIds, since "Select All filtered" has been removed).
  const _wireSab = (btnId, action) => {
    const b = document.getElementById(btnId);
    if (b) b.addEventListener('click', () => dispatchSabAction(action));
  };
  _wireSab('sabExportPdfBtn', 'export');
  _wireSab('sabDuplicateBtn', 'duplicate');
  _wireSab('sabSplitBtn',     'split');
  _wireSab('sabMergeBtn',     'merge');
  _wireSab('sabDeleteBtn',    'delete');

  // Tag/Group mini-form: dropdown drives the input's placeholder, Apply runs
  // the chosen operation against the current selection.
  const sabTagOpSelect   = document.getElementById('sabTagOpSelect');
  const sabTagOpInput    = document.getElementById('sabTagOpInput');
  const sabTagOpApplyBtn = document.getElementById('sabTagOpApplyBtn');
  if (sabTagOpSelect) {
    sabTagOpSelect.addEventListener('change', _updateSabTagOpControls);
    _updateSabTagOpControls();
  }
  if (sabTagOpInput) {
    sabTagOpInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); handleSabTagOpApply(); }
    });
  }
  if (sabTagOpApplyBtn) {
    sabTagOpApplyBtn.addEventListener('click', handleSabTagOpApply);
  }

  // ── Column count / Gallery mode ──────────────────────────────────────────
  let _galleryNormalPageSize = null;
  let _galleryActive = false;

  function applyGalleryMode(active) {
    const quotesList = document.getElementById('quotesList');
    if (!quotesList) return;
    if (active) {
      _galleryActive = true;
      quotesList.classList.add('gallery-mode');
      columnCountSelect.classList.add('gallery-active');
      // Silently set image filters (no dispatchEvent — avoids premature loadQuotes calls)
      const cbImg  = document.getElementById('searchHasImage');
      const selImg = document.getElementById('searchImageCondition');
      const cbType  = document.getElementById('searchHasImageType');
      const selType = document.getElementById('searchImageTypeCondition');
      if (cbImg)  cbImg.checked  = true;
      if (selImg) selImg.value   = 'has';
      // Re-enable dependent fields so the imageType checkbox isn't disabled/ignored
      _syncImageTypeFilterState();
      if (cbType)  { cbType.disabled = false; cbType.checked = true; }
      if (selType) { selType.disabled = false; selType.value  = 'has'; }
      // Set page size before any loadQuotes call
      _galleryNormalPageSize = getQuotesPerPage();
      setQuotesPerPage(64);
    } else {
      _galleryActive = false;
      quotesList.classList.remove('gallery-mode');
      columnCountSelect.classList.remove('gallery-active');
      if (_galleryNormalPageSize !== null) {
        setQuotesPerPage(_galleryNormalPageSize);
        _galleryNormalPageSize = null;
      }
      // Clear the image filters that gallery mode silently set
      const cbImg  = document.getElementById('searchHasImage');
      const selImg = document.getElementById('searchImageCondition');
      const cbType  = document.getElementById('searchHasImageType');
      const selType = document.getElementById('searchImageTypeCondition');
      if (cbImg)  cbImg.checked  = false;
      if (selImg) selImg.value   = 'has';
      if (cbType)  cbType.checked = false;
      if (selType) selType.value  = 'has';
      _syncImageTypeFilterState();
    }
  }

  if (displayModeSelect) {
    displayModeSelect.addEventListener('change', () => {
      const mode = displayModeSelect.value;
      const isDiaryModeSelect = isDateBehaviorType(currentNoteTypeFilter)
        && !isTrainingBehaviorType(currentNoteTypeFilter);

      if (isDiaryModeSelect) {
        if (mode !== 'cards' && mode !== 'calendar' && mode !== 'list') return;
        currentViewMode = mode === 'cards' ? 'cards' : 'list-pane';
        saveViewMode(currentNoteTypeFilter, currentViewMode);
        if (mode === 'calendar' || mode === 'list') {
          setTrainingSubMode(mode, currentNoteTypeFilter || 'training');
        }
      } else {
        if (mode !== 'cards' && mode !== 'list-pane') return;
        currentViewMode = mode;
        saveViewMode(currentNoteTypeFilter, mode);
      }
      updateViewModeToggle();
      loadQuotes();
    });
  }

  if (trainingSubModeSelect) {
    trainingSubModeSelect.addEventListener('change', () => {
      const mode = trainingSubModeSelect.value;
      if (mode !== 'calendar' && mode !== 'list') return;
      setTrainingSubMode(mode, currentNoteTypeFilter || 'training');
      updateViewModeToggle();
      updateSourcesFilterVisibility();
      loadQuotes();
    });
  }

  if (columnCountSelect) {
    const COLUMN_KEY = 'quotesColumnCount';

    /** Ensure all column options exist (older sessions may have .remove()'d them). */
    function ensureColumnCountOptions() {
      const specs = [
        ['1', '⬜ 1'],
        ['2', '⬜⬜ 2'],
        ['3', '⬜⬜⬜ 3'],
        ['4', '⬜⬜⬜⬜ 4'],
        ['gallery', '🖼 Gallery'],
      ];
      for (const [value, label] of specs) {
        if (!columnCountSelect.querySelector(`option[value="${CSS.escape(value)}"]`)) {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label;
          columnCountSelect.appendChild(opt);
        }
      }
      // Keep canonical order regardless of append order above
      for (const [value] of specs) {
        const opt = columnCountSelect.querySelector(`option[value="${CSS.escape(value)}"]`);
        if (opt) columnCountSelect.appendChild(opt);
      }
    }

    function setColumnCountOptionLabels(isSmallScreen) {
      const labels = isSmallScreen
        ? new Map([
            ['1', '⬜ 1'],
            ['2', '▦ Cards'],
            ['3', '⬜⬜⬜ 3'],
            ['4', '⬜⬜⬜⬜ 4'],
            ['gallery', '🖼 Gallery'],
          ])
        : new Map([
            ['1', '⬜ 1'],
            ['2', '⬜⬜ 2'],
            ['3', '⬜⬜⬜ 3'],
            ['4', '⬜⬜⬜⬜ 4'],
            ['gallery', '🖼 Gallery'],
          ]);

      for (const [value, label] of labels) {
        const opt = columnCountSelect.querySelector(`option[value="${CSS.escape(value)}"]`);
        if (opt && opt.textContent !== label) opt.textContent = label;
      }
    }

    /** Phone: Cards/Gallery; medium/tablet: 2/3/Gallery; desktop: full set. */
    function syncColumnCountOptions() {
      ensureColumnCountOptions();
      const isSmallScreen = window.matchMedia('(max-width: 767px)').matches;
      const isMediumScreen = window.matchMedia('(min-width: 768px) and (max-width: 1100px)').matches;
      const allowedInSmall = new Set(['2', 'gallery']);
      const allowedInMedium = new Set(['2', '3', 'gallery']);
      setColumnCountOptionLabels(isSmallScreen);
      Array.from(columnCountSelect.options).forEach((opt) => {
        const hide =
          (isSmallScreen && !allowedInSmall.has(opt.value)) ||
          (isMediumScreen && !allowedInMedium.has(opt.value));
        opt.hidden = hide;
        opt.disabled = hide;
      });

      const validValues = Array.from(columnCountSelect.options)
        .filter((o) => !o.hidden && !o.disabled)
        .map((o) => o.value);

      if (!validValues.includes(columnCountSelect.value)) {
        const fallback = validValues.includes('2') ? '2' : validValues[0];
        columnCountSelect.value = fallback;
        localStorage.setItem(COLUMN_KEY, fallback);
        if (fallback === 'gallery') {
          document.documentElement.style.setProperty('--card-column-count', '4');
          applyGalleryMode(true);
        } else {
          applyGalleryMode(false);
          document.documentElement.style.setProperty('--card-column-count', fallback);
        }
      }
      syncCompactSelectFacade(columnCountSelect);
    }

    syncColumnCountOptions();
    window.matchMedia('(max-width: 767px)').addEventListener('change', syncColumnCountOptions);
    window.matchMedia('(min-width: 768px) and (max-width: 1100px)').addEventListener('change', syncColumnCountOptions);

    // Sanitize saved value against options visible on this screen width.
    const validValues = Array.from(columnCountSelect.options)
      .filter((o) => !o.hidden && !o.disabled)
      .map((o) => o.value);
    let saved = localStorage.getItem(COLUMN_KEY);
    if (saved && !validValues.includes(saved)) {
      saved = '2';
      localStorage.setItem(COLUMN_KEY, saved);
    }

    if (saved) {
      columnCountSelect.value = saved;
      if (saved === 'gallery') {
        document.documentElement.style.setProperty('--card-column-count', '4');
        applyGalleryMode(true); // sets filters + page size before the first loadQuotes fires
      } else {
        document.documentElement.style.setProperty('--card-column-count', saved);
      }
    }
    columnCountSelect.addEventListener('change', () => {
      const val = columnCountSelect.value;
      if (val === 'gallery') {
        document.documentElement.style.setProperty('--card-column-count', '4');
        applyGalleryMode(true);
        localStorage.setItem(COLUMN_KEY, val);
        loadQuotes();
        loadTotalCount();
      } else {
        const wasGallery = _galleryActive;
        applyGalleryMode(false);
        document.documentElement.style.setProperty('--card-column-count', val);
        localStorage.setItem(COLUMN_KEY, val);
        if (wasGallery) {
          loadQuotes();
          loadTotalCount();
        }
        // Plain column change (1↔2↔3↔4): CSS variable update is instant, no reload needed
      }
    });
  }

  initCompactToolbarSelects();
  initMobileBottomSelectFacades();

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

  const sourceTypeFilterIds = [
    "filterBook",
    "filterMovie",
    "filterAssorted",
    "filterPoetry",
    "filterLyrics",
    "filterJokes"
  ];

  const updateSourceTypeFilterLabel = () => {
    const checkboxes = sourceTypeFilterIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const checked = checkboxes.filter((checkbox) => checkbox.checked);
    const label = document.getElementById("sourceTypeFilterLabel");
    if (!label) return;
    if (checked.length === checkboxes.length) {
      label.textContent = "📋 All sources";
    } else if (checked.length === 0) {
      label.textContent = "📋 No sources";
    } else if (checked.length === 1) {
      const row = checked[0].closest(".type-filter-option");
      const icon = row?.querySelector(".type-icon")?.textContent?.trim() || "📋";
      const text = row?.querySelector("span:last-child")?.textContent?.trim() || "1 source";
      label.textContent = `${icon} ${text}`;
    } else {
      label.textContent = `📋 ${checked.length} sources`;
    }
  };

  const reloadSourcesAfterTypeFilterChange = () => {
    updateSourceTypeFilterLabel();
    loadSources();
  };

  sourceTypeFilterIds.forEach((id) => {
    const checkbox = getElementByIdSafe(id);
    if (checkbox) {
      checkbox.addEventListener("change", reloadSourcesAfterTypeFilterChange);
    }
  });

  updateSourceTypeFilterLabel();

  const sourceTypeFilterToggle = getElementByIdSafe("sourceTypeFilterToggle");
  const sourceTypeFilterDropdown = getElementByIdSafe("sourceTypeFilterDropdown");
  if (sourceTypeFilterToggle && sourceTypeFilterDropdown) {
    sourceTypeFilterToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceTypeFilterDropdown.classList.toggle("show");
      sourceTypeFilterToggle.classList.toggle("open", sourceTypeFilterDropdown.classList.contains("show"));
    });

    sourceTypeFilterDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".sources-type-filter")) {
        sourceTypeFilterDropdown.classList.remove("show");
        sourceTypeFilterToggle.classList.remove("open");
      }
    });
  }

  const sourceTypeSelectAllBtn = getElementByIdSafe("sourceTypeSelectAllBtn");
  if (sourceTypeSelectAllBtn) {
    sourceTypeSelectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceTypeFilterIds.forEach((id) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = true;
      });
      reloadSourcesAfterTypeFilterChange();
    });
  }

  const sourceTypeDeselectAllBtn = getElementByIdSafe("sourceTypeDeselectAllBtn");
  if (sourceTypeDeselectAllBtn) {
    sourceTypeDeselectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceTypeFilterIds.forEach((id) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = false;
      });
      reloadSourcesAfterTypeFilterChange();
    });
  }

  // Sources view: Search input
  const searchSourceName = getElementByIdSafe("searchSourceName");
  if (searchSourceName) {
    searchSourceName.addEventListener("input", () => {
      clearTimeout(window.sourceSearchTimeout);
      window.sourceSearchTimeout = setTimeout(loadSources, 300);
    });
  }

  // Sources view: Sort dropdown
  const sortSourcesBySelect = getElementByIdSafe("sortSourcesBySelect");
  if (sortSourcesBySelect) {
    sortSourcesBySelect.addEventListener("change", () => {
      window.sourceSortBy = sortSourcesBySelect.value === "count" ? "count" : "name";
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

  // Authors view: Sort dropdown
  const sortAuthorsBySelect = getElementByIdSafe("sortAuthorsBySelect");
  if (sortAuthorsBySelect) {
    sortAuthorsBySelect.addEventListener("change", () => {
      window.authorSortBy = sortAuthorsBySelect.value === "count" ? "count" : "name";
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
  const openDatePickerBtn = getElementByIdSafe("openDatePickerBtn");
  
  if (noteDatePicker && noteDateText) {
    const parseDisplayDateForPicker = () => {
      const value = noteDateText.value.trim();
      const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (!match) return "";
      const [, rawDay, rawMonth, year] = match;
      const day = rawDay.padStart(2, "0");
      const month = rawMonth.padStart(2, "0");
      const isoDate = `${year}-${month}-${day}`;
      const parsed = new Date(`${isoDate}T00:00:00`);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getFullYear() !== Number(year) ||
        parsed.getMonth() + 1 !== Number(month) ||
        parsed.getDate() !== Number(day)
      ) {
        return "";
      }
      return isoDate;
    };

    const syncPickerFromText = () => {
      const pickerValue = parseDisplayDateForPicker();
      if (pickerValue) noteDatePicker.value = pickerValue;
    };

    noteDatePicker.addEventListener("change", () => {
      const pickerValue = noteDatePicker.value; // YYYY-MM-DD
      if (pickerValue) {
        const [year, month, day] = pickerValue.split('-');
        noteDateText.value = `${day}.${month}.${year}`; // Convert to dd.mm.yyyy
      }
    });

    noteDatePicker.addEventListener("pointerdown", syncPickerFromText);
    noteDatePicker.addEventListener("focus", syncPickerFromText);
    noteDateText.addEventListener("blur", syncPickerFromText);

    if (openDatePickerBtn) {
      openDatePickerBtn.addEventListener("click", () => {
        syncPickerFromText();
        if (typeof noteDatePicker.showPicker === "function") {
          try {
            noteDatePicker.showPicker();
            return;
          } catch (error) {
            // Some browsers expose showPicker but reject it for styled/overlay inputs.
          }
        }
        noteDatePicker.focus();
        noteDatePicker.click();
      });
    }
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

// Show "Add Multiple Quotes" only on the Quotes page
function updateBulkButtonVisibility() {
  const isQuotePage = currentNoteTypeFilter === 'quote';
  const d = isQuotePage ? '' : 'none';
  const addBulkBtn = getElementByIdSafe('addBulkBtn');
  const addBulkBtnTablet = getElementByIdSafe('addBulkBtnTablet');
  if (addBulkBtn) addBulkBtn.style.display = d;
  if (addBulkBtnTablet) addBulkBtnTablet.style.display = d;
  _updateSabTagOpAvailability();
}

// Wrapper for filterManager library
function updateSourcesFilterVisibility() {
  updateSourcesFilterVisibilityLib2(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
  if (isDateBehaviorType(currentNoteTypeFilter) && getTrainingSubMode(currentNoteTypeFilter) === 'calendar') {
    restoreTrainingDateFiltersToBar({ hide: true });
  }
}

// Decide which renderer (card grid vs list-pane) to use for the current note
// type, sync page size, and show/hide the Select button accordingly.
function updateViewModeToggle() {
  const supported = supportsListPaneView(currentNoteTypeFilter);
  const selectModeBtn = getElementByIdSafe('selectModeBtn');
  const isGallery = quotesList && quotesList.classList.contains('gallery-mode');
  const isDiaryModeSelect = isDateBehaviorType(currentNoteTypeFilter)
    && !isTrainingBehaviorType(currentNoteTypeFilter);

  if (supported) {
    currentViewMode = getStoredViewMode(currentNoteTypeFilter);

    if (!isGallery) {
      // Gallery manages its own page size — don't overwrite it
      setQuotesPerPage(
        currentViewMode === 'list-pane'
          ? getListPanePageSize(currentNoteTypeFilter)
          : 20
      );
    }

    // Hide Select button in list-pane mode (bulk ops require card mode)
    if (selectModeBtn) {
      selectModeBtn.style.display = currentViewMode === 'list-pane' ? 'none' : '';
    }

    if (isGallery) {
      // Gallery always shows the card grid, never the list-pane
      if (quotesList) quotesList.style.removeProperty('display');
      if (lpWrapper) lpWrapper.style.display = 'none';
    } else if (currentViewMode === 'list-pane') {
      // Use setProperty('display','none','important') so that CSS rules like
      // `.quotes-list.natural-sizing { display: block !important }` can't win.
      if (quotesList) quotesList.style.setProperty('display', 'none', 'important');
      if (lpWrapper) {
        if (!lpWrapper.querySelector('.lp-layout')) {
          lpWrapper.innerHTML = '<div class="loading">Loading…</div>';
        }
        lpWrapper.style.display = 'block';
      }
    } else {
      if (quotesList) quotesList.style.removeProperty('display');
      if (lpWrapper) lpWrapper.style.display = 'none';
    }
  } else {
    currentViewMode = 'cards';
    if (!isGallery) setQuotesPerPage(20);
    if (selectModeBtn) selectModeBtn.style.display = '';
    if (quotesList) quotesList.style.removeProperty('display');
    if (lpWrapper) lpWrapper.style.display = 'none';
  }

  if (displayModeSelect) {
    const showToggle = hasDisplayModeToggle(currentNoteTypeFilter);
    displayModeSelect.style.display = showToggle ? '' : 'none';
    if (showToggle) {
      if (isDiaryModeSelect) {
        displayModeSelect.innerHTML = `
          <option value="cards">⊞ Cards</option>
          <option value="calendar">📅 Calendar</option>
          <option value="list">☰ List</option>`;
        displayModeSelect.value = currentViewMode === 'cards'
          ? 'cards'
          : getTrainingSubMode(currentNoteTypeFilter);
      } else {
        displayModeSelect.innerHTML = `
          <option value="cards">⊞ Cards</option>
          <option value="list-pane">☰ List</option>`;
        displayModeSelect.value = currentViewMode;
      }
    }
  }

  if (trainingSubModeSelect) {
    const showTrainingToggle = isTrainingBehaviorType(currentNoteTypeFilter);
    trainingSubModeSelect.style.display = showTrainingToggle ? '' : 'none';
    if (showTrainingToggle) trainingSubModeSelect.value = getTrainingSubMode(currentNoteTypeFilter);
  }

  // Column count is irrelevant in list-pane layout
  if (columnCountSelect) {
    const hideColumns = supported && currentViewMode === 'list-pane' && !isGallery;
    columnCountSelect.style.display = hideColumns ? 'none' : '';
  }

  [displayModeSelect, trainingSubModeSelect, columnCountSelect].forEach(syncCompactSelectFacade);
}

// Wrapper with app-specific additions
function updateFieldVisibility() {
  const noteType = getElementByIdSafe('noteType').value;
  
  // Use library function for standard field visibility (author/source, training, etc.)
  updateModalFieldVisibility(noteType);
  populateTrainingTypeDropdown(noteType);
  
  // Repopulate the generic sub-type dropdown whenever the note type changes
  populateGenericSubTypeDropdown(noteType);
  
  // Update labels using library
  updateModalLabels(noteType);
  
  // Update modal title based on type
  const quoteIdInput = document.getElementById('quoteId');
  const isEditing = quoteIdInput && quoteIdInput.value;
  if (!isEditing) {
    modalTitle.textContent = "Add";
  }

  syncNoteModalEntityShowButtons();
}

function syncNoteModalEntityShowButtons() {
  const noteType = document.getElementById('noteType')?.value || '';
  const authorBtn = document.getElementById('showAuthorFromNoteBtn');
  const sourceBtn = document.getElementById('showSourceFromNoteBtn');
  const authorIdEl = document.getElementById('noteModalAuthorId');
  const sourceIdEl = document.getElementById('noteModalSourceId');
  const showAuthor = hasAuthorField(noteType);
  const showSource = hasSourceField(noteType);
  if (authorBtn) {
    authorBtn.style.display = showAuthor ? '' : 'none';
    authorBtn.disabled = !showAuthor || !authorIdEl?.value?.trim();
  }
  if (sourceBtn) {
    sourceBtn.style.display = showSource ? '' : 'none';
    sourceBtn.disabled = !showSource || !sourceIdEl?.value?.trim();
  }
}
window.syncNoteModalEntityShowButtons = syncNoteModalEntityShowButtons;

function initializeNoteModalEntityNav() {
  const authorBtn = getElementByIdSafe('showAuthorFromNoteBtn');
  const sourceBtn = getElementByIdSafe('showSourceFromNoteBtn');
  if (authorBtn) {
    authorBtn.addEventListener('click', async () => {
      const id = getElementByIdSafe('noteModalAuthorId')?.value?.trim();
      const name = (authorInput?.value || '').trim() || 'Author';
      if (!id) return;
      closeQuoteModal();
      switchView('authors');
      await openAuthorModalLib(id, name, null);
    });
  }
  if (sourceBtn) {
    sourceBtn.addEventListener('click', async () => {
      const id = getElementByIdSafe('noteModalSourceId')?.value?.trim();
      const name = (sourceInput?.value || '').trim() || 'Source';
      const sourceType = getElementByIdSafe('sourceType')?.value || 'BOOK';
      if (!id) return;
      closeQuoteModal();
      switchView('sources');
      await openSourceModalLib(id, name, sourceType, null);
    });
  }
  if (authorInput) {
    authorInput.addEventListener('input', () => {
      const h = getElementByIdSafe('noteModalAuthorId');
      if (h) h.value = '';
      syncNoteModalEntityShowButtons();
    });
  }
  if (sourceInput) {
    sourceInput.addEventListener('input', () => {
      const h = getElementByIdSafe('noteModalSourceId');
      if (h) h.value = '';
      syncNoteModalEntityShowButtons();
    });
  }
}

function isSmallModalViewport() {
  return window.matchMedia
    ? window.matchMedia("(max-width: 767px)").matches
    : window.innerWidth <= 767;
}

function isCompactModalViewport() {
  return window.matchMedia
    ? window.matchMedia("(max-width: 1100px)").matches
    : window.innerWidth <= 1100;
}

function isMediumPortraitModalViewport() {
  return window.matchMedia
    ? window.matchMedia("(min-width: 700px) and (max-width: 1100px) and (orientation: portrait)").matches
    : window.innerWidth >= 700 && window.innerWidth <= 1100 && window.innerHeight > window.innerWidth;
}

function canUseQuoteModalMaximize() {
  return !isCompactModalViewport() || isMediumPortraitModalViewport();
}

function setQuoteModalMaximized(enabled) {
  const content = document.querySelector('#quoteModal .modal-content');
  if (!content) return;

  if (enabled && !canUseQuoteModalMaximize()) {
    enabled = false;
  }

  content.classList.toggle('modal-expanded', Boolean(enabled));
  if (toggleQuoteModalMaximizeBtn) {
    const isExpanded = content.classList.contains('modal-expanded');
    toggleQuoteModalMaximizeBtn.textContent = isExpanded ? '↙' : '⛶';
    toggleQuoteModalMaximizeBtn.title = isExpanded ? 'Restore modal size' : 'Maximize modal';
    toggleQuoteModalMaximizeBtn.setAttribute('aria-label', toggleQuoteModalMaximizeBtn.title);
    toggleQuoteModalMaximizeBtn.setAttribute('aria-pressed', String(isExpanded));
  }
}

function toggleQuoteModalMaximized() {
  const content = document.querySelector('#quoteModal .modal-content');
  setQuoteModalMaximized(!content?.classList.contains('modal-expanded'));
}

function syncQuoteDetailsToggle() {
  const details = document.getElementById('quoteDetailsSection');
  if (!details || !toggleQuoteDetailsBtn) return;

  const isOpen = details.open;
  toggleQuoteDetailsBtn.classList.toggle('active', isOpen);
  toggleQuoteDetailsBtn.title = isOpen ? 'Hide details' : 'Show details';
  toggleQuoteDetailsBtn.setAttribute('aria-label', toggleQuoteDetailsBtn.title);
  toggleQuoteDetailsBtn.setAttribute('aria-pressed', String(isOpen));
}

function setQuoteDetailsDefault({ forceOpen = false } = {}) {
  const details = document.getElementById('quoteDetailsSection');
  if (!details) return;
  details.open = forceOpen || !isSmallModalViewport();
  syncQuoteDetailsToggle();
}

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
    updateModalLabels,
    globalSettings
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
  setQuoteDetailsDefault();
  
  // Show modal
  quoteModal.style.display = "block";
  
  // Set focus to Quote text editor after modal is displayed
  setTimeout(() => {
    if (quillEditor) {
      quillEditor.focus();
    }
  }, 100); // Small delay to ensure modal is fully rendered
}

function openPropertiesModal(quote) {
  openEditModal(quote, { propertiesOnly: true });
}

function openEditModal(quote, options = {}) {
  const { propertiesOnly = false } = options;

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
  
  const state = setupEditModal(
    quote,
    elements,
    quillEditor,
    updateFieldVisibility,
    updateModalLabels,
    populateTagsForEdit,
    propertiesOnly
      ? { skipTextEditor: true, modalTitleText: 'Properties' }
      : {}
  );

  if (propertiesOnly) {
    syncPaneTextToModalHidden();
    const qt = getElementByIdSafe('quoteText');
    if (qt) qt.value = getPaneEditorHtml() || quote.note_text || '';
    quoteModal.classList.add('modal-properties-only');
  } else {
    quoteModal.classList.remove('modal-properties-only');
  }
  
  // Update app state
  editingQuoteId = state.editingQuoteId;
  currentQuoteImage = state.currentQuoteImage;
  currentQuoteImageFull = state.currentQuoteImageFull;
  currentAttachmentType = state.currentAttachmentType || "image";
  currentAttachmentFileName = state.currentAttachmentFileName || "";
  window.currentSourceId = state.currentSourceId;

  // Populate and set the generic sub-type dropdown when editing a generic note
  const editNoteType = quote.note_type || 'quote';
  if (hasGenericSubTypeField(editNoteType)) {
    populateGenericSubTypeDropdown(editNoteType, quote.source_type || '');
  }
  
  // Display attachment preview (app-specific)
  if (currentQuoteImage || currentQuoteImageFull) {
    if (currentAttachmentType !== 'image') {
      // Non-image: show PDF/rendered thumbnail if available, else icon fallback
      const icon = getAttachmentIcon(currentAttachmentType);
      displayAttachmentPreview(quoteImagePreview, icon, currentAttachmentFileName || "Attachment", "", currentQuoteImage);
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
  setQuoteDetailsDefault({ forceOpen: propertiesOnly });


  // Show modal
  quoteModal.style.display = "block";
}

function closeQuoteModal() {
  quoteModal.style.display = "none";
  quoteModal.classList.remove('modal-properties-only');
  quoteModal.classList.remove('has-attachment');
  setQuoteModalMaximized(false);
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
  window._primaryEncAttData = null;
  authorSuggestions.classList.remove("show");
  sourceSuggestions.classList.remove("show");
  // Hide HTML source panel
  const htmlPanel = document.getElementById('htmlSourcePanel');
  if (htmlPanel) htmlPanel.style.display = 'none';
}

// HTML source viewer is now in lib/htmlSourceViewer.js (initialised below).

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

  // Re-apply selection highlights after DOM rebuild — respects SAF mode.
  reapplyCardSelectionClasses();
  
  // Update pagination controls after loading quotes
  updatePaginationControls();
  
}

// Load total count
async function loadTotalCount() {
  const currentSettings = getGlobalSettings();
  await loadTotalCountLib(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, currentSettings);
  
  // Sync local state for pagination
  const filteredCountElement = getElementByIdSafe("filteredQuotesCount");
  if (filteredCountElement) {
    filteredQuotes = parseInt(filteredCountElement.textContent) || 0;
  }
  const totalCountElement = getElementByIdSafe("totalQuotesCount");
  if (totalCountElement) {
    totalQuotes = parseInt(totalCountElement.textContent) || 0;
  }

  // Keep Select-Action-Bar's SAF count accurate as filters/pages change.
  _syncTotalFilteredCount();
  if (selectionMode && selectAllFiltered) updateSelectActionBar();

  updatePaginationControls();
}

async function handleSubmit(e) {
  e.preventDefault();

  if (quoteModal.classList.contains('modal-properties-only')) {
    syncPaneTextToModalHidden();
  }

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
  // Pending encrypted primary attachment — do not send sentinel to server
  const hasPrimaryEncPending = !editingQuoteId && currentQuoteImageFull === '_pending_enc_';

  const state = {
    editingQuoteId,
    currentQuoteImage:    (attachmentsAlreadyManaged || hasPrimaryEncPending) ? undefined : currentQuoteImage,
    currentQuoteImageFull: (attachmentsAlreadyManaged || hasPrimaryEncPending) ? undefined : currentQuoteImageFull,
    currentAttachmentType: (attachmentsAlreadyManaged || hasPrimaryEncPending) ? undefined : currentAttachmentType,
    globalSettings
  };

  const callbacks = {
    onSuccess: async (newNote) => {
      // Upload any queued attachments (add-mode multi-attach)
      if (pendingExtraAttachments.length > 0) {
        const noteId = newNote?.id || editingQuoteId;
        if (noteId) {
          const folder = document.getElementById('noteType')?.value || currentNoteTypeFilter || 'note';
          for (const att of pendingExtraAttachments) {
            try {
              if (att._encryptedBlob) {
                // Encrypted attachment: multipart upload to preserve .enc extension
                const fd = new FormData();
                fd.append('file', new File([att._encryptedBlob], att.filename, { type: 'application/octet-stream' }), att.filename);
                fd.append('attachment_type', 'encrypted');
                fd.append('original_name', att._origName);
                fd.append('folder', folder);
                await fetch(`/api/notes/${noteId}/attachments/file`, { method: 'POST', body: fd });
              } else {
                await postAttachmentToNote(noteId, att);
              }
            } catch (_) {}
          }
          pendingExtraAttachments = [];
        }
      }
      // Handle primary encrypted attachment queued for a new note
      if (window._primaryEncAttData?._encryptedBlob) {
        const noteId = newNote?.id || editingQuoteId;
        if (noteId) {
          const att    = window._primaryEncAttData;
          const folder = document.getElementById('noteType')?.value || currentNoteTypeFilter || 'note';
          const fd     = new FormData();
          fd.append('file', new File([att._encryptedBlob], att.filename, { type: 'application/octet-stream' }), att.filename);
          fd.append('attachment_type', 'encrypted');
          fd.append('original_name', att._origName);
          fd.append('folder', folder);
          try { await fetch(`/api/notes/${noteId}/attachments/file`, { method: 'POST', body: fd }); } catch (_) {}
        }
        window._primaryEncAttData = null;
      }
      const wasEdit = !!editingQuoteId;
      const prevEditingId = editingQuoteId;
      closeQuoteModal();
      const savedId = newNote?.id || prevEditingId;
      // List-pane: in-place refresh only works for edits (note already in _notes).
      // New notes need a full reload so calendar/list rows pick up the create.
      if (usesListPaneLayout(currentNoteTypeFilter, currentViewMode) && wasEdit && savedId && newNote) {
        refreshPaneNote(savedId, newNote);
        applyPaneSavedNote(newNote);
      } else {
        if (!wasEdit && savedId) {
          setPendingInitialNoteId(savedId);
          if (isDateBehaviorType(currentNoteTypeFilter) && newNote?.note_date) {
            alignTrainingFiltersToDate(newNote.note_date);
          }
        }
        loadQuotes();
      }
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

// Apply showLongExpanded setting to any collapsible text inside the pane.
// Called after each pane render (initial + row click).
function applyPaneShowLongExpanded() {
  document.querySelectorAll('.lp-pane .quote-text.collapsible').forEach((quoteText) => {
    const numericId = quoteText.id.replace('quote-', '');
    const expandEnabled = getDisplaySetting('showLongExpanded', currentNoteTypeFilter);
    if (expandEnabled) {
      const btnEl = document.getElementById(`expand-${numericId}`);
      if (btnEl) {
        quoteText.classList.remove('collapsible');
        quoteText.dataset.expanded = 'true';
        btnEl.innerHTML = '▲ Show less';
      }
    }
  });
}

// Display Functions
function displayQuotes(quotes) {
  // Always sync view mode from localStorage so the first render after a page
  // reload or hash-navigation is correct, regardless of call order.
  if (supportsListPaneView(currentNoteTypeFilter)) {
    currentViewMode = getStoredViewMode(currentNoteTypeFilter);
    updateViewModeToggle();
    updateBulkButtonVisibility();
  } else {
    currentViewMode = 'cards';
  }

  quoteCount.textContent = `(${quotes.length})`;

  // In date-based list-pane views, the left column may be showing the calendar
  // sub-view.  The calendar does its own month fetch, so we must still render
  // it even if the main list fetch returned zero notes.
  const calendarActive =
    isDateBehaviorType(currentNoteTypeFilter) &&
    currentViewMode === 'list-pane' &&
    getTrainingSubMode(currentNoteTypeFilter) === 'calendar';

  if (quotes.length === 0 && !calendarActive) {
    // Show "empty" in quotesList, hide lpWrapper
    quotesList.style.removeProperty('display');
    if (lpWrapper) lpWrapper.style.display = 'none';
    quotesList.innerHTML =
      '<div class="no-quotes">No quotes found. Add your first quote!</div>';
    return;
  }

  // ── List-Pane view ──────────────────────────────────────────
  // Renders into #lpWrapper (a plain div, never a grid) — quotesList is hidden.
  // Skip list-pane rendering when gallery mode is active (gallery always uses card grid).
  const isGallery = quotesList && quotesList.classList.contains('gallery-mode');
  if (!isGallery && usesListPaneLayout(currentNoteTypeFilter, currentViewMode)) {
    quotesList.style.setProperty('display', 'none', 'important');
    if (lpWrapper) {
      lpWrapper.style.display = 'block';
    } else {
      // lpWrapper missing — fall through to card grid as safety net
      quotesList.style.removeProperty('display');
    }
    const currentSettings = getGlobalSettings();
    const trainingSubTypes = isDateBehaviorType(currentNoteTypeFilter)
      ? getTrainingTypes(currentNoteTypeFilter)
      : [];
    // Preserve selection across reloads (e.g. after save)
    const prevSelectedId = resolveInitialNoteId(getLpSelectedNoteId());
    renderListPaneView(lpWrapper || quotesList, quotes, {
      openPropertiesModal,
      openAuthorModal,
      openSourceModal,
      filterByTag,
      currentNoteTypeFilter,
      isDateBehaviorType: isDateBehaviorType(currentNoteTypeFilter),
      hasTrainingSubTypes: trainingSubTypes.length > 0,
      getTrainingTypes,
      getQuoteTypes,
      globalSettings: currentSettings,
      initialNoteId: prevSelectedId,
      onPaneNoteUpdated: applyPaneSavedNote,
      // When the user toggles Calendar/List in the training list header we
      // want a full reload: list mode needs pagination to reappear, and
      // calendar mode needs it gone.  loadQuotes() flows through displayQuotes
      // which handles both.
      onSubModeChange: () => loadQuotes(),
      createQuoteCard: (note) =>
        createQuoteCardLib(note, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, currentSettings)
    });
    updateSourcesFilterVisibility();
    return;
  }

  // ── Card grid view (default) ────────────────────────────────
  if (lpWrapper) lpWrapper.style.display = 'none';
  quotesList.style.removeProperty('display');
  updateSourcesFilterVisibility();
  const currentSettings = getGlobalSettings();
  
  // Use library for basic rendering (pass globalSettings for score display)
  displayQuotesLib(quotes, currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, currentSettings);

  // Apply app-specific settings and post-processing (per-type overrides respected)
  // Training always uses row-ordered CSS Grid (never masonry column-count),
  // because column-first ordering breaks chronological readability of training logs.
  const realSizeEnabled = currentNoteTypeFilter === 'training'
    ? false
    : getDisplaySetting('displayByRealSize', currentNoteTypeFilter);
  applyQuoteSizingMode(realSizeEnabled);

  // In "All notes" (currentNoteTypeFilter is null), resolve showLongExpanded per card
  // so that per-type overrides (e.g. training = false) are respected even in the mixed view.
  document.querySelectorAll('.quote-text.collapsible').forEach((quoteText) => {
    const numericId = quoteText.id.replace('quote-', '');
    const card = document.querySelector(`.quote-card[data-quote-id="${numericId}"]`);
    const cardNoteType = currentNoteTypeFilter || card?.dataset?.noteType || null;
    const expandLongEnabled = getDisplaySetting('showLongExpanded', cardNoteType);

    if (expandLongEnabled) {
      const btnEl = getElementByIdSafe(`expand-${numericId}`);
      if (btnEl) {
        quoteText.classList.remove('collapsible');
        quoteText.dataset.expanded = "true";
        btnEl.innerHTML = "▲ Show less";
      }
    }
  });

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
function createQuoteCard(quote, noteTypeFilterOverride = null) {
  const filter =
    noteTypeFilterOverride !== null && noteTypeFilterOverride !== undefined
      ? noteTypeFilterOverride
      : currentNoteTypeFilter;
  return createQuoteCardLib(quote, filter, getTrainingTypes, getQuoteTypes, globalSettings);
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
      // The file on disk is now overwritten with a ≤1024px version.
      // The viewer already checks real image dimensions before showing the button,
      // so it will not reappear when the image is next opened.
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
        currentAuthorImage = result.thumbnail;
        displayImage(authorImagePreview, result.thumbnail);
      } else if (type === "source") {
        currentSourceImage = result.thumbnail;
        displayImage(sourceImagePreview, result.thumbnail);
      }
    },
    onAttachmentLoaded: (result, icon, filename, size) => {
      currentQuoteImageFull = result.full;
      currentQuoteImage = result.thumbnail;
      currentAttachmentType = result.type;
      currentAttachmentFileName = result.filename;
      displayAttachmentPreview(quoteImagePreview, icon, filename, size, result.thumbnail);
      updateAttachmentPanelVisibility(); // Update panel visibility when attachment loads
    }
  };
  
  // Pass the current note-type as the storage folder hint for large-file direct upload
  const folder = currentNoteTypeFilter || 'note';
  return readAttachmentFileLib(file, type, globalSettings, callbacks, folder);
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
        currentAuthorImage = result.thumbnail;
        window.currentAuthorImage = result.thumbnail; // Keep window object in sync
        displayImage(authorImagePreview, result.thumbnail);
        // Show clear button
        if (clearAuthorImageBtn) clearAuthorImageBtn.style.display = 'flex';
        toggleAuthorAttachmentPanel();
      } else if (type === "source") {
        currentSourceImage = result.thumbnail;
        window.currentSourceImage = result.thumbnail; // Keep window object in sync
        displayImage(sourceImagePreview, result.thumbnail);
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
        updateAttachmentPanelVisibility();
      } else if (type === "author") {
        currentAuthorImage = result.thumbnail;
        window.currentAuthorImage = result.thumbnail; // Keep window object in sync
        displayImage(authorImagePreview, result.thumbnail);
        // Show clear button
        if (clearAuthorImageBtn) clearAuthorImageBtn.style.display = 'flex';
        toggleAuthorAttachmentPanel();
      } else if (type === "source") {
        currentSourceImage = result.thumbnail;
        window.currentSourceImage = result.thumbnail; // Keep window object in sync
        displayImage(sourceImagePreview, result.thumbnail);
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
function displayAttachmentPreview(container, icon, filename, size, thumbnail = null) {
  displayAttachmentPreviewLib(container, icon, filename, size, escapeHtml, thumbnail);
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

function isSmallViewport() {
  return window.matchMedia
    ? window.matchMedia("(max-width: 767px)").matches
    : window.innerWidth <= 767;
}

const QUOTE_GALLERY_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif";
const QUOTE_GALLERY_PICKER_TYPES = [{
  description: "Images",
  accept: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
    "image/heic": [".heic"],
    "image/heif": [".heif"],
  },
}];

async function processQuoteAttachmentFile(file) {
  // Edit mode → always upload to the server immediately (first or additional attachment)
  if (editingQuoteId) {
    await addAttachmentFromFile(file, editingQuoteId);
    return;
  }

  // Add mode + existing primary attachment → queue for upload after save
  if (currentQuoteImage || currentQuoteImageFull) {
    await queuePendingAttachment(file);
    return;
  }

  // Add mode, no attachment yet — set as the primary (local state only until save)
  await readAttachmentFile(file, "quote");
}

function wireQuoteAttachmentInput(input) {
  if (!input) return;

  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await processQuoteAttachmentFile(file);
    } catch (err) {
      console.error("Could not add attachment:", err);
    } finally {
      input.value = "";
    }
  });
}

function openQuoteAttachmentInput(input) {
  if (!input) return;
  input.value = "";
  input.click();
}

async function openQuoteGalleryPicker() {
  if (quoteImageGalleryFile) quoteImageGalleryFile.accept = QUOTE_GALLERY_ACCEPT;

  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: QUOTE_GALLERY_PICKER_TYPES,
      });
      const file = await handle?.getFile?.();
      if (file) await processQuoteAttachmentFile(file);
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.warn("Image picker unavailable, falling back to file input:", err);
    }
  }

  openQuoteAttachmentInput(quoteImageGalleryFile);
}

function wireQuoteAttachmentPickerButton(button, opener) {
  if (!button || !opener) return;
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof opener === "function") {
      opener();
    } else {
      openQuoteAttachmentInput(opener);
    }
  });
}

wireQuoteAttachmentInput(quoteImageFile);
wireQuoteAttachmentInput(quoteImageGalleryFile);
wireQuoteAttachmentInput(quoteCameraFile);
wireQuoteAttachmentPickerButton(quoteAttachGalleryBtn, openQuoteGalleryPicker);
wireQuoteAttachmentPickerButton(quoteAttachCameraBtn, quoteCameraFile);
wireQuoteAttachmentPickerButton(quoteAttachFilesBtn, quoteImageFile);

// Handle quote image paste
getElementByIdSafe("quoteModal").addEventListener("paste", (e) => {
  handlePaste(e, "quote");
});

// Clear quote image
clearQuoteImageBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  // If editing an existing note that has a saved attachment record, use the proper
  // delete API so the file is removed from disk and note_attachments is cleaned up.
  if (editingQuoteId && currentModalAttachments.length > 0) {
    await deleteModalAttachment(0);
    return;
  }
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
      : `<div class="modal-att-icon">${att.attachment_type === 'pdf' ? '📄' : att.attachment_type === 'video' ? '🎬' : att.attachment_type === 'encrypted' ? '🔒' : '📎'}</div>`;
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

  // Keep current* state in sync so the preview click handler works
  currentAttachmentType = previewType;
  currentQuoteImageFull = att.attachment_full || '';
  currentQuoteImage     = att.thumbnail || '';
  if (previewType === 'encrypted') {
    const rawPath = (att.attachment_full || '').replace(/^file:/, '').split('/').pop();
    currentAttachmentFileName = rawPath.replace(/^\d+\./, '').replace(/\.enc$/i, '');
  }

  if (previewType !== 'image') {
    displayAttachmentPreview(quoteImagePreview, getAttachmentIcon(previewType), currentAttachmentFileName || 'Attachment', '');
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
        updateAttachmentPanelVisibility();
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
        updateAttachmentPanelVisibility();
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
      : `<div class="modal-att-icon">${att.attachment_type === 'pdf' ? '📄' : att.attachment_type === 'video' ? '🎬' : att.attachment_type === 'encrypted' ? '🔒' : '📎'}</div>`;
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

// Merge modal is now in lib/mergeModal.js (initialised below).
// `openMergeModal` and `fetchNotesByIds` are imported at the top.

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a file, generate thumbnail + full via the attachments library,
 * POST it to /api/notes/:id/attachments, then refresh the strip.
 */
async function addAttachmentFromFile(file, noteId) {
  const globalSettings = getGlobalSettings();
  // Use the note type currently selected in the modal as the upload folder
  // so files land in the correct vault subfolder (historical/, notes/, etc.)
  const folder = document.getElementById('noteType')?.value || currentNoteTypeFilter || 'note';

  const wasFirstAttachment = !currentQuoteImage && !currentQuoteImageFull;

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
          // If this was the very first attachment, update local preview state too
          if (wasFirstAttachment) {
            currentQuoteImage        = result.thumbnail;
            currentQuoteImageFull    = result.full;
            currentAttachmentType    = result.type || 'image';
            currentAttachmentFileName = result.filename || file.name;
            displayImage(quoteImagePreview, result.thumbnail);
            updateAttachmentPanelVisibility();
          }
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
          if (wasFirstAttachment) {
            currentQuoteImage        = result.thumbnail || null;
            currentQuoteImageFull    = result.full;
            currentAttachmentType    = result.type || 'image';
            currentAttachmentFileName = result.filename || file.name;
            if (result.thumbnail) displayImage(quoteImagePreview, result.thumbnail);
            updateAttachmentPanelVisibility();
          }
          resolve();
        } catch (err) {
          alert('Could not add attachment: ' + err.message);
          resolve();
        }
      },
    };
    readAttachmentFileLib(file, 'quote', globalSettings, callbacks, folder);
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

  const updated = await fetch(`/api/quotes/${noteId}`).then(r => r.json());
  renderModalAttachmentStrip(updated);
  loadQuotes();
  return updated;
}

/** List-pane: add attachment and refresh pane + left list row in place. */
async function postAttachmentToPaneNote(noteId, attData) {
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

  const updated = await fetch(`/api/quotes/${noteId}`).then(r => r.json());
  refreshPaneNote(noteId, updated, { updatePaneEditor: false });
  const pane = document.querySelector('.lp-pane');
  if (pane) renderPaneAttachments(pane, updated);
  loadQuotes();
  return updated;
}

async function addPaneAttachmentFromFile(file, noteId) {
  const globalSettings = getGlobalSettings();
  const folder = currentNoteTypeFilter || 'note';
  return new Promise((resolve) => {
    const callbacks = {
      onImageLoaded: async (result) => {
        try {
          await postAttachmentToPaneNote(noteId, {
            thumbnail: result.thumbnail,
            attachment_full: result.full,
            attachment_type: result.type || 'image',
            filename: result.filename || file.name,
          });
        } catch (err) {
          alert('Could not add attachment: ' + err.message);
        }
        resolve();
      },
      onAttachmentLoaded: async (result) => {
        try {
          await postAttachmentToPaneNote(noteId, {
            thumbnail: result.thumbnail || null,
            attachment_full: result.full,
            attachment_type: result.type || 'image',
            filename: result.filename || file.name,
          });
        } catch (err) {
          alert('Could not add attachment: ' + err.message);
        }
        resolve();
      },
    };
    readAttachmentFileLib(file, 'quote', globalSettings, callbacks, folder);
  });
}

async function deletePaneAttachment(noteId, att, idx) {
  const label = att.attachment_filename || att.attachment_type || `attachment ${idx + 1}`;
  if (!await showConfirm(`"${label}" will be removed from this note.`, { title: 'Remove attachment', danger: true })) return;

  try {
    if (att.id) {
      const resp = await fetch(`/api/notes/${noteId}/attachments/${att.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(await resp.text());
    } else if (idx !== 0) {
      return;
    } else {
      throw new Error('Cannot remove attachment — missing id.');
    }
    const updated = await fetch(`/api/quotes/${noteId}`).then(r => r.json());
    refreshPaneNote(noteId, updated, { updatePaneEditor: false });
    const pane = document.querySelector('.lp-pane');
    if (pane) renderPaneAttachments(pane, updated);
    loadQuotes();
  } catch (err) {
    alert('Could not delete attachment: ' + err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────

// Toggle attachment panel
const toggleAttachmentBtn = getElementByIdSafe(BUTTON_IDS.TOGGLE_ATTACHMENT_BTN, 'setupEventListeners');
if (toggleAttachmentBtn) {
  toggleAttachmentBtn.addEventListener('click', toggleAttachmentPanel);
}

// Encrypt & attach button — opens a file picker, then encrypts the file before uploading
const addEncryptedAttachBtn  = document.getElementById('addEncryptedAttachBtn');
const encryptedAttachFileInput = document.getElementById('encryptedAttachFileInput');
if (addEncryptedAttachBtn && encryptedAttachFileInput) {
  addEncryptedAttachBtn.addEventListener('click', () => encryptedAttachFileInput.click());
  encryptedAttachFileInput.addEventListener('change', async () => {
    const file = encryptedAttachFileInput.files[0];
    encryptedAttachFileInput.value = ''; // reset so same file can be selected again
    if (file) await window.addEncryptedAttachment(file);
  });
}

// Encrypted attachment flow lives in lib/encryptedAttachments.js (initialised below).
// `window.addEncryptedAttachment` and `window.openEncryptedAttachment` are
// exposed from there for the inline onclick handlers in cardRenderer.js.

// Handle click on modal image preview - open full-size viewer if image exists, otherwise open file dialog
quoteImagePreview.addEventListener('click', (e) => {
  if (currentQuoteImage || currentQuoteImageFull) {
    e.preventDefault();
    e.stopPropagation();
    if (currentAttachmentType === 'encrypted') {
      // Encrypted attachment: decrypt and display
      const fileUrl = currentQuoteImageFull || currentQuoteImage;
      window.openEncryptedAttachment(fileUrl, currentAttachmentFileName || 'file');
    } else {
      const imageSrc = currentQuoteImageFull || currentQuoteImage;
      showFullImage(imageSrc, editingQuoteId, currentAttachmentType);
    }
  } else {
    // No image - on phones, prefer the photo gallery path; the Files button
    // remains available beside it for PDFs, audio, video, and documents.
    if (isSmallViewport()) {
      openQuoteGalleryPicker();
    } else {
      openQuoteAttachmentInput(quoteImageFile);
    }
  }
});

// MIGRATED: Autocomplete functions (including tag autocomplete) moved to autocompleteManager.js

// ============= PAGINATION =============

function updatePaginationControls() {
  const paginationContainer = getElementByIdSafe("paginationControls");
  if (!paginationContainer) return;

  // Date-based Calendar sub-mode owns its own month navigation — pagination
  // would be meaningless.  Hide the whole pagination section (not just its
  // contents) so no empty strip lingers below the calendar.
  // List sub-mode still needs pagination.
  if (
    isDateBehaviorType(currentNoteTypeFilter) &&
    currentViewMode === 'list-pane' &&
    getTrainingSubMode(currentNoteTypeFilter) === 'calendar'
  ) {
    paginationContainer.innerHTML = '';
    paginationContainer.style.display = 'none';
    return;
  }
  // Ensure the section is visible for every other case (including training
  // list sub-mode) after returning from a state that hid it.
  paginationContainer.style.removeProperty('display');

  // Use filteredQuotes for pagination calculations
  const qpp = getQuotesPerPage();
  const totalPages = Math.ceil(filteredQuotes / qpp);
  const startItem = filteredQuotes === 0 ? 0 : (currentPage - 1) * qpp + 1;
  const endItem = Math.min(currentPage * qpp, filteredQuotes);

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
  const totalPages = Math.ceil(filteredQuotes / getQuotesPerPage());
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
        navigateToNoteTypeFilter(null);
        item.classList.add("active");
        return;
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
      prepareSettingsView: async () => {
        await refreshSettingsForOptionsPanel();
        globalSettings = getGlobalSettings();
        populateDataExportScopeSelect();
        wireServicesRefresh();
        await loadServicesPanel();
      },
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
  syncNoteTypeFilterDropdowns();
};

// Authors / Sources list pages are now in lib/entityListPage.js (initialised below).
// `loadAuthors`, `loadSources`, `displayAuthors`, `displaySources` are imported
// from there at the top of this file.

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
// All rename-modal logic now lives in lib/renameModal.js (initialised below).
// `showNotification` is imported at the top from lib/notifications.js so the
// tag-operations code below still has access to it.
// NOTE: as of May 2026 the rename modal appears to be orphaned (no callers);
// see the header of lib/renameModal.js for details.

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

function getDataManagementExportScope() {
  const select = getElementByIdSafe('dataExportScopeSelect', 'getDataManagementExportScope');
  return select?.value || null;
}

async function fetchDataManagementExportCount(scope) {
  const params = new URLSearchParams();
  if (scope) params.set('note_type', scope);

  const query = params.toString();
  const response = await fetch(`${API_URL}/quotes/count${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to load export count (${response.status})`);
  }

  const data = await response.json();
  const count = scope
    ? Number(data.typeTotal ?? data.count ?? 0)
    : Number(data.grandTotal ?? data.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

async function exportDataManagementPdf() {
  const exportBtn = getElementByIdSafe('dataExportPdfBtn', 'exportDataManagementPdf');
  const scope = getDataManagementExportScope();
  let count;

  try {
    count = await fetchDataManagementExportCount(scope);
  } catch (error) {
    console.error('Export PDF count error:', error);
    alert('❌ Could not count notes for export: ' + error.message);
    return;
  }

  if (count === 0) {
    alert('⚠️ No notes to export.');
    return;
  }

  const exportChoice = await showPdfExportConfirm(count);
  if (!exportChoice.ok) return;

  await exportToPdfLib({
    currentNoteTypeFilter: scope,
    exportBtn,
    getQuoteTypes,
    getTrainingTypes,
    pdfColumns: exportChoice.columns,
    ignoreCurrentFilters: true,
  });
}

async function exportToPdf(options = {}) {
  const exportBtn = options.exportBtn || getElementByIdSafe('exportPdfBtn', 'exportToPdf');
  const selectionCount = getEffectiveSelectionCount();
  const hasSelection = selectionMode && selectionCount > 0;
  let notes = null;
  let count;

  if (hasSelection) {
    count = selectionCount;
  } else {
    count = totalFilteredCount || 0;
    if (count === 0) {
      alert('⚠️ No notes to export.');
      return;
    }
  }

  const exportChoice = await showPdfExportConfirm(count);
  if (!exportChoice.ok) return;

  if (hasSelection) {
    const ids = await _getEffectiveSelectedIds();
    if (ids === null) return;
    if (ids.length === 0) {
      alert('⚠️ No notes to export.');
      return;
    }

    try {
      notes = await fetchNotesByIds(ids);
    } catch (err) {
      console.error('Export PDF fetch error:', err);
      alert('❌ Could not load selected notes for export: ' + err.message);
      return;
    }
    if (!notes || notes.length === 0) {
      alert('⚠️ Could not fetch the selected notes.');
      return;
    }
  }

  await exportToPdfLib({
    currentNoteTypeFilter,
    exportBtn,
    getQuoteTypes,
    getTrainingTypes,
    notes,
    pdfColumns: exportChoice.columns,
  });
}

// ============= JSON EXPORT/IMPORT =============

async function exportDataManagementJson() {
  await exportToJsonLib({
    currentNoteTypeFilter: getDataManagementExportScope(),
    exportBtn: getElementByIdSafe("dataExportJsonBtn"),
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
//
// There are two coexisting selection modes, controlled by the
// "Select All filtered" (SAF) checkbox in the action bar:
//
//   • SAF OFF  → explicit selection: selectedNoteIds.has(id) ≡ selected.
//   • SAF ON   → inverted selection: every filtered note is selected EXCEPT
//                those in excludedNoteIds. selectedNoteIds is unused here.
//
// Effective count shown to the user:
//   SAF OFF → selectedNoteIds.size
//   SAF ON  → totalFilteredCount − excludedNoteIds.size

function isNoteEffectivelySelected(id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return false;
  if (selectAllFiltered) return !excludedNoteIds.has(n);
  return selectedNoteIds.has(n);
}

function getEffectiveSelectionCount() {
  if (selectAllFiltered) {
    return Math.max(0, (totalFilteredCount || 0) - excludedNoteIds.size);
  }
  return selectedNoteIds.size;
}

function reapplyCardSelectionClasses() {
  document.querySelectorAll('.quote-card').forEach(card => {
    const id = parseInt(card.dataset.quoteId, 10);
    if (isNoteEffectivelySelected(id)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function enterSelectionMode() {
  if (selectionMode) return;
  selectionMode = true;
  document.body.classList.add('selection-mode');

  const btn = document.getElementById('selectModeBtn');
  if (btn) {
    btn.classList.add('active');
    btn.textContent = '✕ Exit Selection';
  }
  updateSelectActionBar();
}

function exitSelectionMode() {
  if (!selectionMode) return;
  selectionMode = false;
  document.body.classList.remove('selection-mode');

  const btn = document.getElementById('selectModeBtn');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = '☑ Select';
  }
  clearSelection();
}

function toggleSelectionMode() {
  if (selectionMode) exitSelectionMode();
  else enterSelectionMode();
}

function toggleNoteSelection(card, noteId) {
  const id = parseInt(noteId, 10);
  if (!Number.isFinite(id)) return;

  let nowSelected = false;
  if (selectAllFiltered) {
    // Inverted semantics: clicking toggles membership in the exclusion set.
    if (excludedNoteIds.has(id)) {
      excludedNoteIds.delete(id);
      card.classList.add('selected');
      nowSelected = true;
    } else {
      excludedNoteIds.add(id);
      card.classList.remove('selected');
      nowSelected = false;
    }
  } else {
    if (selectedNoteIds.has(id)) {
      selectedNoteIds.delete(id);
      card.classList.remove('selected');
      nowSelected = false;
    } else {
      selectedNoteIds.add(id);
      card.classList.add('selected');
      nowSelected = true;
    }
  }

  if (nowSelected && !selectionMode) {
    enterSelectionMode();
  } else if (!nowSelected && selectionMode && getEffectiveSelectionCount() === 0) {
    exitSelectionMode();
  } else {
    updateSelectActionBar();
  }
}

function selectAllOnPage() {
  // Retained for backwards-compat (legacy Select-page button), but the new
  // stripe exposes SAF instead. Behaves as a manual multi-select helper.
  document.querySelectorAll('.quote-card').forEach(card => {
    const id = parseInt(card.dataset.quoteId, 10);
    if (Number.isFinite(id)) {
      selectedNoteIds.add(id);
      card.classList.add('selected');
    }
  });
  updateSelectActionBar();
}

function clearSelection() {
  selectedNoteIds.clear();
  excludedNoteIds.clear();
  selectAllFiltered = false;

  document.querySelectorAll('.quote-card.selected').forEach(c => c.classList.remove('selected'));
  updateSelectActionBar();
}

function _syncTotalFilteredCount() {
  // Prefer the authoritative #filteredQuotesCount element (updated by
  // loadTotalCount); fall back to parsing #quoteCount like "(42)".
  const fEl = document.getElementById('filteredQuotesCount');
  if (fEl) {
    const n = parseInt(fEl.textContent, 10);
    if (Number.isFinite(n)) {
      totalFilteredCount = n;
      return;
    }
  }
  const el = document.getElementById('quoteCount');
  if (el) {
    const m = el.textContent.match(/\d+/);
    if (m) {
      totalFilteredCount = parseInt(m[0], 10);
      return;
    }
  }
  totalFilteredCount = parseInt(filteredQuotes, 10) || 0;
}

/**
 * Select-All-filtered checkbox toggle handler.
 * ON  → clear excluded+explicit sets, paint every visible card as selected,
 *       reveal the action buttons (count = totalFilteredCount).
 * OFF → clear everything and hide the action buttons.
 */
function handleSelectAllFilteredToggle(ev) {
  const cb = ev?.target || document.getElementById('selectAllFilteredCheckbox');
  if (!cb) return;

  selectAllFiltered = !!cb.checked;
  excludedNoteIds.clear();
  selectedNoteIds.clear();

  _syncTotalFilteredCount();
  reapplyCardSelectionClasses();
  updateSelectActionBar();
}

/**
 * Renders the new selection strip state:
 *   - show/hide the right side (count + action buttons)
 *   - update the "X notes selected" label
 *   - keep the legacy modal's selection count in sync
 */
function updateSelectActionBar() {
  const bar    = document.getElementById('selectActionBar');
  const label  = document.getElementById('sabCountLabel');
  if (!bar) return;

  const count = getEffectiveSelectionCount();
  // The stripe only appears once the user has actually picked at least one
  // note — until then selection-mode is silent (just a visual state on the
  // Latest header button + per-card checkboxes).
  bar.style.display = (selectionMode && count > 0) ? 'flex' : 'none';
  if (label) label.textContent = `${count} selected`;
  // if (label) label.textContent = `${count} note${count === 1 ? '' : 's'} selected`;

  // Keep the hidden legacy selection-bar counter in sync for any stray reader.
  const legacyCount = document.getElementById('selectionCount');
  if (legacyCount) legacyCount.textContent = String(count);
}

// Back-compat alias: many call sites still invoke updateSelectionBar().
function updateSelectionBar() {
  updateSelectActionBar();
}

// ============= BULK OPERATIONS =============

function getCurrentFilters() {
  // Helper to get value silently for optional elements (no warnings)
  // Uses raw getElementById for elements that only exist in certain views
  const getOptionalValue = (id) => {
    const element = document.getElementById(id);
    return element?.value || '';
  };

  const getCheckedDatasetValues = (selector) => Array.from(document.querySelectorAll(selector))
    .filter((checkbox) => checkbox.checked && checkbox.dataset.type)
    .map((checkbox) => checkbox.dataset.type);

  const getQuoteTypeFilter = () => {
    const quoteTypes = getQuoteTypes();
    const selected = currentNoteTypeFilter === 'quote'
      ? getCheckedDatasetValues('.type-filter-options input[type="checkbox"]')
      : [];
    return selected.length > 0 && selected.length < quoteTypes.length ? selected.join(',') : '';
  };

  const getTrainingTypeFilter = () => {
    if (currentNoteTypeFilter !== 'training') return '';
    return getCheckedDatasetValues('.training-type-filter-options input[type="checkbox"]').join(',');
  };

  const getGenericSubTypeFilter = () => {
    if (!currentNoteTypeFilter || !hasGenericSubTypeField(currentNoteTypeFilter)) return '';
    return getCheckedDatasetValues('.generic-subtype-filter-options input[type="checkbox"]').join(',');
  };
  
  // Helper to get metadata checkbox state (checkbox + condition)
  // Returns 'true' if checked and condition is 'has', 'false' if checked and condition is 'not'
  const getMetadataState = (checkboxId, conditionId) => {
    const checkbox = document.getElementById(checkboxId);
    const condition = document.getElementById(conditionId);
    if (!checkbox || !checkbox.checked) return '';
    return condition?.value === 'not' ? 'false' : 'true';
  };

  const settings = globalSettings || getGlobalSettings();
  const quoteSearch = getOptionalValue(FILTER_IDS.SEARCH_QUOTE);
  const tagSearch = getOptionalValue(FILTER_IDS.SEARCH_TAGS);
  
  const filters = {
    note_type: currentNoteTypeFilter,
    author_id: getOptionalValue(FILTER_IDS.AUTHOR_FILTER), // Only exists in quotes view
    source_id: getOptionalValue(FILTER_IDS.SOURCE_FILTER), // Only exists in quotes view
    any: getOptionalValue(FILTER_IDS.SEARCH_ANY),
    search: quoteSearch,
    quote: quoteSearch,
    author: getOptionalValue(FILTER_IDS.SEARCH_AUTHOR),
    source: getOptionalValue(FILTER_IDS.SEARCH_SOURCE),
    tag: tagSearch,
    tags: tagSearch,
    types: getQuoteTypeFilter(),
    training_types: getTrainingTypeFilter(),
    generic_sub_types: getGenericSubTypeFilter(),
    year: getOptionalValue(FILTER_IDS.YEAR_FILTER), // Only exists in training view
    month: getOptionalValue(FILTER_IDS.MONTH_FILTER), // Only exists in training view
    score: getOptionalValue(FILTER_IDS.SEARCH_SCORE),
    noteId: getOptionalValue(FILTER_IDS.SEARCH_NOTE_ID),
    hasAuthor: getMetadataState(FILTER_IDS.HAS_AUTHOR_CHECKBOX, FILTER_IDS.HAS_AUTHOR_CONDITION),
    hasSource: getMetadataState(FILTER_IDS.HAS_SOURCE_CHECKBOX, FILTER_IDS.HAS_SOURCE_CONDITION),
    hasNote: getMetadataState(FILTER_IDS.HAS_NOTE_CHECKBOX, FILTER_IDS.HAS_NOTE_CONDITION),
    hasTags: getMetadataState(FILTER_IDS.HAS_TAGS_CHECKBOX, FILTER_IDS.HAS_TAGS_CONDITION),
    hasImage: getMetadataState(FILTER_IDS.HAS_IMAGE_CHECKBOX, FILTER_IDS.HAS_IMAGE_CONDITION),
    hasImageType: getMetadataState(FILTER_IDS.HAS_IMAGE_TYPE_CHECKBOX, FILTER_IDS.HAS_IMAGE_TYPE_CONDITION),
    hasTranslationGroup: getMetadataState(FILTER_IDS.HAS_TRANSLATION_GROUP_CHECKBOX, FILTER_IDS.HAS_TRANSLATION_GROUP_CONDITION),
    hasMultipleAttachments: getMetadataState(FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CHECKBOX, FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CONDITION),
    hasTitle: getMetadataState(FILTER_IDS.HAS_TITLE_CHECKBOX, FILTER_IDS.HAS_TITLE_CONDITION),
    hasText: getMetadataState(FILTER_IDS.HAS_TEXT_CHECKBOX, FILTER_IDS.HAS_TEXT_CONDITION),
  };

  if (settings?.hideEncryptedNotes) {
    filters.hideEncryptedNotes = 'true';
  }
  if (settings?.hideNotesWithTag && settings?.hideTagName) {
    filters.hideTag = settings.hideTagName.trim();
  }
  
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

/**
 * Build the payload + user-facing label for a bulk operation triggered from
 * the Select-Action-Bar. Always derives scope from the current selection:
 *   • explicit picks  → { noteIds }
 *   • SAF (legacy)    → { filters [, excludeIds] }   (dead code path; kept
 *     in case SAF is ever re-introduced, since selectAllFiltered is still
 *     declared but never set to true)
 * When nothing is selected the fallback returns { filters } against the
 * current filter state so the handlers can still show a "no notes" alert
 * cleanly.
 */
function _getBulkPayloadAndLabel() {
  if (selectionMode) {
    if (selectAllFiltered) {
      const base = { filters: getCurrentFilters(), noteType: currentNoteTypeFilter || 'quote' };
      if (excludedNoteIds.size > 0) base.excludeIds = [...excludedNoteIds];
      return {
        payload: base,
        count: getEffectiveSelectionCount(),
        label: excludedNoteIds.size > 0 ? 'filtered notes (minus excluded)' : 'filtered notes'
      };
    }
    if (selectedNoteIds.size > 0) {
      return {
        payload: { noteIds: [...selectedNoteIds], noteType: currentNoteTypeFilter || 'quote' },
        count: selectedNoteIds.size,
        label: 'selected notes'
      };
    }
  }
  return {
    payload: { filters: getCurrentFilters() },
    count: 0,
    label: 'filtered notes'
  };
}

async function handleBulkDuplicate() {
  const { payload, count, label } = _getBulkPayloadAndLabel();

  if (count === 0) {
    alert("⚠️ No notes to duplicate.");
    return;
  }

  if (!await showConfirm(`Duplicate ${count} ${label}? Each copy will include all attachments and tags.`, {
    icon: '⧉', title: 'Duplicate Notes', confirmLabel: 'Duplicate'
  })) return;

  const btn = document.getElementById('bulkDuplicateBtn');
  if (btn) { btn.disabled = true; btn.querySelector('div > div').textContent = '⏳ Duplicating…'; }

  try {
    const response = await fetch(`${API_URL}/quotes/bulk-duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to duplicate');

    loadQuotes();
    alert(`✅ ${result.message}`);
  } catch (error) {
    console.error("Bulk duplicate error:", error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector('div > div').textContent = 'Duplicate Notes'; }
  }
}

async function handleBulkSplit() {
  const { payload, count, label } = _getBulkPayloadAndLabel();

  if (count === 0) {
    alert("⚠️ No notes selected.");
    return;
  }

  if (!await showConfirm(
    `Split attachments in ${count} ${label}?\n\nEach extra attachment becomes a new note (same text & tags). The original keeps only its first attachment.`,
    { icon: '✂️', title: 'Split Attachments', confirmLabel: 'Split' }
  )) return;

  const btn = document.getElementById('bulkSplitBtn');
  if (btn) { btn.disabled = true; btn.querySelector('div > div').textContent = '⏳ Splitting…'; }

  try {
    const response = await fetch(`${API_URL}/quotes/bulk-split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to split');

    loadQuotes();
    alert(`✅ ${result.message}`);
  } catch (error) {
    console.error("Bulk split error:", error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector('div > div').textContent = 'Split Attachments'; }
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// Select-Action-Bar dispatcher & helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all note IDs matching the current filters (for SAF materialisation).
 * Used by Merge and (optionally) Export when we need a concrete ID list.
 */
async function _fetchFilteredNoteIds() {
  try {
    const res = await fetch(`${API_URL}/quotes/ids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: getCurrentFilters() })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.ids) ? data.ids : [];
  } catch (err) {
    console.error('Failed to fetch filtered note IDs:', err);
    alert('❌ Could not fetch the list of filtered notes. Please try again.');
    return null;
  }
}

/**
 * Materialise the *effective* selected-ID list from the current stripe state.
 * Returns null on error, [] if empty.
 */
async function _getEffectiveSelectedIds() {
  if (selectAllFiltered) {
    const all = await _fetchFilteredNoteIds();
    if (all === null) return null;
    if (excludedNoteIds.size === 0) return all;
    return all.filter(id => !excludedNoteIds.has(id));
  }
  return [...selectedNoteIds];
}

/**
 * Merge from the stripe: must materialise the list of IDs (Merge UI needs
 * concrete note objects to render the preview).
 */
async function handleSabMerge() {
  const ids = await _getEffectiveSelectedIds();
  if (ids === null) return;
  if (ids.length < 2) {
    alert('⚠️ Select at least 2 notes to merge.');
    return;
  }
  try {
    const notes = await fetchNotesByIds(ids);
    openMergeModal(notes);
  } catch (err) {
    console.error('Merge fetch error:', err);
    alert('❌ Could not load notes for merging: ' + err.message);
  }
}

/** Export-to-PDF from the Select-Action-Bar — same logic as the menu export. */
async function handleSabExportPdf() {
  await exportToPdf({
    exportBtn: getElementByIdSafe('exportPdfBtn', 'handleSabExportPdf'),
  });
}

/**
 * Central dispatcher for the stripe action buttons.
 * Routes to the right handler and reuses all existing confirmation dialogs.
 */
async function dispatchSabAction(action) {
  if (getEffectiveSelectionCount() === 0) {
    alert('⚠️ No notes selected.');
    return;
  }
  switch (action) {
    case 'export':    await handleSabExportPdf();  break;
    case 'duplicate': await handleBulkDuplicate(); break;
    case 'split':     await handleBulkSplit();     break;
    case 'merge':     await handleSabMerge();      break;
    case 'delete':    await handleBulkDelete();    break;
    default:
      console.warn('Unknown SAB action:', action);
  }
}

// ── Select-Action-Bar tag/group mini-form ─────────────────────────────────
// Placeholder text is driven by the chosen op so users know what to type.
const _SAB_TAGOP_PLACEHOLDERS = {
  addTag:    'Tag name to add…',
  removeTag: 'Tag name to remove…',
  setGroup:  'Group name…',
};

function populateSabSubTypeDropdown() {
  const select = document.getElementById('sabSubTypeSelect');
  if (!select) return;

  const noteType = currentNoteTypeFilter;
  const subTypes = noteType && hasGenericSubTypeField(noteType)
    ? getGenericSubTypes(noteType)
    : [];
  const prevValue = select.value;

  select.innerHTML = '<option value="">Select sub-type…</option>';
  subTypes.forEach((type) => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = `${type.icon} ${type.label}`;
    select.appendChild(option);
  });

  if (prevValue) select.value = prevValue;
}

function _updateSabTagOpAvailability() {
  const opt = document.getElementById('sabSetSubTypeOption');
  const sel = document.getElementById('sabTagOpSelect');
  const show = !!currentNoteTypeFilter && hasGenericSubTypeField(currentNoteTypeFilter);

  if (opt) {
    opt.hidden = !show;
    opt.disabled = !show;
  }
  if (!show && sel?.value === 'setSubType') {
    sel.value = 'addTag';
  }
  if (show) populateSabSubTypeDropdown();
  _updateSabTagOpControls();
}

function _updateSabTagOpControls() {
  const sel       = document.getElementById('sabTagOpSelect');
  const input     = document.getElementById('sabTagOpInput');
  const subSelect = document.getElementById('sabSubTypeSelect');
  if (!sel || !input) return;

  const isSubType = sel.value === 'setSubType';
  input.style.display = isSubType ? 'none' : '';
  if (subSelect) subSelect.style.display = isSubType ? '' : 'none';
  if (!isSubType) {
    input.placeholder = _SAB_TAGOP_PLACEHOLDERS[sel.value] || '';
  }
}

/**
 * Run the op selected in #sabTagOpSelect (Add Tag / Remove Tag / Set Group)
 * against the current selection. Uses _getBulkPayloadAndLabel() so payload +
 * count/label match whatever scope the SAB is operating on.
 */
async function handleSabTagOpApply() {
  const sel       = document.getElementById('sabTagOpSelect');
  const input     = document.getElementById('sabTagOpInput');
  const subSelect = document.getElementById('sabSubTypeSelect');
  const btn       = document.getElementById('sabTagOpApplyBtn');
  if (!sel || !input) return;

  const op = sel.value;
  let value = '';
  if (op === 'setSubType') {
    value = (subSelect?.value || '').trim();
    if (!value) {
      alert('⚠️ Please select a sub-type.');
      subSelect?.focus();
      return;
    }
  } else {
    value = (input.value || '').trim();
    if (!value) {
      alert('⚠️ Please enter a value.');
      input.focus();
      return;
    }
  }

  if (getEffectiveSelectionCount() === 0) {
    alert('⚠️ No notes selected.');
    return;
  }

  const { payload, count, label } = _getBulkPayloadAndLabel();
  if (count === 0) {
    alert('⚠️ No notes selected.');
    return;
  }

  let endpoint, bodyKey, message, confirmOpts;
  if (op === 'addTag') {
    endpoint    = `${API_URL}/quotes/bulk-tag`;
    bodyKey     = 'tagName';
    message     = `Add tag "${value}" to ${count} ${label}?`;
    confirmOpts = { icon: '🏷️', title: 'Bulk tag notes', confirmLabel: 'Add tag' };
  } else if (op === 'removeTag') {
    endpoint    = `${API_URL}/quotes/bulk-untag`;
    bodyKey     = 'tagName';
    message     = `Remove tag "${value}" from ${count} ${label}?`;
    confirmOpts = { icon: '🏷️', title: 'Bulk remove tag', danger: true, confirmLabel: 'Remove' };
  } else if (op === 'setGroup') {
    endpoint    = `${API_URL}/quotes/bulk-set-group`;
    bodyKey     = 'groupName';
    message     = `Set group "${value}" on ${count} ${label}?`;
    confirmOpts = { icon: '🔗', title: 'Set Group', confirmLabel: 'Set Group' };
  } else if (op === 'setSubType') {
    const subLabel = subSelect?.selectedOptions?.[0]?.textContent?.trim() || value;
    endpoint    = `${API_URL}/quotes/bulk-set-subtype`;
    bodyKey     = 'subType';
    message     = `Set sub-type to "${subLabel}" on ${count} ${label}?`;
    confirmOpts = { icon: '🏷️', title: 'Set Sub-Type', confirmLabel: 'Set Sub-Type' };
  } else {
    console.warn('Unknown SAB tag-op:', op);
    return;
  }

  if (!await showConfirm(message, confirmOpts)) return;

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Applying…'; }
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, [bodyKey]: value }),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Operation failed');

    if (op === 'setSubType') {
      if (subSelect) subSelect.value = '';
    } else {
      input.value = '';
    }
    loadQuotes();
    alert(`✅ ${result.message || `${result.count || count} notes updated`}`);
  } catch (err) {
    console.error('SAB tag-op error:', err);
    alert(`❌ ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  }
}

// Welcome / random note overlay (optional randomNoteType, e.g. 'tegneserie')
function isNoteTypeAllowedForRandom(noteType) {
  const allowed = window._modeAllowedTypes || activeMode?.allowedTypes;
  if (!allowed?.length) return (noteType || 'quote') === 'quote';
  const effective = noteType || 'quote';
  return allowed.includes(effective);
}

async function showWelcomeQuote(force = false, randomNoteType = null) {
  const effectiveType = randomNoteType || 'quote';
  if (!isNoteTypeAllowedForRandom(effectiveType)) {
    return;
  }
  try {
    // Only show automatically if not already shown in this session
    if (!force && sessionStorage.getItem('welcomeQuoteShown')) {
      return;
    }
    
    const url = randomNoteType
      ? `${API_URL}/quotes/random?note_type=${encodeURIComponent(randomNoteType)}`
      : `${API_URL}/quotes/random`;
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        if (force) {
          const msg =
            randomNoteType === 'tegneserie'
              ? 'No Tegneserie notes in the library yet.'
              : 'No quotes in the library yet.';
          alert(msg);
        } else {
          console.log('No notes available for welcome / random overlay');
        }
      }
      return;
    }

    const quote = await response.json();
    
    // Get overlay elements
    const overlay = getElementByIdSafe("welcomeQuoteOverlay");
    const container = overlay.querySelector(".welcome-quote-container");
    
    // Clear container and create quote card HTML
    container.innerHTML = "";
    const cardHTML = createQuoteCard(quote, randomNoteType);
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

window.showWelcomeQuote = showWelcomeQuote;

// Random welcome overlay — menu buttons wired here; auto-show runs from main init when quote is in mode
window.addEventListener("DOMContentLoaded", () => {
  const randomQuoteBtn = getElementByIdSafe("randomQuoteBtn");
  if (randomQuoteBtn) {
    randomQuoteBtn.addEventListener("click", () => showWelcomeQuote(true));
  }

  const randomTegneserieBtn = getElementByIdSafe("randomTegneserieBtn");
  if (randomTegneserieBtn) {
    randomTegneserieBtn.addEventListener("click", () => showWelcomeQuote(true, "tegneserie"));
  }
});

// Search tags functionality
window.allTags = []; // Make it global so tagsManager can update it
let currentSortBy = "name";

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = getElementByIdSafe("searchSourcesInput");
  const sortSelect = getElementByIdSafe("sortTagsBySelect");
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
  
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSortBy = sortSelect.value === "count" ? "count" : "name";
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
    <span class="tag-removable">
      ${escapeHtml(tag)}
      <span onclick="removeTag('${escapeHtml(tag).replace(/'/g, "\\'")}')" style="font-weight: bold; cursor: pointer;">&times;</span>
    </span>
  `).join('');
  
  // Update hidden input with current tags
  getElementByIdSafe('tags').value = selectedTagsArray.join(',');
}

// Initialize tag input when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeNoteModalEntityNav();
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

  const modal = document.getElementById('quoteModal');

  if (hasAttachment) {
    container.classList.remove('hidden');
    modal?.classList.add('has-attachment');
    const pendingCount = pendingExtraAttachments.length;
    const extra = pendingCount > 0 ? ` (+${pendingCount})` : '';
    toggleBtn.textContent = `📎 Add more${extra}`;
    toggleBtn.title = 'Add another attachment';
  } else {
    container.classList.add('hidden');
    modal?.classList.remove('has-attachment');
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

  // Has attachment — open a dedicated picker that routes straight to the right handler,
  // bypassing the first-attachment routing in quoteImageFile.change.
  if (hasAttachment) {
    if (isSmallViewport()) {
      container.classList.remove('hidden');
      document.getElementById('quoteAttachPickerActions')?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = quoteImageFile?.accept || 'image/*';
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    const cleanup = () => { try { document.body.removeChild(input); } catch(_) {} };
    input.addEventListener('change', async () => {
      const file = input.files[0];
      cleanup();
      if (!file) return;
      if (editingQuoteId) {
        await addAttachmentFromFile(file, editingQuoteId);
      } else {
        await queuePendingAttachment(file);
      }
    });
    // cleanup on cancel (focus returns to window with no change event)
    window.addEventListener('focus', function onceFocus() {
      window.removeEventListener('focus', onceFocus);
      setTimeout(() => { if (!input.files?.length) cleanup(); }, 500);
    });
    input.click();
    return;
  }

  // No attachment yet — toggle the attachment panel open/closed
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
  const populateTypeFilterCheckboxesWrapper = () => { populateTypeFilterCheckboxesLib(getQuoteTypes); updateQuoteSourcesSummary(); };
  const populateTrainingTypeFilterCheckboxesWrapper = () => { populateTrainingTypeFilterCheckboxesLib(getTrainingTypes); updateTrainingTypeSummary(); };
  
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
    'searchHasTranslationGroup', 'searchHasMultipleAttachments', 'searchHasTitle',
    'searchHasText'
  ];
  
  const metadataSelects = [
    'searchAuthorCondition', 'searchSourceCondition', 'searchNoteCondition',
    'searchTagsCondition', 'searchImageCondition', 'searchImageTypeCondition',
    'searchTranslationGroupCondition', 'searchMultipleAttachmentsCondition', 'searchTitleCondition',
    'searchTextCondition'
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

  // ── Round-1 module wire-up (May 2026 split) ─────────────────────────────
  // These have to run after `loadQuotes`, `openEditModal`, `clearSelection`,
  // etc. have all been declared, so we do them inside the DOMContentLoaded
  // handler.  Each `init*` is idempotent — safe to call again later if any
  // dep needs to swap.
  initEntityListPage({
    escapeHtml,
    getApiUrl: () => API_URL,
    getElementByIdSafe,
    showFetchError: window.showFetchError,
  });
  initHtmlSourceViewer({ getQuillEditor: () => quillEditor });
  initMergeModal({
    escapeHtml,
    getApiUrl: () => API_URL,
    getCurrentQuotes: () => currentQuotesData,
    getSelectedNoteIds: () => [...selectedNoteIds],
    clearSelection,
    loadQuotes,
    loadTotalCount,
    openEditModal,
  });
  initEncryptedAttachments({
    encryptFileBuffer,
    decryptFileBuffer,
    // showFullImage is exposed via `window.showFullImage` (a thin wrapper
    // around showFullImageLib that adds modal-state defaults) so we have
    // to reach for it through `window` here.
    showFullImage: (...args) => window.showFullImage(...args),
    showPDFViewer,
    showVideoPlayer,
    showAudioPlayer,
    displayAttachmentPreview,
    renderModalAttachmentStrip,
    updateAttachmentPanelVisibility,
    loadQuotes,
    getEditingQuoteId: () => editingQuoteId
      || (usesListPaneLayout(currentNoteTypeFilter, currentViewMode) ? getPaneEditorNoteId() : null),
    getCurrentNoteTypeFilter: () => currentNoteTypeFilter,
    getQuoteImagePreviewEl:   () => quoteImagePreview,
    getPendingExtraAttachments: () => pendingExtraAttachments,
    hasPrimaryAttachment:     () => !!(currentQuoteImage || currentQuoteImageFull),
    setPrimaryEncryptedState: ({ thumbnail, full, type, fileName }) => {
      currentAttachmentType     = type;
      currentAttachmentFileName = fileName;
      currentQuoteImageFull     = full;
      currentQuoteImage         = thumbnail;
    },
  });
  initRenameModal({
    getApiUrl: () => API_URL,
    loadTags,
    loadAuthors,
    loadSources,
  });

  initDedupSuspectsPanel({
    apiUrl: API_URL,
    getElementByIdSafe,
    createQuoteCardHtml: (note) =>
      createQuoteCardLib(note, null, getTrainingTypes, getQuoteTypes, getGlobalSettings()),
    openEditModal,
    toggleCardExpand,
    getSelectionMode: () => selectionMode,
    toggleNoteSelection,
    openAuthorModal: (id, name) => {
      void openAuthorModalLib(id, name, null);
    },
    openSourceModal: (id, name, type) => {
      void openSourceModalLib(id, name, type || 'BOOK', null);
    },
  });

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
