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
import { downscaleImage } from './attachments.js?v=20260720pastesource1';
import { getNoteTypeConfig, hasDateField, hasGenericSubTypeField } from './noteTypes.js';
import { showConfirm } from './confirmDialog.js';
import { escapeHtml } from './utils.js?v=20260703color1';

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
async function _insertInlineImageFor(quill, base64) {
  const maxPx = await _showImageSizeDialog();
  if (maxPx === null) return; // cancelled
  try {
    const downscaled = await downscaleImage(base64, maxPx, maxPx);
    const range = quill.getSelection(true);
    const idx = range ? range.index : quill.getLength();
    quill.insertEmbed(idx, 'image', downscaled);
    quill.setSelection(idx + 1);
  } catch (err) {
    console.error('Error inserting inline image:', err);
  }
}

function _isEmptyPasteBlock(el) {
  if (!el || !/^(P|DIV)$/i.test(el.tagName)) return false;
  return !el.textContent.trim() && !el.querySelector('img');
}

function _isContentPasteBlock(el) {
  if (!el || !/^(P|DIV)$/i.test(el.tagName)) return false;
  return !!el.textContent.trim() || !!el.querySelector('img');
}

/** Remove empty blocks copied between every line; keep isolated stanza gaps. */
function _removeSpuriousEmptyBlocks(body) {
  const children = [...body.children];
  const contentCount = children.filter(_isContentPasteBlock).length;
  const emptyCount = children.filter(_isEmptyPasteBlock).length;
  if (contentCount >= 2 && emptyCount >= contentCount - 1) {
    children.filter(_isEmptyPasteBlock).forEach((el) => el.remove());
  }
}

/** Strip browser clipboard wrappers; keep paragraph markup Quill understands. */
function _sanitizePasteHtml(rawHtml) {
  if (!rawHtml) return '';
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const body = doc.body;
  _removeSpuriousEmptyBlocks(body);
  return (body.innerHTML || '')
    .replace(/<!--StartFragment-->/gi, '')
    .replace(/<!--EndFragment-->/gi, '')
    .trim();
}

/**
 * Plain text from copy often has blank lines between every Quill paragraph.
 * Collapse that pattern but keep a stanza gap (one blank line between groups).
 */
function _plainTextToQuillHtml(text) {
  let normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');

  let wasCopyArtifact = false;
  const nonEmptyLines = normalized.split('\n').filter((line) => line.length > 0).length;
  const doubleNewlineCount = (normalized.match(/\n\n/g) || []).length;
  if (doubleNewlineCount >= nonEmptyLines - 1 && doubleNewlineCount > 0) {
    normalized = normalized.replace(/\n\n/g, '\n');
    wasCopyArtifact = true;
  }

  if (wasCopyArtifact) {
    return normalized.split('\n')
      .filter((line) => line.length > 0)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('');
  }

  const stanzas = normalized.split(/\n{2,}/);
  return stanzas.map((stanza) => {
    const lines = stanza.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) return '';
    if (lines.length === 1) return `<p>${escapeHtml(lines[0])}</p>`;
    return `<p>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`;
  }).join('');
}

function _buildPasteHtml(html, plain) {
  const htmlText = html?.trim() ?? '';
  if (htmlText) {
    const sanitized = _sanitizePasteHtml(htmlText);
    if (sanitized) return sanitized;
  }
  const plainText = plain ?? '';
  if (plainText) return _plainTextToQuillHtml(plainText);
  return '';
}

function _cleanupEditorAfterPaste(quill) {
  _removeSpuriousEmptyBlocks(quill.root);
  const last = quill.root.lastElementChild;
  if (last && _isEmptyPasteBlock(last) && quill.root.querySelectorAll('p,div').length > 1) {
    last.remove();
  }
}

function _insertPasteHtml(quill, pasteHtml) {
  const range = quill.getSelection(true);
  const index = range ? range.index : Math.max(0, quill.getLength() - 1);
  const length = range ? range.length : 0;
  if (length) {
    quill.deleteText(index, length, 'user');
  }
  quill.clipboard.dangerouslyPasteHTML(index, pasteHtml, 'user');
  _cleanupEditorAfterPaste(quill);
}

