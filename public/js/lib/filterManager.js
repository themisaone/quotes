/**
 * ============================================================================
 * FILTER MANAGER
 * ============================================================================
 * Manages all filter-related functionality including:
 * - Type filter checkboxes (quote types and training types)
 * - Dropdown toggles and visibility
 * - Select All / Deselect All buttons
 * - Clear filters functionality
 * 
 * Main functions:
 * - initializeFilterHandlers() - Setup all filter event listeners
 * - populateTypeFilterCheckboxes() - Populate quote type checkboxes
 * - populateTrainingTypeFilterCheckboxes() - Populate training type checkboxes
 * - clearFilters() - Reset all filters and reload
 * - updateSourcesFilterVisibility() - Show/hide filter dropdowns by view
 * 
 * This module handles the UI interactions for filters but delegates
 * the actual data fetching to displayManager.js
 * 
 * Dependencies:
 * - searchManager.js for clearSearchFields()
 * - Requires callbacks: loadQuotes, loadTotalCount, setCurrentPage
 */

import { clearSearchFields } from './searchManager.js';
import { getElementByIdSafe } from '../constants.js';
import { getNoteTypeConfig, hasDateField, hasGenericSubTypeField, getGenericSubTypes } from './noteTypes.js';

// ============= CONSTANTS =============

const SELECTORS = {
  quoteTypeOptions: '.type-filter-options',
  trainingTypeOptions: '.training-type-filter-options',
  genericSubTypeOptions: '.generic-subtype-filter-options',
  quoteTypeCheckbox: '.type-filter-option input[type="checkbox"]',
  trainingTypeCheckbox: '.training-type-filter-options input[type="checkbox"]',
  genericSubTypeCheckbox: '.generic-subtype-filter-options input[type="checkbox"]',
  typeFilterContainer: '#quoteSourcesFilterContainer',
  trainingFilterContainer: '#trainingTypesFilterContainer',
  genericSubTypeFilterContainer: '#genericSubTypesFilterContainer'
};

const ELEMENT_IDS = {
  // Quote type filter
  typeFilterToggle: 'typeFilterToggle',
  typeFilterDropdown: 'typeFilterDropdown',
  typeSelectAllBtn: 'typeSelectAllBtn',
  typeDeselectAllBtn: 'typeDeselectAllBtn',
  
  // Training type filter
  trainingTypeFilterToggle: 'trainingTypeFilterToggle',
  trainingTypeFilterDropdown: 'trainingTypeFilterDropdown',
  trainingTypeSelectAllBtn: 'trainingTypeSelectAllBtn',
  trainingTypeDeselectAllBtn: 'trainingTypeDeselectAllBtn',

  // Generic sub-type filter
  genericSubTypeFilterToggle: 'genericSubTypeFilterToggle',
  genericSubTypeFilterDropdown: 'genericSubTypeFilterDropdown',
  genericSubTypeSelectAllBtn: 'genericSubTypeSelectAllBtn',
  genericSubTypeDeselectAllBtn: 'genericSubTypeDeselectAllBtn',
  
  // Visibility (CORRECTED IDs)
  sourcesFilterContainer: 'quoteSourcesFilterContainer',  // Was 'sourcesFilterContainer'
  trainingTypesFilterContainer: 'trainingTypesFilterContainer',
  genericSubTypesFilterContainer: 'genericSubTypesFilterContainer'
};

// ============= MODULE STATE =============

let typeFilterChanged = false;

// ============= FILTER POPULATION =============

/**
 * Store current checkbox states before rebuild
 */
function getCheckboxStates(container) {
  const checkedStates = {};
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    checkedStates[cb.id] = cb.checked;
  });
  return checkedStates;
}

/**
 * Create a type filter checkbox element
 */
function createTypeCheckbox(checkboxId, type, isChecked) {
  const label = document.createElement('label');
  label.className = 'type-filter-option';
  // data-label holds the plain text label (no icon) so the header sub-type
  // summary can render it icon-free.
  label.innerHTML = `
    <input type="checkbox" id="${checkboxId}" data-type="${type.value}" data-label="${type.label}" ${isChecked ? 'checked' : ''}>
    <span>${type.icon} ${type.label}</span>
  `;
  
  // Add event listener to set flag when changed
  const checkbox = label.querySelector('input');
  checkbox.addEventListener('change', () => {
    typeFilterChanged = true;
    updateTrainingTypeSummary();
    updateQuoteSourcesSummary();
    updateGenericSubTypeSummary();
  });
  
  return label;
}

