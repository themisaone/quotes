const EN_MEDIA_RE = /<en-media[^>]*\/?>/gi;
const EMPTY_HTML_RE = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i;

function sanitizeNoteText(text) {
  if (!text) return "";
  const stripped = text.replace(EN_MEDIA_RE, "");
  return EMPTY_HTML_RE.test(stripped) ? "" : stripped;
}

module.exports = {
  sanitizeNoteText,
};
