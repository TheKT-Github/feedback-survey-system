/**
 * Spam & Duplicate Feedback Detection Service
 * 
 * Provides automated rule-based moderation and anomaly detection for reviews:
 * 1. Text normalization & canonicalization
 * 2. Exact duplicate detection (same user + product + text)
 * 3. Jaccard similarity detection for near-duplicate submissions
 * 4. Promotional content & suspicious URL detection
 * 5. Repetitive characters, repeated words, and keyboard mash/gibberish detection
 * 6. Rapid submission rate anomaly detection
 * 
 * Standardized extension point for future machine learning spam classifiers.
 */

const Feedback = require('../models/Feedback');

// Configurable constants and thresholds
const SPAM_CONFIG = {
  SIMILARITY_THRESHOLD: 0.80,       // Jaccard similarity threshold for near-duplicates
  RAPID_WINDOW_MS: 60 * 1000,       // 60-second window for rapid submission check
  RAPID_COUNT_THRESHOLD: 2,         // Max submissions allowed within window before flagging
  MIN_WORD_COUNT_FOR_SIMILARITY: 3  // Only check Jaccard on reviews with 3+ words
};

// Promotional and advertising keywords
const PROMOTIONAL_PATTERNS = [
  /\bbuy\s+now\b/i,
  /\bclick\s+(?:here|this|below|link)\b/i,
  /\bvisit\s+(?:my|our)?\s*website\b/i,
  /\bfree\s+(?:discount|gift|money|cash|voucher|promo)\b/i,
  /\bpromo\s*code\b/i,
  /\bearn\s+(?:money|\$|₹|extra\s+cash)\b/i,
  /\b(?:whatsapp|telegram)\s+(?:me|us|number|group)?\b/i,
  /\bcall\s+now\b/i,
  /\bcheck\s+out\s+my\s+(?:channel|bio|link|profile|page)\b/i,
  /\b(?:crypto|bitcoin|forex|casino|viagra|follow\s+for\s+follow)\b/i
];

// Suspicious URL detection patterns
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9.-]+\.(?:com|net|org|xyz|ru|top|biz|info|click|link|io)\b(?:\/[^\s]*)?/i;

// Common keyboard mash patterns
const KEYBOARD_MASH_PATTERNS = [
  /asdfgh/i,
  /qwerty/i,
  /zxcvbn/i,
  /[bcdfghjklmnpqrstvwxyz]{7,}/i // 7+ consonants in a row without vowels
];

/**
 * Normalizes text for comparison by lowercasing, stripping punctuation,
 * collapsing 3+ repeated characters, and trimming extra spaces.
 * 
 * Example:
 * "The fitting is AMAZING!!!" -> "the fitting is amazing"
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    // Collapse 3 or more repeated characters to 1 (e.g., 'sooooo' -> 'so', 'amazingggg' -> 'amazing')
    .replace(/(.)\1{2,}/g, '$1')
    // Remove punctuation except alphanumeric and spaces
    .replace(/[^a-z0-9\s]/g, ' ')
    // Normalize multiple spaces into a single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes normalized text into a Set of unique words.
 */
function getTokens(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  return new Set(norm.split(/\s+/).filter(Boolean));
}

/**
 * Computes Jaccard similarity coefficient between two texts (0.0 to 1.0).
 */
function computeJaccardSimilarity(textA, textB) {
  const tokensA = getTokens(textA);
  const tokensB = getTokens(textB);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

/**
 * Checks for excessive character repetition, word repetition, and gibberish.
 */
function checkRepetitiveOrLowQuality(text) {
  const reasons = [];
  let score = 0;

  if (!text || typeof text !== 'string') return { score, reasons };

  const raw = text.trim();

  // 1. Excessive repeated identical characters (5+ consecutive chars: e.g. "aaaaaaa", "!!!!!!!!", "11111111")
  if (/(.)\1{4,}/.test(raw)) {
    reasons.push('Excessive character repetition');
    score += 0.55;
  }

  // 2. Excessive single word repetition (e.g. "good good good good good good")
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const frequency = {};
    for (const w of words) {
      frequency[w] = (frequency[w] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(frequency));
    if (maxFreq / words.length >= 0.65) {
      reasons.push('Excessive word repetition');
      score += 0.50;
    }
  }

  // 3. Keyboard mash / nonsense sequences (e.g. "asdfghjkl", "qwertyuiop")
  for (const pattern of KEYBOARD_MASH_PATTERNS) {
    if (pattern.test(raw)) {
      reasons.push('Gibberish or keyboard mash pattern detected');
      score += 0.55;
      break;
    }
  }

  return { score, reasons };
}

/**
 * Checks for promotional phrases and suspicious external URLs.
 */
function checkPromotionalAndUrls(text) {
  const reasons = [];
  let score = 0;

  if (!text || typeof text !== 'string') return { score, reasons };

  // 1. Check for external URLs or website links
  if (URL_PATTERN.test(text)) {
    reasons.push('Contains suspicious external link or URL');
    score += 0.65;
  }

  // 2. Check for promotional/advertising language
  for (const pattern of PROMOTIONAL_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('Contains promotional or advertising phrases');
      score += 0.50;
      break;
    }
  }

  return { score, reasons };
}

