/**
 * sourceModal.js
 * 
 * Source modal management using generic entityModal factory
 * 
 * Main exported functions:
 * - openSourceModal(sourceId, sourceName, sourceType, quoteCount) - Display source in modal
 * - setupSourceModalHandlers(callbacks) - Setup event listeners
 * 
 * Dependencies:
 * - entityModal.js for modal management
 */

import { createEntityModalManager } from './entityModal.js';

// ============= CONFIGURATION =============

const sourceModalConfig = {
  entityName: 'Source',
  entityType: 'source',
  apiEndpoint: 'sources',
  modalId: 'sourceModal',
  formId: 'sourceForm',
  idInputId: 'sourceId',
  nameInputId: 'sourceName',
  imagePreviewId: 'sourceImagePreview',
  deleteBtnId: 'deleteSourceBtn',
  imageStorageKey: 'currentSourceImage',
  
  // Get additional form elements (type dropdown)
  getAdditionalFields() {
    return {
      typeSelect: document.getElementById('sourceTypeEdit')
    };
  },
  
  // Populate additional fields
  populateAdditionalFields(elements, source) {
    if (elements.typeSelect) {
      elements.typeSelect.value = source.type || "BOOK";
    }
  },
  
  // Get additional form data
  getAdditionalFormData() {
    const typeSelect = document.getElementById('sourceTypeEdit');
    return {
      type: typeSelect ? typeSelect.value : 'BOOK'
    };
  },
  
  // Prepare additional payload for API
  prepareAdditionalPayload(data) {
    return {
      type: data.type
    };
  },
  
  // Setup type dropdown with quote types
  onSetup(callbacks) {
    const typeSelect = document.getElementById('sourceTypeEdit');
    
    if (typeSelect && callbacks.getQuoteTypes) {
      const quoteTypes = callbacks.getQuoteTypes();
      typeSelect.innerHTML = quoteTypes
        .map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`)
        .join('');
    }
  }
};

// ============= MODAL MANAGER =============

const sourceModalManager = createEntityModalManager(sourceModalConfig);

// ============= EXPORTED FUNCTIONS =============

/**
 * Open source modal for viewing/editing
 * @param {number} sourceId - Source ID
 * @param {string} sourceName - Source name
 * @param {string} sourceType - Source type (BOOK, MOVIE-TV, etc.)
 * @param {number|null} quoteCount - Number of quotes from this source
 */
export async function openSourceModal(sourceId, sourceName, sourceType, quoteCount = null) {
  return sourceModalManager.openModal(sourceId, sourceName, quoteCount, { sourceType });
}

/**
 * Set up event listeners for source modal
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onSourceSaved - Called after source is saved
 * @param {Function} callbacks.onSourceDeleted - Called after source is deleted
 * @param {Function} callbacks.getQuoteTypes - Function to get quote types for dropdown
 */
export function setupSourceModalHandlers(callbacks = {}) {
  // Map callback names to generic names, preserve getQuoteTypes
  const genericCallbacks = {
    onSaved: callbacks.onSourceSaved,
    onDeleted: callbacks.onSourceDeleted,
    getQuoteTypes: callbacks.getQuoteTypes
  };
  
  return sourceModalManager.setupHandlers(genericCallbacks);
}
