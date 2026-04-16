// ⭐ GPS Handler — Real-time GPS streaming via Socket.io
// Receives GPS from all clients, broadcasts to all connected users

// In-memory store of active users' positions
const activeUsers = new Map();

function setupGpsHandler(io) {
  io.on('connection', (socket) => {
    console.log(`📡 Client connected: ${socket.id}`);

    // Client sends their user info on connect
    socket.on('user:identify', (data) => {
      const { userId, name, role } = data;
      socket.userId = userId;
      socket.userName = name;
      socket.userRole = role;
      console.log(`👤 Identified: ${name} (${role}) — ${socket.id}`);
    });

    // Client sends GPS position update
    socket.on('gps:update', (data) => {
      const { lat, lng, speed, heading, accuracy } = data;

      if (!lat || !lng) return;

      // Store in active users map
      const userInfo = {
        socketId: socket.id,
        userId: socket.userId || socket.id,
        name: socket.userName || 'Anonymous',
        role: socket.userRole || 'commuter',
        position: { lat, lng, speed, heading, accuracy },
        lastUpdate: Date.now(),
      };

      activeUsers.set(socket.id, userInfo);

      // Broadcast this user's position to everyone EXCEPT the sender
      socket.broadcast.emit('gps:user-position', userInfo);
    });

    // Client requests all currently active users
    socket.on('gps:get-active-users', () => {
      const users = [];
      activeUsers.forEach((user, id) => {
        if (id !== socket.id) {
          users.push(user);
        }
      });
      socket.emit('gps:active-users', users);
    });

    // Client starts a ride/trip
    socket.on('trip:start', (data) => {
      const { userId, role } = data;
      console.log(`🚗 Trip started: ${socket.userName || userId} (${role})`);
      socket.broadcast.emit('trip:user-started', {
        socketId: socket.id,
        userId: socket.userId || userId,
        name: socket.userName || 'Anonymous',
        role: role || socket.userRole,
      });
    });

    // Client ends a ride/trip
    socket.on('trip:end', (data) => {
      console.log(`🏁 Trip ended: ${socket.userName || socket.id}`);
      socket.broadcast.emit('trip:user-ended', {
        socketId: socket.id,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.userName || socket.id}`);
      activeUsers.delete(socket.id);

      // Notify others that this user left
      socket.broadcast.emit('gps:user-disconnected', {
        socketId: socket.id,
      });
    });
  });

  // Cleanup stale users every 30 seconds (no update for 60s = stale)
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 60000; // 60 seconds
    activeUsers.forEach((user, id) => {
      if (now - user.lastUpdate > staleThreshold) {
        activeUsers.delete(id);
        io.emit('gps:user-disconnected', { socketId: id });
      }
    });
  }, 30000);

  console.log('📡 GPS Socket handler initialized');
}

module.exports = { setupGpsHandler };
