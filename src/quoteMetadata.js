const { sanitizeNoteText } = require("./noteText");
const { NOTE_FORMAT_HTML, normalizeNoteFormat } = require("./markdown");
const tagHelpers = require("./tagHelpers");

async function getOrCreateQuoteAuthorId(author, client) {
  if (!author || !author.trim()) return null;

  const authorResult = await client.query(
    `INSERT INTO authors (name) 
     VALUES ($1) 
     ON CONFLICT (name) DO UPDATE SET name = authors.name
     RETURNING id`,
    [author.trim()]
  );
  return authorResult.rows[0].id;
}

async function getOrCreateQuoteSourceId({
  source,
  sourceType,
  client,
  updateTypeOnConflict = false,
}) {
  if (!source || !source.trim()) return null;

  const conflictClause = updateTypeOnConflict
    ? "type = EXCLUDED.type"
    : "name = sources.name";

  const sourceResult = await client.query(
    `INSERT INTO sources (name, type) 
     VALUES ($1, $2) 
     ON CONFLICT (name) DO UPDATE SET ${conflictClause}
     RETURNING id`,
    [source.trim(), sourceType]
  );
  return sourceResult.rows[0].id;
}

function resolveEffectiveNoteType({ requestedNoteType, existingNoteType, fallback = "quote" }) {
  return requestedNoteType !== undefined ? requestedNoteType : (existingNoteType || fallback);
}

function buildQuoteInsertParams({
  noteText,
  noteTitle = null,
  authorId = null,
  sourceId = null,
  comment = "",
  sourceType = "BOOK",
  score = null,
  noteType = "quote",
  noteDate = null,
  translationGroup = null,
  noteFormat = NOTE_FORMAT_HTML,
}) {
  const normalizedNoteFormat = normalizeNoteFormat(noteFormat);
  return [
    sanitizeNoteText(noteText, normalizedNoteFormat),
    normalizedNoteFormat,
    noteTitle || null,
    authorId,
    sourceId,
    comment,
    sourceType,
    score,
    noteType,
    noteDate,
    translationGroup,
  ];
}

function buildQuoteScalarUpdateFields({
  noteText,
  noteTitle,
  authorProvided = false,
  authorId = null,
  sourceProvided = false,
  sourceId = null,
  comment,
  score,
  sourceType,
  attachmentType,
  noteType,
  noteDate,
  translationGroup,
  noteFormat,
}) {
  const fields = [];

  if (noteText !== undefined) {
    const normalizedNoteFormat = normalizeNoteFormat(noteFormat);
    fields.push({ column: "note_text", value: sanitizeNoteText(noteText, normalizedNoteFormat) });
  }
  if (noteFormat !== undefined) {
    fields.push({ column: "note_format", value: normalizeNoteFormat(noteFormat) });
  }
  if (noteTitle !== undefined) {
    fields.push({ column: "note_title", value: noteTitle || null });
  }
  if (authorProvided) {
    fields.push({ column: "author_id", value: authorId });
  }
  if (sourceProvided) {
    fields.push({ column: "source_id", value: sourceId });
  }
  if (comment !== undefined) {
    fields.push({ column: "comment", value: comment });
  }
  if (score !== undefined) {
    fields.push({ column: "score", value: score });
  }
  if (sourceType !== undefined) {
    fields.push({ column: "type", value: sourceType });
  }
  if (attachmentType !== undefined) {
    fields.push({ column: "attachment_type", value: attachmentType });
  }
  if (noteType !== undefined) {
    fields.push({ column: "note_type", value: noteType });
  }
  if (noteDate !== undefined) {
    fields.push({ column: "note_date", value: noteDate });
  }
  if (translationGroup !== undefined) {
    fields.push({ column: "translation_group", value: translationGroup });
  }

  return fields;
}

async function syncQuoteTags({
  noteId,
  tags,
  noteType,
  client,
  clearWhenEmpty = false,
  helpers = tagHelpers,
}) {
  const tagNames = helpers.parseTagInput(tags);
  let tagIds = [];

  if (tagNames.length > 0) {
    tagIds = await helpers.getOrCreateTagIds(tagNames, noteType, client);
  }

  if (tagIds.length > 0) {
    await helpers.associateTagsWithNote(noteId, tagIds, client);
    return { action: "associated", tagNames, tagIds };
  }

  if (clearWhenEmpty) {
    const hasNewTables = await helpers.checkTagTablesExist();
    if (hasNewTables) {
      await client.query("DELETE FROM note_tags WHERE note_id = $1", [noteId]);
      return { action: "cleared", tagNames, tagIds };
    }
  }

  return { action: "skipped", tagNames, tagIds };
}

async function propagateTranslationGroupRename({ noteId, translationGroup, client }) {
  const currentQuote = await client.query(
    "SELECT translation_group FROM notes WHERE id = $1",
    [noteId]
  );
  const oldTranslationGroup = currentQuote.rows[0]?.translation_group || null;

  if (oldTranslationGroup && oldTranslationGroup !== translationGroup) {
    await client.query(
      `UPDATE notes 
       SET translation_group = $1 
       WHERE translation_group = $2`,
      [translationGroup, oldTranslationGroup]
    );
    return { oldTranslationGroup, propagated: true };
  }

  return { oldTranslationGroup, propagated: false };
}

module.exports = {
  getOrCreateQuoteAuthorId,
  getOrCreateQuoteSourceId,
  resolveEffectiveNoteType,
  buildQuoteInsertParams,
  buildQuoteScalarUpdateFields,
  syncQuoteTags,
  propagateTranslationGroupRename,
};
