document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("adminLoginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const errorDiv = document.getElementById("error");
    errorDiv.textContent = "";

    if (!email || !password) {
      errorDiv.textContent = "Please enter both email and password.";
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        // ✅ Login successful, store session and redirect
        localStorage.setItem("isAdminLoggedIn", "true");
        window.location.href = "admin.html";
      } else {
        errorDiv.textContent = data.message || "Invalid credentials.";
      }
    } catch (err) {
      console.error("Login error:", err);
      errorDiv.textContent = "Server error. Please try again later.";
    }
  });
});
