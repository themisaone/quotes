/**
 * View Manager
 * Handles navigation, URL routing, and menu state
 */

import { getElementByIdSafe, BUTTON_IDS, CONTAINER_IDS } from '../constants.js';
import { getNoteTypeConfig, getNoteTypes } from './noteTypes.js';

/**
 * Parse URL hash and return note type filter.
 * Uses the dynamic note types list so any configured type works automatically.
 */
export function parseUrlHash() {
  const hash = window.location.hash || '#/all';
  const view = hash.replace('#/', '').toLowerCase();
  
  if (view === 'all' || view === 'all-notes' || view === '') {
    return null;
  }

  const types = getNoteTypes();
  if (types.length > 0) {
    // Exact match (e.g. #/note, #/training, #/journal)
    const exact = types.find(t => t.value === view);
    if (exact) return exact.value;
    // Pluralised match (e.g. #/notes → note, #/puzzles → puzzle)
    const dePluralized = view.endsWith('s') ? view.slice(0, -1) : null;
    if (dePluralized) {
      const plural = types.find(t => t.value === dePluralized);
      if (plural) return plural.value;
    }
  } else {
    // Fallback when types not yet initialised (startup race)
    const legacyMap = {
      'quotes': 'quote', 'quote': 'quote',
      'notes': 'note', 'note': 'note',
      'training': 'training',
      'puzzles': 'puzzle', 'puzzle': 'puzzle',
      'historicals': 'historical', 'historical': 'historical'
    };
    if (legacyMap[view]) return legacyMap[view];
  }
  
  return null;
}

/**
 * Update URL hash based on current filter
 */
export function updateUrlHash(noteTypeFilter) {
  const hash = noteTypeFilter ? `#/${noteTypeFilter}` : '#/all';
  if (window.location.hash !== hash) {
    window.history.pushState(null, '', hash);
  }
}

/**
 * Update active menu state
 */
export function updateActiveMenuState(noteTypeFilter) {
  // Remove active from all menu items
  document.querySelectorAll('.menu-item, .note-type-filter').forEach(item => {
    item.classList.remove('active');
  });
  
  // Set active based on noteTypeFilter
  if (noteTypeFilter === null) {
    // All Notes is active
    const allNotesBtn = document.querySelector('.menu-item[data-view="quotes"]');
    if (allNotesBtn) allNotesBtn.classList.add('active');
  } else {
    // Specific note type is active
    const typeBtn = document.querySelector(`.note-type-filter[data-note-type="${noteTypeFilter}"]`);
    if (typeBtn) typeBtn.classList.add('active');
  }
}

/**
 * Update page title based on current filter — driven by configured note types.
 */
export function updatePageTitle(noteTypeFilter) {
  const titleIcon = getElementByIdSafe('mainTitleIcon', 'updatePageTitle');
  const titleText = getElementByIdSafe('mainTitleText', 'updatePageTitle');
  
  if (!titleIcon || !titleText) return;
  
  if (!noteTypeFilter) {
    titleIcon.textContent = '📦';
    titleText.textContent = 'All Notes';
    return;
  }

  const config = getNoteTypeConfig(noteTypeFilter);
  titleIcon.textContent = config.icon || '📝';
  titleText.textContent = config.label || noteTypeFilter;
}

/**
 * Update search header text — driven by configured note types.
 */
export function updateSearchHeader(noteTypeFilter) {
  const searchHeader = getElementByIdSafe('searchHeaderTitle', 'updateSearchHeader');
  if (!searchHeader) return;
  
  if (!noteTypeFilter) {
    searchHeader.textContent = 'Search All Notes';
    return;
  }

  const config = getNoteTypeConfig(noteTypeFilter);
  searchHeader.textContent = `Search ${config.label || noteTypeFilter}`;
}

/**
 * Update filter visibility based on note type
 */
export function updateFilterVisibility(noteTypeFilter) {
  // Quote sources filter
  const sourcesContainer = getElementByIdSafe('quoteSourcesFilterContainer', 'updateFilterVisibility');
  const authorSearchContainer = document.querySelector('.search-item:has(#searchAuthor)');
  const sourceSearchContainer = document.querySelector('.search-item:has(#searchSource)');
  
  const showQuoteFilters = noteTypeFilter === null || noteTypeFilter === 'quote';
  
  if (sourcesContainer) {
    sourcesContainer.style.display = showQuoteFilters ? 'block' : 'none';
  }
  
  // Show/hide author and source search fields
  if (authorSearchContainer) {
    authorSearchContainer.style.display = showQuoteFilters ? 'block' : 'none';
  }
  if (sourceSearchContainer) {
    sourceSearchContainer.style.display = showQuoteFilters ? 'block' : 'none';
  }
  
  // Training filters
  const trainingTypesContainer = getElementByIdSafe('trainingTypesFilterContainer', 'updateFilterVisibility');
  const trainingYearContainer = getElementByIdSafe('trainingYearContainer', 'updateFilterVisibility');
  const trainingMonthContainer = getElementByIdSafe('trainingMonthContainer', 'updateFilterVisibility');
  
  const trainingInMode = !window._modeAllowedTypes || window._modeAllowedTypes.includes('training');
  const showTrainingFilters = trainingInMode && noteTypeFilter === 'training';

  if (trainingTypesContainer) {
    trainingTypesContainer.style.display = showTrainingFilters ? 'block' : 'none';
  }
  if (trainingYearContainer) {
    trainingYearContainer.style.display = showTrainingFilters ? 'block' : 'none';
  }
  if (trainingMonthContainer) {
    trainingMonthContainer.style.display = showTrainingFilters ? 'block' : 'none';
  }
}

/**
 * Update add button text — driven by configured note types.
 */
export function updateAddButtonText(noteTypeFilter) {
  const addBtn = getElementByIdSafe(BUTTON_IDS.ADD_QUOTE_BTN, 'updateAddButtonText');
  if (!addBtn) return;
  
  if (!noteTypeFilter) {
    addBtn.textContent = '+ Add New Note';
    return;
  }

  const config = getNoteTypeConfig(noteTypeFilter);
  addBtn.textContent = `+ Add New ${config.label || 'Note'}`;
}

/**
 * Initialize view from URL hash
 */
export function initializeView() {
  const noteTypeFilter = parseUrlHash();
  updateActiveMenuState(noteTypeFilter);
  updatePageTitle(noteTypeFilter);
  updateSearchHeader(noteTypeFilter);
  updateFilterVisibility(noteTypeFilter);
  updateAddButtonText(noteTypeFilter);
  
  return noteTypeFilter;
}

/**
 * Switch to a new view
 */
export function switchView(noteTypeFilter) {
  updateUrlHash(noteTypeFilter);
  updateActiveMenuState(noteTypeFilter);
  updatePageTitle(noteTypeFilter);
  updateSearchHeader(noteTypeFilter);
  updateFilterVisibility(noteTypeFilter);
  updateAddButtonText(noteTypeFilter);
  
  return noteTypeFilter;
}

/**
 * Setup hash change listener
 */
export function setupHashChangeListener(callback) {
  window.addEventListener('hashchange', () => {
    const noteTypeFilter = parseUrlHash();
    switchView(noteTypeFilter);
    
    // Call the provided callback (e.g., to reload data)
    if (callback) {
      callback(noteTypeFilter);
    }
  });
}
