// Feed page: openings for the user's target titles plus every job from their searches.
// Jobs are scored only when asked, against the CV saved from Find matches.
const list = document.getElementById('feedList');
const more = document.getElementById('feedMore');
const notice = document.getElementById('feedNotice');
const prefsBox = document.getElementById('prefs');
const tools = document.getElementById('feedTools');
const tabs = document.getElementById('sourceTabs');
const scoreAllButton = document.getElementById('scoreAll');
const refreshButton = document.getElementById('refreshFeed');

const SOURCE_LABELS = { all: 'All', feed: 'For you', search: 'From your searches' };
// Jobs per request when scoring everything loaded
const SCORE_CHUNK = 20;

let items = [];
let source = 'all';
let cursor = null;
let loading = false;
let loadError = '';
let building = false;
let scoringAll = false;
let editingPrefs = false;
let profile = { titles: [], location: '', fetchedAt: null, hasCv: false };
let counts = { all: 0, feed: 0, search: 0 };
let savedLinks = new Set();

const isScored = item => typeof item.score === 'number';

const savedReady = fetchSavedJobs()
    .then(jobs => {
        savedLinks = new Set(jobs.map(job => job.link));
        setSavedCount(jobs.length);
    })
    .catch(error => console.error(error));

init();

async function init() {
    await savedReady;
    await loadPage(true);
    renderPrefs();
    // First visit with titles from sign-up: fetch their openings now
    if (profile.titles.length && !profile.fetchedAt) await refresh();
}

// ---------- Loading ----------

async function loadPage(reset = false) {
    if (loading || (!reset && !cursor)) return;
    loading = true;
    loadError = '';
    if (reset) {
        items = [];
        cursor = null;
        list.innerHTML = '';
    }
    renderMore();

    try {
        const params = new URLSearchParams({ source });
        if (cursor) params.set('cursor', cursor);
        const response = checkSession(await fetch(`/api/feed?${params}`, { headers: authHeaders() }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your feed');

        profile = data.profile;
        counts = data.counts;
        cursor = data.nextCursor;
        items.push(...data.items);
        list.insertAdjacentHTML('beforeend', data.items.map(feedCard).join(''));
        renderChrome();
    } catch (error) {
        loadError = error.message;
    } finally {
        loading = false;
        renderMore();
    }
    // A short page can leave the end of the list on screen, where the observer won't fire again
    if (cursor && !loadError && more.getBoundingClientRect().top < window.innerHeight + 600) loadPage();
}

new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadPage();
}, { rootMargin: '600px 0px' }).observe(more);

async function refresh() {
    building = true;
    refreshButton.disabled = true;
    notice.innerHTML = buildingCard();
    renderMore();
    try {
        const response = checkSession(await fetch('/api/feed/refresh', { method: 'POST', headers: authHeaders() }));
        const data = await response.json();
        notice.innerHTML = '';
        // Refreshed within the last hour: nothing new to fetch yet
        if (response.status === 429) {
            toast(data.error);
            return;
        }
        if (!response.ok) throw new Error(data.error || 'Could not refresh your feed');

        toast(data.found ? `${data.found} openings found` : 'No openings came back this time');
        building = false;
        await loadPage(true);
    } catch (error) {
        notice.innerHTML = `
            <div class="alert feed-notice" role="alert">
                ${icon('alert', 22)}
                <div class="alert-body">
                    <h2 class="alert-title">We couldn't fetch new openings</h2>
                    <p class="alert-text">Your feed is still here. Try again in a moment.</p>
                    <p class="alert-code">${escapeHtml(error.message)}</p>
                </div>
                <button type="button" class="btn btn-secondary" data-refresh-retry>Try again</button>
            </div>`;
    } finally {
        building = false;
        refreshButton.disabled = false;
        renderMore();
    }
}

// ---------- Rendering ----------

