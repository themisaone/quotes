/**
 * ============================================================================
 * QUOTE EDITOR
 * ============================================================================
 * Manages the quote/note editing modal including Quill editor setup,
 * form submission, validation, and modal lifecycle.
 * 
 * Main functions:
 * - initializeQuillEditor() - Setup Quill rich text editor
 * - handleFormSubmit() - Process and save quote/note data
 * - deleteQuote() - Delete a quote with confirmation
 * - closeModal() - Close modal and reset state
 * 
 * Dependencies:
 * - Quill.js for rich text editing
 * - modalRenderer.js for modal setup
 */

import { FILTER_IDS, getElementByIdSafe, getElementValue } from '../constants.js';

// ============= CONSTANTS =============

const QUILL_TOOLBAR_CONFIG = [
  ['bold', 'italic', 'underline'],
  [{ 'header': [1, 2, 3, false] }],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  ['clean']
];

const QUILL_PLACEHOLDER = 'Enter the quote text...';

const KEYBOARD_SHORTCUTS = {
  ESCAPE: 'Escape',
  F11: 'F11'
};

// ============= STATE =============

let quillEditorInstance = null;

// ============= QUILL EDITOR INITIALIZATION =============

/**
 * Initialize Quill rich text editor
 * @param {string} editorSelector - CSS selector for editor element
 * @param {string} hiddenInputId - ID of hidden input to store HTML
 * @returns {Object} Quill editor instance
 */
export function initializeQuillEditor(editorSelector = '#quoteEditor', hiddenInputId = 'quoteText') {
  if (!document.querySelector(editorSelector)) {
    console.error(`Quill editor element not found: ${editorSelector}`);
    return null;
  }

  quillEditorInstance = new Quill(editorSelector, {
    theme: 'snow',
    modules: {
      toolbar: QUILL_TOOLBAR_CONFIG
    },
    placeholder: QUILL_PLACEHOLDER
  });
  
  // Update hidden field when content changes
  quillEditorInstance.on('text-change', function() {
    const html = quillEditorInstance.root.innerHTML;
    const hiddenInput = getElementByIdSafe(hiddenInputId, 'initializeQuillEditor');
    if (hiddenInput) {
      hiddenInput.value = html;
    }
  });
  
  // Setup fullscreen editor toggle
  setupFullscreenEditor();
  
  console.log('✅ Quill editor initialized');
  
  return quillEditorInstance;
}

/**
 * Get the current Quill editor instance
 * @returns {Object|null} Quill editor instance
 */
export function getQuillEditor() {
  return quillEditorInstance;
}

// ============= FULLSCREEN EDITOR =============

/**
 * Setup fullscreen editor toggle functionality
 */
function setupFullscreenEditor() {
  const toggleBtn = getElementByIdSafe('toggleFullscreenEditor', 'setupFullscreenEditor');
  const editorGroup = document.querySelector('.quote-editor-group');
  
  if (!toggleBtn || !editorGroup) return;
  
  let isFullscreen = false;
  
  toggleBtn.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    toggleFullscreenMode(isFullscreen, editorGroup, toggleBtn);
  });
  
  // ESC key to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === KEYBOARD_SHORTCUTS.ESCAPE && isFullscreen) {
      isFullscreen = false;
      toggleFullscreenMode(false, editorGroup, toggleBtn);
    }
    
    // F11 to toggle fullscreen
    if (e.key === KEYBOARD_SHORTCUTS.F11) {
      e.preventDefault();
      isFullscreen = !isFullscreen;
      toggleFullscreenMode(isFullscreen, editorGroup, toggleBtn);
    }
  });
}

/**
 * Toggle fullscreen mode for editor
 * @param {boolean} enable - Enable or disable fullscreen
 * @param {HTMLElement} editorGroup - Editor container element
 * @param {HTMLElement} toggleBtn - Toggle button element
 */
function toggleFullscreenMode(enable, editorGroup, toggleBtn) {
  if (enable) {
    // Enter fullscreen
    editorGroup.classList.add('fullscreen');
    toggleBtn.textContent = '✕';
    toggleBtn.title = 'Exit Fullscreen (Esc)';
    
    // Focus editor
    if (quillEditorInstance) {
      quillEditorInstance.focus();
    }
  } else {
    // Exit fullscreen
    editorGroup.classList.remove('fullscreen');
    toggleBtn.textContent = '⛶';
    toggleBtn.title = 'Fullscreen Editor (F11)';
  }
}

// ============= DATE PARSING =============

/**
 * Parse Norwegian date format (dd.mm.yyyy) to ISO format (YYYY-MM-DD)
 * @param {string} dateStr - Date string in dd.mm.yyyy format
 * @returns {string|null} ISO date string or null if invalid
 */
