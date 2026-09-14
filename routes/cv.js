const express = require('express');
const axios = require('axios');
const User = require('../models/User');

const router = express.Router();

// Keys come from the environment only: a key committed to a public repo gets revoked
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CHUNK_SIZE = 10;
const MAX_JOBS = 30;
const DESCRIPTION_LIMIT = 1500;

// Fills in required_skills when JSearch doesn't provide any
const COMMON_SKILLS = [
  "Microsoft Office", "Excel", "Word", "PowerPoint",
  "Communication", "Leadership", "Teamwork",
  "JavaScript", "Python", "Java", "C++", "HTML", "CSS",
  "Marketing", "Social Media", "SEO", "Content Marketing",
  "Project Management", "Agile", "Scrum"
];

// JSearch country picked from a place named in the query (defaults to US)
const LOCATION_COUNTRIES = {
  'france': 'fr', 'paris': 'fr', 'lyon': 'fr', 'marseille': 'fr',
  'uk': 'gb', 'london': 'gb', 'manchester': 'gb', 'birmingham': 'gb',
  'canada': 'ca', 'toronto': 'ca', 'vancouver': 'ca', 'montreal': 'ca',
  'germany': 'de', 'berlin': 'de', 'munich': 'de', 'hamburg': 'de',
  'australia': 'au', 'sydney': 'au', 'melbourne': 'au', 'brisbane': 'au',
  'netherlands': 'nl', 'amsterdam': 'nl', 'rotterdam': 'nl',
  'spain': 'es', 'madrid': 'es', 'barcelona': 'es',
  'italy': 'it', 'rome': 'it', 'milan': 'it'
};

// Asks Gemini for JSON; the key goes in a header so it never shows up in logged URLs
async function askGemini(prompt, timeout) {
  const response = await axios.post(
    GEMINI_URL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    },
    { timeout, headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } }
  );
  return response.data.candidates[0].content.parts.map(part => part.text || '').join('');
}

// JSON mode normally returns clean JSON; the extraction is a fallback for stray text around it
function parseJson(text, open, close) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close) + 1;
    if (start < 0 || end <= start) {
      throw new Error("Could not extract JSON from response");
    }
    return JSON.parse(text.substring(start, end));
  }
}

// Analyze CV with Gemini
async function analyzeCV(cvText) {
  const responseText = await askGemini(`You are a professional resume/CV analyzer. Extract key skills, experience, education, and qualifications from the provided CV.

Return a JSON object with this structure:
{
  "skills": ["skill1", "skill2", ...],
  "technical_skills": ["skill1", "skill2", ...],
  "soft_skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Time period",
      "description": ["responsibility1", "responsibility2", ...]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name",
      "year": "Graduation Year"
    }
  ],
  "languages": ["language1", "language2", ...],
  "certifications": ["certification1", "certification2", ...]
}

CV Text:
${cvText}`, 30000);

  return parseJson(responseText, '{', '}');
}

// Search for jobs
async function searchJobs(query, filters = {}) {
  const queryLower = (query || '').toLowerCase();
  const location = Object.keys(LOCATION_COUNTRIES).find(place => queryLower.includes(place));

  const params = {
    query: query || 'developer jobs in chicago',
    page: '1',
    num_pages: '1',
    country: location ? LOCATION_COUNTRIES[location] : 'us',
    date_posted: 'all'
  };

  // Add filters only if they have values and are not 'all'
  if (filters.date_posted && filters.date_posted !== 'all') {
    params.date_posted = filters.date_posted;
  }
  if (filters.work_from_home === 'true') {
    params.work_from_home = true;
  } else if (filters.work_from_home === 'false') {
    params.work_from_home = false;
  }
  if (filters.job_requirements && filters.job_requirements !== 'all') {
    params.job_requirements = filters.job_requirements;
  }
  if (filters.employment_types && filters.employment_types !== 'all') {
    params.employment_types = filters.employment_types;
  }

  try {
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com'
      }
    });

    return (response.data?.data || []).map(job => {
      const description = job.job_description || '';
      let requiredSkills = job.job_required_skills || [];
      if (!requiredSkills.length && description) {
        requiredSkills = COMMON_SKILLS.filter(skill => description.includes(skill));
      }

      return {
        title: job.job_title || '',
        company: job.employer_name || '',
        location: job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || '',
        posted: job.job_posted_at || '',
        link: job.job_apply_link || '',
        description,
        highlights: job.job_highlights || {},
        required_skills: requiredSkills,
        employment_type: job.job_employment_type || '',
        is_remote: job.job_is_remote || false,
        publisher: job.job_publisher || '',
        job_id: job.job_id || ''
      };
    });
  } catch (error) {
    console.error('🚨 Error fetching job data:', error.response?.status || '', error.message);
    return [];
  }
}

