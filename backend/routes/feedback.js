const express = require('express');
const router = express.Router();
const fs = require('fs');
const Feedback = require('../models/Feedback');
const { analyzeFeedback } = require('../services/nlpService');
const { handleUpload } = require('../middleware/upload');
const { feedbackLimiter } = require('../middleware/rateLimiter');
const spamService = require('../services/spamService');
const aiCacheService = require('../services/aiCacheService');

const searchService = require('../services/searchService');

// Helper to remove orphaned uploaded file if validation or downstream process fails
function cleanupUploadedFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.warn('⚠️ Warning: Could not remove orphaned upload:', err.message);
    }
  }
}

// GET /api/feedback - Public list with search, filter, sort & pagination (published/approved only)
router.get('/', async (req, res) => {
  try {
    const result = await searchService.searchFeedbacks({
      ...req.query,
      isAdmin: false
    });

    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('❌ Error fetching public feedback:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching feedback'
    });
  }
});

// GET /api/feedback/insights/products - Customer-Informed Fashion Insights (published/approved only)
router.get('/insights/products', async (req, res) => {
  try {
    const { getProductInsights, getTopPositiveAspects, getTopNegativeAspects } = require('../services/analyticsService');
    const [products, topPraised, topComplaints] = await Promise.all([
      getProductInsights(),
      getTopPositiveAspects({}, 5),
      getTopNegativeAspects({}, 5)
    ]);
    res.json({
      success: true,
      data: {
        products,
        topPraised,
        topComplaints
      }
    });
  } catch (err) {
    console.error('❌ Error fetching public product insights:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching product insights'
    });
  }
});

// GET /api/feedback/:id - Public feedback detail view (published/approved only)
router.get('/:id', async (req, res) => {
  try {
    const feedback = await searchService.getFeedbackById(req.params.id, false);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found or not published'
      });
    }

    res.json({
      success: true,
      data: feedback
    });
  } catch (err) {
    console.error('❌ Error fetching feedback detail:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching feedback detail'
    });
  }
});

// POST /api/feedback - Submit, scan for spam, and analyze customer feedback
router.post('/', feedbackLimiter, handleUpload('photo'), async (req, res) => {
  try {
    const { name, email, product, rating, feedback, recommend } = req.body;

    // Validate feedback text presence
    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({
        success: false,
        error: 'Feedback text is required.'
      });
    }

    const trimmedFeedback = feedback.trim();
    const numericRating = Number(rating) || 0;
    const isRecommended = recommend === true || recommend === 'true' || recommend === 'on';

    // Relative web URL for uploaded image, or null if none was uploaded
    const imagePath = req.file ? `/uploads/${req.file.filename}` : (req.body.imagePath || null);

    // 1. Run Spam, Duplicate, and Repetition Detection (Phase 4)
    const cleanEmail = email && typeof email === 'string' ? email.trim() : '';
    const cleanName = name && typeof name === 'string' ? name.trim() : 'Anonymous';
    const cleanProduct = product && typeof product === 'string' ? product.trim() : 'general';

    const spamResult = await spamService.analyzeFeedback({
      email: cleanEmail,
      name: cleanName,
      product: cleanProduct,
      comment: trimmedFeedback,
      rating: numericRating
    });

    const moderationStatus = spamResult.isSpam ? 'flagged' : 'published';

    // 2. Run Natural Language Processing & Aspect-Based Analysis (Phase 2)
    const analysis = analyzeFeedback(trimmedFeedback, numericRating);

    const newFeedback = new Feedback({
      name: cleanName,
      email: cleanEmail,
      product: cleanProduct,
      rating: numericRating,
      feedback: trimmedFeedback,
      recommend: isRecommended,
      submittedAt: new Date(),
      imagePath: imagePath,
      // Spam & Moderation fields (Phase 4)
      isSpam: spamResult.isSpam,
      spamScore: spamResult.spamScore,
      spamReasons: spamResult.spamReasons,
      moderationStatus: moderationStatus,
      // NLP Intelligence fields (Phase 2 Enhanced)
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      sentimentConfidence: analysis.sentimentConfidence,
      aspects: analysis.aspects,
      analyzedAt: analysis.analyzedAt
    });

    const savedFeedback = await newFeedback.save();

    // Invalidate AI insights cache so next AI request reflects this new submission
    aiCacheService.invalidateCache();

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: savedFeedback._id,
        name: savedFeedback.name,
        email: savedFeedback.email,
        product: savedFeedback.product,
        rating: savedFeedback.rating,
        feedback: savedFeedback.feedback,
        recommend: savedFeedback.recommend,
        imagePath: savedFeedback.imagePath,
        sentiment: savedFeedback.sentiment,
        sentimentScore: savedFeedback.sentimentScore,
        sentimentConfidence: savedFeedback.sentimentConfidence,
        aspects: savedFeedback.aspects,
        submittedAt: savedFeedback.submittedAt,
        analyzedAt: savedFeedback.analyzedAt,
        moderationStatus: savedFeedback.moderationStatus
      }
    });
  } catch (err) {
    cleanupUploadedFile(req.file);
    console.error('❌ Error saving and analyzing feedback:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while submitting feedback'
    });
  }
});

module.exports = router;
