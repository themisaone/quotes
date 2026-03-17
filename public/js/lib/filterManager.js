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

// ============= CONSTANTS =============

const SELECTORS = {
  quoteTypeOptions: '.type-filter-options',
  trainingTypeOptions: '.training-type-filter-options',
  quoteTypeCheckbox: '.type-filter-option input[type="checkbox"]',
  trainingTypeCheckbox: '.training-type-filter-options input[type="checkbox"]',
  typeFilterContainer: '.type-filter-dropdown-container',
  trainingFilterContainer: '#trainingTypesFilterContainer'
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
  
  // Visibility (CORRECTED IDs)
  sourcesFilterContainer: 'quoteSourcesFilterContainer',  // Was 'sourcesFilterContainer'
  trainingTypesFilterContainer: 'trainingTypesFilterContainer'
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
  label.innerHTML = `
    <input type="checkbox" id="${checkboxId}" data-type="${type.value}" ${isChecked ? 'checked' : ''}>
    <span>${type.icon} ${type.label}</span>
  `;
  
  // Add event listener to set flag when changed
  const checkbox = label.querySelector('input');
  checkbox.addEventListener('change', () => {
    typeFilterChanged = true;
  });
  
  return label;
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
    const isChecked = checkedStates[checkboxId] !== false;
    container.appendChild(createTypeCheckbox(checkboxId, type, isChecked));
  });
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
    const isChecked = checkedStates[checkboxId] !== false;
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
  
  // Show quote sources for quotes view only (not all notes)
  const showQuoteSources = currentNoteTypeFilter === 'quote';
  setElementVisibility(ELEMENT_IDS.sourcesFilterContainer, showQuoteSources);
  
  // Show training types for training view OR all notes view (combined)
  const showTrainingTypes = currentNoteTypeFilter === 'training' || isAllNotesView;
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
  
  // Hide Author/Source search fields for non-quote views
  const showAuthorSource = currentNoteTypeFilter === 'quote' || isAllNotesView;
  setElementVisibility('searchAuthorContainer', showAuthorSource);
  setElementVisibility('searchSourceContainer', showAuthorSource);
  
  // Show/hide Year/Month filters for training view only (not all notes)
  const showTrainingDateFilters = currentNoteTypeFilter === 'training';
  setElementVisibility('trainingYearContainer', showTrainingDateFilters);
  setElementVisibility('trainingMonthContainer', showTrainingDateFilters);
  
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
  grid.classList.remove('layout-notes', 'layout-training');
  if (noteType === 'note' || noteType === 'puzzle' || noteType === 'joke') {
    grid.classList.add('layout-notes');
  } else if (noteType === 'training') {
    grid.classList.add('layout-training');
  }
}

/**
 * Update the search header title based on the current note type
 */
function updateSearchHeaderTitle(currentNoteTypeFilter) {
  const searchHeaderTitle = getElementByIdSafe('searchHeaderTitle', 'updateSearchHeaderTitle');
  if (!searchHeaderTitle) return;
  
  const titles = {
    quote: '🔍 Search Quotes',
    training: '🔍 Search Training',
    note: '🔍 Search Notes',
    puzzle: '🔍 Search Puzzles',
    null: '🔍 Search All Notes'  // "All Notes" view
  };
  
  const title = titles[currentNoteTypeFilter] || titles[null];
  searchHeaderTitle.textContent = title;
}

/**
 * Update the training types dropdown label based on view
 */
function updateTrainingTypesDropdownLabel(isAllNotesView) {
  const toggleBtn = getElementByIdSafe('trainingTypeFilterToggle', 'updateTrainingTypesDropdownLabel');
  if (!toggleBtn) return;
  
  const labelSpan = toggleBtn.querySelector('span:first-child');
  if (!labelSpan) return;
  
  if (isAllNotesView) {
    labelSpan.textContent = '📚 Select Note Types/Sources';
  } else {
    labelSpan.textContent = '🏋️ Select Training Types';
  }
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
      
      if (wasOpen) {
        const typeCheckboxes = document.querySelectorAll(SELECTORS.quoteTypeCheckbox);
        const states = {};
        typeCheckboxes.forEach(cb => {
          states[cb.id] = cb.checked;
        });
        console.log("=== CLOSING DROPDOWN ===");
        console.log("Checkbox states:", states);
      }
      
      typeFilterDropdown.classList.remove("show");
      typeFilterToggle.classList.remove("open");
      
      // If closing and changes were made, reload quotes
      if (wasOpen && typeFilterChanged) {
        handleDropdownToggle(
          typeFilterToggle,
          typeFilterDropdown,
          SELECTORS.quoteTypeCheckbox,
          callbacks,
          true
        );
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
}
