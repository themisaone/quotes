const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeNoteFormat,
  renderMarkdown,
  renderNoteText,
} = require("../src/markdown");

test("normalizeNoteFormat only opts in to markdown explicitly", () => {
  assert.equal(normalizeNoteFormat("markdown"), "markdown");
  assert.equal(normalizeNoteFormat("MARKDOWN"), "markdown");
  assert.equal(normalizeNoteFormat("html"), "html");
  assert.equal(normalizeNoteFormat(null), "html");
  assert.equal(normalizeNoteFormat("other"), "html");
});

test("renderMarkdown renders common Markdown and escapes raw HTML", () => {
  const html = renderMarkdown("# Title\n\nHello **world** and <script>x</script>\n\n- one\n- two");

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /Hello <strong>world<\/strong> and &lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test("renderMarkdown preserves extra blank lines between blocks", () => {
  assert.equal(
    renderMarkdown("First\n\nSecond"),
    "<p>First</p><p>Second</p>"
  );
  assert.equal(
    renderMarkdown("First\n\n\nSecond"),
    "<p>First</p><p><br></p><p>Second</p>"
  );
});

test("renderMarkdown renders blockquotes and lists", () => {
  assert.equal(
    renderMarkdown("> quote this is the quote\n\nand this is not the quote\n\n- ne1\n- ne2"),
    "<blockquote><p>quote this is the quote</p></blockquote><p>and this is not the quote</p><ul><li>ne1</li><li>ne2</li></ul>"
  );
});

test("renderMarkdown renders local underline and highlight extensions", () => {
  assert.equal(
    renderMarkdown("**bold** *italic* ++under++ ~~gone~~ ==mark=="),
    "<p><strong>bold</strong> <em>italic</em> <u>under</u> <del>gone</del> <mark>mark</mark></p>"
  );
});

test("renderNoteText leaves legacy html unchanged and renders markdown rows", () => {
  assert.equal(
    renderNoteText({ note_text: "<p>Legacy</p>", note_format: "html" }),
    "<p>Legacy</p>"
  );
  assert.equal(
    renderNoteText({ note_text: "## Markdown", note_format: "markdown" }),
    "<h2>Markdown</h2>"
  );
});
