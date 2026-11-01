const BASE_URL = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';

function getAdminToken() {
  return localStorage.getItem("adminToken") || localStorage.getItem("token");
}

// ✅ Logout function
window.logout = function () {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  localStorage.removeItem("isAdminLoggedIn");
  window.location.href = "admin-login.html";
};

// ✅ Image Lightbox preview for review photos
window.openLightbox = function (imgSrc) {
  let modal = document.getElementById('imageLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageLightboxModal';
    modal.style.cssText = 'display:flex; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; cursor:pointer;';
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

// 🚫 Verify authentication on page load
function handleAuthError(message) {
  alert(message || "Session expired or access denied. Please log in as admin.");
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  localStorage.removeItem("isAdminLoggedIn");
  window.location.href = "admin-login.html";
}

let adminFeedbackPage = 1;
const ADMIN_PAGE_LIMIT = 10;
let adminSearchDebounceTimer = null;

// Filter triggers for admin feedback tab
window.applyAdminFilters = function () {
  adminFeedbackPage = 1;
  window.loadFeedbacks(1);
};

window.clearAdminFilters = function () {
  const inputs = ['adminSearchInput', 'adminStatusFilter', 'adminProductFilter', 'adminSentimentFilter', 'adminRatingFilter', 'adminAspectFilter', 'adminSortFilter'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = el.options[0].value;
      if (id === 'adminSortFilter') el.value = 'newest';
    } else {
      el.value = '';
    }
  });
  adminFeedbackPage = 1;
  window.loadFeedbacks(1);
};

