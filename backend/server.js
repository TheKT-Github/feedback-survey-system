const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

const app = express();

// ✅ Load environment variables
dotenv.config();

// ✅ Validate critical security configurations at startup (fail-fast)
const { validateJwtConfiguration } = require("./middleware/auth");
try {
  validateJwtConfiguration();
} catch (err) {
  console.error("❌ Application Startup Aborted:", err.message);
  process.exit(1);
}

// ✅ Proxy trust configuration (only enabled if explicitly configured for infrastructure)
if (process.env.TRUST_PROXY) {
  const trustVal = process.env.TRUST_PROXY.trim().toLowerCase();
  if (trustVal === "true") {
    app.set("trust proxy", true);
  } else if (!isNaN(parseInt(trustVal, 10))) {
    app.set("trust proxy", parseInt(trustVal, 10));
  } else {
    app.set("trust proxy", trustVal);
  }
}

// ✅ Explicit CORS Allowlist Configuration
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const customOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOriginsSet = new Set([...DEFAULT_ALLOWED_ORIGINS, ...customOrigins]);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOriginsSet.has(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy rejection: Origin "${origin}" is not allowed.`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static frontend files
app.use(express.static(path.join(__dirname, "../Frontend")));

// ✅ Serve uploaded review photos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/feedback", require("./routes/feedback"));
app.use("/api/survey", require("./routes/survey"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin/analytics", require("./routes/analytics"));
app.use("/api/admin/reports", require("./routes/reports"));
app.use("/api/admin/ai", require("./routes/aiInsights"));

// ✅ Root route (optional)
app.get("/", (req, res) => {
  res.send("✅ API is running");
});

// ✅ Error handling middleware (formats CORS rejection cleanly)
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith("CORS policy rejection")) {
    return res.status(403).json({
      success: false,
      error: "Cross-Origin Request Blocked: Origin not permitted by server policy.",
    });
  }
  next(err);
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
