/**
 * View Manager
 * URL hash parsing, active-menu state, and page-title text.
 *
 * NOTE: search-header text, "+ Add" button text, filter visibility, and the
 * `switchView`/`initializeView`/`setupHashChangeListener` flow used to live
 * here too, but they were never wired up — `app.js` uses
 * `filterManager.js::updateSourcesFilterVisibility` for filter visibility,
 * `noteTypes.js::updateAddButtonText` for the Add button, and its own
 * `window.switchView` / `pageCoordinator.js::switchView` for navigation.
 * The duplicates were removed; do not re-introduce them here without checking
 * who actually consumes them.
 */

import { getElementByIdSafe } from '../constants.js';
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
