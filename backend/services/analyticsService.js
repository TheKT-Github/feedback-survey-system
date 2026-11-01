/**
 * Analytics Service — Fashion Feedback Intelligence Platform (Phase 5)
 *
 * Provides reusable MongoDB-aggregation-based analytics functions for the admin dashboard.
 * ALL analytics strictly filter to { moderationStatus: { $in: ['published', 'approved'] } }
 * so that flagged/rejected feedback never distorts business metrics.
 *
 * EXTENSION POINT: Each function is self-contained and returns plain JS objects —
 * easy to consume by future AI-summary or CSV-export features without refactoring.
 */

const Feedback = require('../models/Feedback');

// Base match stage — only valid (not spam-flagged or rejected) feedback
const VALID_STATUSES = ['published', 'approved'];

/**
 * Builds the base $match stage, merging any caller-supplied filters. `
 * Supported optional filters:
 *   product  (string, case-insensitive)
 *   sentiment (string)
 *   dateFrom / dateTo  (ISO date strings)
 *   rating   (number)
 */
function buildBaseMatch(filters = {}) {
  const match = {
    moderationStatus: { $in: VALID_STATUSES }
  };

  if (filters.product && filters.product !== 'all') {
    match.product = { $regex: new RegExp(`^${filters.product.trim()}$`, 'i') };
  }
  if (filters.sentiment && filters.sentiment !== 'all') {
    match.sentiment = filters.sentiment;
  }
  if (filters.rating) {
    match.rating = Number(filters.rating);
  }
  if (filters.dateFrom || filters.dateTo) {
    match.submittedAt = {};
    if (filters.dateFrom) match.submittedAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      match.submittedAt.$lte = to;
    }
  }

  return match;
}

/**
 * 1. Overview Statistics
 * Returns totals, averages, and sentiment breakdowns.
 */
async function getOverviewStats(filters = {}) {
  const baseMatch = buildBaseMatch(filters);

  const [validAgg, flaggedCount, approvedCount] = await Promise.all([
    Feedback.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'Positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'Negative'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'Neutral'] }, 1, 0] } },
          mixed: { $sum: { $cond: [{ $eq: ['$sentiment', 'Mixed'] }, 1, 0] } },
        }
      }
    ]),
    Feedback.countDocuments({ moderationStatus: 'flagged' }),
    Feedback.countDocuments({ moderationStatus: 'approved' })
  ]);

  const data = validAgg[0] || {
    total: 0, avgRating: 0,
    positive: 0, negative: 0, neutral: 0, mixed: 0
  };

  const pct = (n) => data.total > 0 ? Math.round((n / data.total) * 100) : 0;

  return {
    totalValidFeedback: data.total,
    averageRating: data.total > 0 ? Math.round(data.avgRating * 10) / 10 : 0,
    positive: data.positive,
    negative: data.negative,
    neutral: data.neutral,
    mixed: data.mixed,
    positivePercent: pct(data.positive),
    negativePercent: pct(data.negative),
    neutralPercent: pct(data.neutral),
    mixedPercent: pct(data.mixed),
    flaggedFeedback: flaggedCount,
    approvedFeedback: approvedCount
  };
}

/**
 * 2. Sentiment Distribution
 */
async function getSentimentDistribution(filters = {}) {
  const baseMatch = buildBaseMatch(filters);

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    { $group: { _id: '$sentiment', count: { $sum: 1 } } }
  ]);

  const result = { Positive: 0, Negative: 0, Neutral: 0, Mixed: 0 };
  for (const r of rows) {
    if (r._id && result.hasOwnProperty(r._id)) {
      result[r._id] = r.count;
    }
  }
  return result;
}

/**
 * 3. Rating Distribution (1-5 stars)
 */
async function getRatingDistribution(filters = {}) {
  const baseMatch = buildBaseMatch(filters);

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    const star = parseInt(r._id);
    if (star >= 1 && star <= 5) result[star] = r.count;
  }
  return result;
}

/**
 * 4. Aspect Insights — per-aspect mention count, sentiment breakdown, and avg score
 */
