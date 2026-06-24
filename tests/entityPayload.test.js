const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isValidEntityImagePayload,
  pickEntityImagePayload,
} = require("../src/entityPayload");

test("pickEntityImagePayload prefers image over legacy thumbnail", () => {
  assert.equal(
    pickEntityImagePayload({
      image: "data:image/png;base64,new",
      thumbnail: "data:image/png;base64,old",
    }),
    "data:image/png;base64,new"
  );
});

test("pickEntityImagePayload preserves explicit null image clears", () => {
  assert.equal(
    pickEntityImagePayload({
      image: null,
      thumbnail: "data:image/png;base64,old",
    }),
    null
  );
});

test("pickEntityImagePayload falls back to thumbnail or undefined", () => {
  assert.equal(
    pickEntityImagePayload({ thumbnail: "data:image/jpeg;base64,abc" }),
    "data:image/jpeg;base64,abc"
  );
  assert.equal(pickEntityImagePayload({ name: "No image" }), undefined);
  assert.equal(pickEntityImagePayload(), undefined);
});

test("isValidEntityImagePayload allows empty clears and data URLs only", () => {
  assert.equal(isValidEntityImagePayload(undefined), true);
  assert.equal(isValidEntityImagePayload(null), true);
  assert.equal(isValidEntityImagePayload(""), true);
  assert.equal(isValidEntityImagePayload("data:image/png;base64,abc"), true);
  assert.equal(isValidEntityImagePayload("http://example.test/image.png"), false);
  assert.equal(isValidEntityImagePayload({ src: "data:image/png;base64,abc" }), false);
});
