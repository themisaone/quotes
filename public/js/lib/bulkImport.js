/**
 * ============================================================================
 * Bulk Import Module
 * ============================================================================
 * Handles bulk import functionality for adding multiple quotes at once.
 * 
 * Features:
 * - Modal management (open/close)
 * - Quote parsing (split by separator)
 * - Batch submission with progress tracking
 * - Error handling and user feedback
 */

import { getElementByIdSafe } from '../constants.js';

// ============================================
// Constants
// ============================================

const QUOTE_SEPARATOR = /\n---\n/;
const PROGRESS_UPDATE_INTERVAL = 1; // Update button after each quote

// DOM Element IDs
const ELEMENT_IDS = {
  MODAL: 'bulkModal',
  FORM: 'bulkForm',
  AUTHOR_INPUT: 'bulkAuthor',
  SOURCE_INPUT: 'bulkSource',
  QUOTES_INPUT: 'bulkQuotes',
  AUTHOR_SUGGESTIONS: 'bulkAuthorSuggestions',
  SOURCE_SUGGESTIONS: 'bulkSourceSuggestions',
  SOURCE_TYPE: 'bulkSourceType',
  ADD_BUTTON: 'addBulkBtn',
  ADD_BUTTON_TABLET: 'addBulkBtnTablet',
  CANCEL_BUTTON: 'cancelBulkBtn'
};

// CSS Selectors
const SELECTORS = {
  CLOSE_BUTTON: '.close-bulk',
  SUBMIT_BUTTON: 'button[type="submit"]'
};

// Messages
const MESSAGES = {
  NO_AUTHOR: 'Please enter an author name.',
  NO_QUOTES: 'Please paste some quotes.',
  NO_QUOTES_FOUND: 'No quotes found. Make sure to separate quotes with --- on its own line.',
  IMPORT_FAILED: 'Failed to add quotes. Please try again.',
  ELEMENTS_NOT_FOUND: 'Bulk import elements not found in DOM',
  NOT_INITIALIZED: 'Bulk import modal elements not initialized'
};

// Button text
const BUTTON_TEXT = {
  ADDING: 'Adding quotes...',
  PROGRESS: (current, total) => `Adding quotes... (${current}/${total})`
};

// Result messages
const RESULT_MESSAGES = {
  ALL_SUCCESS: (count) => `✅ Successfully added all ${count} quotes!`,
  PARTIAL_SUCCESS: (success, failed) => `Added ${success} quotes. ${failed} failed.`
};

// API Configuration
const API_CONFIG = {
  ENDPOINT: '/quotes',
  METHOD: 'POST',
  HEADERS: { 'Content-Type': 'application/json' }
};

// ============================================
// DOM Elements (initialized on module load)
// ============================================

let bulkModal;
let bulkForm;
let bulkAuthorInput;
let bulkSourceInput;
let bulkQuotesInput;
let bulkAuthorSuggestions;
let bulkSourceSuggestions;

// ============================================
// Initialization
// ============================================

/**
 * Initialize bulk import DOM elements and event listeners
 * @param {Object} callbacks - App-specific callback functions
 * @param {Function} callbacks.onSuccess - Called after successful import
 * @param {Function} callbacks.onError - Called on import error
 * @returns {boolean} Success status of initialization
 */
export function initializeBulkImport(callbacks = {}) {
  // Get DOM elements
  initializeDOMElements();

  if (!bulkModal || !bulkForm) {
    console.warn(MESSAGES.ELEMENTS_NOT_FOUND);
    return false;
  }

  // Setup event listeners
  setupEventListeners(callbacks);

  return true;
}

/**
 * Initialize all DOM element references
 */
function initializeDOMElements() {
  bulkModal = getElementByIdSafe(ELEMENT_IDS.MODAL);
  bulkForm = getElementByIdSafe(ELEMENT_IDS.FORM);
  bulkAuthorInput = getElementByIdSafe(ELEMENT_IDS.AUTHOR_INPUT);
  bulkSourceInput = getElementByIdSafe(ELEMENT_IDS.SOURCE_INPUT);
  bulkQuotesInput = getElementByIdSafe(ELEMENT_IDS.QUOTES_INPUT);
  bulkAuthorSuggestions = getElementByIdSafe(ELEMENT_IDS.AUTHOR_SUGGESTIONS);
  bulkSourceSuggestions = getElementByIdSafe(ELEMENT_IDS.SOURCE_SUGGESTIONS);
}

