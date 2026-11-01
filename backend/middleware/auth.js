const jwt = require("jsonwebtoken");
const User = require("../models/user");

/**
 * Validate JWT secret configuration during startup or runtime.
 * Throws a fatal configuration error if secret is missing or insecure.
 * Never prints or logs the secret value.
 */
function validateJwtConfiguration() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || !secret.trim()) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is missing. A secure, non-empty secret is required."
    );
  }
  if (secret.trim().length < 16) {
    throw new Error(
      "FATAL: JWT_SECRET is too short (minimum 16 characters required for HMAC-SHA256 security)."
    );
  }
  return true;
}

/**
 * Safe accessor for validated JWT Secret
 */
function getJwtSecret() {
  validateJwtConfiguration();
  return process.env.JWT_SECRET.trim();
}

/**
 * Verify JWT token from Authorization header: "Bearer <token>"
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Access denied. Authentication token missing.",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. Invalid token format.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
      if (err.message && err.message.startsWith("FATAL:")) {
        console.error("JWT Configuration Error:", err.message);
        return res.status(500).json({
          success: false,
          error: "Internal server authentication configuration error.",
        });
      }
      return res.status(401).json({
        success: false,
        error: "Invalid or expired authentication token.",
      });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found or account deactivated.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during authentication.",
    });
  }
};

/**
 * Require Admin Role (must be called after verifyToken)
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Forbidden. Admin access required.",
    });
  }

  next();
};

/**
 * Generate a signed JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
};

module.exports = {
  validateJwtConfiguration,
  getJwtSecret,
  verifyToken,
  requireAdmin,
  generateToken,
};
