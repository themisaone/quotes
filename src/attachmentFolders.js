const LEGACY_ATTACHMENT_FOLDERS = {
  quotes: "quote",
  notes: "note",
  puzzles: "puzzle",
};

function normalizeAttachmentFolder(value, fallback = "note") {
  const rawValue = value === undefined || value === null || value === "" ? fallback : value;
  const folder = String(rawValue).trim();

  if (!folder || folder === "." || folder === ".." || /[\\/]/.test(folder)) {
    const error = new Error("Invalid attachment folder");
    error.status = 400;
    throw error;
  }

  return LEGACY_ATTACHMENT_FOLDERS[folder] || folder;
}

module.exports = {
  LEGACY_ATTACHMENT_FOLDERS,
  normalizeAttachmentFolder,
};
