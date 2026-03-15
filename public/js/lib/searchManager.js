/**
 * ============================================================================
 * SEARCH MANAGER
 * ============================================================================
 * Manages all search-related functionality including text filters, 
 * year/month filters, and filterBy helper functions.
 * 
 * Main functions:
 * - initializeSearchHandlers() - Setup all search event listeners
 * - getSearchValues() - Get current search input values
 * - getTrainingFilters() - Get year/month filter values
 * - filterByAuthor() - Filter quotes by author (card click handler)
 * - filterBySource() - Filter quotes by source (card click handler)
 * - clearSearchFields() - Reset all search inputs
 * 
 * Dependencies:
 * - Requires API_URL on window.API_URL
 * - Requires callbacks: loadQuotes, loadTotalCount, setCurrentPage, switchView
 */

// Import constants for consistent IDs
import { 
  FILTER_IDS, 
  CONTAINER_IDS,
  getElementValue,
  setElementValue,
  getElementByIdSafe
} from '../constants.js';

// ============= CONSTANTS =============

const DEBOUNCE_DELAY_MS = 300;
const VIEW_SWITCH_DELAY_MS = 50;

// Using constants from constants.js instead of hardcoded IDs
const SEARCH_INPUT_IDS = [
  FILTER_IDS.SEARCH_QUOTE,
  FILTER_IDS.SEARCH_AUTHOR,
  FILTER_IDS.SEARCH_SOURCE,
  FILTER_IDS.SEARCH_TAGS,
  FILTER_IDS.SEARCH_SCORE
];

const SEARCH_FIELD_IDS = [
  ...SEARCH_INPUT_IDS,
  FILTER_IDS.SEARCH_TAGS
];

// ============= STATE =============

let searchTimeout = null;
let callbacks = {};

// ============= YEAR/MONTH FILTERS =============

/**
 * Create an option element for the year dropdown
 */
function createYearOption(year) {
  const option = document.createElement('option');
  option.value = year;
  option.textContent = year;
  return option;
}

/**
 * Populate training years dropdown from API
 */
async function populateTrainingYears() {
  try {
    const yearSelect = getElementByIdSafe(FILTER_IDS.YEAR_FILTER, 'populateTrainingYears');
    if (!yearSelect) {
      return;
    }
    
    // Check if already populated (has more than just "All Years" option)
    if (yearSelect.options.length > 1) {
      console.log("✅ Training years already populated, skipping");
      return;
    }
    
    console.log("🗓️ Populating training years...");
    const response = await fetch(`${window.API_URL}/quotes/training-years`);
    const data = await response.json();
    console.log("🗓️ Training years data:", data);
    
    if (!data.years || data.years.length === 0) {
      console.log("⚠️ No years data received");
      return;
    }
    
    // Keep the "All Years" option and add years
    // Don't reset innerHTML to avoid focus loss
    const currentFirstOption = yearSelect.options[0];
    
    // Add years in descending order (newest first)
    data.years
      .sort((a, b) => b - a)
      .forEach(year => {
        yearSelect.appendChild(createYearOption(year));
      });
    
    console.log(`✅ Populated ${data.years.length} years`);
  } catch (error) {
    console.error("❌ Error populating training years:", error);
  }
}

/**
 * Toggle month filter enabled/disabled based on year selection
 */
function updateMonthFilterState(yearValue, monthFilter) {
  if (!monthFilter) return;
  
  if (yearValue) {
    monthFilter.disabled = false;
  } else {
    monthFilter.disabled = true;
    monthFilter.value = '';
  }
}

/**
 * Setup year filter event handlers
 */
function setupYearFilter() {
  const trainingYearFilter = getElementByIdSafe(FILTER_IDS.YEAR_FILTER, 'setupYearFilter');
  const trainingMonthFilter = getElementByIdSafe(FILTER_IDS.MONTH_FILTER, 'setupYearFilter');

  if (!trainingYearFilter) return;

  // Lazy load years on focus
  // Populate years on first focus (lazy loading)
  trainingYearFilter.addEventListener('focus', async () => {
    // Only populate if not already populated (more than just "All Years")
    if (trainingYearFilter.options.length <= 1) {
      await populateTrainingYears();
    }
  });

  // Enable/disable month filter and reload on change
  trainingYearFilter.addEventListener('change', () => {
    updateMonthFilterState(trainingYearFilter.value, trainingMonthFilter);
    reloadQuotesWithCounts();
  });
}

/**
 * Setup month filter event handlers
 */
function setupMonthFilter() {
  const trainingMonthFilter = getElementByIdSafe(FILTER_IDS.MONTH_FILTER, 'setupMonthFilter');

  if (!trainingMonthFilter) return;

  trainingMonthFilter.addEventListener('change', reloadQuotesWithCounts);
}

// ============= TEXT SEARCH =============

/**
 * Reload quotes and counts (helper to avoid repetition)
 */
function reloadQuotesWithCounts() {
  callbacks.loadQuotes();
  callbacks.loadTotalCount();
}

/**
 * Debounced search - triggers loadQuotes after a delay
 */
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (callbacks.setCurrentPage) {
      callbacks.setCurrentPage(1); // Reset to first page when searching
    }
    callbacks.loadQuotes();
  }, DEBOUNCE_DELAY_MS);
}

