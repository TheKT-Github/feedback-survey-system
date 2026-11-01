/**
 * AI Insights Route — Style Feedback Intelligence AI (Phase 9 + Phase 10 RAG)
 *
 * Exposes protected administrative endpoint for LLM-driven style and feedback inquiries.
 * Enforces JWT verification and Admin RBAC.
 *
 * Phase 10 changes:
 * - Integrates feedbackRetrievalService to retrieve real approved MongoDB feedback.
 * - dateFrom/dateTo take strict precedence over dateRange.
 * - If no approved feedback found: returns honest insufficient-evidence response (no LLM call).
 * - Validates ALL evidenceIds in keyFindings and any other citing field against server records.
 * - Final evidence list built exclusively from server-retrieved records, never client-supplied data.
 * - Parses and safely handles malformed or non-JSON model responses.
 */

const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const Feedback = require('../models/Feedback');
const analytics = require('../services/analyticsService');
const llmService = require('../services/llmService');
const feedbackRetrievalService = require('../services/feedbackRetrievalService');
const aiCacheService = require('../services/aiCacheService');

const VALID_SENTIMENTS = new Set(['Positive', 'Negative', 'Neutral', 'Mixed', 'all']);
const VALID_DATE_RANGES = new Set(['7', '30', '90', 'all']);
const VALID_TAXONOMY_PRODUCTS = new Set(['tops', 'jeans', 'dress', 'jacket', 'shoes', 'accessories', 'general']);
const VALID_FOCUS_AREAS = new Set(['all', 'quality', 'fitting', 'material', 'design', 'returns']);


/**
 * Validates optional administrative filters for Phase 10 RAG endpoint.
 * Supports: product, sentiment, rating, dateRange, aspect, dateFrom, dateTo.
 */
function validateFilters(filters) {
  if (!filters) return { isValid: true, sanitized: null };

  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return { isValid: false, error: 'Filters must be an object.' };
  }

  const allowedKeys = ['product', 'sentiment', 'rating', 'dateRange', 'aspect', 'dateFrom', 'dateTo'];
  const incomingKeys = Object.keys(filters);
  for (const key of incomingKeys) {
    if (!allowedKeys.includes(key)) {
      return {
        isValid: false,
        error: `Invalid filter property "${key}". Allowed filters: ${allowedKeys.join(', ')}`
      };
    }
  }

  const sanitized = {};

  if (filters.product !== undefined && filters.product !== null && filters.product !== '') {
    if (typeof filters.product !== 'string' || filters.product.length > 50) {
      return { isValid: false, error: 'Product filter must be a string up to 50 characters.' };
    }
    if (/[\$\{\}\[\]\*\+\?\\]/.test(filters.product)) {
      return { isValid: false, error: 'Product filter contains invalid characters.' };
    }
    sanitized.product = filters.product.trim();
  }

  if (filters.sentiment !== undefined && filters.sentiment !== null && filters.sentiment !== '') {
    if (typeof filters.sentiment !== 'string' || !VALID_SENTIMENTS.has(filters.sentiment)) {
      return {
        isValid: false,
        error: `Sentiment filter must be one of: ${Array.from(VALID_SENTIMENTS).join(', ')}`
      };
    }
    sanitized.sentiment = filters.sentiment;
  }

  if (
    filters.rating !== undefined &&
    filters.rating !== null &&
    filters.rating !== '' &&
    filters.rating !== 'all'
  ) {
    const parsedRating = parseInt(filters.rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return { isValid: false, error: 'Rating filter must be an integer between 1 and 5.' };
    }
    sanitized.rating = parsedRating;
  }

  if (filters.dateRange !== undefined && filters.dateRange !== null && filters.dateRange !== '') {
    const rangeStr = String(filters.dateRange).trim();
    if (!VALID_DATE_RANGES.has(rangeStr)) {
      return {
        isValid: false,
        error: `Date range must be one of: ${Array.from(VALID_DATE_RANGES).join(', ')}`
      };
    }
    sanitized.dateRange = rangeStr;
  }

  if (filters.aspect !== undefined && filters.aspect !== null && filters.aspect !== '') {
    if (typeof filters.aspect !== 'string' || filters.aspect.length > 50) {
      return { isValid: false, error: 'Aspect filter must be a string up to 50 characters.' };
    }
    if (/[\$\{\}\[\]\*\+\?\\]/.test(filters.aspect)) {
      return { isValid: false, error: 'Aspect filter contains invalid characters.' };
    }
    sanitized.aspect = filters.aspect.trim();
  }

  // dateFrom / dateTo: precedence over dateRange — validated as parseable dates
  if (filters.dateFrom !== undefined && filters.dateFrom !== null && filters.dateFrom !== '') {
    const d = new Date(filters.dateFrom);
    if (isNaN(d.getTime())) {
      return { isValid: false, error: 'dateFrom must be a valid date string (e.g. ISO 8601).' };
    }
    sanitized.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo !== undefined && filters.dateTo !== null && filters.dateTo !== '') {
    const d = new Date(filters.dateTo);
    if (isNaN(d.getTime())) {
      return { isValid: false, error: 'dateTo must be a valid date string (e.g. ISO 8601).' };
    }
    sanitized.dateTo = filters.dateTo;
  }

  // Cross-validate: if both provided, dateFrom must not be after dateTo
  if (sanitized.dateFrom && sanitized.dateTo) {
    if (new Date(sanitized.dateFrom) > new Date(sanitized.dateTo)) {
      return { isValid: false, error: 'dateFrom cannot be after dateTo.' };
    }
  }

  return { isValid: true, sanitized };
}

