require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { connectToDatabase } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Connection is cached globally for serverless; routes that need it await it again
connectToDatabase().catch(err => {
    console.error('Failed to connect to MongoDB:', err);
});

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Routes before static files so they aren't shadowed. Matching comes before the auth
// router, whose database middleware it doesn't need.
app.use('/api', require('./routes/cv'));
app.use('/api', require('./routes/auth'));
app.use('/api/saved-jobs', require('./routes/savedJobs'));
app.use('/api/me', require('./routes/me'));
app.use('/api/feed', require('./routes/feed'));
app.use('/', require('./routes/pages'));
app.use(express.static('public'));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Exported for Vercel
module.exports = app;
