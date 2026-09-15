const express = require('express');
const User = require('../models/User');
const { apiAuth } = require('../middleware/auth');
const { requireDb } = require('../utils/db');
const appUrl = require('../utils/appUrl');
const { cleanPreferences } = require('../utils/preferences');
const { runAlert, validTimeZone } = require('../services/alerts');

// The signed-in user's saved CV, feed preferences, daily email and tour
const router = express.Router();
router.use(apiAuth, requireDb);

// A test email runs a real search, so tests are spaced out
const TEST_COOLDOWN_MS = 10 * 60 * 1000;

const serverError = (res, action, error) => {
    console.error(`Error ${action}:`, error);
    res.status(500).json({ error: `Could not ${action}` });
};

const alertSettings = alert => ({
    enabled: Boolean(alert?.enabled),
    hour: alert?.hour ?? 8,
    timeZone: alert?.timeZone || 'UTC',
    lastSentAt: alert?.lastSentAt || null
});

router.get('/', async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('email cv targetTitles targetLocation alert tourSeenAt').lean();
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        res.json({
            email: user.email,
            cv: user.cv?.text ? { text: user.cv.text, name: user.cv.name || '', updatedAt: user.cv.updatedAt } : null,
            targetTitles: user.targetTitles || [],
            targetLocation: user.targetLocation || '',
            alert: alertSettings(user.alert),
            tourSeen: Boolean(user.tourSeenAt)
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

// Daily email settings. Turning it on needs titles to search for and a CV to score against.
router.put('/alert', async (req, res) => {
    try {
        const hour = Number(req.body.hour);
        const { timeZone } = req.body;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
            return res.status(400).json({ error: 'Choose an hour between 0 and 23.' });
        }
        if (!validTimeZone(timeZone)) return res.status(400).json({ error: 'Unknown time zone.' });

        const user = await User.findById(req.userId).select('targetTitles cv.updatedAt alert');
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        const enabled = Boolean(req.body.enabled);
        if (enabled && !user.targetTitles.length) {
            return res.status(400).json({ error: 'Add the job titles you want on your Feed first.' });
        }
        if (enabled && !user.cv?.updatedAt) {
            return res.status(400).json({ error: 'Run one search on Find matches first, so your CV is saved for scoring.' });
        }

        Object.assign(user.alert, { enabled, hour, timeZone });
        await user.save();
        res.json({ alert: alertSettings(user.alert) });
    } catch (error) {
        serverError(res, 'save your daily email', error);
    }
});

// Sends today's email now, whatever the schedule, so the user can see what it looks like
router.post('/alert/test', async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('email cv targetTitles targetLocation alert');
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        const waitMs = user.alert?.lastTestAt ? user.alert.lastTestAt.getTime() + TEST_COOLDOWN_MS - Date.now() : 0;
        if (waitMs > 0) {
            return res.status(429).json({ error: `You can send another test in ${Math.ceil(waitMs / 60000)} min.` });
        }
        await User.updateOne({ _id: user._id }, { 'alert.lastTestAt': new Date() });

        const controller = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });
        const result = await runAlert(user.toObject(), { baseUrl: appUrl(req), signal: controller.signal });
        res.json(result.sent ? { sent: true, jobs: result.jobs, email: user.email } : { sent: false, message: result.reason });
    } catch (error) {
        console.error('Test alert failed:', error.message);
        res.status(502).json({ error: error.message || 'Could not send the email right now.' });
    }
});

router.post('/tour', async (req, res) => {
    try {
        await User.updateOne({ _id: req.userId }, { tourSeenAt: new Date() });
        res.json({ success: true });
    } catch (error) {
        serverError(res, 'save the tour', error);
    }
});

module.exports = router;
