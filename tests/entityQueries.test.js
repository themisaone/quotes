const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAuthorMergeResponse,
  buildAuthorUpdateQuery,
  buildAuthorUpdateResponse,
  buildAuthorsListQuery,
  buildEntityDeleteSuccessMessage,
  buildSourceMergeResponse,
  buildSourceUpdateQuery,
  buildSourceUpdateResponse,
  buildSourcesListQuery,
} = require("../src/entityQueries");

function compactSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

test("buildAuthorsListQuery builds unfiltered and search queries", () => {
  const unfiltered = buildAuthorsListQuery();
  assert.equal(unfiltered.params.length, 0);
  assert.match(compactSql(unfiltered.query), /^SELECT a\.\*, COUNT\(q\.id\) as quote_count/);
  assert.match(compactSql(unfiltered.query), /GROUP BY a\.id ORDER BY a\.name ASC$/);

  const filtered = buildAuthorsListQuery({ search: "Ada" });
  assert.deepEqual(filtered.params, ["%Ada%"]);
  assert.match(compactSql(filtered.query), /WHERE a\.name ILIKE \$1 GROUP BY a\.id/);
});

test("buildSourcesListQuery keeps parameter order for search and type filters", () => {
  const filtered = buildSourcesListQuery({ search: "Book", type: "BOOK" });

  assert.deepEqual(filtered.params, ["%Book%", "BOOK"]);
  assert.match(compactSql(filtered.query), /AND s\.name ILIKE \$1 AND s\.type = \$2/);
  assert.match(compactSql(filtered.query), /GROUP BY s\.id ORDER BY s\.name ASC$/);
});

test("buildSourcesListQuery uses $1 for type when search is absent", () => {
  const filtered = buildSourcesListQuery({ type: "MOVIE" });

  assert.deepEqual(filtered.params, ["MOVIE"]);
  assert.doesNotMatch(compactSql(filtered.query), /s\.name ILIKE/);
  assert.match(compactSql(filtered.query), /AND s\.type = \$1/);
});

test("buildAuthorUpdateQuery trims fields and preserves explicit image clears", () => {
  const built = buildAuthorUpdateQuery({
    id: 12,
    name: " Ursula ",
    description: " Writer ",
    image: null,
  });

  assert.deepEqual(built.updateFields, ["name = $1", "description = $2", "image = $3"]);
  assert.deepEqual(built.params, ["Ursula", "Writer", null, 12]);
  assert.match(compactSql(built.query), /SET name = \$1, description = \$2, image = \$3 WHERE id = \$4 RETURNING \*/);
});

test("buildSourceUpdateQuery preserves parameter order for name, image, and type", () => {
  const built = buildSourceUpdateQuery({
    id: 22,
    name: " Dune ",
    image: "data:image/png;base64,abc",
    type: "BOOK",
  });

  assert.deepEqual(built.updateFields, ["name = $1", "image = $2", "type = $3"]);
  assert.deepEqual(built.params, ["Dune", "data:image/png;base64,abc", "BOOK", 22]);
  assert.match(compactSql(built.query), /SET name = \$1, image = \$2, type = \$3 WHERE id = \$4 RETURNING \*/);
});

test("entity merge responses keep stable payload shapes", () => {
  assert.deepEqual(
    buildAuthorMergeResponse({
      oldName: "Old",
      targetAuthor: { id: 7, name: "Existing" },
    }),
    {
      merged: true,
      oldName: "Old",
      newName: "Existing",
      targetAuthorId: 7,
      message: 'Author "Old" merged into existing author "Existing"',
    }
  );

  assert.deepEqual(
    buildSourceMergeResponse({
      oldName: "Old",
      targetSource: { id: 9, name: "Existing" },
    }),
    {
      merged: true,
      oldName: "Old",
      newName: "Existing",
      targetSourceId: 9,
      message: 'Source "Old" merged into existing source "Existing"',
    }
  );
});

test("entity update and delete responses keep stable payload shapes", () => {
  const author = { id: 1, name: "New Author" };
  const source = { id: 2, name: "New Source" };

  assert.deepEqual(buildAuthorUpdateResponse({ oldName: "Old", author, requestedName: "New" }), {
    merged: false,
    oldName: "Old",
    newName: "New Author",
    author,
    message: 'Author renamed from "Old" to "New Author"',
  });
  assert.deepEqual(buildAuthorUpdateResponse({ oldName: "Old", author }), {
    merged: false,
    oldName: "Old",
    newName: "New Author",
    author,
    message: "Author updated",
  });
  assert.deepEqual(buildSourceUpdateResponse({ oldName: "Old", source, requestedName: "New" }), {
    merged: false,
    oldName: "Old",
    newName: "New Source",
    source,
    message: 'Source renamed from "Old" to "New Source"',
  });
  assert.deepEqual(buildEntityDeleteSuccessMessage("author"), {
    message: "Author deleted successfully",
  });
  assert.deepEqual(buildEntityDeleteSuccessMessage("source"), {
    message: "Source deleted successfully",
  });
});
