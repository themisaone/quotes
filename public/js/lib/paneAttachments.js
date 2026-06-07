/**
 * paneAttachments.js — attachment gallery for list-pane right column.
 * All attachments in one horizontal row (max 512px each); primary shown once with ✕.
 */

import { resolveAttachmentUrl, escapeHtml } from './utils.js';

const FILE_ICONS = { pdf: '📄', video: '🎬', document: '📎', encrypted: '🔒' };
const FILE_LABELS = { pdf: 'PDF', video: 'Video', document: 'File', encrypted: 'Encrypted' };

let _callbacks = {};
let _attachments = [];
let _currentNoteId = null;
let _toolbarHost = null;

export function configurePaneAttachments(callbacks = {}) {
  _callbacks = callbacks;
}

export function resetPaneAttachments() {
  _attachments = [];
  _currentNoteId = null;
  _toolbarHost = null;
}

function _normalizeAttachments(note) {
  if (note?.attachments?.length) return [...note.attachments];
  if (note?.thumbnail || note?.attachment_full) {
    return [{
      thumbnail: note.thumbnail,
      attachment_full: note.attachment_full,
      attachment_type: note.attachment_type || 'image',
    }];
  }
  return [];
}

function _attLabel(att) {
  if (att.attachment_type === 'encrypted') {
    const raw = (att.attachment_full || '').replace(/^file:/, '').split('/').pop();
    return raw.replace(/^\d+\./, '').replace(/\.enc$/i, '') || 'Encrypted file';
  }
  return att.attachment_filename || FILE_LABELS[att.attachment_type] || 'Attachment';
}

function _previewUrl(att) {
  const type = att.attachment_type || 'image';
  if (type === 'image') {
    return resolveAttachmentUrl(att.thumbnail || att.attachment_full || '');
  }
  const thumb = att.thumbnail;
  if (thumb && (thumb.startsWith('data:image/') || thumb.startsWith('http') || thumb.startsWith('/'))) {
    return resolveAttachmentUrl(thumb);
  }
  return '';
}

function _openAttachment(att, noteId) {
  const type = att.attachment_type || 'image';
  const full = att.attachment_full || att.thumbnail || '';
  if (!full) return;
  if (type === 'encrypted') {
    window.openEncryptedAttachment?.(full, _attLabel(att));
    return;
  }
  _callbacks.showFull?.(full, noteId, type);
}

/** Upgrade older pane shells (preview strip, toolbar below title). */
function _migrateAttachLayout(pane) {
  const section = pane.querySelector('#lpPaneAttachSection');
  if (!section) return;

  const actions = pane.querySelector('.lp-pane-title-actions');
  const propsBtn = pane.querySelector('#lpPropsBtn');
  const addBtn = pane.querySelector('#lpPaneAddAttach');
  const encBtn = pane.querySelector('#lpPaneEncryptAttach');

  if (actions && propsBtn && addBtn && encBtn && addBtn.parentElement !== actions) {
    actions.insertBefore(encBtn, propsBtn);
    actions.insertBefore(addBtn, encBtn);
  }
  pane.querySelector('.lp-pane-attach-toolbar')?.remove();

  if (!pane.querySelector('#lpPaneAttachRow')) {
    const row = section.querySelector('.lp-pane-attach-row');
    if (row) {
      row.id = 'lpPaneAttachRow';
    } else {
      const host = document.createElement('div');
      host.className = 'lp-pane-attach-row';
      host.id = 'lpPaneAttachRow';
      section.appendChild(host);
    }
  }
}

function _updateToolbar(pane) {
  const hasAny = _attachments.length > 0;
  const addBtn = pane.querySelector('#lpPaneAddAttach');
  if (addBtn) {
    addBtn.textContent = hasAny ? '📎 Add more' : '📎 Add attachment';
    addBtn.title = hasAny ? 'Add another attachment' : 'Add an attachment';
  }
}

function _renderGallery(pane) {
  const row = pane.querySelector('#lpPaneAttachRow');
  const section = pane.querySelector('#lpPaneAttachSection');
  if (!row) return;

  if (_attachments.length === 0) {
    row.innerHTML = '';
    if (section) section.hidden = true;
    return;
  }

  if (section) section.hidden = false;

  const noteId = _currentNoteId;
  row.innerHTML = _attachments.map((att, idx) => {
    const type = att.attachment_type || 'image';
    const imgUrl = _previewUrl(att);
    const del = att.id
      ? '<button type="button" class="modal-att-del" title="Remove">✕</button>'
      : '';

    if (type === 'image' && imgUrl) {
      return `<div class="lp-pane-attach-item" data-lp-att-idx="${idx}" title="Open full size">
        <button type="button" class="lp-pane-attach-open" title="Open full size">
          <img class="lp-pane-attach-img" src="${imgUrl}" alt="">
        </button>
        ${del}
      </div>`;
    }

    const icon = type === 'encrypted' ? '🔒' : (FILE_ICONS[type] || '📁');
    const label = escapeHtml(_attLabel(att));
    return `<div class="lp-pane-attach-item lp-pane-attach-file-item" data-lp-att-idx="${idx}" title="Open">
      <button type="button" class="lp-pane-attach-open lp-pane-attach-file-btn" title="Open">
        <span class="lp-pane-attach-file-icon">${icon}</span>
        <span class="lp-pane-attach-file-label">${label}</span>
      </button>
      ${del}
    </div>`;
  }).join('');

  row.querySelectorAll('.lp-pane-attach-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('.lp-pane-attach-item')?.dataset.lpAttIdx, 10);
      const att = _attachments[idx];
      if (att) _openAttachment(att, noteId);
    });
  });

  row.querySelectorAll('.modal-att-del').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.lp-pane-attach-item');
      const idx = parseInt(item?.dataset.lpAttIdx, 10);
      const att = _attachments[idx];
      if (!att || !_currentNoteId) return;
      await _callbacks.deleteAttachment?.(_currentNoteId, att, idx);
    });
  });
}

function _pickFile({ accept } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(input);
    const done = (file) => {
      try { document.body.removeChild(input); } catch { /* ignore */ }
      resolve(file || null);
    };
    input.addEventListener('change', () => done(input.files?.[0] || null));
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!input.files?.length) done(null); }, 400);
    });
    input.click();
  });
}

function _wireToolbar(pane) {
  if (_toolbarHost === pane) return;
  _toolbarHost = pane;

  pane.querySelector('#lpPaneAddAttach')?.addEventListener('click', async () => {
    if (!_currentNoteId) return;
    const file = await _pickFile({
      accept: 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/*,audio/*',
    });
    if (file) await _callbacks.addFromFile?.(file, _currentNoteId);
  });

  pane.querySelector('#lpPaneEncryptAttach')?.addEventListener('click', async () => {
    if (!_currentNoteId) return;
    const file = await _pickFile();
    if (file) await _callbacks.addEncrypted?.(file, _currentNoteId);
  });
}

/** Render attachment toolbar + gallery row for the current note. */
export function renderPaneAttachments(pane, note) {
  if (!pane || !note) return;
  const section = pane.querySelector('#lpPaneAttachSection');
  if (!section) return;

  _currentNoteId = note.id ?? null;
  _attachments = _normalizeAttachments(note);

  _migrateAttachLayout(pane);
  _wireToolbar(pane);
  _renderGallery(pane);
  _updateToolbar(pane);
}
