// ============================================================
// mergeModal.js — UI for merging multiple notes into one.
// ============================================================
//
// Owns the #mergeModal DOM open/close lifecycle, the candidate-list
// rendering, the "main" radio selection, and the actual `/api/notes/merge`
// POST.  Inline `onclick` handlers in the rendered list call back into
// `window.selectMergeMain(...)`, `window.executeMerge()` and
// `window.closeMergeModal()`, so those names are wired through `window`
// during `initMergeModal()`.
//
// Usage:
//   import { initMergeModal, openMergeModal, fetchNotesByIds }
//     from './js/lib/mergeModal.js?v=20260502a';
//
//   initMergeModal({
//     escapeHtml,
//     getApiUrl: () => API_URL,
//     getCurrentQuotes: () => currentQuotesData,
//     getSelectedNoteIds: () => [...selectedNoteIds],
//     clearSelection,
//     loadQuotes,
//     loadTotalCount,
//     openEditModal,
//   });
//
// `openMergeModalFromSelection()` and `openMergeModalFromGroup()` are
// exposed on `window` so the bulk-ops UI (still in app.js) can launch
// the modal from a click.

let _deps = {
  escapeHtml: (s) => s,
  getApiUrl: () => '/api',
  getCurrentQuotes: () => [],
  getSelectedNoteIds: () => [],
  clearSelection: () => {},
  loadQuotes: () => {},
  loadTotalCount: () => {},
  openEditModal: () => {},
};

let mergeModalNotes = [];   // notes shown in the merge modal
let mergeMainNoteId = null; // which note is marked as Main

/**
 * Wire the merge-modal callbacks and expose the inline-onclick handlers.
 * Safe to call multiple times — the latest deps win.
 */
export function initMergeModal(deps) {
  _deps = { ..._deps, ...deps };

  window.closeMergeModal             = closeMergeModal;
  window.selectMergeMain             = selectMergeMain;
  window.executeMerge                = executeMerge;
  window.openMergeModalFromSelection = openMergeModalFromSelection;
  window.openMergeModalFromGroup     = openMergeModalFromGroup;
}

/**
 * Open the merge modal pre-populated with the given notes.
 * The first note is auto-selected as the merge "main".
 */
export function openMergeModal(notes) {
  if (!notes || notes.length < 2) {
    alert('Select at least 2 notes to merge.');
    return;
  }
  mergeModalNotes = notes;
  mergeMainNoteId = notes[0].id;
  renderMergeNotesList();
  document.getElementById('mergeCountLabel').textContent = `${notes.length} notes`;
  document.getElementById('mergeModal').style.display = 'block';
}

function closeMergeModal() {
  document.getElementById('mergeModal').style.display = 'none';
  mergeModalNotes = [];
  mergeMainNoteId = null;
  // Re-enable the execute button without rewriting its inner HTML — the
  // inner #mergeCountLabel span has to stay so future opens can update it.
  const btn = document.getElementById('executeMergeBtn');
  if (btn) btn.disabled = false;
  const lbl = document.getElementById('mergeCountLabel');
  if (lbl) lbl.textContent = '';
}

function renderMergeNotesList() {
  const list = document.getElementById('mergeNotesList');
  if (!list) return;
  const { escapeHtml } = _deps;
  list.innerHTML = mergeModalNotes.map(note => {
    const isMain  = note.id === mergeMainNoteId;
    const thumb   = note.thumbnail
      ? `<img src="${note.thumbnail}" class="merge-note-thumb" alt="">`
      : `<div class="merge-note-thumb merge-note-nothumb">${note.attachment_type === 'pdf' ? '📄' : note.attachment_type === 'video' ? '🎬' : '📝'}</div>`;
    const title   = note.comment || note.note_date || `Note #${note.id}`;
    const snippet = (note.note_text || '').replace(/<[^>]+>/g, '').slice(0, 80);
    const attCount = note.attachments?.length || (note.thumbnail || note.attachment_full ? 1 : 0);
    const attBadge = attCount ? `<span class="merge-note-att-badge">📎 ${attCount}</span>` : '';
    return `<div class="merge-note-row ${isMain ? 'merge-note-main' : ''}" data-note-id="${note.id}" onclick="selectMergeMain(${note.id})">
      <div class="merge-note-main-radio">${isMain ? '★' : '○'}</div>
      ${thumb}
      <div class="merge-note-info">
        <div class="merge-note-title">${escapeHtml(title)}${attBadge}</div>
        <div class="merge-note-snippet">${escapeHtml(snippet)}</div>
      </div>
      ${isMain ? '<div class="merge-note-main-label">MAIN</div>' : ''}
    </div>`;
  }).join('');
}

function selectMergeMain(noteId) {
  mergeMainNoteId = noteId;
  renderMergeNotesList();
}

async function executeMerge() {
  if (!mergeMainNoteId || mergeModalNotes.length < 2) return;
  const otherIds = mergeModalNotes.filter(n => n.id !== mergeMainNoteId).map(n => n.id);
  const appendTexts = document.getElementById('mergeAppendTexts')?.checked ?? true;
  const mergeTags   = document.getElementById('mergeTags')?.checked ?? true;

  const btn = document.getElementById('executeMergeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Merging… <span id="mergeCountLabel"></span>'; }

  try {
    const resp = await fetch('/api/notes/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainNoteId: mergeMainNoteId, otherNoteIds: otherIds, appendTexts, mergeTags }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const mergedNote = await resp.json();

    closeMergeModal();
    _deps.clearSelection();
    _deps.loadQuotes();
    _deps.loadTotalCount();

    // Open the merged note for cleanup
    setTimeout(() => _deps.openEditModal(mergedNote), 400);
  } catch (err) {
    alert('Merge failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = `🔀 Merge <span id="mergeCountLabel">${mergeModalNotes.length} notes</span>`; }
  }
}

function openMergeModalFromSelection() {
  const ids = _deps.getSelectedNoteIds();
  const cache = _deps.getCurrentQuotes() || [];
  const notes = ids.map(id => cache.find(n => n.id === id)).filter(Boolean);
  if (notes.length < 2) {
    // currentQuotesData may not have all of them; fall back to fetching
    fetchNotesByIds(ids).then(openMergeModal);
    return;
  }
  openMergeModal(notes);
}

function openMergeModalFromGroup() {
  const notes = window._currentGroupNotes;
  if (!notes || notes.length < 2) {
    alert('No group loaded or group has fewer than 2 notes.');
    return;
  }
  openMergeModal(notes);
}

/**
 * Fetch full note objects for an array of IDs.  Used by both this module
 * (when openMergeModalFromSelection's local cache is incomplete) and by
 * the bulk-operations code in app.js.
 */
export async function fetchNotesByIds(ids) {
  const apiUrl = _deps.getApiUrl();
  const results = await Promise.all(
    ids.map(id => fetch(`${apiUrl}/quotes/${id}`).then(r => r.json()).catch(() => null))
  );
  return results.filter(Boolean);
}
