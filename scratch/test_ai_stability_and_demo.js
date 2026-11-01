/**
 * test_ai_stability_and_demo.js
 * Automated test suite for AI cache, demo mode, quota detection, deduplication, and RBAC.
 *
 * Run from: project root (Feedback and Survey/)
 *   node scratch/test_ai_stability_and_demo.js
 *
 * Uses only Node.js built-ins + modules already in backend/node_modules.
 * Does NOT start the server — tests are unit-level (direct module imports).
 */

'use strict';

// ─── Bootstrap environment ──────────────────────────────────────────────────
const path = require('path');
const backendDir = path.resolve(__dirname, '../backend');
module.paths.push(path.join(backendDir, 'node_modules'));
process.chdir(backendDir);
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });

// ─── Imports ─────────────────────────────────────────────────────────────────
const aiCacheService = require(path.join(backendDir, 'services/aiCacheService'));

// ─── Test harness ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    results.push({ status: 'PASS', label });
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    results.push({ status: 'FAIL', label, detail });
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function section(name) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('═'.repeat(60));
}

// ─── Helper: clone env and restore ───────────────────────────────────────────
function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ─── SUITE 1: Demo Mode Guard ─────────────────────────────────────────────────
section('Suite 1: Demo Mode Guard');

withEnv({ AI_DEMO_MODE: 'true', NODE_ENV: 'development' }, () => {
  assert('Demo mode ON in development', aiCacheService.isDemoModeActive() === true);
});

withEnv({ AI_DEMO_MODE: 'true', NODE_ENV: 'production' }, () => {
  assert('Demo mode BLOCKED in production', aiCacheService.isDemoModeActive() === false,
    'isDemoModeActive() must return false when NODE_ENV=production even if AI_DEMO_MODE=true');
});

withEnv({ AI_DEMO_MODE: 'false', NODE_ENV: 'development' }, () => {
  assert('Demo mode OFF when AI_DEMO_MODE=false', aiCacheService.isDemoModeActive() === false);
});

withEnv({ AI_DEMO_MODE: undefined, NODE_ENV: 'development' }, () => {
  assert('Demo mode OFF when AI_DEMO_MODE unset', aiCacheService.isDemoModeActive() === false);
});

// ─── SUITE 2: Demo Responses ──────────────────────────────────────────────────
section('Suite 2: Demo Response Content');

{
  const askResp = aiCacheService.getDemoResponse('ask', { question: 'jeans sizing' });
  assert('Ask demo: isDemo=true', askResp.isDemo === true);
  assert('Ask demo: source=demo', askResp.source === 'demo');
  assert('Ask demo: demoNotice present', typeof askResp.demoNotice === 'string' && askResp.demoNotice.length > 5);
  assert('Ask demo: has answer', typeof askResp.answer === 'string' && askResp.answer.length > 10);
  assert('Ask demo: keyFindings is array', Array.isArray(askResp.keyFindings));
  assert('Ask demo: recommendations is array', Array.isArray(askResp.recommendations));
  assert('Ask demo: evidence is array', Array.isArray(askResp.evidence) && askResp.evidence.length > 0);
  assert('Ask demo: retrievedReviewCount > 0', askResp.retrievedReviewCount > 0);
}

{
  const compResp = aiCacheService.getDemoResponse('compare-products', { products: ['jeans', 'dress'] });
  assert('Compare demo: isDemo=true', compResp.isDemo === true);
  assert('Compare demo: measuredStatistics is object', typeof compResp.measuredStatistics === 'object');
  assert('Compare demo: aiSynthesis present', typeof compResp.aiSynthesis === 'object');
  assert('Compare demo: evidence array', Array.isArray(compResp.evidence));
}

{
  const recResp = aiCacheService.getDemoResponse('recommendations', { product: 'jeans', focusArea: 'fitting' });
  assert('Recommendations demo: isDemo=true', recResp.isDemo === true);
  assert('Recommendations demo: prioritizedRecommendations is array', Array.isArray(recResp.prioritizedRecommendations));
  assert('Recommendations demo: has High priority item', recResp.prioritizedRecommendations.some(r => r.priority === 'High'));
  assert('Recommendations demo: evidence array', Array.isArray(recResp.evidence));
}

