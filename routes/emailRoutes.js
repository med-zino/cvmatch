const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const Email = require('../models/Email');

// Test route to check if the API is working
router.get('/test', async (req, res) => {
  try {
    // Find all emails
    const emails = await Email.find();
    res.json({ success: true, emails });
  } catch (error) {
    console.error('Error in test route:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to save email
router.post('/save-email', emailController.saveEmail);

module.exports = router; 