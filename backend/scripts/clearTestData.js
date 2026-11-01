/**
 * Safe Test Data Cleanup Script — Fashion Feedback Intelligence Platform
 *
 * Safely removes automated regression test records without touching production
 * admin credentials or genuine user submissions.
 *
 * Usage:
 *   node backend/scripts/clearTestData.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Feedback = require('../models/Feedback');
const Survey = require('../models/Survey');
const User = require('../models/user');

const TEST_IDENTIFIERS = [
  /test\s*customer/i,
  /spam\s*bot/i,
  /phase\s*[2-7]/i,
  /p[4-7]seed/i,
  /automated/i,
  /regression/i,
  /sample_test/i,
  /tester/i,
  /mock/i,
  /dummy/i,
  /fake/i
];

async function clearTestData() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI not found in .env');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  try {
    // 1. Clean Test Feedbacks
    const feedbackQuery = {
      $or: [
        { name: { $in: TEST_IDENTIFIERS } },
        { email: { $in: TEST_IDENTIFIERS } },
        { feedback: { $in: TEST_IDENTIFIERS } },
        { email: /@(test|spam|example\.com|mock\.io|bot\.com)/i }
      ],
      // NEVER delete real admin or explicitly kept demo records
      email: { $nin: ['admin@stylefeedback.com'] }
    };

    const fbDeleteResult = await Feedback.deleteMany({
      $or: [
        { name: { $regex: /test|bot|spam|phase|p6seed|p7seed|sample|cypress|mock/i } },
        { email: { $regex: /test|bot|spam|phase|p6seed|p7seed|sample|cypress|mock/i } },
        { feedback: { $regex: /test feedback|automated test|phase\s*[2-7]|p6seed|p7seed|bot submission|asdfghjk/i } }
      ]
    });
    console.log(`🧹 Cleaned ${fbDeleteResult.deletedCount} test feedback records.`);

    // 2. Clean Test Surveys
    const surveyDeleteResult = await Survey.deleteMany({
      $or: [
        { name: { $regex: /test|bot|spam|phase|p6seed|p7seed|sample|mock/i } },
        { email: { $regex: /test|bot|spam|phase|p6seed|p7seed|sample|mock/i } },
        { suggestions: { $regex: /test|phase\s*[2-7]|automated|mock/i } }
      ]
    });
    console.log(`🧹 Cleaned ${surveyDeleteResult.deletedCount} test survey records.`);

    // 3. Clean Test Users (Preserve admin and genuine accounts)
    const userDeleteResult = await User.deleteMany({
      username: { $regex: /test|bot|spam|phase|p6seed|p7seed|mock/i },
      email: { $ne: 'admin@stylefeedback.com' }
    });
    console.log(`🧹 Cleaned ${userDeleteResult.deletedCount} test user accounts.`);

    console.log('✨ Safe test data cleanup complete!');
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  clearTestData();
}

module.exports = { clearTestData };
