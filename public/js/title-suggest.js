// Job title suggestions in English and French from the static list in job-titles.js, loaded on first use.
// attachTitleSuggestions(input, { multiple }) turns a text input into a combobox; with `multiple`,
// suggestions apply to the comma-separated title being typed. Used before sign-in too, so no ui.js here.
(function () {
    const MAX_ROWS = 8;
    let titles = null;
    let loading = null;
    let lists = 0;

    const normalize = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // The list uses the form job ads use; feminine French forms map onto it: infirmière → infirmier, vendeuse → vendeur
    const stem = word => word
        .replace(/euse$/, 'eur')
        .replace(/rice$/, 'eur')
        .replace(/iere$/, 'ier')
        .replace(/ienne$/, 'ien')
        .replace(/ive$/, 'if')
        .replace(/ere$/, 'er');
    const words = text => normalize(text).split(/[^a-z0-9+#.&]+/).filter(Boolean).map(stem);
    const escape = text => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    function loadTitles() {
        if (!loading) {
            loading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/js/job-titles.js';
                script.onload = () => {
                    titles = window.JOB_TITLES.map(([en, fr]) => ({ en, fr, words: [words(en), words(fr)] }));
                    resolve();
                };
                script.onerror = () => {
                    loading = null;
                    reject(new Error('Could not load job titles'));
                };
                document.head.appendChild(script);
            });
        }
        return loading;
    }

    // Every typed word must start a word of the title (or, from 4 letters, contain one: "nurses" finds "nurse").
    // Ties keep the list's order, which puts general titles before specialised ones.
    // Each match brings its translation right after it, so both languages are offered.
    function suggest(query) {
        const typed = words(query);
        if (!typed.length) return [];
        const whole = normalize(query.trim());

        const matches = [];
        titles.forEach((title, index) => {
            title.words.forEach((titleWords, lang) => {
                const hit = typed.every(part => titleWords.some(word => word.startsWith(part) || (part.length >= 4 && part.startsWith(word))));
                if (!hit) return;
                const text = normalize(lang ? title.fr : title.en);
                const tier = text === whole ? 0 : text.startsWith(whole) ? 1 : titleWords[0].startsWith(typed[0]) ? 2 : 3;
                matches.push({ title, lang, rank: tier * 10000 + index });
            });
        });
        matches.sort((a, b) => a.rank - b.rank);

        const rows = [];
        const seen = new Set();
        const add = (text, tag) => {
            if (rows.length < MAX_ROWS && !seen.has(text.toLowerCase())) {
                seen.add(text.toLowerCase());
                rows.push({ text, tag });
            }
        };
        for (const { title, lang } of matches) {
            if (rows.length >= MAX_ROWS) break;
            if (title.en === title.fr) {
                add(title.en, 'EN · FR');
            } else {
                add(lang ? title.fr : title.en, lang ? 'FR' : 'EN');
                add(lang ? title.en : title.fr, lang ? 'EN' : 'FR');
            }
        }
        return rows;
    }

    window.attachTitleSuggestions = function (input, { multiple = false } = {}) {
        const id = `title-suggest-${++lists}`;
        const wrap = document.createElement('div');
        wrap.className = 'suggest-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const box = document.createElement('ul');
        box.id = id;
        box.className = 'suggest';
        box.setAttribute('role', 'listbox');
        box.hidden = true;
        wrap.appendChild(box);

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', id);
        input.autocomplete = 'off';

        let rows = [];
        let active = -1;

        const typedPart = () => (multiple ? input.value.split(',').pop() : input.value).trim();

        function close() {
            box.hidden = true;
            active = -1;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }

        function update() {
            const query = typedPart();
            rows = titles && query.length >= 2 ? suggest(query) : [];
            if (!rows.length) {
                close();
                return;
            }
            active = -1;
            box.innerHTML = rows.map((row, i) => `
                <li role="option" id="${id}-${i}" class="suggest-item" data-index="${i}" aria-selected="false">
                    <span>${escape(row.text)}</span><span class="suggest-lang">${row.tag}</span>
                </li>`).join('');
            box.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        function highlight(index) {
            active = index;
            box.querySelectorAll('[role="option"]').forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
            input.setAttribute('aria-activedescendant', `${id}-${index}`);
            box.children[index].scrollIntoView({ block: 'nearest' });
        }

        // With several titles, the chosen one replaces the part being typed and leaves room for the next
        function pick(index) {
            const text = rows[index].text;
            if (multiple) {
                const done = input.value.split(',').slice(0, -1).map(part => part.trim()).filter(Boolean);
                done.push(text);
                input.value = done.join(', ') + (done.length < 3 ? ', ' : '');
            } else {
                input.value = text;
            }
            close();
            input.focus();
        }

        input.addEventListener('focus', () => loadTitles().then(update).catch(() => {}));
        input.addEventListener('input', () => loadTitles().then(update).catch(() => {}));
        input.addEventListener('blur', close);
        input.addEventListener('keydown', e => {
            if (box.hidden) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
            } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault();
                pick(active);
            } else if (e.key === 'Escape') {
                // Inside a dialog, the first Escape only closes the list
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        });
        // mousedown keeps the focus in the input, so blur doesn't close the list before the pick
        box.addEventListener('mousedown', e => {
            e.preventDefault();
            const item = e.target.closest('[data-index]');
            if (item) pick(Number(item.dataset.index));
        });
    };
})();
