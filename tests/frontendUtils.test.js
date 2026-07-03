const assert = require("node:assert/strict");
const test = require("node:test");

test("isNearBlack strips neutral dark colors but preserves saturated Quill colors", async () => {
  const { isNearBlack } = await import("../public/js/lib/utils.js");

  assert.equal(isNearBlack("rgb(51, 51, 51)"), true);
  assert.equal(isNearBlack("#1e293b"), true);
  assert.equal(isNearBlack("rgb(230, 0, 0)"), false);
  assert.equal(isNearBlack("#1e40af"), false);
});
