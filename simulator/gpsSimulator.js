// ⭐ GPS Simulator — Fake riders for demo/testing
// Emits GPS coordinates along predefined polylines via Socket.io
// Simulates multiple riders moving every 2 seconds

const { processTrip } = require('../services/ghostRouteEngine');
const { detectStopsFromPath, mergeStops } = require('../services/stopDetector');

// ── Predefined routes (Lucknow area for demo) ──
const DEMO_ROUTES = [
  {
    name: 'Route A — Connaught Place to India Gate',
    color: '#06b6d4',
    // [lat, lng] waypoints
    waypoints: [
      [28.6315, 77.2167], // Connaught Place
      [28.6280, 77.2170],
      [28.6245, 77.2175],
      [28.6210, 77.2180], // Stop — Barakhamba Road
      [28.6208, 77.2181],
      [28.6170, 77.2185],
      [28.6130, 77.2188],
      [28.6095, 77.2190], // Stop — Mandi House
      [28.6093, 77.2191],
      [28.6050, 77.2193],
      [28.6010, 77.2195],
      [28.5970, 77.2195],
      [28.5930, 77.2195], // India Gate
    ],
    stopIndices: [3, 7],
  },
  {
    name: 'Route B — Karol Bagh to Lodhi Garden',
    color: '#f59e0b',
    waypoints: [
      [28.6520, 77.1900], // Karol Bagh
      [28.6480, 77.1940],
      [28.6440, 77.1980],
      [28.6400, 77.2020], // Stop — Patel Nagar
      [28.6398, 77.2022],
      [28.6350, 77.2060],
      [28.6300, 77.2100],
      [28.6250, 77.2130], // Stop — Gole Market
      [28.6248, 77.2132],
      [28.6200, 77.2160],
      [28.6150, 77.2185],
      [28.6100, 77.2210],
      [28.5920, 77.2270], // Lodhi Garden
    ],
    stopIndices: [3, 7],
  },
  {
    name: 'Route C — ISBT to Pragati Maidan',
    color: '#8b5cf6',
    waypoints: [
      [28.6670, 77.2280], // ISBT Kashmere Gate
      [28.6620, 77.2275],
      [28.6570, 77.2260],
      [28.6520, 77.2245], // Stop — Old Delhi Railway Stn
      [28.6518, 77.2243],
      [28.6460, 77.2230],
      [28.6400, 77.2220],
      [28.6340, 77.2210], // Stop — Delhi Gate
      [28.6338, 77.2208],
      [28.6280, 77.2200],
      [28.6220, 77.2195],
      [28.6160, 77.2200],
      [28.6120, 77.2380], // Pragati Maidan
    ],
    stopIndices: [3, 7],
  },
];

// Interpolate between two points for smoother movement
function interpolate(p1, p2, fraction) {
  return [
    p1[0] + (p2[0] - p1[0]) * fraction,
    p1[1] + (p2[1] - p1[1]) * fraction,
  ];
}

// Add slight randomness to simulate GPS jitter (±0.0001 degrees ≈ ±10m)
function addJitter(lat, lng, amount = 0.00008) {
  return [
    lat + (Math.random() - 0.5) * amount,
    lng + (Math.random() - 0.5) * amount,
  ];
}

// Generate smooth path with interpolated points between waypoints
function generateSmoothPath(waypoints, pointsPerSegment = 4) {
  const path = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    for (let j = 0; j < pointsPerSegment; j++) {
      const fraction = j / pointsPerSegment;
      const [lat, lng] = interpolate(waypoints[i], waypoints[i + 1], fraction);
      const [jLat, jLng] = addJitter(lat, lng);
      path.push([jLat, jLng]);
    }
  }
  // Add final point
  const [fLat, fLng] = addJitter(
    waypoints[waypoints.length - 1][0],
    waypoints[waypoints.length - 1][1]
  );
  path.push([fLat, fLng]);
  return path;
}

class GpsSimulator {
  constructor(io) {
    this.io = io;
    this.riders = [];
    this.interval = null;
    this.isRunning = false;
    this.tripData = new Map(); // riderId → GPS points array
  }

