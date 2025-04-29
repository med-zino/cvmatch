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
    'mahfoud.dev@gmail.com',
    'berrabahmohameaminetlm@gmail.com',
    'tbahritimohamed8@gmail.com',
    'dihia.moussi2@gmail.com',
    'ghaffour2002@gmail.com',
    'firas1120@gmail.com',
    'at.boulanouar@esi-sba.dz',
    'mohammedanessaadi@gmail.com',
    'wail01ouahab@gmail.com',
    'ac.bensalem@esi-sba.dz',
    '4.cnblue2017@gmail.com'
];

async function checkTodayEmails() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Create date for today (15/04/2025)
        const today = new Date('2025-04-15');
        const tomorrow = new Date('2025-04-16');
        
        // Find emails submitted today
        const todayEmails = await Email.find({
            submittedAt: {
                $gte: today,
                $lt: tomorrow
            }
        });
        
        console.log(`Total emails submitted today (15/04/2025): ${todayEmails.length}`);
        
        if (todayEmails.length === 0) {
            console.log('No emails were submitted today.');
            await mongoose.disconnect();
            return;
        }
        
        // Filter out emails that already received the early access email
        const emailsNotSent = todayEmails.filter(emailDoc => 
            !emailsAlreadySent.includes(emailDoc.email)
        );
        
        console.log(`Emails submitted today that haven't received the early access email: ${emailsNotSent.length}`);
        
        if (emailsNotSent.length === 0) {
            console.log('All emails submitted today have already received the early access email.');
            await mongoose.disconnect();
            return;
        }
        
        console.log('Emails that need to receive the early access email:');
        emailsNotSent.forEach(emailDoc => {
            console.log(`- ${emailDoc.email} (Submitted at: ${emailDoc.submittedAt})`);
        });
        
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
    }
}

// Run the function
checkTodayEmails(); 