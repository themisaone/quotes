const fs = require("fs");

function defaultLoadPuppeteer() {
  return require("puppeteer");
}

function defaultLoadSharp() {
  return require("sharp");
}

function warn(logger, ...args) {
  if (logger && typeof logger.warn === "function") logger.warn(...args);
}

function error(logger, ...args) {
  if (logger && typeof logger.error === "function") logger.error(...args);
}

function readSettingsJson({ fsImpl = fs, getSettingsFile } = {}) {
  if (!getSettingsFile) return {};
  try {
    const file = getSettingsFile();
    if (!fsImpl.existsSync(file)) return {};
    return JSON.parse(fsImpl.readFileSync(file, "utf8"));
  } catch (_) {
    return {};
  }
}

function loadNoteTypesConfig(deps = {}) {
  if (Array.isArray(deps.noteTypesConfig)) return deps.noteTypesConfig;
  const settings = readSettingsJson(deps);
  return Array.isArray(settings.noteTypes) ? settings.noteTypes : [];
}

function loadTrainingTypesConfig(deps = {}) {
  if (Array.isArray(deps.trainingTypesConfig)) return deps.trainingTypesConfig;
  const settings = readSettingsJson(deps);
  return Array.isArray(settings.trainingTypes) ? settings.trainingTypes : [];
}

function getNoteTypeDisplayLabel(typeValue, deps = {}) {
  if (!typeValue) return "";
  const found = loadNoteTypesConfig(deps).find((type) => type.value === typeValue);
  return found ? found.label : typeValue;
}

function shouldUseGroupedPdfLayout(allQuotes, filterNoteType) {
  if (!allQuotes || allQuotes.length === 0) return false;
  if (filterNoteType === "quote") return true;
  // Mixed-type exports use flat layout so non-quotes are not lumped under Unknown Author.
  return allQuotes.every((quote) => quote && quote.note_type === "quote");
}

function getPdfExportLabels(allQuotes, filterNoteType, deps = {}) {
  const types = [...new Set((allQuotes || []).map((quote) => quote && quote.note_type).filter(Boolean))];
  if (types.length === 1) {
    const label = getNoteTypeDisplayLabel(types[0], deps);
    return { titleLabel: label, typeLine: label };
  }
  if (types.length > 1) {
    const labels = types.map((type) => getNoteTypeDisplayLabel(type, deps)).join(", ");
    return { titleLabel: "Mixed notes", typeLine: labels };
  }
  if (filterNoteType) {
    const label = getNoteTypeDisplayLabel(filterNoteType, deps) || filterNoteType;
    return { titleLabel: label, typeLine: label };
  }
  return { titleLabel: "Notes", typeLine: "All visible note types" };
}

function groupQuotesByAuthor(quotes) {
  const groupedByAuthor = {};

  (quotes || []).forEach((note) => {
    if (!note || note.note_type !== "quote") return;

    const authorKey = note.author_name || "Unknown Author";
    if (!groupedByAuthor[authorKey]) {
      groupedByAuthor[authorKey] = {
        authorName: authorKey,
        authorImage: note.author_image,
        sources: {},
      };
    }

    const sourceName = note.source_name && String(note.source_name).trim();
    const sourceKey = sourceName || "__no_source__";
    if (!groupedByAuthor[authorKey].sources[sourceKey]) {
      groupedByAuthor[authorKey].sources[sourceKey] = {
        sourceName: sourceName || "",
        sourceType: note.source_type || "BOOK",
        sourceImage: note.source_image,
        quotes: [],
      };
    }

    groupedByAuthor[authorKey].sources[sourceKey].quotes.push(note);
  });

  return groupedByAuthor;
}

