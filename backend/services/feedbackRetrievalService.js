/**
 * Feedback Retrieval Service — Style Feedback Intelligence AI (Phase 10)
 *
 * Provides server-side, explainable retrieval of verified customer reviews
 * from MongoDB for Retrieval-Augmented Generation (RAG).
 *
 * Core Data Governance & Security Guarantees:
 * - Publicly approved / published feedback only: { moderationStatus: { $in: ['published', 'approved'] } }
 * - Spam exclusion: { isSpam: { $ne: true } }
 * - Server-authoritative: Client-supplied evidence or review IDs are NEVER accepted as DB data.
 * - Explaining retrieval: Keyword and multi-attribute filters (product, sentiment, rating, aspect, date).
 * - Date Precedence: Explicit date boundaries (dateFrom / dateTo) take strict precedence over relative dateRange (7/30/90).
 * - Bounded Context: Capped review count (default 8, max 15) and text length cap (max 3,500 chars) to prevent token bloat.
 * - Privacy: Excludes customer PII (email, name, imagePath, internal spam scores) from LLM context.
 */

const Feedback = require('../models/Feedback');
const { escapeRegex } = require('./searchService');

// Fashion aspect taxonomy aligned with nlpService
const ASPECT_KEYWORDS = {
  Fitting: ['fitting', 'fit', 'fits', 'fitted', 'tight', 'loose', 'snug', 'baggy', 'comfort', 'comfortable', 'waistline', 'stretchy'],
  Quality: ['quality', 'durable', 'durability', 'stitching', 'stitch', 'craftsmanship', 'torn', 'ripped', 'flimsy', 'defect', 'defective'],
  Design: ['design', 'style', 'stylish', 'look', 'looks', 'pattern', 'patterns', 'cut', 'chic', 'aesthetic', 'appearance'],
  Color: ['color', 'colors', 'colour', 'colours', 'shade', 'shades', 'hue', 'vibrant', 'bright', 'fade', 'faded', 'bleeding'],
  Size: ['size', 'sizes', 'sizing', 'small', 'smaller', 'large', 'larger', 'length', 'short', 'long', 'oversized'],
  Material: ['material', 'materials', 'fabric', 'fabrics', 'cloth', 'cotton', 'polyester', 'silk', 'linen', 'denim', 'wool', 'soft', 'rough'],
  Price: ['price', 'prices', 'cost', 'costly', 'expensive', 'overpriced', 'affordable', 'value', 'worth', 'budget']
};

// Common stopwords to filter out from natural language queries
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which',
  'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d',
  'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  // Domain conversational fillers
  'customer', 'customers', 'feedback', 'review', 'reviews', 'tell', 'show', 'give', 'summarize', 'summary',
  'common', 'say', 'saying', 'said', 'opinion', 'opinions', 'think', 'thinking', 'product', 'products', 'please',
  'find', 'look', 'looking', 'overall', 'recurring', 'appear', 'appearing', 'prioritize', 'priority', 'based',
  'issue', 'issues', 'problem', 'problems'
]);

// Product synonym mappings
const PRODUCT_SYNONYMS = {
  tops: ['top', 'tops', 'shirt', 'shirts', 'blouse', 't-shirt', 'tee'],
  jeans: ['jean', 'jeans', 'pant', 'pants', 'trousers', 'denim'],
  dresses: ['dress', 'dresses', 'gown', 'frock'],
  jackets: ['jacket', 'jackets', 'coat', 'coats', 'blazer', 'outerwear'],
  shoes: ['shoe', 'shoes', 'footwear', 'sneakers', 'boots', 'sandals'],
  accessories: ['accessory', 'accessories', 'bag', 'bags', 'hat', 'belt', 'scarf', 'jewelry']
};

/**
 * Cleanly truncates text preserving sentence/word boundary without altering meaning.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function cleanTruncate(text, maxLength = 300) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLength - 50) {
    return slice.slice(0, lastSpace).trim() + '...';
  }
  return slice.trim() + '...';
}

/**
 * Extracts searchable keywords and detected fashion dimensions from natural language inquiry.
 * @param {string} question
 * @returns {{ keywords: string[], detectedAspects: string[], detectedProduct: string|null, detectedSentiment: string|null }}
 */
function extractQueryEntities(question) {
  if (!question || typeof question !== 'string') {
    return { keywords: [], detectedAspects: [], detectedProduct: null, detectedSentiment: null };
  }

  // Tokenize into lowercase alphanumeric words
  const tokens = question.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const keywords = [];
  const detectedAspects = new Set();
  let detectedProduct = null;
  let detectedSentiment = null;

  for (const token of tokens) {
    // Check product match
    if (!detectedProduct) {
      for (const [prodCategory, variations] of Object.entries(PRODUCT_SYNONYMS)) {
        if (variations.includes(token)) {
          detectedProduct = prodCategory;
          break;
        }
      }
    }

    // Check aspect match
    for (const [aspectName, triggerList] of Object.entries(ASPECT_KEYWORDS)) {
      if (triggerList.includes(token)) {
        detectedAspects.add(aspectName);
      }
    }

    // Check sentiment hints
    if (!detectedSentiment) {
      if (['complaint', 'complaints', 'negative', 'unhappy', 'bad', 'poor', 'worst', 'issue', 'issues', 'problem', 'problems'].includes(token)) {
        detectedSentiment = 'Negative';
      } else if (['praise', 'praised', 'positive', 'happy', 'love', 'loved', 'best', 'great', 'good', 'excellent'].includes(token)) {
        detectedSentiment = 'Positive';
      }
    }

    // Retain meaningful domain keywords
    if (!STOPWORDS.has(token)) {
      keywords.push(token);
    }
  }

  return {
    keywords: Array.from(new Set(keywords)),
    detectedAspects: Array.from(detectedAspects),
    detectedProduct,
    detectedSentiment
  };
}

