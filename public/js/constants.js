/**
 * UI Element IDs - Single Source of Truth
 * 
 * All HTML element IDs used across the application.
 * Import this file and use these constants instead of hardcoded strings.
 * 
 * Benefits:
 * - Prevents typos and "wrong ID" bugs
 * - IDE autocomplete support
 * - Easy refactoring (change once, updates everywhere)
 * - Clear documentation of all UI elements
 */

// ============= SEARCH & FILTER ELEMENTS =============
export const FILTER_IDS = {
  // Main search inputs
  SEARCH_QUOTE: 'searchQuote',
  SEARCH_AUTHOR: 'searchAuthor',
  SEARCH_SOURCE: 'searchSource',
  SEARCH_TAGS: 'searchTags',
  SEARCH_SCORE: 'searchScore',
  SEARCH_ANY: 'searchAny',
  SEARCH_NOTE_ID: 'searchNoteId',
  
  // Dropdown filters
  AUTHOR_FILTER: 'authorFilter',
  SOURCE_FILTER: 'sourceFilter',
  YEAR_FILTER: 'trainingYearFilter',
  MONTH_FILTER: 'trainingMonthFilter',
  TAG_TYPE_FILTER: 'tagTypeFilter',
  
  // Source type filters (checkboxes in Sources view)
  FILTER_BOOK: 'filterBook',
  FILTER_MOVIE: 'filterMovie',
  FILTER_POETRY: 'filterPoetry',
  FILTER_LYRICS: 'filterLyrics',
  FILTER_JOKES: 'filterJokes',
  
  // Metadata filters (checkboxes + conditions)
  HAS_AUTHOR_CHECKBOX: 'searchHasAuthor',
  HAS_AUTHOR_CONDITION: 'searchAuthorCondition',
  HAS_SOURCE_CHECKBOX: 'searchHasSource',
  HAS_SOURCE_CONDITION: 'searchSourceCondition',
  HAS_NOTE_CHECKBOX: 'searchHasNote',
  HAS_NOTE_CONDITION: 'searchNoteCondition',
  HAS_TAGS_CHECKBOX: 'searchHasTags',
  HAS_TAGS_CONDITION: 'searchTagsCondition',
  HAS_IMAGE_CHECKBOX: 'searchHasImage',
  HAS_IMAGE_CONDITION: 'searchImageCondition',
  HAS_IMAGE_TYPE_CHECKBOX: 'searchHasImageType',
  HAS_IMAGE_TYPE_CONDITION: 'searchImageTypeCondition',
  HAS_TRANSLATION_GROUP_CHECKBOX: 'searchHasTranslationGroup',
  HAS_TRANSLATION_GROUP_CONDITION: 'searchTranslationGroupCondition',
  HAS_MULTIPLE_ATTACHMENTS_CHECKBOX: 'searchHasMultipleAttachments',
  HAS_MULTIPLE_ATTACHMENTS_CONDITION: 'searchMultipleAttachmentsCondition',
  HAS_TITLE_CHECKBOX: 'searchHasTitle',
  HAS_TITLE_CONDITION: 'searchTitleCondition',
  HAS_TEXT_CHECKBOX: 'searchHasText',
  HAS_TEXT_CONDITION: 'searchTextCondition',
  
  // Search containers
  SEARCH_HEADER_TITLE: 'searchHeaderTitle',
  SEARCH_AUTHOR_CONTAINER: 'searchAuthorContainer',
  SEARCH_SOURCE_CONTAINER: 'searchSourceContainer',
  
  // Other search elements
  SEARCH_SOURCES_INPUT: 'searchSourcesInput', // For tags page
  SEARCH_AUTHOR_NAME: 'searchAuthorName', // For authors page
  SEARCH_SOURCE_NAME: 'searchSourceName', // For sources page
};

