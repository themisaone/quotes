/**
 * ============================================================================
 * Attachment Viewer Module
 * ============================================================================
 * Handles viewing/displaying different types of attachments (images, PDFs, 
 * video, audio, documents) in modal overlays.
 * 
 * Features:
 * - PDF viewer with embed
 * - Video player
 * - Audio player
 * - Image viewer with optional downscale button
 * - Document handler (opens in new tab)
 */

import { getElementByIdSafe } from '../constants.js';

// ============================================
// Constants
// ============================================

// Modal Configuration
const MODAL_CONFIG = {
  CLASS_NAME: 'image-modal',
  CONTENT_CLASS: 'image-modal-content',
  CLOSE_CLASS: 'image-modal-close'
};

// Viewer Types
const VIEWER_TYPES = {
  PDF: 'pdf',
  VIDEO: 'video',
  AUDIO: 'audio',
  IMAGE: 'image',
  DOCUMENT: 'document',
  OTHER: 'other'
};

// Icons
const ICONS = {
  PDF: '📄',
  VIDEO: '🎬',
  AUDIO: '🎵',
  CLOSE: '×'
};

// Default Filenames
const DEFAULT_FILENAMES = {
  PDF: 'document.pdf',
  VIDEO: 'video',
  AUDIO: 'audio'
};

// MIME Type Mappings
const MIME_TO_EXTENSION = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip'
};

const EXTENSION_TO_TYPE_NAME = {
  'xlsx': 'spreadsheet',
  'xls': 'spreadsheet',
  'docx': 'document',
  'doc': 'document',
  'ods': 'spreadsheet',
  'odt': 'document',
  'csv': 'data',
  'txt': 'text',
  'zip': 'archive'
};

// Styling — layout-only inline styles; colors handled by CSS classes (viewer-*)
const STYLES = {
  HEADER: 'padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;',
  HEADER_TEXT: 'font-weight: 500;',
  CLOSE_BUTTON: 'position: static; font-size: 2rem; cursor: pointer;',
  PDF_CONTAINER: 'padding: 0; height: 80vh; border-radius: 0 0 8px 8px;',
  PDF_EMBED: 'border: none; border-radius: 0 0 8px 8px;',
  VIDEO: 'max-width: 90vw; max-height: 80vh; border-radius: 0 0 8px 8px;',
  AUDIO_CONTAINER: 'padding: 2rem; border-radius: 0 0 8px 8px;',
  AUDIO: 'width: 100%;',
  AUDIO_CONTENT_WIDTH: 'max-width: 500px;',
  PDF_CONTENT_SIZE: 'max-width: 90vw; max-height: 90vh; width: auto; height: auto;',
  DOWNSCALE_BUTTON: 'position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 10001; padding: 0.75rem 1.5rem; font-size: 1rem;'
};

// ============================================
// Public API
// ============================================

/**
 * Show full-size attachment viewer
 * Routes to appropriate viewer based on attachment type
 * @param {string} imageSrc - Image source (data URL or file reference)
 * @param {number|null} quoteId - Quote ID (for downscale button)
 * @param {string} attachmentType - Type of attachment
 * @param {Object} callbacks - Optional callbacks
 * @param {Function} callbacks.onDownscale - Called when downscale button is clicked
 */
export function showFullImage(imageSrc, quoteId = null, attachmentType = 'image', callbacks = {}) {
  const fileInfo = parseFileSource(imageSrc);
  
  // Route to appropriate viewer
  if (isPDF(attachmentType, fileInfo.mimeType)) {
    showPDFViewer(fileInfo.actualSrc, fileInfo.filePath);
    return;
  }
  
  if (isVideo(attachmentType, fileInfo.mimeType)) {
    showVideoPlayer(fileInfo.actualSrc, fileInfo.filePath);
    return;
  }
  
  if (isAudio(attachmentType, fileInfo.mimeType)) {
    showAudioPlayer(fileInfo.actualSrc, fileInfo.filePath, fileInfo.mimeType);
    return;
  }
  
  if (isDocument(attachmentType)) {
    openDocument(fileInfo.actualSrc);
    return;
  }
  
  // Default: Image viewer
  showImageViewer(fileInfo, quoteId, attachmentType, callbacks);
}

