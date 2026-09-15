// A user's feed: openings for their target titles plus every listing from their searches
const User = require('../models/User');
const FeedJob = require('../models/FeedJob');
const SavedJob = require('../models/SavedJob');
const { searchJobs, DESCRIPTION_CHARS } = require('./matching');

// JSearch pages per title on each feed refresh (10 listings and one RapidAPI request each)
const FEED_PAGES = Number(process.env.FEED_PAGES) || 2;
// Past this, the oldest jobs drop off: descriptions are kept for scoring, and the free database tier is 512 MB
const FEED_MAX = 400;

const scoreFields = match => ({
  score: match.score,
  reasons: match.reasons,
  skillsMatch: match.skillsMatch,
  missingSkills: match.missingSkills,
  scoredAt: new Date()
});

// The job shape the scoring expects, from a stored feed job
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

// entries: [{ job, query }] in the order they should appear, newest first.
// A job already in the feed keeps its place and only picks up a new score.
async function addToFeed(userId, entries, source, matches = []) {
  const byJobId = new Map(matches.map(match => [match.jobId, match]));
  const now = Date.now();
  const ops = entries.filter(({ job }) => job.job_id).map(({ job, query }, index) => {
    const match = byJobId.get(job.job_id);
    return {
      updateOne: {
        filter: { userId, jobId: job.job_id },
        update: {
          $setOnInsert: {
            source,
            query,
            title: job.title,
            company: job.company,
            location: job.location,
            link: job.link,
            publisher: job.publisher,
            posted: job.posted,
            employmentType: job.employment_type,
            isRemote: job.is_remote,
            qualifications: job.qualifications,
            description: job.description.slice(0, DESCRIPTION_CHARS),
            addedAt: new Date(now - index)
          },
          ...(match ? { $set: scoreFields(match) } : {})
        },
        upsert: true
      }
    };
  });
  if (!ops.length) return;

  await FeedJob.bulkWrite(ops, { ordered: false });
  const cutoff = await FeedJob.findOne({ userId }).sort({ addedAt: -1, _id: -1 }).skip(FEED_MAX).select('addedAt').lean();
  if (cutoff) await FeedJob.deleteMany({ userId, addedAt: { $lte: cutoff.addedAt } });
}

// Searches every target title in parallel and interleaves the results, so the top isn't all one
// title. A posting found for two titles (often under two ids, from two boards) is kept once.
// Throws only when every search failed.
async function searchTitles(user, filters, signal, pages) {
  const place = user.targetLocation;
  const results = await Promise.allSettled(user.targetTitles.map(title =>
    searchJobs(place ? `${title} in ${place}` : title, filters, signal, pages)));
  const lists = results.map(result => result.status === 'fulfilled' ? result.value : []);
  const failure = results.find(result => result.status === 'rejected');
  if (!lists.some(list => list.length) && failure) throw failure.reason;

  const entries = [];
  const seen = new Set();
  for (let i = 0; i < Math.max(0, ...lists.map(list => list.length)); i++) {
    lists.forEach((list, t) => {
      const job = list[i];
      if (!job) return;
      const key = `${job.title}|${job.company}`.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(job.job_id) || seen.has(key)) return;
      seen.add(job.job_id).add(key);
      entries.push({ job, query: user.targetTitles[t] });
    });
  }
  return entries;
}

// Fetches openings for every target title. Returns how many listings came back.
async function refreshFeed(user, signal) {
  const entries = await searchTitles(user, {}, signal, FEED_PAGES);
  await addToFeed(user._id, entries, 'feed');
  await User.updateOne({ _id: user._id }, { feedFetchedAt: new Date() });
  return entries.length;
}

// Stores new scores on feed jobs; saved copies of those jobs without a score pick them up too.
// Returns the jobs that were scored, with their scores.
async function saveScores(userId, jobs, matches) {
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
        { userId, link: job.link, score: null },
        { $set: { score: job.score, reasons: job.reasons, skillsMatch: job.skillsMatch, missingSkills: job.missingSkills } }
      ))
    ]);
  }
  return scored;
}

module.exports = { addToFeed, refreshFeed, searchTitles, saveScores, toScoringJob };
