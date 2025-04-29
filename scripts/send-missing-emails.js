const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Email model
const Email = require('./models/Email');

// List of emails that already received the early access email
const emailsAlreadySent = [
    'm.zemour@esi-sba.dz',
    'it.aminabelhout@gmail.com',
    'k.besseghir@esi-sba.dz',
    'm.fendi@esi-sba.dz',
    'sawsene_lina.ben_zeba@g.enp.edu.dz',
    'mouadbaghdadi2002@gmail.com',
    'sndsbel112@gmail.com',
    'contact@ilyas-benhammadi.com',
    'kanounemerouane@gmail.com',
    'berrabahmohamedaminetlm@gmail.com',
    'f.boukabrine@esi-sba.dz',
    'yousraferdra@gmail.com',
    'mm_chekman@esi.dz',
    'mahfoud.dev@gmail.com'
];

async function sendMissingEarlyAccessEmails() {
    try {
        console.log('Starting to send emails to subscribers who haven\'t received it yet...');
        
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
        const allEmails = await Email.find({});
        console.log(`Total emails in database: ${allEmails.length}`);
        
        // Filter out emails that already received the early access email
        const emailsToSend = allEmails.filter(emailDoc => 
            !emailsAlreadySent.includes(emailDoc.email)
        );
        
        console.log(`Emails that already received the early access email: ${emailsAlreadySent.length}`);
        console.log(`Emails that will receive the early access email now: ${emailsToSend.length}`);
        
        if (emailsToSend.length === 0) {
            console.log('No emails to send. All subscribers have already received the early access email.');
            await mongoose.disconnect();
            return;
        }
        
        // Send emails in batches to avoid rate limits
        const batchSize = 50;
        for (let i = 0; i < emailsToSend.length; i += batchSize) {
            const batch = emailsToSend.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(emailsToSend.length/batchSize)}`);

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
            if (i + batchSize < emailsToSend.length) {
                console.log('Waiting 60 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }

        console.log('✅ Email sending to missing subscribers completed successfully!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error in email sending:', error);
        await mongoose.disconnect();
    }
}

// Run the function
console.log('Starting email sending process for missing subscribers...');
sendMissingEarlyAccessEmails(); 