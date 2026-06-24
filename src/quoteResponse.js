function formatTagNames(tags) {
  return tags.map((tag) => tag.name).join(", ");
}

function enrichNoteResponse(note, {
  attachments,
  tags = [],
  tagsFallback = note?.tags || "",
  includeTagObjects = true,
  retrieveQuoteImages,
  applyAttachments,
}) {
  if (!retrieveQuoteImages) throw new Error("retrieveQuoteImages is required");
  if (!applyAttachments) throw new Error("applyAttachments is required");

  const noteWithImages = retrieveQuoteImages(note);
  const noteWithAttachments = applyAttachments(noteWithImages, attachments);
  if (!includeTagObjects) {
    return noteWithAttachments;
  }

  return {
    ...noteWithAttachments,
    tags: tags.length > 0 ? formatTagNames(tags) : tagsFallback,
    tag_objects: tags,
  };
}

async function enrichSingleNoteResponse(note, {
  attachmentNoteId = note.id,
  tagNoteId = note.id,
  getAttachmentsForNotes,
  checkTagTablesExist,
  getTagsForNote,
  retrieveQuoteImages,
  applyAttachments,
}) {
  if (!getAttachmentsForNotes) throw new Error("getAttachmentsForNotes is required");
  if (!checkTagTablesExist) throw new Error("checkTagTablesExist is required");
  if (!getTagsForNote) throw new Error("getTagsForNote is required");

  const attachmentsMap = await getAttachmentsForNotes([attachmentNoteId]);
  const hasTagTables = await checkTagTablesExist();
  if (!hasTagTables) {
    return enrichNoteResponse(note, {
      attachments: attachmentsMap.get(attachmentNoteId),
      includeTagObjects: false,
      retrieveQuoteImages,
      applyAttachments,
    });
  }

  const tags = await getTagsForNote(tagNoteId);
  return enrichNoteResponse(note, {
    attachments: attachmentsMap.get(attachmentNoteId),
    tags,
    tagsFallback: note.tags || "",
    retrieveQuoteImages,
    applyAttachments,
  });
}

async function enrichNoteListResponse(notes, {
  getAttachmentsForNotes,
  checkTagTablesExist,
  getTagsForNotes,
  retrieveQuoteImages,
  applyAttachments,
}) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  if (!getAttachmentsForNotes) throw new Error("getAttachmentsForNotes is required");
  if (!checkTagTablesExist) throw new Error("checkTagTablesExist is required");
  if (!getTagsForNotes) throw new Error("getTagsForNotes is required");

  const noteIds = notes.map((note) => note.id);
  const attachmentsMap = await getAttachmentsForNotes(noteIds);
  const hasTagTables = await checkTagTablesExist();
  const tagsMap = hasTagTables ? await getTagsForNotes(noteIds) : new Map();

  return notes.map((note) => enrichNoteResponse(note, {
    attachments: attachmentsMap.get(note.id),
    tags: tagsMap.get(note.id) || [],
    tagsFallback: note.tags || "",
    includeTagObjects: hasTagTables,
    retrieveQuoteImages,
    applyAttachments,
  }));
}

module.exports = {
  formatTagNames,
  enrichNoteResponse,
  enrichSingleNoteResponse,
  enrichNoteListResponse,
};
