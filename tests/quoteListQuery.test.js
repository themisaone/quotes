const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseSearchQuery,
  buildTextSearchCondition,
  buildTagSearchCondition,
  buildAnySearchCondition,
  buildQuoteCountQuery,
  buildQuoteListQuery,
  buildBulkFilterQuery,
} = require("../src/quoteListQuery");

test("parseSearchQuery recognizes spaced boolean operators", () => {
  assert.deepEqual(parseSearchQuery("alpha && beta"), {
    operator: "AND",
    terms: ["alpha", "beta"],
  });
  assert.deepEqual(parseSearchQuery("alpha || beta"), {
    operator: "OR",
    terms: ["alpha", "beta"],
  });
  assert.deepEqual(parseSearchQuery("alpha|beta"), {
    operator: "SIMPLE",
    terms: ["alpha|beta"],
  });
});

test("buildTextSearchCondition creates multi-column OR groups per term", () => {
  const params = ["existing"];
  const result = buildTextSearchCondition(
    "alpha && beta",
    ["q.note_text", "q.note_title"],
    2,
    params
  );

  assert.equal(
    result.condition,
    " AND ((q.note_text ILIKE $2 OR q.note_title ILIKE $2) AND (q.note_text ILIKE $3 OR q.note_title ILIKE $3))"
  );
  assert.equal(result.newParamCounter, 4);
  assert.deepEqual(params, ["existing", "%alpha%", "%beta%"]);
});

test("buildTagSearchCondition handles simple include and exclude tags", () => {
  const params = [];
  const result = buildTagSearchCondition("history,!draft", 1, params);

  assert.match(result.condition, /AND EXISTS/);
  assert.match(result.condition, /AND NOT EXISTS/);
  assert.match(result.condition, /t\.name ILIKE \$1/);
  assert.match(result.condition, /t\.name ILIKE \$2/);
  assert.equal(result.newParamCounter, 3);
  assert.deepEqual(params, ["%history%", "%draft%"]);
});

