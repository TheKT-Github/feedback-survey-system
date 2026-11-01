/**
 * Fashion Feedback Intelligence & NLP Service (Enhanced)
 * 
 * Provides rule- and lexicon-based sentiment analysis and aspect extraction
 * tailored specifically for apparel, accessories, and fashion reviews.
 * 
 * ARCHITECTURAL NOTE / EXTENSION POINT:
 * This service currently implements an efficient, zero-latency rule/lexicon engine.
 * It is intentionally designed with a standardized interface (`analyzeFeedback(text, rating)`)
 * so that a fine-tuned transformer/LLM or external AI model can be plugged in seamlessly
 * without requiring changes to any caller or database consumers.
 * 
 * SARCASM LIMITATION:
 * Note that rule-based lexicon systems cannot reliably detect subtle sarcasm
 * (e.g., "Oh great, it ripped on the first wear"). Handling deep irony and sarcasm
 * requires contextual transformer embeddings (planned for future ML integration).
 */

// 1. Fashion Aspect Definitions with Keyword & Variation Triggers
const ASPECT_DEFINITIONS = {
  Fitting: {
    name: 'Fitting',
    keywords: [
      'fitting', 'fit', 'fits', 'fitted', 'snug', 'tight', 'loose', 'baggy',
      'comfortable', 'comfort', 'uncomfortable', 'stretch', 'stretchy',
      'waistline', 'elastic', 'chafing', 'body fit', 'doesn\'t fit', 'doesnt fit',
      'does not fit', 'fits well', 'perfect fit', 'bad fit', 'poor fit',
      'poor fitting', 'bad fitting'
    ]
  },
  Quality: {
    name: 'Quality',
    keywords: [
      'quality', 'durable', 'durability', 'stitching', 'stitch', 'stitched',
      'stitches', 'craftsmanship', 'tear', 'torn', 'ripped', 'flimsy',
      'finish', 'finishing', 'damaged', 'defect', 'defective', 'cheaply made',
      'poor quality', 'bad quality', 'high quality', 'premium quality',
      'great quality', 'good quality', 'excellent quality', 'excellent',
      'premium', 'standard'
    ]
  },
  Design: {
    name: 'Design',
    keywords: [
      'design', 'designed', 'designs', 'designing', 'style', 'stylish',
      'look', 'looks', 'looking', 'pattern', 'patterns', 'trend', 'trendy',
      'cut', 'chic', 'elegant', 'modern', 'fashionable', 'classy', 'print',
      'prints', 'aesthetic', 'appearance', 'outfit', 'silhouette'
    ]
  },
  Color: {
    name: 'Color',
    keywords: [
      'color', 'colors', 'colour', 'colours', 'shade', 'shades', 'hue',
      'vibrant', 'bright', 'fade', 'faded', 'fading', 'fades', 'bleeding',
      'bleed', 'washed out', 'dull', 'tint', 'contrast', 'discolored',
      'true to picture'
    ]
  },
  Size: {
    name: 'Size',
    keywords: [
      'size', 'sizes', 'sizing', 'small', 'smaller', 'large', 'larger',
      'length', 'short', 'long', 'oversized', 'undersized', 'too small',
      'too large', 'too big', 'too short', 'too long', 'true to size',
      'runs small', 'runs large', 'run small', 'run large', 'waist',
      'chest', 'measurements'
    ]
  },
  Material: {
    name: 'Material',
    keywords: [
      'material', 'materials', 'fabric', 'fabrics', 'cloth', 'cotton',
      'polyester', 'silk', 'linen', 'denim', 'wool', 'soft', 'softness',
      'rough', 'scratchy', 'breathable', 'breathability', 'texture',
      'thick', 'thickness', 'thin', 'heavy', 'lightweight', 'stiff',
      'synthetic', 'pure cotton'
    ]
  },
  Price: {
    name: 'Price',
    keywords: [
      'price', 'prices', 'pricing', 'cost', 'costly', 'value', 'worth',
      'expensive', 'overpriced', 'affordable', 'inexpensive', 'money',
      'bargain', 'economical', 'budget', 'worth it', 'not worth it',
      'not worth the price', 'waste of money', 'value for money',
      'worth the price', 'pricey', 'cheap price'
    ]
  }
};

