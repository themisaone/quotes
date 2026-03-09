/**
 * modalRenderer.js
 * 
 * Modal rendering and field management logic - clean, modular, and type-specific
 * 
 * Main functions:
 * - setupAddModal() - Configure modal for adding a new note
 * - setupEditModal() - Configure modal for editing an existing note
 * - setupModalFieldsForType() - Show/hide fields based on note type
 * 
 * Type-specific field setters:
 * - setQuoteFields() - Set fields for quote type
 * - setTrainingFields() - Set fields for training type
 * - setGenericFields() - Set fields for other types (note, puzzle)
 * 
 * Helper functions:
 * - formatMetadataDisplay() - Format created/updated timestamps
 * - formatDateForDisplay() - Format date as dd.mm.yyyy (Norwegian)
 * - formatDateForPicker() - Format date as yyyy-mm-dd (HTML5 date input)
 * - resetModalState() - Clear all modal fields and state
 * - showDeleteButton() - Show/hide delete button with appropriate label
 * 
 * Benefits:
 * - Clear separation of concerns (add vs edit, type-specific logic)
 * - Consistent pattern with cardRenderer.js
 * - Easy to add new note types
 * - Reusable helper functions
 */

import { formatDateNorwegian } from './utils.js';
import { getNoteTypeConfig, hasAuthorField, hasSourceField, hasDateField, hasTrainingTypeField } from './noteTypes.js';

/**
 * Format metadata display (created/updated timestamps)
 */
function formatMetadataDisplay(createdAt, updatedAt) {
  const formatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const createdDate = createdAt ? new Date(createdAt).toLocaleString('en-US', formatOptions) : '';
  const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('en-US', formatOptions) : '';
  
  if (!createdDate && !updatedDate) return '';
  
  const parts = [];
  if (createdDate) parts.push(`Created: ${createdDate}`);
  if (updatedDate) parts.push(`Updated: ${updatedDate}`);
  
  return parts.join(' | ');
}

/**
 * Format date as dd.mm.yyyy for Norwegian display
 */
