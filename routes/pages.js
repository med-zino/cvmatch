const express = require('express');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');

const router = express.Router();

const page = file => (req, res) => res.sendFile(path.join(__dirname, '..', file));

// The legal pages name a contact address only when CONTACT_EMAIL is set;
// until then they point people at the emails Pounce already sends them
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const CONTACT = {
    en: { write: 'write to', fallback: 'reply to any email Pounce has sent you' },
    fr: { write: 'écrivez à', fallback: "répondez à n'importe quel e-mail envoyé par Pounce" }
};

function contactHtml(lang) {
    const email = (process.env.CONTACT_EMAIL || '').trim();
    if (!email) return CONTACT[lang].fallback;
    const safe = escapeHtml(email);
    return `${CONTACT[lang].write} <a href="mailto:${safe}">${safe}</a>`;
}

const legal = (file, lang) => {
    let html = null;
    return (req, res) => {
        html = html || fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        res.type('html').send(html.split('<!--contact-->').join(contactHtml(lang)));
    };
};

router.get('/', page('index.html'));
router.get('/fr', page('fr.html'));
router.get('/privacy', legal('privacy.html', 'en'));
router.get('/terms', legal('terms.html', 'en'));
router.get('/fr/confidentialite', legal('privacy.fr.html', 'fr'));
router.get('/fr/conditions', legal('terms.fr.html', 'fr'));
router.get('/login', page('login.html'));
router.get('/register', page('register.html'));
router.get('/verify-email', page('verify-email.html'));
router.get('/app', auth, page('public/index.html'));
// The feed now sits below the search; older links (and emails) land on it there
router.get('/feed', (req, res) => res.redirect('/app#feed'));
router.get('/saved-jobs', auth, page('saved-jobs.html'));

module.exports = router;
