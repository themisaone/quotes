#!/usr/bin/env node
// Computed-style regression check for CSS refactors (cascade layers, !important removal).
//
// Prerequisites: the app must already be running (e.g. npm run all on port 4000).
// Read-only: only swaps the body display-mode class and sets viewMode_* in the
// headless browser's own localStorage — nothing is written to settings.json or the DB.
//
//   mkdir -p tmp/css-snapshots
//   node scripts/css-snapshot.js snapshot tmp/css-snapshots/before.json
//   ... change CSS ...
//   node scripts/css-snapshot.js snapshot tmp/css-snapshots/after.json
//   node scripts/css-snapshot.js diff tmp/css-snapshots/before.json tmp/css-snapshots/after.json
//
// Faster iteration (one viewport / one scene):
//   node scripts/css-snapshot.js snapshot out.json --viewports desktop --scenes grid,modal

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  medium: { width: 900, height: 1000 },
  desktop: { width: 1440, height: 900 },
};
const MODES = ["card-presentation-classical", "card-presentation-paper-curl"];
const SCENES = ["grid", "modal", "list", "options"];

const STYLE_PROPS = [
  "display", "position", "visibility", "opacity", "z-index", "overflow-x", "overflow-y",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "text-align", "color",
  "background-color", "background-image",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-top-color", "border-bottom-color",
  "border-top-left-radius", "border-bottom-right-radius", "box-shadow",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "gap",
  "grid-template-columns", "transform", "white-space",
];
const MAX_ELEMENTS = 3000;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {
    url: "http://localhost:4000",
    limit: 40,
    viewports: Object.keys(VIEWPORTS),
    scenes: [...SCENES],
    includeRect: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--url") options.url = rest[++i];
    else if (arg === "--limit") options.limit = Number(rest[++i]);
    else if (arg === "--viewports") options.viewports = rest[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--scenes") options.scenes = rest[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--include-rect") options.includeRect = true;
    else positional.push(arg);
  }
  for (const name of options.viewports) {
    if (!VIEWPORTS[name]) throw new Error(`Unknown viewport: ${name} (want ${Object.keys(VIEWPORTS).join(", ")})`);
  }
  for (const name of options.scenes) {
    if (!SCENES.includes(name)) throw new Error(`Unknown scene: ${name} (want ${SCENES.join(", ")})`);
  }
  return { command, positional, options };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page: one record per visible element, keyed by a DOM path that
