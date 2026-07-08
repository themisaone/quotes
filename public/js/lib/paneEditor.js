/**
 * paneEditor.js — inline Quill editor for list-pane right column.
 */

import { normalizeTextColors } from './utils.js?v=20260703color1';
import { createQuillEditor } from './quoteEditor.js?v=20260703nofullscreen1';
import { showUnsavedChangesConfirm } from './confirmDialog.js';

let _apiUrl = '';
let _quill = null;
let _wiredQuill = null;
let _baselineHtml = '';
let _currentNoteId = null;
let _onNoteSaved = null;
let _onDirtyChange = null;
let _saveBtn = null;
let _pendingSavedNote = null;
/** Explicit UI dirty flag — Quill HTML comparison alone is unreliable after save. */
let _uiDirty = false;

function _isEmptyHtml(html) {
  const t = (html || '').trim();
  return !t || t === '<p><br></p>' || t === '<p></p>';
}

function _normalizeComparable(html) {
  if (_isEmptyHtml(html)) return '';
  return (html || '').trim();
}

function _getSaveBtn() {
  return document.querySelector('.lp-pane #lpSaveBtn') || document.getElementById('lpSaveBtn');
}

function _recoverQuillFromDom(pane) {
  const host = pane?.querySelector('#lpPaneQuill');
  if (!host || typeof Quill === 'undefined') return null;
  try {
    return Quill.find(host) || null;
  } catch {
    return null;
  }
}

function _ensureQuillInstance(pane) {
  if (_quill) return _quill;
  _quill = _recoverQuillFromDom(pane);
  if (_quill) return _quill;

  const host = pane?.querySelector('#lpPaneQuill');
  if (!host) return null;
  host.innerHTML = '';
  _quill = createQuillEditor('#lpPaneQuill', 'lpPaneText', {
    placeholder: 'Edit note text here…',
  });
  _wirePaneQuill();
  return _quill;
}

export function resetPaneEditor() {
  _quill = null;
  _wiredQuill = null;
  _saveBtn = null;
  _currentNoteId = null;
  _baselineHtml = '';
  _pendingSavedNote = null;
  _uiDirty = false;
}

export function configurePaneEditor({ apiUrl, onNoteSaved, onDirtyChange } = {}) {
  _apiUrl = apiUrl || '';
  _onNoteSaved = onNoteSaved || null;
  _onDirtyChange = onDirtyChange || null;
}

export function isPaneEditorDirty() {
  if (!_uiDirty) return false;
  if (!_quill || _currentNoteId == null) return false;
  return true;
}

export function getPaneEditorNoteId() {
  return _currentNoteId;
}

function _setPaneContent(noteText) {
  if (!_quill) return;
  const normalized = noteText ? normalizeTextColors(noteText) : '';
  _quill.setText('', 'silent');
  if (normalized) {
    if (normalized.includes('<')) {
      _quill.clipboard.dangerouslyPasteHTML(normalized, 'silent');
    } else {
      _quill.setText(normalized, 'silent');
    }
  }
  const hidden = document.getElementById('lpPaneText');
  if (hidden) hidden.value = _quill.root.innerHTML;
}

function _syncSaveButton(dirty) {
  const btn = _getSaveBtn();
  _saveBtn = btn;
  if (!btn) return;
  if (dirty) {
    btn.removeAttribute('disabled');
    btn.classList.add('lp-pane-save-dirty');
  } else {
    btn.disabled = true;
    btn.setAttribute('disabled', 'disabled');
    btn.classList.remove('lp-pane-save-dirty');
  }
}

function _markEditorClean() {
  _uiDirty = false;
  if (_quill) _baselineHtml = _quill.root.innerHTML;
  _syncSaveButton(false);
  _onDirtyChange?.(false);
}

function _markEditorDirty() {
  _uiDirty = true;
  _syncSaveButton(true);
  _onDirtyChange?.(true);
}

function _loadNoteIntoEditor(note, pane) {
  _ensureQuillInstance(pane);
  _currentNoteId = note?.id ?? null;
  const html = note?.note_text || '';
  _setPaneContent(html);
  _baselineHtml = _quill ? _quill.root.innerHTML : html;
  _markEditorClean();
}

function _wirePaneQuill() {
  if (!_quill || _wiredQuill === _quill) return;
  _wiredQuill = _quill;
  _quill.on('text-change', (delta, oldDelta, source) => {
    const hidden = document.getElementById('lpPaneText');
    if (hidden) hidden.value = _quill.root.innerHTML;
    if (source === 'user') _markEditorDirty();
  });
}

