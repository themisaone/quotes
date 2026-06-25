#!/usr/bin/env node
'use strict';

/** Start the app in a named MODE on its configured PORT (see config/instance-ports.json). */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const mode = args[0];
const root = path.join(__dirname, '..');
const DEFAULT_MODE_PORTS = {
  ALL: 4000,
  QUOTES: 4001,
  NOTES: 4002,
};

if (!mode) {
  console.error('Usage: node scripts/run-mode.js MODE');
  process.exit(1);
}

const portsFile = path.join(root, 'config/instance-ports.json');
let modePorts = DEFAULT_MODE_PORTS;
try {
  if (fs.existsSync(portsFile)) {
    modePorts = JSON.parse(fs.readFileSync(portsFile, 'utf8'));
  }
} catch (error) {
  console.warn(`Could not read ${portsFile}; using default ports. ${error.message}`);
}
const port = modePorts[mode.toUpperCase()];
if (!port) {
  console.error(`Unknown mode "${mode}". Check config/instance-ports.json or DEFAULT_MODE_PORTS in scripts/run-mode.js`);
  process.exit(1);
}

const env = { ...process.env, MODE: mode.toUpperCase(), PORT: String(port) };

const result = spawnSync('node', ['src/server.js'], { stdio: 'inherit', cwd: root, env });
process.exit(result.status ?? 0);
