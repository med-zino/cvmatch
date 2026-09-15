// Find matches page: CV input (the CV saved to the account, a PDF read in the browser, or pasted text), streamed matching, results
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const form = document.getElementById('matchForm');
const results = document.getElementById('results');
const submitButton = document.getElementById('submitButton');
const cvTextInput = document.getElementById('cvText');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('pdfFileInput');
const fileRow = document.getElementById('fileRow');
const cvNote = document.getElementById('cvSavedNote');
const filtersToggle = document.getElementById('filtersToggle');
const filtersPanel = document.getElementById('filtersPanel');

attachTitleSuggestions(form.elements.role);

let cvMode = 'pdf';
let pdfText = '';
// The CV's file name ('' for pasted text), saved along with it
let cvName = '';
// The CV an earlier search saved to the account
let savedCv = null;
let savedLinks = new Set();
let currentMatches = [];

fetchSavedJobs()
    .then(jobs => {
        savedLinks = new Set(jobs.map(job => job.link));
        setSavedCount(jobs.length);
    })
    .catch(error => console.error(error));

// The tour runs once per account, or again from the Tour link (/app?tour=1)
const tourRequested = new URLSearchParams(window.location.search).has('tour');
if (tourRequested) history.replaceState(null, '', '/app');

// The saved CV fills the form, unless the user already started adding one
fetch('/api/me', { headers: authHeaders() })
    .then(checkSession)
    .then(response => response.ok ? response.json() : null)
    .then(profile => {
        if (!profile) return;
        if (profile.cv && !pdfText && !cvTextInput.value.trim()) useSavedCv(profile.cv);
        if (tourRequested || !profile.tourSeen) afterPrompt(startTour);
    })
    .catch(error => console.error(error));

// The tour waits until the sign-up prompt, if it's showing, is closed
function afterPrompt(run) {
    const prompt = document.querySelector('dialog.app-dialog[open]');
    if (prompt) prompt.addEventListener('close', run, { once: true });
    else run();
}

// ---------- CV input ----------

document.querySelectorAll('[data-cv-tab]').forEach((tab, _, tabs) => {
    tab.addEventListener('click', () => {
        cvMode = tab.dataset.cvTab;
        tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
        document.getElementById('pdfPanel').hidden = cvMode !== 'pdf';
        document.getElementById('textPanel').hidden = cvMode !== 'text';
    });
});

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault();
    dropzone.classList.add('is-over');
}));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault();
    dropzone.classList.remove('is-over');
}));
dropzone.addEventListener('drop', e => {
    if (e.dataTransfer.files.length) readPdf(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) readPdf(fileInput.files[0]);
});
document.getElementById('removeFile').addEventListener('click', clearFile);

const shortDate = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function showFile(name, meta, badge) {
    document.getElementById('fileName').textContent = name;
    document.getElementById('fileMeta').textContent = meta;
    fileRow.querySelector('.file-badge').textContent = badge;
    dropzone.hidden = true;
    fileRow.hidden = false;
}

// Clears the chosen file; a CV saved to the account stays saved
function clearFile() {
    pdfText = '';
    cvName = '';
    fileInput.value = '';
    fileRow.hidden = true;
    dropzone.hidden = false;
}

function useSavedCv(cv) {
    savedCv = cv;
    pdfText = cv.text;
    cvName = cv.name || '';
    // The text tab shows it too, so it can be corrected
    cvTextInput.value = cv.text;
    showFile(cv.name || 'Pasted CV', `Saved CV${cv.updatedAt ? ` · ${shortDate(cv.updatedAt)}` : ''}`, /\.pdf$/i.test(cv.name) ? 'PDF' : 'TXT');
    renderCvNote();
}

function renderCvNote() {
    cvNote.innerHTML = savedCv
        ? 'Saved to your account, and used to score jobs in your feed. <button type="button" class="link-button" id="deleteCv">Delete saved CV</button>'
        : 'Your CV is saved to your account after your first search, so you only add it once.';
}

