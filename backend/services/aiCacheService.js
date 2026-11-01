/**
 * AI Cache Service — Style Feedback Intelligence AI
 *
 * Provides:
 * 1. In-memory TTL cache for AI endpoint responses.
 * 2. In-flight request deduplication (promise sharing) to prevent Gemini quota storms.
 * 3. Demo Mode: pre-seeded, deterministic, high-quality responses grounded in real
 *    seed-data product names. Demo mode is NEVER active when NODE_ENV === 'production'.
 *
 * Cache keys are built from a deterministic hash of (endpoint + query + filters + model + dataVersion).
 * dataVersion is incremented by invalidateCache(), which is called after every new feedback submission.
 * Error responses are NEVER cached.
 *
 * Environment variables:
 *   AI_CACHE_TTL_MS   — Cache entry time-to-live in milliseconds (default: 900000 = 15 min)
 *   AI_DEMO_MODE      — Set to 'true' to enable demo mode (never active in NODE_ENV=production)
 */

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
const cache = new Map();        // cacheKey → { data, expiresAt }
const inFlight = new Map();     // cacheKey → Promise

let dataVersion = 1;            // Bumped by invalidateCache() on each feedback submission

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function getCacheTtlMs() {
  const raw = parseInt(process.env.AI_CACHE_TTL_MS || '', 10);
  return (!isNaN(raw) && raw > 0) ? raw : 900000; // 15 minutes default
}

// ---------------------------------------------------------------------------
// Demo Mode Guard
// ---------------------------------------------------------------------------
/**
 * Returns true only when AI_DEMO_MODE=true AND NODE_ENV !== 'production'.
 * Production always uses live Gemini calls.
 */
function isDemoModeActive() {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.AI_DEMO_MODE === 'true';
}

// ---------------------------------------------------------------------------
// Cache Key
// ---------------------------------------------------------------------------
/**
 * Generates a deterministic SHA-256 cache key.
 * @param {{ endpoint: string, queryOrProducts: string|string[], filters?: Object, model?: string }} params
 * @returns {string} hex digest
 */
function getCacheKey({ endpoint, queryOrProducts, filters, model }) {
  const normalized = JSON.stringify({
    endpoint: String(endpoint || ''),
    q: queryOrProducts,
    f: filters || null,
    m: model || process.env.LLM_MODEL || 'gemini',
    v: dataVersion
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ---------------------------------------------------------------------------
// Cache Operations
// ---------------------------------------------------------------------------
/**
 * Retrieves a non-expired cache entry. Returns null if missing or expired.
 * @param {string} key
 * @returns {{ data: Object, isCached: true } | null}
 */
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { data: entry.data, isCached: true };
}

/**
 * Stores a successful response in cache. Error objects must NOT be cached.
 * @param {string} key
 * @param {Object} data
 */
function cacheSet(key, data) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + getCacheTtlMs()
  });
}

/**
 * Increments the data version and clears all cached AI responses.
 * Call this after every feedback submission so AI insights reflect new data.
 */
function invalidateCache() {
  dataVersion++;
  cache.clear();
  // Do NOT clear inFlight — in-progress requests are still valid
}

// ---------------------------------------------------------------------------
// In-Flight Deduplication
// ---------------------------------------------------------------------------
/**
 * Wraps an async factory in deduplication: concurrent identical requests share
 * a single in-flight Promise instead of each firing a separate Gemini call.
 *
 * @param {string} key Cache key (used as dedup key)
 * @param {() => Promise<Object>} factory Async function that produces the result
 * @returns {Promise<Object>}
 */
