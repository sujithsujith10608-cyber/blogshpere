const transporter = require('../config/email');

// Send registration welcome email
exports.sendRegistrationEmail = async (userEmail, userName) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: 'Welcome to FB - Account Registration Successful',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; padding: 20px; text-align: center; color: white;">
            <h1>Welcome to FB!</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Thank you for registering with us! Your account has been successfully created.</p>
            <p>You can now log in and start creating and sharing amazing blog posts.</p>
            <div style="margin-top: 30px; padding: 15px; background-color: #e8f5e9; border-left: 4px solid #4CAF50;">
              <p><strong>Account Details:</strong></p>
              <p>Email: ${userEmail}</p>
            </div>
            <p style="margin-top: 20px;">If you have any questions, feel free to contact us.</p>
            <p>Happy blogging!</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              © 2025 FB Blog Platform. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Registration email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending registration email:', error);
  }
};

// Send login notification email
exports.sendLoginEmail = async (userEmail, userName) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: 'New Login to Your FB Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2196F3; padding: 20px; text-align: center; color: white;">
            <h1>Login Detected</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>A new login to your FB account has been detected.</p>
            <div style="margin-top: 30px; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196F3;">
              <p><strong>Login Details:</strong></p>
              <p>Time: ${new Date().toLocaleString()}</p>
              <p>Email: ${userEmail}</p>
            </div>
            <p style="margin-top: 20px;">If this wasn't you, please secure your account immediately.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              © 2025 FB Blog Platform. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Login notification email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending login email:', error);
  }
};

// Send update notification email
exports.sendUpdateEmail = async (userEmail, userName, updatedFields) => {
  try {
    const fieldsList = Object.keys(updatedFields)
      .map((key) => `<li><strong>${key}:</strong> ${updatedFields[key]}</li>`)
      .join('');

    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: 'Your FB Account Has Been Updated',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #FF9800; padding: 20px; text-align: center; color: white;">
            <h1>Account Updated</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Your account information has been successfully updated.</p>
            <div style="margin-top: 30px; padding: 15px; background-color: #fff3e0; border-left: 4px solid #FF9800;">
              <p><strong>Updated Fields:</strong></p>
              <ul style="list-style: none; padding: 0;">
                ${fieldsList}
              </ul>
            </div>
            <p style="margin-top: 20px;">If you didn't make these changes, please contact our support team immediately.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              © 2025 FB Blog Platform. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Update notification email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending update email:', error);
  }
};

// Send account deletion email
exports.sendDeletionEmail = async (userEmail, userName) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: 'Your FB Account Has Been Deleted',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f44336; padding: 20px; text-align: center; color: white;">
            <h1>Account Deleted</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Your FB account has been successfully deleted.</p>
            <div style="margin-top: 30px; padding: 15px; background-color: #ffebee; border-left: 4px solid #f44336;">
              <p><strong>Account Information:</strong></p>
              <p>Email: ${userEmail}</p>
              <p>Deletion Date: ${new Date().toLocaleString()}</p>
            </div>
            <p style="margin-top: 20px;">All your personal data has been permanently removed from our system.</p>
            <p>If you'd like to create a new account in the future, you're always welcome back!</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              © 2025 FB Blog Platform. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Deletion notification email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending deletion email:', error);
  }
};

// Send blog-related notifications
exports.sendBlogNotificationEmail = async (userEmail, userName, subject, message) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #9C27B0; padding: 20px; text-align: center; color: white;">
            <h1>Blog Notification</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>${message}</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              © 2025 FB Blog Platform. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Blog notification email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending blog notification email:', error);
  }
};

// Send password reset email with reset link
exports.sendPasswordResetEmail = async (userEmail, resetUrl) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER || 'your-email@gmail.com',
      to: userEmail,
      subject: 'Password Reset Request - FB',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #FF7043; padding: 20px; text-align: center; color: white;">
            <h1>Password Reset Request</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <p>You requested a password reset. Click the button below to create a new password.</p>
            <p style="text-align:center; margin: 20px 0;">
              <a href="${resetUrl}" style="display:inline-block; padding: 12px 20px; background: #ff7043; color: white; border-radius: 6px; text-decoration: none;">Reset Password</a>
            </p>
            <p>If you did not request this change, you can safely ignore this email.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">© 2025 FB Blog Platform</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', userEmail);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};
