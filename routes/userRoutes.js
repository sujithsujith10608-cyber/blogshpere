const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

// Authentication routes
router.post('/register', userController.createUser);
router.post('/login', userController.loginUser);
router.post('/logout', userController.logoutUser);
// Password reset flow
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// OAuth routes disabled/removed

// Mobile authentication routes
router.post('/auth/mobile/send-otp', userController.sendMobileOTP);
router.post('/auth/mobile/verify-otp', userController.verifyMobileOTP);

// User routes
router.get('/search', userController.searchUsers);
router.get('/all', userController.getAllUsers);
router.get('/emails/all', userController.getAllUsersEmails);
router.get('/:id', userController.getUserById);
router.put('/update/:id', userController.updateUser);
router.delete('/delete/:id', userController.deleteUser);
// DEV: Clear all users (protected)
router.delete('/__dev/clear-users', userController.clearAllUsers);
// DEV: Find a user by email/phone
router.get('/__dev/find', userController.findUserForDev);
router.post('/__dev/set-password', userController.setPasswordForDev);

module.exports = router;
