const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb+srv://medzino:password1234@cluster0.olsp0js.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('Connected to MongoDB');
        
        // Admin credentials
        const email = 'admin@gmail.com';
        const password = 'password';
        
        // Check if admin already exists
        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
            console.log('Admin user already exists');
            return;
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create admin user
        const adminUser = new User({
            email,
            password: hashedPassword,
            role: 'admin'
        });
        
        await adminUser.save();
        console.log('Admin user created successfully');
        console.log('Email:', email);
        console.log('Password:', password);
        
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

// Run the function
createAdminUser(); 