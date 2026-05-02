// ============================================================
// encryptedAttachments.js — passphrase modal + encrypt/decrypt flow.
// ============================================================
//
// Browser-side AES-256-GCM is implemented in cryptoUtils.js; this module
// owns the user-facing flow:
//   • Show the #encPasswordModal and resolve to a password (or null).
//   • Encrypt a File and either upload it to an existing note or queue
//     it on a still-unsaved one (mirroring the regular attachment flow).
//   • Decrypt an attachment and route the plaintext to the correct
//     viewer (image / PDF / video / audio / text).
//
// The two entry points (`addEncryptedAttachment`, `openEncryptedAttachment`)
// are exposed on `window` because they're invoked from inline `onclick`
// handlers rendered by cardRenderer.js (the 🔒 lock badge on cards).
//
// Usage:
//   import { initEncryptedAttachments } from './js/lib/encryptedAttachments.js?v=20260502a';
//   initEncryptedAttachments({
//     encryptFileBuffer, decryptFileBuffer,                 // from cryptoUtils.js
//     showFullImage, showPDFViewer, showVideoPlayer,
//     showAudioPlayer,                                       // from attachmentViewer.js
//     displayAttachmentPreview,                              // from attachments.js
//     getEditingQuoteId:        () => editingQuoteId,
//     getCurrentNoteTypeFilter: () => currentNoteTypeFilter,
//     getQuoteImagePreviewEl:   () => quoteImagePreview,
//     getPendingExtraAttachments: () => pendingExtraAttachments,
//     setPrimaryEncryptedState: ({ thumbnail, full, type, fileName }) => { ... },
//     hasPrimaryAttachment:     () => !!(currentQuoteImage || currentQuoteImageFull),
//     renderModalAttachmentStrip,
//     updateAttachmentPanelVisibility,
//     loadQuotes,
//   });

let _deps = null;

const _extToMime = (() => {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
    txt: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'application/json',
  };
  return (ext) => map[ext] || 'application/octet-stream';
})();

/**
 * Wire the encrypted-attachment flow.  Idempotent — calling again just
 * replaces the dependency callbacks with the latest values.
 */
export function initEncryptedAttachments(deps) {
  _deps = deps;
  window.addEncryptedAttachment  = addEncryptedAttachment;
  window.openEncryptedAttachment = openEncryptedAttachment;
}

/**
 * Show the passphrase modal.
 * @param {'encrypt'|'decrypt'} mode
 * @returns {Promise<string|null>} the entered password, or null if cancelled
 */
