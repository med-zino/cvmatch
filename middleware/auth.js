const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { connectToDatabase } = require('../utils/db');

// A default secret in a public repo would let anyone sign sessions, so production must set one
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret';

// Session JWT from the Bearer header or the token cookie. Email-verification
// tokens are signed with the same secret, so they're rejected here by their purpose.
function sessionUserId(req) {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : req.cookies?.token;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.purpose ? null : decoded.userId;
    } catch {
        return null;
    }
}

// Page guard: redirects to /login unless the session belongs to an existing user
const auth = async (req, res, next) => {
    const userId = sessionUserId(req);
    try {
        await connectToDatabase();
        if (userId && await User.exists({ _id: userId })) {
            return next();
        }
    } catch (error) {
        console.error('Page auth error:', error.message);
    }
    res.redirect('/login');
};

// API guard: answers 401 instead of redirecting, and sets req.userId for the handlers
const apiAuth = (req, res, next) => {
    const userId = sessionUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Please sign in again.', message: 'Please sign in again.' });
    }
    req.userId = userId;
    next();
};

module.exports = { auth, apiAuth, JWT_SECRET };
