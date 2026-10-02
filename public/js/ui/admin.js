// Admin Console & Monitoring UI Module.
let activeAdminTab = 'USERS';

function setAdminTab(tab) {
  if (!['USERS', 'HEALTH', 'AUTHSYNC', 'ERRORS', 'AUDIT'].includes(tab)) return;
  activeAdminTab = tab;
  updateAdminTabButtons();
  renderAdminConsole();
}

function updateAdminTabButtons() {
  const tabs = [
    ['adminTabUsers', 'USERS'],
    ['adminTabHealth', 'HEALTH'],
    ['adminTabAuthSync', 'AUTHSYNC'],
    ['adminTabErrors', 'ERRORS'],
    ['adminTabAudit', 'AUDIT']
  ];

  tabs.forEach(([id, tabKey]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = activeAdminTab === tabKey;
    btn.style.background = active ? 'var(--color-electric)' : 'var(--panel-bg)';
    btn.style.color = active ? 'var(--color-primary-deep)' : 'var(--color-text)';
    btn.style.borderColor = active ? 'var(--color-electric)' : 'var(--color-border)';
  });
}

async function renderAdminConsole() {
  const container = document.getElementById('adminConsoleContent');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted);"><span style="font-size:24px; display:block; margin-bottom:8px;">⌛</span>Loading Admin Console...</div>';

  try {
    switch (activeAdminTab) {
      case 'USERS':
        await renderAdminUsers(container);
        break;
      case 'HEALTH':
        await renderAdminHealth(container);
        break;
      case 'AUTHSYNC':
        await renderAdminAuthSync(container);
        break;
      case 'ERRORS':
        await renderAdminErrors(container);
        break;
      case 'AUDIT':
        await renderAdminAudit(container);
        break;
      default:
        await renderAdminUsers(container);
    }
  } catch (err) {
    const isFetchError = String(err?.message || '').includes('Failed to fetch') || String(err?.message || '').includes('HTTP 404');
    const errorMsg = isFetchError
      ? 'Backend SAM Deployment Pending: The new /admin/* API routes have been updated in your template (aws/template.yaml) and Lambda handler (aws/lambda/index.mjs). Please run "sam deploy" in your AWS SAM CLI to deploy the updated API Gateway routes to AWS.'
      : (err.message || 'Unable to access Admin Console.');

    container.innerHTML = `
      <div style="padding:20px; background:var(--color-danger-soft); border:1px solid var(--color-error); border-radius:12px; color:var(--color-error); text-align:center;">
        <h4 style="margin-bottom:6px; font-size:16px; font-weight:800;">⛔ ${isFetchError ? 'AWS Backend Deployment Required' : 'Admin Access Restricted'}</h4>
        <p style="font-size:13px; margin:0; line-height:1.5;">${escapeHtml(errorMsg)}</p>
      </div>
    `;
  }
}

