/* ═══════════════════════════════════════════════════════════
   TRINETRA — app.js (Iteration 3)
   SPA Router + API Layer + Page Renderers + Manual Data Entry
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
  subscriberKycFilter: 'ALL',
  subscriberStateFilter: 'ALL',
  deviceOffset: 0,
  deviceLimit: 25,
  deviceQuery: '',
  deviceStatusFilter: 'ALL',
  invFilter: 'ALL',
  currentInvestigation: null,
  activeSideTab: 'subscriber',
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
  if (dot) dot.className = 'status-dot ' + cls;
  if (lbl) lbl.textContent = label;
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
  const cls = status === 'STOLEN' ? 'badge-stolen' : status === 'LOST' ? 'badge-pending-inv' : 'badge-normal';
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
  const el = document.getElementById('utility-breadcrumb');
  if (el) el.textContent = text;
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════ */

let toastTimer = null;

function showToast(msg, durationMs = 4000) {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toast-message').textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), durationMs);
}

/* ═══════════════════════════════════════════════════════════
   PILLAR A1: RISK SCORE SPARKLINE CANVAS RENDERER
   ═══════════════════════════════════════════════════════════ */

function renderRiskSparkline(canvasId, assessments) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (!assessments || assessments.length === 0) {
    ctx.fillStyle = '#6e6e6e';
    ctx.font = '12px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No historical assessment points available', w / 2, h / 2);
    return;
  }

  // Sort chronologically (oldest to newest)
  const sorted = [...assessments].sort((a, b) => new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at));

  const padL = 70;
  const padR = 30;
  const padT = 25;
  const padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Threshold lines at 25, 50, 75
  const thresholds = [
    { val: 25, label: '25 (MEDIUM)', color: 'rgba(241, 194, 27, 0.4)' },
    { val: 50, label: '50 (HIGH)',   color: 'rgba(218, 30, 40, 0.4)' },
    { val: 75, label: '75 (V.HIGH)', color: 'rgba(255, 0, 50, 0.6)' },
  ];

  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = '10px IBM Plex Sans, sans-serif';
  thresholds.forEach(t => {
    const y = padT + chartH * (1 - t.val / 100);
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();

    ctx.fillStyle = '#8d8d8d';
    ctx.textAlign = 'right';
    ctx.fillText(t.label, padL - 6, y + 3);
  });
  ctx.setLineDash([]);

  // Plot data points
  const points = sorted.map((item, idx) => {
    const score = Math.min(100, Math.max(0, item.risk_score || 0));
    const x = sorted.length === 1 ? padL + chartW / 2 : padL + (idx / (sorted.length - 1)) * chartW;
    const y = padT + chartH * (1 - score / 100);
    return { x, y, score, item };
  });

  // Vertical gradient fill under sparkline
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(218, 30, 40, 0.35)');
  grad.addColorStop(0.5, 'rgba(241, 194, 27, 0.25)');
  grad.addColorStop(1, 'rgba(36, 161, 72, 0.15)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = '#0f62fe';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw dots and score bubbles
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.score >= 50 ? '#da1e28' : p.score >= 25 ? '#f1c21b' : '#24a148';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#f4f4f4';
    ctx.font = 'bold 11px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.score, p.x, p.y - 8);
  });
}

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

    const allSubs = await apiFetch('/api/subscribers?limit=10000');
    const allDevs = await apiFetch('/api/devices?limit=10000');

    const totalSubs  = Array.isArray(allSubs) ? allSubs.length : 0;
    const totalDevs  = Array.isArray(allDevs) ? allDevs.length : 0;
    const invList    = Array.isArray(investigations) ? investigations : [];
    const activeInv  = invList.filter(i => i.status !== 'RESOLVED').length;

    const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, 'VERY HIGH': 0 };
    invList.forEach(i => {
      const lvl = i.risk_level;
      if (riskCounts.hasOwnProperty(lvl)) riskCounts[lvl]++;
    });

    const recentInv = invList.slice(0, 8);

    let mlCardHtml = '';
    try {
      const mlRes = await apiFetch('/api/ml/status');
      if (mlRes.status === 'trained' && mlRes.metadata) {
        const m = mlRes.metadata;
        const topFeats = Object.entries(m.feature_importances || {}).slice(0, 4);
        mlCardHtml = `
          <div class="ml-card mb-lg">
            <div class="ml-card-header">
              <div class="ml-card-title">🧠 Machine Learning Intelligence Layer (Phase 2)</div>
              <span class="ml-badge">● TRAINED & ACTIVE</span>
            </div>
            <div class="ml-metrics-grid">
              <div class="ml-metric-box">
                <div class="ml-metric-label">Trained Samples</div>
                <div class="ml-metric-val">${m.total_samples || 0}</div>
              </div>
              <div class="ml-metric-box">
                <div class="ml-metric-label">Precision</div>
                <div class="ml-metric-val" style="color:var(--c-success)">${((m.metrics?.precision || 1.0) * 100).toFixed(0)}%</div>
              </div>
              <div class="ml-metric-box">
                <div class="ml-metric-label">F1 / Recall</div>
                <div class="ml-metric-val" style="color:var(--c-primary)">${((m.metrics?.f1_score || 1.0) * 100).toFixed(0)}%</div>
              </div>
              <div class="ml-metric-box">
                <div class="ml-metric-label">ROC-AUC</div>
                <div class="ml-metric-val" style="color:var(--c-primary)">${(m.metrics?.roc_auc || 1.0).toFixed(2)}</div>
              </div>
            </div>
            <div style="margin-top:12px;font-size:12px;color:var(--c-ink-muted)">
              <strong>Top Feature Importances (Random Forest):</strong>
              <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">
                ${topFeats.map(([f, imp]) => `
                  <div class="ml-factor-bar">
                    <span class="ml-factor-name">${f}</span>
                    <div class="ml-factor-track"><div class="ml-factor-fill" style="width:${(imp * 100).toFixed(0)}%"></div></div>
                    <span style="font-size:11px">${(imp * 100).toFixed(1)}%</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }
    } catch (e) {}

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

      ${mlCardHtml}

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

      <!-- Pillar A2: Bulk Evaluate Queue -->
      <div class="bulk-eval-card">
        <div class="flex-between">
          <div>
            <div class="card-title" style="margin:0">Bulk Evaluate Queue (Pillar A2)</div>
            <div class="text-subtle" style="font-size:12px;margin-top:2px">Sequentially re-evaluate flagged subscribers and auto-trigger investigations</div>
          </div>
          <div class="flex-between gap-sm">
            <select class="filter-select" id="bulk-filter-select">
              <option value="ALL_FLAGGED">All Flagged (SIM > 9 OR KYC Pending)</option>
              <option value="SIM_CONCENTRATION">High SIM Concentration (SIM > 9)</option>
              <option value="KYC_PENDING">KYC Status = PENDING</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-run-bulk-eval">Evaluate Flagged Queue</button>
          </div>
        </div>
        <div class="bulk-progress-bg">
          <div class="bulk-progress-fill" id="bulk-progress-fill"></div>
        </div>
        <div class="flex-between" style="font-size:12px;color:var(--c-ink-muted)">
          <span id="bulk-status-text">Ready to run queue</span>
        </div>
        <div class="rolling-log-box" id="bulk-log-box">[System Idle] Click "Evaluate Flagged Queue" to begin processing.</div>
      </div>

      <!-- Recent Investigations Table -->
      <div class="card mt-lg">
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
      </div>
    `);

    // Wire single evaluate
    document.getElementById('eval-btn').addEventListener('click', () => {
      const id = document.getElementById('eval-input').value.trim();
      if (!id) return;
      runEvaluate(id, document.getElementById('eval-result'));
    });
    document.getElementById('eval-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('eval-btn').click();
    });

    // Wire bulk evaluate
    document.getElementById('btn-run-bulk-eval').addEventListener('click', runBulkEvaluate);

  } catch (err) {
    errorState('Could not load dashboard: ' + err.message);
  }
}

async function runEvaluate(id, resultEl) {
  resultEl.style.display = 'block';
  resultEl.className = 'evaluate-result loading-result';
  resultEl.textContent = 'Evaluating subscriber…';

  try {
    const res = await apiFetch(`/api/subscribers/${encodeURIComponent(id)}/evaluate`, { method: 'POST' });
    const score = res.risk_score;
    const level = res.risk_level;
    const rules = rulesToString(res.rules_triggered);

    resultEl.className = 'evaluate-result success-result';
    resultEl.innerHTML = `
      <div class="eval-score-row">
        <div class="eval-score-circle ${riskScoreColor(score)}">${score}</div>
        <div>
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

