# EmailJS Setup for CVMatch

This document provides instructions on how to set up EmailJS to send automatic thank you emails to subscribers who sign up for early access.

## What is EmailJS?

EmailJS is a service that allows you to send emails directly from client-side JavaScript without a server. It's perfect for sending transactional emails like welcome messages, password resets, and thank you notes.

## Setup Instructions

### 1. Create an EmailJS Account

1. Go to [EmailJS.com](https://www.emailjs.com/) and sign up for a free account.
2. The free tier includes 200 emails per month, which should be sufficient for testing and early access.

### 2. Create an Email Service

1. In your EmailJS dashboard, go to "Email Services" and click "Add New Service".
2. Choose your preferred email service provider (Gmail, Outlook, etc.).
3. Follow the instructions to connect your email account.
4. Note down the **Service ID** (e.g., `service_abc123`).

### 3. Create an Email Template

1. Go to "Email Templates" and click "Create New Template".
2. Copy the content from `email-templates/thank-you.html` in this project.
3. Paste it into the EmailJS template editor.
4. Save the template and note down the **Template ID** (e.g., `template_xyz789`).

### 4. Get Your User ID

1. Go to "Account" in your EmailJS dashboard.
2. Find your **User ID** (e.g., `user_123456`).

### 5. Update the Configuration in the Code

1. Open `controllers/emailController.js`.
2. Replace the placeholder values with your actual EmailJS credentials:

```javascript
const EMAILJS_USER_ID = 'YOUR_USER_ID'; // Replace with your actual User ID
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; // Replace with your actual Template ID
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID'; // Replace with your actual Service ID
```

### 6. Test the Email Functionality

1. Start your server and navigate to the early access form.
2. Submit a test email address.
3. Check if you receive the thank you email.

## Troubleshooting

- **Emails not sending**: Check the console logs for any errors. Make sure your EmailJS credentials are correct.
- **Template variables not working**: Ensure that the variable names in your template match the ones you're passing in the `templateParams` object.
- **Rate limiting**: The free tier has a limit of 200 emails per month. If you exceed this, you'll need to upgrade your plan.

## Security Considerations

- Never commit your EmailJS credentials to a public repository.
- Consider using environment variables to store your EmailJS credentials.
- For production, you might want to implement rate limiting to prevent abuse.

## Additional Resources

- [EmailJS Documentation](https://www.emailjs.com/docs/)
- [EmailJS API Reference](https://www.emailjs.com/docs/rest-api/)
- [EmailJS Templates](https://www.emailjs.com/docs/templates/) 