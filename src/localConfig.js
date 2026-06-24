const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "../config/local.json");

function readLocalConfig({ fsImpl = fs, localFile = LOCAL_FILE } = {}) {
  try {
    if (fsImpl.existsSync(localFile)) {
      return JSON.parse(fsImpl.readFileSync(localFile, "utf8"));
    }
  } catch (_) {}
  return {};
}

function writeLocalConfig(obj, { fsImpl = fs, localFile = LOCAL_FILE } = {}) {
  fsImpl.mkdirSync(path.dirname(localFile), { recursive: true });
  fsImpl.writeFileSync(localFile, JSON.stringify(obj, null, 2));
}

module.exports = {
  LOCAL_FILE,
  readLocalConfig,
  writeLocalConfig,
};
