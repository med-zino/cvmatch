const Email = require('../models/Email');
const { sendWelcomeEmail } = require('../utils/emailService');
const mongoose = require('mongoose');

// Promisified timeout function
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Save email to database
exports.saveEmail = async (req, res) => {
  let retries = 3; // Number of retries before giving up
  
  while (retries > 0) {
    try {
      console.log('Email controller called with body:', req.body);
      const { email } = req.body;
      
      // Validate email
      if (!email || !email.includes('@')) {
        console.log('Invalid email format:', email);
        return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      }
      
      // Check MongoDB connection
      if (mongoose.connection.readyState !== 1) {
        console.log('MongoDB not connected. Connection state:', mongoose.connection.readyState);
        console.log('Attempting to reconnect...');
        await mongoose.connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });
        console.log('MongoDB reconnected');
      }
      
      // Check if email already exists - Add timeout
      console.log('Checking if email already exists:', email);
      const findPromise = Email.findOne({ email: email.toLowerCase() });
      const existingEmail = await Promise.race([
        findPromise,
        timeout(8000).then(() => {
          throw new Error('Database query timed out after 8 seconds');
        })
      ]);
      
      if (existingEmail) {
        console.log('Email already exists:', email);
        return res.status(200).json({ 
          success: true, 
          message: 'Email already registered',
          alreadyExists: true
        });
      }
      
      console.log('Creating new email entry for:', email);
      // Create new email entry
      const newEmail = new Email({
        email: email.toLowerCase() // Ensure email is stored in lowercase
      });
      
      console.log('Saving email to database...');
      // Save to database with timeout
      const savePromise = newEmail.save();
      const savedEmail = await Promise.race([
        savePromise,
        timeout(8000).then(() => {
          throw new Error('Database save operation timed out after 8 seconds');
        })
      ]);
      
      console.log('Email saved successfully:', savedEmail);
      
      // Send thank you email
      try {
        console.log('Sending thank you email to:', email);
        const emailResult = await sendWelcomeEmail(email);
        
        if (emailResult.success) {
          console.log('Thank you email sent successfully!');
        } else {
          console.log('Email sending skipped or failed:', emailResult.message || emailResult.error);
        }
      } catch (emailError) {
        console.error('Error in email sending process:', emailError);
        // Continue with the response even if email sending fails
      }
      
      // Return success response
      return res.status(201).json({ 
        success: true, 
        message: 'Email saved successfully',
        data: savedEmail
      });
    } catch (error) {
      retries--;
      console.error(`Error saving email (${retries} retries left):`, error);
      
      // If it's a timeout error, try again after a short delay
      if (error.message.includes('timed out') && retries > 0) {
        console.log('Timeout occurred, retrying after 1 second...');
        await timeout(1000);
      } else if (retries === 0) {
        // No more retries left, return error response
        return res.status(500).json({ 
          success: false, 
          message: 'Server error while saving email after multiple attempts',
          error: error.message
        });
      }
    }
  }
}; 