// 2. High-Priority Multi-Word Phrases with Explicit Sentiment Weights
// Evaluated from longest to shortest before single-word lookups
const PHRASE_LEXICON = [
  // Strong Positive Phrases (+1.8 to +2.0)
  { phrase: 'not worth the price', score: -2.0, aspect: 'Price' },
  { phrase: 'never buying again', score: -2.0 },
  { phrase: 'never buy again', score: -2.0 },
  { phrase: 'waste of money', score: -2.0, aspect: 'Price' },
  { phrase: 'worth every penny', score: 2.0, aspect: 'Price' },
  { phrase: 'value for money', score: 2.0, aspect: 'Price' },
  { phrase: 'worth the price', score: 1.8, aspect: 'Price' },
  { phrase: 'fits perfectly', score: 2.0, aspect: 'Fitting' },
  { phrase: 'perfect fit', score: 2.0, aspect: 'Fitting' },
  { phrase: 'high quality', score: 2.0, aspect: 'Quality' },
  { phrase: 'premium quality', score: 2.0, aspect: 'Quality' },
  { phrase: 'great quality', score: 1.8, aspect: 'Quality' },
  { phrase: 'excellent quality', score: 2.0, aspect: 'Quality' },
  { phrase: 'true to size', score: 1.8, aspect: 'Size' },
  { phrase: 'extremely comfortable', score: 2.0, aspect: 'Fitting' },
  { phrase: 'very comfortable', score: 1.8, aspect: 'Fitting' },
  { phrase: 'looks amazing', score: 2.0, aspect: 'Design' },
  { phrase: 'looks great', score: 1.8, aspect: 'Design' },
  { phrase: 'looks beautiful', score: 1.8, aspect: 'Design' },

  // Negation Phrases (Handling "not bad", "not good", etc.)
  { phrase: 'not bad at all', score: 1.2 },
  { phrase: 'not bad', score: 1.0 },
  { phrase: 'not expensive', score: 1.0, aspect: 'Price' },
  { phrase: 'not tight', score: 0.8, aspect: 'Fitting' },
  { phrase: 'not rough', score: 1.0, aspect: 'Material' },
  { phrase: 'not worth it', score: -2.0, aspect: 'Price' },
  { phrase: 'not comfortable', score: -1.8, aspect: 'Fitting' },
  { phrase: 'does not fit', score: -1.8, aspect: 'Fitting' },
  { phrase: 'doesn\'t fit', score: -1.8, aspect: 'Fitting' },
  { phrase: 'doesnt fit', score: -1.8, aspect: 'Fitting' },
  { phrase: 'not good quality', score: -1.8, aspect: 'Quality' },
  { phrase: 'not good', score: -1.5 },
  { phrase: 'not durable', score: -1.5, aspect: 'Quality' },
  { phrase: 'not soft', score: -1.2, aspect: 'Material' },
  { phrase: 'not satisfied', score: -1.6 },

  // Moderate Positive Phrases (+1.0 to +1.5)
  { phrase: 'good quality', score: 1.5, aspect: 'Quality' },
  { phrase: 'fits well', score: 1.4, aspect: 'Fitting' },
  { phrase: 'well made', score: 1.5, aspect: 'Quality' },

  // Strong Negative Phrases (-1.8 to -2.0)
  { phrase: 'poor quality', score: -2.0, aspect: 'Quality' },
  { phrase: 'bad quality', score: -2.0, aspect: 'Quality' },
  { phrase: 'terrible quality', score: -2.0, aspect: 'Quality' },
  { phrase: 'cheaply made', score: -1.8, aspect: 'Quality' },
  { phrase: 'poor fitting', score: -1.8, aspect: 'Fitting' },
  { phrase: 'bad fitting', score: -1.8, aspect: 'Fitting' },
  { phrase: 'too expensive', score: -1.8, aspect: 'Price' },
  { phrase: 'extremely uncomfortable', score: -2.0, aspect: 'Fitting' },

  // Size/Fit Negative Phrases (-1.4 to -1.6)
  { phrase: 'too tight', score: -1.5, aspect: 'Fitting' },
  { phrase: 'too loose', score: -1.4, aspect: 'Fitting' },
  { phrase: 'too small', score: -1.5, aspect: 'Size' },
  { phrase: 'too large', score: -1.5, aspect: 'Size' },
  { phrase: 'too big', score: -1.4, aspect: 'Size' },
  { phrase: 'too short', score: -1.4, aspect: 'Size' },
  { phrase: 'too long', score: -1.4, aspect: 'Size' },
  { phrase: 'runs small', score: -1.4, aspect: 'Size' },
  { phrase: 'runs large', score: -1.4, aspect: 'Size' },
  { phrase: 'run small', score: -1.4, aspect: 'Size' },
  { phrase: 'run large', score: -1.4, aspect: 'Size' },
  { phrase: 'cheap material', score: -1.6, aspect: 'Material' },
  { phrase: 'color faded', score: -1.5, aspect: 'Color' },
  { phrase: 'fades quickly', score: -1.6, aspect: 'Color' }
];

