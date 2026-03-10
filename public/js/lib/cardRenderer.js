/**
 * cardRenderer.js
 * 
 * Card rendering logic - clean, modular, and type-specific
 * 
 * Main function:
 * - createQuoteCard() - Generates HTML for a note card
 * 
 * Type-specific metadata builders:
 * - buildQuoteMetadata() - Metadata for quotes (author/source)
 * - buildTrainingMetadata() - Metadata for training (date/type)
 * - buildGenericMetadata() - Metadata for other types (note, puzzle)
 * 
 * Helper functions (perfect symmetry!):
 * - getQuoteSourceIconAndLabel() - Icon/label for quote source type (dynamic from settings)
 * - getTrainingIconAndLabel() - Icon/label for training type (dynamic from settings)
 * - formatTrainingDate() - Format date with Norwegian day name
 * - buildScoreAndNoteLine() - Score and note title
 * - buildAttachmentSection() - Attachment thumbnail/icon
 * - isLongContent() - Check if content should be collapsible
 * 
 * Benefits of this refactoring:
 * - Perfect symmetry: both quotes and training load icons from settings.json
 * - Clear separation of concerns (one function per note type)
 * - Easy to add new note types (just add a new builder)
 * - More readable and maintainable
 * - Reusable helper functions
 * - No hardcoded values - everything configurable!
 */

import { escapeHtml, resolveAttachmentUrl } from './utils.js';
import { getNoteTypeBadgeHtml } from './noteTypes.js';

/**
 * Get quote source icon and label (dynamic from settings)
 * @returns {Object} { icon, label }
 */
function getQuoteSourceIconAndLabel(sourceType, quoteTypes) {
  const quoteTypeInfo = quoteTypes.find(t => t.value === sourceType);
  return {
    icon: quoteTypeInfo ? quoteTypeInfo.icon : '📖',
    label: quoteTypeInfo ? quoteTypeInfo.label : sourceType
  };
}

/**
 * Get training type icon and label (dynamic from settings)
 * @returns {Object} { icon, label }
 */
function getTrainingIconAndLabel(sourceType, trainingTypes) {
  const trainingTypeInfo = trainingTypes.find(t => t.value === sourceType);
  return {
    icon: trainingTypeInfo ? trainingTypeInfo.icon : '🏋️',
    label: trainingTypeInfo ? trainingTypeInfo.label : sourceType
  };
}

/**
 * Format training date with Norwegian day name
 */
function formatTrainingDate(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const dayName = date.toLocaleDateString('nb-NO', { weekday: 'short' });
  const dateFormatted = date.toLocaleDateString('nb-NO');
  return `${dayName} ${dateFormatted}`;
}

/**
 * Check if content is long and should be collapsible
 */
function isLongContent(htmlContent) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // Count block-level elements as "lines"
  const blockElements = tempDiv.querySelectorAll('p, h1, h2, h3, div, br, li');
  const lineCount = Math.max(blockElements.length, textContent.split("\n").length);
  const charCount = textContent.length;
  
  return lineCount > 10 || charCount > 600;
}

/**
 * Build score and note title line
 */
function buildScoreAndNoteLine(quote, globalSettings) {
  const displayScore = globalSettings?.displayScoreInCards === true;
  const score = quote.score;
  const hasScore = score && parseInt(score) > 0 && displayScore;
  const scoreIcon = hasScore 
    ? `<i class="fa-solid fa-dice-${['one', 'two', 'three', 'four', 'five', 'six'][parseInt(score) - 1]}"></i>` 
    : '';
  
  if (hasScore && quote.note) {
    return `<div class="quote-note-title"><span>${scoreIcon}</span><span>${escapeHtml(quote.note)}</span></div>`;
  } else if (hasScore) {
    return `<div class="quote-score-line">${scoreIcon}</div>`;
  } else if (quote.note) {
    return `<div class="quote-note-title"><span></span><span>${escapeHtml(quote.note)}</span></div>`;
  }
  return '';
}

/**
 * Build metadata section for Quote type
 */
