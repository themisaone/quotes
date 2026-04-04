/**
 * ============================================================================
 * ATTACHMENT HANDLING
 * ============================================================================
 * File upload, preview, and display logic for images and other attachments.
 * Handles downscaling, thumbnails, and various file types (PDF, documents, video, audio).
 * 
 * Main functions:
 * - readAttachmentFile() - Read any file type (image, PDF, document, video, audio)
 * - readImageFile() - Read and process image files with optional downscaling
 * - handlePasteEvent() - Handle paste events for images
 * - displayImage() / clearImagePreview() - Preview management
 * - downscaleAndMoveToDb() - Downscale external images and move to DB
 * 
 * Dependencies:
 * - Requires resolveAttachmentUrl, getAttachmentIcon, escapeHtml from utils
 */

import { resolveAttachmentUrl, getAttachmentIcon } from './utils.js?v=20260318a';
import { getElementByIdSafe } from '../constants.js?v=20260318a';

// ============= CONSTANTS =============

const THUMBNAIL_SIZE = 240;
const FULL_SIZE_LIMIT = 1024;
const AUTHOR_SOURCE_IMAGE_SIZE = 300;
const JPEG_QUALITY = 0.85;

// Files larger than this (in bytes) are uploaded directly as binary (FormData)
// instead of being base64-encoded in the JSON body, to avoid the body-size limit.
const DIRECT_UPLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB

const ATTACHMENT_TYPES = {
  IMAGE: 'image',
  PDF: 'pdf',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  OTHER: 'other'
};

const PLACEHOLDERS = {
  quote: 'Paste image (Ctrl+V) or click to upload file',
  author: 'Paste image (Ctrl+V) or click to upload',
  source: 'Paste image (Ctrl+V) or click to upload'
};

const ICONS = {
  author: '📷',
  source: '📚',
  quote: '📎'
};

// ============= HELPER FUNCTIONS =============

/**
 * Check if value is a base64 image
 */
export function isBase64Image(value) {
  return value && typeof value === 'string' && value.startsWith('data:image/');
}

/**
 * Check if value is a base64 file
 */
export function isBase64File(value) {
  return value && typeof value === 'string' && value.startsWith('data:');
}

/**
 * Get MIME type from base64 string
 */
export function getMimeType(base64String) {
  if (!base64String || !base64String.startsWith('data:')) return null;
  const match = base64String.match(/^data:([^;]+);/);
  return match ? match[1] : null;
}

/**
 * Detect attachment type from MIME type
 */
export function detectAttachmentType(mimeType) {
  if (!mimeType) return ATTACHMENT_TYPES.OTHER;
  
  if (mimeType.startsWith('image/')) return ATTACHMENT_TYPES.IMAGE;
  if (mimeType === 'application/pdf') return ATTACHMENT_TYPES.PDF;
  if (mimeType.startsWith('video/')) return ATTACHMENT_TYPES.VIDEO;
  if (mimeType.startsWith('audio/')) return ATTACHMENT_TYPES.AUDIO;
  if (mimeType.includes('document') || mimeType.includes('word') || 
      mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return ATTACHMENT_TYPES.DOCUMENT;
  }
  
  return ATTACHMENT_TYPES.OTHER;
}

/**
 * Read file as base64
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Get file size from base64 string (in bytes)
 */
