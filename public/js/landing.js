// Landing page: motion, and the example matches that rotate across professions (all sample data)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const chipsHtml = (items, className = 'chip', offset = 0) =>
    items.map((item, i) => `<span class="${className}" style="--i: ${offset + i}">${item}</span>`).join('');

// The sticky nav only draws its bottom rule once the page has scrolled
const nav = document.querySelector('.site-nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

function countUp(el, delay = 0) {
    const target = Number(el.dataset.count);
    if (reduceMotion) {
        el.textContent = target;
        return;
    }
    el.textContent = '0';
    setTimeout(() => {
        const start = performance.now();
        const tick = now => {
            const progress = Math.min(1, (now - start) / 1100);
            el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, delay);
}

function whileVisible(el, onEnter, onLeave) {
    new IntersectionObserver(([entry]) => (entry.isIntersecting ? onEnter() : onLeave()), { threshold: 0.35 }).observe(el);
}

// ---------- Hero: one example match per profession, matching the photo order in the HTML ----------

const HERO_EXAMPLES = [
    { label: 'Full-stack developer · Paris', cv: 'alex-martin-cv.pdf', skillsFound: 18, title: 'Full-Stack Developer', company: 'Northwind Labs', city: 'Paris', score: 92,
      have: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'], gaps: ['GraphQL'], status: ['interview', 'Interview'], source: 'Welcome to the Jungle' },
    { label: 'Marketing manager · Paris', cv: 'camille-roux-cv.pdf', skillsFound: 21, title: 'Marketing Manager', company: 'Maison Verte', city: 'Paris', score: 88,
      have: ['SEO', 'Content strategy', 'Google Analytics', 'Brand campaigns'], gaps: ['Salesforce'], status: ['applied', 'Applied'], source: 'LinkedIn' },
    { label: 'Registered nurse · London', cv: 'amara-okafor-cv.pdf', skillsFound: 16, title: 'Registered Nurse', company: 'Riverside Clinic', city: 'London', score: 91,
      have: ['Patient care', 'Triage', 'Medication', 'Wound care'], gaps: ['ICU experience'], status: ['interview', 'Interview'], source: 'Indeed' },
    { label: 'UX designer · Berlin', cv: 'jonas-weber-cv.pdf', skillsFound: 19, title: 'UX Designer', company: 'Atelier Nine', city: 'Berlin', score: 84,
      have: ['Figma', 'User research', 'Prototyping', 'Design systems'], gaps: ['German (B2)'], status: ['offer', 'Offer'], source: 'Jooble' }
];

const heroVisual = document.querySelector('.hero-visual');
const heroPhotos = [...heroVisual.querySelectorAll('.hero-photo img')];
const heroDots = heroVisual.querySelector('.hero-dots');
const heroField = name => heroVisual.querySelector(`[data-field="${name}"]`);
let heroIndex = 0;

function renderHeroDots() {
    heroDots.innerHTML = HERO_EXAMPLES.map((example, i) =>
        `<button type="button" class="${i === heroIndex ? 'is-active' : ''}" aria-pressed="${i === heroIndex}" aria-label="Show the ${example.title} example"></button>`
    ).join('');
}

function showHeroExample(index) {
    heroIndex = index;
    renderHeroDots();
    heroVisual.classList.add('is-swapping');

    setTimeout(() => {
        const example = HERO_EXAMPLES[index];
        heroPhotos.forEach((img, i) => img.classList.toggle('is-active', i === index));
        heroField('cv').textContent = example.cv;
        heroField('skillsFound').textContent = `${example.skillsFound} skills found`;
        heroField('title').textContent = example.title;
        heroField('place').textContent = `${example.company} · ${example.city}`;
        heroField('have').innerHTML = chipsHtml(example.have);
        heroField('gaps').innerHTML = chipsHtml(example.gaps, 'chip chip-gap', example.have.length);
        heroField('company').textContent = example.company;
        heroField('source').textContent = `via ${example.source}`;
        heroField('label').textContent = example.label;

        const status = heroField('status');
        status.dataset.status = example.status[0];
        status.textContent = example.status[1];

        // Drop the load-time bar animation so the width transition can replay
        const bar = heroField('bar');
        bar.style.animation = 'none';
        bar.style.width = '0';
        void bar.offsetWidth;
        bar.style.width = `${example.score}%`;

        const score = heroField('score');
        score.dataset.count = example.score;
        countUp(score);

        heroVisual.classList.add('is-cycled');
        heroVisual.classList.remove('is-swapping');
    }, 350);
}

renderHeroDots();
document.querySelectorAll('.hero [data-count]').forEach(el => countUp(el, 1100));

heroDots.addEventListener('click', e => {
    const index = [...heroDots.children].indexOf(e.target.closest('button'));
    if (index >= 0 && index !== heroIndex) showHeroExample(index);
});
// Advance when the active dot finishes filling; hovering pauses the fill, so it pauses the rotation too
heroDots.addEventListener('animationend', e => {
    if (!reduceMotion && e.target.classList.contains('is-active')) {
        showHeroExample((heroIndex + 1) % HERO_EXAMPLES.length);
    }
});
heroVisual.addEventListener('mouseenter', () => heroVisual.classList.add('is-paused'));
heroVisual.addEventListener('mouseleave', () => heroVisual.classList.remove('is-paused'));

// ---------- Scroll reveals ----------

const revealer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        entry.target.querySelectorAll('[data-count]').forEach(el => countUp(el, 400));
        if (entry.target.querySelector('[data-search-demo]')) runSearchDemo();
        revealer.unobserve(entry.target);
    });
}, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => revealer.observe(el));

