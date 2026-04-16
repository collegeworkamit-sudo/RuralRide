// Stop Detector — Identifies transit stops from GPS data
// Uses low-speed clustering + dwell time + multi-user confirmation

const { haversine } = require('./ghostRouteEngine');

// Cluster radius in meters — GPS points within this radius are grouped
const CLUSTER_RADIUS = 50;
// Minimum dwell time in ms to qualify as a stop (10 seconds)
const MIN_DWELL_TIME = 10000;
// Maximum speed (m/s) to be considered "stopped" (~5 km/h)
const MAX_STOP_SPEED = 1.4;

/**
 * Detect stops from a series of GPS points.
 *
 * @param {Array<{lat, lng, speed, timestamp}>} gpsPoints — ordered GPS readings
 * @returns {Array<{lat, lng, dwellTime, pointCount}>} — detected stops
 */
function detectStopsFromPath(gpsPoints) {
  if (!gpsPoints || gpsPoints.length < 3) return [];

  const stops = [];
  let clusterStart = null;
  let clusterPoints = [];

  for (let i = 0; i < gpsPoints.length; i++) {
    const point = gpsPoints[i];
    const speed = point.speed || 0;

    // Check if this point is "slow" (potential stop)
    if (speed <= MAX_STOP_SPEED) {
      if (!clusterStart) {
        // Start a new cluster
        clusterStart = point;
        clusterPoints = [point];
      } else {
        // Check if still within cluster radius
        const dist = haversine(
          clusterStart.lat,
          clusterStart.lng,
          point.lat,
          point.lng
        );

        if (dist <= CLUSTER_RADIUS) {
          clusterPoints.push(point);
        } else {
          // Too far — finalize previous cluster and start new one
          const stop = finalizeCluster(clusterPoints);
          if (stop) stops.push(stop);

          clusterStart = point;
          clusterPoints = [point];
        }
      }
    } else {
      // Moving fast — finalize any active cluster
      if (clusterPoints.length > 0) {
        const stop = finalizeCluster(clusterPoints);
        if (stop) stops.push(stop);
      }
      clusterStart = null;
      clusterPoints = [];
    }
  }

  // Finalize last cluster
  if (clusterPoints.length > 0) {
    const stop = finalizeCluster(clusterPoints);
    if (stop) stops.push(stop);
  }

  return stops;
}

/**
 * Finalize a cluster of slow-speed points into a stop.
 */
function finalizeCluster(points) {
  if (points.length < 2) return null;

  // Calculate dwell time
  const firstTime = points[0].timestamp;
  const lastTime = points[points.length - 1].timestamp;
  const dwellTime = lastTime - firstTime;

  if (dwellTime < MIN_DWELL_TIME) return null;

  // Calculate centroid
  let totalLat = 0;
  let totalLng = 0;
  for (const p of points) {
    totalLat += p.lat;
    totalLng += p.lng;
  }

  return {
    lat: totalLat / points.length,
    lng: totalLng / points.length,
    dwellTime,
    pointCount: points.length,
  };
}

/**
 * Merge newly detected stops with existing stops on a route.
 * If a new stop is close to an existing one, merge them.
 * Otherwise, add as a new stop.
 *
 * @param {Array} existingStops — stops already on the route
 * @param {Array} newStops — newly detected stops
 * @returns {Array} — merged stops list
 */
function mergeStops(existingStops, newStops) {
  const merged = [...existingStops];

  for (const newStop of newStops) {
    let foundMatch = false;

    for (let i = 0; i < merged.length; i++) {
      const existing = merged[i];
      const existingCoords = existing.location?.coordinates || [
        existing.lng,
        existing.lat,
      ];
      const dist = haversine(
        newStop.lat,
        newStop.lng,
        existingCoords[1] || existing.lat,
        existingCoords[0] || existing.lng
      );

      if (dist <= CLUSTER_RADIUS) {
        // Merge — average the position, update dwell time
        const avgLat =
          (existingCoords[1] || existing.lat) * 0.7 + newStop.lat * 0.3;
        const avgLng =
          (existingCoords[0] || existing.lng) * 0.7 + newStop.lng * 0.3;

        merged[i] = {
          name: existing.name || `Stop ${i + 1}`,
          location: {
            type: 'Point',
            coordinates: [avgLng, avgLat],
          },
          avgDwellTime: Math.round(
            ((existing.avgDwellTime || 0) + newStop.dwellTime / 1000) / 2
          ),
        };
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      // Add new stop
      merged.push({
        name: `Stop ${merged.length + 1}`,
        location: {
          type: 'Point',
          coordinates: [newStop.lng, newStop.lat],
        },
        avgDwellTime: Math.round(newStop.dwellTime / 1000),
      });
    }
  }

  return merged;
}

module.exports = {
  detectStopsFromPath,
  mergeStops,
  CLUSTER_RADIUS,
  MIN_DWELL_TIME,
  MAX_STOP_SPEED,
};
