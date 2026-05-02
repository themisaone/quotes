// ============================================================
// notifications.js — toast-style notification helper.
// ============================================================
//
// Shared by app.js (rename modal, tag operations) and tagsManager.js
// (which keeps a private fallback for now; see lib/README.md).
//
// Usage:
//   import { showNotification } from './js/lib/notifications.js?v=20260502a';
//   showNotification('✅ Saved', 'success');
//   showNotification('❌ Could not load', 'error');
//   showNotification('Heads up', 'info');   // default

const TYPE_BG = {
  success: '#4caf50',
  error:   '#f44336',
  info:    '#2196f3',
};

/**
 * Slide a toast notification into the top-right corner.  Auto-dismisses
 * after ~4 s with a CSS slideOut animation.
 *
 * @param {string} message – text to display (no HTML)
 * @param {'info'|'success'|'error'} [type='info']
 */
export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${TYPE_BG[type] || TYPE_BG.info};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 14px;
    max-width: 400px;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}
