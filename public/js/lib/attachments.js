/**
 * Attachment Handling
 * File upload, preview, and display logic
 */

import { resolveAttachmentUrl } from './utils.js';

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
  if (!mimeType) return 'other';
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('document') || mimeType.includes('word') || 
      mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return 'document';
  }
  
  return 'other';
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

/**
 * Display image in container
 */
export function displayImage(container, imageUrl) {
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
export function displayAttachmentPreview(container, icon, label, url) {
  if (!container) return;
  
  container.innerHTML = `
    <div class="file-attachment-preview">
      <div class="file-icon">${icon}</div>
      <div class="file-label">${label}</div>
    </div>
  `;
  container.classList.add('has-image');
}

/**
 * Clear image preview
 */
export function clearImagePreview(container, type = 'quote') {
  if (!container) return;
  
  const icon = type === 'author' ? '📷' : type === 'source' ? '📚' : '📎';
  const placeholder = type === 'quote' 
    ? 'Paste image (Ctrl+V) or click to upload file' 
    : 'Paste image (Ctrl+V) or click to upload';
  
  container.innerHTML = `<span>${icon} ${placeholder}</span>`;
  container.classList.remove('has-image');
}

/**
 * Handle paste event for images
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
 * Handle file upload
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
