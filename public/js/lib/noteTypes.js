/**
 * Note Type Management
 * Handles logic specific to different note types (quote, training, note, puzzle)
 */

import { getElementByIdSafe, CONTAINER_IDS } from '../constants.js';

// Note type definitions with metadata
export const NOTE_TYPES = {
  quote: {
    value: 'quote',
    label: 'Quote',
    icon: '💬',
    letter: 'Q',
    color: '#4A90E2'
  },
  note: {
    value: 'note',
    label: 'Note',
    icon: '📝',
    letter: 'N',
    color: '#7ED321'
  },
  training: {
    value: 'training',
    label: 'Training',
    icon: '💪',
    letter: 'T',
    color: '#F5A623'
  },
  puzzle: {
    value: 'puzzle',
    label: 'Puzzle',
    icon: '🧩',
    letter: 'P',
    color: '#BD10E0'
  }
};

/**
 * Get note type config
 */
export function getNoteTypeConfig(noteType) {
  return NOTE_TYPES[noteType] || NOTE_TYPES.quote;
}

/**
 * Check if note type has specific fields
 */
export function hasAuthorField(noteType) {
  return noteType === 'quote';
}

export function hasSourceField(noteType) {
  return noteType === 'quote';
}

export function hasDateField(noteType) {
  return noteType === 'training';
}

export function hasTrainingTypeField(noteType) {
  return noteType === 'training';
}

/**
 * Get modal title for note type
 */
export function getModalTitle(noteType, isEdit = false) {
  const config = getNoteTypeConfig(noteType);
  return `${isEdit ? 'Edit' : 'Add New'} ${config.label}`;
}

/**
 * Get field label based on note type
 */
export function getMainTextLabel(noteType) {
  return noteType === 'quote' ? 'Note text*' : 'Text*';
}

export function getCommentLabel(noteType) {
  return 'Comment'; // Same for all types
}

export function getAttachmentLabel(noteType) {
  if (noteType === 'quote') return 'Quote Attachment';
  if (noteType === 'training') return 'Training Attachment';
  return 'Attachment';
}

/**
 * Get delete button text
 */
export function getDeleteButtonText(noteType) {
  const config = getNoteTypeConfig(noteType);
  return `Delete ${config.label}`;
}

/**
 * Get add button text based on current filter
 */
export function getAddButtonText(noteTypeFilter) {
  if (!noteTypeFilter) return '+ Add New Note';
  const config = getNoteTypeConfig(noteTypeFilter);
  return `+ Add New ${config.label}`;
}

/**
 * Get page title based on current filter
 */
export function getPageTitle(noteTypeFilter) {
  const titles = {
    null: { icon: '💬', text: "All Misa's Notes" },
    'quote': { icon: '💬', text: "Misa's Quote Collection" },
    'note': { icon: '📝', text: "Misa's Notes" },
    'training': { icon: '💪', text: "Misa's Trainings" },
    'puzzle': { icon: '🧩', text: "Misa's Puzzle Collection" }
  };
  
  return titles[noteTypeFilter] || titles[null];
}

/**
 * Get search header text
 */
export function getSearchHeaderText(noteTypeFilter) {
  if (!noteTypeFilter) return 'Search All Notes';
  const config = getNoteTypeConfig(noteTypeFilter);
  return `Search ${config.label}s`;
}

/**
 * Check if note type should show sources filter
 */
export function shouldShowSourcesFilter(noteTypeFilter) {
  return noteTypeFilter === null || noteTypeFilter === 'quote';
}

/**
 * Check if note type should show training filters
 */
export function shouldShowTrainingFilters(noteTypeFilter) {
  return noteTypeFilter === 'training';
}

/**
 * Get note type badge HTML
 */
export function getNoteTypeBadgeHtml(noteType, showOnlyForAllNotes = false, currentFilter = null) {
  // Only show badge on "All Notes" view
  if (showOnlyForAllNotes && currentFilter !== null) {
    return '';
  }
  
  const config = getNoteTypeConfig(noteType);
  return `<span class="translation-badge" style="background: ${config.color};" title="${config.label}">${config.icon}</span>`;
}

/**
 * Update field visibility in modal based on note type
 */
export function updateModalFieldVisibility(noteType) {
  // Author/Source fields (only for quotes) - all contained in quoteSpecificFields
  const quoteFields = getElementByIdSafe(CONTAINER_IDS.QUOTE_SPECIFIC_FIELDS, 'updateModalFieldVisibility');
  if (quoteFields) {
    quoteFields.style.display = hasAuthorField(noteType) ? 'flex' : 'none';
  }
  
  // Training-specific fields - use flex for horizontal layout
  const trainingFields = getElementByIdSafe(CONTAINER_IDS.TRAINING_SPECIFIC_FIELDS, 'updateModalFieldVisibility');
  if (trainingFields) {
    trainingFields.style.display = hasDateField(noteType) ? 'flex' : 'none';
  }
}

/**
 * Update modal labels based on note type
 */