function renderChrome() {
    const { titles, location, fetchedAt } = profile;
    document.getElementById('feedSubtitle').textContent = titles.length
        ? `Openings for ${titles.join(', ')}${location ? ` in ${location}` : ''}, plus every job from your searches. Nothing is scored until you ask.`
        : 'Every job from your searches lands here. Add the titles you want and fresh openings join them.';
    document.getElementById('feedUpdated').textContent = fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : '';
    refreshButton.hidden = !titles.length;

    tools.hidden = !counts.all;
    tabs.innerHTML = Object.entries(SOURCE_LABELS).map(([key, label]) => `
        <button type="button" role="tab" class="status-tab" data-source="${key}" aria-selected="${key === source}">
            <span>${label}</span><span class="mono">${counts[key] || 0}</span>
        </button>`).join('');

    const unscored = items.filter(item => !isScored(item)).length;
    scoreAllButton.hidden = !unscored && !scoringAll;
    if (!scoringAll) scoreAllButton.innerHTML = `${icon('gauge')}<span>Score all (${unscored})</span>`;
}

function renderPrefs() {
    const { titles, location } = profile;
    if (titles.length && !editingPrefs) {
        prefsBox.innerHTML = `
            <div class="prefs">
                <span class="label">Looking for</span>
                <div class="chips">${titles.map(title => `<span class="chip">${escapeHtml(title)}</span>`).join('')}</div>
                <span class="prefs-city">${location ? `in ${escapeHtml(location)}` : 'Anywhere — add a city for local openings'}</span>
                <button type="button" class="link-button" data-prefs-edit>Edit</button>
            </div>
            ${alertStrip()}`;
        return;
    }

    prefsBox.innerHTML = `
        <form class="card prefs-form" id="prefsForm">
            <div class="prefs-form-head">
                <h2 class="prefs-form-title">${titles.length ? 'What should your feed look for?' : 'What jobs are you after?'}</h2>
                <p class="prefs-form-text">Up to 3 job titles, separated by commas. We fetch live openings for each one; nothing is scored until you ask.</p>
            </div>
            <label class="field">
                <span class="field-label">Job titles</span>
                <input class="input" name="titles" value="${escapeHtml(titles.join(', '))}" placeholder="e.g. Registered nurse, Midwife" autocomplete="off">
            </label>
            <label class="field">
                <span class="field-label">City</span>
                <input class="input" name="location" value="${escapeHtml(location)}" placeholder="e.g. London" autocomplete="off">
            </label>
            <div class="prefs-form-actions">
                ${titles.length ? '<button type="button" class="btn btn-secondary" data-prefs-cancel>Cancel</button>' : ''}
                <button type="submit" class="btn btn-primary">${titles.length ? 'Save' : 'Build my feed'}</button>
            </div>
        </form>`;
    attachTitleSuggestions(prefsBox.querySelector('[name="titles"]'), { multiple: true });
}

function renderMore() {
    if (loading) {
        more.innerHTML = `
            <div class="skeleton-card" aria-hidden="true">
                <div class="skeleton" style="width: 55%; height: 14px;"></div>
                <div class="skeleton" style="width: 35%;"></div>
                <div class="skeleton" style="width: 90%;"></div>
            </div>`;
    } else if (loadError) {
        more.innerHTML = `<p class="feed-end">${escapeHtml(loadError)}</p><button type="button" class="btn btn-secondary" data-load-retry>Try again</button>`;
    } else if (cursor) {
        more.innerHTML = '<button type="button" class="btn btn-secondary" data-load-more>Load more</button>';
    } else if (items.length) {
        more.innerHTML = '<p class="feed-end">You’re all caught up.</p>';
    } else if (building) {
        more.innerHTML = '';
    } else if (source !== 'all' && counts.all) {
        more.innerHTML = '<div class="empty empty--compact"><p class="empty-text">Nothing here yet.</p></div>';
    } else {
        const text = profile.titles.length && profile.fetchedAt
            ? 'No openings came back for these titles. Try broader titles or another city, or run a search on Find matches.'
            : 'Run a search on Find matches and every job it finds lands here too.';
        more.innerHTML = `
            <div class="empty">
                ${icon('feed', 28)}
                <h2 class="empty-title">Your feed is empty</h2>
                <p class="empty-text">${text}</p>
                <a class="btn btn-secondary" href="/app">Find matches</a>
            </div>`;
    }
}

