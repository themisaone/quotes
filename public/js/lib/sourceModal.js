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
import { getElementByIdSafe, BUTTON_IDS } from '../constants.js';

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
      typeSelect: getElementByIdSafe('sourceTypeEdit', 'sourceModal.getAdditionalFields')
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
    const typeSelect = getElementByIdSafe('sourceTypeEdit', 'getAdditionalFormData');
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
  
  // Populate type dropdown when modal opens (after settings are loaded)
  onBeforeOpen(data, callbacks) {
    const typeSelect = getElementByIdSafe('sourceTypeEdit', 'onBeforeOpen');
    
    if (typeSelect && callbacks.getQuoteTypes) {
      const quoteTypes = callbacks.getQuoteTypes();
      typeSelect.innerHTML = quoteTypes
        .map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`)
        .join('');
    }
  },
  
  // Called after modal is opened and populated
  onModalOpen(elements, entity) {
    console.log('🔍 Source modal opened, entity:', entity);
    
    // First, ensure the attachment container is visible
    const attachmentContainer = document.getElementById('sourceAttachmentContainer');
    if (attachmentContainer) {
      attachmentContainer.style.display = 'block';
      console.log('📦 Attachment container set to visible');
    }
    
    // Update attachment panel visibility and clear button state
    try {
      const clearBtn = document.getElementById(BUTTON_IDS.CLEAR_SOURCE_IMAGE);
      if (clearBtn) {
        clearBtn.style.display = entity.image ? 'flex' : 'none';
        console.log('Source modal: clear button display set to', entity.image ? 'flex' : 'none');
      }
    } catch (e) {
      console.warn('Could not update clear button:', e);
    }
    
    // Call the global toggle function if it exists
    // Give it a moment for the DOM to update
    setTimeout(() => {
      if (window.toggleSourceAttachmentPanel) {
        console.log('🔄 Calling toggleSourceAttachmentPanel');
        window.toggleSourceAttachmentPanel();
      }
    }, 50);
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
