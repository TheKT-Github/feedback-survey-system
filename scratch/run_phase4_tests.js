const path = require('path');
const fs = require('fs');
const backendDir = 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey/backend';

const dotenv = require(path.join(backendDir, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendDir, '.env') });

const express = require(path.join(backendDir, 'node_modules/express'));
const mongoose = require(path.join(backendDir, 'node_modules/mongoose'));
const cors = require(path.join(backendDir, 'node_modules/cors'));

const { analyzeFeedback } = require(path.join(backendDir, 'services/nlpService'));
const spamService = require(path.join(backendDir, 'services/spamService'));
const Feedback = require(path.join(backendDir, 'models/Feedback'));
const Survey = require(path.join(backendDir, 'models/Survey'));
const User = require(path.join(backendDir, 'models/user'));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(backendDir, 'uploads')));

app.use('/api/auth', require(path.join(backendDir, 'routes/auth')));
app.use('/api/feedback', require(path.join(backendDir, 'routes/feedback')));
app.use('/api/survey', require(path.join(backendDir, 'routes/survey')));
app.use('/api/admin', require(path.join(backendDir, 'routes/admin')));

async function runTests() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for Phase 4 verification tests.");

  const server = app.listen(3094);
  const BASE = 'http://127.0.0.1:3094';

  let passed = 0;
  let failed = 0;
  const createdFeedbackIds = [];
  const createdUsernames = [];

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name} ${details}`);
      failed++;
    }
  }

  try {
    console.log("\n========================================================");
    console.log("PHASE 4 TEST SUITE: SPAM & DUPLICATE DETECTION & MODERATION");
    console.log("========================================================");

    // Get Admin JWT token
    const adminLoginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stylefeedback.com', password: 'admin123' })
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200 && Boolean(adminLoginData.token), "Setup: Admin authenticated & JWT issued");
    const adminToken = adminLoginData.token;

    // Create a standard customer user and token
    const customerUser = `testuser_p4_${Date.now()}`;
    const custRegRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: customerUser, email: `${customerUser}@example.com`, password: 'password123' })
    });
    const custRegData = await custRegRes.json();
    assert(custRegRes.status === 201 && Boolean(custRegData.token), "Setup: Customer registered & JWT issued");
    const customerToken = custRegData.token;
    createdUsernames.push(customerUser);

    // 1. Clean feedback -> published, not spam
    const cleanUserEmail = `clean_${Date.now()}@example.com`;
    const cleanRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rahul Mehra',
        email: cleanUserEmail,
        product: 'shirts',
        rating: 5,
        feedback: 'The fabric quality is exceptionally good and the stitching is perfect.'
      })
    });
    const cleanData = await cleanRes.json();
    assert(cleanRes.status === 201, "1. Clean feedback submission succeeds (HTTP 201)");
    assert(cleanData.feedback.moderationStatus === 'published', `1. Clean feedback marked as published (${cleanData.feedback.moderationStatus})`);
    createdFeedbackIds.push(cleanData.feedback.id);

    const cleanDoc = await Feedback.findById(cleanData.feedback.id);
    assert(cleanDoc.isSpam === false && cleanDoc.spamScore === 0, "1. Clean feedback stored with isSpam=false and spamScore=0 in MongoDB");

    // 2. Exact duplicate -> flagged
    const dupRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rahul Mehra',
        email: cleanUserEmail,
        product: 'shirts',
        rating: 5,
        feedback: 'The fabric quality is exceptionally good and the stitching is perfect.'
      })
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 201, "2. Exact duplicate feedback accepted but moderated (HTTP 201)");
    assert(dupData.feedback.moderationStatus === 'flagged', `2. Duplicate feedback flagged (${dupData.feedback.moderationStatus})`);
    createdFeedbackIds.push(dupData.feedback.id);

    const dupDoc = await Feedback.findById(dupData.feedback.id);
    assert(dupDoc.isSpam === true, "2. Duplicate feedback has isSpam=true in MongoDB");
    assert(dupDoc.spamReasons.some(r => /duplicate/i.test(r)), "2. Duplicate reason recorded in MongoDB");

    // 3. Case/punctuation duplicate -> flagged
    const caseDupRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rahul Mehra',
        email: cleanUserEmail,
        product: 'shirts',
        rating: 5,
        feedback: 'THE FABRIC QUALITY IS EXCEPTIONALLY GOOD AND THE STITCHING IS PERFECT!!!'
      })
    });
    const caseDupData = await caseDupRes.json();
    assert(caseDupData.feedback.moderationStatus === 'flagged', `3. Case/punctuation variation duplicate flagged (${caseDupData.feedback.moderationStatus})`);
    createdFeedbackIds.push(caseDupData.feedback.id);

    // 4. Similar feedback (Jaccard similarity) -> flagged
    const simUserEmail = `sim_${Date.now()}@example.com`;
    const simBase = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sim User',
        email: simUserEmail,
        product: 'shoes',
        rating: 4,
        feedback: 'The leather boots are very comfortable and durable for daily wear.'
      })
    });
    const simBaseData = await simBase.json();
    createdFeedbackIds.push(simBaseData.feedback.id);

    const simNear = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sim User',
        email: simUserEmail,
        product: 'shoes',
        rating: 4,
        feedback: 'leather boots are very durable and comfortable for daily wear'
      })
    });
    const simNearData = await simNear.json();
    assert(simNearData.feedback.moderationStatus === 'flagged', `4. High Jaccard similarity feedback flagged (${simNearData.feedback.moderationStatus})`);
    createdFeedbackIds.push(simNearData.feedback.id);

    // 5. Promotional spam -> flagged
    const promoRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Spammer',
        email: 'spammer1@example.com',
        product: 'dresses',
        rating: 5,
        feedback: 'Amazing dress! Buy now and visit our website for free discount vouchers promo code!'
      })
    });
    const promoData = await promoRes.json();
    assert(promoData.feedback.moderationStatus === 'flagged', `5. Promotional spam flagged (${promoData.feedback.moderationStatus})`);
    createdFeedbackIds.push(promoData.feedback.id);

    // 6. URL-heavy spam -> flagged
    const urlRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Link Spammer',
        email: 'links@example.com',
        product: 'bags',
        rating: 1,
        feedback: 'Check out cheap replica watches and bags at http://fake-luxury-deals.com/replica'
      })
    });
    const urlData = await urlRes.json();
    assert(urlData.feedback.moderationStatus === 'flagged', `6. URL-heavy spam flagged (${urlData.feedback.moderationStatus})`);
    createdFeedbackIds.push(urlData.feedback.id);

    // 7. Repetitive characters -> flagged ("aaaaaaa", "1111111111")
    const repRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot User',
        email: 'bot1@example.com',
        product: 'jackets',
        rating: 3,
        feedback: 'soooooooooo badddddd aaaaaaaaaa'
      })
    });
    const repData = await repRes.json();
    assert(repData.feedback.moderationStatus === 'flagged', `7. Repetitive characters flagged (${repData.feedback.moderationStatus})`);
    createdFeedbackIds.push(repData.feedback.id);

    // 8. Nonsense / Keyboard Mash text -> flagged
    const mashRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mash User',
        email: 'mash@example.com',
        product: 'pants',
        rating: 2,
        feedback: 'asdfghjkl qwertyuiop'
      })
    });
    const mashData = await mashRes.json();
    assert(mashData.feedback.moderationStatus === 'flagged', `8. Keyboard mash nonsense flagged (${mashData.feedback.moderationStatus})`);
    createdFeedbackIds.push(mashData.feedback.id);

    // 9. Short legitimate feedback -> published (NOT flagged)
    const shortLegitRes = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fast Reviewer',
        email: `fast_${Date.now()}@example.com`,
        product: 'shoes',
        rating: 5,
        feedback: 'Nice fit'
      })
    });
    const shortLegitData = await shortLegitRes.json();
    assert(shortLegitData.feedback.moderationStatus === 'published', `9. Short legitimate feedback "Nice fit" published (${shortLegitData.feedback.moderationStatus})`);
    createdFeedbackIds.push(shortLegitData.feedback.id);

    // 10. Rapid repeated submissions from the same user -> flagged
    const rapidEmail = `rapid_${Date.now()}@example.com`;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Speedy Submitter',
          email: rapidEmail,
          product: `item_${i}`,
          rating: 4,
          feedback: `Distinct review number ${i} for rapid rate check with completely different words.`
        })
      });
      const d = await r.json();
      createdFeedbackIds.push(d.feedback.id);
      if (i === 2) {
        assert(d.feedback.moderationStatus === 'flagged', `10. Rapid repeated submission flagged on 3rd rapid entry (${d.feedback.moderationStatus})`);
      }
    }

    // 11. Flagged feedback stored correctly in MongoDB
    const flaggedDoc = await Feedback.findById(promoData.feedback.id);
    assert(flaggedDoc && flaggedDoc.isSpam === true && flaggedDoc.moderationStatus === 'flagged', "11. Flagged feedback stored with isSpam=true & moderationStatus=flagged");
    assert(flaggedDoc.spamScore > 0 && flaggedDoc.spamReasons.length > 0, "11. Flagged feedback has spamScore and spamReasons stored");

    // 12. Clean feedback stored as published in MongoDB
    const pubDoc = await Feedback.findById(cleanData.feedback.id);
    assert(pubDoc && pubDoc.moderationStatus === 'published', "12. Clean feedback stored as published in MongoDB");

    // 13. Admin can retrieve flagged feedback
    const adminFlaggedRes = await fetch(`${BASE}/api/admin/flagged-feedback`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminFlaggedData = await adminFlaggedRes.json();
    assert(adminFlaggedRes.status === 200 && adminFlaggedData.success === true, "13. Admin fetches flagged feedback successfully (HTTP 200)");
    assert(Array.isArray(adminFlaggedData.data) && adminFlaggedData.data.length > 0, `13. Returns array of flagged reviews (found ${adminFlaggedData.data.length})`);
    assert(adminFlaggedData.data.some(f => f._id === promoData.feedback.id), "13. Flagged list includes recent flagged submission");

    // 14. Non-admin cannot retrieve flagged feedback (HTTP 401/403)
    const custFlaggedRes = await fetch(`${BASE}/api/admin/flagged-feedback`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(custFlaggedRes.status === 403, "14. Non-admin customer forbidden from accessing flagged feedback (HTTP 403)");

    const anonFlaggedRes = await fetch(`${BASE}/api/admin/flagged-feedback`);
    assert(anonFlaggedRes.status === 401, "14. Unauthenticated user unauthorized from accessing flagged feedback (HTTP 401)");

    // 15. Admin can approve feedback
    const targetToApprove = promoData.feedback.id;
    const approveRes = await fetch(`${BASE}/api/admin/feedback/${targetToApprove}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const approveData = await approveRes.json();
    assert(approveRes.status === 200 && approveData.success === true, "15. Admin approves feedback (HTTP 200)");
    const approvedDoc = await Feedback.findById(targetToApprove);
    assert(approvedDoc.moderationStatus === 'approved', "15. Feedback moderationStatus updated to 'approved' in MongoDB");

    // 16. Admin can reject feedback
    const targetToReject = repData.feedback.id;
    const rejectRes = await fetch(`${BASE}/api/admin/feedback/${targetToReject}/reject`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 200 && rejectData.success === true, "16. Admin rejects feedback (HTTP 200)");
    const rejectedDoc = await Feedback.findById(targetToReject);
    assert(rejectedDoc.moderationStatus === 'rejected', "16. Feedback moderationStatus updated to 'rejected' in MongoDB");

    // 17. Normal users cannot approve/reject
    const custApproveRes = await fetch(`${BASE}/api/admin/feedback/${targetToApprove}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(custApproveRes.status === 403, "17. Customer cannot approve feedback (HTTP 403)");

    const custRejectRes = await fetch(`${BASE}/api/admin/feedback/${targetToReject}/reject`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(custRejectRes.status === 403, "17. Customer cannot reject feedback (HTTP 403)");

    // 18. Existing JWT authentication still works
    const authVerifyRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(authVerifyRes.status === 200, "18. Customer JWT verification works (/api/auth/me)");

    // 19. Existing NLP sentiment still works
    assert(cleanData.feedback.sentiment === 'Positive', "19. NLP sentiment evaluated correctly (Positive)");

    // 20. Existing aspect detection still works
    assert(Array.isArray(cleanData.feedback.aspects) && cleanData.feedback.aspects.length > 0, "20. Aspects detected on feedback");

    // 21 & 22. Existing image upload & without image still work
    const sampleJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0xFF, 0xD9]);
    const fdImg = new FormData();
    fdImg.append('name', 'Image Reviewer');
    fdImg.append('feedback', 'The skirt is stunning and looks fabulous in person.');
    fdImg.append('photo', new Blob([sampleJpeg], { type: 'image/jpeg' }), 'skirt.jpg');

    const imgUploadRes = await fetch(`${BASE}/api/feedback`, { method: 'POST', body: fdImg });
    const imgUploadData = await imgUploadRes.json();
    assert(imgUploadRes.status === 201 && typeof imgUploadData.feedback.imagePath === 'string', "21. Image upload with review continues to work");
    createdFeedbackIds.push(imgUploadData.feedback.id);
    if (imgUploadData.feedback.imagePath) {
      const localFile = path.join(backendDir, imgUploadData.feedback.imagePath);
      if (fs.existsSync(localFile)) {
        try { fs.unlinkSync(localFile); } catch (e) {}
      }
    }

    assert(cleanData.feedback.imagePath === null, "22. Feedback without image continues to work");

    // 23. Existing survey functionality still works
    const surveyRes = await fetch(`${BASE}/api/survey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase 4 Survey Tester',
        email: 'survey4@example.com',
        style: ['chic'],
        colors: ['pink']
      })
    });
    assert(surveyRes.status === 201, "23. Survey submission works without regression");

    // 24. Public feedback list hides spam/internal moderation fields
    const publicListRes = await fetch(`${BASE}/api/feedback`);
    const publicListData = await publicListRes.json();
    assert(publicListRes.status === 200 && Array.isArray(publicListData.data), "24. Public feedback list returns HTTP 200");
    const anyExposed = publicListData.data.some(fb => fb.spamScore !== undefined || fb.spamReasons !== undefined);
    assert(!anyExposed, "24. Public feedback list DOES NOT expose spamScore or spamReasons to customers");

    // Clean up created test feedback and test users
    for (const id of createdFeedbackIds) {
      await Feedback.findByIdAndDelete(id);
    }
    for (const u of createdUsernames) {
      await User.deleteOne({ username: u });
    }

    console.log(`\n========================================================`);
    console.log(`PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================================\n`);

    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    server.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
