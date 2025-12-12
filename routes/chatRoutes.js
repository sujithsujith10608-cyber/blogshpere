const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const chatController = require('../controllers/chatController');

// Get all chats for current user
router.get('/', auth, chatController.getAllChats);

// Get or create chat with a participant
router.get('/with/:participantId', auth, chatController.getOrCreateChat);

// Get specific chat with messages
router.get('/:chatId', auth, chatController.getChat);

// Send a message in a chat
router.post('/:chatId/messages', auth, chatController.sendMessage);

// Mark message as read
router.put('/:chatId/messages/:messageId/read', auth, chatController.markMessageAsRead);

// Typing indicators
router.post('/:chatId/typing-start', auth, chatController.typingStart);
router.post('/:chatId/typing-stop', auth, chatController.typingStop);

// Delete chat
router.delete('/:chatId', auth, chatController.deleteChat);

module.exports = router;