// Only what the scoring needs, with long descriptions cut down, keeps the prompt small and fast
function jobForScoring(job) {
  return {
    job_id: job.job_id,
    title: job.title,
    company: job.company,
    location: job.location,
    employment_type: job.employment_type,
    is_remote: job.is_remote,
    required_skills: job.required_skills,
    qualifications: (job.highlights.Qualifications || []).slice(0, 8),
    description: job.description.slice(0, DESCRIPTION_LIMIT)
  };
}

// Compare CV with job listings and rank them (2 attempts, then a placeholder "API Error" match)
async function matchJobsWithCV(cvAnalysis, jobs) {
  const prompt = `You are a job matching expert. Score how well the candidate fits each job listing.

Return a JSON array with one object per job, in the same order as the jobs below:
[
  {
    "jobId": "the job's job_id",
    "title": "Job Title",
    "company": "Company Name",
    "score": 85,
    "reasons": ["one or two short sentences on why it fits or doesn't"],
    "skillsMatch": ["skills the job asks for that the candidate has"],
    "missingSkills": ["skills the job asks for that the candidate lacks"]
  }
]

Candidate:
${JSON.stringify(cvAnalysis)}

Jobs:
${JSON.stringify(jobs.map(jobForScoring))}`;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const matches = parseJson(await askGemini(prompt, 40000), '[', ']');
      // Link, title and posted date come from the listing itself, not from the model
      return matches.map((match, index) => {
        const job = jobs.find(j => j.job_id === match.jobId) || jobs[index] || {};
        return {
          ...match,
          jobId: job.job_id || match.jobId,
          title: job.title || match.title,
          company: job.company || match.company,
          link: job.link || '',
          posted: job.posted || ''
        };
      });
    } catch (error) {
      lastError = error;
      console.error(`Gemini match attempt ${attempt} failed:`, error.response?.data?.error?.message || error.message);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  return [{
    jobId: "error",
    title: "API Error",
    company: "Error",
    score: 0,
    reasons: ["Error calling API: " + (lastError.response?.data?.error?.message || lastError.message)],
    skillsMatch: [],
    missingSkills: [],
    link: "",
    posted: ""
  }];
}

// Streams progress as server-sent events: analyze CV → search jobs → score jobs in chunks
router.post('/find-matches', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const { query, cvText, userId, filters = {} } = req.body;

  try {
    if (!process.env.GEMINI_API_KEY || !process.env.RAPIDAPI_KEY) {
      send({ status: 'error', error: 'Job matching is not configured', message: 'The server is missing GEMINI_API_KEY or RAPIDAPI_KEY.' });
      return res.end();
    }
    if (!cvText) {
      send({ status: 'error', error: 'CV text is required' });
      return res.end();
    }
    if (!userId) {
      send({ status: 'error', error: 'User ID is required' });
      return res.end();
    }
    if (!(await User.findById(userId))) {
      send({ status: 'error', error: 'User not found' });
      return res.end();
    }

    send({ status: 'analyzing_cv', message: 'Analyzing your CV...' });
    const cvAnalysis = await analyzeCV(cvText);
    send({ status: 'cv_analyzed', cvAnalysis });

    send({ status: 'searching_jobs', message: 'Searching for jobs...' });
    const jobs = await searchJobs(query, filters);
    if (!jobs.length) {
      send({ status: 'error', error: 'No job listings found' });
      return res.end();
    }
    send({ status: 'jobs_found', message: `Found ${jobs.length} jobs`, totalJobs: jobs.length });

    const jobsToProcess = jobs.slice(0, MAX_JOBS);
    let jobMatches = [];
    for (let i = 0; i < jobsToProcess.length; i += CHUNK_SIZE) {
      const processed = Math.min(i + CHUNK_SIZE, jobsToProcess.length);
      send({ status: 'processing_chunk', message: `Processing jobs ${i + 1}-${processed} of ${jobsToProcess.length}...` });

      const chunkMatches = await matchJobsWithCV(cvAnalysis, jobsToProcess.slice(i, i + CHUNK_SIZE));
      jobMatches = jobMatches.concat(chunkMatches);
      send({ status: 'chunk_complete', matches: chunkMatches, progress: { processed, total: jobsToProcess.length } });
    }

    send({
      status: 'complete',
      result: {
        cvAnalysis,
        jobMatches,
        meta: {
          totalJobsFound: jobs.length,
          matchedJobs: jobMatches.length,
          processedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    console.error('Error in job matching process:', message);
    send({ status: 'error', error: 'Processing error', message });
  }
  res.end();
});

module.exports = router;