/**
 * Validates all evidenceIds cited in any field of the LLM response
 * against the set of server-retrieved MongoDB _id strings.
 * Returns a cleaned version of the parsed JSON with only verified citations.
 *
 * @param {Object} parsed Raw parsed LLM JSON object
 * @param {Set<string>} validIds Set of server-retrieved _id strings
 * @param {Object} refMap Token → _id map (e.g. { 'EVID-1': '64abc...' })
 * @returns {{ cleaned: Object, droppedCount: number }}
 */
function validateAndCleanCitations(parsed, validIds, refMap) {
  let droppedCount = 0;

  // Build reverse map: _id → token, and token → _id
  const validTokens = new Set(Object.keys(refMap));

  function isValidRef(ref) {
    if (!ref || typeof ref !== 'string') return false;
    // Accept both EVID-N tokens and raw MongoDB _id strings
    if (validTokens.has(ref)) return true;
    if (validIds.has(ref)) return true;
    return false;
  }

  function cleanEvidenceIds(arr) {
    if (!Array.isArray(arr)) return [];
    const before = arr.length;
    const cleaned = arr.filter(id => isValidRef(id));
    droppedCount += before - cleaned.length;
    return cleaned;
  }

  const cleaned = {
    answer: typeof parsed.answer === 'string' ? parsed.answer : '',
    insufficientEvidence: Boolean(parsed.insufficientEvidence),
    keyFindings: [],
    recommendations: [],
  };

  if (Array.isArray(parsed.keyFindings)) {
    cleaned.keyFindings = parsed.keyFindings
      .filter(kf => kf && typeof kf.finding === 'string')
      .map(kf => ({
        finding: kf.finding,
        evidenceIds: cleanEvidenceIds(kf.evidenceIds)
      }));
  }

  if (Array.isArray(parsed.recommendations)) {
    cleaned.recommendations = parsed.recommendations.filter(r => typeof r === 'string');
  }

  return { cleaned, droppedCount };
}

/**
 * Validates and cleans citations in product comparison RAG response.
 */