/**
 * Setup all event listeners for bulk import
 * @param {Object} callbacks - Callback functions
 */
function setupEventListeners(callbacks) {
  const addBulkBtn = getElementByIdSafe(ELEMENT_IDS.ADD_BUTTON);
  const addBulkBtnTablet = getElementByIdSafe(ELEMENT_IDS.ADD_BUTTON_TABLET);
  const closeBulkModal = document.querySelector(SELECTORS.CLOSE_BUTTON);
  const cancelBulkBtn = getElementByIdSafe(ELEMENT_IDS.CANCEL_BUTTON);

  addEventListenerIfExists(addBulkBtn, 'click', openBulkModal);
  addEventListenerIfExists(addBulkBtnTablet, 'click', openBulkModal);
  addEventListenerIfExists(closeBulkModal, 'click', closeBulkImportModal);
  addEventListenerIfExists(cancelBulkBtn, 'click', closeBulkImportModal);
  
  if (bulkForm) {
    bulkForm.addEventListener('submit', (e) => handleBulkSubmit(e, callbacks));
  }
}

/**
 * Add event listener to element if it exists
 * @param {HTMLElement|null} element - The element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
function addEventListenerIfExists(element, event, handler) {
  if (element) {
    element.addEventListener(event, handler);
  }
}

// ============================================
// Modal Management
// ============================================

/**
 * Open the bulk import modal and reset form
 */
export function openBulkModal() {
  if (!isInitialized()) {
    console.error(MESSAGES.NOT_INITIALIZED);
    return;
  }

  resetForm();
  showModal();
}

/**
 * Close the bulk import modal
 */
export function closeBulkImportModal() {
  if (!bulkModal) {
    console.error(MESSAGES.NOT_INITIALIZED);
    return;
  }
  
  hideModal();
}

/**
 * Check if modal elements are initialized
 * @returns {boolean} Initialization status
 */
function isInitialized() {
  return bulkModal && bulkForm;
}

/**
 * Reset the bulk import form
 */
function resetForm() {
  bulkForm.reset();
  clearSuggestions(bulkAuthorSuggestions);
  clearSuggestions(bulkSourceSuggestions);
}

/**
 * Show the modal
 */
function showModal() {
  bulkModal.style.display = 'block';
}

/**
 * Hide the modal
 */
function hideModal() {
  bulkModal.style.display = 'none';
}

/**
 * Clear autocomplete suggestions for an input field
 * @param {HTMLElement} suggestionsElement - The suggestions container
 */
function clearSuggestions(suggestionsElement) {
  if (suggestionsElement) {
    suggestionsElement.innerHTML = "";
    suggestionsElement.style.display = "none";
  }
}

// ============================================
// Form Submission & Processing
// ============================================

/**
 * Handle bulk import form submission
 * @param {Event} e - Form submit event
 * @param {Object} callbacks - Callback functions
 */
async function handleBulkSubmit(e, callbacks = {}) {
  e.preventDefault();

  const formData = collectBulkFormData();
  
  if (!validateAndConfirm(formData)) {
    return;
  }

  const quotes = parseQuotes(formData.quotesText);
  
  if (!hasQuotes(quotes)) {
    alert(MESSAGES.NO_QUOTES_FOUND);
    return;
  }

  await submitBulkQuotes(quotes, formData, callbacks);
}

/**
 * Validate form data and get user confirmation
 * @param {Object} formData - Form data
 * @returns {boolean} True if validated and confirmed
 */
function validateAndConfirm(formData) {
  const validation = validateBulkFormData(formData);
  if (!validation.valid) {
    alert(validation.message);
    return false;
  }

  const quotes = parseQuotes(formData.quotesText);
  const confirmMessage = buildConfirmationMessage(quotes.length, formData.author, formData.source);
  
  return confirm(confirmMessage);
}

/**
 * Check if quotes array is not empty
 * @param {Array} quotes - Array of quotes
 * @returns {boolean} True if has quotes
 */
function hasQuotes(quotes) {
  return quotes.length > 0;
}

/**
 * Collect form data from bulk import form
 * @returns {Object} Form data
 */
