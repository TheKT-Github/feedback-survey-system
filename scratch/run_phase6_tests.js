/**
 * PHASE 6 TEST SUITE — Advanced Search, Filtering & Feedback Intelligence UX
 *
 * Runs on port 3096 with inline Express app and MongoDB connection.
 * Tests all 36 required test cases for Phase 6.
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

async function runTests() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Phase 6 tests.');

  const server = app.listen(3096);
  const BASE   = 'http://127.0.0.1:3096';

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
    console.log('PHASE 6 TEST SUITE: ADVANCED SEARCH & FEEDBACK INTELLIGENCE');
    console.log('========================================================');

    // ── Setup auth ──────────────────────────────────────────────────────────
    const adminLogin = await api('POST', '/api/auth/admin-login', { email: 'admin@stylefeedback.com', password: 'admin123' });
    assert(adminLogin.status === 200 && !!adminLogin.body?.token, 'Setup: Admin JWT obtained');
    const ADM = adminLogin.body?.token;

    const custSuffix = Date.now();
    const custReg = await api('POST', '/api/auth/register', {
      username: `p6cust${custSuffix}`, email: `p6cust${custSuffix}@test.com`,
      password: 'Password1!', role: 'customer'
    });
    assert(custReg.status === 201 && !!custReg.body?.token, 'Setup: Customer JWT obtained');
    const CUST = custReg.body?.token;

    // ── Seed controlled test data ───────────────────────────────────────────
    await Feedback.deleteMany({ email: /^p6seed_.*@test\.com$/ });

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    const seeded = await Feedback.insertMany([
      // 1. Published, Jeans, 5★, Positive, Fitting aspect, 2 days ago
      { name: 'Alice Walker', email: 'p6seed_1@test.com', product: 'jeans', rating: 5,
        feedback: 'The denim jeans fitting is truly extraordinary and comfortable.',
        sentiment: 'Positive', sentimentScore: 0.95, sentimentConfidence: 0.9,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Fitting', sentiment: 'Positive', score: 0.9 }],
        imagePath: '/uploads/sample_jeans.jpg',
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 2. Published, Tops, 2★, Negative, Quality aspect, 10 days ago
      { name: 'Bob Smith', email: 'p6seed_2@test.com', product: 'tops', rating: 2,
        feedback: 'Disappointing fabric quality on this top, tore after first gentle wash.',
        sentiment: 'Negative', sentimentScore: -0.85, sentimentConfidence: 0.88,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Quality', sentiment: 'Negative', score: -0.85 }],
        imagePath: null,
        submittedAt: tenDaysAgo, analyzedAt: tenDaysAgo },

      // 3. Published, Dress, 3★, Neutral, Color aspect, 40 days ago
      { name: 'Carol Danvers', email: 'p6seed_3@test.com', product: 'dress', rating: 3,
        feedback: 'The dress color is standard black, nothing special or exciting.',
        sentiment: 'Neutral', sentimentScore: 0.0, sentimentConfidence: 0.7,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [{ name: 'Color', sentiment: 'Neutral', score: 0 }],
        imagePath: null,
        submittedAt: fortyDaysAgo, analyzedAt: fortyDaysAgo },

      // 4. Published, Shoes, 4★, Mixed, Design + Fitting aspects, 2 days ago
      { name: 'David Miller', email: 'p6seed_4@test.com', product: 'shoes', rating: 4,
        feedback: 'Magnificent aesthetic design but the shoe fitting is somewhat tight.',
        sentiment: 'Mixed', sentimentScore: 0.2, sentimentConfidence: 0.84,
        moderationStatus: 'published', isSpam: false, spamScore: 0,
        aspects: [
          { name: 'Design', sentiment: 'Positive', score: 0.8 },
          { name: 'Fitting', sentiment: 'Negative', score: -0.6 }
        ],
        imagePath: null,
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 5. Approved (previously flagged, approved by admin), Jeans, 5★, Positive, Material aspect, 2 days ago
      { name: 'Eve Adams', email: 'p6seed_5@test.com', product: 'jeans', rating: 5,
        feedback: 'Premium organic cotton material jeans, worth every single rupee.',
        sentiment: 'Positive', sentimentScore: 0.9, sentimentConfidence: 0.85,
        moderationStatus: 'approved', isSpam: true, spamScore: 0.65, spamReasons: ['Similar wording'],
        aspects: [{ name: 'Material', sentiment: 'Positive', score: 0.9 }],
        imagePath: null,
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 6. Flagged (spam) — MUST NOT appear in public search
      { name: 'Spammer Guy', email: 'p6seed_6@test.com', product: 'tops', rating: 5,
        feedback: 'Buy cheap fashion now click here http://spamdeals.xyz discount code!',
        sentiment: 'Positive', sentimentScore: 0.3, sentimentConfidence: 0.4,
        moderationStatus: 'flagged', isSpam: true, spamScore: 0.95, spamReasons: ['Suspicious URL', 'Promotional phrase'],
        aspects: [],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },

      // 7. Rejected — MUST NOT appear in public search
      { name: 'Troll User', email: 'p6seed_7@test.com', product: 'dress', rating: 1,
        feedback: 'asdfghjklqwerty zxcvbnm complete gibberish nonsense.',
        sentiment: 'Negative', sentimentScore: -0.5, sentimentConfidence: 0.3,
        moderationStatus: 'rejected', isSpam: true, spamScore: 0.9, spamReasons: ['Keyboard mash'],
        aspects: [],
        submittedAt: twoDaysAgo, analyzedAt: twoDaysAgo },
    ]);

    // ── 1. Basic feedback GET ───────────────────────────────────────────────
    const basicGet = await api('GET', '/api/feedback');
    assert(basicGet.status === 200, '1. Basic feedback GET returns HTTP 200');
    assert(basicGet.body.success === true, '1. Basic feedback GET success = true');
    assert(Array.isArray(basicGet.body.data), '1. Basic feedback GET returns data array');
    assert(typeof basicGet.body.pagination === 'object', '1. Basic feedback GET includes pagination object');

    // ── 2. Text search ──────────────────────────────────────────────────────
    const textSearch = await api('GET', '/api/feedback?q=denim');
    assert(textSearch.status === 200, '2. Text search returns HTTP 200');
    assert(textSearch.body.data.length >= 1, '2. Text search finds matching review ("denim")');
    assert(textSearch.body.data.some(d => d.feedback.toLowerCase().includes('denim')), '2. Matched review contains search term');

    // ── 3. Case-insensitive search ──────────────────────────────────────────
    const caseSearchUpper = await api('GET', '/api/feedback?q=DENIM');
    const caseSearchLower = await api('GET', '/api/feedback?q=denim');
    assert(caseSearchUpper.status === 200, '3. Case-insensitive search: uppercase query returns HTTP 200');
    assert(caseSearchUpper.body.data.length === caseSearchLower.body.data.length,
      `3. Uppercase & lowercase queries return identical count (${caseSearchUpper.body.data.length})`);

    // ── 4. Product filter ───────────────────────────────────────────────────
    const prodFilter = await api('GET', '/api/feedback?product=jeans');
    assert(prodFilter.status === 200, '4. Product filter returns HTTP 200');
    assert(prodFilter.body.data.length >= 2, '4. Product filter returns jeans (at least seeded items)');
    assert(prodFilter.body.data.every(d => d.product.toLowerCase() === 'jeans'), '4. All results match filtered product');

    // ── 5. Sentiment filter ─────────────────────────────────────────────────
    const sentFilter = await api('GET', '/api/feedback?sentiment=Positive');
    assert(sentFilter.status === 200, '5. Sentiment filter returns HTTP 200');
    assert(sentFilter.body.data.length >= 2, '5. Sentiment filter returns Positive items');
    assert(sentFilter.body.data.every(d => d.sentiment === 'Positive'), '5. All returned items have Positive sentiment');

    // ── 6. Rating filter ────────────────────────────────────────────────────
    const ratingFilter = await api('GET', '/api/feedback?rating=2');
    assert(ratingFilter.status === 200, '6. Rating filter returns HTTP 200');
    assert(ratingFilter.body.data.some(d => d.rating === 2), '6. Rating filter returns 2-star feedback');
    assert(ratingFilter.body.data.every(d => d.rating === 2), '6. All results have rating = 2');

    // ── 7. Aspect filter ────────────────────────────────────────────────────
    const aspectFilter = await api('GET', '/api/feedback?aspect=Fitting');
    assert(aspectFilter.status === 200, '7. Aspect filter returns HTTP 200');
    assert(aspectFilter.body.data.length >= 2, '7. Aspect filter finds items mentioning "Fitting"');
    assert(aspectFilter.body.data.every(d => d.aspects && d.aspects.some(a => a.name.toLowerCase() === 'fitting')),
      '7. All results contain "Fitting" aspect');

    // ── 8. Date filter ──────────────────────────────────────────────────────
    const date7Filter = await api('GET', '/api/feedback?date=7');
    assert(date7Filter.status === 200, '8. Date filter (7 days) returns HTTP 200');
    // 40-days-ago Carol Danvers should be excluded
    const hasOld = date7Filter.body.data.some(d => d.email === 'p6seed_3@test.com');
    assert(!hasOld, '8. Date filter (7 days) excludes 40-day old feedback');

    // ── 9. Combined filters ─────────────────────────────────────────────────
    const combFilter = await api('GET', '/api/feedback?product=jeans&sentiment=Positive&rating=5');
    assert(combFilter.status === 200, '9. Combined filters return HTTP 200');
    assert(combFilter.body.data.every(d => d.product.toLowerCase() === 'jeans' && d.sentiment === 'Positive' && d.rating === 5),
      '9. All results satisfy all 3 criteria simultaneously');

    // ── 10. Newest sorting ──────────────────────────────────────────────────
    const sortNew = await api('GET', '/api/feedback?sort=newest&limit=5');
    assert(sortNew.status === 200, '10. Newest sorting returns HTTP 200');
    if (sortNew.body.data.length >= 2) {
      const t0 = new Date(sortNew.body.data[0].submittedAt).getTime();
      const t1 = new Date(sortNew.body.data[1].submittedAt).getTime();
      assert(t0 >= t1, '10. First item is newer than second item');
    }

    // ── 11. Oldest sorting ──────────────────────────────────────────────────
    const sortOld = await api('GET', '/api/feedback?sort=oldest&limit=5');
    assert(sortOld.status === 200, '11. Oldest sorting returns HTTP 200');
    if (sortOld.body.data.length >= 2) {
      const t0 = new Date(sortOld.body.data[0].submittedAt).getTime();
      const t1 = new Date(sortOld.body.data[1].submittedAt).getTime();
      assert(t0 <= t1, '11. First item is older than second item');
    }

    // ── 12. Highest rating sorting ──────────────────────────────────────────
    const sortHigh = await api('GET', '/api/feedback?sort=rating_high&limit=5');
    assert(sortHigh.status === 200, '12. Highest rating sort returns HTTP 200');
    if (sortHigh.body.data.length >= 2) {
      assert(sortHigh.body.data[0].rating >= sortHigh.body.data[1].rating, '12. Ratings in descending order');
    }

    // ── 13. Lowest rating sorting ───────────────────────────────────────────
    const sortLow = await api('GET', '/api/feedback?sort=rating_low&limit=5');
    assert(sortLow.status === 200, '13. Lowest rating sort returns HTTP 200');
    if (sortLow.body.data.length >= 2) {
      assert(sortLow.body.data[0].rating <= sortLow.body.data[1].rating, '13. Ratings in ascending order');
    }

    // ── 14. Pagination ──────────────────────────────────────────────────────
    const page1 = await api('GET', '/api/feedback?page=1&limit=2');
    const page2 = await api('GET', '/api/feedback?page=2&limit=2');
    assert(page1.status === 200 && page2.status === 200, '14. Pagination endpoints return HTTP 200');
    assert(page1.body.data.length === 2, '14. Page 1 returns exactly 2 items');
    assert(page1.body.pagination.page === 1, '14. Pagination metadata reports page = 1');
    assert(page1.body.pagination.limit === 2, '14. Pagination metadata reports limit = 2');
    assert(page1.body.data[0]._id !== page2.body.data[0]._id, '14. Page 1 and Page 2 contain distinct records');

    // ── 15. Invalid page fallback ───────────────────────────────────────────
    const invPage = await api('GET', '/api/feedback?page=-5&limit=2');
    assert(invPage.status === 200, '15. Negative page gracefully handled (HTTP 200)');
    assert(invPage.body.pagination.page === 1, '15. Negative page falls back to page 1');

    const strPage = await api('GET', '/api/feedback?page=notanumber&limit=2');
    assert(strPage.body.pagination.page === 1, '15. Non-numeric page falls back to page 1');

    // ── 16. Invalid limit fallback ──────────────────────────────────────────
    const invLimit = await api('GET', '/api/feedback?limit=-10');
    assert(invLimit.status === 200, '16. Negative limit gracefully handled (HTTP 200)');
    assert(invLimit.body.pagination.limit === 10, '16. Negative limit falls back to default limit = 10');

    // ── 17. Maximum limit enforcement ───────────────────────────────────────
    const maxLimit = await api('GET', '/api/feedback?limit=99999');
    assert(maxLimit.status === 200, '17. Massive limit handled (HTTP 200)');
    assert(maxLimit.body.pagination.limit <= 50, `17. Massive limit capped at max (got ${maxLimit.body.pagination.limit} <= 50)`);

    // ── 18. Empty search result ─────────────────────────────────────────────
    const emptySearch = await api('GET', '/api/feedback?q=nonexistent_gibberish_xyz_123');
    assert(emptySearch.status === 200, '18. Empty search returns HTTP 200');
    assert(emptySearch.body.data.length === 0, '18. Empty search data array is empty');
    assert(emptySearch.body.pagination.total === 0, '18. Empty search total count is 0');

    // ── 19. Public endpoint excludes flagged feedback ───────────────────────
    const allPub = await api('GET', '/api/feedback?limit=50');
    const hasFlagged = allPub.body.data.some(d => d.email === 'p6seed_6@test.com' || d.moderationStatus === 'flagged');
    assert(!hasFlagged, '19. Public search strictly EXCLUDES flagged spam feedback');

    // ── 20. Public endpoint excludes rejected feedback ──────────────────────
    const hasRejected = allPub.body.data.some(d => d.email === 'p6seed_7@test.com' || d.moderationStatus === 'rejected');
    assert(!hasRejected, '20. Public search strictly EXCLUDES rejected feedback');

    // ── 21. Public endpoint includes approved feedback ──────────────────────
    const hasApproved = allPub.body.data.some(d => d.email === 'p6seed_5@test.com' && d.moderationStatus === 'approved');
    assert(hasApproved, '21. Public search INCLUDES approved feedback (p6seed_5)');

    // ── 22. Public endpoint includes published feedback ─────────────────────
    const hasPublished = allPub.body.data.some(d => d.email === 'p6seed_1@test.com' && d.moderationStatus === 'published');
    assert(hasPublished, '22. Public search INCLUDES published feedback (p6seed_1)');

    // ── 23. Spam fields not exposed publicly ────────────────────────────────
    const samplePub = allPub.body.data[0];
    assert(samplePub.spamScore === undefined, '23. spamScore is NOT exposed on public API');
    assert(samplePub.spamReasons === undefined, '23. spamReasons is NOT exposed on public API');

    // ── 24. Admin search works ──────────────────────────────────────────────
    const adminSearch = await api('GET', '/api/admin/feedback/search?moderationStatus=flagged', null, ADM);
    assert(adminSearch.status === 200, '24. Admin feedback search returns HTTP 200');
    assert(adminSearch.body.success === true, '24. Admin search success = true');
    assert(adminSearch.body.data.some(d => d.moderationStatus === 'flagged'), '24. Admin search can locate flagged reviews');
    // Admin CAN see spamScore and spamReasons
    const flaggedAdminItem = adminSearch.body.data.find(d => d.moderationStatus === 'flagged');
    assert(flaggedAdminItem && typeof flaggedAdminItem.spamScore === 'number', '24. Admin search preserves spamScore');
    assert(flaggedAdminItem && Array.isArray(flaggedAdminItem.spamReasons), '24. Admin search preserves spamReasons');

    // ── 25. Customer cannot access admin search ─────────────────────────────
    const custSearch = await api('GET', '/api/admin/feedback/search', null, CUST);
    assert(custSearch.status === 403, '25. Customer receives HTTP 403 on admin feedback search');

    // ── 26. Unauthenticated admin request returns 401 ───────────────────────
    const unauthSearch = await api('GET', '/api/admin/feedback/search');
    assert(unauthSearch.status === 401, '26. Unauthenticated request receives HTTP 401 on admin search');

    // ── 27. Admin request returns 200 ───────────────────────────────────────
    const admOk = await api('GET', '/api/admin/feedback/search', null, ADM);
    assert(admOk.status === 200, '27. Admin request returns HTTP 200 with valid JWT');

    // ── 28. Feedback detail works ───────────────────────────────────────────
    const sampleId = seeded[0]._id.toString();
    const pubDetail = await api('GET', `/api/feedback/${sampleId}`);
    assert(pubDetail.status === 200, '28. Public feedback detail GET returns HTTP 200');
    assert(pubDetail.body.data._id.toString() === sampleId, '28. Detail returns matching feedback document');
    assert(pubDetail.body.data.sentiment === 'Positive', '28. Detail includes sentiment data');
    assert(Array.isArray(pubDetail.body.data.aspects), '28. Detail includes aspects array');
    assert(pubDetail.body.data.spamScore === undefined, '28. Public detail shields spamScore');

    // Admin detail endpoint
    const admDetail = await api('GET', `/api/admin/feedback/${sampleId}`, null, ADM);
    assert(admDetail.status === 200, '28. Admin feedback detail returns HTTP 200');
    assert(admDetail.body.data.moderationStatus !== undefined, '28. Admin detail includes moderationStatus');

    // Flagged doc inaccessible via public detail
    const flaggedId = seeded[5]._id.toString();
    const flaggedPubDetail = await api('GET', `/api/feedback/${flaggedId}`);
    assert(flaggedPubDetail.status === 404, '28. Flagged feedback detail returns 404 on public endpoint');

    // ── 29. Image feedback works ────────────────────────────────────────────
    assert(seeded[0].imagePath === '/uploads/sample_jeans.jpg', '29. Feedback with imagePath preserved');
    assert(pubDetail.body.data.imagePath === '/uploads/sample_jeans.jpg', '29. Detail view returns imagePath');

    // ── 30. Feedback without image works ────────────────────────────────────
    const sampleNoImgId = seeded[1]._id.toString();
    const detailNoImg = await api('GET', `/api/feedback/${sampleNoImgId}`);
    assert(detailNoImg.status === 200, '30. Feedback without image returns HTTP 200');
    assert(detailNoImg.body.data.imagePath === null, '30. imagePath is cleanly null without image');

    // ── 31. Existing Phase 5 analytics still works ──────────────────────────
    const analyticsRes = await api('GET', '/api/admin/analytics/overview', null, ADM);
    assert(analyticsRes.status === 200, '31. Phase 5: Analytics overview still works (HTTP 200)');
    assert(typeof analyticsRes.body.data.totalValidFeedback === 'number', '31. Phase 5: Analytics data intact');

    // ── 32. Existing Phase 4 moderation still works ─────────────────────────
    const flaggedListRes = await api('GET', '/api/admin/flagged-feedback', null, ADM);
    assert(flaggedListRes.status === 200, '32. Phase 4: Moderation flagged-feedback list works');
    assert(Array.isArray(flaggedListRes.body.data || flaggedListRes.body.flaggedFeedbacks),
      '32. Phase 4: Moderation list returns array');

    // ── 33. Existing Phase 3 image upload pipeline works ────────────────────
    // Test multipart submission or json feedback
    const testFeedbackPost = await api('POST', '/api/feedback', {
      name: 'Phase6Submitter', email: 'p6submit@test.com', product: 'dress', rating: 5,
      feedback: 'Incredible dress fitting, elegant color, and phenomenal craftsmanship.',
      recommend: true
    }, CUST);
    assert(testFeedbackPost.status === 201, '33. Phase 3/4: Feedback POST returns HTTP 201');

    // ── 34. Existing Phase 2 NLP still works ────────────────────────────────
    const postFb = testFeedbackPost.body.feedback;
    assert(postFb && postFb.sentiment === 'Positive', '34. Phase 2: NLP sentiment classified correctly (Positive)');
    assert(postFb && Array.isArray(postFb.aspects) && postFb.aspects.length > 0, '34. Phase 2: Aspects detected on submission');

    // ── 35. Existing Phase 1 JWT/RBAC still works ───────────────────────────
    const meRes = await api('GET', '/api/auth/me', null, CUST);
    assert(meRes.status === 200, '35. Phase 1: /api/auth/me works');
    assert(meRes.body.user.role === 'customer', '35. Phase 1: Customer role confirmed');

    // ── 36. Survey functionality still works ────────────────────────────────
    const surveyRes = await api('POST', '/api/survey', {
      name: 'P6SurveyUser', email: 'p6survey@test.com',
      age: '25-34', style: 'Casual', frequency: 'Monthly',
      budget: '₹1000-₹3000', satisfaction: 'Satisfied', quality: 'Good',
      recommend: 'Yes', improvement: 'More color options', categories: ['Tops', 'Jeans']
    });
    assert(surveyRes.status === 201, '36. Survey POST returns HTTP 201 without regression');

    // ── Cleanup ─────────────────────────────────────────────────────────────
    await Feedback.deleteMany({ email: /^p6seed_.*@test\.com$/ });
    await Feedback.deleteMany({ email: { $in: ['p6submit@test.com', 'p6survey@test.com'] } });

  } catch (err) {
    console.error('\n❌ TEST RUNNER ERROR:', err);
    failed++;
  }

  console.log('\n========================================================');
  console.log(`PHASE 6 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  server.close();
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error(err); process.exit(1); });
