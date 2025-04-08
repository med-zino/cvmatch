const express = require('express');
const router = express.Router();
const path = require('path');
const { auth, isAdmin } = require('../middleware/auth');

// Serve main page (protected, requires authentication)
router.get('/', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve login page
router.get('/login', (req, res) => {
    console.log('Login page requested');
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Serve registration page
router.get('/register', (req, res) => {
    console.log('Registration page requested');
    res.sendFile(path.join(__dirname, '..', 'register.html'));
});

// Serve admin page with authentication
router.get('/admin', auth, isAdmin, (req, res) => {
    console.log('Admin page requested - access granted');
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Serve test admin page
router.get('/test-admin', (req, res) => {
    console.log('Test admin page requested');
    res.sendFile(path.join(__dirname, '..', 'test-admin.html'));
});

module.exports = router; 