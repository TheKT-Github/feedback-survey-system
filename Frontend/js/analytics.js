/**
 * Analytics Dashboard — Fashion Feedback Intelligence Platform (Phase 5)
 *
 * Renders live analytics from /api/admin/analytics/* endpoints using Chart.js.
 * All calls use the admin JWT token; chart instances are destroyed before re-render
 * to prevent duplicate canvas errors.
 *
 * NOTE: BASE_URL is declared in admin.js (loaded first). This file reuses it.
 * Do NOT redeclare BASE_URL here to avoid JS redeclaration errors.
 */

// Use BASE_URL from admin.js if available, otherwise compute it
/* global BASE_URL */
const _ANALYTICS_BASE = (typeof BASE_URL !== 'undefined')
  ? BASE_URL
  : ((window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000');

// Track active Chart.js instances so they can be destroyed before re-render
const chartInstances = {};

function getAnalyticsToken() {
  return localStorage.getItem('adminToken') || localStorage.getItem('token');
}

function analyticsAuthHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAnalyticsToken()}` };
}

async function apiFetch(endpoint) {
  const res = await fetch(`${_ANALYTICS_BASE}/api/admin/analytics/${endpoint}`, { headers: analyticsAuthHeaders() });
  if (!res.ok) throw new Error(`API ${endpoint} failed (${res.status})`);
  const json = await res.json();
  return json.data;
}

// Safely destroy an existing Chart.js instance by canvas id
function destroyChart(id) {
  if (chartInstances[id]) {
    try { chartInstances[id].destroy(); } catch (e) {}
    delete chartInstances[id];
  }
}

// Build query string from current filter selections
function buildQuery() {
  const product = document.getElementById('filterProduct')?.value || 'all';
  const days = document.getElementById('filterDays')?.value || '30';
  const sentiment = document.getElementById('filterSentiment')?.value || 'all';
  const params = new URLSearchParams();
  if (product && product !== 'all') params.set('product', product);
  if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
  params.set('days', days);
  return params.toString() ? `?${params.toString()}` : '';
}

// ─────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────

function renderOverviewCards(data) {
  const el = document.getElementById('analyticsOverview');
  if (!el) return;
  if (!data || data.totalValidFeedback === 0) {
    el.innerHTML = '<p class="analytics-empty">No feedback data available yet.</p>';
    return;
  }
  el.innerHTML = `
    <div class="analytics-cards">
      <div class="analytics-card analytics-card--blue">
        <div class="analytics-card__icon">📊</div>
        <div class="analytics-card__value">${data.totalValidFeedback.toLocaleString()}</div>
        <div class="analytics-card__label">Total Valid Feedback</div>
      </div>
      <div class="analytics-card analytics-card--gold">
        <div class="analytics-card__icon">⭐</div>
        <div class="analytics-card__value">${data.averageRating} / 5</div>
        <div class="analytics-card__label">Average Rating</div>
      </div>
      <div class="analytics-card analytics-card--green">
        <div class="analytics-card__icon">✅</div>
        <div class="analytics-card__value">${data.positivePercent}%</div>
        <div class="analytics-card__label">Positive (${data.positive.toLocaleString()})</div>
      </div>
      <div class="analytics-card analytics-card--red">
        <div class="analytics-card__icon">⚠️</div>
        <div class="analytics-card__value">${data.negativePercent}%</div>
        <div class="analytics-card__label">Negative (${data.negative.toLocaleString()})</div>
      </div>
      <div class="analytics-card analytics-card--grey">
        <div class="analytics-card__icon">➡️</div>
        <div class="analytics-card__value">${data.neutralPercent}%</div>
        <div class="analytics-card__label">Neutral (${data.neutral.toLocaleString()})</div>
      </div>
      <div class="analytics-card analytics-card--purple">
        <div class="analytics-card__icon">🔀</div>
        <div class="analytics-card__value">${data.mixedPercent}%</div>
        <div class="analytics-card__label">Mixed (${data.mixed.toLocaleString()})</div>
      </div>
      <div class="analytics-card analytics-card--orange">
        <div class="analytics-card__icon">🚩</div>
        <div class="analytics-card__value">${data.flaggedFeedback.toLocaleString()}</div>
        <div class="analytics-card__label">Flagged (Spam)</div>
      </div>
      <div class="analytics-card analytics-card--teal">
        <div class="analytics-card__icon">✔️</div>
        <div class="analytics-card__value">${data.approvedFeedback.toLocaleString()}</div>
        <div class="analytics-card__label">Admin Approved</div>
      </div>
    </div>`;
}

function renderSentimentChart(data) {
  destroyChart('sentimentChart');
  const el = document.getElementById('sentimentChart');
  if (!el) return;

  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) {
    el.parentElement.innerHTML = '<p class="analytics-empty">No sentiment data available.</p>';
    return;
  }

  chartInstances['sentimentChart'] = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Negative', 'Neutral', 'Mixed'],
      datasets: [{
        data: [data.Positive, data.Negative, data.Neutral, data.Mixed],
        backgroundColor: ['#4caf50', '#f44336', '#9e9e9e', '#9c27b0'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)`
          }
        }
      }
    }
  });
}

