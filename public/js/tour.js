// A short guided tour of Find matches: the search, then the feed and daily email below it.
// Runs once per account, or again from the Tour link. Escape skips, the arrow keys move between steps.
(function () {
    const formSection = index => () => document.querySelectorAll('.search-card .form-section')[index];
    const STEPS = [
        { title: 'Welcome to CVMatch', text: 'A quick look at what it does for you. It takes about 30 seconds.' },
        { target: formSection(0), title: 'Search any role, anywhere', text: 'Pick a role and a city. We pull live openings from job boards across the web into one list.' },
        { target: formSection(1), title: 'Add your CV once', text: 'Upload or paste it for your first search. It’s saved to your account and used for every score after that.' },
        { target: () => document.getElementById('results'), title: 'Every job, scored', text: 'Each listing comes back with a match score, the skills you have, the gaps, and why. Best match first.' },
        { target: () => document.querySelector('#feed .page-head'), title: 'Your feed, right below', text: 'Fresh openings for up to 3 job titles you choose, plus every job you’ve searched, in one place. Nothing is scored until you ask.' },
        { target: () => document.getElementById('alertCard'), title: 'Your daily email', text: 'Switch it on and pick a time. Every day we find new openings, score them against your CV and email you the top 3. Never the same job twice.' },
        // Centred instead of spotlit when the feed has no jobs yet
        { target: () => document.querySelector('.feed-card'), title: 'Score on demand', text: 'Press Score on any job in your feed to see how well you fit, or Score all. Save the ones you like.' },
        { target: () => document.querySelector('.nav-tab[href="/saved-jobs"]'), title: 'Saved jobs', text: 'Track each application from Saved to Offer, and get a tailored cover letter and CV tips for any job.' },
        { title: 'You’re all set', text: 'Start with a search above, then scroll down to your feed.' }
    ];

    let root = null;
    let spot;
    let card;
    let index = 0;
    let resizeObserver;

    const setInert = on => document.querySelectorAll('.app-nav, main').forEach(el => { el.inert = on; });

    function render() {
        const step = STEPS[index];
        const last = index === STEPS.length - 1;
        card.innerHTML = `
            <span class="tour-step">${index + 1} / ${STEPS.length}</span>
            <h2 class="tour-title" id="tourTitle">${step.title}</h2>
            <p class="tour-text">${step.text}</p>
            <div class="tour-actions">
                ${last ? '' : '<button type="button" class="link-button" data-tour="skip">Skip tour</button>'}
                ${index > 0 && !last ? '<button type="button" class="btn btn-secondary btn-sm" data-tour="back">Back</button>' : ''}
                <button type="button" class="btn btn-primary btn-sm" data-tour="next">${last ? 'Start searching' : index === 0 ? 'Show me' : 'Next'}</button>
            </div>`;
        const target = step.target && step.target();
        if (target) bringIntoView(target);
        place();
        card.querySelector('[data-tour="next"]').focus();
    }

    // Centred on a large screen; on a phone, just under the navbar so the card at the bottom doesn't cover it
    function bringIntoView(target) {
        if (target.closest('.app-nav')) return;
        const navHeight = document.querySelector('.app-nav').offsetHeight;
        const rect = target.getBoundingClientRect();
        const top = window.innerWidth <= 600 || rect.height > window.innerHeight * 0.5
            ? rect.top + window.scrollY - navHeight - 20
            : rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    }

    // The spotlight hugs the target; the card sits below it, or above when there's no room
    function place() {
        if (!root) return;
        const step = STEPS[index];
        const target = step.target && step.target();
        root.classList.toggle('is-centered', !target);
        if (!target) {
            spot.style.cssText = 'top: 50%; left: 50%; width: 0; height: 0;';
            card.style.top = `${Math.max(16, (window.innerHeight - card.offsetHeight) / 2)}px`;
            card.style.left = `${Math.max(16, (window.innerWidth - card.offsetWidth) / 2)}px`;
            return;
        }
        const rect = target.getBoundingClientRect();
        const pad = 8;
        const gap = 14;
        spot.style.cssText = `top: ${rect.top - pad}px; left: ${rect.left - pad}px; width: ${rect.width + pad * 2}px; height: ${rect.height + pad * 2}px;`;
        const below = rect.bottom + pad + gap;
        card.style.top = `${below + card.offsetHeight <= window.innerHeight - 16 ? below : Math.max(16, rect.top - pad - gap - card.offsetHeight)}px`;
        card.style.left = `${Math.min(Math.max(16, rect.left), window.innerWidth - card.offsetWidth - 16)}px`;
    }

    function close() {
        root.remove();
        root = null;
        setInert(false);
        resizeObserver.disconnect();
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        document.removeEventListener('keydown', onKey);
        // Finished or skipped, it doesn't start by itself again
        fetch('/api/me/tour', { method: 'POST', headers: authHeaders() }).catch(() => {});
    }

    function go(step) {
        if (step >= STEPS.length) {
            close();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('input[name="role"]')?.focus({ preventScroll: true });
            return;
        }
        index = Math.max(0, step);
        render();
    }

    function onKey(e) {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
    }

    window.startTour = function () {
        if (root) return;
        index = 0;
        root = document.createElement('div');
        root.className = 'tour';
        root.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>';
        document.body.appendChild(root);
        spot = root.querySelector('.tour-spot');
        card = root.querySelector('.tour-card');
        setInert(true);

        card.addEventListener('click', e => {
            const action = e.target.closest('[data-tour]')?.dataset.tour;
            if (action === 'next') go(index + 1);
            if (action === 'back') go(index - 1);
            if (action === 'skip') close();
        });
        // The feed loads while the tour runs, which moves things; the spotlight follows
        resizeObserver = new ResizeObserver(() => place());
        resizeObserver.observe(document.body);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        document.addEventListener('keydown', onKey);
        render();
    };
})();
