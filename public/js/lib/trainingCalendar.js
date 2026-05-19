/**
 * trainingCalendar.js
 *
 * Renders a monthly calendar of training notes into a container (typically the
 * left column of the list-pane view).  Days on which a training took place show
 * an icon row per distinct sub-type (from settings).  The legend lists
 * sub-types by icon + label.
 *
 * Public API
 * ----------
 * renderTrainingCalendar(container, opts) → void
 *   opts:
 *     getTrainingTypes : () => [{ value, label, icon, color }]
 *     onSelectNote     : (monthNotes, idx) => void
 *                        Called when the user clicks a day that has trainings.
 *                        monthNotes is the full list of trainings for the
 *                        currently-visible month (oldest-first by date).  idx
 *                        is the index of the first training on the clicked day.
 *     onMonthChange?   : (year, month) => void
 *                        Called whenever the visible month changes due to
 *                        calendar's own prev/next/today buttons.  Use this to
 *                        keep external Year/Month select controls in sync.
 *                        NOT called when the caller provides initialYear/Month.
 *     initialYear?     : year to show initially (1–9999).  Falls back to the
 *                        year of initialNoteId, or today's year.
 *     initialMonth?    : month to show initially (1–12).  Falls back to the
 *                        month of initialNoteId, or today's month.
 *     initialNoteId?   : id of a training to open initially (picks the month
 *                        containing it, unless initialYear/Month is given).
 */

import { API_URL, fetchWithRetry } from './api.js';

// ─── Internal state ──────────────────────────────────────────────────────────
let _container    = null;
let _opts         = {};
let _viewYear     = null;   // visible month's year (e.g. 2026)
let _viewMonth    = null;   // visible month (1–12)
let _monthNotes   = [];     // trainings for the visible month
let _loading      = false;
let _trainingYears = null;  // [2026, 2024, …] from /api/quotes/training-years (cached)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLocalDate(dateString) {
  if (!dateString) return null;
  // pg serialises DATE columns as full ISO timestamps anchored in the server's
  // local timezone.  After JSON transport they arrive as UTC strings, so we
  // must convert back to the *browser's* local calendar day (same approach as
  // formatTrainingDate in cardRenderer.js).  A bare "YYYY-MM-DD" string is
  // parsed as UTC midnight which is still the same local day for any timezone
  // west of UTC+12 — good enough for the calendar.
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function sameDay(a, b) {
  return a && b && a.year === b.year && a.month === b.month && a.day === b.day;
}

function todayParts() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Monday-first day-of-week index for a given Y/M/D (0 = Mon … 6 = Sun).
 */
function mondayFirstDow(year, month, day) {
  const jsDow = new Date(year, month - 1, day).getDay(); // 0 Sun … 6 Sat
  return (jsDow + 6) % 7;
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year:  'numeric',
  });
}

/**
 * Build a map: subTypeValue → { label, icon }.  Unknown values fall back to a
 * generic label so we always render something.
 */
function buildTypeMap(getTrainingTypes) {
  const map = new Map();
  try {
    const types = getTrainingTypes() || [];
    types.forEach(t => {
      map.set(t.value, {
        label: t.label || t.value,
        icon:  t.icon  || '',
      });
    });
  } catch { /* ignore */ }
  return map;
}

function fallbackTypeMeta(value) {
  return { label: value || 'Unknown', icon: '' };
}

// ─── Data fetching ───────────────────────────────────────────────────────────

/**
 * Read currently-selected training sub-type values directly from the filter
 * bar checkboxes.  Returns an array of sub-type values; empty array means
 * "no filter — show all".  Mirrors the selector used in displayManager.js.
 */
function readSelectedTrainingTypes() {
  const boxes = document.querySelectorAll(
    '.training-type-filter-options input[type="checkbox"]'
  );
  const out = [];
  boxes.forEach(b => { if (b.checked && b.dataset.type) out.push(b.dataset.type); });
  return out;
}