function buildQuoteMetadata(quote, noteTypeBadge, translationBadge, getQuoteTypes) {
  const author = quote.author_name || "";
  const source = quote.source_name || "";
  const sourceType = quote.source_type || "BOOK";
  
  // Get quote types config
  let quoteTypes = [];
  try {
    quoteTypes = getQuoteTypes();
  } catch (error) {
    console.error('Error getting quote types in cardRenderer:', error);
  }
  
  // Get icon for this quote source type
  const { icon: sourceIcon } = getQuoteSourceIconAndLabel(sourceType, quoteTypes);
  
  // Author + Source
  if (author && source) {
    return `<div class="meta-item-combined">${noteTypeBadge}${translationBadge}<span class="type-icon-badge">${sourceIcon}</span> <span class="meta-by">by</span> <span class="meta-value clickable author-link" data-id="${quote.author_id}" data-name="${escapeHtml(author)}">${escapeHtml(author)}</span> <span class="meta-from">from</span> <span class="meta-value clickable source-link" data-id="${quote.source_id}" data-name="${escapeHtml(source)}" data-type="${sourceType}">📚 ${escapeHtml(source)}</span></div>`;
  }
  
  // Author only
  if (author) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}<span class="type-icon-badge">${sourceIcon}</span> <span class="meta-by">by</span> <span class="meta-value clickable author-link" data-id="${quote.author_id}" data-name="${escapeHtml(author)}">${escapeHtml(author)}</span></div>`;
  }
  
  // Source only
  if (source) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}<span class="meta-value clickable source-link" data-id="${quote.source_id}" data-name="${escapeHtml(source)}" data-type="${sourceType}">📚 ${escapeHtml(source)}</span></div>`;
  }
  
  // Badge only
  if (noteTypeBadge || translationBadge) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}</div>`;
  }
  
  return '';
}

/**
 * Build metadata section for Training type
 */
function buildTrainingMetadata(quote, noteTypeBadge, getTrainingTypes) {
  const sourceType = quote.source_type || "";
  
  // Get training types config
  let trainingTypes = [];
  try {
    trainingTypes = getTrainingTypes();
  } catch (error) {
    console.error('Error getting training types in cardRenderer:', error);
  }
  
  // Get icon and label for this training type
  const { icon: trainingIcon, label: trainingLabel } = getTrainingIconAndLabel(sourceType, trainingTypes);
  
  // Format date
  const dateStr = formatTrainingDate(quote.note_date);
  
  const trainingTypeStr = sourceType && sourceType !== 'ASSORTED' 
    ? `<span class="type-icon-badge">${trainingIcon}</span> ${trainingLabel}` 
    : '';
  
  // Date + Training Type
  if (dateStr && trainingTypeStr) {
    return `<div class="meta-item-combined">${noteTypeBadge}${trainingTypeStr} <span class="meta-from">•</span> <span class="meta-value">📅 ${dateStr}</span></div>`;
  }
  
  // Date only
  if (dateStr) {
    return `<div class="meta-item">${noteTypeBadge}<span class="meta-value">📅 ${dateStr}</span></div>`;
  }
  
  // Training Type only
  if (trainingTypeStr) {
    return `<div class="meta-item">${noteTypeBadge}${trainingTypeStr}</div>`;
  }
  
  // Badge only
  return `<div class="meta-item">${noteTypeBadge}</div>`;
}

/**
 * Build metadata section for generic note types (note, puzzle)
 */
function buildGenericMetadata(noteTypeBadge) {
  return `<div class="meta-item">${noteTypeBadge}</div>`;
}

/**
 * Build attachment section (image thumb or file icon)
 */
function buildAttachmentSection(quote, imageUrl, imageFullUrl) {
  if (!quote.image && !quote.image_full) {
    return '';
  }
  
  const attachmentType = quote.attachment_type || 'image';
  const url = quote.image_full || quote.image;
  const displayUrl = imageUrl || imageFullUrl;
  
  if (attachmentType === 'image') {
    return `<div class="quote-image-thumb" onclick="event.stopPropagation(); showFullImage('${url}', ${quote.id}, '${attachmentType}')"><img src="${displayUrl}" alt="Quote attachment"></div>`;
  }
  
  // File attachment (PDF, video, document)
  const fileIcons = {
    'pdf': '📄',
    'video': '🎬',
    'document': '📎'
  };
  const fileLabels = {
    'pdf': 'PDF',
    'video': 'Video',
    'document': 'File'
  };
  const fileIcon = fileIcons[attachmentType] || '📁';
  const fileLabel = fileLabels[attachmentType] || 'File';
  
  return `<div class="quote-file-thumb" onclick="event.stopPropagation(); showFullImage('${url}', ${quote.id}, '${attachmentType}')"><div class="file-icon">${fileIcon}</div><div class="file-label">${fileLabel}</div></div>`;
}

/**
 * Creates HTML for a note card
 * @param {Object} quote - The quote/note object from database
 * @param {string|null} currentNoteTypeFilter - Current view filter ('quote', 'training', 'note', 'puzzle', or null for 'all')
 * @param {Function} getTrainingTypes - Function that returns training types config
 * @param {Function} getQuoteTypes - Function that returns quote types config
 * @returns {string} HTML string for the card
 */
export function createQuoteCard(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings) {
  console.log('🎴 CardRenderer - Creating card for:', quote.note_type, 'Filter:', currentNoteTypeFilter);
  
  // Resolve attachment URLs
  const imageUrl = quote.image ? resolveAttachmentUrl(quote.image) : null;
  const imageFullUrl = quote.image_full ? resolveAttachmentUrl(quote.image_full) : null;
  
  // Build tags
  const tags = quote.tags
    ? quote.tags
        .split(",")
        .map((tag) => `<span class="tag">${tag.trim()}</span>`)
        .join("")
    : "";

  // Check if content is long
  const isLong = isLongContent(quote.quote);
  const quoteId = `quote-${quote.id}`;
  const expandBtnId = `expand-${quote.id}`;

  // Build score and note line
  const noteScoreLine = buildScoreAndNoteLine(quote, globalSettings);
  
  // Translation group badge
  const translationBadge = quote.translation_group 
    ? `<span class="translation-badge" title="Translation group: ${escapeHtml(quote.translation_group)}" onclick="event.stopPropagation(); showTranslationGroup('${escapeHtml(quote.translation_group)}')">T</span>` 
    : '';
  
  // Note type badge
  const noteType = quote.note_type || 'quote';
  const noteTypeBadge = getNoteTypeBadgeHtml(noteType, true, currentNoteTypeFilter);
  
  // Build metadata based on note type
  let metadataContent = '';
  switch (noteType) {
    case 'quote':
      metadataContent = buildQuoteMetadata(quote, noteTypeBadge, translationBadge, getQuoteTypes);
      break;
    case 'training':
      metadataContent = buildTrainingMetadata(quote, noteTypeBadge, getTrainingTypes);
      break;
    default:
      metadataContent = buildGenericMetadata(noteTypeBadge);
  }
  
  // Build attachment section
  const attachmentSection = buildAttachmentSection(quote, imageUrl, imageFullUrl);

  // Return complete card HTML
  return `
        <div class="quote-card ${quote.image || quote.image_full ? 'has-image' : ''}" data-quote-id="${quote.id}" style="cursor: pointer;">
            <div class="quote-card-content">
                <div class="quote-top-section">
                    <div class="quote-left-column">
                        ${noteScoreLine}
                        <div class="quote-text-wrapper">
                            <div class="quote-text ${isLong ? "collapsible" : ""}" id="${quoteId}" data-expanded="false">${quote.quote}</div>
                            ${isLong ? `<button class="expand-btn" id="${expandBtnId}" onclick="event.stopPropagation(); toggleQuoteExpand('${quote.id}')">▼ Show more</button>` : ""}
                        </div>
                    </div>
                    ${attachmentSection}
                </div>
                <div class="quote-separator"></div>
                <div class="quote-metadata-row">
                    <div class="quote-metadata-left">
                        ${metadataContent}
                    </div>
                    ${tags ? `<div class="quote-tags-inline">${tags}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}