function collectBulkFormData() {
  return {
    author: getInputValue(bulkAuthorInput),
    source: getInputValue(bulkSourceInput),
    sourceType: getSourceTypeValue(),
    quotesText: getInputValue(bulkQuotesInput)
  };
}

/**
 * Get trimmed value from input element
 * @param {HTMLElement} input - Input element
 * @returns {string} Trimmed value
 */
function getInputValue(input) {
  return input.value.trim();
}

/**
 * Get source type dropdown value
 * @returns {string} Source type value
 */
function getSourceTypeValue() {
  return getElementByIdSafe(ELEMENT_IDS.SOURCE_TYPE).value;
}

/**
 * Validate bulk import form data
 * @param {Object} formData - Form data to validate
 * @returns {Object} Validation result with valid flag and message
 */
function validateBulkFormData(formData) {
  if (!hasAuthor(formData)) {
    return validationError(MESSAGES.NO_AUTHOR);
  }

  if (!hasQuotesText(formData)) {
    return validationError(MESSAGES.NO_QUOTES);
  }

  return validationSuccess();
}

/**
 * Check if form has author
 * @param {Object} formData - Form data
 * @returns {boolean} True if author exists
 */
function hasAuthor(formData) {
  return Boolean(formData.author);
}

/**
 * Check if form has quotes text
 * @param {Object} formData - Form data
 * @returns {boolean} True if quotes text exists
 */
function hasQuotesText(formData) {
  return Boolean(formData.quotesText);
}

/**
 * Create validation error result
 * @param {string} message - Error message
 * @returns {Object} Validation result
 */
function validationError(message) {
  return { valid: false, message };
}

/**
 * Create validation success result
 * @returns {Object} Validation result
 */
function validationSuccess() {
  return { valid: true };
}

/**
 * Parse quotes from text, split by separator
 * @param {string} quotesText - Raw text containing multiple quotes
 * @returns {Array<string>} Array of individual quotes
 */
function parseQuotes(quotesText) {
  return quotesText
    .split(QUOTE_SEPARATOR)
    .map(trimQuote)
    .filter(isNotEmpty);
}

/**
 * Trim whitespace from note
 * @param {string} note - Note text
 * @returns {string} Trimmed note
 */
function trimQuote(note) {
  return note.trim();
}

/**
 * Check if string is not empty
 * @param {string} str - String to check
 * @returns {boolean} True if not empty
 */
function isNotEmpty(str) {
  return str.length > 0;
}

/**
 * Build confirmation message for bulk import
 * @param {number} count - Number of quotes
 * @param {string} author - Author name
 * @param {string} source - Source name (optional)
 * @returns {string} Confirmation message
 */
function buildConfirmationMessage(count, author, source) {
  const sourceText = source ? ` from ${source}` : '';
  return `Add ${count} quotes by ${author}${sourceText}?`;
}

/**
 * Submit multiple quotes in batch
 * @param {Array<string>} quotes - Array of quote texts
 * @param {Object} formData - Common data for all quotes
 * @param {Object} callbacks - Success/error callbacks
 */
async function submitBulkQuotes(quotes, formData, callbacks = {}) {
  const submitBtn = getSubmitButton();
  const originalText = submitBtn.textContent;
  
  setButtonState(submitBtn, true, BUTTON_TEXT.ADDING);

  try {
    const results = await processQuotesBatch(quotes, formData, submitBtn);
    handleImportSuccess(results, callbacks);
  } catch (error) {
    handleImportError(error, callbacks);
  } finally {
    setButtonState(submitBtn, false, originalText);
  }
}

/**
 * Get the submit button element
 * @returns {HTMLElement} Submit button
 */
function getSubmitButton() {
  return bulkForm.querySelector(SELECTORS.SUBMIT_BUTTON);
}

/**
 * Handle successful import
 * @param {Object} results - Import results
 * @param {Object} callbacks - Callbacks
 */
function handleImportSuccess(results, callbacks) {
  showImportResults(results);
  closeBulkImportModal();
  
  if (callbacks.onSuccess) {
    callbacks.onSuccess(results);
  }
}

/**
 * Handle import error
 * @param {Error} error - The error
 * @param {Object} callbacks - Callbacks
 */
