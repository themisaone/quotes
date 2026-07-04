/**
 * ============================================================================
 * Page Coordinator Module
 * ============================================================================
 * Coordinates main page state, view switching, and UI updates based on
 * current navigation context (left menu selection).
 * 
 * Features:
 * - View switching (quotes, authors, sources, tags, settings)
 * - Page title updates
 * - Button text updates
 * - Filter visibility management
 * - Menu navigation setup
 * - Hash change coordination
 */

import { getElementByIdSafe, FILTER_IDS, CONTAINER_IDS } from '../constants.js';

// ============================================
// Constants
// ============================================

// View IDs
const VIEW_IDS = {
  MENU: 'menuView',
  QUOTES: 'quotesView',
  AUTHORS: 'authorsView',
  SOURCES: 'sourcesView',
  TAGS: 'tagsView',
  SETTINGS: 'settingsView'
};

// View Names
const VIEWS = {
  MENU: 'menu',
  QUOTES: 'quotes',
  AUTHORS: 'authors',
  SOURCES: 'sources',
  TAGS: 'tags',
  SETTINGS: 'settings'
};

// Data Listener Attribute
const DATA_LISTENER_ATTR = 'data-listener';

// ============================================
// Public API
// ============================================

/**
 * Switch between different views (quotes, authors, sources, tags, settings)
 * @param {string} view - View name to switch to
 * @param {Object} callbacks - Callback functions for loading data and settings
 * @param {Function} callbacks.loadQuotes - Load quotes
 * @param {Function} callbacks.loadTotalCount - Load total count
 * @param {Function} callbacks.loadAuthors - Load authors
 * @param {Function} callbacks.loadSources - Load sources
 * @param {Function} callbacks.loadTags - Load tags
 * @param {Function} callbacks.toggleMetadataSearchSection - Toggle metadata search
 * @param {Function} callbacks.toggleTagOperationsPanel - Toggle tag operations
 * @param {Function} callbacks.renderQuoteTypesList - Render quote types
 * @param {Function} callbacks.renderTrainingTypesList - Render training types
 * @param {Function} callbacks.setupTypeManagementListeners - Setup type management
 * @param {Function} callbacks.populateTypeDropdowns - Populate type dropdowns
 * @param {Function} callbacks.populateTypeFilterCheckboxes - Populate type filter checkboxes
 * @param {Function} callbacks.populateTrainingTypeFilterCheckboxes - Populate training type filter checkboxes
 * @param {Object} state - Application state
 * @param {Object} state.globalSettings - Global settings object
 */
export function switchView(view, callbacks, state) {
  hideAllViews();
  
  switch (view) {
    case VIEWS.MENU:
      showMenuView();
      break;
    case VIEWS.QUOTES:
      showQuotesView(callbacks, state);
      break;
    case VIEWS.AUTHORS:
      showAuthorsView(callbacks);
      break;
    case VIEWS.SOURCES:
      showSourcesView(callbacks);
      break;
    case VIEWS.TAGS:
      showTagsView(callbacks, state);
      break;
    case VIEWS.SETTINGS:
      showSettingsView(callbacks);
      break;
  }
}

/**
 * Setup menu navigation click handlers
 * @param {Function} switchViewCallback - Callback to switch views
 */
export function setupMenuNavigation(switchViewCallback) {
  const menuItems = document.querySelectorAll('.menu-item[data-view]');
  
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      switchViewCallback(view);
    });
  });
}

/**
 * Handle hash change event - coordinates all UI updates
 * @param {Object} handlers - Handler functions
 * @param {Function} handlers.handleHashNavigation - Handle hash navigation
 * @param {Function} handlers.updateActiveMenuState - Update menu active state
 * @param {Function} handlers.updateAddButtonText - Update add button text
 * @param {Function} handlers.updateMainTitle - Update main title
 * @param {Function} handlers.updateSourcesFilterVisibility - Update filter visibility
 * @param {Function} handlers.toggleMetadataSearchSection - Toggle metadata search
 * @param {Function} handlers.loadQuotes - Load quotes
 * @param {Function} handlers.loadTotalCount - Load total count
 * @param {Function} handlers.setCurrentPage - Set current page
 * @param {Object} state - Application state
 * @param {string} state.currentNoteTypeFilter - Current note type filter
 * @param {Object} state.globalSettings - Global settings
 */
export function handleHashChange(handlers, state) {
  console.log('🔄 Hash changed:', window.location.hash);
  
  // Update navigation state
  handlers.handleHashNavigation();
  handlers.updateActiveMenuState();
  handlers.updateAddButtonText();
  handlers.updateMainTitle();
  handlers.updateSourcesFilterVisibility();
  handlers.updateViewModeToggle?.();
  
  // Update metadata search visibility
  const metaSearchEnabled = state.globalSettings?.enableQuoteMetaSearches === true;
  const shouldShowMetadata = (state.currentNoteTypeFilter === 'quote' || state.currentNoteTypeFilter === null) && metaSearchEnabled;
  handlers.toggleMetadataSearchSection(shouldShowMetadata);
  
  // Reset to first page and reload data
  handlers.setCurrentPage(1);
  handlers.loadQuotes();
  handlers.loadTotalCount();
}

