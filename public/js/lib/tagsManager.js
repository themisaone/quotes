/**
 * tagsManager.js
 * 
 * Tags page management - display, search, operations (rename, merge, delete)
 * 
 * Architecture:
 * 1. DOM Helpers - Element selection and validation
 * 2. Counter Management - Update tag counts
 * 3. Display Functions - Render tags list and cards
 * 4. Autocomplete System - Tag suggestions and selection
 * 5. Tag Operations - Rename, merge, delete
 * 6. Filter & Navigation - Integration with quotes view
 * 7. UI Feedback - Notifications and loading states
 * 
 * Main exported functions:
 * - loadTags() - Load and display all tags
 * - filterByTag(tagName) - Filter quotes by tag
 * - deleteTag(id, name) - Delete a tag
 * - setupTagOperations() - Setup rename/merge operations
 * 
 * Dependencies:
 * - api.js for API_URL
 * - utils.js for escapeHtml
 * - Requires window.switchView, window.loadQuotes, window.currentPage
 */

import { API_URL } from './api.js';
import { escapeHtml } from './utils.js';
import { 
  FILTER_IDS,
  CONTAINER_IDS,
  getElementByIdSafe,
  getElementValue,
  setElementValue
} from '../constants.js';

// ============= MODULE STATE =============
let allTagsForOperations = [];
let tagAutocompleteTimeout;

// ============= CONSTANTS =============
const AUTOCOMPLETE_DELAY_MS = 200;
const NOTIFICATION_DURATION_MS = 3000;
const NOTIFICATION_FADE_MS = 300;
const SWITCH_VIEW_DELAY_MS = 50;

const NOTIFICATION_COLORS = {
  success: '#4caf50',
  error: '#f44336',
  info: '#2196f3'
};

// ============= 1. DOM HELPERS =============

/**
 * Get tag list container element
 */
function getTagsListElement() {
  const tagsList = getElementByIdSafe("tagsList");
  if (!tagsList) {
    console.error("tagsList element not found!");
  }
  return tagsList;
}

/**
 * Update tag counters
 */
function updateTagCounters(count) {
  const totalCountElement = getElementByIdSafe("totalTagsCount");
  const filteredCountElement = getElementByIdSafe("filteredTagsCount");
  
  if (totalCountElement) {
    totalCountElement.textContent = count;
  }
  if (filteredCountElement) {
    filteredCountElement.textContent = count;
  }
}

/**
 * Store tags globally for backwards compatibility
 */
function exposeTagsGlobally(tags) {
  if (window.allTags !== undefined) {
    window.allTags = tags;
  }
}

// ============= 2. DISPLAY FUNCTIONS =============

/**
 * Create HTML for a single tag card
 */
function createTagCardHtml(tag) {
  const typeArg = tag.type ? `, '${escapeHtml(tag.type)}'` : '';
  return `
    <div class="tag-card" onclick="filterByTag('${escapeHtml(tag.name)}'${typeArg})">
        <div class="tag-card-name">
            <span class="tag-card-icon">🏷️</span>
            <span>${escapeHtml(tag.name)}</span>
        </div>
        <div class="tag-card-actions">
            <div class="tag-card-count">${tag.quote_count} notes</div>
            <button class="tag-delete-btn" onclick="event.stopPropagation(); deleteTag(${tag.id}, '${escapeHtml(tag.name)}')" title="Delete tag">🗑️</button>
        </div>
    </div>
  `;
}

/**
 * Display tags in the tags list
 * @param {Array} tags - Array of tag objects to display
 */
export function displayTags(tags) {
  const tagsList = getTagsListElement();
  if (!tagsList) return;

  if (tags.length === 0) {
    tagsList.innerHTML = '<div class="no-items">No tags found.</div>';
    return;
  }

  tagsList.innerHTML = tags.map(tag => createTagCardHtml(tag)).join("");
  
  // Setup autocomplete for tag operations
  setupTagOperationsAutocomplete(tags);
  
  // Re-setup event listeners after autocomplete (which clones inputs)
  setupRenameTagOperation();
  setupMergeTagsOperation();
}