async function fetchMonthTrainings(year, month) {
  // Use dateFrom/dateTo (direct note_date range) rather than the year/month
  // tag filters — older trainings that were never tagged with year/month still
  // need to show up on the calendar.
  const lastDay = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  const dateFrom = `${year}-${mm}-01`;
  const dateTo   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const params = new URLSearchParams();
  params.append('note_type', 'training');
  params.append('dateFrom',  dateFrom);
  params.append('dateTo',    dateTo);
  params.append('limit',     '500');
  params.append('offset',    '0');

  // Honour the training sub-type filter: if the user unchecks e.g. "Cardio",
  // cardio days shouldn't dot the calendar.  Reading directly from the DOM
  // keeps the calendar auto-in-sync when the user toggles the filter (the
  // calling code re-renders on every filter change).
  const selectedTypes = readSelectedTrainingTypes();
  if (selectedTypes.length > 0) {
    params.append('training_types', selectedTypes.join(','));
  }
  try {
    const resp = await fetchWithRetry(`${API_URL}/quotes?${params.toString()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // Sort oldest-first so Prev/Next in the pane walks the month chronologically.
    data.sort((a, b) => {
      const da = a.note_date || '';
      const db = b.note_date || '';
      if (da === db) return (a.id || 0) - (b.id || 0);
      return da < db ? -1 : 1;
    });
    return data;
  } catch (err) {
    console.error('[trainingCalendar] Failed to fetch month', year, month, err);
    return [];
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Build the list of years to show in the year dropdown.  We combine:
 *   - all years returned by /api/quotes/training-years (years that actually
 *     contain training notes)
 *   - the current view year
 *   - today's year
 *   - a small window (±3) around the current view year so users can step into
 *     "empty" years that aren't in the tagged set yet (common for old notes
 *     that were imported without year tags).
 * Sorted newest → oldest.
 */
function buildYearOptions() {
  const set = new Set();
  (_trainingYears || []).forEach(y => set.add(y));
  set.add(new Date().getFullYear());
  set.add(_viewYear);
  for (let dy = -3; dy <= 3; dy++) set.add(_viewYear + dy);
  return Array.from(set).sort((a, b) => b - a);
}

function renderHeader() {
  const years = buildYearOptions();
  const yearOpts  = years.map(y =>
    `<option value="${y}"${y === _viewYear ? ' selected' : ''}>${y}</option>`
  ).join('');
  const monthOpts = MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    return `<option value="${m}"${m === _viewMonth ? ' selected' : ''}>${name}</option>`;
  }).join('');

  // Layout: [◀] [Month ▼] [▶] [Year ▼] [Today]
  // Prev/next bracket the Month dropdown so the arrows feel like month-by-month
  // stepping; the Year dropdown stands apart as a jumper.
  return `
    <div class="tc-header">
      <button type="button" class="tc-nav-btn" data-tc-nav="prev" title="Previous month">◀</button>
      <select class="tc-title-select tc-title-month" data-tc-sel="month" title="Pick month">${monthOpts}</select>
      <button type="button" class="tc-nav-btn" data-tc-nav="next" title="Next month">▶</button>
      <select class="tc-title-select tc-title-year"  data-tc-sel="year"  title="Pick year">${yearOpts}</select>
      <button type="button" class="tc-nav-btn tc-today-btn" data-tc-nav="today" title="Jump to today">Today</button>
    </div>`;
}

function renderLegend(typeMap) {
  const items = Array.from(typeMap.entries())
    .map(([value, meta]) => `
      <span class="tc-legend-item">
        <span class="tc-legend-label">${meta.icon ? meta.icon + ' ' : ''}${meta.label}</span>
      </span>`)
    .join('');
  return `<div class="tc-legend">${items || '<span class="tc-legend-empty">No training sub-types configured</span>'}</div>`;
}

function renderDayCell(year, month, day, dayTrainings, typeMap, isToday) {
  // Aggregate sub-types (deduped, preserve encounter order).  A single day can
  // mix multiple sub-types — we show one small dot per distinct sub-type.
  const seen = new Set();
  const subs = [];
  dayTrainings.forEach(n => {
    const v = n.source_type || '';
    if (!seen.has(v)) { seen.add(v); subs.push(v); }
  });

  let cellClasses = 'tc-day';
  if (subs.length > 0)  cellClasses += ' tc-day-has-training';
  if (isToday)          cellClasses += ' tc-day-today';

  // Icons row — one glyph per distinct sub-type.  Sub-types without a
  // configured icon are skipped rather than leaving a blank gap.
  const iconsHtml = subs.length
    ? (() => {
        const glyphs = subs
          .map(v => (typeMap.get(v) || fallbackTypeMeta(v)).icon)
          .filter(Boolean);
        if (!glyphs.length) return '';
        return `<div class="tc-day-icons">${
          glyphs.map(g => `<span class="tc-day-icon">${g}</span>`).join('')
        }</div>`;
      })()
    : '';

  const tooltip = dayTrainings.length
    ? dayTrainings.map(n => {
        const meta = typeMap.get(n.source_type) || fallbackTypeMeta(n.source_type);
        return `${meta.icon ? meta.icon + ' ' : ''}${meta.label}`;
      }).join('\n')
    : '';

  return `
    <div class="${cellClasses}"
         data-tc-y="${year}" data-tc-m="${month}" data-tc-d="${day}"
         ${tooltip ? `title="${tooltip.replace(/"/g, '&quot;')}"` : ''}>
      <span class="tc-day-num">${day}</span>
      ${iconsHtml}
    </div>`;
}

function renderGrid(typeMap) {
  const total  = daysInMonth(_viewYear, _viewMonth);
  const leading = mondayFirstDow(_viewYear, _viewMonth, 1); // empty cells before day 1

  // Bucket trainings by day-of-month for O(1) lookup
  const byDay = new Map();
  _monthNotes.forEach(n => {
    const parts = parseLocalDate(n.note_date);
    if (!parts) return;
    if (parts.year !== _viewYear || parts.month !== _viewMonth) return;
    if (!byDay.has(parts.day)) byDay.set(parts.day, []);
    byDay.get(parts.day).push(n);
  });

  const today   = todayParts();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayHtml = weekdays.map(w => `<div class="tc-weekday">${w}</div>`).join('');

  let cellsHtml = '';
  for (let i = 0; i < leading; i++) cellsHtml += `<div class="tc-day tc-day-empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const dayTrainings = byDay.get(d) || [];
    const isToday = today.year === _viewYear && today.month === _viewMonth && today.day === d;
    cellsHtml += renderDayCell(_viewYear, _viewMonth, d, dayTrainings, typeMap, isToday);
  }

  return `
    <div class="tc-grid">
      ${weekdayHtml}
      ${cellsHtml}
    </div>`;
}

function render() {
  if (!_container) return;
  const typeMap = buildTypeMap(_opts.getTrainingTypes);

  _container.innerHTML = `
    <div class="tc-calendar">
      ${renderHeader()}
      ${_loading ? '<div class="tc-loading">Loading…</div>' : renderGrid(typeMap)}
      ${renderLegend(typeMap)}
    </div>`;

  // Header navigation (prev / next / today)
  _container.querySelectorAll('.tc-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.tcNav;
      if (action === 'prev') {
        if (_viewMonth === 1) { _viewMonth = 12; _viewYear--; } else { _viewMonth--; }
      } else if (action === 'next') {
        if (_viewMonth === 12) { _viewMonth = 1; _viewYear++; } else { _viewMonth++; }
      } else if (action === 'today') {
        const t = todayParts();
        _viewYear  = t.year;
        _viewMonth = t.month;
      }
      if (typeof _opts.onMonthChange === 'function') {
        _opts.onMonthChange(_viewYear, _viewMonth);
      }
      loadAndRender();
    });
  });

  // In-header month / year dropdowns — jump directly.
  _container.querySelectorAll('.tc-title-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const kind = sel.dataset.tcSel;
      const v = parseInt(sel.value, 10);
      if (!Number.isFinite(v)) return;
      if (kind === 'month') _viewMonth = v;
      else if (kind === 'year') _viewYear = v;
      if (typeof _opts.onMonthChange === 'function') {
        _opts.onMonthChange(_viewYear, _viewMonth);
      }
      loadAndRender();
    });
  });

  // Day click → pick first training of that day and notify caller
  _container.querySelectorAll('.tc-day-has-training').forEach(cell => {
    cell.addEventListener('click', () => {
      const day = parseInt(cell.dataset.tcD, 10);
      // Find first training on that day in the month-notes array (preserves sort)
      const idx = _monthNotes.findIndex(n => {
        const p = parseLocalDate(n.note_date);
        return p && p.year === _viewYear && p.month === _viewMonth && p.day === day;
      });
      if (idx === -1) return;
      if (typeof _opts.onSelectNote === 'function') {
        _opts.onSelectNote(_monthNotes, idx);
      }
    });
  });
}

