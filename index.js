const axios = require('axios');
const fs = require('fs');

async function searchJobs() {
  const options = {
    method: 'GET',
    url: 'https://jsearch.p.rapidapi.com/search',
    params: {
      query: 'marketing in france',
      page: '1',
      num_pages: '5',  // Increased to get more results
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
      // Save the full response to a file
      fs.writeFileSync('full_response.json', JSON.stringify(response.data, null, 2), 'utf-8');
      
      // Format and save detailed job listings
      const jobs = response.data.data.map(job => ({
        title: job.job_title || '',
        company: job.employer_name || '',
        location: job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || '',
        posted: job.job_posted_at_datetime_utc || '',
        link: job.job_apply_link || '',
        // Add more detailed fields
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
        posted_at: job.job_posted_at_datetime_utc || ''
      }));
      
      fs.writeFileSync('result.json', JSON.stringify(jobs, null, 2), 'utf-8');
      console.log(`✅ Saved ${jobs.length} job(s) to result.json`);

      // Additional information extraction
      console.log('\n📊 Job Skills Analysis:');
      const allSkills = new Set();
      jobs.forEach(job => {
        if (job.required_skills && job.required_skills.length) {
          job.required_skills.forEach(skill => allSkills.add(skill));
        }
        
        // Extract skills from description if not explicitly provided
        if ((!job.required_skills || !job.required_skills.length) && job.description) {
          const commonSkills = [
            "Microsoft Office", "Excel", "Word", "PowerPoint", 
            "Communication", "Leadership", "Teamwork",
            "JavaScript", "Python", "Java", "C++", "HTML", "CSS",
            "Marketing", "Social Media", "SEO", "Content Marketing",
            "Project Management", "Agile", "Scrum"
          ];
          
          commonSkills.forEach(skill => {
            if (job.description.includes(skill)) {
              if (!job.required_skills) job.required_skills = [];
              job.required_skills.push(skill);
              allSkills.add(skill);
            }
          });
        }
      });
      
      console.log(`Found ${allSkills.size} unique skills across all job listings`);
      console.log('Top skills requested: ', Array.from(allSkills).slice(0, 10).join(', '));
      
      // Update the result file with extracted skills
      fs.writeFileSync('result.json', JSON.stringify(jobs, null, 2), 'utf-8');
    } else {
      throw new Error("No job data found in the response");
    }
  } catch (error) {
    console.error('🚨 Error fetching job data:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    fs.writeFileSync('error.json', JSON.stringify({ 
      error: error.message,
      details: error.response ? error.response.data : null
    }, null, 2), 'utf-8');
  }
}

searchJobs();