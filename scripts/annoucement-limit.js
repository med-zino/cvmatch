const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Email model
const Email = require('../models/Email');

// Links for the email
const FEEDBACK_FORM_LINK = 'https://forms.gle/tc9qVLcKd68qmmR98';
const LOGIN_LINK = 'https://cvmatch.vercel.app/login';

// Test email for initial testing
const TEST_EMAIL = 'medzino85@gmail.com';

async function sendRateLimitRemovalEmails(testMode = true) {
    try {
        console.log(`Starting to send rate limit removal announcement emails (${testMode ? 'TEST MODE' : 'PRODUCTION MODE'})...`);
        
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
    <title>Great News! Unlimited Access Now Available - CVMatch</title>
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
            <h1>🎉 Great News, Beta Testers! 🎉</h1>
        </div>
        <div class="content">
            <p>Hi {{to_name}},</p>
            
            <p>We have <strong>exciting news</strong> to share with our valued early users!</p>
            
            <div class="highlight-box">
                <strong>🚀 Rate Limits Removed!</strong>
                <p>Thanks to your valuable feedback, we've removed all rate limits from the CVMatch beta. You now have <strong>unlimited access</strong> to test all features without restrictions!</p>
            </div>
            
            <p>This change was implemented based directly on your requests, and we're thrilled to offer you a more comprehensive testing experience.</p>
            
            <div style="text-align: center;">
                <a href="${LOGIN_LINK}" class="cta-button">Try Unlimited Access Now</a>
            </div>
            
            <p><strong>Your feedback matters more than ever!</strong></p>
            <p>As you explore CVMatch with unlimited access, we'd love to hear about your experience. Our feedback form takes less than a minute to complete:</p>
            
            <div style="text-align: center;">
                <a href="${FEEDBACK_FORM_LINK}" class="cta-button">Share Your Feedback</a>
            </div>
            
            <p>Remember, as an early beta tester, you're helping shape the future of CVMatch. Every piece of feedback directly influences our development priorities.</p>
            
            <p>Thank you for being an essential part of our journey!</p>
            
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
                    subject: '🎉 Great News! Unlimited Access Now Available - CVMatch',
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
sendRateLimitRemovalEmails(true);

// To run in production mode (sends to all emails in database), uncomment the line below:
 sendRateLimitRemovalEmails(false);