#!/usr/bin/env node
'use strict';

/** Start the app in a named MODE on its configured PORT (see config/instance-ports.json). */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const mode = args[0];
const root = path.join(__dirname, '..');

if (!mode) {
  console.error('Usage: node scripts/run-mode.js MODE');
  process.exit(1);
}

const portsFile = path.join(root, 'config/instance-ports.json');
const modePorts = JSON.parse(fs.readFileSync(portsFile, 'utf8'));
const port = modePorts[mode.toUpperCase()];
if (!port) {
  console.error(`Unknown mode "${mode}". Check config/instance-ports.json`);
  process.exit(1);
}

const env = { ...process.env, MODE: mode.toUpperCase(), PORT: String(port) };

const result = spawnSync('node', ['src/server.js'], { stdio: 'inherit', cwd: root, env });
process.exit(result.status ?? 0);
