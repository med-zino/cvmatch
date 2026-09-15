const SavedJob = require('../models/SavedJob');

// Every handler acts on req.userId, set by apiAuth from the session token,
// so one user can never read or change another user's saved jobs.

const serverError = (res, action, error) => {
    console.error(`Error ${action}:`, error);
    res.status(500).json({ success: false, message: 'Internal server error' });
};

const saveJob = async (req, res) => {
    try {
        const { title, company, link, score, posted, skillsMatch, missingSkills, reasons } = req.body;
        if (!title || !company || !link || score === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, company, link, and score are required'
            });
        }

        const savedJob = await SavedJob.create({
            userId: req.userId,
            title,
            company,
            link,
            score,
            posted: posted || 'Not specified',
            skillsMatch: skillsMatch || [],
            missingSkills: missingSkills || [],
            reasons: reasons || []
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

module.exports = { saveJob, getSavedJobs, deleteSavedJob, updateSavedJob };
