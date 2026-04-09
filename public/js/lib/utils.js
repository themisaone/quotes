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
    'encrypted': '🔒',
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
// Named CSS colors that are effectively "dark text" from Evernote imports
const DARK_NAMED_COLORS = new Set([
  'black', 'darkslategray', 'darkslategrey', 'dimgray', 'dimgrey',
  'verydarkgray', 'darkgray', 'darkgrey', 'gray', 'grey',
  'slategray', 'slategrey', 'lightslategray', 'lightslategrey',
]);

function isNearBlack(colorStr) {
  const s = (colorStr || '').trim().toLowerCase();
  if (!s) return false;

  // Named dark colours
  if (DARK_NAMED_COLORS.has(s)) return true;

  // Threshold: strip any colour whose perceived brightness is ≤ 100/255 (~39%).
  // This removes near-blacks like #333, rgb(51,51,51) etc. while keeping
  // intentional saturated colours (red highlights, blue links, green badges…).
  const THRESHOLD = 100;

  // #rgb  e.g. #000 #111 #333
  const h3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (h3) {
    const [r, g, b] = h3.slice(1).map(c => parseInt(c, 16) * 17);
    return 0.299 * r + 0.587 * g + 0.114 * b <= THRESHOLD;
  }
  // #rrggbb  e.g. #000000 #1a1a1a #333333
  const h6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (h6) {
    const [r, g, b] = h6.slice(1).map(c => parseInt(c, 16));
    return 0.299 * r + 0.587 * g + 0.114 * b <= THRESHOLD;
  }
  // rgb(r,g,b) / rgba(r,g,b,a)
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const [r, g, b] = rgb.slice(1, 4).map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b <= THRESHOLD;
  }
  // hsl(h, s%, l%)
  const hsl = s.match(/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/);
  if (hsl) return parseFloat(hsl[1]) <= 40;

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
