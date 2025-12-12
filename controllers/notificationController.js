const Notification = require('../models/notificationModel');

// Get notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications', error: error.message });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notif.recipient.toString() !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    notif.read = true;
    await notif.save();
    res.status(200).json({ success: true, data: notif });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ success: false, message: 'Error updating notification', error: error.message });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notif.recipient.toString() !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    await notif.remove();
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification', error: error.message });
  }
};
