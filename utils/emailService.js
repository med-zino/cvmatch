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
async function sendEmail({ to, subject, html, text, headers, list }) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log('Email credentials not set. Skipping email sending.');
    return { success: false, message: 'Email credentials not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    const info = await transporter.sendMail({ from: `"CVMatch" <${EMAIL_USER}>`, to, subject, html, text, headers, list });
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

// ---------- Daily matches email ----------

// Listing text comes from third parties, so everything in the email is escaped
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const safeUrl = url => (/^https?:\/\//i.test(url || '') ? url : '');
const tierLabel = score => score >= 85 ? 'Strong match' : score >= 70 ? 'Good match' : score >= 50 ? 'Stretch' : 'Weak match';

function jobCard(job) {
  const meta = [job.company, job.location].filter(Boolean).map(escape).join(' · ');
  const link = safeUrl(job.link);
  return `
    <tr><td style="padding: 0 32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E6E4DF; border-radius: 12px;">
        <tr><td style="padding: 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align: top; padding-right: 12px;">
              <p style="margin: 0 0 4px; font-size: 17px; font-weight: bold; line-height: 1.3;">${escape(job.title)}</p>
              <p style="margin: 0; font-size: 13px; color: #76746F;">${meta}</p>
            </td>
            <td style="vertical-align: top; text-align: right; white-space: nowrap;">
              <p style="margin: 0; font-family: Menlo, Consolas, monospace; font-size: 26px; line-height: 1;">${job.score}<span style="font-size: 12px; color: #76746F;">%</span></p>
              <p style="margin: 6px 0 0; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #76746F;">${tierLabel(job.score)}</p>
            </td>
          </tr></table>
          ${job.reasons?.[0] ? `<p style="margin: 14px 0 0; font-size: 14px; line-height: 1.55; color: #3B3A38;">${escape(job.reasons[0])}</p>` : ''}
          ${link ? `<p style="margin: 16px 0 0;"><a href="${escape(link)}" style="display: inline-block; padding: 10px 16px; background-color: #0E0E0D; color: #F7F7F5; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 8px;">Apply</a></p>` : ''}
        </td></tr>
      </table>
    </td></tr>`;
}

// The top matches as cards, with a one-click unsubscribe in the headers and the footer
async function sendJobAlertEmail(to, { jobs, titles, location, feedUrl, unsubscribeUrl }) {
  const search = `${titles.join(', ')}${location ? ` in ${location}` : ''}`;
  const heading = jobs.length === 1 ? 'Your top match today' : `Your top ${jobs.length} matches today`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${heading}</title></head>
<body style="margin: 0; padding: 0; background-color: #F7F7F5; font-family: Helvetica, Arial, sans-serif; color: #0E0E0D;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F7F7F5;">
    <tr><td align="center" style="padding: 40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid #E6E4DF; border-radius: 16px;">
        <tr><td style="padding: 32px 32px 20px;">
          <p style="margin: 0 0 24px; font-size: 17px; font-weight: bold; letter-spacing: -0.02em;">CVMatch</p>
          <h1 style="margin: 0 0 10px; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; font-weight: normal; line-height: 1.1;">${heading}</h1>
          <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #76746F;">New openings for ${escape(search)}, scored against your CV.</p>
        </td></tr>
        ${jobs.map(jobCard).join('')}
        <tr><td style="padding: 10px 32px 28px;">
          <a href="${escape(feedUrl)}" style="color: #0E0E0D; font-size: 14px; font-weight: bold;">See every opening in your feed &rarr;</a>
        </td></tr>
        <tr><td style="padding: 18px 32px 26px; border-top: 1px solid #EFEEEA;">
          <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #76746F;">You get this email because you turned on daily matches in CVMatch. <a href="${escape(unsubscribeUrl)}" style="color: #76746F;">Turn off daily emails</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${heading}: new openings for ${search}, scored against your CV.`,
    '',
    ...jobs.map(job => [
      `${job.score}% · ${job.title}${job.company ? ` at ${job.company}` : ''}`,
      job.reasons?.[0] || '',
      safeUrl(job.link),
      ''
    ].filter((line, i) => line || i === 3).join('\n')),
    `Your feed: ${feedUrl}`,
    `Turn off daily emails: ${unsubscribeUrl}`
  ].join('\n');

  return sendEmail({
    to,
    subject: `${heading}: ${jobs[0].title} (${jobs[0].score}%)`,
    html,
    text,
    list: { unsubscribe: { url: unsubscribeUrl, comment: 'Turn off daily emails' } },
    headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  });
}

module.exports = { sendVerificationEmail, sendJobAlertEmail };