function buildingCard() {
    const place = profile.location ? ` in ${escapeHtml(profile.location)}` : '';
    return `
        <div class="card progress-card feed-notice">
            <div class="progress-head">
                <h2 class="progress-title">${profile.fetchedAt ? 'Refreshing your feed…' : 'Building your feed…'}</h2>
                <p class="progress-sub">Fetching live openings from job boards. This can take up to a minute.</p>
            </div>
            <ol>
                ${profile.titles.map(title => `
                    <li class="progress-step is-active">
                        <span class="dot"></span>
                        <span class="progress-step-text">${escapeHtml(title)}${place}</span>
                    </li>`).join('')}
            </ol>
        </div>`;
}

function feedCard(item, index = 0) {
    const scored = isScored(item);
    const meta = [item.company, item.location, formatPosted(item.posted), item.isRemote ? 'Remote' : ''].filter(Boolean);
    const origin = item.source === 'search' ? `From your search “${item.query}”` : `For “${item.query}”`;

    return `
        <li class="card feed-card" data-id="${item.id}" style="--i: ${index}">
            <div class="match-top">
                <div class="match-heading">
                    <h3 class="match-title">${escapeHtml(item.title)}</h3>
                    <p class="match-meta">${meta.map(part => `<span>${escapeHtml(part)}</span>`).join('<span aria-hidden="true">·</span>')}</p>
                </div>
                ${scored ? scoreBlock(item.score) : `
                    <div class="score-pending">
                        <button type="button" class="btn btn-secondary btn-sm" data-score>${icon('gauge')}<span>Score</span></button>
                        <span class="label">Not scored</span>
                    </div>`}
            </div>
            ${scored ? `<div class="match-body">${matchDetails(item)}</div>` : item.snippet ? `<p class="feed-snippet">${escapeHtml(item.snippet)}</p>` : ''}
            <div class="match-foot">
                <span class="mono feed-origin">${escapeHtml(origin)}${item.link ? ` · via ${escapeHtml(hostname(item.link))}` : ''}</span>
                ${item.link ? `
                    <div class="match-actions">
                        ${saveButton(savedLinks.has(item.link))}
                        <a class="btn btn-primary" href="${escapeHtml(safeUrl(item.link))}" target="_blank" rel="noopener">Apply ${icon('arrowUpRight')}</a>
                    </div>` : ''}
            </div>
        </li>`;
}

function saveButton(saved) {
    return saved
        ? `<button type="button" class="btn btn-secondary is-saved" disabled>${icon('bookmark', 16, true)}<span>Saved</span></button>`
        : `<button type="button" class="btn btn-secondary" data-save>${icon('bookmark')}<span>Save</span></button>`;
}

