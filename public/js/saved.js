// Saved jobs page: status tabs, search and sort, inline status changes, notes, removal,
// and AI help with each application (a cover letter and CV tips)
const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
const STATUS_LABELS = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
const SORTERS = {
    newest: (a, b) => new Date(b.savedAt) - new Date(a.savedAt),
    // Jobs saved from the feed before scoring have no score and go last
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
    company: (a, b) => a.company.localeCompare(b.company)
};
const LANGUAGES = [['auto', 'Listing’s language'], ['en', 'English'], ['fr', 'Français']];

const list = document.getElementById('savedList');
const tabs = document.getElementById('statusTabs');
const searchInput = document.getElementById('searchJobs');
const sortSelect = document.getElementById('sortBy');

let jobs = [];
let activeStatus = 'all';
let openNoteId = null;
let openAssistId = null;
// Per job: which AI tab is showing, its language, and whether it's being written
const assistState = new Map();
let firstRender = true;

const shortDate = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

loadJobs();

async function loadJobs() {
    try {
        jobs = await fetchSavedJobs();
        render();
    } catch (error) {
        list.innerHTML = `
            <div class="alert" role="alert">
                ${icon('alert', 22)}
                <div class="alert-body">
                    <h2 class="alert-title">Your saved jobs didn't load</h2>
                    <p class="alert-text">Refresh the page to try again.</p>
                </div>
            </div>`;
    }
}