function validateAndCleanComparisonCitations(parsed, validIds, refMap) {
  let droppedCount = 0;
  const validTokens = new Set(Object.keys(refMap));

  function isValidRef(ref) {
    if (!ref || typeof ref !== 'string') return false;
    return validTokens.has(ref) || validIds.has(ref);
  }

  function cleanEvidenceIds(arr) {
    if (!Array.isArray(arr)) return [];
    const before = arr.length;
    const cleaned = arr.filter(id => isValidRef(id));
    droppedCount += before - cleaned.length;
    return cleaned;
  }

  const cleaned = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : (parsed.answer || ''),
    productSummaries: [],
    comparativeDifferences: [],
    strategicTakeaways: Array.isArray(parsed.strategicTakeaways)
      ? parsed.strategicTakeaways.filter(t => typeof t === 'string')
      : (Array.isArray(parsed.recommendations) ? parsed.recommendations.filter(r => typeof r === 'string') : []),
    insufficientEvidence: Boolean(parsed.insufficientEvidence)
  };

  if (Array.isArray(parsed.productSummaries)) {
    cleaned.productSummaries = parsed.productSummaries
      .filter(ps => ps && typeof ps === 'object')
      .map(ps => ({
        product: String(ps.product || ''),
        commonComplaints: Array.isArray(ps.commonComplaints) ? ps.commonComplaints.filter(c => typeof c === 'string') : [],
        positiveThemes: Array.isArray(ps.positiveThemes) ? ps.positiveThemes.filter(t => typeof t === 'string') : [],
        evidenceIds: cleanEvidenceIds(ps.evidenceIds)
      }));
  }

  if (Array.isArray(parsed.comparativeDifferences)) {
    cleaned.comparativeDifferences = parsed.comparativeDifferences
      .filter(cd => cd && typeof cd === 'object')
      .map(cd => ({
        dimension: String(cd.dimension || ''),
        observation: String(cd.observation || ''),
        evidenceIds: cleanEvidenceIds(cd.evidenceIds)
      }));
  }

  return { cleaned, droppedCount };
}

/**
 * Validates and cleans citations in strategic recommendations RAG response.
 */
function validateAndCleanRecommendationCitations(parsed, validIds, refMap) {
  let droppedCount = 0;
  const validTokens = new Set(Object.keys(refMap));

  function isValidRef(ref) {
    if (!ref || typeof ref !== 'string') return false;
    return validTokens.has(ref) || validIds.has(ref);
  }

  function cleanEvidenceIds(arr) {
    if (!Array.isArray(arr)) return [];
    const before = arr.length;
    const cleaned = arr.filter(id => isValidRef(id));
    droppedCount += before - cleaned.length;
    return cleaned;
  }

  const cleaned = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : (parsed.answer || ''),
    prioritizedRecommendations: [],
    insufficientEvidence: Boolean(parsed.insufficientEvidence)
  };

  if (Array.isArray(parsed.prioritizedRecommendations)) {
    cleaned.prioritizedRecommendations = parsed.prioritizedRecommendations
      .filter(r => r && typeof r === 'object')
      .map(r => ({
        priority: ['High', 'Medium', 'Low'].includes(r.priority) ? r.priority : 'Medium',
        category: String(r.category || 'Quality & Design'),
        title: String(r.title || ''),
        action: String(r.action || ''),
        expectedImpact: String(r.expectedImpact || ''),
        evidenceIds: cleanEvidenceIds(r.evidenceIds)
      }));
  }

  return { cleaned, droppedCount };
}


/**
 * POST /api/admin/ai/ask
 * RAG-enabled administrative AI endpoint (Phase 10).
 * Retrieves real approved MongoDB feedback, constructs bounded evidence context,
 * calls LLM, validates all citations, and returns structured response.
 */