function generatePdfHtml(groupedByAuthor, filters, allQuotes, pdfColumns = 1, deps = {}) {
  const cols = pdfColumns === 2 ? 2 : 1;
  const filterNoteType = (filters && filters.noteTypeValue) || "";
  const useGroupedLayout = shouldUseGroupedPdfLayout(allQuotes, filterNoteType);
  const trainingTypes = loadTrainingTypesConfig(deps);
  const { titleLabel, typeLine } = getPdfExportLabels(allQuotes, filterNoteType, deps);
  const filterInfo = buildFilterInfoHtml(filters, typeLine);
  const bodyHtml = useGroupedLayout
    ? buildGroupedHtml(groupedByAuthor, cols, trainingTypes)
    : buildFlatHtml(allQuotes, filterNoteType, cols, trainingTypes);
  const twoColCss = cols === 2 ? `
    .notes-two-col {
      column-count: 2;
      column-gap: 32px;
    }
    .notes-two-col .note-card {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
      display: inline-block;
      width: 100%;
      padding: 14px 0 16px;
      overflow: hidden;
    }
    .notes-two-col .tegneserie-img {
      max-width: 100%;
      max-height: 110mm;
    }
    .note-card-stacked {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
    }
    .note-card-stacked .note-comment { margin-bottom: 6px; }
    .note-card-stacked .note-title {
      margin: 0 0 10px 0;
      padding-bottom: 0;
    }
    .note-card-stacked .pdf-att-col {
      width: 72px;
      max-width: 100%;
      margin: 0 0 12px 0;
    }
    .note-card-stacked .pdf-att-main img,
    .note-card-stacked .pdf-att-second img {
      width: 100%;
      max-width: 100%;
      height: auto;
      max-height: 72px;
      object-fit: cover;
    }
    .note-card-stacked .pdf-att-strip { width: 34px; }
    .note-card-stacked .pdf-att-strip img { max-height: 34px; }
    .note-card-stacked .note-text { margin-top: 0; }` : "";
  const coverPageHtml = `
    <section class="cover-page">
      <div class="cover-page-inner">
        <div class="page-header">
          <h1>📋 ${escapeHtml(titleLabel)}</h1>
        </div>
        ${filterInfo}
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.45;
      color: #1f2937;
      font-size: 8.5pt;
      max-width: 100%;
    }
    h1 { color: #1f2937; font-size: 13pt; margin: 0 0 3px 0; font-family: 'Segoe UI', Arial, sans-serif; }
    h2 { color: #1f2937; font-size: 11pt; margin: 0 0 3px 0; font-family: 'Segoe UI', Arial, sans-serif; }
    h3 { color: #4b5563; font-size: 9.5pt;  margin: 0;        font-family: 'Segoe UI', Arial, sans-serif; }
    .cover-page {
      min-height: 250mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      break-after: page;
    }
    .cover-page-inner {
      width: 100%;
      max-width: 160mm;
    }
    .page-header {
      text-align: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #d1d5db;
    }
    .note-card {
      margin: 0;
      padding: 16px 0 12px;
      display: flex;
      gap: 9px;
      border-bottom: 1px solid #d1d5db;
    }
    .note-card-body { flex: 1; min-width: 0; }
    .note-comment {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7pt;
      color: #6b7280;
      font-style: normal;
      margin: 0 0 5px 0;
      line-height: 1.35;
    }
    .note-training-meta {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 700;
      color: #b45309;
      margin: 0 0 8px 0;
      line-height: 1.3;
    }
    .pdf-att-col {
      flex-shrink: 0;
      width: 100px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pdf-att-main img,
    .pdf-att-second img,
    .pdf-att-strip img {
      width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      object-fit: cover;
    }
    .pdf-att-main img { max-height: 120px; }
    .pdf-att-second img { max-height: 80px; }
    .pdf-att-row {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pdf-att-strip { width: 46px; flex-shrink: 0; }
    .pdf-att-strip img { max-height: 46px; }
    .pdf-att-file {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f4f6;
      border-radius: 4px;
      font-size: 13pt;
      min-height: 46px;
    }
    .note-title {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-weight: 700;
      font-size: 10pt;
      color: #1f2937;
      margin: 0 0 4px 0;
      line-height: 1.25;
    }
    .tegneserie-card {
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
      break-inside: avoid;
      page-break-inside: avoid;
      padding-left: 0;
      padding-right: 0;
    }
    .tegneserie-card .note-title { font-size: 11pt; margin-bottom: 6px; }
    .tegneserie-img-wrap {
      text-align: center;
      margin: 2px 0;
    }
    .tegneserie-img {
      max-width: 100%;
      max-height: 180mm;
      height: auto;
      border-radius: 3px;
    }
    .note-text p        { margin: 0; line-height: 1.45; }
    .note-text p + p    { margin-top: 2px; }
    .note-text ul, .note-text ol { margin: 1px 0 1px 16px; padding: 0; }
    .note-text li       { margin: 0; }
    .note-text h1, .note-text h2, .note-text h3 { margin: 3px 0 1px 0; font-size: 8.5pt; }
    .note-text { font-style: italic; color: #1f2937; font-size: 8.5pt; }
    .note-meta  { margin-top: 3px; font-size: 7pt; color: #6b7280; font-family: 'Segoe UI', Arial, sans-serif; font-style: normal; }
    .author-section { margin-bottom: 18px; }
    .author-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 12px; padding-bottom: 6px;
      border-bottom: 1.5px solid #d1d5db;
    }
    .author-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .author-avatar-placeholder {
      width: 40px; height: 40px; border-radius: 50%;
      background: #e5e7eb;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .source-section { margin-bottom: 12px; margin-left: 10px; }
    .source-header  { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
    .source-cover   { width: 34px; height: 51px; object-fit: cover; border-radius: 2px; }
    .flat-group         { margin-bottom: 14px; }
    .flat-group-title   {
      font-size: 8.5pt; font-weight: 700; color: #374151;
      font-family: 'Segoe UI', Arial, sans-serif;
      padding: 0;
      margin-bottom: 5px;
    }
    .filter-info {
      background: #f3f4f6; padding: 6px 9px;
      border-radius: 4px; margin-bottom: 12px; font-size: 7.5pt;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    .filter-info h3 { font-size: 8pt; margin: 0 0 4px 0; color: #374151; }
    .filter-info p  { margin: 2px 0; }${twoColCss}
  </style>
</head>
<body>
  ${coverPageHtml}
  <main class="document-body pdf-cols-${cols}">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

function buildFilterInfoHtml(filters, exportTypeLine) {
  const safeFilters = filters || {};
  const lines = [];
  const exportedType = exportTypeLine
    || safeFilters.noteType
    || "All visible note types";
  lines.push(`<p><strong>Type:</strong> ${escapeHtml(exportedType)}</p>`);
  if (safeFilters.quote) lines.push(`<p><strong>Text:</strong> ${escapeHtml(safeFilters.quote)}</p>`);
  if (safeFilters.author) lines.push(`<p><strong>Author:</strong> ${escapeHtml(safeFilters.author)}</p>`);
  if (safeFilters.source) lines.push(`<p><strong>Source:</strong> ${escapeHtml(safeFilters.source)}</p>`);
  if (safeFilters.tags) lines.push(`<p><strong>Tags:</strong> ${escapeHtml(safeFilters.tags)}</p>`);
  if (!lines.length) return "";
  return `<div class="filter-info"><h3>Filters Applied:</h3>${lines.join("")}</div>`;
}

async function resolveImageForPdf(attachmentValue, maxDim, deps = {}) {
  const {
    fileStorage,
    loadSharp = defaultLoadSharp,
    logger = console,
  } = deps;

  if (!attachmentValue) return null;
  try {
    const meta = fileStorage.retrieveFromStorage(attachmentValue, true);
    if (!meta || !meta.data) return null;
    if (!meta.mimeType || !meta.mimeType.startsWith("image/")) return null;

    // meta.data is "data:<mime>;base64,<payload>"
    const commaIdx = meta.data.indexOf(",");
    if (commaIdx === -1) return null;
    const payload = meta.data.slice(commaIdx + 1);
    const inputBuffer = Buffer.from(payload, "base64");

    const sharp = loadSharp();
    const resized = await sharp(inputBuffer)
      .rotate()
      .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (err) {
    warn(logger, "resolveImageForPdf failed:", err && err.message ? err.message : err);
    return null;
  }
}

function getNoteTitleForPdf(note) {
  const title = note.note_title && String(note.note_title).trim();
  if (!title || title.toLowerCase() === "no title") return "No title";
  return title;
}

function formatTrainingDateForPdf(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${yyyy}.${mm}.${dd}  ${dayName}`;
}

