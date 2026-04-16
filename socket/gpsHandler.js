// ⭐ GPS Handler — Real-time GPS streaming + Ghost Route detection
const GpsLog = require('../models/GpsLog');
const { processTrip } = require('../services/ghostRouteEngine');
const { detectStopsFromPath, mergeStops } = require('../services/stopDetector');
const { getConfirmedRoutes } = require('../services/ghostRouteEngine');

// In-memory stores
const activeUsers = new Map();
const tripBuffers = new Map(); // socketId → array of GPS points for current trip

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

      const userInfo = {
        socketId: socket.id,
        userId: socket.userId || socket.id,
        name: socket.userName || 'Anonymous',
        role: socket.userRole || 'commuter',
        position: { lat, lng, speed, heading, accuracy },
        lastUpdate: Date.now(),
      };

      activeUsers.set(socket.id, userInfo);

      // If user has an active trip, buffer the GPS point
      if (tripBuffers.has(socket.id)) {
        tripBuffers.get(socket.id).push({
          lat,
          lng,
          speed: speed || 0,
          heading: heading || 0,
          timestamp: Date.now(),
        });
      }

      // Broadcast position to others
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

    // Client starts a trip — begin buffering GPS data
    socket.on('trip:start', () => {
      tripBuffers.set(socket.id, []);
      console.log(`🚗 Trip started: ${socket.userName || socket.id}`);

      socket.broadcast.emit('trip:user-started', {
        socketId: socket.id,
        userId: socket.userId,
        name: socket.userName || 'Anonymous',
        role: socket.userRole,
      });
    });

    // Client ends a trip — process the buffered GPS data through engines
    socket.on('trip:end', async () => {
      const tripPoints = tripBuffers.get(socket.id) || [];
      tripBuffers.delete(socket.id);

      console.log(
        `🏁 Trip ended: ${socket.userName || socket.id} — ${tripPoints.length} GPS points`
      );

      if (tripPoints.length < 5) {
        socket.emit('trip:result', {
          success: false,
          message: 'Trip too short (need at least 5 GPS points)',
        });
        return;
      }

      // Convert to [lat, lng] coords for the ghost route engine
      const tripCoords = tripPoints.map((p) => [p.lat, p.lng]);

      // 1. Process through Ghost Route Engine
      const routeResult = await processTrip(
        socket.userId || socket.id,
        `session-${socket.id}-${Date.now()}`,
        tripCoords
      );

      // 2. Detect stops from the trip
      const detectedStops = detectStopsFromPath(tripPoints);

      // 3. If a route was found/created, merge stops into it
      if (routeResult.route && detectedStops.length > 0) {
        routeResult.route.stops = mergeStops(
          routeResult.route.stops || [],
          detectedStops
        );
        await routeResult.route.save();
      }

      // 4. Save GPS log to database
      try {
        const sessionId = `session-${socket.id}-${Date.now()}`;
        for (const point of tripPoints) {
          await GpsLog.create({
            userId: socket.userId || socket.id,
            coordinates: [point.lng, point.lat],
            speed: point.speed,
            heading: point.heading,
            sessionId,
          });
        }
      } catch (err) {
        console.error('Error saving GPS logs:', err.message);
      }

      // 5. Send result back to the user
      socket.emit('trip:result', {
        success: true,
        route: routeResult.route
          ? {
              _id: routeResult.route._id,
              name: routeResult.route.name,
              userCount: routeResult.route.userCount,
              confidence: routeResult.route.confidence,
              stopsCount: routeResult.route.stops?.length || 0,
            }
          : null,
        isNewRoute: routeResult.isNew,
        stopsDetected: detectedStops.length,
        pointsLogged: tripPoints.length,
      });

      // 6. Broadcast updated routes to all clients
      const allRoutes = await getConfirmedRoutes();
      io.emit('routes:updated', allRoutes);

      socket.broadcast.emit('trip:user-ended', {
        socketId: socket.id,
      });
    });

    // Client requests current routes
    socket.on('routes:get', async () => {
      const routes = await getConfirmedRoutes();
      socket.emit('routes:updated', routes);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.userName || socket.id}`);
      activeUsers.delete(socket.id);
      tripBuffers.delete(socket.id);

      socket.broadcast.emit('gps:user-disconnected', {
        socketId: socket.id,
      });
    });
  });

  // Cleanup stale users every 30 seconds
  setInterval(() => {
    const now = Date.now();
    activeUsers.forEach((user, id) => {
      if (now - user.lastUpdate > 60000) {
        activeUsers.delete(id);
        io.emit('gps:user-disconnected', { socketId: id });
      }
    });
  }, 30000);

  console.log('📡 GPS Socket handler initialized');
}

module.exports = { setupGpsHandler };
