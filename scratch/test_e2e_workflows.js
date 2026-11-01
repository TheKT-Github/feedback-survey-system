/**
 * StyleSense AI — Hardened End-to-End Workflow Verification Suite
 * 
 * Verifies all 8 core workflows against the live running server:
 * 1. Customer feedback submission (POST /api/feedback)
 * 2. Public customer feedback search (GET /api/feedback?keyword=...)
 * 3. Administrator authentication (POST /api/admin/login)
 * 4. Executive analytics overview (GET /api/admin/analytics/overview)
 * 5. Complaint momentum and trends (GET /api/admin/analytics/complaint-trends)
 * 6. PDF executive report streaming (GET /api/admin/reports/feedback.pdf)
 * 7. CSV report export (GET /api/admin/reports/feedback.csv)
 * 8. AI zero-hallucination guardrail (POST /api/admin/ai/ask)
 * 
 * Requirements:
 * - Backend server running on http://localhost:3000
 * - MongoDB running and populated with base records
 * - Admin credentials configured in backend/.env
 * - Targeted cleanup: Deletes ONLY the temporary feedback record created in this run
 * 
 * Fails fast with non-zero exit code if ANY assertion fails.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Load environment configuration
const envPath = path.resolve(__dirname, '../backend/.env');
const altEnvPath = 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey/backend/.env';
const activeEnvPath = fs.existsSync(envPath) ? envPath : altEnvPath;

const env = {};
if (fs.existsSync(activeEnvPath)) {
  fs.readFileSync(activeEnvPath, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}

const PORT = env.PORT || 3000;
const HOST = 'localhost';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: HOST,
      port: PORT,
      ...options
    };
    const req = http.request(opts, (res) => {
      let body = Buffer.alloc(0);
      res.on('data', chunk => body = Buffer.concat([body, chunk]));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body.toString('utf8'),
          rawBody: body
        });
      });
    });
    req.on('error', (err) => {
      reject(new Error(`HTTP request failed to ${opts.method || 'GET'} ${opts.path}: ${err.message}`));
    });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('================================================================');
  console.log('   STYLESENSE AI: HARDENED END-TO-END WORKFLOW VERIFICATION     ');
  console.log('================================================================');
  console.log('  Target Endpoint : http://' + HOST + ':' + PORT);
  console.log('  Prerequisites   : Backend running, MongoDB active, Admin seeded');
  console.log('  Live AI Status  : Question 8 tests offline zero-evidence guard');
  console.log('================================================================\n');

  let createdFeedbackId = null;
  let adminToken = null;

  try {
    // -------------------------------------------------------------
    // Workflow 1: Customer Feedback Submission
    // -------------------------------------------------------------
    console.log('1. Testing Customer Feedback Submission (POST /api/feedback)...');
    const postFeedbackData = JSON.stringify({
      name: 'E2E Strict Verifier',
      email: 'e2e-verifier@stylefeedback.local',
      product: 'jeans',
      rating: 5,
      feedback: 'The denim jeans fit perfectly and the fabric material feels exceedingly premium.',
      recommend: true
    });

    const fbRes = await request({
      path: '/api/feedback',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postFeedbackData)
      }
    }, postFeedbackData);

    assert.strictEqual(fbRes.status, 201, `Expected status 201 from POST /api/feedback, got ${fbRes.status}: ${fbRes.body}`);
    assert.ok(fbRes.headers['content-type']?.includes('application/json'), 'Feedback response must be JSON');

    const fbJson = JSON.parse(fbRes.body);
    assert.ok(fbJson.success === true, 'Response must indicate success: true');
    assert.ok(fbJson.feedback && fbJson.feedback.id, 'Feedback ID must be present in response');
    assert.strictEqual(typeof fbJson.feedback.sentiment, 'string', 'Sentiment must be scored');
    assert.ok(Array.isArray(fbJson.feedback.aspects), 'Aspects must be an array');
    assert.ok(fbJson.feedback.aspects.length > 0, 'Aspects should detect at least one aspect');

    createdFeedbackId = fbJson.feedback.id;
    console.log(`   ✓ Created Feedback ID: ${createdFeedbackId}`);
    console.log(`   ✓ Detected Sentiment : ${fbJson.feedback.sentiment}`);
    console.log(`   ✓ Detected Aspects   : ${fbJson.feedback.aspects.map(a => a.name).join(', ')}`);

    // -------------------------------------------------------------
    // Workflow 2: Public Feedback Search
    // -------------------------------------------------------------
    console.log('\n2. Testing Public Feedback Search (GET /api/feedback?keyword=jeans)...');
    const searchRes = await request({ path: '/api/feedback?keyword=jeans', method: 'GET' });
    assert.strictEqual(searchRes.status, 200, `Expected status 200 from GET /api/feedback, got ${searchRes.status}`);
    assert.ok(searchRes.headers['content-type']?.includes('application/json'), 'Search response must be JSON');

    const searchJson = JSON.parse(searchRes.body);
    assert.ok(Array.isArray(searchJson.data), 'Search response data must be an array');
    assert.ok(searchJson.data.length > 0, 'Search must return at least 1 matching feedback record');
    console.log(`   ✓ Verified public search returned ${searchJson.data.length} records`);

    // -------------------------------------------------------------
    // Workflow 3: Admin Login & JWT Issuance
    // -------------------------------------------------------------
    console.log('\n3. Testing Admin Login (POST /api/admin/login)...');
    const loginData = JSON.stringify({
      email: env.ADMIN_EMAIL || 'admin@stylefeedback.com',
      password: env.ADMIN_PASSWORD || 'admin123'
    });
    const loginRes = await request({
      path: '/api/admin/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    }, loginData);

    assert.strictEqual(loginRes.status, 200, `Expected status 200 from admin login, got ${loginRes.status}: ${loginRes.body}`);
    const loginJson = JSON.parse(loginRes.body);
    assert.ok(typeof loginJson.token === 'string' && loginJson.token.length > 20, 'Admin login must return valid JWT token');
    adminToken = loginJson.token;
    const authHeaders = { Authorization: 'Bearer ' + adminToken };
    console.log('   ✓ Admin JWT successfully generated');

    // -------------------------------------------------------------
    // Workflow 4: Executive Analytics Overview
    // -------------------------------------------------------------
    console.log('\n4. Testing Analytics Overview (GET /api/admin/analytics/overview)...');
    const ovRes = await request({ path: '/api/admin/analytics/overview', method: 'GET', headers: authHeaders });
    assert.strictEqual(ovRes.status, 200, `Expected status 200 from analytics overview, got ${ovRes.status}`);
    const ovJson = JSON.parse(ovRes.body);
    assert.strictEqual(ovJson.success, true, 'Analytics overview must indicate success: true');
    assert.ok(typeof ovJson.data?.totalValidFeedback === 'number', 'totalValidFeedback must be numeric');
    assert.ok(typeof ovJson.data?.averageRating === 'number', 'averageRating must be numeric');
    console.log(`   ✓ Validated analytics: ${ovJson.data.totalValidFeedback} valid reviews, avg rating ${ovJson.data.averageRating}`);

    // -------------------------------------------------------------
    // Workflow 5: Complaint Momentum & Trends
    // -------------------------------------------------------------
    console.log('\n5. Testing Complaint Trends (GET /api/admin/analytics/complaint-trends?days=30)...');
    const ctRes = await request({ path: '/api/admin/analytics/complaint-trends?days=30', method: 'GET', headers: authHeaders });
    assert.strictEqual(ctRes.status, 200, `Expected status 200 from complaint trends, got ${ctRes.status}`);
    const ctJson = JSON.parse(ctRes.body);
    assert.strictEqual(ctJson.success, true, 'Complaint trends must indicate success: true');
    assert.ok(typeof ctJson.data?.meta?.hasSufficientData === 'boolean', 'hasSufficientData flag must be boolean');
    assert.ok(typeof ctJson.data?.meta?.currentPeriod?.totalReviews === 'number', 'current period totalReviews must be numeric');
    assert.ok(typeof ctJson.data?.meta?.previousPeriod?.totalReviews === 'number', 'previous period totalReviews must be numeric');
    console.log(`   ✓ Validated complaint trends: hasSufficientData=${ctJson.data.meta.hasSufficientData}, current=${ctJson.data.meta.currentPeriod.totalReviews}, prev=${ctJson.data.meta.previousPeriod.totalReviews}`);

    // -------------------------------------------------------------
    // Workflow 6: Executive PDF Export
    // -------------------------------------------------------------
    console.log('\n6. Testing Executive PDF Export (GET /api/admin/reports/feedback.pdf)...');
    const pdfRes = await request({ path: '/api/admin/reports/feedback.pdf', method: 'GET', headers: authHeaders });
    assert.strictEqual(pdfRes.status, 200, `Expected status 200 from PDF export, got ${pdfRes.status}`);
    assert.ok(pdfRes.headers['content-type']?.includes('application/pdf'), `Expected application/pdf Content-Type, got ${pdfRes.headers['content-type']}`);
    assert.strictEqual(pdfRes.rawBody?.slice(0, 4).toString(), '%PDF', 'PDF body must begin with %PDF magic header');
    assert.ok(pdfRes.rawBody?.length > 1000, `PDF size too small (${pdfRes.rawBody?.length} bytes)`);
    console.log(`   ✓ Validated streaming PDF: ${pdfRes.rawBody.length} bytes with valid %PDF signature`);

    // -------------------------------------------------------------
    // Workflow 7: Raw CSV Export
    // -------------------------------------------------------------
    console.log('\n7. Testing Raw CSV Export (GET /api/admin/reports/feedback.csv)...');
    const csvRes = await request({ path: '/api/admin/reports/feedback.csv', method: 'GET', headers: authHeaders });
    assert.strictEqual(csvRes.status, 200, `Expected status 200 from CSV export, got ${csvRes.status}`);
    assert.ok(csvRes.headers['content-type']?.includes('text/csv'), `Expected text/csv Content-Type, got ${csvRes.headers['content-type']}`);
    const csvContent = csvRes.rawBody.toString('utf8');
    assert.ok(csvContent.length > 50, 'CSV export content must not be empty');
    const csvLines = csvContent.trim().split('\n');
    assert.ok(csvLines.length >= 2, 'CSV must contain at least a header row and 1 data row');
    assert.ok(csvLines[0].toLowerCase().includes('feedback') || csvLines[0].toLowerCase().includes('id') || csvLines[0].toLowerCase().includes('product'), 'CSV header row must contain expected columns');
    console.log(`   ✓ Validated CSV export: ${csvContent.length} bytes, ${csvLines.length} lines`);

    // -------------------------------------------------------------
    // Workflow 8: AI Zero-Hallucination Guardrail
    // -------------------------------------------------------------
    console.log('\n8. Testing AI Zero-Hallucination Guard (POST /api/admin/ai/ask)...');
    const aiData = JSON.stringify({ question: 'What do customers say about rocket spacesuits in outer space?' });
    const aiRes = await request({
      path: '/api/admin/ai/ask',
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(aiData)
      }
    }, aiData);

    assert.strictEqual(aiRes.status, 200, `Expected status 200 from AI inquiry, got ${aiRes.status}: ${aiRes.body}`);
    const aiJson = JSON.parse(aiRes.body);
    assert.strictEqual(aiJson.success, true, 'AI endpoint must indicate success: true');
    assert.strictEqual(aiJson.data?.insufficientEvidence, true, 'insufficientEvidence flag must be true for ungrounded topic');
    assert.strictEqual(aiJson.data?.retrievedReviewCount, 0, 'retrievedReviewCount must be 0 for nonexistent subject');
    assert.ok(typeof aiJson.data?.answer === 'string' && aiJson.data.answer.trim().length > 0, 'AI response must contain a non-empty honest fallback answer');
    console.log('   ✓ Validated zero-hallucination guard: insufficientEvidence=true, zero reviews retrieved');
    console.log(`   ✓ Honest response: "${aiJson.data.answer}"`);

    // -------------------------------------------------------------
    // Targeted Cleanup: Remove ONLY the created feedback record
    // -------------------------------------------------------------
    if (createdFeedbackId) {
      console.log('\nPerforming targeted cleanup of test feedback record...');
      try {
        const backendDir = path.resolve(__dirname, '../backend');
        const mongoose = require(path.join(backendDir, 'node_modules/mongoose'));
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(env.MONGO_URI || 'mongodb://127.0.0.1:27017/feedbackSystem');
        }
        const Feedback = require(path.join(backendDir, 'models/Feedback'));
        const deleteResult = await Feedback.findByIdAndDelete(createdFeedbackId);
        if (deleteResult) {
          console.log(`   ✓ Cleaned up test record ID ${createdFeedbackId} (unrelated records preserved)`);
        }
        await mongoose.disconnect();
      } catch (cleanupErr) {
        console.warn(`   ⚠️ Non-fatal note: Direct cleanup encountered: ${cleanupErr.message}`);
      }
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 8 END-TO-END WORKFLOW CHECKS PASSED WITH STRICT ASSERTIONS');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ E2E ASSERTION FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
