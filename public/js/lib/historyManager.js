/**
 * History Manager - Simple Stack-Based Navigation
 * 
 * Strategy: Push state AFTER every successful load
 * Back: Pop current + pop previous + execute previous (which pushes itself again)
 */

import { 
  FILTER_IDS, 
  BUTTON_IDS,
  getElementByIdSafe, 
  getElementValue as getElementValueSafe, 
  setElementValue as setElementValueSafe 
} from '../constants.js';

// ============= CONSTANTS =============

const MAX_HISTORY_SIZE = 50;
const PUSH_DEBOUNCE_MS = 1000; // Wait 1 second before pushing to allow user to finish typing
const SCROLL_RESTORE_DELAY_MS = 100; // Delay before restoring scroll position

// Selectors
const SELECTORS = {
  activeMenuItem: '.menu-item.active[data-view]',
  quoteCheckboxes: '#quoteTypesFilterContainer input[type="checkbox"]',
  trainingCheckboxes: '#trainingTypesFilterContainer input[type="checkbox"]'
};

// ============= STATE =============

const historyStack = [];
let pushTimeout = null;
let pendingState = null;

// ============= HELPER FUNCTIONS =============
// Note: Using centralized helper functions from constants.js

/**
 * Get checked values from checkboxes
 * @param {string} selector - CSS selector for checkboxes
 * @returns {Array<string>} Array of checked values
 */
function getCheckedValues(selector) {
  const checkboxes = document.querySelectorAll(selector);
  const values = [];
  checkboxes.forEach(cb => {
    if (cb.checked) values.push(cb.value);
  });
  return values;
}

/**
 * Set checkbox states
 * @param {string} selector - CSS selector for checkboxes
 * @param {Array<string>} checkedValues - Values that should be checked
 */
function setCheckboxStates(selector, checkedValues) {
  const checkboxes = document.querySelectorAll(selector);
  checkboxes.forEach(cb => {
    cb.checked = checkedValues.includes(cb.value);
  });
}

// ============= CAPTURE STATE =============

function getCurrentView() {
  const activeMenuItem = document.querySelector(SELECTORS.activeMenuItem);
  return activeMenuItem?.dataset.view || 'quotes';
}

function getCheckedQuoteTypes() {
  return getCheckedValues(SELECTORS.quoteCheckboxes);
}

function getCheckedTrainingTypes() {
  return getCheckedValues(SELECTORS.trainingCheckboxes);
}

/**
 * Capture current application state
 * @returns {Object} Current state object
 */
function captureCurrentState() {
  return {
    timestamp: Date.now(),
    view: getCurrentView(),
    noteType: window.currentNoteTypeFilter || 'all',
    searchAny: getElementValueSafe(FILTER_IDS.SEARCH_ANY),
    searchText: getElementValueSafe(FILTER_IDS.SEARCH_QUOTE),
    tagsSearch: getElementValueSafe(FILTER_IDS.SEARCH_TAGS),
    authorSearch: getElementValueSafe(FILTER_IDS.SEARCH_AUTHOR),
    sourceSearch: getElementValueSafe(FILTER_IDS.SEARCH_SOURCE),
    searchScore: getElementValueSafe(FILTER_IDS.SEARCH_SCORE),
    yearFilter: getElementValueSafe(FILTER_IDS.YEAR_FILTER),
    monthFilter: getElementValueSafe(FILTER_IDS.MONTH_FILTER),
    quoteTypes: getCheckedQuoteTypes(),
    trainingTypes: getCheckedTrainingTypes(),
    page: window.currentPage || 1,
    scrollY: window.scrollY || 0
  };
}

/**
 * Check if two states are equal (for duplicate detection)
 * @param {Object} state1 - First state
 * @param {Object} state2 - Second state
 * @returns {boolean} True if states are equal
 */