/**
 * Show PDF viewer in modal
 * @param {string} pdfSrc - PDF source URL
 * @param {string|null} filePath - File path (for filename extraction)
 */
export function showPDFViewer(pdfSrc, filePath = null) {
  const filename = extractFilename(filePath, DEFAULT_FILENAMES.PDF);
  const modal = createModal();
  
  modal.innerHTML = buildPDFViewerHTML(pdfSrc, filename);
  
  attachModalHandlers(modal);
  showModal(modal);
}

/**
 * Show video player in modal
 * @param {string} videoSrc - Video source URL
 * @param {string|null} filePath - File path (for filename extraction)
 */
export function showVideoPlayer(videoSrc, filePath = null) {
  const filename = extractFilename(filePath, DEFAULT_FILENAMES.VIDEO);
  const modal = createModal();
  
  modal.innerHTML = buildVideoPlayerHTML(videoSrc, filename);
  
  attachModalHandlers(modal);
  showModal(modal);
}

/**
 * Show audio player in modal
 * @param {string} audioSrc - Audio source URL
 * @param {string|null} filePath - File path (for filename extraction)
 * @param {string|null} mimeType - MIME type (used for base64 filename)
 */
export function showAudioPlayer(audioSrc, filePath = null, mimeType = null) {
  const resolvedMime = mimeType || extractMimeFromDataUrl(audioSrc);
  const filename = filePath
    ? filePath.split('/').pop()
    : buildFilenameFromMime(DEFAULT_FILENAMES.AUDIO, resolvedMime);
  const modal = createModal();

  // Convert data URL → Blob URL for reliable browser playback
  // (large data URLs set via innerHTML are often silently ignored by <audio>)
  const { playbackSrc, blobUrl } = dataUrlToBlobUrl(audioSrc, resolvedMime || 'audio/wav');

  modal.innerHTML = buildAudioPlayerHTML(playbackSrc, audioSrc, filename);

  attachModalHandlers(modal);
  if (blobUrl) scheduleRevokeOnClose(modal, blobUrl);
  showModal(modal);
}

/**
 * Download attachment to user's device
 * @param {string} dataUrl - Data URL or file path
 * @param {string} filename - Filename for download
 * @param {number|null} quoteId - Optional quote ID (not currently used)
 */
export function downloadAttachment(dataUrl, filename, quoteId = null) {
  try {
    const link = createDownloadLink(dataUrl, filename || 'attachment');
    triggerLinkClick(link);
  } catch (error) {
    handleDownloadError(error);
  }
}

/**
 * Handle download error
 * @param {Error} error - The error
 */
function handleDownloadError(error) {
  console.error('Error downloading attachment:', error);
  alert('Failed to download attachment. Please try again.');
}

// ============================================
// Helper Functions - File Parsing
// ============================================

/**
 * Parse file source (handles external file references)
 * @param {string} src - Source string
 * @returns {Object} Parsed file info
 */
function parseFileSource(src) {
  if (!src || !src.startsWith('file:')) {
    // Extract real MIME type from data: URL if available
    let mimeType = 'application/octet-stream';
    if (src && src.startsWith('data:')) {
      const m = src.match(/^data:([^;]+);/);
      if (m) mimeType = m[1];
    }
    return {
      actualSrc: src,
      isExternalFile: false,
      filePath: null,
      mimeType
    };
  }
  
  // Parse: "file:quotes/123.jpg:image/jpeg" -> "/attachments/quotes/123.jpg"
  const parts = src.split(':');
  const filePath = parts[1];
  const mimeType = parts[2] || 'image/jpeg';
  
  return {
    actualSrc: `/attachments/${filePath}`,
    isExternalFile: true,
    filePath,
    mimeType
  };
}

/**
 * Extract filename from file path
 * @param {string|null} filePath - File path
 * @param {string} defaultName - Default filename if path is null
 * @returns {string} Extracted filename
 */
function extractFilename(filePath, defaultName) {
  return filePath ? filePath.split('/').pop() : defaultName;
}

/**
 * Convert a data: URL to a Blob URL for reliable media playback.
 * Returns { playbackSrc, blobUrl } — blobUrl is null if conversion fails or not needed.
 */
