const mongoose = require('mongoose');

const savedJobSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        trim: true,
        default: ''
    },
    link: {
        type: String,
        required: true,
        trim: true
    },
    // Empty for feed jobs saved before they were scored
    score: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    posted: {
        type: String,
        default: 'Not specified'
    },
    skillsMatch: [{
        type: String,
        trim: true
    }],
    missingSkills: [{
        type: String,
        trim: true
    }],
    reasons: [{
        type: String,
        trim: true
    }],
    savedAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['saved', 'applied', 'interview', 'rejected', 'offer'],
        default: 'saved'
    },
    // AI help for the application, kept so it isn't rewritten on every visit
    coverLetter: {
        subject: String,
        text: String,
        language: String,
        createdAt: Date
    },
    // { verdict, keywords, rewrites, gaps, order, language, createdAt }
    cvTips: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
});

// Create compound index to prevent duplicate saves of the same job by the same user
savedJobSchema.index({ userId: 1, link: 1 }, { unique: true });

module.exports = mongoose.model('SavedJob', savedJobSchema);