// ============= MODAL ELEMENTS =============
export const MODAL_IDS = {
  // Quote/Note modal
  QUOTE_MODAL: 'quoteModal',
  QUOTE_FORM: 'quoteForm',
  MODAL_TITLE: 'modalTitle',
  CLOSE_MODAL: 'closeModal',
  
  // Form inputs
  QUOTE_ID: 'quoteId',
  QUOTE_TEXT: 'quoteText',
  AUTHOR_INPUT: 'author', // Changed from 'authorInput' to match actual HTML
  AUTHOR_SUGGESTIONS: 'authorSuggestions',
  SOURCE_INPUT: 'source', // Changed from 'sourceInput' to match actual HTML
  SOURCE_SUGGESTIONS: 'sourceSuggestions',
  TAG_INPUT: 'tags', // Changed from 'tagInput' to match actual HTML
  TAG_SUGGESTIONS: 'tagInputSuggestions',
  COMMENT_INPUT: 'comment', // Changed from 'noteInput' to match actual HTML (was 'note')
  NOTE_TYPE_SELECT: 'noteType', // Added for note type dropdown
  SCORE_INPUT: 'scoreInput',
  NOTE_DATE_INPUT: 'noteDate', // Changed from 'noteDateInput' to match actual HTML
  TRANSLATION_GROUP_INPUT: 'translationGroup', // Added
  
  // Type dropdowns
  SOURCE_TYPE_SELECT: 'sourceType', // Added for regular quotes
  TRAINING_TYPE_SELECT: 'trainingType', // Changed from 'trainingTypeSelect' to match actual HTML
  
  // Editor elements
  QUOTE_EDITOR: 'quoteEditor',
  
  // Image/attachment handling
  IMAGE_FILE: 'imageFile',
  IMAGE_PREVIEW: 'imagePreview',
  CLEAR_IMAGE_BTN: 'clearImage',
  
  // Import/Export modals
  IMPORT_MODAL: 'importModal',
  IMPORT_FILE_INPUT: 'importFileInput',
  IMPORT_PROGRESS: 'importProgress',
  IMPORT_STATUS: 'importStatus',
  SELECT_FILE_BTN: 'selectFileBtn',
  CLOSE_IMPORT_MODAL: 'closeImportModal',
  CANCEL_IMPORT_BTN: 'cancelImportBtn',
  
  // Entity modals (Author/Source)
  ENTITY_MODAL: 'entityModal',
  ENTITY_FORM: 'entityForm',
  ENTITY_ID_INPUT: 'entityIdInput',
  ENTITY_NAME_INPUT: 'entityNameInput',
  ENTITY_IMAGE_FILE: 'entityImageFile',
  ENTITY_IMAGE_PREVIEW: 'entityImagePreview',
  CLOSE_ENTITY_MODAL: 'closeEntityModal',
  CANCEL_ENTITY_BTN: 'cancelEntityBtn',
  SAVE_ENTITY_BTN: 'saveEntityBtn',
  DELETE_ENTITY_BTN: 'deleteEntityBtn',
  
  // Rename modal
  RENAME_MODAL: 'renameModal',
  RENAME_INPUT: 'renameInput',
  RENAME_CANCEL_BTN: 'renameCancelBtn',
  RENAME_CONFIRM_BTN: 'renameConfirmBtn',
  
  // Settings modal
  SETTINGS_MODAL: 'settingsModal',
  CLOSE_SETTINGS_MODAL: 'closeSettingsModal',
  CANCEL_SETTINGS_BTN: 'cancelSettingsBtn',
  SAVE_SETTINGS_BTN: 'saveSettingsBtn',
};

// ============= BUTTON ELEMENTS =============
export const BUTTON_IDS = {
  // Main action buttons
  ADD_QUOTE_BTN: 'addQuoteBtn',
  EXPORT_PDF_BTN: 'exportPdfBtn',
  IMPORT_JSON_BTN: 'importJsonBtn',
  SETTINGS_BTN: 'settingsBtn',
  
  // Refresh buttons
  REFRESH_AUTHORS_BTN: 'refreshAuthorsBtn',
  REFRESH_SOURCES_BTN: 'refreshSourcesBtn',
  
  // Sorting buttons
  SORT_TAGS_BY_NAME: 'sortTagsByName',
  SORT_TAGS_BY_COUNT: 'sortTagsByCount',
  SORT_TAGS_BY_DATE: 'sortTagsByDate',
  
  // Clear filters
  CLEAR_FILTERS_BTN: 'clearFiltersBtn',
  
  // Clear image buttons
  CLEAR_QUOTE_IMAGE: 'clearQuoteImageBtn',
  CLEAR_AUTHOR_IMAGE: 'clearAuthorImage',
  CLEAR_SOURCE_IMAGE: 'clearSourceImage',
  
  // Navigation
  TOGGLE_ATTACHMENT_BTN: 'toggleAttachmentBtn',
  TOGGLE_AUTHOR_ATTACHMENT_BTN: 'toggleAuthorAttachmentBtn',
  TOGGLE_SOURCE_ATTACHMENT_BTN: 'toggleSourceAttachmentBtn',
  
  // Pagination (dynamic, but base IDs)
  PREV_PAGE_BTN: 'prevPageBtn',
  NEXT_PAGE_BTN: 'nextPageBtn',
};

// ============= CONTAINER ELEMENTS =============
export const CONTAINER_IDS = {
  // Main view containers
  QUOTES_VIEW: 'quotesView',
  AUTHORS_VIEW: 'authorsView',
  SOURCES_VIEW: 'sourcesView',
  TAGS_VIEW: 'tagsView',
  OPTIONS_VIEW: 'optionsView',
  
  // Content containers
  QUOTES_CONTAINER: 'quotesList',
  AUTHORS_CONTAINER: 'authorsContainer',
  SOURCES_CONTAINER: 'sourcesContainer',
  TAGS_CONTAINER: 'tagsContainer',
  
  // Modal field containers
  QUOTE_SPECIFIC_FIELDS: 'quoteSpecificFields',
  TRAINING_SPECIFIC_FIELDS: 'trainingSpecificFields',
  ATTACHMENT_CONTAINER: 'attachmentContainer',
  AUTHOR_ATTACHMENT_CONTAINER: 'authorAttachmentContainer',
  SOURCE_ATTACHMENT_CONTAINER: 'sourceAttachmentContainer',
  
  // Pagination
  PAGINATION_CONTROLS: 'paginationControls',
  PAGINATION_INFO: 'paginationInfo',
  
  // Welcome quote
  WELCOME_QUOTE_OVERLAY: 'welcomeQuoteOverlay',
  WELCOME_QUOTE_CARD: 'welcomeQuoteCard',
};

