const User = require('../models/userModel');
const emailService = require('../services/emailService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Create a new user
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;
    const emailKey = String(email || '').trim().toLowerCase();

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: emailKey });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password before saving
    const saltRounds = 10;
    const hashed = await bcrypt.hash(password, saltRounds);

    // Normalize phone to +91XXXXXXXXXX when provided
    let formattedPhone = undefined;
    if (phone) {
      // Strip non-digit chars and normalize
      const digitsOnly = String(phone).replace(/\D/g, '');
      if (/^\d{10}$/.test(digitsOnly)) {
        formattedPhone = '+91' + digitsOnly;
      } else if (/^91\d{10}$/.test(digitsOnly)) {
        formattedPhone = '+' + digitsOnly;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid phone format. Use 10 digits (optionally prefixed with 91).' });
      }
    }

    // Create new user
    const user = new User({
      name,
      email: emailKey,
      password: hashed,
      phone: formattedPhone,
      address,
    });

    await user.save();

    // Send registration email
    await emailService.sendRegistrationEmail(emailKey, name);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    console.error('createUser error:', error);
    // If it's a Mongo duplicate error, return 400 with friendly message
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    // Handle Mongoose validation errors gracefully
    if (error?.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((e) => e.message).join('; ');
      return res.status(400).json({ success: false, message: messages || 'Validation failed' });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error?.message || String(error),
    });
  }
};

// User login
exports.loginUser = async (req, res) => {
  try {
    let { email, password } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Normalize email before lookup (trim + lowercase) to avoid case mismatch
    const emailKey = String(email).trim().toLowerCase();
    email = emailKey;

    // Check if user exists
    const user = await User.findOne({ email: emailKey });
    if (!user) {
      console.warn('Failed login: user not found', { email: emailKey, ip });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // If the account was created by OAuth / phone or the password field is not present
    const pwString = String(user.password || '');
    const isOauthAccount = pwString.startsWith('oauth_') || pwString === '';
    if (isOauthAccount) {
      console.warn('Failed login attempt on oauth/phone-only account', { email: emailKey, ip });
      return res.status(401).json({
        success: false,
        message: 'Account does not support password login. Try signing in with Google, GitHub, or mobile OTP or reset your password.',
      });
    }

    // Check password using bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.warn('Failed login: incorrect password', { email: emailKey, ip });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Send login email
    await emailService.sendLoginEmail(user.email, user.name);

    // Sign JWT token (valid for 7 days)
    const jwtSecret = process.env.JWT_SECRET || process.env.jwt || 'dev_jwt_secret_change_me';
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Return sanitized user (avoid returning password)
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Set token as HttpOnly cookie and return user details only
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: safeUser,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message,
    });
  }
};

// POST /logout - clear auth cookie
exports.logoutUser = async (req, res) => {
  try {
    res.clearCookie('token');
    return res.status(200).json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('logoutUser error:', error);
    return res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

// DEV only: Find a user by email or phone for debugging (no sensitive data returned)
exports.findUserForDev = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ success: false, message: 'Not allowed in production' });
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.CLEAR_DB_SECRET) return res.status(401).json({ success: false, message: 'Invalid admin secret' });

    const { email, phone } = req.query;
    if (!email && !phone) return res.status(400).json({ success: false, message: 'Provide query param email or phone' });

    const query = {};
    if (email) query.email = String(email).trim().toLowerCase();
    if (phone) query.phone = String(phone);

    const user = await User.findOne(query).select('_id name email phone avatar githubId googleId createdAt password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const pwString = String(user.password || '');
    const isOauth = pwString.startsWith('oauth_') || pwString === '';

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email || null,
        phone: user.phone || null,
        oauth: isOauth,
        oauthProviders: { github: Boolean(user.githubId), google: Boolean(user.googleId) },
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error finding user', error: error.message });
  }
};

// DEV only: Set password for a user by email (for testing) - requires admin secret
exports.setPasswordForDev = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ success: false, message: 'Not allowed in production' });
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.CLEAR_DB_SECRET) return res.status(401).json({ success: false, message: 'Invalid admin secret' });

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Please provide email and new password' });

    const emailKey = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: emailKey });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const saltRounds = 10;
    const hashed = await bcrypt.hash(password, saltRounds);
    user.password = hashed;
    await user.save();

    res.status(200).json({ success: true, message: 'Password set for user' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error setting password', error: error.message });
  }
};

// Clear all users (DEV ONLY) - Protected by env secret and not allowed in production
exports.clearAllUsers = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' });
    }
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.CLEAR_DB_SECRET) {
      return res.status(401).json({ success: false, message: 'Invalid admin secret' });
    }
    const result = await User.deleteMany({});
    res.status(200).json({ success: true, message: 'All users removed', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error clearing users', error: error.message });
  }
};

// Search users by name or email
exports.searchUsers = async (req, res) => {
  try {
    const { search } = req.query;
    
    if (!search || search.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a search query',
      });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    }).select('_id name email avatar').limit(20);

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching users',
      error: error.message,
    });
  }
};

