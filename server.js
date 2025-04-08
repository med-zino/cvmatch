const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { auth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Import routes
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const cvRoutes = require('./routes/cv');

// MongoDB Connection
mongoose.connect('mongodb+srv://medzino:password1234@cluster0.olsp0js.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST'], // Allow GET and POST methods
  allowedHeaders: ['Content-Type'] // Allow Content-Type header
}));
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Use routes
app.use('/api', authRoutes);
app.use('/', pageRoutes);
app.use('/api', cvRoutes);

// Add this route to serve the index.html file from the public directory (protected)
app.get('/public', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a route to serve the test.html file
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// Update the server startup to work with Vercel
if (require.main === module) {
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
}

// Export the app for Vercel
module.exports = app; 