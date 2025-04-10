const nodemailer = require('nodemailer');
require('dotenv').config();

// Email configuration from environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

/**
 * Send an email using Nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @returns {Promise} - Success or failure
 */
async function sendEmail(options) {
  try {
    // Skip if no credentials
    if (!EMAIL_USER || !EMAIL_PASS || EMAIL_USER === 'your-email@gmail.com') {
      console.log('Email credentials not set. Skipping email sending.');
      return { success: false, message: 'Email credentials not configured' };
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    // Set up mail options
    const mailOptions = {
      from: `"CVMatch Team" <${EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a welcome email to a new subscriber
 * @param {string} email - Recipient email
 * @returns {Promise} - Success or failure
 */
async function sendWelcomeEmail(email) {
  try {
    const name = email.split('@')[0]; // Use part before @ as name
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #4F46E5;">CV<span style="color: #10B981;">Match</span></h1>
        </div>
        
        <p>Hello ${name},</p>
        
        <p>Thank you for subscribing to early access in CVMatch! We're excited to have you join us.</p>
        
        <p>Our AI-powered platform will enhance your job searching experience and match you with the most relevant job opportunities based on your skills and experience.</p>
        
        <p>We'll notify you as soon as we launch the app.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="#" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Learn More</a>
        </div>
        
        <p>Best regards,<br>The CVMatch Team</p>
      </div>
    `;
    
    return await sendEmail({
      to: email,
      subject: 'Welcome to CVMatch Early Access',
      html: html
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendWelcomeEmail
}; 