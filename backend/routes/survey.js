const express = require('express');
const router = express.Router();
const Survey = require('../models/Survey');
const { surveyLimiter } = require('../middleware/rateLimiter');

// POST /api/survey - Rate-limited public survey submission
router.post('/', surveyLimiter, async (req, res) => {
    try {
        const newSurvey = new Survey(req.body);
        await newSurvey.save();
        res.status(201).json({ message: 'Survey submitted successfully' });
    } catch (error) {
        console.error('Error saving survey:', error);
        res.status(500).json({ error: 'Failed to submit survey' });
    }
});

module.exports = router;
