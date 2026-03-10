/**
 * ============================================================================
 * Translation Groups Module
 * ============================================================================
 * Handles translation group functionality for linking related quotes.
 * 
 * Features:
 * - Display quotes by translation group
 * - Filter and navigation
 * - Group management
 */

// ============================================
// Constants
// ============================================

const DEFAULT_LIMIT = 100;

// API Configuration
const API_CONFIG = {
  ENDPOINT: '/quotes',
  PARAM_TRANSLATION_GROUP: 'translation_group',
  PARAM_LIMIT: 'limit'
};

// Messages
const MESSAGES = {
  NO_GROUP_NAME: 'Translation group name is required',
  NO_CALLBACKS: 'displayQuotes and updateCount callbacks are required',
  LOAD_ERROR: 'Failed to load translation group',
  COUNT_FORMAT: (count, groupName) => `(${count} in group "${groupName}")`
};

// Scroll Configuration
const SCROLL_CONFIG = {
  TOP: 0,
  BEHAVIOR: 'smooth'
};

// ============================================
// Public API
// ============================================

/**
 * Show all quotes in a translation group
 * @param {string} groupName - The translation group name
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.displayQuotes - Function to display quotes
 * @param {Function} callbacks.updateCount - Function to update quote count display
 */
export async function showTranslationGroup(groupName, callbacks = {}) {
  if (!validateGroupName(groupName)) {
    console.error(MESSAGES.NO_GROUP_NAME);
    return;
  }

  if (!validateCallbacks(callbacks)) {
    console.error(MESSAGES.NO_CALLBACKS);
    return;
  }

  try {
    await loadAndDisplayGroup(groupName, callbacks);
  } catch (error) {
    handleLoadError(error);
  }
}

/**
 * Validate group name
 * @param {string} groupName - Group name to validate
 * @returns {boolean} True if valid
 */
function validateGroupName(groupName) {
  return Boolean(groupName);
}

/**
 * Validate callbacks object
 * @param {Object} callbacks - Callbacks to validate
 * @returns {boolean} True if valid
 */
function validateCallbacks(callbacks) {
  return callbacks.displayQuotes && callbacks.updateCount;
}

/**
 * Load and display translation group
 * @param {string} groupName - Group name
 * @param {Object} callbacks - Callbacks
 */
async function loadAndDisplayGroup(groupName, callbacks) {
  const quotes = await fetchTranslationGroupQuotes(groupName);
  displayGroupQuotes(quotes, groupName, callbacks);
  scrollToTop();
}

/**
 * Display quotes for a translation group
 * @param {Array} quotes - Array of quotes
 * @param {string} groupName - Group name
 * @param {Object} callbacks - Callbacks
 */
function displayGroupQuotes(quotes, groupName, callbacks) {
  callbacks.displayQuotes(quotes);
  
  const countMessage = buildCountMessage(quotes.length, groupName);
  callbacks.updateCount(countMessage);
}

/**
 * Handle error when loading translation group
 * @param {Error} error - The error
 */
function handleLoadError(error) {
  console.error('Error loading translation group:', error);
  alert(MESSAGES.LOAD_ERROR);
}

/**
 * Initialize translation groups functionality
 * Registers global functions for onclick handlers
 * @param {Object} callbacks - Callback functions for app integration
 */
export function initializeTranslationGroups(callbacks = {}) {
  // Make showTranslationGroup available globally for onclick handlers in HTML
  window.showTranslationGroup = (groupName) => {
    showTranslationGroup(groupName, callbacks);
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Fetch quotes for a specific translation group
 * @param {string} groupName - The translation group name
 * @returns {Promise<Array>} Array of quotes in the group
 */
async function fetchTranslationGroupQuotes(groupName) {
  const url = buildApiUrl(groupName);
  const response = await fetchFromApi(url);
  return await response.json();
}

/**
 * Build API URL for translation group query
 * @param {string} groupName - Group name
 * @returns {string} Complete API URL
 */
function buildApiUrl(groupName) {
  const apiUrl = window.API_URL;
  const encodedGroupName = encodeURIComponent(groupName);
  const params = buildQueryParams(encodedGroupName);
  return `${apiUrl}${API_CONFIG.ENDPOINT}?${params}`;
}

/**
 * Build query parameters string
 * @param {string} encodedGroupName - URL-encoded group name
 * @returns {string} Query parameters
 */
function buildQueryParams(encodedGroupName) {
  return `${API_CONFIG.PARAM_TRANSLATION_GROUP}=${encodedGroupName}&${API_CONFIG.PARAM_LIMIT}=${DEFAULT_LIMIT}`;
}

/**
 * Fetch from API with error handling
 * @param {string} url - API URL
 * @returns {Promise<Response>} Fetch response
 */
async function fetchFromApi(url) {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response;
}

/**
 * Build count message for display
 * @param {number} count - Number of quotes
 * @param {string} groupName - Translation group name
 * @returns {string} Formatted count message
 */
function buildCountMessage(count, groupName) {
  return MESSAGES.COUNT_FORMAT(count, groupName);
}

/**
 * Scroll to top of page with smooth animation
 */
function scrollToTop() {
  window.scrollTo({ 
    top: SCROLL_CONFIG.TOP, 
    behavior: SCROLL_CONFIG.BEHAVIOR
  });
}
