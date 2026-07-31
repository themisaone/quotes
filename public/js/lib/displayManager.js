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

import { API_URL, fetchWithRetry } from './api.js?v=20260510apiorigin';
import { createQuoteCard } from './cardRenderer.js?v=20260731listmetadata2';
import { getSearchValues, getTrainingFilters } from './searchManager.js?v=20260614searchany1';
import { 
  FILTER_IDS,
  CONTAINER_IDS,
  CSS_CLASSES,
  getElementValue,
  getCheckboxState,
  getElementByIdSafe,
  getCheckedValues
} from '../constants.js';
import { getNoteTypeConfig, hasDateField, hasGenericSubTypeField } from './noteTypes.js';
import { updateResultsSummary } from './resultSummary.js?v=20260731resultsummary5';

// ============= MODULE STATE =============

let currentQuotesData = []; // Store for PDF export
let currentPage = 1;
let quotesPerPage = 20;

/** Override the page size (e.g. use a smaller value for list-pane mode). */
export function setQuotesPerPage(n) {
  quotesPerPage = n;
  currentPage = 1; // reset to page 1 when page size changes
}

// ============= CONFIGURATION =============

/**
 * Metadata search filter configuration
 * Each filter has a checkbox and a condition dropdown
 * Now using constants for IDs
 */
const METADATA_FILTERS = [
  { name: 'Author', checkboxId: FILTER_IDS.HAS_AUTHOR_CHECKBOX, conditionId: FILTER_IDS.HAS_AUTHOR_CONDITION, paramName: 'hasAuthor' },
  { name: 'Source', checkboxId: FILTER_IDS.HAS_SOURCE_CHECKBOX, conditionId: FILTER_IDS.HAS_SOURCE_CONDITION, paramName: 'hasSource' },
  { name: 'Note', checkboxId: FILTER_IDS.HAS_NOTE_CHECKBOX, conditionId: FILTER_IDS.HAS_NOTE_CONDITION, paramName: 'hasNote' },
  { name: 'Tags', checkboxId: FILTER_IDS.HAS_TAGS_CHECKBOX, conditionId: FILTER_IDS.HAS_TAGS_CONDITION, paramName: 'hasTags' },
  { name: 'Attachment', checkboxId: FILTER_IDS.HAS_IMAGE_CHECKBOX, conditionId: FILTER_IDS.HAS_IMAGE_CONDITION, paramName: 'hasImage' },
  { name: 'ImageType', checkboxId: FILTER_IDS.HAS_IMAGE_TYPE_CHECKBOX, conditionId: FILTER_IDS.HAS_IMAGE_TYPE_CONDITION, paramName: 'hasImageType' },
  { name: 'TranslationGroup', checkboxId: FILTER_IDS.HAS_TRANSLATION_GROUP_CHECKBOX, conditionId: FILTER_IDS.HAS_TRANSLATION_GROUP_CONDITION, paramName: 'hasTranslationGroup' },
  { name: 'MultipleAttachments', checkboxId: FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CHECKBOX, conditionId: FILTER_IDS.HAS_MULTIPLE_ATTACHMENTS_CONDITION, paramName: 'hasMultipleAttachments' },
  { name: 'Title', checkboxId: FILTER_IDS.HAS_TITLE_CHECKBOX, conditionId: FILTER_IDS.HAS_TITLE_CONDITION, paramName: 'hasTitle' },
  { name: 'Text', checkboxId: FILTER_IDS.HAS_TEXT_CHECKBOX, conditionId: FILTER_IDS.HAS_TEXT_CONDITION, paramName: 'hasText' }
];

// ============= HELPER FUNCTIONS =============

/**
 * Get value from input element if it exists and is not empty
 * @deprecated Use getElementValue from constants.js instead
 */
