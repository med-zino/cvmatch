const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function testEarlyAccessEmail() {
    try {
        // Read the early access template
        const templatePath = path.join(process.cwd(), 'email-templates', 'early-access.html');
        const template = await fs.readFile(templatePath, 'utf8');
        
        // Replace template variables
        const name = 'medzino85'.split('@')[0];
        const processedTemplate = template.replace(/{{to_name}}/g, name);
        
        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Send test email
        const info = await transporter.sendMail({
            from: `"CVMatch Team" <${process.env.EMAIL_USER}>`,
            to: 'medzino85@gmail.com',
            subject: '🎉 Welcome to CVMatch Early Access!',
            html: processedTemplate
        });

        console.log('Test email sent successfully:', info.messageId);
    } catch (error) {
        console.error('Error sending test email:', error);
    }
}

// Run the test
testEarlyAccessEmail(); 