/**
 * Realistic Demo Data Seeder — Fashion Feedback Intelligence Platform
 *
 * Populates the database with realistic customer feedback, surveys, and 
 * moderation cases suitable for live production demonstrations and interviews.
 *
 * Usage:
 *   node backend/scripts/seedDemoData.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Feedback = require('../models/Feedback');
const Survey = require('../models/Survey');
const User = require('../models/user');
const { analyzeFeedback } = require('../services/nlpService');

// Demo records definition
const DEMO_FEEDBACKS = [
  {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@gmail.com',
    product: 'jeans',
    rating: 5,
    feedback: 'The denim quality is excellent and the fit is comfortable.',
    recommend: true,
    submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Priya Mehta',
    email: 'priya.mehta@yahoo.com',
    product: 'dress',
    rating: 3,
    feedback: 'The design is beautiful but the fitting is slightly tight around the waist.',
    recommend: true,
    submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Rahul Verma',
    email: 'rahul.verma@outlook.com',
    product: 'jacket',
    rating: 2,
    feedback: 'The material quality needs improvement. The zipper gets stuck often and stitching is uneven.',
    recommend: false,
    submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Ananya Roy',
    email: 'ananya.roy@gmail.com',
    product: 'tops',
    rating: 4,
    feedback: 'Loved the vibrant color and soft cotton fabric. Shrinks slightly after the first wash, but looks great overall.',
    recommend: true,
    submittedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Vikram Malhotra',
    email: 'vikram.m@gmail.com',
    product: 'shoes',
    rating: 1,
    feedback: 'Extremely uncomfortable sole and poor stitching. Completely unwearable for daily office wear.',
    recommend: false,
    submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Sneha Kapoor',
    email: 'sneha.kapoor@gmail.com',
    product: 'accessories',
    rating: 5,
    feedback: 'Gorgeous jewelry collection! The finish is premium, elegant design, and price is totally worth it.',
    recommend: true,
    submittedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Rohan Das',
    email: 'rohan.das@gmail.com',
    product: 'tops',
    rating: 5,
    feedback: 'Perfect fit and high-end stitching. The fabric breathes well during warm summer days.',
    recommend: true,
    submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Meera Nair',
    email: 'meera.nair@hotmail.com',
    product: 'jeans',
    rating: 4,
    feedback: 'Stylish cut and durable denim fabric. Sizing runs slightly large, but very comfortable.',
    recommend: true,
    submittedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Aditya Sengupta',
    email: 'aditya.s@gmail.com',
    product: 'jacket',
    rating: 3,
    feedback: 'The styling looks sharp, but the price is too high for the synthetic lining used.',
    recommend: true,
    submittedAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Tanvi Kulkarni',
    email: 'tanvi.k@gmail.com',
    product: 'dress',
    rating: 5,
    feedback: 'Wore it to an evening gala and received numerous compliments! Flattering silhouette and exquisite color.',
    recommend: true,
    submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Suresh Pillai',
    email: 'suresh.pillai@gmail.com',
    product: 'shoes',
    rating: 2,
    feedback: 'Color does not match the online product photograph at all. Disappointed with the shade.',
    recommend: false,
    submittedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    moderationStatus: 'published',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  {
    name: 'Ishaan Saxena',
    email: 'ishaan.saxena@gmail.com',
    product: 'general',
    rating: 4,
    feedback: 'Prompt customer service and eco-friendly packaging. Products were true to description.',
    recommend: true,
    submittedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    moderationStatus: 'approved',
    isSpam: false,
    spamScore: 0,
    spamReasons: []
  },
  // ── Moderation Queue Demo Records (Realistic Flagged Submissions) ──
  {
    name: 'Devansh Patel',
    email: 'promo_deals_daily@bizmail.org',
    product: 'jacket',
    rating: 5,
    feedback: 'SUPER CHEAP DESIGNER CLOTHES! Click here for 90% discount: http://luxury-fashion-outlet.biz/special-promo',
    recommend: true,
    submittedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    moderationStatus: 'flagged',
    isSpam: true,
    spamScore: 0.95,
    spamReasons: ['Suspicious promotional URL link', 'Excessive promotional keywords']
  },
  {
    name: 'Riya Sen',
    email: 'riya.feedback@mailinator.com',
    product: 'tops',
    rating: 1,
    feedback: 'Horrible horrible horrible horrible horrible terrible terrible terrible product cheap cheap cheap',
    recommend: false,
    submittedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    moderationStatus: 'flagged',
    isSpam: true,
    spamScore: 0.85,
    spamReasons: ['Excessive repetitive characters and vocabulary']
  }
];

const DEMO_SURVEYS = [
  {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@gmail.com',
    age: '26',
    style: ['Casual', 'Minimalist'],
    colors: ['Blue', 'Black', 'White'],
    budget: '₹2,000 - ₹5,000',
    shoppingFrequency: 'Monthly',
    suggestions: 'Please introduce more slim-fit stretch denim options.'
  },
  {
    name: 'Priya Mehta',
    email: 'priya.mehta@yahoo.com',
    age: '29',
    style: ['Formal', 'Elegant'],
    colors: ['Pastel Pink', 'Burgundy', 'Beige'],
    budget: '₹5,000 - ₹10,000',
    shoppingFrequency: 'Quarterly',
    suggestions: 'Need more breathable linen formal dresses for summer.'
  },
  {
    name: 'Rahul Verma',
    email: 'rahul.verma@outlook.com',
    age: '32',
    style: ['Streetwear', 'Athleisure'],
    colors: ['Olive', 'Charcoal', 'Navy'],
    budget: '₹3,000 - ₹7,000',
    shoppingFrequency: 'Monthly',
    suggestions: 'Add heavy-duty YKK zippers to your outerwear jackets.'
  },
  {
    name: 'Sneha Kapoor',
    email: 'sneha.kapoor@gmail.com',
    age: '24',
    style: ['Bohemian', 'Vintage'],
    colors: ['Gold', 'Emerald Green', 'Rust'],
    budget: '₹1,500 - ₹4,000',
    shoppingFrequency: 'Bi-weekly',
    suggestions: 'Introduce anti-tarnish jewelry coatings for everyday wear.'
  },
  {
    name: 'Ananya Roy',
    email: 'ananya.roy@gmail.com',
    age: '27',
    style: ['Smart Casual'],
    colors: ['Lavender', 'Cream', 'Teal'],
    budget: '₹2,500 - ₹6,000',
    shoppingFrequency: 'Monthly',
    suggestions: 'Pre-shrunk cotton options for summer tees would be amazing.'
  }
];

async function seedDemoData() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI not found in .env');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  try {
    // 1. Ensure admin account exists
    const adminEmail = 'admin@stylefeedback.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = new User({
        username: 'admin',
        email: adminEmail,
        password: 'admin123',
        role: 'admin'
      });
      await admin.save();
      console.log('👑 Admin account ensured: admin@stylefeedback.com / admin123');
    } else {
      console.log('👑 Admin account verified.');
    }

    // 2. Remove previously seeded demo feedbacks to allow clean re-runs
    const demoEmails = DEMO_FEEDBACKS.map(f => f.email);
    await Feedback.deleteMany({ email: { $in: demoEmails } });
    console.log('🧹 Cleared existing demo feedback records.');

    // 3. Process and insert demo feedbacks with NLP analysis
    const feedbackDocs = DEMO_FEEDBACKS.map(item => {
      // Run NLP aspect analysis
      const nlp = analyzeFeedback(item.feedback, item.rating);
      return {
        ...item,
        sentiment: nlp.sentiment || 'Neutral',
        sentimentScore: nlp.sentimentScore || 0,
        sentimentConfidence: nlp.sentimentConfidence || 0.8,
        aspects: nlp.aspects && nlp.aspects.length > 0 ? nlp.aspects : [],
        analyzedAt: new Date()
      };
    });

    const insertedFbs = await Feedback.insertMany(feedbackDocs);
    console.log(`✅ Seeded ${insertedFbs.length} realistic customer feedback records.`);

    // 4. Seed demo surveys
    const surveyEmails = DEMO_SURVEYS.map(s => s.email);
    await Survey.deleteMany({ email: { $in: surveyEmails } });
    const insertedSurveys = await Survey.insertMany(DEMO_SURVEYS);
    console.log(`✅ Seeded ${insertedSurveys.length} realistic customer surveys.`);

    console.log('\n📊 Demo Data Summary:');
    console.log(`   - Verified customer reviews: ${insertedFbs.filter(f => f.moderationStatus === 'published' || f.moderationStatus === 'approved').length}`);
    console.log(`   - Flagged for moderation:    ${insertedFbs.filter(f => f.moderationStatus === 'flagged').length}`);
    console.log(`   - 1-Star reviews (verified): ${insertedFbs.filter(f => f.rating === 1 && f.moderationStatus !== 'flagged').length}`);
    console.log(`   - Surveys available:         ${insertedSurveys.length}`);
    console.log('✨ Demo database successfully stabilized!');
  } catch (err) {
    console.error('❌ Error during demo seeding:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  seedDemoData();
}

module.exports = { seedDemoData };
