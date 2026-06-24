const assert = require("node:assert/strict");
const test = require("node:test");

const { parseTagInput } = require("../src/tagHelpers");

test("parseTagInput returns an empty list for missing or unsupported values", () => {
  assert.deepEqual(parseTagInput(), []);
  assert.deepEqual(parseTagInput(null), []);
  assert.deepEqual(parseTagInput(42), []);
});

test("parseTagInput trims comma-separated tag strings", () => {
  assert.deepEqual(parseTagInput(" alpha, beta ,, gamma "), [
    "alpha",
    "beta",
    "gamma",
  ]);
});

test("parseTagInput trims array values", () => {
  assert.deepEqual(parseTagInput([" alpha ", "", "beta", "   "]), [
    "alpha",
    "beta",
  ]);
});
