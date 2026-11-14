const assert = require("node:assert/strict");
const test = require("node:test");

const { parseArgs, collectDiffs } = require("../scripts/css-snapshot");

test("parseArgs defaults and filters", () => {
  const full = parseArgs(["snapshot", "out.json"]);
  assert.equal(full.command, "snapshot");
  assert.deepEqual(full.positional, ["out.json"]);
  assert.equal(full.options.url, "http://localhost:4000");
  assert.deepEqual(full.options.viewports, ["phone", "medium", "desktop"]);
  assert.deepEqual(full.options.scenes, ["grid", "modal", "list", "options"]);
  assert.equal(full.options.includeRect, false);

  const filtered = parseArgs([
    "diff", "a.json", "b.json",
    "--url", "http://localhost:4100",
    "--viewports", "desktop",
    "--scenes", "grid,modal",
    "--include-rect",
    "--limit", "10",
  ]);
  assert.equal(filtered.options.url, "http://localhost:4100");
  assert.deepEqual(filtered.options.viewports, ["desktop"]);
  assert.deepEqual(filtered.options.scenes, ["grid", "modal"]);
  assert.equal(filtered.options.includeRect, true);
  assert.equal(filtered.options.limit, 10);
});

test("parseArgs rejects unknown viewport or scene", () => {
  assert.throws(() => parseArgs(["snapshot", "o.json", "--viewports", "wide"]), /Unknown viewport/);
  assert.throws(() => parseArgs(["snapshot", "o.json", "--scenes", "gallery"]), /Unknown scene/);
});

test("collectDiffs ignores rect by default and reports style changes", () => {
  const before = {
    "desktop/grid/classical": {
      "#a": { rect: "0,0,10,10", color: "rgb(0, 0, 0)", "font-size": "16px" },
      "#b": { rect: "1,1,2,2", color: "rgb(1, 1, 1)" },
    },
  };
  const after = {
    "desktop/grid/classical": {
      "#a": { rect: "5,5,10,10", color: "rgb(255, 0, 0)", "font-size": "16px" },
      "#c": { rect: "0,0,1,1", color: "rgb(0, 0, 0)" },
    },
  };

  const withoutRect = collectDiffs(before, after, { includeRect: false });
  assert.equal(withoutRect.total, 3); // color change + removed #b + added #c
  assert.equal(withoutRect.reports[0].byProp.color, 1);
  assert.equal(withoutRect.reports[0].byProp["(element removed)"], 1);
  assert.equal(withoutRect.reports[0].byProp["(element added)"], 1);

  const withRect = collectDiffs(before, after, { includeRect: true });
  assert.equal(withRect.total, 4); // + rect on #a
  assert.equal(withRect.reports[0].byProp.rect, 1);
});

test("collectDiffs reports no differences for identical scenes", () => {
  const scenes = {
    "phone/options/paper-curl": {
      "#x": { rect: "0,0,1,1", color: "rgb(0, 0, 0)" },
    },
  };
  assert.equal(collectDiffs(scenes, scenes, { includeRect: false }).total, 0);
});
