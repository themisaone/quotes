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

import { getNoteTypeConfig } from './noteTypes.js';

/**
 * Format metadata display (created/updated timestamps)
 */
function formatMetadataDisplay(createdAt, updatedAt, id) {
  const formatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const createdDate = createdAt ? new Date(createdAt).toLocaleString('nb-NO', formatOptions) : '';
  const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('nb-NO', formatOptions) : '';
  
  if (!createdDate && !updatedDate) return '';
  
  const parts = [];
  if (id) parts.push(`#${id}`);
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
export function setQuoteFields(note, elements) {
  const { authorInput, sourceInput, sourceTypeSelect } = elements;
  
  if (authorInput) authorInput.value = note.author_name || "";
  if (sourceInput) sourceInput.value = note.source_name || "";
  if (sourceTypeSelect) sourceTypeSelect.value = note.source_type || "BOOK";
}

/**
 * Set default fields for Training type
 */
export function setDefaultTrainingFields(elements) {
  const { noteDateInput, trainingTypeSelect } = elements;
  
  if (noteDateInput) noteDateInput.value = "";
  if (trainingTypeSelect) trainingTypeSelect.value = "WEIGHTS";
}

/**
 * Set fields for Training type (edit mode)
 */
export function setTrainingFields(note, elements) {
  const { trainingTypeSelect, noteDateInput, noteDatePicker } = elements;
  
  if (trainingTypeSelect) {
    trainingTypeSelect.value = note.source_type || "";
  }
  
  if (note.note_date && noteDateInput && noteDatePicker) {
    const dateForDisplay = formatDateForDisplay(note.note_date);
    const dateForPicker = formatDateForPicker(note.note_date);
    
    noteDateInput.value = dateForDisplay;
    noteDatePicker.value = dateForPicker;
    
    console.log('🔍 Debug - note_date from DB:', note.note_date);
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
export function setCommonFields(note, elements, quillEditor) {
  const { quoteTextInput, noteInput, noteTypeSelect, scoreRadios, translationGroupInput } = elements;
  
  // Set quote text in Quill editor
  if (quillEditor) {
    if (note.note_text) {
      if (note.note_text.includes('<')) {
        // Use dangerouslyPasteHTML so Quill converts HTML → Delta properly.
        // Direct root.innerHTML assignment causes Quill's MutationObserver to
        // sanitize away unsupported tags (e.g. <font>) and leaves the editor empty.
        quillEditor.clipboard.dangerouslyPasteHTML(note.note_text);
      } else {
        quillEditor.setText(note.note_text);
      }
    } else {
      quillEditor.setText('');
    }
  }
  
  if (quoteTextInput) {
    quoteTextInput.value = note.note_text || '';
  }
  
  if (noteInput) {
    noteInput.value = note.comment || "";
  }
  
  if (noteTypeSelect) {
    noteTypeSelect.value = note.note_type || "quote";
  }
  
  // Set score radio button
  const scoreValue = note.score || "0";
  if (scoreRadios) {
    const scoreRadio = document.querySelector(`input[name="quoteScore"][value="${scoreValue}"]`);
    if (scoreRadio) {
      scoreRadio.checked = true;
    }
  }
  
  if (translationGroupInput) {
    translationGroupInput.value = note.translation_group || "";
  }
  
  // Also sync the other two group inputs (quote-specific and generic)
  const quoteTranslationGroupInput = document.getElementById('quoteTranslationGroup');
  if (quoteTranslationGroupInput) {
    quoteTranslationGroupInput.value = note.translation_group || "";
  }
  const genericTranslationGroupInput = document.getElementById('genericTranslationGroup');
  if (genericTranslationGroupInput) {
    genericTranslationGroupInput.value = note.translation_group || "";
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
export function displayMetadata(note, metadataElement) {
  if (!metadataElement) return;
  
  const metadata = formatMetadataDisplay(note.created_at, note.updated_at, note.id);
  
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
    modalTitle.textContent = `Add ${typeInfo.label}`;
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
export function setupEditModal(note, elements, quillEditor, updateFieldVisibility, updateModalLabels, populateTagsForEdit) {
  console.log('🎨 ModalRenderer - Setting up EDIT modal for:', note.note_type);
  
  const { modalTitle, quoteIdInput } = elements;
  const noteType = note.note_type || 'quote';
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
    quoteIdInput.value = note.id;
  }
  
  // Display metadata
  displayMetadata(note, elements.metadataElement);
  
  // Set common fields
  setCommonFields(note, elements, quillEditor);
  
  // Set type-specific fields
  if (noteType === 'quote') {
    setQuoteFields(note, elements);
  } else if (noteType === 'training') {
    setTrainingFields(note, elements);
  }
  
  // Populate tags
  if (populateTagsForEdit) {
    populateTagsForEdit(note.tags || "");
  }
  
  // Update field visibility
  if (updateFieldVisibility) {
    updateFieldVisibility();
  }
  
  // Configure delete button
  configureDeleteButton(true, noteType, elements.deleteBtn);
  
  return {
    editingQuoteId: note.id,
    currentQuoteImage: note.thumbnail || "",
    currentQuoteImageFull: note.attachment_full || "",
    currentAttachmentType: note.attachment_type || "image",
    currentAttachmentFileName: note.attachment_filename || "",
    currentSourceId: note.source_id || null
  };
}