// Sort phrases longest first so longer subphrases match before shorter ones
PHRASE_LEXICON.sort((a, b) => b.phrase.length - a.phrase.length);

// 3. Single-Word Sentiment Lexicon
const WORD_LEXICON = {
  // Strong Positive (+2.0)
  love: 2.0, loved: 2.0, loving: 2.0,
  amazing: 2.0, excellent: 2.0, fantastic: 2.0,
  outstanding: 2.0, flawless: 2.0, perfect: 2.0,
  superb: 2.0, gorgeous: 2.0, awesome: 2.0,
  stunning: 2.0, fabulous: 1.8, wonderful: 1.8, wonderfully: 1.8,

  // Moderate Positive (+1.0 to +1.5)
  beautiful: 1.5, comfortable: 1.5, comfort: 1.2,
  premium: 1.5, stylish: 1.3, trendy: 1.2,
  elegant: 1.4, durable: 1.4, affordable: 1.3,
  soft: 1.3, good: 1.0, great: 1.4,
  nice: 1.0, pretty: 1.0, happy: 1.3,
  pleased: 1.3, chic: 1.2, classy: 1.3,
  neat: 1.0, breathable: 1.2, finest: 1.5,
  vibrant: 1.2, worth: 1.1, liked: 1.0,
  like: 1.0, flattering: 1.4, lovely: 1.5, attractive: 1.4,

  // Neutral Terms (0.0)
  okay: 0.0, ok: 0.0, average: 0.0,
  normal: 0.0, ordinary: 0.0, fine: 0.2,
  fair: 0.0, acceptable: 0.1, decent: 0.4,
  moderate: 0.0, expected: 0.0,

  // Moderate Negative (-1.0 to -1.5)
  poor: -1.5, bad: -1.5, cheap: -1.3,
  tight: -1.2, loose: -1.1, uncomfortable: -1.5,
  rough: -1.3, expensive: -1.4, overpriced: -1.5,
  damaged: -1.8, torn: -1.8, faded: -1.4,
  small: -0.9, large: -0.8, disappointed: -1.6,
  disappointing: -1.5, scratchy: -1.3, flimsy: -1.4,
  stiff: -1.1, dull: -1.0, defective: -1.8,
  pricey: -1.2, bleed: -1.4, ripped: -1.8,
  frayed: -1.4, shrunk: -1.5, shrink: -1.5,

  // Strong Negative (-2.0)
  worst: -2.0, terrible: -2.0, horrible: -2.0,
  awful: -2.0, waste: -2.0, hate: -2.0,
  hated: -2.0, useless: -2.0, pathetic: -2.0
};