/**
 * Generic helper: read checkboxes from a container and update a summary span's content.
 * Does NOT touch display — visibility is controlled solely by updateSourcesFilterVisibility.
 */
function renderTypeSummary(summaryEl, checkboxSelector) {
  if (!summaryEl) return;
  const checkboxes = [...document.querySelectorAll(checkboxSelector)];
  if (checkboxes.length === 0) { summaryEl.innerHTML = ''; return; }

  const parts = checkboxes.map((cb, i) => {
    // Prefer the icon-free label stored in data-label; fall back to span text
    // (with any leading icon stripped) for older checkboxes without it.
    let text = cb.dataset.label;
    if (!text) {
      const spanTxt = cb.closest('label')?.querySelector('span')?.textContent?.trim() || '';
      // Drop a leading emoji/icon + whitespace if present (e.g., "✍️ Author" -> "Author").
      text = spanTxt.replace(/^[^\p{L}\p{N}]+\s*/u, '') || cb.dataset.type;
    }
    const cls  = cb.checked ? 'tts-on' : 'tts-off';
    const sep  = i < checkboxes.length - 1 ? '<span class="tts-sep"> / </span>' : '';
    return `<span class="${cls}">${text}</span>${sep}`;
  });

  summaryEl.innerHTML = '(' + parts.join('') + ')';
}

function formatToggleSummary(checkboxSelector, { all, none = all, selected }) {
  const checkboxes = [...document.querySelectorAll(checkboxSelector)];
  if (checkboxes.length === 0) return all;

  const checked = checkboxes.filter(cb => cb.checked);
  if (checked.length === 0) return none;
  if (checked.length === checkboxes.length) return all;
  return selected(checked.length);
}

function updateToggleLabel(labelId, checkboxSelector, labels) {
  const label = document.getElementById(labelId);
  if (!label) return;

  label.textContent = formatToggleSummary(checkboxSelector, labels);
  const checkedLabels = [...document.querySelectorAll(checkboxSelector)]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.label || cb.dataset.type)
    .filter(Boolean);
  label.title = checkedLabels.length ? checkedLabels.join(', ') : labels.all;
}

/**
 * Refresh the training type dropdown's compact selection label.
 */
export function updateTrainingTypeSummary(isAllNotes = false) {
  const selector = isAllNotes
    ? '.training-type-filter-options input[id^="filterTraining"]'
    : SELECTORS.trainingTypeCheckbox;
  renderTypeSummary(document.getElementById('trainingTypeSummary'), selector);
  updateToggleLabel('trainingTypesFilterLabel', selector, {
    all: 'All',
    none: 'None',
    selected: (count) => `${count} selected`,
  });
}

/**
 * Refresh the quote source dropdown's compact selection label.
 */
export function updateQuoteSourcesSummary() {
  const selector = SELECTORS.quoteTypeOptions + ' input[type="checkbox"]';
  renderTypeSummary(document.getElementById('quoteSourcesSummary'), selector);
  updateToggleLabel('quoteSourcesFilterLabel', selector, {
    all: 'All',
    none: 'None',
    selected: (count) => `${count} selected`,
  });
}

/**
 * Populate quote type filter checkboxes
 */
export function populateTypeFilterCheckboxes(getQuoteTypes) {
  const types = getQuoteTypes();
  const container = document.querySelector(SELECTORS.quoteTypeOptions);
  
  if (!container) return;
  
  // Store current checked states
  const checkedStates = getCheckboxStates(container);
  
  // Clear and rebuild
  container.innerHTML = '';
  
  types.forEach(type => {
    const checkboxId = `filterQuote${type.value.replace(/-/g, '')}`;
    const isChecked = checkedStates[checkboxId] !== false;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
  });
}

/**
 * Populate training type filter checkboxes
 */
