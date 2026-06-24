const fs = require("fs");

const DEFAULT_MODES = {
  DEFAULT: ["quote", "note", "historical"],
  ALL: ["quote", "note", "historical", "puzzle", "training"],
};

function normalizeModeName(mode) {
  return String(mode || "").trim().toUpperCase();
}

function loadModesFromFile(modesFile) {
  try {
    if (fs.existsSync(modesFile)) {
      return JSON.parse(fs.readFileSync(modesFile, "utf8"));
    }
  } catch (_) {}
  return DEFAULT_MODES;
}

function resolveInitialMode({ envMode, localConfig } = {}) {
  const normalizedEnvMode = normalizeModeName(envMode);
  if (normalizedEnvMode) return normalizedEnvMode;

  const normalizedLocalMode = normalizeModeName(localConfig?.activeMode);
  if (normalizedLocalMode) return normalizedLocalMode;

  return "DEFAULT";
}

function getAllowedTypes(modes, modeName) {
  return modes[modeName] || modes.DEFAULT || Object.values(modes)[0] || [];
}

module.exports = {
  DEFAULT_MODES,
  normalizeModeName,
  loadModesFromFile,
  resolveInitialMode,
  getAllowedTypes,
};
