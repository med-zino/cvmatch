// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', function() {
    // Input method toggle functionality
    const toggleOptions = document.querySelectorAll('.input-toggle-option');
    const cvInputSections = document.querySelectorAll('.cv-input-section');
    
    toggleOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove active class from all options
            toggleOptions.forEach(opt => opt.classList.remove('active'));
            // Add active class to clicked option
            this.classList.add('active');
            
            // Hide all CV input sections
            cvInputSections.forEach(section => section.classList.remove('active'));
            // Show selected section
            const targetId = this.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // PDF Upload functionality
    const pdfUploadZone = document.getElementById('pdfUploadZone');
    const pdfFileInput = document.getElementById('pdfFileInput');
    const pdfFilename = document.getElementById('pdfFilename');
    let extractedPdfText = '';
    
    // Click on upload zone to trigger file input
    pdfUploadZone.addEventListener('click', () => {
        pdfFileInput.click();
    });
    
    // Handle drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        pdfUploadZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        pdfUploadZone.addEventListener(eventName, () => {
            pdfUploadZone.classList.add('active');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        pdfUploadZone.addEventListener(eventName, () => {
            pdfUploadZone.classList.remove('active');
        });
    });
    
    // Handle file drop
    pdfUploadZone.addEventListener('drop', function(e) {
        const files = e.dataTransfer.files;
        if (files.length) {
            pdfFileInput.files = files;
            handlePdfFile(files[0]);
        }
    });
    
    // Handle file selection
    pdfFileInput.addEventListener('change', function() {
        if (this.files.length) {
            handlePdfFile(this.files[0]);
        }
    });
    
    // Process PDF file
    function handlePdfFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file');
            return;
        }
        
        // Show filename
        pdfFilename.textContent = file.name;
        
        // Show loading status in filename
        pdfFilename.textContent = file.name + ' (Processing...)';
        
        // Read the file
        const fileReader = new FileReader();
        
        fileReader.onload = function() {
            // Get the PDF data
            const typedArray = new Uint8Array(this.result);
            
            // Load the PDF document
            const loadingTask = pdfjsLib.getDocument({ data: typedArray });
            
            loadingTask.promise.then(function(pdf) {
                extractedPdfText = '';
                let numPages = pdf.numPages;
                let countPromises = 0;
                
                // Extract text from each page
                for (let i = 1; i <= numPages; i++) {
                    pdf.getPage(i).then(function(page) {
                        return page.getTextContent();
                    }).then(function(textContent) {
                        // Concatenate text items
                        const textItems = textContent.items.map(item => item.str);
                        extractedPdfText += textItems.join(' ') + '\n\n';
                        
                        countPromises++;
                        if (countPromises === numPages) {
                            // All pages are processed
                            pdfFilename.textContent = file.name + ' (' + numPages + ' pages processed)';
                            
                            // Also update the text textarea in case user switches
                            document.getElementById('cvText').value = extractedPdfText;
                        }
                    });
                }
            }).catch(function(error) {
                console.error('Error loading PDF:', error);
                pdfFilename.textContent = file.name + ' (Error: ' + error.message + ')';
            });
        };
        
        fileReader.readAsArrayBuffer(file);
    }
    
    // Try to load CV from file if the textarea is empty
    fetch('./your-cv.txt')
        .then(response => response.text())
        .then(data => {
            if (!document.getElementById('cvText').value) {
                document.getElementById('cvText').value = data;
            }
        })
        .catch(error => console.error('Error loading CV file:', error));
    
    // Toggle CV analysis visibility
    document.getElementById('toggleCvAnalysis').addEventListener('click', function() {
        const cvAnalysis = document.getElementById('cvAnalysis');
        const isVisible = cvAnalysis.style.display !== 'none';
        
        cvAnalysis.style.display = isVisible ? 'none' : 'block';
        this.innerHTML = isVisible ? 
            '<i class="fas fa-eye"></i> Show CV Analysis Details' : 
            '<i class="fas fa-eye-slash"></i> Hide CV Analysis Details';
    });
    
    // Filters toggle functionality
    document.getElementById('filtersToggle').addEventListener('change', function() {
        const filtersSection = document.getElementById('filtersSection');
        const isChecked = this.checked;
        
        if (isChecked) {
            filtersSection.style.display = 'block';
        } else {
            filtersSection.style.display = 'none';
        }
    });
    
    // Form submission
    document.getElementById('matchForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const query = document.getElementById('query').value;
        const location = document.getElementById('location').value;
        
        // Validate required fields
        if (!query.trim()) {
            alert('Please enter a job search query');
            return;
        }
        
        if (!location.trim()) {
            alert('Please enter a location');
            return;
        }
        
        // Combine query with location
        const finalQuery = `${query.trim()} in ${location.trim()}`;
        
        // Collect additional filters (only include non-empty values)
        const filters = {};
        
        // Date posted filter
        const datePosted = document.getElementById('date_posted').value;
        if (datePosted) {
            filters.date_posted = datePosted;
        }
        
        // Work from home filter
        const workFromHome = document.getElementById('work_from_home').value;
        if (workFromHome) {
            filters.work_from_home = workFromHome === 'true';
        }
        
        // Job requirements filter (single select)
        const jobRequirements = document.getElementById('job_requirements').value;
        if (jobRequirements) {
            filters.job_requirements = jobRequirements;
        }
        
        // Employment types filter (single select)
        const employmentTypes = document.getElementById('employment_types').value;
        if (employmentTypes) {
            filters.employment_types = employmentTypes;
        }
        
        // Get CV text based on active input method
        let cvText = '';
        const activePdfSection = document.getElementById('pdf-section').classList.contains('active');
        
        if (activePdfSection) {
            cvText = extractedPdfText;
            
            if (!cvText) {
                alert('Please upload a PDF file or switch to text input');
                return;
            }
        } else {
            cvText = document.getElementById('cvText').value;
            
            if (!cvText) {
                alert('Please provide your CV text');
                return;
            }
        }
        
        // Get user ID from localStorage
        const userId = localStorage.getItem('userId');
        if (!userId) {
            alert('You must be logged in to use this feature');
            window.location.href = '/login';
            return;
        }
        
        // Prepare request data
        const requestData = { 
            query: finalQuery, 
            cvText, 
            userId, 
            filters 
        };
        
        // Debug: Log the request data
        console.log('=== API REQUEST DEBUG ===');
        console.log('Final Query:', finalQuery);
        console.log('Filters being sent:', filters);
        console.log('Full request data:', requestData);
        console.log('========================');
        
        // Show loading state
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        loading.style.display = 'block';
        results.style.display = 'none';
        
        // Remove any existing progress-updates divs
const oldProgress = loading.querySelectorAll('.progress-updates');
oldProgress.forEach(el => el.remove());

        // Add progress indicator
        const progressDiv = document.createElement('div');
        progressDiv.className = 'progress-updates';
        progressDiv.innerHTML = `
            <div class="progress-step" id="step1">
                <span class="step-icon">📄</span>
                <span class="step-text">Analyzing your CV...</span>
            </div>
            <div class="progress-step" id="step2">
                <span class="step-icon">🔍</span>
                <span class="step-text">Searching for jobs...</span>
            </div>
            <div class="progress-step" id="step3">
                <span class="step-icon">🎯</span>
                <span class="step-text">Matching with jobs...</span>
                <div class="progress-bar-container" style="display: none;">
                    <div class="progress-bar"></div>
                    <span class="progress-text">0%</span>
                </div>
            </div>
        `;
        loading.insertBefore(progressDiv, loading.firstChild);
        
        try {
            // Make streaming request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            console.log('Sending request to /api/find-matches...');
            const response = await fetch('/api/find-matches', {
            method: 'POST',
            headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
            },
                body: JSON.stringify({ query: finalQuery, cvText, userId, filters }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    // Handle rate limiting
                    const data = await response.json();
                    const retryAfter = response.headers.get('Retry-After');
                    const rateLimitReset = response.headers.get('X-RateLimit-Reset');
                    
                                // Clear the progress indicator
                                loading.innerHTML = '';
                                
                                // Show rate limit message with countdown
                                const rateLimitDiv = document.createElement('div');
                                rateLimitDiv.className = 'rate-limit-message';
                                
                    // Calculate time remaining
                    const nextAllowedTime = new Date(rateLimitReset);
                                const now = new Date();
                                const minutesRemaining = Math.ceil((nextAllowedTime - now) / 1000 / 60);
                                
                                rateLimitDiv.innerHTML = `
                                    <div class="rate-limit-container">
                            <h3><i class="fas fa-clock"></i> Rate Limit Reached</h3>
                                        <p>${data.message}</p>
                                        <div class="countdown-container">
                                            <div class="countdown" id="countdown">${minutesRemaining}:00</div>
                                <p>Time remaining until next attempt</p>
                                        </div>
                            <button id="refresh-btn" class="btn-refresh" disabled>
                                <i class="fas fa-sync-alt"></i> Try Again
                            </button>
                                    </div>
                                `;
                                
                                loading.appendChild(rateLimitDiv);
                                
                                // Start countdown timer
                                let secondsRemaining = minutesRemaining * 60;
                                const countdownElement = document.getElementById('countdown');
                                const refreshButton = document.getElementById('refresh-btn');
                                
                                const countdownInterval = setInterval(() => {
                                    secondsRemaining--;
                                    const minutes = Math.floor(secondsRemaining / 60);
                                    const seconds = secondsRemaining % 60;
                                    countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                    
                                    if (secondsRemaining <= 0) {
                                        clearInterval(countdownInterval);
                                        refreshButton.disabled = false;
                            refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Try Again';
                                    }
                                }, 1000);
                                
                                // Add event listener to refresh button
                                refreshButton.addEventListener('click', () => {
                                    window.location.reload();
                                });
                                
                                return;
                            }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log('Response received, setting up event source...');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Process the stream
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    console.log('Stream complete');
                    break;
                }

                // Decode and process the chunk
                const chunk = decoder.decode(value, { stream: true });
                console.log('Received chunk:', chunk);

                // Split the chunk into individual SSE messages
                const messages = chunk.split('\n\n');
                for (const message of messages) {
                    if (message.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(message.slice(6));
                            console.log('Processed SSE message:', data);
                            handleStreamUpdate(data, progressDiv);
                        } catch (e) {
                            console.error('Error parsing SSE message:', e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error:', error);
            loading.innerHTML += `
                <div class="error-update">
                    <p>⚠️ ${error.name === 'AbortError' ? 'Request timed out after 30 seconds' : error.message}</p>
                    <p>The process encountered an error. This might be due to:</p>
                    <ul>
                        <li>Network connectivity issues</li>
                        <li>Server timeout</li>
                        <li>Invalid response format</li>
                    </ul>
                    <p>Please try again. If the problem persists, try with a shorter CV or more specific job search query.</p>
                </div>
            `;
            document.getElementById('loading').style.display = 'block';
            document.getElementById('results').style.display = 'none';
        }
    });
    
    // Handle stream updates
    function handleStreamUpdate(data, progressDiv) {
        console.log('Handling stream update:', data);
        
        // Get references to UI elements
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        const cvAnalysisResults = document.getElementById('cvAnalysisResults');
        const jobMatchesResults = document.getElementById('jobMatchesResults');
        
        // Get progress step elements
        const step1 = document.getElementById('step1');
        const step2 = document.getElementById('step2');
        const step3 = document.getElementById('step3');
        const progressBarContainer = step3.querySelector('.progress-bar-container');
        const progressBar = step3.querySelector('.progress-bar');
        const progressText = step3.querySelector('.progress-text');
        
        // Handle different status updates
        switch (data.status) {
            case 'analyzing_cv':
                // Step 1: Analyzing CV
                step1.classList.add('active');
                step1.classList.remove('complete');
                step2.classList.remove('active', 'complete');
                step3.classList.remove('active', 'complete');
                progressBarContainer.style.display = 'none';
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'cv_analyzed':
                // Step 1 complete, start Step 2
                step1.classList.add('complete');
                step1.classList.remove('active');
                step2.classList.add('active');
                step2.classList.remove('complete');
                step3.classList.remove('active', 'complete');
                progressBarContainer.style.display = 'none';
                
                // Display CV analysis results
                if (data.cvAnalysis) {
                    displayCVAnalysis(data.cvAnalysis);
                }
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'searching_jobs':
                // Step 2: Searching for jobs
                step2.classList.add('active');
                step2.classList.remove('complete');
                step3.classList.remove('active', 'complete');
                progressBarContainer.style.display = 'none';
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'jobs_found':
                // Step 2 complete, start Step 3
                step2.classList.add('complete');
                step2.classList.remove('active');
                step3.classList.add('active');
                step3.classList.remove('complete');
                progressBarContainer.style.display = 'block';
                
                // Update progress bar
                progressBar.style.width = '0%';
                progressText.textContent = '0%';
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'processing_chunk':
                // Update progress for job matching
                if (data.progress) {
                    const { processed, total } = data.progress;
                    const percentage = Math.round((processed / total) * 100);
                    progressBar.style.width = `${percentage}%`;
                    progressText.textContent = `${percentage}%`;
                }
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'chunk_complete':
                // Display partial results as they come in
                if (data.matches && data.matches.length > 0) {
                    displayJobMatches(data.matches);
                }
                
                // Make sure loading is visible
                loading.style.display = 'block';
                results.style.display = 'none';
                break;
                
            case 'complete':
                // All steps complete
                step3.classList.add('complete');
                step3.classList.remove('active');
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                
                // Hide loading, show results
                loading.style.display = 'none';
                results.style.display = 'block';
                
                // Display final results
                if (data.result) {
                    if (data.result.cvAnalysis) {
                        displayCVAnalysis(data.result.cvAnalysis);
                    }
                    if (data.result.jobMatches) {
                        displayJobMatches(data.result.jobMatches);
                    }
                }
                
                // Scroll to results
                setTimeout(() => {
                    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 500);
                break;
                
            case 'error':
                // Handle errors
                loading.style.display = 'none';
                results.style.display = 'block';
                
                // Check if it's a "no jobs found" error and show friendly message
                const errorMessage = data.message || data.error || 'An error occurred while processing your request.';
                const isNoJobsFound = errorMessage.includes('No job listings found') || errorMessage.includes('Found 0 jobs');
                
                if (isNoJobsFound) {
                    // Display friendly "no jobs found" message
                    jobMatchesResults.innerHTML = `
                        <div class="no-jobs-message">
                            <div class="no-jobs-icon">
                                <i class="fas fa-search"></i>
                            </div>
                            <h3>No Jobs Found</h3>
                            <p>We couldn't find any job listings matching your search criteria.</p>
                            <div class="suggestions">
                                <h4><i class="fas fa-lightbulb"></i> Try these suggestions:</h4>
                                <ul>
                                    <li><strong>Broaden your search:</strong> Use more general keywords or try synonyms</li>
                                    <li><strong>Check your location:</strong> Try searching in nearby cities or regions</li>
                                    <li><strong>Adjust filters:</strong> Remove some filters or try different date ranges</li>
                                    <li><strong>Alternative terms:</strong> Use industry-specific terms or job titles</li>
                                </ul>
                            </div>
                            <div class="search-tips">
                                <p><i class="fas fa-info-circle"></i> <strong>Tip:</strong> Try searching for "software developer in London" or "marketing manager in New York" for better results.</p>
                            </div>
                        </div>
                    `;
                } else {
                    // Display regular error message
                    jobMatchesResults.innerHTML = `
                        <div class="error-message">
                            <h3><i class="fas fa-exclamation-triangle"></i> Error</h3>
                            <p>${errorMessage}</p>
                        </div>
                    `;
                }
                break;
        }
    }
    
    // Display CV analysis results
    function displayCVAnalysis(cvAnalysis) {
        const cvAnalysisResults = document.getElementById('cvAnalysisResults');
        
        // Create HTML for CV analysis
        let html = '<div class="cv-analysis-content">';
        
        // Skills section
        if (cvAnalysis.skills && cvAnalysis.skills.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-tools"></i> Skills</h4>
                    <ul class="skills-list">
                        ${cvAnalysis.skills.map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Technical skills section
        if (cvAnalysis.technical_skills && cvAnalysis.technical_skills.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-code"></i> Technical Skills</h4>
                    <ul class="skills-list">
                        ${cvAnalysis.technical_skills.map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Soft skills section
        if (cvAnalysis.soft_skills && cvAnalysis.soft_skills.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-users"></i> Soft Skills</h4>
                    <ul class="skills-list">
                        ${cvAnalysis.soft_skills.map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Experience section
        if (cvAnalysis.experience && cvAnalysis.experience.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-briefcase"></i> Experience</h4>
                    ${cvAnalysis.experience.map(exp => `
                        <div class="experience-item">
                            <h5>${exp.title} at ${exp.company}</h5>
                            <p class="duration">${exp.duration}</p>
                            <ul class="responsibilities">
                                ${exp.description.map(desc => `<li>${desc}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        // Education section
        if (cvAnalysis.education && cvAnalysis.education.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-graduation-cap"></i> Education</h4>
                    ${cvAnalysis.education.map(edu => `
                        <div class="education-item">
                            <h5>${edu.degree}</h5>
                            <p>${edu.institution} (${edu.year})</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        // Languages section
        if (cvAnalysis.languages && cvAnalysis.languages.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-language"></i> Languages</h4>
                    <ul class="languages-list">
                        ${cvAnalysis.languages.map(lang => `<li>${lang}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Certifications section
        if (cvAnalysis.certifications && cvAnalysis.certifications.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="fas fa-certificate"></i> Certifications</h4>
                    <ul class="certifications-list">
                        ${cvAnalysis.certifications.map(cert => `<li>${cert}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        html += '</div>';
        
        // Update the DOM
        cvAnalysisResults.innerHTML = html;
        
        // Make sure the CV analysis section is visible
        document.getElementById('cvAnalysis').style.display = 'block';
    }
    
    // Display job matches
    function displayJobMatches(jobMatches) {
        const jobMatchesResults = document.getElementById('jobMatchesResults');
        const infoSection = document.querySelector('.info-section');
        
        if (!jobMatches || jobMatches.length === 0) {
            // Hide info section when there are no matches
            if (infoSection) {
                infoSection.style.display = 'none';
            }
            
            jobMatchesResults.innerHTML = `
                <div class="no-matches">
                    <h3><i class="fas fa-search"></i> No Job Matches Found</h3>
                    <p>We couldn't find any jobs that match your CV. Try adjusting your search query or uploading a different CV.</p>
                </div>
            `;
            return;
        }
        
        // Show info section when we have matches
        if (infoSection) {
            infoSection.style.display = 'block';
        }
        
        // Create HTML for job matches
        let html = '<div class="job-matches-container">';
        
        jobMatches.forEach((job, index) => {
            // Format the score with color coding
            let scoreClass = 'score-low';
            if (job.score >= 80) {
                scoreClass = 'score-high';
            } else if (job.score >= 60) {
                scoreClass = 'score-medium';
            }
            
            // Format the posted date
            let postedDate = 'Not specified';
            if (job.posted) {
                const date = new Date(job.posted);
                if (!isNaN(date.getTime())) {
                    postedDate = date.toLocaleDateString();
                }
            }
            
            html += `
                <div class="job-card">
                    <div class="job-header">
                        <div class="job-title-container">
                            <h3>${job.title}</h3>
                            <div class="job-score ${scoreClass}">
                                <div class="score-value">${job.score}%</div>
                                <div class="score-label">Match</div>
                            </div>
                        </div>
                        <div class="job-meta">
                            <span class="posted-date"><i class="far fa-calendar-alt"></i> Posted: ${postedDate}</span>
                            <div class="job-actions">
                                <button class="save-job-btn" onclick="saveJob(${index})" data-job-index="${index}">
                                    <i class="fas fa-bookmark"></i> Save
                                </button>
                                <a href="${job.link}" target="_blank" class="apply-link"><i class="fas fa-external-link-alt"></i> Apply</a>
                            </div>
                        </div>
                    </div>
                    <p class="company">${job.company}</p>
                    <div class="job-details">
                        <div class="matching-skills">
                            <h4><i class="fas fa-check-circle"></i> Matching Skills</h4>
                            <ul>
                                ${job.skillsMatch.map(skill => `<li>${skill}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="missing-skills">
                            <h4><i class="fas fa-times-circle"></i> Missing Skills</h4>
                            <ul>
                                ${job.missingSkills.map(skill => `<li>${skill}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="match-reasons">
                            <h4><i class="fas fa-lightbulb"></i> Why This Job Matches</h4>
                            <ul>
                                ${job.reasons.map(reason => `<li>${reason}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Update the DOM
        jobMatchesResults.innerHTML = html;
        
        // Store current job matches globally for saving functionality
        window.currentJobMatches = jobMatches;
        
        // Update save button states
        updateSaveButtonStates();
        
        // Make sure the results container is visible
        document.getElementById('results').style.display = 'block';
    }
    
    function getScoreClass(score) {
        if (score >= 80) return 'score-green';
        if (score >= 60) return 'score-orange';
        return 'score-red';
    }

    // Save job functionality - make it globally accessible
    window.saveJob = async function(jobIndex) {
        if (!window.currentJobMatches || !window.currentJobMatches[jobIndex]) {
            alert('Job not found!');
            return;
        }

        const job = window.currentJobMatches[jobIndex];
        const userId = localStorage.getItem('userId');
        const token = localStorage.getItem('token');
        
        if (!userId || !token) {
            alert('Please log in to save jobs.');
            return;
        }
        
        // Console log all job details
        console.log('=== SAVING JOB DETAILS ===');
        console.log('Job Index:', jobIndex);
        console.log('Job Title:', job.title);
        console.log('Company:', job.company);
        console.log('Match Score:', job.score + '%');
        console.log('Job Link:', job.link);
        console.log('Posted Date:', job.posted);
        console.log('Matching Skills:', job.skillsMatch);
        console.log('Missing Skills:', job.missingSkills);
        console.log('Match Reasons:', job.reasons);
        console.log('Full Job Object:', job);
        console.log('========================');
        
        try {
            // Prepare job data for backend
            const jobData = {
                userId: userId,
                title: job.title,
                company: job.company,
                link: job.link,
                score: job.score,
                posted: job.posted || 'Not specified',
                skillsMatch: job.skillsMatch || [],
                missingSkills: job.missingSkills || [],
                reasons: job.reasons || []
            };
            
            // Save job to MongoDB backend
            const response = await fetch('/api/saved-jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(jobData)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Update button state
                window.updateSaveButtonStates();
                alert('Job saved successfully! You can view your saved jobs later.');
            } else {
                if (response.status === 409) {
                    alert('This job is already saved!');
                } else {
                    alert(result.message || 'Error saving job. Please try again.');
                }
            }
        } catch (error) {
            console.error('Error saving job:', error);
            alert('Error saving job. Please check your connection and try again.');
        }
    };
    
    window.getSavedJobs = function() {
        const saved = localStorage.getItem('savedJobs');
        return saved ? JSON.parse(saved) : [];
    };
    
    window.updateSaveButtonStates = async function() {
        if (!window.currentJobMatches) return;
        
        const userId = localStorage.getItem('userId');
        const token = localStorage.getItem('token');
        
        if (!userId || !token) return;
        
        try {
            // Get saved jobs from backend
            const response = await fetch(`/api/saved-jobs/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error('Failed to fetch saved jobs for button states');
                return;
            }
            
            const data = await response.json();
            const savedJobs = data.savedJobs || [];
            const saveButtons = document.querySelectorAll('.save-job-btn');
            
            saveButtons.forEach((button, index) => {
                const job = window.currentJobMatches[index];
                if (!job) return;
                
                const isAlreadySaved = savedJobs.some(savedJob => 
                    savedJob.link === job.link && savedJob.title === job.title
                );
                
                if (isAlreadySaved) {
                    button.innerHTML = '<i class="fas fa-bookmark"></i> Saved';
                    button.classList.add('saved');
                    button.disabled = true;
                } else {
                    button.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                    button.classList.remove('saved');
                    button.disabled = false;
                }
            });
        } catch (error) {
            console.error('Error updating save button states:', error);
        }
    };

    // Function to scroll to a specific section
    function scrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Update active link on scroll
    window.addEventListener('scroll', function() {
        const sections = ['how-it-works', 'matchForm', 'about'];
        const navLinks = document.querySelectorAll('.navbar-links a');
        
        let currentSection = '';
        
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) {
                const rect = element.getBoundingClientRect();
                if (rect.top <= 100 && rect.bottom >= 100) {
                    currentSection = section;
                }
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === currentSection) {
                link.classList.add('active');
            }
        });
    });

    // Add styles for progress updates
    const style = document.createElement('style');
    style.textContent = `
        .progress-updates {
            margin: 20px 0;
            padding: 20px;
            border-radius: 8px;
            background: #f8f9fa;
        }
        
        .progress-step {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            opacity: 0.6;
            transition: opacity 0.3s;
        }
        
        .progress-step.active {
            opacity: 1;
            border-left: 3px solid #007bff;
        }
        
        .progress-step.complete {
            opacity: 1;
            border-left: 3px solid #28a745;
        }
        
        .step-icon {
            margin-right: 10px;
            font-size: 1.2em;
        }
        
        .progress-bar-container {
            margin-top: 10px;
            background: #e9ecef;
            border-radius: 4px;
            height: 8px;
            overflow: hidden;
        }
        
        .progress-bar {
            width: 0%;
            height: 100%;
            background: #007bff;
            transition: width 0.3s ease;
        }
        
        .progress-text {
            display: block;
            font-size: 0.8em;
            color: #6c757d;
            margin-top: 4px;
        }
        
        .error-update {
            margin: 20px 0;
            padding: 20px;
            border-radius: 8px;
            background: #fff3f3;
            border: 1px solid #ffcdd2;
        }
        
        .error-update ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        /* Save Job Button Styles */
        .job-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .save-job-btn {
            background: #10b981;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 0.9em;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            height: 40px;
            min-width: 80px;
            justify-content: center;
        }
        
        .save-job-btn:hover {
            background: #059669;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }
        
        .save-job-btn:active {
            transform: translateY(0);
        }
        
        .save-job-btn.saved {
            background: #6c757d;
            cursor: not-allowed;
        }
        
        .save-job-btn.saved:hover {
            background: #6c757d;
            transform: none;
            box-shadow: none;
        }
        
        .save-job-btn i {
            font-size: 0.9em;
        }
    `;
    document.head.appendChild(style);
});
