const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/emailService');
const { connectToDatabase } = require('../utils/db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GOOGLE_CLIENT_ID = '1001210903692-505to271nee2u0502j0ko2ftcdn5l9a0.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Ensure DB connection for all routes in this router (important on Vercel cold starts)
router.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('Database connection error in auth router:', err);
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Verification links don't expire; they point back at APP_URL, or else the domain that served the request
function verificationLinkFor(req, user) {
    const token = jwt.sign({ userId: user._id, purpose: 'email-verification' }, JWT_SECRET);
    const baseUrl = process.env.APP_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
    return `${baseUrl}/verify-email?token=${token}`;
}

// 24h session: httpOnly cookie for page loads, token in the body for API calls
function sendSession(res, user, message) {
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ success: true, message, userId: user._id, email: user.email, token });
}

router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (await User.findOne({ email })) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const user = new User({
            email,
            password: await bcrypt.hash(password, 10),
            verified: false
        });
        await user.save();

        try {
            await sendVerificationEmail(email, verificationLinkFor(req, user));
        } catch (emailError) {
            // Registration still succeeds; the user can resend from the login page
            console.error('Error sending verification email:', emailError);
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

router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.purpose !== 'email-verification') {
            return res.status(400).json({ error: 'Invalid verification token' });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.verified = true;
        await user.save();

        res.redirect('/login?verified=true');
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Error verifying email' });
    }
});

router.post('/resend-verification', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }

        // sendEmail reports failures in its result rather than throwing
        const sent = await sendVerificationEmail(user.email, verificationLinkFor(req, user));
        if (!sent.success) {
            return res.status(502).json({ error: "We couldn't send the verification email. Please try again later." });
        }
        res.json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Error resending verification email' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        if (!user.verified) {
            return res.status(403).json({
                error: 'Email not verified',
                requiresVerification: true,
                message: 'Please verify your email before logging in'
            });
        }

        sendSession(res, user, 'Login successful');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Signs in with a Google ID token; links an existing email account or creates a new one
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      user = await User.findOne({ email: payload.email });

      if (user) {
        user.googleId = payload.sub;
        user.verified = true; // Google emails are verified
      } else {
        // Google-only accounts get a random password they never use
        user = new User({
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
          password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
          googleId: payload.sub,
          verified: true
        });
      }
      await user.save();
    }

    sendSession(res, user, 'Google authentication successful');
  } catch (error) {
    console.error('Google Login Error:', error);
    res.status(401).json({ error: 'Invalid Google token', details: error.message });
  }
});

// Clears the httpOnly session cookie, which page scripts can't remove themselves
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

module.exports = router;