function showNoCv() {
    notice.innerHTML = `
        <div class="alert alert--soft feed-notice">
            ${icon('file', 22)}
            <div class="alert-body">
                <h2 class="alert-title">Add your CV to score jobs</h2>
                <p class="alert-text">Run one search on Find matches. Your CV is saved to your account and used for every score here.</p>
            </div>
            <a class="btn btn-secondary" href="/app">Find matches</a>
        </div>`;
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Daily email ----------

const formatHour = hour => new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function alertStrip() {
    const { enabled, hour } = profile.alert || {};
    return `
        <div class="prefs alert-strip">
            ${icon('bell')}
            <span class="label">Daily email</span>
            <span class="prefs-city">${enabled ? `Your top 3 new matches, every day at ${formatHour(hour)}` : 'Off — get your top 3 new matches by email each day'}</span>
            <button type="button" class="link-button" data-alert-edit>${enabled ? 'Edit' : 'Set up'}</button>
        </div>`;
}

function openAlertDialog() {
    const settings = profile.alert || { hour: 8 };
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const place = profile.location ? ` in ${escapeHtml(profile.location)}` : '';
    const dialog = openDialog(`
        <form class="welcome" novalidate>
            <span class="label">Daily email</span>
            <h2 class="welcome-title" id="alertTitle">Your top 3 matches, every day</h2>
            <p class="welcome-text">At the time you choose, we look for new openings for ${escapeHtml(profile.titles.join(', '))}${place}, score them against your CV and email you the best three.</p>
            <label class="switch">
                <input type="checkbox" name="enabled" checked>
                <span>Email me every day</span>
            </label>
            <label class="field">
                <span class="field-label">Time</span>
                <select class="select" name="hour">
                    ${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === settings.hour ? ' selected' : ''}>${formatHour(h)}</option>`).join('')}
                </select>
                <span class="field-hint">In your time zone, ${escapeHtml(timeZone)}.</span>
            </label>
            ${profile.hasCv ? '' : '<p class="welcome-note">Run one search on Find matches first, so your CV is saved to score against.</p>'}
            <p class="welcome-error" role="alert" hidden></p>
            <p class="welcome-note" role="status" data-test-result hidden></p>
            <div class="welcome-actions">
                <button type="button" class="btn btn-secondary" data-alert-test>Send one now</button>
                <span class="spacer"></span>
                <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="btn btn-primary">Save</button>
            </div>
        </form>`, 'alertTitle');

    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.welcome-error');
    const result = dialog.querySelector('[data-test-result]');
    const showError = message => {
        error.textContent = message;
        error.hidden = !message;
    };
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());

    // Runs today's email straight away, whatever the schedule
    dialog.querySelector('[data-alert-test]').addEventListener('click', async e => {
        const button = e.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
        showError('');
        result.hidden = true;
        try {
            const response = checkSession(await fetch('/api/me/alert/test', { method: 'POST', headers: authHeaders() }));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not send the email');
            result.textContent = data.sent
                ? `Sent to ${data.email}. It can take a minute, and the first one may land in spam.`
                : data.message;
            result.hidden = false;
        } catch (err) {
            showError(err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Send one now';
        }
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        showError('');
        try {
            const response = checkSession(await fetch('/api/me/alert', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ enabled: form.elements.enabled.checked, hour: Number(form.elements.hour.value), timeZone })
            }));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save your daily email');

            profile.alert = data.alert;
            dialog.close();
            renderPrefs();
            toast(data.alert.enabled ? `Daily email on, at ${formatHour(data.alert.hour)}` : 'Daily email off');
        } catch (err) {
            submit.disabled = false;
            showError(err.message);
        }
    });
}

// ---------- Scoring and saving ----------

function setScoring(id, on) {
    const card = list.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    card.classList.toggle('is-scoring', on);
    const button = card.querySelector('[data-score]');
    if (button) {
        button.disabled = on;
        button.innerHTML = on ? '<span class="spinner"></span><span>Scoring…</span>' : `${icon('gauge')}<span>Score</span>`;
    }
}

// Returns false when there's no saved CV to score against
async function scoreItems(ids) {
    ids.forEach(id => setScoring(id, true));
    try {
        const response = checkSession(await fetch('/api/feed/score', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ ids })
        }));
        const data = await response.json();
        if (data.code === 'no_cv') {
            showNoCv();
            return false;
        }
        if (!response.ok) throw new Error(data.error || 'Could not score these jobs');

        data.items.forEach(updated => {
            const index = items.findIndex(item => item.id === updated.id);
            if (index >= 0) items[index] = updated;
            const card = list.querySelector(`[data-id="${updated.id}"]`);
            if (card) card.outerHTML = feedCard(updated);
        });
        if (data.failed) toast(`${data.failed} job${data.failed === 1 ? '' : 's'} couldn't be scored`);
        return true;
    } finally {
        ids.forEach(id => setScoring(id, false));
        renderChrome();
    }
}

