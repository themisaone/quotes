#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const packageRootName = "note-archive-sqlite";
const stageDir = path.join(distDir, packageRootName);

const includeEntries = [
  ".env.example",
  "INSTALL-SQLITE.txt",
  "README.md",
  "package.json",
  "package-lock.json",
  "inst",
  "migrations",
  "public",
  "scripts",
  "src",
];

function usage() {
  console.log(`Usage:
  npm run package-sqlite -- [--seed-vault <vault-dir>] [--include-attachments]

Options:
  --seed-vault <dir>      Include config/settings.json and palettes/ from this vault
  --include-attachments   Also include seed-vault attachments/
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const options = {
    seedVault: "",
    includeAttachments: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--include-attachments") {
      options.includeAttachments = true;
    } else if (arg === "--seed-vault") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--seed-vault requires a value");
      }
      options.seedVault = value;
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function expandHome(value) {
  const text = String(value || "").trim();
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (text === "~") return home || text;
  if (text.startsWith("~/") || text.startsWith("~\\")) return path.join(home, text.slice(2));
  return text;
}

function resolveUserPath(value) {
  return path.resolve(expandHome(value));
}

const excludeBasenames = new Set([
  ".git",
  ".env",
  "attachments",
  "node_modules",
  "dist",
]);

const excludeRelativePaths = new Set([
  "config/local.json",
  "config/running-instances.json",
]);

function isExcluded(relativePath) {
  if (!relativePath) return false;
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => excludeBasenames.has(part))) return true;
  if (excludeRelativePaths.has(relativePath)) return true;
  if (/\.sqlite(?:-(?:wal|shm))?$/.test(path.basename(relativePath))) return true;
  if (/\.lock$/.test(path.basename(relativePath))) return true;
  return false;
}

function copyEntry(source, target, relativePath = "") {
  if (isExcluded(relativePath)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      copyEntry(
        path.join(source, name),
        path.join(target, name),
        path.join(relativePath, name),
      );
    }
    return;
  }
  if (!stat.isFile()) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function findPalettesDir(vaultPath) {
  for (const name of ["palettes", "palette"]) {
    const candidate = path.join(vaultPath, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return "";
}

function copySeedTree(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      copySeedTree(path.join(source, name), path.join(target, name));
    }
    return;
  }
  if (!stat.isFile()) return;
  const base = path.basename(source);
  if (/\.sqlite(?:-(?:wal|shm))?$/.test(base) || /\.lock$/.test(base)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copySeedVault(seedVault, { includeAttachments }) {
  if (!seedVault) return;
  if (!fs.existsSync(seedVault) || !fs.statSync(seedVault).isDirectory()) {
    throw new Error(`Seed vault does not exist: ${seedVault}`);
  }

  const settingsFile = path.join(seedVault, "config", "settings.json");
  if (!fs.existsSync(settingsFile)) {
    throw new Error(`Seed vault is missing config/settings.json: ${seedVault}`);
  }
  copySeedTree(settingsFile, path.join(stageDir, "seed-vault", "config", "settings.json"));

  const palettesDir = findPalettesDir(seedVault);
  if (!palettesDir) {
    throw new Error(`Seed vault is missing palettes/ directory: ${seedVault}`);
  }
  copySeedTree(palettesDir, path.join(stageDir, "seed-vault", "palettes"));

  const attachmentsDir = path.join(seedVault, "attachments");
  if (includeAttachments) {
    if (!fs.existsSync(attachmentsDir)) {
      throw new Error(`Seed vault is missing attachments/ directory: ${seedVault}`);
    }
    copySeedTree(attachmentsDir, path.join(stageDir, "seed-vault", "attachments"));
  }
}

function rewritePackageJsonForSqlitePackage() {
  const packageFile = path.join(stageDir, "package.json");
  const data = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const scripts = data.scripts || {};
  data.scripts = {
    start: scripts.start,
    migrate: scripts.migrate,
    "setup-sqlite": scripts["setup-sqlite"],
    all: scripts.all,
    quotes: scripts.quotes,
    notes: scripts.notes,
  };
  fs.writeFileSync(packageFile, `${JSON.stringify(data, null, 2)}\n`);
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const seedVault = options.seedVault ? resolveUserPath(options.seedVault) : "";

  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of includeEntries) {
    const source = path.join(rootDir, entry);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing package entry: ${entry}`);
    }
    copyEntry(source, path.join(stageDir, entry), entry);
  }

  rewritePackageJsonForSqlitePackage();
  copySeedVault(seedVault, { includeAttachments: options.includeAttachments });

  const archiveName = `note-archive-sqlite-${stamp()}.tar.gz`;
  const archivePath = path.join(distDir, archiveName);
  const result = spawnSync("tar", ["-czf", archivePath, packageRootName], {
    cwd: distDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("tar failed");
  }

  fs.rmSync(stageDir, { recursive: true, force: true });
  console.log(`Created ${archivePath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
