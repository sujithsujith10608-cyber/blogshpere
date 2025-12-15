require('dotenv').config();
const nodemailer = require('nodemailer');

// Mock transporter - for testing without Gmail credentials
const mockTransporter = {
  sendMail: async (mailOptions) => {
    console.log('📧 [MOCK EMAIL]', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      timestamp: new Date().toISOString(),
    });
    return { success: true, messageId: 'mock-' + Date.now() };
  },
  verify: (callback) => callback(null, true),
};

let transporter;

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(none)';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const first = local[0];
  return `${first}***@${domain}`;
}

// Check if Gmail credentials are available
// Helper: try a specific transporter and verify it; return transporter or null
async function tryVerifyTransport(trans) {
  try {
    await trans.verify();
    return trans;
  } catch (err) {
    return null;
  }
}

(async () => {
  // Priority: SMTP explicit > GMAIL App Password > mock

  // 1) If explicit SMTP config present (e.g., SendGrid or custom SMTP)
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`ℹ️  Attempting SMTP transport to ${process.env.SMTP_HOST}`);
    try {
      const smtpTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true' || false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      const ok = await tryVerifyTransport(smtpTransport);
      if (ok) {
        transporter = smtpTransport;
        console.log(`✅ SMTP transporter ready (${maskEmail(process.env.SMTP_USER)})`);
        return;
      } else {
        console.warn(`⚠️  SMTP transporter verification failed for ${maskEmail(process.env.SMTP_USER)}.`);
      }
    } catch (e) {
      console.warn('⚠️  SMTP transporter creation failed:', e && e.message ? e.message : e);
    }
  }

  // 2) Gmail App Password
  if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
    // Common mistake: pasted App Password with spaces. App passwords are 16 chars without spaces.
    if (process.env.GMAIL_PASSWORD.includes(' ')) {
      console.warn('⚠️  GMAIL_PASSWORD contains spaces — ensure you use a 16-character App Password without spaces.');
    }
    console.log(`ℹ️  Attempting Gmail transport for ${maskEmail(process.env.GMAIL_USER)}`);
    try {
      const gmailTransport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
        },
      });
      const ok = await tryVerifyTransport(gmailTransport);
      if (ok) {
        transporter = gmailTransport;
        console.log(`✅ Gmail transporter ready (${maskEmail(process.env.GMAIL_USER)})`);
        return;
      } else {
        console.warn('⚠️  Gmail transporter verification failed. Please confirm the App Password is correct and that 2FA is enabled.');
        console.log('   Step: https://myaccount.google.com/apppasswords');
      }
    } catch (error) {
      console.warn('⚠️  Gmail setup failed:', error && error.message ? error.message : error);
    }
  }

  // Default fallback: mock transporter
  console.log('ℹ️  Using mock email service. To enable real email: set SMTP_* or GMAIL_USER/GMAIL_PASSWORD in env');
  transporter = mockTransporter;
})();

module.exports = transporter;
