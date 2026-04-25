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
import { getNoteTypeConfig, hasGenericSubTypeField, getGenericSubTypes } from './noteTypes.js';

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

/**
 * Refresh active/inactive training type summary below the search title.
 */
export function updateTrainingTypeSummary(isAllNotes = false) {
  // In All Notes (combined) use id-prefix to avoid including quote-source checkboxes.
  // In Training view all checkboxes are training types so the simple selector is fine.
  const selector = isAllNotes
    ? '.training-type-filter-options input[id^="filterTraining"]'
    : SELECTORS.trainingTypeCheckbox;
  renderTypeSummary(document.getElementById('trainingTypeSummary'), selector);
}

/**
 * Refresh active/inactive quote source type summary below the search title.
 * In All Notes view, quote checkboxes live in the combined dropdown (filterQuote* IDs).
 * In Quote view, they live in the dedicated .type-filter-options dropdown.
 */
export function updateQuoteSourcesSummary() {
  const inCombined = document.querySelector('.training-type-filter-options input[id^="filterQuote"]');
  const selector = inCombined
    ? '.training-type-filter-options input[id^="filterQuote"]'
    : SELECTORS.quoteTypeOptions + ' input[type="checkbox"]';
  renderTypeSummary(document.getElementById('quoteSourcesSummary'), selector);
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
}

/**
 * Populate combined note types/sources for "All Notes" view
 */
export function populateCombinedTypeFilterCheckboxes(getQuoteTypes, getTrainingTypes) {
  const quoteTypes = getQuoteTypes();
  const trainingTypes = getTrainingTypes();
  const container = document.querySelector(SELECTORS.trainingTypeOptions);
  
  if (!container) return;
  
  // Store current checked states
  const checkedStates = getCheckboxStates(container);
  
  // Clear and rebuild
  container.innerHTML = '';
  
  // Add quote source types first
  const quoteSectionLabel = document.createElement('div');
  quoteSectionLabel.className = 'type-filter-section-label';
  quoteSectionLabel.textContent = '📚 Quote Sources';
  quoteSectionLabel.style.cssText = 'padding: 0.5rem 1rem; font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); border-bottom: 1px solid var(--border); margin-bottom: 0.5rem;';
  container.appendChild(quoteSectionLabel);
  
  quoteTypes.forEach(type => {
    const checkboxId = `filterQuote${type.value.replace(/-/g, '')}`;
    const isChecked = checkedStates[checkboxId] !== false;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
  });
  
  // Add training types
  const trainingSectionLabel = document.createElement('div');
  trainingSectionLabel.className = 'type-filter-section-label';
  trainingSectionLabel.textContent = '🏋️ Training Types';
  trainingSectionLabel.style.cssText = 'padding: 0.5rem 1rem; font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-top: 0.5rem; margin-bottom: 0.5rem;';
  container.appendChild(trainingSectionLabel);
  
  trainingTypes.forEach(type => {
    const checkboxId = `filterTraining${type.value}`;
    const typeDefault = type.defaultChecked !== false;
    const isChecked = checkedStates[checkboxId] !== undefined ? checkedStates[checkboxId] : typeDefault;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
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
  
  // Show training types only when training is in the active mode
  const trainingInMode = !window._modeAllowedTypes || window._modeAllowedTypes.includes('training');
  const showTrainingTypes = trainingInMode && (currentNoteTypeFilter === 'training' || isAllNotesView);
  setElementVisibility(ELEMENT_IDS.trainingTypesFilterContainer, showTrainingTypes);
  
  // Update the training types dropdown label based on view
  updateTrainingTypesDropdownLabel(isAllNotesView);
  
  // Repopulate the training dropdown based on view
  if (showTrainingTypes && getQuoteTypes && getTrainingTypes) {
    if (isAllNotesView) {
      // Combined view: show both quote sources and training types
      populateCombinedTypeFilterCheckboxes(getQuoteTypes, getTrainingTypes);
    } else {
      // Training view: show only training types
      populateTrainingTypeFilterCheckboxes(getTrainingTypes);
    }
  }

  // Refresh summaries — each only on its own dedicated page, never mixed.
  // Only updateSourcesFilterVisibility controls display; renderTypeSummary only updates content.
  const trainingSummaryEl = document.getElementById('trainingTypeSummary');
  const quoteSummaryEl    = document.getElementById('quoteSourcesSummary');

  // Training types summary: show on Training view AND All Notes view
  if (currentNoteTypeFilter === 'training' || isAllNotesView) {
    updateTrainingTypeSummary(isAllNotesView);
    if (trainingSummaryEl) trainingSummaryEl.style.display = '';
  } else {
    if (trainingSummaryEl) { trainingSummaryEl.style.display = 'none'; trainingSummaryEl.innerHTML = ''; }
  }

  // Quote sources summary: show on Quote view AND All Notes view
  if (currentNoteTypeFilter === 'quote' || isAllNotesView) {
    updateQuoteSourcesSummary();
    if (quoteSummaryEl) quoteSummaryEl.style.display = '';
  } else {
    if (quoteSummaryEl) { quoteSummaryEl.style.display = 'none'; quoteSummaryEl.innerHTML = ''; }
  }
  
  // Hide Author/Source search fields — only shown for "quote" behavior or All Notes view
  const quoteBehavior = currentNoteTypeFilter !== null && getNoteTypeConfig(currentNoteTypeFilter).behavior === 'quote';
  const showAuthorSource = quoteBehavior || isAllNotesView;
  setElementVisibility('searchAuthorContainer', showAuthorSource);
  setElementVisibility('searchSourceContainer', showAuthorSource);

  // Show/hide Year/Month filters for training behavior only (not all notes)
  const trainingBehavior = currentNoteTypeFilter !== null && getNoteTypeConfig(currentNoteTypeFilter).behavior === 'training';
  const showTrainingDateFilters = trainingBehavior;
  setElementVisibility('trainingYearContainer', showTrainingDateFilters);
  setElementVisibility('trainingMonthContainer', showTrainingDateFilters);

  // Show generic sub-type filter when the current type is generic AND has sub-types
  const showGenericSubTypes = !isAllNotesView && currentNoteTypeFilter !== null && hasGenericSubTypeField(currentNoteTypeFilter);
  setElementVisibility(ELEMENT_IDS.genericSubTypesFilterContainer, showGenericSubTypes);
  if (showGenericSubTypes) {
    populateGenericSubTypeFilterCheckboxes(getGenericSubTypes(currentNoteTypeFilter));
    // Update label to match the type
    const genericSubTypesLabel = document.getElementById('genericSubTypesFilterLabel');
    if (genericSubTypesLabel) {
      genericSubTypesLabel.textContent = `🏷️ ${getNoteTypeConfig(currentNoteTypeFilter).label} Types`;
    }
  }
  // Generic sub-type summary
  const genericSubTypeSummaryEl = document.getElementById('genericSubTypeSummary');
  if (showGenericSubTypes) {
    updateGenericSubTypeSummary();
    if (genericSubTypeSummaryEl) genericSubTypeSummaryEl.style.display = '';
  } else {
    if (genericSubTypeSummaryEl) { genericSubTypeSummaryEl.style.display = 'none'; genericSubTypeSummaryEl.innerHTML = ''; }
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
  } else if (behavior === 'training') {
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
function updateTrainingTypesDropdownLabel(isAllNotesView) {
  const label = document.getElementById('trainingTypesFilterLabel');
  if (!label) return;

  label.textContent = isAllNotesView ? '📚 Types/Sources' : '🏋️ Training Types';
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
