/**
 * Utility Functions Library
 * Pure helper functions with no external dependencies
 */

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Convert file storage reference to URL
 * Handles both base64 and file: references
 */
export function resolveAttachmentUrl(attachment) {
  if (!attachment) return null;
  
  // If it's already a base64 data URL, return as-is
  if (attachment.startsWith('data:')) {
    return attachment;
  }
  
  // If it's a file reference (e.g., "file:quotes/360_full.png:image/png")
  if (attachment.startsWith('file:')) {
    const parts = attachment.split(':');
    if (parts.length >= 2) {
      const path = parts[1]; // e.g., "quotes/360_full.png"
      return `/attachments/${path}`;
    }
  }
  
  // Unknown format - return as-is
  return attachment;
}

/**
 * Get icon for attachment type
 */
export function getAttachmentIcon(type) {
  const icons = {
    'image': '🖼️',
    'pdf': '📄',
    'video': '🎬',
    'audio': '🎵',
    'document': '📎',
    'other': '📁'
  };
  return icons[type] || icons['other'];
}

/**
 * Format date to Norwegian format (dd.mm.yyyy)
 */
export function formatDateNorwegian(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Parse Norwegian date format (dd.mm.yyyy) to ISO format (yyyy-mm-dd)
 */
export function parseNorwegianDate(dateStr) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  
  return `${year}-${month}-${day}`;
}

/**
 * Get Norwegian day name
 */
export function getNorwegianDayName(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const dayNames = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
  return dayNames[date.getDay()];
}

/**
 * Format date with day name (e.g., "søn. 02.03.2026")
 */
export function formatDateWithDayName(dateString) {
  if (!dateString) return '';
  
  const dayName = getNorwegianDayName(dateString);
  const formatted = formatDateNorwegian(dateString);
  
  return `${dayName}. ${formatted}`;
}

/**
 * Debounce function - delays execution until after delay ms of inactivity
 */
export function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Check if value is empty (null, undefined, empty string, or whitespace only)
 */
export function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Generate a unique ID (simple implementation)
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
