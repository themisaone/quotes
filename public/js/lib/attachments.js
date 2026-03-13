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

import { resolveAttachmentUrl, getAttachmentIcon } from './utils.js';
import { getElementByIdSafe } from '../constants.js';

// ============= CONSTANTS =============

const THUMBNAIL_SIZE = 240;
const FULL_SIZE_LIMIT = 1024;
const AUTHOR_SOURCE_IMAGE_SIZE = 300;
const JPEG_QUALITY = 0.85;

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

// ============= FILE READING =============

/**
 * Read attachment file (handles all types: images, PDFs, documents, etc.)
 * @param {File} file - File object from input
 * @param {string} type - Context type ('quote', 'author', 'source')
 * @param {Object} state - State object to update
 * @param {Object} callbacks - Callback functions
 * @returns {Promise<Object>} Processed attachment data
 */
export async function readAttachmentFile(file, type, state, callbacks) {
  // For author/source, only images allowed
  if (type !== "quote") {
    return await readImageFile(file, type, state, callbacks);
  }
  
  // Determine attachment type
  const mimeType = file.type;
  const attachmentType = detectAttachmentType(mimeType);
  
  console.log(`📎 Reading ${attachmentType} file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  
  // Handle images differently - downscale if needed
  if (attachmentType === ATTACHMENT_TYPES.IMAGE) {
    return await readImageFile(file, type, state, callbacks);
  }
  
  // For non-images (PDF, docs, videos), read as-is
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target.result;
      
      // Get icon and create thumbnail
      const icon = getAttachmentIcon(attachmentType);
      const sizeText = formatFileSize(base64Data.length);
      const thumbnail = createIconThumbnail(icon, file.name, sizeText);
      
      const result = {
        thumbnail,
        full: base64Data,
        type: attachmentType,
        filename: file.name
      };
      
      // Update UI if callback provided
      if (callbacks?.onAttachmentLoaded) {
        callbacks.onAttachmentLoaded(result, icon, file.name, sizeText);
      }
      
      console.log(`✅ Loaded ${attachmentType}: ${file.name}, Size: ${sizeText}`);
      resolve(result);
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
            image: resizedBase64,
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
  if (!container) return;
  
  const resolved = resolveAttachmentUrl(imageUrl);
  if (resolved) {
    container.innerHTML = `<img src="${resolved}" alt="Preview">`;
    container.classList.add('has-image');
  }
}

/**
 * Display attachment preview (for non-image files)
 */
export function displayAttachmentPreview(container, icon, filename, size, escapeHtmlFn) {
  if (!container) return;
  
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
  const btn = getElementByIdSafe('downscaleImageBtn');
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
    const response = await fetch(`${apiUrl}/quotes/${quoteId}/downscale-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: thumbnail240,
        image_full: resized1024,
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
