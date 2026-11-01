/**
 * Search & Feedback Intelligence Browser (Frontend - Phase 6)
 *
 * Implements public search, multi-factor filtering, sorting, pagination,
 * URL query parameter synchronization, and interactive detail modals.
 */

const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port))
  ? '' : 'http://localhost:3000';

let currentPage = 1;
const PAGE_LIMIT = 6;
let searchDebounceTimer = null;

// Helper to escape HTML in user text
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Map rating number to stars string
function renderStars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// Build URL query string from UI inputs
function getFilterParams(page = 1) {
  const q = document.getElementById('publicSearchInput')?.value.trim() || '';
  const product = document.getElementById('publicProductFilter')?.value || 'all';
  const sentiment = document.getElementById('publicSentimentFilter')?.value || 'all';
  const rating = document.getElementById('publicRatingFilter')?.value || 'all';
  const aspect = document.getElementById('publicAspectFilter')?.value || 'all';
  const date = document.getElementById('publicDateFilter')?.value || 'all';
  const sort = document.getElementById('publicSortFilter')?.value || 'newest';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (product && product !== 'all') params.set('product', product);
  if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
  if (rating && rating !== 'all') params.set('rating', rating);
  if (aspect && aspect !== 'all') params.set('aspect', aspect);
  if (date && date !== 'all') params.set('date', date);
  if (sort && sort !== 'newest') params.set('sort', sort);

  params.set('page', page);
  params.set('limit', PAGE_LIMIT);

  return params;
}

// Sync current filter state to browser URL without reloading
function syncUrlWithFilters(params) {
  if (window.history && window.history.replaceState) {
    const searchStr = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', searchStr);
  }
}

// Load filters from URL on page load
function populateFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) {
    const el = document.getElementById('publicSearchInput');
    if (el) el.value = params.get('q');
  }
  if (params.has('product')) {
    const el = document.getElementById('publicProductFilter');
    if (el) el.value = params.get('product');
  }
  if (params.has('sentiment')) {
    const el = document.getElementById('publicSentimentFilter');
    if (el) el.value = params.get('sentiment');
  }
  if (params.has('rating')) {
    const el = document.getElementById('publicRatingFilter');
    if (el) el.value = params.get('rating');
  }
  if (params.has('aspect')) {
    const el = document.getElementById('publicAspectFilter');
    if (el) el.value = params.get('aspect');
  }
  if (params.has('date')) {
    const el = document.getElementById('publicDateFilter');
    if (el) el.value = params.get('date');
  }
  if (params.has('sort')) {
    const el = document.getElementById('publicSortFilter');
    if (el) el.value = params.get('sort');
  }
  if (params.has('page')) {
    const p = parseInt(params.get('page'), 10);
    if (!isNaN(p) && p > 0) currentPage = p;
  }
}

