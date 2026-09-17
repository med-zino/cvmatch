// Daily email with the top matches: new openings for the user's titles, scored against their CV
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FeedJob = require('../models/FeedJob');
const SchedulerState = require('../models/SchedulerState');
const { JWT_SECRET } = require('../middleware/auth');
const { scoreJobs, eachLimited } = require('./matching');
const { addToFeed, searchTitles, saveScores, toScoringJob } = require('./feed');
const { sendJobAlertEmail } = require('../utils/emailService');

// JSearch pages per title for each alert (one RapidAPI request each), from listings of the last 3 days
const ALERT_PAGES = Number(process.env.ALERT_PAGES) || 1;
const TOP_JOBS = 3;
// A run stops starting new users after this; the rest are still due and go out the next hour
const RUN_BUDGET_MS = 200 * 1000;
const USER_TIMEOUT_MS = 90 * 1000;
// How long one run may hold a user before another run may take them: longer than one user's work,
// short enough that a run killed halfway frees them again within minutes
const LEASE_MS = 10 * 60 * 1000;
const CONCURRENCY = 3;
// The daily fallback stands down while the hourly schedule is running
const HOURLY_ACTIVE_MS = 3 * 60 * 60 * 1000;

// The user's local date and time of day in minutes, e.g. { date: '2026-09-15', minutes: 450 } at 07:30
function localTime(timeZone, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
  } catch {
    return localTime('UTC', now);
  }
  const part = type => parts.find(p => p.type === type).value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
}

function validTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return Boolean(timeZone);
  } catch {
    return false;
  }
}

// Finds, scores and emails one user's top new matches. The jobs also land in their feed,
// and a job that went out once is never emailed again.
async function runAlert(user, { baseUrl, signal }) {
  if (!user.targetTitles?.length) return { sent: false, reason: 'Add the job titles you want on your Feed first.' };
  if (!user.cv?.text) return { sent: false, reason: 'Run one search on Find matches first, so your CV is saved.' };

  const entries = await searchTitles(user, { date_posted: '3days' }, signal, ALERT_PAGES);
  await addToFeed(user._id, entries, 'feed');

  const jobs = await FeedJob.find({
    userId: user._id,
    jobId: { $in: entries.map(entry => entry.job.job_id) },
    alertedAt: null
  }).lean();
  const unscored = jobs.filter(job => typeof job.score !== 'number');
  const scored = unscored.length
    ? await saveScores(user._id, unscored, await scoreJobs(user.cv.text, unscored.map(toScoringJob), signal))
    : [];
  const top = [...jobs.filter(job => typeof job.score === 'number'), ...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_JOBS);
  if (!top.length) return { sent: false, reason: 'No new openings for your titles in the last 3 days. We’ll look again tomorrow.' };

  const token = jwt.sign({ userId: user._id, purpose: 'alert-unsubscribe' }, JWT_SECRET);
  const email = await sendJobAlertEmail(user.email, {
    jobs: top,
    titles: user.targetTitles,
    location: user.targetLocation,
    feedUrl: `${baseUrl}/app#feed`,
    unsubscribeUrl: `${baseUrl}/api/alerts/unsubscribe?token=${token}`
  });
  if (!email.success) throw new Error(email.error || email.message || 'The email could not be sent');

  await FeedJob.updateMany({ _id: { $in: top.map(job => job._id) } }, { alertedAt: new Date() });
  return { sent: true, jobs: top.length };
}

// Called every 15 minutes, and once a day as a fallback. Emails every user whose chosen time has
// come and who hasn't had today's email; the daily fallback ignores the time.
async function runDueAlerts({ source, baseUrl }) {
  if (source === 'daily') {
    const state = await SchedulerState.findById('alerts').lean();
    if (state?.lastHourlyAt && Date.now() - state.lastHourlyAt.getTime() < HOURLY_ACTIVE_MS) {
      return { source, skipped: 'The hourly schedule is running' };
    }
  } else {
    await SchedulerState.updateOne({ _id: 'alerts' }, { lastHourlyAt: new Date() }, { upsert: true });
  }

  const users = await User.find({ 'alert.enabled': true }).select('email cv targetTitles targetLocation alert').lean();
  const due = users.filter(user => {
    const { date, minutes } = localTime(user.alert.timeZone);
    const chosen = user.alert.hour * 60 + (user.alert.minute || 0);
    return user.alert.lastRunDate !== date && (source === 'daily' || minutes >= chosen);
  });

  const started = Date.now();
  const summary = { source, due: due.length, sent: 0, nothingToSend: 0, failed: 0, deferred: 0, alreadyRunning: 0, latestBy: 0 };
  await eachLimited(due, CONCURRENCY, async user => {
    if (Date.now() - started > RUN_BUDGET_MS) {
      summary.deferred++;
      return;
    }
    const { date, minutes } = localTime(user.alert.timeZone);
    // A run takes minutes, so a scheduler calling every quarter of an hour, or retrying a call it
    // timed out on, can start while one is still going. Each user is leased before the work starts,
    // so only one run has them. The lease expires by itself if a run dies halfway, and the day is
    // only marked done once the email is really out, so nobody silently loses a day.
    const now = new Date();
    const claimed = await User.findOneAndUpdate(
      {
        _id: user._id,
        'alert.lastRunDate': { $ne: date },
        $or: [{ 'alert.runningSince': null }, { 'alert.runningSince': { $lt: new Date(now.getTime() - LEASE_MS) } }]
      },
      { $set: { 'alert.runningSince': now } }
    ).lean();
    if (!claimed) {
      summary.alreadyRunning++;
      return;
    }
    try {
      const result = await runAlert(user, { baseUrl, signal: AbortSignal.timeout(USER_TIMEOUT_MS) });
      await User.updateOne({ _id: user._id }, {
        $set: { 'alert.lastRunDate': date, ...(result.sent ? { 'alert.lastSentAt': new Date() } : {}) },
        $unset: { 'alert.runningSince': '' }
      });
      // How far past the chosen time this went out, so the schedule can be held to its promise
      if (result.sent) summary.latestBy = Math.max(summary.latestBy, minutes - (user.alert.hour * 60 + (user.alert.minute || 0)));
      summary[result.sent ? 'sent' : 'nothingToSend']++;
    } catch (error) {
      // The lease is dropped and the day left unmarked, so the next run tries this user again
      await User.updateOne({ _id: user._id }, { $unset: { 'alert.runningSince': '' } });
      summary.failed++;
      console.error(`Daily alert for ${user._id} failed:`, error.message);
    }
  });
  // Kept so the next call can show how the last run went, even when it outlived its own request
  await SchedulerState.updateOne({ _id: 'alerts' }, { $set: { lastRun: { at: new Date(), ...summary } } }, { upsert: true });
  return summary;
}

module.exports = { runAlert, runDueAlerts, localTime, validTimeZone };
