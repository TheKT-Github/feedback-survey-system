/**
 * Reports Route — Fashion Feedback Intelligence Platform (Phase 7)
 *
 * Dedicated admin endpoints for CSV and PDF business report exports.
 * All endpoints are strictly protected by verifyToken and requireAdmin middleware.
 */

const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const reportService = require('../services/reportService');

// All report endpoints require Admin JWT
router.use(verifyToken, requireAdmin);

/**
 * Helper to parse common report filters from query params
 */
function parseReportFilters(query) {
  return {
    q: query.q || null,
    product: query.product || null,
    sentiment: query.sentiment || null,
    rating: query.rating || null,
    aspect: query.aspect || null,
    date: query.date || null,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/reports/feedback.csv
// Exports customer feedback records in CSV format
// ─────────────────────────────────────────────────────────────
router.get('/feedback.csv', async (req, res) => {
  try {
    const filters = parseReportFilters(req.query);
    const includeModeration = req.query.includeModeration === 'true' || req.query.includeModeration === '1';

    const csvContent = await reportService.generateFeedbackCSV(filters, { includeModeration });
    const filename = reportService.getSafeFilename(
      includeModeration ? 'feedback-moderation-report' : 'feedback-report',
      'csv'
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('❌ Error generating feedback CSV:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate feedback CSV report.'
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/reports/analytics.csv
// Exports business metrics, sentiment, ratings, and aspects in CSV
// ─────────────────────────────────────────────────────────────
router.get('/analytics.csv', async (req, res) => {
  try {
    const filters = parseReportFilters(req.query);
    const csvContent = await reportService.generateAnalyticsCSV(filters);
    const filename = reportService.getSafeFilename('analytics-report', 'csv');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('❌ Error generating analytics CSV:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate analytics CSV report.'
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/reports/feedback.pdf
// Generates and streams publication-ready PDF Business Report
// ─────────────────────────────────────────────────────────────
router.get('/feedback.pdf', async (req, res) => {
  try {
    const filters = parseReportFilters(req.query);
    const filename = reportService.getSafeFilename('feedback-business-report', 'pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await reportService.generatePDFReport(filters, res);
  } catch (err) {
    console.error('❌ Error generating PDF report:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate PDF business report.'
      });
    }
  }
});

module.exports = router;
