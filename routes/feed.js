const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const FeedJob = require('../models/FeedJob');
const SavedJob = require('../models/SavedJob');
const { apiAuth } = require('../middleware/auth');
const { requireDb } = require('../utils/db');
const { scoreJobs } = require('../services/matching');
const { refreshFeed, scoreFields } = require('../services/feed');

const router = express.Router();
router.use(apiAuth, requireDb);

const PAGE_SIZE = 20;
// Each refresh costs RapidAPI requests (pages x titles), so a feed refreshes at most hourly
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
// Per request; the page sends "Score all" in chunks
const MAX_SCORE_IDS = 25;
const SOURCES = ['feed', 'search'];
const SNIPPET_CHARS = 320;

// What the page shows: a snippet instead of the full description
function toItem(job) {
    const text = (job.description || '').replace(/\s+/g, ' ').trim();
    return {
        id: String(job._id),
        source: job.source,
        query: job.query,
        title: job.title,
        company: job.company,
        location: job.location,
        link: job.link,
        publisher: job.publisher,
        posted: job.posted,
        isRemote: job.isRemote,
        snippet: text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS - 3).trimEnd()}…` : text,
        score: typeof job.score === 'number' ? job.score : null,
        reasons: job.reasons || [],
        skillsMatch: job.skillsMatch || [],
        missingSkills: job.missingSkills || []
    };
}

// The job shape the scoring expects
const toScoringJob = job => ({
    job_id: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location,
    employment_type: job.employmentType,
    is_remote: job.isRemote,
    qualifications: job.qualifications || [],
    description: job.description || '',
    link: job.link,
    posted: job.posted,
    publisher: job.publisher
});

// GET /api/feed?source=all|feed|search&cursor= — newest first, PAGE_SIZE at a time
router.get('/', async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.userId);
        const filter = { userId };
        if (SOURCES.includes(req.query.source)) filter.source = req.query.source;

        // The cursor is the addedAt and id of the last item already shown
        const [at, id] = String(req.query.cursor || '').split('_');
        const query = at && mongoose.isValidObjectId(id)
            ? { ...filter, $or: [{ addedAt: { $lt: new Date(Number(at)) } }, { addedAt: new Date(Number(at)), _id: { $lt: id } }] }
            : filter;

        const [jobs, user, groups] = await Promise.all([
            FeedJob.find(query).sort({ addedAt: -1, _id: -1 }).limit(PAGE_SIZE + 1).lean(),
            User.findById(userId).select('targetTitles targetLocation feedFetchedAt cv.updatedAt').lean(),
            FeedJob.aggregate([{ $match: { userId } }, { $group: { _id: '$source', count: { $sum: 1 } } }])
        ]);
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });

        const page = jobs.slice(0, PAGE_SIZE);
        const last = page[page.length - 1];
        const counts = Object.fromEntries(groups.map(group => [group._id, group.count]));
        res.json({
            items: page.map(toItem),
            nextCursor: jobs.length > PAGE_SIZE ? `${last.addedAt.getTime()}_${last._id}` : null,
            counts: { all: (counts.feed || 0) + (counts.search || 0), feed: counts.feed || 0, search: counts.search || 0 },
            profile: {
                titles: user.targetTitles || [],
                location: user.targetLocation || '',
                fetchedAt: user.feedFetchedAt || null,
                hasCv: Boolean(user.cv?.updatedAt)
            }
        });
    } catch (error) {
        console.error('Error loading the feed:', error);
        res.status(500).json({ error: 'Could not load your feed' });
    }
});

// Fetches fresh openings for the user's titles
router.post('/refresh', async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('targetTitles targetLocation feedFetchedAt');
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        if (!user.targetTitles.length) {
            return res.status(400).json({ error: 'Add the job titles you want first.' });
        }
        const waitMs = user.feedFetchedAt ? user.feedFetchedAt.getTime() + REFRESH_COOLDOWN_MS - Date.now() : 0;
        if (waitMs > 0) {
            return res.status(429).json({ error: `Your feed was refreshed recently. Try again in ${Math.ceil(waitMs / 60000)} min.` });
        }

        const controller = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });
        const found = await refreshFeed(user, controller.signal);
        res.json({ success: true, found });
    } catch (error) {
        console.error('Error refreshing the feed:', error.message);
        res.status(502).json({ error: error.message || 'Could not fetch openings right now.' });
    }
});

// Scores feed jobs against the saved CV. Saved copies of those jobs pick up the score too.
router.post('/score', async (req, res) => {
    try {
        const ids = (Array.isArray(req.body.ids) ? req.body.ids : [])
            .filter(id => mongoose.isValidObjectId(id))
            .slice(0, MAX_SCORE_IDS);
        if (!ids.length) return res.status(400).json({ error: 'No jobs to score' });

        const [user, jobs] = await Promise.all([
            User.findById(req.userId).select('cv'),
            FeedJob.find({ _id: { $in: ids }, userId: req.userId }).lean()
        ]);
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        if (!user.cv?.text) {
            return res.status(400).json({ code: 'no_cv', error: 'Add your CV first: run one search on Find matches and it’s saved for scoring here.' });
        }

        const controller = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });
        const matches = await scoreJobs(user.cv.text, jobs.map(toScoringJob), controller.signal);

        const byJobId = new Map(matches.map(match => [match.jobId, match]));
        const scored = jobs
            .filter(job => byJobId.has(job.jobId))
            .map(job => ({ ...job, ...scoreFields(byJobId.get(job.jobId)) }));
        if (scored.length) {
            await Promise.all([
                FeedJob.bulkWrite(scored.map(job => ({
                    updateOne: { filter: { _id: job._id }, update: { $set: scoreFields(job) } }
                }))),
                ...scored.filter(job => job.link).map(job => SavedJob.updateMany(
                    { userId: req.userId, link: job.link, score: null },
                    { $set: { score: job.score, reasons: job.reasons, skillsMatch: job.skillsMatch, missingSkills: job.missingSkills } }
                ))
            ]);
        }
        res.json({ items: scored.map(toItem), failed: jobs.length - scored.length });
    } catch (error) {
        console.error('Error scoring feed jobs:', error.message);
        res.status(502).json({ error: error.message || 'Could not score these jobs right now.' });
    }
});

module.exports = router;
