document.addEventListener('DOMContentLoaded', () => {
  const feedbackList = document.getElementById('feedbackList');
  const surveyList = document.getElementById('surveyList');
  const BASE_URL = 'http://localhost:3000';

  // 🚫 Redirect if admin is not logged in
  if (!localStorage.getItem("isAdminLoggedIn")) {
    alert("Access denied. Please log in as admin.");
    window.location.href = "admin-login.html";
    return;
  }

  // ✅ Logout function
  window.logout = function () {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "index.html";
  };

  // ✅ Load feedbacks
  async function loadFeedbacks() {
    try {
      feedbackList.innerHTML = '<div class="loading">Loading feedbacks...</div>';
      const res = await fetch(`${BASE_URL}/api/admin/feedbacks`);
      
      if (!res.ok) throw new Error("Unauthorized or Server Error");
      
      const feedbacks = await res.json();

      if (feedbacks.length === 0) {
        feedbackList.innerHTML = '<p>No feedbacks found.</p>';
        return;
      }

      feedbackList.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Product</th><th>Rating</th>
              <th>Feedback</th><th>Recommended</th><th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            ${feedbacks.map(fb => `
              <tr>
                <td>${fb.name}</td>
                <td>${fb.email}</td>
                <td>${fb.product}</td>
                <td>${fb.rating} ⭐</td>
                <td>${fb.feedback}</td>
                <td>${fb.recommend ? 'Yes' : 'No'}</td>
                <td>${new Date(fb.submittedAt).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
      feedbackList.innerHTML = '<p class="error">Failed to load feedbacks.</p>';
    }
  }

  // ✅ Load surveys
  async function loadSurveys() {
    try {
      surveyList.innerHTML = '<div class="loading">Loading surveys...</div>';
      const res = await fetch(`${BASE_URL}/api/admin/surveys`);

      if (!res.ok) throw new Error("Unauthorized or Server Error");

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
              <td>${s.name}</td>
              <td>${s.email}</td>
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
      surveyList.innerHTML = '<p class="error">Error loading surveys.</p>';
    }
  }

  // ✅ Tab switching logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab-content');
  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      tabs[index].classList.add('active');
    });
  });

 
  loadFeedbacks();
  loadSurveys();
});
