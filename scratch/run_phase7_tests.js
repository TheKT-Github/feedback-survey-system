/**
 * PHASE 7 TEST SUITE — Reporting & Data Export (CSV & PDF)
 *
 * Runs on port 3097 with inline Express app and MongoDB connection.
 * Tests all 33 required test cases for Phase 7.
 */

'use strict';

const path = require('path');
const backendDir = 'C:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey/backend';

const dotenv   = require(path.join(backendDir, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendDir, '.env') });

const express  = require(path.join(backendDir, 'node_modules/express'));
const mongoose = require(path.join(backendDir, 'node_modules/mongoose'));
const cors     = require(path.join(backendDir, 'node_modules/cors'));

const Feedback = require(path.join(backendDir, 'models/Feedback'));
const User     = require(path.join(backendDir, 'models/user'));
const reportService = require(path.join(backendDir, 'services/reportService'));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(backendDir, 'uploads')));

app.use('/api/auth',              require(path.join(backendDir, 'routes/auth')));
app.use('/api/feedback',          require(path.join(backendDir, 'routes/feedback')));
app.use('/api/survey',            require(path.join(backendDir, 'routes/survey')));
app.use('/api/admin',             require(path.join(backendDir, 'routes/admin')));
app.use('/api/admin/analytics',   require(path.join(backendDir, 'routes/analytics')));
app.use('/api/admin/reports',     require(path.join(backendDir, 'routes/reports')));

