const express = require('express');
const User = require('../models/User');
const { apiAuth } = require('../middleware/auth');
const { requireDb } = require('../utils/db');
const { cleanPreferences } = require('../utils/preferences');

// The signed-in user's saved CV and feed preferences
const router = express.Router();
router.use(apiAuth, requireDb);

const serverError = (res, action, error) => {
    console.error(`Error ${action}:`, error);
    res.status(500).json({ error: `Could not ${action}` });
};

router.get('/', async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('email cv targetTitles targetLocation').lean();
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        res.json({
            email: user.email,
            cv: user.cv?.text ? { text: user.cv.text, name: user.cv.name || '', updatedAt: user.cv.updatedAt } : null,
            targetTitles: user.targetTitles || [],
            targetLocation: user.targetLocation || ''
        });
    } catch (error) {
        serverError(res, 'load your profile', error);
    }
});

router.delete('/cv', async (req, res) => {
    try {
        await User.updateOne({ _id: req.userId }, { $unset: { cv: 1 } });
        res.json({ success: true });
    } catch (error) {
        serverError(res, 'delete your CV', error);
    }
});

// New titles or a new city clear feedFetchedAt, so the feed fetches openings for them
router.put('/preferences', async (req, res) => {
    try {
        const preferences = cleanPreferences(req.body);
        const user = await User.findById(req.userId).select('targetTitles targetLocation');
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });

        // A change of capitals only is saved but doesn't refetch
        const key = ({ targetTitles, targetLocation }) => `${targetTitles.join('|')}@${targetLocation}`.toLowerCase();
        const changed = key(preferences) !== key(user);
        Object.assign(user, preferences);
        if (changed) user.feedFetchedAt = null;
        if (user.isModified()) await user.save();
        res.json({ ...preferences, changed });
    } catch (error) {
        serverError(res, 'save your preferences', error);
    }
});

module.exports = router;