function getTrainingTypeIconLabel(typeValue, trainingTypes) {
  if (!typeValue) return { icon: "🏋️", label: "" };
  const info = trainingTypes.find((type) => type.value === typeValue);
  return {
    icon: info ? info.icon : "🏋️",
    label: info ? info.label : typeValue,
  };
}

function buildTrainingMetaHtml(note, trainingTypes) {
  if (!note || note.note_type !== "training") return "";
  // API aliases notes.type as source_type in list/detail queries.
  const typeValue = note.source_type || note.type || "";
  const { icon, label } = getTrainingTypeIconLabel(typeValue, trainingTypes);
  const dateStr = formatTrainingDateForPdf(note.note_date);
  const trainingTypeStr = typeValue && typeValue !== "ASSORTED" && label
    ? `${icon} ${label}`
    : "";

  let line = "";
  if (trainingTypeStr && dateStr) line = `${trainingTypeStr} — 📅 ${dateStr}`;
  else if (dateStr) line = `📅 ${dateStr}`;
  else if (trainingTypeStr) line = trainingTypeStr;
  if (!line) return "";
  return `<div class="note-training-meta">${escapeHtml(line)}</div>`;
}

function getNoteAttachmentsList(note) {
  if (note.pdf_attachments && note.pdf_attachments.length > 0) return note.pdf_attachments;
  if (note.attachments && note.attachments.length > 0) return note.attachments;
  if (note.thumbnail || note.attachment_full) {
    return [{
      thumbnail: note.thumbnail,
      attachment_full: note.attachment_full,
      attachment_type: note.attachment_type || "image",
      pdf_thumb: note.thumbnail,
    }];
  }
  return [];
}

