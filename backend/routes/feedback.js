
const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');

router.post('/', async (req, res) => {
  try {
    const { name, email, product, rating, feedback, recommend } = req.body;

    const newFeedback = new Feedback({
      name,
      email,
      product,
      rating,
      feedback,
      recommend,
      submittedAt: new Date()
    });

    await newFeedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('❌ Error saving feedback:', err);
    res.status(500).json({ message: 'Server error while submitting feedback' });
  }
});

module.exports = router;