function renderRatingChart(data) {
  destroyChart('ratingChart');
  const el = document.getElementById('ratingChart');
  if (!el) return;

  chartInstances['ratingChart'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: ['1★', '2★', '3★', '4★', '5★'],
      datasets: [{
        label: 'Reviews',
        data: [data[1], data[2], data[3], data[4], data[5]],
        backgroundColor: ['#f44336', '#ff9800', '#ffeb3b', '#8bc34a', '#4caf50'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderAspectInsights(aspects) {
  const posEl = document.getElementById('topPositiveAspects');
  const negEl = document.getElementById('topNegativeAspects');
  if (!aspects || aspects.length === 0) {
    if (posEl) posEl.innerHTML = '<p class="analytics-empty">No aspect data available.</p>';
    if (negEl) negEl.innerHTML = '<p class="analytics-empty">No aspect data available.</p>';
    return;
  }

  const sorted = [...aspects];
  const topPositive = [...sorted].sort((a, b) => b.positive - a.positive || b.avgScore - a.avgScore).slice(0, 5);
  const topNegative = [...sorted].sort((a, b) => b.negative - a.negative || a.avgScore - b.avgScore).slice(0, 5);

  if (posEl) posEl.innerHTML = topPositive.map((a, i) => `
    <div class="aspect-item aspect-item--positive">
      <span class="aspect-rank">${i + 1}</span>
      <span class="aspect-name">✅ ${a.aspect}</span>
      <span class="aspect-stat">${a.positive} positive mentions (${a.positivePercent}%)</span>
    </div>`).join('');

  if (negEl) negEl.innerHTML = topNegative.map((a, i) => `
    <div class="aspect-item aspect-item--negative">
      <span class="aspect-rank">${i + 1}</span>
      <span class="aspect-name">⚠️ ${a.aspect}</span>
      <span class="aspect-stat">${a.negative} complaints (${a.negativePercent}%)</span>
    </div>`).join('');
}

function renderAspectChart(aspects) {
  destroyChart('aspectChart');
  const el = document.getElementById('aspectChart');
  if (!el || !aspects || aspects.length === 0) return;

  chartInstances['aspectChart'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: aspects.map(a => a.aspect),
      datasets: [
        { label: 'Positive', data: aspects.map(a => a.positive), backgroundColor: '#4caf50', borderRadius: 4 },
        { label: 'Negative', data: aspects.map(a => a.negative), backgroundColor: '#f44336', borderRadius: 4 },
        { label: 'Neutral', data: aspects.map(a => a.neutral), backgroundColor: '#9e9e9e', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
    }
  });
}

function renderProductTable(products) {
  const el = document.getElementById('productTable');
  if (!el) return;
  if (!products || products.length === 0) {
    el.innerHTML = '<p class="analytics-empty">No product data available.</p>';
    return;
  }

  const statusColor = { Excellent: '#4caf50', Good: '#2196f3', 'Needs Attention': '#f44336' };

  el.innerHTML = `
    <table class="data-table analytics-table">
      <thead>
        <tr>
          <th>Product</th><th>Feedback</th><th>Avg Rating</th>
          <th>Positive %</th><th>Negative %</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td><strong>${p.product}</strong></td>
            <td>${p.total}</td>
            <td>${p.avgRating} ⭐</td>
            <td style="color:#4caf50; font-weight:600;">${p.positivePercent}%</td>
            <td style="color:#f44336; font-weight:600;">${p.negativePercent}%</td>
            <td><span style="background:${statusColor[p.status] || '#9e9e9e'}22; color:${statusColor[p.status] || '#9e9e9e'};
              padding:3px 10px; border-radius:12px; font-size:0.82rem; font-weight:600;">${p.status}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderSentimentTrendChart(trend) {
  destroyChart('sentimentTrendChart');
  const el = document.getElementById('sentimentTrendChart');
  if (!el) return;
  if (!trend || trend.length === 0) {
    el.parentElement.innerHTML = '<p class="analytics-empty">No trend data available for selected period.</p>';
    return;
  }

  chartInstances['sentimentTrendChart'] = new Chart(el, {
    type: 'line',
    data: {
      labels: trend.map(d => d.date),
      datasets: [
        { label: 'Positive', data: trend.map(d => d.Positive), borderColor: '#4caf50', backgroundColor: '#4caf5022', fill: true, tension: 0.3 },
        { label: 'Negative', data: trend.map(d => d.Negative), borderColor: '#f44336', backgroundColor: '#f4433622', fill: true, tension: 0.3 },
        { label: 'Neutral', data: trend.map(d => d.Neutral), borderColor: '#9e9e9e', backgroundColor: '#9e9e9e11', fill: true, tension: 0.3 },
        { label: 'Mixed', data: trend.map(d => d.Mixed), borderColor: '#9c27b0', backgroundColor: '#9c27b011', fill: true, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderFeedbackTrendChart(trend) {
  destroyChart('feedbackTrendChart');
  const el = document.getElementById('feedbackTrendChart');
  if (!el) return;
  if (!trend || trend.length === 0) {
    el.parentElement.innerHTML = '<p class="analytics-empty">No volume trend data for selected period.</p>';
    return;
  }

  chartInstances['feedbackTrendChart'] = new Chart(el, {
    type: 'line',
    data: {
      labels: trend.map(d => d.date),
      datasets: [{
        label: 'Feedback Volume',
        data: trend.map(d => d.count),
        borderColor: '#e91e63',
        backgroundColor: '#e91e6322',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#e91e63'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// PHASE 12: COMPLAINT TRENDS & STATISTICAL MOMENTUM
// ─────────────────────────────────────────────────────────────

function renderComplaintTrends(data) {
  const momentumEl = document.getElementById('complaintMomentumCard');
  if (momentumEl) {
    if (!data || !data.meta) {
      momentumEl.innerHTML = '<p class="analytics-empty">No complaint data available for this range.</p>';
    } else {
      const meta = data.meta;
      const comp = data.comparison;

      let warningHtml = '';
      if (!meta.hasSufficientData) {
        warningHtml = `
          <div class="stat-warning-banner" style="background:#fff3e0; border-left:4px solid #ff9800; padding:10px 14px; border-radius:6px; margin-bottom:14px; font-size:0.85rem; color:#e65100;">
            ⚠️ <strong>Reporting Safeguard:</strong> ${meta.sampleSizeWarning || 'Sample size too small to establish trend significance.'}
          </div>
        `;
      }

      const curNegative = comp.currentNegativeReviews || 0;
      const prevNegative = comp.previousNegativeReviews || 0;
      let deltaBadge = '';
      if (meta.hasSufficientData) {
        const delta = comp.negativeDeltaPercent;
        if (delta !== null && delta !== undefined) {
          const isIncrease = delta > 0;
          const badgeBg = isIncrease ? '#ffebee' : '#e8f5e9';
          const badgeColor = isIncrease ? '#c62828' : '#2e7d32';
          const symbol = isIncrease ? '▲ +' : '▼ ';
          deltaBadge = `<span style="display:inline-block; padding:3px 10px; border-radius:12px; font-size:0.82rem; font-weight:700; background:${badgeBg}; color:${badgeColor};">${symbol}${delta}%</span>`;
        } else {
          deltaBadge = `<span style="font-size:0.82rem; color:#666;">(Baseline 0)</span>`;
        }
      } else {
        deltaBadge = `<span style="font-size:0.82rem; color:#888;">(Insufficient Data)</span>`;
      }

      // Aspect breakdown rows
      let aspectRows = '';
      if (comp.aspectTrends && comp.aspectTrends.length > 0) {
        aspectRows = comp.aspectTrends.slice(0, 6).map(a => {
          let changeDisplay = '';
          if (meta.hasSufficientData && a.deltaPercent !== null) {
            const isUp = a.deltaPercent > 0;
            changeDisplay = `<span style="font-weight:600; color:${isUp ? '#c62828' : '#2e7d32'};">${isUp ? '+' : ''}${a.deltaPercent}%</span>`;
          } else {
            changeDisplay = `<span style="color:#888; font-size:0.8rem;">${a.deltaNote || 'N/A'}</span>`;
          }
          return `
            <tr>
              <td style="padding:8px 10px; font-weight:600; color:#333;">${a.aspect}</td>
              <td style="padding:8px 10px; text-align:center;">${a.currentMentions}</td>
              <td style="padding:8px 10px; text-align:center; color:#666;">${a.previousMentions}</td>
              <td style="padding:8px 10px; text-align:right;">${changeDisplay}</td>
            </tr>
          `;
        }).join('');
      } else {
        aspectRows = '<tr><td colspan="4" style="text-align:center; color:#888; padding:12px;">No negative aspect mentions in this period.</td></tr>';
      }

      momentumEl.innerHTML = `
        ${warningHtml}
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:16px;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:4px;">Current Period</div>
            <div style="font-size:1.3rem; font-weight:700; color:#0f172a;">${curNegative} <span style="font-size:0.8rem; font-weight:500; color:#64748b;">negative reviews</span></div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Out of ${meta.currentPeriod.totalReviews} total reviews</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:4px;">Previous Equivalent Period</div>
            <div style="font-size:1.3rem; font-weight:700; color:#0f172a;">${prevNegative} <span style="font-size:0.8rem; font-weight:500; color:#64748b;">negative reviews</span></div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Out of ${meta.previousPeriod.totalReviews} total reviews</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; justify-content:center;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:4px;">Period-over-Period Shift</div>
            <div>${deltaBadge}</div>
            <div style="font-size:0.72rem; color:#64748b; margin-top:4px;">${meta.hasSufficientData ? (comp.negativeDeltaNote || '') : 'Requires ≥5 reviews per period'}</div>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%; font-size:0.85rem;">
            <thead>
              <tr style="background:#f1f5f9; text-align:left;">
                <th style="padding:8px 10px;">Aspect / Category</th>
                <th style="padding:8px 10px; text-align:center;">Current Complaints</th>
                <th style="padding:8px 10px; text-align:center;">Previous Complaints</th>
                <th style="padding:8px 10px; text-align:right;">Shift</th>
              </tr>
            </thead>
            <tbody>
              ${aspectRows}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Render timeline chart
  const canvas = document.getElementById('complaintTrendChart');
  if (!canvas) return;
  destroyChart('complaintTrendChart');

  if (!data || !data.timeline || data.timeline.length === 0) {
    return;
  }

  const labels = data.timeline.map(t => t.date);
  const negativeCounts = data.timeline.map(t => t.Negative || 0);
  const totalCounts = data.timeline.map(t => t.total || 0);

  chartInstances['complaintTrendChart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Negative Complaints',
          data: negativeCounts,
          borderColor: '#c62828',
          backgroundColor: '#ffebee',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#c62828'
        },
        {
          label: 'Total Volume',
          data: totalCounts,
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN LOAD — fetches all analytics in parallel
// ─────────────────────────────────────────────────────────────
window.loadAnalyticsDashboard = async function () {
  const q = buildQuery();
  setAnalyticsStatus('loading');

  try {
    const [overview, sentiment, ratings, aspects, products, sentimentTrend, feedbackTrend, complaintTrends] = await Promise.all([
      apiFetch(`overview${q}`),
      apiFetch(`sentiment${q}`),
      apiFetch(`ratings${q}`),
      apiFetch(`aspects${q}`),
      apiFetch(`products${q}`),
      apiFetch(`sentiment-trend${q}`),
      apiFetch(`feedback-trend${q}`),
      apiFetch(`complaint-trends${q}`)
    ]);

    setAnalyticsStatus('ready');
    renderOverviewCards(overview);
    renderSentimentChart(sentiment);
    renderRatingChart(ratings);
    renderAspectInsights(aspects);
    renderAspectChart(aspects);
    renderProductTable(products);
    renderSentimentTrendChart(sentimentTrend);
    renderFeedbackTrendChart(feedbackTrend);
    renderComplaintTrends(complaintTrends);
  } catch (err) {
    console.error('Analytics load error:', err);
    setAnalyticsStatus('error');
  }
};

function setAnalyticsStatus(state) {
  const statusEl = document.getElementById('analyticsStatus');
  if (!statusEl) return;
  if (state === 'loading') {
    statusEl.innerHTML = '<p class="analytics-loading">⏳ Loading analytics...</p>';
    statusEl.style.display = 'block';
  } else if (state === 'error') {
    statusEl.innerHTML = '<p class="analytics-error">❌ Unable to load analytics. Please try again.</p>';
    statusEl.style.display = 'block';
  } else {
    statusEl.style.display = 'none';
  }
}

// Expose filter trigger for HTML onchange/onclick
window.applyAnalyticsFilters = function () {
  window.loadAnalyticsDashboard();
};

// ─────────────────────────────────────────────────────────────
// PHASE 7: REPORTING & DATA EXPORT HANDLERS
// ─────────────────────────────────────────────────────────────

function showExportStatus(message, type = 'info') {
  const el = document.getElementById('exportStatusMessage');
  if (!el) return;
  el.style.display = 'block';
  if (type === 'loading') {
    el.style.background = '#e3f2fd';
    el.style.color = '#1565c0';
    el.innerHTML = `⏳ ${message}`;
  } else if (type === 'success') {
    el.style.background = '#e8f5e9';
    el.style.color = '#2e7d32';
    el.innerHTML = `✅ ${message}`;
    setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
  } else {
    el.style.background = '#ffebee';
    el.style.color = '#c62828';
    el.innerHTML = `❌ ${message}`;
  }
}

function getReportFilterQuery() {
  const product = document.getElementById('reportProductFilter')?.value || 'all';
  const sentiment = document.getElementById('reportSentimentFilter')?.value || 'all';
  const rating = document.getElementById('reportRatingFilter')?.value || 'all';
  const date = document.getElementById('reportDateFilter')?.value || 'all';
  const includeModeration = document.getElementById('reportIncludeModeration')?.checked || false;

  const params = new URLSearchParams();
  if (product && product !== 'all') params.set('product', product);
  if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
  if (rating && rating !== 'all') params.set('rating', rating);
  if (date && date !== 'all') params.set('date', date);
  if (includeModeration) params.set('includeModeration', 'true');

  return params.toString() ? `?${params.toString()}` : '';
}

async function triggerFileDownload(endpoint, fallbackFilename) {
  const token = getAnalyticsToken();
  if (!token) {
    showExportStatus('Authentication required. Please log in as admin.', 'error');
    return;
  }

  showExportStatus('Generating report...', 'loading');

  try {
    const q = getReportFilterQuery();
    const res = await fetch(`${_ANALYTICS_BASE}/api/admin/reports/${endpoint}${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      showExportStatus('Access denied. Administrator privileges required.', 'error');
      return;
    }

    if (!res.ok) {
      throw new Error(`Report generation failed (${res.status})`);
    }

    // Extract filename from Content-Disposition if present
    let filename = fallbackFilename;
    const disp = res.headers.get('Content-Disposition');
    if (disp && disp.includes('filename=')) {
      const match = disp.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showExportStatus(`Report downloaded successfully (${filename})`, 'success');
  } catch (err) {
    console.error('Report export error:', err);
    showExportStatus('Unable to generate report. Please try again.', 'error');
  }
}

window.downloadFeedbackCSV = function () {
  triggerFileDownload('feedback.csv', 'feedback-report.csv');
};

window.downloadAnalyticsCSV = function () {
  triggerFileDownload('analytics.csv', 'analytics-report.csv');
};

window.downloadBusinessPDF = function () {
  triggerFileDownload('feedback.pdf', 'feedback-business-report.pdf');
};