// Get all users emails
exports.getAllUsersEmails = async (req, res) => {
  try {
    const users = await User.find().select('email name');
    
    const emails = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      count: emails.length,
      data: emails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user emails',
      error: error.message,
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message,
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, address, isActive } = req.body;

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Track updated fields
    const updatedFields = {};
    if (name && name !== user.name) updatedFields.name = name;
    if (email && email !== user.email) updatedFields.email = email;
    if (phone && phone !== user.phone) updatedFields.phone = phone;
    if (address && address !== user.address) updatedFields.address = address;
    if (isActive !== undefined && isActive !== user.isActive) updatedFields.isActive = isActive;

    user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, address, isActive },
      { new: true, runValidators: true }
    );

    // Send update email if there were changes
    if (Object.keys(updatedFields).length > 0) {
      await emailService.sendUpdateEmail(user.email, user.name, updatedFields);
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message,
    });
  }
};

// OAuth handlers removed — application only supports email/password and mobile OTP now.

// Mobile number authentication - send OTP
exports.sendMobileOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    // Add +91 prefix if not present
    let formattedPhone = phone;
    if (!phone.startsWith('+91')) {
      formattedPhone = '+91' + phone.replace(/^91/, '');
    }

    // Validate phone format (10 digits after country code)
    const phoneDigits = formattedPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 12 || !phoneDigits.startsWith('91')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP temporarily (in production, use Redis with expiry)
    global.otpStore = global.otpStore || {};
    global.otpStore[formattedPhone] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    // In production, send via SMS service (Twilio, AWS SNS, etc.)
    console.log(`OTP for ${formattedPhone}: ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      phone: formattedPhone,
      // For testing only - remove in production
      otp,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

// Mobile number authentication - verify OTP and create/login user
exports.verifyMobileOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }

    // Add +91 prefix if not present
    let formattedPhone = phone;
    if (!phone.startsWith('+91')) {
      formattedPhone = '+91' + phone.replace(/^91/, '');
    }

    // Verify OTP
    const storedOTP = global.otpStore?.[formattedPhone];
    if (!storedOTP || storedOTP.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    if (storedOTP.expiresAt < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired',
      });
    }

    // Clear OTP
    delete global.otpStore[formattedPhone];

    // Find or create user by phone
    let user = await User.findOne({ phone: formattedPhone });

    if (!user) {
      // Create new user with phone
      user = new User({
        name: `User ${formattedPhone}`,
        phone: formattedPhone,
        password: 'oauth_phone', // Placeholder for phone auth users
      });
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, phone: user.phone },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Phone authentication successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: error.message,
    });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Send deletion email
    await emailService.sendDeletionEmail(user.email, user.name);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message,
    });
  }
};

// POST /forgot-password
// Adds basic per-email and per-IP rate limiting to avoid abuse.
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    // Rate limit: per-email and per-ip
    // Initialize the in-memory stores as needed
    global.resetRequestStore = global.resetRequestStore || { byEmail: new Map(), byIp: new Map() };
    const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
    const EMAIL_MAX_PER_WINDOW = 5;
    const IP_MAX_PER_WINDOW = 20;

    function _cleanupTimestamps(arr, windowMs) {
      const cutoff = Date.now() - windowMs;
      while (arr.length && arr[0] < cutoff) arr.shift();
    }

    function _incrementAndCheck(emailKey, ipKey) {
      const now = Date.now();

      const emailArr = global.resetRequestStore.byEmail.get(emailKey) || [];
      _cleanupTimestamps(emailArr, RATE_LIMIT_WINDOW_MS);
      emailArr.push(now);
      global.resetRequestStore.byEmail.set(emailKey, emailArr);
      if (emailArr.length > EMAIL_MAX_PER_WINDOW) {
        return { allowed: false, reason: 'Too many password reset requests for this email. Try again later.' };
      }

      const ipArr = global.resetRequestStore.byIp.get(ipKey) || [];
      _cleanupTimestamps(ipArr, RATE_LIMIT_WINDOW_MS);
      ipArr.push(now);
      global.resetRequestStore.byIp.set(ipKey, ipArr);
      if (ipArr.length > IP_MAX_PER_WINDOW) {
        return { allowed: false, reason: 'Too many requests from this IP. Try again later.' };
      }

      return { allowed: true };
    }

    const emailKey = String(email).trim().toLowerCase();
    const ipKey = String(ip || 'unknown');
    const rate = _incrementAndCheck(emailKey, ipKey);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: rate.reason });
    }

    const user = await User.findOne({ email: emailKey });
    // Avoid disclosing whether the email exists. Only generate + send token for existing users.
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    // Generate a secure token and store a hashed version in DB
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(expires);
    await user.save();

    // Build reset URL and send email
    const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:8080';
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}&id=${encodeURIComponent(String(user._id))}`;

    try {
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (e) {
      console.warn('Failed to send reset email (non-blocking):', e);
    }

    return res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('forgot-password error', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { token, id, newPassword } = req.body;
    if (!token || !id || !newPassword) return res.status(400).json({ success: false, message: 'Token, user id and new password are required' });

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

    const user = await User.findOne({ _id: id, resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    // Prevent user from using the same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the old password' });
    }

    // Hash new password and update user
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Optionally: send confirmation email
    try { await emailService.sendUpdateEmail(user.email, user.name, { password: 'updated' }); } catch (e) { console.warn('Failed to send confirmation email', e); }

    return res.status(200).json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('reset-password error', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
