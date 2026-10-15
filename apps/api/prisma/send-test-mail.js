/**
 * `npm run mail:test -- you@example.com` — sends one email through SMTP_URL so you can check
 * your email settings before relying on verification and password-reset mails.
 */
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');
const { createTransport } = require('nodemailer');

const to = process.argv[2];
if (!to) {
  console.error('Usage: npm run mail:test -- you@example.com');
  process.exit(1);
}
if (!process.env.SMTP_URL) {
  console.error('SMTP_URL is empty in apps/api/.env, so the API only prints emails to its console.');
  process.exit(1);
}

(async () => {
  const transport = createTransport(process.env.SMTP_URL);
  try {
    await transport.verify();
    console.log('✓ Connected and signed in to the SMTP server.');
    const info = await transport.sendMail({
      from: process.env.MAIL_FROM || 'StudywidBuddy <no-reply@studywidbuddy.local>',
      to,
      subject: 'StudywidBuddy test email',
      text: 'If you can read this, StudywidBuddy can send verification and password-reset emails.',
    });
    console.log(`✓ Sent to ${to} (message id ${info.messageId}). Check the inbox and the spam folder.`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    if (/Invalid login|535|534/.test(e.message)) {
      console.error('  For Gmail, use an App Password (not your normal password); 2-Step Verification must be on.');
    }
    process.exitCode = 1;
  }
})();
