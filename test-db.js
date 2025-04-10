const mongoose = require('mongoose');
const Email = require('./models/Email');

// MongoDB Connection
console.log('Attempting to connect to MongoDB...');
mongoose.connect('mongodb+srv://medzino:password1234@cluster0.olsp0js.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('MongoDB connected successfully');
    console.log('Connected to database:', mongoose.connection.db.databaseName);
    
    // Test saving an email
    try {
        const testEmail = new Email({
            email: 'test@example.com'
        });
        
        console.log('Saving test email...');
        const savedEmail = await testEmail.save();
        console.log('Test email saved successfully:', savedEmail);
        
        // Find all emails
        console.log('Finding all emails...');
        const allEmails = await Email.find();
        console.log('All emails:', allEmails);
        
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (error) {
        console.error('Error testing email model:', error);
    }
})
.catch(err => {
    console.error('MongoDB connection error:', err);
}); 