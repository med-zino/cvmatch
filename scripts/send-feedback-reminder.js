const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Email model
const Email = require('../models/Email');

// Feedback form and registration links
const FEEDBACK_FORM_LINK = 'https://forms.gle/hEMaefqsNZ36JFaU6';
const REGISTRATION_LINK = 'https://cvmatch.vercel.app/register';

// Test email for initial testing
const TEST_EMAIL = 'medzino85@gmail.com';

async function sendFeedbackReminderEmails(testMode = true) {
    try {
        console.log(`Starting to send feedback reminder emails (${testMode ? 'TEST MODE' : 'PRODUCTION MODE'})...`);
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Get emails from database
        let emailsToSend;
        if (testMode) {
            // In test mode, only send to the test email
            emailsToSend = [TEST_EMAIL];
            console.log(`Test mode: Sending only to ${TEST_EMAIL}`);
        } else {
            // In production mode, get all emails from the database
            const allEmails = await Email.find({});
            emailsToSend = allEmails.map(doc => doc.email);
            console.log(`Found ${emailsToSend.length} emails in the database`);
        }

        // Create email content
        const emailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Feedback Matters - CVMatch</title>
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
        .highlight-box {
            background-color: #EEF2FF;
            border-left: 4px solid #4F46E5;
            padding: 15px;
            margin: 20px 0;
        }
        .cta-button {
            display: inline-block;
            background-color: #10B981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your Feedback Matters! 🎯</h1>
        </div>
        <div class="content">
            <p>Hi {{to_name}},</p>
            
            <p>Thank you for being part of CVMatch's early journey! We're reaching out because your feedback is incredibly valuable to us.</p>
            
            <div class="highlight-box">
                <strong>💡 Help Shape CVMatch's Future!</strong>
                <p>We'd love to hear your thoughts on your experience so far. Your feedback will directly influence our development roadmap and help us create a better product for you.</p>
            </div>
            
            <div style="text-align: center;">
                <a href="${FEEDBACK_FORM_LINK}" class="cta-button">Share Your Feedback</a>
            </div>
            
            <p><strong>Haven't registered for early access yet?</strong></p>
            <p>As an early user, you have exclusive privileges that won't be available later:</p>
            <ul>
                <li>Free lifetime access to all premium features</li>
                <li>Direct influence on product development</li>
                <li>Priority access to new features</li>
                <li>Special rewards and recognition</li>
            </ul>
            
            <div style="text-align: center;">
                <a href="${REGISTRATION_LINK}" class="cta-button">Register Now</a>
            </div>
            
            <p>Don't miss out on these exclusive benefits! Register today to secure your early access privileges.</p>
            
            <p>Best regards,<br>The CVMatch Team</p>
        </div>
        <div class="footer">
            <p>© 2025 CVMatch. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

        // Send emails
        for (const email of emailsToSend) {
            try {
                const name = email.split('@')[0];
                const processedTemplate = emailContent.replace(/{{to_name}}/g, name);

                await transporter.sendMail({
                    from: `"CVMatch Team" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🎯 Your Feedback Matters - CVMatch',
                    html: processedTemplate
                });

                console.log(`✓ Sent email to ${email}`);
                
                // Wait 5 seconds between emails to avoid rate limits
                if (emailsToSend.indexOf(email) < emailsToSend.length - 1) {
                    console.log('Waiting 5 seconds before sending next email...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error(`✗ Error sending to ${email}:`, error.message);
            }
        }

        console.log('✅ Email sending process completed!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error in email sending process:', error);
        await mongoose.disconnect();
    }
}

// Run the function with test mode (only sends to test email)
// sendFeedbackReminderEmails(true);

// To run in production mode (sends to all emails in database), uncomment the line below:
sendFeedbackReminderEmails(false); 