export function populateTrainingTypeFilterCheckboxes(getTrainingTypes) {
  const trainingTypes = getTrainingTypes();
  const container = document.querySelector(SELECTORS.trainingTypeOptions);
  
  if (!container) return;
  
  // Store current checked states
  const checkedStates = getCheckboxStates(container);
  
  // Clear and rebuild
  container.innerHTML = '';
  
  trainingTypes.forEach(type => {
    const checkboxId = `filterTraining${type.value}`;
    // Use stored state if present; otherwise fall back to type's defaultChecked (default: true)
    const typeDefault = type.defaultChecked !== false;
    const isChecked = checkedStates[checkboxId] !== undefined ? checkedStates[checkboxId] : typeDefault;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
  });
}

/**
 * Populate generic sub-type filter checkboxes for the current generic note type
 */
export function populateGenericSubTypeFilterCheckboxes(subTypes) {
  const container = document.querySelector(SELECTORS.genericSubTypeOptions);
  if (!container) return;

  const checkedStates = getCheckboxStates(container);
  container.innerHTML = '';

  subTypes.forEach(type => {
    const checkboxId = `filterGenericSub${type.value.replace(/[^A-Z0-9]/gi, '')}`;
    const isChecked = checkedStates[checkboxId] !== false;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
  });
}

/**
 * Refresh active/inactive generic sub-type summary
 */
export function updateGenericSubTypeSummary() {
  renderTypeSummary(document.getElementById('genericSubTypeSummary'), SELECTORS.genericSubTypeCheckbox);
  updateToggleLabel('genericSubTypesFilterLabel', SELECTORS.genericSubTypeCheckbox, {
    all: 'All',
    none: 'None',
    selected: (count) => `${count} selected`,
  });
}

// ============= FILTER CLEARING =============

/**
 * Clear all search filters and reload
 */
export function clearFilters(callbacks) {
  const { loadQuotes, setCurrentPage } = callbacks;
  
  // Clear search inputs and training filters via searchManager
  clearSearchFields();
  
  setCurrentPage(1);
  loadQuotes();
}

// ============= FILTER VISIBILITY =============

/**
 * Toggle element visibility
 */
function setElementVisibility(elementId, shouldShow) {
  const element = getElementByIdSafe(elementId, 'setElementVisibility');
  if (element) {
    if (!shouldShow) {
      element.style.display = 'none';
    } else {
      // Restore to CSS-defined display value rather than hardcoding 'block'
      element.style.display = '';
      const computed = getComputedStyle(element).display;
      if (computed === 'none') {
        element.style.display = 'block';
      }
    }
  }
}

/**
 * Update visibility of type filter dropdowns based on current view
 * @param {string} currentNoteTypeFilter - Current note type ('quote', 'training', null for all)
 * @param {Function} getQuoteTypes - Function to get quote types
 * @param {Function} getTrainingTypes - Function to get training types
 */
