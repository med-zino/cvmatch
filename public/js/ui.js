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
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'
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

async function fetchSavedJobs() {
    const response = await fetch(`/api/saved-jobs/${session.userId}`, { headers: authHeaders() });
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

document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = session.email; });
document.querySelectorAll('[data-signout]').forEach(el => el.addEventListener('click', signOut));
