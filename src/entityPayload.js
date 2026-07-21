function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

/**
 * Entity image payloads support both the current `image` field and the legacy
 * `thumbnail` field. An explicit `image: null` must win so users can clear an
 * existing author/source image.
 */
function pickEntityImagePayload(body = {}) {
  if (hasOwn(body, "image")) return body.image;
  if (hasOwn(body, "thumbnail")) return body.thumbnail;
  return undefined;
}

function isValidEntityImagePayload(value) {
  if (value == null || value === "") return true;
  const text = String(value);
  return text.startsWith("data:") || text.startsWith("file:");
}

module.exports = {
  isValidEntityImagePayload,
  pickEntityImagePayload,
};