function statesAreEqual(state1, state2) {
  if (!state1 || !state2) return false;
  
  // Compare primitive fields
  const primitiveFieldsMatch = (
    state1.view === state2.view &&
    state1.noteType === state2.noteType &&
    state1.searchAny === state2.searchAny &&
    state1.searchText === state2.searchText &&
    state1.tagsSearch === state2.tagsSearch &&
    state1.authorSearch === state2.authorSearch &&
    state1.sourceSearch === state2.sourceSearch &&
    state1.searchScore === state2.searchScore &&
    state1.yearFilter === state2.yearFilter &&
    state1.monthFilter === state2.monthFilter &&
    state1.page === state2.page
  );
  
  // Compare array fields
  const arrayFieldsMatch = (
    JSON.stringify(state1.quoteTypes) === JSON.stringify(state2.quoteTypes) &&
    JSON.stringify(state1.trainingTypes) === JSON.stringify(state2.trainingTypes)
  );
  
  return primitiveFieldsMatch && arrayFieldsMatch;
}

// ============= STACK OPERATIONS =============

/**
 * Push current state to stack (called AFTER successful load)
 * Debounced to avoid pushing intermediate typing states
 */
export function pushState() {
  const state = captureCurrentState();
  
  // Clear any pending push
  clearTimeout(pushTimeout);
  
  // Store the pending state
  pendingState = state;
  
  // Schedule the actual push after debounce period
  pushTimeout = setTimeout(() => {
    // Don't push if identical to top of stack (prevents double-push)
    if (historyStack.length > 0) {
      const topState = historyStack[historyStack.length - 1];
      if (statesAreEqual(pendingState, topState)) {
        console.log('⏭️ Skipping duplicate state push');
        return;
      }
    }
    
    historyStack.push(pendingState);
    console.log('✅ Pushed state to stack. Size:', historyStack.length);
    
    // Limit size
    if (historyStack.length > MAX_HISTORY_SIZE) {
      historyStack.shift();
    }
    
    updateBackButton();
  }, PUSH_DEBOUNCE_MS);
  
  console.log('⏱️ Scheduled state push (debounced', PUSH_DEBOUNCE_MS, 'ms)');
}

/**
 * Go back: Pop current, pop previous, execute previous
 */
export async function goBack(callbacks) {
  if (historyStack.length <= 1) {
    console.log('❌ Cannot go back - only', historyStack.length, 'state(s) in stack');
    return false;
  }
  
  // Pop current state (discard)
  historyStack.pop();
  console.log('⬅️ Popped current state. Stack size:', historyStack.length);
  
  // Pop previous state (restore this one)
  const previousState = historyStack.pop();
  console.log('📖 Restoring previous state:', previousState);
  
  // Restore it (which will push it again when load completes)
  await restoreState(previousState, callbacks);
  
  return true;
}

// ============= STATE RESTORATION =============

/**
 * Restore view if different from current
 * @param {Object} state - State to restore
 * @param {Object} callbacks - Callback functions
 */
function restoreView(state, callbacks) {
  const currentView = getCurrentView();
  if (state.view !== currentView && callbacks.switchView) {
    callbacks.switchView(state.view);
  }
}

/**
 * Restore note type filter if different
 * @param {Object} state - State to restore
 * @param {Object} callbacks - Callback functions
 */
function restoreNoteType(state, callbacks) {
  if (window.currentNoteTypeFilter !== state.noteType) {
    // Update the variable
    if (callbacks.setNoteTypeFilter) {
      callbacks.setNoteTypeFilter(state.noteType);
    }
    
    // Update menu UI state
    document.querySelectorAll('.note-type-filter').forEach(btn => {
      const isActive = btn.dataset.noteType === state.noteType;
      btn.classList.toggle('active', isActive);
    });
  }
}

/**
 * Restore all search fields
 * @param {Object} state - State to restore
 */