async function getAspectInsights(filters = {}) {
  const baseMatch = buildBaseMatch(filters);

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    { $unwind: '$aspects' },
    {
      $group: {
        _id: '$aspects.name',
        mentions: { $sum: 1 },
        positive: {
          $sum: {
            $cond: [
              { $in: ['$aspects.sentiment', ['Positive', 'positive']] }, 1, 0
            ]
          }
        },
        negative: {
          $sum: {
            $cond: [
              { $in: ['$aspects.sentiment', ['Negative', 'negative']] }, 1, 0
            ]
          }
        },
        neutral: {
          $sum: {
            $cond: [
              { $in: ['$aspects.sentiment', ['Neutral', 'neutral']] }, 1, 0
            ]
          }
        },
        avgScore: { $avg: '$aspects.score' }
      }
    },
    { $sort: { mentions: -1 } }
  ]);

  return rows.map(r => ({
    aspect: r._id,
    mentions: r.mentions,
    positive: r.positive,
    negative: r.negative,
    neutral: r.neutral,
    positivePercent: r.mentions > 0 ? Math.round((r.positive / r.mentions) * 100) : 0,
    negativePercent: r.mentions > 0 ? Math.round((r.negative / r.mentions) * 100) : 0,
    avgScore: Math.round((r.avgScore || 0) * 100) / 100
  }));
}

/**
 * 5. Top Positive Aspects (most praised)
 */
async function getTopPositiveAspects(filters = {}, limit = 5) {
  const aspects = await getAspectInsights(filters);
  return aspects
    .filter(a => a.mentions > 0)
    .sort((a, b) => b.positive - a.positive || b.avgScore - a.avgScore)
    .slice(0, limit);
}

/**
 * 6. Top Negative Aspects (most complained about)
 */
async function getTopNegativeAspects(filters = {}, limit = 5) {
  const aspects = await getAspectInsights(filters);
  return aspects
    .filter(a => a.mentions > 0)
    .sort((a, b) => b.negative - a.negative || a.avgScore - b.avgScore)
    .slice(0, limit);
}

/**
 * 7. Product-wise Analytics
 */
async function getProductInsights(filters = {}) {
  const baseMatch = buildBaseMatch(filters);

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { $toLower: '$product' },
        displayName: { $first: '$product' },
        total: { $sum: 1 },
        avgRating: { $avg: '$rating' },
        positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'Positive'] }, 1, 0] } },
        negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'Negative'] }, 1, 0] } },
        neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'Neutral'] }, 1, 0] } },
        mixed: { $sum: { $cond: [{ $eq: ['$sentiment', 'Mixed'] }, 1, 0] } }
      }
    },
    { $sort: { total: -1 } }
  ]);

  return rows.map(r => {
    const positivePct = r.total > 0 ? Math.round((r.positive / r.total) * 100) : 0;
    const negativePct = r.total > 0 ? Math.round((r.negative / r.total) * 100) : 0;
    const avgRating = Math.round((r.avgRating || 0) * 10) / 10;

    let status = 'Needs Attention';
    if (positivePct >= 70 && avgRating >= 4.0) status = 'Excellent';
    else if (positivePct >= 50 && avgRating >= 3.0) status = 'Good';

    return {
      product: r.displayName || r._id,
      total: r.total,
      avgRating,
      positive: r.positive,
      negative: r.negative,
      neutral: r.neutral,
      mixed: r.mixed,
      positivePercent: positivePct,
      negativePercent: negativePct,
      status
    };
  });
}

/**
 * 8. Product Comparison — compare specific products side-by-side
 */
async function getProductComparison(productList = [], filters = {}) {
  const results = {};

  await Promise.all(productList.map(async (product) => {
    const productFilter = { ...filters, product };
    const [overview, sentiment, aspects] = await Promise.all([
      getOverviewStats(productFilter),
      getSentimentDistribution(productFilter),
      getAspectInsights(productFilter)
    ]);

    results[product] = {
      product,
      totalFeedback: overview.totalValidFeedback,
      averageRating: overview.averageRating,
      positivePercent: overview.positivePercent,
      negativePercent: overview.negativePercent,
      sentimentDistribution: sentiment,
      topAspects: aspects.slice(0, 5)
    };
  }));

  return results;
}

/**
 * 9. Sentiment Trend — grouped by date (day)
 */
async function getSentimentTrend(filters = {}, days = 30) {
  const baseMatch = buildBaseMatch(filters);

  // Default to last N days if no date filter supplied
  if (!baseMatch.submittedAt) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    baseMatch.submittedAt = { $gte: cutoff };
  }

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
          sentiment: '$sentiment'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);

  // Pivot into { date, Positive, Negative, Neutral, Mixed }
  const dateMap = {};
  for (const r of rows) {
    const date = r._id.date;
    if (!dateMap[date]) {
      dateMap[date] = { date, Positive: 0, Negative: 0, Neutral: 0, Mixed: 0 };
    }
    if (dateMap[date].hasOwnProperty(r._id.sentiment)) {
      dateMap[date][r._id.sentiment] = r.count;
    }
  }

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 10. Feedback Volume Trend — grouped by date
 */
