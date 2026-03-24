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

// ─────────────────────────────────────────────────────────────
// Internal state (reset on every renderListPaneView call)
// ─────────────────────────────────────────────────────────────
let _notes = [];
let _selectedIndex = 0;
let _opts = {};
let _container = null;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

function formatTrainingDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const day  = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${yyyy}.${mm}.${dd} ${day}`;
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

function buildRowHtml(note, idx, isSelected, opts) {
  const { currentNoteTypeFilter, getTrainingTypes, getQuoteTypes } = opts;
  const noteType = note.note_type || currentNoteTypeFilter || 'note';
  const selCls = isSelected ? ' lp-selected' : '';

  // ── Compact header info ──
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
  const preview = stripHtml(note.note_text).slice(0, 100);

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

function renderPane(pane, note, idx) {
  if (!note) {
    pane.innerHTML = `<div class="lp-pane-empty"><span>← Select a note to view</span></div>`;
    return;
  }

  const total = _notes.length;
  const { openEditModal, createQuoteCard, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings } = _opts;

  // Navigation
  const navHtml = `
    <div class="lp-pane-nav">
      <button class="lp-nav-btn" id="lpPrev" ${idx <= 0 ? 'disabled' : ''}>◀ Prev</button>
      <span class="lp-nav-counter">${idx + 1} / ${total}</span>
      <button class="lp-nav-btn" id="lpNext" ${idx >= total - 1 ? 'disabled' : ''}>Next ▶</button>
    </div>`;

  // Full card HTML (reuse existing renderer)
  const cardHtml = createQuoteCard(note, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes, globalSettings);

  pane.innerHTML = navHtml + cardHtml;

  // ── Nav button handlers ──
  const prevBtn = pane.querySelector('#lpPrev');
  const nextBtn = pane.querySelector('#lpNext');
  if (prevBtn) prevBtn.addEventListener('click', () => selectNote(idx - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => selectNote(idx + 1));

  // ── Click card to edit (same as card-grid behaviour) ──
  const card = pane.querySelector('.quote-card');
  if (card) {
    card.addEventListener('click', e => {
      // Let tag, author/source links, expand buttons handle themselves
      if (e.target.closest('.tag-clickable, .author-link, .source-link, .expand-btn, .lp-pane-nav')) return;
      openEditModal(note);
    });
  }

  // ── Author / Source link handlers ──
  pane.querySelectorAll('.author-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      _opts.openAuthorModal && _opts.openAuthorModal(link.dataset.id, link.dataset.name);
    });
  });
  pane.querySelectorAll('.source-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      _opts.openSourceModal && _opts.openSourceModal(link.dataset.id, link.dataset.name, link.dataset.type || 'BOOK');
    });
  });

  // ── Tag click handlers ──
  pane.querySelectorAll('.tag-clickable').forEach(tag => {
    tag.addEventListener('click', e => {
      e.stopPropagation();
      _opts.filterByTag && _opts.filterByTag(tag.textContent.trim());
    });
  });

  // ── Expand / collapse long text ──
  pane.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const noteIdStr = btn.id.replace('expand-', '');
      const textEl = pane.querySelector(`#quote-${noteIdStr}`);
      if (!textEl) return;
      const expanded = textEl.dataset.expanded === 'true';
      if (expanded) {
        textEl.classList.add('collapsible');
        textEl.dataset.expanded = 'false';
        btn.innerHTML = '▼ Show more';
      } else {
        textEl.classList.remove('collapsible');
        textEl.dataset.expanded = 'true';
        btn.innerHTML = '▲ Show less';
      }
    });
  });

  // ── Image thumbnails ──
  // showFullImage is a global, no extra wiring needed (the card HTML has onclick attrs).

  // Notify caller so it can apply post-render logic (e.g. showLongExpanded)
  _opts.onPaneRendered?.();
}

// ─────────────────────────────────────────────────────────────
// Selection logic
// ─────────────────────────────────────────────────────────────

