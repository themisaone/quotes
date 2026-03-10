/**
 * entityModal.js
 * 
 * Generic modal management for entities (authors, sources, etc.)
 * 
 * Architecture:
 * 1. DOM Helpers - Element selection and validation
 * 2. Data Management - Fetch and populate entity data
 * 3. UI Updates - Image display, button state, modal visibility
 * 4. API Operations - Save and delete
 * 5. Event Handlers - Setup and callbacks
 * 
 * Main exported function:
 * - createEntityModalManager(config) - Create modal manager for an entity type
 * 
 * Dependencies:
 * - api.js for API_URL
 * - attachments.js for image display
 */

import { API_URL } from './api.js';
import { displayImage, clearImagePreview } from './attachments.js';

// ============= 1. DOM HELPERS =============

/**
 * Get modal elements based on entity type
 */
function getModalElements(config) {
  const modal = document.getElementById(config.modalId);
  
  return {
    modal: modal,
    idInput: document.getElementById(config.idInputId),
    nameInput: document.getElementById(config.nameInputId),
    imagePreview: document.getElementById(config.imagePreviewId),
    deleteBtn: document.getElementById(config.deleteBtnId),
    // Close buttons - try both .close selector (X button) and dedicated IDs
    closeBtn: modal?.querySelector('.close'),
    cancelBtn: document.getElementById(`cancel${config.entityName}Btn`),
    // Additional fields (optional)
    ...config.getAdditionalFields?.()
  };
}

/**
 * Validate required modal elements exist
 */
function validateModalElements(elements, config) {
  const required = [elements.modal, elements.idInput, elements.nameInput];
  
  if (required.some(el => !el)) {
    console.error(`${config.entityName} modal elements not found`);
    return false;
  }
  return true;
}

/**
 * Store entity image in window for form submission
 */
function storeEntityImage(image, config) {
  window[config.imageStorageKey] = image;
}

// ============= 2. DATA MANAGEMENT =============

/**
 * Fetch entity data from API
 */
async function fetchEntityData(entityId, config) {
  const response = await fetch(`${API_URL}/${config.apiEndpoint}/${entityId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${config.entityName} data`);
  }
  return response.json();
}

/**
 * Populate form fields with entity data
 */
function populateFormFields(elements, entity, config) {
  elements.idInput.value = entity.id;
  elements.nameInput.value = entity.name;
  
  // Populate additional fields if configured
  if (config.populateAdditionalFields) {
    config.populateAdditionalFields(elements, entity);
  }
}

/**
 * Handle entity image display
 */
function handleImageDisplay(elements, entity, config) {
  storeEntityImage(entity.image, config);
  
  if (!elements.imagePreview) return;
  
  if (entity.image) {
    displayImage(elements.imagePreview, entity.image);
  } else {
    clearImagePreview(elements.imagePreview, config.entityType);
  }
}

/**
 * Determine quote count (from parameter or API response)
 */
function getQuoteCount(providedCount, entityData) {
  if (providedCount !== null) {
    return providedCount;
  }
  if (entityData.quote_count !== undefined) {
    return parseInt(entityData.quote_count) || 0;
  }
  return null;
}

// ============= 3. UI UPDATES =============

/**
 * Configure delete button visibility and data
 */
function configureDeleteButton(elements, entity, quoteCount, config) {
  if (!elements.deleteBtn) return;
  
  const canDelete = quoteCount !== null && quoteCount === 0;
  
  if (canDelete) {
    elements.deleteBtn.style.display = "inline-block";
    elements.deleteBtn.dataset[`${config.entityType}Id`] = entity.id;
    elements.deleteBtn.dataset[`${config.entityType}Name`] = entity.name;
  } else {
    elements.deleteBtn.style.display = "none";
  }
}

/**
 * Show modal
 */
function showModal(modal) {
  modal.style.display = "block";
}

/**
 * Hide modal
 */
function hideModal(modal) {
  if (modal) {
    modal.style.display = "none";
  }
}

// ============= 4. API OPERATIONS =============

/**
 * Get form data for entity update
 */
function getFormData(config) {
  const id = document.getElementById(config.idInputId).value;
  const name = document.getElementById(config.nameInputId).value.trim();
  const image = window[config.imageStorageKey] || null;
  
  const data = { id, name, image };
  
  // Get additional field data if configured
  if (config.getAdditionalFormData) {
    Object.assign(data, config.getAdditionalFormData());
  }
  
  return data;
}

/**
 * Validate form data
 */
function validateFormData(data, config) {
  if (!data.name) {
    alert(`${config.entityName} name is required`);
    return false;
  }
  return true;
}

/**
 * Prepare API payload
 */
function prepareApiPayload(data, config) {
  const payload = {
    name: data.name,
    image: data.image
  };
  
  // Add additional fields to payload if configured
  if (config.prepareAdditionalPayload) {
    Object.assign(payload, config.prepareAdditionalPayload(data));
  }
  
  return payload;
}

/**
 * Update entity via API
 */
async function updateEntityApi(entityId, data, config) {
  const payload = prepareApiPayload(data, config);
  
  const response = await fetch(`${API_URL}/${config.apiEndpoint}/${entityId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update ${config.entityName}`);
  }
  
  return response.json();
}

/**
 * Delete entity via API
 */
