// Job search (JSearch), CV summary and scoring (Gemini), shared by Find matches and the feed
const crypto = require('crypto');

// Keys come from the environment only: a key committed to a public repo gets revoked.
// A fast model does the work; when it's rate-limited, overloaded or fails, the call moves down
// the list. Each model has its own free-tier quota, and a rate-limited one answers in ~0.1s.
const MODELS = [
  { model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', timeout: 20000 },
  { model: 'gemini-3.1-flash-lite', timeout: 20000 },
  { model: 'gemini-3.6-flash', thinkingLevel: 'low', timeout: 30000 }
];
// JSearch returns up to 10 listings per page; each page is one RapidAPI request, fetched in parallel
const JOB_PAGES = Number(process.env.JOB_PAGES) || 3;
// Batches of 5 take ~4s each and run in parallel
const BATCH_SIZE = 5;
const SCORING_CONCURRENCY = 4;
// Enough for any real requirements section; the tail of long listings is mostly boilerplate
const DESCRIPTION_CHARS = 6000;
// JSearch pages usually take 5-20s, but one can hang much longer
const JSEARCH_TIMEOUT = 45000;
// When a page is slow, a second try starts after this and the first answer wins (see fetchJobPage)
const HEDGE_AFTER_MS = Number(process.env.JSEARCH_HEDGE_MS) || 8000;
const PAGE_GRACE = 8000;
// The same search within 30 minutes reuses its listings: RapidAPI's free plan is 200 requests a month
const SEARCH_CACHE_MS = 30 * 60 * 1000;
const searchCache = new Map();

// ---------- Location → JSearch country ----------

const normalize = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Every ISO region's name in English and French (Intl only names real codes),
// plus short forms and large cities. JSearch searches one country at a time.
const PLACES = (() => {
  const places = {
    uk: 'gb', england: 'gb', scotland: 'gb', wales: 'gb', usa: 'us', america: 'us', uae: 'ae', holland: 'nl',
    paris: 'fr', lyon: 'fr', marseille: 'fr', toulouse: 'fr', lille: 'fr', nantes: 'fr', bordeaux: 'fr', nice: 'fr',
    london: 'gb', manchester: 'gb', birmingham: 'gb', edinburgh: 'gb', glasgow: 'gb', leeds: 'gb', bristol: 'gb',
    toronto: 'ca', vancouver: 'ca', montreal: 'ca', ottawa: 'ca', calgary: 'ca',
    berlin: 'de', munich: 'de', hamburg: 'de', frankfurt: 'de', cologne: 'de',
    sydney: 'au', melbourne: 'au', brisbane: 'au', perth: 'au', auckland: 'nz',
    amsterdam: 'nl', rotterdam: 'nl', madrid: 'es', barcelona: 'es', rome: 'it', milan: 'it',
    dublin: 'ie', brussels: 'be', zurich: 'ch', geneva: 'ch', vienna: 'at', lisbon: 'pt',
    stockholm: 'se', copenhagen: 'dk', oslo: 'no', warsaw: 'pl',
    dubai: 'ae', 'abu dhabi': 'ae', riyadh: 'sa', doha: 'qa', cairo: 'eg',
    algiers: 'dz', alger: 'dz', oran: 'dz', casablanca: 'ma', tunis: 'tn',
    lagos: 'ng', nairobi: 'ke', johannesburg: 'za', 'cape town': 'za',
    bangalore: 'in', bengaluru: 'in', mumbai: 'in', delhi: 'in', hyderabad: 'in',
    singapore: 'sg', tokyo: 'jp', 'hong kong': 'hk', 'sao paulo': 'br', 'mexico city': 'mx'
  };
  const locales = ['en', 'fr'].map(locale => new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }));
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      locales.forEach(locale => {
        const name = locale.of(code);
        if (name && !places[normalize(name)]) places[normalize(name)] = code.toLowerCase();
      });
    }
  }
  // Longest first, so "papua new guinea" wins over "guinea"
  return Object.entries(places)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([name, code]) => [new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), code]);
})();

