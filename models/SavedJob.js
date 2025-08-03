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
        required: true,
        trim: true
    },
    link: {
        type: String,
        required: true,
        trim: true
    },
    score: {
        type: Number,
        required: true,
        min: 0,
        max: 100
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
    }
});

// Create compound index to prevent duplicate saves of the same job by the same user
savedJobSchema.index({ userId: 1, link: 1 }, { unique: true });

// Add methods
savedJobSchema.methods.toJSON = function() {
    const savedJob = this.toObject();
    return savedJob;
};

module.exports = mongoose.model('SavedJob', savedJobSchema);
