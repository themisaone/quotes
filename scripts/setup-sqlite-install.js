#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const standardProfileDir = path.join(rootDir, "inst", "sqlite-standard");
const DEFAULT_MODE_PORTS = {
  DEFAULT: 4000,
  ALL: 4000,
  TEGNESERIE: 4001,
  TRAINING: 4002,
  JOB: 4003,
  BRAIN: 4004,
  QUOTES: 4005,
  NOTES: 4006,
  HISTORICAL: 4007,
};

function usage() {
  console.log(`Usage:
  npm run setup-sqlite -- --vault <vault-dir> [--db <db-dir-or-file>] [--port 4000]

Examples:
  npm run setup-sqlite -- --vault ~/Documents/NoteArchiveVault
  npm run setup-sqlite -- --vault ~/Documents/NoteArchiveVault --db ~/NoteArchiveData
  npm run setup-sqlite -- --vault ~/Documents/NoteArchiveVault --db ~/NoteArchiveData/archive.sqlite

Options:
  --vault <dir>    Directory for attachments, palettes, and settings
  --db <dir|file>  Directory for archive.sqlite, or explicit DB file; default: ~/NoteArchiveData
  --seed-vault <dir>
                  Source vault to copy config/settings.json and palettes from
  --include-attachments
                  Also copy seed-vault attachments into the target vault
  --port <port>    HTTP port; default: 4000
  --mode <mode>    Active mode; default: ALL
  --force          Overwrite generated config/settings files
  --no-migrate     Do not run SQLite migrations
  --dry-run        Print actions without writing files
  --help           Show this help
`);
}