async function getFeedbackTrend(filters = {}, days = 30) {
  const baseMatch = buildBaseMatch(filters);

  if (!baseMatch.submittedAt) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    baseMatch.submittedAt = { $gte: cutoff };
  }

  const rows = await Feedback.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return rows.map(r => ({ date: r._id, count: r.count }));
}

/**
 * 11. Complaint Trends & Recurring Issues — Phase 12
 * Analyzes negative sentiment and aspect-level complaint shifts over time with
 * rigorous period-over-period comparison and sample size safeguards (5-review minimum).
 */
async function getComplaintTrends(filters = {}, requestedDays = 30) {
  const now = new Date();
  let currentStart, currentEnd, previousStart, previousEnd;
  let isCustom = false;

  if (filters.dateFrom || filters.dateTo) {
    isCustom = true;
    currentStart = filters.dateFrom ? new Date(filters.dateFrom) : new Date(now.getTime() - 30 * 86400000);
    currentEnd = filters.dateTo ? new Date(filters.dateTo) : new Date(now);
    currentEnd.setHours(23, 59, 59, 999);
    const durationMs = Math.max(currentEnd.getTime() - currentStart.getTime(), 86400000);
    previousEnd = new Date(currentStart.getTime());
    previousStart = new Date(currentStart.getTime() - durationMs);
  } else {
    const days = Math.min(Math.max(parseInt(requestedDays) || 30, 1), 365);
    currentEnd = new Date(now);
    currentStart = new Date(now.getTime() - days * 86400000);
    previousEnd = new Date(currentStart.getTime());
    previousStart = new Date(currentStart.getTime() - days * 86400000);
  }

  // Base eligibility filter: published/approved and non-spam
  const productFilter = (filters.product && filters.product !== 'all')
    ? { product: { $regex: new RegExp(`^${filters.product.trim()}$`, 'i') } }
    : {};

  const baseEligible = {
    moderationStatus: { $in: VALID_STATUSES },
    isSpam: { $ne: true },
    ...productFilter
  };

  // 1. Fetch current & previous period totals and negative reviews
  const [currentPeriodData, previousPeriodData] = await Promise.all([
    Feedback.aggregate([
      {
        $match: {
          ...baseEligible,
          submittedAt: { $gte: currentStart, $lte: currentEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'Negative'] }, 1, 0] } },
          mixed: { $sum: { $cond: [{ $eq: ['$sentiment', 'Mixed'] }, 1, 0] } },
          positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'Positive'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'Neutral'] }, 1, 0] } }
        }
      }
    ]),
    Feedback.aggregate([
      {
        $match: {
          ...baseEligible,
          submittedAt: { $gte: previousStart, $lt: previousEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'Negative'] }, 1, 0] } },
          mixed: { $sum: { $cond: [{ $eq: ['$sentiment', 'Mixed'] }, 1, 0] } },
          positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'Positive'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'Neutral'] }, 1, 0] } }
        }
      }
    ])
  ]);

  const curr = currentPeriodData[0] || { total: 0, negative: 0, mixed: 0, positive: 0, neutral: 0 };
  const prev = previousPeriodData[0] || { total: 0, negative: 0, mixed: 0, positive: 0, neutral: 0 };

  // 2. Fetch aspect-level negative mentions in current and previous periods
  const [currAspects, prevAspects] = await Promise.all([
    Feedback.aggregate([
      {
        $match: {
          ...baseEligible,
          submittedAt: { $gte: currentStart, $lte: currentEnd }
        }
      },
      { $unwind: '$aspects' },
      {
        $match: {
          'aspects.sentiment': { $in: ['Negative', 'negative'] }
        }
      },
      {
        $group: {
          _id: '$aspects.name',
          count: { $sum: 1 }
        }
      }
    ]),
    Feedback.aggregate([
      {
        $match: {
          ...baseEligible,
          submittedAt: { $gte: previousStart, $lt: previousEnd }
        }
      },
      { $unwind: '$aspects' },
      {
        $match: {
          'aspects.sentiment': { $in: ['Negative', 'negative'] }
        }
      },
      {
        $group: {
          _id: '$aspects.name',
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const currAspectMap = {};
  for (const a of currAspects) currAspectMap[a._id] = a.count;
  const prevAspectMap = {};
  for (const a of prevAspects) prevAspectMap[a._id] = a.count;

  // 3. Statistical safeguard: 5-review minimum threshold rule
  const MIN_REVIEWS_THRESHOLD = 5;
  const hasSufficientData = (curr.total >= MIN_REVIEWS_THRESHOLD && prev.total >= MIN_REVIEWS_THRESHOLD);
  let sampleSizeWarning = null;
  if (!hasSufficientData) {
    if (curr.total === 0 && prev.total === 0) {
      sampleSizeWarning = 'No customer reviews available in current or previous comparison period.';
    } else if (curr.total < MIN_REVIEWS_THRESHOLD || prev.total < MIN_REVIEWS_THRESHOLD) {
      sampleSizeWarning = `Sample size too small (Current: ${curr.total}, Previous: ${prev.total}) to establish trend direction. Minimum ${MIN_REVIEWS_THRESHOLD} reviews per period required for statistical comparisons.`;
    }
  }

  // Helper for percentage change with zero baseline handling
  function computeDelta(currentVal, previousVal) {
    if (previousVal === 0 && currentVal === 0) return { percent: 0, note: 'No complaints in either period' };
    if (previousVal === 0 && currentVal > 0) return { percent: null, note: `New complaints (${currentVal}) from zero baseline` };
    const pct = Math.round(((currentVal - previousVal) / previousVal) * 100);
    return { percent: pct, note: pct >= 0 ? `+${pct}% vs previous period` : `${pct}% vs previous period` };
  }

  // Compute complaint aspect deltas
  const allAspectNames = Array.from(new Set([...Object.keys(currAspectMap), ...Object.keys(prevAspectMap)]));
  const aspectTrends = allAspectNames.map(name => {
    const currentMentions = currAspectMap[name] || 0;
    const previousMentions = prevAspectMap[name] || 0;
    const delta = computeDelta(currentMentions, previousMentions);
    return {
      aspect: name,
      currentMentions,
      previousMentions,
      deltaPercent: hasSufficientData ? delta.percent : null,
      deltaNote: hasSufficientData ? delta.note : 'Sample size too small for delta calculation'
    };
  }).sort((a, b) => b.currentMentions - a.currentMentions);

  // Negative reviews delta
  const overallComplaintDelta = computeDelta(curr.negative, prev.negative);

  // 4. Time series grouping for chart
  const timeSeries = await Feedback.aggregate([
    {
      $match: {
        ...baseEligible,
        submittedAt: { $gte: currentStart, $lte: currentEnd }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
          sentiment: '$sentiment'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);

  // Pivot into daily records
  const dailyMap = {};
  for (const row of timeSeries) {
    const d = row._id.date;
    if (!dailyMap[d]) {
      dailyMap[d] = { date: d, total: 0, Positive: 0, Negative: 0, Neutral: 0, Mixed: 0 };
    }
    const sentiment = row._id.sentiment;
    if (dailyMap[d].hasOwnProperty(sentiment)) {
      dailyMap[d][sentiment] = row.count;
    }
    dailyMap[d].total += row.count;
  }

  const timeline = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    meta: {
      product: filters.product || 'all',
      isCustomDateRange: isCustom,
      currentPeriod: {
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
        totalReviews: curr.total,
        negativeReviews: curr.negative
      },
      previousPeriod: {
        start: previousStart.toISOString(),
        end: previousEnd.toISOString(),
        totalReviews: prev.total,
        negativeReviews: prev.negative
      },
      hasSufficientData,
      sampleSizeWarning,
      minimumThresholdRequired: MIN_REVIEWS_THRESHOLD
    },
    comparison: {
      currentNegativeReviews: curr.negative,
      previousNegativeReviews: prev.negative,
      negativeDeltaPercent: hasSufficientData ? overallComplaintDelta.percent : null,
      negativeDeltaNote: hasSufficientData ? overallComplaintDelta.note : sampleSizeWarning,
      aspectTrends
    },
    timeline
  };
}

module.exports = {
  getOverviewStats,
  getSentimentDistribution,
  getRatingDistribution,
  getAspectInsights,
  getTopPositiveAspects,
  getTopNegativeAspects,
  getProductInsights,
  getProductComparison,
  getSentimentTrend,
  getFeedbackTrend,
  getComplaintTrends,
  buildBaseMatch,
  VALID_STATUSES
};

