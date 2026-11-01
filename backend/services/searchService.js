/**
 * Search Service — Fashion Feedback Intelligence Platform (Phase 6)
 *
 * Provides reusable search, multi-attribute filtering, sorting, and pagination
 * logic for customer and administrator feedback browsing.
 *
 * Security & Data Governance:
 * - Public searches are ALWAYS constrained to { moderationStatus: { $in: ['published', 'approved'] } }
 * - Sensitive spam metrics (spamScore, spamReasons) are strictly stripped for non-admin requests
 * - Input parameters are sanitized to prevent MongoDB operator injection
 */

const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');

// Escape user text for safe RegExp usage (prevents ReDoS and injection)
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Builds a secure MongoDB query filter from user options.
 * @param {Object} options Filter options
 * @param {Boolean} isAdmin Whether caller is an administrator
 * @returns {Object} MongoDB query document
 */
function buildSearchQuery(options = {}, isAdmin = false) {
  const query = {};

  // 1. Moderation Status Enforcement
  if (!isAdmin) {
    // Public queries can NEVER access unapproved spam or rejected feedback
    query.moderationStatus = { $in: ['published', 'approved'] };
  } else if (options.moderationStatus && options.moderationStatus !== 'all') {
    const validStatuses = ['published', 'approved', 'flagged', 'rejected'];
    const status = String(options.moderationStatus).toLowerCase().trim();
    if (validStatuses.includes(status)) {
      query.moderationStatus = status;
    }
  }

  // 2. Text Search (case-insensitive substring across comment, product, name)
  if (options.q && typeof options.q === 'string' && options.q.trim()) {
    const safeQ = escapeRegex(options.q.trim());
    const reg = new RegExp(safeQ, 'i');
    query.$or = [
      { feedback: reg },
      { product: reg },
      { name: reg }
    ];
  }

  // 3. Product Filter
  if (options.product && options.product !== 'all' && typeof options.product === 'string') {
    const p = options.product.trim().toLowerCase();
    let pattern;
    if (p === 'tops' || p === 'shirts' || p === 'shirt' || p === 'top') {
      pattern = '^(tops?|shirts?)$';
    } else if (p === 'jeans' || p === 'pants' || p === 'pant' || p === 'jean') {
      pattern = '^(jeans?|pants?)$';
    } else if (p === 'dress' || p === 'dresses') {
      pattern = '^dresses?$';
    } else if (p === 'jacket' || p === 'jackets') {
      pattern = '^jackets?$';
    } else if (p === 'shoes' || p === 'shoe') {
      pattern = '^shoes?$';
    } else if (p === 'accessories' || p === 'accessory') {
      pattern = '^(accessories|accessory)$';
    } else {
      const safeProduct = escapeRegex(options.product.trim());
      pattern = `^${safeProduct}$`;
    }
    query.product = { $regex: new RegExp(pattern, 'i') };
  }

  // 4. Sentiment Filter
  if (options.sentiment && options.sentiment !== 'all' && typeof options.sentiment === 'string') {
    const validSentiments = ['Positive', 'Negative', 'Neutral', 'Mixed'];
    const matched = validSentiments.find(s => s.toLowerCase() === options.sentiment.trim().toLowerCase());
    if (matched) {
      query.sentiment = matched;
    }
  }

  // 5. Rating Filter (1-5)
  if (options.rating !== undefined && options.rating !== null && options.rating !== 'all' && options.rating !== '') {
    const parsedRating = parseInt(options.rating, 10);
    if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
      query.rating = parsedRating;
    }
  }

  // 6. Aspect Filter (matches aspects.name case-insensitively)
  if (options.aspect && options.aspect !== 'all' && typeof options.aspect === 'string') {
    const safeAspect = escapeRegex(options.aspect.trim());
    query['aspects.name'] = { $regex: new RegExp(`^${safeAspect}$`, 'i') };
  }

  // 7. Date Range Filter
  const now = new Date();
  if (options.dateFrom || options.dateTo) {
    query.submittedAt = {};
    if (options.dateFrom) {
      const dFrom = new Date(options.dateFrom);
      if (!isNaN(dFrom.getTime())) query.submittedAt.$gte = dFrom;
    }
    if (options.dateTo) {
      const dTo = new Date(options.dateTo);
      if (!isNaN(dTo.getTime())) {
        dTo.setHours(23, 59, 59, 999);
        query.submittedAt.$lte = dTo;
      }
    }
    if (Object.keys(query.submittedAt).length === 0) delete query.submittedAt;
  } else if (options.date && options.date !== 'all') {
    const days = parseInt(options.date, 10);
    if (!isNaN(days) && days > 0) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      query.submittedAt = { $gte: cutoff };
    }
  }

  return query;
}

/**
 * Maps requested sort string to a validated MongoDB sort specification.
 * Prevents arbitrary field injection.
 * @param {String} sortParam
 * @returns {Object} MongoDB sort spec
 */
function buildSortOption(sortParam) {
  const normalized = String(sortParam || '').toLowerCase().trim();
  switch (normalized) {
    case 'oldest':
      return { submittedAt: 1 };
    case 'rating_high':
    case 'highest_rating':
    case 'rating-desc':
      return { rating: -1, submittedAt: -1 };
    case 'rating_low':
    case 'lowest_rating':
    case 'rating-asc':
      return { rating: 1, submittedAt: -1 };
    case 'confidence_high':
    case 'highest_confidence':
    case 'confidence':
      return { sentimentConfidence: -1, submittedAt: -1 };
    case 'newest':
    case 'recent':
    default:
      return { submittedAt: -1 };
  }
}

/**
 * Searches and paginates feedback documents with full filtering and sorting.
 * @param {Object} options Query, filter, sort, and pagination options
 * @returns {Promise<Object>} { data, pagination: { page, limit, total, totalPages } }
 */
async function searchFeedbacks(options = {}) {
  const isAdmin = Boolean(options.isAdmin);
  const query = buildSearchQuery(options, isAdmin);
  const sort = buildSortOption(options.sort);

  // Validate pagination parameters with strict bounds
  const rawPage = parseInt(options.page, 10);
  const rawLimit = parseInt(options.limit, 10);
  const page = (!isNaN(rawPage) && rawPage > 0) ? rawPage : 1;
  const limit = (!isNaN(rawLimit) && rawLimit > 0) ? Math.min(50, rawLimit) : 10;
  const skip = (page - 1) * limit;

  // Build query builder with safe projection
  let queryBuilder = Feedback.find(query).sort(sort).skip(skip).limit(limit);

  if (!isAdmin) {
    // Strip internal moderation fields for public consumers
    queryBuilder = queryBuilder.select('-spamScore -spamReasons');
  }

  const [feedbacks, total] = await Promise.all([
    queryBuilder.lean().exec(),
    Feedback.countDocuments(query).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: feedbacks,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Retrieves a single feedback by its ID with appropriate privacy safeguards.
 * @param {String} id Feedback ObjectId
 * @param {Boolean} isAdmin Whether caller has admin privileges
 * @returns {Promise<Object|null>} Feedback document or null
 */
async function getFeedbackById(id, isAdmin = false) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  const query = { _id: id };
  if (!isAdmin) {
    query.moderationStatus = { $in: ['published', 'approved'] };
  }

  let queryBuilder = Feedback.findOne(query);
  if (!isAdmin) {
    queryBuilder = queryBuilder.select('-spamScore -spamReasons');
  }

  return queryBuilder.lean().exec();
}

module.exports = {
  searchFeedbacks,
  getFeedbackById,
  buildSearchQuery,
  buildSortOption,
  escapeRegex
};