function parseArgs(argv) {
  const options = {
    vault: "",
    db: "",
    port: "4000",
    mode: "ALL",
    seedVault: "",
    includeAttachments: false,
    force: false,
    migrate: true,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--include-attachments") options.includeAttachments = true;
    else if (arg === "--no-migrate") options.migrate = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (["--vault", "--db", "--port", "--mode", "--seed-vault"].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      const key = arg === "--seed-vault" ? "seedVault" : arg.slice(2);
      options[key] = value;
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

function resolveSqliteDbPath(value, { fsImpl = fs } = {}) {
  const resolved = resolveUserPath(value || "~/NoteArchiveData");
  if (fsImpl.existsSync(resolved)) {
    const stat = fsImpl.statSync(resolved);
    if (stat.isDirectory()) return path.join(resolved, "archive.sqlite");
  }

  if (value && /[\\/]$/.test(String(value))) {
    return path.join(resolved, "archive.sqlite");
  }

  const basename = path.basename(resolved).toLowerCase();
  if (/\.(sqlite|sqlite3|db|db3)$/.test(basename)) {
    return resolved;
  }

  return path.join(resolved, "archive.sqlite");
}

function findBundledSeedVault({ fsImpl = fs } = {}) {
  const dir = path.join(rootDir, "seed-vault");
  if (!fsImpl.existsSync(dir)) return "";
  if (!fsImpl.statSync(dir).isDirectory()) return "";
  return dir;
}

function findStandardProfileVault({ fsImpl = fs } = {}) {
  const dir = path.join(standardProfileDir, "vault");
  if (!fsImpl.existsSync(dir)) return "";
  if (!fsImpl.statSync(dir).isDirectory()) return "";
  return dir;
}

function findPalettesDir(vaultPath, { fsImpl = fs } = {}) {
  for (const name of ["palettes", "palette"]) {
    const candidate = path.join(vaultPath, name);
    if (fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return "";
}

function assertDependenciesInstalled({ migrate, dryRun }) {
  if (!migrate || dryRun) return;
  try {
    require.resolve("dotenv", { paths: [rootDir] });
  } catch (error) {
    throw new Error(
      "Project dependencies are not installed yet.\n\n" +
      "Run this from the unpacked app directory first:\n\n" +
      "  npm install\n\n" +
      "Then run setup again. If setup already wrote .env and config/local.json, " +
      "you can run:\n\n" +
      "  npm run migrate\n"
    );
  }
}

function prompt(question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function fillInteractiveOptions(options) {
  if (options.vault) return options;
  if (!process.stdin.isTTY) {
    throw new Error("Missing --vault <dir>");
  }

  const defaultVault = "~/Documents/NoteArchiveVault";
  const defaultDb = options.db || "~/NoteArchiveData";
  options.vault = await prompt("Vault directory", defaultVault);
  options.db = await prompt("SQLite database directory or file", defaultDb);
  options.port = await prompt("HTTP port", options.port);
  return options;
}

function logAction(message, { dryRun }) {
  console.log(`${dryRun ? "Would " : ""}${message}`);
}

function ensureDir(dir, options) {
  logAction(`create directory ${dir}`, options);
  if (!options.dryRun) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, contents, options) {
  if (!options.force && fs.existsSync(file)) {
    logAction(`keep existing ${path.relative(rootDir, file)}`, options);
    return;
  }
  logAction(`write ${path.relative(rootDir, file)}`, options);
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

function copyFileIfNeeded(source, target, options) {
  if (!options.force && fs.existsSync(target)) {
    logAction(`keep existing ${target}`, options);
    return;
  }
  logAction(`copy ${source} -> ${target}`, options);
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function copyTree(sourceDir, targetDir, options) {
  if (!fs.existsSync(sourceDir)) return false;
  ensureDir(targetDir, options);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target, options);
    } else if (entry.isFile()) {
      copyFileIfNeeded(source, target, options);
    }
  }
  return true;
}

function copySeedOrDefaultVaultFiles({ seedVaultPath, vaultPath }, options) {
  const sourceVaultPath = seedVaultPath || findStandardProfileVault();
  if (!sourceVaultPath) {
    throw new Error("Missing built-in SQLite install profile: inst/sqlite-standard/vault");
  }
  const seedSettings = sourceVaultPath
    ? path.join(sourceVaultPath, "config", "settings.json")
    : "";
  const seedPalettes = sourceVaultPath ? findPalettesDir(sourceVaultPath) : "";

  if (seedSettings && fs.existsSync(seedSettings)) {
    copyFileIfNeeded(seedSettings, path.join(vaultPath, "config", "settings.json"), options);
  } else {
    throw new Error(`Missing settings.json in profile vault: ${sourceVaultPath}`);
  }

  if (seedPalettes) {
    copyTree(seedPalettes, path.join(vaultPath, "palettes"), options);
  } else {
    throw new Error(`Missing palettes directory in profile vault: ${sourceVaultPath}`);
  }

  const seedAttachments = sourceVaultPath ? path.join(sourceVaultPath, "attachments") : "";
  if (seedAttachments && fs.existsSync(seedAttachments)) {
    if (options.includeAttachments) {
      copyTree(seedAttachments, path.join(vaultPath, "attachments"), options);
    } else {
      logAction(`skip seed attachments from ${seedAttachments}`, options);
    }
  }
}

function writeRuntimeFiles({ vaultPath, dbPath, port, mode }, options) {
  const envContents = [
    "DB_BACKEND=sqlite",
    `PORT=${port}`,
    "",
  ].join("\n");
  writeFile(path.join(rootDir, ".env"), envContents, options);

  const localConfig = {
    vaultPath,
    activeMode: mode,
    sqlite: {
      enabled: true,
      path: dbPath,
    },
  };
  writeFile(
    path.join(rootDir, "config", "local.json"),
    `${JSON.stringify(localConfig, null, 2)}\n`,
    options,
  );
}

function writeInstancePortsFile(options) {
  const target = path.join(rootDir, "config", "instance-ports.json");
  if (fs.existsSync(target) && !options.force) {
    logAction(`keep existing ${path.relative(rootDir, target)}`, options);
    return;
  }
  const standardPortsFile = path.join(standardProfileDir, "config", "instance-ports.json");
  if (fs.existsSync(standardPortsFile)) {
    copyFileIfNeeded(standardPortsFile, target, options);
    return;
  }
  writeFile(target, `${JSON.stringify(DEFAULT_MODE_PORTS, null, 2)}\n`, options);
}

function runMigrations(options) {
  if (!options.migrate) {
    logAction("skip migrations", options);
    return;
  }
  logAction("run SQLite migrations", options);
  if (options.dryRun) return;

  const result = spawnSync("npm", ["run", "migrate"], {
    cwd: rootDir,
    env: { ...process.env, DB_BACKEND: "sqlite" },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("SQLite migration failed");
  }
}

async function main() {
  const parsedOptions = parseArgs(process.argv.slice(2));
  if (parsedOptions.help) {
    usage();
    return;
  }

  const options = await fillInteractiveOptions(parsedOptions);
  if (options.help) {
    usage();
    return;
  }

  const vaultPath = resolveUserPath(options.vault);
  const dbPath = resolveSqliteDbPath(options.db || "~/NoteArchiveData");
  const bundledSeedVault = findBundledSeedVault();
  const seedVaultPath = options.seedVault
    ? resolveUserPath(options.seedVault)
    : bundledSeedVault;
  const port = String(options.port || "4000").trim();
  const mode = String(options.mode || "ALL").trim().toUpperCase();

  if (!vaultPath) throw new Error("Vault path is required");
  if (!dbPath) throw new Error("SQLite DB path is required");
  if (seedVaultPath && !fs.existsSync(seedVaultPath)) {
    throw new Error(`Seed vault does not exist: ${seedVaultPath}`);
  }
  if (!/^\d+$/.test(port)) throw new Error(`Invalid port: ${port}`);
  assertDependenciesInstalled({
    migrate: options.migrate,
    dryRun: options.dryRun,
  });

  const scriptOptions = {
    dryRun: options.dryRun,
    force: options.force,
    includeAttachments: options.includeAttachments || Boolean(bundledSeedVault && !options.seedVault),
    migrate: options.migrate,
  };

  console.log("");
  console.log("SQLite local install setup");
  console.log(`Vault: ${vaultPath}`);
  console.log(`DB:    ${dbPath}`);
  console.log(`Port:  ${port}`);
  if (seedVaultPath) {
    console.log(`Seed:  ${seedVaultPath}`);
  }
  console.log("");

  ensureDir(path.join(vaultPath, "attachments"), scriptOptions);
  ensureDir(path.join(vaultPath, "config"), scriptOptions);
  copySeedOrDefaultVaultFiles({ seedVaultPath, vaultPath }, scriptOptions);
  const standardModesFile = path.join(standardProfileDir, "config", "modes.json");
  if (!fs.existsSync(standardModesFile)) {
    throw new Error("Missing built-in SQLite modes profile: inst/sqlite-standard/config/modes.json");
  }
  copyFileIfNeeded(standardModesFile, path.join(rootDir, "config", "modes.json"), scriptOptions);
  writeInstancePortsFile(scriptOptions);
  ensureDir(path.dirname(dbPath), scriptOptions);
  writeRuntimeFiles({ vaultPath, dbPath, port, mode }, scriptOptions);
  runMigrations(scriptOptions);

  console.log("");
  console.log("SQLite setup complete.");
  console.log(`Start with: npm start`);
  console.log(`Open:       http://localhost:${port}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