function _promptPassword(mode) {
  return new Promise((resolve) => {
    const modal       = document.getElementById('encPasswordModal');
    const titleEl     = document.getElementById('encPwModalTitle');
    const hintEl      = document.getElementById('encPwModalHint');
    const iconEl      = document.getElementById('encPwModalIcon');
    const pwInput     = document.getElementById('encPwField');
    const confirmGrp  = document.getElementById('encPwConfirmGroup');
    const confirmInput = document.getElementById('encPwConfirmField');
    const errEl       = document.getElementById('encPwError');
    const okBtn       = document.getElementById('encPwOkBtn');
    const cancelBtn   = document.getElementById('encPwCancelBtn');

    if (!modal) { resolve(null); return; }

    const isEncrypt = mode === 'encrypt';
    iconEl.textContent  = isEncrypt ? '🔒' : '🔓';
    titleEl.textContent = isEncrypt ? 'Encrypt selected text' : 'Decrypt note';
    hintEl.textContent  = isEncrypt
      ? 'Enter a password to encrypt the selected text.'
      : 'Enter the password used when encrypting.';
    // Use visibility+max-height instead of display:none so LastPass always
    // sees two password fields in the DOM (single-field = LP injects icon).
    if (isEncrypt) {
      confirmGrp.style.visibility = '';
      confirmGrp.style.maxHeight  = '';
      confirmGrp.style.overflow   = '';
      confirmGrp.style.margin     = '';
    } else {
      confirmGrp.style.visibility = 'hidden';
      confirmGrp.style.maxHeight  = '0';
      confirmGrp.style.overflow   = 'hidden';
      confirmGrp.style.margin     = '0';
    }
    errEl.style.display = 'none';
    pwInput.value = '';
    confirmInput.value = '';

    modal.style.display = 'block';

    // Remove readonly after a tick so autofill triggers on load are
    // ignored, but the user can still type.  The HTML keeps the attribute
    // until JS removes it on each open.
    [pwInput, confirmInput].forEach(el => el.setAttribute('readonly', 'true'));
    setTimeout(() => {
      [pwInput, confirmInput].forEach(el => el.removeAttribute('readonly'));
      pwInput.focus();
    }, 80);

    function cleanup() {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('keydown', onKey);
    }

    function onOk() {
      const pw = pwInput.value;
      if (!pw) { errEl.textContent = 'Password cannot be empty.'; errEl.style.display = ''; return; }
      if (isEncrypt && pw !== confirmInput.value) {
        errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return;
      }
      cleanup(); resolve(pw);
    }

    function onCancel() { cleanup(); resolve(null); }

    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { onCancel(); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('keydown', onKey);
  });
}

/**
 * Encrypt a File object, then upload it as an encrypted attachment.
 * The original extension is preserved in the filename: e.g. note.txt → note.txt.enc.
 *
 * For new (still-unsaved) notes the encrypted blob is queued on the modal
 * state so the save flow can multipart-upload it via the dedicated file
 * endpoint (preserving the .enc extension).
 */
async function addEncryptedAttachment(file) {
  const password = await _promptPassword('encrypt');
  if (!password) return;

  try {
    const buf      = await file.arrayBuffer();
    const encBytes = await _deps.encryptFileBuffer(buf, password);

    const editingQuoteId = _deps.getEditingQuoteId();
    if (editingQuoteId) {
      // ── Existing note: upload straight to the server ──────────────────
      const encFilename = file.name + '.enc';
      const folder      = document.getElementById('noteType')?.value
        || _deps.getCurrentNoteTypeFilter()
        || 'note';
      const formData    = new FormData();
      formData.append('file', new File([encBytes], encFilename, { type: 'application/octet-stream' }), encFilename);
      formData.append('attachment_type', 'encrypted');
      formData.append('original_name', file.name);
      formData.append('folder', folder);

      const resp = await fetch(`/api/notes/${editingQuoteId}/attachments/file`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error(await resp.text());

      const updated = await fetch(`/api/quotes/${editingQuoteId}`).then(r => r.json());
      _deps.renderModalAttachmentStrip(updated);

      // Update the primary preview area for the encrypted attachment
      const primary = updated.attachments?.[0];
      if (primary?.attachment_type === 'encrypted') {
        const rawPath  = (primary.attachment_full || '').replace(/^file:/, '').split('/').pop();
        const origName = rawPath.replace(/^\d+\./, '').replace(/\.enc$/i, '');
        _deps.setPrimaryEncryptedState({
          thumbnail: null,
          full:      primary.attachment_full,
          type:      'encrypted',
          fileName:  origName,
        });
        _deps.displayAttachmentPreview(_deps.getQuoteImagePreviewEl(), '🔒', origName, '', null);
        _deps.updateAttachmentPanelVisibility();
      }
      _deps.loadQuotes();
    } else {
      // ── New (unsaved) note: queue as pending attachment ───────────────
      const encBlob = new Blob([encBytes], { type: 'application/octet-stream' });
      const attData = {
        thumbnail:        null,
        attachment_full:  null,        // filled in after note creation
        attachment_type:  'encrypted',
        filename:         file.name + '.enc',
        _encryptedBlob:   encBlob,     // raw blob, handled by save flow
        _origName:        file.name,
      };

      if (!_deps.hasPrimaryAttachment()) {
        _deps.setPrimaryEncryptedState({
          thumbnail: null,
          full:      '_pending_enc_',
          type:      'encrypted',
          fileName:  file.name,
        });
        _deps.displayAttachmentPreview(_deps.getQuoteImagePreviewEl(), '🔒', file.name, '', null);
        _deps.updateAttachmentPanelVisibility();
      } else {
        _deps.getPendingExtraAttachments().push(attData);
      }
      // Stash as the "primary" pending encrypted attachment on the modal state
      // (matches the historical behaviour of the inline code in app.js).
      window._primaryEncAttData = attData;
    }
  } catch (err) {
    alert('Encryption failed: ' + err.message);
  }
}

/**
 * Fetch, decrypt, and display an encrypted attachment.  The viewer is
 * chosen from the ORIGINAL filename's extension (the on-disk name is
 * the encrypted one, so we can't trust that).
 */
async function openEncryptedAttachment(fileUrl, originalName) {
  const password = await _promptPassword('decrypt');
  if (!password) return;

  try {
    // Resolve `file:` references to HTTP paths the browser can fetch
    const httpUrl = fileUrl && fileUrl.startsWith('file:')
      ? `/attachments/${fileUrl.slice('file:'.length)}`
      : fileUrl;
    const resp = await fetch(httpUrl);
    if (!resp.ok) throw new Error('Could not fetch file');
    const encBytes = new Uint8Array(await resp.arrayBuffer());
    const plainBuf = await _deps.decryptFileBuffer(encBytes, password);

    // MIME from original extension — the on-disk file is always `.enc`
    const ext  = (originalName || '').split('.').pop().toLowerCase();
    const mime = _extToMime(ext);
    const blob = new Blob([plainBuf], { type: mime });
    const url  = URL.createObjectURL(blob);

    if (mime.startsWith('image/')) {
      _deps.showFullImage(url, null, 'image', {});
    } else if (mime === 'application/pdf') {
      _deps.showPDFViewer(url);
    } else if (mime.startsWith('video/')) {
      _deps.showVideoPlayer(url);
    } else if (mime.startsWith('audio/')) {
      _deps.showAudioPlayer(url, originalName, mime);
    } else {
      // Text or unknown — show in a simple overlay
      const text = await blob.text();
      _showTextViewer(text, originalName || 'Decrypted file');
    }
  } catch {
    alert('Wrong passphrase or corrupted file.');
  }
}

/** Show decrypted text in a simple full-screen overlay. */
function _showTextViewer(text, title) {
  const existing = document.getElementById('encTextViewerOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'encTextViewerOverlay';
  overlay.className = 'enc-text-viewer-overlay';
  overlay.innerHTML = `
    <div class="enc-text-viewer-box">
      <div class="enc-text-viewer-header">
        <span>🔓 ${title}</span>
        <button type="button" class="modal-close-x" onclick="document.getElementById('encTextViewerOverlay').remove()">✕</button>
      </div>
      <pre class="enc-text-viewer-body"></pre>
    </div>`;
  overlay.querySelector('.enc-text-viewer-body').textContent = text;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
