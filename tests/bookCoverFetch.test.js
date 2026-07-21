const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildSearchUrl,
  buildNorliSearchTerm,
  pickBestDoc,
  pickBestNorliProduct,
  searchOpenLibraryCover,
  searchNorliCover,
} = require("../src/bookCoverFetch");

test("buildSearchUrl includes title and author", () => {
  const url = buildSearchUrl({ title: "1Q84", author: "Murakami" });
  assert.match(url, /title=1Q84/);
  assert.match(url, /author=Murakami/);
});

test("pickBestDoc prefers author and title matches with cover", () => {
  const docs = [
    { title: "Other Book", author_name: ["Someone Else"], cover_i: 1 },
    { title: "1Q84", author_name: ["Haruki Murakami"], cover_i: 2 },
  ];

  const picked = pickBestDoc(docs, { title: "1Q84", author: "Murakami" });
  assert.equal(picked.cover_i, 2);
});

test("searchOpenLibraryCover returns cover metadata", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        docs: [
          {
            title: "1Q84",
            author_name: ["Haruki Murakami"],
            cover_i: 11153243,
          },
        ],
      };
    },
  });

  const match = await searchOpenLibraryCover({
    title: "1Q84",
    author: "Murakami",
    fetchImpl,
  });

  assert.deepEqual(match, {
    source: "openlibrary",
    coverId: 11153243,
    title: "1Q84",
    authors: ["Haruki Murakami"],
    coverUrl: "https://covers.openlibrary.org/b/id/11153243-L.jpg",
  });
});

test("buildNorliSearchTerm joins title and author", () => {
  assert.equal(
    buildNorliSearchTerm({ title: "Sløve hester", author: "Mick Herron" }),
    "Sløve hester Mick Herron"
  );
});

test("pickBestNorliProduct prefers author and title matches", () => {
  const items = [
    {
      name: "Other Book",
      sku: "1",
      authors: [{ name: "Someone Else" }],
      image: { url: "https://example.test/other.jpg" },
    },
    {
      name: "Sløve hester",
      sku: "2",
      authors: [{ name: "Mick Herron" }],
      image: { url: "https://example.test/slow-horses.jpg" },
    },
  ];

  const picked = pickBestNorliProduct(items, {
    title: "Sløve hester",
    author: "Mick Herron",
  });
  assert.equal(picked.sku, "2");
});

test("searchNorliCover returns Norli product metadata", async () => {
  const fetchImpl = async (url, options = {}) => {
    assert.equal(url, "https://checkout.norli.no/graphql");
    assert.equal(options.method, "POST");
    return {
      ok: true,
      async json() {
        return {
          data: {
            products: {
              items: [
                {
                  name: "Skyggerom",
                  sku: "9788200000000",
                  authors: [{ name: "Jan Erik Fjell" }],
                  image: { url: "https://www.norli.no/cdn/skyggerom.jpg" },
                },
              ],
            },
          },
        };
      },
    };
  };

  const match = await searchNorliCover({
    title: "Skyggerom",
    author: "Jan Erik Fjell",
    fetchImpl,
  });

  assert.deepEqual(match, {
    source: "norli",
    sku: "9788200000000",
    title: "Skyggerom",
    authors: ["Jan Erik Fjell"],
    coverUrl: "https://www.norli.no/cdn/skyggerom.jpg",
  });
});

test("searchOpenLibraryCover returns null when no cover exists", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { docs: [{ title: "Untitled", author_name: ["Nobody"] }] };
    },
  });

  const match = await searchOpenLibraryCover({
    title: "Missing",
    author: "Nobody",
    fetchImpl,
  });
  assert.equal(match, null);
});
