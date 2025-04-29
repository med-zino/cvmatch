const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Email model
const Email = require('./models/Email');

async function sendBulkEarlyAccessEmails() {
    try {
        console.log('Starting bulk email sending process...');
        
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

        // Get all emails from the database
        const emails = await Email.find({});
        console.log(`Found ${emails.length} emails to send`);

        // Send emails in batches to avoid rate limits
        const batchSize = 50;
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(emails.length/batchSize)}`);

            // Send emails in parallel within each batch
            await Promise.all(batch.map(async (emailDoc) => {
                try {
                    const name = emailDoc.email.split('@')[0];
                    const processedTemplate = template.replace(/{{to_name}}/g, name);

                    await transporter.sendMail({
                        from: `"CVMatch Team" <${process.env.EMAIL_USER}>`,
                        to: emailDoc.email,
                        subject: '🎉 Welcome to CVMatch Early Access!',
                        html: processedTemplate
                    });

                    console.log(`✓ Sent email to ${emailDoc.email}`);
                } catch (error) {
                    console.error(`✗ Error sending to ${emailDoc.email}:`, error.message);
                }
            }));

            // Wait 1 minute between batches to avoid rate limits
            if (i + batchSize < emails.length) {
                console.log('Waiting 60 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }

        console.log('✅ Bulk email sending completed successfully!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error in bulk email sending:', error);
        await mongoose.disconnect();
    }
}

// Run the function immediately when script is executed
console.log('Starting email sending process...');
sendBulkEarlyAccessEmails(); 