// ============= CSS CLASS SELECTORS =============
export const CSS_CLASSES = {
  // Checkboxes
  TYPE_CHECKBOX: 'type-checkbox',
  TRAINING_TYPE_CHECKBOX: 'training-type-checkbox',
  
  // Filter buttons
  NOTE_TYPE_FILTER: 'note-type-filter',
  
  // UI elements
  MENU_ITEM: 'menu-item',
  QUOTE_CARD: 'quote-card',
  AUTHOR_CARD: 'author-card',
  SOURCE_CARD: 'source-card',
  TAG_CARD: 'tag-card',
  
  // Modal
  MODAL: 'modal',
  MODAL_CONTENT: 'modal-content',
  
  // Active states
  ACTIVE: 'active',
  REFRESHING: 'refreshing',
};

// ============= API ENDPOINTS =============
export const API_ENDPOINTS = {
  // Quotes
  QUOTES: '/api/quotes',
  QUOTES_RANDOM: '/api/quotes/random',
  QUOTES_BULK_COUNT: '/api/quotes/bulk-count',
  QUOTES_BULK_TAG: '/api/quotes/bulk-tag',
  QUOTES_BULK_DELETE: '/api/quotes/bulk-delete',
  
  // Authors
  AUTHORS: '/api/authors',
  
  // Sources
  SOURCES: '/api/sources',
  
  // Tags
  TAGS: '/api/tags',
  
  // Export/Import
  EXPORT_PDF: '/api/export/pdf',
  EXPORT_JSON: '/api/export/json',
  IMPORT_JSON: '/api/import/json',
  
  // Settings
  SETTINGS: '/api/settings',
};

// ============= HELPER FUNCTIONS =============

/**
 * Safely get element by ID with error logging
 * @param {string} id - Element ID from constants
 * @param {string} context - Where this is being called from (for debugging)
 * @returns {HTMLElement|null}
 */
export function getElementByIdSafe(id, context = 'Unknown') {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ [CONSTANTS] Element not found: "${id}" (Called from: ${context})`);
    console.warn(`   👉 Either the ID is wrong in constants.js, or the HTML element doesn't exist`);
  }
  return element;
}

/**
 * Get element value safely with validation
 * @param {string} id - Element ID from constants
 * @param {string} defaultValue - Default value if element not found
 * @returns {string}
 */
export function getElementValue(id, defaultValue = '') {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ [CONSTANTS] Cannot get value - element not found: "${id}"`);
    return defaultValue;
  }
  return element?.value || defaultValue;
}

/**
 * Set element value safely with validation
 * @param {string} id - Element ID from constants
 * @param {string} value - Value to set
 * @returns {boolean} - Success status
 */
export function setElementValue(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ [CONSTANTS] Cannot set value - element not found: "${id}"`);
    return false;
  }
  element.value = value;
  return true;
}

/**
 * Get checkbox state with validation
 * @param {string} id - Element ID from constants
 * @returns {boolean}
 */
export function getCheckboxState(id) {
  const checkbox = document.getElementById(id);
  if (!checkbox) {
    console.warn(`⚠️ [CONSTANTS] Cannot get checkbox state - element not found: "${id}"`);
    return false;
  }
  return checkbox?.checked || false;
}

/**
 * Set checkbox state safely with validation
 * @param {string} id - Element ID from constants
 * @param {boolean} checked - Checked state
 * @returns {boolean} - Success status
 */
export function setCheckboxState(id, checked) {
  const checkbox = document.getElementById(id);
  if (!checkbox) {
    console.warn(`⚠️ [CONSTANTS] Cannot set checkbox state - element not found: "${id}"`);
    return false;
  }
  checkbox.checked = checked;
  return true;
}

/**
 * Get all checked values from checkboxes with a class
 * @param {string} className - CSS class name from constants
 * @returns {Array<string>}
 */
export function getCheckedValues(className) {
  const elements = document.querySelectorAll(`.${className}:checked`);
  if (elements.length === 0) {
    console.debug(`ℹ️ [CONSTANTS] No checked elements found for class: "${className}"`);
  }
  return Array.from(elements).map(cb => cb.value);
}

/**
 * Show/hide element safely
 * @param {string} id - Element ID from constants
 * @param {boolean} show - True to show, false to hide
 * @returns {boolean} - Success status
 */
export function toggleElementVisibility(id, show) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ [CONSTANTS] Cannot toggle visibility - element not found: "${id}"`);
    return false;
  }
  element.style.display = show ? '' : 'none';
  return true;
}