export function updateModalLabels(noteType) {
  const quoteTextLabel = getElementByIdSafe('quoteTextLabel', 'updateModalLabels');
  const noteLabel = getElementByIdSafe('noteLabel', 'updateModalLabels');
  const attachmentLabel = getElementByIdSafe('attachmentLabel', 'updateModalLabels');
  
  if (quoteTextLabel) {
    quoteTextLabel.textContent = getMainTextLabel(noteType);
  }
  
  if (noteLabel) {
    noteLabel.textContent = getCommentLabel(noteType);
  }
  
  if (attachmentLabel) {
    attachmentLabel.textContent = getAttachmentLabel(noteType);
  }
}

/**
 * Prepare data for submission based on note type
 */
export function prepareSubmissionData(noteType, formData) {
  const data = { ...formData, note_type: noteType };
  
  // Remove fields not applicable to this note type
  if (!hasAuthorField(noteType)) {
    delete data.author;
    delete data.authorId;
  }
  
  if (!hasSourceField(noteType)) {
    delete data.source;
    delete data.sourceId;
    delete data.sourceType;
  }
  
  if (!hasDateField(noteType)) {
    delete data.note_date;
  }
  
  if (!hasTrainingTypeField(noteType)) {
    delete data.trainingType;
  }
  
  return data;
}

/**
 * Update add button text based on note type filter
 * @param {string} currentNoteTypeFilter - The current note type filter
 * @param {Function} updateSourcesFilterVisibilityFn - Callback to update sources filter visibility
 */
export function updateAddButtonText(currentNoteTypeFilter, updateSourcesFilterVisibilityFn) {
  const btnTextDesktop = getElementByIdSafe('addNoteBtnText');
  const btnTextTablet = getElementByIdSafe('addNoteBtnTextTablet');
  
  if (currentNoteTypeFilter && NOTE_TYPES[currentNoteTypeFilter]) {
    const typeInfo = NOTE_TYPES[currentNoteTypeFilter];
    btnTextDesktop.textContent = `+ Add New ${typeInfo.label}`;
    btnTextTablet.textContent = `+ Add ${typeInfo.label}`;
  } else {
    btnTextDesktop.textContent = '+ Add New Note';
    btnTextTablet.textContent = '+ Add Note';
  }
  
  // Show/hide "Select Quote Sources" based on note type
  if (updateSourcesFilterVisibilityFn) {
    updateSourcesFilterVisibilityFn();
  }
}

/**
 * Update search header title based on note type
 */
function updateSearchHeaderForType(noteTypeFilter) {
  const searchHeaderTitle = getElementByIdSafe('searchHeaderTitle');
  if (!searchHeaderTitle) return;
  
  const titles = {
    'quote': '🔍 Search Quotes',
    'note': '🔍 Search Notes',
    'training': '🔍 Search Training',
    'puzzle': '🔍 Search Puzzles',
    null: '🔍 Search All Notes'
  };
  
  searchHeaderTitle.textContent = titles[noteTypeFilter] || '🔍 Search All Notes';
}

/**
 * Show/hide Author and Source search fields (only for Quotes)
 */
function showHideQuoteSearchFields(isQuoteView) {
  const searchAuthorContainer = getElementByIdSafe('searchAuthorContainer');
  const searchSourceContainer = getElementByIdSafe('searchSourceContainer');
  
  if (searchAuthorContainer) {
    searchAuthorContainer.style.display = isQuoteView ? 'block' : 'none';
  }
  if (searchSourceContainer) {
    searchSourceContainer.style.display = isQuoteView ? 'block' : 'none';
  }
}

/**
 * Show/hide Quote Sources filter
 */
function showHideQuoteSourcesFilter(noteTypeFilter) {
  const quoteSourcesContainer = getElementByIdSafe('quoteSourcesFilterContainer');
  
  if (quoteSourcesContainer) {
    const showFilter = noteTypeFilter === 'quote';
    quoteSourcesContainer.style.display = showFilter ? 'block' : 'none';
  }
}

/**
 * Show/hide Training filters (types, year, month)
 */
function showHideTrainingFilters(noteTypeFilter, populateTrainingYearsFn) {
  const trainingTypesContainer = getElementByIdSafe('trainingTypesFilterContainer');
  const trainingYearContainer = getElementByIdSafe('trainingYearContainer');
  const trainingMonthContainer = getElementByIdSafe('trainingMonthContainer');
  
  const isTrainingView = noteTypeFilter === 'training';
  
  if (trainingTypesContainer) {
    trainingTypesContainer.style.display = isTrainingView ? 'block' : 'none';
  }
  if (trainingYearContainer) {
    trainingYearContainer.style.display = isTrainingView ? 'block' : 'none';
  }
  if (trainingMonthContainer) {
    trainingMonthContainer.style.display = isTrainingView ? 'block' : 'none';
  }
  
  // Populate years when switching to training view
  if (isTrainingView && populateTrainingYearsFn) {
    populateTrainingYearsFn();
  }
}

/**
 * Update sources filter visibility based on note type
 * @param {string} currentNoteTypeFilter - The current note type filter
 * @param {Function} populateTrainingYearsFn - Optional callback to populate training years
 */
export function updateSourcesFilterVisibility(currentNoteTypeFilter, populateTrainingYearsFn) {
  updateSearchHeaderForType(currentNoteTypeFilter);
  showHideQuoteSearchFields(currentNoteTypeFilter === 'quote');
  showHideQuoteSourcesFilter(currentNoteTypeFilter);
  showHideTrainingFilters(currentNoteTypeFilter, populateTrainingYearsFn);
}
