const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const Survey = require("../models/Survey");
const User = require("../models/user");
const { verifyToken, requireAdmin, generateToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const searchService = require("../services/searchService");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@stylefeedback.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Helper function to seed or locate admin account
async function findOrCreateAdmin(email, password) {
  let admin = await User.findOne({ email: email.toLowerCase() });
  if (!admin) {
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

// ✅ POST /api/admin/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const admin = await findOrCreateAdmin(cleanEmail, password);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
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
      message: "Login successful",
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("❌ Admin login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during admin login.",
    });
  }
});

// ✅ GET /api/admin/verify - Verify admin status
router.get("/verify", verifyToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ✅ GET /api/admin/feedbacks - Protected with verifyToken & requireAdmin
router.get("/feedbacks", verifyToken, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ submittedAt: -1 });
    console.log(`✅ Admin fetched ${feedbacks.length} feedbacks (requested by ${req.user.username})`);
    res.json(feedbacks);
  } catch (error) {
    console.error("❌ Error fetching feedbacks:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching feedbacks.",
    });
  }
});

// ✅ GET /api/admin/surveys - Protected with verifyToken & requireAdmin
router.get("/surveys", verifyToken, requireAdmin, async (req, res) => {
  try {
    const surveys = await Survey.find().sort({ submittedAt: -1 });
    console.log(`✅ Admin fetched ${surveys.length} surveys (requested by ${req.user.username})`);
    res.json(surveys);
  } catch (error) {
    console.error("❌ Error fetching surveys:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching surveys.",
    });
  }
});

// ✅ GET /api/admin/flagged-feedback - Retrieve flagged / suspicious reviews for moderation
router.get("/flagged-feedback", verifyToken, requireAdmin, async (req, res) => {
  try {
    const flagged = await Feedback.find({
      $or: [
        { moderationStatus: "flagged" },
        { isSpam: true }
      ]
    }).sort({ submittedAt: -1 });

    res.json({
      success: true,
      count: flagged.length,
      data: flagged
    });
  } catch (error) {
    console.error("❌ Error fetching flagged feedback:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching flagged feedback."
    });
  }
});

// ✅ GET /api/admin/feedback/search - Full admin search with filters, moderation status, and pagination
router.get("/feedback/search", verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await searchService.searchFeedbacks({
      ...req.query,
      isAdmin: true
    });

    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error("❌ Error in admin feedback search:", error);
    res.status(500).json({
      success: false,
      message: "Error searching feedback."
    });
  }
});

// ✅ GET /api/admin/feedback/:id - Detailed admin feedback view (includes spam metrics & audit info)
router.get("/feedback/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const feedback = await searchService.getFeedbackById(req.params.id, true);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found."
      });
    }

    res.json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error("❌ Error fetching admin feedback detail:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching feedback detail."
    });
  }
});

// ✅ PATCH /api/admin/feedback/:id/approve - Approve flagged review for public display
router.patch("/feedback/:id/approve", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid feedback ID." });
    }

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }

    feedback.moderationStatus = "approved";
    await feedback.save();

    res.json({
      success: true,
      message: "Feedback approved successfully.",
      feedback
    });
  } catch (error) {
    console.error("❌ Error approving feedback:", error);
    res.status(500).json({
      success: false,
      message: "Server error while approving feedback."
    });
  }
});

// ✅ PATCH /api/admin/feedback/:id/reject - Reject flagged review
router.patch("/feedback/:id/reject", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid feedback ID." });
    }

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }

    feedback.moderationStatus = "rejected";
    await feedback.save();

    res.json({
      success: true,
      message: "Feedback rejected successfully.",
      feedback
    });
  } catch (error) {
    console.error("❌ Error rejecting feedback:", error);
    res.status(500).json({
      success: false,
      message: "Server error while rejecting feedback."
    });
  }
});

module.exports = router;
