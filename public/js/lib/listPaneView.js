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
import { renderTrainingCalendar } from './trainingCalendar.js';

// ─────────────────────────────────────────────────────────────
// Internal state (reset on every renderListPaneView call)
// ─────────────────────────────────────────────────────────────
let _notes = [];
let _selectedIndex = 0;
let _opts = {};
let _container = null;

// Per-note-type "sub-view" preference for the list-pane left column.  Only
// Trainings currently have two sub-views (calendar / list); other note types
// will simply ignore the value.  Persisted in localStorage so the user's
// choice survives reloads.
const TRAINING_SUBMODE_KEY = 'lpTrainingSubMode';
const VALID_SUBMODES = new Set(['calendar', 'list']);

/** List-pane page size for non-training types — will move to Settings later. */
export const LP_LIST_PAGE_SIZE = 20;
/** Fixed thumbnail size for titled list rows (px). */
export const LP_TITLED_THUMB_SIZE_PX = 80;

export function getListPanePageSize(noteType) {
  if (noteType === 'training') return 12;
  return LP_LIST_PAGE_SIZE;
}

export function getTrainingSubMode() {
  const v = (typeof localStorage !== 'undefined')
    ? localStorage.getItem(TRAINING_SUBMODE_KEY)
    : null;
  return VALID_SUBMODES.has(v) ? v : 'calendar';
}

