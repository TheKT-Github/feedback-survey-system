
const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const Survey = require("../models/Survey");

// ✅ Load from .env or fallback
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@stylefeedback.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// POST /api/admin/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    console.log("✅ Admin login successful");
    return res.status(200).json({ message: "Login successful" });
  } else {
    console.log("❌ Admin login failed");
    return res.status(401).json({ message: "Invalid credentials" });
  }
});

// GET /api/admin/feedbacks

router.get("/feedbacks", async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ submittedAt: -1 });
    console.log("✅ Admin fetched feedbacks:", feedbacks.length);
    res.json(feedbacks);
  } catch (error) {
    console.error("❌ Error fetching feedbacks:", error);
    res.status(500).json({ message: "Error fetching feedbacks" });
  }
});


// GET /api/admin/surveys
router.get("/surveys", async (req, res) => {
  try {
    const surveys = await Survey.find().sort({ submittedAt: -1 });
    console.log("✅ Admin fetched surveys:", surveys.length);
    res.json(surveys);
  } catch (error) {
    console.error("❌ Error fetching surveys:", error);
    res.status(500).json({ message: "Error fetching surveys" });
  }
});

module.exports = router;
