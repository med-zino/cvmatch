const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    googleId: {
        type: String,
        sparse: true,
        unique: true
    },
    verified: {
        type: Boolean,
        default: false
    },
    // The CV from the last search, so it only has to be added once
    cv: {
        text: { type: String, default: '' },
        name: { type: String, default: '' },
        updatedAt: Date
    },
    // Optional, from sign-up or the feed page: what the feed looks for
    targetTitles: {
        type: [String],
        default: []
    },
    targetLocation: {
        type: String,
        trim: true,
        default: ''
    },
    // When the feed last fetched openings for those titles
    feedFetchedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);
