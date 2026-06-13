'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORTS_FILE = path.join(ROOT, 'config/instance-ports.json');
const REGISTRY_FILE = path.join(ROOT, 'config/running-instances.json');
const LOG_DIR = path.join(ROOT, 'config/logs');
const SERVER_SCRIPT = path.join(__dirname, 'server.js');

const MODE_LABELS = {
  DEFAULT: 'Default (quote, note, historical)',
  ALL: 'All types',
  TEGNESERIE: 'Tegneserie',
  TRAINING: 'Training',
  JOB: 'Job',
  BRAIN: 'Brain / puzzle',
  QUOTES: 'Quotes',
  NOTES: 'Notes',
  HISTORICAL: 'Historical',
};

function isManagerEnabled() {
  return process.env.INSTANCE_MANAGER !== '0';
}

function loadModePorts() {
  return JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8'));
}

function readRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      if (data && typeof data.instances === 'object') return data;
    }
  } catch (_) {}
  return { instances: {} };
}

function writeRegistry(data) {
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

function registerInstance(port, mode, pid) {
  const reg = readRegistry();
  reg.instances[String(port)] = {
    mode,
    pid,
    startedAt: new Date().toISOString(),
  };
  writeRegistry(reg);
}

function unregisterInstance(port) {
  const reg = readRegistry();
  delete reg.instances[String(port)];
  writeRegistry(reg);
}

function pidListeningOnPort(port) {
  try {
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return null;
    const pid = parseInt(out.split('\n')[0], 10);
    return Number.isFinite(pid) ? pid : null;
  } catch (_) {
    return null;
  }
}

function probePort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/mode`, { timeout: 1200 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ running: res.statusCode === 200, data: JSON.parse(body) });
        } catch (_) {
          resolve({ running: false });
        }
      });
    });
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false });
    });
  });
}

function cleanupRegistry(probesByPort) {
  const reg = readRegistry();
  let changed = false;
  for (const [portKey, entry] of Object.entries(reg.instances)) {
    if (!probesByPort[portKey]?.running) {
      delete reg.instances[portKey];
      changed = true;
    }
  }
  if (changed) writeRegistry(reg);
}

async function listInstances(currentPort) {
  const modePorts = loadModePorts();
  const uniquePorts = [...new Set(Object.values(modePorts))].sort((a, b) => a - b);
  const probesByPort = {};

  const instances = [];
  for (const port of uniquePorts) {
    const probe = await probePort(port);
    probesByPort[String(port)] = probe;
    const modes = Object.entries(modePorts)
      .filter(([, p]) => p === port)
      .map(([mode]) => mode);
    const reg = readRegistry();
    const regEntry = reg.instances[String(port)];

    instances.push({
      port,
      modes,
      modeLabels: modes.map((m) => MODE_LABELS[m] || m),
      running: probe.running,
      self: Number(currentPort) === Number(port),
      activeMode: probe.running ? probe.data?.mode : null,
      allowedTypes: probe.running ? probe.data?.allowedTypes : null,
      modeLocked: probe.running ? !!probe.data?.modeLocked : false,
      pid: probe.running ? (regEntry?.pid ?? pidListeningOnPort(port)) : null,
    });
  }

  cleanupRegistry(probesByPort);

  const modes = Object.entries(modePorts).map(([mode, port]) => {
    const inst = instances.find((i) => i.port === port);
    return {
      mode,
      label: MODE_LABELS[mode] || mode,
      port,
      running: inst?.running ?? false,
      activeMode: inst?.activeMode ?? null,
      self: inst?.self ?? false,
      portBusy: inst?.running && !inst.modes.includes(mode) && inst.activeMode !== mode,
    };
  });

  return {
    canManage: isManagerEnabled(),
    selfPort: Number(currentPort),
    instances,
    modes,
  };
}

async function startInstance(mode, currentPort) {
  if (!isManagerEnabled()) {
    const err = new Error('Instance manager is disabled (INSTANCE_MANAGER=0)');
    err.status = 403;
    throw err;
  }

  const modePorts = loadModePorts();
  const modeKey = String(mode || '').toUpperCase();
  const port = modePorts[modeKey];
  if (!port) {
    const err = new Error(`Unknown mode "${mode}"`);
    err.status = 400;
    throw err;
  }

  const probe = await probePort(port);
  if (probe.running) {
    const err = new Error(`Port ${port} is already in use (${probe.data?.mode || 'unknown mode'})`);
    err.status = 409;
    throw err;
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${modeKey.toLowerCase()}-${port}.log`);
  const logFd = fs.openSync(logPath, 'a');

  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    env: {
      ...process.env,
      MODE: modeKey,
      PORT: String(port),
      SKIP_MIGRATE: '1',
    },
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: ROOT,
  });
  child.unref();
  fs.closeSync(logFd);

  registerInstance(port, modeKey, child.pid);

  // Wait briefly for bind
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const check = await probePort(port);
    if (check.running) {
      return { mode: modeKey, port, pid: child.pid, logPath };
    }
  }

  return { mode: modeKey, port, pid: child.pid, logPath, warning: 'Process started but port not responding yet' };
}

async function stopInstance(port, currentPort) {
  if (!isManagerEnabled()) {
    const err = new Error('Instance manager is disabled (INSTANCE_MANAGER=0)');
    err.status = 403;
    throw err;
  }

  const portNum = Number(port);
  if (!Number.isFinite(portNum)) {
    const err = new Error('Invalid port');
    err.status = 400;
    throw err;
  }

  const probe = await probePort(portNum);
  if (!probe.running) {
    unregisterInstance(portNum);
    return { port: portNum, stopped: false, message: 'Not running' };
  }

  if (Number(currentPort) === portNum) {
    unregisterInstance(portNum);
    return { port: portNum, stopped: true, self: true };
  }

  const reg = readRegistry();
  let pid = reg.instances[String(portNum)]?.pid ?? pidListeningOnPort(portNum);
  if (!pid) {
    const err = new Error(`Could not find process on port ${portNum}`);
    err.status = 404;
    throw err;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    if (e.code === 'ESRCH') {
      unregisterInstance(portNum);
      return { port: portNum, stopped: false, message: 'Process already exited' };
    }
    throw e;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const check = await probePort(portNum);
    if (!check.running) {
      unregisterInstance(portNum);
      return { port: portNum, stopped: true, pid };
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {}
  unregisterInstance(portNum);
  return { port: portNum, stopped: true, pid, forced: true };
}

function attachLifecycleHooks(port, modeName) {
  registerInstance(port, modeName, process.pid);

  const shutdown = () => {
    unregisterInstance(port);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = {
  isManagerEnabled,
  listInstances,
  startInstance,
  stopInstance,
  attachLifecycleHooks,
  MODE_LABELS,
};