function handleImportError(error, callbacks) {
  console.error('Bulk import error:', error);
  alert(MESSAGES.IMPORT_FAILED);
  
  if (callbacks.onError) {
    callbacks.onError(error);
  }
}

/**
 * Process a batch of quotes one by one
 * @param {Array<string>} quotes - Array of quote texts
 * @param {Object} formData - Common data for all quotes
 * @param {HTMLElement} submitBtn - Submit button for progress updates
 * @returns {Object} Results object with success and error counts
 */
async function processQuotesBatch(quotes, formData, submitBtn) {
  const results = initializeResults();

  for (let i = 0; i < quotes.length; i++) {
    await processSingleQuote(quotes[i], formData, results, i);
    updateProgress(submitBtn, i + 1, quotes.length);
  }

  return finalizeResults(results, quotes.length);
}

/**
 * Initialize results object
 * @returns {Object} Results object
 */
function initializeResults() {
  return {
    successCount: 0,
    errorCount: 0
  };
}

/**
 * Process a single quote in the batch
 * @param {string} quoteText - Quote text
 * @param {Object} formData - Form data
 * @param {Object} results - Results accumulator
 * @param {number} index - Quote index
 */
async function processSingleQuote(quoteText, formData, results, index) {
  try {
    const success = await submitSingleQuote(quoteText, formData);
    
    if (success) {
      results.successCount++;
    } else {
      results.errorCount++;
      console.error(`Failed to add quote ${index + 1}`);
    }
  } catch (error) {
    results.errorCount++;
    console.error(`Error adding quote ${index + 1}:`, error);
  }
}

/**
 * Finalize results with total count
 * @param {Object} results - Results object
 * @param {number} total - Total number of quotes
 * @returns {Object} Finalized results
 */
function finalizeResults(results, total) {
  return {
    ...results,
    total
  };
}

/**
 * Submit a single quote to the API
 * @param {string} quoteText - The quote text
 * @param {Object} formData - Form data (author, source, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function submitSingleQuote(quoteText, formData) {
  const apiUrl = window.API_URL;
  const payload = buildQuotePayload(quoteText, formData);
  
  const response = await fetch(`${apiUrl}${API_CONFIG.ENDPOINT}`, {
    method: API_CONFIG.METHOD,
    headers: API_CONFIG.HEADERS,
    body: JSON.stringify(payload)
  });

  return response.ok;
}

/**
 * Build quote payload for API
 * @param {string} quoteText - Quote text
 * @param {Object} formData - Form data
 * @returns {Object} API payload
 */
function buildQuotePayload(quoteText, formData) {
  return {
    quote: quoteText,
    author: formData.author,
    source: formData.source,
    sourceType: formData.sourceType,
    tags: ''
  };
}

/**
 * Update button text with progress
 * @param {HTMLElement} button - The submit button
 * @param {number} current - Current quote number
 * @param {number} total - Total quotes
 */
function updateProgress(button, current, total) {
  button.textContent = BUTTON_TEXT.PROGRESS(current, total);
}

/**
 * Set button state (enabled/disabled) and text
 * @param {HTMLElement} button - The button element
 * @param {boolean} disabled - Whether to disable the button
 * @param {string} text - Button text
 */
function setButtonState(button, disabled, text) {
  button.disabled = disabled;
  button.textContent = text;
}

/**
 * Show import results to user
 * @param {Object} results - Results object with counts
 */
function showImportResults(results) {
  const { successCount, errorCount } = results;
  const message = buildResultMessage(successCount, errorCount);
  alert(message);
}

/**
 * Build result message based on success/error counts
 * @param {number} successCount - Number of successful imports
 * @param {number} errorCount - Number of failed imports
 * @returns {string} Result message
 */
function buildResultMessage(successCount, errorCount) {
  return errorCount === 0
    ? RESULT_MESSAGES.ALL_SUCCESS(successCount)
    : RESULT_MESSAGES.PARTIAL_SUCCESS(successCount, errorCount);
}

// ============================================
// Public API for Autocomplete Integration
// ============================================

/**
 * Get bulk import input elements for autocomplete setup
 * @returns {Object} Input elements for author and source
 */
export function getBulkImportInputs() {
  return {
    bulkAuthorInput,
    bulkAuthorSuggestions,
    bulkSourceInput,
    bulkSourceSuggestions
  };
}