/**
 * Analyzes incoming feedback against rules and database history.
 * 
 * @param {object} params
 * @param {string} [params.email] - User's email
 * @param {string} [params.name] - User's name
 * @param {string} [params.product] - Product name or category
 * @param {string} params.comment - Review text content
 * @param {number} [params.rating] - Star rating
 * @returns {Promise<{ isSpam: boolean, spamScore: number, spamReasons: string[] }>}
 */
async function analyzeFeedback({ email, name, product, comment, rating }) {
  const reasons = [];
  let totalScore = 0;

  const rawComment = comment || '';
  const normalizedComment = normalizeText(rawComment);

  // 1. Content check: Promotional language & external links
  const promoCheck = checkPromotionalAndUrls(rawComment);
  if (promoCheck.reasons.length > 0) {
    reasons.push(...promoCheck.reasons);
    totalScore += promoCheck.score;
  }

  // 2. Content check: Repetitive characters, words, gibberish
  const qualityCheck = checkRepetitiveOrLowQuality(rawComment);
  if (qualityCheck.reasons.length > 0) {
    reasons.push(...qualityCheck.reasons);
    totalScore += qualityCheck.score;
  }

  // 3. Database history checks (Duplicates, Similarity, Rapid Submissions)
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanProduct = product ? product.trim().toLowerCase() : 'general';

  // Only query DB if user identifier (email or name) is provided
  if (cleanEmail || (name && name !== 'Anonymous')) {
    const userQuery = cleanEmail
      ? { email: cleanEmail }
      : { name: name.trim() };

    try {
      // Find recent feedback submitted by this user (up to last 30 reviews)
      const userFeedbacks = await Feedback.find(userQuery)
        .sort({ submittedAt: -1 })
        .limit(30)
        .lean();

      if (userFeedbacks && userFeedbacks.length > 0) {
        // A. Rapid submission check: Multiple feedbacks within 60 seconds
        const now = Date.now();
        const recentSubmissions = userFeedbacks.filter(fb => {
          const submittedTime = new Date(fb.submittedAt).getTime();
          return now - submittedTime <= SPAM_CONFIG.RAPID_WINDOW_MS;
        });

        if (recentSubmissions.length >= SPAM_CONFIG.RAPID_COUNT_THRESHOLD) {
          reasons.push('Multiple submissions in a short period (rapid submission detected)');
          totalScore += 0.50;
        }

        // B. Exact duplicate & Similarity checks (same user + same product)
        for (const prev of userFeedbacks) {
          const prevProduct = (prev.product || 'general').trim().toLowerCase();
          if (prevProduct === cleanProduct) {
            const prevNormalized = normalizeText(prev.feedback || '');

            // Exact duplicate check
            if (prevNormalized === normalizedComment && normalizedComment.length > 0) {
              reasons.push('Duplicate feedback: Identical review previously submitted for this product');
              totalScore += 0.85;
              break; // No need to continue checking similarity if exact duplicate
            }

            // High similarity check (near-duplicate)
            const wordsCount = normalizedComment.split(/\s+/).filter(Boolean).length;
            if (wordsCount >= SPAM_CONFIG.MIN_WORD_COUNT_FOR_SIMILARITY) {
              const similarity = computeJaccardSimilarity(normalizedComment, prevNormalized);
              if (similarity >= SPAM_CONFIG.SIMILARITY_THRESHOLD) {
                reasons.push(`Highly similar feedback previously submitted for this product (${Math.round(similarity * 100)}% match)`);
                totalScore += 0.70;
                break;
              }
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn('⚠️ Warning: Could not perform DB duplicate check in spamService:', dbErr.message);
    }
  }

  // Deduplicate any repeated reasons
  const uniqueReasons = Array.from(new Set(reasons));

  // Clamp spam score between 0.00 and 1.00
  const normalizedSpamScore = Math.round(Math.min(1.0, Math.max(0.0, totalScore)) * 100) / 100;

  // Determine isSpam boolean flag (threshold: 0.50)
  const isSpam = normalizedSpamScore >= 0.50 || uniqueReasons.length > 0;

  return {
    isSpam,
    spamScore: normalizedSpamScore,
    spamReasons: isSpam ? uniqueReasons : []
  };
}

module.exports = {
  analyzeFeedback,
  normalizeText,
  computeJaccardSimilarity,
  checkRepetitiveOrLowQuality,
  checkPromotionalAndUrls,
  SPAM_CONFIG
};
