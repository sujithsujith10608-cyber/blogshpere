require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Import routes
const userRoutes = require('./routes/userRoutes');
const blogRoutes = require('./routes/blogRoutes');
const llmRoutes = require('./routes/llmRoutes');
const profileRoutes = require('./routes/profileRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const followSuggestionRoutes = require('./routes/followSuggestionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Middleware
// Allow configuring CORS via CORS_ORIGIN or FRONTEND_URL (fallback to Vite dev default 5173)
const CORS_ALLOWED_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:8080';
app.use(cors({
  origin: CORS_ALLOWED_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Real-time event broadcast system
const eventEmitter = new (require('events').EventEmitter)();
const clients = new Set(); // Track connected SSE clients

// Broadcast event to all connected clients
function broadcastEvent(eventType, data) {
  const eventData = {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString(),
  };

  // Send to all connected SSE clients
  clients.forEach((clientResponse) => {
    try {
      clientResponse.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch (error) {
      console.error('Error broadcasting to client:', error.message);
      clients.delete(clientResponse);
    }
  });

  console.log(`📡 Broadcasting event: ${eventType}`);
}

// Make broadcastEvent globally available
global.broadcastEvent = broadcastEvent;

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/fb';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB successfully');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/follow-suggestions', followSuggestionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);

// Real-time SSE endpoint
app.get('/api/events/stream', (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', CORS_ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', data: { message: 'Connected to real-time events' }, timestamp: new Date().toISOString() })}\n\n`);

  // Add client to set
  clients.add(res);
  console.log(`✅ Client connected. Total clients: ${clients.size}`);

  // Send heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 30000); // Every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`❌ Client disconnected. Total clients: ${clients.size}`);
  });

  req.on('error', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running', realtimeClients: clients.size });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', realtimeClients: clients.size });
});

// Global error handler for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON received:', err.message);
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      error: err.message,
    });
  }
  
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Server error',
  });
});

// Port configuration
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`CORS allowed origin: ${CORS_ALLOWED_ORIGIN}`);
  console.log(`📡 Real-time events endpoint: http://localhost:${PORT}/api/events/stream`);
});

module.exports = app;
