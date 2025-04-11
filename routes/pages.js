const express = require('express');
const router = express.Router();
const path = require('path');
const { auth, isAdmin } = require('../middleware/auth');

// Landing page route - serve the root index.html
router.get('/', (req, res) => {
  console.log('Serving landing page');
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Main application route (protected)
router.get('/app', auth, (req, res) => {
  console.log('Serving main application');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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

// Serve email verification page
router.get('/verify-email', (req, res) => {
    console.log('Email verification page requested');
    res.sendFile(path.join(__dirname, '..', 'verify-email.html'));
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