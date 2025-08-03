const express = require('express');
const router = express.Router();
const { saveJob, getSavedJobs, deleteSavedJob, updateSavedJob } = require('../controllers/savedJobController');

// POST /api/saved-jobs - Save a job for a user
router.post('/', saveJob);

// GET /api/saved-jobs/:userId - Get all saved jobs for a user
router.get('/:userId', getSavedJobs);

// DELETE /api/saved-jobs/:jobId - Delete a saved job
router.delete('/:jobId', deleteSavedJob);

// PUT /api/saved-jobs/:jobId - Update saved job status or notes
router.put('/:jobId', updateSavedJob);

module.exports = router;
