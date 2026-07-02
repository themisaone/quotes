/**
 * listPaneView.js
 *
 * Renders a two-column List + Pane layout as an alternative to the card grid.
 * The left column shows compact list rows; clicking a row displays the full
 * note in the right pane.  Editing reuses the existing modal (zero duplication).
 *
 * Public API
 * ----------
 * renderListPaneView(container, notes, opts) → void
 *   opts: { openEditModal, openAuthorModal, openSourceModal,
 *           filterByTag, showFullImage, showTranslationGroup,
 *           currentNoteTypeFilter, getTrainingTypes, getQuoteTypes,
 *           globalSettings, createQuoteCard }
 *
 * refreshPaneNote(noteId, updatedNote, opts) → void
 *   Call after saving a note to refresh the pane content in-place.
 */

import { escapeHtml, resolveAttachmentUrl } from './utils.js';
import { noteTextToPlainText } from './markdown.js?v=20260702format1';
import { renderTrainingCalendar } from './trainingCalendar.js?v=20260629oldicon1';
import {
  buildPaneMetaSections,
  buildPaneScoreHtml,
  buildListPaneRowMetaHtml,
} from './cardRenderer.js?v=20260702format1';
import {
  ensurePaneEditorShell,
  loadPaneNote,
  confirmLeavePaneEditor,
  flushPendingPaneNoteSaved,
  resetPaneEditor,
} from './paneEditor.js?v=20260702format1';
import {
  renderPaneAttachments,
  resetPaneAttachments,
} from './paneAttachments.js?v=20260605paneatt7';
import { getNoteTypeDefaultDisplayMode } from './settingsManager.js?v=20260605optiontabs5';

// ─────────────────────────────────────────────────────────────
// Internal state (reset on every renderListPaneView call)
// ─────────────────────────────────────────────────────────────
let _notes = [];
let _selectedIndex = 0;
let _opts = {};
let _container = null;

// Training sub-view (calendar / list) — toggled from page header #trainingSubModeSelect.
// Persisted in localStorage so the choice survives reloads.
const TRAINING_SUBMODE_KEY = 'lpTrainingSubMode';
const VALID_SUBMODES = new Set(['calendar', 'list']);

/** List-pane page size (all types) — will move to Settings later. */
export const LP_LIST_PAGE_SIZE = 12;
/** Fixed thumbnail size for titled list rows (px). */
export const LP_TITLED_THUMB_SIZE_PX = 80;

export function getListPanePageSize(_noteType) {
  return LP_LIST_PAGE_SIZE;
}

export function getTrainingSubMode() {
  const v = (typeof localStorage !== 'undefined')
    ? localStorage.getItem(TRAINING_SUBMODE_KEY)
    : null;
  if (VALID_SUBMODES.has(v)) return v;
  const def = getNoteTypeDefaultDisplayMode('training');
  return VALID_SUBMODES.has(def) ? def : 'calendar';
}

