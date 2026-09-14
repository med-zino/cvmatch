const express = require('express');
const axios = require('axios');
const User = require('../models/User');

const router = express.Router();

const GEMINI_API_KEY = 'AIzaSyBnCC9iO5EQY823GJKIurFF2SUp_Yi0zPE';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const RAPIDAPI_KEY = '0db77bb548msh9ea6798adb4cbd1p174554jsn3f0e3af19743';
const CHUNK_SIZE = 10;
const MAX_JOBS = 30;

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

async function askGemini(prompt) {
  const response = await axios.post(
    GEMINI_URL,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30000 }
  );
  return response.data.candidates[0].content.parts[0].text;
}

// Analyze CV with Gemini
async function analyzeCV(cvText) {
  const responseText = await askGemini(`You are a professional resume/CV analyzer. Extract key skills, experience, education, and qualifications from the provided CV.

Format your response as a valid JSON object with the following structure (and nothing else):
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
${cvText}`);

  // Extract JSON from response text (it might include additional text)
  const jsonStart = responseText.indexOf('{');
  const jsonEnd = responseText.lastIndexOf('}') + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("Could not extract JSON from response");
  }
  return JSON.parse(responseText.substring(jsonStart, jsonEnd));
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
        'x-rapidapi-key': RAPIDAPI_KEY,
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
        required_experience: job.job_required_experience?.required_experience_in_months || '',
        employment_type: job.job_employment_type || '',
        salary: job.job_min_salary ? `${job.job_min_salary}-${job.job_max_salary} ${job.job_salary_currency}` : 'Not specified',
        benefits: job.job_benefits || [],
        is_remote: job.job_is_remote || false,
        publisher: job.job_publisher || '',
        job_id: job.job_id || '',
        posted_at: job.job_posted_at || ''
      };
    });
  } catch (error) {
    console.error('🚨 Error fetching job data:', error.response?.status || '', error.message);
    return [];
  }
}

// Extracts the JSON array from Gemini's reply, repairing common JSON slips as a last resort
function parseJsonArray(responseText) {
  const match = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    return JSON.parse(match[0]);
  }

  const jsonStart = responseText.indexOf('[');
  const jsonEnd = responseText.lastIndexOf(']') + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("Could not extract JSON from response");
  }
  const jsonStr = responseText.substring(jsonStart, jsonEnd);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return JSON.parse(sanitizeJson(jsonStr));
  }
}

function sanitizeJson(jsonStr) {
  return jsonStr
    // Fix trailing commas in arrays and objects
    .replace(/,\s*([}\]])/g, '$1')
    // Ensure property names are quoted
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
    // Fix missing quotes on string values
    .replace(/:(\s*)([^{}\[\]"'\d,\s][^{}\[\],:]*)/g, ':"$2"')
    // Fix single quotes to double quotes
    .replace(/'/g, '"');
}

// Compare CV with job listings and rank them (3 attempts, then a placeholder "API Error" match)
async function matchJobsWithCV(cvAnalysis, jobs) {
  const prompt = `You are a job matching expert. Given a candidate's CV analysis and a list of job listings, rank the jobs by relevance to the candidate's profile.

Format your response as a valid JSON array of objects with the following structure (and nothing else):
[
  {
    "jobId": "string",
    "title": "Job Title",
    "company": "Company Name",
    "score": 85,
    "reasons": ["reason1", "reason2"],
    "skillsMatch": ["matching skill 1", "matching skill 2"],
    "missingSkills": ["missing skill 1", "missing skill 2"],
    "link": "job application URL",
    "posted": "job posting date"
  }
]

Sort the array by score in descending order (highest matches first).
Make sure the output is valid JSON that can be parsed by JSON.parse().
Do not include any text before or after the JSON array.
IMPORTANT: Include the "link" and "posted" properties from the original job data for each job match.

CV Analysis:
${JSON.stringify(cvAnalysis, null, 2)}

Job Listings (truncated to ${jobs.length} jobs):
${JSON.stringify(jobs, null, 2)}`;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return parseJsonArray(await askGemini(prompt));
    } catch (error) {
      lastError = error;
      console.error(`Gemini match attempt ${attempt} failed:`, error.message);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  return [{
    jobId: "error",
    title: "API Error",
    company: "Error",
    score: 0,
    reasons: ["Error calling API: " + lastError.message],
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
    let allMatches = [];
    for (let i = 0; i < jobsToProcess.length; i += CHUNK_SIZE) {
      const processed = Math.min(i + CHUNK_SIZE, jobsToProcess.length);
      send({ status: 'processing_chunk', message: `Processing jobs ${i + 1}-${processed} of ${jobsToProcess.length}...` });

      const chunkMatches = await matchJobsWithCV(cvAnalysis, jobsToProcess.slice(i, i + CHUNK_SIZE));
      allMatches = allMatches.concat(chunkMatches);
      send({ status: 'chunk_complete', matches: chunkMatches, progress: { processed, total: jobsToProcess.length } });
    }

    // Restore the original posted date where Gemini echoed the job_id
    const jobMatches = allMatches.map(match => {
      const originalJob = jobsToProcess.find(job => job.job_id === match.jobId);
      if (originalJob) {
        match.posted = originalJob.posted || originalJob.posted_at || '';
      }
      return match;
    });

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
    console.error('Error in job matching process:', error.response?.data?.error?.message || error.message);
    send({ status: 'error', error: 'Processing error', message: error.message });
  }
  res.end();
});

module.exports = router;
