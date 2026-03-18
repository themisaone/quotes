/**
 * Note Type Management
 * Handles logic specific to different note types (quote, training, note, puzzle, etc.)
 * Types are loaded dynamically from settings.json via initNoteTypes().
 */

import { getElementByIdSafe, CONTAINER_IDS } from '../constants.js';

// Dynamic note types — populated by initNoteTypes() after settings load.
// Defaults cover the app before settings arrive.
let _noteTypesList = [
  { value: 'quote',    label: 'Quotes',   icon: '💬', behavior: 'quote',    core: true },
  { value: 'note',     label: 'Notes',    icon: '📝', behavior: 'generic',  core: true },
  { value: 'training', label: 'Training', icon: '💪', behavior: 'training', core: true },
  { value: 'puzzle',   label: 'Puzzles',  icon: '🧩', behavior: 'generic',  core: true },
];

let _noteTypesMap = _buildMap(_noteTypesList);

function _buildMap(list) {
  const map = {};
  for (const t of list) {
    map[t.value] = t;
  }
  return map;
}

/**
 * Initialize note types from settings.  Call once after settings are loaded.
 */
export function initNoteTypes(noteTypesConfig) {
  if (!Array.isArray(noteTypesConfig) || noteTypesConfig.length === 0) {
    console.warn('⚠️ noteTypes config empty or invalid — using defaults');
    return;
  }
  _noteTypesList = noteTypesConfig;
  _noteTypesMap = _buildMap(noteTypesConfig);
}

/**
 * Get the full list of configured note types.
 */
export function getNoteTypes() {
  return _noteTypesList;
}

/**
 * Get note type config by value key.
 */
export function getNoteTypeConfig(noteType) {
  return _noteTypesMap[noteType] || _noteTypesMap['quote'] || _noteTypesList[0];
}

// ───── Behavior helpers ─────

export function hasAuthorField(noteType) {
  return getNoteTypeConfig(noteType).behavior === 'quote';
}

export function hasSourceField(noteType) {
  return getNoteTypeConfig(noteType).behavior === 'quote';
}

export function hasDateField(noteType) {
  return getNoteTypeConfig(noteType).behavior === 'training';
}

export function hasTrainingTypeField(noteType) {
  return getNoteTypeConfig(noteType).behavior === 'training';
}

// ───── Labels & titles ─────

export function getModalTitle(noteType, isEdit = false) {
  const config = getNoteTypeConfig(noteType);
  return `${isEdit ? 'Edit' : 'Add'} ${config.label}`;
}

export function getMainTextLabel(noteType) {
  return getNoteTypeConfig(noteType).behavior === 'quote' ? '📝 Note text *' : '📝 Text *';
}

export function getCommentLabel() {
  return '💭 Comment';
}

export function getAttachmentLabel(noteType) {
  const config = getNoteTypeConfig(noteType);
  if (config.behavior === 'quote') return 'Quote Attachment';
  if (config.behavior === 'training') return 'Training Attachment';
  return 'Attachment';
}

export function getDeleteButtonText(noteType) {
  const config = getNoteTypeConfig(noteType);
  return `Delete ${config.label}`;
}

export function getAddButtonText(noteTypeFilter) {
  if (!noteTypeFilter) return '+ Add New Note';
  const config = getNoteTypeConfig(noteTypeFilter);
  return `+ Add New ${config.label}`;
}

export function getPageTitle(noteTypeFilter) {
  if (!noteTypeFilter) return { icon: '💬', text: "All Misa's Notes" };
  const config = getNoteTypeConfig(noteTypeFilter);
  return { icon: config.icon, text: `Misa's ${config.label}` };
}

export function getSearchHeaderText(noteTypeFilter) {
  if (!noteTypeFilter) return 'Search All Notes';
  const config = getNoteTypeConfig(noteTypeFilter);
  return `Search ${config.label}`;
}

export function shouldShowSourcesFilter(noteTypeFilter) {
  return noteTypeFilter === null || hasAuthorField(noteTypeFilter);
}

export function shouldShowTrainingFilters(noteTypeFilter) {
  return noteTypeFilter !== null && hasDateField(noteTypeFilter);
}

export function getNoteTypeBadgeHtml(noteType, showOnlyForAllNotes = false, currentFilter = null) {
  if (showOnlyForAllNotes && currentFilter !== null) return '';
  const config = getNoteTypeConfig(noteType);
  const color = config.color || '#888';
  return `<span class="translation-badge" style="background: ${color};" title="${config.label}">${config.icon}</span>`;
}

// ───── Modal field visibility ─────

export function hasGenericGroupField(noteType) {
  const behavior = getNoteTypeConfig(noteType).behavior;
  return behavior === 'generic';
}

