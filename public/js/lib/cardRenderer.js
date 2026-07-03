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

import { escapeHtml, resolveAttachmentUrl, normalizeTextColors } from './utils.js?v=20260703color1';
import { getNoteTypeBadgeHtml, getNoteTypeConfig, getGenericSubTypes } from './noteTypes.js';

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
 * Format training date as YYYY.MM.DD  Full day name
 * e.g. "2026.02.19  Thursday"
 */
function formatTrainingDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${yyyy}.${mm}.${dd}\u00a0\u00a0${dayName}`;
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
function buildScoreAndNoteLine(note, globalSettings) {
  const displayScore = globalSettings?.displayScoreInCards === true;
  const score = note.score;
  const hasScore = score && parseInt(score) > 0 && displayScore;
  const scoreIcon = hasScore 
    ? `<i class="fa-solid fa-dice-${['one', 'two', 'three', 'four', 'five', 'six'][parseInt(score) - 1]}"></i>` 
    : '';
  
  if (hasScore && note.comment) {
    return `<div class="quote-note-title"><span>${scoreIcon}</span><span>${escapeHtml(note.comment)}</span></div>`;
  } else if (hasScore) {
    return `<div class="quote-score-line">${scoreIcon}</div>`;
  } else if (note.comment) {
    return `<div class="quote-note-title"><span></span><span>${escapeHtml(note.comment)}</span></div>`;
  }
  return '';
}

/**
 * Build metadata section for Quote type
 */
function buildQuoteMetadata(note, noteTypeBadge, translationBadge, getQuoteTypes) {
  const author = note.author_name || "";
  const source = note.source_name || "";
  const sourceType = note.source_type || "BOOK";
  
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
    return `<div class="meta-item-combined">${noteTypeBadge}${translationBadge}<span class="type-icon-badge">${sourceIcon}</span> <span class="meta-by">by</span> <span class="meta-value clickable author-link" data-id="${note.author_id}" data-name="${escapeHtml(author)}">${escapeHtml(author)}</span> <span class="meta-from">from</span> <span class="meta-value clickable source-link" data-id="${note.source_id}" data-name="${escapeHtml(source)}" data-type="${sourceType}">📚 ${escapeHtml(source)}</span></div>`;
  }
  
  // Author only
  if (author) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}<span class="type-icon-badge">${sourceIcon}</span> <span class="meta-by">by</span> <span class="meta-value clickable author-link" data-id="${note.author_id}" data-name="${escapeHtml(author)}">${escapeHtml(author)}</span></div>`;
  }
  
  // Source only
  if (source) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}<span class="meta-value clickable source-link" data-id="${note.source_id}" data-name="${escapeHtml(source)}" data-type="${sourceType}">📚 ${escapeHtml(source)}</span></div>`;
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
function buildTrainingMetadata(note, noteTypeBadge, translationBadge, getTrainingTypes) {
  const sourceType = note.source_type || "";
  
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
  const dateStr = formatTrainingDate(note.note_date);
  
  const trainingTypeStr = sourceType && sourceType !== 'ASSORTED' 
    ? `<span class="type-icon-badge">${trainingIcon}</span> ${trainingLabel}` 
    : '';
  
  // Date + Training Type
  if (dateStr && trainingTypeStr) {
    return `<div class="meta-item-combined">${noteTypeBadge}${translationBadge}${trainingTypeStr} <span class="meta-from training-date-sep">—</span> <span class="meta-value"><span class="type-icon-badge">📅</span> ${dateStr}</span></div>`;
  }
  
  // Date only
  if (dateStr) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}<span class="meta-value"><span class="type-icon-badge">📅</span> ${dateStr}</span></div>`;
  }
  
  // Training Type only
  if (trainingTypeStr) {
    return `<div class="meta-item">${noteTypeBadge}${translationBadge}${trainingTypeStr}</div>`;
  }
  
  // Badge only
  return `<div class="meta-item">${noteTypeBadge}${translationBadge}</div>`;
}

/**
 * Build metadata section for generic note types (note, puzzle, historical)
 */