function setTrainingSubMode(mode) {
  if (!VALID_SUBMODES.has(mode)) return;
  try { localStorage.setItem(TRAINING_SUBMODE_KEY, mode); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────
// Training Year/Month filter reparenting
// ─────────────────────────────────────────────────────────────
// When training + list sub-mode is active we physically move the global
// Year/Month filter containers out of the filter bar and into the list
// header so the user has one unambiguous location to pick year/month.
// The underlying <select> elements stay the same (their IDs and event
// listeners are preserved across moves), so every existing code path that
// reads #trainingYearFilter / #trainingMonthFilter keeps working.
//
// We remember each container's original parent + nextSibling on first move
// so we can always return them to the same exact spot.
let _filterOriginalYearNext  = null;  // original nextSibling for year container
let _filterOriginalMonthNext = null;  // original nextSibling for month container
let _filterOriginalParent    = null;  // original parent (shared between both)

function captureOriginalFilterPositions() {
  if (_filterOriginalParent) return;
  const y = document.getElementById('trainingYearContainer');
  const m = document.getElementById('trainingMonthContainer');
  if (y && y.parentElement) {
    _filterOriginalParent    = y.parentElement;
    _filterOriginalYearNext  = y.nextSibling;
    _filterOriginalMonthNext = m ? m.nextSibling : null;
  }
}

/**
 * Move the training Year/Month filter containers into the given host element
 * and force them visible there.  Safe to call repeatedly — it's a no-op if
 * the containers already live in `host`.
 */
function moveTrainingDateFiltersTo(host) {
  if (!host) return;
  captureOriginalFilterPositions();
  const y = document.getElementById('trainingYearContainer');
  const m = document.getElementById('trainingMonthContainer');
  if (y && y.parentElement !== host) host.appendChild(y);
  if (m && m.parentElement !== host) host.appendChild(m);
  if (y) y.style.display = 'block';
  if (m) m.style.display = 'block';
}

/**
 * Return the training Year/Month filter containers to their original parent
 * at their original positions.  Optionally force them hidden (used in
 * calendar sub-mode where they're redundant with the calendar's own
 * in-header dropdowns).  Safe to call repeatedly.
 */
export function restoreTrainingDateFiltersToBar({ hide = false } = {}) {
  const y = document.getElementById('trainingYearContainer');
  const m = document.getElementById('trainingMonthContainer');

  // Only move nodes if we've captured their original home AND they're
  // currently elsewhere.  On first render they're still in the filter bar,
  // so there's nothing to move — just proceed to optional hide.
  if (_filterOriginalParent) {
    if (y && y.parentElement !== _filterOriginalParent) {
      _filterOriginalParent.insertBefore(y, _filterOriginalYearNext);
    }
    if (m && m.parentElement !== _filterOriginalParent) {
      _filterOriginalParent.insertBefore(m, _filterOriginalMonthNext);
    }
  }

  if (hide) {
    if (y) y.style.display = 'none';
    if (m) m.style.display = 'none';
  }
  // When not hiding we leave display alone — the next updateFilterVisibility
  // call (triggered e.g. by a note-type change) will reset it to 'block' for
  // training views or 'none' for non-training views.
}

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

function buildTitledRowHtml(note, idx, isSelected) {
  const selCls = isSelected ? ' lp-selected' : '';
  const title = listPaneTitle(note);
  const preview = stripHtml(note.note_text).slice(0, 200);

  const thumbSrc = note.thumbnail || (note.attachments && note.attachments[0]?.thumbnail);
  const thumbHtml = thumbSrc
    ? `<div class="lp-row-thumb-slot"><img class="lp-row-thumb-img" src="${resolveAttachmentUrl(thumbSrc)}" alt=""></div>`
    : '';
  const thumbCls = thumbSrc ? ' lp-row-titled-has-thumb' : '';

  return `
    <div class="lp-row lp-row-titled${thumbCls}${selCls}" data-lp-idx="${idx}" data-lp-id="${note.id}">
      <div class="lp-row-main">
        <div class="lp-row-title">${escapeHtml(title)}</div>
        <div class="lp-row-preview lp-row-preview-multiline">${escapeHtml(preview) || '\u00a0'}</div>
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
    return buildTitledRowHtml(note, idx, isSelected);
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
    job:        { icon: '💼', label: 'Jobs'      },
    quote:      { icon: '💬', label: 'Quotes'    },
    historical: { icon: '📖', label: 'Historical' },
    lyrics:     { icon: '🎵', label: 'Lyrics'    },
    note:       { icon: '📝', label: 'Notes'     },
  };
  const typeMeta = opts.currentNoteTypeFilter == null
    ? { icon: '📋', label: 'All Notes' }
    : (TYPE_META[opts.currentNoteTypeFilter] || { icon: '📋', label: opts.currentNoteTypeFilter });

  // Training is the only note type that offers a sub-view toggle.  The toggle
  // lives in the list header; clicking it re-invokes renderListPaneView with
  // the same notes/opts so we keep the code path uniform.
  const isTraining = opts.currentNoteTypeFilter === 'training';
  const useTitledLayout = !isTraining;
  const subMode    = isTraining ? getTrainingSubMode() : 'list';

  const toggleHtml = isTraining ? `
    <div class="lp-list-header-toggle" role="tablist" aria-label="List view mode">
      <button type="button" class="lp-toggle-btn${subMode === 'calendar' ? ' active' : ''}" data-lp-submode="calendar" role="tab" aria-selected="${subMode === 'calendar'}">📅 Calendar</button>
      <button type="button" class="lp-toggle-btn${subMode === 'list' ? ' active' : ''}" data-lp-submode="list" role="tab" aria-selected="${subMode === 'list'}">📋 List</button>
    </div>` : '';

  const countHtml = subMode === 'calendar'
    ? '' // Calendar has its own title (month/year) — a "N notes" count would be misleading
    : `<span class="lp-list-header-count">${notes.length} notes</span>`;

  // A dedicated slot where we park the global Year/Month filter containers
  // when training + list sub-mode is active.  Only emitted in that mode — in
  // other modes the slot doesn't exist and the containers live in the global
  // filter bar as usual.
  const dateFiltersSlotHtml = (isTraining && subMode === 'list')
    ? `<div class="lp-list-header-dates" id="lpListHeaderDates"></div>`
    : '';

  const headerHtml = `
    <div class="lp-list-header">
      <span class="lp-list-header-type">${typeMeta.icon} ${typeMeta.label}</span>
      ${toggleHtml}
      ${countHtml}
    </div>
    ${dateFiltersSlotHtml}`;

  // ── Training + Calendar sub-mode ─────────────────────────────────────────
  if (isTraining && subMode === 'calendar') {
    // Filter-bar Year/Month are redundant here (calendar's own header owns
    // month navigation).  Put them back in the filter bar if they were moved
    // out in a previous list sub-mode render, and hide them.
    restoreTrainingDateFiltersToBar({ hide: true });

    container.innerHTML = `
      <div class="lp-layout">
        <div class="lp-list lp-list-calendar" id="lpList">${headerHtml}</div>
        <div class="lp-pane" id="lpPane"></div>
      </div>`;
    const list    = container.querySelector('#lpList');
    const pane    = container.querySelector('#lpPane');
    // The calendar renders into its own host below the header.
    const calHost = document.createElement('div');
    calHost.className = 'lp-calendar-host';
    list.appendChild(calHost);

    wireToggleButtons(list, notes, opts);

    // Render empty pane first; the calendar will notify us once it has data.
    renderPane(pane, null, 0);

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
        renderPane(pane, monthNotes[idx] || null, idx);
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

  // IMPORTANT: before we blow away container.innerHTML we must first park the
  // moved Year/Month filter containers back in the global filter bar.
  // Otherwise they become orphans inside the old DOM and a subsequent
  // getElementById('trainingYearContainer') returns null, making the next
  // move-to-slot call a no-op (i.e. the dropdowns visually disappear).
  // This is only needed when we're about to wipe the container, so we do it
  // here before innerHTML assignment.
  restoreTrainingDateFiltersToBar();

  // ── Flat list (default for all note types; also training + list sub-mode) ─
  const layoutCls = useTitledLayout ? 'lp-layout lp-layout-titled' : 'lp-layout';
  const listCls   = useTitledLayout ? 'lp-list lp-list-titled' : 'lp-list';
  container.innerHTML = `
    <div class="${layoutCls}">
      <div class="${listCls}" id="lpList">${headerHtml}</div>
      <div class="lp-pane" id="lpPane"></div>
    </div>`;

  const list = container.querySelector('#lpList');
  wireToggleButtons(list, notes, opts);

  // For training + list sub-mode: move the now-safe filter containers into
  // the newly-rendered list header slot.
  if (isTraining && subMode === 'list') {
    const slot = container.querySelector('#lpListHeaderDates');
    if (slot) moveTrainingDateFiltersTo(slot);
  }

  notes.forEach((note, idx) => {
    list.insertAdjacentHTML('beforeend', buildRowHtml(note, idx, idx === _selectedIndex, opts));
  });

  list.querySelectorAll('.lp-row').forEach(row => {
    row.addEventListener('click', () => selectNote(parseInt(row.dataset.lpIdx)));
  });

  const pane = container.querySelector('#lpPane');
  renderPane(pane, notes[_selectedIndex] || null, _selectedIndex);

  const initRow = list.querySelector(`.lp-row[data-lp-idx="${_selectedIndex}"]`);
  if (initRow) initRow.scrollIntoView({ block: 'nearest' });

  if (useTitledLayout) syncTitledPaneHeight(container);
}

/**
 * Attach click handlers to the Calendar/List toggle buttons in the list
 * header.  On click we persist the new sub-mode and re-invoke
 * renderListPaneView with the cached notes/opts so the switch is instant.
 *
 * Note: we rely on the caller-supplied `opts.onSubModeChange` to trigger any
 * side-effects that need full reload (e.g. list mode wanting pagination to
 * reappear).  If the caller doesn't provide one we just re-render in place,
 * which is fine because the calendar does its own data fetching and the
 * list sub-mode is content-complete with whatever `notes` were passed in.
 */
function wireToggleButtons(list, notes, opts) {
  list.querySelectorAll('.lp-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.lpSubmode;
      if (!VALID_SUBMODES.has(newMode)) return;
      if (getTrainingSubMode() === newMode) return;
      setTrainingSubMode(newMode);
      // Let the app reload (pagination + displayQuotes empty-state depend on
      // the current sub-mode).  Fall back to a local re-render if no hook.
      if (typeof opts.onSubModeChange === 'function') {
        opts.onSubModeChange(newMode);
      } else {
        renderListPaneView(_container, notes, opts);
      }
    });
  });
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
