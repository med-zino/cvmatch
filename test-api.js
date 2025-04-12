const axios = require('axios');

async function testApi() {
  console.log('Testing API connection...');
  
  const options = {
    method: 'GET',
    url: 'https://jsearch.p.rapidapi.com/search',
    params: {
      query: 'marketing in france',
      page: '1',
      num_pages: '1',
      country: 'fr',
      date_posted: 'all'
    },
    headers: {
      'x-rapidapi-key': '0c95d219d8msh62c6c9ae0a52d43p106ffbjsnc2b6ba9abffd',
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  };

  try {
    console.log('Sending request to API...');
    const response = await axios.request(options);
    console.log('API response received:', response.status);
    console.log('Data received:', response.data ? 'Yes' : 'No');
    
    // Check if data exists and has the expected structure
    if (response.data && response.data.data) {
      console.log(`Found ${response.data.data.length} job listings`);
      
      // Check the first job listing
      if (response.data.data.length > 0) {
        const firstJob = response.data.data[0];
        console.log('First job title:', firstJob.job_title || 'No title');
        console.log('First job company:', firstJob.employer_name || 'No company');
      }
    } else {
      console.log('Response data structure:', JSON.stringify(response.data).substring(0, 200) + '...');
    }
  } catch (error) {
    console.error('API error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 200) + '...');
    }
  }
}

testApi(); 