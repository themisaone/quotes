/**
 * Services / instance manager UI — start and stop note-type servers on this host.
 */
import { getElementByIdSafe } from '../constants.js';

const API = '/api';

function serviceUrl(port) {
  const host = window.location.hostname;
  const protocol = window.location.protocol || 'http:';
  return `${protocol}//${host}:${port}/`;
}

function statusBadge(mode) {
  if (mode.self) return '<span class="svc-badge svc-badge-self">This tab</span>';
  if (mode.running) return '<span class="svc-badge svc-badge-on">Running</span>';
  return '<span class="svc-badge svc-badge-off">Stopped</span>';
}

function renderInstancesPanel(data) {
  const container = getElementByIdSafe('servicesList', 'renderInstancesPanel');
  if (!container) return;

  if (!data.canManage) {
    container.innerHTML = `<p class="services-hint">Instance manager is disabled on this server (<code>INSTANCE_MANAGER=0</code>). You can still open links below.</p>`;
  }

  const rows = (data.modes || []).map((m) => {
    let slot1 = '';
    let slot2 = '';
    if (m.running) {
      slot1 = `<a class="btn btn-secondary btn-svc-open" href="${serviceUrl(m.port)}" target="_blank" rel="noopener">Open</a>`;
      if (data.canManage) {
        const selfAttr = m.self ? ' data-self="1"' : '';
        slot2 = `<button type="button" class="btn btn-danger btn-svc-stop" data-port="${m.port}"${selfAttr}>Stop</button>`;
      }
    } else if (!m.running && data.canManage) {
      slot1 = `<button type="button" class="btn btn-primary btn-svc-start" data-mode="${m.mode}">Start</button>`;
    }
    const portNote = m.portBusy
      ? `<span class="svc-port-busy" title="Port ${m.port} is in use by another mode">port busy</span>`
      : '';

    return `
      <tr class="services-row${m.self ? ' services-row-self' : ''}">
        <td class="svc-col-label">${escapeHtml(m.label)}${portNote}</td>
        <td class="svc-col-port">:${m.port}</td>
        <td class="svc-col-status">${statusBadge(m)}</td>
        <td class="svc-col-actions">
          <div class="svc-actions">
            <div class="svc-action-slot">${slot1}</div>
            <div class="svc-action-slot">${slot2}</div>
          </div>
        </td>
      </tr>`;
  }).join('');

  const selfRow = (data.modes || []).find((m) => m.self && m.running);
  const killHint = selfRow
    ? `<p class="services-hint services-hint-kill">No terminal for this instance? Use <strong>Stop</strong> on the <em>This tab</em> row. If Stop fails (older server build), over SSH: <code>kill $(lsof -t -iTCP:${selfRow.port} -sTCP:LISTEN)</code></p>`
    : '';

  container.innerHTML = `
    ${data.canManage ? '' : ''}
    <table class="services-table">
      <thead>
        <tr>
          <th>Service</th>
          <th>Port</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="services-hint">Start and stop run on the <strong>server machine</strong> (same host as this app). Links use your current hostname — works over Tailscale.</p>
    ${killHint}
    <p class="services-hint">Logs for spawned services: <code>config/logs/</code> on the server.</p>
  `;

  container.querySelectorAll('.btn-svc-start').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      btn.disabled = true;
      btn.textContent = 'Starting…';
      try {
        const r = await fetch(`${API}/instances/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        await loadServicesPanel();
      } catch (e) {
        alert(e.message || 'Start failed');
        btn.disabled = false;
        btn.textContent = 'Start';
      }
    });
  });

  container.querySelectorAll('.btn-svc-stop').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const port = btn.dataset.port;
      const isSelf = btn.dataset.self === '1';
      const msg = isSelf
        ? `Stop this service on port ${port}?\n\nThis browser tab will lose connection. Start it again from Services on another instance, or from the server terminal.`
        : `Stop the service on port ${port}?`;
      if (!confirm(msg)) return;
      btn.disabled = true;
      try {
        const r = await fetch(`${API}/instances/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: Number(port) }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        if (body.self) {
          container.innerHTML = `
            <p class="services-stopped-self">This service on port ${escapeHtml(port)} has been stopped.</p>
            <p class="services-hint">You can close this tab. To start it again, use <strong>Services</strong> on another running instance or run the matching <code>npm run …</code> on the server.</p>`;
          return;
        }
        await loadServicesPanel();
      } catch (e) {
        let message = e.message || 'Stop failed';
        if (isSelf || /from itself/i.test(message)) {
          message += `\n\nThis process is still on an older build. Over SSH on the server:\n  kill $(lsof -t -iTCP:${port} -sTCP:LISTEN)\n\nThen pull the latest code and start again — Stop on This tab works after that.`;
        }
        alert(message);
        btn.disabled = false;
      }
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function loadServicesPanel() {
  const container = getElementByIdSafe('servicesList', 'loadServicesPanel');
  if (!container) return;
  container.innerHTML = '<p class="services-loading">Loading services…</p>';
  try {
    const r = await fetch(`${API}/instances`);
    if (!r.ok) throw new Error('Could not load services');
    const data = await r.json();
    renderInstancesPanel(data);
  } catch (e) {
    container.innerHTML = `<p class="services-error">${escapeHtml(e.message)}</p>`;
  }
}

export function wireServicesRefresh() {
  const btn = getElementByIdSafe('refreshServicesBtn', 'wireServicesRefresh');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => loadServicesPanel());
  }
}
