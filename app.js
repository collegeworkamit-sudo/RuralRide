const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { setupGpsHandler } = require('./socket/gpsHandler');
const GpsSimulator = require('./simulator/gpsSimulator');
const { seedCoupons } = require('./services/rewardsService');

// Load env variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const routeRoutes = require('./routes/routes');
const rewardRoutes = require('./routes/rewards');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize simulator (will be started via API)
const simulator = new GpsSimulator(io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/rewards', rewardRoutes);

// ── Simulator API ──
app.post('/api/simulator/start', (req, res) => {
  const { riderCount = 5 } = req.body;
  simulator.start(riderCount);
  res.json({ success: true, message: `Simulator started with ${riderCount} riders` });
});

app.post('/api/simulator/stop', async (req, res) => {
  await simulator.stop();
  res.json({ success: true, message: 'Simulator stopped, trips processed' });
});

app.get('/api/simulator/status', (req, res) => {
  res.json({ success: true, ...simulator.getStatus() });
});

// Setup Socket.io GPS handler
setupGpsHandler(io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();
  await seedCoupons();
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io ready for connections`);
    console.log(`🎮 Simulator available at POST /api/simulator/start`);
    console.log(`🎟️  Coupons & rewards system active`);
  });
};

startServer();