export function setTrainingSubMode(mode) {
  if (!VALID_SUBMODES.has(mode)) return;
  try { localStorage.setItem(TRAINING_SUBMODE_KEY, mode); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────
// Training Year/Month filters (filter bar only)
// ─────────────────────────────────────────────────────────────
/** Hide training Year/Month in the filter bar (e.g. training calendar sub-mode). */
export function restoreTrainingDateFiltersToBar({ hide = false } = {}) {
  if (!hide) return;
  const y = document.getElementById('trainingYearContainer');
  const m = document.getElementById('trainingMonthContainer');
  if (y) y.style.display = 'none';
  if (m) m.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatTrainingDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const day  = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${yyyy}.${mm}.${dd} ${day}`;
}

/**
 * Silently align the Training Year/Month filter selects with the calendar's
 * current view.  Adds the year option if it isn't in the dropdown yet (the
 * dropdown is lazy-populated from /api/quotes/training-years and may not
 * contain future or empty-data years).  Enables the month filter since a
 * concrete year is now selected.
 *
 * Does NOT dispatch 'change' events — callers must only use this to reflect
 * external state changes, not to trigger a reload.
 */
function syncFilterSelects(year, month) {
  const yearSelect  = document.getElementById('trainingYearFilter');
  const monthSelect = document.getElementById('trainingMonthFilter');
  if (yearSelect) {
    const yearStr = String(year);
    let opt = Array.from(yearSelect.options).find(o => o.value === yearStr);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = yearStr;
      opt.textContent = yearStr;
      // Insert after the "All Years" (empty value) option, keeping newest-first.
      const firstReal = Array.from(yearSelect.options).find(o => o.value !== '');
      if (firstReal && parseInt(firstReal.value, 10) < year) {
        yearSelect.insertBefore(opt, firstReal);
      } else {
        yearSelect.appendChild(opt);
      }
    }
    yearSelect.value = yearStr;
    yearSelect.classList.toggle('filter-active', yearSelect.value !== '');
  }
  if (monthSelect) {
    monthSelect.disabled = false;
    monthSelect.value = String(month);
    monthSelect.classList.toggle('filter-active', monthSelect.value !== '');
  }
}

function getTrainingLabel(sourceType, getTrainingTypes) {
  if (!sourceType) return '';
  try {
    const types = getTrainingTypes();
    const found = types.find(t => t.value === sourceType);
    return found ? `${found.icon} ${found.label}` : sourceType;
  } catch { return sourceType; }
}

function getQuoteLabel(sourceType, getQuoteTypes) {
  if (!sourceType) return '';
  try {
    const types = getQuoteTypes();
    const found = types.find(t => t.value === sourceType);
    return found ? `${found.icon} ${found.label}` : sourceType;
  } catch { return sourceType; }
}

function listPaneTitle(note) {
  const t = (note.note_title || '').trim();
  if (!t || t === 'No title') return 'No title';
  return t;
}

function buildTitledRowHtml(note, idx, isSelected, opts) {
  const selCls = isSelected ? ' lp-selected' : '';
  const title = listPaneTitle(note);
  const previewRaw = noteTextToPlainText(note);
  const previewHtml = previewRaw
    ? `<div class="lp-row-preview">${escapeHtml(previewRaw)}</div>`
    : '';

  const scoreHtml = buildPaneScoreHtml(note);
  const scoreSlot = scoreHtml
    ? `<div class="lp-row-score-slot">${scoreHtml}</div>`
    : '';

  const metaHtml = buildListPaneRowMetaHtml(
    note,
    opts.currentNoteTypeFilter,
    opts.getTrainingTypes,
    opts.getQuoteTypes,
  );
  const metaRow = metaHtml
    ? `<div class="lp-row-meta">${metaHtml}</div>`
    : '';

  const thumbSrc = note.thumbnail || (note.attachments && note.attachments[0]?.thumbnail);
  const thumbHtml = thumbSrc
    ? `<div class="lp-row-thumb-slot"><img class="lp-row-thumb-img" src="${resolveAttachmentUrl(thumbSrc)}" alt=""></div>`
    : '';
  const thumbCls = thumbSrc ? ' lp-row-titled-has-thumb' : '';

  return `
    <div class="lp-row lp-row-titled${thumbCls}${selCls}" data-lp-idx="${idx}" data-lp-id="${note.id}">
      <div class="lp-row-main">
        <div class="lp-row-title-line">
          <div class="lp-row-title">${escapeHtml(title)}</div>
          ${scoreSlot}
        </div>
        ${previewHtml}
        ${metaRow}
      </div>
      ${thumbHtml}
    </div>`;
}

/** Right pane height follows the left list column (titled list-pane layout). */
function syncTitledPaneHeight(container) {
  const list = container.querySelector('.lp-list-titled');
  const pane = container.querySelector('.lp-pane');
  if (!list || !pane) return;
  requestAnimationFrame(() => {
    pane.style.height = `${list.offsetHeight}px`;
    pane.style.maxHeight = `${list.offsetHeight}px`;
  });
}

function buildRowHtml(note, idx, isSelected, opts) {
  const { currentNoteTypeFilter, getTrainingTypes, getQuoteTypes } = opts;
  const noteType = note.note_type || currentNoteTypeFilter || 'note';
  const selCls = isSelected ? ' lp-selected' : '';

  if (currentNoteTypeFilter !== 'training') {
    return buildTitledRowHtml(note, idx, isSelected, opts);
  }

  // ── Training list rows ──
  let headerHtml = '';
  if (noteType === 'training') {
    const dateStr  = formatTrainingDate(note.note_date);
    const typeStr  = getTrainingLabel(note.source_type, getTrainingTypes);
    headerHtml = `
      ${dateStr ? `<span class="lp-row-date">${escapeHtml(dateStr)}</span>` : ''}
      ${typeStr ? `<span class="lp-row-badge">${typeStr}</span>` : ''}`;
  } else if (noteType === 'quote') {
    const author = note.author_name || '';
    const source = note.source_name || '';
    const typeStr = getQuoteLabel(note.source_type, getQuoteTypes);
    headerHtml = `
      ${author ? `<span class="lp-row-date">${escapeHtml(author)}</span>` : ''}
      ${source ? `<span class="lp-row-badge">${escapeHtml(source)}</span>` : (typeStr ? `<span class="lp-row-badge">${typeStr}</span>` : '')}`;
  } else {
    const date = note.note_date ? formatTrainingDate(note.note_date) : '';
    headerHtml = date ? `<span class="lp-row-date">${escapeHtml(date)}</span>` : '';
  }

  // ── Preview text ──
  const preview = noteTextToPlainText(note).slice(0, 100);

  // ── Thumbnail (small, optional) ──
  let thumbHtml = '';
  const thumbSrc = note.thumbnail || (note.attachments && note.attachments[0]?.thumbnail);
  if (thumbSrc) {
    const resolved = resolveAttachmentUrl(thumbSrc);
    thumbHtml = `<img class="lp-row-thumb" src="${resolved}" alt="">`;
  }

  return `
    <div class="lp-row${selCls}" data-lp-idx="${idx}" data-lp-id="${note.id}">
      <div class="lp-row-main">
        <div class="lp-row-header">${headerHtml}</div>
        <div class="lp-row-preview">${escapeHtml(preview)}</div>
      </div>
      ${thumbHtml}
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// Pane rendering
// ─────────────────────────────────────────────────────────────

function _wireMetaLinks(root) {
  if (!root) return;
  root.querySelectorAll('.author-link').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      _opts.openAuthorModal?.(link.dataset.id, link.dataset.name);
    };
  });
  root.querySelectorAll('.source-link').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      _opts.openSourceModal?.(
        link.dataset.id,
        link.dataset.name,
        link.dataset.type || 'BOOK',
      );
    };
  });
}