function buildGenericMetadata(noteTypeBadge, translationBadge) {
  return `<div class="meta-item">${noteTypeBadge}${translationBadge}</div>`;
}

const FILE_ICONS  = { pdf: '📄', video: '🎬', document: '📎', encrypted: '🔒' };
const FILE_LABELS = { pdf: 'PDF', video: 'Video', document: 'File', encrypted: 'Encrypted' };

function buildSingleAttachmentTile(att, noteId, isMain = true) {
  const type    = att.attachment_type || 'image';
  // For non-image types, only the full attachment can be played — never fall back to thumbnail
  const fullUrl = att.attachment_full || (type === 'image' ? att.thumbnail || '' : '');
  const cls     = isMain ? 'quote-image-thumb' : 'att-strip-thumb';

  // Encrypted attachments: derive original name from path (strip leading folder/ and trailing .enc)
  if (type === 'encrypted') {
    const rawPath    = (fullUrl || '').replace(/^file:/, '').split('/').pop();   // e.g. "123.note.txt.enc"
    const origName   = rawPath.replace(/^\d+\./, '').replace(/\.enc$/i, '');     // "note.txt"
    const onclick    = fullUrl
      ? `event.stopPropagation(); window.openEncryptedAttachment('${fullUrl}', '${origName}')`
      : '';
    const fileCls    = isMain ? 'quote-file-thumb enc-attach-thumb' : 'att-strip-thumb att-strip-file';
    return `<div class="${fileCls}" onclick="${onclick}" title="Encrypted: ${origName}">
      <div class="file-icon">🔒</div>${isMain ? `<div class="file-label enc-attach-label">${origName}</div>` : ''}
    </div>`;
  }

  const onclick = fullUrl
    ? `event.stopPropagation(); showFullImage('${fullUrl}', ${noteId}, '${type}')`
    : '';

  if (type === 'image') {
    const displayUrl = resolveAttachmentUrl(att.thumbnail || att.attachment_full);
    return `<div class="${cls}" onclick="${onclick}"><img src="${displayUrl}" alt="attachment"></div>`;
  }

  // For non-image types: show the rendered thumbnail (e.g. PDF first-page from PDF.js) if available
  const thumb = att.thumbnail;
  if (thumb && thumb.startsWith('data:image/')) {
    return `<div class="${cls}" onclick="${onclick}"><img src="${thumb}" alt="${type} preview" style="width:100%;height:100%;object-fit:cover;"></div>`;
  }

  const icon  = FILE_ICONS[type]  || '📁';
  const label = FILE_LABELS[type] || 'File';
  const fileCls = isMain ? 'quote-file-thumb' : 'att-strip-thumb att-strip-file';
  return `<div class="${fileCls}" onclick="${onclick}"><div class="file-icon">${icon}</div>${isMain ? `<div class="file-label">${label}</div>` : ''}</div>`;
}

/**
 * Build attachment section (image thumb or file icon)
 * Supports note.attachments[] array for multi-attachment notes.
 */
