const assert = require("node:assert/strict");
const test = require("node:test");

test("filterBySource selects the quote note type before loading notes", async (t) => {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const sourceInput = { value: "", classList: { add() {}, remove() {} } };
  let handlersInitialized = false;

  global.window = {};
  global.document = {
    getElementById(id) {
      return handlersInitialized && id === "searchSource" ? sourceInput : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  t.after(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  const { filterBySource, initializeSearchHandlers } = await import("../public/js/lib/searchManager.js");
  const calls = [];
  initializeSearchHandlers({
    setCurrentPage(page) {
      calls.push(["page", page]);
    },
    setNoteTypeFilter(noteType) {
      calls.push(["noteType", noteType]);
    },
    switchView(view) {
      calls.push(["view", view, sourceInput.value]);
    },
  });
  handlersInitialized = true;

  filterBySource("The Source");

  assert.deepEqual(calls, [
    ["noteType", "quote"],
    ["page", 1],
    ["view", "quotes", "The Source"],
  ]);
});
