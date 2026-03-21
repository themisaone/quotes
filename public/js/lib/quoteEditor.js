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

import { MODAL_IDS, getElementByIdSafe, getElementValue } from '../constants.js';
import { downscaleImage } from './attachments.js';
import { getNoteTypeConfig } from './noteTypes.js';
import { showConfirm } from './confirmDialog.js';

// ============= CONSTANTS =============

const QUILL_TOOLBAR_CONFIG = [
  ['bold', 'italic', 'underline'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'header': [1, 2, 3, false] }],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  ['image'],
  ['clean']
];

// Max dimension (px) for images inserted inline into Quill
const INLINE_IMAGE_MAX_PX = 1200;

const QUILL_PLACEHOLDER = 'Enter the quote text...';

const KEYBOARD_SHORTCUTS = {
  ESCAPE: 'Escape',
  F11: 'F11'
};

// ============= STATE =============

let quillEditorInstance = null;

// ============= HELPERS =============

function _readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Show a small size-picker dialog and resolve with the chosen max dimension.
 * Resolves with null if cancelled.
 */
function _showImageSizeDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: #fff; border-radius: 10px; padding: 1.5rem 2rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25); min-width: 260px; text-align: center;
    `;

    box.innerHTML = `
      <p style="margin: 0 0 1rem; font-weight: 600; font-size: 1rem; color: #1e293b;">
        📐 Image size (longest side)
      </p>
    `;

    const sizes = [300, 500, 1200];
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 0.6rem; justify-content: center; margin-bottom: 0.9rem;';

    sizes.forEach(px => {
      const btn = document.createElement('button');
      btn.textContent = `${px}px`;
      btn.style.cssText = `
        padding: 0.5rem 1rem; border: none; border-radius: 6px;
        background: #1e40af; color: #fff; font-size: 0.9rem;
        cursor: pointer; font-weight: 500;
      `;
      btn.onmouseenter = () => btn.style.background = '#1d4ed8';
      btn.onmouseleave = () => btn.style.background = '#1e40af';
      btn.onclick = () => { document.body.removeChild(overlay); resolve(px); };
      btnRow.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 0.4rem 1rem; border: 1px solid #cbd5e1; border-radius: 6px;
      background: #f1f5f9; color: #475569; font-size: 0.85rem; cursor: pointer;
    `;
    cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(null); };

    box.appendChild(btnRow);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };
    document.body.appendChild(overlay);
  });
}

/**
 * Downscale base64 image to chosen size and insert into Quill at current cursor.
 */
async function _insertInlineImage(base64) {
  const maxPx = await _showImageSizeDialog();
  if (maxPx === null) return; // cancelled
  try {
    const downscaled = await downscaleImage(base64, maxPx, maxPx);
    const range = quillEditorInstance.getSelection(true);
    const idx = range ? range.index : quillEditorInstance.getLength();
    quillEditorInstance.insertEmbed(idx, 'image', downscaled);
    quillEditorInstance.setSelection(idx + 1);
  } catch (err) {
    console.error('Error inserting inline image:', err);
  }
}

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

  // Custom image toolbar handler — opens file picker, shows size dialog, inserts inline
  const toolbar = quillEditorInstance.getModule('toolbar');
  toolbar.addHandler('image', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const base64 = await _readFileAsBase64(file);
      await _insertInlineImage(base64);
    };
    input.click();
  });

  // Intercept clipboard paste — show size dialog before embedding
  quillEditorInstance.root.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const base64 = await _readFileAsBase64(item.getAsFile());
        await _insertInlineImage(base64);
        break;
      }
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
 * Read the group input that is actually visible for the given note type.
 * Using || across all three inputs fails when the user clears the visible one,
 * because the hidden inputs still hold the old value from when the modal opened.
 */
function _readGroupInput(noteType) {
  const behavior = getNoteTypeConfig(noteType)?.behavior;
  const raw = behavior === 'generic'
    ? getElementValue('genericTranslationGroup')
    : (getElementValue(MODAL_IDS.TRANSLATION_GROUP_INPUT) ||
       getElementValue('quoteTranslationGroup'));
  return raw.trim() || null;
}

/**
 * Collect form data for quote submission
 * @param {Object} state - Current application state
 * @returns {Object} Form data object
 */
export function collectFormData(state) {
  const noteType = getElementValue(MODAL_IDS.NOTE_TYPE_SELECT);
  
  // Parse note_date for training notes
  let parsedNoteDate = null;
  if (noteType === 'training') {
    const noteDateInput = getElementValue(MODAL_IDS.NOTE_DATE_INPUT);
    parsedNoteDate = parseNorwegianDate(noteDateInput);
  }
  
  return {
    note_text: getElementValue(MODAL_IDS.QUOTE_TEXT),
    author: getElementValue(MODAL_IDS.AUTHOR_INPUT),
    source: getElementValue(MODAL_IDS.SOURCE_INPUT),
    sourceType: noteType === 'training' 
      ? getElementValue(MODAL_IDS.TRAINING_TYPE_SELECT)
      : (getElementValue(MODAL_IDS.SOURCE_TYPE_SELECT) || "ASSORTED"),
    sourceId: window.currentSourceId || null,
    tags: getElementValue(MODAL_IDS.TAG_INPUT),
    comment: getElementValue(MODAL_IDS.COMMENT_INPUT),
    score: document.querySelector('input[name="quoteScore"]:checked')?.value || "0",
    thumbnail: state.currentQuoteImage,
    attachment_full: state.currentQuoteImageFull,
    attachment_type: state.currentAttachmentType,
    note_type: noteType,
    note_date: parsedNoteDate,
    translation_group: _readGroupInput(noteType),
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

  // Validate training type is selected
  if (quoteData.note_type === 'training' && !quoteData.sourceType) {
    const select = document.getElementById('trainingType');
    if (select) {
      select.style.outline = '2px solid #e74c3c';
      select.style.borderColor = '#e74c3c';
      setTimeout(() => {
        select.style.outline = '';
        select.style.borderColor = '';
      }, 3000);
    }
    alert('⚠️ Please select a Training Type before saving.');
    return;
  }

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
        const savedNote = await response.json().catch(() => null);
        callbacks.onSuccess(savedNote);
      }
    } else {
      const errorData = await response.json();
      const errorMsg = errorData.error || "Please try again.";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert("Failed to save note: " + errorMsg);
      }
    }
  } catch (error) {
    console.error("Error saving note:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to save note. Please try again.");
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
  if (!await showConfirm("Delete this note? This cannot be undone.", { danger: true, title: "Delete note" })) {
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
      const errorMsg = "Failed to delete note";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  } catch (error) {
    console.error("Error deleting note:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to delete note. Please try again.");
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
