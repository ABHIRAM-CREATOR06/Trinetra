/* ═══════════════════════════════════════════════════════════
   TRINETRA — app.js
   SPA Router + API Layer + Page Renderers
   Backend: http://127.0.0.1:3000
   ═══════════════════════════════════════════════════════════ */

'use strict';

const API = 'http://127.0.0.1:3000';

/* ── State ───────────────────────────────────────────────── */
const state = {
  page: 'dashboard',
  subscriberOffset: 0,
  subscriberLimit: 25,
  subscriberQuery: '',
  deviceOffset: 0,
  deviceLimit: 25,
  deviceQuery: '',
  invFilter: 'ALL',
  currentInvestigation: null,
};

/* ═══════════════════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════════════════ */

async function apiFetch(path, options = {}) {
  const url = API + path;
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    throw err;
  }
}

async function checkBackend() {
  try {
    await apiFetch('/');
    setStatus('online', 'Backend online');
  } catch {
    setStatus('offline', 'Backend offline');
  }
}

function setStatus(cls, label) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  dot.className = 'status-dot ' + cls;
  lbl.textContent = label;
}

/* ═══════════════════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════════════════ */

function router() {
  const hash = location.hash.replace('#', '') || 'dashboard';

  // subscriber detail: #subscriber/SUB_ID
  if (hash.startsWith('subscriber/')) {
    const id = hash.slice('subscriber/'.length);
    setActivePage('subscribers');
    renderSubscriberDetail(id);
    return;
  }

  setActivePage(hash);

  switch (hash) {
    case 'dashboard':      renderDashboard();      break;
    case 'subscribers':    renderSubscribers();    break;
    case 'devices':        renderDevices();        break;
    case 'investigations': renderInvestigations(); break;
    case 'audit-log':      renderAuditLog();       break;
    default:               renderDashboard();
  }
}

function setActivePage(page) {
  document.querySelectorAll('.sidebar-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  state.page = page;
}

function navigate(hash) {
  location.hash = hash;
}

window.addEventListener('hashchange', router);

/* ═══════════════════════════════════════════════════════════
   HELPER: RENDER UTILITIES
   ═══════════════════════════════════════════════════════════ */

function setContent(html) {
  document.getElementById('page-content').innerHTML = html;
}

function loading() {
  setContent('<div class="loading-state"><div class="loading-spinner"></div><p>Loading…</p></div>');
}

function errorState(msg) {
  setContent(`<div class="error-state">⚠ ${escHtml(msg)}</div>`);
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d)) return str.slice(0, 10);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return str.slice(0, 10); }
}

function fmtDatetime(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d)) return str.slice(0, 16).replace('T', ' ');
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return str.slice(0, 16).replace('T', ' '); }
}

function kycBadge(status) {
  const map = {
    VERIFIED: 'badge-verified',
    PENDING:  'badge-pending',
    REJECTED: 'badge-rejected',
  };
  return `<span class="badge ${map[status] || 'badge-info'}">${escHtml(status)}</span>`;
}

function deviceBadge(status) {
  const cls = status === 'STOLEN' ? 'badge-stolen' : 'badge-normal';
  return `<span class="badge ${cls}">${escHtml(status)}</span>`;
}

function riskBadge(level) {
  const map = {
    LOW:       'badge-low',
    MEDIUM:    'badge-medium',
    HIGH:      'badge-high',
    'VERY HIGH': 'badge-very-high',
  };
  return `<span class="badge ${map[level] || 'badge-info'}">${escHtml(level)}</span>`;
}

function invStatusBadge(status) {
  const map = {
    PENDING:      'badge-pending-inv',
    UNDER_REVIEW: 'badge-under-review',
    RESOLVED:     'badge-resolved',
  };
  return `<span class="badge ${map[status] || 'badge-info'}">${escHtml(status)}</span>`;
}

function riskScoreColor(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return '';
}

function riskScoreTextColor(level) {
  if (level === 'VERY HIGH' || level === 'HIGH') return 'color: var(--c-error)';
  if (level === 'MEDIUM') return 'color: var(--c-warning)';
  return 'color: var(--c-success)';
}

function rulesToString(rules) {
  try {
    if (Array.isArray(rules)) return rules.join(', ');
    if (typeof rules === 'string') {
      const parsed = JSON.parse(rules);
      if (Array.isArray(parsed)) return parsed.join(', ');
      return rules;
    }
    return JSON.stringify(rules);
  } catch {
    return String(rules);
  }
}

