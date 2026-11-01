const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const analytics = require('../services/analyticsService');

// All analytics routes require admin JWT
router.use(verifyToken, requireAdmin);

/**
 * Helper to extract common query filters from request
 */
function parseFilters(query) {
  return {
    product: query.product || null,
    sentiment: query.sentiment || null,
    rating: query.rating || null,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/overview
// ─────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const data = await analytics.getOverviewStats(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Analytics overview error:', err);
    res.status(500).json({ success: false, message: 'Error fetching overview analytics.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/sentiment
// ─────────────────────────────────────────────────────────────
router.get('/sentiment', async (req, res) => {
  try {
    const data = await analytics.getSentimentDistribution(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Sentiment distribution error:', err);
    res.status(500).json({ success: false, message: 'Error fetching sentiment distribution.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/ratings
// ─────────────────────────────────────────────────────────────
router.get('/ratings', async (req, res) => {
  try {
    const data = await analytics.getRatingDistribution(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Rating distribution error:', err);
    res.status(500).json({ success: false, message: 'Error fetching rating distribution.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/aspects
// ─────────────────────────────────────────────────────────────
router.get('/aspects', async (req, res) => {
  try {
    const data = await analytics.getAspectInsights(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Aspect analytics error:', err);
    res.status(500).json({ success: false, message: 'Error fetching aspect analytics.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/top-positive-aspects
// ─────────────────────────────────────────────────────────────
router.get('/top-positive-aspects', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const data = await analytics.getTopPositiveAspects(parseFilters(req.query), limit);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Top positive aspects error:', err);
    res.status(500).json({ success: false, message: 'Error fetching top positive aspects.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/top-negative-aspects
// ─────────────────────────────────────────────────────────────
router.get('/top-negative-aspects', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const data = await analytics.getTopNegativeAspects(parseFilters(req.query), limit);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Top negative aspects error:', err);
    res.status(500).json({ success: false, message: 'Error fetching top negative aspects.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/products
// ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const data = await analytics.getProductInsights(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Product insights error:', err);
    res.status(500).json({ success: false, message: 'Error fetching product analytics.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/product-comparison?products=A,B,C
// ─────────────────────────────────────────────────────────────
router.get('/product-comparison', async (req, res) => {
  try {
    const rawProducts = (req.query.products || '').split(',').map(p => p.trim()).filter(Boolean);
    if (rawProducts.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least 2 product names via ?products=A,B'
      });
    }
    const filters = parseFilters(req.query);
    delete filters.product; // product comparison ignores global product filter
    const data = await analytics.getProductComparison(rawProducts, filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Product comparison error:', err);
    res.status(500).json({ success: false, message: 'Error fetching product comparison.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/sentiment-trend?days=30
// ─────────────────────────────────────────────────────────────
router.get('/sentiment-trend', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const data = await analytics.getSentimentTrend(parseFilters(req.query), days);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Sentiment trend error:', err);
    res.status(500).json({ success: false, message: 'Error fetching sentiment trend.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/feedback-trend?days=30
// ─────────────────────────────────────────────────────────────
router.get('/feedback-trend', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const data = await analytics.getFeedbackTrend(parseFilters(req.query), days);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Feedback trend error:', err);
    res.status(500).json({ success: false, message: 'Error fetching feedback trend.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/analytics/complaint-trends?days=30&product=jeans
// ─────────────────────────────────────────────────────────────
router.get('/complaint-trends', async (req, res) => {
  try {
    const filters = parseFilters(req.query);

    // Validate custom dates if provided
    if (filters.dateFrom) {
      const dFrom = new Date(filters.dateFrom);
      if (isNaN(dFrom.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid dateFrom format.' });
      }
    }
    if (filters.dateTo) {
      const dTo = new Date(filters.dateTo);
      if (isNaN(dTo.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid dateTo format.' });
      }
    }
    if (filters.dateFrom && filters.dateTo) {
      if (new Date(filters.dateFrom) > new Date(filters.dateTo)) {
        return res.status(400).json({ success: false, message: 'dateFrom cannot be after dateTo.' });
      }
    }

    const requestedDays = req.query.days === 'all' ? 365 : Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const data = await analytics.getComplaintTrends(filters, requestedDays);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Complaint trends error:', err);
    res.status(500).json({ success: false, message: 'Error fetching complaint trends analytics.' });
  }
});

module.exports = router;
