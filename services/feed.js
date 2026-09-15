// A user's feed: openings for their target titles plus every listing from their searches
const User = require('../models/User');
const FeedJob = require('../models/FeedJob');
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

// Fetches openings for every target title in parallel. Titles are interleaved,
// so the top of the feed isn't all one title. Returns how many listings came back.
async function refreshFeed(user, signal) {
  const place = user.targetLocation;
  const results = await Promise.allSettled(user.targetTitles.map(title =>
    searchJobs(place ? `${title} in ${place}` : title, {}, signal, FEED_PAGES)));
  const lists = results.map(result => result.status === 'fulfilled' ? result.value : []);
  const failure = results.find(result => result.status === 'rejected');
  if (!lists.some(list => list.length) && failure) throw failure.reason;

  const entries = [];
  for (let i = 0; i < Math.max(...lists.map(list => list.length)); i++) {
    lists.forEach((list, t) => {
      if (list[i]) entries.push({ job: list[i], query: user.targetTitles[t] });
    });
  }
  await addToFeed(user._id, entries, 'feed');
  await User.updateOne({ _id: user._id }, { feedFetchedAt: new Date() });
  return entries.length;
}

module.exports = { addToFeed, refreshFeed, scoreFields };