function formatDateForDisplay(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Format date as yyyy-mm-dd for HTML5 date picker
 */
function formatDateForPicker(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${year}-${month}-${day}`;
}

/**
 * Set default fields for Quote type
 */
export function setDefaultQuoteFields(elements) {
  const { authorInput, sourceTypeSelect } = elements;
  
  if (authorInput) {
    authorInput.value = "Unknown Author";
  }
  
  if (sourceTypeSelect) {
    sourceTypeSelect.value = "ASSORTED";
  }
}

/**
 * Set fields for Quote type (edit mode)
 */
export function setQuoteFields(quote, elements) {
  const { authorInput, sourceInput, sourceTypeSelect } = elements;
  
  if (authorInput) authorInput.value = quote.author_name || "";
  if (sourceInput) sourceInput.value = quote.source_name || "";
  if (sourceTypeSelect) sourceTypeSelect.value = quote.source_type || "BOOK";
}

/**
 * Set default fields for Training type
 */
export function setDefaultTrainingFields(elements) {
  const { noteDateInput, trainingTypeSelect } = elements;
  
  if (noteDateInput) noteDateInput.value = "";
  if (trainingTypeSelect) trainingTypeSelect.value = "";
}

/**
 * Set fields for Training type (edit mode)
 */
export function setTrainingFields(quote, elements) {
  const { trainingTypeSelect, noteDateInput, noteDatePicker } = elements;
  
  if (trainingTypeSelect) {
    trainingTypeSelect.value = quote.source_type || "";
  }
  
  if (quote.note_date && noteDateInput && noteDatePicker) {
    const dateForDisplay = formatDateForDisplay(quote.note_date);
    const dateForPicker = formatDateForPicker(quote.note_date);
    
    noteDateInput.value = dateForDisplay;
    noteDatePicker.value = dateForPicker;
    
    console.log('🔍 Debug - note_date from DB:', quote.note_date);
    console.log('🔍 Debug - formatted for display (dd.mm.yyyy):', dateForDisplay);
    console.log('🔍 Debug - formatted for picker (yyyy-mm-dd):', dateForPicker);
  }
}

/**
 * Clear type-specific fields
 */
export function clearTypeSpecificFields(elements) {
  const { noteDateInput, trainingTypeSelect } = elements;
  
  if (noteDateInput) noteDateInput.value = "";
  if (trainingTypeSelect) trainingTypeSelect.value = "";
}

/**
 * Set common fields (used by all note types)
 */
export function setCommonFields(quote, elements, quillEditor) {
  const { quoteTextInput, noteInput, noteTypeSelect, scoreRadios, translationGroupInput } = elements;
  
  // Set quote text in Quill editor
  if (quillEditor) {
    if (quote.quote) {
      if (quote.quote.includes('<')) {
        quillEditor.root.innerHTML = quote.quote;
      } else {
        quillEditor.setText(quote.quote);
      }
    } else {
      quillEditor.setText('');
    }
  }
  
  if (quoteTextInput) {
    quoteTextInput.value = quote.quote || '';
  }
  
  if (noteInput) {
    noteInput.value = quote.note || "";
  }
  
  if (noteTypeSelect) {
    noteTypeSelect.value = quote.note_type || "quote";
  }
  
  // Set score radio button
  const scoreValue = quote.score || "0";
  if (scoreRadios) {
    const scoreRadio = document.querySelector(`input[name="quoteScore"][value="${scoreValue}"]`);
    if (scoreRadio) {
      scoreRadio.checked = true;
    }
  }
  
  if (translationGroupInput) {
    translationGroupInput.value = quote.translation_group || "";
  }
}

/**
 * Reset all modal fields to default state
 */
export function resetModalFields(quillEditor, elements) {
  const { form, quoteTextInput, noteInput, scoreRadios } = elements;
  
  if (form) {
    form.reset();
  }
  
  if (quillEditor) {
    quillEditor.setText('');
  }
  
  if (quoteTextInput) {
    quoteTextInput.value = '';
  }
  
  if (noteInput) {
    noteInput.value = '';
  }
  
  // Reset score to 0 (no score)
  if (scoreRadios) {
    const defaultScoreRadio = document.querySelector('input[name="quoteScore"][value="0"]');
    if (defaultScoreRadio) {
      defaultScoreRadio.checked = true;
    }
  }
}

/**
 * Show/hide and configure delete button
 */
export function configureDeleteButton(isEditMode, noteType, deleteBtn) {
  if (!deleteBtn) return;
  
  if (!isEditMode) {
    deleteBtn.style.display = "none";
    return;
  }
  
  const typeLabel = getNoteTypeConfig(noteType).label;
  deleteBtn.style.display = "inline-block";
  deleteBtn.textContent = `Delete ${typeLabel}`;
}

/**
 * Show/hide metadata section
 */
export function displayMetadata(quote, metadataElement) {
  if (!metadataElement) return;
  
  const metadata = formatMetadataDisplay(quote.created_at, quote.updated_at);
  
  if (metadata) {
    metadataElement.innerHTML = metadata;
    metadataElement.style.display = "block";
  } else {
    metadataElement.style.display = "none";
  }
}

/**
 * Hide metadata for new notes
 */
export function hideMetadata(metadataElement) {
  if (metadataElement) {
    metadataElement.style.display = "none";
  }
}

/**
 * Setup modal for adding a new note
 * @param {string} noteType - The type of note to add ('quote', 'training', etc.)
 * @param {string} currentNoteTypeFilter - Current view filter
 * @param {Object} elements - DOM element references
 * @param {Object} quillEditor - Quill editor instance
 * @param {Function} updateFieldVisibility - Function to update field visibility
 * @param {Function} updateModalLabels - Function to update modal labels
 * @returns {Object} - State object for the modal
 */
export function setupAddModal(noteType, currentNoteTypeFilter, elements, quillEditor, updateFieldVisibility, updateModalLabels) {
  console.log('🎨 ModalRenderer - Setting up ADD modal for:', noteType);
  
  const { modalTitle, noteTypeSelect } = elements;
  const typeInfo = getNoteTypeConfig(noteType);
  
  // Set modal title
  if (modalTitle) {
    modalTitle.textContent = `Add New ${typeInfo.label}`;
  }
  
  // Update field labels
  if (updateModalLabels) {
    updateModalLabels(noteType);
  }
  
  // Reset all fields
  resetModalFields(quillEditor, elements);
  
  // Set note type
  if (noteTypeSelect) {
    noteTypeSelect.value = currentNoteTypeFilter || "quote";
  }
  
  // Set default values based on note type
  if (noteType === 'quote') {
    setDefaultQuoteFields(elements);
  } else if (noteType === 'training') {
    setDefaultTrainingFields(elements);
  }
  
  // Clear type-specific fields
  clearTypeSpecificFields(elements);
  
  // Update field visibility
  if (updateFieldVisibility) {
    updateFieldVisibility();
  }
  
  // Hide metadata and delete button
  hideMetadata(elements.metadataElement);
  configureDeleteButton(false, noteType, elements.deleteBtn);
  
  return {
    editingQuoteId: null,
    currentQuoteImage: "",
    currentQuoteImageFull: "",
    currentAttachmentType: "image",
    currentAttachmentFileName: ""
  };
}

/**
 * Setup modal for editing an existing note
 * @param {Object} quote - The quote/note object to edit
 * @param {Object} elements - DOM element references
 * @param {Object} quillEditor - Quill editor instance
 * @param {Function} updateFieldVisibility - Function to update field visibility
 * @param {Function} updateModalLabels - Function to update modal labels
 * @param {Function} populateTagsForEdit - Function to populate tags
 * @returns {Object} - State object for the modal
 */
export function setupEditModal(quote, elements, quillEditor, updateFieldVisibility, updateModalLabels, populateTagsForEdit) {
  console.log('🎨 ModalRenderer - Setting up EDIT modal for:', quote.note_type);
  
  const { modalTitle, quoteIdInput } = elements;
  const noteType = quote.note_type || 'quote';
  const typeLabel = getNoteTypeConfig(noteType).label;
  
  // Set modal title
  if (modalTitle) {
    modalTitle.textContent = `Edit ${typeLabel}`;
  }
  
  // Update field labels
  if (updateModalLabels) {
    updateModalLabels(noteType);
  }
  
  // Set the hidden quoteId input
  if (quoteIdInput) {
    quoteIdInput.value = quote.id;
  }
  
  // Display metadata
  displayMetadata(quote, elements.metadataElement);
  
  // Set common fields
  setCommonFields(quote, elements, quillEditor);
  
  // Set type-specific fields
  if (noteType === 'quote') {
    setQuoteFields(quote, elements);
  } else if (noteType === 'training') {
    setTrainingFields(quote, elements);
  }
  
  // Populate tags
  if (populateTagsForEdit) {
    populateTagsForEdit(quote.tags || "");
  }
  
  // Update field visibility
  if (updateFieldVisibility) {
    updateFieldVisibility();
  }
  
  // Configure delete button
  configureDeleteButton(true, noteType, elements.deleteBtn);
  
  return {
    editingQuoteId: quote.id,
    currentQuoteImage: quote.image || "",
    currentQuoteImageFull: quote.image_full || "",
    currentAttachmentType: quote.attachment_type || "image",
    currentAttachmentFileName: quote.attachment_filename || "",
    currentSourceId: quote.source_id || null
  };
}