/**
 * Display error message in tags list
 */
function displayTagsError() {
  const tagsList = getTagsListElement();
  if (tagsList) {
    tagsList.innerHTML = '<div class="no-items">Failed to load tags.</div>';
  }
}

// ============= 3. AUTOCOMPLETE SYSTEM =============

/**
 * Create autocomplete suggestion HTML for no matches
 */
function createNoMatchHtml(allowNew, inputValue) {
  if (allowNew) {
    return `<div class="autocomplete-item create-new">
      <span>✨ Create new tag: "${escapeHtml(inputValue)}"</span>
    </div>`;
  }
  return '<div class="autocomplete-item no-match">No matching tags found</div>';
}

/**
 * Create autocomplete suggestion HTML for a tag
 */
function createTagSuggestionHtml(tag) {
  return `
    <div class="autocomplete-item" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">
      ${escapeHtml(tag.name)} <span class="tag-count">(${tag.quote_count})</span>
    </div>
  `;
}

/**
 * Filter tags by search value
 */
function filterTagsByValue(value) {
  return allTagsForOperations.filter(tag => 
    tag.name.toLowerCase().includes(value.toLowerCase())
  );
}

/**
 * Handle suggestion item click
 */
function handleSuggestionClick(item, input, suggestionsDiv) {
  const tagName = item.getAttribute('data-tag-name') || input.value;
  const tagId = item.getAttribute('data-tag-id') || '';
  
  input.value = tagName;
  input.setAttribute('data-tag-id', tagId);
  input.setAttribute('data-tag-name', tagName);
  
  suggestionsDiv.classList.remove('show');
}

/**
 * Render autocomplete suggestions
 */
function renderSuggestions(suggestionsDiv, matches, allowNew, inputValue) {
  if (matches.length === 0) {
    suggestionsDiv.innerHTML = createNoMatchHtml(allowNew, inputValue);
  } else {
    suggestionsDiv.innerHTML = matches.map(tag => createTagSuggestionHtml(tag)).join('');
  }
  suggestionsDiv.classList.add('show');
}

/**
 * Setup click handlers for autocomplete suggestions
 */
function setupSuggestionClickHandlers(suggestionsDiv, input) {
  suggestionsDiv.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      handleSuggestionClick(item, input, suggestionsDiv);
    });
  });
}

/**
 * Handle autocomplete input event
 */
function handleAutocompleteInput(input, suggestionsDiv, allowNew) {
  clearTimeout(tagAutocompleteTimeout);
  tagAutocompleteTimeout = setTimeout(() => {
    const value = input.value.trim();
    
    if (value.length === 0) {
      suggestionsDiv.innerHTML = '';
      suggestionsDiv.classList.remove('show');
      return;
    }
    
    const matches = filterTagsByValue(value);
    renderSuggestions(suggestionsDiv, matches, allowNew, input.value);
    setupSuggestionClickHandlers(suggestionsDiv, input);
  }, AUTOCOMPLETE_DELAY_MS);
}

/**
 * Setup click-outside handler to hide suggestions
 */
function setupClickOutsideHandler(input, suggestionsDiv) {
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.classList.remove('show');
    }
  });
}

/**
 * Set up autocomplete for a single tag input
 */
function setupTagAutocomplete(input, suggestionsId, allowNew) {
  const suggestionsDiv = getElementByIdSafe(suggestionsId);
  if (!suggestionsDiv) return;
  
  // Remove previous listeners by cloning
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  
  newInput.addEventListener('input', () => {
    handleAutocompleteInput(newInput, suggestionsDiv, allowNew);
  });
  
  setupClickOutsideHandler(newInput, suggestionsDiv);
}

