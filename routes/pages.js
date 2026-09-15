const express = require('express');
const path = require('path');
const { auth } = require('../middleware/auth');

const router = express.Router();

const page = file => (req, res) => res.sendFile(path.join(__dirname, '..', file));

router.get('/', page('index.html'));
router.get('/login', page('login.html'));
router.get('/register', page('register.html'));
router.get('/verify-email', page('verify-email.html'));
router.get('/app', auth, page('public/index.html'));
router.get('/feed', auth, page('feed.html'));
router.get('/saved-jobs', auth, page('saved-jobs.html'));

module.exports = router;
