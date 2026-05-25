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

/**
 * PDF export confirm — returns { ok, columns } where columns is 1 or 2 (default 1).
 */
export function showPdfExportConfirm(noteCount) {
  return new Promise((resolve) => {
    const overlay   = document.getElementById('confirmDialog');
    const iconEl    = document.getElementById('confirmIcon');
    const titleEl   = document.getElementById('confirmTitle');
    const msgEl     = document.getElementById('confirmMessage');
    const okBtn     = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    const n = Number(noteCount) || 0;
    const word = n === 1 ? 'note' : 'notes';

    iconEl.textContent = '📄';
    titleEl.textContent = 'Export to PDF';
    msgEl.innerHTML = `
      <span>Do you want to export ${n} ${word} to PDF?</span>
      <fieldset class="pdf-export-columns">
        <legend class="pdf-export-columns-legend">Layout</legend>
        <label class="pdf-export-columns-option">
          <input type="radio" name="pdfColumns" value="1" checked>
          <span>1 column</span>
        </label>
        <label class="pdf-export-columns-option">
          <input type="radio" name="pdfColumns" value="2">
          <span>2 columns</span>
        </label>
      </fieldset>`;
    okBtn.textContent = 'Export';
    cancelBtn.textContent = 'Cancel';
    okBtn.classList.remove('danger');

    overlay.style.display = 'flex';
    cancelBtn.focus();

    function finish(result) {
      overlay.style.display = 'none';
      msgEl.textContent = '';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function readColumns() {
      const sel = overlay.querySelector('input[name="pdfColumns"]:checked');
      const v = sel ? parseInt(sel.value, 10) : 1;
      return v === 2 ? 2 : 1;
    }

    function onOk()      { finish({ ok: true, columns: readColumns() }); }
    function onCancel()  { finish({ ok: false, columns: 1 }); }
    function onBackdrop(e) { if (e.target === overlay) finish({ ok: false, columns: 1 }); }
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); finish({ ok: true, columns: readColumns() }); }
      if (e.key === 'Escape') { e.preventDefault(); finish({ ok: false, columns: 1 }); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// Make available globally for non-module scripts
window.showConfirm = showConfirm;
window.showPdfExportConfirm = showPdfExportConfirm;
