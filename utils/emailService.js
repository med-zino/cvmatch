const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Email configuration from environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Embedded template as fallback
const FALLBACK_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thank You for Subscribing to CVMatch</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #4F46E5;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
        }
        .content {
            background-color: #f9fafb;
            padding: 30px;
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 5px 5px;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #6b7280;
        }
        .button {
            display: inline-block;
            background-color: #10B981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            font-weight: bold;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .logo span {
            color: #10B981;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">CV<span>Match</span></div>
            <h1>Thank You for Subscribing!</h1>
        </div>
        <div class="content">
            <p>Hello {{to_name}},</p>
            
            <p>Thank you for subscribing to early access in CVMatch! We're excited to have you on board.</p>
            
            <p>Our AI-powered platform is designed to revolutionize your job search experience by:</p>
            <ul>
                <li>Analyzing your CV to identify key skills and experiences</li>
                <li>Matching you with the most relevant job opportunities</li>
                <li>Providing personalized recommendations to improve your profile</li>
                <li>Offering real-time updates on new matching positions</li>
            </ul>
            
            <p>We're working hard to launch CVMatch and will notify you as soon as it's available. In the meantime, feel free to follow us on social media for updates and job search tips.</p>
            
            <a href="https://cvmatch.vercel.app/" class="button">Visit Our Website</a>
            
            <p>Best regards,<br>The CVMatch Team</p>
        </div>
        <div class="footer">
            <p>© 2025 CVMatch. All rights reserved.</p>
            <p>If you did not subscribe to CVMatch, please ignore this email.</p>
        </div>
    </div>
</body>
</html>`;

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
 * Send a welcome email to a new subscriber using the thank-you.html template
 * @param {string} email - Recipient email
 * @returns {Promise} - Success or failure
 */
async function sendWelcomeEmail(email) {
  try {
    const name = email.split('@')[0]; // Use part before @ as name
    let template;
    
    // Try to read the template file with multiple path resolution attempts
    try {
      let templatePath;
      
      // First attempt - standard path
      try {
        templatePath = path.join(process.cwd(), 'email-templates', 'thank-you.html');
        console.log('Trying to load email template from:', templatePath);
        template = await fs.readFile(templatePath, 'utf8');
      } catch (readError) {
        console.log('Failed to read template from primary path, trying alternative path...');
        
        // Second attempt - relative path
        templatePath = path.join(__dirname, '..', 'email-templates', 'thank-you.html');
        console.log('Trying to load email template from:', templatePath);
        template = await fs.readFile(templatePath, 'utf8');
      }
      
      console.log('Successfully loaded email template');
    } catch (error) {
      console.log('Could not load external template, using embedded template:', error.message);
      template = FALLBACK_TEMPLATE;
    }
    
    // Replace template variables with actual values
    template = template.replace(/{{to_name}}/g, name);
    
    return await sendEmail({
      to: email,
      subject: 'Welcome to CVMatch Early Access',
      html: template
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    
    // Fallback to simple HTML if template fails
    try {
      const name = email.split('@')[0];
      const simpleHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4F46E5;">CV<span style="color: #10B981;">Match</span></h1>
          </div>
          
          <p>Hello ${name},</p>
          
          <p>Thank you for subscribing to early access in CVMatch! We're excited to have you join us.</p>
          
          <p>Our AI-powered platform will enhance your job searching experience and match you with the most relevant job opportunities based on your skills and experience.</p>
          
          <p>We'll notify you as soon as we launch the app.</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://cvmatch.vercel.app/" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Visit Our Website</a>
          </div>
          
          <p>Best regards,<br>The CVMatch Team</p>
        </div>
      `;
      
      return await sendEmail({
        to: email,
        subject: 'Welcome to CVMatch Early Access',
        html: simpleHtml
      });
    } catch (fallbackError) {
      console.error('Fallback email also failed:', fallbackError);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Send a verification email to a new user
 * @param {string} email - Recipient email
 * @param {string} verificationLink - The verification link with JWT token
 * @returns {Promise} - Success or failure
 */
async function sendVerificationEmail(email, verificationLink) {
  try {
    const name = email.split('@')[0]; // Use part before @ as name
    let template;
    
    // Try to read the template file with multiple path resolution attempts
    try {
      let templatePath;
      
      // First attempt - standard path
      try {
        templatePath = path.join(process.cwd(), 'email-templates', 'verify-email.html');
        console.log('Trying to load verification email template from:', templatePath);
        template = await fs.readFile(templatePath, 'utf8');
      } catch (readError) {
        console.log('Failed to read verification template from primary path, trying alternative path...');
        
        // Second attempt - relative path
        templatePath = path.join(__dirname, '..', 'email-templates', 'verify-email.html');
        console.log('Trying to load verification email template from:', templatePath);
        template = await fs.readFile(templatePath, 'utf8');
      }
      
      console.log('Successfully loaded verification email template');
    } catch (error) {
      console.log('Could not load external verification template, using embedded template:', error.message);
      // Create a simple embedded template as fallback
      template = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4F46E5;">CV<span style="color: #10B981;">Match</span></h1>
          </div>
          
          <p>Hello ${name},</p>
          
          <p>Thank you for registering with CVMatch! To complete your registration and access your account, please verify your email address by clicking the button below:</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${verificationLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify My Email</a>
          </div>
          
          <p>This verification link will not expire, so you can use it at any time.</p>
          
          <p>If you did not create an account with CVMatch, please ignore this email.</p>
          
          <p>Best regards,<br>The CVMatch Team</p>
        </div>
      `;
    }
    
    // Replace template variables with actual values
    template = template.replace(/{{to_name}}/g, name);
    template = template.replace(/{{verification_link}}/g, verificationLink);
    
    return await sendEmail({
      to: email,
      subject: 'Verify Your Email - CVMatch',
      html: template
    });
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail
}; 