export function getBase64Size(base64String) {
  if (!base64String || !base64String.startsWith('data:')) return 0;
  
  const base64Data = base64String.split(',')[1] || '';
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Check if file exceeds size threshold
 */
export function exceedsThreshold(base64String, thresholdMB = 1) {
  const size = getBase64Size(base64String);
  const thresholdBytes = thresholdMB * 1024 * 1024;
  return size > thresholdBytes;
}

// ============= IMAGE RESIZING =============

/**
 * Resize image to fit within maxDimension (longest side)
 * @param {Image} img - Image object
 * @param {number} maxDimension - Maximum dimension for longest side
 * @returns {string} Base64 encoded resized image
 */
export function resizeImage(img, maxDimension) {
  const canvas = document.createElement("canvas");
  let width = img.width;
  let height = img.height;

  // Calculate new dimensions
  if (width > height) {
    if (width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    }
  } else {
    if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to base64 with compression
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * Downscale image to fit within max dimensions
 */
export function downscaleImage(base64Image, maxWidth = 1200, maxHeight = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // Check if downscaling is needed
      if (width <= maxWidth && height <= maxHeight) {
        resolve(base64Image); // No downscaling needed
        return;
      }
      
      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      
      // Create canvas and draw downscaled image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to base64
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = reject;
    img.src = base64Image;
  });
}

/**
 * Create thumbnail from image
 */
export function createThumbnail(base64Image, maxWidth = 300, maxHeight = 300) {
  return downscaleImage(base64Image, maxWidth, maxHeight);
}

// ============= ICON THUMBNAIL CREATION =============

/**
 * Create icon thumbnail for non-image attachments (canvas-based)
 * @param {string} icon - Emoji icon
 * @param {string} filename - File name
 * @param {string} size - Formatted file size
 * @returns {string} Base64 encoded canvas image
 */
export function createIconThumbnail(icon, filename, size) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext("2d");
  
  // Background
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  
  // Icon
  ctx.font = "80px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, THUMBNAIL_SIZE / 2, 100);
  
  // Filename (truncated)
  ctx.font = "14px Arial";
  ctx.fillStyle = "#333";
  const truncated = filename.length > 20 ? filename.substring(0, 17) + "..." : filename;
  ctx.fillText(truncated, THUMBNAIL_SIZE / 2, 160);
  
  // Size
  ctx.font = "12px Arial";
  ctx.fillStyle = "#666";
  ctx.fillText(size, THUMBNAIL_SIZE / 2, 180);
  
  return canvas.toDataURL("image/png");
}

// ============= PDF THUMBNAIL =============

const PDF_THUMB_WIDTH = 220; // px
let _pdfjsLib = null; // cached after first load

/**
 * Render page 1 of a PDF File as a base64 JPEG thumbnail.
 * Returns null on failure (caller falls back to icon thumbnail).
 */
async function generatePdfThumbnail(file) {
  try {
    if (!_pdfjsLib) {
      // Load from local server (served from node_modules/pdfjs-dist/build)
      const mod = await import('/pdfjs/pdf.mjs');
      mod.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      _pdfjsLib = mod;
    }

    const url = URL.createObjectURL(file);
    try {
      const pdf    = await _pdfjsLib.getDocument(url).promise;
      const page   = await pdf.getPage(1);
      const vp0    = page.getViewport({ scale: 1 });
      const scale  = PDF_THUMB_WIDTH / vp0.width;
      const vp     = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.warn('PDF thumbnail generation failed:', e);
    return null;
  }
}

// ============= VIDEO THUMBNAIL =============

/**
 * Extract a frame from a video File as a base64 JPEG thumbnail (client-side, no server needed).
 * Seeks to 10% of the duration for a meaningful frame.
 * Returns null on failure.
 */
async function generateVideoThumbnail(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted   = true;
    video.playsInline = true;

    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };

    video.onloadedmetadata = () => {
      const seekTo = Math.min(Math.max(video.duration * 0.1, 2), 30);
      video.currentTime = isFinite(seekTo) ? seekTo : 2;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_W  = 320;
        const scale  = Math.min(1, MAX_W / video.videoWidth);
        canvas.width  = Math.round(video.videoWidth  * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      } catch (e) {
        console.warn('Video thumbnail generation failed:', e);
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    video.src = url;
  });
}

// ============= FILE READING =============

/**
 * Upload a large file directly to the server via FormData (binary, no base64).
 * Returns a file: reference string, e.g. "file:notes/tmp_1234.pdf:application/pdf"
 */
async function uploadLargeFileDirect(file, folder = 'notes') {
  const formData = new FormData();
  formData.append('file', file);
  // Pass folder as query param — req.body.folder isn't available in multer's
  // destination callback (file field precedes text fields in FormData).
  const response = await fetch(`/api/upload-attachment?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${response.status})`);
  }

  const data = await response.json();
  console.log(`📁 Direct upload complete: ${data.filename} (${data.sizeMB} MB) → ${data.fileRef}`);
  return data.fileRef;
}

