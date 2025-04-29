const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Email model
const Email = require('./models/Email');

// List of emails that need to receive the early access email today
const emailsToSend = [
    'm.boudinar@esi-sba.dz',
    'lo_allaoua@esi.dz',
    'hakimalem15@gmail.com',
    'y.meflah@esi-sba.dz',
    'ayoubmcaa6645@gmail.com',
    'medzino85@gmail.com'
];

async function sendTodayEmails() {
    try {
        console.log('Starting to send early access emails to today\'s subscribers...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Read the early access template
        const templatePath = path.join(process.cwd(), 'email-templates', 'early-access.html');
        const template = await fs.readFile(templatePath, 'utf8');
        console.log('Loaded email template');
        
        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        console.log(`Found ${emailsToSend.length} emails to send early access invitation to`);
        
        // Send emails
        for (const email of emailsToSend) {
            try {
                const name = email.split('@')[0];
                const processedTemplate = template.replace(/{{to_name}}/g, name);

                await transporter.sendMail({
                    from: `"CVMatch Team" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🎉 Welcome to CVMatch Early Access!',
                    html: processedTemplate
                });

                console.log(`✓ Sent email to ${email}`);
                
                // Wait 5 seconds between emails to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error(`✗ Error sending to ${email}:`, error.message);
            }
        }

        console.log('✅ Email sending to today\'s subscribers completed successfully!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error in email sending:', error);
        await mongoose.disconnect();
    }
}

// Run the function
console.log('Starting email sending process for today\'s subscribers...');
sendTodayEmails(); 