export function updateSourcesFilterVisibility(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const isAllNotesView = currentNoteTypeFilter === null;
  
  // Show quote sources only when quotes are in the active mode
  const quotesInMode = !window._modeAllowedTypes || window._modeAllowedTypes.includes('quote');
  const showQuoteSources = quotesInMode && currentNoteTypeFilter === 'quote';
  setElementVisibility(ELEMENT_IDS.sourcesFilterContainer, showQuoteSources);
  
  // Show training types only in the dedicated Training view. In All Notes the
  // subtype controls stay hidden to keep broad search simple.
  const dateBehavior = currentNoteTypeFilter !== null && hasDateField(currentNoteTypeFilter);
  const trainingSubTypes = dateBehavior && typeof getTrainingTypes === 'function'
    ? getTrainingTypes(currentNoteTypeFilter)
    : [];
  const showTrainingTypes = dateBehavior && trainingSubTypes.length > 0;
  setElementVisibility(ELEMENT_IDS.trainingTypesFilterContainer, showTrainingTypes);
  
  // Update the training types dropdown label based on view
  updateTrainingTypesDropdownLabel(false, currentNoteTypeFilter);
  
  // Repopulate the training dropdown based on view
  if (showTrainingTypes && getQuoteTypes && getTrainingTypes) {
    populateTrainingTypeFilterCheckboxes(() => trainingSubTypes);
  }

  // Refresh compact dropdown labels. The old long summary spans are optional
  // and are not rendered in the current compact search layout.
  const trainingSummaryEl = document.getElementById('trainingTypeSummary');
  const quoteSummaryEl    = document.getElementById('quoteSourcesSummary');

  if (dateBehavior) {
    updateTrainingTypeSummary(false);
    if (trainingSummaryEl) trainingSummaryEl.style.display = 'none';
  } else {
    if (trainingSummaryEl) { trainingSummaryEl.style.display = 'none'; trainingSummaryEl.innerHTML = ''; }
  }

  if (currentNoteTypeFilter === 'quote') {
    updateQuoteSourcesSummary();
    if (quoteSummaryEl) quoteSummaryEl.style.display = 'none';
  } else {
    if (quoteSummaryEl) { quoteSummaryEl.style.display = 'none'; quoteSummaryEl.innerHTML = ''; }
  }
  
  // Hide Author/Source search fields — only shown for "quote" behavior or All Notes view
  const quoteBehavior = currentNoteTypeFilter !== null && getNoteTypeConfig(currentNoteTypeFilter).behavior === 'quote';
  const showAuthorSource = quoteBehavior || isAllNotesView;
  setElementVisibility('searchAuthorContainer', showAuthorSource);
  setElementVisibility('searchSourceContainer', showAuthorSource);

  // Show/hide Year/Month filters for training behavior only (not all notes)
  const showTrainingDateFilters = dateBehavior;
  setElementVisibility('trainingYearContainer', showTrainingDateFilters);
  setElementVisibility('trainingMonthContainer', showTrainingDateFilters);

  // Show generic sub-type filter when the current type is generic AND has sub-types
  const showGenericSubTypes = !isAllNotesView && currentNoteTypeFilter !== null && hasGenericSubTypeField(currentNoteTypeFilter);
  setElementVisibility(ELEMENT_IDS.genericSubTypesFilterContainer, showGenericSubTypes);
  if (showGenericSubTypes) {
    populateGenericSubTypeFilterCheckboxes(getGenericSubTypes(currentNoteTypeFilter));
  }
  // Generic sub-type summary
  const genericSubTypeSummaryEl = document.getElementById('genericSubTypeSummary');
  if (showGenericSubTypes) {
    updateGenericSubTypeSummary();
    if (genericSubTypeSummaryEl) genericSubTypeSummaryEl.style.display = 'none';
  } else {
    if (genericSubTypeSummaryEl) { genericSubTypeSummaryEl.style.display = 'none'; genericSubTypeSummaryEl.innerHTML = ''; }
  }

  const subtypeSlot = document.querySelector('.search-header-subtype');
  if (subtypeSlot) {
    subtypeSlot.style.display = (showQuoteSources || showTrainingTypes || showGenericSubTypes) ? '' : 'none';
  }
  
  // Apply the correct search grid layout for this note type
  updateSearchGridLayout(currentNoteTypeFilter);
  
  // Update search header title based on note type
  updateSearchHeaderTitle(currentNoteTypeFilter);
}

/**
 * Apply the correct CSS layout class to the search grid based on note type.
 * - quote / null (all notes): default 3-col layout (Text+Author+Source / Tags+Score+Clear)
 * - note / puzzle / joke:     2-col layout (Text+Clear / Tags+Score)
 * - training:                 3-col layout (Text+Year+Month / Tags+Score+Clear)
 */
function updateSearchGridLayout(noteType) {
  const grid = document.querySelector('.search-grid');
  if (!grid) return;
  grid.classList.remove('layout-notes', 'layout-training', 'layout-quote');
  if (!noteType) return; // "All Notes" — default 3-col layout
  const behavior = getNoteTypeConfig(noteType).behavior || 'generic';
  if (behavior === 'generic') {
    grid.classList.add('layout-notes');
  } else if (behavior === 'training' || behavior === 'diary') {
    grid.classList.add('layout-training');
  } else if (behavior === 'quote') {
    grid.classList.add('layout-quote');
  }
}

/**
 * Update the search header title based on the current note type
 */
function updateSearchHeaderTitle(currentNoteTypeFilter) {
  // Note-type-specific search header disabled — UI uses a fixed "🔍 Search"
  // label set in index.html. Kept as a no-op so call sites still work and
  // we can re-enable per-type labels by removing this early return.
  return;
  const searchHeaderTitle = getElementByIdSafe('searchHeaderTitle', 'updateSearchHeaderTitle');
  if (!searchHeaderTitle) return;

  if (!currentNoteTypeFilter) {
    searchHeaderTitle.textContent = '🔍 Search All Notes';
    return;
  }

  const config = getNoteTypeConfig(currentNoteTypeFilter);
  searchHeaderTitle.textContent = `🔍 Search ${config.label || currentNoteTypeFilter}`;
}

