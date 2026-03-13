/**
 * ============================================================================
 * AUTOCOMPLETE MANAGER
 * ============================================================================
 * Manages autocomplete functionality for author, source, and tag inputs.
 * Provides suggestion dropdowns with keyboard navigation and debounced search.
 * 
 * Main functions:
 * - initializeAutocomplete() - Setup all autocomplete event listeners
 * - debounceAutocomplete() - Debounced search trigger
 * 
 * Dependencies:
 * - Requires API_URL on window.API_URL
 * - Requires escapeHtml from utils (passed as parameter)
 */

// ============= CONSTANTS =============

const AUTOCOMPLETE_DELAY_MS = 300;
const MAX_SUGGESTIONS = 10;
const MIN_SEARCH_LENGTH = 1;
const MIN_TAG_SEARCH_LENGTH = 2;

const CSS_CLASSES = {
  SHOW: 'show',
  ACTIVE: 'active',
  AUTOCOMPLETE_ITEM: 'autocomplete-item',
  AUTOCOMPLETE_WRAPPER: '.autocomplete-wrapper'
};

const KEYBOARD_KEYS = {
  ARROW_DOWN: 'ArrowDown',
  ARROW_UP: 'ArrowUp',
  ENTER: 'Enter',
  ESCAPE: 'Escape'
};

/**
 * Maps autocomplete type to API endpoint
 */
const AUTOCOMPLETE_ENDPOINTS = {
  author: 'authors',
  source: 'sources',
  bulkAuthor: 'authors',
  bulkSource: 'sources',
  tags: 'tags'
};

// ============= STATE =============

let autocompleteTimeout = null;
let currentFocus = -1;
let escapeHtmlFn = null; // Will be set during initialization

// ============= HELPER FUNCTIONS =============

/**
 * Hide suggestions dropdown
 * @param {HTMLElement} container - Suggestions container element
 */
function hideSuggestions(container) {
  container.classList.remove(CSS_CLASSES.SHOW);
  container.innerHTML = "";
}

/**
 * Show suggestions dropdown
 * @param {HTMLElement} container - Suggestions container element
 */
function showSuggestions(container) {
  container.classList.add(CSS_CLASSES.SHOW);
}

/**
 * Extract current tag being typed from comma-separated input
 * @param {string} search - Full search value
 * @returns {string} Current tag being typed
 */
function extractCurrentTag(search) {
  const lastCommaIndex = search.lastIndexOf(",");
  return lastCommaIndex >= 0
    ? search.substring(lastCommaIndex + 1).trim()
    : search.trim();
}

/**
 * Build new value for tag input after selection
 * @param {string} fullValue - Full input value
 * @param {string} selectedTag - Selected tag value
 * @returns {string} New input value
 */
function buildTagValue(fullValue, selectedTag) {
  const lastCommaIndex = fullValue.lastIndexOf(",");
  if (lastCommaIndex >= 0) {
    // Keep everything before the last comma and append the selected tag
    return fullValue.substring(0, lastCommaIndex + 1) + " " + selectedTag;
  } else {
    // No comma, just replace the entire value
    return selectedTag;
  }
}

/**
 * Create suggestion item HTML
 * @param {string} name - Suggestion name
 * @returns {string} HTML string
 */
function createSuggestionItem(name) {
  return `<div class="${CSS_CLASSES.AUTOCOMPLETE_ITEM}" data-value="${escapeHtmlFn(name)}">${escapeHtmlFn(name)}</div>`;
}

/**
 * Create tag suggestion item HTML with quote count
 * @param {Object} tag - Tag object with name and quote_count
 * @returns {string} HTML string
 */
function createTagSuggestionItem(tag) {
  return `<div class="${CSS_CLASSES.AUTOCOMPLETE_ITEM}" data-value="${escapeHtmlFn(tag.name)}">
            ${escapeHtmlFn(tag.name)} <span style="color: var(--text-secondary);">(${tag.quote_count})</span>
        </div>`;
}

/**
 * Attach click handlers to suggestion items
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 * @param {Function} onSelect - Callback when item is selected
 */
function attachSuggestionClickHandlers(container, input, onSelect) {
  container.querySelectorAll(`.${CSS_CLASSES.AUTOCOMPLETE_ITEM}`).forEach((item) => {
    item.addEventListener("click", () => {
      const value = item.dataset.value;
      onSelect(value);
      hideSuggestions(container);
    });
  });
}

/**
 * Set active state on autocomplete items
 * @param {NodeList} items - List of autocomplete item elements
 * @param {number} focusIndex - Index of item to activate
 */