/**
 * Set up autocomplete for all tag operation inputs
 */
function setupTagOperationsAutocomplete(tags) {
  allTagsForOperations = tags;
  
  const inputs = [
    { id: 'renameTagInput', suggestions: 'renameTagSuggestions', allowNew: false },
    { id: 'sourceTagInput', suggestions: 'sourceTagSuggestions', allowNew: false },
    { id: 'targetTagInput', suggestions: 'targetTagSuggestions', allowNew: true }
  ];
  
  inputs.forEach(({ id, suggestions, allowNew }) => {
    const input = getElementByIdSafe(id);
    if (input) {
      setupTagAutocomplete(input, suggestions, allowNew);
    }
  });
}

// ============= 4. FILTER & NAVIGATION =============

/**
 * Clear all search filters
 */
function clearSearchFilters() {
  const filters = ['searchQuote', 'searchAuthor', 'searchSource'];
  filters.forEach(id => {
    const element = getElementByIdSafe(id);
    if (element) element.value = "";
  });
}

/**
 * Set tag filter value
 */
function setTagFilter(tagName) {
  const searchTags = getElementByIdSafe("searchTags");
  if (searchTags) {
    searchTags.value = tagName;
  }
}

/**
 * Update active menu item
 */
function updateActiveMenuItem() {
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.view === "quotes") {
      item.classList.add("active");
    }
  });
}

/**
 * Filter quotes by a specific tag
 * @param {string} tagName - Tag name to filter by
 */
export function filterByTag(tagName, noteType) {
  console.log("Filtering by tag:", tagName, noteType ? `(type: ${noteType})` : '');
  
  // Requires window.switchView and window.loadQuotes from app.js
  if (!window.switchView || !window.loadQuotes) {
    console.error("filterByTag requires window.switchView and window.loadQuotes");
    return;
  }

  // If a note type was active in the Tags view, switch to it first
  if (noteType && window.setNoteTypeFilter) {
    window.setNoteTypeFilter(noteType);
  }

  window.switchView("quotes");
  clearSearchFilters();
  setTagFilter(tagName);
  
  // Reset pagination
  if (window.currentPage !== undefined) {
    window.currentPage = 1;
  }
  // Also sync with library if available
  if (window.setLibCurrentPage) {
    window.setLibCurrentPage(1);
  }
  
  setTimeout(() => {
    window.loadQuotes();
  }, SWITCH_VIEW_DELAY_MS);

  updateActiveMenuItem();
}

// ============= 5. UI FEEDBACK =============

/**
 * Get notification color by type
 */
function getNotificationColor(type) {
  return NOTIFICATION_COLORS[type] || NOTIFICATION_COLORS.info;
}

/**
 * Create notification element
 */
function createNotificationElement(message, type) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${getNotificationColor(type)};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  return notification;
}

/**
 * Remove notification after delay
 */