async function renderAdminUsers(container) {
  const data = await window.CricStorage.fetchAdminUsers();
  const users = data.users || [];

  if (!users.length) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);">No registered users found in the system.</div>';
    return;
  }

  const userRows = users.map((u, idx) => {
    const regDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const isAdmin = (u.email || '').trim().toLowerCase() === 'ankoji@gmail.com';

    return `
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:200px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:15px; font-weight:900; color:var(--color-text);">${idx + 1}. ${escapeHtml(u.name || 'User')}</span>
            ${isAdmin ? '<span style="font-size:10px; font-weight:800; background:var(--color-electric); color:var(--color-primary-deep); padding:2px 6px; border-radius:6px;">ADMIN</span>' : ''}
          </div>
          <div style="font-size:12px; color:var(--color-electric); font-weight:700; margin-top:2px;">📧 ${escapeHtml(u.email)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Registered: ${regDate} | Last Active: ${lastActive}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px; font-weight:900; color:var(--color-electric);">${u.matchCount}</div>
          <div style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Matches Created</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4 style="font-size:15px; font-weight:800; color:var(--color-text); margin:0;">Registered Users (${data.totalUsers || users.length})</h4>
      <button class="cric-btn cric-btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="renderAdminConsole()">🔄 Refresh</button>
    </div>
    ${userRows}
  `;
}

async function renderAdminHealth(container) {
  const health = await window.CricStorage.fetchAdminSystemHealth();

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4 style="font-size:15px; font-weight:800; color:var(--color-text); margin:0;">System Health & Infrastructure</h4>
      <button class="cric-btn cric-btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="renderAdminConsole()">🔄 Refresh</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:16px;">
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">SYSTEM STATUS</div>
        <div style="font-size:16px; font-weight:900; color:var(--color-success); margin-top:4px;">🟢 ${health.status}</div>
      </div>
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">DB LATENCY</div>
        <div style="font-size:16px; font-weight:900; color:var(--color-electric); margin-top:4px;">${health.dbLatencyMs} ms</div>
      </div>
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">TOTAL DB ITEMS</div>
        <div style="font-size:16px; font-weight:900; color:var(--color-electric); margin-top:4px;">${health.totalItemsCount}</div>
      </div>
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">UPTIME</div>
        <div style="font-size:16px; font-weight:900; color:var(--color-electric); margin-top:4px;">${Math.floor(health.uptimeSeconds / 60)} mins</div>
      </div>
    </div>

    <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px; font-size:12px;">
      <div style="font-size:12px; font-weight:800; color:var(--color-electric); margin-bottom:8px;">DynamoDB Table Details</div>
      <div>Table Name: <b>${escapeHtml(health.tableName)}</b></div>
      <div style="margin-top:4px;">Last Ping: <b>${new Date(health.timestamp).toLocaleTimeString()}</b></div>
    </div>
  `;
}

async function renderAdminAuthSync(container) {
  const metrics = await window.CricStorage.fetchAdminAuthSyncMetrics();

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4 style="font-size:15px; font-weight:800; color:var(--color-text); margin:0;">Auth & Cloud Sync Monitoring</h4>
      <button class="cric-btn cric-btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="renderAdminConsole()">🔄 Refresh</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px; text-align:center;">
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">TOTAL USERS</div>
        <div style="font-size:22px; font-weight:900; color:var(--color-electric); margin-top:4px;">${metrics.totalUsers}</div>
      </div>
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">TOTAL MATCHES</div>
        <div style="font-size:22px; font-weight:900; color:var(--color-electric); margin-top:4px;">${metrics.totalMatches}</div>
      </div>
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:14px;">
        <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">ACTIVE SHARES</div>
        <div style="font-size:22px; font-weight:900; color:var(--color-success); margin-top:4px;">${metrics.activeSpectatorShares}</div>
      </div>
    </div>
  `;
}

async function renderAdminErrors(container) {
  const data = await window.CricStorage.fetchAdminErrorDashboard();
  const errors = data.errors || [];

  if (!errors.length) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--color-success); background:var(--panel-bg); border-radius:12px; border:1px solid var(--color-border);">🟢 No system or client errors logged in the last 30 days!</div>';
    return;
  }

  const rows = errors.map((err, idx) => {
    const time = err.timestamp ? new Date(err.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';

    return `
      <div style="background:var(--panel-bg); border:1px solid var(--color-error); border-radius:12px; padding:12px; margin-bottom:8px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-weight:800; color:var(--color-error);">${idx + 1}. [${escapeHtml(err.source || 'SYS')}] ${escapeHtml(err.errorMessage || 'Error')}</span>
          <span style="font-size:11px; color:var(--text-muted);">${time}</span>
        </div>
        ${err.path ? `<div style="color:var(--text-muted); font-size:11px;">Path: <code>${escapeHtml(err.path)}</code></div>` : ''}
        ${err.stack ? `<pre style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; font-size:10px; font-family:monospace; color:var(--color-text-on-dark); overflow-x:auto; margin-top:6px;">${escapeHtml(err.stack)}</pre>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4 style="font-size:15px; font-weight:800; color:var(--color-text); margin:0;">Error Logs (${errors.length})</h4>
      <button class="cric-btn cric-btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="renderAdminConsole()">🔄 Refresh</button>
    </div>
    ${rows}
  `;
}

async function renderAdminAudit(container) {
  const data = await window.CricStorage.fetchAdminAuditLogs();
  const logs = data.auditLogs || [];

  if (!logs.length) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);">No security audit events recorded in the last 30 days.</div>';
    return;
  }

  const rows = logs.map((log, idx) => {
    const time = log.timestamp ? new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';

    return `
      <div style="background:var(--panel-bg); border:1px solid var(--color-border); border-radius:12px; padding:12px; margin-bottom:8px; font-size:12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div>
          <div style="font-size:13px; font-weight:800; color:var(--color-electric);">${idx + 1}. ${escapeHtml(log.action || 'ACTION')}</div>
          <div style="font-size:11px; color:var(--color-text); margin-top:2px;">User: <b>${escapeHtml(log.actorEmail || log.actorUserId)}</b></div>
          ${log.targetId ? `<div style="font-size:10px; color:var(--text-muted);">Target ID: ${escapeHtml(log.targetId)}</div>` : ''}
        </div>
        <div style="font-size:11px; color:var(--text-muted); text-align:right;">
          ${time}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4 style="font-size:15px; font-weight:800; color:var(--color-text); margin:0;">30-Day Security Audit Trail (${logs.length})</h4>
      <button class="cric-btn cric-btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="renderAdminConsole()">🔄 Refresh</button>
    </div>
    ${rows}
  `;
}

function showAdminScreen() {
  const currentEmail = (window.CricStorage.getAuthEmail() || '').trim().toLowerCase();
  if (currentEmail !== 'ankoji@gmail.com') {
    showToast('Admin Console is restricted to ankoji@gmail.com', 'danger');
    showLandingScreen();
    return;
  }

  updateNavState('navAdmin');
  showScreen('screenAdmin');
  setAdminTab('USERS');
}
