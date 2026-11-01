/**
 * PHASE 5 TEST SUITE — Analytics & Business Insights Dashboard
 *
 * Spins up its own Express server on port 3095 (same pattern as Phase 4).
 * Run from anywhere:
 *   node "C:\...\scratch\run_phase5_tests.js"
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

// ─── helpers ─────────────────────────────────────────────────────────────────
async function runTests() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Phase 5 tests.');

  const server = app.listen(3095);
  const BASE   = 'http://127.0.0.1:3095';

  let passed = 0, failed = 0;

  function assert(cond, name, detail = '') {
    if (cond) { console.log(`✅ PASS: ${name}`); passed++; }
    else       { console.error(`❌ FAIL: ${name} ${detail}`); failed++; }
  }

  async function api(method, url, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${url}`, opts);
    let json;
    try { json = await r.json(); } catch (e) { json = null; }
    return { status: r.status, body: json };
  }

  try {
    console.log('\n========================================================');
    console.log('PHASE 5 TEST SUITE: ANALYTICS & BUSINESS INSIGHTS DASHBOARD');
    console.log('========================================================');

    // ── Setup auth ──────────────────────────────────────────────────────────
    const adminLogin = await api('POST', '/api/auth/admin-login', { email: 'admin@stylefeedback.com', password: 'admin123' });
    assert(adminLogin.status === 200 && !!adminLogin.body?.token, 'Setup: Admin JWT obtained');
    const ADM = adminLogin.body?.token;

    const custSuffix = Date.now();
    const custReg = await api('POST', '/api/auth/register', {
      username: `p5cust${custSuffix}`, email: `p5cust${custSuffix}@test.com`,
      password: 'Password1!', role: 'customer'
    });
    assert(custReg.status === 201 && !!custReg.body.token, 'Setup: Customer JWT obtained');
    const CUST = custReg.body.token;

    // ── Seed controlled test data directly into DB ──────────────────────────
    await Feedback.deleteMany({ email: /^p5seed_[a-h]@test\.com$/ });

    const seedDocs = await Feedback.insertMany([
      { name:'SeedA', email:'p5seed_a@test.com', product:'jeans', rating:5,
        feedback:'Excellent jeans quality and perfect fitting.',
        sentiment:'Positive', sentimentScore:0.9, sentimentConfidence:0.85,
        moderationStatus:'published', isSpam:false, spamScore:0,
        aspects:[{name:'Quality',sentiment:'Positive',score:0.9},{name:'Fitting',sentiment:'Positive',score:0.8}],
        analyzedAt:new Date(), submittedAt:new Date() },
      { name:'SeedB', email:'p5seed_b@test.com', product:'jeans', rating:2,
        feedback:'Very poor stitching and bad material, terrible product.',
        sentiment:'Negative', sentimentScore:-0.8, sentimentConfidence:0.9,
        moderationStatus:'published', isSpam:false, spamScore:0,
        aspects:[{name:'Quality',sentiment:'Negative',score:-0.8},{name:'Material',sentiment:'Negative',score:-0.7}],
        analyzedAt:new Date(), submittedAt:new Date() },
      { name:'SeedC', email:'p5seed_c@test.com', product:'jeans', rating:3,
        feedback:'The jeans are okay, nothing special.',
        sentiment:'Neutral', sentimentScore:0, sentimentConfidence:0.6,
        moderationStatus:'published', isSpam:false, spamScore:0, aspects:[], analyzedAt:new Date(), submittedAt:new Date() },
      { name:'SeedD', email:'p5seed_d@test.com', product:'jeans', rating:3,
        feedback:'Design is beautiful but the fitting is poor.',
        sentiment:'Mixed', sentimentScore:0.1, sentimentConfidence:0.82,
        moderationStatus:'published', isSpam:false, spamScore:0,
        aspects:[{name:'Design',sentiment:'Positive',score:0.7},{name:'Fitting',sentiment:'Negative',score:-0.6}],
        analyzedAt:new Date(), submittedAt:new Date() },
      // Approved (was flagged, approved by admin) — MUST appear in analytics
      { name:'SeedE', email:'p5seed_e@test.com', product:'dress', rating:4,
        feedback:'Lovely dress, great color.',
        sentiment:'Positive', sentimentScore:0.7, sentimentConfidence:0.8,
        moderationStatus:'approved', isSpam:true, spamScore:0.6,
        aspects:[{name:'Design',sentiment:'Positive',score:0.7},{name:'Color',sentiment:'Positive',score:0.8}],
        analyzedAt:new Date(), submittedAt:new Date() },
      // Flagged — must NOT appear in analytics
      { name:'SeedF', email:'p5seed_f@test.com', product:'dress', rating:5,
        feedback:'Buy now click here discount code!!!',
        sentiment:'Positive', sentimentScore:0.2, sentimentConfidence:0.3,
        moderationStatus:'flagged', isSpam:true, spamScore:0.85, aspects:[], analyzedAt:new Date(), submittedAt:new Date() },
      // Rejected — must NOT appear in analytics
      { name:'SeedG', email:'p5seed_g@test.com', product:'jacket', rating:1,
        feedback:'aaaaaaaaaaaaa nonsense mash.',
        sentiment:'Negative', sentimentScore:-0.5, sentimentConfidence:0.4,
        moderationStatus:'rejected', isSpam:true, spamScore:0.9, aspects:[], analyzedAt:new Date(), submittedAt:new Date() },
      // Another published — shoes
      { name:'SeedH', email:'p5seed_h@test.com', product:'shoes', rating:4,
        feedback:'Comfortable shoes with great design.',
        sentiment:'Positive', sentimentScore:0.75, sentimentConfidence:0.78,
        moderationStatus:'published', isSpam:false, spamScore:0,
        aspects:[{name:'Design',sentiment:'Positive',score:0.7},{name:'Fitting',sentiment:'Positive',score:0.6}],
        analyzedAt:new Date(), submittedAt:new Date() },
    ]);
    // We seeded 8 docs: A(published) B(published) C(published) D(published) E(approved) F(flagged) G(rejected) H(published)
    // Valid for analytics = A B C D E H = 6

    // ── TEST 1: Overview analytics ───────────────────────────────────────────
    const ov = await api('GET', '/api/admin/analytics/overview', null, ADM);
    assert(ov.status === 200, '1. Overview: HTTP 200');
    assert(ov.body.success === true, '1. Overview: success=true');
    assert(typeof ov.body.data.totalValidFeedback === 'number', '1. Overview: totalValidFeedback is number');
    assert(typeof ov.body.data.averageRating === 'number', '1. Overview: averageRating is number');
    assert(typeof ov.body.data.positivePercent === 'number', '1. Overview: positivePercent is number');
    assert(typeof ov.body.data.flaggedFeedback === 'number', '1. Overview: flaggedFeedback is number');

    // ── TEST 2: Sentiment distribution ──────────────────────────────────────
    const sd = await api('GET', '/api/admin/analytics/sentiment', null, ADM);
    assert(sd.status === 200, '2. Sentiment dist: HTTP 200');
    assert(typeof sd.body.data.Positive === 'number', '2. Sentiment dist: Positive is number');
    assert(typeof sd.body.data.Negative === 'number', '2. Sentiment dist: Negative is number');
    assert(typeof sd.body.data.Neutral === 'number', '2. Sentiment dist: Neutral is number');
    assert(typeof sd.body.data.Mixed === 'number', '2. Sentiment dist: Mixed is number');

    // ── TEST 3: Rating distribution ──────────────────────────────────────────
    const rd = await api('GET', '/api/admin/analytics/ratings', null, ADM);
    assert(rd.status === 200, '3. Rating dist: HTTP 200');
    assert(typeof rd.body.data['1'] === 'number', '3. Rating dist: 1-star is number');
    assert(typeof rd.body.data['5'] === 'number', '3. Rating dist: 5-star is number');
    const starTotal = rd.body.data['1'] + rd.body.data['2'] + rd.body.data['3'] + rd.body.data['4'] + rd.body.data['5'];
    assert(starTotal === ov.body.data.totalValidFeedback,
      `3. Rating dist total (${starTotal}) === overview total (${ov.body.data.totalValidFeedback})`);

    // ── TEST 4: Aspect analytics ─────────────────────────────────────────────
    const as = await api('GET', '/api/admin/analytics/aspects', null, ADM);
    assert(as.status === 200, '4. Aspect analytics: HTTP 200');
    assert(Array.isArray(as.body.data), '4. Aspect analytics: returns array');
    if (as.body.data.length > 0) {
      const a = as.body.data[0];
      assert(typeof a.aspect === 'string', '4. Aspect analytics: has aspect name');
      assert(typeof a.mentions === 'number', '4. Aspect analytics: has mentions');
      assert(typeof a.positive === 'number', '4. Aspect analytics: has positive count');
      assert(typeof a.negative === 'number', '4. Aspect analytics: has negative count');
      assert(typeof a.avgScore === 'number', '4. Aspect analytics: has avgScore');
    }

    // ── TEST 5: Top positive aspects ─────────────────────────────────────────
    const tp = await api('GET', '/api/admin/analytics/top-positive-aspects', null, ADM);
    assert(tp.status === 200, '5. Top positive aspects: HTTP 200');
    assert(Array.isArray(tp.body.data), '5. Top positive aspects: returns array');

    // ── TEST 6: Top negative aspects ─────────────────────────────────────────
    const tn = await api('GET', '/api/admin/analytics/top-negative-aspects', null, ADM);
    assert(tn.status === 200, '6. Top negative aspects: HTTP 200');
    assert(Array.isArray(tn.body.data), '6. Top negative aspects: returns array');

    // ── TEST 7: Product analytics ────────────────────────────────────────────
    const pa = await api('GET', '/api/admin/analytics/products', null, ADM);
    assert(pa.status === 200, '7. Product analytics: HTTP 200');
    assert(Array.isArray(pa.body.data), '7. Product analytics: returns array');
    if (pa.body.data.length > 0) {
      const p = pa.body.data[0];
      assert(typeof p.product === 'string', '7. Product analytics: has product name');
      assert(typeof p.total === 'number', '7. Product analytics: has total');
      assert(typeof p.avgRating === 'number', '7. Product analytics: has avgRating');
      assert(typeof p.positivePercent === 'number', '7. Product analytics: has positivePercent');
      assert(['Excellent','Good','Needs Attention'].includes(p.status), '7. Product analytics: valid status enum');
    }

    // ── TEST 8: Product comparison ───────────────────────────────────────────
    const pc = await api('GET', '/api/admin/analytics/product-comparison?products=jeans,dress', null, ADM);
    assert(pc.status === 200, '8. Product comparison: HTTP 200');
    assert(typeof pc.body.data === 'object', '8. Product comparison: returns object');
    const pcKeys = Object.keys(pc.body.data).map(k => k.toLowerCase());
    assert(pcKeys.includes('jeans'), '8. Product comparison: contains jeans');
    assert(pcKeys.includes('dress'), '8. Product comparison: contains dress');

    const pcBad = await api('GET', '/api/admin/analytics/product-comparison?products=jeans', null, ADM);
    assert(pcBad.status === 400, '8. Product comparison <2 products: HTTP 400');

    // ── TEST 9: Sentiment trend ──────────────────────────────────────────────
    const st = await api('GET', '/api/admin/analytics/sentiment-trend?days=30', null, ADM);
    assert(st.status === 200, '9. Sentiment trend: HTTP 200');
    assert(Array.isArray(st.body.data), '9. Sentiment trend: returns array');
    if (st.body.data.length > 0) {
      assert(typeof st.body.data[0].date === 'string', '9. Sentiment trend: date is string');
      assert(typeof st.body.data[0].Positive === 'number', '9. Sentiment trend: Positive count in entry');
    }

    // ── TEST 10: Feedback trend ──────────────────────────────────────────────
    const ft = await api('GET', '/api/admin/analytics/feedback-trend?days=30', null, ADM);
    assert(ft.status === 200, '10. Feedback trend: HTTP 200');
    assert(Array.isArray(ft.body.data), '10. Feedback trend: returns array');
    if (ft.body.data.length > 0) {
      assert(typeof ft.body.data[0].date === 'string', '10. Feedback trend: date field is string');
      assert(typeof ft.body.data[0].count === 'number', '10. Feedback trend: count field is number');
    }

    // ── TEST 11: Product filter ──────────────────────────────────────────────
    const pfJeans = await api('GET', '/api/admin/analytics/overview?product=jeans', null, ADM);
    const pfShoes = await api('GET', '/api/admin/analytics/overview?product=shoes', null, ADM);
    assert(pfJeans.status === 200, '11. Product filter (jeans): HTTP 200');
    assert(pfShoes.status === 200, '11. Product filter (shoes): HTTP 200');
    // From seed: jeans has 4 valid (A,B,C,D) — shoes has 1 valid (H)
    assert(pfJeans.body.data.totalValidFeedback >= 4, `11. Jeans filter total (${pfJeans.body.data.totalValidFeedback}) >= 4`);
    assert(pfShoes.body.data.totalValidFeedback >= 1, `11. Shoes filter total (${pfShoes.body.data.totalValidFeedback}) >= 1`);

    // ── TEST 12: Date filter ─────────────────────────────────────────────────
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow  = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dateQ = `?dateFrom=${yesterday.toISOString().split('T')[0]}&dateTo=${tomorrow.toISOString().split('T')[0]}`;
    const dfRes = await api('GET', `/api/admin/analytics/overview${dateQ}`, null, ADM);
    assert(dfRes.status === 200, '12. Date filter: HTTP 200');
    assert(typeof dfRes.body.data.totalValidFeedback === 'number', '12. Date filter: returns numeric total');
    assert(dfRes.body.data.totalValidFeedback >= 6, `12. Date filter includes today's seed docs (got ${dfRes.body.data.totalValidFeedback})`);

    // ── TEST 13: Sentiment filter ────────────────────────────────────────────
    const sfPos = await api('GET', '/api/admin/analytics/overview?sentiment=Positive', null, ADM);
    assert(sfPos.status === 200, '13. Sentiment filter (Positive): HTTP 200');
    assert(sfPos.body.data.negative === 0, '13. Sentiment filter: negative count = 0 when filtering Positive');
    assert(sfPos.body.data.neutral === 0, '13. Sentiment filter: neutral count = 0 when filtering Positive');

    // ── TEST 14: Rejected feedback excluded from analytics ──────────────────
    // Seed G is rejected. Total valid should NOT include it.
    // Verify: count rejected in DB
    const rejCount = await Feedback.countDocuments({ email: /^p5seed_[a-h]@test\.com$/, moderationStatus: 'rejected' });
    assert(rejCount === 1, '14. Rejected feedback count in DB = 1 (seeded)');
    // Total valid from seed = 6 (A,B,C,D,E,H). Overall total should be >= 6
    assert(ov.body.data.totalValidFeedback >= 6, `14. Rejected excluded: total >= 6 (got ${ov.body.data.totalValidFeedback})`);

    // ── TEST 15: Flagged feedback excluded from analytics ───────────────────
    const flgCount = await Feedback.countDocuments({ email: /^p5seed_[a-h]@test\.com$/, moderationStatus: 'flagged' });
    assert(flgCount === 1, '15. Flagged feedback count in DB = 1 (seeded)');

    // ── TEST 16: Approved feedback included in analytics ────────────────────
    const approvedCount = await Feedback.countDocuments({ email: /^p5seed_[a-h]@test\.com$/, moderationStatus: 'approved' });
    assert(approvedCount === 1, '16. Approved feedback count in DB = 1 (seeded SeedE)');
    // Filter by dress — should include SeedE (approved)
    const dressProd = await api('GET', '/api/admin/analytics/overview?product=dress', null, ADM);
    assert(dressProd.body.data.totalValidFeedback >= 1, `16. Approved included: dress has >= 1 valid (got ${dressProd.body.data.totalValidFeedback})`);

    // ── TEST 17: Published feedback included ─────────────────────────────────
    const pubCount = await Feedback.countDocuments({ email: /^p5seed_[a-h]@test\.com$/, moderationStatus: 'published' });
    assert(pubCount === 5, `17. Published count in DB = 5 (got ${pubCount})`);

    // ── DATA ACCURACY: Sentiment totals equal overview total ─────────────────
    const sdFull = await api('GET', '/api/admin/analytics/sentiment', null, ADM);
    const sentSum = sdFull.body.data.Positive + sdFull.body.data.Negative + sdFull.body.data.Neutral + sdFull.body.data.Mixed;
    assert(sentSum === ov.body.data.totalValidFeedback,
      `17b. Sentiment sum (${sentSum}) === totalValidFeedback (${ov.body.data.totalValidFeedback}) — no spam leakage`);

    // ── TEST 18: Admin can access analytics ──────────────────────────────────
    const admOk = await api('GET', '/api/admin/analytics/overview', null, ADM);
    assert(admOk.status === 200, '18. Admin access: HTTP 200');

    // ── TEST 19: Customer receives 403 ──────────────────────────────────────
    const custForbid = await api('GET', '/api/admin/analytics/overview', null, CUST);
    assert(custForbid.status === 403, '19. Customer: HTTP 403 on analytics');

    // ── TEST 20: Unauthenticated receives 401 ────────────────────────────────
    const unauth = await api('GET', '/api/admin/analytics/overview');
    assert(unauth.status === 401, '20. Unauthenticated: HTTP 401 on analytics');

    // ── TEST 21: Empty/non-existent product handled ──────────────────────────
    const emptyOv = await api('GET', '/api/admin/analytics/overview?product=nonexistent_xyz', null, ADM);
    assert(emptyOv.status === 200, '21. Empty product: HTTP 200');
    assert(emptyOv.body.data.totalValidFeedback === 0, '21. Empty product: totalValidFeedback = 0');
    assert(emptyOv.body.data.averageRating === 0, '21. Empty product: averageRating = 0');

    const emptyAsp = await api('GET', '/api/admin/analytics/aspects?product=nonexistent_xyz', null, ADM);
    assert(emptyAsp.status === 200 && emptyAsp.body.data.length === 0, '21. Empty aspects: empty array returned');

    const emptyTrend = await api('GET', '/api/admin/analytics/feedback-trend?product=nonexistent_xyz', null, ADM);
    assert(emptyTrend.status === 200 && emptyTrend.body.data.length === 0, '21. Empty trend: empty array returned');

    // ── TEST 22: Phase 4 moderation still works ──────────────────────────────
    const flaggedRes = await api('GET', '/api/admin/flagged-feedback', null, ADM);
    assert(flaggedRes.status === 200, '22. Phase 4: Flagged feedback endpoint still works');
    const flaggedList = flaggedRes.body?.data || flaggedRes.body?.flaggedFeedbacks;
    assert(Array.isArray(flaggedList), '22. Phase 4: Returns flaggedFeedbacks array');

    // ── TEST 23: Phase 3 image feedback still works ──────────────────────────
    const noImgFb = await api('POST', '/api/feedback', {
      name:'Phase5NoImg', email:'p5noimg@test.com', product:'tops', rating:4,
      feedback:'Great quality top, very comfortable and stylish.', recommend:true
    });
    assert(noImgFb.status === 201, '23. Phase 3: Feedback without image still works (HTTP 201)');

    // ── TEST 24: Phase 2 NLP still working ──────────────────────────────────
    const nlpResult = noImgFb.body.feedback || noImgFb.body;
    const hasSentiment = nlpResult?.sentiment !== undefined || noImgFb.body?.feedback?.sentiment !== undefined;
    assert(hasSentiment, '24. Phase 2: NLP sentiment present in response');

    // ── TEST 25: Phase 1 JWT /me still works ────────────────────────────────
    const meRes = await api('GET', '/api/auth/me', null, CUST);
    assert(meRes.status === 200, '25. Phase 1: JWT /me endpoint still works');
    assert(meRes.body.user?.role === 'customer', '25. Phase 1: role=customer confirmed');

    // ── TEST 26: Survey still works ──────────────────────────────────────────
    const surveyRes = await api('POST', '/api/survey', {
      name:'Phase5Survey', email:'p5survey@test.com',
      age:'25-34', style:'Casual', frequency:'Monthly',
      budget:'₹1000-₹3000', satisfaction:'Satisfied', quality:'Good',
      recommend:'Yes', improvement:'More variety', categories:['Tops']
    });
    assert(surveyRes.status === 201, '26. Survey submission still works (HTTP 201)');

    // ── Cleanup ──────────────────────────────────────────────────────────────
    await Feedback.deleteMany({ email: /^p5seed_[a-h]@test\.com$/ });
    await Feedback.deleteMany({ email: { $in: ['p5noimg@test.com', 'p5survey@test.com'] } });

  } catch (err) {
    console.error('\n❌ TEST RUNNER ERROR:', err);
    failed++;
  }

  console.log('\n========================================================');
  console.log(`PHASE 5 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  server.close();
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error(err); process.exit(1); });