// The place is what follows the last " in " of "role in place"; unknown places search the US
function countryFor(query) {
  const place = normalize(query.split(/\s+in\s+/i).pop());
  const match = PLACES.find(([pattern]) => pattern.test(place));
  return match ? match[1] : 'us';
}

// ---------- Gemini ----------

// Asks Gemini for JSON in a fixed shape; the key goes in a header so it never shows up in logged URLs.
// Each model is tried once, in order: rate limits, overload, timeouts and malformed replies move on to the next.
async function askGemini(prompt, schema, signal) {
  let lastError;
  for (const { model, thinkingLevel, timeout } of MODELS) {
    const generationConfig = { responseMimeType: 'application/json', responseSchema: schema };
    if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)])
      });
      const body = await response.json();
      if (!response.ok) {
        console.error(`Gemini ${model} returned ${response.status}:`, body.error?.message);
        throw new Error(response.status === 429
          ? 'The AI service is at its rate limit. Try again in a minute.'
          : body.error?.message || `The AI service returned ${response.status}`);
      }
      return JSON.parse(body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '');
    } catch (error) {
      if (signal.aborted) throw error;
      console.error(`Gemini ${model} failed:`, error.message);
      lastError = error;
    }
  }
  throw lastError;
}

// ---------- CV summary ----------

const PROFILE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    yearsExperience: { type: 'NUMBER' },
    skills: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['headline', 'skills']
};

// Shown while the jobs are scored; the scoring reads the CV itself.
// Cached per CV text, so a warm instance answers repeat searches instantly.
const profileCache = new Map();

async function summarizeCV(cvText, signal) {
  const key = crypto.createHash('sha256').update(cvText).digest('hex');
  if (!profileCache.has(key)) {
    const profile = await askGemini(`Read this CV and return:
- headline: the candidate's current or most recent role, in a few words
- yearsExperience: total years of professional experience, as a number
- skills: up to 15 of their most important skills, qualifications and registrations, most relevant first
Use only what the CV says.

CV:
"""
${cvText}
"""`, PROFILE_SCHEMA, signal);
    if (profileCache.size >= 200) profileCache.delete(profileCache.keys().next().value);
    profileCache.set(key, profile);
  }
  return profileCache.get(key);
}

// ---------- Job search ----------

// One or more RapidAPI keys: RAPIDAPI_KEYS (comma-separated) or RAPIDAPI_KEY. RapidAPI reports each
// key's quota on every response, so requests go to the key with the most left (usage stays even),
// and a key that runs out rests until its quota resets while the others carry on.
const rapidApiKeys = () => (process.env.RAPIDAPI_KEYS || process.env.RAPIDAPI_KEY || '')
  .split(',').map(key => key.trim()).filter(Boolean);
// How long a key rests when RapidAPI doesn't say: out of quota with no reset time, or refused
const KEY_REST_MS = 60 * 60 * 1000;
// "Too many requests" while quota remains is a per-second limit: a short pause is enough
const BURST_REST_MS = 60 * 1000;
const MAX_REST_MS = 32 * 24 * 60 * 60 * 1000;
// Kept per server instance; a fresh instance relearns from the first response of each key
const keyStates = new Map();
const keyState = key => {
  if (!keyStates.has(key)) keyStates.set(key, { remaining: Infinity, restUntil: 0 });
  return keyStates.get(key);
};
const maskKey = key => `…${key.slice(-4)}`;

function rest(key, ms, reason) {
  const state = keyState(key);
  const wasResting = state.restUntil > Date.now();
  state.restUntil = Date.now() + Math.min(ms, MAX_REST_MS);
  // Pages load in parallel, so the same news can arrive several times at once; it's logged once
  if (!wasResting) console.warn(`RapidAPI key ${maskKey(key)} ${reason}; resting until ${new Date(state.restUntil).toISOString()}`);
}