router.post('/ask', aiLimiter, verifyToken, requireAdmin, async (req, res) => {
  try {
    // 1. Validate request body structure
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST_BODY',
        error: 'Request body must be a JSON object containing a "question" field.'
      });
    }

    const { question, filters } = req.body;

    // 2. Validate question
    if (question === undefined || question === null) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_QUESTION',
        error: 'The "question" field is required.'
      });
    }

    if (typeof question !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_QUESTION_TYPE',
        error: 'Question must be a string.'
      });
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_QUESTION',
        error: 'Question cannot be empty or whitespace only.'
      });
    }
    if (trimmedQuestion.length < 3) {
      return res.status(400).json({
        success: false,
        code: 'QUESTION_TOO_SHORT',
        error: 'Question is too short (minimum 3 characters required).'
      });
    }
    if (trimmedQuestion.length > 500) {
      return res.status(400).json({
        success: false,
        code: 'QUESTION_TOO_LONG',
        error: 'Question exceeds maximum allowable length of 500 characters.'
      });
    }

    // 3. Validate optional filters (if supplied)
    const filterValidation = validateFilters(filters);
    if (!filterValidation.isValid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILTERS',
        error: filterValidation.error
      });
    }

    // 4.5 Cache & Demo Mode check (before LLM call)
    const askCacheKey = aiCacheService.getCacheKey({
      endpoint: 'ask',
      queryOrProducts: trimmedQuestion,
      filters: filterValidation.sanitized || null
    });

    // Check cache first
    const cachedAsk = aiCacheService.cacheGet(askCacheKey);
    if (cachedAsk) {
      return res.status(200).json({
        success: true,
        data: { ...cachedAsk.data, isCached: true }
      });
    }

    // Demo mode short-circuit (before retrieval if demo, or after insufficient evidence)
    if (aiCacheService.isDemoModeActive()) {
      const demoData = aiCacheService.getDemoResponse('ask', { question: trimmedQuestion });
      return res.status(200).json({ success: true, data: demoData });
    }

    // 4. Retrieve relevant approved feedback from MongoDB (Phase 10 RAG)
    let retrieval;
    try {
      retrieval = await feedbackRetrievalService.retrieveRelevantFeedback({
        question: trimmedQuestion,
        filters: filterValidation.sanitized || {},
      });
    } catch (retrievalErr) {
      // Map retrieval validation errors (invalid date format etc.) to 400
      if (retrievalErr.status === 400) {
        return res.status(400).json({
          success: false,
          code: retrievalErr.code || 'RETRIEVAL_FILTER_ERROR',
          error: retrievalErr.message
        });
      }
      console.error('❌ [AI Insights] Retrieval error:', retrievalErr.message);
      return res.status(500).json({
        success: false,
        code: 'RETRIEVAL_ERROR',
        error: 'Failed to retrieve feedback from database.'
      });
    }

    // 5. Handle empty evidence — honest response without calling LLM
    if (retrieval.isInsufficient) {
      return res.status(200).json({
        success: true,
        data: {
          answer: retrieval.evidenceStatusNote ||
            'No relevant approved feedback was found for this question and filter combination. Try broadening your search or changing the filters.',
          keyFindings: [],
          recommendations: [],
          evidence: [],
          retrievedReviewCount: 0,
          appliedFilters: retrieval.appliedFilters || null,
          insufficientEvidence: true,
          queryExplanation: retrieval.queryExplanation,
          note: 'No LLM call was made — insufficient approved evidence for this query.'
        }
      });
    }

    // 6. Build bounded evidence context for LLM prompt
    const { contextString, refMap } = llmService.formatEvidenceContext(retrieval.records);

    // Build set of valid server-retrieved IDs for citation validation
    const validIds = new Set(retrieval.records.map(r => r._id));

    // 7. Construct RAG-specific system instruction
    const ragSystemInstruction = llmService.buildRagSystemInstruction(
      retrieval.records.length,
      retrieval.queryExplanation,
      retrieval.evidenceStatusNote || ''
    );

    // 8. Call LLM Service (with cache deduplication)
    let llmResult;
    try {
      llmResult = await aiCacheService.deduplicate(askCacheKey, () =>
        llmService.askLLM({
          question: trimmedQuestion,
          evidenceContext: contextString || null,
          systemInstruction: ragSystemInstruction
        })
      );
    } catch (llmErr) {
      const statusCode = llmErr.status || 502;
      const errorCode = llmErr.code || 'LLM_ERROR';
      console.error(`❌ [AI Insights] LLM error (${statusCode} - ${errorCode}):`, llmErr.message);

      // Quota exhaustion: fall back to demo mode if active, else return error
      if (errorCode === 'AI_QUOTA_EXHAUSTED' && aiCacheService.isDemoModeActive()) {
        const demoData = aiCacheService.getDemoResponse('ask', { question: trimmedQuestion });
        return res.status(200).json({ success: true, data: demoData });
      }

      return res.status(statusCode).json({
        success: false,
        code: errorCode,
        error: llmErr.message || 'AI service error.'
      });
    }

    // 10. Parse LLM JSON response
    let parsedLLM;
    const rawAnswer = llmResult.answer || '';

    // Strip possible markdown fences that some providers insert
    const fenceStripped = rawAnswer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      parsedLLM = JSON.parse(fenceStripped);
    } catch (_parseErr) {
      // Model returned non-JSON — wrap as plain answer with no findings
      parsedLLM = {
        answer: rawAnswer.slice(0, 2000),
        keyFindings: [],
        recommendations: [],
        insufficientEvidence: false
      };
    }

    // 11. Validate and clean ALL evidence citations across entire response
    const { cleaned: validatedResponse, droppedCount } = validateAndCleanCitations(
      parsedLLM,
      validIds,
      refMap
    );

    if (droppedCount > 0) {
      console.warn(`⚠️ [AI Insights] Dropped ${droppedCount} fabricated citation(s) from LLM response.`);
    }

    // 12. Build final evidence list exclusively from server-retrieved records
    const evidenceList = retrieval.records.map(rec => ({
      id: rec._id,
      refToken: rec.refToken,
      product: rec.product,
      rating: rec.rating,
      sentiment: rec.sentiment,
      excerpt: rec.feedbackText
        ? (rec.feedbackText.length > 200 ? rec.feedbackText.slice(0, 197) + '...' : rec.feedbackText)
        : ''
    }));

    // 13. Build final response payload and cache it
    const askResponseData = {
      answer: validatedResponse.answer,
      keyFindings: validatedResponse.keyFindings,
      recommendations: validatedResponse.recommendations,
      evidence: evidenceList,
      retrievedReviewCount: retrieval.records.length,
      totalMatchedInDb: retrieval.totalMatched,
      appliedFilters: retrieval.appliedFilters || null,
      insufficientEvidence: validatedResponse.insufficientEvidence || false,
      isLimitedEvidence: retrieval.isLimited || false,
      evidenceNote: retrieval.evidenceStatusNote || null,
      queryExplanation: retrieval.queryExplanation,
      fabricatedCitationsDropped: droppedCount,
      provider: llmResult.provider,
      model: llmResult.model,
      usage: llmResult.usage,
      source: 'live'
    };

    // Store successful response in cache (never cache errors)
    aiCacheService.cacheSet(askCacheKey, askResponseData);

    return res.status(200).json({
      success: true,
      data: askResponseData
    });
  } catch (err) {
    const statusCode = err.status || 500;
    const errorCode = err.code || 'INTERNAL_AI_ERROR';

    console.error(`❌ [AI Insights] Unexpected error (${statusCode} - ${errorCode}):`, err.message);

    return res.status(statusCode).json({
      success: false,
      code: errorCode,
      error: err.message || 'An unexpected error occurred while communicating with the AI service.'
    });
  }
});

