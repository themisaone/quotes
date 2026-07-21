const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  generatePdfHtml,
  groupQuotesByAuthor,
  prepareQuotesForPdf,
  registerPdfExportRoutes,
} = require("../src/routes/pdfExport");

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.jsonBody = undefined;
    this.body = undefined;
    this.encoding = undefined;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(body) {
    this.jsonBody = body;
    return this;
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  end(body, encoding) {
    this.body = body;
    this.encoding = encoding;
    return this;
  }
}

function makeApp() {
  const routes = [];
  return {
    routes,
    app: {
      post(routePath, handler) {
        routes.push({ method: "POST", routePath, handler });
      },
    },
  };
}

function routeFor(routes, routePath) {
  const route = routes.find((candidate) => candidate.routePath === routePath);
  assert.ok(route, `route not registered: ${routePath}`);
  return route;
}

async function invoke(routes, body) {
  const res = new MockResponse();
  await routeFor(routes, "/api/export/pdf").handler({ body }, res);
  return res;
}

function makeSettingsFile(t, settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-pdf-export-"));
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify(settings), "utf8");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return settingsFile;
}

function registerTestRoutes(t, overrides = {}) {
  const settingsFile = makeSettingsFile(t, {
    noteTypes: [
      { value: "quote", label: "Quotes" },
      { value: "training", label: "Training" },
      { value: "historical", label: "Historical" },
    ],
    trainingTypes: [
      { value: "STRENGTH", label: "Strength", icon: "S" },
    ],
  });
  const { app, routes } = makeApp();
  registerPdfExportRoutes(app, {
    fileStorage: {
      retrieveFromStorage() {
        return null;
      },
    },
    getSettingsFile: () => settingsFile,
    logger: { warn() {}, error() {} },
    ...overrides,
  });
  return routes;
}

test("registerPdfExportRoutes registers the PDF export endpoint", (t) => {
  const routes = registerTestRoutes(t, {
    loadPuppeteer() {
      throw new Error("should not load");
    },
  });

  assert.deepEqual(routes.map((route) => `${route.method} ${route.routePath}`), [
    "POST /api/export/pdf",
  ]);
});

test("POST /api/export/pdf rejects empty payloads before loading Puppeteer", async (t) => {
  let loadedPuppeteer = false;
  const routes = registerTestRoutes(t, {
    loadPuppeteer() {
      loadedPuppeteer = true;
      throw new Error("should not load");
    },
  });

  const res = await invoke(routes, { quotes: [] });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, { error: "No quotes provided" });
  assert.equal(loadedPuppeteer, false);
});

