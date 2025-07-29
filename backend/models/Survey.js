

const mongoose = require("mongoose");

const surveySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  age: { type: String }, // ← changed from Number to String
  style: [String],
  colors: [String],
  budget: { type: String },
  shoppingFrequency: { type: String },
  suggestions: { type: String },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Survey", surveySchema);