function buildAttachmentSection(note, imageUrl, imageFullUrl) {
  // Use structured attachments[] when available
  const attachments = note.attachments && note.attachments.length > 0 ? note.attachments : null;

  if (attachments) {
    const first = attachments[0];
    const rest  = attachments.slice(1);
    const mainTile = buildSingleAttachmentTile(first, note.id, true);

    if (rest.length === 0) return mainTile;

    // Build extra thumbnails strip (max 4 shown, then "+N" badge)
    const MAX_STRIP = 4;
    const shown = rest.slice(0, MAX_STRIP);
    const overflow = rest.length - MAX_STRIP;
    const stripItems = shown.map(a => buildSingleAttachmentTile(a, note.id, false)).join('');
    const badge = overflow > 0 ? `<div class="att-strip-thumb att-strip-more">+${overflow}</div>` : '';

    return `
      <div class="quote-image-thumb-multi">
        ${mainTile}
        <div class="att-strip">${stripItems}${badge}</div>
      </div>`;
  }

  // Fallback to flat fields
  if (!note.thumbnail && !note.attachment_full) return '';

  const attachmentType = note.attachment_type || 'image';
  const url = note.attachment_full || note.thumbnail;
  const displayUrl = imageUrl || imageFullUrl;

  if (attachmentType === 'encrypted') {
    const rawPath  = (url || '').replace(/^file:/, '').split('/').pop();
    const origName = rawPath.replace(/^\d+\./, '').replace(/\.enc$/i, '');
    return `<div class="quote-file-thumb enc-attach-thumb"
      onclick="event.stopPropagation(); window.openEncryptedAttachment('${url}', '${origName}')"
      title="Encrypted: ${origName}">
      <div class="file-icon">🔒</div><div class="file-label enc-attach-label">${origName}</div>
    </div>`;
  }

  const onclick = `event.stopPropagation(); showFullImage('${url}', ${note.id}, '${attachmentType}')`;

  if (attachmentType === 'image') {
    return `<div class="quote-image-thumb" onclick="${onclick}"><img src="${displayUrl}" alt="Quote attachment"></div>`;
  }
  // Show rendered thumbnail (e.g. PDF first-page) if available
  if (note.thumbnail && note.thumbnail.startsWith('data:image/')) {
    return `<div class="quote-image-thumb" onclick="${onclick}"><img src="${note.thumbnail}" alt="${attachmentType} preview" style="width:100%;height:100%;object-fit:cover;"></div>`;
  }
  const fileIcon  = FILE_ICONS[attachmentType]  || '📁';
  const fileLabel = FILE_LABELS[attachmentType] || 'File';
  return `<div class="quote-file-thumb" onclick="${onclick}"><div class="file-icon">${fileIcon}</div><div class="file-label">${fileLabel}</div></div>`;
}

const SCORE_DICE_NAMES = ['one', 'two', 'three', 'four', 'five', 'six'];

function _scoreDiceIcon(score) {
  const n = parseInt(score, 10);
  if (!n || n < 1 || n > 6) return '';
  return `<i class="fa-solid fa-dice-${SCORE_DICE_NAMES[n - 1]}"></i>`;
}

/** Score dice for list-pane title row (display only). */
export function buildPaneScoreHtml(note) {
  const score = note.score;
  if (!score || parseInt(score, 10) <= 0) return '';
  const icon = _scoreDiceIcon(score);
  if (!icon) return '';
  return `<span class="lp-pane-score quote-score-line" title="Score ${parseInt(score, 10)}">${icon}</span>`;
}

function buildPaneCommentHtml(note) {
  if (!note.comment) return '';
  return `<div class="quote-note-title"><span></span><span>${escapeHtml(note.comment)}</span></div>`;
}

function buildClickableTagsHtml(tagsString) {
  if (!tagsString) return '';
  return tagsString
    .split(',')
    .map((tag) => {
      const trimmedTag = tag.trim();
      if (!trimmedTag) return '';
      return `<span class="tag tag-clickable" onclick="event.stopPropagation(); window.filterByTag('${trimmedTag.replace(/'/g, "\\'")}')" title="Click to filter by this tag">${escapeHtml(trimmedTag)}</span>`;
    })
    .join('');
}

/**
 * Comment + metadata blocks for list-pane header (reuses card builders).
 * @returns {{ commentHtml: string, metadataHtml: string, tagsHtml: string }}
 */
export function buildPaneMetaSections(
  note,
  currentNoteTypeFilter,
  getTrainingTypes,
  getQuoteTypes,
  globalSettings,
) {
  const commentHtml = buildPaneCommentHtml(note) || '';
  const tagsHtml = buildClickableTagsHtml(note.tags);

  const translationBadge = note.translation_group
    ? `<span class="translation-badge" title="Group: ${escapeHtml(note.translation_group)}" onclick="event.stopPropagation(); showTranslationGroup('${escapeHtml(note.translation_group)}')">G</span>`
    : '';

  const noteType = note.note_type || currentNoteTypeFilter || 'quote';
  const noteTypeBadge = getNoteTypeBadgeHtml(noteType, true, currentNoteTypeFilter);

  let metadataHtml = '';
  switch (noteType) {
    case 'quote':
      metadataHtml = buildQuoteMetadata(note, noteTypeBadge, translationBadge, getQuoteTypes);
      break;
    case 'training':
      metadataHtml = buildTrainingMetadata(note, noteTypeBadge, translationBadge, getTrainingTypes);
      break;
    default:
      metadataHtml = buildGenericMetadata(noteTypeBadge, translationBadge);
  }

  return { commentHtml, metadataHtml, tagsHtml };
}