/**
 * Builds the server-side MongoDB filter query.
 * Strictly enforces approved/published status and date precedence.
 *
 * @param {Object} params
 * @param {string} params.question
 * @param {Object} [params.filters]
 * @returns {{ query: Object, appliedFilters: Object, queryExplanation: string }}
 */
function buildRetrievalQuery({ question, filters = {} }) {
  // 1. Mandatory Baseline Eligibility Safeguards
  const query = {
    moderationStatus: { $in: ['published', 'approved'] },
    isSpam: { $ne: true }
  };

  const appliedFilters = {};
  const explanationParts = ['Publicly approved feedback only'];

  // 2. Extract natural language entities
  const nlpEntities = extractQueryEntities(question);

  // 3. Product Filter: explicit filter takes precedence
  const targetProduct = filters.product;
  if (targetProduct && targetProduct !== 'all') {
    const p = String(targetProduct).trim().toLowerCase();
    let pattern;
    if (PRODUCT_SYNONYMS[p]) {
      pattern = `^(${PRODUCT_SYNONYMS[p].join('|')})$`;
    } else if (p === 'tops' || p === 'shirts' || p === 'shirt' || p === 'top') {
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
      pattern = `^${escapeRegex(p)}$`;
    }
    query.product = { $regex: new RegExp(pattern, 'i') };
    appliedFilters.product = targetProduct;
    explanationParts.push(`Product category: "${targetProduct}"`);
  }

  // 4. Sentiment Filter: only apply when explicitly specified
  const targetSentiment = filters.sentiment;
  if (targetSentiment && targetSentiment !== 'all') {
    const validSentiments = ['Positive', 'Negative', 'Neutral', 'Mixed'];
    const matched = validSentiments.find(s => s.toLowerCase() === String(targetSentiment).toLowerCase().trim());
    if (matched) {
      query.sentiment = matched;
      appliedFilters.sentiment = matched;
      explanationParts.push(`Sentiment: ${matched}`);
    }
  }

  // 5. Star Rating Filter (1-5)
  if (filters.rating !== undefined && filters.rating !== null && filters.rating !== '' && filters.rating !== 'all') {
    const parsedRating = parseInt(filters.rating, 10);
    if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
      query.rating = parsedRating;
      appliedFilters.rating = parsedRating;
      explanationParts.push(`Rating: ${parsedRating} stars`);
    }
  }

  // 6. Aspect Filter: explicit filter takes precedence
  const targetAspect = filters.aspect;
  if (targetAspect && targetAspect !== 'all') {
    const safeAspect = escapeRegex(String(targetAspect).trim());
    query['aspects.name'] = { $regex: new RegExp(`^${safeAspect}$`, 'i') };
    appliedFilters.aspect = targetAspect;
    explanationParts.push(`Aspect: "${targetAspect}"`);
  }

  // 7. Date Filtering with Strict Precedence
  // Precedence Rule: Explicit dateFrom/dateTo (or startDate/endDate) takes precedence over relative dateRange (7/30/90).
  const explicitFrom = filters.dateFrom || filters.startDate;
  const explicitTo = filters.dateTo || filters.endDate;

  if (explicitFrom || explicitTo) {
    query.submittedAt = {};
    if (explicitFrom) {
      const dFrom = new Date(explicitFrom);
      if (isNaN(dFrom.getTime())) {
        const err = new Error('Invalid start date format. Must be a valid parseable date string.');
        err.code = 'INVALID_DATE_FROM';
        err.status = 400;
        throw err;
      }
      query.submittedAt.$gte = dFrom;
      appliedFilters.dateFrom = dFrom.toISOString();
    }
    if (explicitTo) {
      const dTo = new Date(explicitTo);
      if (isNaN(dTo.getTime())) {
        const err = new Error('Invalid end date format. Must be a valid parseable date string.');
        err.code = 'INVALID_DATE_TO';
        err.status = 400;
        throw err;
      }
      dTo.setHours(23, 59, 59, 999);
      query.submittedAt.$lte = dTo;
      appliedFilters.dateTo = dTo.toISOString();
    }

    if (query.submittedAt.$gte && query.submittedAt.$lte && query.submittedAt.$gte > query.submittedAt.$lte) {
      const err = new Error('Start date cannot be after end date.');
      err.code = 'INVALID_DATE_RANGE_ORDER';
      err.status = 400;
      throw err;
    }
    explanationParts.push(`Date range: explicit custom window`);
  } else if (filters.dateRange && filters.dateRange !== 'all') {
    const days = parseInt(filters.dateRange, 10);
    if (!isNaN(days) && days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      query.submittedAt = { $gte: cutoff };
      appliedFilters.dateRange = `${days}d`;
      explanationParts.push(`Date range: past ${days} days`);
    }
  }

  // 8. Keyword Matching on feedback text and detected aspects
  // Search meaningful keywords in feedback text OR matching aspect names
  if (nlpEntities.keywords.length > 0) {
    const orConditions = [];

    // Match keywords directly in feedback text
    for (const kw of nlpEntities.keywords.slice(0, 5)) {
      orConditions.push({ feedback: { $regex: new RegExp(escapeRegex(kw), 'i') } });
    }

    // If any keywords map to fashion aspects, also match on aspects.name
    if (!targetAspect && nlpEntities.detectedAspects.length > 0) {
      for (const asp of nlpEntities.detectedAspects) {
        orConditions.push({ 'aspects.name': { $regex: new RegExp(`^${escapeRegex(asp)}$`, 'i') } });
      }
    }

    if (orConditions.length === 1) {
      Object.assign(query, orConditions[0]);
    } else if (orConditions.length > 1) {
      query.$or = orConditions;
    }

    appliedFilters.keywords = nlpEntities.keywords.slice(0, 5);
    explanationParts.push(`Keywords: ${nlpEntities.keywords.slice(0, 5).join(', ')}`);
  }

  return {
    query,
    appliedFilters,
    queryExplanation: explanationParts.join('; ')
  };
}