function setBreadcrumb(text) {
  document.getElementById('utility-breadcrumb').textContent = text;
}

/* ═══════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════ */

let toastTimer = null;

function showToast(msg, durationMs = 4000) {
  const t = document.getElementById('toast');
  document.getElementById('toast-message').textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), durationMs);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toast-close').addEventListener('click', () => {
    document.getElementById('toast').classList.add('hidden');
  });
});

/* ═══════════════════════════════════════════════════════════
   PAGE 1: DASHBOARD
   ═══════════════════════════════════════════════════════════ */

async function renderDashboard() {
  setBreadcrumb('Dashboard');
  loading();

  try {
    const [subscribers, devices, investigations] = await Promise.all([
      apiFetch('/api/subscribers?limit=1'),
      apiFetch('/api/devices?limit=1'),
      apiFetch('/api/investigations'),
    ]);

    // KPI: get full counts via separate larger fetches
    const allSubs = await apiFetch('/api/subscribers?limit=10000');
    const allDevs = await apiFetch('/api/devices?limit=10000');

    const totalSubs  = Array.isArray(allSubs) ? allSubs.length : 0;
    const totalDevs  = Array.isArray(allDevs) ? allDevs.length : 0;
    const invList    = Array.isArray(investigations) ? investigations : [];
    const activeInv  = invList.filter(i => i.status !== 'RESOLVED').length;

    // Risk level breakdown from investigations
    const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, 'VERY HIGH': 0 };
    invList.forEach(i => {
      const lvl = i.risk_level;
      if (riskCounts.hasOwnProperty(lvl)) riskCounts[lvl]++;
    });

    // Recent investigations (top 8)
    const recentInv = invList.slice(0, 8);

    setContent(`
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Platform overview — Trinetra Intelligence Platform</p>
      </div>

      <!-- KPI Row -->
      <div class="kpi-row">
        <div class="kpi-card">
          <span class="kpi-label">Total Subscribers</span>
          <span class="kpi-value">${totalSubs.toLocaleString()}</span>
          <span class="kpi-meta">Registered in system</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Devices</span>
          <span class="kpi-value">${totalDevs.toLocaleString()}</span>
          <span class="kpi-meta">Unique IMEIs tracked</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Active Investigations</span>
          <span class="kpi-value" style="color: var(--c-primary)">${activeInv.toLocaleString()}</span>
          <span class="kpi-meta">Pending + Under review</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Investigations</span>
          <span class="kpi-value">${invList.length.toLocaleString()}</span>
          <span class="kpi-meta">All time</span>
        </div>
      </div>

      <!-- Risk Breakdown + Quick Evaluate -->
      <div class="section-grid">
        <div class="card">
          <div class="card-title">Risk Level Breakdown</div>
          <div class="risk-breakdown">
            <div class="risk-breakdown-item">
              <div class="risk-breakdown-count" style="color: var(--c-success)">${riskCounts.LOW}</div>
              <div class="risk-breakdown-label text-subtle">Low</div>
            </div>
            <div class="risk-breakdown-item">
              <div class="risk-breakdown-count" style="color: #a07800">${riskCounts.MEDIUM}</div>
              <div class="risk-breakdown-label text-subtle">Medium</div>
            </div>
            <div class="risk-breakdown-item">
              <div class="risk-breakdown-count" style="color: var(--c-error)">${riskCounts.HIGH}</div>
              <div class="risk-breakdown-label text-subtle">High</div>
            </div>
            <div class="risk-breakdown-item">
              <div class="risk-breakdown-count" style="color: var(--c-error); font-weight: 600">${riskCounts['VERY HIGH']}</div>
              <div class="risk-breakdown-label text-subtle">Very High</div>
            </div>
          </div>
        </div>

        <div class="card-elevated evaluate-panel">
          <div class="evaluate-title">Quick Risk Evaluate</div>
          <div class="evaluate-row">
            <input type="text" class="search-input" id="eval-input"
              placeholder="Enter Subscriber ID (e.g. SUB_S01_CONC)" style="flex:1" />
            <button class="search-btn" id="eval-btn">Evaluate</button>
          </div>
          <div id="eval-result" style="display:none"></div>
        </div>
      </div>

      <!-- Recent Investigations Table -->
      <div class="card">
        <div class="card-title">Recent Investigations</div>
        ${recentInv.length === 0
          ? '<div class="empty-state">No investigations found.</div>'
          : `<div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Subscriber ID</th>
                    <th>Risk Score</th>
                    <th>Risk Level</th>
                    <th>Status</th>
                    <th>Rules Triggered</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentInv.map(inv => `
                    <tr class="clickable" onclick="navigate('subscriber/${escHtml(inv.subscriber_id)}')">
                      <td class="mono text-primary">${escHtml(inv.subscriber_id)}</td>
                      <td><span class="risk-score" style="${riskScoreTextColor(inv.risk_level)}">${escHtml(String(inv.risk_score))}</span></td>
                      <td>${riskBadge(inv.risk_level)}</td>
                      <td>${invStatusBadge(inv.status)}</td>
                      <td class="text-muted" style="font-size:12px">${escHtml(rulesToString(inv.rules_triggered))}</td>
                      <td class="text-subtle" style="font-size:12px">${fmtDatetime(inv.updated_at)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
        <div style="padding: var(--sp-sm) 0">
          <button class="btn btn-ghost btn-sm" onclick="navigate('investigations')">View all investigations →</button>
        </div>
      </div>
    `);

    // Evaluate button handler
    document.getElementById('eval-btn').addEventListener('click', () => {
      const id = document.getElementById('eval-input').value.trim();
      if (!id) return;
      runEvaluate(id, document.getElementById('eval-result'));
    });
    document.getElementById('eval-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('eval-btn').click();
    });

  } catch (err) {
    errorState('Could not load dashboard: ' + err.message);
  }
}

