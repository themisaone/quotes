const assert = require("node:assert/strict");
const test = require("node:test");

test("author and source cards resolve vault file references to attachment URLs", async () => {
  global.document = {
    createElement() {
      return { textContent: "", innerHTML: "" };
    },
  };

  const authorsList = { innerHTML: "", addEventListener() {} };
  const sourcesList = { innerHTML: "", addEventListener() {} };
  const elements = { authorsList, sourcesList };
  const entityListPage = await import("../public/js/lib/entityListPage.js");

  entityListPage.initEntityListPage({
    escapeHtml: (value) => String(value),
    getElementByIdSafe: (id) => elements[id] || null,
  });

  entityListPage.displayAuthors([
    { id: 1, name: "Author", image: "file:authors/1.jpg:image/jpeg", quote_count: 2 },
  ]);
  entityListPage.displaySources([
    { id: 2, name: "Source", image: "file:sources/2.png:image/png", quote_count: 3 },
  ]);

  assert.match(authorsList.innerHTML, /src="\/attachments\/authors\/1\.jpg"/);
  assert.match(sourcesList.innerHTML, /src="\/attachments\/sources\/2\.png"/);
  assert.doesNotMatch(authorsList.innerHTML, /src="file:/);
  assert.doesNotMatch(sourcesList.innerHTML, /src="file:/);

  delete global.document;
});