// ---------- Example strip: duplicate the cards once so the loop is seamless ----------

const marquee = document.querySelector('.marquee');
if (marquee && !reduceMotion) {
    const track = marquee.querySelector('.marquee-track');
    [...track.children].forEach(card => {
        const copy = card.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        track.appendChild(copy);
    });
    marquee.classList.add('is-looping');
}

// ---------- How it works: the search field types a different role each time ----------

const SEARCHES = [
    ['Full-stack developer', 'Paris'],
    ['Registered nurse', 'London'],
    ['Marketing manager', 'Lyon'],
    ['UX designer', 'Berlin'],
    ['Sous chef', 'Lisbon'],
    ['Data analyst', 'Amsterdam']
];

async function runSearchDemo() {
    if (reduceMotion) return;
    const role = document.querySelector('[data-search-role]');
    const city = document.querySelector('[data-search-city]');
    let index = 0;

    while (true) {
        await sleep(2400);
        while (role.textContent.length) {
            role.textContent = role.textContent.slice(0, -1);
            await sleep(26);
        }
        index = (index + 1) % SEARCHES.length;
        city.textContent = SEARCHES[index][1];
        for (const char of SEARCHES[index][0]) {
            role.textContent += char;
            await sleep(55);
        }
    }
}

// ---------- Explained match: switch profession, and light up each part in turn ----------

const EXPLAIN_EXAMPLES = {
    nurse: {
        title: 'Registered Nurse', place: 'Riverside Clinic · London', score: 91,
        have: ['Patient care', 'Triage', 'Medication administration', 'NMC registration'], gaps: ['ICU experience'],
        why: "Eight years on acute wards covers their daily caseload. ICU rotations are listed as a plus you don't have yet."
    },
    marketing: {
        title: 'Marketing Manager', place: 'Maison Verte · Paris', score: 88,
        have: ['SEO', 'Content strategy', 'Google Analytics', 'Brand campaigns'], gaps: ['Salesforce', 'B2B lead generation'],
        why: 'Six years of consumer brand campaigns matches their growth brief. They want more B2B pipeline work than your CV shows.'
    },
    frontend: {
        title: 'Frontend Engineer', place: 'Atelier Nine · Paris', score: 78,
        have: ['React', 'TypeScript', 'CSS', 'Tailwind'], gaps: ['Next.js', 'Storybook', 'Accessibility audits'],
        why: 'Strong React and TypeScript base for a UI-heavy role. They want more design-system depth than your CV shows.'
    }
};

