const express = require('express');
const router = express.Router();
const { apiAuth } = require('../middleware/auth');
const { saveJob, getSavedJobs, deleteSavedJob, updateSavedJob } = require('../controllers/savedJobController');

// All routes act on the signed-in user from the session token
router.use(apiAuth);

// POST /api/saved-jobs - Save a job
router.post('/', saveJob);

// GET /api/saved-jobs - List the user's saved jobs
router.get('/', getSavedJobs);

// DELETE /api/saved-jobs/:jobId - Delete a saved job
router.delete('/:jobId', deleteSavedJob);

// PUT /api/saved-jobs/:jobId - Update saved job status or notes
router.put('/:jobId', updateSavedJob);

module.exports = router;
