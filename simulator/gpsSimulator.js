// ⭐ GPS Simulator — Fake riders for demo/testing
// Emits GPS coordinates along predefined polylines via Socket.io
// Simulates multiple riders moving every 2 seconds

const { processTrip } = require('../services/ghostRouteEngine');
const { detectStopsFromPath, mergeStops } = require('../services/stopDetector');

// ── Predefined routes (Lucknow area for demo) ──
const DEMO_ROUTES = [
  {
    name: 'Route A — CP to Sarojini Nagar',
    color: '#06b6d4',
    // [lat, lng] waypoints — passes through user location
    waypoints: [
      [28.6315, 77.2167], // Connaught Place
      [28.6230, 77.2175],
      [28.6140, 77.2180],
      [28.6050, 77.2185], // Stop — Mandi House
      [28.6048, 77.2186],
      [28.5960, 77.2190],
      [28.5870, 77.2193],
      [28.5747, 77.2195], // 📍 YOUR LOCATION
      [28.5745, 77.2194],
      [28.5650, 77.2180],
      [28.5560, 77.2160],
      [28.5470, 77.2140], // Stop — Lodhi Colony
      [28.5468, 77.2139],
      [28.5380, 77.2110],
      [28.5310, 77.2080], // Sarojini Nagar
    ],
    stopIndices: [3, 11],
  },
  {
    name: 'Route B — Karol Bagh to Nehru Place',
    color: '#f59e0b',
    waypoints: [
      [28.6520, 77.1900], // Karol Bagh
      [28.6400, 77.2000],
      [28.6280, 77.2080],
      [28.6160, 77.2140], // Stop — Gole Market
      [28.6158, 77.2141],
      [28.6040, 77.2170],
      [28.5900, 77.2185],
      [28.5747, 77.2195], // 📍 YOUR LOCATION
      [28.5745, 77.2196],
      [28.5620, 77.2210], // Stop — Defence Colony
      [28.5618, 77.2211],
      [28.5500, 77.2230],
      [28.5380, 77.2250], // Nehru Place
    ],
    stopIndices: [3, 9],
  },
  {
    name: 'Route C — ISBT to AIIMS',
    color: '#8b5cf6',
    waypoints: [
      [28.6670, 77.2280], // ISBT Kashmere Gate
      [28.6530, 77.2260],
      [28.6390, 77.2240],
      [28.6250, 77.2220], // Stop — ITO
      [28.6248, 77.2219],
      [28.6110, 77.2210],
      [28.5970, 77.2200],
      [28.5747, 77.2195], // 📍 YOUR LOCATION
      [28.5745, 77.2194],
      [28.5620, 77.2170],
      [28.5500, 77.2130], // Stop — Lajpat Nagar
      [28.5498, 77.2128],
      [28.5400, 77.2090],
      [28.5320, 77.2050], // AIIMS
    ],
    stopIndices: [3, 10],
  },
  {
    name: 'Route D — Dwarka to Lajpat Nagar',
    color: '#ef4444',
    waypoints: [
      [28.5920, 77.0500], // Dwarka
      [28.5880, 77.0800],
      [28.5840, 77.1100],
      [28.5810, 77.1400], // Stop — Janakpuri
      [28.5808, 77.1402],
      [28.5790, 77.1700],
      [28.5770, 77.1950],
      [28.5747, 77.2195], // 📍 YOUR LOCATION
      [28.5745, 77.2196],
      [28.5730, 77.2300], // Stop — Jangpura
      [28.5728, 77.2302],
      [28.5710, 77.2400],
      [28.5690, 77.2500], // Lajpat Nagar
    ],
    stopIndices: [3, 9],
  },
  {
    name: 'Route E — Noida to Hauz Khas',
    color: '#10b981',
    waypoints: [
      [28.5700, 77.3200], // Noida Sec 18
      [28.5710, 77.3000],
      [28.5720, 77.2800],
      [28.5730, 77.2600], // Stop — Mayur Vihar
      [28.5732, 77.2598],
      [28.5740, 77.2450],
      [28.5745, 77.2300],
      [28.5747, 77.2195], // 📍 YOUR LOCATION
      [28.5745, 77.2194],
      [28.5740, 77.2100],
      [28.5730, 77.2000], // Stop — Green Park
      [28.5728, 77.1998],
      [28.5720, 77.1900],
      [28.5700, 77.1800], // Hauz Khas
    ],
    stopIndices: [3, 10],
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
