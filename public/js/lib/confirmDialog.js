/**
 * showConfirm(message, options) → Promise<boolean>
 *
 * options:
 *   title        {string}  – bold heading (defaults based on danger flag)
 *   icon         {string}  – emoji / text shown above title
 *   danger       {boolean} – makes OK button red (for destructive actions)
 *   confirmLabel {string}  – OK button text  (default "Confirm" / "Delete")
 *   cancelLabel  {string}  – Cancel button text (default "Cancel")
 */
export function showConfirm(message, {
  title        = null,
  icon         = null,
  danger       = false,
  confirmLabel = null,
  cancelLabel  = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('confirmDialog');
    const iconEl   = document.getElementById('confirmIcon');
    const titleEl  = document.getElementById('confirmTitle');
    const msgEl    = document.getElementById('confirmMessage');
    const okBtn    = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    // Defaults that adapt to danger / normal context
    iconEl.textContent  = icon  ?? (danger ? '🗑️' : '❓');
    titleEl.textContent = title ?? (danger ? 'Are you sure?' : 'Confirm');
    msgEl.textContent   = message;
    okBtn.textContent   = confirmLabel ?? (danger ? 'Delete' : 'Confirm');
    cancelBtn.textContent = cancelLabel;

    okBtn.classList.toggle('danger', danger);

    overlay.style.display = 'flex';
    cancelBtn.focus();

    function finish(result) {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onOk()      { finish(true);  }
    function onCancel()  { finish(false); }
    function onBackdrop(e) { if (e.target === overlay) finish(false); }
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// Make available globally for non-module scripts
window.showConfirm = showConfirm;
