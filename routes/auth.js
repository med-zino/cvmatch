const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, isAdmin } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/emailService');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

// Google client ID and secret
const GOOGLE_CLIENT_ID = '1001210903692-505to271nee2u0502j0ko2ftcdn5l9a0.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';

// Initialize Google OAuth client
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Registration route
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user with default role 'client' and verified = false
        const user = new User({
            email,
            password: hashedPassword,
            role: 'client', // Explicitly set role to client
            verified: false // User starts as unverified
        });

        await user.save();

        // Generate verification token (non-expiring)
        const verificationToken = jwt.sign(
            { userId: user._id, purpose: 'email-verification' },
            process.env.JWT_SECRET || 'your-secret-key'
        );

        // Create verification link using environment-aware base URL
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://cvmatch.vercel.app'
            : process.env.VERCEL_URL 
                ? `https://${process.env.VERCEL_URL}`
                : 'http://localhost:3000';
        const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

        // Send verification email
        try {
            await sendVerificationEmail(email, verificationLink);
            console.log('Verification email sent successfully');
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
            // Continue with registration even if email fails
        }

        res.status(201).json({ 
            message: 'User registered successfully. Please check your email to verify your account.',
            requiresVerification: true
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Error registering user' });
    }
});

// Email verification route
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Check if token is for email verification
        if (decoded.purpose !== 'email-verification') {
            return res.status(400).json({ error: 'Invalid verification token' });
        }

        // Find the user
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user as verified
        user.verified = true;
        await user.save();

        // Redirect to login page with success message
        res.redirect('/login?verified=true');
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Error verifying email' });
    }
});

// Resend verification email route
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        // Find the user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if already verified
        if (user.verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }

        // Generate new verification token
        const verificationToken = jwt.sign(
            { userId: user._id, purpose: 'email-verification' },
            process.env.JWT_SECRET || 'your-secret-key'
        );

        // Create verification link
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://cvmatch.vercel.app'
            : process.env.VERCEL_URL 
                ? `https://${process.env.VERCEL_URL}`
                : 'http://localhost:3000';
        const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

        // Send verification email
        await sendVerificationEmail(email, verificationLink);

        res.json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Error resending verification email' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Check if email is verified
        if (!user.verified) {
            return res.status(403).json({ 
                error: 'Email not verified', 
                requiresVerification: true,
                message: 'Please verify your email before logging in'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        // Set a cookie with the token
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ 
            success: true,
            message: 'Login successful',
            role: user.role,
            userId: user._id,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Google Authentication route
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }
    
    console.log('Received Google ID token, verifying...');
    
    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    console.log('Google token verified, payload:', payload.email);
    
    // First try to find user by Google ID
    let user = await User.findOne({ googleId: payload.sub });
    
    // If not found by Google ID, try to find by email
    if (!user) {
      user = await User.findOne({ email: payload.email });
      
      if (user) {
        // User exists but hasn't linked Google account
        user.googleId = payload.sub;
        user.verified = true; // Google emails are verified
        await user.save();
        console.log('Linked existing user with Google account:', user.email);
      } else {
        // Create new user with random password
        const randomPassword = crypto.randomBytes(16).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);
        
        user = new User({
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
          password: hashedPassword,
          googleId: payload.sub,
          verified: true, // Google emails are verified
          role: 'client'
        });
        
        await user.save();
        console.log('Created new user from Google account:', user.email);
      }
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    // Set a cookie with the token
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    res.json({ 
      success: true,
      message: 'Google authentication successful',
      role: user.role,
      userId: user._id,
      token
    });
  } catch (error) {
    console.error('Google Login Error:', error);
    res.status(401).json({ error: 'Invalid Google token', details: error.message });
  }
});

// Admin route - protected by auth and isAdmin middleware
router.get('/admin', auth, isAdmin, (req, res) => {
    res.json({ message: 'Admin access granted' });
});

module.exports = router; 