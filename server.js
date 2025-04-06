const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST'], // Allow GET and POST methods
  allowedHeaders: ['Content-Type'] // Allow Content-Type header
}));
app.use(express.json());
app.use(express.static('public'));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Function to read CV file (from cv-job-matcher.js)
function readCV(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

// Analyze CV with Gemini (from cv-job-matcher.js)
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

// Search for jobs (from index.js)
async function searchJobs(query) {
  const options = {
    method: 'GET',
    url: 'https://jsearch.p.rapidapi.com/search',
    params: {
      query: query || 'marketing in france',
      page: '1',
      num_pages: '1',
      country: 'fr',
      date_posted: 'all'
    },
    headers: {
      'x-rapidapi-key': '0db77bb548msh9ea6798adb4cbd1p174554jsn3f0e3af19743',
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  };

  try {
    console.log('🔍 Searching for jobs...');
    const response = await axios.request(options);
    
    if (response.data && response.data.data) {
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
      
      return jobs;
    } else {
      throw new Error("No job data found in the response");
    }
  } catch (error) {
    console.error('🚨 Error fetching job data:', error.message);
    throw error;
  }
}

// Compare CV with job listings and rank them (from cv-job-matcher.js)
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
app.post('/find-matches', async (req, res) => {
  try {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const GEMINI_API_KEY = 'AIzaSyBnCC9iO5EQY823GJKIurFF2SUp_Yi0zPE';
    
    const { query, cvText } = req.body;
    
    if (!cvText) {
      res.write(`data: ${JSON.stringify({ error: 'CV text is required' })}\n\n`);
      return res.end();
    }

    try {
      // Step 1: Analyze CV
      res.write(`data: ${JSON.stringify({ status: 'analyzing_cv', message: 'Analyzing your CV...' })}\n\n`);
      const cvAnalysis = await analyzeCV(GEMINI_API_KEY, cvText);
      res.write(`data: ${JSON.stringify({ status: 'cv_analyzed', cvAnalysis })}\n\n`);

      // Step 2: Search jobs
      res.write(`data: ${JSON.stringify({ status: 'searching_jobs', message: 'Searching for jobs...' })}\n\n`);
      const jobs = await searchJobs(query);
      
      if (!jobs || jobs.length === 0) {
        res.write(`data: ${JSON.stringify({ status: 'error', error: 'No job listings found' })}\n\n`);
        return res.end();
      }

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

// Add this new route to handle email form submissions
app.post('/save-email', (req, res) => {
  console.log('Received email submission request');
  console.log('Request body:', req.body);
  
  try {
    const { email } = req.body;
    
    if (!email) {
      console.log('Email is missing from request');
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    console.log('Processing email:', email);
    
    // For Vercel deployment, we'll use the /tmp directory which is writable
    const subscribersDir = path.join('/tmp', 'subscribers');
    if (!fs.existsSync(subscribersDir)) {
      console.log('Creating subscribers directory in /tmp');
      fs.mkdirSync(subscribersDir, { recursive: true });
    }
    
    // Path to the subscribers file
    const subscribersFile = path.join(subscribersDir, 'subscribers.json');
    
    // Read existing subscribers or create an empty array
    let subscribers = [];
    if (fs.existsSync(subscribersFile)) {
      console.log('Reading existing subscribers file');
      const fileContent = fs.readFileSync(subscribersFile, 'utf8');
      subscribers = JSON.parse(fileContent);
    } else {
      console.log('No existing subscribers file found, creating new one');
    }
    
    // Check if email already exists
    if (subscribers.includes(email)) {
      console.log('Email already registered:', email);
      return res.status(200).json({ success: true, message: 'Email already registered' });
    }
    
    // Add the new email
    subscribers.push(email);
    
    // Save back to file
    console.log('Saving updated subscribers list');
    fs.writeFileSync(subscribersFile, JSON.stringify(subscribers, null, 2));
    
    // Also save to a CSV file for easy export
    const csvFile = path.join(subscribersDir, 'subscribers.csv');
    console.log('Appending to CSV file');
    fs.appendFileSync(csvFile, `${email},${new Date().toISOString()}\n`);
    
    console.log('Email saved successfully');
    res.status(200).json({ success: true, message: 'Email saved successfully' });
  } catch (error) {
    console.error('Error saving email:', error);
    res.status(500).json({ success: false, message: 'Error saving email' });
  }
});

// Add this route to serve the index.html file from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Add this route to serve the index.html file from the public directory
app.get('/public', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a route to serve the test.html file
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// Add a new endpoint to retrieve saved emails
app.get('/get-subscribers', (req, res) => {
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

// Add a route to serve the admin page
app.get('/admin', (req, res) => {
  console.log('Admin page requested');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Add a route to redirect to the admin page
app.get('/admin-page', (req, res) => {
  console.log('Admin page redirect requested');
  res.redirect('/admin');
});

// Add a route to serve the test admin page
app.get('/test-admin', (req, res) => {
  console.log('Test admin page requested');
  res.sendFile(path.join(__dirname, 'test-admin.html'));
});

// Add a route to serve the login page
app.get('/login', (req, res) => {
  console.log('Login page requested');
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Update the server startup to work with Vercel
if (require.main === module) {
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
}

// Export the app for Vercel
module.exports = app; 