async function deleteEntityApi(entityId, config) {
  const response = await fetch(`${API_URL}/${config.apiEndpoint}/${entityId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete ${config.entityName}`);
  }
  
  return response.json();
}

// ============= 5. EVENT HANDLERS =============

/**
 * Handle form submit event
 */
async function handleFormSubmit(e, modal, config, callbacks) {
  e.preventDefault();
  
  const data = getFormData(config);
  if (!validateFormData(data, config)) return;
  
  try {
    await updateEntityApi(data.id, data, config);
    hideModal(modal);
    
    if (callbacks.onSaved) {
      callbacks.onSaved();
    }
  } catch (error) {
    console.error(`Error updating ${config.entityName}:`, error);
    alert(`Failed to update ${config.entityName}`);
  }
}

/**
 * Handle delete button click
 */
async function handleDeleteClick(button, modal, config, callbacks) {
  const entityId = button.dataset[`${config.entityType}Id`];
  const entityName = button.dataset[`${config.entityType}Name`];
  
  if (!confirm(`Delete ${config.entityName} "${entityName}"? This cannot be undone.`)) {
    return;
  }
  
  try {
    await deleteEntityApi(entityId, config);
    hideModal(modal);
    
    if (callbacks.onDeleted) {
      callbacks.onDeleted();
    }
  } catch (error) {
    console.error(`Error deleting ${config.entityName}:`, error);
    alert(`Failed to delete ${config.entityName}. It may still have associated quotes.`);
  }
}

/**
 * Setup close button handlers (both X and Cancel)
 */
function setupCloseHandler(modal, elements, config) {
  // Close button (X)
  if (elements.closeBtn) {
    elements.closeBtn.addEventListener('click', () => hideModal(modal));
  }
  
  // Cancel button
  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener('click', () => hideModal(modal));
  }
}

/**
 * Setup form submit handler
 */
function setupFormHandler(form, modal, config, callbacks) {
  if (!form) return;
  
  form.addEventListener('submit', (e) => {
    handleFormSubmit(e, modal, config, callbacks);
  });
}

/**
 * Setup delete button handler
 */
function setupDeleteHandler(deleteBtn, modal, config, callbacks) {
  if (!deleteBtn) return;
  
  deleteBtn.addEventListener('click', function() {
    handleDeleteClick(this, modal, config, callbacks);
  });
}

// ============= MAIN EXPORTED FUNCTION =============

/**
 * Create an entity modal manager
 * @param {Object} config - Configuration object
 * @param {string} config.entityName - Display name (e.g., "Author", "Source")
 * @param {string} config.entityType - Type identifier (e.g., "author", "source")
 * @param {string} config.apiEndpoint - API endpoint (e.g., "authors", "sources")
 * @param {string} config.modalId - Modal element ID
 * @param {string} config.formId - Form element ID
 * @param {string} config.idInputId - ID input element ID
 * @param {string} config.nameInputId - Name input element ID
 * @param {string} config.imagePreviewId - Image preview element ID
 * @param {string} config.deleteBtnId - Delete button element ID
 * @param {string} config.imageStorageKey - Window property name for image storage
 * @param {Function} config.getAdditionalFields - Optional: Get additional form elements
 * @param {Function} config.populateAdditionalFields - Optional: Populate additional fields
 * @param {Function} config.getAdditionalFormData - Optional: Extract additional form data
 * @param {Function} config.prepareAdditionalPayload - Optional: Add to API payload
 * @param {Function} config.onSetup - Optional: Additional setup for handlers
 */
export function createEntityModalManager(config) {
  return {
    /**
     * Open modal for viewing/editing entity
     * @param {number} entityId - Entity ID
     * @param {string} entityName - Entity name
     * @param {number|null} quoteCount - Number of associated quotes
     * @param {*} additionalParams - Additional parameters
     */
    async openModal(entityId, entityName, quoteCount = null, additionalParams = {}) {
      const elements = getModalElements(config);
      
      if (!validateModalElements(elements, config)) {
        return;
      }
      
      try {
        const entity = await fetchEntityData(entityId, config);
        
        populateFormFields(elements, entity, config);
        handleImageDisplay(elements, entity, config);
        
        const finalQuoteCount = getQuoteCount(quoteCount, entity);
        configureDeleteButton(elements, entity, finalQuoteCount, config);
        
        // Additional setup if configured
        if (config.onModalOpen) {
          config.onModalOpen(elements, entity, additionalParams);
        }
        
        showModal(elements.modal);
      } catch (error) {
        console.error(`Error loading ${config.entityName}:`, error);
        alert(`Failed to load ${config.entityName} details`);
      }
    },

    /**
     * Setup event handlers for modal
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.onSaved - Called after entity is saved
     * @param {Function} callbacks.onDeleted - Called after entity is deleted
     */
    setupHandlers(callbacks = {}) {
      const elements = getModalElements(config);
      const form = document.getElementById(config.formId);
      
      // Additional setup if configured (e.g., populate dropdowns)
      if (config.onSetup) {
        config.onSetup(callbacks);
      }
      
      setupCloseHandler(elements.modal, elements, config);
      setupFormHandler(form, elements.modal, config, callbacks);
      setupDeleteHandler(elements.deleteBtn, elements.modal, config, callbacks);
    }
  };
}
