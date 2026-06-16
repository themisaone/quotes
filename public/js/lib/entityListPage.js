// ============================================================
// entityListPage.js — render the Authors and Sources list pages.
// ============================================================
//
// These two pages share the same shape — a card grid with a search box,
// a sort selector and a counter — so they live together and use the
// same private helpers.  Clicks use data-* attrs + delegation (no inline
// onclick) so names with quotes/apostrophes work reliably.
//
// Usage:
//   import { initEntityListPage, loadAuthors, loadSources, displayAuthors, displaySources }
//     from './js/lib/entityListPage.js?v=20260614sourceclick';
//
//   initEntityListPage({
//     escapeHtml,
//     getApiUrl: () => API_URL,
//     getElementByIdSafe,
//     showFetchError: window.showFetchError,
//   });

let _deps = {
  escapeHtml: (s) => String(s),
  getApiUrl: () => '/api',
  getElementByIdSafe: (id) => document.getElementById(id),
  showFetchError: () => {},
};

let _handlersWired = false;

function wireEntityListHandlers() {
  if (_handlersWired) return;
  _handlersWired = true;

  const authorsList = _deps.getElementByIdSafe('authorsList');
  if (authorsList) {
    authorsList.addEventListener('click', (e) => {
      const filterLink = e.target.closest('.card-filter-author');
      if (filterLink) {
        e.preventDefault();
        e.stopPropagation();
        const name = filterLink.dataset.name;
        if (name) window.filterByAuthor?.(name);
        return;
      }
      const card = e.target.closest('.author-card[data-id]');
      if (!card) return;
      window.openAuthorModal?.(
        Number(card.dataset.id),
        card.dataset.name || '',
        Number(card.dataset.count) || 0,
      );
    });
  }

  const sourcesList = _deps.getElementByIdSafe('sourcesList');
  if (sourcesList) {
    sourcesList.addEventListener('click', (e) => {
      const authorLink = e.target.closest('.card-filter-author');
      if (authorLink) {
        e.preventDefault();
        e.stopPropagation();
        const name = authorLink.dataset.name;
        if (name) window.filterByAuthor?.(name);
        return;
      }
      const filterLink = e.target.closest('.card-filter-source');
      if (filterLink) {
        e.preventDefault();
        e.stopPropagation();
        const name = filterLink.dataset.name;
        if (name) window.filterBySource?.(name);
        return;
      }
      const card = e.target.closest('.source-card[data-id]');
      if (!card) return;
      window.openSourceModal?.(
        Number(card.dataset.id),
        card.dataset.name || '',
        card.dataset.type || 'BOOK',
        Number(card.dataset.count) || 0,
      );
    });
  }
}

export function initEntityListPage(deps) {
  _deps = { ..._deps, ...deps };
  wireEntityListHandlers();
}

// ── Authors ────────────────────────────────────────────────────────────────

export async function loadAuthors() {
  try {
    const response = await fetch(`${_deps.getApiUrl()}/authors`);
    let authors = await response.json();

    const totalCount = authors.length;

    const searchTerm = document
      .getElementById('searchAuthorName')
      ?.value.toLowerCase()
      .trim();
    if (searchTerm) {
      authors = authors.filter((a) => a.name.toLowerCase().includes(searchTerm));
    }

    const filteredCount = authors.length;

    const sortBy = window.authorSortBy || 'name';
    if (sortBy === 'name') {
      authors.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'count') {
      authors.sort(
        (a, b) => (parseInt(b.quote_count) || 0) - (parseInt(a.quote_count) || 0)
      );
    }

    displayAuthors(authors);

    const totalEl    = _deps.getElementByIdSafe('totalAuthorsCount');
    const filteredEl = _deps.getElementByIdSafe('filteredAuthorsCount');
    if (totalEl)    totalEl.textContent    = totalCount;
    if (filteredEl) filteredEl.textContent = filteredCount;
  } catch (error) {
    console.error('Error loading authors:', error);
    _deps.showFetchError(error.message || 'Failed to load authors');
    const el = _deps.getElementByIdSafe('authorsList');
    if (el) el.innerHTML = '<div class="no-items">Failed to load authors.</div>';
  }
}

export function displayAuthors(authors) {
  const authorsList = _deps.getElementByIdSafe('authorsList');
  if (!authorsList) {
    console.error('authorsList element not found!');
    return;
  }

  if (authors.length === 0) {
    authorsList.innerHTML = '<div class="no-items">No authors found.</div>';
    return;
  }

  const { escapeHtml } = _deps;
  authorsList.innerHTML = authors
    .map((author) => {
      const n = parseInt(author.quote_count, 10) || 0;
      const name = escapeHtml(author.name);
      return `
        <div class="card author-card" data-id="${author.id}" data-name="${name}" data-count="${n}">
            <div class="card-image">
                ${author.image ? `<img src="${author.image}" alt="${name}">` : '✍️'}
            </div>
            <div class="card-name">
                <a href="#" class="card-name-action card-filter-author" data-name="${name}">
                    ${name}
                </a>
            </div>
            <div class="card-quote-count">${n} quotes</div>
        </div>
    `;
    })
    .join('');
}

