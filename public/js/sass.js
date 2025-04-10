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
        this.textContent = isVisible ? 'Show CV Analysis Details' : 'Hide CV Analysis Details';
    });
    
    // Form submission
    document.getElementById('matchForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const query = document.getElementById('query').value;
        
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
        
        // Show loading indicator with progress updates
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        loading.style.display = 'block';
        results.style.display = 'none';
        
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
            
            const response = await fetch('/api/find-matches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
                body: JSON.stringify({ query, cvText, userId }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Process the stream
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                // Append new data to buffer and split by double newlines
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep the last incomplete chunk in the buffer

                // Process complete messages
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            // Check for rate limit error
                            if (data.status === 'error' && data.error === 'Rate limit exceeded') {
                                // Clear the progress indicator
                                loading.innerHTML = '';
                                
                                // Show rate limit message with countdown
                                const rateLimitDiv = document.createElement('div');
                                rateLimitDiv.className = 'rate-limit-message';
                                
                                // Parse the next allowed time
                                const nextAllowedTime = new Date(data.nextAllowedTime);
                                const now = new Date();
                                const minutesRemaining = Math.ceil((nextAllowedTime - now) / 1000 / 60);
                                
                                rateLimitDiv.innerHTML = `
                                    <div class="rate-limit-container">
                                        <h3>⏱️ Rate Limit Reached</h3>
                                        <p>${data.message}</p>
                                        <div class="countdown-container">
                                            <div class="countdown" id="countdown">${minutesRemaining}:00</div>
                                            <p>Time remaining</p>
                                        </div>
                                        <button id="refresh-btn" class="btn-refresh" disabled>Refresh</button>
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
                                        refreshButton.textContent = 'Try Again';
                                    }
                                }, 1000);
                                
                                // Add event listener to refresh button
                                refreshButton.addEventListener('click', () => {
                                    window.location.reload();
                                });
                                
                                return;
                            }
                            
                            handleStreamUpdate(data, progressDiv);
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
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
            document.getElementById('loading').style.display = 'none';
            document.getElementById('results').style.display = 'block';
        }
    });
    
    // Handle stream updates
    function handleStreamUpdate(data, progressDiv) {
        const step1 = document.getElementById('step1');
        const step2 = document.getElementById('step2');
        const step3 = document.getElementById('step3');
        const progressBarContainer = step3.querySelector('.progress-bar-container');
        const progressBar = step3.querySelector('.progress-bar');
        const progressText = step3.querySelector('.progress-text');

        switch (data.status) {
            case 'analyzing_cv':
                step1.classList.add('active');
                break;

            case 'cv_analyzed':
                step1.classList.add('complete');
                step2.classList.add('active');
                break;

            case 'searching_jobs':
                step2.classList.add('active');
                break;

            case 'jobs_found':
                step2.classList.add('complete');
                step3.classList.add('active');
                progressBarContainer.style.display = 'block';
                break;

            case 'processing_chunk':
                progressBarContainer.style.display = 'block';
                break;

            case 'chunk_complete':
                const { processed, total } = data.progress;
                const percentage = Math.round((processed / total) * 100);
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `${percentage}%`;
                
                // Update partial results if you want to show them
                if (data.matches && data.matches.length > 0) {
                    displayJobMatches(data.matches);
                }
                break;

            case 'complete':
                step3.classList.add('complete');
                document.getElementById('loading').style.display = 'none';
                document.getElementById('results').style.display = 'block';
                
                // Display final results
                displayCVAnalysis(data.result.cvAnalysis);
                displayJobMatches(data.result.jobMatches, data.result.meta);
                break;

            case 'error':
                throw new Error(data.message || 'An error occurred');
        }
    }
    
    function displayCVAnalysis(cvAnalysis) {
        const container = document.getElementById('cvAnalysisResults');
        container.innerHTML = `<pre>${JSON.stringify(cvAnalysis, null, 2)}</pre>`;
    }
    
    function displayJobMatches(jobMatches, meta) {
        console.log('Displaying job matches:', jobMatches);
        const jobMatchesContainer = document.getElementById('jobMatchesResults');
        jobMatchesContainer.innerHTML = '';
        
        if (jobMatches.length === 0) {
            jobMatchesContainer.innerHTML = '<p>No job matches found.</p>';
            return;
        }
        
        // Add info about the job search
        if (meta) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'info-section';
            infoDiv.innerHTML = `
                <p>Found ${meta.totalJobsFound} jobs (source: ${meta.jobsSource})</p>
                <p>Processed at: ${new Date(meta.processedAt).toLocaleString()}</p>
            `;
            jobMatchesContainer.appendChild(infoDiv);
        }
        
        jobMatches.forEach((job, index) => {
            const jobCard = document.createElement('div');
            jobCard.className = 'job-card';
            
            // Create job title and company
            const jobHeader = document.createElement('div');
            jobHeader.className = 'job-header';
            jobHeader.innerHTML = `
                <h3>${job.title}</h3>
                <p class="company">${job.company}</p>
            `;
            
            // Create match score
            const matchScore = document.createElement('div');
            matchScore.className = 'match-score';
            matchScore.innerHTML = `
                <div class="score-circle ${getScoreClass(job.score)}">
                    <span>${job.score}%</span>
                </div>
                <p>Match Score</p>
            `;
            
            // Create job details section with publish date
            const jobDetails = document.createElement('div');
            jobDetails.className = 'job-details';
            
            // Format the publish date if available
            let publishDate = 'Not available';
            if (job.posted) {
                try {
                    // Check if the date is in the format "il y a X jours"
                    if (job.posted.includes('il y a')) {
                        publishDate = job.posted; // Use the relative date as is
                    } else {
                        // Try to parse as a regular date
                        const date = new Date(job.posted);
                        if (!isNaN(date.getTime())) {
                            publishDate = date.toLocaleDateString();
                        }
                    }
                } catch (e) {
                    console.error('Error parsing date:', e);
                }
            }
            
            jobDetails.innerHTML = `
                <div class="job-meta">
                    <span class="job-date"><i class="far fa-calendar-alt"></i> Posted: ${publishDate}</span>
                </div>
            `;
            
            // Create reasons for match
            const reasonsContainer = document.createElement('div');
            reasonsContainer.className = 'reasons-container';
            reasonsContainer.innerHTML = '<h4>Why this job matches your profile:</h4>';
            
            const reasonsList = document.createElement('ul');
            reasonsList.className = 'reasons-list';
            job.reasons.forEach(reason => {
                const reasonItem = document.createElement('li');
                reasonItem.textContent = reason;
                reasonsList.appendChild(reasonItem);
            });
            reasonsContainer.appendChild(reasonsList);
            
            // Create skills match section
            const skillsContainer = document.createElement('div');
            skillsContainer.className = 'skills-container';
            
            // Matching skills
            if (job.skillsMatch && job.skillsMatch.length > 0) {
                const matchingSkills = document.createElement('div');
                matchingSkills.className = 'matching-skills';
                matchingSkills.innerHTML = '<h4>Matching Skills:</h4>';
                
                const skillsList = document.createElement('ul');
                skillsList.className = 'skills-list';
                job.skillsMatch.forEach(skill => {
                    const skillItem = document.createElement('li');
                    skillItem.textContent = skill;
                    skillsList.appendChild(skillItem);
                });
                matchingSkills.appendChild(skillsList);
                skillsContainer.appendChild(matchingSkills);
            }
            
            // Missing skills
            if (job.missingSkills && job.missingSkills.length > 0) {
                const missingSkills = document.createElement('div');
                missingSkills.className = 'missing-skills';
                missingSkills.innerHTML = '<h4>Skills to Develop:</h4>';
                
                const skillsList = document.createElement('ul');
                skillsList.className = 'skills-list';
                job.missingSkills.forEach(skill => {
                    const skillItem = document.createElement('li');
                    skillItem.textContent = skill;
                    skillItem.className = 'skills-missing';
                    skillsList.appendChild(skillItem);
                });
                missingSkills.appendChild(skillsList);
                skillsContainer.appendChild(missingSkills);
            }
            
            // Add apply button or premium message based on job link availability
            const actionContainer = document.createElement('div');
            actionContainer.className = 'job-action';
            
            if (job.link) {
                // Check if this is the first job (index 0)
                if (index === 0) {
                    // First job - show regular apply button
                    actionContainer.innerHTML = `
                        <a href="${job.link}" target="_blank" class="btn-apply">Apply Now</a>
                    `;
                } else {
                    // All other jobs - show premium locked button
                    actionContainer.innerHTML = `
                        <div class="premium-locked">
                            <div class="premium-message">
                                <i class="fas fa-lock premium-icon"></i>
                                <span>Premium Feature</span>
                    </div>
                            <button class="btn-premium" onclick="scrollToSection('earlyAccessForm')">Upgrade to Premium</button>
                    </div>
                    `;
                }
            } else {
                actionContainer.innerHTML = `
                    <div class="no-link-message">
                        <i class="fas fa-link-slash"></i>
                        <span>No link available</span>
                </div>
            `;
            }
            
            // Append all elements to the job card
            jobCard.appendChild(jobHeader);
            jobCard.appendChild(matchScore);
            jobCard.appendChild(jobDetails);
            jobCard.appendChild(reasonsContainer);
            jobCard.appendChild(skillsContainer);
            jobCard.appendChild(actionContainer);
            
            // Add the job card to the container
            jobMatchesContainer.appendChild(jobCard);
        });
    }
    
    function getScoreClass(score) {
        if (score >= 80) return 'score-green';
        if (score >= 60) return 'score-orange';
        return 'score-red';
    }

    // Handle early access form submission
    const earlyAccessForm = document.getElementById('earlyAccessForm');
    earlyAccessForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('earlyAccessEmail').value;
        
        // Here you would typically send this to your server
        // For now, we'll just show a success message
        alert('Thank you! We\'ll notify you when premium access is available.');
        earlyAccessForm.reset();
    });

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
    `;
    document.head.appendChild(style);
});
