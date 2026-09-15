// A short guided tour of the main features on Find matches: once per account, or again from the Tour link.
// Each step spotlights part of the page; Escape skips, the arrow keys move between steps.
(function () {
    const formSection = index => () => document.querySelectorAll('.search-card .form-section')[index];
    const STEPS = [
        { title: 'Welcome to CVMatch', text: 'A 30-second look at what it does for you.' },
        { target: formSection(0), title: 'Search any role, anywhere', text: 'Pick a role and a city. We pull live openings from job boards across the web into one list.' },
        { target: formSection(1), title: 'Add your CV once', text: 'Upload or paste it for your first search. It’s saved to your account and used for every score after that.' },
        { target: () => document.getElementById('results'), title: 'Every job, scored', text: 'Each listing comes back with a match score, the skills you have, the gaps, and why. Best match first.' },
        { target: () => document.querySelector('.nav-tab[href="/feed"]'), title: 'Your feed', text: 'Fresh openings for the job titles you pick, plus every job you’ve searched. Score any of them when you like, and get your top 3 by email every day.' },
        { target: () => document.querySelector('.nav-tab[href="/saved-jobs"]'), title: 'Saved jobs', text: 'Track each application from Saved to Offer, and get a tailored cover letter and CV tips for any job.' },
        { title: 'You’re all set', text: 'Start with a search: a role, a city and your CV.' }
    ];

    let root = null;
    let spot;
    let card;
    let index = 0;

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
        if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
        place();
        card.querySelector('[data-tour="next"]').focus();
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
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        document.removeEventListener('keydown', onKey);
        // Finished or skipped, it doesn't start by itself again
        fetch('/api/me/tour', { method: 'POST', headers: authHeaders() }).catch(() => {});
    }

    function go(step) {
        if (step >= STEPS.length) {
            close();
            document.querySelector('input[name="role"]')?.focus();
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
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        document.addEventListener('keydown', onKey);
        render();
    };
})();
