const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

const app = express();

// ✅ Load environment variables
dotenv.config();

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Serve static frontend files
app.use(express.static(path.join(__dirname, "../Frontend")));

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/feedback", require("./routes/feedback"));
app.use("/api/survey", require("./routes/survey"));
app.use("/api/admin", require("./routes/admin"));

// ✅ Root route (optional)
app.get("/", (req, res) => {
  res.send("✅ API is running");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