function _patchQuillCopy(quill) {
  if (!quill || quill.root._misaCopyPatched) return;
  quill.root._misaCopyPatched = true;

  quill.root.addEventListener('copy', (e) => {
    if (!quill.isEnabled()) return;
    const range = quill.getSelection();
    if (!range || range.length === 0) return;

    const plain = quill.getText(range.index, range.length).replace(/\n+$/, '');

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const domRange = sel.getRangeAt(0);
    const wrapper = document.createElement('div');
    wrapper.appendChild(domRange.cloneContents());
    _removeSpuriousEmptyBlocks(wrapper);
    const html = wrapper.innerHTML.trim();
    if (!plain && !html) return;

    e.preventDefault();
    e.stopPropagation();
    e.clipboardData.setData('text/plain', plain);
    if (html) {
      e.clipboardData.setData('text/html', html);
    }
  }, true);
}

function _pasteTextIntoQuill(quill, e) {
  if (e.defaultPrevented) return false;

  const cd = e.clipboardData;
  if (!cd) return false;

  for (const item of cd.items || []) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const file = item.getAsFile();
      if (file) {
        _readFileAsBase64(file).then((base64) => _insertInlineImageFor(quill, base64));
      }
      return true;
    }
  }

  const plain = cd.getData('text/plain') ?? '';
  const html = cd.getData('text/html')?.trim() ?? '';
  if (!plain && !html) return false;

  const pasteHtml = _buildPasteHtml(html, plain);
  if (!pasteHtml) return false;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  _insertPasteHtml(quill, pasteHtml);
  return true;
}

let _globalQuillClipboardInstalled = false;

function _installGlobalQuillPasteGuard() {
  if (_globalQuillClipboardInstalled) return;
  _globalQuillClipboardInstalled = true;

  document.addEventListener('paste', (e) => {
    const editorEl = e.target?.closest?.('.ql-editor');
    if (!editorEl) return;
    const quill = Quill.find(editorEl);
    if (!quill?.isEnabled()) return;
    _pasteTextIntoQuill(quill, e);
  }, true);
}

function _patchQuillClipboard(quill) {
  if (!quill) return;
  _installGlobalQuillPasteGuard();
  if (!quill.root._misaPastePatched) {
    quill.root._misaPastePatched = true;
    quill.root.addEventListener('paste', (e) => {
      if (!quill.isEnabled()) return;
      _pasteTextIntoQuill(quill, e);
    }, true);
  }
  _patchQuillCopy(quill);
}

/** Ensure paste/copy normalization is active (e.g. after recovering an existing instance). */
export function ensureQuillPasteHandler(quill) {
  if (quill) _patchQuillClipboard(quill);
}

function _ensureQuillEditorShell(container, toolbar) {
  if (!container || !toolbar || container.parentElement?.classList.contains('quill-editor-shell')) {
    return container.parentElement?.classList.contains('quill-editor-shell')
      ? container.parentElement
      : null;
  }

  const parent = container.parentElement;
  if (!parent) return null;

  const shell = document.createElement('div');
  shell.className = 'quill-editor-shell';
  if (container.id) shell.dataset.quillHost = container.id;

  for (const prop of ['height', 'minHeight', 'maxHeight']) {
    if (container.style[prop]) {
      shell.style[prop] = container.style[prop];
      container.style[prop] = '';
    }
  }

  parent.insertBefore(shell, container);
  shell.appendChild(container);
  shell.appendChild(toolbar);
  return shell;
}

/** Quill snow theme inserts the toolbar as a sibling before the editor container. */
export function moveQuillToolbarToBottom(hostEl) {
  if (!hostEl) return;

  const container = hostEl.classList.contains('ql-container')
    ? hostEl
    : hostEl.querySelector(':scope > .ql-container');
  if (!container) return;

  let toolbar = container.previousElementSibling;
  if (!toolbar?.classList.contains('ql-toolbar')) {
    toolbar = container.parentElement?.querySelector(':scope > .ql-toolbar') || null;
  }
  if (!toolbar || toolbar === container) return;

  if (toolbar.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING) {
    container.after(toolbar);
  }

  _ensureQuillEditorShell(container, toolbar);
}

function _wireQuillInstance(quill, hiddenInputId, { onTextChange } = {}) {
  quill.on('text-change', (delta, oldDelta, source) => {
    const html = quill.root.innerHTML;
    const hiddenInput = getElementByIdSafe(hiddenInputId);
    if (hiddenInput) hiddenInput.value = html;
    onTextChange?.(source);
  });

  const toolbar = quill.getModule('toolbar');
  toolbar.addHandler('image', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const base64 = await _readFileAsBase64(file);
      await _insertInlineImageFor(quill, base64);
    };
    input.click();
  });

  _patchQuillClipboard(quill);
}

// ============= QUILL EDITOR INITIALIZATION =============

/**
 * Create a Quill editor on any selector (does not replace the modal singleton).
 */