/** Compact author / source / type line for list-pane left-column rows. */
export function buildListPaneRowMetaHtml(note, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes) {
  const noteType = note.note_type || currentNoteTypeFilter || 'note';
  const config = getNoteTypeConfig(noteType);

  if (config.behavior === 'quote' || note.author_name || note.source_name) {
    return buildQuoteMetadata(note, '', '', getQuoteTypes);
  }

  const sourceType = note.source_type || '';
  // Match cards / pane header / training: default "Assorted" adds no useful context.
  if (sourceType && sourceType !== 'ASSORTED') {
    const subTypes = getGenericSubTypes(noteType);
    const found = subTypes.find((t) => t.value === sourceType);
    const icon = found?.icon || '📝';
    const label = found?.label || sourceType;
    return `<div class="meta-item"><span class="type-icon-badge">${icon}</span> <span class="meta-value">${escapeHtml(label)}</span></div>`;
  }

  return '';
}

/**
 * Creates HTML for a note card
 * @param {Object} quote - The quote/note object from database
 * @param {string|null} currentNoteTypeFilter - Current view filter ('quote', 'training', 'note', 'puzzle', or null for 'all')
 * @param {Function} getTrainingTypes - Function that returns training types config
 * @param {Function} getQuoteTypes - Function that returns quote types config
 * @returns {string} HTML string for the card
 */
