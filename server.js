require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dns = require('dns').promises;
const { EventEmitter } = require('events');

const app = express();

/* =========================
   CONFIG
========================= */

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/fb';

const CORS_ALLOWED_ORIGIN =
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  'http://localhost:8080';

/* =========================
   MIDDLEWARE
========================= */

app.use(cors({
  origin: CORS_ALLOWED_ORIGIN,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

/* =========================
   REAL-TIME (SSE)
========================= */

const eventEmitter = new EventEmitter();
const clients = new Set();

global.broadcastEvent = function (type, data) {
  const payload = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  clients.forEach(res => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      clients.delete(res);
    }
  });

  console.log(`📡 Event broadcasted: ${type}`);
};

/* =========================
   MONGODB CONNECTION
========================= */

mongoose.set('strictQuery', true);

function maskMongoURI(uri) {
  return uri.replace(/:(?:[^@]+)@/, ':*****@');
}

async function checkMongoSrv(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;

  const host = uri
    .replace('mongodb+srv://', '')
    .split('/')[0]
    .split('@')
    .pop();

  const srv = `_mongodb._tcp.${host}`;
  const records = await dns.resolveSrv(srv);

  console.log(
    `SRV records found for ${host}:`,
    records.map(r => `${r.name}:${r.port}`)
  );
}

(async () => {
  try {
    console.log(`🔌 Mongo URI: ${maskMongoURI(MONGODB_URI)}`);
    await checkMongoSrv(MONGODB_URI);

    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);

    if (NODE_ENV !== 'development') {
      process.exit(1);
    }
  }
})();

/* =========================
   ROUTES
========================= */

app.get('/', (req, res) => {
  res.json({
    message: 'Server running',
    env: NODE_ENV,
    dbState: mongoose.connection.readyState,
    realtimeClients: clients.size,
  });
});

/* ===== SSE ENDPOINT ===== */

app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', CORS_ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  clients.add(res);
  console.log(`✅ SSE client connected (${clients.size})`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`❌ SSE client disconnected (${clients.size})`);
  });
});

/* =========================
   DEBUG (DEV ONLY)
========================= */

if (NODE_ENV !== 'production') {
  app.get('/__debug/env', (req, res) => {
    res.json({
      nodeEnv: NODE_ENV,
      mongoHost: maskMongoURI(MONGODB_URI),
      corsOrigin: CORS_ALLOWED_ORIGIN,
    });
  });
}

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: NODE_ENV === 'development' ? err.message : undefined,
  });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 CORS origin: ${CORS_ALLOWED_ORIGIN}`);
});

module.exports = app;