// ── Sources ────────────────────────────────────────────────────────────────

export async function loadSources() {
  try {
    const filterBook   = _deps.getElementByIdSafe('filterBook')?.checked   !== false;
    const filterMovie  = _deps.getElementByIdSafe('filterMovie')?.checked  !== false;
    const filterPoetry = _deps.getElementByIdSafe('filterPoetry')?.checked !== false;
    const filterLyrics = _deps.getElementByIdSafe('filterLyrics')?.checked !== false;
    const filterJokes  = _deps.getElementByIdSafe('filterJokes')?.checked  !== false;

    const response = await fetch(`${_deps.getApiUrl()}/sources`);
    let sources = await response.json();

    const totalCount = sources.length;

    if (_deps.getElementByIdSafe('filterBook')) {
      // Only apply the type filter when the user has explicitly unchecked
      // at least one of the boxes — otherwise leave the full list visible.
      if (!filterBook || !filterMovie || !filterPoetry || !filterLyrics || !filterJokes) {
        sources = sources.filter((source) => {
          if (!source.type) return filterBook;     // legacy: default to BOOK
          if (source.type === 'BOOK')     return filterBook;
          if (source.type === 'MOVIE-TV') return filterMovie;
          if (source.type === 'POETRY')   return filterPoetry;
          if (source.type === 'LYRICS')   return filterLyrics;
          if (source.type === 'JOKES')    return filterJokes;
          if (source.type === 'ASSORTED') return true;
          return false;
        });
      }
    }

    const searchTerm = document
      .getElementById('searchSourceName')
      ?.value.toLowerCase()
      .trim();
    if (searchTerm) {
      sources = sources.filter((s) => s.name.toLowerCase().includes(searchTerm));
    }

    const filteredCount = sources.length;

    const sortBy = window.sourceSortBy || 'name';
    if (sortBy === 'name') {
      sources.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'count') {
      sources.sort(
        (a, b) => (parseInt(b.quote_count) || 0) - (parseInt(a.quote_count) || 0)
      );
    }

    displaySources(sources);

    const totalEl    = _deps.getElementByIdSafe('totalSourcesCount');
    const filteredEl = _deps.getElementByIdSafe('filteredSourcesCount');
    if (totalEl)    totalEl.textContent    = totalCount;
    if (filteredEl) filteredEl.textContent = filteredCount;
  } catch (error) {
    console.error('Error loading sources:', error);
    _deps.showFetchError(error.message || 'Failed to load sources');
    const el = _deps.getElementByIdSafe('sourcesList');
    if (el) el.innerHTML = '<div class="no-items">Failed to load sources.</div>';
  }
}

export function displaySources(sources) {
  const sourcesList = _deps.getElementByIdSafe('sourcesList');
  if (!sourcesList) {
    console.error('sourcesList element not found!');
    return;
  }

  if (sources.length === 0) {
    sourcesList.innerHTML = '<div class="no-items">No sources found.</div>';
    return;
  }

  const { escapeHtml } = _deps;
  sourcesList.innerHTML = sources
    .map((source) => {
      const typeIcon =
        source.type === 'MOVIE-TV' ? '🎬' :
        source.type === 'ASSORTED' ? '📝' :
        source.type === 'POETRY'   ? '📜' :
        source.type === 'LYRICS'   ? '🎵' :
        source.type === 'JOKES'    ? '😂' :
        '📖';
      const n = parseInt(source.quote_count, 10) || 0;
      const name = escapeHtml(source.name);
      const type = escapeHtml(source.type || 'BOOK');
      const authorName = source.primary_author_name
        ? escapeHtml(source.primary_author_name)
        : '';
      return `
        <div class="card source-card" data-id="${source.id}" data-name="${name}" data-type="${type}" data-count="${n}">
            <div class="card-image">
                ${source.image ? `<img src="${source.image}" alt="${name}">` : typeIcon}
            </div>
            <div class="card-name">
                <a href="#" class="card-name-action card-filter-source" data-name="${name}">
                    ${name}
                </a>
            </div>
            <div class="card-quote-count">${n} quotes</div>
            ${
              authorName
                ? `
                <div class="card-author">
                    <a href="#" class="card-filter-author" data-name="${authorName}">
                        by ${authorName}
                    </a>
                </div>
            `
                : ''
            }
        </div>
    `;
    })
    .join('');
}
