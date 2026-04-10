/**
 * View Manager
 * Handles navigation, URL routing, and menu state
 */

import { getElementByIdSafe, BUTTON_IDS, CONTAINER_IDS } from '../constants.js';

/**
 * Parse URL hash and return note type filter
 */
export function parseUrlHash() {
  const hash = window.location.hash || '#/all';
  const view = hash.replace('#/', '').toLowerCase();
  
  if (view === 'all' || view === 'all-notes') {
    return null; // All notes
  } else if (view === 'quotes' || view === 'quote') {
    return 'quote';
  } else if (view === 'notes' || view === 'note') {
    return 'note';
  } else if (view === 'training') {
    return 'training';
  } else if (view === 'puzzles' || view === 'puzzle') {
    return 'puzzle';
  } else if (view === 'historicals' || view === 'historical') {
    return 'historical';
  }
  
  return null; // Default to all notes
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
 * Update page title based on current filter
 */
export function updatePageTitle(noteTypeFilter) {
  const titleIcon = getElementByIdSafe('mainTitleIcon', 'updatePageTitle');
  const titleText = getElementByIdSafe('mainTitleText', 'updatePageTitle');
  
  if (!titleIcon || !titleText) return;
  
  const titles = {
    null: { icon: '📦', text: "All Notes" },
    'quote': { icon: '💬', text: "Quotes" },
    'note': { icon: '📝', text: "Notes" },
    'training': { icon: '💪', text: "Trainings" },
    'puzzle': { icon: '🧩', text: "Puzzles" },
    'historical': { icon: '📜', text: "Historical Notes" }
  };
  
  const title = titles[noteTypeFilter] || titles[null];
  titleIcon.textContent = title.icon;
  titleText.textContent = title.text;
}

/**
 * Update search header text
 */
export function updateSearchHeader(noteTypeFilter) {
  const searchHeader = getElementByIdSafe('searchHeaderTitle', 'updateSearchHeader');
  if (!searchHeader) return;
  
  if (!noteTypeFilter) {
    searchHeader.textContent = 'Search All Notes';
  } else {
    const labels = {
      'quote': 'Quotes',
      'note': 'Notes',
      'training': 'Training',
      'puzzle': 'Puzzles'
    };
    searchHeader.textContent = `Search ${labels[noteTypeFilter] || 'Notes'}`;
  }
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
 * Update add button text
 */
export function updateAddButtonText(noteTypeFilter) {
  const addBtn = getElementByIdSafe(BUTTON_IDS.ADD_QUOTE_BTN, 'updateAddButtonText');
  if (!addBtn) return;
  
  if (!noteTypeFilter) {
    addBtn.textContent = '+ Add New Note';
  } else {
    const labels = {
      'quote': 'Quote',
      'note': 'Note',
      'training': 'Training',
      'puzzle': 'Puzzle'
    };
    addBtn.textContent = `+ Add New ${labels[noteTypeFilter] || 'Note'}`;
  }
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