// Fetch and render feedback list
window.loadPublicFeedbacks = async function (page = currentPage) {
  currentPage = page;
  const container = document.getElementById('publicReviewsContainer');
  const countBar = document.getElementById('resultsCountBar');
  const countText = document.getElementById('resultsCountText');
  const paginationContainer = document.getElementById('publicPaginationContainer');

  if (!container) return;

  container.innerHTML = '<div class="loading-state">⏳ Loading feedback...</div>';

  const params = getFilterParams(currentPage);
  syncUrlWithFilters(params);

  try {
    const res = await fetch(`${API_BASE}/api/feedback?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();

    const feedbacks = json.data || [];
    const pagination = json.pagination || { page: 1, limit: PAGE_LIMIT, total: feedbacks.length, totalPages: 1 };

    if (feedbacks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
          <h4>No feedback matches your filters</h4>
          <p>Try clearing or broadening your search criteria.</p>
          <button class="btn btn-secondary" onclick="clearPublicFilters()" style="margin-top: 10px;">Clear Filters</button>
        </div>`;
      if (countBar) countBar.style.display = 'none';
      if (paginationContainer) paginationContainer.style.display = 'none';
      return;
    }

    // Update count display
    const startIdx = (pagination.page - 1) * pagination.limit + 1;
    const endIdx = Math.min(pagination.page * pagination.limit, pagination.total);
    if (countBar && countText) {
      countText.textContent = `Showing ${startIdx}–${endIdx} of ${pagination.total} verified reviews`;
      countBar.style.display = 'block';
    }

    // Render cards
    container.innerHTML = feedbacks.map(fb => {
      const sentiment = fb.sentiment || 'Neutral';
      const sentimentClass = `badge--${sentiment.toLowerCase()}`;
      const safeComment = escapeHtml(fb.feedback || '');
      const safeProduct = escapeHtml(fb.product || 'General');
      const safeName = escapeHtml(fb.name || 'Verified Customer');
      const dateFormatted = fb.submittedAt ? new Date(fb.submittedAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : '';

      return `
        <div class="review-card">
          <div class="review-card__header">
            <div>
              <div class="review-card__stars">${renderStars(fb.rating)}</div>
              <span class="review-card__product">${safeProduct}</span>
            </div>
            <span class="badge ${sentimentClass}">${sentiment}</span>
          </div>

          <p class="review-card__text">"${safeComment}"</p>

          ${(fb.aspects && fb.aspects.length > 0) ? `
            <div class="review-card__aspects">
              ${fb.aspects.map(a => {
                const s = (a.sentiment || 'Neutral').toLowerCase();
                return `<span class="aspect-pill aspect-pill--${s}">${escapeHtml(a.name)}</span>`;
              }).join('')}
            </div>
          ` : ''}

          <div class="review-card__footer">
            <div class="review-card__meta">
              <span class="review-card__author">${safeName}</span>
              <span class="review-card__date">${dateFormatted}</span>
            </div>

            <div style="display:flex; align-items:center; gap: 8px;">
              ${fb.imagePath ? `
                <img src="${API_BASE}${fb.imagePath}" alt="Review photo" class="review-card__thumb"
                     onclick="openLightbox('${API_BASE}${fb.imagePath}')" title="Click to enlarge" />
              ` : ''}
              <button class="btn-detail" onclick="viewFeedbackDetail('${fb._id}')">View Details</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    renderPagination(pagination);
  } catch (err) {
    console.error('Error fetching feedbacks:', err);
    container.innerHTML = `
      <div class="error-state">
        <p>❌ Unable to load feedback. Please try again.</p>
        <button class="btn btn-secondary" onclick="loadPublicFeedbacks(${currentPage})" style="margin-top: 10px;">Retry</button>
      </div>`;
    if (countBar) countBar.style.display = 'none';
    if (paginationContainer) paginationContainer.style.display = 'none';
  }
};

// Render pagination bar
function renderPagination(p) {
  const container = document.getElementById('publicPaginationContainer');
  if (!container) return;
  if (!p || p.totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  let html = '';

  // Prev button
  const prevDisabled = p.page <= 1 ? 'disabled' : '';
  html += `<button class="page-btn page-btn--nav" ${prevDisabled} onclick="loadPublicFeedbacks(${p.page - 1})">&laquo; Previous</button>`;

  // Page numbers
  for (let i = 1; i <= p.totalPages; i++) {
    // Show first, last, current, and adjacent pages
    if (i === 1 || i === p.totalPages || (i >= p.page - 1 && i <= p.page + 1)) {
      const activeClass = i === p.page ? 'page-btn--active' : '';
      html += `<button class="page-btn ${activeClass}" onclick="loadPublicFeedbacks(${i})">${i}</button>`;
    } else if (i === p.page - 2 || i === p.page + 2) {
      html += `<span class="page-ellipsis">...</span>`;
    }
  }

  // Next button
  const nextDisabled = p.page >= p.totalPages ? 'disabled' : '';
  html += `<button class="page-btn page-btn--nav" ${nextDisabled} onclick="loadPublicFeedbacks(${p.page + 1})">Next &raquo;</button>`;

  container.innerHTML = html;
}

// Detail Modal Handler
window.viewFeedbackDetail = async function (id) {
  const modal = document.getElementById('feedbackDetailModal');
  const body = document.getElementById('modalBodyContent');
  if (!modal || !body) return;

  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading-state">⏳ Loading details...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/feedback/${id}`);
    if (!res.ok) throw new Error('Feedback not found');
    const json = await res.json();
    const fb = json.data;

    const sentiment = fb.sentiment || 'Neutral';
    const sentimentClass = `badge--${sentiment.toLowerCase()}`;
    const confidencePct = fb.sentimentConfidence ? Math.round(fb.sentimentConfidence * 100) : 0;
    const safeProduct = escapeHtml(fb.product || 'General');
    const safeComment = escapeHtml(fb.feedback || '');
    const safeName = escapeHtml(fb.name || 'Verified Customer');
    const dateFormatted = fb.submittedAt ? new Date(fb.submittedAt).toLocaleString() : '';

    body.innerHTML = `
      <div class="modal-detail-row">
        <div>
          <h4 style="font-size:1.15rem; color:#2c2c2c; margin-bottom:4px;">${safeProduct}</h4>
          <div style="color:#f57c00; font-size:1.1rem;">${renderStars(fb.rating)} (${fb.rating}/5)</div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${sentimentClass}" style="font-size:0.85rem; padding:5px 12px;">${sentiment}</span>
          ${confidencePct > 0 ? `<div style="font-size:0.75rem; color:#777; margin-top:4px;">Confidence: ${confidencePct}%</div>` : ''}
        </div>
      </div>

      <div class="modal-detail-box">
        <label style="font-weight:600; font-size:0.85rem; color:#666; text-transform:uppercase;">Full Review</label>
        <p style="font-size:0.95rem; line-height:1.6; color:#333; margin-top:6px;">"${safeComment}"</p>
      </div>

      ${(fb.aspects && fb.aspects.length > 0) ? `
        <div class="modal-detail-box">
          <label style="font-weight:600; font-size:0.85rem; color:#666; text-transform:uppercase;">Detected Fashion Aspects</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
            ${fb.aspects.map(a => {
              const s = (a.sentiment || 'Neutral').toLowerCase();
              const scoreText = typeof a.score === 'number' ? ` (${a.score > 0 ? '+' : ''}${a.score})` : '';
              return `
                <div class="aspect-chip aspect-chip--${s}">
                  <strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.sentiment)}${scoreText}
                </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${fb.imagePath ? `
        <div class="modal-detail-box">
          <label style="font-weight:600; font-size:0.85rem; color:#666; text-transform:uppercase;">Customer Photo</label>
          <div style="margin-top:8px;">
            <img src="${API_BASE}${fb.imagePath}" alt="Customer photo" style="max-height:220px; border-radius:8px; cursor:pointer; border:1px solid #ddd;"
                 onclick="openLightbox('${API_BASE}${fb.imagePath}')" title="Click to view full image" />
          </div>
        </div>
      ` : ''}

      <div style="margin-top:16px; padding-top:12px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:0.82rem; color:#777;">
        <span>Submitted by <strong>${safeName}</strong></span>
        <span>${dateFormatted}</span>
      </div>
    `;
  } catch (err) {
    body.innerHTML = '<p class="error-state">❌ Unable to load review details.</p>';
  }
};

window.closeDetailModal = function (event) {
  const modal = document.getElementById('feedbackDetailModal');
  if (modal) modal.style.display = 'none';
};

// Filter actions
window.applyPublicFilters = function () {
  loadPublicFeedbacks(1);
};

window.clearPublicFilters = function () {
  const inputs = ['publicSearchInput', 'publicProductFilter', 'publicSentimentFilter', 'publicRatingFilter', 'publicAspectFilter', 'publicDateFilter', 'publicSortFilter'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = el.options[0].value;
      if (id === 'publicDateFilter') el.value = 'all';
      if (id === 'publicSortFilter') el.value = 'newest';
    } else {
      el.value = '';
    }
  });
  currentPage = 1;
  loadPublicFeedbacks(1);
};

// Lightbox helper for feedback page
window.openLightbox = function (imgSrc) {
  let modal = document.getElementById('imageLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageLightboxModal';
    modal.style.cssText = 'display:flex; position:fixed; z-index:99999; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.88); justify-content:center; align-items:center; cursor:zoom-out;';
    modal.innerHTML = `
      <div style="position:relative; max-width:90%; max-height:90%; text-align:center;" onclick="event.stopPropagation();">
        <span style="position:absolute; top:-35px; right:0; color:#fff; font-size:32px; font-weight:bold; cursor:pointer;" onclick="document.getElementById('imageLightboxModal').style.display='none';">&times;</span>
        <img id="lightboxImg" src="" style="max-width:100%; max-height:85vh; border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,0.5); border:3px solid #e91e63;" />
      </div>
    `;
    modal.addEventListener('click', () => { modal.style.display = 'none'; });
    document.body.appendChild(modal);
  }
  document.getElementById('lightboxImg').src = imgSrc;
  modal.style.display = 'flex';
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  populateFiltersFromUrl();

  // Attach live debounced search on text input
  const searchInput = document.getElementById('publicSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        loadPublicFeedbacks(1);
      }, 350);
    });
  }

  // Auto-apply on dropdown changes
  const dropdowns = ['publicProductFilter', 'publicSentimentFilter', 'publicRatingFilter', 'publicAspectFilter', 'publicDateFilter', 'publicSortFilter'];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        loadPublicFeedbacks(1);
      });
    }
  });

  loadPublicFeedbacks(currentPage);
});
