const DEFAULT_MAX_DIMENSION = 300;
const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_COVER = "https://covers.openlibrary.org/b/id";
const NORLI_GRAPHQL = "https://checkout.norli.no/graphql";
const NORLI_PRODUCTS_QUERY = `
  query NorliBookSearch($search: String!, $pageSize: Int!) {
    products(search: $search, pageSize: $pageSize) {
      items {
        name
        sku
        authors { name }
        image { url label }
      }
    }
  }
`;

function loadSharp() {
  return require("sharp");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildSearchUrl({ title, author }) {
  const params = new URLSearchParams({ limit: "5" });
  if (title?.trim()) params.set("title", title.trim());
  if (author?.trim()) params.set("author", author.trim());
  return `${OPEN_LIBRARY_SEARCH}?${params.toString()}`;
}

function buildNorliSearchTerm({ title, author }) {
  return [title, author].filter((part) => part?.trim()).join(" ").trim();
}

function scoreTitleAuthorMatch({ title, author, docTitle, docAuthors }) {
  let titleScore = 0;
  let authorScore = 0;
  const titleNeedle = normalizeText(title);
  const authorNeedle = normalizeText(author);
  const normalizedTitle = normalizeText(docTitle);
  const normalizedAuthors = (docAuthors || []).map((name) => normalizeText(name));

  if (titleNeedle && normalizedTitle.includes(titleNeedle)) titleScore += 3;
  if (titleNeedle && titleNeedle.includes(normalizedTitle) && normalizedTitle) titleScore += 2;
  if (authorNeedle && normalizedAuthors.some((name) => name.includes(authorNeedle))) {
    authorScore += 4;
  }
  if (authorNeedle && normalizedAuthors.some((name) => authorNeedle.includes(name))) {
    authorScore += 2;
  }

  return {
    total: titleScore + authorScore,
    titleScore,
    authorScore,
  };
}

function pickBestDoc(docs, { title, author }) {
  if (!Array.isArray(docs) || docs.length === 0) return null;

  const scored = docs
    .filter((doc) => doc.cover_i)
    .map((doc) => {
      const scores = scoreTitleAuthorMatch({
        title,
        author,
        docTitle: doc.title,
        docAuthors: doc.author_name || [],
      });
      return { doc, ...scores, score: scores.total + 1 };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.doc || docs.find((doc) => doc.cover_i) || null;
}

function pickBestNorliProduct(items, { title, author }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const titleNeedle = normalizeText(title);
  const scored = items
    .filter((item) => item?.image?.url)
    .map((item) => {
      const scores = scoreTitleAuthorMatch({
        title,
        author,
        docTitle: item.name,
        docAuthors: (item.authors || []).map((entry) => entry?.name).filter(Boolean),
      });
      return { item, ...scores, score: scores.total };
    })
    .filter((entry) => !titleNeedle || entry.titleScore >= 2)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.item || null;
}

async function searchOpenLibraryCover({ title, author, fetchImpl = fetch }) {
  if (!title?.trim()) {
    throw new Error("Book title is required");
  }

  const response = await fetchImpl(buildSearchUrl({ title, author }));
  if (!response.ok) {
    throw new Error(`Open Library search failed (${response.status})`);
  }

  const payload = await response.json();
  const doc = pickBestDoc(payload.docs, { title, author });
  if (!doc?.cover_i) {
    return null;
  }

  return {
    source: "openlibrary",
    coverId: doc.cover_i,
    title: doc.title || title,
    authors: doc.author_name || [],
    coverUrl: `${OPEN_LIBRARY_COVER}/${doc.cover_i}-L.jpg`,
  };
}

async function searchNorliCover({ title, author, fetchImpl = fetch }) {
  const search = buildNorliSearchTerm({ title, author });
  if (!search) {
    throw new Error("Book title is required");
  }

  const response = await fetchImpl(NORLI_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: NORLI_PRODUCTS_QUERY,
      variables: { search, pageSize: 8 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Norli search failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Norli search failed (${payload.errors[0].message || "GraphQL error"})`);
  }

  const items = payload.data?.products?.items || [];
  const product = pickBestNorliProduct(items, { title, author });
  if (!product?.image?.url) {
    return null;
  }

  return {
    source: "norli",
    sku: product.sku || null,
    title: product.name || title,
    authors: (product.authors || []).map((entry) => entry?.name).filter(Boolean),
    coverUrl: product.image.url,
  };
}

async function downloadCoverBuffer(coverUrl, fetchImpl = fetch) {
  const response = await fetchImpl(coverUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Cover download failed (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Cover download returned an empty file");
  }
  return buffer;
}

async function bufferToSourceImageDataUrl(buffer, maxDimension = DEFAULT_MAX_DIMENSION) {
  const sharp = loadSharp();
  const resized = await sharp(buffer)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

async function fetchBookCoverDataUrl(
  { title, author, maxDimension = DEFAULT_MAX_DIMENSION },
  { fetchImpl = fetch } = {}
) {
  let match = await searchOpenLibraryCover({ title, author, fetchImpl });
  if (!match) {
    match = await searchNorliCover({ title, author, fetchImpl });
  }
  if (!match) {
    return null;
  }

  const buffer = await downloadCoverBuffer(match.coverUrl, fetchImpl);
  const dataUrl = await bufferToSourceImageDataUrl(buffer, maxDimension);

  return {
    dataUrl,
    match,
  };
}

module.exports = {
  DEFAULT_MAX_DIMENSION,
  NORLI_GRAPHQL,
  buildSearchUrl,
  buildNorliSearchTerm,
  pickBestDoc,
  pickBestNorliProduct,
  searchOpenLibraryCover,
  searchNorliCover,
  fetchBookCoverDataUrl,
};
