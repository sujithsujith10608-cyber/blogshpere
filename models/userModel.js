const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      sparse: true,
      lowercase: true,
      match: /.+\@.+\..+/,
    },
    password: {
      type: String,
      trim: true,
    },
      // Password reset fields
      resetPasswordToken: {
        type: String,
        default: null,
      },
      resetPasswordExpires: {
        type: Date,
        default: null,
      },
    phone: {
      type: String,
      sparse: true,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Phone is optional
          // Accept +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX (10 digits)
          return /^(?:\+91|91)?\d{10}$/.test(v);
        },
        message: 'Phone number must be 10 digits (optionally prefixed with 91 or +91)',
      },
    },
    avatar: {
      type: String,
      default: null,
    },
    githubId: {
      type: String,
      sparse: true,
    },
    googleId: {
      type: String,
      sparse: true,
    },
    address: String,
    bio: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