/**
 * POST /api/admin/ai/compare-products
 * Product Comparison Intelligence Endpoint (Phase 12).
 * Compares 2-5 products using measured DB stats + evidence-backed RAG analysis.
 */
router.post('/compare-products', aiLimiter, verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST_BODY',
        error: 'Request body must be a JSON object containing "products".'
      });
    }

    const { products, filters } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PRODUCTS',
        error: 'The "products" field must be an array of product names.'
      });
    }

    // Deduplicate and validate taxonomy
    const cleanProducts = Array.from(new Set(
      products.map(p => typeof p === 'string' ? p.trim().toLowerCase() : '')
    )).filter(Boolean);

    if (cleanProducts.length < 2) {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_PRODUCTS',
        error: 'Please provide at least 2 distinct products to compare.'
      });
    }

    if (cleanProducts.length > 5) {
      return res.status(400).json({
        success: false,
        code: 'TOO_MANY_PRODUCTS',
        error: 'A maximum of 5 products can be compared at one time.'
      });
    }

    for (const p of cleanProducts) {
      if (!VALID_TAXONOMY_PRODUCTS.has(p)) {
        return res.status(400).json({
          success: false,
          code: 'UNSUPPORTED_PRODUCT',
          error: `Product "${p}" is not in the supported taxonomy. Supported: ${Array.from(VALID_TAXONOMY_PRODUCTS).join(', ')}`
        });
      }
    }

    // Optional filters
    const filterValidation = validateFilters(filters);
    if (!filterValidation.isValid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILTERS',
        error: filterValidation.error
      });
    }
    const sanitizedFilters = filterValidation.sanitized || {};

    // Cache & Demo Mode check
    const compareCacheKey = aiCacheService.getCacheKey({
      endpoint: 'compare-products',
      queryOrProducts: cleanProducts,
      filters: sanitizedFilters
    });

    const cachedCompare = aiCacheService.cacheGet(compareCacheKey);
    if (cachedCompare) {
      return res.status(200).json({
        success: true,
        data: { ...cachedCompare.data, isCached: true }
      });
    }

    if (aiCacheService.isDemoModeActive()) {
      const demoData = aiCacheService.getDemoResponse('compare-products', { products: cleanProducts });
      return res.status(200).json({ success: true, data: demoData });
    }

    // 1. Measured Database Metrics (strictly from MongoDB)
    const measuredStats = await analytics.getProductComparison(cleanProducts, sanitizedFilters);

    // 2. Retrieve real customer reviews for selected products (max 15 total, non-spam, published/approved)
    const reviewQuery = {
      moderationStatus: { $in: ['published', 'approved'] },
      isSpam: { $ne: true },
      product: { $in: cleanProducts.map(p => new RegExp(`^${p}$`, 'i')) }
    };

    if (sanitizedFilters.dateFrom || sanitizedFilters.dateTo) {
      reviewQuery.submittedAt = {};
      if (sanitizedFilters.dateFrom) reviewQuery.submittedAt.$gte = new Date(sanitizedFilters.dateFrom);
      if (sanitizedFilters.dateTo) {
        const to = new Date(sanitizedFilters.dateTo);
        to.setHours(23, 59, 59, 999);
        reviewQuery.submittedAt.$lte = to;
      }
    }

    const candidateDocs = await Feedback.find(reviewQuery, {
      _id: 1, product: 1, rating: 1, sentiment: 1, aspects: 1, feedback: 1, submittedAt: 1
    }).sort({ submittedAt: -1 }).limit(15).lean();

    const formattedRecords = candidateDocs.map((r, i) => ({
      _id: String(r._id),
      refToken: `EVID-${i + 1}`,
      product: r.product,
      rating: r.rating,
      sentiment: r.sentiment,
      aspects: (r.aspects || []).map(a => a.name),
      feedbackText: r.feedback,
      submittedAt: r.submittedAt
    }));

    // If zero candidate reviews exist across all selected products
    if (formattedRecords.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          measuredStatistics: measuredStats,
          aiSynthesis: {
            summary: 'No approved customer reviews found for the selected products matching your filter criteria. Measured database metrics above reflect all verified customer submissions.',
            productSummaries: cleanProducts.map(p => ({
              product: p,
              commonComplaints: [],
              positiveThemes: [],
              evidenceIds: []
            })),
            comparativeDifferences: [],
            strategicTakeaways: []
          },
          evidence: [],
          totalRetrievedReviews: 0,
          insufficientEvidence: true,
          disclaimer: 'AI-generated comparative analysis based on customer feedback. Measured statistics reflect authentic database records.'
        }
      });
    }

    // 3. Format evidence context for LLM prompt
    const { contextString, refMap } = llmService.formatEvidenceContext(formattedRecords);
    const validIds = new Set(formattedRecords.map(r => r._id));

    // 4. Construct comparison prompt instruction
    const compSystemInstruction = llmService.buildProductComparisonSystemInstruction(cleanProducts);

    // 5. Call LLM (with deduplication)
    let llmResult;
    try {
      llmResult = await aiCacheService.deduplicate(compareCacheKey, () =>
        llmService.askLLM({
          question: `Provide a detailed comparison between products: ${cleanProducts.join(', ')}`,
          evidenceContext: contextString,
          systemInstruction: compSystemInstruction
        })
      );
    } catch (llmErr) {
      const statusCode = llmErr.status || 502;
      const errorCode = llmErr.code || 'LLM_COMPARISON_ERROR';

      if (errorCode === 'AI_QUOTA_EXHAUSTED' && aiCacheService.isDemoModeActive()) {
        const demoData = aiCacheService.getDemoResponse('compare-products', { products: cleanProducts });
        return res.status(200).json({ success: true, data: demoData });
      }

      return res.status(statusCode).json({
        success: false,
        code: errorCode,
        error: llmErr.message || 'AI comparison service error.'
      });
    }

    // 6. Parse and strip code fences
    let parsedLLM;
    const rawAnswer = llmResult.answer || '';
    const fenceStripped = rawAnswer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      parsedLLM = JSON.parse(fenceStripped);
    } catch (_) {
      parsedLLM = {
        summary: rawAnswer.slice(0, 1000),
        productSummaries: [],
        comparativeDifferences: [],
        strategicTakeaways: []
      };
    }

    // 7. Validate citations server-side
    const { cleaned: validatedSynthesis, droppedCount } = validateAndCleanComparisonCitations(
      parsedLLM,
      validIds,
      refMap
    );

    // 8. Build server evidence list
    const evidenceList = formattedRecords.map(rec => ({
      id: rec._id,
      refToken: rec.refToken,
      product: rec.product,
      rating: rec.rating,
      sentiment: rec.sentiment,
      excerpt: rec.feedbackText
        ? (rec.feedbackText.length > 200 ? rec.feedbackText.slice(0, 197) + '...' : rec.feedbackText)
        : ''
    }));

    const compareResponseData = {
      measuredStatistics: measuredStats,
      aiSynthesis: validatedSynthesis,
      evidence: evidenceList,
      totalRetrievedReviews: formattedRecords.length,
      fabricatedCitationsDropped: droppedCount,
      insufficientEvidence: false,
      disclaimer: 'AI-generated comparative analysis based on customer feedback. Measured statistics reflect authentic database records.',
      provider: llmResult.provider,
      model: llmResult.model,
      usage: llmResult.usage,
      source: 'live'
    };

    // Cache successful response
    aiCacheService.cacheSet(compareCacheKey, compareResponseData);

    return res.status(200).json({
      success: true,
      data: compareResponseData
    });
  } catch (err) {
    console.error('❌ [AI Insights] Comparison error:', err);
    return res.status(err.status || 500).json({
      success: false,
      code: err.code || 'COMPARISON_ERROR',
      error: err.message || 'Error processing product comparison.'
    });
  }
});