/**
 * Read attachment file (handles all types: images, PDFs, documents, etc.)
 * @param {File} file - File object from input
 * @param {string} type - Context type ('quote', 'author', 'source')
 * @param {Object} state - State object to update
 * @param {Object} callbacks - Callback functions
 * @param {string} folder - Storage folder hint for large-file direct upload (e.g. 'historical')
 * @returns {Promise<Object>} Processed attachment data
 */
export async function readAttachmentFile(file, type, state, callbacks, folder = 'notes') {
  // For author/source, only images allowed
  if (type !== "quote") {
    return await readImageFile(file, type, state, callbacks);
  }
  
  // Determine attachment type
  const mimeType = file.type;
  const attachmentType = detectAttachmentType(mimeType);
  const sizeMB = (file.size / 1024 / 1024).toFixed(2);
  
  console.log(`📎 Reading ${attachmentType} file: ${file.name} (${sizeMB} MB)`);
  
  // Handle images differently - downscale if needed
  if (attachmentType === ATTACHMENT_TYPES.IMAGE) {
    return await readImageFile(file, type, state, callbacks);
  }

  // For non-image files: respect the storage threshold.
  // Files >= threshold → upload directly to disk (file: reference).
  // Files < threshold  → read as base64 for DB storage.
  const thresholdMB = state?.globalSettings?.externalStorageThreshold || 1;
  const shouldUploadToDisk = file.size >= thresholdMB * 1024 * 1024;

  const icon     = getAttachmentIcon(attachmentType);
  const sizeText = formatFileSize(file.size);

  // Generate thumbnail in parallel (only for PDF and Video)
  const thumbPromise =
    attachmentType === ATTACHMENT_TYPES.PDF   ? generatePdfThumbnail(file)   :
    attachmentType === ATTACHMENT_TYPES.VIDEO ? generateVideoThumbnail(file) :
    Promise.resolve(null);

  let fullData;
  let previewThumb;

  if (shouldUploadToDisk) {
    console.log(`🚀 Large non-image file (${sizeMB} MB ≥ ${thresholdMB} MB threshold) — uploading directly to server...`);
    if (callbacks?.onProgress) callbacks.onProgress(`Uploading ${sizeMB} MB file directly...`);
    [fullData, previewThumb] = await Promise.all([uploadLargeFileDirect(file, folder), thumbPromise]);
  } else {
    console.log(`📦 Small non-image file (${sizeMB} MB < ${thresholdMB} MB threshold) — reading as base64 for DB...`);
    [fullData, previewThumb] = await Promise.all([
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = (e) => res(e.target.result);
        reader.onerror = (e) => rej(e);
        reader.readAsDataURL(file);
      }),
      thumbPromise
    ]);
  }

  const thumbnail = previewThumb || createIconThumbnail(icon, file.name, sizeText);

  const result = {
    thumbnail,
    full: fullData,
    type: attachmentType,
    filename: file.name
  };

  if (callbacks?.onAttachmentLoaded) {
    callbacks.onAttachmentLoaded(result, icon, file.name, sizeText);
  }
  return result;
}

/**
 * Read and process image file
 * @param {File} file - Image file
 * @param {string} type - Context type ('quote', 'author', 'source')
 * @param {Object} state - State object (e.g., globalSettings)
 * @param {Object} callbacks - Callbacks for UI updates
 * @returns {Promise<Object>} Processed image data
 */
