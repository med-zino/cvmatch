const SavedJob = require('../models/SavedJob');
const User = require('../models/User');

// Save a job for a user
const saveJob = async (req, res) => {
    try {
        const { userId, title, company, link, score, posted, skillsMatch, missingSkills, reasons } = req.body;

        // Validate required fields
        if (!userId || !title || !company || !link || score === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: userId, title, company, link, and score are required'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if job is already saved by this user
        const existingSavedJob = await SavedJob.findOne({ userId, link });
        if (existingSavedJob) {
            return res.status(409).json({
                success: false,
                message: 'Job already saved by this user',
                savedJob: existingSavedJob
            });
        }

        // Create new saved job
        const savedJob = new SavedJob({
            userId,
            title,
            company,
            link,
            score,
            posted: posted || 'Not specified',
            skillsMatch: skillsMatch || [],
            missingSkills: missingSkills || [],
            reasons: reasons || []
        });

        await savedJob.save();

        res.status(201).json({
            success: true,
            message: 'Job saved successfully',
            savedJob
        });

    } catch (error) {
        console.error('Error saving job:', error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Job already saved by this user'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Get all saved jobs for a user
const getSavedJobs = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate userId
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get saved jobs for the user, sorted by most recent first
        const savedJobs = await SavedJob.find({ userId })
            .sort({ savedAt: -1 })
            .populate('userId', 'firstName lastName email');

        res.status(200).json({
            success: true,
            count: savedJobs.length,
            savedJobs
        });

    } catch (error) {
        console.error('Error fetching saved jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Delete a saved job
const deleteSavedJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { userId } = req.body;

        // Validate required fields
        if (!jobId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Job ID and User ID are required'
            });
        }

        // Find and delete the saved job (ensure it belongs to the user)
        const savedJob = await SavedJob.findOneAndDelete({ 
            _id: jobId, 
            userId: userId 
        });

        if (!savedJob) {
            return res.status(404).json({
                success: false,
                message: 'Saved job not found or does not belong to this user'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Saved job deleted successfully',
            deletedJob: savedJob
        });

    } catch (error) {
        console.error('Error deleting saved job:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Update saved job status or notes
const updateSavedJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { userId, status, notes } = req.body;

        // Validate required fields
        if (!jobId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Job ID and User ID are required'
            });
        }

        // Prepare update object
        const updateData = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        // Find and update the saved job (ensure it belongs to the user)
        const savedJob = await SavedJob.findOneAndUpdate(
            { _id: jobId, userId: userId },
            updateData,
            { new: true, runValidators: true }
        );

        if (!savedJob) {
            return res.status(404).json({
                success: false,
                message: 'Saved job not found or does not belong to this user'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Saved job updated successfully',
            savedJob
        });

    } catch (error) {
        console.error('Error updating saved job:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    saveJob,
    getSavedJobs,
    deleteSavedJob,
    updateSavedJob
};