  // Start simulation with N riders
  start(riderCount = 5) {
    if (this.isRunning) {
      console.log('⚠️ Simulator already running');
      return;
    }

    this.riders = [];
    this.tripData.clear();

    // Create riders distributed across demo routes
    for (let i = 0; i < riderCount; i++) {
      const route = DEMO_ROUTES[i % DEMO_ROUTES.length];
      const path = generateSmoothPath(route.waypoints);
      const riderId = `sim-rider-${i + 1}`;

      // Randomize starting position slightly
      const startOffset = Math.floor(Math.random() * Math.min(5, path.length));

      this.riders.push({
        id: riderId,
        name: `Rider ${i + 1}`,
        role: i < 2 ? 'driver' : 'commuter', // First 2 are drivers
        routeName: route.name,
        path,
        currentIndex: startOffset,
        direction: 1, // 1 = forward, -1 = reverse
        speed: 8 + Math.random() * 7, // 8-15 m/s (~30-55 km/h)
        isAtStop: false,
        stopTimer: 0,
        stopIndices: route.stopIndices.map(
          (si) => si * 4 // Scale by pointsPerSegment
        ),
      });

      this.tripData.set(riderId, []);
    }

    this.isRunning = true;

    // Emit positions every 2 seconds
    this.interval = setInterval(() => this._tick(), 2000);

    console.log(`🎮 Simulator started with ${riderCount} riders`);
    console.log(
      `   Routes: ${DEMO_ROUTES.map((r) => r.name).join(', ')}`
    );

    // Notify connected clients
    this.io.emit('simulator:started', {
      riderCount,
      routes: DEMO_ROUTES.map((r) => r.name),
    });
  }

  // Stop simulation and process trips
  async stop() {
    if (!this.isRunning) return;

    clearInterval(this.interval);
    this.isRunning = false;

    console.log('🛑 Simulator stopped — processing trips...');

    try {
      // Process each rider's trip through the Ghost Route Engine
      for (const rider of this.riders) {
        const tripPoints = this.tripData.get(rider.id) || [];
        if (tripPoints.length < 5) continue;

        const tripCoords = tripPoints.map((p) => [p.lat, p.lng]);
        const result = await processTrip(rider.id, `sim-${rider.id}`, tripCoords);

        // Detect stops
        const stops = detectStopsFromPath(tripPoints);
        if (result.route && stops.length > 0) {
          result.route.stops = mergeStops(result.route.stops || [], stops);
          await result.route.save();
        }

        console.log(
          `   ${rider.name}: ${tripPoints.length} points → ${
            result.isNew ? 'NEW route' : 'merged'
          } ${result.route?.name || ''}`
        );
      }
    } catch (err) {
      console.error('Error processing simulator trips:', err.message);
    }

    // Remove simulated riders from the map
    for (const rider of this.riders) {
      this.io.emit('gps:user-disconnected', { socketId: rider.id });
    }

    // Broadcast updated routes
    try {
      const { getConfirmedRoutes } = require('../services/ghostRouteEngine');
      const routes = await getConfirmedRoutes();
      this.io.emit('routes:updated', routes);
    } catch (err) {
      console.error('Error fetching routes after sim:', err.message);
    }

    this.riders = [];
    this.tripData.clear();

    this.io.emit('simulator:stopped');
    console.log('✅ Simulator trips processed');
  }

  // Internal tick — move all riders
  _tick() {
    for (const rider of this.riders) {
      // Check if at a stop
      if (rider.isAtStop) {
        rider.stopTimer -= 2000;
        if (rider.stopTimer <= 0) {
          rider.isAtStop = false;
        }
        // Still emit position (speed = 0) while at stop
        const pos = rider.path[rider.currentIndex];
        this._emitPosition(rider, pos[0], pos[1], 0);
        continue;
      }

      // Move to next point
      rider.currentIndex += rider.direction;

      // Bounce at ends of path
      if (rider.currentIndex >= rider.path.length) {
        rider.direction = -1;
        rider.currentIndex = rider.path.length - 2;
      } else if (rider.currentIndex < 0) {
        rider.direction = 1;
        rider.currentIndex = 1;
      }

      const pos = rider.path[rider.currentIndex];

      // Check if at a stop
      if (rider.stopIndices.includes(rider.currentIndex)) {
        rider.isAtStop = true;
        rider.stopTimer = 6000 + Math.random() * 8000; // Stop for 6-14 seconds
        this._emitPosition(rider, pos[0], pos[1], 0);
      } else {
        // Normal movement
        const speed = rider.speed + (Math.random() - 0.5) * 3;
        this._emitPosition(rider, pos[0], pos[1], speed);
      }
    }
  }

  // Emit a position update for a rider
  _emitPosition(rider, lat, lng, speed) {
    const userInfo = {
      socketId: rider.id,
      userId: rider.id,
      name: rider.name,
      role: rider.role,
      position: {
        lat,
        lng,
        speed,
        heading: 0,
        accuracy: 5 + Math.random() * 10,
      },
      lastUpdate: Date.now(),
      isSimulated: true,
    };

    // Store for trip processing
    const tripPoints = this.tripData.get(rider.id);
    if (tripPoints) {
      tripPoints.push({
        lat,
        lng,
        speed,
        heading: 0,
        timestamp: Date.now(),
      });
    }

    // Broadcast to all connected clients
    this.io.emit('gps:user-position', userInfo);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      riderCount: this.riders.length,
      riders: this.riders.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        route: r.routeName,
        progress: `${r.currentIndex}/${r.path.length}`,
      })),
    };
  }
}

module.exports = GpsSimulator;
