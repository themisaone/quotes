const EN_MEDIA_RE = /<en-media[^>]*\/?>/gi;
const EMPTY_HTML_RE = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i;

function sanitizeNoteText(text, noteFormat = "html") {
  if (!text) return "";
  if (noteFormat === "markdown") return String(text);
  const stripped = text.replace(EN_MEDIA_RE, "");
  return EMPTY_HTML_RE.test(stripped) ? "" : stripped;
}

module.exports = {
  sanitizeNoteText,
};