test("buildAnySearchCondition can avoid joined author/source aliases", () => {
  const params = [];
  const result = buildAnySearchCondition("ada", 4, params, { useJoins: false });

  assert.match(result.condition, /EXISTS \(SELECT 1 FROM authors a WHERE a\.id = q\.author_id/);
  assert.match(result.condition, /EXISTS \(SELECT 1 FROM sources s WHERE s\.id = q\.source_id/);
  assert.equal(result.newParamCounter, 5);
  assert.deepEqual(params, ["%ada%"]);
});

test("buildQuoteCountQuery preserves count filter order and params", () => {
  const result = buildQuoteCountQuery(
    {
      quote: "alpha && beta",
      any: "global",
      author: "Ada",
      source: "Notebook",
      tags: "history,!draft",
      types: "BOOK,MOVIE-TV",
      training_types: "practice",
      generic_sub_types: "memo",
      year: "2026",
      month: "2",
      score: "3-5",
      hasAuthor: "false",
      hasImageType: "true",
      hasMultipleAttachments: "true",
      hideEncryptedNotes: "true",
      hideTag: "private",
      noteId: "17",
    },
    ["quote", "note"]
  );

  assert.match(result.query, /SELECT COUNT\(\*\) as count/);
  assert.doesNotMatch(result.query, /q\.note_type = ANY/);
  assert.match(result.query, /\(q\.note_text ILIKE \$1 OR q\.note_title ILIKE \$1 OR q\.comment ILIKE \$1\)/);
  assert.match(result.query, /q\.score >= \$13 AND q\.score <= \$14/);
  assert.match(result.query, /q\.attachment_type IS DISTINCT FROM 'encrypted'/);
  assert.match(result.query, /LOWER\(t\.name\) = LOWER\(\$15\)/);
  assert.match(result.query, /q\.id = \$16/);
  assert.deepEqual(result.params, [
    "%alpha%",
    "%beta%",
    "%global%",
    "%Ada%",
    "%Notebook%",
    "%history%",
    "%draft%",
    ["BOOK", "MOVIE-TV"],
    ["practice"],
    ["memo"],
    "2026",
    "February",
    "3",
    "5",
    "private",
    17,
  ]);
});

test("buildQuoteCountQuery includes list-only date and translation filters", () => {
  const result = buildQuoteCountQuery(
    {
      quote: "side note",
      date: "2026-06-24",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      translation_group: "group-a",
      noteId: "77",
    },
    ["quote", "note"]
  );

  assert.doesNotMatch(result.query, /q\.note_type = ANY/);
  assert.match(result.query, /\(q\.note_text ILIKE \$1 OR q\.note_title ILIKE \$1 OR q\.comment ILIKE \$1\)/);
  assert.match(result.query, /q\.note_date = \$2/);
  assert.match(result.query, /q\.note_date >= \$3/);
  assert.match(result.query, /q\.note_date <= \$4/);
  assert.match(result.query, /q\.translation_group = \$5/);
  assert.match(result.query, /q\.id = \$6/);
  assert.deepEqual(result.params, [
    "%side note%",
    "2026-06-24",
    "2026-06-01",
    "2026-06-30",
    "group-a",
    77,
  ]);
});

test("buildQuoteListQuery preserves list filter order, training sort, and pagination", () => {
  const result = buildQuoteListQuery(
    {
      quote: "focus || calm",
      any: "ritual",
      author: "Ada",
      source: "Notebook",
      tags: "history || archive",
      date: "2026-06-23",
      score: "5+",
      types: "BOOK",
      noteId: "9",
      hasText: "false",
      hideEncryptedNotes: "true",
      hideTag: "private",
      translation_group: "group-a",
      note_type: "training",
      training_types: "practice",
      generic_sub_types: "memo",
      year: "2026",
      month: "12",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      limit: "10",
      offset: "20",
    },
    ["quote", "training"]
  );

  assert.match(result.query, /WITH tagged_quotes AS/);
  assert.match(result.query, /SELECT tq\.\*/);
  assert.match(result.query, /q\.note_date = \$8/);
  assert.match(result.query, /q\.translation_group = \$13/);
  assert.match(result.query, /q\.note_type = \$14/);
  assert.match(result.query, /q\.note_date <= \$20/);
  assert.match(result.query, /LIMIT \$21 OFFSET \$22/);
  assert.deepEqual(result.params, [
    "%focus%",
    "%calm%",
    "%ritual%",
    "%Ada%",
    "%Notebook%",
    "%history%",
    "%archive%",
    "2026-06-23",
    "5",
    ["BOOK"],
    9,
    "private",
    "group-a",
    "training",
    ["practice"],
    ["memo"],
    "2026",
    "December",
    "2026-01-01",
    "2026-12-31",
    10,
    20,
  ]);
});

test("buildQuoteListQuery applies mode restriction and default updated sort when note type is absent", () => {
  const result = buildQuoteListQuery({}, ["quote", "note"]);

  assert.match(result.query, /q\.note_type = ANY\(\$1\)/);
  assert.match(result.query, /ORDER BY q\.updated_at DESC LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(result.params, [["quote", "note"], 20, 0]);
});

test("buildBulkFilterQuery defaults missing filters to the active mode types", () => {
  const result = buildBulkFilterQuery(undefined, ["quote", "training"]);

  assert.equal(result.query, "FROM notes q WHERE 1=1 AND q.note_type = ANY($1)");
  assert.deepEqual(result.params, [["quote", "training"]]);
});

test("buildBulkFilterQuery preserves bulk filter parameter order", () => {
  const result = buildBulkFilterQuery(
    {
      note_type: "quote",
      author_id: "7",
      source_id: "8",
      search: "text",
      any: "global",
      tag: "alpha,!beta",
      types: "BOOK,MOVIE-TV",
      training_types: "practice",
      year: "2026",
      month: "6",
      score: "3-5",
      hasAuthor: "true",
      hasSource: "false",
      hasNote: "true",
      hasTags: "false",
      hasImage: "true",
      hasImageType: "false",
      hasTitle: "true",
      hasText: "false",
      noteId: "42",
    },
    ["quote", "note"]
  );

  assert.match(result.query, /^FROM notes q WHERE 1=1 AND q\.note_type = \$1/);
  assert.match(result.query, /q\.author_id = \$2/);
  assert.match(result.query, /q\.source_id = \$3/);
  assert.match(result.query, /q\.note_text ILIKE \$4/);
  assert.match(result.query, /EXISTS \(SELECT 1 FROM authors a WHERE a\.id = q\.author_id/);
  assert.match(result.query, /t\.name ILIKE \$6/);
  assert.match(result.query, /t\.name ILIKE \$7/);
  assert.match(result.query, /q\.type = ANY\(\$8\)/);
  assert.match(result.query, /\(q\.note_type != 'training' OR q\.type = ANY\(\$9\)\)/);
  assert.match(result.query, /t\.name = \$10/);
  assert.match(result.query, /t\.name = \$11/);
  assert.match(result.query, /q\.score >= \$12 AND q\.score <= \$13/);
  assert.match(result.query, /q\.attachment_type IS NULL OR q\.attachment_type != 'image'/);
  assert.match(result.query, /q\.id = \$14/);
  assert.deepEqual(result.params, [
    "quote",
    7,
    8,
    "%text%",
    "%global%",
    "%alpha%",
    "%beta%",
    ["BOOK", "MOVIE-TV"],
    ["practice"],
    "2026",
    "June",
    "3",
    "5",
    42,
  ]);
});

test("buildBulkFilterQuery supports list-style aliases and hidden filters", () => {
  const result = buildBulkFilterQuery(
    {
      quote: "focus",
      author: "Ada",
      source: "Notebook",
      tags: "history",
      date: "2026-06-24",
      generic_sub_types: "memo,idea",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      hasTranslationGroup: "true",
      hasMultipleAttachments: "false",
      hideEncryptedNotes: "true",
      hideTag: "private",
      translation_group: "group-a",
      noteId: "77",
    },
    ["quote", "note"]
  );

  assert.doesNotMatch(result.query, /q\.note_type = ANY/);
  assert.match(result.query, /q\.note_text ILIKE \$1/);
  assert.match(result.query, /authors a WHERE a\.id = q\.author_id AND a\.name ILIKE \$2/);
  assert.match(result.query, /sources s WHERE s\.id = q\.source_id AND s\.name ILIKE \$3/);
  assert.match(result.query, /t\.name ILIKE \$4/);
  assert.match(result.query, /q\.note_date = \$5/);
  assert.match(result.query, /q\.type = ANY\(\$6\)/);
  assert.match(result.query, /q\.note_date >= \$7/);
  assert.match(result.query, /q\.note_date <= \$8/);
  assert.match(result.query, /q\.translation_group IS NOT NULL AND q\.translation_group != ''/);
  assert.match(result.query, /SELECT COUNT\(\*\) FROM note_attachments WHERE note_id = q\.id\) <= 1/);
  assert.match(result.query, /q\.attachment_type IS DISTINCT FROM 'encrypted'/);
  assert.match(result.query, /LOWER\(t\.name\) = LOWER\(\$9\)/);
  assert.match(result.query, /q\.translation_group = \$10/);
  assert.match(result.query, /q\.id = \$11/);
  assert.deepEqual(result.params, [
    "%focus%",
    "%Ada%",
    "%Notebook%",
    "%history%",
    "2026-06-24",
    ["memo", "idea"],
    "2026-06-01",
    "2026-06-30",
    "private",
    "group-a",
    77,
  ]);
});
