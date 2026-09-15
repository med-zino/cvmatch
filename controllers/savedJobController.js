const SavedJob = require('../models/SavedJob');
const FeedJob = require('../models/FeedJob');
const User = require('../models/User');
const { writeAssist, ASSIST_LANGUAGES } = require('../services/assist');

// Every handler acts on req.userId, set by apiAuth from the session token,
// so one user can never read or change another user's saved jobs.

const serverError = (res, action, error) => {
    console.error(`Error ${action}:`, error);
    res.status(500).json({ success: false, message: 'Internal server error' });
};

const saveJob = async (req, res) => {
    try {
        const { title, company, link, score, posted, skillsMatch, missingSkills, reasons } = req.body;
        if (!title || !link) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title and link are required'
            });
        }

        // A cover letter or CV tips already written for this job in the results or the feed come along
        const listing = await FeedJob.findOne({ userId: req.userId, link }).select('coverLetter cvTips').lean();

        // Feed jobs can be saved before they're scored
        const savedJob = await SavedJob.create({
            userId: req.userId,
            title,
            company: company || '',
            link,
            score: score ?? null,
            posted: posted || 'Not specified',
            skillsMatch: skillsMatch || [],
            missingSkills: missingSkills || [],
            reasons: reasons || [],
            ...(listing?.coverLetter?.text ? { coverLetter: listing.coverLetter } : {}),
            cvTips: listing?.cvTips || null
        });
        res.status(201).json({ success: true, message: 'Job saved successfully', savedJob });
    } catch (error) {
        // The unique (userId, link) index rejects a second save of the same job
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Job already saved by this user' });
        }
        serverError(res, 'saving job', error);
    }
};

const getSavedJobs = async (req, res) => {
    try {
        const savedJobs = await SavedJob.find({ userId: req.userId }).sort({ savedAt: -1 });
        res.status(200).json({ success: true, count: savedJobs.length, savedJobs });
    } catch (error) {
        serverError(res, 'fetching saved jobs', error);
    }
};

const deleteSavedJob = async (req, res) => {
    try {
        const savedJob = await SavedJob.findOneAndDelete({ _id: req.params.jobId, userId: req.userId });
        if (!savedJob) {
            return res.status(404).json({ success: false, message: 'Saved job not found' });
        }
        res.status(200).json({ success: true, message: 'Saved job deleted successfully', deletedJob: savedJob });
    } catch (error) {
        serverError(res, 'deleting saved job', error);
    }
};

const updateSavedJob = async (req, res) => {
    try {
        const { status, notes } = req.body;
        const updateData = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const savedJob = await SavedJob.findOneAndUpdate(
            { _id: req.params.jobId, userId: req.userId },
            updateData,
            { new: true, runValidators: true }
        );
        if (!savedJob) {
            return res.status(404).json({ success: false, message: 'Saved job not found' });
        }
        res.status(200).json({ success: true, message: 'Saved job updated successfully', savedJob });
    } catch (error) {
        serverError(res, 'updating saved job', error);
    }
};

// Writes a cover letter or CV tips for a saved job from the saved CV and the full listing,
// which comes from the feed (every searched job is kept there). The result is stored on the job.
const assistSavedJob = async (req, res) => {
    try {
        const kind = req.body.kind === 'tips' ? 'tips' : 'letter';
        const language = ASSIST_LANGUAGES.includes(req.body.language) ? req.body.language : 'auto';
        const [savedJob, user] = await Promise.all([
            SavedJob.findOne({ _id: req.params.jobId, userId: req.userId }),
            User.findById(req.userId).select('cv')
        ]);
        if (!savedJob) {
            return res.status(404).json({ success: false, message: 'Saved job not found' });
        }
        if (!user?.cv?.text) {
            return res.status(400).json({ success: false, code: 'no_cv', message: 'Add your CV first: run one search on Find matches and it’s saved for this.' });
        }

        const listing = await FeedJob.findOne({ userId: req.userId, link: savedJob.link })
            .select('title company location description qualifications').lean();
        // Jobs saved before the feed existed only have what the match found
        const job = listing?.description ? listing : {
            title: savedJob.title,
            company: savedJob.company,
            qualifications: [...(savedJob.skillsMatch || []), ...(savedJob.missingSkills || [])],
            description: (savedJob.reasons || []).join(' ')
        };

        const controller = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });
        savedJob[kind === 'letter' ? 'coverLetter' : 'cvTips'] = await writeAssist(kind, user.cv.text, job, language, controller.signal);
        await savedJob.save();

        res.json({ success: true, savedJob, fromListing: Boolean(listing?.description) });
    } catch (error) {
        console.error('Error writing application help:', error.message);
        res.status(502).json({ success: false, message: error.message || 'Could not write this right now.' });
    }
};

module.exports = { saveJob, getSavedJobs, deleteSavedJob, updateSavedJob, assistSavedJob };
