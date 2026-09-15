const mongoose = require('mongoose');

// Bookkeeping for scheduled work, one document per job ("alerts")
const schedulerStateSchema = new mongoose.Schema({
    _id: String,
    // Last call from the hourly schedule; the daily fallback stands down while it's recent
    lastHourlyAt: Date
}, { versionKey: false });

module.exports = mongoose.model('SchedulerState', schedulerStateSchema);