// Reads the quota headers RapidAPI sends with every response, successful or not
function noteQuota(key, response) {
  const header = name => (response.headers.has(name) ? Number(response.headers.get(name)) : null);
  const remaining = header('x-ratelimit-requests-remaining');
  const resetSeconds = header('x-ratelimit-requests-reset');
  if (remaining !== null) keyState(key).remaining = remaining;

  // 403 and 404 both mean the account behind this key cannot call JSearch: RapidAPI answers 404
  // for an endpoint a key isn't subscribed to. Neither reply carries quota headers, so a key left
  // unrested would still look like the emptiest one and be tried first on every page.
  if (response.status === 403 || response.status === 404) rest(key, KEY_REST_MS, 'cannot use JSearch (is that account subscribed?)');
  else if (response.status === 429 && remaining > 0) rest(key, BURST_REST_MS, 'hit the per-second limit');
  else if (response.status === 429 || remaining === 0) rest(key, resetSeconds > 0 ? resetSeconds * 1000 : KEY_REST_MS, 'is out of quota');
}

// The key for the next try at a page: one not tried yet for it, not resting, with the most requests
// left; resting keys come last, as a last resort. Ties start each page on a different key.
// A racing twin with a single key reuses it.
function pickKey(tried, page) {
  const now = Date.now();
  const keys = rapidApiKeys();
  const untried = keys.filter(key => !tried.has(key));
  const turn = key => (keys.indexOf(key) - (page - 1) + keys.length * page) % keys.length;
  return (untried.length ? untried : keys).sort((a, b) => {
    const first = keyState(a);
    const second = keyState(b);
    const restingA = first.restUntil > now;
    const restingB = second.restUntil > now;
    if (restingA !== restingB) return restingA ? 1 : -1;
    if (restingA) return first.restUntil - second.restUntil;
    if (first.remaining !== second.remaining) return second.remaining - first.remaining;
    return turn(a) - turn(b);
  })[0];
}

// Each key's standing as this server instance knows it, masked, for logs and checks
function keyHealth() {
  const now = Date.now();
  return rapidApiKeys().map(key => {
    const { remaining, restUntil } = keyState(key);
    return {
      key: maskKey(key),
      remaining: Number.isFinite(remaining) ? remaining : null,
      restingUntil: restUntil > now ? new Date(restUntil).toISOString() : null
    };
  });
}

async function requestJobPage(params, page, key, signal) {
  const url = new URL('https://jsearch.p.rapidapi.com/search');
  Object.entries({ ...params, page, num_pages: 1 }).forEach(([name, value]) => url.searchParams.set(name, value));

  const response = await fetch(url, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(JSEARCH_TIMEOUT)])
  });
  noteQuota(key, response);
  if (!response.ok) {
    throw new Error(response.status === 429 ? 'The job search service is over its request limit. Try again later.' : `Job search failed (${response.status})`);
  }
  return (await response.json()).data || [];
}

// One page. A failed try (out of quota, refused, server error, timeout) hands over to another key at
// once, so a page only fails once every key has. And since the same JSearch request can take 5s or
// 40s, a slow try gets one racing twin after HEDGE_AFTER_MS; the first answer wins, the other is cancelled.
function fetchJobPage(params, page, signal) {
  return new Promise((resolve, reject) => {
    const maxTries = rapidApiKeys().length + 1;
    const tried = new Set();
    const tries = [];
    let settled = false;
    let failures = 0;
    let hedged = false;
    let hedge;
    const settle = (finish, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      tries.forEach(controller => controller.abort());
      finish(value);
    };
    const launch = asHedge => {
      if (settled || tries.length >= maxTries || (asHedge && hedged)) return;
      if (asHedge) hedged = true;
      const key = pickKey(tried, page);
      tried.add(key);
      const controller = new AbortController();
      tries.push(controller);
      clearTimeout(hedge);
      if (!hedged) hedge = setTimeout(() => launch(true), HEDGE_AFTER_MS);
      requestJobPage(params, page, key, AbortSignal.any([signal, controller.signal])).then(
        jobs => settle(resolve, jobs),
        error => {
          if (settled) return;
          failures++;
          // Hand over to a key this page hasn't tried; with a single key, it gets one retry
          const canHandOver = tries.length < maxTries && (rapidApiKeys().some(key => !tried.has(key)) || tries.length < 2);
          if (signal.aborted) settle(reject, error);
          else if (canHandOver) launch(false);
          else if (failures === tries.length) settle(reject, error);
        }
      );
    };
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => settle(reject, signal.reason), { once: true });
    launch(false);
  });
}

