

// const express = require("express");
// const router = express.Router();
// const User = require("../models/user");
// console.log("✅ auth.js loaded");

// // ✅ Simple test route
// router.get("/ping", (req, res) => {
//   res.json({ message: "Auth router is working" });
// });



// // ✅ POST /api/auth/register


// router.post("/register", async (req, res) => {
//   console.log("📥 POST /register hit");                     // Logs when endpoint is hit
//   console.log("📝 Request body:", req.body);                // Logs the incoming data

//   const { username, password } = req.body;

//   if (!username || !password) {
//     console.log("❌ Missing fields");
//     return res.status(400).json({ error: "All fields are required" });
//   }

//   try {
//     const existingUser = await User.findOne({ username });

//     if (existingUser) {
//       console.log("⚠️ Username already exists");
//       return res.status(409).json({ error: "Username already exists" });
//     }

//     const newUser = new User({ username, password });
//     await newUser.save();

//     console.log("✅ New user registered:", username);
//     res.status(201).json({ message: "User registered successfully" });
//   } catch (error) {
//     console.error("🚨 Registration error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });


// // ✅ POST /api/auth/login
// router.post("/login", async (req, res) => {
//   console.log("📥 POST /login hit"); // Debug
//   console.log("📝 Request body:", req.body); // Debug

//   const { username, password } = req.body;

//   try {
//     const user = await User.findOne({ username });

//     if (!user || user.password !== password) {
//       console.log("❌ Invalid credentials"); // Debug
//       return res.status(401).json({ error: "Invalid username or password" });
//     }

//     console.log("✅ Login successful for:", username); // Debug
//     return res.json({ message: "Login successful" });
//   } catch (err) {
//     console.error("🚨 Login error:", err); // Debug
//     return res.status(500).json({ error: "Server error" });
//   }
// });


// module.exports = router;






const express = require("express");
const router = express.Router();
const User = require("../models/user");

console.log("✅ auth.js loaded");

// ✅ Simple test route
router.get("/ping", (req, res) => {
  res.json({ message: "Auth router is working" });
});

// ✅ POST /api/auth/register (User registration)
router.post("/register", async (req, res) => {
  console.log("📥 POST /register hit");
  console.log("📝 Request body:", req.body);

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("🚨 Registration error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST /api/auth/login (User login)
router.post("/login", async (req, res) => {
  console.log("📥 POST /login hit");
  console.log("📝 Request body:", req.body);

  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    console.log("✅ Login successful for:", username);
    return res.json({ message: "Login successful" });
  } catch (err) {
    console.error("🚨 Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST /api/auth/admin-login (Admin login)
router.post("/admin-login", (req, res) => {
  console.log("📥 POST /admin-login hit");
  const { email, password } = req.body;

  // You can move this to .env for better security
  const ADMIN_EMAIL = "admin@stylefeedback.com";
  const ADMIN_PASSWORD = "admin123";

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    console.log("✅ Admin login successful");
    return res.status(200).json({ success: true, message: "Admin login successful" });
  } else {
    console.log("❌ Admin login failed");
    return res.status(401).json({ success: false, message: "Invalid admin credentials" });
  }
});

module.exports = router;
