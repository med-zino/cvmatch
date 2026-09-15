const mongoose = require('mongoose');

// One listing in a user's feed: found for their target titles ("feed") or returned by one of
// their searches ("search"). The description is kept so the job can be scored later.
const feedJobSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    jobId: {
        type: String,
        required: true
    },
    source: {
        type: String,
        enum: ['feed', 'search'],
        required: true
    },
    // The title it was found for, or the search that returned it
    query: { type: String, default: '' },
    title: { type: String, required: true },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    link: { type: String, default: '' },
    publisher: { type: String, default: '' },
    posted: { type: String, default: '' },
    employmentType: { type: String, default: '' },
    isRemote: { type: Boolean, default: false },
    qualifications: [String],
    description: { type: String, default: '' },
    // Empty until the user asks for a score
    score: Number,
    reasons: [String],
    skillsMatch: [String],
    missingSkills: [String],
    scoredAt: Date,
    // When the job went out in a daily email, so it's never sent twice
    alertedAt: Date,
    addedAt: { type: Date, default: Date.now }
});

feedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
feedJobSchema.index({ userId: 1, addedAt: -1, _id: -1 });

module.exports = mongoose.model('FeedJob', feedJobSchema);
