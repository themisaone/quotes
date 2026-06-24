const { normalizeAttachmentFolder } = require("./attachmentFolders");

function getQuoteAttachmentFolder(noteType) {
  return normalizeAttachmentFolder(noteType, "quote");
}

function processAttachmentForQuote({
  value,
  noteId,
  noteType,
  storageThresholdMB,
  forceExternal,
  fileStorage,
  onStoredFile,
}) {
  if (!value) return null;

  const finalized = fileStorage.finalizeUploadedFile(value, noteId, "");
  const storageFolder = fileStorage.isFilePath(finalized)
    ? "quote"
    : getQuoteAttachmentFolder(noteType);

  const processed = fileStorage.processForStorage(
    finalized,
    storageFolder,
    noteId,
    "",
    storageThresholdMB,
    forceExternal
  );

  if (
    typeof onStoredFile === "function" &&
    processed &&
    fileStorage.isFilePath(processed) &&
    processed !== value
  ) {
    onStoredFile(processed);
  }

  return processed;
}

function prepareQuoteCreateAttachments({
  noteId,
  thumbnail = "",
  attachmentFull = "",
  attachmentType = "thumbnail",
  noteType = "quote",
  storageThresholdMB = 1,
  fileStorage,
  onStoredFile,
}) {
  const processedThumbnail = processAttachmentForQuote({
    value: thumbnail,
    noteId,
    noteType,
    storageThresholdMB,
    forceExternal: false,
    fileStorage,
    onStoredFile,
  });
  const processedAttachmentFull = processAttachmentForQuote({
    value: attachmentFull,
    noteId,
    noteType,
    storageThresholdMB,
    forceExternal: true,
    fileStorage,
    onStoredFile,
  });

  return {
    processedThumbnail,
    processedAttachmentFull,
    updateParams: [processedThumbnail, processedAttachmentFull, attachmentType, noteId],
    shouldInsertPrimaryAttachment: Boolean(processedThumbnail || processedAttachmentFull),
    insertParams: [
      noteId,
      processedThumbnail,
      processedAttachmentFull,
      attachmentType || "image",
    ],
  };
}

function prepareQuoteUpdateAttachments({
  noteId,
  thumbnail,
  attachmentFull,
  noteType = "quote",
  storageThresholdMB = 1,
  fileStorage,
  onStoredFile,
}) {
  const fields = [];
  let processedThumbnail;
  let processedAttachmentFull;

  if (thumbnail !== undefined && thumbnail) {
    processedThumbnail = processAttachmentForQuote({
      value: thumbnail,
      noteId,
      noteType,
      storageThresholdMB,
      forceExternal: false,
      fileStorage,
      onStoredFile,
    });
    fields.push({ column: "thumbnail", value: processedThumbnail });
  } else if (thumbnail !== undefined) {
    processedThumbnail = null;
    fields.push({ column: "thumbnail", value: thumbnail });
  }

  if (attachmentFull !== undefined && attachmentFull) {
    processedAttachmentFull = processAttachmentForQuote({
      value: attachmentFull,
      noteId,
      noteType,
      storageThresholdMB,
      forceExternal: true,
      fileStorage,
      onStoredFile,
    });
    fields.push({ column: "attachment_full", value: processedAttachmentFull });
  } else if (attachmentFull !== undefined) {
    processedAttachmentFull = null;
    fields.push({ column: "attachment_full", value: attachmentFull });
  }

  return {
    fields,
    processedThumbnail,
    processedAttachmentFull,
  };
}

function buildPrimaryAttachmentUpdate({ noteId, thumbnail, attachmentFull, attachmentType }) {
  const setParts = [];
  const params = [];

  if (thumbnail !== undefined) {
    setParts.push(`thumbnail = $${params.length + 1}`);
    params.push(thumbnail || null);
  }
  if (attachmentFull !== undefined) {
    setParts.push(`attachment_full = $${params.length + 1}`);
    params.push(attachmentFull || null);
  }
  if (attachmentType !== undefined) {
    setParts.push(`attachment_type = $${params.length + 1}`);
    params.push(attachmentType || null);
  }

  if (setParts.length === 0) return null;

  params.push(noteId);
  return {
    sql: `UPDATE note_attachments SET ${setParts.join(", ")} WHERE note_id = $${params.length} AND position = 0`,
    params,
  };
}

function buildPrimaryAttachmentInsert({ noteId, thumbnail, attachmentFull, attachmentType }) {
  if (!thumbnail && !attachmentFull) return null;

  return {
    sql: `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type)
           VALUES ($1, 0, $2, $3, $4, 'base64')`,
    params: [noteId, thumbnail || null, attachmentFull || null, attachmentType || "image"],
  };
}

module.exports = {
  getQuoteAttachmentFolder,
  prepareQuoteCreateAttachments,
  prepareQuoteUpdateAttachments,
  buildPrimaryAttachmentUpdate,
  buildPrimaryAttachmentInsert,
};
