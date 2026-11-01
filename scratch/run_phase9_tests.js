/**
 * Phase 9 Automated Test Suite: Real LLM Integration for Style Feedback Intelligence AI
 *
 * Verifies all 20 required acceptance criteria:
 * - Request validation (missing, empty, short, long questions, malformed bodies, invalid filters)
 * - Security & Access Control (401 unauthenticated, 403 customer, 200 admin)
 * - Provider Configuration & Degradation (503 when API key missing)
 * - SSRF Protection (prohibits private IPs and unapproved protocols)
 * - Mocked Provider Execution (zero paid API usage, Gemini & OpenAI compatibility)
 * - Resilience (timeouts, 502/429 provider errors, malformed JSON, oversized payloads)
 * - Confidentiality (API key and secrets never returned in client response)
 * - End-to-end regression verification across all existing platform phases (Phases 1-7)
 */

const path = require('path');
const http = require('http');

const backendDir = path.join(__dirname, '../backend');
const dotenv = require(path.join(backendDir, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendDir, '.env') });

const mongoose = require(path.join(backendDir, 'node_modules/mongoose'));
const User = require(path.join(backendDir, 'models/user'));
const Feedback = require(path.join(backendDir, 'models/Feedback'));
const Survey = require(path.join(backendDir, 'models/Survey'));
const { generateToken } = require(path.join(backendDir, 'middleware/auth'));
const llmService = require(path.join(backendDir, 'services/llmService'));
const { analyzeFeedback } = require(path.join(backendDir, 'services/nlpService'));
const spamService = require(path.join(backendDir, 'services/spamService'));
const analyticsService = require(path.join(backendDir, 'services/analyticsService'));
const searchService = require(path.join(backendDir, 'services/searchService'));
const reportService = require(path.join(backendDir, 'services/reportService'));

const BASE_URL = 'http://localhost:3000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
  }
}

async function apiCall(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let json = null;
  const rawText = await res.text();
  try {
    json = JSON.parse(rawText);
  } catch (_) {
    json = { raw: rawText };
  }

  return { status: res.status, headers: res.headers, body: json };
}

/**
 * Creates a lightweight local HTTP mock server for zero-cost LLM testing.
 */
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(res => server.close(res))
      });
    });
  });
}

