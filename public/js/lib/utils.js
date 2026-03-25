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

/**
 * Return true when a CSS color string is "near-black" (≤ 40/255 per channel).
 * Handles: black, #000, #000000, rgb(0,0,0), rgba(0,0,0,1), hsl(0,0%,0%).
 */
function isNearBlack(colorStr) {
  const s = (colorStr || '').trim().toLowerCase();
  if (!s || s === 'black') return true;

  // #rgb  e.g. #000 #111
  const h3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (h3) {
    return [h3[1], h3[2], h3[3]].every(c => parseInt(c, 16) * 17 <= 40);
  }
  // #rrggbb  e.g. #000000 #1a1a1a
  const h6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (h6) {
    return [h6[1], h6[2], h6[3]].every(c => parseInt(c, 16) <= 40);
  }
  // rgb(r,g,b) / rgba(r,g,b,a)
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].every(c => parseInt(c) <= 40);
  }
  // hsl(h, 0%, very-low-lightness%)
  const hsl = s.match(/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/);
  if (hsl) return parseFloat(hsl[1]) <= 15;

  return false;
}

/**
 * Strip inline `color` styles that are near-black from note HTML so that
 * the palette's --text-primary CSS variable is respected on all themes.
 * Intentional non-black colors (red highlights, h2 blues, etc.) are kept.
 */
export function normalizeTextColors(html) {
  if (!html || !html.includes('color')) return html;

  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('[style]').forEach(el => {
    const color = el.style.color;
    if (color && isNearBlack(color)) {
      el.style.removeProperty('color');
      // Clean up empty style attribute
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    }
  });

  return div.innerHTML;
}