// 4. Negation tokens that invert word sentiment
const NEGATION_WORDS = new Set([
  'not', 'never', 'no', 'without', 'hardly', 'barely',
  'isn\'t', 'isnt', 'aren\'t', 'arent', 'wasn\'t', 'wasnt',
  'don\'t', 'dont', 'doesn\'t', 'doesnt', 'didn\'t', 'didnt',
  'cannot', 'can\'t', 'cant'
]);

// 5. Lightweight Word Normalization / Stemming Map
const STEM_DICTIONARY = {
  fitting: 'fit', fits: 'fit', fitted: 'fit',
  stitching: 'stitch', stitched: 'stitch', stitches: 'stitch',
  designed: 'design', designing: 'design', designs: 'design',
  stylish: 'style', styling: 'style', styled: 'style', styles: 'style',
  comfortable: 'comfort', comforts: 'comfort', uncomfortable: 'uncomfortable',
  beautiful: 'beauty', beauties: 'beauty',
  colors: 'color', colours: 'color', colour: 'color',
  sizes: 'size', sizing: 'size', sized: 'size',
  fabrics: 'fabric', materials: 'material',
  prices: 'price', pricing: 'price', priced: 'price',
  expensive: 'expensive', overpriced: 'overpriced',
  faded: 'fade', fading: 'fade', fades: 'fade',
  damaged: 'damage', damages: 'damage',
  disappointed: 'disappoint', disappointing: 'disappoint'
};

/**
 * Normalizes a word for consistent lexicon and aspect matching.
 */
function normalizeWord(word) {
  if (!word) return '';
  const clean = word.toLowerCase().trim();
  return STEM_DICTIONARY[clean] || clean;
}

/**
 * Splits text into logical sentiment clauses based on punctuation and conjunctions.
 */
function splitIntoClauses(text) {
  if (!text) return [];
  // Split on sentence boundaries, contrast conjunctions (but, however, yet, etc.), and commas
  const rawClauses = text
    .split(/(?:[.!?;]|\b(?:but|however|although|though|yet|while|except|whereas)\b|,)/gi)
    .map(c => c.trim())
    .filter(c => c.length > 0);

  return rawClauses.length > 0 ? rawClauses : [text.trim()];
}

/**
 * Analyzes sentiment score for a segment of text using phrases, words, and negations.
 */
function analyzeClauseSentiment(clause) {
  let lower = clause.toLowerCase();
  let clauseScore = 0;
  let matchesCount = 0;
  const matchedAspectHints = [];

  // 1. Check for multi-word phrases first (phrase-based priority)
  for (const item of PHRASE_LEXICON) {
    if (lower.includes(item.phrase)) {
      clauseScore += item.score;
      matchesCount++;
      if (item.aspect) {
        matchedAspectHints.push(item.aspect);
      }
      // Mask matched phrase with spaces so individual words are not re-evaluated
      lower = lower.replace(item.phrase, ' '.repeat(item.phrase.length));
    }
  }

  // 2. Tokenize remaining words and check single words with negation lookahead
  const words = lower.replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (NEGATION_WORDS.has(word)) {
      // Lookahead up to 2 words for a sentiment target
      if (i + 1 < words.length) {
        const nextWord = words[i + 1];
        if (WORD_LEXICON.hasOwnProperty(nextWord)) {
          const score = WORD_LEXICON[nextWord];
          // Invert sentiment valence: "not good" -> negative; "not bad" -> positive
          clauseScore += (score > 0 ? -1.3 : 1.0);
          matchesCount++;
          i++; // skip next word
          continue;
        }
      }
    }

    if (WORD_LEXICON.hasOwnProperty(word)) {
      clauseScore += WORD_LEXICON[word];
      matchesCount++;
    }
  }

  const normalized = matchesCount > 0 ? clauseScore / matchesCount : 0;
  return {
    rawScore: clauseScore,
    matchesCount,
    normalizedScore: Math.max(-1.0, Math.min(1.0, normalized)),
    matchedAspectHints
  };
}

/**
 * Detects fashion aspects mentioned in a clause or text.
 */
