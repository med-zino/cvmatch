require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { auth } = require('./middleware/auth');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Import routes
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const cvRoutes = require('./routes/cv');
const emailRoutes = require('./routes/emailRoutes');

// MongoDB Connection
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        console.log('Using cached database instance');
        return cachedDb;
    }

    console.log('Attempting to connect to MongoDB...');
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10
        });
        
        console.log('MongoDB connected successfully');
        console.log('Connected to database:', conn.connection.db.databaseName);
        
        cachedDb = conn;
        return conn;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
}

// Connect to MongoDB at startup
connectToDatabase().catch(err => {
    console.error('Failed to connect to MongoDB:', err);
});

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST'], // Allow GET and POST methods
  allowedHeaders: ['Content-Type'] // Allow Content-Type header
}));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Use routes - IMPORTANT: Order matters!
app.use('/api', authRoutes);
app.use('/api', cvRoutes);
app.use('/api', emailRoutes);
app.use('/', pageRoutes);

// Static files - Serve AFTER routes to prevent overriding
app.use(express.static('public'));
app.use('/public', express.static('public'));
app.use('/email-templates', express.static('email-templates'));

// Add this route to serve the index.html file from the public directory (protected)
app.get('/public', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a route to serve the test.html file
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// Google client ID
const GOOGLE_CLIENT_ID = '1001210903692-505to271nee2u0502j0ko2ftcdn5l9a0.apps.googleusercontent.com';

// Serve login page with Google client ID
app.get('/login', (req, res) => {
  // Read the login.html file
  fs.readFile(path.join(__dirname, 'login.html'), 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading login.html:', err);
      return res.status(500).send('Error loading login page');
    }
    
    // Inject the Google client ID
    const modifiedHtml = data.replace('<body>', `<body data-google-client-id="${GOOGLE_CLIENT_ID}">`);
    
    // Send the modified HTML
    res.send(modifiedHtml);
  });
});

// Serve register page with Google client ID
app.get('/register', (req, res) => {
  // Read the register.html file
  fs.readFile(path.join(__dirname, 'register.html'), 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading register.html:', err);
      return res.status(500).send('Error loading register page');
    }
    
    // Inject the Google client ID
    const modifiedHtml = data.replace('<body>', `<body data-google-client-id="${GOOGLE_CLIENT_ID}">`);
    
    // Send the modified HTML
    res.send(modifiedHtml);
  });
});

// Update the server startup to work with Vercel
if (require.main === module) {
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
}

// Export the app for Vercel
module.exports = app; 