async function runBulkEvaluate() {
  const filterType = document.getElementById('bulk-filter-select').value;
  const btn = document.getElementById('btn-run-bulk-eval');
  const progressFill = document.getElementById('bulk-progress-fill');
  const statusText = document.getElementById('bulk-status-text');
  const logBox = document.getElementById('bulk-log-box');

  btn.disabled = true;
  logBox.textContent = `[${new Date().toLocaleTimeString()}] Fetching subscribers for queue filter (${filterType})…\n`;

  try {
    const subscribers = await apiFetch('/api/subscribers?limit=10000');
    let queue = [];
    if (filterType === 'SIM_CONCENTRATION') {
      queue = subscribers.filter(s => s.sim_count > 9);
    } else if (filterType === 'KYC_PENDING') {
      queue = subscribers.filter(s => s.kyc_status === 'PENDING');
    } else {
      queue = subscribers.filter(s => s.sim_count > 9 || s.kyc_status === 'PENDING' || s.kyc_status === 'REJECTED');
    }

    if (queue.length === 0) {
      logBox.textContent += `[${new Date().toLocaleTimeString()}] No subscribers match filter criteria.\n`;
      btn.disabled = false;
      return;
    }

    logBox.textContent += `[${new Date().toLocaleTimeString()}] Starting sequential evaluation of ${queue.length} subscriber(s)…\n`;

    let done = 0;
    for (const sub of queue) {
      try {
        const res = await apiFetch(`/api/subscribers/${encodeURIComponent(sub.subscriber_id)}/evaluate`, { method: 'POST' });
        done++;
        const pct = Math.round((done / queue.length) * 100);
        progressFill.style.width = pct + '%';
        statusText.textContent = `Evaluating: ${done} / ${queue.length} (${pct}%)`;
        logBox.textContent += `[${new Date().toLocaleTimeString()}] Evaluated ${sub.subscriber_id} → Score: ${res.risk_score} (${res.risk_level})\n`;
        logBox.scrollTop = logBox.scrollHeight;
      } catch (e) {
        done++;
        logBox.textContent += `[${new Date().toLocaleTimeString()}] Error evaluating ${sub.subscriber_id}: ${e.message}\n`;
      }
    }

    logBox.textContent += `[${new Date().toLocaleTimeString()}] Bulk evaluation complete! Refreshing dashboard metrics…\n`;
    showToast(`Bulk Evaluation Complete: ${queue.length} subscribers processed.`);
    setTimeout(renderDashboard, 1200);
  } catch (err) {
    logBox.textContent += `[ERROR] ${err.message}\n`;
  } finally {
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGE 2: SUBSCRIBERS LIST (With Pillar A3 Column Filters)
   ═══════════════════════════════════════════════════════════ */

async function renderSubscribers() {
  setBreadcrumb('Subscribers');
  loading();

  const q      = state.subscriberQuery;
  const limit  = state.subscriberLimit;
  const offset = state.subscriberOffset;

  try {
    const list = await apiFetch(`/api/subscribers?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);

    const allStates = Array.from(new Set(list.map(s => s.state).filter(Boolean))).sort();

    let filteredList = list;
    if (state.subscriberKycFilter !== 'ALL') {
      filteredList = filteredList.filter(s => s.kyc_status === state.subscriberKycFilter);
    }
    if (state.subscriberStateFilter !== 'ALL') {
      filteredList = filteredList.filter(s => s.state === state.subscriberStateFilter);
    }

    setContent(`
      <div class="page-header flex-between">
        <div>
          <h1 class="page-title">Subscribers</h1>
          <p class="page-subtitle">All registered telecom subscribers. Click a row to view full profile.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openDataEntryPanel('subscriber')">⊕ Register Subscriber</button>
      </div>

      <div class="search-bar">
        <input type="text" class="search-input" id="sub-search"
          placeholder="Search by ID, state, or KYC status… (/ to focus)" value="${escHtml(q)}" />
        <button class="search-btn" id="sub-search-btn">Search</button>
      </div>

      <!-- Pillar A3: Column Filter Bar -->
      <div class="table-filter-bar">
        <div class="table-filter-item">
          <span>KYC Filter:</span>
          <select class="filter-select" id="filter-sub-kyc">
            <option value="ALL" ${state.subscriberKycFilter === 'ALL' ? 'selected' : ''}>All KYC Statuses</option>
            <option value="VERIFIED" ${state.subscriberKycFilter === 'VERIFIED' ? 'selected' : ''}>VERIFIED</option>
            <option value="PENDING" ${state.subscriberKycFilter === 'PENDING' ? 'selected' : ''}>PENDING</option>
            <option value="REJECTED" ${state.subscriberKycFilter === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
          </select>
        </div>
        <div class="table-filter-item">
          <span>State Filter:</span>
          <select class="filter-select" id="filter-sub-state">
            <option value="ALL" ${state.subscriberStateFilter === 'ALL' ? 'selected' : ''}>All States</option>
            ${allStates.map(st => `<option value="${escHtml(st)}" ${state.subscriberStateFilter === st ? 'selected' : ''}>${escHtml(st)}</option>`).join('')}
          </select>
        </div>
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
            ${filteredList.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No subscribers match search/filter criteria.</td></tr>'
              : filteredList.map(s => `
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
        <span class="pagination-info">Showing ${offset + 1}–${offset + filteredList.length} (${list.length < limit ? 'end of results' : 'more available'})</span>
        <button class="pagination-btn" id="prev-btn" ${offset === 0 ? 'disabled' : ''}>← Previous</button>
        <button class="pagination-btn" id="next-btn" ${list.length < limit ? 'disabled' : ''}>Next →</button>
      </div>
    `);

    document.getElementById('sub-search-btn').addEventListener('click', () => {
      state.subscriberQuery  = document.getElementById('sub-search').value.trim();
      state.subscriberOffset = 0;
      renderSubscribers();
    });
    document.getElementById('sub-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('sub-search-btn').click();
    });
    document.getElementById('filter-sub-kyc').addEventListener('change', e => {
      state.subscriberKycFilter = e.target.value;
      renderSubscribers();
    });
    document.getElementById('filter-sub-state').addEventListener('change', e => {
      state.subscriberStateFilter = e.target.value;
      renderSubscribers();
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
   PAGE 3: SUBSCRIBER DETAIL (With Sparkline & Contextual Forms)
   ═══════════════════════════════════════════════════════════ */

async function renderSubscriberDetail(id) {
  setBreadcrumb(`Subscribers / ${id}`);
  loading();

  try {
    const sub = await apiFetch(`/api/subscribers/${encodeURIComponent(id)}`);

    const primaryMobile = (sub.sims && sub.sims.length > 0) ? sub.sims[0].mobile_number : '';

    const simsRows = (sub.sims || []).map(s => `
      <tr>
        <td class="mono" style="font-size:12px">${escHtml(s.sim_id || '—')}</td>
        <td class="mono" style="font-size:12px">${escHtml(s.mobile_number || '—')}</td>
        <td>${escHtml(s.operator || '—')}</td>
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
        <td class="mono" style="font-size:12px">${escHtml(e.mobile_number || '—')}</td>
        <td>${escHtml(e.event_type || '—')}</td>
        <td>${escHtml(e.location_id || '—')}</td>
        <td>${escHtml(e.state || '—')}</td>
        <td class="text-subtle" style="font-size:12px">${fmtDatetime(e.timestamp)}</td>
      </tr>
    `).join('');

    const assessments = sub.recent_assessments || [];

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
        <div class="flex-between gap-sm" style="margin-top: var(--sp-md);">
          <button class="btn btn-secondary btn-sm" id="btn-file-fraud-header">⚠ File Fraud Report</button>
          <button class="btn btn-primary" id="evaluate-btn">Evaluate Risk</button>
        </div>
      </div>

      <div id="detail-eval-result"></div>

      ${(() => {
        const latest = assessments.length > 0 ? assessments[0] : null;
        if (latest && latest.ml_score !== null && latest.ml_score !== undefined) {
          const val = Number(latest.ml_score).toFixed(1);
          return `
            <div class="ml-card mt-md mb-md">
              <div class="ml-card-header">
                <div class="ml-card-title">🧠 ML Anomaly Detection (Phase 2 Intelligence)</div>
                <span class="ml-badge">${val}% ANOMALY INDEX</span>
              </div>
              <div style="font-size:12px;color:var(--c-ink-muted)">
                Multi-layer feature vector evaluated using Isolation Forest (unsupervised) + Supervised Random Forest. Contributing weight: 30% of total risk score.
              </div>
            </div>
          `;
        }
        return '';
      })()}

      <!-- Pillar A1: Risk Score Trend Chart -->
      <div class="sparkline-card">
        <div class="sparkline-header">
          <span class="sparkline-title">Risk Score Trend (Pillar A1 Sparkline)</span>
          <span class="text-subtle" style="font-size:12px">${assessments.length} assessment(s) recorded</span>
        </div>
        <div class="sparkline-canvas-container">
          <canvas id="risk-trend-canvas" class="sparkline-canvas"></canvas>
        </div>
      </div>

      <!-- SIMs Section + Add SIM Inline Form -->
      <div class="detail-section">
        <div class="flex-between">
          <div class="detail-section-title" style="margin:0">Associated SIM Cards (${(sub.sims || []).length})</div>
          <button class="btn btn-tertiary btn-sm" onclick="toggleInlineForm('inline-sim-form')">+ Add SIM</button>
        </div>

        <div id="inline-sim-form" class="collapsible-box hidden">
          <div class="card-title">Register New SIM Card to ${escHtml(id)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">Mobile Number <span class="required">*</span></label>
              <input type="text" class="form-input" id="sim-mobile-input" placeholder="e.g. 9876543210" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Operator <span class="required">*</span></label>
              <select class="form-select" id="sim-operator-input">
                <option value="Airtel">Airtel</option>
                <option value="Jio">Jio</option>
                <option value="Vi">Vi</option>
                <option value="BSNL">BSNL</option>
              </select>
            </div>
          </div>
          <div class="form-actions" style="margin-top:12px;padding-top:8px">
            <button class="btn btn-secondary btn-sm" onclick="toggleInlineForm('inline-sim-form')">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btn-submit-inline-sim">Save SIM Card</button>
          </div>
        </div>

        ${(sub.sims || []).length === 0
          ? '<div class="empty-state mt-md">No SIM cards found.</div>'
          : `<div class="table-wrapper mt-md">
              <table class="data-table">
                <thead><tr><th>SIM ID</th><th>Mobile Number</th><th>Operator</th><th>Status</th><th>Activation Date</th></tr></thead>
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

      <!-- Network Events Section + Log CDR Event Inline Form -->
      <div class="detail-section">
        <div class="flex-between">
          <div class="detail-section-title" style="margin:0">Network Events (last 20)</div>
          <button class="btn btn-tertiary btn-sm" onclick="toggleInlineForm('inline-cdr-form')">+ Log CDR Event</button>
        </div>

        <div id="inline-cdr-form" class="collapsible-box hidden">
          <div class="card-title">Log CDR Event manually</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">Mobile Number</label>
              <select class="form-select" id="cdr-mobile-select">
                ${(sub.sims || []).map(s => `<option value="${escHtml(s.mobile_number)}">${escHtml(s.mobile_number)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Event Type</label>
              <select class="form-select" id="cdr-type-select">
                <option value="CALL">CALL</option>
                <option value="SMS">SMS</option>
                <option value="DATA">DATA</option>
                <option value="ROAMING">ROAMING</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Location ID</label>
              <select class="form-select" id="cdr-loc-select">
                <option value="">Loading locations…</option>
              </select>
            </div>
          </div>
          <div class="form-actions" style="margin-top:12px;padding-top:8px">
            <button class="btn btn-secondary btn-sm" onclick="toggleInlineForm('inline-cdr-form')">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btn-submit-inline-cdr">Submit CDR Event</button>
          </div>
        </div>

        ${(sub.recent_events || []).length === 0
          ? '<div class="empty-state mt-md">No network events found.</div>'
          : `<div class="table-wrapper mt-md" style="max-height:320px;overflow-y:auto">
              <table class="data-table">
                <thead><tr><th>Mobile Number</th><th>Event Type</th><th>Location ID</th><th>State</th><th>Timestamp</th></tr></thead>
                <tbody>${eventsRows}</tbody>
              </table>
            </div>`
        }
      </div>
    `);

    // Render Canvas Sparkline
    setTimeout(() => renderRiskSparkline('risk-trend-canvas', assessments), 50);

    // Populate Location dropdown for CDR form asynchronously
    apiFetch('/api/locations').then(locs => {
      const locSelect = document.getElementById('cdr-loc-select');
      if (locSelect && Array.isArray(locs)) {
        locSelect.innerHTML = locs.map(l => `<option value="${escHtml(l.location_id)}">${escHtml(l.location_id)} (${escHtml(l.state)} - ${escHtml(l.district)})</option>`).join('');
      }
    }).catch(() => {});

    // File Fraud Report header button handler
    document.getElementById('btn-file-fraud-header').addEventListener('click', () => {
      openDataEntryPanel('fraud', primaryMobile);
    });

    // Evaluate Risk button handler
    document.getElementById('evaluate-btn').addEventListener('click', () => {
      const btn = document.getElementById('evaluate-btn');
      btn.disabled = true;
      btn.textContent = 'Evaluating…';
      const resultEl = document.getElementById('detail-eval-result');
      resultEl.style.display = 'block';
      runEvaluate(id, resultEl).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Evaluate Risk';
        setTimeout(() => renderSubscriberDetail(id), 1000);
      });
    });

    // Submit Add SIM inline form
    document.getElementById('btn-submit-inline-sim').addEventListener('click', async () => {
      const mobile = document.getElementById('sim-mobile-input').value.trim();
      const operator = document.getElementById('sim-operator-input').value;
      if (!mobile) { showToast('Mobile number is required', 3000); return; }

      try {
        await apiFetch(`/api/subscribers/${encodeURIComponent(id)}/sims`, {
          method: 'POST',
          body: JSON.stringify({ mobile_number: mobile, operator }),
        });
        showToast(`SIM card ${mobile} added successfully.`);
        renderSubscriberDetail(id);
      } catch (err) {
        showToast('Error adding SIM: ' + err.message, 5000);
      }
    });

    // Submit CDR Event inline form
    document.getElementById('btn-submit-inline-cdr').addEventListener('click', async () => {
      const mobile = document.getElementById('cdr-mobile-select').value;
      const event_type = document.getElementById('cdr-type-select').value;
      const location_id = document.getElementById('cdr-loc-select').value;
      const devId = (sub.recent_devices && sub.recent_devices.length > 0) ? sub.recent_devices[0].device_id : 'DEV_MANUAL_001';

      if (!mobile || !location_id) { showToast('Mobile number and location are required', 3000); return; }

      try {
        await apiFetch('/api/network_events', {
          method: 'POST',
          body: JSON.stringify({ mobile_number: mobile, device_id: devId, location_id, event_type }),
        });
        showToast(`Network event (${event_type}) logged for ${mobile}.`);
        renderSubscriberDetail(id);
      } catch (err) {
        showToast('Error logging event: ' + err.message, 5000);
      }
    });

  } catch (err) {
    errorState(`Could not load subscriber "${id}": ` + err.message);
  }
}

function toggleInlineForm(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.toggle('hidden');
}

/* ═══════════════════════════════════════════════════════════
   PAGE 4: DEVICES LIST (With Pillar B4 Row Actions & Column Filters)
   ═══════════════════════════════════════════════════════════ */

async function renderDevices() {
  setBreadcrumb('Devices');
  loading();

  const q      = state.deviceQuery;
  const limit  = state.deviceLimit;
  const offset = state.deviceOffset;

  try {
    const list = await apiFetch(`/api/devices?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);

    let filteredList = list;
    if (state.deviceStatusFilter !== 'ALL') {
      filteredList = filteredList.filter(d => d.status === state.deviceStatusFilter);
    }

    setContent(`
      <div class="page-header flex-between">
        <div>
          <h1 class="page-title">Devices</h1>
          <p class="page-subtitle">All registered IMEIs and device profiles.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openDataEntryPanel('device')">⊕ Register Device</button>
      </div>

      <div class="search-bar">
        <input type="text" class="search-input" id="dev-search"
          placeholder="Search by IMEI, model, or manufacturer… (/ to focus)" value="${escHtml(q)}" />
        <button class="search-btn" id="dev-search-btn">Search</button>
      </div>

      <!-- Pillar A3: Device Column Filter Bar -->
      <div class="table-filter-bar">
        <div class="table-filter-item">
          <span>Status Filter:</span>
          <select class="filter-select" id="filter-dev-status">
            <option value="ALL" ${state.deviceStatusFilter === 'ALL' ? 'selected' : ''}>All Device Statuses</option>
            <option value="NORMAL" ${state.deviceStatusFilter === 'NORMAL' ? 'selected' : ''}>NORMAL</option>
            <option value="STOLEN" ${state.deviceStatusFilter === 'STOLEN' ? 'selected' : ''}>STOLEN</option>
            <option value="LOST" ${state.deviceStatusFilter === 'LOST' ? 'selected' : ''}>LOST</option>
          </select>
        </div>
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
              <th>Last Seen</th>
              <th>Actions (Pillar B4)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredList.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No devices found.</td></tr>'
              : filteredList.map(d => `
                <tr>
                  <td class="mono" style="font-size:12px">${escHtml(d.imei)}</td>
                  <td>${escHtml(d.device_model)}</td>
                  <td class="text-muted">${escHtml(d.manufacturer)}</td>
                  <td>${deviceBadge(d.status)}</td>
                  <td class="mono text-subtle" style="font-size:12px">${escHtml(d.tac)}</td>
                  <td class="text-subtle" style="font-size:12px">${fmtDate(d.last_seen)}</td>
                  <td>
                    ${d.status === 'STOLEN' || d.status === 'LOST'
                      ? `<button class="btn btn-secondary btn-sm" onclick="toggleDeviceStatus('${escHtml(d.device_id)}', 'NORMAL')">Mark Recovered</button>`
                      : `<button class="btn btn-danger btn-sm" onclick="toggleDeviceStatus('${escHtml(d.device_id)}', 'STOLEN')">Mark Stolen</button>`
                    }
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="pagination-info">Showing ${offset + 1}–${offset + filteredList.length}</span>
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
    document.getElementById('filter-dev-status').addEventListener('change', e => {
      state.deviceStatusFilter = e.target.value;
      renderDevices();
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

async function toggleDeviceStatus(deviceId, newStatus) {
  try {
    await apiFetch(`/api/devices/${encodeURIComponent(deviceId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Device ${deviceId} marked as ${newStatus}.`);
    renderDevices();
  } catch (err) {
    showToast('Error updating device: ' + err.message, 5000);
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

  window.invListCache = invList;
}

window.renderInvestigationPageFromCache = function(list) {
  renderInvestigationPage(list || []);
};

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
    status:          document.getElementById('modal-status').value,
    investigator_id: document.getElementById('modal-investigator').value.trim() || null,
    notes:           document.getElementById('modal-notes').value.trim() || null,
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
              <th>User</th>
              <th>Details</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0
              ? '<tr><td colspan="4" style="text-align:center;color:var(--c-ink-subtle);padding:32px">No audit log entries.</td></tr>'
              : list.map(log => `
                <tr>
                  <td><span class="audit-action">${escHtml(log.action || '—')}</span></td>
                  <td class="text-muted">${escHtml(log.user || 'system')}</td>
                  <td class="text-muted" style="font-size:12px;max-width:480px" title="${escHtml(log.details)}">
                    ${escHtml(log.details)}
                  </td>
                  <td class="text-subtle" style="font-size:12px;white-space:nowrap">${fmtDatetime(log.timestamp)}</td>
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
   PILLAR B: DATA ENTRY SIDE PANEL & FORMS
   ═══════════════════════════════════════════════════════════ */

function openDataEntryPanel(tab = 'subscriber', prefillMobile = '') {
  const overlay = document.getElementById('side-panel-overlay');
  const panel = document.getElementById('side-panel');
  if (overlay && panel) {
    overlay.classList.remove('hidden');
    panel.classList.remove('hidden');
  }
  switchDataEntryTab(tab, prefillMobile);
}

function closeDataEntryPanel() {
  const overlay = document.getElementById('side-panel-overlay');
  const panel = document.getElementById('side-panel');
  if (overlay && panel) {
    overlay.classList.add('hidden');
    panel.classList.add('hidden');
  }
}

function switchDataEntryTab(tab, prefillMobile = '') {
  state.activeSideTab = tab;
  document.querySelectorAll('.side-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const body = document.getElementById('side-panel-body');
  if (!body) return;

  switch (tab) {
    case 'subscriber': renderSubscriberForm(body); break;
    case 'device':     renderDeviceForm(body);     break;
    case 'fraud':      renderFraudReportForm(body, prefillMobile); break;
    case 'pos':        renderPosForm(body);        break;
  }
}

async function renderSubscriberForm(container) {
  container.innerHTML = `
    <form id="form-create-subscriber">
      <div class="form-group">
        <label class="form-label">Subscriber ID <span class="form-hint">(Optional — auto-generated if blank)</span></label>
        <input type="text" class="form-input" id="sub-id-input" placeholder="e.g. SUB_MANUAL_101" />
      </div>

      <div class="form-group">
        <label class="form-label">KYC Status <span class="required">*</span></label>
        <select class="form-select" id="sub-kyc-input">
          <option value="PENDING">PENDING</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">State <span class="required">*</span></label>
        <input type="text" class="form-input" id="sub-state-input" placeholder="e.g. Delhi" required />
      </div>

      <div class="form-group">
        <label class="form-label">District <span class="required">*</span></label>
        <input type="text" class="form-input" id="sub-district-input" placeholder="e.g. New Delhi" required />
      </div>

      <div class="form-group">
        <label class="form-label">Point of Sale (PoS ID) <span class="required">*</span></label>
        <select class="form-select" id="sub-pos-input" required>
          <option value="">Loading PoS locations…</option>
        </select>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeDataEntryPanel()">Cancel</button>
        <button type="submit" class="btn btn-primary">Register Subscriber</button>
      </div>
    </form>
  `;

  try {
    const posList = await apiFetch('/api/pos');
    const select = document.getElementById('sub-pos-input');
    if (select && Array.isArray(posList)) {
      if (posList.length === 0) {
        select.innerHTML = '<option value="POS_001">POS_001 (Default)</option>';
      } else {
        select.innerHTML = posList.map(p => `<option value="${escHtml(p.pos_id)}">${escHtml(p.pos_id)} (${escHtml(p.region)} - ${escHtml(p.operator)})</option>`).join('');
      }
    }
  } catch {
    const select = document.getElementById('sub-pos-input');
    if (select) select.innerHTML = '<option value="POS_001">POS_001</option>';
  }

  document.getElementById('form-create-subscriber').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      subscriber_id: document.getElementById('sub-id-input').value.trim() || undefined,
      kyc_status:    document.getElementById('sub-kyc-input').value,
      state:         document.getElementById('sub-state-input').value.trim(),
      district:      document.getElementById('sub-district-input').value.trim(),
      pos_id:        document.getElementById('sub-pos-input').value,
    };

    try {
      const res = await apiFetch('/api/subscribers', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Subscriber ${res.subscriber_id} created successfully!`);
      closeDataEntryPanel();
      if (state.page === 'subscribers') renderSubscribers();
    } catch (err) {
      showToast('Error creating subscriber: ' + err.message, 5000);
    }
  });
}

function renderDeviceForm(container) {
  container.innerHTML = `
    <form id="form-create-device">
      <div class="form-group">
        <label class="form-label">Device ID <span class="form-hint">(Optional — auto-generated if blank)</span></label>
        <input type="text" class="form-input" id="dev-id-input" placeholder="e.g. DEV_MANUAL_101" />
      </div>

      <div class="form-group">
        <label class="form-label">IMEI Number (15 digits) <span class="required">*</span></label>
        <input type="text" class="form-input mono" id="dev-imei-input" placeholder="e.g. 352999109518741" maxlength="15" required />
      </div>

      <div class="form-group">
        <label class="form-label">TAC (First 8 digits of IMEI)</label>
        <input type="text" class="form-input mono" id="dev-tac-input" placeholder="Auto-filled from IMEI" />
      </div>

      <div class="form-group">
        <label class="form-label">Device Model <span class="required">*</span></label>
        <input type="text" class="form-input" id="dev-model-input" placeholder="e.g. Redmi Note 12" required />
      </div>

      <div class="form-group">
        <label class="form-label">Manufacturer <span class="required">*</span></label>
        <input type="text" class="form-input" id="dev-mfr-input" placeholder="e.g. Xiaomi" required />
      </div>

      <div class="form-group">
        <label class="form-label">Initial Status <span class="required">*</span></label>
        <select class="form-select" id="dev-status-input">
          <option value="NORMAL">NORMAL</option>
          <option value="STOLEN">STOLEN</option>
          <option value="LOST">LOST</option>
        </select>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeDataEntryPanel()">Cancel</button>
        <button type="submit" class="btn btn-primary">Register Device</button>
      </div>
    </form>
  `;

  document.getElementById('dev-imei-input').addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val.length >= 8) {
      document.getElementById('dev-tac-input').value = val.slice(0, 8);
    }
  });

  document.getElementById('form-create-device').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      device_id:    document.getElementById('dev-id-input').value.trim() || undefined,
      imei:         document.getElementById('dev-imei-input').value.trim(),
      tac:          document.getElementById('dev-tac-input').value.trim() || undefined,
      device_model: document.getElementById('dev-model-input').value.trim(),
      manufacturer: document.getElementById('dev-mfr-input').value.trim(),
      status:       document.getElementById('dev-status-input').value,
    };

    try {
      const res = await apiFetch('/api/devices', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Device ${res.device_id} registered successfully!`);
      closeDataEntryPanel();
      if (state.page === 'devices') renderDevices();
    } catch (err) {
      showToast('Error registering device: ' + err.message, 5000);
    }
  });
}

function renderFraudReportForm(container, prefillMobile = '') {
  container.innerHTML = `
    <form id="form-file-fraud">
      <div class="form-group">
        <label class="form-label">Mobile Number <span class="required">*</span></label>
        <input type="text" class="form-input mono" id="fraud-mobile-input" placeholder="e.g. 9876543210" value="${escHtml(prefillMobile)}" required />
      </div>

      <div class="form-group">
        <label class="form-label">Report Type <span class="required">*</span></label>
        <select class="form-select" id="fraud-type-input">
          <option value="SCAM_CALL">SCAM_CALL</option>
          <option value="SIM_SWAP">SIM_SWAP</option>
          <option value="HARASSMENT">HARASSMENT</option>
          <option value="IMPERSONATION">IMPERSONATION</option>
          <option value="OTHER">OTHER</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Severity Level <span class="required">*</span></label>
        <select class="form-select" id="fraud-severity-input">
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Reporting Source <span class="required">*</span></label>
        <select class="form-select" id="fraud-source-input">
          <option value="POLICE_COMPLAINT">POLICE_COMPLAINT</option>
          <option value="TELECOM_OPERATOR">TELECOM_OPERATOR</option>
          <option value="CITIZEN_REPORT">CITIZEN_REPORT</option>
          <option value="COURT_ORDER">COURT_ORDER</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Description <span class="form-hint">(Max 500 characters)</span></label>
        <textarea class="form-textarea" id="fraud-desc-input" rows="3" placeholder="Describe the reported incident…"></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeDataEntryPanel()">Cancel</button>
        <button type="submit" class="btn btn-primary">File Fraud Report</button>
      </div>
    </form>
  `;

  document.getElementById('form-file-fraud').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      mobile_number: document.getElementById('fraud-mobile-input').value.trim(),
      report_type:   document.getElementById('fraud-type-input').value,
      severity:      document.getElementById('fraud-severity-input').value,
      source:        document.getElementById('fraud-source-input').value,
      description:   document.getElementById('fraud-desc-input').value.trim() || undefined,
    };

    try {
      const res = await apiFetch('/api/fraud_reports', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Fraud Report ${res.report_id} filed successfully!`);
      closeDataEntryPanel();

      const hash = location.hash.replace('#', '');
      if (hash.startsWith('subscriber/')) {
        const subId = hash.slice('subscriber/'.length);
        await apiFetch(`/api/subscribers/${encodeURIComponent(subId)}/evaluate`, { method: 'POST' });
        renderSubscriberDetail(subId);
      }
    } catch (err) {
      showToast('Error filing report: ' + err.message, 5000);
    }
  });
}

function renderPosForm(container) {
  container.innerHTML = `
    <form id="form-create-pos">
      <div class="form-group">
        <label class="form-label">Point of Sale ID <span class="form-hint">(Optional — auto-generated if blank)</span></label>
        <input type="text" class="form-input mono" id="pos-id-input" placeholder="e.g. POS_MANUAL_101" />
      </div>

      <div class="form-group">
        <label class="form-label">Region <span class="required">*</span></label>
        <input type="text" class="form-input" id="pos-region-input" placeholder="e.g. North" required />
      </div>

      <div class="form-group">
        <label class="form-label">Operator <span class="required">*</span></label>
        <select class="form-select" id="pos-operator-input">
          <option value="Jio">Jio</option>
          <option value="Airtel">Airtel</option>
          <option value="Vi">Vi</option>
          <option value="BSNL">BSNL</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Registration Date <span class="form-hint">(Optional — YYYY-MM-DD)</span></label>
        <input type="date" class="form-input" id="pos-date-input" />
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeDataEntryPanel()">Cancel</button>
        <button type="submit" class="btn btn-primary">Register Point of Sale</button>
      </div>
    </form>
  `;

  document.getElementById('form-create-pos').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      pos_id:            document.getElementById('pos-id-input').value.trim() || undefined,
      region:            document.getElementById('pos-region-input').value.trim(),
      operator:          document.getElementById('pos-operator-input').value,
      registration_date: document.getElementById('pos-date-input').value || undefined,
    };

    try {
      const res = await apiFetch('/api/pos', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Point of Sale ${res.pos_id} created successfully!`);
      closeDataEntryPanel();
    } catch (err) {
      showToast('Error registering PoS: ' + err.message, 5000);
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   PILLAR A4: KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════ */

function initKeyboardShortcuts() {
  window.addEventListener('keydown', e => {
    const active = document.activeElement;
    const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

    // Key: "/" -> Focus active page search bar
    if (e.key === '/' && !isEditing) {
      e.preventDefault();
      const searchInput = document.querySelector('.search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // Key: "Escape" -> Close side panel, modal, or navigate back
    if (e.key === 'Escape') {
      const modal = document.getElementById('modal-overlay');
      const sidePanel = document.getElementById('side-panel');

      if (sidePanel && !sidePanel.classList.contains('hidden')) {
        closeDataEntryPanel();
        return;
      }
      if (modal && !modal.classList.contains('hidden')) {
        closeModal();
        return;
      }
      if (location.hash.startsWith('#subscriber/')) {
        navigate('subscribers');
        return;
      }
    }

    // Navigation Shortcuts: Alt+Key
    if (e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'd': e.preventDefault(); navigate('dashboard');      break;
        case 's': e.preventDefault(); navigate('subscribers');    break;
        case 'v': e.preventDefault(); navigate('devices');        break;
        case 'i': e.preventDefault(); navigate('investigations'); break;
        case 'a': e.preventDefault(); navigate('audit-log');       break;
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   EVENT WIRING & INITIALIZATION
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const toastClose = document.getElementById('toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('toast').classList.add('hidden');
    });
  }

  const btnOpenPanel = document.getElementById('btn-open-entry-panel');
  if (btnOpenPanel) {
    btnOpenPanel.addEventListener('click', () => openDataEntryPanel('subscriber'));
  }

  const btnTrainMl = document.getElementById('btn-train-ml');
  if (btnTrainMl) {
    btnTrainMl.addEventListener('click', async () => {
      btnTrainMl.disabled = true;
      btnTrainMl.textContent = '🧠 Training ML…';
      showToast('🧠 Training ML models (Isolation Forest + Random Forest)…', 6000);
      try {
        await apiFetch('/api/ml/train', { method: 'POST' });
        showToast('✓ ML Training completed successfully! Models updated.', 5000);
        if (state.page === 'dashboard') renderDashboard();
      } catch (err) {
        showToast('⚠ ML Training failed: ' + err.message, 5000);
      } finally {
        btnTrainMl.disabled = false;
        btnTrainMl.textContent = '🧠 Train ML Model';
      }
    });
  }
  const btnClosePanel = document.getElementById('side-panel-close');
  if (btnClosePanel) {
    btnClosePanel.addEventListener('click', closeDataEntryPanel);
  }
  const overlayPanel = document.getElementById('side-panel-overlay');
  if (overlayPanel) {
    overlayPanel.addEventListener('click', closeDataEntryPanel);
  }

  document.querySelectorAll('.side-tab-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const tab = e.target.dataset.tab;
      switchDataEntryTab(tab);
    });
  });

  document.getElementById('modal-close').addEventListener('click',  closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-submit').addEventListener('click', submitModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  initKeyboardShortcuts();

  checkBackend();
  setInterval(checkBackend, 30000);

  router();
});
