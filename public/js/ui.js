// Shared by the signed-in pages: session guard, navbar, icons, toast, HTML escaping, job rendering and dialogs

const session = {
    userId: localStorage.getItem('userId'),
    token: localStorage.getItem('token'),
    email: localStorage.getItem('userEmail') || ''
};

if (!session.userId || !session.token) {
    window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}

const ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    feed: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/>',
    gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/>',
    sparkle: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z"/><path d="M19 3v4M17 5h4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'
};

function icon(name, size = 16, filled = false) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Listing links come from third parties; only let http(s) through
function safeUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : '#';
}

function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` };
}

// ---------- Shared job rendering (Find matches and Feed) ----------

// The same bands the scoring prompt uses
function scoreTier(score) {
    return score >= 85 ? ['strong', 'Strong match']
        : score >= 70 ? ['good', 'Good match']
        : score >= 50 ? ['partial', 'Stretch']
        : ['partial', 'Weak match'];
}

function scoreBlock(rawScore) {
    const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
    const [tier, label] = scoreTier(score);
    return `
        <div class="score score--${tier}">
            <span class="score-value">${score}<small>%</small></span>
            <span class="score-bar"><span style="width: ${score}%"></span></span>
            <span class="label">${label}</span>
        </div>`;
}

// What the candidate has, the gaps, and the reasons behind a score
function matchDetails(job) {
    const chips = (list, className = 'chip') => list && list.length
        ? `<div class="chips">${list.map(item => `<span class="${className}">${escapeHtml(item)}</span>`).join('')}</div>`
        : '<span class="muted">None listed</span>';
    return `
        <div class="match-skills">
            <div class="match-group"><span class="label">You have</span>${chips(job.skillsMatch)}</div>
            <div class="match-group"><span class="label">Gaps</span>${chips(job.missingSkills, 'chip chip-gap')}</div>
        </div>
        ${job.reasons && job.reasons.length ? `
            <div class="match-group">
                <span class="label">Why this score</span>
                <ul class="match-why">${job.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
            </div>` : ''}`;
}

// JSearch gives either a date or a relative phrase like "2 days ago"
function formatPosted(posted) {
    if (!posted || posted === 'Not specified') return '';
    const date = new Date(posted);
    return isNaN(date.getTime()) ? posted : `Posted ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function hostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'listing';
    }
}