function wirePaneMetaLinks(pane) {
  _wireMetaLinks(pane);
}

function updatePaneNoteDisplay(pane, note) {
  if (!pane || !note) return;

  const titleEl = pane.querySelector('#lpPaneTitle');
  if (titleEl) titleEl.textContent = listPaneTitle(note);

  const scoreEl = pane.querySelector('#lpPaneScore');
  if (scoreEl) {
    const scoreHtml = buildPaneScoreHtml(note);
    scoreEl.innerHTML = scoreHtml;
    scoreEl.hidden = !scoreHtml;
  }

  const { commentHtml, metadataHtml, tagsHtml } = buildPaneMetaSections(
    note,
    _opts.currentNoteTypeFilter,
    _opts.getTrainingTypes,
    _opts.getQuoteTypes,
    _opts.globalSettings,
  );

  const metaEl = pane.querySelector('#lpPaneMeta');
  if (metaEl) {
    const hasMeta = !!((metadataHtml && metadataHtml.trim()) || (tagsHtml && tagsHtml.trim()));
    metaEl.innerHTML = hasMeta
      ? `<div class="quote-metadata-row">
          <div class="quote-metadata-left">${metadataHtml || ''}</div>
          ${tagsHtml ? `<div class="quote-tags-inline">${tagsHtml}</div>` : ''}
        </div>`
      : '';
    metaEl.hidden = !hasMeta;
  }

  const commentEl = pane.querySelector('#lpPaneComment');
  if (commentEl) {
    commentEl.innerHTML = commentHtml;
    commentEl.hidden = !commentHtml;
  }

  wirePaneMetaLinks(pane);
}

