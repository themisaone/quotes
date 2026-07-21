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

import { createEntityModalManager } from './entityModal.js?v=20260721entityimages1';
import { getElementByIdSafe, BUTTON_IDS } from '../constants.js';

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
  },
  
  // Called after modal is opened and populated
  onModalOpen(elements, entity) {
    console.log('🔍 Author modal opened, entity:', entity);
    
    // Update attachment panel visibility and clear button state
    try {
      const clearBtn = document.getElementById(BUTTON_IDS.CLEAR_AUTHOR_IMAGE);
      if (clearBtn) {
        clearBtn.style.display = entity.image ? 'flex' : 'none';
        console.log('Author modal: clear button display set to', entity.image ? 'flex' : 'none');
      }
    } catch (e) {
      console.warn('Could not update clear button:', e);
    }
    
    if (window.toggleAuthorAttachmentPanel) {
      window.toggleAuthorAttachmentPanel();
    }

    const showNotesBtn = document.getElementById('authorModalShowNotesBtn');
    if (showNotesBtn) {
      const n = parseInt(entity.quote_count, 10) || 0;
      showNotesBtn.textContent = `Show notes (${n})`;
    }
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
  const genericCallbacks = {
    onSaved: callbacks.onAuthorSaved,
    onDeleted: callbacks.onAuthorDeleted
  };

  authorModalManager.setupHandlers(genericCallbacks);

  const showNotesBtn = getElementByIdSafe('authorModalShowNotesBtn', 'setupAuthorModalHandlers');
  if (showNotesBtn && !showNotesBtn.dataset.boundShowNotes) {
    showNotesBtn.dataset.boundShowNotes = '1';
    showNotesBtn.addEventListener('click', () => {
      const name = getElementByIdSafe('authorName', 'authorModalShowNotes')?.value?.trim();
      if (!name) return;
      const modal = getElementByIdSafe('authorModal', 'authorModalShowNotes');
      if (modal) modal.style.display = 'none';
      if (typeof window.filterByAuthor === 'function') {
        window.filterByAuthor(name);
      }
    });
  }

}
