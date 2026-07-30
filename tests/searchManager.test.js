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

test("a field clear button clears only its target and reruns search", async (t) => {
  const originalDocument = global.document;
  const inputHandlers = {};
  const buttonHandlers = {};
  let focused = false;
  let loads = 0;
  let currentPage = null;
  let clearButtonVisible = false;

  const input = {
    value: "needle",
    addEventListener(type, handler) {
      if (!inputHandlers[type]) inputHandlers[type] = [];
      inputHandlers[type].push(handler);
    },
    dispatchEvent(event) {
      inputHandlers[event.type]?.forEach(handler => handler(event));
    },
    focus() {
      focused = true;
    },
  };
  const button = {
    dataset: { clearTarget: "searchQuote" },
    classList: {
      toggle(className, enabled) {
        if (className === "is-visible") clearButtonVisible = enabled;
      },
    },
    addEventListener(type, handler) {
      buttonHandlers[type] = handler;
    },
  };

  global.document = {
    getElementById(id) {
      return id === "searchQuote" ? input : null;
    },
    querySelectorAll(selector) {
      return selector === ".search-field-clear[data-clear-target]" ? [button] : [];
    },
  };
  t.after(() => {
    global.document = originalDocument;
  });

  const { initializeSearchHandlers } = await import("../public/js/lib/searchManager.js");
  initializeSearchHandlers({
    loadQuotes() {
      loads += 1;
    },
    setCurrentPage(page) {
      currentPage = page;
    },
  });

  assert.equal(clearButtonVisible, true);
  buttonHandlers.click();
  await new Promise(resolve => setTimeout(resolve, 350));

  assert.equal(input.value, "");
  assert.equal(clearButtonVisible, false);
  assert.equal(focused, true);
  assert.equal(currentPage, 1);
  assert.equal(loads, 1);
});