cvNote.addEventListener('click', async e => {
    if (!e.target.closest('#deleteCv') || !confirm('Delete the CV saved to your account?')) return;
    try {
        const response = checkSession(await fetch('/api/me/cv', { method: 'DELETE', headers: authHeaders() }));
        if (!response.ok) throw new Error('Could not delete your CV');
        savedCv = null;
        clearFile();
        cvTextInput.value = '';
        renderCvNote();
        toast('Saved CV deleted');
    } catch (error) {
        toast(error.message);
    }
});

// Extracts the PDF's text layer (scanned CVs have none)
async function readPdf(file) {
    if (file.type !== 'application/pdf') {
        toast('Please choose a PDF file');
        return;
    }

    showFile(file.name, 'Reading…', 'PDF');
    const fileMeta = document.getElementById('fileMeta');
    try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const content = await (await pdf.getPage(i)).getTextContent();
            pages.push(content.items.map(item => item.str).join(' '));
        }
        pdfText = pages.join('\n\n');
        cvName = file.name;
        // The text tab shows what was read, so it can be corrected
        cvTextInput.value = pdfText;
        fileMeta.textContent = pdfText.trim()
            ? `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} read`
            : 'No text found — paste your CV instead';
    } catch (error) {
        console.error('Error reading PDF:', error);
        pdfText = '';
        cvName = '';
        fileMeta.textContent = 'Could not read this PDF';
    }
}

// ---------- Filters ----------

filtersToggle.addEventListener('click', () => {
    const open = filtersToggle.getAttribute('aria-expanded') !== 'true';
    filtersToggle.setAttribute('aria-expanded', String(open));
    filtersPanel.hidden = !open;
});
filtersPanel.addEventListener('change', () => {
    const active = [...filtersPanel.querySelectorAll('select')].filter(select => select.value).length;
    document.getElementById('filtersSummary').textContent = active ? `${active} active` : 'None';
});

// ---------- Matching ----------

form.addEventListener('submit', e => {
    e.preventDefault();

    const role = form.elements.role.value.trim();
    const city = form.elements.city.value.trim();
    const cvText = cvMode === 'pdf' ? pdfText : cvTextInput.value;

    if (!role || !city) {
        toast('Add a role and a city');
        return;
    }
    if (!cvText.trim()) {
        toast(cvMode === 'pdf' ? 'Upload your CV, or paste it as text' : 'Paste your CV text first');
        return;
    }

    // The server takes the filter values as the select strings
    const filters = {};
    ['date_posted', 'work_from_home', 'job_requirements', 'employment_types'].forEach(name => {
        if (form.elements[name].value) filters[name] = form.elements[name].value;
    });

    runMatch({ query: `${role} in ${city}`, cvText, cvName: cvMode === 'pdf' ? cvName : '', filters }, { role, city });
});

async function runMatch(body, search) {
    submitButton.disabled = true;
    renderProgress();
    let finished = false;
    let succeeded = false;

    try {
        // Only covers waiting for the stream to start; scoring itself can run longer
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = checkSession(await fetch('/api/find-matches', {
            method: 'POST',
            headers: { ...authHeaders(), 'Accept': 'text/event-stream' },
            body: JSON.stringify(body),
            signal: controller.signal
        }));
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            // Server-sent events end with a blank line; keep a partial one for the next chunk
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop();
            for (const event of events) {
                if (event.startsWith('data: ')) {
                    const data = JSON.parse(event.slice(6));
                    if (data.status === 'complete') succeeded = true;
                    finished = handleEvent(data, search, body) || finished;
                }
            }
        }

        if (!finished) {
            renderError('The connection closed before matching finished.');
        }
        // The stream ends once the search is stored, so the feed below can show it now
        if (succeeded) document.dispatchEvent(new CustomEvent('search:complete'));
    } catch (error) {
        console.error('Matching failed:', error);
        renderError(error.name === 'AbortError' ? 'The server took too long to respond.' : error.message);
    } finally {
        submitButton.disabled = false;
    }
}