async function saveItem(item, button) {
    button.disabled = true;
    try {
        const response = checkSession(await fetch('/api/saved-jobs', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                title: item.title,
                company: item.company,
                link: item.link,
                score: isScored(item) ? item.score : null,
                posted: item.posted || 'Not specified',
                skillsMatch: item.skillsMatch,
                missingSkills: item.missingSkills,
                reasons: item.reasons
            })
        }));
        // 409 means it was already on the list
        if (!response.ok && response.status !== 409) {
            throw new Error((await response.json()).message || 'Could not save this job');
        }

        savedLinks.add(item.link);
        button.outerHTML = saveButton(true);
        setSavedCount(savedLinks.size);
        toast('Saved to your shortlist');
    } catch (error) {
        button.disabled = false;
        toast(error.message);
    }
}

// ---------- Events ----------

list.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    const item = card && items.find(entry => entry.id === card.dataset.id);
    if (!item) return;

    if (e.target.closest('[data-score]')) {
        scoreItems([item.id]).catch(error => toast(error.message));
    }
    const save = e.target.closest('[data-save]');
    if (save) saveItem(item, save);
});

scoreAllButton.addEventListener('click', async () => {
    const ids = items.filter(item => !isScored(item)).map(item => item.id);
    if (!ids.length) return;

    scoringAll = true;
    scoreAllButton.disabled = true;
    try {
        for (let i = 0; i < ids.length; i += SCORE_CHUNK) {
            scoreAllButton.innerHTML = `<span class="spinner"></span><span>Scoring ${i} of ${ids.length}…</span>`;
            if (!(await scoreItems(ids.slice(i, i + SCORE_CHUNK)))) return;
        }
        toast('Every loaded job is scored');
    } catch (error) {
        toast(error.message);
    } finally {
        scoringAll = false;
        scoreAllButton.disabled = false;
        renderChrome();
    }
});

tabs.addEventListener('click', e => {
    const tab = e.target.closest('[data-source]');
    if (!tab || tab.dataset.source === source || loading) return;
    source = tab.dataset.source;
    loadPage(true);
});

more.addEventListener('click', e => {
    if (e.target.closest('[data-load-more]')) loadPage();
    if (e.target.closest('[data-load-retry]')) loadPage(!items.length);
});

refreshButton.addEventListener('click', refresh);
notice.addEventListener('click', e => {
    if (e.target.closest('[data-refresh-retry]')) refresh();
});

prefsBox.addEventListener('click', e => {
    if (e.target.closest('[data-alert-edit]')) openAlertDialog();
    if (e.target.closest('[data-prefs-edit]')) {
        editingPrefs = true;
        renderPrefs();
        prefsBox.querySelector('input').focus();
    }
    if (e.target.closest('[data-prefs-cancel]')) {
        editingPrefs = false;
        renderPrefs();
    }
});

// New titles or a new city fetch openings for them straight away
prefsBox.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = e.target.elements;
    if (!fields.titles.value.trim()) {
        toast('Add at least one job title');
        return;
    }

    const submit = e.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const response = checkSession(await fetch('/api/me/preferences', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ titles: fields.titles.value, location: fields.location.value })
        }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save your preferences');

        profile = { ...profile, titles: data.targetTitles, location: data.targetLocation, fetchedAt: data.changed ? null : profile.fetchedAt };
        editingPrefs = false;
        renderPrefs();
        renderChrome();
        if (data.changed) await refresh();
    } catch (error) {
        submit.disabled = false;
        toast(error.message);
    }
});