function dataUrlToBlobUrl(src, mimeType) {
  if (!src || !src.startsWith('data:')) return { playbackSrc: src, blobUrl: null };
  try {
    const base64 = src.split(',')[1];
    const binary  = atob(base64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob    = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    return { playbackSrc: blobUrl, blobUrl };
  } catch (e) {
    console.warn('Blob URL conversion failed, falling back to data URL', e);
    return { playbackSrc: src, blobUrl: null };
  }
}

/**
 * Revoke a Blob URL once its modal is removed from the DOM.
 */
function scheduleRevokeOnClose(modal, blobUrl) {
  const observer = new MutationObserver(() => {
    if (!document.body.contains(modal)) {
      URL.revokeObjectURL(blobUrl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}


function extractMimeFromDataUrl(src) {
  if (!src || !src.startsWith('data:')) return '';
  const m = src.match(/^data:([^;]+);/);
  return m ? m[1] : '';
}

/**
 * Build a filename with the proper extension derived from a MIME type.
 * e.g. buildFilenameFromMime('audio', 'audio/wav') → 'audio.wav'
 * @param {string} base - Base name without extension
 * @param {string} mimeType
 * @returns {string}
 */
function buildFilenameFromMime(base, mimeType) {
  if (!mimeType) return base;
  const sub = mimeType.split('/')[1] || '';
  // Remove codec qualifiers like "wav; codecs=pcm"
  const ext = sub.split(';')[0].trim();
  return ext ? `${base}.${ext}` : base;
}

// ============================================
// Helper Functions - Type Detection
// ============================================

/**
 * Check if attachment is a PDF
 * @param {string} type - Attachment type
 * @param {string} mimeType - MIME type
 * @returns {boolean} True if PDF
 */
function isPDF(type, mimeType) {
  return type === VIEWER_TYPES.PDF || mimeType === 'application/pdf';
}

/**
 * Check if attachment is a video
 * @param {string} type - Attachment type
 * @param {string} mimeType - MIME type
 * @returns {boolean} True if video
 */
function isVideo(type, mimeType) {
  return type === VIEWER_TYPES.VIDEO || mimeType.startsWith('video/');
}

/**
 * Check if attachment is audio
 * @param {string} type - Attachment type
 * @param {string} mimeType - MIME type
 * @returns {boolean} True if audio
 */
function isAudio(type, mimeType) {
  return type === VIEWER_TYPES.AUDIO || mimeType.startsWith('audio/');
}

/**
 * Check if attachment is a document
 * @param {string} type - Attachment type
 * @returns {boolean} True if document
 */
function isDocument(type) {
  return type === VIEWER_TYPES.DOCUMENT || type === VIEWER_TYPES.OTHER;
}

// ============================================
// Helper Functions - Document Handling
// ============================================

/**
 * Open document in new tab/download
 * @param {string} src - Document source
 */
function openDocument(src) {
  const fileInfo = extractDocumentInfo(src);
  const link = createDownloadLink(src, fileInfo.filename);
  
  triggerLinkClick(link);
}

/**
 * Extract document info (filename and extension)
 * @param {string} src - Document source
 * @returns {Object} Document info
 */
function extractDocumentInfo(src) {
  if (!src.startsWith('data:')) {
    return { filename: 'attachment.bin', extension: 'bin' };
  }
  
  const mimeType = extractMimeType(src);
  const extension = mapMimeToExtension(mimeType);
  const typeName = mapExtensionToTypeName(extension);
  const filename = `${typeName}.${extension}`;
  
  return { filename, extension };
}

/**
 * Extract MIME type from data URL
 * @param {string} dataUrl - Data URL
 * @returns {string} MIME type
 */
function extractMimeType(dataUrl) {
  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  return mimeMatch ? mimeMatch[1] : 'application/octet-stream';
}

/**
 * Map MIME type to file extension
 * @param {string} mimeType - MIME type
 * @returns {string} File extension
 */
function mapMimeToExtension(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || 'bin';
}

/**
 * Map file extension to type name
 * @param {string} extension - File extension
 * @returns {string} Type name
 */
function mapExtensionToTypeName(extension) {
  return EXTENSION_TO_TYPE_NAME[extension] || 'attachment';
}

/**
 * Create download link element
 * @param {string} href - Link URL
 * @param {string} filename - Download filename
 * @returns {HTMLElement} Link element
 */
function createDownloadLink(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

/**
 * Trigger link click and cleanup
 * @param {HTMLElement} link - Link element
 */
function triggerLinkClick(link) {
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================
// Helper Functions - Image Viewer
// ============================================

/**
 * Show image viewer with optional downscale button.
 * We load the image first to get its real pixel dimensions, then decide
 * whether the downscale button is needed (only for images > 1024 px on any side).
 * @param {Object} fileInfo - File information
 * @param {number|null} quoteId - Quote ID
 * @param {string} attachmentType - Attachment type
 * @param {Object} callbacks - Callbacks
 */
function showImageViewer(fileInfo, quoteId, attachmentType, callbacks) {
  const modal = createModal();

  // Show the viewer immediately without the downscale button, then add it
  // asynchronously once we know the real image dimensions.
  modal.innerHTML = buildImageViewerHTML(fileInfo.actualSrc, false);
  attachModalHandlers(modal);
  showModal(modal);

  // Only bother checking dimensions if the preconditions are met
  if (!fileInfo.isExternalFile || !quoteId || attachmentType !== VIEWER_TYPES.IMAGE) return;

  const img = new Image();
  img.onload = () => {
    // Only offer downscale if either dimension actually exceeds 1024 px
    if (img.naturalWidth > 1024 || img.naturalHeight > 1024) {
      const btnHTML = `
        <button id="downscaleImageBtn" class="btn btn-primary" style="${STYLES.DOWNSCALE_BUTTON}">
          � Downscale to 1024px
        </button>`;
      const content = modal.querySelector('.image-modal-content');
      if (content) content.insertAdjacentHTML('beforeend', btnHTML);
      attachDownscaleHandler(modal, quoteId, fileInfo, callbacks);
    }
  };
  img.src = fileInfo.actualSrc;
}

/**
 * Check if downscale button should be shown (legacy helper, kept for reference).
 * Actual check is now done asynchronously in showImageViewer.
 * @param {Object} fileInfo - File information
 * @param {number|null} quoteId - Quote ID
 * @param {string} attachmentType - Attachment type
 * @returns {boolean} True if worth loading dimensions
 */
function shouldShowDownscaleButton(fileInfo, quoteId, attachmentType) {
  return fileInfo.isExternalFile && quoteId && attachmentType === VIEWER_TYPES.IMAGE;
}

/**
 * Attach downscale button handler
 * @param {HTMLElement} modal - Modal element
 * @param {number} quoteId - Quote ID
 * @param {Object} fileInfo - File information
 * @param {Object} callbacks - Callbacks
 */
function attachDownscaleHandler(modal, quoteId, fileInfo, callbacks) {
  const btn = modal.querySelector('#downscaleImageBtn');
  if (!btn || !callbacks.onDownscale) return;
  
  btn.onclick = async (e) => {
    e.stopPropagation();
    await callbacks.onDownscale(quoteId, fileInfo.actualSrc, fileInfo.filePath, modal);
  };
}

// ============================================
// Helper Functions - HTML Builders
// ============================================

/**
 * Build PDF viewer HTML
 * @param {string} pdfSrc - PDF source
 * @param {string} filename - Filename
 * @returns {string} HTML string
 */
function buildPDFViewerHTML(pdfSrc, filename) {
  const escapedFilename = typeof escapeHtml === 'function' ? escapeHtml(filename) : filename;
  
  return `
    <div class="${MODAL_CONFIG.CONTENT_CLASS}" style="${STYLES.PDF_CONTENT_SIZE}">
      <div class="viewer-header" style="${STYLES.HEADER}">
        <span class="viewer-header-text" style="${STYLES.HEADER_TEXT}">${ICONS.PDF} ${escapedFilename}</span>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <a href="${pdfSrc}" download="${filename}" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem;" title="Download">⬇ Download</a>
          <span class="${MODAL_CONFIG.CLOSE_CLASS} viewer-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" style="${STYLES.CLOSE_BUTTON}">${ICONS.CLOSE}</span>
        </div>
      </div>
      <div class="viewer-pdf-container" style="${STYLES.PDF_CONTAINER}">
        <embed src="${pdfSrc}" type="application/pdf" width="100%" height="100%" style="${STYLES.PDF_EMBED}" />
      </div>
    </div>
  `;
}

/**
 * Build video player HTML
 * @param {string} videoSrc - Video source
 * @param {string} filename - Filename
 * @returns {string} HTML string
 */
function buildVideoPlayerHTML(videoSrc, filename) {
  const escapedFilename = typeof escapeHtml === 'function' ? escapeHtml(filename) : filename;
  
  return `
    <div class="${MODAL_CONFIG.CONTENT_CLASS}">
      <div class="viewer-header" style="${STYLES.HEADER}">
        <span class="viewer-header-text" style="${STYLES.HEADER_TEXT}">${ICONS.VIDEO} ${escapedFilename}</span>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <a href="${videoSrc}" download="${filename}" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem;" title="Download">⬇ Download</a>
          <span class="${MODAL_CONFIG.CLOSE_CLASS} viewer-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" style="${STYLES.CLOSE_BUTTON}">${ICONS.CLOSE}</span>
        </div>
      </div>
      <video controls src="${videoSrc}" style="${STYLES.VIDEO}">
        Your browser does not support the video tag.
      </video>
    </div>
  `;
}

/**
 * Build audio player HTML
 * @param {string} audioSrc - Audio source
 * @param {string} filename - Filename
 * @returns {string} HTML string
 */
function buildAudioPlayerHTML(audioSrc, downloadSrc, filename) {
  const escapedFilename = typeof escapeHtml === 'function' ? escapeHtml(filename) : filename;
  
  return `
    <div class="${MODAL_CONFIG.CONTENT_CLASS}" style="${STYLES.AUDIO_CONTENT_WIDTH}">
      <div class="viewer-header" style="${STYLES.HEADER}">
        <span class="viewer-header-text" style="${STYLES.HEADER_TEXT}">${ICONS.AUDIO} ${escapedFilename}</span>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <a href="${downloadSrc}" download="${filename}" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem;" title="Download">⬇ Download</a>
          <span class="${MODAL_CONFIG.CLOSE_CLASS} viewer-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" style="${STYLES.CLOSE_BUTTON}">${ICONS.CLOSE}</span>
        </div>
      </div>
      <div class="viewer-media-container" style="${STYLES.AUDIO_CONTAINER}">
        <audio controls src="${audioSrc}" style="${STYLES.AUDIO}">
          Your browser does not support the audio tag.
        </audio>
      </div>
    </div>
  `;
}

/**
 * Build image viewer HTML
 * @param {string} imageSrc - Image source
 * @param {boolean} showDownscaleButton - Whether to show downscale button
 * @returns {string} HTML string
 */
function buildImageViewerHTML(imageSrc, showDownscaleButton) {
  const downscaleButton = showDownscaleButton ? `
    <button id="downscaleImageBtn" class="btn btn-primary" style="${STYLES.DOWNSCALE_BUTTON}">
      📦 Downscale to 1024px
    </button>
  ` : '';
  
  return `
    <div class="${MODAL_CONFIG.CONTENT_CLASS}">
      <span class="${MODAL_CONFIG.CLOSE_CLASS}" onclick="this.parentElement.parentElement.remove()">${ICONS.CLOSE}</span>
      <img src="${imageSrc}" alt="Full size image">
      ${downscaleButton}
    </div>
  `;
}

// ============================================
// Helper Functions - Modal Management
// ============================================

/**
 * Create modal element
 * @returns {HTMLElement} Modal element
 */
function createModal() {
  const modal = document.createElement('div');
  modal.className = MODAL_CONFIG.CLASS_NAME;
  return modal;
}

/**
 * Attach modal close handlers
 * @param {HTMLElement} modal - Modal element
 */
function attachModalHandlers(modal) {
  modal.onclick = (e) => {
    if (e.target === modal) {
      removeModal(modal);
    }
  };
}

/**
 * Show modal by appending to body
 * @param {HTMLElement} modal - Modal element
 */
function showModal(modal) {
  document.body.appendChild(modal);
}

/**
 * Remove modal from DOM
 * @param {HTMLElement} modal - Modal element
 */
function removeModal(modal) {
  modal.remove();
}
