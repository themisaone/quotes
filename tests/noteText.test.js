const assert = require("node:assert/strict");
const test = require("node:test");

const { sanitizeNoteText } = require("../src/noteText");

test("sanitizeNoteText normalizes missing and empty rich-text values", () => {
  assert.equal(sanitizeNoteText(), "");
  assert.equal(sanitizeNoteText(null), "");
  assert.equal(sanitizeNoteText("<p><br></p>"), "");
  assert.equal(sanitizeNoteText("<p>&nbsp;</p>"), "");
});

test("sanitizeNoteText strips Evernote media tags", () => {
  assert.equal(
    sanitizeNoteText("<p>Before</p><en-media hash=\"abc\"/><p>After</p>"),
    "<p>Before</p><p>After</p>"
  );
});

test("sanitizeNoteText preserves real note content", () => {
  assert.equal(sanitizeNoteText("<p>Actual note</p>"), "<p>Actual note</p>");
});
