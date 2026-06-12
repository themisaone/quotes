#!/usr/bin/env node
'use strict';

/** Start the app in a named MODE on a fixed PORT (see README port table). */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const mode = args[0];
const port = args[1];
const root = path.join(__dirname, '..');

if (!mode || !port) {
  console.error('Usage: node scripts/run-mode.js MODE PORT');
  process.exit(1);
}

const env = { ...process.env, MODE: mode, PORT: String(port) };

let result = spawnSync('node', ['migrations/run-migrations.js'], { stdio: 'inherit', cwd: root, env });
if (result.status !== 0) process.exit(result.status ?? 1);

result = spawnSync('node', ['src/server.js'], { stdio: 'inherit', cwd: root, env });
process.exit(result.status ?? 0);