export async function readImageFile(file, type, state, callbacks) {
  if (!file.type.match("image.*")) {
    alert("Please select an image file");
    return Promise.reject("Not an image file");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let result;
        
        if (type === "quote") {
          // Check if downscaling is enabled
          const shouldDownscale = state?.downscaleQuoteImages !== false;
          
          if (shouldDownscale) {
            // DOWNSCALING ON: Resize to save space
            const fullSize = resizeImage(img, FULL_SIZE_LIMIT);
            const thumbnail = resizeImage(img, THUMBNAIL_SIZE);
            
            result = {
              thumbnail,
              full: fullSize,
              type: ATTACHMENT_TYPES.IMAGE,
              filename: file.name
            };
            
            console.log(`✅ DOWNSCALING ON: Full=${(fullSize.length/1024).toFixed(0)}KB, Thumb=${(thumbnail.length/1024).toFixed(0)}KB`);
          } else {
            // DOWNSCALING OFF: Store raw images at full size
            const thumbnail = resizeImage(img, THUMBNAIL_SIZE);
            
            result = {
              thumbnail,
              full: e.target.result, // Original/raw image
              type: ATTACHMENT_TYPES.IMAGE,
              filename: file.name
            };
            
            console.log(`✅ DOWNSCALING OFF: Full=${(e.target.result.length/1024/1024).toFixed(2)}MB, Thumb=${(thumbnail.length/1024).toFixed(0)}KB`);
          }
          
          // Update UI if callback provided
          if (callbacks?.onImageLoaded) {
            callbacks.onImageLoaded(result);
          }
        } else {
          // For author/source, always resize to 300px
          const resizedBase64 = resizeImage(img, AUTHOR_SOURCE_IMAGE_SIZE);
          
          result = {
            thumbnail: resizedBase64,
            type,
            filename: file.name
          };
          
          // Update UI if callback provided
          if (callbacks?.onImageLoaded) {
            callbacks.onImageLoaded(result);
          }
        }
        
        resolve(result);
      };
      
      img.onerror = reject;
      img.src = e.target.result;
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============= PASTE HANDLING =============

/**
 * Handle paste event for images
 * @param {ClipboardEvent} e - Paste event
 * @param {string} type - Context type ('quote', 'author', 'source')
 * @param {Object} state - State object
 * @param {Object} callbacks - Callbacks for processing
 */
export function handlePasteEvent(e, type, state, callbacks) {
  const items = e.clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      readImageFile(blob, type, state, callbacks);
      break;
    }
  }
}

// ============= DISPLAY FUNCTIONS =============

/**
 * Display image in container
 */
export function displayImage(container, imageUrl, escapeHtmlFn) {
  console.log('🖼️ displayImage called:', { containerId: container?.id, hasUrl: !!imageUrl });
  
  if (!container) {
    console.warn('⚠️ displayImage: no container');
    return;
  }
  
  const resolved = resolveAttachmentUrl(imageUrl);
  console.log('🔗 Resolved URL:', resolved ? 'yes' : 'no');
  
  if (resolved) {
    container.innerHTML = `<img src="${resolved}" alt="Preview">`;
    container.classList.add('has-image');
    
    // Log what we just set
    const img = container.querySelector('img');
    console.log('✅ Image HTML set:', {
      hasImgTag: !!img,
      imgSrc: img?.src?.substring(0, 50),
      containerWidth: container.offsetWidth,
      containerHeight: container.offsetHeight,
      imgWidth: img?.width,
      imgHeight: img?.height
    });
    
    // Show the X button if it exists (sibling of container)
    // Support both .image-clear-x and .clear-image-btn
    const xButton = container.parentElement?.querySelector('.image-clear-x, .clear-image-btn');
    if (xButton) {
      xButton.style.display = 'flex';
      console.log('✅ X button shown');
    } else {
      console.warn('⚠️ No X button found in parent');
    }
  }
}

/**
 * Display attachment preview (for non-image files)
 */
