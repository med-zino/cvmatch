// Shared by the signed-in pages: session guard, navbar, icons, toast and HTML escaping

const session = {
    userId: localStorage.getItem('userId'),
    token: localStorage.getItem('token'),
    email: localStorage.getItem('userEmail') || ''
};

if (!session.userId || !session.token) {
    window.location.href = '/login';
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
    gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/>'
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

// After a Google sign-up, an optional prompt to set up the feed. The sign-in pages set the flag
// when the server says the account is new; it's cleared as soon as the prompt shows.
function askFeedPreferences() {
    try {
        if (localStorage.getItem('askFeedPreferences') !== '1') return;
        localStorage.removeItem('askFeedPreferences');
    } catch {
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'welcome-dialog';
    dialog.setAttribute('aria-labelledby', 'welcomeTitle');
    dialog.innerHTML = `
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
        </form>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.welcome-error');
    attachTitleSuggestions(form.elements.titles, { multiple: true });
    dialog.querySelector('[data-skip]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());

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
            if (!response.ok) throw new Error((await response.json()).error || 'Could not save your preferences');
            // The feed fetches openings for the new titles on arrival
            window.location.href = '/feed';
        } catch (err) {
            submit.disabled = false;
            error.textContent = err.message;
            error.hidden = false;
        }
    });

    dialog.showModal();
}

document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = session.email; });
document.querySelectorAll('[data-signout]').forEach(el => el.addEventListener('click', signOut));
askFeedPreferences();