function renderPane(pane, note) {
  if (!note) {
    resetPaneEditor();
    pane.innerHTML = `<div class="lp-pane-empty"><span>← Select a note to view</span></div>`;
    return;
  }

  ensurePaneEditorShell(pane, {
    onProperties: () => {
      const current = _notes[_selectedIndex];
      if (current) _opts.openPropertiesModal?.(current);
    },
    onSave: () => {},
  });

  updatePaneNoteDisplay(pane, note);
  renderPaneAttachments(pane, note);
  loadPaneNote(note, pane);
}

// ─────────────────────────────────────────────────────────────
// Selection logic
// ─────────────────────────────────────────────────────────────

async function selectNote(idx, { skipDirtyCheck = false } = {}) {
  if (idx < 0 || idx >= _notes.length) return;
  if (idx === _selectedIndex) return;

  const targetIdx = idx;

  if (!skipDirtyCheck) {
    const leave = await confirmLeavePaneEditor();
    if (leave === 'cancel') return;
  }

  _selectedIndex = targetIdx;

  _container.querySelectorAll('.lp-row').forEach(row => {
    row.classList.toggle('lp-selected', parseInt(row.dataset.lpIdx, 10) === targetIdx);
  });

  const selectedRow = _container.querySelector(`.lp-row[data-lp-idx="${targetIdx}"]`);
  if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });

  const pane = _container.querySelector('.lp-pane');
  if (pane) renderPane(pane, _notes[targetIdx]);

  // Refresh list row for the note we saved before leaving (deferred during switch)
  flushPendingPaneNoteSaved();
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Return the ID of the currently selected note (useful for preserving selection
 * across re-renders triggered by save/reload).
 */
export function getSelectedNoteId() {
  return _notes[_selectedIndex]?.id ?? null;
}

/** After creating a note, select it on the next list-pane render (then clear). */
let _pendingInitialNoteId = null;

export function setPendingInitialNoteId(id) {
  _pendingInitialNoteId = id != null ? id : null;
}

export function resolveInitialNoteId(fallback) {
  const id = _pendingInitialNoteId ?? fallback;
  _pendingInitialNoteId = null;
  return id;
}

