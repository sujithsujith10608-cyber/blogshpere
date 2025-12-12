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

// Check if Gmail credentials are available
if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
  try {
    // Create transporter for Gmail
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });

    // Verify transporter connection
    transporter.verify((error, success) => {
      if (error) {
        console.log('⚠️  Gmail configuration error. Using mock email service.');
        console.log('   To enable real Gmail, update .env with valid App Password from https://myaccount.google.com/apppasswords');
        transporter = mockTransporter;
      } else {
        console.log('✅ Gmail transporter ready');
      }
    });
  } catch (error) {
    console.log('⚠️  Gmail setup failed. Using mock email service.');
    transporter = mockTransporter;
  }
} else {
  console.log('ℹ️  Using mock email service. To enable Gmail:');
  console.log('   1. Set GMAIL_USER and GMAIL_PASSWORD in .env');
  console.log('   2. Get App Password from https://myaccount.google.com/apppasswords');
  transporter = mockTransporter;
}

module.exports = transporter;
