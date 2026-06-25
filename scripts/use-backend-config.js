#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const profiles = {
  SQLITE: {
    envFile: ".env.sqlite",
    localConfigFile: path.join("config", "local.sqlite.json"),
  },
  POSTGRES: {
    envFile: ".env.postgres",
    localConfigFile: path.join("config", "local.postgres.json"),
  },
};

function usage() {
  const script = path.relative(process.cwd(), __filename);
  console.log(`Usage: node ${script} SQLITE|POSTGRES [--dry-run]`);
  console.log("");
  console.log("Copies the selected local profile into:");
  console.log("  .env");
  console.log("  config/local.json");
}

function copyProfileFile(sourceRelative, targetRelative, { dryRun }) {
  const source = path.join(rootDir, sourceRelative);
  const target = path.join(rootDir, targetRelative);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing profile file: ${sourceRelative}`);
  }

  if (dryRun) {
    console.log(`Would copy ${sourceRelative} -> ${targetRelative}`);
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied ${sourceRelative} -> ${targetRelative}`);
}

function main() {
  const args = process.argv.slice(2);
  const profileName = String(args[0] || "").trim().toUpperCase();
  const dryRun = args.includes("--dry-run");

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const profile = profiles[profileName];
  if (!profile) {
    usage();
    process.exitCode = 1;
    return;
  }

  copyProfileFile(profile.envFile, ".env", { dryRun });
  copyProfileFile(profile.localConfigFile, path.join("config", "local.json"), { dryRun });

  if (dryRun) {
    console.log(`Dry run complete for ${profileName}.`);
    return;
  }

  console.log(`Activated ${profileName} backend config.`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