/** Align training Year/Month filters (and calendar month) to a note date — no reload. */
export function alignTrainingFiltersToDate(dateString) {
  if (!dateString) return;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return;
  syncFilterSelects(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Render the list-pane layout into container, replacing any existing content.
 * opts.initialNoteId – if provided, open that note instead of the first one.
 */
export function renderListPaneView(container, notes, opts) {
  resetPaneEditor();
  resetPaneAttachments();
  _container = container;
  _notes = notes;
  _opts = opts;

  // Restore previously selected note if still in the new list; else fall back to 0.
  const wantedId = opts.initialNoteId ?? null;
  const restoredIdx = wantedId != null ? notes.findIndex(n => n.id == wantedId) : -1;
  _selectedIndex = restoredIdx >= 0 ? restoredIdx : 0;

  const isTraining = opts.currentNoteTypeFilter === 'training';
  const useTitledLayout = !isTraining;
  const subMode = isTraining ? getTrainingSubMode() : 'list';

  // ── Training + Calendar sub-mode ─────────────────────────────────────────
  if (isTraining && subMode === 'calendar') {
    // Filter-bar Year/Month are redundant here (calendar's own header owns
    // month navigation).  Put them back in the filter bar if they were moved
    // out in a previous list sub-mode render, and hide them.
    restoreTrainingDateFiltersToBar({ hide: true });

    container.innerHTML = `
      <div class="lp-layout">
        <div class="lp-list lp-list-calendar" id="lpList"></div>
        <div class="lp-pane" id="lpPane"></div>
      </div>`;
    const list    = container.querySelector('#lpList');
    const pane    = container.querySelector('#lpPane');
    const calHost = document.createElement('div');
    calHost.className = 'lp-calendar-host';
    list.appendChild(calHost);

    renderPane(pane, null);

    // Read the current Year / Month filter values so the calendar opens on
    // the month the user has selected in the filter bar.  When the user has
    // "All years" selected — directly or via the Clear button — the calendar
    // snaps to TODAY.  initialNoteId is only used to pre-select a note
    // inside the already-chosen month, never to override the month itself.
    const yearSelect  = document.getElementById('trainingYearFilter');
    const monthSelect = document.getElementById('trainingMonthFilter');
    const yearFromFilter  = yearSelect  ? parseInt(yearSelect.value,  10) : NaN;
    const monthFromFilter = monthSelect ? parseInt(monthSelect.value, 10) : NaN;

    let initialYear, initialMonth;
    if (Number.isFinite(yearFromFilter) && Number.isFinite(monthFromFilter)) {
      initialYear  = yearFromFilter;
      initialMonth = monthFromFilter;
    } else if (Number.isFinite(yearFromFilter)) {
      initialYear  = yearFromFilter;
      initialMonth = 1;
    } else {
      const now = new Date();
      initialYear  = now.getFullYear();
      initialMonth = now.getMonth() + 1;
    }

    renderTrainingCalendar(calHost, {
      getTrainingTypes: opts.getTrainingTypes,
      initialNoteId:    opts.initialNoteId ?? null,
      initialYear,
      initialMonth,
      onSelectNote: (monthNotes, idx) => {
        _notes = monthNotes;
        _selectedIndex = idx;
        renderPane(pane, monthNotes[idx] || null);
      },
      // Keep the Year/Month filter selects visually synced so switching to
      // list mode (or any re-render) continues from the month the user
      // navigated to within the calendar.
      onMonthChange: (year, month) => {
        syncFilterSelects(year, month);
      },
    });
    return;
  }

  // ── Flat list (default for all note types; also training + list sub-mode) ─
  const layoutCls = useTitledLayout ? 'lp-layout lp-layout-titled' : 'lp-layout';
  const listCls   = useTitledLayout ? 'lp-list lp-list-titled' : 'lp-list';
  container.innerHTML = `
    <div class="${layoutCls}">
      <div class="${listCls}" id="lpList"></div>
      <div class="lp-pane" id="lpPane"></div>
    </div>`;

  const list = container.querySelector('#lpList');
  if (useTitledLayout) {
    list.style.setProperty('--lp-list-min-rows', String(LP_LIST_PAGE_SIZE));
  }

  notes.forEach((note, idx) => {
    list.insertAdjacentHTML('beforeend', buildRowHtml(note, idx, idx === _selectedIndex, opts));
  });

  list.querySelectorAll('.lp-row').forEach(row => {
    row.addEventListener('click', () => { selectNote(parseInt(row.dataset.lpIdx)); });
  });
  _wireMetaLinks(list);

  const pane = container.querySelector('#lpPane');
  renderPane(pane, notes[_selectedIndex] || null);

  const initRow = list.querySelector(`.lp-row[data-lp-idx="${_selectedIndex}"]`);
  if (initRow) initRow.scrollIntoView({ block: 'nearest' });

  if (useTitledLayout) syncTitledPaneHeight(container);
}

/**
 * Refresh just the pane content for a given note id (call after save).
 * Also updates the in-memory notes array entry.
 */
export function refreshPaneNote(noteId, updatedNote, { updatePaneEditor = true } = {}) {
  const idx = _notes.findIndex(n => n.id == noteId);
  if (idx === -1 || !_container) return;
  _notes[idx] = updatedNote;

  // Update list row preview
  const row = _container.querySelector(`.lp-row[data-lp-id="${noteId}"]`);
  if (row) {
    row.outerHTML = buildRowHtml(updatedNote, idx, idx === _selectedIndex, _opts);
    // Re-attach click handler for the new row element
    const newRow = _container.querySelector(`.lp-row[data-lp-id="${noteId}"]`);
    if (newRow) {
      newRow.addEventListener('click', () => selectNote(parseInt(newRow.dataset.lpIdx)));
      _wireMetaLinks(newRow);
    }
  }

  const pane = _container.querySelector('.lp-pane');
  if (idx === _selectedIndex && pane) {
    updatePaneNoteDisplay(pane, updatedNote);
    renderPaneAttachments(pane, updatedNote);
  }

  if (updatePaneEditor && idx === _selectedIndex) {
    _opts.onPaneNoteUpdated?.(updatedNote);
  }
}
