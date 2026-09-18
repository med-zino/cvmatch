// The feed, below the search on Find matches: openings for the user's target titles plus every job
// from their searches, and the daily email. Jobs are scored only when asked, against the saved CV.
// Wrapped in a function so its names don't clash with app.js, which shares the page.
(() => {
    const list = document.getElementById('feedList');
    const more = document.getElementById('feedMore');
    const notice = document.getElementById('feedNotice');
    const prefsBox = document.getElementById('prefs');
    const alertBox = document.getElementById('alertCard');
    const tools = document.getElementById('feedTools');
    const tabs = document.getElementById('sourceTabs');
    const scoreAllButton = document.getElementById('scoreAll');
    const refreshButton = document.getElementById('refreshFeed');

    const SOURCE_LABELS = { all: 'All', feed: 'For you', search: 'From your searches' };
    // Jobs per request when scoring everything loaded
    const SCORE_CHUNK = 20;
    const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    // The daily email can go out on any quarter hour
    const SLOTS = Array.from({ length: 96 }, (_, i) => [Math.floor(i / 4), (i % 4) * 15]);

    let items = [];
    let source = 'all';
    let cursor = null;
    let loading = false;
    let reloadQueued = false;
    let loadError = '';
    let building = false;
    let scoringAll = false;
    let editingPrefs = false;
    // The card whose AI panel is open
    let openAssistId = null;
    // The daily email card's status line, when it has something to report
    let alertMessage = '';
    let profile = { titles: [], location: '', fetchedAt: null, hasCv: false, alert: { enabled: false, hour: 8, minute: 0 } };
    let counts = { all: 0, feed: 0, search: 0 };
    let savedLinks = new Set();
    // A job linked from the daily email (/app?job=…), brought into view once the feed loads
    const spotlightId = new URLSearchParams(window.location.search).get('job');

    const isScored = item => typeof item.score === 'number';
    const formatTime = (hour, minute = 0) => new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
        // Links to /app#feed (the old /feed page, the daily email) arrive before the feed has its
        // height, so the browser can't scroll all the way; finish the job once it's loaded
        if (spotlightId) await showSpotlight(spotlightId);
        else if (window.location.hash === '#feed') document.getElementById('feed').scrollIntoView({ block: 'start' });
        // First visit with titles from sign-up: fetch their openings now
        // Not when they came for one job from the daily email: the rebuild would reload the list
        // under them and lose the job they opened. It happens on their next ordinary visit instead.
        if (!spotlightId && profile.titles.length && !profile.fetchedAt) await refresh();
    }

    // The job the daily email linked to: highlighted where it is, or fetched and put first when it
    // is further down than the first page
    async function showSpotlight(id) {
        let card = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!card) {
            try {
                const response = checkSession(await fetch(`/api/feed/item/${encodeURIComponent(id)}`, { headers: authHeaders() }));
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'That job is no longer in your feed');
                items.unshift(data.item);
                list.insertAdjacentHTML('afterbegin', feedCard(data.item));
                card = list.firstElementChild;
            } catch (error) {
                toast(error.message);
                return;
            }
        }
        // The link has done its job; a reload should not jump back here
        history.replaceState(null, '', `${location.pathname}#feed`);
        card.classList.add('is-spotlight');
        card.scrollIntoView({ block: 'center' });
    }

    // ---------- Loading ----------

    async function loadPage(reset = false) {
        if (loading) {
            // A reload asked for mid-load runs once this one finishes
            if (reset) reloadQueued = true;
            return;
        }
        if (!reset && !cursor) return;
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
            // A job already shown (the one the daily email linked to) is not drawn a second time
            const fresh = data.items.filter(item => !items.some(shown => shown.id === item.id));
            items.push(...fresh);
            list.insertAdjacentHTML('beforeend', fresh.map(feedCard).join(''));
            renderChrome();
            if (reset) renderAlert();
        } catch (error) {
            loadError = error.message;
        } finally {
            loading = false;
            renderMore();
        }
        if (reloadQueued) {
            reloadQueued = false;
            return loadPage(true);
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
                </div>`;
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
                ? 'No openings came back for these titles. Try broader titles or another city, or run a search above.'
                : 'Run a search above and every job it finds lands here too.';
            more.innerHTML = `
                <div class="empty">
                    ${icon('feed', 28)}
                    <h2 class="empty-title">Your feed is empty</h2>
                    <p class="empty-text">${text}</p>
                    <button type="button" class="btn btn-secondary" data-go-search>Search above</button>
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
                    <div class="match-actions">
                        ${assistToggle(openAssistId === item.id)}
                        ${item.link ? `
                            ${saveButton(savedLinks.has(item.link))}
                            <a class="btn btn-primary" href="${escapeHtml(safeUrl(item.link))}" target="_blank" rel="noopener">Apply ${icon('arrowUpRight')}</a>` : ''}
                    </div>
                </div>
                ${openAssistId === item.id ? assistPanel(item.id, item) : ''}
            </li>`;
    }

    // Redraws one card in place, without the entrance animation
    function redrawCard(id) {
        const item = items.find(entry => entry.id === id);
        const card = list.querySelector(`[data-id="${id}"]`);
        if (!item || !card) return;
        const template = document.createElement('template');
        template.innerHTML = feedCard(item).trim();
        const fresh = template.content.firstElementChild;
        fresh.style.animation = 'none';
        card.replaceWith(fresh);
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
                    <p class="alert-text">Run one search above. Your CV is saved to your account and used for every score here.</p>
                </div>
                <button type="button" class="btn btn-secondary" data-go-search>Search above</button>
            </div>`;
        notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function goToSearch() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('input[name="role"]').focus({ preventScroll: true });
    }

    // ---------- Daily email ----------

    // The feature's own card: what it does, the switch, the time and a test send, saved as they change
    function renderAlert() {
        const { enabled, hour, minute = 0 } = profile.alert;
        const hasTitles = Boolean(profile.titles.length);
        const ready = hasTitles && profile.hasCv;
        const place = profile.location ? ` in ${escapeHtml(profile.location)}` : '';
        const what = hasTitles
            ? `new openings for <strong>${escapeHtml(profile.titles.join(', '))}</strong>${place}`
            : 'new openings for the job titles you choose';
        const missing = [!hasTitles && 'the job titles to look for', !profile.hasCv && 'your CV'].filter(Boolean);
        const status = alertMessage || (enabled
            ? `On: your next email goes out at ${formatTime(hour, minute)}.`
            : ready
                ? `Off. Switch it on and the first email goes out at ${formatTime(hour, minute)}.`
                : `The switch turns on once we have ${missing.join(' and ')}.`);

        // Both are needed before the switch can do anything: titles to search for, a CV to score against
        const step = (done, number, text, target, action) => `
                    <li class="alert-step${done ? ' is-done' : ''}">
                        <span class="alert-step-mark" aria-hidden="true">${done ? '&#10003;' : number}</span>
                        <span class="alert-step-text">${text}</span>
                        ${done
                            ? '<span class="alert-step-state">Done</span>'
                            : `<button type="button" class="alert-step-go" data-alert-goto="${target}">${action}</button>`}
                    </li>`;
        const setup = ready ? '' : `
                <div class="alert-setup" id="alertSetup">
                    <p class="alert-setup-title">Two things first, then the switch turns on</p>
                    <ol class="alert-steps">
                        ${step(hasTitles, 1, 'The job titles to look for', 'titles', 'Add titles')}
                        ${step(profile.hasCv, 2, 'Your CV, to score the openings against', 'cv', 'Add my CV')}
                    </ol>
                </div>`;

        alertBox.innerHTML = `
            <div class="alert-card${enabled ? ' is-on' : ''}">
                <div class="alert-card-head">
                    <span class="alert-card-icon">${icon('bell', 20)}</span>
                    <div class="alert-card-heading">
                        <span class="label">Daily email &middot; ${enabled ? 'On' : 'Off'}</span>
                        <h3 class="alert-card-title">Your top 3 matches, in your inbox every day</h3>
                    </div>
                    <label class="switch switch--inverse" title="${ready || enabled
                        ? `${enabled ? 'Turn off' : 'Turn on'} the daily email`
                        : `Add ${missing.join(' and ')} first`}">
                        <input type="checkbox" data-alert-toggle aria-label="Daily email"${enabled ? ' checked' : ''}${!ready && !enabled ? ' disabled aria-describedby="alertSetup"' : ''}>
                    </label>
                </div>
                <p class="alert-card-text">At the time you pick, we search ${what}, score them against your CV and email you the best three, with the reasons. A job is never sent twice, and every email has a one-click unsubscribe.</p>
                ${setup}
                <div class="alert-card-controls">
                    <label class="alert-time">
                        <span>Every day at</span>
                        <select class="select select-sm" data-alert-time aria-label="Time of the daily email">
                            ${SLOTS.map(([h, m]) => `<option value="${h}:${m}"${h === hour && m === minute ? ' selected' : ''}>${formatTime(h, m)}</option>`).join('')}
                        </select>
                    </label>
                    <span class="mono alert-zone">${escapeHtml(TIME_ZONE)}</span>
                    <button type="button" class="btn btn-inverse btn-sm" data-alert-test${ready ? '' : ' disabled'}>Send me one now</button>
                </div>
                <p class="alert-card-status" role="status">${escapeHtml(status)}</p>
            </div>`;
    }

    // The card sends people straight to whichever piece is still missing
    function goToTitles() {
        prefsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        prefsBox.querySelector('input[name="titles"]')?.focus({ preventScroll: true });
    }

    function goToCv() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('[data-cv-tab="pdf"]')?.focus({ preventScroll: true });
    }

    async function saveAlert(changes) {
        const next = { ...profile.alert, ...changes };
        const response = checkSession(await fetch('/api/me/alert', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ enabled: next.enabled, hour: next.hour, minute: next.minute, timeZone: TIME_ZONE })
        }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save your daily email');
        profile.alert = data.alert;
    }

    alertBox.addEventListener('change', async e => {
        const toggle = e.target.closest('[data-alert-toggle]');
        const time = e.target.closest('[data-alert-time]');
        if (!toggle && !time) return;

        const [hour, minute] = time ? time.value.split(':').map(Number) : [];
        alertMessage = '';
        try {
            await saveAlert(toggle ? { enabled: toggle.checked } : { hour, minute });
            const at = formatTime(profile.alert.hour, profile.alert.minute);
            toast(toggle ? (profile.alert.enabled ? `Daily email on, at ${at}` : 'Daily email off') : `Daily email time: ${at}`);
        } catch (error) {
            alertMessage = error.message;
        }
        renderAlert();
    });

    // Runs today's email straight away, whatever the schedule
    alertBox.addEventListener('click', async e => {
        const goto = e.target.closest('[data-alert-goto]');
        if (goto) {
            if (goto.dataset.alertGoto === 'titles') goToTitles();
            else goToCv();
            return;
        }
        const button = e.target.closest('[data-alert-test]');
        if (!button) return;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
        try {
            const response = checkSession(await fetch('/api/me/alert/test', { method: 'POST', headers: authHeaders() }));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not send the email');
            alertMessage = data.sent
                ? `Sent to ${data.email}. It can take a minute, and the first one may land in spam.`
                : data.message;
        } catch (error) {
            alertMessage = error.message;
        }
        renderAlert();
    });

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

        if (e.target.closest('[data-assist-toggle]')) {
            const previous = openAssistId;
            openAssistId = previous === item.id ? null : item.id;
            if (previous && previous !== item.id) redrawCard(previous);
            redrawCard(item.id);
        }
    });

    // AI help on a feed job, stored with it (and copied along if it's saved)
    wireAssist(list, {
        job: id => items.find(entry => entry.id === id),
        request: id => ({ url: '/api/feed/assist', body: { id } }),
        render: redrawCard
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
        if (e.target.closest('[data-go-search]')) goToSearch();
    });

    refreshButton.addEventListener('click', refresh);
    notice.addEventListener('click', e => {
        if (e.target.closest('[data-refresh-retry]')) refresh();
        if (e.target.closest('[data-go-search]')) goToSearch();
    });

    prefsBox.addEventListener('click', e => {
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
            applyPreferences(data);
            if (data.changed) await refresh();
        } catch (error) {
            submit.disabled = false;
            toast(error.message);
        }
    });

    function applyPreferences(data) {
        profile = { ...profile, titles: data.targetTitles, location: data.targetLocation, fetchedAt: data.changed ? null : profile.fetchedAt };
        editingPrefs = false;
        renderPrefs();
        renderChrome();
        renderAlert();
    }

    // The search above stores its jobs in the feed and saves the CV the scores need
    document.addEventListener('search:complete', () => loadPage(true));

    // A job saved from the search results shows as saved here too
    document.addEventListener('job:saved', e => {
        savedLinks.add(e.detail.link);
        items.filter(item => item.link === e.detail.link).forEach(item => {
            const button = list.querySelector(`[data-id="${item.id}"] [data-save]`);
            if (button) button.outerHTML = saveButton(true);
        });
    });

    // Titles from the prompt after a Google sign-up: fetch their openings here
    document.addEventListener('feed:preferences-saved', e => {
        applyPreferences({ ...e.detail, changed: true });
        document.getElementById('feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
        refresh();
    });
})();
