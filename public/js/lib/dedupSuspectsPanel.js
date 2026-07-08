/**
 * Options → Duplicate inspection: load /api/dedup/suspects and render normal
 * quote cards side-by-side (same HTML as the main list).
 */

import { escapeHtml } from './utils.js?v=20260703color1';

/**
 * @param {Object} opts
 * @param {string} opts.apiUrl - e.g. `${origin}/api`
 * @param {function(string): HTMLElement|null} opts.getElementByIdSafe
 * @param {function(Object): string} opts.createQuoteCardHtml
 * @param {function(Object): void} opts.openEditModal
 * @param {function(HTMLElement): void} opts.toggleCardExpand
 * @param {function(): boolean} opts.getSelectionMode
 * @param {function(HTMLElement, string): void} opts.toggleNoteSelection
 * @param {function(string, string): void} [opts.openAuthorModal]
 * @param {function(string, string, string): void} [opts.openSourceModal]
 */
export function initDedupSuspectsPanel(opts) {
  const {
    apiUrl,
    getElementByIdSafe,
    createQuoteCardHtml,
    openEditModal,
    toggleCardExpand,
    getSelectionMode,
    toggleNoteSelection,
    openAuthorModal,
    openSourceModal,
  } = opts;

  const btn = getElementByIdSafe('dedupSuspectsScanBtn');
  const root = getElementByIdSafe('dedupSuspectsRoot');
  if (!btn || !root) return;

  btn.addEventListener('click', () => void loadAndRender());

  async function loadAndRender() {
    btn.disabled = true;
    root.innerHTML = '<p class="setting-description">Loading…</p>';
    try {
      const res = await fetch(`${apiUrl}/dedup/suspects?limit=50`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const data = await res.json();
      renderGroups(data.groups || []);
    } catch (e) {
      root.innerHTML = `<p class="setting-description" style="color:var(--danger, #c00);">${escapeHtml(e.message || String(e))}</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderGroups(groups) {
    if (!groups.length) {
      root.innerHTML =
        '<p class="setting-description">No duplicate groups found (same text, title, type, dates, author/source; non-empty body).</p>';
      return;
    }

    root.innerHTML = groups
      .map((g, gi) => {
        const notes = g.notes || [];
        const slots = notes
          .map(
            (n) =>
              `<div class="dedup-card-slot"><div class="quotes-list dedup-single-quote-grid">${createQuoteCardHtml(n)}</div></div>`,
          )
          .join('');
        const idList = (g.ids || []).join(', ');
        return `<div class="dedup-group" data-dedup-group="${gi}">
          <div class="dedup-group-head">${g.count} notes — ids: <span class="dedup-id-list">${escapeHtml(idList)}</span></div>
          <div class="dedup-group-cards">${slots}</div>
        </div>`;
      })
      .join('');

    root.querySelectorAll('.quote-card').forEach((card) => wireQuoteCard(card));
    root.querySelectorAll('.author-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthorModal?.(link.dataset.id, link.dataset.name);
      });
    });
    root.querySelectorAll('.source-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openSourceModal?.(
          link.dataset.id,
          link.dataset.name,
          link.dataset.type || 'BOOK',
        );
      });
    });
  }

  function wireQuoteCard(card) {
    if (card.dataset.dedupWired === '1') return;
    card.dataset.dedupWired = '1';

    let longPressTimer;
    let longPressTriggered = false;
    let clickTimer;
    let clickCount = 0;

    card.addEventListener('dblclick', (e) => {
      e.preventDefault();
      clearTimeout(clickTimer);
      clickCount = 0;
      toggleCardExpand(card);
    });

    card.addEventListener('touchstart', () => {
      longPressTriggered = false;
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        toggleCardExpand(card);
        if (navigator.vibrate) navigator.vibrate(50);
      }, 700);
    }, { passive: true });

    card.addEventListener('touchend', () => clearTimeout(longPressTimer));
    card.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    card.addEventListener('click', (e) => {
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }
      if (
        e.target.closest('.author-link') ||
        e.target.closest('.source-link') ||
        e.target.closest('.expand-btn') ||
        e.target.closest('.quote-image-thumb')
      ) {
        return;
      }

      if (getSelectionMode() || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        clearTimeout(clickTimer);
        clickCount = 0;
        toggleNoteSelection(card, card.dataset.quoteId);
        return;
      }

      clickCount++;
      if (clickCount === 1) {
        clickTimer = setTimeout(async () => {
          clickCount = 0;
          const quoteId = card.dataset.quoteId;
          try {
            const r = await fetch(`${apiUrl}/quotes/${quoteId}`);
            if (!r.ok) return;
            const quote = await r.json();
            openEditModal(quote);
          } catch (_) {
            /* ignore */
          }
        }, 250);
      } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        clickCount = 0;
      }
    });
  }
}