async function runEvaluate(id, resultEl) {
  resultEl.style.display = 'block';
  resultEl.className = 'evaluate-result';
  resultEl.innerHTML = '<div class="loading-spinner" style="width:20px;height:20px;margin:auto"></div>';

  try {
    const res = await apiFetch(`/api/subscribers/${encodeURIComponent(id)}/evaluate`, { method: 'POST' });
    const score = res.risk_score;
    const level = res.risk_level;
    const rules = rulesToString(res.rules_triggered);

    let cls = 'success';
    if (level === 'HIGH' || level === 'VERY HIGH') cls = 'error-result';
    else if (level === 'MEDIUM') cls = 'warning';

    resultEl.className = 'evaluate-result ' + cls;
    resultEl.innerHTML = `
      <div class="eval-score-display">
        <div class="eval-score-num" style="${riskScoreTextColor(level)}">${score}</div>
        <div class="eval-score-info">
          <div class="eval-score-level">${escHtml(id)} — ${riskBadge(level)}</div>
          <div class="eval-rules-list">${rules ? 'Rules: ' + escHtml(rules) : 'No rules triggered'}</div>
        </div>
      </div>
    `;
    showToast(`Risk evaluated: ${id} → ${level} (${score} pts)`);
  } catch (err) {
    resultEl.className = 'evaluate-result error-result';
    resultEl.textContent = '⚠ ' + err.message;
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 2: SUBSCRIBERS LIST
   ═══════════════════════════════════════════════════════════ */

async function renderSubscribers() {
  setBreadcrumb('Subscribers');
  loading();

  const q      = state.subscriberQuery;
  const limit  = state.subscriberLimit;
  const offset = state.subscriberOffset;

  try {
    const list = await apiFetch(`/api/subscribers?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);

    setContent(`
      <div class="page-header">
        <h1 class="page-title">Subscribers</h1>
        <p class="page-subtitle">All registered telecom subscribers. Click a row to view full profile.</p>
      </div>

      <div class="search-bar">
        <input type="text" class="search-input" id="sub-search"
          placeholder="Search by ID, state, or KYC status…" value="${escHtml(q)}" />
        <button class="search-btn" id="sub-search-btn">Search</button>
      </div>

      <div class="table-wrapper">
        <table class="data-table" id="sub-table">
          <thead>
            <tr>
              <th>Subscriber ID</th>
              <th>State</th>
              <th>District</th>
              <th>KYC Status</th>
              <th>SIM Count</th>
              <th>PoS ID</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No subscribers found.</td></tr>'
              : list.map(s => `
                <tr class="clickable" onclick="navigate('subscriber/${escHtml(s.subscriber_id)}')">
                  <td class="mono text-primary">${escHtml(s.subscriber_id)}</td>
                  <td>${escHtml(s.state)}</td>
                  <td>${escHtml(s.district)}</td>
                  <td>${kycBadge(s.kyc_status)}</td>
                  <td>${s.sim_count}</td>
                  <td class="text-muted mono" style="font-size:12px">${escHtml(s.pos_id)}</td>
                  <td class="text-subtle" style="font-size:12px">${fmtDate(s.registration_date)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="pagination-info">Showing ${offset + 1}–${offset + list.length} (${list.length < limit ? 'end of results' : 'more available'})</span>
        <button class="pagination-btn" id="prev-btn" ${offset === 0 ? 'disabled' : ''}>← Previous</button>
        <button class="pagination-btn" id="next-btn" ${list.length < limit ? 'disabled' : ''}>Next →</button>
      </div>
    `);

    // Event handlers
    document.getElementById('sub-search-btn').addEventListener('click', () => {
      state.subscriberQuery  = document.getElementById('sub-search').value.trim();
      state.subscriberOffset = 0;
      renderSubscribers();
    });
    document.getElementById('sub-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('sub-search-btn').click();
    });
    document.getElementById('prev-btn').addEventListener('click', () => {
      state.subscriberOffset = Math.max(0, offset - limit);
      renderSubscribers();
    });
    document.getElementById('next-btn').addEventListener('click', () => {
      state.subscriberOffset = offset + limit;
      renderSubscribers();
    });

  } catch (err) {
    errorState('Could not load subscribers: ' + err.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 3: SUBSCRIBER DETAIL
   ═══════════════════════════════════════════════════════════ */

async function renderSubscriberDetail(id) {
  setBreadcrumb(`Subscribers / ${id}`);
  loading();

  try {
    const sub = await apiFetch(`/api/subscribers/${encodeURIComponent(id)}`);

    const simsRows = (sub.sims || []).map(s => `
      <tr>
        <td class="mono" style="font-size:12px">${escHtml(s.sim_id || s.msisdn || '—')}</td>
        <td class="mono" style="font-size:12px">${escHtml(s.msisdn || '—')}</td>
        <td>${escHtml(s.status || '—')}</td>
        <td class="text-subtle" style="font-size:12px">${fmtDate(s.activation_date)}</td>
      </tr>
    `).join('');

    const deviceTiles = (sub.recent_devices || []).map(d => `
      <div class="device-tile">
        <div class="device-tile-model">${escHtml(d.device_model || d.manufacturer || '—')}</div>
        <div class="device-tile-imei">${escHtml(d.imei || d.device_id || '—')}</div>
        ${deviceBadge(d.status || 'NORMAL')}
      </div>
    `).join('');

    const eventsRows = (sub.recent_events || []).slice(0, 20).map(e => `
      <tr>
        <td class="mono" style="font-size:12px">${escHtml(e.msisdn || e.sim_id || '—')}</td>
        <td>${escHtml(e.event_type || e.network_type || '—')}</td>
        <td>${escHtml(e.cell_id || e.location_id || '—')}</td>
        <td>${escHtml(e.state || '—')}</td>
        <td class="text-subtle" style="font-size:12px">${fmtDatetime(e.event_timestamp || e.timestamp)}</td>
      </tr>
    `).join('');

    const assessments = sub.recent_assessments || [];
    const timelineHtml = assessments.length === 0
      ? '<div class="empty-state">No risk assessments yet. Click "Evaluate Risk" to run the first assessment.</div>'
      : `<div class="timeline">
          ${assessments.map(a => {
            const sc = a.risk_score || 0;
            const lvl = a.risk_level || 'LOW';
            return `
            <div class="timeline-item">
              <div class="timeline-score">
                <span class="timeline-score-val" style="${riskScoreTextColor(lvl)}">${sc}</span>
                <span class="timeline-score-max">/100</span>
              </div>
              <div class="timeline-body">
                <div class="timeline-level">${riskBadge(lvl)}</div>
                <div class="timeline-rules">${escHtml(rulesToString(a.rules_triggered)) || 'No rules triggered'}</div>
                <div class="timeline-ts">${fmtDatetime(a.evaluated_at || a.created_at)}</div>
              </div>
            </div>`;
          }).join('')}
        </div>`;

    setContent(`
      <div class="breadcrumb">
        <a href="#subscribers">Subscribers</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${escHtml(id)}</span>
      </div>

      <!-- Header -->
      <div class="detail-header">
        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Subscriber ID</span>
            <span class="detail-meta-value mono text-primary">${escHtml(sub.subscriber_id)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">KYC Status</span>
            <span class="detail-meta-value">${kycBadge(sub.kyc_status)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">State</span>
            <span class="detail-meta-value">${escHtml(sub.state)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">District</span>
            <span class="detail-meta-value">${escHtml(sub.district)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">PoS ID</span>
            <span class="detail-meta-value mono" style="font-size:12px">${escHtml(sub.pos_id)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Registered</span>
            <span class="detail-meta-value">${fmtDate(sub.registration_date)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">SIM Count</span>
            <span class="detail-meta-value">${(sub.sims || []).length}</span>
          </div>
        </div>
        <button class="btn btn-primary" id="evaluate-btn">Evaluate Risk</button>
      </div>

      <div id="detail-eval-result"></div>

      <!-- SIMs Section -->
      <div class="detail-section">
        <div class="detail-section-title">Associated SIM Cards (${(sub.sims || []).length})</div>
        ${(sub.sims || []).length === 0
          ? '<div class="empty-state">No SIM cards found.</div>'
          : `<div class="table-wrapper">
              <table class="data-table">
                <thead><tr><th>SIM ID</th><th>MSISDN</th><th>Status</th><th>Activation Date</th></tr></thead>
                <tbody>${simsRows}</tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Devices Section -->
      <div class="detail-section">
        <div class="detail-section-title">Recent Devices (${(sub.recent_devices || []).length})</div>
        ${(sub.recent_devices || []).length === 0
          ? '<div class="empty-state">No devices found.</div>'
          : `<div class="device-tile-grid">${deviceTiles}</div>`
        }
      </div>

      <!-- Network Events Section -->
      <div class="detail-section">
        <div class="detail-section-title">Network Events (last 20)</div>
        ${(sub.recent_events || []).length === 0
          ? '<div class="empty-state">No network events found.</div>'
          : `<div class="table-wrapper" style="max-height:320px;overflow-y:auto">
              <table class="data-table">
                <thead><tr><th>MSISDN</th><th>Event Type</th><th>Cell / Location</th><th>State</th><th>Timestamp</th></tr></thead>
                <tbody>${eventsRows}</tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Risk Assessment History -->
      <div class="detail-section">
        <div class="detail-section-title">Risk Assessment History (${assessments.length})</div>
        ${timelineHtml}
      </div>
    `);

    // Evaluate button
    document.getElementById('evaluate-btn').addEventListener('click', () => {
      const btn = document.getElementById('evaluate-btn');
      btn.disabled = true;
      btn.textContent = 'Evaluating…';
      const resultEl = document.getElementById('detail-eval-result');
      resultEl.style.display = 'block';
      runEvaluate(id, resultEl).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Evaluate Risk';
      });
    });

  } catch (err) {
    errorState(`Could not load subscriber "${id}": ` + err.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 4: DEVICES LIST
   ═══════════════════════════════════════════════════════════ */

async function renderDevices() {
  setBreadcrumb('Devices');
  loading();

  const q      = state.deviceQuery;
  const limit  = state.deviceLimit;
  const offset = state.deviceOffset;

  try {
    const list = await apiFetch(`/api/devices?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);

    setContent(`
      <div class="page-header">
        <h1 class="page-title">Devices</h1>
        <p class="page-subtitle">All registered IMEIs and device profiles.</p>
      </div>

      <div class="search-bar">
        <input type="text" class="search-input" id="dev-search"
          placeholder="Search by IMEI, model, or manufacturer…" value="${escHtml(q)}" />
        <button class="search-btn" id="dev-search-btn">Search</button>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>IMEI</th>
              <th>Model</th>
              <th>Manufacturer</th>
              <th>Status</th>
              <th>TAC</th>
              <th>First Seen</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No devices found.</td></tr>'
              : list.map(d => `
                <tr>
                  <td class="mono" style="font-size:12px">${escHtml(d.imei)}</td>
                  <td>${escHtml(d.device_model)}</td>
                  <td class="text-muted">${escHtml(d.manufacturer)}</td>
                  <td>${deviceBadge(d.status)}</td>
                  <td class="mono text-subtle" style="font-size:12px">${escHtml(d.tac)}</td>
                  <td class="text-subtle" style="font-size:12px">${fmtDate(d.first_seen)}</td>
                  <td class="text-subtle" style="font-size:12px">${fmtDate(d.last_seen)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="pagination-info">Showing ${offset + 1}–${offset + list.length}</span>
        <button class="pagination-btn" id="dev-prev-btn" ${offset === 0 ? 'disabled' : ''}>← Previous</button>
        <button class="pagination-btn" id="dev-next-btn" ${list.length < limit ? 'disabled' : ''}>Next →</button>
      </div>
    `);

    document.getElementById('dev-search-btn').addEventListener('click', () => {
      state.deviceQuery  = document.getElementById('dev-search').value.trim();
      state.deviceOffset = 0;
      renderDevices();
    });
    document.getElementById('dev-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('dev-search-btn').click();
    });
    document.getElementById('dev-prev-btn').addEventListener('click', () => {
      state.deviceOffset = Math.max(0, offset - limit);
      renderDevices();
    });
    document.getElementById('dev-next-btn').addEventListener('click', () => {
      state.deviceOffset = offset + limit;
      renderDevices();
    });

  } catch (err) {
    errorState('Could not load devices: ' + err.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 5: INVESTIGATIONS
   ═══════════════════════════════════════════════════════════ */

async function renderInvestigations() {
  setBreadcrumb('Investigations');
  loading();

  try {
    const all = await apiFetch('/api/investigations');
    const invList = Array.isArray(all) ? all : [];
    renderInvestigationPage(invList);
  } catch (err) {
    errorState('Could not load investigations: ' + err.message);
  }
}

function renderInvestigationPage(invList) {
  const filter = state.invFilter;
  const filtered = filter === 'ALL'
    ? invList
    : invList.filter(i => i.status === filter);

  const tabs = ['ALL', 'PENDING', 'UNDER_REVIEW', 'RESOLVED'];
  const tabCounts = {};
  tabs.forEach(t => {
    tabCounts[t] = t === 'ALL' ? invList.length : invList.filter(i => i.status === t).length;
  });

  const cardsHtml = filtered.length === 0
    ? '<div class="empty-state">No investigations match this filter.</div>'
    : `<div class="inv-grid">
        ${filtered.map(inv => {
          const score = inv.risk_score || 0;
          const pct   = Math.min(100, score);
          const cls   = riskScoreColor(score);
          const rules = rulesToString(inv.rules_triggered);
          return `
          <div class="inv-card">
            <div class="inv-card-header">
              <div>
                <div class="inv-id">${escHtml(inv.investigation_id)}</div>
                <div class="inv-sub">${escHtml(inv.subscriber_id)}</div>
              </div>
              ${invStatusBadge(inv.status)}
            </div>

            <div class="inv-score-row">
              <div class="inv-score-bar">
                <div class="inv-score-fill ${cls}" style="width:${pct}%"></div>
              </div>
              <span class="risk-score" style="${riskScoreTextColor(inv.risk_level)}">${score}</span>
              ${riskBadge(inv.risk_level)}
            </div>

            ${rules ? `<div class="inv-rules text-muted">Rules: ${escHtml(rules)}</div>` : ''}
            <div class="inv-meta">
              ${inv.investigator_id ? `Investigator: ${escHtml(inv.investigator_id)} &nbsp;·&nbsp; ` : ''}
              Updated: ${fmtDatetime(inv.updated_at)}
            </div>
            ${inv.notes ? `<div class="inv-meta" style="font-style:italic">"${escHtml(inv.notes)}"</div>` : ''}

            <div class="inv-card-footer">
              <button class="btn btn-tertiary btn-sm" onclick="openInvestigationModal(${escHtml(JSON.stringify(inv))})">Update</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

  setContent(`
    <div class="page-header">
      <h1 class="page-title">Investigations</h1>
      <p class="page-subtitle">Active fraud investigation queue. Update status and notes per case.</p>
    </div>

    <div class="tab-strip">
      ${tabs.map(t => `
        <button class="tab-btn ${filter === t ? 'active' : ''}"
          onclick="state.invFilter='${t}'; renderInvestigationPageFromCache(invListCache)">
          ${t.replace('_', ' ')} <span style="color:var(--c-ink-subtle);font-size:12px">(${tabCounts[t]})</span>
        </button>
      `).join('')}
    </div>

    ${cardsHtml}
  `);

  // Store list in a module-level cache for tab switching
  window.invListCache = invList;
}

window.renderInvestigationPageFromCache = function(list) {
  renderInvestigationPage(list || []);
};

/* ── Investigation Update Modal ──────────────────────────── */

window.openInvestigationModal = function(inv) {
  state.currentInvestigation = inv;
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = `Update — ${inv.subscriber_id}`;

  body.innerHTML = `
    <div class="input-wrap">
      <label class="input-label" for="modal-status">Status</label>
      <select class="select-field" id="modal-status">
        <option value="PENDING"      ${inv.status === 'PENDING'      ? 'selected' : ''}>PENDING</option>
        <option value="UNDER_REVIEW" ${inv.status === 'UNDER_REVIEW' ? 'selected' : ''}>UNDER_REVIEW</option>
        <option value="RESOLVED"     ${inv.status === 'RESOLVED'     ? 'selected' : ''}>RESOLVED</option>
      </select>
    </div>
    <div class="input-wrap">
      <label class="input-label" for="modal-investigator">Investigator ID</label>
      <input type="text" class="input-field" id="modal-investigator"
        placeholder="Officer ID or name" value="${escHtml(inv.investigator_id || '')}" />
    </div>
    <div class="input-wrap">
      <label class="input-label" for="modal-notes">Notes</label>
      <textarea class="textarea-field" id="modal-notes" placeholder="Investigation notes…">${escHtml(inv.notes || '')}</textarea>
    </div>
    <div style="font-size:12px;color:var(--c-ink-subtle)">
      Investigation ID: <span class="mono">${escHtml(inv.investigation_id)}</span><br/>
      Risk: ${riskBadge(inv.risk_level)} — Score: ${inv.risk_score}
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
};

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.currentInvestigation = null;
}

async function submitModal() {
  const inv = state.currentInvestigation;
  if (!inv) return;

  const btn = document.getElementById('modal-submit');
  btn.disabled = true;
  btn.textContent = 'Updating…';

  const payload = {
    status:         document.getElementById('modal-status').value,
    investigator_id: document.getElementById('modal-investigator').value.trim() || null,
    notes:          document.getElementById('modal-notes').value.trim() || null,
  };

  try {
    await apiFetch(`/api/investigations/${encodeURIComponent(inv.investigation_id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    closeModal();
    showToast(`Investigation ${inv.investigation_id} updated to ${payload.status}.`);
    renderInvestigations();
  } catch (err) {
    showToast('Error: ' + err.message, 6000);
    btn.disabled = false;
    btn.textContent = 'Update';
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 6: AUDIT LOG
   ═══════════════════════════════════════════════════════════ */

async function renderAuditLog() {
  setBreadcrumb('Audit Log');
  loading();

  try {
    const logs = await apiFetch('/api/audit_logs');
    const list = Array.isArray(logs) ? logs : [];

    setContent(`
      <div class="page-header">
        <h1 class="page-title">Audit Log</h1>
        <p class="page-subtitle">Full system audit trail — all actions recorded chronologically.</p>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Target</th>
              <th>User / System</th>
              <th>Details</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0
              ? '<tr><td colspan="5" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No audit log entries.</td></tr>'
              : list.map(log => `
                <tr>
                  <td><span class="audit-action">${escHtml(log.action || log.event_type || '—')}</span></td>
                  <td class="mono text-primary" style="font-size:12px">${escHtml(log.target_id || log.subscriber_id || '—')}</td>
                  <td class="text-muted">${escHtml(log.performed_by || log.user || 'system')}</td>
                  <td class="text-muted" style="font-size:12px;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${escHtml(typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || ''))}">
                    ${escHtml(typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—')).slice(0, 120)}
                  </td>
                  <td class="text-subtle" style="font-size:12px;white-space:nowrap">${fmtDatetime(log.created_at || log.timestamp)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    `);

  } catch (err) {
    errorState('Could not load audit log: ' + err.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   MODAL EVENT WIRING
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-close').addEventListener('click',  closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-submit').addEventListener('click', submitModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Initial backend check + routing
  checkBackend();
  setInterval(checkBackend, 30000);

  router();
});
