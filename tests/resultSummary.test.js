const assert = require('node:assert/strict');
const test = require('node:test');

test('search summary ignores note scope, pagination, and global visibility settings', async () => {
  const { hasActiveSearchParams } = await import('../public/js/lib/resultSummary.js');

  const params = new URLSearchParams({
    note_type: 'note',
    limit: '20',
    offset: '0',
    hideEncryptedNotes: 'true',
    hideTag: 'private'
  });

  assert.equal(hasActiveSearchParams(params), false);
  params.set('any', 'needle');
  assert.equal(hasActiveSearchParams(params), true);
});

test('result summary leaves On page visible and toggles search-only content', async (t) => {
  const originalDocument = global.document;
  const searchOnlyElements = Array.from({ length: 2 }, () => ({
    hidden: false,
    classList: {
      toggle(className, enabled) {
        if (className === 'results-search-only-hidden') this.owner.hidden = enabled;
      },
      owner: null
    }
  }));
  searchOnlyElements.forEach(element => {
    element.classList.owner = element;
  });
  const onPageLabel = { textContent: '' };

  global.document = {
    querySelectorAll(selector) {
      assert.equal(selector, '.results-search-only');
      return searchOnlyElements;
    },
    getElementById(id) {
      return id === 'onPageCountLabel' ? onPageLabel : null;
    }
  };
  t.after(() => {
    global.document = originalDocument;
  });

  const { updateResultsSummary } = await import('../public/js/lib/resultSummary.js');

  updateResultsSummary(new URLSearchParams({ note_type: 'note', limit: '20' }));
  assert.equal(onPageLabel.textContent, '⏳ Displayed');
  assert.equal(searchOnlyElements.every(element => element.hidden), true);

  updateResultsSummary(new URLSearchParams({ note_type: 'note', tags: 'work' }));
  assert.equal(onPageLabel.textContent, '⏳ Displayed');
  assert.equal(searchOnlyElements.every(element => !element.hidden), true);
});