async function resolveAttachmentThumbForPdf(att, maxDim = 400, deps = {}) {
  if (att.pdf_thumb) return att.pdf_thumb;
  if (att.thumbnail && String(att.thumbnail).startsWith("data:image/")) return att.thumbnail;
  if (att.thumbnail) {
    const retrieved = deps.fileStorage.retrieveFromStorage(att.thumbnail);
    if (retrieved && String(retrieved).startsWith("data:image/")) return retrieved;
  }
  const type = att.attachment_type || "image";
  if (type === "image" && att.attachment_full) {
    return await resolveImageForPdf(att.attachment_full, maxDim, deps);
  }
  return null;
}

async function enrichNoteAttachmentsForPdf(note, deps = {}) {
  const list = getNoteAttachmentsList(note);
  for (let i = 0; i < list.length; i++) {
    const att = list[i];
    const maxDim = note.note_type === "tegneserie" && i === 0 ? 1024 : 400;
    if (note.note_type === "tegneserie" && i === 0 && note.pdf_full_image) {
      att.pdf_thumb = note.pdf_full_image;
    } else {
      att.pdf_thumb = await resolveAttachmentThumbForPdf(att, maxDim, deps);
    }
  }
  note.pdf_attachments = list;
}

async function prepareQuotesForPdf(quotes, deps = {}) {
  for (const note of quotes) {
    if (!note) continue;
    if (note.note_type === "tegneserie") {
      const big = await resolveImageForPdf(note.attachment_full, 1024, deps);
      if (big) note.pdf_full_image = big;
    }
    await enrichNoteAttachmentsForPdf(note, deps);
  }
}

const PDF_ATT_ICONS = { pdf: "📄", video: "🎬", document: "📎", encrypted: "🔒", audio: "🎵" };

function buildNoteCommentHtml(note) {
  const comment = note.comment && String(note.comment).trim();
  if (!comment) return "";
  return `<div class="note-comment">${escapeHtml(comment)}</div>`;
}

function buildPdfAttachmentThumbHtml(att, className) {
  if (att.pdf_thumb) {
    return `<div class="${className}"><img src="${att.pdf_thumb}" alt=""></div>`;
  }
  const type = att.attachment_type || "document";
  const icon = PDF_ATT_ICONS[type] || "📎";
  return `<div class="${className} pdf-att-file"><span>${icon}</span></div>`;
}