function restoreSearchFields(state) {
  setElementValueSafe(FILTER_IDS.SEARCH_ANY, state.searchAny);
  setElementValueSafe(FILTER_IDS.SEARCH_QUOTE, state.searchText);
  setElementValueSafe(FILTER_IDS.SEARCH_TAGS, state.tagsSearch);
  setElementValueSafe(FILTER_IDS.SEARCH_AUTHOR, state.authorSearch);
  setElementValueSafe(FILTER_IDS.SEARCH_SOURCE, state.sourceSearch);
  setElementValueSafe(FILTER_IDS.SEARCH_SCORE, state.searchScore);
}

/**
 * Restore filter fields
 * @param {Object} state - State to restore
 */
function restoreFilters(state) {
  setElementValueSafe(FILTER_IDS.YEAR_FILTER, state.yearFilter);
  setElementValueSafe(FILTER_IDS.MONTH_FILTER, state.monthFilter);
}

/**
 * Restore checkbox states
 * @param {Object} state - State to restore
 */
function restoreCheckboxes(state) {
  setCheckboxStates(SELECTORS.quoteCheckboxes, state.quoteTypes);
  setCheckboxStates(SELECTORS.trainingCheckboxes, state.trainingTypes);
}

/**
 * Reload data for the current view
 * @param {Object} state - State to restore
 * @param {Object} callbacks - Callback functions
 */
async function reloadViewData(state, callbacks) {
  if (state.view === 'quotes' && callbacks.loadQuotes) {
    await callbacks.loadQuotes();
  } else if (state.view === 'authors' && callbacks.loadAuthors) {
    await callbacks.loadAuthors();
  } else if (state.view === 'sources' && callbacks.loadSources) {
    await callbacks.loadSources();
  } else if (state.view === 'tags' && callbacks.loadTags) {
    await callbacks.loadTags();
  }
}

/**
 * Restore scroll position after delay
 * @param {number} scrollY - Y scroll position
 */
function restoreScrollPosition(scrollY) {
  setTimeout(() => {
    window.scrollTo(0, scrollY);
  }, SCROLL_RESTORE_DELAY_MS);
}

/**
 * Restore a complete application state
 * @param {Object} state - State to restore
 * @param {Object} callbacks - Callback functions
 */
async function restoreState(state, callbacks) {
  console.log('🔄 Restoring state:', {
    view: state.view,
    noteType: state.noteType,
    search: state.searchText,
    page: state.page
  });
  
  try {
    // 1. Restore view
    restoreView(state, callbacks);
    
    // 2. Restore note type filter
    restoreNoteType(state, callbacks);
    
    // 3. Restore search fields
    restoreSearchFields(state);
    
    // 4. Restore filters
    restoreFilters(state);
    
    // 5. Restore checkboxes
    restoreCheckboxes(state);
    
    // 6. Restore page
    if (callbacks.setCurrentPage) {
      callbacks.setCurrentPage(state.page);
    }
    
    // 7. Reload data (which will push this state again)
    await reloadViewData(state, callbacks);
    
    // 8. Restore scroll position
    restoreScrollPosition(state.scrollY);
    
    console.log('✅ State restored successfully');
  } catch (error) {
    console.error('❌ Error restoring state:', error);
  }
}

// ============= UI UPDATES =============

function updateBackButton() {
  const backButton = getElementByIdSafe(BUTTON_IDS.BACK_BTN, 'updateBackButton');
  if (!backButton) return;
  
  const canGoBack = historyStack.length > 1;
  backButton.disabled = !canGoBack;
  
  console.log('🔄 Back button:', canGoBack ? 'ENABLED' : 'DISABLED', '| Stack:', historyStack.length);
}

/**
 * Initialize back button event handler
 */
export function initializeBackButton(callbacks) {
  const backButton = getElementByIdSafe(BUTTON_IDS.BACK_BTN, 'initializeBackButton');
  if (!backButton) {
    console.warn('⚠️ Back button not found in DOM');
    return;
  }
  
  backButton.addEventListener('click', () => {
    goBack(callbacks);
  });
  
  // Initial state
  updateBackButton();
  
  console.log('✅ Back button initialized');
}
