const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Emails to send to
const emailsToSend = [
    'mohamedmghezzi2@gmail.com',
    'saasara200@gmail.com',
    'ccherrad@gmail.com',
    'sorayadjellouli20@gmail.com'
];

async function sendSingleEmails() {
    try {
        console.log(`Starting to send early access emails to ${emailsToSend.length} recipients...`);
        
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
        
        // Send emails to each recipient
        for (const email of emailsToSend) {
            try {
                // Process the template with the recipient's name
                const name = email.split('@')[0];
                const processedTemplate = template.replace(/{{to_name}}/g, name);

                // Send the email
                await transporter.sendMail({
                    from: `"CVMatch Team" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🎉 Welcome to CVMatch Early Access!',
                    html: processedTemplate
                });

                console.log(`✓ Successfully sent early access email to ${email}`);
                
                // Wait 5 seconds between emails to avoid rate limits
                if (emailsToSend.indexOf(email) < emailsToSend.length - 1) {
                    console.log('Waiting 5 seconds before sending next email...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error(`❌ Error sending email to ${email}:`, error.message);
            }
        }
        
        console.log('✅ Email sending process completed!');
    } catch (error) {
        console.error('❌ Error in email sending process:', error.message);
    }
}

// Run the function
sendSingleEmails(); 