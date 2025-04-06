const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Function to read CV file
function readCV(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

// Initialize Gemini API
function initGemini(apiKey) {
  return new GoogleGenerativeAI(apiKey);
}

// Analyze CV with Gemini
async function analyzeCV(apiKey, cvText) {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json'
      },
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
    
    const responseText = response.data.candidates[0].content.parts[0].text;
    // Extract JSON from response text (it might include additional text)
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}') + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonStr = responseText.substring(jsonStart, jsonEnd);
      return JSON.parse(jsonStr);
    } else {
      throw new Error("Could not extract JSON from response");
    }
  } catch (error) {
    console.error('Error analyzing CV:', error);
    throw error;
  }
}

// Compare CV with job listings and rank them
async function matchJobsWithCV(apiKey, cvAnalysis, jobs) {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        contents: [{
          parts: [{ text: `You are a job matching expert. Given a candidate's CV analysis and a list of job listings, rank the jobs by relevance to the candidate's profile.

Format your response as a valid JSON array of objects with the following structure (and nothing else):
[
  {
    "jobId": 0,
    "title": "Job Title",
    "company": "Company Name",
    "score": 85,
    "reasons": ["reason1", "reason2"],
    "skillsMatch": ["matching skill 1", "matching skill 2"],
    "missingSkills": ["missing skill 1", "missing skill 2"]
  }
]

Sort the array by score in descending order (highest matches first).

CV Analysis:
${JSON.stringify(cvAnalysis, null, 2)}

Job Listings:
${JSON.stringify(jobs, null, 2)}` }]
        }]
      }
    });
    
    const responseText = response.data.candidates[0].content.parts[0].text;
    // Extract JSON from response text (it might include additional text)
    const jsonStart = responseText.indexOf('[');
    const jsonEnd = responseText.lastIndexOf(']') + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonStr = responseText.substring(jsonStart, jsonEnd);
      return JSON.parse(jsonStr);
    } else {
      throw new Error("Could not extract JSON from response");
    }
  } catch (error) {
    console.error('Error matching jobs with CV:', error);
    throw error;
  }
}

async function main() {
  // Your Gemini API key
  const GEMINI_API_KEY = "AIzaSyC_bXI_sj_0cYyFEbssLIZqOkmTpCsDC3U"; 
  
  // Path to your CV file
  const CV_FILE_PATH = "./your-cv.txt"; 
  
  try {
    // 1. Read job listings from the result.json file
    const jobs = JSON.parse(fs.readFileSync('./result.json', 'utf-8'));
    console.log(`📋 Loaded ${jobs.length} job listings`);
    
    // 2. Read and analyze the CV
    const cvText = readCV(CV_FILE_PATH);
    console.log('📄 CV loaded, analyzing...');
    
    const cvAnalysis = await analyzeCV(GEMINI_API_KEY, cvText);
    console.log('✅ CV analysis complete');
    
    // 3. Match jobs with the CV
    console.log('🔍 Matching jobs with CV...');
    const jobMatches = await matchJobsWithCV(GEMINI_API_KEY, cvAnalysis, jobs);
    
    // 4. Save the results as pure JSON
    fs.writeFileSync('cv-job-matches.json', JSON.stringify({
      cvAnalysis,
      jobMatches
    }, null, 2), 'utf-8');
    
    // 5. Display top matches in console
    console.log('\n🏆 Top job matches:');
    jobMatches.slice(0, 5).forEach((match, index) => {
      console.log(`${index + 1}. ${match.title} at ${match.company} - Match score: ${match.score}%`);
    });
    
    console.log('✅ Job matching complete! Results saved to cv-job-matches.json');
  } catch (error) {
    console.error('Error in job matching process:', error);
  }
}

main();