function detectAspectsInClause(clause) {
  const lower = clause.toLowerCase();
  const detected = new Set();

  for (const [key, aspect] of Object.entries(ASPECT_DEFINITIONS)) {
    for (const kw of aspect.keywords) {
      const escaped = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
      if (regex.test(lower)) {
        detected.add(aspect.name);
        break;
      }
    }
  }

  // Contextual handling for 'cheap' (price vs quality/material)
  if (/\bcheap\b/i.test(lower)) {
    if (/(?:material|fabric|quality|finish|stitching|feel|feels|look|looks)\b/i.test(lower)) {
      detected.add('Quality');
      if (/material|fabric|feel|cloth/i.test(lower)) {
        detected.add('Material');
      }
    } else {
      detected.add('Price');
    }
  }

  // Contextual handling for 'runs small' / 'runs large' -> Size and Fitting
  if (/run(?:s)?\s+(?:small|large)/i.test(lower)) {
    detected.add('Size');
    detected.add('Fitting');
  }

  // Contextual handling for 'tight' / 'loose' -> Size and Fitting
  if (/\b(?:tight|loose)\b/i.test(lower)) {
    detected.add('Fitting');
    detected.add('Size');
  }

  // Contextual handling for 'comfortable' / 'uncomfortable'
  if (/\b(?:comfortable|uncomfortable|comfort)\b/i.test(lower)) {
    detected.add('Fitting');
  }

  return Array.from(detected);
}

/**
 * Maps a numerical sentiment score into Positive / Negative / Neutral category.
 */
function scoreToSentimentLabel(score) {
  if (score >= 0.15) return 'Positive';
  if (score <= -0.15) return 'Negative';
  return 'Neutral';
}

/**
 * Calculates rule-based confidence score (0.40 to 0.98)
 */
function calculateConfidence(matchesCount, textScore, aspectCount, hasMixedAspects) {
  let confidence = 0.50; // base

  // Signal volume boost
  confidence += Math.min(matchesCount * 0.1, 0.25);

  // Score intensity boost
  confidence += Math.min(Math.abs(textScore) * 0.15, 0.15);

  // Aspect presence clarity
  if (aspectCount > 0) {
    confidence += 0.05;
  }

  // Consistency clarity: if mixed with clear aspects, high confidence in Mixed classification
  if (hasMixedAspects) {
    confidence = Math.max(confidence, 0.82);
  } else if (Math.abs(textScore) >= 0.7 && matchesCount >= 2) {
    confidence = Math.max(confidence, 0.90);
  }

  // Clamp between 0.45 and 0.98 and round to 2 decimals
  return Math.round(Math.max(0.45, Math.min(0.98, confidence)) * 100) / 100;
}

/**
 * Main NLP Analysis Function
 * 
 * @param {string} feedbackText - The customer's review text
 * @param {number} [rating=0] - Optional star rating (1 to 5)
 * @returns {object} Analysis result containing sentiment, sentimentScore, sentimentConfidence, aspects, analyzedAt
 */