// Returns true once the run has ended (results or an error)
function handleEvent(event, search, body) {
    switch (event.status) {
        case 'cv_analyzed': {
            // The CV is read while the search runs; the summary can be missing if it failed
            const skills = (event.cvAnalysis && event.cvAnalysis.skills) || [];
            setStep('cv', 'done', skills.length ? `${skills.length} skills found` : 'Done');
            return false;
        }
        case 'jobs_found':
            setStep('search', 'done', `${event.totalJobs} found`);
            setStep('score', 'active', '0%', 0);
            return false;
        case 'chunk_complete': {
            const pct = Math.round((event.progress.processed / event.progress.total) * 100);
            setStep('score', 'active', `${pct}%`, pct);
            return false;
        }
        case 'complete':
            renderResults(event.result, search);
            // The server saved this CV to the account
            savedCv = { text: body.cvText, name: body.cvName, updatedAt: new Date().toISOString() };
            renderCvNote();
            return true;
        case 'error':
            if ((event.error || '').includes('No job listings found')) {
                renderNoJobs();
            } else {
                renderError(event.message || event.error);
            }
            return true;
        default:
            return false;
    }
}

function setStep(name, state, meta = '', pct) {
    const step = results.querySelector(`[data-step="${name}"]`);
    if (!step) return;

    step.classList.remove('is-active', 'is-done');
    step.classList.add(`is-${state}`);
    step.querySelector('.progress-step-meta').textContent = meta;

    const track = step.querySelector('.progress-track');
    if (track && pct !== undefined) {
        track.hidden = false;
        track.firstElementChild.style.width = `${pct}%`;
    }
}

// ---------- Rendering ----------

function renderProgress() {
    const step = (name, label, active) => `
        <li class="progress-step${active ? ' is-active' : ''}" data-step="${name}">
            <span class="dot"></span>
            <span class="progress-step-text">${label}</span>
            <span class="progress-step-meta"></span>
            ${name === 'score' ? '<div class="progress-track" hidden><span></span></div>' : ''}
        </li>`;

    results.innerHTML = `
        <div class="card progress-card">
            <div class="progress-head">
                <h2 class="progress-title">Matching your CV…</h2>
                <p class="progress-sub">This usually takes under a minute.</p>
            </div>
            <ol>
                ${step('cv', 'Reading your CV', true)}
                ${step('search', 'Searching live listings', true)}
                ${step('score', 'Scoring each job against your profile')}
            </ol>
            <div class="skeleton-card" aria-hidden="true">
                <div class="skeleton" style="width: 55%; height: 14px;"></div>
                <div class="skeleton" style="width: 35%;"></div>
                <div class="skeleton-row">
                    <div class="skeleton" style="width: 64px; height: 24px;"></div>
                    <div class="skeleton" style="width: 84px; height: 24px;"></div>
                    <div class="skeleton" style="width: 56px; height: 24px;"></div>
                </div>
            </div>
        </div>`;
}

