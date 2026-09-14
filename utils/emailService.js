const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

const { EMAIL_USER, EMAIL_PASS } = process.env;

// Used if the template file can't be read (e.g. missing from the serverless bundle)
const FALLBACK_TEMPLATE = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
    <h1 style="color: #4F46E5; text-align: center;">CV<span style="color: #10B981;">Match</span></h1>
    <p>Hello {{to_name}},</p>
    <p>Thank you for registering with CVMatch! Please verify your email address by clicking the button below:</p>
    <p style="margin: 30px 0; text-align: center;">
      <a href="{{verification_link}}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify My Email</a>
    </p>
    <p>If you did not create an account with CVMatch, please ignore this email.</p>
    <p>Best regards,<br>The CVMatch Team</p>
  </div>
`;

// Sends through Gmail SMTP; skipped when EMAIL_USER / EMAIL_PASS aren't set (e.g. local dev).
// A plain-text part alongside the HTML makes spam filters less suspicious.
async function sendEmail({ to, subject, html, text }) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log('Email credentials not set. Skipping email sending.');
    return { success: false, message: 'Email credentials not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    const info = await transporter.sendMail({ from: `"CVMatch" <${EMAIL_USER}>`, to, subject, html, text });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

async function sendVerificationEmail(email, verificationLink) {
  let template;
  try {
    template = await fs.readFile(path.join(__dirname, '..', 'email-templates', 'verify-email.html'), 'utf8');
  } catch (error) {
    console.log('Could not load verification template, using embedded template:', error.message);
    template = FALLBACK_TEMPLATE;
  }

  const name = email.split('@')[0];
  return sendEmail({
    to: email,
    subject: 'Confirm your email for CVMatch',
    html: template
      .replace(/{{to_name}}/g, name)
      .replace(/{{verification_link}}/g, verificationLink),
    text: `Hello ${name},\n\nConfirm your email address to finish setting up your CVMatch account:\n${verificationLink}\n\nIf you didn't create a CVMatch account, you can ignore this email.\n\nThe CVMatch team`
  });
}

module.exports = { sendVerificationEmail };
