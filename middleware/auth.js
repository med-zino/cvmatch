const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // Try to extract token from various sources
        let token = null;
        
        // 1. Check Authorization header
        const authHeader = req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.replace('Bearer ', '');
        }
        
        // 2. Check query parameters
        if (!token && req.query && req.query.token) {
            token = req.query.token;
        }
        
        // 3. Check cookies
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }
        
        if (!token) {
            console.log('No authentication token found');
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId);

        if (!user) {
            console.log('User not found');
            return res.redirect('/login');
        }

        req.userId = user._id;
        req.userRole = user.role;
        req.token = token;
        next();
    } catch (error) {
        console.log('Authentication error:', error.message);
        res.redirect('/login');
    }
};

const isAdmin = async (req, res, next) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Error checking user role' });
    }
};

module.exports = { auth, isAdmin }; 