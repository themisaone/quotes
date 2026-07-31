const NON_SEARCH_PARAM_NAMES = new Set([
  'note_type',
  'limit',
  'offset',
  'hideEncryptedNotes',
  'hideTag'
]);

/**
 * Whether the effective request contains a user-populated search/filter field.
 * Note-type scope, pagination, and global visibility settings are not searches.
 */
export function hasActiveSearchParams(params) {
  return Array.from(params.keys()).some(name => !NON_SEARCH_PARAM_NAMES.has(name));
}

export function updateResultsSummary(params) {
  const searchActive = hasActiveSearchParams(params);
  document.querySelectorAll('.results-search-only').forEach(element => {
    element.classList.toggle('results-search-only-hidden', !searchActive);
  });

  const onPageLabel = document.getElementById('onPageCountLabel');
  if (onPageLabel) {
    onPageLabel.textContent = '⏳ Displayed';
  }
}