export function displayAttachmentPreview(container, icon, filename, size, escapeHtmlFn, thumbnail = null) {
  if (!container) return;

  // Helper: reveal the X / clear button next to the preview container
  const showXBtn = () => {
    const xButton = container.parentElement?.querySelector('.image-clear-x, .clear-image-btn');
    if (xButton) xButton.style.display = 'flex';
  };

  // If we have a real image thumbnail (e.g. PDF first-page from PDF.js), show it directly
  if (thumbnail && thumbnail.startsWith('data:image/')) {
    container.innerHTML = `<img src="${thumbnail}" alt="${filename}" style="width:100%;height:100%;object-fit:contain;border-radius:4px;">`;
    container.classList.add('has-image');
    showXBtn();
    return;
  }

  const truncated = filename.length > 30 ? filename.substring(0, 27) + "..." : filename;
  const safeFilename = escapeHtmlFn ? escapeHtmlFn(truncated) : truncated;
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 1rem; background: #f9f9f9;">
      <div style="font-size: 60px; margin-bottom: 0.5rem;">${icon}</div>
      <div style="font-size: 14px; font-weight: 500; text-align: center; margin-bottom: 0.25rem;">${safeFilename}</div>
      <div style="font-size: 12px; color: #666;">${size}</div>
    </div>
  `;
  container.classList.add('has-image');
  showXBtn();
}

/**
 * Clear image preview
 */
export function clearImagePreview(container, type = 'quote') {
  if (!container) return;
  
  const icon = ICONS[type] || ICONS.quote;
  const placeholder = PLACEHOLDERS[type] || PLACEHOLDERS.quote;

  // Check if it's the compact preview
  const isCompact = container.classList.contains("image-preview-compact");

  if (isCompact) {
    container.innerHTML = `
      <div class="image-placeholder-compact">
        <span>${icon}</span>
        <p>Paste (Ctrl+V) or click 📁</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="image-placeholder">
        <span>${icon}</span>
        <p>${placeholder}</p>
      </div>
    `;
  }
  container.classList.remove("has-image");
  
  // Hide the X button if it exists (sibling of container)
  const xButton = container.parentElement?.querySelector('.image-clear-x');
  if (xButton) {
    xButton.style.display = 'none';
  }
}

// ============= DOWNSCALE AND MOVE TO DB =============

/**
 * Downscale external image and move to database
 * @param {number} quoteId - Quote ID
 * @param {string} imageUrl - Image URL
 * @param {string} filePath - File path on server
 * @param {HTMLElement} modal - Modal element to close
 * @param {string} apiUrl - API URL
 * @param {Function} onSuccess - Success callback (e.g., loadQuotes)
 * @returns {Promise<void>}
 */
export async function downscaleAndMoveToDb(quoteId, imageUrl, filePath, modal, apiUrl, onSuccess) {
  const btn = modal?.querySelector('#downscaleImageBtn') || getElementByIdSafe('downscaleImageBtn');
  if (!btn) return;
  
  try {
    // Update button state
    btn.disabled = true;
    btn.textContent = '⏳ Processing...';
    
    // Load the image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    // Resize to 1024px (longest side) and create thumbnail
    const resized1024 = resizeImage(img, FULL_SIZE_LIMIT);
    const thumbnail240 = resizeImage(img, THUMBNAIL_SIZE);
    
    console.log(`📦 Downscaling external image: ${filePath}`);
    console.log(`   Original: ${img.width}x${img.height}`);
    console.log(`   New: max 1024px, size: ${(resized1024.length / 1024).toFixed(0)} KB`);
    
    // Send to server
    const response = await fetch(`${apiUrl}/quotes/${quoteId}/downscale-thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thumbnail: thumbnail240,
        attachment_full: resized1024,
        oldFilePath: filePath
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to downscale image');
    }
    
    // Success!
    btn.textContent = '✅ Moved to DB!';
    btn.style.background = '#10b981';
    
    // Close modal after 1 second
    setTimeout(() => {
      modal.remove();
      // Reload quotes to show updated image
      if (onSuccess) {
        onSuccess();
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error downscaling image:', error);
    btn.disabled = false;
    btn.textContent = '❌ Error - Try Again';
    btn.style.background = '#ef4444';
  }
}

// ============= LEGACY SETUP FUNCTIONS (for backwards compatibility) =============

/**
 * Handle paste event for images (legacy)
 */
export function setupPasteHandler(element, onImagePasted) {
  if (!element) return;
  
  element.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    
    for (let item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        
        try {
          const base64 = await readFileAsBase64(file);
          if (onImagePasted) {
            onImagePasted(base64, 'image');
          }
        } catch (error) {
          console.error('Error reading pasted image:', error);
        }
        
        break;
      }
    }
  });
}

/**
 * Handle file upload (legacy)
 */
export function setupFileUpload(inputElement, onFileSelected) {
  if (!inputElement) return;
  
  inputElement.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const base64 = await readFileAsBase64(file);
      const mimeType = file.type || getMimeType(base64);
      const attachmentType = detectAttachmentType(mimeType);
      
      if (onFileSelected) {
        onFileSelected(base64, attachmentType, file.name);
      }
    } catch (error) {
      console.error('Error reading file:', error);
    }
  });
}