/**
 * POST /api/admin/ai/recommendations
 * Evidence-Backed Strategic Recommendations Endpoint (Phase 12).
 * Produces prioritized business recommendations with server-validated evidence citations.
 */
router.post('/recommendations', aiLimiter, verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST_BODY',
        error: 'Request body must be a JSON object.'
      });
    }

    const { product, focusArea, filters } = req.body;

    // Validate product if provided
    let cleanProduct = 'all';
    if (product !== undefined && product !== null && product !== '' && product !== 'all') {
      const p = String(product).toLowerCase().trim();
      if (!VALID_TAXONOMY_PRODUCTS.has(p)) {
        return res.status(400).json({
          success: false,
          code: 'UNSUPPORTED_PRODUCT',
          error: `Product "${p}" is not in the supported taxonomy.`
        });
      }
      cleanProduct = p;
    }

    // Validate focusArea if provided
    let cleanFocus = 'all';
    if (focusArea !== undefined && focusArea !== null && focusArea !== '' && focusArea !== 'all') {
      const f = String(focusArea).toLowerCase().trim();
      if (!VALID_FOCUS_AREAS.has(f)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FOCUS_AREA',
          error: `Focus area "${f}" is invalid. Allowed: ${Array.from(VALID_FOCUS_AREAS).join(', ')}`
        });
      }
      cleanFocus = f;
    }

    // Validate optional filters
    const filterValidation = validateFilters(filters);
    if (!filterValidation.isValid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILTERS',
        error: filterValidation.error
      });
    }

    // Cache & Demo Mode check
    const recCacheKey = aiCacheService.getCacheKey({
      endpoint: 'recommendations',
      queryOrProducts: `${cleanProduct}::${cleanFocus}`,
      filters: filterValidation.sanitized || null
    });

    const cachedRec = aiCacheService.cacheGet(recCacheKey);
    if (cachedRec) {
      return res.status(200).json({
        success: true,
        data: { ...cachedRec.data, isCached: true }
      });
    }

    if (aiCacheService.isDemoModeActive()) {
      const demoData = aiCacheService.getDemoResponse('recommendations', { product: cleanProduct, focusArea: cleanFocus });
      return res.status(200).json({ success: true, data: demoData });
    }

    // Retrieve feedback via feedbackRetrievalService
    const combinedFilters = {
      ...(filterValidation.sanitized || {})
    };
    if (cleanProduct !== 'all') combinedFilters.product = cleanProduct;

    const questionForRetrieval = cleanFocus !== 'all'
      ? `Customer feedback complaints, sizing problems, and defects regarding ${cleanFocus}`
      : 'Customer quality complaints, sizing issues, and feature requests';

    let retrieval;
    try {
      retrieval = await feedbackRetrievalService.retrieveRelevantFeedback({
        question: questionForRetrieval,
        filters: combinedFilters
      });
    } catch (retrievalErr) {
      return res.status(retrievalErr.status || 500).json({
        success: false,
        code: retrievalErr.code || 'RETRIEVAL_ERROR',
        error: retrievalErr.message || 'Failed to retrieve feedback for recommendations.'
      });
    }

    if (retrieval.isInsufficient || !retrieval.records || retrieval.records.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: 'No relevant approved customer reviews found for this selection. Insufficient evidence to formulate strategic recommendations.',
          prioritizedRecommendations: [],
          evidence: [],
          retrievedReviewCount: 0,
          insufficientEvidence: true,
          disclaimer: 'AI-generated recommendations based on customer feedback. Always verify with manufacturing and product teams before execution.'
        }
      });
    }

    // Format bounded evidence context
    const { contextString, refMap } = llmService.formatEvidenceContext(retrieval.records);
    const validIds = new Set(retrieval.records.map(r => r._id));

    // System instruction
    const recSystemInstruction = llmService.buildStrategicRecommendationsSystemInstruction(cleanProduct, cleanFocus);

    // Call LLM (with deduplication)
    let llmResult;
    try {
      llmResult = await aiCacheService.deduplicate(recCacheKey, () =>
        llmService.askLLM({
          question: `Formulate prioritized strategic product recommendations for product=${cleanProduct}, focus=${cleanFocus}`,
          evidenceContext: contextString,
          systemInstruction: recSystemInstruction
        })
      );
    } catch (llmErr) {
      const statusCode = llmErr.status || 502;
      const errorCode = llmErr.code || 'LLM_RECOMMENDATION_ERROR';

      if (errorCode === 'AI_QUOTA_EXHAUSTED' && aiCacheService.isDemoModeActive()) {
        const demoData = aiCacheService.getDemoResponse('recommendations', { product: cleanProduct, focusArea: cleanFocus });
        return res.status(200).json({ success: true, data: demoData });
      }

      return res.status(statusCode).json({
        success: false,
        code: errorCode,
        error: llmErr.message || 'AI recommendation service error.'
      });
    }

    // Parse JSON
    let parsedLLM;
    const rawAnswer = llmResult.answer || '';
    const fenceStripped = rawAnswer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      parsedLLM = JSON.parse(fenceStripped);
    } catch (_) {
      parsedLLM = {
        summary: rawAnswer.slice(0, 1000),
        prioritizedRecommendations: []
      };
    }

    // Validate citations server-side
    const { cleaned: validatedRecommendations, droppedCount } = validateAndCleanRecommendationCitations(
      parsedLLM,
      validIds,
      refMap
    );

    // Build server evidence list
    const evidenceList = retrieval.records.map(rec => ({
      id: rec._id,
      refToken: rec.refToken,
      product: rec.product,
      rating: rec.rating,
      sentiment: rec.sentiment,
      excerpt: rec.feedbackText
        ? (rec.feedbackText.length > 200 ? rec.feedbackText.slice(0, 197) + '...' : rec.feedbackText)
        : ''
    }));

    const recResponseData = {
      summary: validatedRecommendations.summary,
      prioritizedRecommendations: validatedRecommendations.prioritizedRecommendations,
      evidence: evidenceList,
      retrievedReviewCount: retrieval.records.length,
      fabricatedCitationsDropped: droppedCount,
      insufficientEvidence: false,
      disclaimer: 'AI-generated recommendations based on customer feedback. Always verify with manufacturing and product teams before execution.',
      provider: llmResult.provider,
      model: llmResult.model,
      usage: llmResult.usage,
      source: 'live'
    };

    // Cache successful response
    aiCacheService.cacheSet(recCacheKey, recResponseData);

    return res.status(200).json({
      success: true,
      data: recResponseData
    });
  } catch (err) {
    console.error('❌ [AI Insights] Recommendations error:', err);
    return res.status(err.status || 500).json({
      success: false,
      code: err.code || 'RECOMMENDATIONS_ERROR',
      error: err.message || 'Error formulating recommendations.'
    });
  }
});

module.exports = router;