// Render pagination bar for admin feedbacks
function renderAdminPagination(p) {
  const container = document.getElementById('adminPaginationBar');
  if (!container) return;
  if (!p || p.totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  let html = '';
  const prevDisabled = p.page <= 1 ? 'disabled' : '';
  html += `<button class="page-btn page-btn--nav" ${prevDisabled} onclick="loadFeedbacks(${p.page - 1})">&laquo; Prev</button>`;

  for (let i = 1; i <= p.totalPages; i++) {
    if (i === 1 || i === p.totalPages || (i >= p.page - 1 && i <= p.page + 1)) {
      const activeClass = i === p.page ? 'page-btn--active' : '';
      html += `<button class="page-btn ${activeClass}" onclick="loadFeedbacks(${i})">${i}</button>`;
    } else if (i === p.page - 2 || i === p.page + 2) {
      html += `<span class="page-ellipsis">...</span>`;
    }
  }

  const nextDisabled = p.page >= p.totalPages ? 'disabled' : '';
  html += `<button class="page-btn page-btn--nav" ${nextDisabled} onclick="loadFeedbacks(${p.page + 1})">Next &raquo;</button>`;
  container.innerHTML = html;
}

// ✅ Load feedbacks with full search, filter, and pagination
window.loadFeedbacks = async function (page = adminFeedbackPage) {
  adminFeedbackPage = page;
  const feedbackList = document.getElementById('feedbackList');
  const countEl = document.getElementById('adminResultsCount');
  const paginationBar = document.getElementById('adminPaginationBar');
  const token = getAdminToken();

  if (!token) {
    handleAuthError("Please log in as an administrator.");
    return;
  }

  // Build query from controls if present
  const q = document.getElementById('adminSearchInput')?.value.trim() || '';
  const moderationStatus = document.getElementById('adminStatusFilter')?.value || 'all';
  const product = document.getElementById('adminProductFilter')?.value || 'all';
  const sentiment = document.getElementById('adminSentimentFilter')?.value || 'all';
  const rating = document.getElementById('adminRatingFilter')?.value || 'all';
  const aspect = document.getElementById('adminAspectFilter')?.value || 'all';
  const sort = document.getElementById('adminSortFilter')?.value || 'newest';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (moderationStatus && moderationStatus !== 'all') params.set('moderationStatus', moderationStatus);
  if (product && product !== 'all') params.set('product', product);
  if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
  if (rating && rating !== 'all') params.set('rating', rating);
  if (aspect && aspect !== 'all') params.set('aspect', aspect);
  if (sort && sort !== 'newest') params.set('sort', sort);
  params.set('page', adminFeedbackPage);
  params.set('limit', ADMIN_PAGE_LIMIT);

  try {
    feedbackList.innerHTML = '<div class="loading">Loading feedbacks...</div>';
    const res = await fetch(`${BASE_URL}/api/admin/feedback/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError("Access forbidden. Admin credentials required.");
      return;
    }

    if (!res.ok) throw new Error("Server error loading feedbacks");

    const json = await res.json();
    const feedbacks = json.data || [];
    const p = json.pagination || { page: 1, limit: ADMIN_PAGE_LIMIT, total: feedbacks.length, totalPages: 1 };

    if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
      feedbackList.innerHTML = '<p style="padding:15px; color:#666;">No feedbacks found matching your search.</p>';
      if (countEl) countEl.textContent = '';
      if (paginationBar) paginationBar.style.display = 'none';
      return;
    }

    if (countEl) {
      const startIdx = (p.page - 1) * p.limit + 1;
      const endIdx = Math.min(p.page * p.limit, p.total);
      countEl.textContent = `Showing ${startIdx}–${endIdx} of ${p.total} total customer feedbacks`;
    }

    const statusBadgeColor = {
      published: '#2196f3',
      approved: '#4caf50',
      flagged: '#ff9800',
      rejected: '#f44336'
    };

    feedbackList.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Photo</th><th>User</th><th>Product</th><th>Rating</th>
            <th>Feedback</th><th>Sentiment</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${feedbacks.map(fb => {
            const statusColor = statusBadgeColor[fb.moderationStatus] || '#9e9e9e';
            const safeComment = (fb.feedback || '').replace(/"/g, '&quot;');
            return `
            <tr>
              <td style="text-align: center;">
                ${fb.imagePath ? `
                  <img src="${BASE_URL}${fb.imagePath}" alt="Review photo" class="review-thumb" 
                       onclick="openLightbox('${BASE_URL}${fb.imagePath}')"
                       style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid #ddd;"
                       title="Click to view full size" />
                ` : '<span style="color:#aaa; font-size:0.8rem;">No Photo</span>'}
              </td>
              <td><strong>${fb.name || 'Anonymous'}</strong><br/><small style="color:#777;">${fb.email || '-'}</small></td>
              <td><strong>${fb.product || '-'}</strong></td>
              <td>${fb.rating || 0} ⭐</td>
              <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeComment}">
                ${fb.feedback || '-'}
              </td>
              <td><span style="font-weight:600;">${fb.sentiment || 'Neutral'}</span></td>
              <td>
                <span style="display:inline-block; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; color:#fff; background:${statusColor}; text-transform:capitalize;">
                  ${fb.moderationStatus || 'published'}
                </span>
              </td>
              <td style="white-space:nowrap;">
                <button onclick="openAdminDetail('${fb._id}')" 
                        style="background:#2196f3; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-right:4px;">Details</button>
                ${fb.moderationStatus !== 'approved' ? `
                  <button onclick="approveFeedback('${fb._id}')" 
                          style="background:#4caf50; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-right:4px;">Approve</button>
                ` : ''}
                ${fb.moderationStatus !== 'rejected' ? `
                  <button onclick="rejectFeedback('${fb._id}')" 
                          style="background:#f44336; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem;">Reject</button>
                ` : ''}
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    renderAdminPagination(p);
  } catch (err) {
    console.error('Failed to load feedbacks:', err);
    feedbackList.innerHTML = '<p class="error">Failed to load feedbacks. Please check server connection.</p>';
  }
};

// Admin Feedback Detail Modal (Phase 6)
window.openAdminDetail = async function (id) {
  const modal = document.getElementById('adminFeedbackDetailModal');
  const body = document.getElementById('adminDetailBody');
  const token = getAdminToken();
  if (!modal || !body || !token) return;

  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading">Loading details...</div>';

  try {
    const res = await fetch(`${BASE_URL}/api/admin/feedback/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Feedback not found');
    const json = await res.json();
    const fb = json.data;

    const spamPct = Math.round((fb.spamScore || 0) * 100);
    const spamColor = spamPct >= 70 ? '#f44336' : (spamPct >= 40 ? '#ff9800' : '#4caf50');
    const confidencePct = fb.sentimentConfidence ? Math.round(fb.sentimentConfidence * 100) : 0;
    const safeComment = (fb.feedback || '').replace(/"/g, '&quot;');

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
        <div>
          <h4 style="margin:0; font-size:1.15rem; color:#2c2c2c;">Product: ${fb.product || 'General'}</h4>
          <div style="color:#f57c00; font-size:1rem; margin-top:2px;">Rating: ${'★'.repeat(fb.rating || 0)} (${fb.rating}/5)</div>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:700; color:#fff; background:${fb.moderationStatus === 'approved' ? '#4caf50' : (fb.moderationStatus === 'rejected' ? '#f44336' : (fb.moderationStatus === 'flagged' ? '#ff9800' : '#2196f3'))}; text-transform:uppercase;">
            ${fb.moderationStatus}
          </span>
          <div style="font-size:0.75rem; color:#777; margin-top:4px;">Sentiment: <strong>${fb.sentiment}</strong> (Conf: ${confidencePct}%)</div>
        </div>
      </div>

      <div style="background:#f9f9f9; border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
        <label style="font-size:0.76rem; font-weight:700; color:#666; text-transform:uppercase;">Customer Review</label>
        <p style="margin:6px 0 0 0; font-size:0.95rem; line-height:1.5; color:#333;">"${safeComment}"</p>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div style="background:#f9f9f9; border:1px solid #eee; border-radius:8px; padding:10px;">
          <label style="font-size:0.76rem; font-weight:700; color:#666; text-transform:uppercase;">User Info</label>
          <div style="font-size:0.85rem; margin-top:4px;"><strong>Name:</strong> ${fb.name || 'Anonymous'}</div>
          <div style="font-size:0.85rem; color:#555;"><strong>Email:</strong> ${fb.email || 'None'}</div>
          <div style="font-size:0.75rem; color:#888; margin-top:4px;">${new Date(fb.submittedAt).toLocaleString()}</div>
        </div>

        <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:10px;">
          <label style="font-size:0.76rem; font-weight:700; color:#bf360c; text-transform:uppercase;">Spam &amp; Moderation Analysis</label>
          <div style="font-size:0.85rem; margin-top:4px;">
            Spam Score: <strong style="color:${spamColor}; font-size:1rem;">${spamPct}%</strong>
            (${fb.isSpam ? '⚠️ Flagged' : '✅ Clean'})
          </div>
          <div style="margin-top:6px;">
            <label style="font-size:0.72rem; font-weight:600; color:#666;">Reasons:</label>
            <div>
              ${(fb.spamReasons && fb.spamReasons.length > 0)
                ? fb.spamReasons.map(r => `<span style="display:inline-block; background:#ffebee; color:#c62828; padding:2px 6px; border-radius:4px; font-size:0.72rem; margin:2px 2px 0 0;">${r}</span>`).join('')
                : '<span style="color:#2e7d32; font-size:0.75rem;">None (Clean submission)</span>'}
            </div>
          </div>
        </div>
      </div>

      ${(fb.aspects && fb.aspects.length > 0) ? `
        <div style="background:#f9f9f9; border:1px solid #eee; border-radius:8px; padding:10px; margin-bottom:12px;">
          <label style="font-size:0.76rem; font-weight:700; color:#666; text-transform:uppercase;">Detected Fashion Aspects</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
            ${fb.aspects.map(a => {
              const s = (a.sentiment || 'Neutral').toLowerCase();
              const bg = s === 'positive' ? '#e8f5e9' : (s === 'negative' ? '#ffebee' : '#f5f5f5');
              const fg = s === 'positive' ? '#2e7d32' : (s === 'negative' ? '#c62828' : '#616161');
              return `<span style="background:${bg}; color:${fg}; padding:3px 8px; border-radius:4px; font-size:0.76rem; font-weight:600;">${a.name}: ${a.sentiment} (${a.score > 0 ? '+' : ''}${a.score})</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${fb.imagePath ? `
        <div style="margin-bottom:14px;">
          <label style="font-size:0.76rem; font-weight:700; color:#666; text-transform:uppercase;">Attached Photo</label>
          <div style="margin-top:6px;">
            <img src="${BASE_URL}${fb.imagePath}" alt="Review photo" 
                 onclick="openLightbox('${BASE_URL}${fb.imagePath}')"
                 style="max-height:180px; border-radius:8px; border:1px solid #ddd; cursor:pointer;" title="Click to enlarge" />
          </div>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:14px; margin-top:14px;">
        <button onclick="closeAdminDetailModal()" style="padding:6px 14px; border:1px solid #ccc; background:#fff; border-radius:6px; cursor:pointer;">Close</button>
        <div style="display:flex; gap:8px;">
          <button onclick="approveFeedback('${fb._id}'); closeAdminDetailModal();" style="padding:6px 14px; background:#4caf50; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Approve Review</button>
          <button onclick="rejectFeedback('${fb._id}'); closeAdminDetailModal();" style="padding:6px 14px; background:#f44336; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Reject Review</button>
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = '<p class="error">Failed to load feedback details.</p>';
  }
};

window.closeAdminDetailModal = function (event) {
  const modal = document.getElementById('adminFeedbackDetailModal');
  if (modal) modal.style.display = 'none';
};

// ✅ Load surveys with JWT Bearer Token
window.loadSurveys = async function () {
  const surveyList = document.getElementById('surveyList');
  const token = getAdminToken();

  if (!token) {
    handleAuthError("Please log in as an administrator.");
    return;
  }

  try {
    surveyList.innerHTML = '<div class="loading">Loading surveys...</div>';
    const res = await fetch(`${BASE_URL}/api/admin/surveys`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError("Access forbidden. Admin credentials required.");
      return;
    }

    if (!res.ok) throw new Error("Server error loading surveys");

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      surveyList.innerHTML = '<p>No surveys available.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Age</th><th>Style</th>
          <th>Colors</th><th>Budget</th><th>Shopping</th><th>Suggestions</th><th>Submitted At</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(s => `
          <tr>
            <td>${s.name || '-'}</td>
            <td>${s.email || '-'}</td>
            <td>${s.age || '-'}</td>
            <td>${(s.style || []).join(', ')}</td>
            <td>${(s.colors || []).join(', ')}</td>
            <td>${s.budget || '-'}</td>
            <td>${s.shoppingFrequency || '-'}</td>
            <td>${s.suggestions || '-'}</td>
            <td>${new Date(s.submittedAt).toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    surveyList.innerHTML = '';
    surveyList.appendChild(table);
  } catch (err) {
    console.error('Survey loading failed:', err);
    surveyList.innerHTML = '<p class="error">Error loading surveys. Please check server connection.</p>';
  }
};

// ✅ Load flagged feedback for moderation (Phase 4)
window.loadFlaggedFeedbacks = async function () {
  const moderationList = document.getElementById('moderationList');
  const token = getAdminToken();

  if (!token) {
    handleAuthError("Please log in as an administrator.");
    return;
  }

  try {
    moderationList.innerHTML = '<div class="loading">Loading flagged feedback...</div>';
    const res = await fetch(`${BASE_URL}/api/admin/flagged-feedback`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError("Access forbidden. Admin credentials required.");
      return;
    }

    if (!res.ok) throw new Error("Server error loading flagged feedback");

    const json = await res.json();
    const items = json.data || [];

    if (!Array.isArray(items) || items.length === 0) {
      moderationList.innerHTML = '<p style="padding:15px; color:#666;">No flagged feedback pending moderation. All reviews are clean!</p>';
      return;
    }

    moderationList.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Photo</th><th>User</th><th>Product</th><th>Rating</th>
            <th>Feedback</th><th>Spam Score</th><th>Flag Reasons</th>
            <th>Sentiment</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(fb => {
            const spamPct = Math.round((fb.spamScore || 0) * 100);
            const scoreColor = spamPct >= 70 ? '#d32f2f' : (spamPct >= 40 ? '#f57c00' : '#388e3c');
            const statusBadgeColor = fb.moderationStatus === 'flagged' ? '#f57c00' : (fb.moderationStatus === 'approved' ? '#388e3c' : '#d32f2f');

            return `
              <tr>
                <td style="text-align: center;">
                  ${fb.imagePath ? `
                    <img src="${BASE_URL}${fb.imagePath}" alt="Review photo" class="review-thumb" 
                         onclick="openLightbox('${BASE_URL}${fb.imagePath}')"
                         style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid #ddd;"
                         title="Click to view full size" />
                  ` : '<span style="color:#aaa; font-size:0.8rem;">No Photo</span>'}
                </td>
                <td><strong>${fb.name || 'Anonymous'}</strong><br/><small style="color:#777;">${fb.email || '-'}</small></td>
                <td>${fb.product || '-'}</td>
                <td>${fb.rating || 0} ⭐</td>
                <td>${fb.feedback || '-'}</td>
                <td><span style="font-weight:bold; color:${scoreColor};">${spamPct}%</span></td>
                <td>
                  ${(fb.spamReasons && fb.spamReasons.length > 0)
                    ? fb.spamReasons.map(r => `<span style="display:inline-block; background:#ffebee; color:#c62828; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin:1px;">${r}</span>`).join('')
                    : '<span style="color:#999; font-size:0.75rem;">None</span>'}
                </td>
                <td><span style="font-weight:500;">${fb.sentiment || 'Neutral'}</span></td>
                <td><span style="font-weight:bold; color:${statusBadgeColor}; text-transform:capitalize;">${fb.moderationStatus || 'flagged'}</span></td>
                <td style="white-space:nowrap;">
                  <button onclick="approveFeedback('${fb._id}')" 
                          style="background:#388e3c; color:white; border:none; padding:5px 9px; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-right:4px;">Approve</button>
                  <button onclick="rejectFeedback('${fb._id}')" 
                          style="background:#d32f2f; color:white; border:none; padding:5px 9px; border-radius:4px; cursor:pointer; font-size:0.75rem;">Reject</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load flagged feedbacks:', err);
    moderationList.innerHTML = '<p class="error">Failed to load flagged feedback. Please check server connection.</p>';
  }
};

// ✅ Moderation: Approve feedback
window.approveFeedback = async function (id) {
  const token = getAdminToken();
  if (!token) return handleAuthError();
  if (!confirm("Are you sure you want to approve this review for public display?")) return;

  try {
    const res = await fetch(`${BASE_URL}/api/admin/feedback/${id}/approve`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert("Feedback approved successfully.");
      window.loadFlaggedFeedbacks();
      window.loadFeedbacks();
    } else {
      alert(data.message || "Failed to approve feedback.");
    }
  } catch (err) {
    alert("Network error while approving feedback.");
  }
};

// ✅ Moderation: Reject feedback
window.rejectFeedback = async function (id) {
  const token = getAdminToken();
  if (!token) return handleAuthError();
  if (!confirm("Are you sure you want to reject this review?")) return;

  try {
    const res = await fetch(`${BASE_URL}/api/admin/feedback/${id}/reject`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert("Feedback rejected.");
      window.loadFlaggedFeedbacks();
      window.loadFeedbacks();
    } else {
      alert(data.message || "Failed to reject feedback.");
    }
  } catch (err) {
    alert("Network error while rejecting feedback.");
  }
};

// ✅ Tab switching
window.showTab = function (tabName) {
  const tabs = {
    feedback: document.getElementById('feedbackTab'),
    survey: document.getElementById('surveyTab'),
    moderation: document.getElementById('moderationTab'),
    analytics: document.getElementById('analyticsTab'),
    ai: document.getElementById('aiTab')
  };
  const tabNames = ['feedback', 'survey', 'moderation', 'analytics', 'ai'];
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabNames.forEach((name, idx) => {
    if (tabs[name]) {
      tabs[name].classList.toggle('active', name === tabName);
    }
    if (tabBtns[idx]) {
      tabBtns[idx].classList.toggle('active', name === tabName);
    }
  });

  if (tabName === 'feedback') window.loadFeedbacks();
  if (tabName === 'survey') window.loadSurveys();
  if (tabName === 'moderation') window.loadFlaggedFeedbacks();
  if (tabName === 'analytics') {
    if (typeof window.loadAnalyticsDashboard === 'function') {
      window.loadAnalyticsDashboard();
    }
  }
  if (tabName === 'ai') {
    if (typeof window.updateAiCharCounter === 'function') {
      window.updateAiCharCounter();
      window.updateActiveFilterPills();
    }
  }
};

// ✅ Initial load on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const token = getAdminToken();
  if (!token) {
    handleAuthError("Please log in as an administrator.");
    return;
  }

  // Live debounced search on admin search input
  const adminSearch = document.getElementById('adminSearchInput');
  if (adminSearch) {
    adminSearch.addEventListener('input', () => {
      clearTimeout(adminSearchDebounceTimer);
      adminSearchDebounceTimer = setTimeout(() => {
        adminFeedbackPage = 1;
        window.loadFeedbacks(1);
      }, 350);
    });
  }

  window.loadFeedbacks();
  window.loadSurveys();
  window.loadFlaggedFeedbacks();
});

