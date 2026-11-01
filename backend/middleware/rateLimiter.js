/**
 * Express Rate Limiting Middleware
 * 
 * Algorithm: Fixed-Window Counter per Client IP.
 * Each unique client IP receives a tracked request quota bucket for a defined window (default: 15 min).
 * Expired entries are automatically reclaimed via periodic background garbage collection.
 * 
 * Standard HTTP 429 Responses:
 * - Content-Type: application/json
 * - Headers:
 *   - RateLimit-Limit: Total request quota allowed in the window
 *   - RateLimit-Remaining: Number of requests left in the current window
 *   - RateLimit-Reset: Seconds until the current quota window resets
 *   - Retry-After: Seconds until client can retry (only present on HTTP 429)
 * 
 * IP Extraction & Proxy Safety:
 * - When Express 'trust proxy' is enabled in deployment topologies behind a reverse proxy (e.g. Nginx, Cloudflare),
 *   req.ip resolves the client address via validated X-Forwarded-For headers.
 * - When 'trust proxy' is disabled (local dev default), arbitrary forwarded headers are ignored to prevent spoofing.
 * 
 * Distributed Production Topology Note:
 * - For multi-node clustered deployments (e.g. Kubernetes, PM2 cluster, AWS ECS),
 *   this in-memory Map can be backed by a centralized Redis store (e.g. rate-limit-redis)
 *   so quota counts are synchronized across all process workers.
 */

'use strict';

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = typeof options.max === 'number' ? options.max : 100;
  const message = options.message || {
    success: false,
    error: 'Too many requests. Please try again later.'
  };
  const statusCode = options.statusCode || 429;
  const skipSuccessfulRequests = Boolean(options.skipSuccessfulRequests);

  const store = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  function getClientIp(req) {
    if (req.ip) return req.ip;
    if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
    if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
    return '127.0.0.1';
  }

  const middleware = (req, res, next) => {
    // Production Safety: Do not allow test bypass flag to disable rate limiting in production
    if (process.env.DISABLE_RATE_LIMITING === 'true') {
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ WARNING: DISABLE_RATE_LIMITING=true cannot be used in production environment. Rate limiting remains active.');
      } else {
        return next();
      }
    }

    const key = options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    const now = Date.now();

    let record = store.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      store.set(key, record);
    }

    record.count++;

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(statusCode).json(
        typeof message === 'function' ? message(req, res) : message
      );
    }

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400 && record && record.count > 0) {
          record.count--;
        }
      });
    }

    next();
  };

  middleware.resetKey = (key) => store.delete(key);
  middleware.resetAll = () => store.clear();

  return middleware;
}

// 1. Authentication Rate Limiter (Protects customer & admin login against brute-force)
// Configured to 60 attempts per 15 minutes by default to accommodate legitimate shared-IP environments (NAT/office).
// Configurable in production via AUTH_RATE_LIMIT_MAX.
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 60,
  message: {
    success: false,
    error: 'Too many login attempts from this IP address. Please try again after 15 minutes.'
  }
});

// 2. Registration Rate Limiter (Prevents automated account creation spam)
const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.REGISTER_RATE_LIMIT_MAX, 10) || 30,
  message: {
    success: false,
    error: 'Too many registration attempts from this IP address. Please wait before registering again.'
  }
});

// 3. Feedback Submission Rate Limiter (Prevents review flood attacks)
const feedbackLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.FEEDBACK_RATE_LIMIT_MAX, 10) || 100,
  message: {
    success: false,
    error: 'Too many feedback submissions from this IP address. Please wait before submitting more feedback.'
  }
});

// 4. Survey Submission Rate Limiter (Protects public survey submission)
const surveyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SURVEY_RATE_LIMIT_MAX, 10) || 60,
  message: {
    success: false,
    error: 'Too many survey submissions from this IP address. Please wait before submitting more responses.'
  }
});

// 5. AI Inquiries Rate Limiter (Protects high-computation LLM endpoints while permitting admin investigation sessions)
const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || 100,
  message: {
    success: false,
    code: 'AI_RATE_LIMIT_EXCEEDED',
    error: 'Too many AI inquiries submitted. Please wait before asking more questions.'
  }
});

module.exports = {
  createRateLimiter,
  authLimiter,
  registerLimiter,
  feedbackLimiter,
  surveyLimiter,
  aiLimiter
};