// stays stable between runs against the same data.
function captureInPage({ props, maxElements }) {
  const keyOf = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${node.id}`); break; }
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter((s) => s.tagName === node.tagName)
        : [];
      const cls = [...node.classList].filter((c) => !/^(hover|focus|active)/.test(c)).slice(0, 3).join(".");
      parts.unshift(`${node.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${siblings.length > 1 ? `:${siblings.indexOf(node) + 1}` : ""}`);
    }
    return parts.join(">");
  };
  const out = {};
  let count = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (count >= maxElements) break;
    if (["SCRIPT", "STYLE", "TEMPLATE", "OPTION"].includes(el.tagName)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    const rec = { rect: [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(",") };
    for (const p of props) rec[p] = cs.getPropertyValue(p);
    out[keyOf(el)] = rec;
    count++;
  }
  return out;
}

async function prepareScene(page, scene) {
  await page.evaluate(async (sceneName) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelectorAll(".welcome-quote-overlay, .welcome-overlay, #welcomeQuoteOverlay").forEach((e) => e.remove());
    if (sceneName === "modal") {
      document.querySelector(".quotes-list .quote-card")?.click();
      await sleep(1200);
      if (!document.querySelector("#quoteModal .quote-modal-lane-text")) {
        throw new Error("modal scene: note modal did not open");
      }
    } else if (sceneName === "list") {
      document.querySelector(".lp-row")?.click();
      await sleep(1200);
      if (!document.querySelector(".lp-pane-paper-body, .lp-pane")) {
        throw new Error("list scene: pane did not open");
      }
    } else if (sceneName === "options") {
      document.querySelector('.menu-item[data-view="settings"]')?.click();
      await sleep(1200);
      if (!document.querySelector("#settingsView, .settings-page, [data-settings-section]")) {
        // Settings root id varies; fall back to Options heading text.
        const heading = [...document.querySelectorAll("h1")].find((h) => /Options/i.test(h.textContent || ""));
        if (!heading) throw new Error("options scene: Options page did not open");
      }
    }
    window.scrollTo(0, 0);
  }, scene);
}

async function waitForSceneReady(page, scene) {
  if (scene === "list") {
    await page.waitForSelector(".lp-row", { timeout: 30000 });
  } else if (scene === "options") {
    // Grid loads first; Options is opened in prepareScene.
    await page.waitForSelector(".quotes-list .quote-card, .menu-item[data-view=\"settings\"]", { timeout: 30000 });
  } else {
    await page.waitForSelector(".quotes-list .quote-card", { timeout: 30000 });
  }
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
}

async function snapshot(file, { url, viewports, scenes }) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const result = {
    url,
    takenAt: new Date().toISOString(),
    viewports,
    scenes: {},
  };
  try {
    for (const vpName of viewports) {
      for (const scene of scenes) {
        const page = await browser.newPage();
        await page.setViewport(VIEWPORTS[vpName]);
        await page.evaluateOnNewDocument((view) => {
          localStorage.setItem("viewMode_all", view);
        }, scene === "list" ? "list-pane" : "2");
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await waitForSceneReady(page, scene);
        await page.addStyleTag({
          content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}",
        });
        await wait(500);
        await prepareScene(page, scene);
        for (const mode of MODES) {
          await page.evaluate((m, all) => {
            document.body.classList.remove(...all);
            document.body.classList.add(m);
          }, mode, MODES);
          await wait(250);
          const key = `${vpName}/${scene}/${mode.replace("card-presentation-", "")}`;
          result.scenes[key] = await page.evaluate(captureInPage, { props: STYLE_PROPS, maxElements: MAX_ELEMENTS });
          console.log(`${key}: ${Object.keys(result.scenes[key]).length} elements`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result));
  console.log(`Saved ${file}`);
}

function collectDiffs(beforeScenes, afterScenes, { includeRect }) {
  const reports = [];
  let total = 0;
  for (const scene of Object.keys({ ...beforeScenes, ...afterScenes }).sort()) {
    const sa = beforeScenes[scene] || {};
    const sb = afterScenes[scene] || {};
    const changes = [];
    const byProp = {};
    for (const key of Object.keys({ ...sa, ...sb }).sort()) {
      if (!sa[key] || !sb[key]) {
        const label = sa[key] ? "(element removed)" : "(element added)";
        changes.push(`${sa[key] ? "- removed" : "+ added  "} ${key}`);
        byProp[label] = (byProp[label] || 0) + 1;
        continue;
      }
      for (const p of Object.keys(sa[key])) {
        if (!includeRect && p === "rect") continue;
        if (sa[key][p] !== sb[key][p]) {
          changes.push(`  ${key}\n      ${p}: ${sa[key][p]}  →  ${sb[key][p]}`);
          byProp[p] = (byProp[p] || 0) + 1;
        }
      }
    }
    if (!changes.length) continue;
    total += changes.length;
    reports.push({ scene, changes, byProp });
  }
  return { total, reports };
}

function printDiff(fileA, fileB, { limit, includeRect }) {
  const a = JSON.parse(fs.readFileSync(fileA, "utf8")).scenes;
  const b = JSON.parse(fs.readFileSync(fileB, "utf8")).scenes;
  const { total, reports } = collectDiffs(a, b, { includeRect });
  for (const { scene, changes, byProp } of reports) {
    console.log(`\n== ${scene}: ${changes.length} change(s) — ${Object.entries(byProp).map(([p, n]) => `${p}×${n}`).join(", ")}`);
    changes.slice(0, limit).forEach((c) => console.log(c));
    if (changes.length > limit) console.log(`  … ${changes.length - limit} more`);
  }
  console.log(total ? `\n${total} difference(s) in total.` : "No differences.");
  process.exitCode = total ? 1 : 0;
}

async function main() {
  const { command, positional, options } = parseArgs(process.argv.slice(2));
  if (command === "snapshot" && positional[0]) return snapshot(positional[0], options);
  if (command === "diff" && positional.length === 2) {
    return printDiff(positional[0], positional[1], options);
  }
  console.log(`Usage:
  node scripts/css-snapshot.js snapshot <out.json> [--url http://localhost:4000] [--viewports phone,medium,desktop] [--scenes grid,modal,list,options]
  node scripts/css-snapshot.js diff <before.json> <after.json> [--limit 40] [--include-rect]`);
  process.exitCode = 2;
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { parseArgs, collectDiffs, STYLE_PROPS, VIEWPORTS, SCENES, MODES };
