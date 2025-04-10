const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

// Create a proper index for email field for faster lookups
emailSchema.index({ email: 1 });

module.exports = mongoose.model('Email', emailSchema); 