/**
 * Initialize hash change listener
 * @param {Object} handlers - Handler functions (same as handleHashChange)
 * @param {Function} getState - Function to get current state
 */
export function initializeHashChangeListener(handlers, getState) {
  window.addEventListener('hashchange', () => {
    const state = getState();
    handleHashChange(handlers, state);
  });
}

// ============================================
// Helper Functions - View Management
// ============================================

/**
 * Hide all views
 */
function hideAllViews() {
  const views = [
    VIEW_IDS.MENU,
    VIEW_IDS.QUOTES,
    VIEW_IDS.AUTHORS,
    VIEW_IDS.SOURCES,
    VIEW_IDS.TAGS,
    VIEW_IDS.SETTINGS
  ];
  
  views.forEach(viewId => {
    const view = getElementByIdSafe(viewId, 'hideAllViews');
    if (view) {
      view.style.display = 'none';
    }
  });
}

/**
 * Show menu view
 */
function showMenuView() {
  showView(VIEW_IDS.MENU);
}

/**
 * Show quotes view
 * @param {Object} callbacks - Callbacks
 * @param {Object} state - State
 */
function showQuotesView(callbacks, state) {
  showView(VIEW_IDS.QUOTES);
  callbacks.loadQuotes();
  callbacks.loadTotalCount();
  
  // Check if Metadata Search should be shown
  const metaSearchEnabled = state.globalSettings?.enableQuoteMetaSearches === true;
  callbacks.toggleMetadataSearchSection(metaSearchEnabled);
}

/**
 * Show authors view
 * @param {Object} callbacks - Callbacks
 */
function showAuthorsView(callbacks) {
  showView(VIEW_IDS.AUTHORS);
  callbacks.loadAuthors();
}

/**
 * Show sources view
 * @param {Object} callbacks - Callbacks
 */
function showSourcesView(callbacks) {
  showView(VIEW_IDS.SOURCES);
  callbacks.loadSources();
  setupSourceTypeFilters(callbacks.loadSources);
}

/**
 * Show tags view
 * @param {Object} callbacks - Callbacks
 * @param {Object} state - State
 */
function showTagsView(callbacks, state) {
  showView(VIEW_IDS.TAGS);
  callbacks.loadTags();
  
  // Check if Tag Operations should be shown
  const tagOpsEnabled = state.globalSettings?.enableTagOperations !== false;
  callbacks.toggleTagOperationsPanel(tagOpsEnabled);
}

/**
 * Show settings view
 * @param {Object} callbacks - Callbacks
 */
function showSettingsView(callbacks) {
  showView(VIEW_IDS.SETTINGS);

  void (async () => {
    try {
      if (callbacks.prepareSettingsView) {
        await callbacks.prepareSettingsView();
      }
    } catch (e) {
      console.error('Failed to refresh settings for Options:', e);
    }

    callbacks.renderQuoteTypesList(
      callbacks.populateTypeDropdowns,
      callbacks.populateTypeFilterCheckboxes,
    );
    callbacks.renderTrainingTypesList(callbacks.populateTrainingTypeFilterCheckboxes);

    if (callbacks.renderNoteTypesList) {
      callbacks.renderNoteTypesList();
    }

    callbacks.setupTypeManagementListeners(
      callbacks.populateTypeDropdowns,
      callbacks.populateTypeFilterCheckboxes,
      callbacks.populateTrainingTypeFilterCheckboxes,
      callbacks.rebuildNoteTypeMenu,
    );
  })();
}

/**
 * Show a specific view by ID
 * @param {string} viewId - View ID to show
 */
function showView(viewId) {
  const view = getElementByIdSafe(viewId, 'showView');
  if (view) {
    view.style.display = 'block';
  }
}

// ============================================
// Helper Functions - Source Filters
// ============================================

/**
 * Setup source type filters (Books, Movies, etc.)
 * @param {Function} loadSourcesCallback - Callback to reload sources
 */
function setupSourceTypeFilters(loadSourcesCallback) {
  const filterIds = [
    FILTER_IDS.FILTER_BOOK,
    FILTER_IDS.FILTER_MOVIE,
    FILTER_IDS.FILTER_ASSORTED,
    FILTER_IDS.FILTER_POETRY,
    FILTER_IDS.FILTER_LYRICS,
    FILTER_IDS.FILTER_JOKES
  ];
  
  filterIds.forEach(filterId => {
    attachFilterListener(filterId, loadSourcesCallback);
  });
}

/**
 * Attach filter listener to element if not already attached
 * @param {string} elementId - Element ID
 * @param {Function} callback - Callback function
 */
function attachFilterListener(elementId, callback) {
  const element = getElementByIdSafe(elementId, 'attachFilterListener');
  
  if (element && !hasListener(element)) {
    element.addEventListener('change', callback);
    markAsListenerAttached(element);
  }
}

/**
 * Check if element already has a listener attached
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if listener is attached
 */
function hasListener(element) {
  return element.hasAttribute(DATA_LISTENER_ATTR);
}

/**
 * Mark element as having a listener attached
 * @param {HTMLElement} element - Element to mark
 */
function markAsListenerAttached(element) {
  element.setAttribute(DATA_LISTENER_ATTR, 'true');
}