function buildPdfAttachmentColumnHtml(note, attachmentsOverride = null) {
  const attachments = attachmentsOverride || getNoteAttachmentsList(note);
  if (attachments.length === 0) return "";

  const mainHtml = buildPdfAttachmentThumbHtml(attachments[0], "pdf-att-main");
  const secondHtml = attachments.length > 1
    ? buildPdfAttachmentThumbHtml(attachments[1], "pdf-att-second")
    : "";
  const rest = attachments.slice(2);
  const restHtml = rest.length > 0
    ? `<div class="pdf-att-row">${rest.map((att) => buildPdfAttachmentThumbHtml(att, "pdf-att-strip")).join("")}</div>`
    : "";

  return `<div class="pdf-att-col">${mainHtml}${secondHtml}${restHtml}</div>`;
}

function buildNoteCardHtml(note, pdfColumns = 1, trainingTypes = []) {
  const stacked = pdfColumns === 2;
  const trainingMetaHtml = buildTrainingMetaHtml(note, trainingTypes);
  const commentHtml = buildNoteCommentHtml(note);
  const titleHtml = `<div class="note-title">${escapeHtml(getNoteTitleForPdf(note))}</div>`;
  const tagsHtml = note.tags
    ? `<div class="note-meta">🏷 ${escapeHtml(note.tags)}</div>` : "";
  const textHtml = `<div class="note-text">${note.note_text || ""}</div>`;
  const stackedClass = stacked ? " note-card-stacked" : "";

  // Tegneserie: full-width image, title above, text AFTER the image (if any).
  if (note.note_type === "tegneserie") {
    const bigImg = note.pdf_full_image || note.thumbnail || note.attachment_full;
    const imgHtml = bigImg
      ? `<div class="tegneserie-img-wrap"><img src="${bigImg}" class="tegneserie-img"></div>`
      : "";
    const extraAttachments = getNoteAttachmentsList(note).slice(1);
    const extraAttHtml = extraAttachments.length > 0
      ? buildPdfAttachmentColumnHtml(note, extraAttachments)
      : "";
    return `
      <div class="note-card tegneserie-card${stackedClass}">
        ${commentHtml}
        ${titleHtml}
        ${imgHtml}
        ${extraAttHtml}
        ${note.note_text ? textHtml : ""}
        ${tagsHtml}
      </div>`;
  }

  const attColHtml = buildPdfAttachmentColumnHtml(note);

  if (stacked) {
    return `
      <div class="note-card note-card-stacked">
        ${trainingMetaHtml}
        ${commentHtml}
        ${titleHtml}
        ${attColHtml}
        ${textHtml}
        ${tagsHtml}
      </div>`;
  }

  // Single-column: attachment column on the left, comment/title/text on the right.
  return `
    <div class="note-card">
      ${attColHtml}
      <div class="note-card-body">
        ${trainingMetaHtml}
        ${commentHtml}
        ${titleHtml}
        ${textHtml}
        ${tagsHtml}
      </div>
    </div>`;
}

function wrapNotesPdfLayout(notesHtml, pdfColumns) {
  if (!notesHtml) return "";
  if (pdfColumns === 2) return `<div class="notes-two-col">${notesHtml}</div>`;
  return `<div class="notes-one-col">${notesHtml}</div>`;
}

function buildGroupedHtml(groupedByAuthor, pdfColumns = 1, trainingTypes = []) {
  const typeIcon = { BOOK: "📖", MOVIE: "🎬", ASSORTED: "📝" };
  let html = "";
  Object.values(groupedByAuthor).forEach((author) => {
    const avatarHtml = author.authorImage
      ? `<img src="${author.authorImage}" class="author-avatar">`
      : `<div class="author-avatar-placeholder">✍️</div>`;
    html += `<div class="author-section">
      <div class="author-header">
        ${avatarHtml}
        <h2>${escapeHtml(author.authorName)}</h2>
      </div>`;
    Object.values(author.sources).forEach((source) => {
      const hasSourceName = !!(source.sourceName && String(source.sourceName).trim());
      const noteCards = source.quotes
        .map((note) => buildNoteCardHtml(note, pdfColumns, trainingTypes))
        .join("");
      if (hasSourceName) {
        const coverHtml = source.sourceImage
          ? `<img src="${source.sourceImage}" class="source-cover">` : "";
        html += `<div class="source-section">
          <div class="source-header">
            ${coverHtml}
            <h3>${typeIcon[source.sourceType] || "📝"} ${escapeHtml(source.sourceName)}</h3>
          </div>`;
      }
      html += wrapNotesPdfLayout(noteCards, pdfColumns);
      if (hasSourceName) html += "</div>";
    });
    html += "</div>";
  });
  return html;
}