function timeAgo(value) {
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------- Session and saved jobs ----------

// An expired or invalid session answers 401: clear it and go back to sign in
function checkSession(response) {
    if (response.status === 401) {
        signOut();
        throw new Error('Your session expired. Please sign in again.');
    }
    return response;
}

async function fetchSavedJobs() {
    const response = checkSession(await fetch('/api/saved-jobs', { headers: authHeaders() }));
    if (!response.ok) {
        throw new Error('Could not load your saved jobs');
    }
    return (await response.json()).savedJobs || [];
}

function setSavedCount(count) {
    document.querySelectorAll('[data-saved-count]').forEach(el => {
        el.textContent = count;
        el.hidden = false;
    });
}

let toastTimer;
function toast(message) {
    let el = document.querySelector('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

async function signOut() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
        // The local session is cleared either way
    }
    ['userLoggedIn', 'userId', 'token', 'userEmail'].forEach(key => localStorage.removeItem(key));
    window.location.href = '/login';
}

// ---------- AI help: cover letter and CV tips (search results, feed and saved jobs) ----------

const ASSIST_LANGUAGES = [['auto', 'Listing’s language'], ['en', 'English'], ['fr', 'Français']];
// Per panel: which tab is showing, its language, and whether it's being written
const assistStates = new Map();

function assistState(key) {
    if (!assistStates.has(key)) assistStates.set(key, { tab: 'letter', language: 'auto', loading: false, error: '' });
    return assistStates.get(key);
}

function dayMonth(value) {
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The button that opens a job's AI panel
function assistToggle(open) {
    return `<button type="button" class="btn btn-secondary" data-assist-toggle aria-expanded="${open}">${icon('sparkle')}<span>AI help</span></button>`;
}

// job carries whatever was already written for it: { coverLetter, cvTips }
function assistPanel(key, job) {
    const state = assistState(key);
    const letter = job.coverLetter && job.coverLetter.text ? job.coverLetter : null;
    const tips = job.cvTips && job.cvTips.verdict ? job.cvTips : null;
    const result = state.tab === 'letter' ? letter : tips;

    const body = state.loading && !result
        ? `<div class="skeleton-card" aria-hidden="true">
                <div class="skeleton" style="width: 40%; height: 14px;"></div>
                <div class="skeleton" style="width: 95%;"></div>
                <div class="skeleton" style="width: 88%;"></div>
                <div class="skeleton" style="width: 70%;"></div>
            </div>`
        : result
            ? (state.tab === 'letter' ? letterView(result) : tipsView(result))
            : `<p class="assist-empty">${state.tab === 'letter'
                ? 'A cover letter for this job, written from your saved CV and the listing. It only uses what your CV says.'
                : 'Specific edits that make your CV fit this listing, without claiming anything you haven’t done.'}</p>`;

    return `
        <div class="assist" data-assist-key="${escapeHtml(key)}">
            <div class="assist-head">
                <div class="segmented assist-tabs" role="tablist" aria-label="Help with this application">
                    <button type="button" role="tab" data-assist="tab" data-tab="letter" aria-selected="${state.tab === 'letter'}">Cover letter</button>
                    <button type="button" role="tab" data-assist="tab" data-tab="tips" aria-selected="${state.tab === 'tips'}">CV tips</button>
                </div>
                <div class="assist-controls">
                    <select class="select select-sm" data-assist-language aria-label="Language">
                        ${ASSIST_LANGUAGES.map(([value, label]) => `<option value="${value}"${value === state.language ? ' selected' : ''}>${label}</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" data-assist="generate"${state.loading ? ' disabled' : ''}>
                        ${state.loading ? '<span class="spinner"></span><span>Writing…</span>' : `${icon('sparkle', 15)}<span>${result ? 'Regenerate' : 'Generate'}</span>`}
                    </button>
                </div>
            </div>
            ${state.error ? `<p class="assist-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
            <div class="assist-body">${body}</div>
        </div>`;
}

function letterView(letter) {
    return `
        <div class="assist-subject"><span class="label">Subject</span><span>${escapeHtml(letter.subject)}</span></div>
        <textarea class="textarea assist-text" aria-label="Cover letter">${escapeHtml(letter.text)}</textarea>
        <div class="assist-foot">
            <span class="mono muted">Written ${dayMonth(letter.createdAt)} · edit it here, then copy</span>
            <button type="button" class="btn btn-secondary btn-sm" data-assist="copy">${icon('copy', 15)}<span>Copy</span></button>
        </div>`;
}

function tipsView(tips) {
    const group = (label, content) => content ? `<div class="match-group"><span class="label">${label}</span>${content}</div>` : '';
    const keywords = tips.keywords || [];
    const rewrites = tips.rewrites || [];
    const gaps = tips.gaps || [];
    const order = tips.order || [];
    return `
        <div class="assist-tips">
            <p class="assist-verdict">${escapeHtml(tips.verdict)}</p>
            ${group('Use these words, where they’re true', keywords.length && `<div class="chips">${keywords.map(word => `<span class="chip">${escapeHtml(word)}</span>`).join('')}</div>`)}
            ${group('Rewrite', rewrites.length && `<ol class="rewrites">${rewrites.map(edit => `
                <li class="rewrite">
                    <span class="label">${escapeHtml(edit.section)}</span>
                    ${edit.before ? `<p class="rewrite-before">${escapeHtml(edit.before)}</p>` : ''}
                    <p class="rewrite-after">${escapeHtml(edit.after)}</p>
                    <p class="rewrite-why">${escapeHtml(edit.why)}</p>
                </li>`).join('')}</ol>`)}
            ${group('Gaps to address', gaps.length && `<ul class="match-why">${gaps.map(gap => `<li><strong>${escapeHtml(gap.requirement)}:</strong> ${escapeHtml(gap.advice)}</li>`).join('')}</ul>`)}
            ${group('Structure', order.length && `<ul class="match-why">${order.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>`)}
            <span class="mono muted assist-date">Written ${dayMonth(tips.createdAt)}</span>
        </div>`;
}

// Wires every AI panel inside `container`. job(key) is the object whose coverLetter and cvTips the
// panel shows, request(key) says where to ask ({ url, body }), and render(key) redraws that panel.
function wireAssist(container, { job, request, render }) {
    container.addEventListener('click', async e => {
        const button = e.target.closest('[data-assist]');
        if (!button) return;
        const key = button.closest('[data-assist-key]').dataset.assistKey;
        const state = assistState(key);

        if (button.dataset.assist === 'tab') {
            state.tab = button.dataset.tab;
            render(key);
        }
        if (button.dataset.assist === 'copy') {
            // Copies the letter as edited in the box
            const text = button.closest('.assist').querySelector('.assist-text').value;
            navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Could not copy; select the text instead'));
        }
        if (button.dataset.assist === 'generate') {
            state.loading = true;
            state.error = '';
            render(key);
            try {
                const { url, body = {} } = request(key);
                const response = checkSession(await fetch(url, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ ...body, kind: state.tab, language: state.language })
                }));
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || data.error || 'Could not write this right now');
                const written = data.savedJob || data;
                Object.assign(job(key), { coverLetter: written.coverLetter, cvTips: written.cvTips });
                if (data.fromListing === false) toast('The full listing wasn’t available, so this uses the job title and skills');
            } catch (error) {
                state.error = error.message;
            } finally {
                state.loading = false;
                render(key);
            }
        }
    });
    container.addEventListener('change', e => {
        const select = e.target.closest('[data-assist-language]');
        if (select) assistState(select.closest('[data-assist-key]').dataset.assistKey).language = select.value;
    });
}

