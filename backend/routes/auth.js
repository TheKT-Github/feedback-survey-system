const express = require("express");
const router = express.Router();
const User = require("../models/user");
const { verifyToken, generateToken } = require("../middleware/auth");
const { authLimiter, registerLimiter } = require("../middleware/rateLimiter");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@stylefeedback.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Helper function to ensure default admin exists in MongoDB if requested
async function findOrCreateAdmin(email, password) {
  let admin = await User.findOne({ email: email.toLowerCase() });
  if (!admin) {
    // If credentials match configured admin env, seed the admin account securely
    if (email.toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      admin = new User({
        username: "admin",
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "admin",
      });
      await admin.save();
      return admin;
    }
    return null;
  }
  return admin;
}

// ✅ Health check route
router.get("/ping", (req, res) => {
  res.json({ success: true, message: "Auth router is working" });
});

// ✅ GET /api/auth/me (Get authenticated user profile)
router.get("/me", verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ✅ POST /api/auth/register (Customer registration)
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate presence of required fields
    if (!username || !username.trim() || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long.",
      });
    }

    const trimmedUsername = username.trim();
    const cleanEmail = email ? email.trim().toLowerCase() : `${trimmedUsername.toLowerCase()}@stylefeedback.local`;

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          error: "Please enter a valid email address.",
        });
      }
    }

    // Check for existing username
    const existingUser = await User.findOne({ username: trimmedUsername });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "Username already exists.",
      });
    }

    // Check for existing email if provided
    if (email) {
      const existingEmail = await User.findOne({ email: cleanEmail });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: "Email is already registered.",
        });
      }
    }

    // Assign admin role only if email strictly matches configured admin email
    const assignedRole = cleanEmail === ADMIN_EMAIL ? "admin" : "customer";

    const newUser = new User({
      username: trimmedUsername,
      email: cleanEmail,
      password: password,
      role: assignedRole,
    });

    await newUser.save();

    // Generate JWT token
    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    console.error("🚨 Registration error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error during registration.",
    });
  }
});

// ✅ POST /api/auth/login (Customer and user login)
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || "").trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide your username/email and password.",
      });
    }

    // Find by username or email
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password.",
      });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("🚨 Login error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error during login.",
    });
  }
});

// ✅ POST /api/auth/admin-login (Admin login with JWT issuance)
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    let admin = await findOrCreateAdmin(cleanEmail, password);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Account does not have admin privileges.",
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials.",
      });
    }

    const token = generateToken(admin);

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("🚨 Admin login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during admin login.",
    });
  }
});

module.exports = router;