function analyzeFeedback(feedbackText, rating = 0) {
  if (!feedbackText || typeof feedbackText !== 'string' || !feedbackText.trim()) {
    return {
      sentiment: 'Neutral',
      sentimentScore: 0,
      sentimentConfidence: 0.5,
      aspects: [],
      analyzedAt: new Date()
    };
  }

  const clauses = splitIntoClauses(feedbackText);
  const aspectScores = new Map(); // aspectName -> array of scores
  let totalWeightedScore = 0;
  let totalWeightCount = 0;
  let totalMatchesCount = 0;

  // Process each clause individually to preserve aspect context
  for (const clause of clauses) {
    const clauseSentiment = analyzeClauseSentiment(clause);
    const aspects = detectAspectsInClause(clause);

    // Merge any aspect hints directly discovered from phrases
    if (clauseSentiment.matchedAspectHints && clauseSentiment.matchedAspectHints.length > 0) {
      for (const hint of clauseSentiment.matchedAspectHints) {
        if (!aspects.includes(hint)) {
          aspects.push(hint);
        }
      }
    }

    if (clauseSentiment.matchesCount > 0) {
      totalWeightedScore += clauseSentiment.rawScore;
      totalWeightCount += clauseSentiment.matchesCount;
      totalMatchesCount += clauseSentiment.matchesCount;
    }

    // Associate clause sentiment with detected aspects in this clause
    for (const aspect of aspects) {
      if (!aspectScores.has(aspect)) {
        aspectScores.set(aspect, []);
      }
      aspectScores.get(aspect).push(clauseSentiment.normalizedScore);
    }
  }

  // Compile aspect results with name, sentiment, and score
  const aspectsResult = [];
  let positiveAspectCount = 0;
  let negativeAspectCount = 0;

  for (const [aspectName, scores] of aspectScores.entries()) {
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const roundedScore = Math.round(avgScore * 100) / 100;
    const label = scoreToSentimentLabel(avgScore);

    if (label === 'Positive') positiveAspectCount++;
    if (label === 'Negative') negativeAspectCount++;

    aspectsResult.push({
      name: aspectName,
      sentiment: label,
      score: roundedScore
    });
  }

  // Calculate base text score (-1.0 to +1.0)
  let baseScore = 0;
  if (totalWeightCount > 0) {
    baseScore = totalWeightedScore / totalWeightCount;
  }

  // Determine if this review exhibits opposing mixed sentiment
  const hasOpposingAspects = positiveAspectCount > 0 && negativeAspectCount > 0;

  // Optional subtle grounding from star rating (if valid 1-5 rating provided)
  // Ensures rating does NOT completely override explicit text sentiment
  let finalScore = baseScore;
  if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
    const ratingScore = (rating - 3) / 2; // Maps 1->-1.0, 3->0.0, 5->+1.0

    if (totalWeightCount === 0) {
      // Text had no sentiment words, rely on rating
      finalScore = ratingScore;
    } else if (hasOpposingAspects) {
      // For mixed reviews, preserve text priority so rating doesn't erase mixed balance
      finalScore = (baseScore * 0.85) + (ratingScore * 0.15);
    } else {
      // 80% text weight, 20% rating weight
      finalScore = (baseScore * 0.8) + (ratingScore * 0.2);
    }
  }

  // Clamp and round score to 2 decimal places
  finalScore = Math.max(-1.0, Math.min(1.0, finalScore));
  finalScore = Math.round(finalScore * 100) / 100;

  // Determine overall sentiment classification: Positive, Negative, Neutral, or Mixed
  let overallSentiment = 'Neutral';

  if (hasOpposingAspects && Math.abs(finalScore) < 0.35) {
    // Both positive and negative aspects are clearly present with balanced net score -> Mixed
    overallSentiment = 'Mixed';
  } else if (hasOpposingAspects && (positiveAspectCount >= 1 && negativeAspectCount >= 1) && Math.abs(positiveAspectCount - negativeAspectCount) <= 1) {
    // Both aspects present in equal or near-equal strength -> Mixed
    overallSentiment = 'Mixed';
  } else if (finalScore >= 0.15) {
    overallSentiment = 'Positive';
  } else if (finalScore <= -0.15) {
    overallSentiment = 'Negative';
  } else {
    overallSentiment = 'Neutral';
  }

  // Calculate confidence
  const confidence = calculateConfidence(
    totalMatchesCount,
    finalScore,
    aspectsResult.length,
    overallSentiment === 'Mixed'
  );

  return {
    sentiment: overallSentiment,
    sentimentScore: finalScore,
    sentimentConfidence: confidence,
    aspects: aspectsResult,
    analyzedAt: new Date()
  };
}

module.exports = {
  analyzeFeedback,
  analyzeClauseSentiment,
  detectAspectsInClause,
  splitIntoClauses,
  normalizeWord,
  scoreToSentimentLabel,
  ASPECT_DEFINITIONS,
  PHRASE_LEXICON,
  WORD_LEXICON
};