// ---------- Dialogs ----------

// A modal built from HTML, removed from the page once it closes
function openDialog(html, labelledBy) {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);
    dialog.innerHTML = html;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
    return dialog;
}

// After a Google sign-up, an optional prompt to set up the feed. The sign-in pages set the flag
// when the server says the account is new; it's cleared as soon as the prompt shows.
function askFeedPreferences() {
    try {
        if (localStorage.getItem('askFeedPreferences') !== '1') return;
        localStorage.removeItem('askFeedPreferences');
    } catch {
        return;
    }

    const dialog = openDialog(`
        <form class="welcome" novalidate>
            <span class="label">Optional</span>
            <h2 class="welcome-title" id="welcomeTitle">Want a feed of live openings?</h2>
            <p class="welcome-text">Tell us the jobs you're after and we'll gather openings for them on your Feed. You can change this any time.</p>
            <label class="field">
                <span class="field-label">Job titles</span>
                <input class="input" name="titles" placeholder="e.g. Registered nurse, Infirmier">
                <span class="field-hint">Up to 3, separated by commas. Suggestions come in English and French.</span>
            </label>
            <label class="field">
                <span class="field-label">City</span>
                <input class="input" name="location" placeholder="e.g. Paris" autocomplete="address-level2">
            </label>
            <p class="welcome-error" role="alert" hidden></p>
            <div class="welcome-actions">
                <button type="button" class="btn btn-secondary" data-skip>Not now</button>
                <button type="submit" class="btn btn-primary">Build my feed</button>
            </div>
        </form>`, 'welcomeTitle');

    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.welcome-error');
    attachTitleSuggestions(form.elements.titles, { multiple: true });
    dialog.querySelector('[data-skip]').addEventListener('click', () => dialog.close());

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.elements.titles.value.trim()) {
            error.textContent = 'Add at least one job title, or choose Not now.';
            error.hidden = false;
            form.elements.titles.focus();
            return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            const response = checkSession(await fetch('/api/me/preferences', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ titles: form.elements.titles.value, location: form.elements.location.value })
            }));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save your preferences');
            // On Find matches the feed below fetches openings for the new titles; elsewhere, go there
            if (document.getElementById('feed')) {
                dialog.close();
                document.dispatchEvent(new CustomEvent('feed:preferences-saved', { detail: data }));
            } else {
                window.location.href = '/app#feed';
            }
        } catch (err) {
            submit.disabled = false;
            error.textContent = err.message;
            error.hidden = false;
        }
    });
}

document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = session.email; });
document.querySelectorAll('[data-signout]').forEach(el => el.addEventListener('click', signOut));
askFeedPreferences();
