// ============================================================
// renameModal.js — generic rename dialog for tag / author / source.
// ============================================================
//
// NOTE: as of May 2026 this module appears to be **orphaned** — none of
// its `window.*` exports are referenced from index.html, the rendered
// card HTML, or any other lib module.  The DOM (#renameModal etc.) still
// exists in index.html, but tag-rename now lives in tagsManager.js and
// author/source rename happens directly inside their entity modals.
// The code is kept here in case some still-undiscovered onclick relies
// on it; once we've confirmed nobody uses it, the file (and the HTML
// nodes) can be deleted.
//
// Usage:
//   import { initRenameModal } from './js/lib/renameModal.js?v=20260502a';
//   initRenameModal({
//     getApiUrl: () => API_URL,
//     loadTags, loadAuthors, loadSources,
//   });

import { showNotification } from './notifications.js?v=20260502a';

let _deps = {
  getApiUrl: () => '/api',
  loadTags: () => {},
  loadAuthors: () => {},
  loadSources: () => {},
};

let renameContext = {
  type: null,    // 'tag' | 'author' | 'source'
  id: null,
  oldName: null,
};

const $ = (id) => document.getElementById(id);

/**
 * Wire dependency callbacks and the `window` handlers used by inline
 * onclick attributes (if any survived the migration to per-entity
 * modals).  Also installs the DOMContentLoaded listener that wires
 * the dialog buttons.
 */
export function initRenameModal(deps) {
  _deps = { ..._deps, ...deps };

  window.editAuthor      = editAuthor;
  window.editSource      = editSource;
  window.showRenameModal = showRenameModal;
  window.hideRenameModal = hideRenameModal;
  window.performRename   = performRename;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wireDialogButtons);
  } else {
    _wireDialogButtons();
  }
}

function _wireDialogButtons() {
  const renameModal      = $('renameModal');
  const renameCancelBtn  = $('renameCancelBtn');
  const renameConfirmBtn = $('renameConfirmBtn');
  const renameInput      = $('renameInput');
  if (!renameModal || !renameInput) return;

  renameCancelBtn?.addEventListener('click', hideRenameModal);
  renameConfirmBtn?.addEventListener('click', performRename);

  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')      performRename();
    else if (e.key === 'Escape') hideRenameModal();
  });

  renameModal.addEventListener('click', (e) => {
    if (e.target === renameModal) hideRenameModal();
  });
}

function editAuthor(id, name) {
  renameContext = { type: 'author', id, oldName: name };
  showRenameModal('Author', name);
}

function editSource(id, name) {
  renameContext = { type: 'source', id, oldName: name };
  showRenameModal('Source', name);
}

function showRenameModal(type, currentName) {
  const modal   = $('renameModal');
  const title   = $('renameModalTitle');
  const input   = $('renameInput');
  const warning = $('renameWarning');
  if (!modal || !title || !input) return;

  title.textContent = `Rename ${type}`;
  input.value       = currentName;
  if (warning) warning.style.display = 'none';

  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function hideRenameModal() {
  const modal = $('renameModal');
  if (modal) modal.style.display = 'none';
  renameContext = { type: null, id: null, oldName: null };
}

async function performRename() {
  const input = $('renameInput');
  if (!input) return;
  const newName = input.value.trim();

  if (!newName) {
    alert('Please enter a name');
    return;
  }
  if (newName === renameContext.oldName) {
    hideRenameModal();
    return;
  }

  const confirmBtn   = $('renameConfirmBtn');
  const originalText = confirmBtn?.textContent;
  if (confirmBtn) {
    confirmBtn.textContent = '⏳ Renaming...';
    confirmBtn.disabled    = true;
  }

  try {
    let endpoint, refreshFunction;
    switch (renameContext.type) {
      case 'tag':
        endpoint = `tags/${renameContext.id}`;
        refreshFunction = _deps.loadTags;
        break;
      case 'author':
        endpoint = `authors/${renameContext.id}`;
        refreshFunction = _deps.loadAuthors;
        break;
      case 'source':
        endpoint = `sources/${renameContext.id}`;
        refreshFunction = _deps.loadSources;
        break;
    }

    const response = await fetch(`${_deps.getApiUrl()}/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to rename');
    }

    const result = await response.json();
    hideRenameModal();

    if (result.merged) {
      showNotification(
        `✅ ${result.message}\n\nAll quotes have been moved to the existing ${renameContext.type}.`,
        'success'
      );
    } else {
      showNotification(`✅ ${result.message}`, 'success');
    }

    refreshFunction?.();
  } catch (error) {
    console.error('Error renaming:', error);
    showNotification(`❌ ${error.message}`, 'error');
    if (confirmBtn) {
      confirmBtn.textContent = originalText;
      confirmBtn.disabled    = false;
    }
  }
}