function setActiveItem(items, focusIndex) {
  items.forEach((item, index) => {
    item.classList.remove(CSS_CLASSES.ACTIVE);
    if (index === focusIndex) {
      item.classList.add(CSS_CLASSES.ACTIVE);
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

// ============= SUGGESTION FETCHING =============

/**
 * Fetch autocomplete suggestions from API
 * @param {string} search - Search query
 * @param {string} endpoint - API endpoint (authors/sources/tags)
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 */
async function fetchSuggestions(search, endpoint, container, input) {
  try {
    const url = `${window.API_URL}/${endpoint}?search=${encodeURIComponent(search)}`;
    const response = await fetch(url);
    const items = await response.json();

    if (!items || items.length === 0) {
      hideSuggestions(container);
      return;
    }

    displaySuggestions(items, container, input);
  } catch (error) {
    console.error(`Error fetching ${endpoint} suggestions:`, error);
    hideSuggestions(container);
  }
}

/**
 * Fetch tag suggestions (handles comma-separated values)
 * @param {string} search - Full search value (may contain commas)
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 */
async function fetchTagSuggestions(search, container, input) {
  try {
    const currentTag = extractCurrentTag(search);

    if (currentTag.length < MIN_TAG_SEARCH_LENGTH) {
      hideSuggestions(container);
      return;
    }

    // Fetch tags filtered by current note type
    let url = `${window.API_URL}/tags`;
    if (window.currentNoteTypeFilter) {
      url += `?type=${encodeURIComponent(window.currentNoteTypeFilter)}`;
    }
    
    const response = await fetch(url);
    const tags = await response.json();

    // Filter tags that match the current tag being typed
    const filteredTags = tags.filter((tag) =>
      tag.name.toLowerCase().includes(currentTag.toLowerCase())
    );

    displayTagSuggestions(filteredTags, container, input, search);
  } catch (error) {
    console.error("Error fetching tag suggestions:", error);
    hideSuggestions(container);
  }
}

// ============= SUGGESTION DISPLAY =============

/**
 * Display suggestions in dropdown
 * @param {Array} items - Array of suggestion items
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 */
function displaySuggestions(items, container, input) {
  currentFocus = -1;

  if (items.length === 0) {
    hideSuggestions(container);
    return;
  }

  // Limit to max suggestions
  const limitedItems = items.slice(0, MAX_SUGGESTIONS);

  container.innerHTML = limitedItems
    .map(item => createSuggestionItem(item.name))
    .join("");

  // Add click handlers
  attachSuggestionClickHandlers(container, input, (value) => {
    input.value = value;
  });

  showSuggestions(container);
}

/**
 * Display tag suggestions with quote counts (handles comma-separated values)
 * @param {Array} tags - Array of tag objects
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 * @param {string} fullValue - Full input value
 */
function displayTagSuggestions(tags, container, input, fullValue) {
  currentFocus = -1;

  if (tags.length === 0) {
    hideSuggestions(container);
    return;
  }

  container.innerHTML = tags
    .map(tag => createTagSuggestionItem(tag))
    .join("");

  // Add click handlers with tag-specific logic
  attachSuggestionClickHandlers(container, input, (selectedTag) => {
    input.value = buildTagValue(fullValue, selectedTag);
    
    // Trigger search after tag selection (if callback provided)
    if (window.debounceSearch) {
      window.debounceSearch();
    }
  });

  showSuggestions(container);
}

// ============= KEYBOARD NAVIGATION =============

/**
 * Navigate to next item (arrow down)
 * @param {NodeList} items - List of autocomplete items
 * @returns {number} New focus index
 */
function navigateDown(items) {
  currentFocus++;
  if (currentFocus >= items.length) currentFocus = 0;
  return currentFocus;
}

/**
 * Navigate to previous item (arrow up)
 * @param {NodeList} items - List of autocomplete items
 * @returns {number} New focus index
 */
function navigateUp(items) {
  currentFocus--;
  if (currentFocus < 0) currentFocus = items.length - 1;
  return currentFocus;
}

/**
 * Select current item (enter)
 * @param {NodeList} items - List of autocomplete items
 * @param {KeyboardEvent} e - Keyboard event
 */
function selectCurrentItem(items, e) {
  if (currentFocus > -1 && items[currentFocus]) {
    e.preventDefault();
    items[currentFocus].click();
  }
}

/**
 * Handle keyboard navigation in autocomplete
 * @param {KeyboardEvent} e - Keyboard event
 * @param {HTMLElement} container - Suggestions container element
 */
function handleAutocompleteKeys(e, container) {
  const items = container.querySelectorAll(`.${CSS_CLASSES.AUTOCOMPLETE_ITEM}`);

  switch (e.key) {
    case KEYBOARD_KEYS.ARROW_DOWN:
      e.preventDefault();
      navigateDown(items);
      setActiveItem(items, currentFocus);
      break;
      
    case KEYBOARD_KEYS.ARROW_UP:
      e.preventDefault();
      navigateUp(items);
      setActiveItem(items, currentFocus);
      break;
      
    case KEYBOARD_KEYS.ENTER:
      selectCurrentItem(items, e);
      break;
      
    case KEYBOARD_KEYS.ESCAPE:
      hideSuggestions(container);
      break;
  }
}

// ============= DEBOUNCED AUTOCOMPLETE =============

/**
 * Check if search value meets minimum length requirement
 * @param {string} value - Search value
 * @param {HTMLElement} container - Suggestions container element
 * @returns {boolean} True if value is long enough
 */
function isSearchLongEnough(value, container) {
  if (value.length < MIN_SEARCH_LENGTH) {
    hideSuggestions(container);
    return false;
  }
  return true;
}

/**
 * Debounce autocomplete search
 * @param {string} value - Search value
 * @param {string} type - Autocomplete type (author, source, bulkAuthor, bulkSource, tags)
 * @param {HTMLElement} container - Suggestions container element
 * @param {HTMLElement} input - Input element
 */
export function debounceAutocomplete(value, type, container, input) {
  clearTimeout(autocompleteTimeout);
  
  autocompleteTimeout = setTimeout(() => {
    if (!isSearchLongEnough(value, container)) {
      return;
    }

    // Tags have special handling (comma-separated values)
    if (type === 'tags') {
      fetchTagSuggestions(value, container, input);
      return;
    }

    const endpoint = AUTOCOMPLETE_ENDPOINTS[type];
    if (endpoint) {
      fetchSuggestions(value, endpoint, container, input);
    }
  }, AUTOCOMPLETE_DELAY_MS);
}

// ============= INITIALIZATION =============

/**
 * Setup autocomplete for an input field
 * @param {HTMLElement} input - Input element
 * @param {HTMLElement} container - Suggestions container element
 * @param {string} type - Autocomplete type
 */
function setupAutocompleteInput(input, container, type) {
  if (!input || !container) {
    console.log(`⚠️ Autocomplete skipped for ${type}: input=${!!input}, container=${!!container}`);
    return;
  }

  console.log(`✅ Autocomplete setup for ${type}`);

  // Input event - trigger autocomplete
  input.addEventListener("input", (e) => {
    debounceAutocomplete(e.target.value, type, container, input);
  });

  // Keydown event - handle navigation
  input.addEventListener("keydown", (e) => {
    handleAutocompleteKeys(e, container);
  });
}

/**
 * Setup click-outside to close all autocomplete dropdowns
 * @param {Array} containers - Array of suggestion container elements
 */
function setupClickOutsideHandler(containers) {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(CSS_CLASSES.AUTOCOMPLETE_WRAPPER)) {
      containers.forEach(container => {
        if (container) {
          hideSuggestions(container);
        }
      });
    }
  });
}

/**
 * Build autocomplete configuration array
 * @param {Object} config - Configuration object with input/container references
 * @returns {Array} Array of autocomplete configurations
 */
function buildAutocompleteConfigs(config) {
  return [
    { input: config.authorInput, container: config.authorSuggestions, type: 'author' },
    { input: config.sourceInput, container: config.sourceSuggestions, type: 'source' },
    { input: config.searchTags, container: config.tagsSuggestions, type: 'tags' },
    { input: config.bulkAuthorInput, container: config.bulkAuthorSuggestions, type: 'bulkAuthor' },
    { input: config.bulkSourceInput, container: config.bulkSourceSuggestions, type: 'bulkSource' }
  ];
}

/**
 * Get all non-null containers from configs
 * @param {Array} configs - Array of autocomplete configurations
 * @returns {Array} Array of container elements
 */
function extractContainers(configs) {
  return configs
    .map(c => c.container)
    .filter(c => c); // Remove null/undefined
}

/**
 * Initialize all autocomplete functionality
 * @param {Object} config - Configuration object with input/container references and escapeHtml function
 */
export function initializeAutocomplete(config) {
  escapeHtmlFn = config.escapeHtml;
  
  const autocompleteConfigs = buildAutocompleteConfigs(config);

  // Setup each autocomplete input
  autocompleteConfigs.forEach(({ input, container, type }) => {
    setupAutocompleteInput(input, container, type);
  });

  // Setup click-outside handler
  const allContainers = extractContainers(autocompleteConfigs);
  setupClickOutsideHandler(allContainers);
  
  console.log("✅ Autocomplete initialized");
}