/**
 * Update the training types dropdown label based on view
 */
function updateTrainingTypesDropdownLabel(isAllNotesView, currentNoteTypeFilter = null) {
  const label = document.getElementById('trainingTypesFilterLabel');
  if (!label) return;

  const behavior = currentNoteTypeFilter ? getNoteTypeConfig(currentNoteTypeFilter).behavior : null;
  label.textContent = isAllNotesView
    ? '📚 Types/Sources'
    : (behavior === 'training' ? '🏋️ Training Types' : '🏷️ Types');
}

// ============= DROPDOWN HANDLERS =============

/**
 * Get checked type IDs from checkboxes
 */
function getCheckedTypeIds(checkboxSelector) {
  const checkboxes = document.querySelectorAll(checkboxSelector);
  return Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.id);
}

/**
 * Toggle dropdown and reload if needed when closing
 */
function handleDropdownToggle(toggleEl, dropdownEl, checkboxSelector, callbacks, wasOpen) {
  dropdownEl.classList.toggle("show");
  toggleEl.classList.toggle("open");
  
  // If closing and changes were made, reload quotes
  if (wasOpen && typeFilterChanged) {
    const checkedTypes = getCheckedTypeIds(checkboxSelector);
    console.log("Reloading with types:", checkedTypes);
    
    if (callbacks.setCurrentPage) {
      callbacks.setCurrentPage(1);
    }
    if (callbacks.loadQuotes) {
      callbacks.loadQuotes();
    }
    if (callbacks.loadTotalCount) {
      callbacks.loadTotalCount();
    }
    typeFilterChanged = false;
  }
}

/**
 * Setup quote type filter dropdown
 */
function setupQuoteTypeDropdown(callbacks) {
  const typeFilterToggle = getElementByIdSafe(ELEMENT_IDS.typeFilterToggle, 'setupQuoteTypeDropdown');
  const typeFilterDropdown = getElementByIdSafe(ELEMENT_IDS.typeFilterDropdown, 'setupQuoteTypeDropdown');

  if (!typeFilterToggle || !typeFilterDropdown) return;

  // Toggle dropdown on button click
  typeFilterToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = typeFilterDropdown.classList.contains("show");
    handleDropdownToggle(
      typeFilterToggle,
      typeFilterDropdown,
      SELECTORS.quoteTypeCheckbox,
      callbacks,
      wasOpen
    );
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.typeFilterContainer)) {
      const wasOpen = typeFilterDropdown.classList.contains("show");

      // Always close
      typeFilterDropdown.classList.remove("show");
      typeFilterToggle.classList.remove("open");

      // If changes were made while it was open, reload — do NOT toggle class again
      if (wasOpen && typeFilterChanged) {
        typeFilterChanged = false;
        if (callbacks.setCurrentPage) callbacks.setCurrentPage(1);
        if (callbacks.loadQuotes) callbacks.loadQuotes();
        if (callbacks.loadTotalCount) callbacks.loadTotalCount();
      }
    }
  });
}

/**
 * Set all checkboxes to a specific state
 */
function setAllCheckboxes(selector, checked) {
  const checkboxes = document.querySelectorAll(selector);
  checkboxes.forEach(checkbox => {
    checkbox.checked = checked;
  });
  typeFilterChanged = true;
  // Refresh all summaries (each only renders if its element is visible)
  updateTrainingTypeSummary();
  updateQuoteSourcesSummary();
  updateGenericSubTypeSummary();
}

/**
 * Setup Select All / Deselect All buttons for any filter type
 */
function setupSelectButtons(selectAllBtnId, deselectAllBtnId, checkboxSelector) {
  const selectAllBtn = getElementByIdSafe(selectAllBtnId, 'setupSelectButtons');
  const deselectAllBtn = getElementByIdSafe(deselectAllBtnId, 'setupSelectButtons');

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAllCheckboxes(checkboxSelector, true);
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAllCheckboxes(checkboxSelector, false);
    });
  }
}

/**
 * Setup Select All / Deselect All for quote types
 */
function setupQuoteTypeButtons() {
  setupSelectButtons(
    ELEMENT_IDS.typeSelectAllBtn,
    ELEMENT_IDS.typeDeselectAllBtn,
    SELECTORS.quoteTypeCheckbox
  );
}

