const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';

document.getElementById("registerForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email") ? document.getElementById("email").value.trim() : "";
    const password = document.getElementById("password").value;

    if (!username || !password) {
        alert("Please fill in all required fields.");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters long.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert("Registration successful! Please log in.");
            window.location.href = "login.html";
        } else {
            alert(data.error || "Registration failed. Please try again.");
        }
    } catch (error) {
        console.error("Registration error:", error);
        alert("Server error. Please ensure the backend is running.");
    }
});
