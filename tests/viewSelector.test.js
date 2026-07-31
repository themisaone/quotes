const assert = require("node:assert/strict");
const test = require("node:test");

test("combined results view offers responsive card layouts and List", async () => {
  const { buildResultsViewOptions } = await import("../public/js/lib/viewSelector.js");

  assert.deepEqual(
    buildResultsViewOptions({ screen: "medium" }).map(({ value }) => value),
    ["2", "3", "gallery", "list-pane"]
  );
  assert.deepEqual(
    buildResultsViewOptions({ screen: "small" }).map(({ value }) => value),
    ["2", "gallery", "list-pane"]
  );
});

test("combined results view uses Calendar and List for training", async () => {
  const { buildResultsViewOptions } = await import("../public/js/lib/viewSelector.js");

  assert.deepEqual(
    buildResultsViewOptions({
      screen: "medium",
      isDateType: true,
      isTrainingType: true,
    }),
    [
      { value: "calendar", label: "📅 Calendar" },
      { value: "list", label: "☰ List" },
    ]
  );
});

test("other date types retain card layouts alongside Calendar and List", async () => {
  const { buildResultsViewOptions } = await import("../public/js/lib/viewSelector.js");

  assert.deepEqual(
    buildResultsViewOptions({
      screen: "desktop",
      isDateType: true,
    }).map(({ value }) => value),
    ["1", "2", "3", "4", "gallery", "calendar", "list"]
  );
});