/**
 * Retrieves relevant customer feedback records from MongoDB.
 * Formats evidence with strict bounds and server-generated reference identifiers.
 *
 * @param {Object} params
 * @param {string} params.question The administrator's inquiry
 * @param {Object} [params.filters] Optional structured filters
 * @param {Object} [params.options] Optional limits and bounds
 * @returns {Promise<Object>} Retrieval result
 */
async function retrieveRelevantFeedback({ question, filters = {}, options = {} }) {
  const maxReviews = Math.min(15, Math.max(1, parseInt(options.maxReviews || 8, 10)));
  const maxTotalChars = Math.min(5000, Math.max(500, parseInt(options.maxTotalChars || 3500, 10)));

  // 1. Build query
  const { query, appliedFilters, queryExplanation } = buildRetrievalQuery({ question, filters });

  // 2. Execute MongoDB query with projection limiting to necessary fields only
  // Exclude PII: email, name, imagePath, and internal spam metrics
  const rawDocs = await Feedback.find(query)
    .select('_id product rating feedback sentiment aspects submittedAt')
    .sort({ submittedAt: -1 }) // Most recent reviews first
    .limit(maxReviews * 2) // Fetch candidate buffer to apply total char bounds
    .lean()
    .exec();

  const totalMatched = await Feedback.countDocuments(query).exec();

  // 3. Assemble bounded evidence context
  const selectedRecords = [];
  let currentTotalChars = 0;

  for (let idx = 0; idx < rawDocs.length; idx++) {
    if (selectedRecords.length >= maxReviews) break;

    const doc = rawDocs[idx];
    const cleanText = cleanTruncate(doc.feedback || '', 350);
    const textLength = cleanText.length;

    if (currentTotalChars + textLength > maxTotalChars && selectedRecords.length >= 2) {
      // Reached safe token/char context cap while preserving at least 2 records
      break;
    }

    currentTotalChars += textLength;
    selectedRecords.push({
      _id: doc._id.toString(),
      refToken: `EVID-${idx + 1}`,
      product: doc.product || 'general',
      rating: doc.rating,
      sentiment: doc.sentiment,
      aspects: Array.isArray(doc.aspects) ? doc.aspects.map(a => `${a.name} (${a.sentiment})`) : [],
      feedbackText: cleanText,
      submittedAt: doc.submittedAt
    });
  }

  // 4. Honest Insufficient/Weak Evidence Assessment
  const isInsufficient = selectedRecords.length === 0;
  const isLimited = selectedRecords.length > 0 && selectedRecords.length <= 2;

  let evidenceStatusNote = '';
  if (isInsufficient) {
    evidenceStatusNote = 'No relevant approved feedback was found for this question and filter combination. Try broadening your search or changing the filters.';
  } else if (isLimited) {
    evidenceStatusNote = `Note: Only ${selectedRecords.length} matching review(s) found. Findings reflect a limited sample and should not be generalized to all customers.`;
  }

  return {
    records: selectedRecords,
    totalMatched,
    appliedFilters,
    queryExplanation,
    isInsufficient,
    isLimited,
    evidenceStatusNote,
    maxReviewsBounded: maxReviews
  };
}

module.exports = {
  retrieveRelevantFeedback,
  buildRetrievalQuery,
  extractQueryEntities,
  cleanTruncate,
  ASPECT_KEYWORDS,
  PRODUCT_SYNONYMS
};
