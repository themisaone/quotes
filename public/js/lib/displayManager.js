/**
 * displayManager.js
 * 
 * Main quotes/notes display and list management
 * Handles loading, filtering, pagination, and rendering the main list view
 * 
 * Main functions:
 * - loadQuotes() - Load and display quotes with current filters
 * - displayQuotes() - Render quotes list
 * - loadTotalCount() - Update counters
 * 
 * Dependencies:
 * - api.js for API_URL and fetchWithRetry
 * - cardRenderer.js for createQuoteCard
 */

import { API_URL, fetchWithRetry } from './api.js';
import { createQuoteCard } from './cardRenderer.js';

// ============= MODULE STATE =============

let currentQuotesData = []; // Store for PDF export
let currentPage = 1;
const quotesPerPage = 20;

// ============= CONFIGURATION =============

/**
 * Metadata search filter configuration
 * Each filter has a checkbox and a condition dropdown
 */
const METADATA_FILTERS = [
  { name: 'Author', checkboxId: 'searchHasAuthor', conditionId: 'searchAuthorCondition', paramName: 'hasAuthor' },
  { name: 'Source', checkboxId: 'searchHasSource', conditionId: 'searchSourceCondition', paramName: 'hasSource' },
  { name: 'Note', checkboxId: 'searchHasNote', conditionId: 'searchNoteCondition', paramName: 'hasNote' },
  { name: 'Tags', checkboxId: 'searchHasTags', conditionId: 'searchTagsCondition', paramName: 'hasTags' },
  { name: 'Image', checkboxId: 'searchHasImage', conditionId: 'searchImageCondition', paramName: 'hasImage' }
];

// ============= HELPER FUNCTIONS =============

/**
 * Get value from input element if it exists and is not empty
 */
function getInputValue(elementId) {
  const element = document.getElementById(elementId);
  return element?.value || null;
}

/**
 * Get selected values from checkboxes
 */
function getSelectedCheckboxValues(selector) {
  const selected = [];
  const checkboxes = document.querySelectorAll(selector);
  checkboxes.forEach(checkbox => {
    if (checkbox.checked) {
      selected.push(checkbox.dataset.type);
    }
  });
  return selected;
}

/**
 * Add basic search filters to params
 */
function addSearchFilters(params) {
  const searchFields = [
    { id: 'searchQuote', param: 'quote' },
    { id: 'searchAuthor', param: 'author' },
    { id: 'searchSource', param: 'source' },
    { id: 'searchTags', param: 'tags' },
    { id: 'searchScore', param: 'score' }
  ];
  
  searchFields.forEach(field => {
    const value = getInputValue(field.id);
    if (value) params.append(field.param, value);
  });
}

/**
 * Add quote type filters to params (for Quote view or All Notes view)
 */
function addQuoteTypeFilters(params, currentNoteTypeFilter, getQuoteTypes) {
  if (currentNoteTypeFilter !== null && currentNoteTypeFilter !== 'quote') {
    return;
  }
  
  const selectedTypes = getSelectedCheckboxValues('.type-filter-options input[type="checkbox"]');
  const quoteTypes = getQuoteTypes();
  const totalTypes = quoteTypes.length;
  
  // Only add filter if some (but not all) types are selected
  if (selectedTypes.length > 0 && selectedTypes.length < totalTypes) {
    params.append("types", selectedTypes.join(","));
  }
}

/**
 * Add training type filters to params (for Training view)
 */
function addTrainingTypeFilters(params, currentNoteTypeFilter) {
  if (currentNoteTypeFilter !== 'training') {
    return;
  }
  
  const selectedTrainingTypes = getSelectedCheckboxValues('.training-type-filter-options input[type="checkbox"]');
  
  if (selectedTrainingTypes.length > 0) {
    params.append("training_types", selectedTrainingTypes.join(","));
  }
  
  // Year and month filters
  const yearFilter = getInputValue('trainingYearFilter');
  const monthFilter = getInputValue('trainingMonthFilter');
  
  if (yearFilter) params.append("year", yearFilter);
  if (monthFilter && yearFilter) params.append("month", monthFilter);
}

