const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("adminLoginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const errorDiv = document.getElementById("error");
    errorDiv.textContent = "";

    if (!email || !password) {
      errorDiv.textContent = "Please enter both email and password.";
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        // Store JWT token and admin user profile
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminUser", JSON.stringify(data.user));
        localStorage.setItem("isAdminLoggedIn", "true");

        window.location.href = "admin.html";
      } else {
        errorDiv.textContent = data.message || data.error || "Invalid credentials.";
      }
    } catch (err) {
      console.error("Login error:", err);
      errorDiv.textContent = "Server error. Please ensure the backend is running.";
    }
  });
});
