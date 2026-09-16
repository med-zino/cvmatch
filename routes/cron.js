const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireDb } = require('../utils/db');
const appUrl = require('../utils/appUrl');
const { JWT_SECRET } = require('../middleware/auth');
const { runDueAlerts } = require('../services/alerts');

const router = express.Router();

// Vercel Cron and the GitHub Actions workflow both send "Authorization: Bearer <CRON_SECRET>";
// without CRON_SECRET set, nothing can trigger a run
function cronAuth(req, res, next) {
    const secret = process.env.CRON_SECRET;
    // Told apart on purpose: a schedule that gets 401 sends the wrong secret, 503 means the app has none
    if (!secret) {
        console.error('Alerts: CRON_SECRET is not set on the server, so no schedule can run');
        return res.status(503).json({ error: 'CRON_SECRET is not set on the server, so scheduled runs are off' });
    }
    if (req.get('authorization') !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// GET /api/cron/alerts?source=hourly|daily
router.get('/cron/alerts', cronAuth, requireDb, async (req, res) => {
    try {
        const summary = await runDueAlerts({ source: req.query.source === 'daily' ? 'daily' : 'hourly', baseUrl: appUrl(req) });
        console.log('Daily alerts run:', JSON.stringify(summary));
        res.json(summary);
    } catch (error) {
        console.error('Daily alerts run failed:', error);
        res.status(500).json({ error: error.message });
    }
});

const page = (title, text) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Pounce</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Instrument+Serif&display=swap">
    <link rel="stylesheet" href="/css/app.css">
</head>
<body>
    <main class="container" style="max-width: 560px; padding: 96px 0;">
        <h1 class="page-title">${title}</h1>
        <p class="page-sub">${text}</p>
        <p style="margin-top: 28px;"><a class="btn btn-primary" href="/feed">Open your feed</a></p>
    </main>
</body>
</html>`;

// The unsubscribe link in every daily email. POST is the one-click unsubscribe mail apps send.
router.all('/alerts/unsubscribe', requireDb, async (req, res) => {
    try {
        const { userId, purpose } = jwt.verify(String(req.query.token || ''), JWT_SECRET);
        if (purpose !== 'alert-unsubscribe') throw new Error('Not an unsubscribe token');
        await User.updateOne({ _id: userId }, { 'alert.enabled': false });
        if (req.method === 'POST') return res.status(200).end();
        res.send(page('Daily emails are off', 'You won’t get the daily matches email any more. You can turn it back on from your Feed at any time.'));
    } catch {
        res.status(400).send(page('This link has expired', 'Turn the daily email off from your Feed instead.'));
    }
});

module.exports = router;
