/**
 * AI Insights Dashboard Controller
 * Style Feedback Intelligence AI — Phases 11 & 12
 *
 * Supports Three Modes:
 * 1. Ask AI (Q&A): Natural-language inquiries with RAG feedback retrieval
 * 2. Product Comparison: Multi-product side-by-side database stats + comparative AI synthesis
 * 3. Strategic Recommendations: Prioritized business actions with evidence citations
 */

(function () {
  'use strict';

  const BASE_URL = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port))
    ? ''
    : 'http://localhost:3000';

  function getAdminToken() {
    return localStorage.getItem('adminToken') || localStorage.getItem('token');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let isSubmitting = false;

  // =========================================================================
  // 1. MODE SWITCHER (Ask AI | Product Comparison | Recommendations)
  // =========================================================================

  window.switchAiMode = function (mode) {
    const validModes = ['ask', 'compare', 'recommendations'];
    if (!validModes.includes(mode)) mode = 'ask';

    // Update switcher buttons in any active container
    document.querySelectorAll('.ai-mode-btn').forEach(btn => {
      const btnMode = btn.getAttribute('data-mode');
      const isActive = btnMode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Toggle panels
    document.querySelectorAll('.ai-mode-panel').forEach(panel => {
      const panelMode = panel.getAttribute('data-mode');
      panel.style.display = panelMode === mode ? 'block' : 'none';
    });
  };

  // =========================================================================
  // 2. MODE 1: ASK AI (NATURAL LANGUAGE RAG)
  // =========================================================================

  window.updateAiCharCounter = function () {
    const input = document.getElementById('aiQuestionInput');
    const counter = document.getElementById('aiCharCounter');
    const errorEl = document.getElementById('aiQuestionError');
    if (!input || !counter) return;

    const len = input.value.length;
    counter.textContent = `${len} / 500`;

    counter.classList.toggle('warning', len >= 450 && len <= 500);
    counter.classList.toggle('error', len > 500);

    if (errorEl && errorEl.style.display !== 'none') {
      errorEl.style.display = 'none';
    }
  };

  window.injectAiPrompt = function (text) {
    const input = document.getElementById('aiQuestionInput');
    if (!input) return;
    input.value = text;
    window.updateAiCharCounter();
    input.focus();
  };

  window.updateActiveFilterPills = function () {
    const bar = document.getElementById('aiActiveFilterBar');
    if (!bar) return;

    const filters = getFilterValues();
    const pills = [];

    if (filters.product) pills.push(`Product: ${filters.product}`);
    if (filters.sentiment) pills.push(`Sentiment: ${filters.sentiment}`);
    if (filters.rating) pills.push(`Rating: ${filters.rating} Stars`);
    if (filters.aspect) pills.push(`Aspect: ${filters.aspect}`);
    if (filters.dateRange && !filters.dateFrom) pills.push(`Period: Last ${filters.dateRange} days`);
    if (filters.dateFrom || filters.dateTo) {
      pills.push(`Custom: ${filters.dateFrom || 'Start'} to ${filters.dateTo || 'Now'}`);
    }

    if (pills.length === 0) {
      bar.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No filters active (analyzing all eligible feedback)</span>';
    } else {
      bar.innerHTML = '<strong>Active filters:</strong> ' + pills.map(p => `<span class="ai-filter-pill">${escapeHtml(p)}</span>`).join('');
    }
  };

  window.clearAllAiFilters = function () {
    const ids = ['aiFilterProduct', 'aiFilterSentiment', 'aiFilterRating', 'aiFilterAspect', 'aiFilterDateRange'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = el.options[0].value;
    });

    const dateFrom = document.getElementById('aiFilterDateFrom');
    const dateTo = document.getElementById('aiFilterDateTo');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';

    window.updateActiveFilterPills();
  };

  function getFilterValues() {
    const filters = {};
    const product = document.getElementById('aiFilterProduct')?.value;
    if (product && product !== 'all') filters.product = product;

    const sentiment = document.getElementById('aiFilterSentiment')?.value;
    if (sentiment && sentiment !== 'all') filters.sentiment = sentiment;

    const rating = document.getElementById('aiFilterRating')?.value;
    if (rating && rating !== 'all') filters.rating = parseInt(rating, 10);

    const aspect = document.getElementById('aiFilterAspect')?.value;
    if (aspect && aspect !== 'all') filters.aspect = aspect;

    const dateRange = document.getElementById('aiFilterDateRange')?.value;
    if (dateRange && dateRange !== 'all') filters.dateRange = dateRange;

    const dateFrom = document.getElementById('aiFilterDateFrom')?.value;
    if (dateFrom) filters.dateFrom = dateFrom;

    const dateTo = document.getElementById('aiFilterDateTo')?.value;
    if (dateTo) filters.dateTo = dateTo;

    return filters;
  }

  window.askAi = async function () {
    if (isSubmitting) return;

    const input = document.getElementById('aiQuestionInput');
    const errorEl = document.getElementById('aiQuestionError');
    const submitBtn = document.getElementById('aiSubmitBtn');
    const responseArea = document.getElementById('aiResponseArea');

    if (!input || !submitBtn || !responseArea) return;

    const question = input.value.trim();

    if (!question || question.length < 3) {
      if (errorEl) {
        errorEl.textContent = 'Please enter a question with at least 3 characters.';
        errorEl.style.display = 'block';
      }
      input.focus();
      return;
    }

    if (question.length > 500) {
      if (errorEl) {
        errorEl.textContent = 'Question exceeds the 500 character limit.';
        errorEl.style.display = 'block';
      }
      input.focus();
      return;
    }

    const token = getAdminToken();
    if (!token) {
      renderErrorState({
        title: 'Authentication Required',
        message: 'Your administrator session has expired or is missing. Please log in to access AI Insights.',
        code: 'UNAUTHORIZED',
        showLoginBtn: true
      });
      return;
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> <span>Analyzing Reviews...</span>';
    renderLoadingState(question);

    try {
      const filters = getFilterValues();
      const res = await fetch(`${BASE_URL}/api/admin/ai/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question, filters })
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        handleApiError(res.status, json);
        return;
      }

      if (json && json.success && json.data) {
        renderSuccessState(json.data);
      } else {
        renderErrorState({
          title: 'Unexpected Response',
          message: 'The AI service returned an incomplete response payload. Please try again.',
          code: 'MALFORMED_DATA'
        });
      }
    } catch (netErr) {
      console.error('[AI Dashboard] Network error:', netErr);
      renderErrorState({
        title: 'Network Communication Failure',
        message: 'Could not connect to the backend server. Please verify the application is running.',
        code: 'NETWORK_ERROR'
      });
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✨</span> <span>Ask AI</span>';
    }
  };

  function renderLoadingState(question) {
    const area = document.getElementById('aiResponseArea');
    if (!area) return;

    area.innerHTML = `
      <div class="ai-skeleton-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
          <div class="ai-skeleton-line title" style="width:30%;"></div>
          <div class="ai-skeleton-line" style="width:100px; height:20px; border-radius:20px;"></div>
        </div>
        <p style="font-size:0.92rem; color:#64748b; margin-bottom:18px;">
          <em>Searching customer reviews for: "${escapeHtml(question)}" ...</em>
        </p>
        <div class="ai-skeleton-line w-80"></div>
        <div class="ai-skeleton-line w-60"></div>
        <div class="ai-skeleton-line w-40"></div>
      </div>
    `;
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSuccessState(data) {
    const area = document.getElementById('aiResponseArea');
    if (!area) return;

    if (data.insufficientEvidence || !data.retrievedReviewCount) {
      area.innerHTML = `
        <div class="ai-insufficient-notice">
          <div class="notice-icon">ℹ️</div>
          <div>
            <h4>No Sufficient Evidence Found</h4>
            <p>${escapeHtml(data.answer || 'No relevant customer feedback was found matching your query and filters.')}</p>
            <p style="font-size:0.85rem; color:#b45309; margin:0;">
              💡 <strong>Suggestion:</strong> Try clearing specific filters or asking a broader inquiry to explore more customer reviews.
            </p>
          </div>
        </div>
      `;
      area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const keyFindings = Array.isArray(data.keyFindings) ? data.keyFindings : [];
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
    const evidenceList = Array.isArray(data.evidence) ? data.evidence : [];

    let findingsHtml = '';
    if (keyFindings.length > 0) {
      findingsHtml = `
        <div class="ai-findings-card">
          <h4 class="ai-card-title"><span>📌</span> <span>Key Findings</span></h4>
          ${keyFindings.map((f, idx) => {
            const citations = Array.isArray(f.evidenceIds) && f.evidenceIds.length > 0
              ? `<div class="ai-citations-box">
                  <span style="font-size:0.75rem; color:#64748b; font-weight:600;">Evidence:</span>
                  ${f.evidenceIds.map(cid => `
                    <button type="button" class="citation-pill" data-target="${escapeHtml(cid)}" onclick="window.highlightEvidenceCard('${escapeHtml(cid)}')">
                      📎 ${escapeHtml(cid)}
                    </button>
                  `).join('')}
                </div>`
              : '';

            return `
              <div class="ai-finding-item">
                <div class="ai-finding-text"><strong>${idx + 1}.</strong> ${escapeHtml(f.finding)}</div>
                ${citations}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    let recommendationsHtml = '';
    if (recommendations.length > 0) {
      recommendationsHtml = `
        <div class="ai-recommendations-card">
          <h4 class="ai-card-title"><span>💡</span> <span>Recommended Actions</span></h4>
          ${recommendations.map((rec, idx) => `
            <div class="ai-recommendation-item">
              <span class="ai-rec-number">${idx + 1}</span>
              <div>${escapeHtml(rec)}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    let evidenceHtml = '';
    if (evidenceList.length > 0) {
      evidenceHtml = `
        <div class="ai-evidence-section" id="aiEvidenceSection">
          <div class="ai-evidence-header">
            <h4 class="ai-card-title" style="border:none; margin:0; padding:0;">
              <span>🗂️</span> <span>Verified Customer Evidence (${evidenceList.length})</span>
            </h4>
            <span class="ai-evidence-count-badge">Authentic MongoDB Reviews</span>
          </div>
          <p style="font-size:0.85rem; color:#64748b; margin-bottom:16px;">
            The findings above directly cite the following authentic customer submissions. Click any citation pill to locate the grounded review.
          </p>
          <div class="ai-evidence-grid">
            ${evidenceList.map(ev => renderEvidenceCard(ev)).join('')}
          </div>
        </div>
      `;
    }

    // Build mode/source badges
    const demoBadge = data.isDemo
      ? `<span style="display:inline-flex; align-items:center; gap:4px; background:#fef3c7; color:#92400e; border:1px solid #fcd34d; border-radius:20px; padding:3px 10px; font-size:0.75rem; font-weight:700;">
           🎭 Sample AI Insights — Demo Mode
         </span>`
      : '';
    const cachedBadge = data.isCached && !data.isDemo
      ? `<span style="display:inline-flex; align-items:center; gap:4px; background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; border-radius:20px; padding:3px 10px; font-size:0.75rem; font-weight:600;">
           ⚡ Cached AI Insight
         </span>`
      : '';

    area.innerHTML = `
      <div class="ai-answer-card">
        <div class="ai-answer-header">
          <div class="ai-answer-badge">
            <span>✨</span>
            <span>Synthesized Grounded Intelligence</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${demoBadge}${cachedBadge}
            <div class="ai-evidence-meta">
              <span>Based on <strong>${data.retrievedReviewCount}</strong> retrieved reviews</span>
              ${data.totalMatchedInDb ? `<span>(${data.totalMatchedInDb} total matching in database)</span>` : ''}
            </div>
          </div>
        </div>
        <div class="ai-answer-content">
          <p class="ai-summary-text">${escapeHtml(data.answer)}</p>
          ${findingsHtml}
          ${recommendationsHtml}
        </div>
        <div class="ai-grounding-footer">
          <div class="grounding-status">
            <span>🛡️</span>
            <span>Zero PII Exposed &bull; Server-Verified Citations</span>
          </div>
          <span style="font-size:0.75rem; color:#94a3b8;">Model: ${escapeHtml(data.model || 'Gemini')}</span>
        </div>
      </div>
      ${evidenceHtml}
    `;

    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderEvidenceCard(ev) {
    const starStr = '★'.repeat(Math.max(1, Math.min(5, Number(ev.rating) || 0)));
    const sentiment = ev.sentiment || 'Neutral';
    const sentClass = `sentiment-${sentiment.toLowerCase()}`;

    return `
      <div class="evidence-card" id="evidence-${escapeHtml(ev.refToken)}">
        <div class="evidence-card-header">
          <span class="evidence-token-badge">${escapeHtml(ev.refToken)}</span>
          <span class="evidence-product-tag">${escapeHtml(ev.product || 'general')}</span>
          <span class="evidence-stars" title="${ev.rating} Stars">${starStr}</span>
          <span class="evidence-sentiment-badge ${sentClass}">${escapeHtml(sentiment)}</span>
        </div>
        <p class="evidence-excerpt">"${escapeHtml(ev.excerpt || '')}"</p>
      </div>
    `;
  }

  function handleApiError(status, json) {
    const code = json?.code || `HTTP_${status}`;
    const errObj = {
      title: 'AI Intelligence Error',
      message: 'An error occurred while generating AI insights. Please try again.',
      code,
      showLoginBtn: false,
      hideRetryBtn: false
    };

    if (status === 401) {
      errObj.title = 'Session Expired';
      errObj.message = 'Your administrator token is invalid or has expired. Please sign in again to continue.';
      errObj.showLoginBtn = true;
    } else if (status === 403) {
      errObj.title = 'Access Denied';
      errObj.message = 'Administrator access is strictly required to view AI intelligence insights.';
    } else if (status === 400) {
      errObj.title = 'Invalid Request';
      errObj.message = json?.error || 'The request was rejected due to invalid question text or filter values.';
    } else if (status === 429) {
      if (code === 'AI_QUOTA_EXHAUSTED') {
        // Daily quota exhaustion — permanent until quota resets; do NOT offer retry
        errObj.title = 'AI Service Quota Reached';
        errObj.message = json?.error ||
          'AI insights are temporarily unavailable because the AI service daily quota has been reached. Please try again later.';
        errObj.hideRetryBtn = true;
      } else {
        // Transient rate limit — user can retry
        errObj.title = 'Rate Limit Reached';
        errObj.message = 'The AI provider is experiencing high traffic. Please wait a moment before trying again.';
      }
    } else if (status === 502 || status === 503) {
      errObj.title = 'AI Provider Unavailable';
      errObj.message = json?.error || 'The external AI service is currently unavailable. Please try again shortly.';
    } else if (status === 504) {
      errObj.title = 'Request Timeout';
      errObj.message = 'The AI provider took too long to respond. Please try again or refine your question.';
    }

    renderErrorState(errObj);
  }

  function renderErrorState(err) {
    const area = document.getElementById('aiResponseArea');
    if (!area) return;

    const retryBtn = err.hideRetryBtn ? '' : `
      <button type="button" class="btn btn-secondary" onclick="window.askAi()" style="padding:6px 14px; font-size:0.85rem;">
        🔄 Retry Request
      </button>`;

    area.innerHTML = `
      <div class="ai-error-notice">
        <div class="notice-icon" style="font-size:1.6rem;">⚠️</div>
        <div style="flex:1;">
          <h4>${escapeHtml(err.title)}</h4>
          <p>${escapeHtml(err.message)}</p>
          <div style="display:flex; gap:10px; align-items:center; margin-top:12px;">
            ${retryBtn}
            ${err.showLoginBtn ? `
              <a href="admin-login.html" class="btn btn-primary" style="padding:6px 14px; font-size:0.85rem;">
                Go to Admin Login &rarr;
              </a>
            ` : ''}
            <span style="font-size:0.75rem; color:#991b1b; opacity:0.8; margin-left:auto;">Code: ${escapeHtml(err.code || 'UNKNOWN')}</span>
          </div>
        </div>
      </div>
    `;

    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // 3. MODE 2: PRODUCT COMPARISON INTELLIGENCE (PHASE 12)
  // =========================================================================

  const selectedCompareProducts = new Set(['jeans', 'dress']);

  window.toggleCompareProduct = function (product) {
    if (!product) return;
    const p = String(product).toLowerCase().trim();

    if (selectedCompareProducts.has(p)) {
      if (selectedCompareProducts.size <= 2) {
        alert('Product comparison requires at least 2 products.');
        return;
      }
      selectedCompareProducts.delete(p);
    } else {
      if (selectedCompareProducts.size >= 5) {
        alert('You can select a maximum of 5 products to compare simultaneously.');
        return;
      }
      selectedCompareProducts.add(p);
    }

    updateCompareProductPillStates();
  };

  function updateCompareProductPillStates() {
    document.querySelectorAll('.compare-product-chip').forEach(btn => {
      const p = btn.getAttribute('data-product');
      const isSelected = selectedCompareProducts.has(p);
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    const countEl = document.getElementById('compareSelectedCount');
    if (countEl) {
      countEl.textContent = `${selectedCompareProducts.size} of 5 selected`;
    }
  }

  window.runProductComparison = async function () {
    if (isSubmitting) return;

    const products = Array.from(selectedCompareProducts);
    if (products.length < 2) {
      alert('Please select at least 2 products to compare.');
      return;
    }

    const token = getAdminToken();
    if (!token) {
      alert('Administrator login required.');
      return;
    }

    const responseArea = document.getElementById('aiCompareResponseArea');
    const submitBtn = document.getElementById('btnRunComparison');
    if (!responseArea) return;

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> <span>Comparing Products...</span>';
    }

    renderComparisonLoadingState(products);

    try {
      const dateRange = document.getElementById('compareFilterDateRange')?.value || 'all';
      const filters = {};
      if (dateRange && dateRange !== 'all') filters.dateRange = dateRange;

      const res = await fetch(`${BASE_URL}/api/admin/ai/compare-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ products, filters })
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        renderComparisonErrorState(json?.error || 'Failed to compare products.');
        return;
      }

      if (json && json.success && json.data) {
        renderComparisonSuccessState(json.data, products);
      } else {
        renderComparisonErrorState('Incomplete comparison response received.');
      }
    } catch (err) {
      console.error('Comparison error:', err);
      renderComparisonErrorState('Network communication error while comparing products.');
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>⚖️</span> <span>Run Product Comparison</span>';
      }
    }
  };

  function renderComparisonLoadingState(products) {
    const area = document.getElementById('aiCompareResponseArea');
    if (!area) return;

    area.innerHTML = `
      <div class="ai-skeleton-card">
        <div class="ai-skeleton-line title" style="width:40%;"></div>
        <p style="font-size:0.92rem; color:#64748b; margin-bottom:18px;">
          <em>Retrieving database metrics &amp; synthesizing comparative insights for: ${products.join(', ')} ...</em>
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:20px;">
          <div class="ai-skeleton-card" style="margin:0; min-height:160px;"></div>
          <div class="ai-skeleton-card" style="margin:0; min-height:160px;"></div>
        </div>
        <div class="ai-skeleton-line w-80"></div>
        <div class="ai-skeleton-line w-60"></div>
      </div>
    `;
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderComparisonSuccessState(data, products) {
    const area = document.getElementById('aiCompareResponseArea');
    if (!area) return;

    const stats = data.measuredStatistics || {};
    const ai = data.aiSynthesis || {};
    const evidenceList = Array.isArray(data.evidence) ? data.evidence : [];

    // 1. Measured Database Statistics Cards
    let statCardsHtml = '';
    for (const p of products) {
      const pStats = stats[p] || {
        totalFeedback: 0,
        averageRating: 0,
        positivePercent: 0,
        negativePercent: 0,
        sentimentDistribution: { Positive: 0, Negative: 0, Neutral: 0, Mixed: 0 },
        topAspects: []
      };

      const starStr = pStats.totalFeedback > 0 ? `★ ${pStats.averageRating} / 5` : 'No ratings';
      const posPct = pStats.positivePercent || 0;
      const negPct = pStats.negativePercent || 0;

      let aspectListHtml = '<span style="color:#888; font-size:0.8rem;">No aspect mentions</span>';
      if (pStats.topAspects && pStats.topAspects.length > 0) {
        aspectListHtml = pStats.topAspects.slice(0, 4).map(a => `
          <span style="display:inline-block; font-size:0.75rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; margin:2px;">
            ${escapeHtml(a.aspect)}: <strong>${a.positivePercent}% pos</strong>
          </span>
        `).join('');
      }

      statCardsHtml += `
        <div class="comparison-card">
          <div class="comparison-card-header">
            <h4 class="comparison-product-title">${escapeHtml(p.toUpperCase())}</h4>
            <span class="comparison-review-count">${pStats.totalFeedback} reviews</span>
          </div>

          <div style="font-size:1.25rem; font-weight:700; color:#e91e63; margin-bottom:8px;">
            ${starStr}
          </div>

          <div class="comparison-sentiment-bar" title="${posPct}% Pos / ${negPct}% Neg">
            <div class="sentiment-bar-fill pos" style="width:${posPct}%;"></div>
            <div class="sentiment-bar-fill neg" style="width:${negPct}%;"></div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#64748b; margin-top:4px; margin-bottom:12px;">
            <span>${posPct}% Positive</span>
            <span>${negPct}% Negative</span>
          </div>

          <div style="font-size:0.75rem; font-weight:600; color:#475569; margin-bottom:4px;">Top Mentioned Aspects:</div>
          <div>${aspectListHtml}</div>
        </div>
      `;
    }

    // 2. AI Synthesis
    let summariesHtml = '';
    if (Array.isArray(ai.productSummaries) && ai.productSummaries.length > 0) {
      summariesHtml = ai.productSummaries.map(ps => {
        const complaints = Array.isArray(ps.commonComplaints) && ps.commonComplaints.length > 0
          ? ps.commonComplaints.map(c => `<li>${escapeHtml(c)}</li>`).join('')
          : '<li>No recurring complaints reported.</li>';

        const positives = Array.isArray(ps.positiveThemes) && ps.positiveThemes.length > 0
          ? ps.positiveThemes.map(t => `<li>${escapeHtml(t)}</li>`).join('')
          : '<li>No clear positive themes identified.</li>';

        const citations = Array.isArray(ps.evidenceIds) && ps.evidenceIds.length > 0
          ? `<div class="ai-citations-box" style="margin-top:10px;">
              <span style="font-size:0.75rem; color:#64748b; font-weight:600;">Evidence:</span>
              ${ps.evidenceIds.map(cid => `
                <button type="button" class="citation-pill" onclick="window.highlightEvidenceCard('${escapeHtml(cid)}')">
                  📎 ${escapeHtml(cid)}
                </button>
              `).join('')}
            </div>`
          : '';

        return `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:14px;">
            <h5 style="font-size:0.95rem; font-weight:700; color:#0f172a; margin-bottom:10px; text-transform:uppercase;">
              ${escapeHtml(ps.product)}
            </h5>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:0.86rem;">
              <div>
                <strong style="color:#2e7d32;">👍 Positive Themes:</strong>
                <ul style="padding-left:18px; margin-top:4px; color:#334155;">${positives}</ul>
              </div>
              <div>
                <strong style="color:#c62828;">⚠️ Common Complaints:</strong>
                <ul style="padding-left:18px; margin-top:4px; color:#334155;">${complaints}</ul>
              </div>
            </div>
            ${citations}
          </div>
        `;
      }).join('');
    }

    // Differences
    let diffsHtml = '';
    if (Array.isArray(ai.comparativeDifferences) && ai.comparativeDifferences.length > 0) {
      diffsHtml = `
        <div style="margin-top:20px;">
          <h5 style="font-size:0.95rem; font-weight:700; color:#0f172a; margin-bottom:12px;">
            🔍 Key Comparative Differences
          </h5>
          ${ai.comparativeDifferences.map(d => {
            const citations = Array.isArray(d.evidenceIds) && d.evidenceIds.length > 0
              ? `<div class="ai-citations-box" style="margin-top:6px;">
                  ${d.evidenceIds.map(cid => `
                    <button type="button" class="citation-pill" onclick="window.highlightEvidenceCard('${escapeHtml(cid)}')">
                      📎 ${escapeHtml(cid)}
                    </button>
                  `).join('')}
                </div>`
              : '';

            return `
              <div style="background:#fff; border-left:3px solid #e91e63; padding:10px 14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <strong style="color:#e91e63; font-size:0.85rem;">${escapeHtml(d.dimension)}:</strong>
                <span style="font-size:0.88rem; color:#334155;"> ${escapeHtml(d.observation)}</span>
                ${citations}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Strategic Takeaways
    let takeawaysHtml = '';
    if (Array.isArray(ai.strategicTakeaways) && ai.strategicTakeaways.length > 0) {
      takeawaysHtml = `
        <div style="margin-top:20px; background:#fff8e1; border:1px solid #ffe082; border-radius:10px; padding:14px 18px;">
          <h5 style="font-size:0.92rem; font-weight:700; color:#f57f17; margin-bottom:8px;">
            💡 Strategic Product Takeaways
          </h5>
          <ul style="padding-left:18px; margin:0; font-size:0.86rem; color:#5d4037;">
            ${ai.strategicTakeaways.map(t => `<li style="margin-bottom:4px;">${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    // Evidence
    let evidenceHtml = '';
    if (evidenceList.length > 0) {
      evidenceHtml = `
        <div class="ai-evidence-section" style="margin-top:28px;">
          <h4 class="ai-card-title"><span>🗂️</span> <span>Supporting Review Evidence (${evidenceList.length})</span></h4>
          <div class="ai-evidence-grid">
            ${evidenceList.map(ev => renderEvidenceCard(ev)).join('')}
          </div>
        </div>
      `;
    }

    area.innerHTML = `
      <!-- Measured DB Statistics Section -->
      <div style="margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4 style="font-size:1.1rem; font-weight:700; color:#0f172a; margin:0;">
            📊 Measured Database Statistics
          </h4>
          <span style="font-size:0.75rem; background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:12px; font-weight:600;">
            Authentic MongoDB Metrics
          </span>
        </div>
        <div class="comparison-grid">
          ${statCardsHtml}
        </div>
      </div>

      <!-- AI Synthesis Section -->
      <div class="ai-answer-card">
        <div class="ai-answer-header">
          <div class="ai-answer-badge">
            <span>⚖️</span>
            <span>AI Comparative Synthesis</span>
          </div>
          <span style="font-size:0.78rem; color:#64748b;">Grounding: ${data.totalRetrievedReviews} customer reviews</span>
        </div>
        <p class="ai-summary-text" style="margin-bottom:18px;">
          ${escapeHtml(ai.summary || '')}
        </p>

        ${summariesHtml}
        ${diffsHtml}
        ${takeawaysHtml}

        <div class="ai-grounding-footer" style="margin-top:20px;">
          <div class="grounding-status">
            <span>🛡️</span>
            <span>${escapeHtml(data.disclaimer || 'AI-generated comparative analysis.')}</span>
          </div>
        </div>
      </div>

      ${evidenceHtml}
    `;

    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderComparisonErrorState(msg) {
    const area = document.getElementById('aiCompareResponseArea');
    if (!area) return;
    area.innerHTML = `
      <div class="ai-error-notice">
        <div class="notice-icon">⚠️</div>
        <div style="flex:1;">
          <h4>Comparison Unavailable</h4>
          <p>${escapeHtml(msg)}</p>
          <button type="button" class="btn btn-secondary" onclick="window.runProductComparison()" style="margin-top:10px; padding:6px 14px; font-size:0.85rem;">
            🔄 Retry Comparison
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 4. MODE 3: STRATEGIC AI RECOMMENDATIONS (PHASE 12)
  // =========================================================================

  window.runAiRecommendations = async function () {
    if (isSubmitting) return;

    const token = getAdminToken();
    if (!token) {
      alert('Administrator login required.');
      return;
    }

    const product = document.getElementById('recProductSelect')?.value || 'all';
    const focusArea = document.getElementById('recFocusSelect')?.value || 'all';
    const dateRange = document.getElementById('recDateRangeSelect')?.value || 'all';

    const responseArea = document.getElementById('aiRecommendationsResponseArea');
    const submitBtn = document.getElementById('btnRunRecommendations');
    if (!responseArea) return;

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> <span>Formulating Recommendations...</span>';
    }

    renderRecommendationsLoadingState(product, focusArea);

    try {
      const filters = {};
      if (dateRange && dateRange !== 'all') filters.dateRange = dateRange;

      const res = await fetch(`${BASE_URL}/api/admin/ai/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ product, focusArea, filters })
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        renderRecommendationsErrorState(json?.error || 'Failed to generate recommendations.');
        return;
      }

      if (json && json.success && json.data) {
        renderRecommendationsSuccessState(json.data);
      } else {
        renderRecommendationsErrorState('Incomplete recommendations response received.');
      }
    } catch (err) {
      console.error('Recommendations error:', err);
      renderRecommendationsErrorState('Network communication error while generating recommendations.');
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🎯</span> <span>Generate Strategic Recommendations</span>';
      }
    }
  };

  function renderRecommendationsLoadingState(product, focus) {
    const area = document.getElementById('aiRecommendationsResponseArea');
    if (!area) return;

    area.innerHTML = `
      <div class="ai-skeleton-card">
        <div class="ai-skeleton-line title" style="width:35%;"></div>
        <p style="font-size:0.92rem; color:#64748b; margin-bottom:18px;">
          <em>Analyzing customer reviews for product: ${escapeHtml(product)}, focus: ${escapeHtml(focus)} ...</em>
        </p>
        <div class="ai-skeleton-line w-80"></div>
        <div class="ai-skeleton-line w-60"></div>
        <div class="ai-skeleton-card" style="margin-top:20px;"></div>
      </div>
    `;
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRecommendationsSuccessState(data) {
    const area = document.getElementById('aiRecommendationsResponseArea');
    if (!area) return;

    if (data.insufficientEvidence || !data.retrievedReviewCount) {
      area.innerHTML = `
        <div class="ai-insufficient-notice">
          <div class="notice-icon">ℹ️</div>
          <div>
            <h4>Insufficient Evidence for Recommendations</h4>
            <p>${escapeHtml(data.summary || 'No approved customer reviews match the selected product and focus area.')}</p>
            <p style="font-size:0.85rem; color:#b45309; margin:0;">
              💡 <strong>Tip:</strong> Broaden the focus area to "All Focus Areas" or choose a category with verified reviews.
            </p>
          </div>
        </div>
      `;
      area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const recs = Array.isArray(data.prioritizedRecommendations) ? data.prioritizedRecommendations : [];
    const evidenceList = Array.isArray(data.evidence) ? data.evidence : [];

    let recCardsHtml = '';
    if (recs.length > 0) {
      recCardsHtml = recs.map((r, idx) => {
        const priority = r.priority || 'Medium';
        const priorityClass = `priority-${priority.toLowerCase()}`;

        const citations = Array.isArray(r.evidenceIds) && r.evidenceIds.length > 0
          ? `<div class="ai-citations-box" style="margin-top:12px;">
              <span style="font-size:0.75rem; color:#64748b; font-weight:600;">Supporting Evidence:</span>
              ${r.evidenceIds.map(cid => `
                <button type="button" class="citation-pill" onclick="window.highlightEvidenceCard('${escapeHtml(cid)}')">
                  📎 ${escapeHtml(cid)}
                </button>
              `).join('')}
            </div>`
          : '';

        return `
          <div class="rec-card ${priorityClass}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
              <div>
                <span class="rec-priority-badge ${priorityClass}">${escapeHtml(priority)} Priority</span>
                <span class="rec-category-badge">${escapeHtml(r.category || 'General')}</span>
              </div>
              <span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">#${idx + 1}</span>
            </div>

            <h4 style="font-size:1.05rem; font-weight:700; color:#0f172a; margin-bottom:8px;">
              ${escapeHtml(r.title || 'Strategic Recommendation')}
            </h4>

            <div style="font-size:0.9rem; color:#334155; margin-bottom:12px; line-height:1.5;">
              <strong>Proposed Action:</strong> ${escapeHtml(r.action || '')}
            </div>

            <div style="background:#f1f5f9; border-radius:8px; padding:10px 14px; font-size:0.86rem; color:#475569;">
              <strong>Expected Business Impact:</strong> ${escapeHtml(r.expectedImpact || '')}
            </div>

            ${citations}
          </div>
        `;
      }).join('');
    } else {
      recCardsHtml = '<p style="color:#64748b;">No recommendations formulated for this selection.</p>';
    }

    let evidenceHtml = '';
    if (evidenceList.length > 0) {
      evidenceHtml = `
        <div class="ai-evidence-section" style="margin-top:28px;">
          <h4 class="ai-card-title"><span>🗂️</span> <span>Grounded Customer Evidence (${evidenceList.length})</span></h4>
          <div class="ai-evidence-grid">
            ${evidenceList.map(ev => renderEvidenceCard(ev)).join('')}
          </div>
        </div>
      `;
    }

    area.innerHTML = `
      <div class="ai-answer-card">
        <div class="ai-answer-header">
          <div class="ai-answer-badge">
            <span>🎯</span>
            <span>Prioritized Strategic Intelligence</span>
          </div>
          <span style="font-size:0.78rem; color:#64748b;">Based on ${data.retrievedReviewCount} verified reviews</span>
        </div>

        <p class="ai-summary-text" style="margin-bottom:20px;">
          ${escapeHtml(data.summary || '')}
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          ${recCardsHtml}
        </div>

        <div class="ai-grounding-footer" style="margin-top:24px;">
          <div class="grounding-status">
            <span>🛡️</span>
            <span>${escapeHtml(data.disclaimer || 'AI-generated recommendations based on customer feedback.')}</span>
          </div>
        </div>
      </div>

      ${evidenceHtml}
    `;

    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRecommendationsErrorState(msg) {
    const area = document.getElementById('aiRecommendationsResponseArea');
    if (!area) return;
    area.innerHTML = `
      <div class="ai-error-notice">
        <div class="notice-icon">⚠️</div>
        <div style="flex:1;">
          <h4>Recommendations Unavailable</h4>
          <p>${escapeHtml(msg)}</p>
          <button type="button" class="btn btn-secondary" onclick="window.runAiRecommendations()" style="margin-top:10px; padding:6px 14px; font-size:0.85rem;">
            🔄 Retry Formulation
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 5. SHARED EVIDENCE CITATION INTERACTION
  // =========================================================================

  window.highlightEvidenceCard = function (refToken) {
    if (!refToken) return;

    const targetId = `evidence-${refToken.trim()}`;
    const card = document.getElementById(targetId);

    if (!card) {
      console.warn(`[AI Dashboard] Evidence card not found for reference token: ${refToken}`);
      return;
    }

    document.querySelectorAll('.evidence-card.evidence-highlight').forEach(c => {
      c.classList.remove('evidence-highlight');
    });

    card.classList.add('evidence-highlight');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      card.classList.remove('evidence-highlight');
    }, 2800);
  };

  // =========================================================================
  // 6. INITIALIZATION ON DOM READY
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    // Mode 1 listeners
    const input = document.getElementById('aiQuestionInput');
    if (input) {
      input.addEventListener('input', window.updateAiCharCounter);
      input.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          window.askAi();
        }
      });
      window.updateAiCharCounter();
    }

    const filterInputs = [
      'aiFilterProduct', 'aiFilterSentiment', 'aiFilterRating',
      'aiFilterAspect', 'aiFilterDateRange', 'aiFilterDateFrom', 'aiFilterDateTo'
    ];
    filterInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', window.updateActiveFilterPills);
    });

    window.updateActiveFilterPills();
    updateCompareProductPillStates();
  });

})();