/**
 * Setup training type filter dropdown
 */
function setupTrainingTypeDropdown(callbacks) {
  const trainingTypeFilterToggle = getElementByIdSafe(ELEMENT_IDS.trainingTypeFilterToggle, 'setupTrainingTypeDropdown');
  const trainingTypeFilterDropdown = getElementByIdSafe(ELEMENT_IDS.trainingTypeFilterDropdown, 'setupTrainingTypeDropdown');
  
  if (!trainingTypeFilterToggle || !trainingTypeFilterDropdown) return;

  // Toggle dropdown on button click
  trainingTypeFilterToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = trainingTypeFilterDropdown.classList.contains("show");
    
    trainingTypeFilterDropdown.classList.toggle("show");
    trainingTypeFilterToggle.classList.toggle("open");
    
    // If closing and changes were made, reload quotes
    if (wasOpen && typeFilterChanged) {
      const checkedTypes = getCheckedTypeIds(SELECTORS.trainingTypeCheckbox);
      console.log("Reloading with training types:", checkedTypes);
      
      typeFilterChanged = false;
      callbacks.loadQuotes();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.trainingFilterContainer)) {
      const wasOpen = trainingTypeFilterDropdown.classList.contains("show");
      
      trainingTypeFilterDropdown.classList.remove("show");
      trainingTypeFilterToggle.classList.remove("open");
      
      // If closing and changes were made, reload quotes
      if (wasOpen && typeFilterChanged) {
        const checkedTypes = getCheckedTypeIds(SELECTORS.trainingTypeCheckbox);
        console.log("Reloading with training types:", checkedTypes);
        
        typeFilterChanged = false;
        callbacks.loadQuotes();
      }
    }
  });
}

/**
 * Setup Select All / Deselect All for training types
 */
function setupTrainingTypeButtons() {
  setupSelectButtons(
    ELEMENT_IDS.trainingTypeSelectAllBtn,
    ELEMENT_IDS.trainingTypeDeselectAllBtn,
    SELECTORS.trainingTypeCheckbox
  );
}

/**
 * Setup generic sub-type filter dropdown
 */
function setupGenericSubTypeDropdown(callbacks) {
  const toggle = getElementByIdSafe(ELEMENT_IDS.genericSubTypeFilterToggle, 'setupGenericSubTypeDropdown');
  const dropdown = getElementByIdSafe(ELEMENT_IDS.genericSubTypeFilterDropdown, 'setupGenericSubTypeDropdown');
  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = dropdown.classList.contains('show');
    dropdown.classList.toggle('show');
    toggle.classList.toggle('open');
    if (wasOpen && typeFilterChanged) {
      typeFilterChanged = false;
      if (callbacks.setCurrentPage) callbacks.setCurrentPage(1);
      if (callbacks.loadQuotes) callbacks.loadQuotes();
      if (callbacks.loadTotalCount) callbacks.loadTotalCount();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest(SELECTORS.genericSubTypeFilterContainer)) {
      const wasOpen = dropdown.classList.contains('show');
      dropdown.classList.remove('show');
      toggle.classList.remove('open');
      if (wasOpen && typeFilterChanged) {
        typeFilterChanged = false;
        if (callbacks.setCurrentPage) callbacks.setCurrentPage(1);
        if (callbacks.loadQuotes) callbacks.loadQuotes();
        if (callbacks.loadTotalCount) callbacks.loadTotalCount();
      }
    }
  });
}

/**
 * Setup Select All / Deselect All for generic sub-types
 */
function setupGenericSubTypeButtons() {
  setupSelectButtons(
    ELEMENT_IDS.genericSubTypeSelectAllBtn,
    ELEMENT_IDS.genericSubTypeDeselectAllBtn,
    SELECTORS.genericSubTypeCheckbox
  );
}

// ============= INITIALIZATION =============

/**
 * Initialize all filter event handlers
 * @param {Object} callbacks - { loadQuotes, loadTotalCount, setCurrentPage }
 */
export function initializeFilterHandlers(callbacks) {
  setupQuoteTypeDropdown(callbacks);
  setupQuoteTypeButtons();
  setupTrainingTypeDropdown(callbacks);
  setupTrainingTypeButtons();
  setupGenericSubTypeDropdown(callbacks);
  setupGenericSubTypeButtons();
}