async function runPhase9Tests() {
  console.log('\n========================================================');
  console.log('PHASE 9 TEST SUITE: LLM INTEGRATION FOUNDATION');
  console.log('========================================================');

  // Connect to DB for token generation & regression tests
  await mongoose.connect(process.env.MONGO_URI);

  // Setup tokens
  let admin = await User.findOne({ email: 'admin@stylefeedback.com' });
  if (!admin) {
    admin = new User({
      username: 'p9admin',
      email: 'admin@stylefeedback.com',
      password: 'adminPassword123',
      role: 'admin'
    });
    await admin.save();
  }
  const adminToken = generateToken(admin);

  let customer = await User.findOne({ username: 'p9customer' });
  if (!customer) {
    customer = new User({
      username: 'p9customer',
      email: 'p9customer@test.com',
      password: 'customerPass123',
      role: 'customer'
    });
    await customer.save();
  }
  const customerToken = generateToken(customer);

  const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
  const customerHeaders = { 'Authorization': `Bearer ${customerToken}` };

  // ----------------------------------------------------
  // SUITE 1: AUTHENTICATION & ACCESS CONTROL (POST /api/admin/ai/ask)
  // ----------------------------------------------------
  console.log('\n--- SUITE 1: AUTHENTICATION & RBAC ---');

  // Test 1: Unauthenticated request -> 401
  const unauthRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    body: { question: 'What do customers say about jackets?' }
  });
  assert(unauthRes.status === 401, '1. Unauthenticated request receives HTTP 401');
  assert(unauthRes.body.success === false, '1. Unauthenticated response success = false');

  // Test 2: Customer role -> 403 Forbidden
  const custRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: customerHeaders,
    body: { question: 'What do customers say about jackets?' }
  });
  assert(custRes.status === 403, '2. Customer role receives HTTP 403');
  assert(custRes.body.error && custRes.body.error.includes('Admin access required'), '2. Customer received proper forbidden error message');

  // ----------------------------------------------------
  // SUITE 2: INPUT VALIDATION
  // ----------------------------------------------------
  console.log('\n--- SUITE 2: INPUT VALIDATION ---');

  // Test 3: Missing question
  const missQRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: {}
  });
  assert(missQRes.status === 400, '3. Missing question returns HTTP 400');
  assert(missQRes.body.code === 'MISSING_QUESTION', '3. Missing question code is MISSING_QUESTION');

  // Test 4: Empty string question
  const emptyQRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: { question: '   ' }
  });
  assert(emptyQRes.status === 400, '4. Whitespace-only question returns HTTP 400');
  assert(emptyQRes.body.code === 'EMPTY_QUESTION', '4. Empty question code is EMPTY_QUESTION');

  // Test 5: Question too short (< 3 chars)
  const shortQRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: { question: 'hi' }
  });
  assert(shortQRes.status === 400, '5. Question too short returns HTTP 400');
  assert(shortQRes.body.code === 'QUESTION_TOO_SHORT', '5. Short question code is QUESTION_TOO_SHORT');

  // Test 6: Question excessively long (> 500 chars)
  const longQuestion = 'A'.repeat(501);
  const longQRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: { question: longQuestion }
  });
  assert(longQRes.status === 400, '6. Question exceeding 500 chars returns HTTP 400');
  assert(longQRes.body.code === 'QUESTION_TOO_LONG', '6. Long question code is QUESTION_TOO_LONG');

  // Test 7: Non-string question
  const nonStrQRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: { question: 12345 }
  });
  assert(nonStrQRes.status === 400, '7. Non-string question returns HTTP 400');
  assert(nonStrQRes.body.code === 'INVALID_QUESTION_TYPE', '7. Invalid question type code is INVALID_QUESTION_TYPE');

  // Test 8: Invalid body (array instead of object)
  const arrayBodyRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: ['question']
  });
  assert(arrayBodyRes.status === 400, '8. Array request body returns HTTP 400');
  assert(arrayBodyRes.body.code === 'INVALID_REQUEST_BODY', '8. Invalid request body code returned');

  // Test 9: Invalid filters (prohibited keys / operator injection attempt)
  const badFilterRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      question: 'Valid question about dresses',
      filters: { '$where': 'malicious code' }
    }
  });
  assert(badFilterRes.status === 400, '9. Injection attempt in filters returns HTTP 400');
  assert(badFilterRes.body.code === 'INVALID_FILTERS', '9. Code is INVALID_FILTERS');

  // Test 10: Invalid filter values (e.g. invalid sentiment)
  const badSentimentRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      question: 'Valid question about dresses',
      filters: { sentiment: 'SuperAngry' }
    }
  });
  assert(badSentimentRes.status === 400, '10. Invalid sentiment value returns HTTP 400');

  // ----------------------------------------------------
  // SUITE 3: CONFIGURATION & MISSING API KEY HANDLING
  // ----------------------------------------------------
  console.log('\n--- SUITE 3: CONFIGURATION & MISSING API KEY ---');

  // Test 11: Missing API key produces a controlled 503 error
  // If LLM_API_KEY is not set in env, the live endpoint returns 503
  const missingKeyRes = await apiCall('/api/admin/ai/ask', {
    method: 'POST',
    headers: adminHeaders,
    body: { question: 'What do customers like most about jeans?' }
  });

  // Verify controlled degradation (either 503 if not set, or 200/controlled error)
  if (!process.env.LLM_API_KEY) {
    assert(missingKeyRes.status === 503, '11. Missing API key returns HTTP 503 (Service Unavailable)');
    assert(missingKeyRes.body.code === 'LLM_NOT_CONFIGURED', '11. Missing API key code is LLM_NOT_CONFIGURED');
    assert(missingKeyRes.body.error && missingKeyRes.body.error.includes('LLM_API_KEY'), '11. Error message clearly instructs setting LLM_API_KEY');
  } else {
    assert(missingKeyRes.status === 200 || missingKeyRes.status === 503 || missingKeyRes.status === 502 || missingKeyRes.status === 504 || missingKeyRes.status === 429, '11. Handled provider configuration cleanly');
  }

  // Directly test service behavior when apiKey is missing
  let serviceConfigErr = null;
  try {
    await llmService.askLLM({
      question: 'Valid question',
      overrideConfig: { apiKey: '' }
    });
  } catch (err) {
    serviceConfigErr = err;
  }
  assert(serviceConfigErr !== null && serviceConfigErr.code === 'LLM_NOT_CONFIGURED', '12. llmService cleanly rejects missing apiKey with LLM_NOT_CONFIGURED');
  assert(serviceConfigErr.status === 503, '12. llmService status is 503');

  // ----------------------------------------------------
  // SUITE 4: SSRF PROTECTION & BASE URL VALIDATION
  // ----------------------------------------------------
  console.log('\n--- SUITE 4: SSRF PROTECTION & SECURITY ---');

  // Test 13: Loopback IPv4 rejected
  let ssrfErr1 = null;
  try {
    llmService.validateBaseUrl('http://127.0.0.1:8080');
  } catch (e) {
    ssrfErr1 = e;
  }
  assert(ssrfErr1 !== null, '13. SSRF: Loopback 127.0.0.1 is strictly blocked');

  // Test 14: Private subnet 192.168.x.x rejected
  let ssrfErr2 = null;
  try {
    llmService.validateBaseUrl('https://192.168.1.1');
  } catch (e) {
    ssrfErr2 = e;
  }
  assert(ssrfErr2 !== null, '14. SSRF: Private RFC-1918 (192.168.x) is strictly blocked');

  // Test 15: Cloud metadata 169.254.169.254 rejected
  let ssrfErr3 = null;
  try {
    llmService.validateBaseUrl('https://169.254.169.254/latest/meta-data');
  } catch (e) {
    ssrfErr3 = e;
  }
  assert(ssrfErr3 !== null, '15. SSRF: Link-local/Cloud metadata (169.254.x) is strictly blocked');

  // Test 16: Non-HTTPS URL rejected
  let ssrfErr4 = null;
  try {
    llmService.validateBaseUrl('http://generativelanguage.googleapis.com');
  } catch (e) {
    ssrfErr4 = e;
  }
  assert(ssrfErr4 !== null, '16. SSRF: Plain HTTP scheme rejected in non-test mode');

  // Test 17: Valid trusted provider HTTPS URL accepted
  const validUrl = llmService.validateBaseUrl('https://generativelanguage.googleapis.com');
  assert(validUrl === 'https://generativelanguage.googleapis.com', '17. SSRF: Trusted Gemini provider URL is validated and allowed');

  // ----------------------------------------------------
  // SUITE 5: MOCKED PROVIDER CALLS (ZERO-COST TESTS)
  // ----------------------------------------------------
  console.log('\n--- SUITE 5: MOCKED PROVIDER CALLS (GEMINI & OPENAI) ---');

  const FAKE_SECRET_KEY = 'super_secret_test_key_xyz_98765';

  // Test 18: Successful Gemini mock response
  const geminiMock = await createMockServer((req, res) => {
    // Verify x-goog-api-key header was sent
    if (req.headers['x-goog-api-key'] !== FAKE_SECRET_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Unauthorized key' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: 'Customers appreciate the durable denim fabric and comfortable waist fitting in jeans.' }]
          }
        }
      ],
      usageMetadata: {
        promptTokenCount: 85,
        candidatesTokenCount: 22,
        totalTokenCount: 107
      }
    }));
  });

  const geminiResult = await llmService.askLLM({
    question: 'What do customers like about jeans?',
    overrideConfig: {
      provider: 'gemini',
      apiKey: FAKE_SECRET_KEY,
      baseUrl: geminiMock.url,
      allowLocalTest: true
    }
  });

  assert(geminiResult.answer.includes('durable denim fabric'), '18. Gemini: Successfully parsed answer from mocked provider');
  assert(geminiResult.provider === 'gemini', '18. Gemini: Provider labeled as gemini');
  assert(geminiResult.usage.totalTokens === 107, '18. Gemini: Usage tokens extracted correctly (107)');
  await geminiMock.close();

  // Test 19: Successful OpenAI mock response
  const openAiMock = await createMockServer((req, res) => {
    if (req.headers['authorization'] !== `Bearer ${FAKE_SECRET_KEY}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Invalid Bearer token' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Jackets receive high praise for thermal insulation and stylish design.'
          }
        }
      ],
      usage: {
        prompt_tokens: 60,
        completion_tokens: 15,
        total_tokens: 75
      }
    }));
  });

  const openAiResult = await llmService.askLLM({
    question: 'What is the consensus on jackets?',
    overrideConfig: {
      provider: 'openai',
      apiKey: FAKE_SECRET_KEY,
      baseUrl: openAiMock.url,
      allowLocalTest: true
    }
  });

  assert(openAiResult.answer.includes('thermal insulation'), '19. OpenAI: Successfully parsed answer from OpenAI-compatible provider');
  assert(openAiResult.usage.totalTokens === 75, '19. OpenAI: Token usage extracted correctly (75)');
  await openAiMock.close();

  // ----------------------------------------------------
  // SUITE 6: TIMEOUT, ERROR HANDLING & RESILIENCE
  // ----------------------------------------------------
  console.log('\n--- SUITE 6: RESILIENCE & ERROR HANDLING ---');

  // Test 20: Provider Timeout handled gracefully
  const slowMock = await createMockServer((req, res) => {
    // Intentionally delay response longer than timeout
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer: 'Too late' }));
    }, 1500);
  });

  let timeoutErr = null;
  try {
    await llmService.askLLM({
      question: 'Will this request time out?',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: slowMock.url,
        timeoutMs: 150, // Short timeout for test
        allowLocalTest: true
      }
    });
  } catch (err) {
    timeoutErr = err;
  }
  assert(timeoutErr !== null && timeoutErr.code === 'LLM_TIMEOUT', '20. Timeout: Aborted and mapped to LLM_TIMEOUT');
  assert(timeoutErr.status === 504, '20. Timeout: Error status code is 504 Gateway Timeout');
  await slowMock.close();

  // Test 21: Provider HTTP 500 error handled
  const error500Mock = await createMockServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Internal provider server explosion' } }));
  });

  let provider500Err = null;
  try {
    await llmService.askLLM({
      question: 'Test provider crash',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: error500Mock.url,
        allowLocalTest: true
      }
    });
  } catch (err) {
    provider500Err = err;
  }
  assert(provider500Err !== null && provider500Err.code === 'LLM_PROVIDER_ERROR', '21. Provider 500: Mapped to LLM_PROVIDER_ERROR');
  assert(provider500Err.status === 502, '21. Provider 500: Status code mapped to 502 Bad Gateway');
  await error500Mock.close();

  // Test 22: Provider HTTP 429 Rate Limit handled
  const rateLimitMock = await createMockServer((req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
  });

  let rateLimitErr = null;
  try {
    await llmService.askLLM({
      question: 'Test rate limit',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: rateLimitMock.url,
        allowLocalTest: true
      }
    });
  } catch (err) {
    rateLimitErr = err;
  }
  assert(rateLimitErr !== null && rateLimitErr.status === 429, '22. Rate Limit 429: Preserves 429 Too Many Requests status');
  await rateLimitMock.close();

  // Test 23: Malformed JSON response handled
  const malformedMock = await createMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('<<< NOT VALID JSON >>>');
  });

  let malformedErr = null;
  try {
    await llmService.askLLM({
      question: 'Test malformed response',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: malformedMock.url,
        allowLocalTest: true
      }
    });
  } catch (err) {
    malformedErr = err;
  }
  assert(malformedErr !== null && malformedErr.code === 'LLM_MALFORMED_RESPONSE', '23. Malformed JSON: Mapped to LLM_MALFORMED_RESPONSE');
  assert(malformedErr.status === 502, '23. Malformed JSON: Status is 502 Bad Gateway');
  await malformedMock.close();

  // Test 24: Oversized response payload (> 1 MB) rejected
  const oversizedMock = await createMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Write 1.2 MB of data
    res.end('X'.repeat(1.2 * 1024 * 1024));
  });

  let oversizedErr = null;
  try {
    await llmService.askLLM({
      question: 'Test oversized payload',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: oversizedMock.url,
        allowLocalTest: true
      }
    });
  } catch (err) {
    oversizedErr = err;
  }
  assert(oversizedErr !== null && oversizedErr.code === 'LLM_RESPONSE_TOO_LARGE', '24. Oversized response: Mapped to LLM_RESPONSE_TOO_LARGE');
  assert(oversizedErr.status === 502, '24. Oversized response: Status is 502 Bad Gateway');
  await oversizedMock.close();

  // ----------------------------------------------------
  // SUITE 7: CONFIDENTIALITY & ZERO SECRET LEAKAGE
  // ----------------------------------------------------
  console.log('\n--- SUITE 7: SECRET LEAKAGE PREVENTION ---');

  // Test 25: API Key is never reflected in error messages or responses
  const leakingMock = await createMockServer((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    // Simulate provider mistakenly reflecting the secret in its message
    res.end(JSON.stringify({ error: { message: `Invalid authentication key: ${FAKE_SECRET_KEY}` } }));
  });

  let leakTestErr = null;
  try {
    await llmService.askLLM({
      question: 'Test leak prevention',
      overrideConfig: {
        apiKey: FAKE_SECRET_KEY,
        baseUrl: leakingMock.url,
        allowLocalTest: true
      }
    });
  } catch (err) {
    leakTestErr = err;
  }
  assert(leakTestErr !== null, '25. Provider error received');
  assert(!leakTestErr.message.includes(FAKE_SECRET_KEY), '25. Leak Prevention: Secret key was stripped from error message (redacted)');
  await leakingMock.close();

  // ----------------------------------------------------
  // SUITE 8: REGRESSION & COMPATIBILITY CHECK (PHASES 1-7)
  // ----------------------------------------------------
  console.log('\n--- SUITE 8: BACKWARD COMPATIBILITY & REGRESSION ---');

  // Test 26: Phase 1 — Authentication /me returns customer role
  const meRes = await apiCall('/api/auth/me', { headers: customerHeaders });
  assert(meRes.status === 200 && meRes.body.user && meRes.body.user.role === 'customer', '26. Phase 1: /api/auth/me returns valid customer profile');

  // Test 27: Phase 2 — NLP sentiment analysis on fashion feedback
  const nlp = analyzeFeedback('The dress is beautiful and the stitching is perfect, but size is too small.', 4);
  assert(nlp.sentiment === 'Mixed' || nlp.sentiment === 'Positive', '27. Phase 2: NLP sentiment correctly evaluated');
  assert(nlp.aspects && nlp.aspects.length >= 2, '27. Phase 2: Fashion aspects (Design, Size/Fitting) detected');

  // Test 28: Phase 3/4 — Feedback submission works
  await Feedback.deleteMany({ email: /^p9user/i });
  const submitRes = await apiCall('/api/feedback', {
    method: 'POST',
    body: {
      name: 'P9 Verification User',
      email: 'p9user@test.com',
      product: 'tops',
      rating: 5,
      feedback: 'The cotton fabric is exceptionally soft and breathable.',
      recommend: true
    }
  });
  assert(submitRes.status === 201, '28. Phase 3/4: Feedback POST returns HTTP 201');
  assert(submitRes.body.feedback && submitRes.body.feedback.moderationStatus === 'published', '28. Phase 4: Clean feedback marked as published');

  // Test 29: Phase 5 — Analytics overview endpoint
  const analyticsRes = await apiCall('/api/admin/analytics/overview', { headers: adminHeaders });
  assert(analyticsRes.status === 200, '29. Phase 5: Analytics overview returns HTTP 200');
  assert(typeof analyticsRes.body.data.totalValidFeedback === 'number', '29. Phase 5: Total valid feedback is numeric');

  // Test 30: Phase 6 — Public feedback search & pagination
  const searchRes = await apiCall('/api/feedback?product=tops&page=1&limit=5');
  assert(searchRes.status === 200, '30. Phase 6: Public search endpoint returns HTTP 200');
  assert(searchRes.body.data && Array.isArray(searchRes.body.data), '30. Phase 6: Feedback search data is an array');

  // Test 31: Phase 7 — CSV Export endpoint
  const csvRes = await apiCall('/api/admin/reports/feedback.csv', { headers: adminHeaders });
  assert(csvRes.status === 200, '31. Phase 7: Feedback CSV export returns HTTP 200');

  // Test 32: Survey submission
  const surveyRes = await apiCall('/api/survey', {
    method: 'POST',
    body: {
      name: 'P9 Survey User',
      email: 'p9survey@test.com',
      age: '26-35',
      style: ['casual'],
      suggestions: 'Keep up the great quality.'
    }
  });
  assert(surveyRes.status === 201, '32. Survey submission returns HTTP 201');

  // Summary
  console.log('\n========================================================');
  console.log(`PHASE 9 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('========================================================\n');

  await mongoose.disconnect();

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase9Tests().catch((err) => {
    console.error('Test suite failed with unexpected error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase9Tests };