export function createQuillEditor(editorSelector, hiddenInputId = 'quoteText', options = {}) {
  if (!document.querySelector(editorSelector)) {
    console.error(`Quill editor element not found: ${editorSelector}`);
    return null;
  }

  const hostEl = document.querySelector(editorSelector);
  const quill = new Quill(hostEl, {
    theme: 'snow',
    modules: {
      toolbar: QUILL_TOOLBAR_CONFIG,
      // pre-wrap + matchVisual inserts extra blank lines when pasting copied editor text
      clipboard: { matchVisual: false },
    },
    placeholder: options.placeholder || QUILL_PLACEHOLDER,
  });
  moveQuillToolbarToBottom(hostEl);
  _wireQuillInstance(quill, hiddenInputId, options);
  return quill;
}

/**
 * Initialize Quill rich text editor (modal — stored as singleton)
 */
export function initializeQuillEditor(editorSelector = '#quoteEditor', hiddenInputId = 'quoteText') {
  quillEditorInstance = createQuillEditor(editorSelector, hiddenInputId);
  if (!quillEditorInstance) return null;

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
 * Three separate inputs exist (quote/training/generic); all three get
 * pre-filled when the modal opens, so falling back via || would return a
 * stale value from a hidden input whenever the user clears the visible one.
 * Pick exactly one input based on behavior + note type.
 */
function _readGroupInput(noteType) {
  const behavior = getNoteTypeConfig(noteType)?.behavior;
  let inputId;
  if (behavior === 'generic') {
    inputId = 'genericTranslationGroup';
  } else if (noteType === 'training' || hasDateField(noteType)) {
    inputId = MODAL_IDS.TRANSLATION_GROUP_INPUT; // 'translationGroup' — date-based form
  } else {
    inputId = 'quoteTranslationGroup'; // quote / tegneserie / ... default
  }
  const raw = getElementValue(inputId) || '';
  return raw.trim() || null;
}

/**
 * Collect form data for quote submission
 * @param {Object} state - Current application state
 * @returns {Object} Form data object
 */
export function collectFormData(state) {
  const noteType = getElementValue(MODAL_IDS.NOTE_TYPE_SELECT);
  const behavior = getNoteTypeConfig(noteType).behavior;
  const hasQuoteEntities = behavior === 'quote';
  const isDateBehavior = hasDateField(noteType);
  const usesDateSubtype = isDateBehavior && Array.from(document.getElementById(MODAL_IDS.TRAINING_TYPE_SELECT)?.options || [])
    .some((option) => option.value);
  
  // Parse note_date for date-based notes.
  let parsedNoteDate = null;
  if (isDateBehavior) {
    const noteDateInput = getElementValue(MODAL_IDS.NOTE_DATE_INPUT);
    parsedNoteDate = parseNorwegianDate(noteDateInput);
  }
  
  return {
    note_text: getElementValue(MODAL_IDS.QUOTE_TEXT),
    note_title: (document.getElementById('noteTitle')?.value?.trim() || null),
    author: hasQuoteEntities ? getElementValue(MODAL_IDS.AUTHOR_INPUT) : '',
    source: hasQuoteEntities ? getElementValue(MODAL_IDS.SOURCE_INPUT) : '',
    sourceType: hasQuoteEntities
      ? (getElementValue(MODAL_IDS.SOURCE_TYPE_SELECT) || "ASSORTED")
      : (usesDateSubtype
          ? getElementValue(MODAL_IDS.TRAINING_TYPE_SELECT)
          : (hasGenericSubTypeField(noteType)
              ? getElementValue('genericSubType')
              : null)),
    sourceId: hasQuoteEntities ? (window.currentSourceId || null) : null,
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

  // Validate training sub-type only when this type actually uses training sub-types.
  const isTrainingBehavior = getNoteTypeConfig(quoteData.note_type).behavior === 'training';
  const trainingTypeSelect = document.getElementById('trainingType');
  const hasTrainingTypeOptions = trainingTypeSelect
    ? Array.from(trainingTypeSelect.options).some((option) => option.value)
    : false;
  if (isTrainingBehavior && hasTrainingTypeOptions && !quoteData.sourceType) {
    const select = trainingTypeSelect;
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

  // Validate generic sub-type is selected when sub-types are configured for this type
  if (hasGenericSubTypeField(quoteData.note_type) && !quoteData.sourceType) {
    const select = document.getElementById('genericSubType');
    if (select) {
      select.style.outline = '2px solid #e74c3c';
      select.style.borderColor = '#e74c3c';
      setTimeout(() => {
        select.style.outline = '';
        select.style.borderColor = '';
      }, 3000);
    }
    alert('⚠️ Please select a Type before saving.');
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