function buildFlatHtml(allQuotes, noteType, pdfColumns = 1, trainingTypes = []) {
  if (!allQuotes || allQuotes.length === 0) return "";

  // For tegneserie, group by sub-type (note.type), e.g. PONDUS / DILBERT / NEMI.
  // A "Month Year" created_at header doesn't make sense for archived comics.
  const allTegneserie = allQuotes.every((quote) => quote && quote.note_type === "tegneserie");
  if (allTegneserie) {
    const byType = {};
    allQuotes.forEach((note) => {
      const key = (note.type && String(note.type).trim()) || "Uncategorized";
      if (!byType[key]) byType[key] = [];
      byType[key].push(note);
    });
    const sortedKeys = Object.keys(byType).sort((a, b) => a.localeCompare(b));
    let html = "";
    sortedKeys.forEach((key) => {
      const noteCards = byType[key]
        .map((note) => buildNoteCardHtml(note, pdfColumns, trainingTypes))
        .join("");
      html += `<div class="flat-group">
        <div class="flat-group-title">💥 ${escapeHtml(key)}</div>`;
      html += wrapNotesPdfLayout(noteCards, pdfColumns);
      html += "</div>";
    });
    return html;
  }

  const noteCards = allQuotes
    .map((note) => buildNoteCardHtml(note, pdfColumns, trainingTypes))
    .join("");
  return wrapNotesPdfLayout(noteCards, pdfColumns);
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPdfPageMargins(pdfColumns) {
  return pdfColumns === 2
    ? { top: "12mm", right: "7mm", bottom: "12mm", left: "7mm" }
    : { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" };
}

async function renderPdfBuffer(html, pdfColumns, deps = {}) {
  const {
    loadPuppeteer = defaultLoadPuppeteer,
    logger = console,
  } = deps;
  const puppeteer = loadPuppeteer();
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    return await page.pdf({
      format: "A4",
      margin: getPdfPageMargins(pdfColumns),
      printBackground: true,
    });
  } finally {
    if (browser && typeof browser.close === "function") {
      try {
        await browser.close();
      } catch (err) {
        warn(logger, "Error closing PDF browser:", err && err.message ? err.message : err);
      }
    }
  }
}

function createPdfExportHandler(deps = {}) {
  const {
    fileStorage,
    getSettingsFile,
    fsImpl = fs,
    loadPuppeteer = defaultLoadPuppeteer,
    loadSharp = defaultLoadSharp,
    logger = console,
  } = deps;

  if (!fileStorage) throw new Error("fileStorage is required");
  if (!getSettingsFile) throw new Error("getSettingsFile is required");

  const handlerDeps = {
    fileStorage,
    getSettingsFile,
    fsImpl,
    loadPuppeteer,
    loadSharp,
    logger,
  };

  return async function exportPdf(req, res) {
    try {
      const { quotes, filters, pdfColumns: rawPdfColumns } = req.body || {};
      const pdfColumns = rawPdfColumns === 2 ? 2 : 1;

      if (!quotes || quotes.length === 0) {
        return res.status(400).json({ error: "No quotes provided" });
      }

      await prepareQuotesForPdf(quotes, handlerDeps);
      const groupedByAuthor = groupQuotesByAuthor(quotes);
      const html = generatePdfHtml(groupedByAuthor, filters, quotes, pdfColumns, handlerDeps);
      const pdfBuffer = await renderPdfBuffer(html, pdfColumns, handlerDeps);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=quotes.pdf");
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.end(pdfBuffer, "binary");
    } catch (err) {
      error(logger, "Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF", details: err.message });
    }
  };
}

function registerPdfExportRoutes(app, deps = {}) {
  app.post("/api/export/pdf", createPdfExportHandler(deps));
}

module.exports = {
  buildFilterInfoHtml,
  createPdfExportHandler,
  escapeHtml,
  generatePdfHtml,
  getPdfExportLabels,
  getPdfPageMargins,
  groupQuotesByAuthor,
  prepareQuotesForPdf,
  registerPdfExportRoutes,
  renderPdfBuffer,
  shouldUseGroupedPdfLayout,
};