test("POST /api/export/pdf renders HTML and streams a PDF buffer", async (t) => {
  const pdfBuffer = Buffer.from("%PDF-fake");
  let launchOptions = null;
  let capturedHtml = "";
  let capturedSetOptions = null;
  let capturedPdfOptions = null;
  let closed = false;
  const routes = registerTestRoutes(t, {
    loadPuppeteer() {
      return {
        async launch(options) {
          launchOptions = options;
          return {
            async newPage() {
              return {
                async setContent(html, options) {
                  capturedHtml = html;
                  capturedSetOptions = options;
                },
                async pdf(options) {
                  capturedPdfOptions = options;
                  return pdfBuffer;
                },
              };
            },
            async close() {
              closed = true;
            },
          };
        },
      };
    },
  });

  const res = await invoke(routes, {
    pdfColumns: 2,
    filters: { noteTypeValue: "training", quote: "squat & press" },
    quotes: [{
      note_type: "training",
      note_title: "Leg <Day>",
      note_text: "<p>Squat</p>",
      note_date: "2026-02-03",
      source_type: "STRENGTH",
      tags: "legs & strength",
    }],
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/pdf");
  assert.equal(res.headers["Content-Disposition"], "attachment; filename=quotes.pdf");
  assert.equal(res.headers["Content-Length"], pdfBuffer.length);
  assert.equal(res.body, pdfBuffer);
  assert.equal(res.encoding, "binary");
  assert.equal(closed, true);
  assert.equal(launchOptions.headless, "new");
  assert.deepEqual(launchOptions.args, ["--no-sandbox", "--disable-setuid-sandbox"]);
  assert.deepEqual(capturedSetOptions, { waitUntil: "networkidle0" });
  assert.equal(capturedPdfOptions.margin.right, "7mm");
  assert.equal(capturedPdfOptions.printBackground, true);
  assert.match(capturedHtml, /pdf-cols-2/);
  assert.match(capturedHtml, /Training/);
  assert.match(capturedHtml, /Text:<\/strong> squat &amp; press/);
  assert.match(capturedHtml, /Leg &lt;Day&gt;/);
  assert.match(capturedHtml, /<p>Squat<\/p>/);
  assert.match(capturedHtml, /S Strength/);
});

test("generatePdfHtml uses grouped quote layout and flat mixed-note layout", () => {
  const quoteOnly = [{
    note_type: "quote",
    author_name: "Ada",
    source_name: "Notebook",
    source_type: "BOOK",
    note_title: "A quote",
    note_text: "<p>Quote</p>",
  }];
  const deps = {
    noteTypesConfig: [
      { value: "quote", label: "Quotes" },
      { value: "historical", label: "Historical" },
    ],
    trainingTypesConfig: [],
  };

  const groupedHtml = generatePdfHtml(
    groupQuotesByAuthor(quoteOnly),
    { noteTypeValue: "quote" },
    quoteOnly,
    1,
    deps,
  );

  assert.match(groupedHtml, /<div class="author-section">/);
  assert.match(groupedHtml, /<div class="source-section">/);
  assert.match(groupedHtml, /Ada/);

  const mixed = [
    quoteOnly[0],
    {
      note_type: "historical",
      note_title: "Timeline",
      note_text: "<p>History</p>",
    },
  ];
  const mixedHtml = generatePdfHtml(groupQuotesByAuthor(mixed), {}, mixed, 1, deps);

  assert.doesNotMatch(mixedHtml, /<div class="author-section">/);
  assert.match(mixedHtml, /Mixed notes/);
  assert.match(mixedHtml, /Timeline/);
});

test("prepareQuotesForPdf embeds vault-backed author and source images", async () => {
  const calls = [];
  const quotes = [{
    note_type: "quote",
    author_image: "file:authors/1.jpg:image/jpeg",
    source_image: "file:sources/2.jpg:image/jpeg",
  }];
  const images = {
    "file:authors/1.jpg:image/jpeg": "data:image/jpeg;base64,author",
    "file:sources/2.jpg:image/jpeg": "data:image/jpeg;base64,source",
  };

  await prepareQuotesForPdf(quotes, {
    fileStorage: {
      retrieveFromStorage(value) {
        calls.push(value);
        return images[value] || null;
      },
    },
  });

  assert.equal(quotes[0].author_image, images["file:authors/1.jpg:image/jpeg"]);
  assert.equal(quotes[0].source_image, images["file:sources/2.jpg:image/jpeg"]);
  assert.deepEqual(calls, [
    "file:authors/1.jpg:image/jpeg",
    "file:sources/2.jpg:image/jpeg",
  ]);
});

test("POST /api/export/pdf closes the browser when PDF rendering fails", async (t) => {
  let closed = false;
  const routes = registerTestRoutes(t, {
    loadPuppeteer() {
      return {
        async launch() {
          return {
            async newPage() {
              return {
                async setContent() {},
                async pdf() {
                  throw new Error("pdf exploded");
                },
              };
            },
            async close() {
              closed = true;
            },
          };
        },
      };
    },
  });

  const res = await invoke(routes, {
    quotes: [{ note_type: "quote", note_title: "T", note_text: "<p>x</p>" }],
  });

  assert.equal(closed, true);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.jsonBody, {
    error: "Failed to generate PDF",
    details: "pdf exploded",
  });
});