// ─── SUITE 3: Cache Key Determinism ───────────────────────────────────────────
section('Suite 3: Cache Key Determinism');

{
  const key1 = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'jeans sizing', filters: { product: 'jeans' } });
  const key2 = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'jeans sizing', filters: { product: 'jeans' } });
  const key3 = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'different question', filters: { product: 'jeans' } });
  const key4 = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'jeans sizing', filters: null });

  assert('Same inputs → same key', key1 === key2);
  assert('Different question → different key', key1 !== key3);
  assert('Different filters → different key', key1 !== key4);
  assert('Key is 64-char hex', /^[0-9a-f]{64}$/.test(key1));
}

// ─── SUITE 4: TTL Cache Set / Get / Expire ────────────────────────────────────
section('Suite 4: TTL Cache Set / Get / Expire');

{
  aiCacheService.invalidateCache(); // clean state

  const key = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'test-q', filters: null });

  assert('Cache miss before set', aiCacheService.cacheGet(key) === null);

  const payload = { answer: 'cached answer', source: 'live' };
  aiCacheService.cacheSet(key, payload);

  const hit = aiCacheService.cacheGet(key);
  assert('Cache hit after set', hit !== null && hit.isCached === true);
  assert('Cached data matches', hit && hit.data.answer === 'cached answer');
}

// ─── SUITE 5: invalidateCache() ────────────────────────────────────────────────
section('Suite 5: Cache Invalidation on Feedback Submit');

{
  const key = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'inv-test', filters: null });
  aiCacheService.cacheSet(key, { answer: 'stale answer', source: 'live' });
  assert('Pre-invalidation: cache populated', aiCacheService.cacheGet(key) !== null);

  aiCacheService.invalidateCache();

  // After invalidation the old key should miss (data version bumped → new key)
  const newKey = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'inv-test', filters: null });
  assert('Post-invalidation: old key misses', aiCacheService.cacheGet(key) === null,
    'Old entries should be evicted after invalidation');
  assert('Post-invalidation: new key also misses (nothing stored yet)', aiCacheService.cacheGet(newKey) === null);
}

// ─── SUITE 6: In-Flight Deduplication ─────────────────────────────────────────
section('Suite 6: In-Flight Request Deduplication');

async function runDeduplicationTest() {
  aiCacheService.invalidateCache();
  const key = aiCacheService.getCacheKey({ endpoint: 'ask', queryOrProducts: 'dedup-test', filters: null });

  let callCount = 0;
  const factory = async () => {
    callCount++;
    await new Promise(r => setTimeout(r, 50));
    return { answer: `result-${callCount}`, source: 'live' };
  };

  // Launch 5 concurrent calls with the same key
  const promises = Array.from({ length: 5 }, () => aiCacheService.deduplicate(key, factory));
  const results = await Promise.all(promises);

  assert('Dedup: factory called exactly once', callCount === 1,
    `Expected 1 factory call, got ${callCount}`);
  assert('Dedup: all callers get same result', results.every(r => r.answer === results[0].answer),
    'All concurrent callers should share the same promise result');
}

// ─── SUITE 7: llmService 429 Detection ─────────────────────────────────────────
section('Suite 7: llmService Quota vs. Transient 429 Detection');

