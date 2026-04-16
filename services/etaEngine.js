// ⭐ ETA Engine — Predicts arrival times using ghost route data
// Uses historical speed data + stop dwell times + current position

const { haversine } = require('./ghostRouteEngine');
const Route = require('../models/Route');

/**
 * Calculate total distance of a path in meters.
 */
function pathDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

/**
 * Find the nearest point on a route to a given position.
 * Returns { index, distance } where index is the closest waypoint.
 */
function findNearestPointOnRoute(lat, lng, routeCoords) {
  let minDist = Infinity;
  let nearestIndex = 0;

  for (let i = 0; i < routeCoords.length; i++) {
    const dist = haversine(lat, lng, routeCoords[i][0], routeCoords[i][1]);
    if (dist < minDist) {
      minDist = dist;
      nearestIndex = i;
    }
  }

  return { index: nearestIndex, distance: minDist };
}

/**
 * Calculate ETA from current position to the end of a route.
 *
 * @param {number} lat — current latitude
 * @param {number} lng — current longitude
 * @param {Object} route — the ghost route (from DB)
 * @param {number} currentSpeed — current speed in m/s (optional)
 * @returns {{ eta, distance, stops, confidence }}
 */
function calculateETA(lat, lng, route, currentSpeed = 0) {
  if (!route || !route.coordinates || route.coordinates.length < 2) {
    return null;
  }

  const coords = route.coordinates;

  // Find where the user is on the route
  const nearest = findNearestPointOnRoute(lat, lng, coords);

  // If user is too far from the route (> 500m), they're not on it
  if (nearest.distance > 500) {
    return null;
  }

  // Calculate remaining distance from current position to route end
  const remainingCoords = coords.slice(nearest.index);
  const remainingDistance = pathDistance(remainingCoords) + nearest.distance;

  // Estimate average speed
  // Use current speed if available, otherwise assume 25 km/h (~7 m/s) for urban transit
  const avgSpeed = currentSpeed > 1 ? currentSpeed : 7;

  // Calculate base travel time in seconds
  let travelTimeSeconds = remainingDistance / avgSpeed;

  // Add stop dwell times for remaining stops
  let remainingStops = 0;
  if (route.stops && route.stops.length > 0) {
    for (const stop of route.stops) {
      const stopCoords = stop.location?.coordinates;
      if (!stopCoords) continue;

      // Check if this stop is ahead of our current position
      const stopNearest = findNearestPointOnRoute(stopCoords[1], stopCoords[0], coords);
      if (stopNearest.index > nearest.index) {
        remainingStops++;
        // Add average dwell time (default 30s if not known)
        travelTimeSeconds += (stop.avgDwellTime || 30);
      }
    }
  }

  // Round to reasonable values
  const etaMinutes = Math.ceil(travelTimeSeconds / 60);
  const etaSeconds = Math.round(travelTimeSeconds);

  return {
    routeId: route._id,
    routeName: route.name,
    etaMinutes,
    etaSeconds,
    remainingDistance: Math.round(remainingDistance),
    remainingStops,
    currentSpeed: Math.round(avgSpeed * 3.6), // km/h
    confidence: route.confidence,
    progress: Math.round((nearest.index / coords.length) * 100),
  };
}

/**
 * Get ETAs for all confirmed routes from a given position.
 */
async function getETAsFromPosition(lat, lng, currentSpeed = 0) {
  try {
    const routes = await Route.find({
      isActive: true,
      $or: [{ confidence: { $gte: 25 } }, { userCount: { $gte: 2 } }],
    });

    const etas = [];

    for (const route of routes) {
      const eta = calculateETA(lat, lng, route, currentSpeed);
      if (eta) {
        etas.push(eta);
      }
    }

    // Sort by nearest first
    etas.sort((a, b) => a.remainingDistance - b.remainingDistance);

    return etas;
  } catch (error) {
    console.error('ETA Engine error:', error.message);
    return [];
  }
}

module.exports = {
  calculateETA,
  getETAsFromPosition,
  findNearestPointOnRoute,
  pathDistance,
};
