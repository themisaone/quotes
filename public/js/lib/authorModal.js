/**
 * authorModal.js
 * 
 * Author modal management using generic entityModal factory
 * 
 * Main exported functions:
 * - openAuthorModal(authorId, authorName, quoteCount) - Display author in modal
 * - setupAuthorModalHandlers(callbacks) - Setup event listeners
 * 
 * Dependencies:
 * - entityModal.js for modal management
 */

import { createEntityModalManager } from './entityModal.js';
import { getElementByIdSafe } from '../constants.js';

// ============= CONFIGURATION =============

const authorModalConfig = {
  entityName: 'Author',
  entityType: 'author',
  apiEndpoint: 'authors',
  modalId: 'authorModal',
  formId: 'authorForm',
  idInputId: 'authorId',
  nameInputId: 'authorName',
  imagePreviewId: 'authorImagePreview',
  deleteBtnId: 'deleteAuthorBtn',
  imageStorageKey: 'currentAuthorImage',
  
  // Get additional form elements (description field)
  getAdditionalFields() {
    return {
      descriptionInput: getElementByIdSafe('authorDescription', 'authorModal.getAdditionalFields')
    };
  },
  
  // Populate additional fields
  populateAdditionalFields(elements, author) {
    if (elements.descriptionInput) {
      elements.descriptionInput.value = author.description || '';
    }
  },
  
  // Get additional form data
  getAdditionalFormData() {
    const descriptionInput = getElementByIdSafe('authorDescription', 'getAdditionalFormData');
    return {
      description: descriptionInput ? descriptionInput.value.trim() : ''
    };
  },
  
  // Prepare additional payload for API
  prepareAdditionalPayload(data) {
    return {
      description: data.description
    };
  }
};

// ============= MODAL MANAGER =============

const authorModalManager = createEntityModalManager(authorModalConfig);

// ============= EXPORTED FUNCTIONS =============

/**
 * Open author modal for viewing/editing
 * @param {number} authorId - Author ID
 * @param {string} authorName - Author name
 * @param {number|null} quoteCount - Number of quotes by this author
 */
export async function openAuthorModal(authorId, authorName, quoteCount = null) {
  return authorModalManager.openModal(authorId, authorName, quoteCount);
}

/**
 * Set up event listeners for author modal
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onAuthorSaved - Called after author is saved
 * @param {Function} callbacks.onAuthorDeleted - Called after author is deleted
 */
export function setupAuthorModalHandlers(callbacks = {}) {
  // Map callback names to generic names
  const genericCallbacks = {
    onSaved: callbacks.onAuthorSaved,
    onDeleted: callbacks.onAuthorDeleted
  };
  
  return authorModalManager.setupHandlers(genericCallbacks);
}