async function fetchTrainingYearsOnce() {
  if (_trainingYears) return _trainingYears;
  try {
    const resp = await fetchWithRetry(`${API_URL}/quotes/training-years`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _trainingYears = Array.isArray(data.years) ? data.years.filter(Number.isFinite) : [];
  } catch (err) {
    console.error('[trainingCalendar] Failed to fetch training years', err);
    _trainingYears = [];
  }
  return _trainingYears;
}

async function loadAndRender() {
  _loading = true;
  render();
  _monthNotes = await fetchMonthTrainings(_viewYear, _viewMonth);
  _loading = false;
  render();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function renderTrainingCalendar(container, opts) {
  _container = container;
  _opts      = opts || {};

  // Decide which month to show first.  Priority:
  //   1. Explicit initialYear/initialMonth from the caller (filter selects).
  //   2. Today.
  // initialNoteId is NOT used to pick a month — it only selects a note in the
  // already-chosen month if one is present.  This ensures the filter bar
  // (including the "All years" state) is always the source of truth for the
  // visible month.
  const t = todayParts();
  _viewYear  = t.year;
  _viewMonth = t.month;

  if (opts && Number.isFinite(opts.initialYear) && Number.isFinite(opts.initialMonth)) {
    _viewYear  = opts.initialYear;
    _viewMonth = opts.initialMonth;
  }

  // Prime the year dropdown before the first render so the <select> shows
  // every year that actually has trainings (plus a sensible window around
  // the current view).  Non-blocking error handling lives inside the helper.
  await fetchTrainingYearsOnce();

  await loadAndRender();

  // If we had an initialNoteId and it falls in the loaded month, notify the
  // caller so the right pane opens on it.
  if (opts && opts.initialNoteId != null && typeof opts.onSelectNote === 'function') {
    const idx = _monthNotes.findIndex(n => String(n.id) === String(opts.initialNoteId));
    if (idx >= 0) opts.onSelectNote(_monthNotes, idx);
  }
}
