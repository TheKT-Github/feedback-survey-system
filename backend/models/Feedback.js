
const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  name: { type: String, default: 'Anonymous' },
  email: { type: String, default: '' },
  product: { type: String, default: 'general' },
  rating: { type: Number, default: 0 },
  feedback: { type: String, required: true },
  recommend: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
  // Image-Based Review Field (Phase 3)
  imagePath: {
    type: String,
    default: null
  },
  // Spam & Duplicate Detection Fields (Phase 4)
  isSpam: {
    type: Boolean,
    default: false
  },
  spamScore: {
    type: Number,
    default: 0
  },
  spamReasons: {
    type: [String],
    default: []
  },
  moderationStatus: {
    type: String,
    enum: ['published', 'flagged', 'approved', 'rejected'],
    default: 'published'
  },
  // NLP & Fashion Intelligence Fields (Phase 2 Enhanced)
  sentiment: {
    type: String,
    enum: ['Positive', 'Negative', 'Neutral', 'Mixed'],
    default: 'Neutral'
  },
  sentimentScore: {
    type: Number,
    default: 0
  },
  sentimentConfidence: {
    type: Number,
    default: 0
  },
  aspects: [
    {
      name: { type: String, required: true },
      sentiment: {
        type: String,
        enum: ['Positive', 'Negative', 'Neutral', 'positive', 'negative', 'neutral'],
        required: true
      },
      score: {
        type: Number,
        default: 0
      }
    }
  ],
  analyzedAt: {
    type: Date,
    default: Date.now
  }
});

// Phase 6 Query & Filter Indexes
feedbackSchema.index({ moderationStatus: 1, submittedAt: -1 });
feedbackSchema.index({ product: 1 });
feedbackSchema.index({ sentiment: 1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ 'aspects.name': 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);