async function deduplicate(key, factory) {
  // Return shared in-flight promise if one exists
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = factory().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Demo Mode Responses
// ---------------------------------------------------------------------------
/**
 * Returns a deterministic, high-quality demo response for the given endpoint.
 * Responses are grounded in the real seed product taxonomy (tops, jeans, dress, jacket, all).
 * Always includes source: 'demo', isDemo: true, demoNotice.
 *
 * @param {'ask'|'compare-products'|'recommendations'} endpoint
 * @param {{ question?: string, products?: string[], product?: string, focusArea?: string }} params
 * @returns {Object} Demo response payload
 */
function getDemoResponse(endpoint, params = {}) {
  const DEMO_NOTICE = 'Sample AI insights (Demo Mode active — not a live Gemini call)';

  if (endpoint === 'ask') {
    const question = params.question || 'customer feedback';
    return {
      answer: `Based on a representative sample of customer reviews, we can observe several key trends relating to "${question}". Jeans consistently receive the highest volume of feedback, with sizing accuracy being the primary concern. Tops perform strongly on comfort, while dresses receive praise for quality but some criticism regarding fit variety. Jackets are noted for excellent durability but occasionally cited for zipper reliability concerns.`,
      keyFindings: [
        {
          finding: 'Jeans: Sizing inconsistency is the top complaint across regular and slim fits.',
          evidenceIds: ['EVID-1', 'EVID-2']
        },
        {
          finding: 'Tops: Comfort and fabric breathability are consistently praised by customers.',
          evidenceIds: ['EVID-3']
        },
        {
          finding: 'Dresses: Customers appreciate construction quality but request more inclusive sizing options.',
          evidenceIds: ['EVID-4', 'EVID-5']
        },
        {
          finding: 'Jackets: Durability rated highly, but zipper reliability flagged in 18% of reviews.',
          evidenceIds: ['EVID-6']
        }
      ],
      recommendations: [
        'Introduce half-size variants for jeans to address the most frequently cited fit complaint.',
        'Expand dress size range to at least size 22 to close the identified gap.',
        'Source premium YKK zippers for jacket product line to reduce hardware-related complaints.',
        'Leverage tops\' comfort reputation in marketing campaigns for peak summer season.'
      ],
      evidence: [
        { id: 'demo-1', refToken: 'EVID-1', product: 'jeans', rating: 3, sentiment: 'Negative', excerpt: 'The sizing on these jeans is way off — I usually wear a 32 but had to return for a 34.' },
        { id: 'demo-2', refToken: 'EVID-2', product: 'jeans', rating: 4, sentiment: 'Mixed', excerpt: 'Love the style but the waistband runs small. Great material though.' },
        { id: 'demo-3', refToken: 'EVID-3', product: 'tops', rating: 5, sentiment: 'Positive', excerpt: 'Super comfortable fabric, I bought three colours. Perfect for everyday wear.' },
        { id: 'demo-4', refToken: 'EVID-4', product: 'dress', rating: 4, sentiment: 'Positive', excerpt: 'Really well made dress. Wish they had larger sizes — stopped at 18.' },
        { id: 'demo-5', refToken: 'EVID-5', product: 'dress', rating: 3, sentiment: 'Neutral', excerpt: 'Nice design but the fit around the hips is awkward. Quality seems good.' },
        { id: 'demo-6', refToken: 'EVID-6', product: 'jacket', rating: 3, sentiment: 'Negative', excerpt: 'Jacket is warm and well insulated. The zipper broke after 2 months though.' }
      ],
      retrievedReviewCount: 6,
      totalMatchedInDb: 6,
      appliedFilters: null,
      insufficientEvidence: false,
      isLimitedEvidence: false,
      evidenceNote: null,
      queryExplanation: 'Demo mode: sample representative evidence from product taxonomy.',
      fabricatedCitationsDropped: 0,
      provider: 'demo',
      model: 'demo-mode',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      source: 'demo',
      isDemo: true,
      demoNotice: DEMO_NOTICE
    };
  }

  if (endpoint === 'compare-products') {
    const products = Array.isArray(params.products) ? params.products : ['jeans', 'dress'];
    const measuredStats = {};
    const productSummaries = [];

    const SEED_STATS = {
      jeans:  { totalFeedback: 42, averageRating: 3.8, positivePercent: 55, negativePercent: 28, topAspects: [{ aspect: 'fitting', positivePercent: 42 }, { aspect: 'quality', positivePercent: 68 }] },
      dress:  { totalFeedback: 31, averageRating: 4.1, positivePercent: 67, negativePercent: 18, topAspects: [{ aspect: 'design', positivePercent: 78 }, { aspect: 'fitting', positivePercent: 55 }] },
      tops:   { totalFeedback: 38, averageRating: 4.4, positivePercent: 74, negativePercent: 12, topAspects: [{ aspect: 'comfort', positivePercent: 81 }, { aspect: 'material', positivePercent: 73 }] },
      jacket: { totalFeedback: 26, averageRating: 3.9, positivePercent: 60, negativePercent: 22, topAspects: [{ aspect: 'durability', positivePercent: 72 }, { aspect: 'hardware', positivePercent: 38 }] }
    };

    const SEED_SUMMARIES = {
      jeans:  { commonComplaints: ['Inconsistent waist sizing', 'Slim fit too tight around thighs'], positiveThemes: ['Denim quality well-regarded', 'Wide style variety praised'] },
      dress:  { commonComplaints: ['Limited size range stops at 18', 'Hip fit can be awkward'], positiveThemes: ['Construction quality praised', 'Design aesthetics highly rated'] },
      tops:   { commonComplaints: ['Some colour fading after washing', 'Occasional seam stitching issues'], positiveThemes: ['Exceptional comfort', 'Breathable fabric widely praised'] },
      jacket: { commonComplaints: ['Zipper reliability issues (18% reports)', 'Button attachment sometimes loose'], positiveThemes: ['Excellent thermal insulation', 'Durable shell material'] }
    };

    for (const p of products) {
      measuredStats[p] = SEED_STATS[p] || { totalFeedback: 10, averageRating: 3.5, positivePercent: 50, negativePercent: 25, topAspects: [] };
      const s = SEED_SUMMARIES[p] || { commonComplaints: ['Some fit concerns noted'], positiveThemes: ['Generally positive reception'] };
      productSummaries.push({ product: p, commonComplaints: s.commonComplaints, positiveThemes: s.positiveThemes, evidenceIds: ['EVID-1', 'EVID-2'] });
    }

    return {
      measuredStatistics: measuredStats,
      aiSynthesis: {
        summary: `Comparative analysis across ${products.join(', ')}: Tops show the strongest customer satisfaction (74% positive), while jeans require sizing attention. Dresses lead in design perception. Jackets score well on durability but hardware reliability needs improvement.`,
        productSummaries,
        comparativeDifferences: [
          { dimension: 'Fitting / Sizing', observation: 'Jeans have the highest sizing complaint rate. Dresses face size range limitation. Tops and jackets receive fewer fit-related complaints.', evidenceIds: ['EVID-1', 'EVID-3'] },
          { dimension: 'Quality & Durability', observation: 'Jackets and tops rate highest on material durability. Jeans score well on fabric but mid-range on construction finish.', evidenceIds: ['EVID-2', 'EVID-4'] }
        ],
        strategicTakeaways: [
          'Prioritise jeans sizing overhaul for fastest satisfaction uplift.',
          'Expand dress size range to capture underserved customer segment.',
          'Promote tops\' comfort advantage in digital marketing campaigns.',
          'Address jacket zipper sourcing before the winter product season.'
        ],
        insufficientEvidence: false
      },
      evidence: [
        { id: 'demo-1', refToken: 'EVID-1', product: products[0], rating: 3, sentiment: 'Negative', excerpt: 'Sample customer review for demo purposes — not a live Gemini response.' },
        { id: 'demo-2', refToken: 'EVID-2', product: products[1] || products[0], rating: 4, sentiment: 'Positive', excerpt: 'Sample customer review for demo purposes — not a live Gemini response.' },
        { id: 'demo-3', refToken: 'EVID-3', product: products[0], rating: 5, sentiment: 'Positive', excerpt: 'Demo review: product quality praised. For a real call remove AI_DEMO_MODE.' },
        { id: 'demo-4', refToken: 'EVID-4', product: products[1] || products[0], rating: 3, sentiment: 'Neutral', excerpt: 'Demo review: minor fit concern noted. For live data disable AI_DEMO_MODE.' }
      ],
      totalRetrievedReviews: 4,
      fabricatedCitationsDropped: 0,
      insufficientEvidence: false,
      disclaimer: `${DEMO_NOTICE}. Measured statistics are sample values.`,
      provider: 'demo',
      model: 'demo-mode',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      source: 'demo',
      isDemo: true,
      demoNotice: DEMO_NOTICE
    };
  }

  if (endpoint === 'recommendations') {
    const product = params.product || 'all';
    const focusArea = params.focusArea || 'all';
    return {
      summary: `Strategic recommendations for product="${product}", focus="${focusArea}". Based on representative customer feedback samples, the following priority actions are identified to improve customer satisfaction and reduce return rates.`,
      prioritizedRecommendations: [
        {
          priority: 'High',
          category: 'Fitting/Sizing',
          title: 'Standardise Sizing Charts Across All Product Lines',
          action: 'Conduct a sizing audit comparing labelled vs. measured dimensions for all SKUs and publish corrected sizing guides on product pages.',
          expectedImpact: 'Potential reduction in sizing-related returns and negative reviews; improved first-purchase satisfaction.',
          evidenceIds: ['EVID-1', 'EVID-2']
        },
        {
          priority: 'High',
          category: 'Quality & Durability',
          title: 'Source Premium Hardware for Jackets',
          action: 'Replace current zipper suppliers with certified YKK or equivalent hardware. Implement 100-cycle stress test before production approval.',
          expectedImpact: 'Expected reduction in hardware-related complaints and warranty claims.',
          evidenceIds: ['EVID-3']
        },
        {
          priority: 'Medium',
          category: 'Customer Experience',
          title: 'Expand Inclusive Sizing for Dresses',
          action: 'Extend dress size range from current maximum (size 18) to at least size 26 for the upcoming season.',
          expectedImpact: 'Access to underserved market segment; potential uplift in repeat purchases among new size range customers.',
          evidenceIds: ['EVID-4']
        },
        {
          priority: 'Low',
          category: 'Material & Fabric',
          title: 'Improve Colour Fastness Testing for Tops',
          action: 'Require ISO 105-C06 wash fastness certification for all tops fabrics before production approval.',
          expectedImpact: 'Reduction in colour-fading complaints; improved perceived quality longevity.',
          evidenceIds: []
        }
      ],
      evidence: [
        { id: 'demo-1', refToken: 'EVID-1', product: 'jeans', rating: 2, sentiment: 'Negative', excerpt: 'Sizing is completely wrong — had to exchange twice. Very frustrating process.' },
        { id: 'demo-2', refToken: 'EVID-2', product: 'dress', rating: 3, sentiment: 'Neutral', excerpt: 'Nice product but size 18 is the largest available — this needs to change.' },
        { id: 'demo-3', refToken: 'EVID-3', product: 'jacket', rating: 2, sentiment: 'Negative', excerpt: 'Loved the jacket until the zipper failed after 6 weeks of light use.' },
        { id: 'demo-4', refToken: 'EVID-4', product: 'dress', rating: 4, sentiment: 'Mixed', excerpt: 'Beautiful design. Wish the size range was bigger — I couldn\'t find my size.' }
      ],
      retrievedReviewCount: 4,
      fabricatedCitationsDropped: 0,
      insufficientEvidence: false,
      disclaimer: `${DEMO_NOTICE}. Always validate recommendations with production and QC teams.`,
      provider: 'demo',
      model: 'demo-mode',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      source: 'demo',
      isDemo: true,
      demoNotice: DEMO_NOTICE
    };
  }

  // Fallback
  return { source: 'demo', isDemo: true, demoNotice: DEMO_NOTICE, data: null };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  isDemoModeActive,
  getCacheKey,
  cacheGet,
  cacheSet,
  invalidateCache,
  deduplicate,
  getDemoResponse
};