const explainList = document.querySelector('.explain-list');
const demoStack = document.querySelector('.demo-stack');
const roleSwitch = demoStack.querySelector('.role-switch');
const roleButtons = [...roleSwitch.querySelectorAll('[data-role]')];
const explainRows = [...document.querySelectorAll('[data-part-row]')];
const demoField = name => demoStack.querySelector(`[data-demo="${name}"]`);
let litIndex = 0;
let explainTimer = null;
let hovering = false;
let autoRole = true;

function showRole(role) {
    roleButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.role === role)));
    const example = EXPLAIN_EXAMPLES[role];
    demoStack.classList.add('is-swapping');
    setTimeout(() => {
        demoField('title').textContent = example.title;
        demoField('place').textContent = example.place;
        demoField('have').innerHTML = chipsHtml(example.have);
        demoField('gaps').innerHTML = chipsHtml(example.gaps, 'chip chip-gap');
        demoField('why').textContent = example.why;
        const score = demoField('score');
        score.dataset.count = example.score;
        countUp(score);
        demoStack.classList.remove('is-swapping');
    }, 300);
}

roleSwitch.addEventListener('click', e => {
    const button = e.target.closest('[data-role]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    autoRole = false; // a picked role stays put
    showRole(button.dataset.role);
});

function lightPart(part) {
    explainList.classList.add('is-focusing');
    demoStack.classList.add('is-focusing');
    explainRows.forEach(row => row.classList.toggle('is-lit', row.dataset.partRow === part));
    demoStack.querySelectorAll('[data-part]').forEach(block => block.classList.toggle('is-lit', block.dataset.part === part));
}

// Walks through the four parts; after a full pass it moves to the next profession
function nextPart() {
    if (hovering) return;
    if (litIndex === 0 && autoRole && explainTimer) {
        const current = roleButtons.findIndex(button => button.getAttribute('aria-pressed') === 'true');
        showRole(roleButtons[(current + 1) % roleButtons.length].dataset.role);
    }
    lightPart(explainRows[litIndex].dataset.partRow);
    litIndex = (litIndex + 1) % explainRows.length;
}

explainRows.forEach((row, index) => {
    row.addEventListener('mouseenter', () => {
        hovering = true;
        litIndex = index;
        lightPart(row.dataset.partRow);
    });
    row.addEventListener('mouseleave', () => { hovering = false; });
});

if (!reduceMotion) {
    whileVisible(demoStack, () => {
        if (explainTimer) return;
        lightPart(explainRows[0].dataset.partRow);
        litIndex = 1;
        explainTimer = setInterval(nextPart, 2200);
    }, () => {
        clearInterval(explainTimer);
        explainTimer = null;
    });
}

// ---------- Tracker: one job keeps moving through the pipeline ----------

const demoPill = document.querySelector('[data-status-demo]');
const PIPELINE = [['saved', 'Saved'], ['applied', 'Applied'], ['interview', 'Interview'], ['offer', 'Offer']];
let pipelineStep = 0;
let trackerTimer = null;

function advancePipeline() {
    pipelineStep = (pipelineStep + 1) % PIPELINE.length;
    const [status, label] = PIPELINE[pipelineStep];
    demoPill.dataset.status = status;
    demoPill.textContent = label;
    demoPill.classList.remove('is-bump');
    void demoPill.offsetWidth; // restart the bump animation
    demoPill.classList.add('is-bump');
}

if (demoPill && !reduceMotion) {
    whileVisible(demoPill, () => {
        trackerTimer = trackerTimer || setInterval(advancePipeline, 1800);
    }, () => {
        clearInterval(trackerTimer);
        trackerTimer = null;
    });
}
