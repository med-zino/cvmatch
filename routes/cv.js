const express = require('express');
const User = require('../models/User');
const { apiAuth } = require('../middleware/auth');
const { connectToDatabase } = require('../utils/db');
const { summarizeCV, searchJobs, scoreJobs } = require('../services/matching');
const { addToFeed } = require('../services/feed');

const router = express.Router();

// Streams progress as server-sent events. The CV summary and the job search run side by side, and
// each page of listings is scored as soon as it arrives, so the first results show while slower
// pages are still loading. The CV is saved for next time, and every listing lands in the feed.
router.post('/find-matches', apiAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = data => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Stops the paid API calls if the user leaves before the results are ready
  const controller = new AbortController();
  const { signal } = controller;
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const { query = '', cvText = '', cvName = '', filters = {} } = req.body;
  // Database writes run alongside the matching; failures there don't stop it
  const background = [];
  const inBackground = (label, promise) => background.push(promise.catch(error => console.error(`${label} failed:`, error.message)));

  async function findMatches() {
    if (!process.env.GEMINI_API_KEY || !(process.env.RAPIDAPI_KEYS || process.env.RAPIDAPI_KEY)) {
      send({ status: 'error', error: 'Job matching is not configured', message: 'The server is missing GEMINI_API_KEY or RAPIDAPI_KEY.' });
      return;
    }
    if (!cvText.trim() || !query.trim()) {
      send({ status: 'error', error: 'A CV and a search are required' });
      return;
    }

    inBackground('Saving the CV', connectToDatabase().then(() => User.updateOne(
      { _id: req.userId, 'cv.text': { $ne: cvText } },
      { cv: { text: cvText, name: String(cvName).slice(0, 200), updatedAt: new Date() } }
    )));

    send({ status: 'analyzing_cv', message: 'Reading your CV and searching listings...' });
    // The summary is only for display, so a failure there doesn't stop the matching
    const profile = summarizeCV(cvText, signal)
      .catch(error => {
        console.error('CV summary failed:', error.message);
        return null;
      })
      .then(cvAnalysis => {
        send({ status: 'cv_analyzed', cvAnalysis });
        return cvAnalysis;
      });

    const jobMatches = [];
    const scoring = [];
    let found = 0;
    let processed = 0;
    let lastError;
    const jobs = await searchJobs(query, filters, signal, undefined, fresh => {
      found += fresh.length;
      send({ status: 'jobs_found', message: `Found ${found} jobs`, totalJobs: found });
      scoring.push(scoreJobs(cvText, fresh, signal, (matches, _, batchSize) => {
        jobMatches.push(...matches);
        processed += batchSize;
        send({ status: 'chunk_complete', matches, progress: { processed, total: found } });
      }).catch(error => {
        lastError = error;
      }));
    });
    if (!jobs.length) {
      send({ status: 'error', error: 'No job listings found' });
      return;
    }

    await Promise.all(scoring);
    if (!jobMatches.length) {
      throw lastError || new Error('No matches came back for this search.');
    }

    inBackground('Adding the search to the feed', connectToDatabase().then(() =>
      addToFeed(req.userId, jobs.map(job => ({ job, query })), 'search', jobMatches)));

    send({
      status: 'complete',
      result: {
        cvAnalysis: await profile,
        jobMatches: jobMatches.sort((a, b) => b.score - a.score),
        meta: {
          totalJobsFound: jobs.length,
          matchedJobs: jobMatches.length,
          failedJobs: jobs.length - jobMatches.length,
          processedAt: new Date().toISOString()
        }
      }
    });
  }

  try {
    await findMatches();
  } catch (error) {
    if (!signal.aborted) {
      console.error('Error in job matching process:', error.message);
      send({ status: 'error', error: 'Processing error', message: error.message });
    }
  }
  // A serverless function may be frozen once the response ends, so the writes finish first
  await Promise.all(background);
  res.end();
});

module.exports = router;