// These tests mock fetch to simulate Gemini API responses.
async function runLlmQuotaTests() {
  const llmService = require(path.join(backendDir, 'services/llmService'));

  const baseOverride = {
    provider: 'gemini',
    apiKey: 'test-api-key-only-for-unit-test',
    model: 'gemini-test',
    timeoutMs: 5000,
    baseUrl: 'https://generativelanguage.googleapis.com'
  };

  const originalFetch = global.fetch;

  // Helper: simulate a fetch response
  function mockFetch(status, body, headers = {}) {
    global.fetch = async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h) => headers[h.toLowerCase()] || null
      },
      json: async () => body,
      text: async () => JSON.stringify(body)
    });
  }

  // Test: RESOURCE_EXHAUSTED triggers AI_QUOTA_EXHAUSTED immediately (no retry)
  try {
    mockFetch(429, {
      error: {
        code: 429,
        message: 'Resource has been exhausted (e.g. check quota).',
        status: 'RESOURCE_EXHAUSTED'
      }
    });

    let caughtCode = null;
    try {
      await llmService.askLLM({ question: 'test quota question', overrideConfig: baseOverride });
    } catch (e) {
      caughtCode = e.code;
    }
    assert('RESOURCE_EXHAUSTED → AI_QUOTA_EXHAUSTED code', caughtCode === 'AI_QUOTA_EXHAUSTED',
      `Got code: ${caughtCode}`);
  } finally {
    global.fetch = originalFetch;
  }

  // Test: Transient 429 with "quota" keyword
  try {
    mockFetch(429, {
      error: { code: 429, message: 'daily quota exceeded for gemini API.' }
    });

    let caughtCode = null;
    try {
      await llmService.askLLM({ question: 'test transient question', overrideConfig: baseOverride });
    } catch (e) {
      caughtCode = e.code;
    }
    assert('Daily quota message → AI_QUOTA_EXHAUSTED', caughtCode === 'AI_QUOTA_EXHAUSTED',
      `Got code: ${caughtCode}`);
  } finally {
    global.fetch = originalFetch;
  }

  // Test: Generic 429 (rate limit) → LLM_PROVIDER_ERROR (not quota exhausted)
  try {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({ error: { code: 429, message: 'Too many requests. Please retry after a moment.', status: 'RATE_LIMIT_EXCEEDED' } }),
        text: async () => JSON.stringify({ error: { code: 429, message: 'Too many requests.', status: 'RATE_LIMIT_EXCEEDED' } })
      };
    };

    let caughtCode = null;
    try {
      await llmService.askLLM({ question: 'test rate limit question', overrideConfig: { ...baseOverride, timeoutMs: 3500 } });
    } catch (e) {
      caughtCode = e.code;
    }
    assert('Transient RATE_LIMIT_EXCEEDED → LLM_PROVIDER_ERROR (with retry attempt)', caughtCode === 'LLM_PROVIDER_ERROR',
      `Got code: ${caughtCode}`);
    assert('Transient 429: retried once (2 fetch calls)', callCount === 2,
      `Expected 2 calls (initial + retry), got ${callCount}`);
  } finally {
    global.fetch = originalFetch;
  }

  // Test: API key not set → LLM_NOT_CONFIGURED
  try {
    let caughtCode = null;
    try {
      await llmService.askLLM({
        question: 'test missing key',
        overrideConfig: { ...baseOverride, apiKey: '' }
      });
    } catch (e) {
      caughtCode = e.code;
    }
    assert('Empty API key → LLM_NOT_CONFIGURED', caughtCode === 'LLM_NOT_CONFIGURED',
      `Got code: ${caughtCode}`);
  } finally {
    global.fetch = originalFetch;
  }
}

// ─── SUITE 8: RBAC (Token Validation) ─────────────────────────────────────────
section('Suite 8: RBAC Token Validation');

async function runRbacTests() {
  const http = await import('http');

  async function makeRequest(method, path, body, token) {
    return new Promise((resolve) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const opts = {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      };
      const req = http.default.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', () => resolve({ status: 0, body: null }));
      req.write(bodyStr);
      req.end();
    });
  }

  // No token → 401
  const noToken = await makeRequest('POST', '/api/admin/ai/ask', { question: 'test' }, null);
  if (noToken.status === 0) {
    console.log('  ⚠️  SKIP: Server not running — RBAC tests require a live server on port 3000');
    return;
  }
  assert('No token → 401 Unauthorized', noToken.status === 401,
    `Got: ${noToken.status}`);

  // Tampered token → 401
  const tampered = await makeRequest('POST', '/api/admin/ai/ask', { question: 'test' }, 'invalid.jwt.token');
  assert('Tampered token → 401', tampered.status === 401,
    `Got: ${tampered.status}`);

  // Valid question format (auth required, will 401 without real token but confirms routing)
  const noBody = await makeRequest('POST', '/api/admin/ai/ask', {}, null);
  assert('Missing token → 401 even with valid body structure', noBody.status === 401,
    `Got: ${noBody.status}`);
}

// ─── Run all tests ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪  StyleSense AI — Stability & Demo Mode Test Suite\n');

  try {
    await runDeduplicationTest();
    await runLlmQuotaTests();
    await runRbacTests();
  } catch (err) {
    console.error('\n❌  Test runner error:', err.message);
    failed++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   • ${r.label}${r.detail ? ': ' + r.detail : ''}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

main();