export function updateModalFieldVisibility(noteType) {
  const quoteFields = getElementByIdSafe(CONTAINER_IDS.QUOTE_SPECIFIC_FIELDS, 'updateModalFieldVisibility');
  if (quoteFields) {
    quoteFields.style.display = hasAuthorField(noteType) ? 'flex' : 'none';
  }
  const trainingFields = getElementByIdSafe(CONTAINER_IDS.TRAINING_SPECIFIC_FIELDS, 'updateModalFieldVisibility');
  if (trainingFields) {
    trainingFields.style.display = hasDateField(noteType) ? 'flex' : 'none';
  }
  const genericFields = document.getElementById('genericSpecificFields');
  if (genericFields) {
    genericFields.style.display = hasGenericGroupField(noteType) ? 'flex' : 'none';
  }
}

export function updateModalLabels(noteType) {
  const quoteTextLabel = getElementByIdSafe('quoteTextLabel', 'updateModalLabels');
  const noteLabel = getElementByIdSafe('noteLabel', 'updateModalLabels');
  const attachmentLabel = getElementByIdSafe('attachmentLabel', 'updateModalLabels');

  if (quoteTextLabel) quoteTextLabel.textContent = getMainTextLabel(noteType);
  if (noteLabel) noteLabel.textContent = getCommentLabel();
  if (attachmentLabel) attachmentLabel.textContent = getAttachmentLabel(noteType);
}

// ───── Form data ─────

export function prepareSubmissionData(noteType, formData) {
  const data = { ...formData, note_type: noteType };

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

// ───── Add button & header ─────

export function updateAddButtonText(currentNoteTypeFilter, updateSourcesFilterVisibilityFn) {
  const btnTextDesktop = getElementByIdSafe('addNoteBtnText');
  const btnTextTablet = getElementByIdSafe('addNoteBtnTextTablet');

  if (currentNoteTypeFilter && _noteTypesMap[currentNoteTypeFilter]) {
    const typeInfo = _noteTypesMap[currentNoteTypeFilter];
    if (btnTextDesktop) btnTextDesktop.textContent = `+ Add New ${typeInfo.label}`;
    if (btnTextTablet) btnTextTablet.textContent = `+ Add ${typeInfo.label}`;
  } else {
    if (btnTextDesktop) btnTextDesktop.textContent = '+ Add New Note';
    if (btnTextTablet) btnTextTablet.textContent = '+ Add Note';
  }

  if (updateSourcesFilterVisibilityFn) updateSourcesFilterVisibilityFn();
}

// ───── Search header ─────

function updateSearchHeaderForType(noteTypeFilter) {
  const searchHeaderTitle = getElementByIdSafe('searchHeaderTitle');
  if (!searchHeaderTitle) return;

  if (!noteTypeFilter) {
    searchHeaderTitle.textContent = '🔍 Search All Notes';
    return;
  }
  const config = getNoteTypeConfig(noteTypeFilter);
  searchHeaderTitle.textContent = `🔍 Search ${config.label}`;
}

function showHideQuoteSearchFields(isQuoteView) {
  const searchAuthorContainer = getElementByIdSafe('searchAuthorContainer');
  const searchSourceContainer = getElementByIdSafe('searchSourceContainer');
  if (searchAuthorContainer) searchAuthorContainer.style.display = isQuoteView ? 'flex' : 'none';
  if (searchSourceContainer) searchSourceContainer.style.display = isQuoteView ? 'flex' : 'none';
}

function showHideQuoteSourcesFilter(noteTypeFilter) {
  const quoteSourcesContainer = getElementByIdSafe('quoteSourcesFilterContainer');
  if (quoteSourcesContainer) {
    quoteSourcesContainer.style.display = (noteTypeFilter !== null && hasAuthorField(noteTypeFilter)) ? 'block' : 'none';
  }
}

function showHideTrainingFilters(noteTypeFilter, populateTrainingYearsFn) {
  const trainingTypesContainer = getElementByIdSafe('trainingTypesFilterContainer');
  const trainingYearContainer = getElementByIdSafe('trainingYearContainer');
  const trainingMonthContainer = getElementByIdSafe('trainingMonthContainer');

  const isTrainingView = noteTypeFilter !== null && hasDateField(noteTypeFilter);

  if (trainingTypesContainer) trainingTypesContainer.style.display = isTrainingView ? 'block' : 'none';
  if (trainingYearContainer) trainingYearContainer.style.display = isTrainingView ? 'block' : 'none';
  if (trainingMonthContainer) trainingMonthContainer.style.display = isTrainingView ? 'block' : 'none';

  if (isTrainingView && populateTrainingYearsFn) populateTrainingYearsFn();
}

export function updateSourcesFilterVisibility(currentNoteTypeFilter, populateTrainingYearsFn) {
  updateSearchHeaderForType(currentNoteTypeFilter);
  showHideQuoteSearchFields(currentNoteTypeFilter !== null && hasAuthorField(currentNoteTypeFilter));
  showHideQuoteSourcesFilter(currentNoteTypeFilter);
  showHideTrainingFilters(currentNoteTypeFilter, populateTrainingYearsFn);
}
