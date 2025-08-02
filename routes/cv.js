const express = require('express');
const router = express.Router();
const fs = require('fs');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

// Function to read CV file
function readCV(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

// Analyze CV with Gemini
async function analyzeCV(apiKey, cvText) {
  console.log('Starting CV analysis...');
  console.log('CV Text length:', cvText.length);
  
  try {
    console.log('Making request to Gemini API...');
    console.time('gemini-cv-analysis');
    
    const response = await axios({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyBnCC9iO5EQY823GJKIurFF2SUp_Yi0zPE`,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      data: {
        contents: [{
          parts: [{ text: `You are a professional resume/CV analyzer. Extract key skills, experience, education, and qualifications from the provided CV.

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
${cvText}` }]
        }]
      }
    });
    
    console.timeEnd('gemini-cv-analysis');
    console.log('Received response from Gemini API');
    
    if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
      console.error('Invalid response structure:', response.data);
      throw new Error('Invalid API response structure');
    }
    
    const responseText = response.data.candidates[0].content.parts[0].text;
    console.log('Response text length:', responseText.length);
    
    // Extract JSON from response text (it might include additional text)
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}') + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      console.log('Found JSON in response');
      const jsonStr = responseText.substring(jsonStart, jsonEnd);
      try {
        const parsed = JSON.parse(jsonStr);
        console.log('Successfully parsed JSON response');
        return parsed;
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        console.log('Problematic JSON string:', jsonStr);
        throw parseError;
      }
    } else {
      console.error('Could not find JSON in response. Response text:', responseText);
      throw new Error("Could not extract JSON from response");
    }
  } catch (error) {
    console.error('Error analyzing CV:', error);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw error;
  }
}

// Search for jobs
async function searchJobs(query, filters = {}) {
  // Build the params object with default values
  const params = {
    query: query || 'marketing in france',
    page: '1',
    num_pages: '1',
    country: 'us' // Default to US, can be made configurable
  };
  
  // Add filters only if they have values and are not 'all'
  if (filters.date_posted && filters.date_posted !== 'all') {
    params.date_posted = filters.date_posted;
  }
  
  if (filters.work_from_home !== undefined && filters.work_from_home !== '' && filters.work_from_home !== 'all') {
    // Convert string boolean to actual boolean
    if (filters.work_from_home === 'true') {
      params.work_from_home = true;
    } else if (filters.work_from_home === 'false') {
      params.work_from_home = false;
    }
  }
  
  if (filters.job_requirements && filters.job_requirements !== 'all' && filters.job_requirements !== '') {
    params.job_requirements = filters.job_requirements;
  }
  
  if (filters.employment_types && filters.employment_types !== 'all' && filters.employment_types !== '') {
    params.employment_types = filters.employment_types;
  }
  
  const options = {
    method: 'GET',
    url: 'https://jsearch.p.rapidapi.com/search',
    params,
    headers: {
      'x-rapidapi-key': '0db77bb548msh9ea6798adb4cbd1p174554jsn3f0e3af19743',
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  };

  try {
    console.log('🔍 Searching for jobs...');
    console.log('Making request with query:', query);
    console.log('=== API REQUEST DEBUG ===');
    console.log('Filters received:', filters);
    console.log('Final params object:', params);
    
    // Build the full URL for debugging
    const urlParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      urlParams.append(key, params[key]);
    });
    const fullUrl = `https://jsearch.p.rapidapi.com/search?${urlParams.toString()}`;
    console.log('Full API URL:', fullUrl);
    console.log('========================');
    const response = await axios.request(options);
    console.log('Received response with status:', response.status);
    
    if (response.data && response.data.data) {
      console.log(`Found ${response.data.data.length} jobs`);
      
      // Check if we have any jobs
      if (response.data.data.length === 0) {
        console.log('No jobs found for the query');
        return [];
      }
      
      // Format job listings
      const jobs = response.data.data.map(job => ({
        title: job.job_title || '',
        company: job.employer_name || '',
        location: job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || '',
        posted: job.job_posted_at || '',
        link: job.job_apply_link || '',
        description: job.job_description || '',
        highlights: job.job_highlights || {},
        required_skills: job.job_required_skills || [],
        required_experience: job.job_required_experience?.required_experience_in_months || '',
        employment_type: job.job_employment_type || '',
        salary: job.job_min_salary ? `${job.job_min_salary}-${job.job_max_salary} ${job.job_salary_currency}` : 'Not specified',
        benefits: job.job_benefits || [],
        is_remote: job.job_is_remote || false,
        publisher: job.job_publisher || '',
        job_id: job.job_id || '',
        posted_at: job.job_posted_at || ''
      }));
      
      // Extract skills from description if not explicitly provided
      jobs.forEach(job => {
        if ((!job.required_skills || !job.required_skills.length) && job.description) {
          const commonSkills = [
            "Microsoft Office", "Excel", "Word", "PowerPoint", 
            "Communication", "Leadership", "Teamwork",
            "JavaScript", "Python", "Java", "C++", "HTML", "CSS",
            "Marketing", "Social Media", "SEO", "Content Marketing",
            "Project Management", "Agile", "Scrum"
          ];
          
          job.required_skills = [];
          commonSkills.forEach(skill => {
            if (job.description.includes(skill)) {
              job.required_skills.push(skill);
            }
          });
        }
      });
      
      console.log(`Successfully processed ${jobs.length} jobs`);
      return jobs;
    } else {
      console.error('Invalid response structure:', JSON.stringify(response.data).substring(0, 200));
      return [];
    }
  } catch (error) {
    console.error('🚨 Error fetching job data:', error.message);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.request) {
      console.error('No response received from API');
    }
    return [];
  }
}

// Compare CV with job listings and rank them
async function matchJobsWithCV(apiKey, cvAnalysis, jobs) {
  try {
    // Limit the number of jobs sent to the API to prevent response being too large
    const limitedJobs = jobs.slice(0, 10);
    
    console.log('Starting job matching process...');
    console.log(`Number of jobs to process: ${limitedJobs.length}`);
    console.log('Making request to Gemini API...');
    
    // Add retry logic
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        console.log(`Attempt ${4 - retries}: Sending request to Gemini API`);
        const response = await axios({
          method: 'POST',
          url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyBnCC9iO5EQY823GJKIurFF2SUp_Yi0zPE`,
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000,
          data: {
            contents: [{
              parts: [{ text: `You are a job matching expert. Given a candidate's CV analysis and a list of job listings, rank the jobs by relevance to the candidate's profile.

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

Job Listings (truncated to ${limitedJobs.length} jobs):
${JSON.stringify(limitedJobs, null, 2)}` }]
            }]
          },
          timeout: 30000
        });
        
        console.log('Received response from Gemini API');
        console.log('Response status:', response.status);
        
        if (!response.data) {
          throw new Error('Empty response from Gemini API');
        }
        
        console.log('Response data structure:', Object.keys(response.data));
        const responseText = response.data.candidates[0].content.parts[0].text;
        console.log('Response text length:', responseText.length);
        console.log('First 100 chars of response:', responseText.substring(0, 100));
        
        // Improved JSON extraction
        try {
          // First try: Use regex to find array pattern
          const jsonArrayRegex = /\[\s*\{[\s\S]*\}\s*\]/g;
          const match = responseText.match(jsonArrayRegex);
          
          if (match && match[0]) {
            console.log('Found JSON array using regex');
            try {
              return JSON.parse(match[0]);
            } catch (parseError) {
              console.error('Error parsing regex match:', parseError);
              throw parseError;
            }
          } else {
            // Second try: Check for start/end brackets if regex fails
            console.log('Regex matching failed, trying bracket-based extraction');
            const jsonStart = responseText.indexOf('[');
            const jsonEnd = responseText.lastIndexOf(']') + 1;
            
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = responseText.substring(jsonStart, jsonEnd);
              console.log(`Extracted JSON string from position ${jsonStart} to ${jsonEnd}`);
              try {
                return JSON.parse(jsonStr);
              } catch (parseError) {
                console.error('Error parsing bracket-extracted JSON:', parseError);
                // Try to sanitize the JSON
                console.log('Attempting to sanitize JSON...');
                const sanitized = sanitizeJson(jsonStr);
                return JSON.parse(sanitized);
              }
            } else {
              throw new Error("Could not extract JSON from response");
            }
          }
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          console.error('Response text excerpt:', responseText.substring(0, 500) + '...');
          throw parseError;
        }
      } catch (error) {
        console.error(`Attempt ${4 - retries} failed:`, error.message);
        lastError = error;
        retries--;
        if (retries > 0) {
          console.log(`Retrying... (${retries} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
        }
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('All retry attempts failed');
  } catch (error) {
    console.error('Error matching jobs with CV:', error);
    
    // Return a fallback response
    return [{
      jobId: "error",
      title: "API Error",
      company: "Error",
      score: 0,
      reasons: ["Error calling API: " + error.message],
      skillsMatch: [],
      missingSkills: [],
      link: "",
      posted: ""
    }];
  }
}

// Helper function to sanitize JSON string
function sanitizeJson(jsonStr) {
  // Fix common JSON issues
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

// Route to handle job search and matching
router.post('/find-matches', async (req, res) => {
  try {
    console.log('Received find-matches request:', {
      query: req.body.query,
      userId: req.body.userId,
      cvTextLength: req.body.cvText?.length,
      filters: req.body.filters
    });

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const GEMINI_API_KEY = 'AIzaSyBnCC9iO5EQY823GJKIurFF2SUp_Yi0zPE';
    
    const { query, cvText, userId, filters = {} } = req.body;
    
    // Debug: Log the filters being used
    console.log('=== BACKEND API REQUEST DEBUG ===');
    console.log('Query:', query);
    console.log('Filters received:', filters);
    console.log('================================');
    
    console.log('Validating request parameters...');

    if (!cvText) {
      console.log('Error: CV text is missing');
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'CV text is required' })}\n\n`);
      return res.end();
    }

    // Check if user ID is provided
    if (!userId) {
      console.log('Error: User ID is missing');
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'User ID is required' })}\n\n`);
      return res.end();
    }

    // Check rate limiting
    console.log('Checking rate limiting for user:', userId);
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('Error: User not found:', userId);
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'User not found' })}\n\n`);
      return res.end();
    }

    // Check if user has made a request in the last 30 minutes
    if (user.lastFindMatches) {
      const now = new Date();
      const lastRequest = new Date(user.lastFindMatches);
      const timeDiff = (now - lastRequest) / 1000 / 60; 
      
      // if (timeDiff < 30) {
      //   const minutesRemaining = Math.ceil(30 - timeDiff);
      //   const nextAllowedTime = new Date(lastRequest.getTime() + 30 * 60 * 1000);
        
      //   // Set proper rate limit headers
      //   res.setHeader('Retry-After', Math.ceil(timeDiff * 60)); // Retry-After in seconds
      //   res.setHeader('X-RateLimit-Limit', '1');
      //   res.setHeader('X-RateLimit-Remaining', '0');
      //   res.setHeader('X-RateLimit-Reset', nextAllowedTime.toISOString());
        
      //   // Return 429 status code with detailed error message
      //   res.status(429).json({
      //     error: 'Rate limit exceeded',
      //     message: `You can only make one request every 30 minutes. Please try again in ${minutesRemaining} minutes.`,
      //     nextAllowedTime: nextAllowedTime.toISOString(),
      //     retryAfter: Math.ceil(timeDiff * 60),
      //     rateLimitInfo: {
      //       limit: 1,
      //       remaining: 0,
      //       reset: nextAllowedTime.toISOString()
      //     }
      //   });
      //   return;
      // }
    }

    try {
      // Step 1: Analyze CV
      res.write(`data: ${JSON.stringify({ status: 'analyzing_cv', message: 'Analyzing your CV...' })}\n\n`);
      const cvAnalysis = await analyzeCV(GEMINI_API_KEY, cvText);
      res.write(`data: ${JSON.stringify({ status: 'cv_analyzed', cvAnalysis })}\n\n`);

      // Step 2: Search jobs
      res.write(`data: ${JSON.stringify({ status: 'searching_jobs', message: 'Searching for jobs...' })}\n\n`);
      try {
        const jobs = await searchJobs(query, filters);
        
        if (!jobs || jobs.length === 0) {
          res.write(`data: ${JSON.stringify({ status: 'error', error: 'No job listings found' })}\n\n`);
          return res.end();
        }

        // Only update lastFindMatches timestamp if we found jobs
        user.lastFindMatches = new Date();
        await user.save();

        res.write(`data: ${JSON.stringify({ 
          status: 'jobs_found', 
          message: `Found ${jobs.length} jobs`,
          totalJobs: jobs.length 
        })}\n\n`);

        // Process jobs in chunks of 10
        const CHUNK_SIZE = 10;
        const jobsToProcess = jobs.slice(0, 30); // Process up to 30 jobs total
        const chunks = [];
        
        for (let i = 0; i < jobsToProcess.length; i += CHUNK_SIZE) {
          chunks.push(jobsToProcess.slice(i, i + CHUNK_SIZE));
        }

        let allMatches = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          res.write(`data: ${JSON.stringify({ 
            status: 'processing_chunk', 
            message: `Processing jobs ${i * CHUNK_SIZE + 1}-${Math.min((i + 1) * CHUNK_SIZE, jobsToProcess.length)} of ${jobsToProcess.length}...` 
          })}\n\n`);

          try {
            const chunkMatches = await matchJobsWithCV(GEMINI_API_KEY, cvAnalysis, chunk);
            allMatches = allMatches.concat(chunkMatches);

            // Send partial results
            res.write(`data: ${JSON.stringify({ 
              status: 'chunk_complete', 
              matches: chunkMatches,
              progress: {
                processed: Math.min((i + 1) * CHUNK_SIZE, jobsToProcess.length),
                total: jobsToProcess.length
              }
            })}\n\n`);
          } catch (chunkError) {
            console.error('Error processing chunk:', chunkError);
            res.write(`data: ${JSON.stringify({ 
              status: 'chunk_error',
              error: chunkError.message,
              progress: {
                processed: i * CHUNK_SIZE,
                total: jobsToProcess.length
              }
            })}\n\n`);
            // Continue with next chunk despite error
            continue;
          }
        }

        // Format and send final results
        const formattedMatches = allMatches.map(match => {
          const originalJob = jobsToProcess.find(job => job.job_id === match.jobId);
          if (originalJob) {
            match.posted = originalJob.posted || originalJob.posted_at || '';
          }
          return match;
        });

        // Send final results
        res.write(`data: ${JSON.stringify({ 
          status: 'complete',
          result: {
            cvAnalysis,
            jobMatches: formattedMatches,
            meta: {
              totalJobsFound: jobs.length,
              matchedJobs: formattedMatches.length,
              processedAt: new Date().toISOString()
            }
          }
        })}\n\n`);

        res.end();
      } catch (jobSearchError) {
        console.error('Error in job search:', jobSearchError);
        res.write(`data: ${JSON.stringify({ 
          status: 'error',
          error: 'Job search failed',
          message: jobSearchError.message 
        })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error('Error in job matching process:', error);
      res.write(`data: ${JSON.stringify({ 
        status: 'error',
        error: 'Processing error',
        message: error.message 
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in request handling:', error);
    res.write(`data: ${JSON.stringify({ 
      status: 'error',
      error: 'Server error',
      message: error.message 
    })}\n\n`);
    res.end();
  }
});

// Add a new endpoint to retrieve saved emails
router.get('/get-subscribers', (req, res) => {
  try {
    const subscribersDir = path.join('/tmp', 'subscribers');
    const subscribersFile = path.join(subscribersDir, 'subscribers.json');
    
    if (!fs.existsSync(subscribersFile)) {
      return res.status(200).json({ subscribers: [] });
    }
    
    const fileContent = fs.readFileSync(subscribersFile, 'utf8');
    const subscribers = JSON.parse(fileContent);
    
    res.status(200).json({ subscribers });
  } catch (error) {
    console.error('Error retrieving subscribers:', error);
    res.status(500).json({ error: 'Error retrieving subscribers' });
  }
});

module.exports = router; 