function scheduleNotificationRemoval(notification) {
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, NOTIFICATION_FADE_MS);
  }, NOTIFICATION_DURATION_MS);
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
  const notification = createNotificationElement(message, type);
  document.body.appendChild(notification);
  scheduleNotificationRemoval(notification);
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loading) {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = '⏳ Processing...';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

// ============= 6. TAG OPERATIONS - API CALLS =============

/**
 * Rename a tag via API
 */
async function renameTagApi(tagId, newName) {
  const response = await fetch(`${API_URL}/tags/${tagId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to rename tag');
  }
  
  return response.json();
}

/**
 * Bulk add tag via API
 */
async function bulkAddTagApi(sourceTagName, targetTagName) {
  const response = await fetch(`${API_URL}/tags/bulk-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceTagName: sourceTagName,
      targetTagName: targetTagName
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add tag');
  }
  
  return response.json();
}

/**
 * Delete a tag via API
 */
async function deleteTagApi(id) {
  const response = await fetch(`${API_URL}/tags/${id}`, {
    method: "DELETE",
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || "Failed to delete tag");
  }
  
  return data;
}

// ============= 7. TAG OPERATIONS - UI HANDLERS =============

/**
 * Reset rename form fields
 */
function resetRenameForm(renameTagInput, renameTagNewName) {
  renameTagInput.value = '';
  renameTagInput.removeAttribute('data-tag-id');
  renameTagInput.removeAttribute('data-tag-name');
  renameTagNewName.value = '';
}

/**
 * Handle rename tag operation
 */
async function handleRenameTag() {
  // Get fresh references from DOM (not stale references)
  const renameTagInput = getElementByIdSafe('renameTagInput');
  const renameTagNewName = getElementByIdSafe('renameTagNewName');
  const renameTagBtn = getElementByIdSafe('renameTagBtn');
  
  if (!renameTagInput || !renameTagNewName || !renameTagBtn) {
    console.error('Rename tag elements not found');
    return;
  }
  
  const tagId = renameTagInput.getAttribute('data-tag-id');
  const newName = renameTagNewName.value.trim();
  
  if (!tagId) {
    alert('Please select a tag to rename');
    return;
  }
  
  if (!newName) {
    alert('Please enter a new name');
    return;
  }
  
  setButtonLoading(renameTagBtn, true);
  
  try {
    const result = await renameTagApi(tagId, newName);
    
    const message = result.merged
      ? `✅ ${result.message}\n\nAll quotes have been moved to the existing tag.`
      : `✅ ${result.message}`;
    
    showNotification(message, 'success');
    resetRenameForm(renameTagInput, renameTagNewName);
    loadTags();
  } catch (error) {
    console.error('Error renaming tag:', error);
    showNotification(`❌ ${error.message}`, 'error');
  } finally {
    setButtonLoading(renameTagBtn, false);
  }
}

/**
 * Setup rename tag operation
 */
function setupRenameTagOperation() {
  const renameTagBtn = getElementByIdSafe('renameTagBtn');
  const renameTagInput = getElementByIdSafe('renameTagInput');
  const renameTagNewName = getElementByIdSafe('renameTagNewName');
  
  if (!renameTagBtn || !renameTagInput || !renameTagNewName) return;
  
  // Remove old button and replace with clone to clear all event listeners
  const newBtn = renameTagBtn.cloneNode(true);
  renameTagBtn.parentNode.replaceChild(newBtn, renameTagBtn);
  
  // Auto-fill new name when tag is selected
  renameTagInput.addEventListener('change', () => {
    renameTagNewName.value = renameTagInput.value;
  });
  
  // Attach listener to the NEW button
  newBtn.addEventListener('click', handleRenameTag);
}

/**
 * Reset merge tags form fields
 */
function resetMergeForm(sourceTagInput, targetTagInput) {
  sourceTagInput.value = '';
  sourceTagInput.removeAttribute('data-tag-id');
  sourceTagInput.removeAttribute('data-tag-name');
  targetTagInput.value = '';
  targetTagInput.removeAttribute('data-tag-id');
  targetTagInput.removeAttribute('data-tag-name');
}

/**
 * Generate confirmation message for merge operation
 */
function generateMergeConfirmMessage(isNewTag, targetTagValue, sourceTagName) {
  if (isNewTag) {
    return `Create new tag "${targetTagValue}" and add it to all quotes that have "${sourceTagName}"?`;
  }
  return `Add tag "${targetTagValue}" to all quotes that have "${sourceTagName}"?`;
}

/**
 * Handle merge tags operation
 */
async function handleMergeTags() {
  // Get fresh references from DOM (not stale references)
  const addTagToTaggedBtn = getElementByIdSafe('addTagToTaggedBtn');
  const sourceTagInput = getElementByIdSafe('sourceTagInput');
  const targetTagInput = getElementByIdSafe('targetTagInput');
  
  if (!addTagToTaggedBtn || !sourceTagInput || !targetTagInput) {
    console.error('Merge tags elements not found');
    return;
  }
  
  const sourceTagId = sourceTagInput.getAttribute('data-tag-id');
  const sourceTagName = sourceTagInput.value.trim();
  const targetTagValue = targetTagInput.value.trim();
  const targetTagId = targetTagInput.getAttribute('data-tag-id');
  
  if (!sourceTagId || !sourceTagName) {
    alert('Please select the source tag (quotes that have this tag)');
    return;
  }
  
  if (!targetTagValue) {
    alert('Please enter or select the target tag (tag to add)');
    return;
  }
  
  const isNewTag = !targetTagId;
  const confirmMessage = generateMergeConfirmMessage(isNewTag, targetTagValue, sourceTagName);
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  setButtonLoading(addTagToTaggedBtn, true);
  
  try {
    const result = await bulkAddTagApi(sourceTagName, targetTagValue);
    showNotification(`✅ ${result.message}`, 'success');
    resetMergeForm(sourceTagInput, targetTagInput);
    loadTags();
  } catch (error) {
    console.error('Error adding tag:', error);
    showNotification(`❌ ${error.message}`, 'error');
  } finally {
    setButtonLoading(addTagToTaggedBtn, false);
  }
}

/**
 * Setup merge tags operation
 */
function setupMergeTagsOperation() {
  const addTagToTaggedBtn = getElementByIdSafe('addTagToTaggedBtn');
  const sourceTagInput = getElementByIdSafe('sourceTagInput');
  const targetTagInput = getElementByIdSafe('targetTagInput');
  
  if (!addTagToTaggedBtn || !sourceTagInput || !targetTagInput) return;
  
  // Remove old button and replace with clone to clear all event listeners
  const newBtn = addTagToTaggedBtn.cloneNode(true);
  addTagToTaggedBtn.parentNode.replaceChild(newBtn, addTagToTaggedBtn);
  
  // Attach listener to the NEW button
  newBtn.addEventListener('click', handleMergeTags);
}

// ============= 8. MAIN EXPORTED FUNCTIONS =============

/**
 * Load all tags from API and display them
 * @param {string|null} typeFilter - Optional type filter
 */
export async function loadTags(typeFilter = null) {
  try {
    // If no explicit filter, respect whatever the tag-type dropdown currently shows
    const effective = typeFilter !== null
      ? typeFilter
      : (document.getElementById('tagTypeFilter')?.value || null);

    let url = `${API_URL}/tags`;
    if (effective) {
      url += `?type=${encodeURIComponent(effective)}`;
    }
    
    const response = await fetch(url);
    const tags = await response.json();
    
    exposeTagsGlobally(tags);
    updateTagCounters(tags.length);
    displayTags(tags);

    // Re-apply client-side search text filter if the user has typed something
    const searchVal = document.getElementById('searchSourcesInput')?.value;
    if (searchVal) {
      const searchInput = document.getElementById('searchSourcesInput');
      if (searchInput) searchInput.dispatchEvent(new Event('input'));
    }
  } catch (error) {
    console.error("Error loading tags:", error);
    displayTagsError();
  }
}

/**
 * Delete a tag
 * @param {number} id - Tag ID
 * @param {string} name - Tag name
 */
export async function deleteTag(id, name) {
  const confirmDelete = confirm(
    `Are you sure you want to delete the tag "${name}"?\n\nThis will remove the tag from all quotes that have it. The quotes themselves will not be deleted.`
  );
  
  if (!confirmDelete) return;
  
  try {
    const data = await deleteTagApi(id);
    showNotification(data.message, "success");
    loadTags();
  } catch (error) {
    console.error("Error deleting tag:", error);
    showNotification(`Error: ${error.message}`, "error");
  }
}

/**
 * Set up tag operations event listeners (rename, merge)
 */
export function setupTagOperations() {
  setupRenameTagOperation();
  setupMergeTagsOperation();
}