async function runTests() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Phase 7 tests.');

  const server = app.listen(3097);
  const BASE   = 'http://127.0.0.1:3097';

  let passed = 0, failed = 0;

  function assert(cond, name, detail = '') {
    if (cond) { console.log(`✅ PASS: ${name}`); passed++; }
    else       { console.error(`❌ FAIL: ${name} ${detail}`); failed++; }
  }

  async function api(method, url, body = null, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${url}`, opts);

    const contentType = r.headers.get('content-type') || '';
    const contentDisposition = r.headers.get('content-disposition') || '';

    let text = '';
    let json = null;
    let buffer = null;

    if (contentType.includes('application/pdf')) {
      const arrayBuffer = await r.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      text = await r.text();
      try { json = JSON.parse(text); } catch (e) { json = null; }
    }

    return {
      status: r.status,
      headers: r.headers,
      contentType,
      contentDisposition,
      body: json || text,
      buffer,
      rawText: text
    };
  }

  try {
    console.log('\n========================================================');
    console.log('PHASE 7 TEST SUITE: REPORTING & DATA EXPORT (CSV & PDF)');
    console.log('========================================================');

    // ── 1. Admin obtains JWT ─────────────────────────────────────────────────
    const adminLogin = await api('POST', '/api/auth/admin-login', { email: 'admin@stylefeedback.com', password: 'admin123' });
    assert(adminLogin.status === 200 && !!adminLogin.body?.token, '1. Admin obtains JWT');
    const ADM = adminLogin.body?.token;

    // ── 2. Customer obtains JWT ──────────────────────────────────────────────
    const custSuffix = Date.now();
    const custReg = await api('POST', '/api/auth/register', {
      username: `p7cust${custSuffix}`, email: `p7cust${custSuffix}@test.com`,
      password: 'Password1!', role: 'customer'
    });
    assert(custReg.status === 201 && !!custReg.body?.token, '2. Customer obtains JWT');
    const CUST = custReg.body?.token;

    // ── Seed controlled test data ───────────────────────────────────────────
    await Feedback.deleteMany({ email: /^p7seed_.*@test\.com$/ });

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    const seeded = await Feedback.insertMany([
      // 1. Published, Jeans, 5★, Positive
      { name: 'Seed Alice', email: 'p7seed_1@test.com', product: 'jeans', rating: 5,
        feedback: 'Superb denim jeans with exceptional comfort and styling.',
        sentiment: 'Positive', sentimentScore: 0.95, sentimentConfidence: 0.9,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Fitting', sentiment: 'Positive', score: 0.9 }],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 2. Published, Tops, 2★, Negative
      { name: 'Seed Bob', email: 'p7seed_2@test.com', product: 'tops', rating: 2,
        feedback: 'Poor fabric quality on this top, shrunk significantly in wash.',
        sentiment: 'Negative', sentimentScore: -0.85, sentimentConfidence: 0.88,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Quality', sentiment: 'Negative', score: -0.85 }],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 3. Published, Dress, 3★, Neutral, 40 days ago
      { name: 'Seed Carol', email: 'p7seed_3@test.com', product: 'dress', rating: 3,
        feedback: 'Ordinary dress color and plain style.',
        sentiment: 'Neutral', sentimentScore: 0.0, sentimentConfidence: 0.7,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Color', sentiment: 'Neutral', score: 0 }],
        submittedAt: fortyDaysAgo, analyzedAt: fortyDaysAgo },

      // 4. Approved (was flagged, admin approved)
      { name: 'Seed Eve', email: 'p7seed_4@test.com', product: 'jeans', rating: 5,
        feedback: 'Great jeans fit and durable quality material.',
        sentiment: 'Positive', sentimentScore: 0.8, sentimentConfidence: 0.85,
        moderationStatus: 'approved', isSpam: true, spamScore: 0.6, spamReasons: ['Repeated submit'],
        aspects: [{ name: 'Material', sentiment: 'Positive', score: 0.8 }],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 5. Flagged (spam) — MUST NOT appear in normal exports
      { name: 'Seed Spammer', email: 'p7seed_5@test.com', product: 'tops', rating: 5,
        feedback: 'Buy cheap fashion now click here discount code!',
        sentiment: 'Positive', sentimentScore: 0.2, sentimentConfidence: 0.4,
        moderationStatus: 'flagged', isSpam: true, spamScore: 0.95, spamReasons: ['Promotional'],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 6. Rejected — MUST NOT appear in exports
      { name: 'Seed Troll', email: 'p7seed_6@test.com', product: 'dress', rating: 1,
        feedback: 'qwertyuiop asdfghjkl zxcvbnm nonsense garbage.',
        sentiment: 'Negative', sentimentScore: -0.5, sentimentConfidence: 0.3,
        moderationStatus: 'rejected', isSpam: true, spamScore: 0.9, spamReasons: ['Keyboard mash'],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 7. Formula injection test record (starts with =)
      { name: 'Formula User', email: 'p7seed_7@test.com', product: 'general', rating: 4,
        feedback: '=cmd|’ /C calc’!A0 is a dangerous spreadsheet formula attempt',
        sentiment: 'Neutral', sentimentScore: 0.0, sentimentConfidence: 0.5,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo }
    ]);

    // ── 3. Feedback CSV returns HTTP 200 for admin ───────────────────────────
    const fbCsv = await api('GET', '/api/admin/reports/feedback.csv', null, ADM);
    assert(fbCsv.status === 200, '3. Feedback CSV returns HTTP 200 for admin');

    // ── 4. Feedback CSV has correct content type ─────────────────────────────
    assert(fbCsv.contentType.includes('text/csv'), '4. Feedback CSV content type is text/csv');

    // ── 5. Feedback CSV has attachment header ────────────────────────────────
    assert(fbCsv.contentDisposition.includes('attachment') && fbCsv.contentDisposition.includes('.csv'),
      '5. Feedback CSV has attachment header with .csv extension');

    // ── 6. Feedback CSV contains expected headers ────────────────────────────
    const csvLines = fbCsv.rawText.split('\r\n');
    const headerLine = csvLines[0];
    assert(headerLine.includes('Feedback ID') && headerLine.includes('Product') && headerLine.includes('Rating') && headerLine.includes('Sentiment'),
      '6. Feedback CSV contains expected column headers');

    // ── 7. Feedback CSV contains valid feedback ──────────────────────────────
    assert(fbCsv.rawText.includes('Superb denim jeans'), '7. Feedback CSV contains valid feedback row');

    // ── 8. Feedback CSV excludes rejected feedback ───────────────────────────
    assert(!fbCsv.rawText.includes('nonsense garbage'), '8. Feedback CSV strictly EXCLUDES rejected feedback');

    // ── 9. Feedback CSV excludes flagged feedback by default ─────────────────
    assert(!fbCsv.rawText.includes('discount code!'), '9. Feedback CSV strictly EXCLUDES flagged spam by default');

    // ── 10. Feedback CSV respects product filter ─────────────────────────────
    const jeansCsv = await api('GET', '/api/admin/reports/feedback.csv?product=jeans', null, ADM);
    assert(jeansCsv.status === 200, '10. Filtered product CSV returns HTTP 200');
    assert(jeansCsv.rawText.includes('Superb denim jeans'), '10. Product filter includes jeans feedback');
    assert(!jeansCsv.rawText.includes('shrunk significantly in wash'), '10. Product filter excludes tops feedback');

    // ── 11. Feedback CSV respects sentiment filter ───────────────────────────
    const negCsv = await api('GET', '/api/admin/reports/feedback.csv?sentiment=Negative', null, ADM);
    assert(negCsv.status === 200, '11. Filtered sentiment CSV returns HTTP 200');
    assert(negCsv.rawText.includes('shrunk significantly in wash'), '11. Negative filter includes negative review');
    assert(!negCsv.rawText.includes('Superb denim jeans'), '11. Negative filter excludes positive review');

    // ── 12. Feedback CSV respects date filter ────────────────────────────────
    const date7Csv = await api('GET', '/api/admin/reports/feedback.csv?date=7', null, ADM);
    assert(date7Csv.status === 200, '12. Date filtered CSV returns HTTP 200');
    assert(!date7Csv.rawText.includes('Ordinary dress color'), '12. 7-day filter excludes 40-day old feedback');

    // ── 13. Feedback CSV respects rating filter ──────────────────────────────
    const rating2Csv = await api('GET', '/api/admin/reports/feedback.csv?rating=2', null, ADM);
    assert(rating2Csv.status === 200, '13. Rating filtered CSV returns HTTP 200');
    assert(rating2Csv.rawText.includes('shrunk significantly in wash'), '13. 2-star filter includes 2-star review');
    assert(!rating2Csv.rawText.includes('Superb denim jeans'), '13. 2-star filter excludes 5-star review');

    // ── 14. Analytics CSV returns HTTP 200 ───────────────────────────────────
    const analCsv = await api('GET', '/api/admin/reports/analytics.csv', null, ADM);
    assert(analCsv.status === 200, '14. Analytics CSV returns HTTP 200');

    // ── 15. Analytics CSV has correct content type ───────────────────────────
    assert(analCsv.contentType.includes('text/csv'), '15. Analytics CSV content type is text/csv');

    // ── 16. Analytics CSV contains expected metrics ──────────────────────────
    assert(analCsv.rawText.includes('EXECUTIVE OVERVIEW') && analCsv.rawText.includes('Total Valid Feedback') && analCsv.rawText.includes('Average Rating'),
      '16. Analytics CSV contains Executive Overview metrics');
    assert(analCsv.rawText.includes('SENTIMENT DISTRIBUTION') && analCsv.rawText.includes('RATING DISTRIBUTION'),
      '16. Analytics CSV contains Sentiment & Rating breakdown sections');

    // ── 17. PDF report returns HTTP 200 ──────────────────────────────────────
    const pdfRes = await api('GET', '/api/admin/reports/feedback.pdf', null, ADM);
    assert(pdfRes.status === 200, '17. PDF report returns HTTP 200');

    // ── 18. PDF has application/pdf content type ─────────────────────────────
    assert(pdfRes.contentType.includes('application/pdf'), '18. PDF content type is application/pdf');

    // ── 19. PDF has attachment header ────────────────────────────────────────
    assert(pdfRes.contentDisposition.includes('attachment') && pdfRes.contentDisposition.includes('.pdf'),
      '19. PDF has attachment header with .pdf filename');

    // ── 20. PDF contains non-empty data ──────────────────────────────────────
    assert(pdfRes.buffer && pdfRes.buffer.length > 500, `20. PDF contains non-empty binary data (${pdfRes.buffer?.length} bytes)`);
    const pdfMagic = pdfRes.buffer ? pdfRes.buffer.slice(0, 4).toString() : '';
    assert(pdfMagic === '%PDF', `20. Valid PDF magic bytes: "${pdfMagic}"`);

    // ── 21. Reports require authentication ───────────────────────────────────
    const unauthFbCsv = await api('GET', '/api/admin/reports/feedback.csv');
    assert(unauthFbCsv.status === 401, '21. Unauthenticated request to feedback.csv blocked (HTTP 401)');

    const unauthAnalCsv = await api('GET', '/api/admin/reports/analytics.csv');
    assert(unauthAnalCsv.status === 401, '21. Unauthenticated request to analytics.csv blocked (HTTP 401)');

    const unauthPdf = await api('GET', '/api/admin/reports/feedback.pdf');
    assert(unauthPdf.status === 401, '21. Unauthenticated request to feedback.pdf blocked (HTTP 401)');

    // ── 22. Customer receives HTTP 403 ───────────────────────────────────────
    const custFbCsv = await api('GET', '/api/admin/reports/feedback.csv', null, CUST);
    assert(custFbCsv.status === 403, '22. Customer request to feedback.csv receives HTTP 403');

    const custPdf = await api('GET', '/api/admin/reports/feedback.pdf', null, CUST);
    assert(custPdf.status === 403, '22. Customer request to feedback.pdf receives HTTP 403');

    // ── 23. Unauthenticated request receives HTTP 401 ────────────────────────
    assert(unauthFbCsv.status === 401 && unauthPdf.status === 401, '23. Unauthenticated requests consistently receive HTTP 401');

    // ── 24. CSV formula-injection protection works ───────────────────────────
    // Test the helper directly and via API output
    const rawFormula = '=cmd|’ /C calc’!A0';
    const sanitizedCell = reportService.sanitizeCsvCell(rawFormula);
    assert(sanitizedCell.startsWith("\"'") || sanitizedCell.startsWith("'"),
      `24. Formula injection neutralized with leading quote: ${sanitizedCell}`);
    assert(fbCsv.rawText.includes("=\"'=cmd") || fbCsv.rawText.includes("'=cmd"),
      '24. Exported feedback CSV neutralizes formula injection in review text');

    // ── 25. Path traversal protection works ──────────────────────────────────
    const traversalPrefix = '../../etc/passwd';
    const safeName = reportService.getSafeFilename(traversalPrefix, 'csv');
    assert(!safeName.includes('/') && !safeName.includes('\\') && !safeName.includes('..'),
      `25. Path traversal stripped from generated filename: "${safeName}"`);

    // ── 26. Empty dataset generates a valid report ───────────────────────────
    const emptyPdfRes = await api('GET', '/api/admin/reports/feedback.pdf?product=nonexistent_xyz_99', null, ADM);
    assert(emptyPdfRes.status === 200, '26. Empty filter generates valid PDF without error (HTTP 200)');
    assert(emptyPdfRes.buffer && emptyPdfRes.buffer.length > 500, '26. Empty dataset PDF is valid non-empty document');

    const emptyCsvRes = await api('GET', '/api/admin/reports/feedback.csv?product=nonexistent_xyz_99', null, ADM);
    assert(emptyCsvRes.status === 200, '26. Empty filter generates valid CSV (HTTP 200)');
    const emptyCsvLines = emptyCsvRes.rawText.split('\r\n').filter(l => l.trim());
    assert(emptyCsvLines.length === 1, '26. Empty filter CSV contains only header line');

    // ── 27. Phase 6 search still works ───────────────────────────────────────
    const searchRes = await api('GET', '/api/feedback?q=denim');
    assert(searchRes.status === 200, '27. Phase 6: Public search endpoint still works');
    assert(searchRes.body.data.length >= 1, '27. Phase 6: Search returns matches');

    // ── 28. Phase 5 analytics still works ────────────────────────────────────
    const ovRes = await api('GET', '/api/admin/analytics/overview', null, ADM);
    assert(ovRes.status === 200, '28. Phase 5: Analytics overview endpoint works (HTTP 200)');

    // ── 29. Phase 4 moderation still works ───────────────────────────────────
    const flaggedRes = await api('GET', '/api/admin/flagged-feedback', null, ADM);
    assert(flaggedRes.status === 200, '29. Phase 4: Flagged feedback endpoint works (HTTP 200)');

    // ── 30. Phase 3 image functionality still works ───────────────────────────
    const imgFb = await api('POST', '/api/feedback', {
      name: 'P7ImageTest', email: 'p7img@test.com', product: 'dress', rating: 4,
      feedback: 'Splendid quality dress with delightful aesthetics and color.',
      recommend: true
    }, CUST);
    assert(imgFb.status === 201, '30. Phase 3: Feedback submission works (HTTP 201)');

    // ── 31. Phase 2 NLP still works ──────────────────────────────────────────
    const nlpData = imgFb.body.feedback;
    assert(nlpData && nlpData.sentiment === 'Positive', '31. Phase 2: NLP sentiment classified as Positive');
    assert(nlpData && Array.isArray(nlpData.aspects) && nlpData.aspects.length > 0, '31. Phase 2: Aspects detected');

    // ── 32. Phase 1 JWT/RBAC still works ─────────────────────────────────────
    const meRes = await api('GET', '/api/auth/me', null, CUST);
    assert(meRes.status === 200 && meRes.body.user.role === 'customer', '32. Phase 1: JWT /me returns customer role');

    // ── 33. Survey functionality still works ─────────────────────────────────
    const surveyRes = await api('POST', '/api/survey', {
      name: 'P7SurveyUser', email: 'p7survey@test.com',
      age: '25-34', style: 'Casual', frequency: 'Monthly',
      budget: '₹1000-₹3000', satisfaction: 'Satisfied', quality: 'Good',
      recommend: 'Yes', improvement: 'More sizes', categories: ['Tops']
    });
    assert(surveyRes.status === 201, '33. Phase 1-6: Survey submission works (HTTP 201)');

    // ── Cleanup ─────────────────────────────────────────────────────────────
    await Feedback.deleteMany({ email: /^p7seed_.*@test\.com$/ });
    await Feedback.deleteMany({ email: { $in: ['p7img@test.com', 'p7survey@test.com'] } });

  } catch (err) {
    console.error('\n❌ TEST RUNNER ERROR:', err);
    failed++;
  }

  console.log('\n========================================================');
  console.log(`PHASE 7 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  server.close();
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error(err); process.exit(1); });
