const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

// Get notifications for current user
router.get('/', auth, notificationController.getNotifications);

// Mark as read
router.put('/:id/read', auth, notificationController.markAsRead);

// Delete notification
router.delete('/:id', auth, notificationController.deleteNotification);

module.exports = router;