function parseNorwegianDate(dateStr) {
  if (!dateStr) return null;
  
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    const [_, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

// ============= FORM DATA COLLECTION =============

/**
 * Collect form data for quote submission
 * @param {Object} state - Current application state
 * @returns {Object} Form data object
 */
export function collectFormData(state) {
  const noteType = getElementValue(FILTER_IDS.NOTE_TYPE_SELECT, 'collectFormData');
  
  // Parse note_date for training notes
  let parsedNoteDate = null;
  if (noteType === 'training') {
    const noteDateInput = getElementValue(FILTER_IDS.NOTE_DATE_INPUT, 'collectFormData');
    parsedNoteDate = parseNorwegianDate(noteDateInput);
  }
  
  return {
    quote: getElementValue(FILTER_IDS.QUOTE_TEXT, 'collectFormData'),
    author: getElementValue(FILTER_IDS.AUTHOR_INPUT, 'collectFormData'),
    source: getElementValue(FILTER_IDS.SOURCE_INPUT, 'collectFormData'),
    sourceType: noteType === 'training' 
      ? (getElementValue(FILTER_IDS.TRAINING_TYPE_SELECT, 'collectFormData') || "ASSORTED")
      : (getElementValue(FILTER_IDS.SOURCE_TYPE_SELECT, 'collectFormData') || "ASSORTED"),
    sourceId: window.currentSourceId || null,
    tags: getElementValue(FILTER_IDS.TAG_INPUT, 'collectFormData'),
    note: getElementValue(FILTER_IDS.NOTE_INPUT, 'collectFormData'),
    score: document.querySelector('input[name="quoteScore"]:checked')?.value || "0",
    image: state.currentQuoteImage,
    image_full: state.currentQuoteImageFull,
    attachment_type: state.currentAttachmentType,
    note_type: noteType,
    note_date: parsedNoteDate,
    translation_group: getElementValue(FILTER_IDS.TRANSLATION_GROUP_INPUT, 'collectFormData').trim() || null,
    storageThresholdMB: state.globalSettings?.externalStorageThreshold || 1,
  };
}

// ============= FORM SUBMISSION =============

/**
 * Handle form submission (create or update quote)
 * @param {Event} e - Submit event
 * @param {Object} config - Configuration object with state and callbacks
 * @returns {Promise<void>}
 */
export async function handleFormSubmit(e, config) {
  e.preventDefault();

  const { apiUrl, state, callbacks } = config;
  const quoteData = collectFormData(state);

  console.log("Submitting quote data:", quoteData);

  try {
    let response;
    if (state.editingQuoteId) {
      response = await fetch(`${apiUrl}/quotes/${state.editingQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    } else {
      response = await fetch(`${apiUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    }

    if (response.ok) {
      if (callbacks.onSuccess) {
        callbacks.onSuccess();
      }
    } else {
      const errorData = await response.json();
      const errorMsg = errorData.error || "Please try again.";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert("Failed to save quote: " + errorMsg);
      }
    }
  } catch (error) {
    console.error("Error saving quote:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to save quote. Please try again.");
    }
  }
}

// ============= QUOTE DELETION =============

/**
 * Delete a quote with confirmation
 * @param {number} id - Quote ID
 * @param {string} apiUrl - API URL
 * @param {Object} callbacks - Success/error callbacks
 * @returns {Promise<void>}
 */
export async function deleteQuote(id, apiUrl, callbacks) {
  if (!confirm("Are you sure you want to delete this quote?")) {
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/quotes/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      if (callbacks.onSuccess) {
        callbacks.onSuccess();
      }
    } else {
      const errorMsg = "Failed to delete quote";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  } catch (error) {
    console.error("Error deleting quote:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to delete quote. Please try again.");
    }
  }
}

// ============= MODAL LIFECYCLE =============

/**
 * Close modal and reset state
 * @param {Object} elements - DOM elements to reset
 * @param {Function} resetStateCallback - Callback to reset app state
 */
export function closeModal(elements, resetStateCallback) {
  if (elements.modal) {
    elements.modal.style.display = "none";
  }
  
  if (elements.form) {
    elements.form.reset();
  }
  
  if (quillEditorInstance) {
    quillEditorInstance.setText('');
  }
  
  // Reset autocomplete suggestions
  if (elements.authorSuggestions) {
    elements.authorSuggestions.classList.remove("show");
  }
  if (elements.sourceSuggestions) {
    elements.sourceSuggestions.classList.remove("show");
  }
  
  // Reset app state via callback
  if (resetStateCallback) {
    resetStateCallback();
  }
}

// ============= INITIALIZATION =============

/**
 * Initialize quote editor with all event listeners
 * @param {Object} config - Configuration object
 * @returns {Object} Editor instance and cleanup function
 */
export function initializeQuoteEditor(config) {
  const {
    editorSelector,
    hiddenInputId,
    formElement,
    apiUrl,
    state,
    callbacks
  } = config;
  
  // Initialize Quill editor
  const editor = initializeQuillEditor(editorSelector, hiddenInputId);
  
  // Setup form submission
  if (formElement) {
    const submitHandler = (e) => handleFormSubmit(e, { apiUrl, state, callbacks });
    formElement.addEventListener('submit', submitHandler);
    
    // Return cleanup function
    return {
      editor,
      cleanup: () => {
        formElement.removeEventListener('submit', submitHandler);
      }
    };
  }
  
  return { editor, cleanup: () => {} };
}