function renderResults(result, search) {
    const matches = result.jobMatches || [];
    if (!matches.length) {
        renderError('No matches came back for this search.');
        return;
    }

    currentMatches = matches.sort((a, b) => b.score - a.score);
    const profile = result.cvAnalysis || {};
    const skills = profile.skills || [];
    const shownSkills = skills.slice(0, 8);
    // Listings in a batch that failed to score are left out rather than shown with a fake score
    const failed = (result.meta && result.meta.failedJobs) || 0;

    results.innerHTML = `
        <div class="results-head">
            <div class="results-heading">
                <span class="label">Results</span>
                <h2 class="results-title">${matches.length} job${matches.length === 1 ? '' : 's'} ranked for ${escapeHtml(search.role)} in ${escapeHtml(search.city)}</h2>
            </div>
            <span class="mono muted results-sort">Best match first${failed ? ` · ${failed} couldn't be scored` : ''}</span>
        </div>
        ${skills.length ? `
            <div class="cv-strip">
                <span class="label">Read from your CV${profile.headline ? ` · ${escapeHtml(profile.headline)}` : ''}</span>
                <div class="chips">
                    ${shownSkills.map(skill => `<span class="chip">${escapeHtml(skill)}</span>`).join('')}
                    ${skills.length > shownSkills.length ? `<span class="chip chip-more">+${skills.length - shownSkills.length} more</span>` : ''}
                </div>
            </div>` : ''}
        <ol class="match-list">${currentMatches.map(matchCard).join('')}</ol>`;

    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function matchCard(job, index) {
    const meta = [job.company, formatPosted(job.posted)].filter(Boolean);

    return `
        <li class="card match-card" style="--i: ${index}">
            <div class="match-top">
                <span class="match-rank mono">${String(index + 1).padStart(2, '0')}</span>
                <div class="match-heading">
                    <h3 class="match-title">${escapeHtml(job.title)}</h3>
                    <p class="match-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('<span aria-hidden="true">·</span>')}</p>
                </div>
                ${scoreBlock(job.score)}
            </div>
            <div class="match-body">
                ${matchDetails(job)}
                ${job.link ? `
                    <div class="match-foot">
                        <span class="mono match-source">via ${escapeHtml(hostname(job.link))}</span>
                        <div class="match-actions">
                            ${saveButton(savedLinks.has(job.link), index)}
                            <a class="btn btn-primary" href="${escapeHtml(safeUrl(job.link))}" target="_blank" rel="noopener">Apply ${icon('arrowUpRight')}</a>
                        </div>
                    </div>` : ''}
            </div>
        </li>`;
}

function saveButton(saved, index) {
    return saved
        ? `<button type="button" class="btn btn-secondary is-saved" disabled>${icon('bookmark', 16, true)}<span>Saved</span></button>`
        : `<button type="button" class="btn btn-secondary" data-save="${index}">${icon('bookmark')}<span>Save</span></button>`;
}

function renderError(message) {
    results.innerHTML = `
        <div class="alert" role="alert">
            ${icon('alert', 22)}
            <div class="alert-body">
                <h2 class="alert-title">We couldn't finish this search</h2>
                <p class="alert-text">Your CV and search are still filled in, so you can try again in a moment.</p>
                ${message ? `<p class="alert-code">${escapeHtml(message)}</p>` : ''}
            </div>
            <button type="button" class="btn btn-secondary" data-retry>Try again</button>
        </div>`;
}

function renderNoJobs() {
    results.innerHTML = `
        <div class="alert alert--soft">
            ${icon('search', 22)}
            <div class="alert-body">
                <h2 class="alert-title">No listings for this search</h2>
                <p class="alert-text">Try a broader role name, a nearby city, or fewer filters.</p>
            </div>
        </div>`;
}

results.addEventListener('click', e => {
    const save = e.target.closest('[data-save]');
    if (save) saveMatch(currentMatches[save.dataset.save], save);
    if (e.target.closest('[data-retry]')) form.requestSubmit();
});

async function saveMatch(job, button) {
    button.disabled = true;
    try {
        const response = checkSession(await fetch('/api/saved-jobs', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                title: job.title,
                company: job.company,
                link: job.link,
                score: Math.round(job.score),
                posted: job.posted || 'Not specified',
                skillsMatch: job.skillsMatch || [],
                missingSkills: job.missingSkills || [],
                reasons: job.reasons || []
            })
        }));
        // 409 means it was already on the list
        if (!response.ok && response.status !== 409) {
            throw new Error((await response.json()).message || 'Could not save this job');
        }

        savedLinks.add(job.link);
        document.dispatchEvent(new CustomEvent('job:saved', { detail: { link: job.link } }));
        button.outerHTML = saveButton(true);
        setSavedCount(savedLinks.size);
        toast('Saved to your shortlist');
    } catch (error) {
        button.disabled = false;
        toast(error.message);
    }
}