function selectNote(idx) {
  if (idx < 0 || idx >= _notes.length) return;
  _selectedIndex = idx;

  // Update list row highlights
  _container.querySelectorAll('.lp-row').forEach(row => {
    row.classList.toggle('lp-selected', parseInt(row.dataset.lpIdx) === idx);
  });

  // Scroll selected row into view within the list column
  const selectedRow = _container.querySelector(`.lp-row[data-lp-idx="${idx}"]`);
  if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });

  // Re-render pane
  const pane = _container.querySelector('.lp-pane');
  if (pane) renderPane(pane, _notes[idx], idx);
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

/**
 * Render the list-pane layout into container, replacing any existing content.
 * opts.initialNoteId – if provided, open that note instead of the first one.
 */
export function renderListPaneView(container, notes, opts) {
  _container = container;
  _notes = notes;
  _opts = opts;

  // Restore previously selected note if still in the new list; else fall back to 0.
  const wantedId = opts.initialNoteId ?? null;
  const restoredIdx = wantedId != null ? notes.findIndex(n => n.id == wantedId) : -1;
  _selectedIndex = restoredIdx >= 0 ? restoredIdx : 0;

  // Derive a display label for the list header
  const TYPE_META = {
    training:   { icon: '💪', label: 'Trainings' },
    quote:      { icon: '💬', label: 'Quotes'    },
    historical: { icon: '📖', label: 'Historical' },
    lyrics:     { icon: '🎵', label: 'Lyrics'    },
    note:       { icon: '📝', label: 'Notes'     },
  };
  const typeMeta = TYPE_META[opts.currentNoteTypeFilter] || { icon: '📋', label: opts.currentNoteTypeFilter || 'Notes' };
  const headerHtml = `
    <div class="lp-list-header">
      <span class="lp-list-header-type">${typeMeta.icon} ${typeMeta.label}</span>
      <span class="lp-list-header-count">${notes.length} notes</span>
    </div>`;

  // Build skeleton
  container.innerHTML = `
    <div class="lp-layout">
      <div class="lp-list" id="lpList">${headerHtml}</div>
      <div class="lp-pane" id="lpPane"></div>
    </div>`;

  // Fill list (rows appended after the header that's already in #lpList)
  const list = container.querySelector('#lpList');
  notes.forEach((note, idx) => {
    list.insertAdjacentHTML('beforeend', buildRowHtml(note, idx, idx === _selectedIndex, opts));
  });

  // Row click handlers
  list.querySelectorAll('.lp-row').forEach(row => {
    row.addEventListener('click', () => selectNote(parseInt(row.dataset.lpIdx)));
  });

  // Render pane with initially selected note
  const pane = container.querySelector('#lpPane');
  renderPane(pane, notes[_selectedIndex] || null, _selectedIndex);

  // Scroll selected row into view
  const initRow = list.querySelector(`.lp-row[data-lp-idx="${_selectedIndex}"]`);
  if (initRow) initRow.scrollIntoView({ block: 'nearest' });
}

/**
 * Refresh just the pane content for a given note id (call after save).
 * Also updates the in-memory notes array entry.
 */
export function refreshPaneNote(noteId, updatedNote) {
  const idx = _notes.findIndex(n => n.id == noteId);
  if (idx === -1 || !_container) return;
  _notes[idx] = updatedNote;

  // Update list row preview
  const row = _container.querySelector(`.lp-row[data-lp-id="${noteId}"]`);
  if (row) {
    row.outerHTML = buildRowHtml(updatedNote, idx, idx === _selectedIndex, _opts);
    // Re-attach click handler for the new row element
    const newRow = _container.querySelector(`.lp-row[data-lp-id="${noteId}"]`);
    if (newRow) newRow.addEventListener('click', () => selectNote(parseInt(newRow.dataset.lpIdx)));
  }

  // Re-render pane if this is the currently selected note
  if (idx === _selectedIndex) {
    const pane = _container.querySelector('.lp-pane');
    if (pane) renderPane(pane, updatedNote, idx);
  }
}
