// ⭐ Ghost Route Engine — Core clustering logic
// Detects routes from GPS paths. When 2+ users travel the same path → Ghost Route.

const Route = require('../models/Route');
const GpsLog = require('../models/GpsLog');

// Haversine distance between two [lat, lng] points in meters
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Simplify a path by removing points that are too close together (< minDist meters)
function simplifyPath(coords, minDist = 30) {
  if (coords.length < 2) return coords;

  const simplified = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = simplified[simplified.length - 1];
    const dist = haversine(prev[0], prev[1], coords[i][0], coords[i][1]);
    if (dist >= minDist) {
      simplified.push(coords[i]);
    }
  }
  return simplified;
}

// Calculate average distance between two paths (Fréchet-like comparison)
// Returns average distance in meters
function pathSimilarity(path1, path2) {
  if (path1.length === 0 || path2.length === 0) return Infinity;

  let totalDist = 0;
  let count = 0;

  // For each point in path1, find nearest point in path2
  for (const p1 of path1) {
    let minDist = Infinity;
    for (const p2 of path2) {
      const d = haversine(p1[0], p1[1], p2[0], p2[1]);
      if (d < minDist) minDist = d;
    }
    totalDist += minDist;
    count++;
  }

  // Also check path2 against path1 for symmetry
  for (const p2 of path2) {
    let minDist = Infinity;
    for (const p1 of path1) {
      const d = haversine(p2[0], p2[1], p1[0], p1[1]);
      if (d < minDist) minDist = d;
    }
    totalDist += minDist;
    count++;
  }

  return totalDist / count;
}

// Merge two paths by averaging nearby points
function mergePaths(existingPath, newPath) {
  // Weight existing route higher based on user count
  const merged = [...existingPath];

  for (const newPt of newPath) {
    let foundClose = false;
    for (let i = 0; i < merged.length; i++) {
      const dist = haversine(merged[i][0], merged[i][1], newPt[0], newPt[1]);
      if (dist < 50) {
        // Average the points (weighted towards existing)
        merged[i] = [
          (merged[i][0] * 0.7 + newPt[0] * 0.3),
          (merged[i][1] * 0.7 + newPt[1] * 0.3),
        ];
        foundClose = true;
        break;
      }
    }
    // If no close point found, this might extend the route — skip for now
  }

  return merged;
}

/**
 * Process a completed trip and detect/update ghost routes.
 *
 * @param {string} userId — user who completed the trip
 * @param {string} sessionId — trip session ID
 * @param {Array<[lat, lng]>} tripCoords — GPS coordinates of the trip
 * @returns {Object} — { route, isNew, confidence }
 */
async function processTrip(userId, sessionId, tripCoords) {
  // Minimum points for a valid trip
  if (!tripCoords || tripCoords.length < 5) {
    return { route: null, isNew: false, message: 'Trip too short' };
  }

  // Simplify the path
  const simplified = simplifyPath(tripCoords, 25);

  if (simplified.length < 3) {
    return { route: null, isNew: false, message: 'Simplified path too short' };
  }

  // Similarity threshold in meters — paths closer than this are "same route"
  const SIMILARITY_THRESHOLD = 100;

  try {
    // Get all existing active routes
    const existingRoutes = await Route.find({ isActive: true });

    let bestMatch = null;
    let bestSimilarity = Infinity;

    // Compare against each existing route
    for (const route of existingRoutes) {
      const similarity = pathSimilarity(simplified, route.coordinates);
      if (similarity < bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = route;
      }
    }

    // Check if we found a matching route
    if (bestMatch && bestSimilarity < SIMILARITY_THRESHOLD) {
      // Merge path into existing route
      bestMatch.coordinates = mergePaths(bestMatch.coordinates, simplified);
      bestMatch.userCount += 1;
      bestMatch.confidence = Math.min(100, bestMatch.confidence + 15);
      await bestMatch.save();

      console.log(
        `🔄 Route merged: "${bestMatch.name}" — ${bestMatch.userCount} users, confidence: ${bestMatch.confidence}%`
      );

      return {
        route: bestMatch,
        isNew: false,
        confidence: bestMatch.confidence,
      };
    } else {
      // Create a new route candidate
      const newRoute = await Route.create({
        name: `Ghost Route #${existingRoutes.length + 1}`,
        coordinates: simplified,
        userCount: 1,
        confidence: 10, // Low confidence for first observation
        isActive: true,
      });

      console.log(`✨ New route candidate: "${newRoute.name}"`);

      return {
        route: newRoute,
        isNew: true,
        confidence: newRoute.confidence,
      };
    }
  } catch (error) {
    console.error('Ghost Route Engine error:', error);
    return { route: null, isNew: false, message: error.message };
  }
}

/**
 * Get all confirmed ghost routes (confidence >= 25 or userCount >= 2)
 */
async function getConfirmedRoutes() {
  try {
    return await Route.find({
      isActive: true,
      $or: [{ confidence: { $gte: 25 } }, { userCount: { $gte: 2 } }],
    }).sort({ userCount: -1 });
  } catch (error) {
    console.error('Error fetching routes:', error);
    return [];
  }
}

/**
 * Get all route candidates (including low-confidence ones)
 */
async function getAllRoutes() {
  try {
    return await Route.find({ isActive: true }).sort({ userCount: -1 });
  } catch (error) {
    console.error('Error fetching routes:', error);
    return [];
  }
}

module.exports = {
  processTrip,
  getConfirmedRoutes,
  getAllRoutes,
  haversine,
  simplifyPath,
  pathSimilarity,
};