const PANE_SHELL_HTML = `
  <div class="lp-pane-shell">
    <div class="lp-pane-info">
      <div class="lp-pane-title-row">
        <div class="lp-pane-title note-title-heading" id="lpPaneTitle"></div>
        <div class="lp-pane-title-actions">
          <span class="lp-pane-score-slot" id="lpPaneScore"></span>
          <button type="button" class="lp-pane-attach-btn" id="lpPaneAddAttach">📎 Add attachment</button>
          <button type="button" class="lp-pane-attach-btn" id="lpPaneEncryptAttach" title="Encrypt a file and attach it">🔒 Encrypt &amp; attach</button>
          <button type="button" class="lp-pane-props-btn" id="lpPropsBtn" title="Tags, author, source, and other properties (not text or attachments)">⚙ Properties</button>
          <button type="button" class="lp-pane-save-btn" id="lpSaveBtn" title="Save note text" disabled>💾 Save</button>
        </div>
      </div>
      <div class="lp-pane-meta" id="lpPaneMeta"></div>
      <div class="lp-pane-comment" id="lpPaneComment"></div>
    </div>
    <div class="lp-pane-attach-section" id="lpPaneAttachSection" hidden>
      <div class="lp-pane-attach-row" id="lpPaneAttachRow"></div>
    </div>
    <div class="lp-pane-editor-wrap">
      <div id="lpPaneQuill"></div>
      <input type="hidden" id="lpPaneText" />
    </div>
  </div>`;

/** Ensure pane shell (nav + header + editor) exists; init Quill once. */
export function ensurePaneEditorShell(pane, { onProperties, onSave }) {
  if (!pane.querySelector('.lp-pane-shell')) {
    pane.innerHTML = PANE_SHELL_HTML;
    _saveBtn = pane.querySelector('#lpSaveBtn');
    _quill = createQuillEditor('#lpPaneQuill', 'lpPaneText', {
      placeholder: 'Edit note text here…',
    });
    _wirePaneQuill();
    pane.querySelector('#lpPropsBtn')?.addEventListener('click', () => onProperties?.());
    pane.querySelector('#lpSaveBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await savePaneEditorText();
      onSave?.();
    });
  } else {
    _saveBtn = pane.querySelector('#lpSaveBtn');
    _ensureQuillInstance(pane);
    _migratePaneInfoOrder(pane);
  }
}

/** Meta row (G / author / tags) must sit above comment in list-pane shells. */
function _migratePaneInfoOrder(pane) {
  const info = pane.querySelector('.lp-pane-info');
  const comment = pane.querySelector('#lpPaneComment');
  const meta = pane.querySelector('#lpPaneMeta');
  if (!info || !comment || !meta) return;
  if (comment.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING) {
    info.insertBefore(meta, comment);
  }
}

export function loadPaneNote(note, pane) {
  if (!note) return;
  const hostPane = pane || document.querySelector('.lp-pane');
  _loadNoteIntoEditor(note, hostPane);
}

export function getPaneEditorHtml() {
  return _quill ? _quill.root.innerHTML : '';
}

export function syncPaneTextToModalHidden() {
  const modalHidden = document.getElementById('quoteText');
  if (modalHidden && _quill) {
    modalHidden.value = _quill.root.innerHTML;
  }
}

export async function savePaneEditorText({ deferNotify = false } = {}) {
  if (!_quill || _currentNoteId == null || !_apiUrl) return false;

  if (!_uiDirty) {
    _markEditorClean();
    return true;
  }

  const note_text = _quill.root.innerHTML;
  try {
    const response = await fetch(`${_apiUrl}/quotes/${_currentNoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert('Failed to save note text: ' + (err.error || 'Please try again.'));
      return false;
    }
    const saved = await response.json();

    _markEditorClean();

    if (deferNotify) {
      _pendingSavedNote = saved;
    } else {
      _onNoteSaved?.(saved);
      requestAnimationFrame(() => _markEditorClean());
    }
    return true;
  } catch (e) {
    console.error('Pane text save failed:', e);
    alert('Failed to save note text. Please try again.');
    return false;
  }
}

export function flushPendingPaneNoteSaved() {
  if (!_pendingSavedNote) return;
  const saved = _pendingSavedNote;
  _pendingSavedNote = null;
  _onNoteSaved?.(saved);
}

export async function confirmLeavePaneEditor() {
  if (!isPaneEditorDirty()) return 'proceed';

  const action = await showUnsavedChangesConfirm();
  if (action === 'cancel') return 'cancel';
  if (action === 'save') {
    const ok = await savePaneEditorText({ deferNotify: true });
    return ok ? 'proceed' : 'cancel';
  }
  _uiDirty = false;
  return 'proceed';
}

export function applyPaneSavedNote(updatedNote) {
  if (!updatedNote || updatedNote.id != _currentNoteId) return;
  if (_uiDirty) return;
  _markEditorClean();
}
