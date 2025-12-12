const Chat = require('../models/chatModel');
const User = require('../models/userModel');
const mongoose = require('mongoose');

// Get or create chat between two users
exports.getOrCreateChat = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { participantId } = req.params;
    console.log('🔍 getOrCreateChat Debug:', { userId, participantId });
    if (!userId) {
      console.error('No userId in getOrCreateChat');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!participantId) {
      console.error('No participantId provided');
      return res.status(400).json({ success: false, message: 'Missing participantId' });
    }

    // Validate participantId format
    if (!mongoose.Types.ObjectId.isValid(participantId)) {
      console.error('Invalid participantId format:', participantId);
      return res.status(400).json({ success: false, message: 'Invalid participantId' });
    }

    if (userId === participantId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat with yourself',
      });
    }

    // Find existing chat between the two users
    let chat = await Chat.findOne({
      participants: { $all: [userId, participantId] },
    })
      .populate('participants', 'name avatar email')
      .populate('messages.sender', 'name avatar')
      .populate('lastMessageSender', 'name avatar');

    if (!chat) {
      // Create new chat
      chat = new Chat({
        participants: [userId, participantId],
        messages: [],
      });
      await chat.save();
      await chat.populate('participants', 'name avatar email');
    }

    res.status(200).json({
      success: true,
      data: chat,
    });
  } catch (error) {
    console.error('Error getting/creating chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting chat',
      error: error.message,
    });
  }
};

// Get all chats for current user
exports.getAllChats = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'name avatar email')
      .populate('lastMessageSender', 'name avatar')
      .sort({ lastMessageTime: -1, createdAt: -1 });

    // Calculate unread count for each chat
    const chatsWithUnreadCount = chats.map(chat => {
      const unreadCount = chat.messages.filter(msg => !msg.read && msg.sender.toString() !== userId).length;
      return {
        ...chat.toObject(),
        unreadCount
      };
    });

    res.status(200).json({
      success: true,
      data: chatsWithUnreadCount,
    });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chats',
      error: error.message,
    });
  }
};

// Get single chat with messages
exports.getChat = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chat = await Chat.findById(chatId)
      .populate('participants', 'name avatar email')
      .populate('messages.sender', 'name avatar')
      .populate('lastMessageSender', 'name avatar');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant
    console.log('🔑 Participant check:', {
      userId,
      participants: chat.participants.map(p => p._id.toString()),
      isParticipant: chat.participants.some((p) => p._id.toString() === userId),
    });

    if (!chat.participants.some((p) => p._id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat',
      });
    }

    res.status(200).json({
      success: true,
      data: chat,
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat',
      error: error.message,
    });
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId } = req.params;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty',
      });
    }

    let chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant - compare using string format
    const userParticipates = chat.participants.some((p) => p.toString() === userId);
    console.log('📨 Send message auth check:', {
      userId,
      participantIds: chat.participants.map(p => p.toString()),
      isParticipant: userParticipates,
    });

    if (!userParticipates) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this chat',
      });
    }

    // Add message
    const newMessage = {
      sender: userId,
      content: content.trim(),
      read: false,
    };

    chat.messages.push(newMessage);
    chat.lastMessage = content.trim();
    chat.lastMessageTime = new Date();
    chat.lastMessageSender = userId;

    await chat.save();

    // Populate the response
    await chat.populate('participants', 'name avatar email');
    await chat.populate('messages.sender', 'name avatar');

    // Get the newly added message for broadcast
    const messageId = chat.messages[chat.messages.length - 1]._id;
    const sender = await User.findById(userId).select('name avatar');

    res.status(201).json({
      success: true,
      message: 'Message sent',
      data: {
        chatId: chat._id.toString(),
        message: {
          _id: messageId,
          sender: { _id: userId, name: sender?.name, avatar: sender?.avatar },
          content: newMessage.content,
          createdAt: new Date().toISOString(),
          read: false,
        },
      },
    });

    // Broadcast real-time message event
    if (global.broadcastEvent) {
      global.broadcastEvent('message:sent', {
        chatId: chat._id.toString(),
        messageId: messageId.toString(),
        sender: {
          id: userId,
          name: sender?.name,
          avatar: sender?.avatar,
        },
        content: newMessage.content,
        participants: chat.participants.map((p) => p._id?.toString() || p.toString()),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message,
    });
  }
};

// Mark message as read
exports.markMessageAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId, messageId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    const message = chat.messages.id(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    message.read = true;
    message.readAt = new Date();
    await chat.save();

    // Broadcast read receipt
    if (global.broadcastEvent) {
      global.broadcastEvent('message:read', {
        chatId: chatId,
        messageId: messageId,
        readBy: userId,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
      data: message,
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: error.message,
    });
  }
};

// Delete chat
exports.deleteChat = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant
    const userIsParticipant = chat.participants.some((p) => p.toString() === userId);
    console.log('🗑️ Delete chat auth check:', {
      userId,
      participantIds: chat.participants.map(p => p.toString()),
      isParticipant: userIsParticipant,
    });

    if (!userIsParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this chat',
      });
    }

    // Remove user from participants (soft delete)
    chat.participants = chat.participants.filter((p) => p.toString() !== userId);

    // If no participants left, delete the chat entirely
    if (chat.participants.length === 0) {
      await Chat.findByIdAndDelete(chatId);
    } else {
      await chat.save();
    }

    res.status(200).json({
      success: true,
      message: 'Chat deleted',
    });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat',
      error: error.message,
    });
  }
};

// Typing start indicator
exports.typingStart = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant
    if (!chat.participants.some((p) => p.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized in this chat',
      });
    }

    // Get user details
    const User = require('../models/userModel');
    const user = await User.findById(userId).select('name avatar');

    // Broadcast typing:start event
    global.broadcastEvent('typing:start', {
      userId,
      chatId,
      userName: user?.name,
      userAvatar: user?.avatar,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Typing started',
    });
  } catch (error) {
    console.error('Error in typing start:', error);
    res.status(500).json({
      success: false,
      message: 'Error in typing start',
      error: error.message,
    });
  }
};

// Typing stop indicator
exports.typingStop = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant
    if (!chat.participants.some((p) => p.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized in this chat',
      });
    }

    // Broadcast typing:stop event
    global.broadcastEvent('typing:stop', {
      userId,
      chatId,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Typing stopped',
    });
  } catch (error) {
    console.error('Error in typing stop:', error);
    res.status(500).json({
      success: false,
      message: 'Error in typing stop',
      error: error.message,
    });
  }
};
