#!/usr/bin/env node
'use strict';

/**
 * Start the app in a named MODE on a fixed PORT.
 * Optional flags (after npm run <script> -- …):
 *   --menu    force side-menu navigation (single-type instances)
 *   --header  force header toolbar navigation
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const mode = args[0];
const port = args[1];
const flags = args.slice(2);
const root = path.join(__dirname, '..');

if (!mode || !port) {
  console.error('Usage: node scripts/run-mode.js MODE PORT [--menu|--header]');
  process.exit(1);
}

const env = { ...process.env, MODE: mode, PORT: String(port) };
if (flags.includes('--menu')) env.NAV_LAYOUT = 'menu';
else if (flags.includes('--header')) env.NAV_LAYOUT = 'header';

let result = spawnSync('node', ['migrations/run-migrations.js'], { stdio: 'inherit', cwd: root, env });
if (result.status !== 0) process.exit(result.status ?? 1);

result = spawnSync('node', ['src/server.js'], { stdio: 'inherit', cwd: root, env });
process.exit(result.status ?? 0);