function render() {
    setSavedCount(jobs.length);
    document.getElementById('savedSubtitle').textContent = jobs.length
        ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} on your shortlist. Move each one along as you hear back.`
        : 'Jobs you save from your matches land here.';
    document.getElementById('savedTools').hidden = !jobs.length;
    renderTabs();
    renderList();
}

function renderTabs() {
    const count = status => status === 'all' ? jobs.length : jobs.filter(job => job.status === status).length;
    tabs.innerHTML = ['all', ...STATUSES].map(status => `
        <button type="button" role="tab" class="status-tab" data-tab="${status}" aria-selected="${status === activeStatus}">
            <span>${status === 'all' ? 'All' : STATUS_LABELS[status]}</span><span class="mono">${count(status)}</span>
        </button>`).join('');
}

function renderList() {
    if (!jobs.length) {
        list.innerHTML = `
            <div class="empty">
                ${icon('bookmark', 28)}
                <h2 class="empty-title">Nothing saved yet</h2>
                <p class="empty-text">Save jobs from your match results, then track each one from Saved to Offer.</p>
                <a class="btn btn-primary" href="/app">Find matches</a>
            </div>`;
        return;
    }

    const term = searchInput.value.trim().toLowerCase();
    const visible = jobs
        .filter(job => activeStatus === 'all' || job.status === activeStatus)
        .filter(job => !term || job.title.toLowerCase().includes(term) || job.company.toLowerCase().includes(term))
        .sort(SORTERS[sortSelect.value]);

    list.innerHTML = visible.length
        ? `<div class="card table-card">
                <div class="row row-head">
                    <span class="label">Role</span><span class="label">Match</span><span class="label">Status</span>
                    <span class="label cell-saved">Saved</span><span class="label">Actions</span>
                </div>
                ${visible.map((job, index) => jobRow(job, index)).join('')}
            </div>`
        : '<div class="empty empty--compact"><p class="empty-text">No saved jobs match this filter.</p></div>';

    // Rows fade in on the first load only, not on every status change
    list.classList.toggle('is-entering', firstRender);
    firstRender = false;

    const editor = list.querySelector('.note-editor textarea');
    if (editor) editor.focus();
}

function jobRow(job, index) {
    const scored = typeof job.score === 'number';
    const tier = scored ? scoreTier(job.score)[0] : 'partial';
    const noteOpen = openNoteId === job._id;
    const assistOpen = openAssistId === job._id;
    const title = escapeHtml(job.title);

    return `
        <div class="job-row" data-id="${job._id}" style="--i: ${index}">
            <div class="row">
                <div class="row-main"><span class="row-title">${title}</span><span class="row-sub">${escapeHtml(job.company)}</span></div>
                <div class="mini-score score--${tier}">${scored
                    ? `<span class="mono">${job.score}</span><span class="score-bar"><span style="width: ${job.score}%"></span></span>`
                    : '<span class="mono muted">—</span><span class="row-sub">Not scored</span>'}</div>
                <div>
                    <select class="status-select" data-action="status" data-status="${job.status}" aria-label="Status for ${title}">
                        ${STATUSES.map(status => `<option value="${status}"${status === job.status ? ' selected' : ''}>${STATUS_LABELS[status]}</option>`).join('')}
                    </select>
                </div>
                <span class="mono muted cell-saved">${shortDate(job.savedAt)}</span>
                <div class="row-actions">
                    <a class="icon-btn" href="${escapeHtml(safeUrl(job.link))}" target="_blank" rel="noopener" title="Open listing" aria-label="Open listing for ${title}">${icon('arrowUpRight', 15)}</a>
                    <button type="button" class="icon-btn${assistOpen ? ' is-active' : ''}" data-action="assist" title="Cover letter and CV tips" aria-label="Cover letter and CV tips for ${title}" aria-expanded="${assistOpen}">${icon('sparkle', 15)}</button>
                    <button type="button" class="icon-btn${noteOpen ? ' is-active' : ''}" data-action="note" title="Notes" aria-label="Notes for ${title}" aria-expanded="${noteOpen}">${icon('note', 15)}</button>
                    <button type="button" class="icon-btn" data-action="delete" title="Remove" aria-label="Remove ${title}">${icon('trash', 15)}</button>
                </div>
            </div>
            ${noteOpen ? `
                <div class="note note-editor">
                    <textarea class="textarea" placeholder="Interview dates, who you spoke to, next steps…">${escapeHtml(job.notes || '')}</textarea>
                    <div class="note-actions">
                        <button type="button" class="btn btn-secondary" data-action="note-cancel">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="note-save">Save note</button>
                    </div>
                </div>` : job.notes ? `
                <div class="note"><span class="label">Note</span><span>${escapeHtml(job.notes)}</span></div>` : ''}
            ${assistOpen ? assistPanel(job) : ''}
        </div>`;
}

// ---------- Cover letter and CV tips ----------

function assistFor(id) {
    if (!assistState.has(id)) assistState.set(id, { tab: 'letter', language: 'auto', loading: false, error: '' });
    return assistState.get(id);
}

function assistPanel(job) {
    const state = assistFor(job._id);
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
        <div class="assist">
            <div class="assist-head">
                <div class="segmented assist-tabs" role="tablist" aria-label="Help with this application">
                    <button type="button" role="tab" data-action="assist-tab" data-tab="letter" aria-selected="${state.tab === 'letter'}">Cover letter</button>
                    <button type="button" role="tab" data-action="assist-tab" data-tab="tips" aria-selected="${state.tab === 'tips'}">CV tips</button>
                </div>
                <div class="assist-controls">
                    <select class="select select-sm" data-action="assist-language" aria-label="Language">
                        ${LANGUAGES.map(([value, label]) => `<option value="${value}"${value === state.language ? ' selected' : ''}>${label}</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" data-action="assist-generate"${state.loading ? ' disabled' : ''}>
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
            <span class="mono muted">Written ${shortDate(letter.createdAt)} · edit it here, then copy</span>
            <button type="button" class="btn btn-secondary btn-sm" data-action="assist-copy">${icon('copy', 15)}<span>Copy</span></button>
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
            <span class="mono muted assist-date">Written ${shortDate(tips.createdAt)}</span>
        </div>`;
}

async function generateAssist(id) {
    const state = assistFor(id);
    state.loading = true;
    state.error = '';
    renderList();
    try {
        const response = checkSession(await fetch(`/api/saved-jobs/${id}/assist`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ kind: state.tab, language: state.language })
        }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not write this right now');

        Object.assign(jobs.find(job => job._id === id), { coverLetter: data.savedJob.coverLetter, cvTips: data.savedJob.cvTips });
        if (!data.fromListing) toast('The full listing wasn’t available, so this uses the job title and skills');
    } catch (error) {
        state.error = error.message;
    } finally {
        state.loading = false;
        renderList();
    }
}

// ---------- Events ----------

tabs.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    activeStatus = tab.dataset.tab;
    renderTabs();
    renderList();
});
searchInput.addEventListener('input', renderList);
sortSelect.addEventListener('change', renderList);

list.addEventListener('change', async e => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (e.target.dataset.action === 'assist-language') {
        assistFor(id).language = e.target.value;
        return;
    }
    if (e.target.dataset.action !== 'status') return;
    const status = e.target.value;
    if (await updateJob(id, { status })) {
        render();
        toast(`Moved to ${STATUS_LABELS[status]}`);
    }
});

list.addEventListener('click', async e => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const id = button.closest('[data-id]').dataset.id;

    switch (button.dataset.action) {
        case 'note':
            openNoteId = openNoteId === id ? null : id;
            renderList();
            break;
        case 'note-cancel':
            openNoteId = null;
            renderList();
            break;
        case 'note-save': {
            const notes = button.closest('.note-editor').querySelector('textarea').value.trim();
            if (await updateJob(id, { notes })) {
                openNoteId = null;
                renderList();
                toast('Note saved');
            }
            break;
        }
        case 'delete':
            removeJob(id);
            break;
        case 'assist':
            openAssistId = openAssistId === id ? null : id;
            renderList();
            break;
        case 'assist-tab':
            assistFor(id).tab = button.dataset.tab;
            renderList();
            break;
        case 'assist-generate':
            generateAssist(id);
            break;
        case 'assist-copy': {
            // Copies the letter as edited in the box
            const text = button.closest('.assist').querySelector('.assist-text').value;
            navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Could not copy; select the text instead'));
            break;
        }
    }
});

// Persists a status or note change; on failure the list is re-rendered from the last known state
async function updateJob(id, changes) {
    try {
        const response = checkSession(await fetch(`/api/saved-jobs/${id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(changes)
        }));
        if (!response.ok) throw new Error();
    } catch (error) {
        toast('Could not update this job');
        render();
        return false;
    }

    Object.assign(jobs.find(job => job._id === id), changes);
    return true;
}

async function removeJob(id) {
    const job = jobs.find(j => j._id === id);
    if (!confirm(`Remove "${job.title}" from your saved jobs?`)) return;

    const response = checkSession(await fetch(`/api/saved-jobs/${id}`, { method: 'DELETE', headers: authHeaders() }));
    if (!response.ok) {
        toast('Could not remove this job');
        return;
    }

    jobs = jobs.filter(j => j._id !== id);
    render();
    toast('Removed from your saved jobs');
}
