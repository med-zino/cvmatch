const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Page guard: needs a valid session JWT (Bearer header or token cookie), else redirects to /login
const auth = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : req.cookies?.token;

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        if (!(await User.findById(decoded.userId))) {
            return res.redirect('/login');
        }
        next();
    } catch (error) {
        console.log('Authentication error:', error.message);
        res.redirect('/login');
    }
};

module.exports = { auth };
