/**
 * StyleSense AI — Comprehensive Security & Hardening Audit Test Suite
 * 
 * Verifies:
 * Section 1: JWT Secret Fail-Fast Validation & Insecure Secret Rejection
 * Section 2: Token Verification, Tampering & Signature Validation
 * Section 3: Role-Based Access Control (RBAC) & Authorization Boundaries
 * Section 4: CORS Origin Restrictions & Preflight OPTIONS Verification
 * Section 5: Rate Limiter Quotas, RFC Headers, Reset Behavior & Production Safety
 */

'use strict';

const path = require('path');
const assert = require('assert');
const http = require('http');

const backendDir = path.resolve(__dirname, '../backend');
const dotenv = require(path.join(backendDir, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendDir, '.env') });

const jwt = require(path.join(backendDir, 'node_modules/jsonwebtoken'));
const express = require(path.join(backendDir, 'node_modules/express'));
const cors = require(path.join(backendDir, 'node_modules/cors'));

const {
  validateJwtConfiguration,
  getJwtSecret,
  verifyToken,
  requireAdmin,
  generateToken
} = require(path.join(backendDir, 'middleware/auth'));

const {
  createRateLimiter,
  authLimiter,
  registerLimiter,
  feedbackLimiter,
  surveyLimiter,
  aiLimiter
} = require(path.join(backendDir, 'middleware/rateLimiter'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(condition, testName, extraDetails = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    failures.push(testName);
    console.error(`  ✗ FAIL: ${testName} ${extraDetails ? `(${extraDetails})` : ''}`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

(async () => {
  console.log('======================================================================');
  console.log('       STYLESENSE AI: SECURITY AUDIT & HARDENING TEST SUITE           ');
  console.log('======================================================================');

  // =========================================================================
  // Section 1: JWT Secret Fail-Fast Validation
  // =========================================================================
  section('1. JWT Secret Configuration & Fail-Fast Validation');
  const originalSecret = process.env.JWT_SECRET;

  try {
    // 1.1 Unset secret throws fatal error
    delete process.env.JWT_SECRET;
    let threwForMissing = false;
    let missingErrMsg = '';
    try {
      validateJwtConfiguration();
    } catch (e) {
      threwForMissing = true;
      missingErrMsg = e.message;
    }
    check(threwForMissing, 'validateJwtConfiguration throws error when JWT_SECRET is unset');
    check(missingErrMsg.includes('FATAL:'), 'Error message contains FATAL indicator for startup abort');

    // 1.2 Empty string secret throws fatal error
    process.env.JWT_SECRET = '   ';
    let threwForEmpty = false;
    try {
      validateJwtConfiguration();
    } catch (e) {
      threwForEmpty = true;
    }
    check(threwForEmpty, 'validateJwtConfiguration throws error when JWT_SECRET is whitespace');

    // 1.3 Insecure short secret (< 16 characters) throws fatal error
    process.env.JWT_SECRET = 'short_secret';
    let threwForShort = false;
    let shortErrMsg = '';
    try {
      validateJwtConfiguration();
    } catch (e) {
      threwForShort = true;
      shortErrMsg = e.message;
    }
    check(threwForShort, 'validateJwtConfiguration throws error when JWT_SECRET < 16 characters');
    check(shortErrMsg.includes('minimum 16 characters'), 'Error informs minimum 16 character requirement');
    check(!shortErrMsg.includes('short_secret'), 'Error message does NOT log or expose the secret value');

    // 1.4 Valid secret passes
    process.env.JWT_SECRET = 'super_secure_random_key_for_testing_12345';
    let passedValid = false;
    try {
      passedValid = validateJwtConfiguration() === true;
    } catch (e) {
      passedValid = false;
    }
    check(passedValid, 'validateJwtConfiguration returns true for secure key');
    check(getJwtSecret() === 'super_secure_random_key_for_testing_12345', 'getJwtSecret returns validated trimmed secret');

  } finally {
    process.env.JWT_SECRET = originalSecret;
  }

  // =========================================================================
  // Section 2: Token Verification, Tampering & Signatures
  // =========================================================================
  section('2. Token Verification, Tampering & Signature Validation');

  const secret = getJwtSecret();
  const testUser = {
    _id: '65f1a2b3c4d5e6f7a8b9c0d1',
    username: 'test_sec_user',
    email: 'sec@stylefeedback.local',
    role: 'customer'
  };

  const validToken = generateToken(testUser);
  check(typeof validToken === 'string' && validToken.split('.').length === 3, 'generateToken produces standard 3-part JWT');

  const decoded = jwt.verify(validToken, secret);
  check(decoded.id === testUser._id && decoded.username === testUser.username, 'JWT payload contains correct user identity');

  // 2.2 Tampered token payload rejected
  const tokenParts = validToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ id: testUser._id, role: 'admin' })).toString('base64url');
  const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;

  let tamperedCaught = false;
  try {
    jwt.verify(tamperedToken, secret);
  } catch (e) {
    tamperedCaught = true;
  }
  check(tamperedCaught, 'Tampered token payload causes cryptographic signature verification failure');

  // 2.3 Token signed with different secret rejected
  const foreignToken = jwt.sign({ id: testUser._id, role: 'admin' }, 'different_secret_key_987654321');
  let foreignCaught = false;
  try {
    jwt.verify(foreignToken, secret);
  } catch (e) {
    foreignCaught = true;
  }
  check(foreignCaught, 'Token signed with foreign secret is rejected');

  // =========================================================================
  // Section 3: Role-Based Access Control (RBAC)
  // =========================================================================
  section('3. Role-Based Access Control (RBAC) & Middleware Boundaries');

  // 3.1 requireAdmin blocks non-admin
  let adminBlocked = false;
  let blockStatusCode = 0;
  const mockResCustomer = {
    status: (code) => {
      blockStatusCode = code;
      return { json: () => {} };
    }
  };
  requireAdmin({ user: { role: 'customer' } }, mockResCustomer, () => {
    adminBlocked = false;
  });
  check(blockStatusCode === 403, 'requireAdmin returns HTTP 403 Forbidden for customer role');

  // 3.2 requireAdmin blocks unauthenticated
  let unauthCode = 0;
  const mockResUnauth = {
    status: (code) => {
      unauthCode = code;
      return { json: () => {} };
    }
  };
  requireAdmin({}, mockResUnauth, () => {});
  check(unauthCode === 401, 'requireAdmin returns HTTP 401 when req.user is absent');

  // 3.3 requireAdmin permits admin
  let nextCalled = false;
  requireAdmin({ user: { role: 'admin' } }, {}, () => {
    nextCalled = true;
  });
  check(nextCalled === true, 'requireAdmin calls next() when req.user.role is admin');

  // =========================================================================
  // Section 4: CORS Origin Restrictions & Preflight OPTIONS
  // =========================================================================
  section('4. CORS Origin Restrictions & Preflight OPTIONS');

  const corsApp = express();
  const allowedOriginsSet = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://stylesense.fashion.example'
  ]);

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allowedOriginsSet.has(normalized)) return callback(null, true);
      return callback(new Error(`CORS policy rejection: Origin "${origin}" is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };

  corsApp.use(cors(corsOptions));
  corsApp.get('/test-cors', (req, res) => res.json({ success: true }));
  corsApp.use((err, req, res, next) => {
    if (err && err.message && err.message.startsWith('CORS policy rejection')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  });

  const corsServer = http.createServer(corsApp);
  await new Promise(r => corsServer.listen(3199, r));

  async function corsReq(options) {
    return new Promise((resolve) => {
      const opts = {
        hostname: 'localhost',
        port: 3199,
        ...options
      };
      const req = http.request(opts, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      req.end();
    });
  }

  // 4.1 Allowed origin
  const allowedRes = await corsReq({
    path: '/test-cors',
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' }
  });
  check(allowedRes.status === 200, 'Allowed origin http://localhost:3000 returns HTTP 200');
  check(allowedRes.headers['access-control-allow-origin'] === 'http://localhost:3000', 'Access-Control-Allow-Origin header matches allowed origin');
  check(allowedRes.headers['access-control-allow-credentials'] === 'true', 'Access-Control-Allow-Credentials is true');

  // 4.2 Disallowed origin
  const disallowedRes = await corsReq({
    path: '/test-cors',
    method: 'GET',
    headers: { Origin: 'https://malicious-site.attacker.com' }
  });
  check(disallowedRes.status === 403, 'Disallowed origin https://malicious-site.attacker.com is blocked with HTTP 403');
  check(!disallowedRes.headers['access-control-allow-origin'], 'Disallowed origin does NOT receive Access-Control-Allow-Origin header');

  // 4.3 Preflight OPTIONS request
  const preflightRes = await corsReq({
    path: '/test-cors',
    method: 'OPTIONS',
    headers: {
      Origin: 'https://stylesense.fashion.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization'
    }
  });
  check(preflightRes.status === 204 || preflightRes.status === 200, 'Preflight OPTIONS returns HTTP 204 or 200');
  check(preflightRes.headers['access-control-allow-methods']?.includes('POST'), 'Preflight permits POST method');

  // 4.4 Non-browser request (no Origin header)
  const noOriginRes = await corsReq({ path: '/test-cors', method: 'GET' });
  check(noOriginRes.status === 200, 'Non-browser request with no Origin header is permitted');

  corsServer.close();

  // =========================================================================
  // Section 5: Rate Limiting Quotas, Headers, Reset & Production Safety
  // =========================================================================
  section('5. Rate Limiting Quotas, RFC Headers, Reset & Production Safety');

  const testLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: { success: false, error: 'Custom rate limit exceeded' }
  });

  const rateApp = express();
  rateApp.use('/rate-test', testLimiter, (req, res) => res.json({ ok: true }));
  const rateServer = http.createServer(rateApp);
  await new Promise(r => rateServer.listen(3198, r));

  async function rateReq() {
    return new Promise((resolve) => {
      const req = http.request({ hostname: 'localhost', port: 3198, path: '/rate-test', method: 'GET' }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      req.end();
    });
  }

  // Request 1: remaining = 2
  const r1 = await rateReq();
  check(r1.status === 200, 'Request 1 succeeds (HTTP 200)');
  check(r1.headers['ratelimit-limit'] === '3', 'RateLimit-Limit is 3');
  check(r1.headers['ratelimit-remaining'] === '2', 'RateLimit-Remaining is 2');
  check(Boolean(r1.headers['ratelimit-reset']), 'RateLimit-Reset header is present');

  // Request 2: remaining = 1
  const r2 = await rateReq();
  check(r2.status === 200 && r2.headers['ratelimit-remaining'] === '1', 'Request 2 decrements remaining to 1');

  // Request 3: remaining = 0
  const r3 = await rateReq();
  check(r3.status === 200 && r3.headers['ratelimit-remaining'] === '0', 'Request 3 exhausts quota (remaining = 0)');

  // Request 4: triggers 429
  const r4 = await rateReq();
  check(r4.status === 429, 'Request 4 is throttled with HTTP 429');
  check(Boolean(r4.headers['retry-after']), 'HTTP 429 response includes Retry-After header');
  const r4Body = JSON.parse(r4.body);
  check(r4Body.error === 'Custom rate limit exceeded', 'Returns custom rate limit exceeded error payload');

  // Reset behavior
  testLimiter.resetAll();
  const rAfterReset = await rateReq();
  check(rAfterReset.status === 200 && rAfterReset.headers['ratelimit-remaining'] === '2', 'resetAll() clears store and restores quota');

  // 5.5 Production Safety: DISABLE_RATE_LIMITING cannot bypass in production
  const origEnv = process.env.NODE_ENV;
  const origBypass = process.env.DISABLE_RATE_LIMITING;
  try {
    process.env.NODE_ENV = 'production';
    process.env.DISABLE_RATE_LIMITING = 'true';

    testLimiter.resetAll();
    // Consume quota
    await rateReq();
    await rateReq();
    await rateReq();
    // 4th request must still be blocked in production despite DISABLE_RATE_LIMITING=true
    const rProdBypass = await rateReq();
    check(rProdBypass.status === 429, 'DISABLE_RATE_LIMITING=true is IGNORED when NODE_ENV=production');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.DISABLE_RATE_LIMITING = origBypass;
  }

  rateServer.close();

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('       SECURITY & HARDENING AUDIT SUMMARY REPORT');
  console.log('='.repeat(70));
  console.log(`  Total Checks Executed : ${totalTests}`);
  console.log(`  Passed Checks         : ${passedTests}`);
  console.log(`  Failed Checks         : ${failedTests}`);
  console.log('='.repeat(70));

  if (failedTests > 0) {
    console.error('\nFAILURES RECORDED:');
    failures.forEach(f => console.error(`  ❌ ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL SECURITY AUDIT TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
})();
