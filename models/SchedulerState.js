const mongoose = require('mongoose');

// Bookkeeping for scheduled work, one document per job ("alerts")
const schedulerStateSchema = new mongoose.Schema({
    _id: String,
    // Last call from the hourly schedule; the daily fallback stands down while it's recent
    lastHourlyAt: Date,
    // The summary of the last finished run, so a call that answers before the work ends can still show it
    lastRun: mongoose.Schema.Types.Mixed
}, { versionKey: false });

module.exports = mongoose.model('SchedulerState', schedulerStateSchema);