/**
 * Add metadata search filters to params (has/doesn't have author, source, etc.)
 */
function addMetadataFilters(params) {
  METADATA_FILTERS.forEach(filter => {
    const checkbox = document.getElementById(filter.checkboxId);
    if (checkbox?.checked) {
      const condition = document.getElementById(filter.conditionId)?.value;
      params.append(filter.paramName, condition === "has" ? "true" : "false");
    }
  });
}

/**
 * Add pagination parameters
 */
function addPaginationParams(params) {
  const offset = (currentPage - 1) * quotesPerPage;
  params.append("limit", quotesPerPage);
  params.append("offset", offset);
}

// ============= MAIN FUNCTIONS =============

/**
 * Build URL parameters for quotes API based on current filters
 */
function buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const params = new URLSearchParams();
  
  addSearchFilters(params);
  
  if (currentNoteTypeFilter) {
    params.append("note_type", currentNoteTypeFilter);
  }
  
  addQuoteTypeFilters(params, currentNoteTypeFilter, getQuoteTypes);
  addTrainingTypeFilters(params, currentNoteTypeFilter);
  addMetadataFilters(params);
  addPaginationParams(params);
  
  return params;
}
/**
 * Load quotes from API and return them
 * Note: Does NOT render quotes - caller should call displayQuotes with the result
 */
export async function loadQuotes(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings) {
  const quotesList = document.getElementById("quotesList");
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    const response = await fetchWithRetry(`${API_URL}/quotes?${params.toString()}`);
    const quotes = await response.json();

    currentQuotesData = quotes;
    await loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    
    return quotes; // Return quotes for caller to display
  } catch (error) {
    console.error("Error loading quotes:", error);
    if (quotesList) {
      quotesList.innerHTML = '<div class="no-quotes">Failed to load quotes. Please try again.</div>';
    }
    return []; // Return empty array on error
  }
}

/**
 * Load and update total count with filters
 */
export async function loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const totalCountElement = document.getElementById("totalQuotesCount");
  const typeCountElement = document.getElementById("typeQuotesCount");
  const filteredCountElement = document.getElementById("filteredQuotesCount");
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    
    const response = await fetchWithRetry(`${API_URL}/quotes/count?${params.toString()}`);
    const data = await response.json();
    
    if (totalCountElement) totalCountElement.textContent = data.grandTotal || 0;
    if (typeCountElement) typeCountElement.textContent = data.typeTotal || 0;
    if (filteredCountElement) filteredCountElement.textContent = data.count || 0;
  } catch (error) {
    console.error("Error loading count:", error);
    if (totalCountElement) totalCountElement.textContent = "?";
    if (typeCountElement) typeCountElement.textContent = "?";
    if (filteredCountElement) filteredCountElement.textContent = "?";
  }
}

/**
 * Display quotes in the list
 */
export function displayQuotes(quotes, currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings) {
  const quotesList = document.getElementById("quotesList");
  const quoteCount = document.getElementById("quoteCount");
  
  if (quoteCount) {
    quoteCount.textContent = `(${quotes.length})`;
  }

  if (!quotesList) {
    console.error("quotesList element not found");
    return;
  }

  if (quotes.length === 0) {
    quotesList.innerHTML = '<div class="no-quotes">No notes found.</div>';
    return;
  }

  quotesList.innerHTML = quotes
    .map(quote => createQuoteCard(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings))
    .join("");
}

/**
 * Get current quotes data (for PDF export)
 */
export function getCurrentQuotesData() {
  return currentQuotesData;
}

/**
 * Get/Set current page
 */
export function getCurrentPage() {
  return currentPage;
}

export function setCurrentPage(page) {
  currentPage = page;
}

export function getQuotesPerPage() {
  return quotesPerPage;
}