function getInputValue(elementId) {
  return getElementValue(elementId) || null;
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
function addSearchFilters(params, globalSettings) {
  const searchValues = getSearchValues();
  
  if (searchValues.any) params.append('any', searchValues.any);
  if (searchValues.quote) params.append('quote', searchValues.quote);
  if (searchValues.author) params.append('author', searchValues.author);
  if (searchValues.source) params.append('source', searchValues.source);
  if (searchValues.tags) params.append('tags', searchValues.tags);
  if (searchValues.score) params.append('score', searchValues.score);
  if (searchValues.noteId && !isNaN(parseInt(searchValues.noteId))) params.append('noteId', searchValues.noteId.trim());

  if (globalSettings?.hideEncryptedNotes) params.append('hideEncryptedNotes', 'true');
  if (globalSettings?.hideNotesWithTag && globalSettings?.hideTagName) {
    params.append('hideTag', globalSettings.hideTagName.trim());
  }
}

/**
 * Add quote type filters to params (Quote view only)
 */
function addQuoteTypeFilters(params, currentNoteTypeFilter, getQuoteTypes) {
  const quoteTypes = getQuoteTypes();
  const totalTypes = quoteTypes.length;

  let selectedTypes;
  if (currentNoteTypeFilter === 'quote') {
    // Quote view: read from the quote-specific dropdown
    selectedTypes = getSelectedCheckboxValues('.type-filter-options input[type="checkbox"]');
  } else {
    return;
  }

  // Only add filter if some (but not all) types are selected
  if (selectedTypes.length > 0 && selectedTypes.length < totalTypes) {
    params.append("types", selectedTypes.join(","));
  }
}

/**
 * Add training type filters to params (Training view only)
 */
function addTrainingTypeFilters(params, currentNoteTypeFilter, getTrainingTypes) {
  const isDateBehavior = currentNoteTypeFilter && hasDateField(currentNoteTypeFilter);
  if (!isDateBehavior) {
    return;
  }

  const behavior = getNoteTypeConfig(currentNoteTypeFilter).behavior;
  const configuredTypes = typeof getTrainingTypes === 'function'
    ? getTrainingTypes(currentNoteTypeFilter)
    : [];
  const selectedTrainingTypes = configuredTypes.length > 0
    ? getSelectedCheckboxValues('.training-type-filter-options input[type="checkbox"]')
    : [];

  if (selectedTrainingTypes.length > 0 && selectedTrainingTypes.length < configuredTypes.length) {
    params.append("training_types", selectedTrainingTypes.join(","));
  }

  const trainingFilters = getTrainingFilters();
  if (behavior === 'diary' && trainingFilters.year) {
    const year = parseInt(trainingFilters.year, 10);
    const month = parseInt(trainingFilters.month, 10);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      const mm = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      params.append("dateFrom", `${year}-${mm}-01`);
      params.append("dateTo", `${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
    } else if (Number.isFinite(year)) {
      params.append("dateFrom", `${year}-01-01`);
      params.append("dateTo", `${year}-12-31`);
    }
  } else {
    if (trainingFilters.year) params.append("year", trainingFilters.year);
    if (trainingFilters.month && trainingFilters.year) params.append("month", trainingFilters.month);
  }
}

/**
 * Add metadata search filters to params (has/doesn't have author, source, etc.)
 * Now using constants for element IDs
 */
function addMetadataFilters(params) {
  METADATA_FILTERS.forEach(filter => {
    if (getCheckboxState(filter.checkboxId)) {
      const condition = getElementValue(filter.conditionId);
      params.append(filter.paramName, condition === "has" ? "true" : "false");
    }
  });
}

/**
 * Add generic sub-type filters when viewing a generic type that has configured sub-types.
 */
function addGenericSubTypeFilters(params, currentNoteTypeFilter) {
  if (!currentNoteTypeFilter || !hasGenericSubTypeField(currentNoteTypeFilter)) return;

  const checkboxes = document.querySelectorAll('.generic-subtype-filter-options input[type="checkbox"]');
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.type);
  if (selected.length > 0) {
    params.append('generic_sub_types', selected.join(','));
  }
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
function buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings) {
  const params = new URLSearchParams();
  
  addSearchFilters(params, globalSettings);
  
  if (currentNoteTypeFilter) {
    params.append("note_type", currentNoteTypeFilter);
  }
  
  addQuoteTypeFilters(params, currentNoteTypeFilter, getQuoteTypes);
  addTrainingTypeFilters(params, currentNoteTypeFilter, getTrainingTypes);
  addGenericSubTypeFilters(params, currentNoteTypeFilter);
  addMetadataFilters(params);
  addPaginationParams(params);
  return params;
}

/**
 * Build URL parameters for export (same as display but without pagination limit)
 */
export function buildExportParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, limit = 10000, globalSettings) {
  const params = new URLSearchParams();
  addSearchFilters(params, globalSettings);
  if (currentNoteTypeFilter) params.append("note_type", currentNoteTypeFilter);
  addQuoteTypeFilters(params, currentNoteTypeFilter, getQuoteTypes);
  addTrainingTypeFilters(params, currentNoteTypeFilter, getTrainingTypes);
  addGenericSubTypeFilters(params, currentNoteTypeFilter);
  addMetadataFilters(params);
  params.append("limit", String(limit));
  return params;
}

/**
 * Load quotes from API and return them
 * Note: Does NOT render quotes - caller should call displayQuotes with the result
 */
export async function loadQuotes(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings) {
  const quotesList = getElementByIdSafe(CONTAINER_IDS.QUOTES_CONTAINER, 'loadQuotes');
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings);
    updateResultsSummary(params);
    const response = await fetchWithRetry(`${API_URL}/quotes?${params.toString()}`);
    const quotes = await response.json();
    currentQuotesData = quotes;
    await loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings);
    
    return quotes; // Return quotes for caller to display
  } catch (error) {
    console.error("Error loading quotes:", error);
    if (window.showFetchError) window.showFetchError(error.message || 'Failed to load notes');
    if (quotesList) {
      quotesList.innerHTML = '<div class="no-quotes">Failed to load notes. Please try again.</div>';
    }
    return []; // Return empty array on error
  }
}

/**
 * Load and update total count with filters
 */
export async function loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings) {
  const totalCountElement = getElementByIdSafe("totalQuotesCount", 'loadTotalCount');
  const typeCountElement = getElementByIdSafe("typeQuotesCount", 'loadTotalCount');
  const filteredCountElement = getElementByIdSafe("filteredQuotesCount", 'loadTotalCount');
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes, globalSettings);
    updateResultsSummary(params);
    
    const response = await fetchWithRetry(`${API_URL}/quotes/count?${params.toString()}`);
    const data = await response.json();
    const grandTotal = data.grandTotal ?? 0;
    const headerTotal = currentNoteTypeFilter ? (data.typeTotal ?? 0) : grandTotal;
    
    if (totalCountElement) totalCountElement.textContent = grandTotal;
    if (typeCountElement) typeCountElement.textContent = headerTotal;
    if (filteredCountElement) filteredCountElement.textContent = data.count ?? 0;


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
  const quotesList = getElementByIdSafe(CONTAINER_IDS.QUOTES_CONTAINER, 'displayQuotes');
  const quoteCount = getElementByIdSafe('quoteCount', 'displayQuotes');
  
  if (quoteCount) {
    quoteCount.textContent = String(quotes.length);
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