// A JSearch listing in the app's job shape. Another job API would only need its own version of
// this to feed the same pipeline.
const fromJSearch = job => ({
  job_id: job.job_id || '',
  title: job.job_title || '',
  company: job.employer_name || '',
  location: [job.job_city, job.job_country].filter(Boolean).join(', '),
  posted: job.job_posted_at_datetime_utc || job.job_posted_at || '',
  link: job.job_apply_link || '',
  publisher: job.job_publisher || '',
  employment_type: job.job_employment_type || '',
  is_remote: Boolean(job.job_is_remote),
  qualifications: job.job_highlights?.Qualifications || [],
  description: job.job_description || ''
});

// Fetches the pages in parallel and hands each page's new listings to onJobs as it arrives, so they
// can be scored while slower pages load. Once one page has listings, the others get PAGE_GRACE to
// catch up, then the stragglers are cancelled. Resolves with every listing kept.
async function searchJobs(query, filters, signal, pages = JOB_PAGES, onJobs = () => {}) {
  const params = { query, country: countryFor(query), date_posted: filters.date_posted || 'all' };
  if (filters.work_from_home === 'true' || filters.work_from_home === 'false') params.work_from_home = filters.work_from_home;
  if (filters.job_requirements) params.job_requirements = filters.job_requirements;
  if (filters.employment_types) params.employment_types = filters.employment_types;

  const cacheKey = JSON.stringify({ ...params, pages });
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) {
    onJobs(cached.jobs);
    return cached.jobs;
  }

  const stragglers = new AbortController();
  const pageSignal = AbortSignal.any([signal, stragglers.signal]);
  const seen = new Set();
  const jobs = [];
  let closed = false;
  let failure;
  // Boards often repost the same job; the first listing of it is kept
  const accept = listings => {
    if (closed) return;
    const fresh = listings
      .filter(job => {
        const key = normalize(`${job.job_title}|${job.employer_name}|${job.job_city}`);
        if ((job.job_id && seen.has(job.job_id)) || seen.has(key)) return false;
        seen.add(job.job_id).add(key);
        return true;
      })
      .map(fromJSearch);
    jobs.push(...fresh);
    if (fresh.length) onJobs(fresh);
  };

  const requests = Array.from({ length: pages }, (_, i) => fetchJobPage(params, i + 1, pageSignal).then(
    accept,
    error => { failure = failure || error; }
  ));
  await new Promise(resolve => {
    requests.forEach(request => request.then(() => { if (jobs.length) resolve(); }));
    Promise.all(requests).then(resolve);
  });
  await Promise.race([Promise.all(requests), new Promise(resolve => setTimeout(resolve, PAGE_GRACE))]);
  closed = true;
  stragglers.abort();

  if (!jobs.length && failure) {
    if (signal.aborted) throw failure;
    throw failure.name === 'TimeoutError' ? new Error('The job search took too long to answer. Try again.') : failure;
  }

  if (jobs.length) {
    if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(cacheKey, { jobs, at: Date.now() });
  }
  return jobs;
}

// ---------- Scoring ----------

// Gemini writes the fields in propertyOrdering order, so the score comes last and follows
// from the analysis (the listing's level and must-haves) rather than the other way round
const MATCH_FIELDS = ['id', 'listingLevel', 'mustHaves', 'skillsMatch', 'missingSkills', 'reasons', 'score'];
const MATCH_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      listingLevel: { type: 'STRING' },
      mustHaves: { type: 'ARRAY', items: { type: 'STRING' } },
      skillsMatch: { type: 'ARRAY', items: { type: 'STRING' } },
      missingSkills: { type: 'ARRAY', items: { type: 'STRING' } },
      reasons: { type: 'ARRAY', items: { type: 'STRING' } },
      score: { type: 'INTEGER' }
    },
    required: MATCH_FIELDS,
    propertyOrdering: MATCH_FIELDS
  }
};

