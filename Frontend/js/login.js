const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';

document.getElementById("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
        alert("Please enter both username and password.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Store JWT and user details safely
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            localStorage.setItem("isLoggedIn", "true");

            // If an admin logs in through customer login, allow admin access too
            if (data.user && data.user.role === "admin") {
                localStorage.setItem("adminToken", data.token);
                localStorage.setItem("isAdminLoggedIn", "true");
            }

            alert("Login successful!");
            window.location.href = "index.html";
        } else {
            alert(data.error || "Login failed. Please check your credentials.");
        }
    } catch (error) {
        console.error("Login error:", error);
        alert("Connection error. Please ensure the backend is running.");
    }
});