export function createQuoteCard(note, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings) {
  // Resolve attachment URLs
  const imageUrl = note.thumbnail ? resolveAttachmentUrl(note.thumbnail) : null;
  const imageFullUrl = note.attachment_full ? resolveAttachmentUrl(note.attachment_full) : null;
  
  const tags = buildClickableTagsHtml(note.tags);

  // Check if content is long
  const isLong = isLongContent(note.note_text);
  const quoteId = `quote-${note.id}`;
  const expandBtnId = `expand-${note.id}`;

  // Build score and note line
  const noteScoreLine = buildScoreAndNoteLine(note, globalSettings);
  
  // Translation group badge
  const translationBadge = note.translation_group 
    ? `<span class="translation-badge" title="Group: ${escapeHtml(note.translation_group)}" onclick="event.stopPropagation(); showTranslationGroup('${escapeHtml(note.translation_group)}')">G</span>` 
    : '';
  
  // Note type badge
  const noteType = note.note_type || 'quote';
  const noteTypeBadge = getNoteTypeBadgeHtml(noteType, true, currentNoteTypeFilter);
  
  // Build metadata based on note type
  let metadataContent = '';
  switch (noteType) {
    case 'quote':
      metadataContent = buildQuoteMetadata(note, noteTypeBadge, translationBadge, getQuoteTypes);
      break;
    case 'training':
      metadataContent = buildTrainingMetadata(note, noteTypeBadge, translationBadge, getTrainingTypes);
      break;
    default:
      metadataContent = buildGenericMetadata(noteTypeBadge, translationBadge);
  }
  
  // Build attachment section
  const attachmentSection = buildAttachmentSection(note, imageUrl, imageFullUrl);

  // Return complete card HTML
  const isTraining = noteType === 'training';

  const metaRow = `
                <div class="quote-metadata-row${isTraining ? ' training-meta-top' : ''}">
                    <div class="quote-metadata-left">
                        ${metadataContent}
                    </div>
                    ${tags ? `<div class="quote-tags-inline">${tags}</div>` : ''}
                </div>`;

  const isTextEmpty = !note.note_text || note.note_text === ''
    || /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i.test(note.note_text);
  const stretchEnabled = globalSettings?.stretchImagesWhenEmpty === true;
  const hasMultipleAttachments = note.attachments && note.attachments.length > 1;
  const isTegneserie = noteType === 'tegneserie';
  const isImageOnly = isTextEmpty && stretchEnabled && !hasMultipleAttachments && isTegneserie;
  const hasAttachment = !!(note.thumbnail || note.attachment_full || (note.attachments && note.attachments.length > 0));
  const isCenteredThumbOnly = isTextEmpty && !hasMultipleAttachments && !isTegneserie && hasAttachment && attachmentSection;

  // Tegneserie image-only cards: full-width image directly (no constrained thumb wrapper)
  const imageOnlySection = isImageOnly ? (() => {
    const att = note.attachments && note.attachments.length > 0 ? note.attachments[0] : null;
    const url  = att ? (att.attachment_full || att.thumbnail) : (note.attachment_full || note.thumbnail);
    const thumb = att ? resolveAttachmentUrl(att.thumbnail || att.attachment_full) : (imageUrl || imageFullUrl);
    if (!url || !thumb) return null;
    const onclick = `event.stopPropagation(); showFullImage('${url}', ${note.id}, 'image')`;
    return `<div class="quote-top-section image-only">
      <img class="tegneserie-full-img" src="${thumb}" alt="${escapeHtml(note.note_title || '')}" onclick="${onclick}">
    </div>`;
  })() : null;

  const centeredThumbSection = isCenteredThumbOnly
    ? `<div class="quote-top-section image-only-thumb">${attachmentSection}</div>`
    : null;

  const expandBtnHtml = isLong
    ? `<button class="expand-btn" id="${expandBtnId}" onclick="event.stopPropagation(); toggleQuoteExpand('${note.id}')">▼ Show more</button>`
    : '';
  const quoteBodyHtml = `<div class="quote-text ${isLong ? 'collapsible' : ''}" id="${quoteId}" data-expanded="false">${normalizeTextColors(note.note_text)}</div>${expandBtnHtml}`;

  const topSection = (isImageOnly && imageOnlySection)
    ? imageOnlySection
    : (centeredThumbSection)
    ? centeredThumbSection
    /* No whitespace between </div></div> and ${attachmentSection}: in column flex,
       whitespace-only text nodes become flex items and look like an image placeholder gap. */
    : `<div class="quote-top-section"><div class="quote-left-column">${noteScoreLine}<div class="quote-text-wrapper">${quoteBodyHtml}</div></div>${attachmentSection}</div>`;

  // Gallery-mode thumbnail overlay (hidden unless .gallery-mode is active)
  const galleryThumbHtml = (() => {
    const tagText = note.tags ? note.tags.split(',').map(t => t.trim()).filter(Boolean).join(', ') : '';
    const tagStrip = tagText ? `<div class="gallery-tag-strip">${tagText}</div>` : '';
    if (note.attachment_type === 'image' && imageUrl) {
      return `<div class="gallery-thumb-wrap">
        <img src="${imageUrl}" alt="" loading="lazy">
        ${tagStrip}
      </div>`;
    }
    const icon = note.attachment_full ? (FILE_ICONS[note.attachment_type] || '📁') : '📝';
    return `<div class="gallery-thumb-wrap">
      <div class="gallery-thumb-no-image">${icon}</div>
      ${tagStrip}
    </div>`;
  })();

  const showNoTitle = globalSettings?.displayEmptyTitleInCard === true && noteType !== 'training';
  const titleHtml = (note.note_title && (note.note_title !== 'No title' || showNoTitle))
    ? `<div class="card-note-title">${escapeHtml(note.note_title)}</div>`
    : '';

  return `
        <div class="quote-card ${note.image || note.attachment_full ? 'has-image' : ''}" data-quote-id="${note.id}" data-note-type="${note.note_type || ''}" style="cursor: pointer;">
            ${galleryThumbHtml}
            <div class="quote-card-content">
                ${titleHtml}
                ${isTraining ? metaRow + '<div class="quote-separator"></div>' + topSection
                             : topSection + '<div class="quote-separator"></div>' + metaRow}
            </div>
        </div>
    `;
}