// Short per-batch ids: models copy "1".."5" reliably, JSearch's long job_id strings they don't
const jobForScoring = (job, index) => ({
  id: String(index + 1),
  title: job.title,
  company: job.company,
  location: job.location,
  employment_type: job.employment_type,
  remote: job.is_remote,
  qualifications: job.qualifications,
  description: job.description.slice(0, DESCRIPTION_CHARS)
});

const scoringPrompt = (cvText, jobs) => `You are a senior recruiter and hiring manager screening a candidate. For each job listing, judge how well this candidate fits, the way a hiring manager reading the CV would.

How to score (0-100):
- Must-have requirements stated in the listing weigh the most: core skills, years of experience, seniority, degrees, licences or registrations, required languages.
- A missing must-have caps the score at 60. A missing legally required licence or registration (for example a different nursing register), or a contract meant for another career stage (an internship, apprenticeship or graduate scheme for an experienced candidate), means a score below 40.
- A lead or manager role for someone with no leadership experience is a stretch at best: 60 or less.
- Next comes relevant experience: similar roles, domain, level of responsibility. Nice-to-haves count least; a missing nice-to-have should barely lower the score.
- Bands: 85-100 meets every must-have with strong relevant experience; 70-84 meets the must-haves with minor gaps; 50-69 a stretch with important gaps; below 50 a poor fit.
- Use the whole range and do not inflate. Base everything only on the CV and the listing; never invent requirements or experience.

For each job, work through it in this order:
- id: the job's id, exactly as given
- listingLevel: the career stage and contract the listing is for, in a few words (for example "apprenticeship for students", "senior lead, 7+ years", "registered mental health nurse")
- mustHaves: the listing's must-have requirements, up to 6
- skillsMatch: up to 6 requirements from the listing that the candidate clearly meets
- missingSkills: up to 5 requirements from the listing that the candidate lacks, most important first; empty if none
- reasons: 2 short sentences written to the candidate, citing specific evidence from their CV and the listing (roles, years, skills, registrations)
- score: an integer from 0 to 100, following the rules above
Write in English.

Candidate CV:
"""
${cvText}
"""

Jobs:
${JSON.stringify(jobs.map(jobForScoring))}`;

async function scoreBatch(cvText, jobs, signal) {
  const results = await askGemini(scoringPrompt(cvText, jobs), MATCH_SCHEMA, signal);

  // Title, company, link and date come from the listing itself, not from the model
  const scored = new Map();
  results.forEach(result => {
    const job = jobs[Number(result.id) - 1];
    if (!job || scored.has(job)) return;
    scored.set(job, {
      jobId: job.job_id,
      title: job.title,
      company: job.company,
      link: job.link,
      posted: job.posted,
      publisher: job.publisher,
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      // The light model occasionally runs the next field's name onto the last sentence
      reasons: result.reasons.map(reason => reason.replace(/\s+score\s*$/i, '').trim()).filter(Boolean),
      skillsMatch: result.skillsMatch,
      missingSkills: result.missingSkills
    });
  });
  return [...scored.values()];
}

// Runs fn over every item with at most `limit` calls in flight
async function eachLimited(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  }));
}

// Scores jobs in parallel batches; onBatch(matches, processed, batchSize) runs as each batch finishes.
// A failed batch is left out; if every batch fails, the last error is thrown.
async function scoreJobs(cvText, jobs, signal, onBatch = () => {}) {
  const batches = [];
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) batches.push(jobs.slice(i, i + BATCH_SIZE));

  const matches = [];
  let processed = 0;
  let lastError;
  await eachLimited(batches, SCORING_CONCURRENCY, async batch => {
    let scored = [];
    try {
      scored = await scoreBatch(cvText, batch, signal);
      matches.push(...scored);
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      console.error('Scoring batch failed:', error.message);
    }
    processed += batch.length;
    onBatch(scored, processed, batch.length);
  });

  if (!matches.length && lastError) throw lastError;
  return matches;
}

module.exports = { searchJobs, summarizeCV, scoreJobs, askGemini, eachLimited, keyHealth, DESCRIPTION_CHARS };