/**
 * Setup text search input event handlers
 */
function setupTextSearchInputs() {
  SEARCH_INPUT_IDS.forEach(id => {
    const element = getElementByIdSafe(id, 'setupTextSearchInputs');
    if (element) {
      element.addEventListener('input', debounceSearch);
    }
  });
}

// ============= FILTER BY HELPERS =============

/**
 * Apply a filter by switching views and setting the filter field
 * @param {string} viewName - View to switch to (e.g., "quotes")
 * @param {string} filterFieldId - ID of the filter input field
 * @param {string} filterValue - Value to set in the filter field
 * @param {string} logContext - Context for logging (e.g., "author", "source")
 */
function applyFilterAndSwitchView(viewName, filterFieldId, filterValue, logContext) {
  console.log(`Filtering by ${logContext}:`, filterValue);
  
  // Switch to quotes view
  if (callbacks.switchView) {
    callbacks.switchView(viewName);
  }
  
  // Clear other filters
  clearOtherFilters(filterFieldId);
  
  // Set target filter
  const filterField = getElementByIdSafe(filterFieldId, 'activateFilter');
  if (filterField) {
    filterField.value = filterValue;
  }
  
  console.log(`${logContext} field value:`, filterField?.value);
  
  // Reset pagination
  if (callbacks.setCurrentPage) {
    callbacks.setCurrentPage(1);
  }
  
  // Small delay to ensure view switch completes
  setTimeout(() => {
    console.log(`Loading quotes for ${logContext}:`, filterValue);
    callbacks.loadQuotes();
  }, VIEW_SWITCH_DELAY_MS);

  // Update active menu item
  updateMenuActiveState(viewName);
}

/**
 * Filter by author - switches to quotes view and applies author filter
 * @param {string} authorName - Author name to filter by
 */
export function filterByAuthor(authorName) {
  applyFilterAndSwitchView("quotes", "searchAuthor", authorName, "author");
}

/**
 * Filter by source - switches to quotes view and applies source filter
 * @param {string} sourceName - Source name to filter by
 */
export function filterBySource(sourceName) {
  applyFilterAndSwitchView("quotes", "searchSource", sourceName, "source");
}

/**
 * Clear all search filters except the specified one
 * @param {string} keepField - ID of the field to keep
 */
function clearOtherFilters(keepField) {
  SEARCH_FIELD_IDS.forEach(id => {
    if (id !== keepField) {
      const element = getElementByIdSafe(id, 'clearOtherFilters');
      if (element) {
        element.value = "";
      }
    }
  });
}

/**
 * Update menu active state
 * @param {string} view - View name to activate
 */
function updateMenuActiveState(view) {
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.view === view) {
      item.classList.add("active");
    }
  });
}

/**
 * Get value from input element, or empty string if not found
 * @param {string} elementId - ID of the input element
 * @returns {string} Value or empty string
 */
function getInputValue(elementId) {
  return getElementByIdSafe(elementId, 'getInputValue')?.value || "";
}

/**
 * Get current search values from all search inputs
 * @returns {Object} Object with all search values
 */
export function getSearchValues() {
  return {
    quote: getInputValue("searchQuote"),
    author: getInputValue("searchAuthor"),
    source: getInputValue("searchSource"),
    tags: getInputValue("searchTags"),
    score: getInputValue("searchScore")
  };
}

/**
 * Get training filter values (year/month)
 * @returns {Object} Object with year and month values
 */
export function getTrainingFilters() {
  return {
    year: getElementValue(FILTER_IDS.YEAR_FILTER),
    month: getElementValue(FILTER_IDS.MONTH_FILTER)
  };
}

/**
 * Clear a single input field by ID
 * @param {string} elementId - ID of the element to clear
 */
function clearInputField(elementId) {
  const element = getElementByIdSafe(elementId, 'clearInputField');
  if (element) {
    element.value = "";
  }
}

/**
 * Clear all search fields
 */
export function clearSearchFields() {
  // Clear search inputs
  SEARCH_FIELD_IDS.forEach(clearInputField);

  // Clear year/month filters using constants
  setElementValue(FILTER_IDS.YEAR_FILTER, '');
  
  const monthFilter = getElementByIdSafe(FILTER_IDS.MONTH_FILTER, 'clearSearchFields');
  if (monthFilter) {
    monthFilter.value = "";
    monthFilter.disabled = true;
  }
}

// ============= INITIALIZATION =============

/**
 * Initialize all search-related event handlers
 * @param {Object} callbacks - { loadQuotes, loadTotalCount, setCurrentPage, switchView }
 */
export function initializeSearchHandlers(callbacksParam) {
  callbacks = callbacksParam;
  
  setupTextSearchInputs();
  setupYearFilter();
  setupMonthFilter();
  
  console.log("✅ Search handlers initialized");
}

/**
 * Make filterBy functions globally available for onclick handlers
 */
export function registerGlobalSearchFunctions() {
  window.filterByAuthor = filterByAuthor;
  window.filterBySource = filterBySource;
  window.debounceSearch = debounceSearch;
}
