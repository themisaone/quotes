const fs = require("fs");
const path = require("path");

const THEME_TOKENS_ROUTE = "/theme/tokens.css";
const THEME_TOKENS_FILE = "tokens.css";

// Seeds the template on first request so the file is easy to find; a missing
// or unreadable file must never break the page, so errors fall back to empty CSS.
function readThemeTokens({ themeDir, templateFile, fsImpl = fs, logger = console }) {
  const file = path.join(themeDir, THEME_TOKENS_FILE);
  try {
    if (!fsImpl.existsSync(file) && templateFile && fsImpl.existsSync(templateFile)) {
      fsImpl.mkdirSync(themeDir, { recursive: true });
      fsImpl.copyFileSync(templateFile, file);
      logger.log(`🎨 Created theme override file: ${file}`);
    }
    return fsImpl.existsSync(file) ? fsImpl.readFileSync(file, "utf8") : "";
  } catch (e) {
    logger.error(`Theme override file ${file}:`, e.message);
    return "";
  }
}

function registerThemeOverrideRoute(app, { getThemeDir, templateFile, fsImpl = fs, logger = console }) {
  if (!app) throw new Error("Express app is required");
  if (!getThemeDir) throw new Error("getThemeDir is required");

  app.get(THEME_TOKENS_ROUTE, (req, res) => {
    const css = readThemeTokens({ themeDir: getThemeDir(), templateFile, fsImpl, logger });
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.send(css);
  });
}

module.exports = {
  THEME_TOKENS_FILE,
  THEME_TOKENS_ROUTE,
  readThemeTokens,
  registerThemeOverrideRoute,
};
