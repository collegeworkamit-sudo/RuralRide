// ⭐ Rewards Engine — Points & gamification logic
const User = require('../models/User');
const { checkAndAwardBadges } = require('./rewardsService');

// Point values for different actions
const REWARD_CONFIG = {
  TRIP_COMPLETED: 10,       // Completing any trip
  NEW_ROUTE_DISCOVERED: 50, // First to discover a ghost route
  ROUTE_CONFIRMED: 25,      // Your trip confirmed an existing route (2+ users)
  STOP_DETECTED: 15,        // Each stop detected during your trip
  STREAK_BONUS: 5,          // Bonus per consecutive day
  FIRST_TRIP_BONUS: 30,     // One-time bonus for first ever trip
};

/**
 * Award points to a user and return updated total.
 *
 * @param {string} userId
 * @param {number} points — points to add
 * @param {string} reason — description of why
 * @returns {{ user, pointsAwarded, totalPoints, breakdown }}
 */
async function awardPoints(userId, points, reason) {
  try {
    const user = await User.findById(userId);
    if (!user) return { success: false, message: 'User not found' };

    user.points = (user.points || 0) + points;
    await user.save();

    console.log(`🏆 +${points} pts to ${user.name} — ${reason} (total: ${user.points})`);

    return {
      success: true,
      pointsAwarded: points,
      totalPoints: user.points,
      reason,
    };
  } catch (error) {
    console.error('Reward error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Process rewards for a completed trip.
 *
 * @param {string} userId
 * @param {Object} tripResult — from ghost route engine
 * @param {number} stopsDetected — from stop detector
 * @returns {{ totalAwarded, breakdown }}
 */
async function processTripRewards(userId, tripResult, stopsDetected = 0) {
  if (!userId || userId.startsWith('sim-')) {
    // Don't award points to simulated riders
    return { totalAwarded: 0, breakdown: [] };
  }

  const breakdown = [];
  let totalAwarded = 0;

  // 1. Base points for completing a trip
  const baseResult = await awardPoints(userId, REWARD_CONFIG.TRIP_COMPLETED, 'Trip completed');
  if (baseResult.success) {
    totalAwarded += REWARD_CONFIG.TRIP_COMPLETED;
    breakdown.push({ action: 'Trip completed', points: REWARD_CONFIG.TRIP_COMPLETED });
  }

  // 2. New route discovery bonus
  if (tripResult?.isNew && tripResult?.route) {
    const discoveryResult = await awardPoints(userId, REWARD_CONFIG.NEW_ROUTE_DISCOVERED, `Discovered ${tripResult.route.name}`);
    if (discoveryResult.success) {
      totalAwarded += REWARD_CONFIG.NEW_ROUTE_DISCOVERED;
      breakdown.push({ action: `Discovered ${tripResult.route.name}`, points: REWARD_CONFIG.NEW_ROUTE_DISCOVERED });
    }
  }

  // 3. Route confirmation bonus (your trip made it 2+ users)
  if (!tripResult?.isNew && tripResult?.route && tripResult.route.userCount >= 2) {
    const confirmResult = await awardPoints(userId, REWARD_CONFIG.ROUTE_CONFIRMED, `Confirmed ${tripResult.route.name}`);
    if (confirmResult.success) {
      totalAwarded += REWARD_CONFIG.ROUTE_CONFIRMED;
      breakdown.push({ action: `Confirmed ${tripResult.route.name}`, points: REWARD_CONFIG.ROUTE_CONFIRMED });
    }
  }

  // 4. Stop detection points
  if (stopsDetected > 0) {
    const stopPoints = REWARD_CONFIG.STOP_DETECTED * stopsDetected;
    const stopResult = await awardPoints(userId, stopPoints, `${stopsDetected} stops detected`);
    if (stopResult.success) {
      totalAwarded += stopPoints;
      breakdown.push({ action: `${stopsDetected} stops detected`, points: stopPoints });
    }
  }

  // 5. Check for new badges
  let newBadges = [];
  try {
    newBadges = await checkAndAwardBadges(userId);
  } catch (err) {
    // non-critical
  }

  return { totalAwarded, breakdown, newBadges };
}

/**
 * Get leaderboard — top N users by points.
 */
async function getLeaderboard(limit = 20) {
  try {
    const users = await User.find({ points: { $gt: 0 } })
      .select('name role points createdAt')
      .sort({ points: -1 })
      .limit(limit);

    return users.map((user, index) => ({
      rank: index + 1,
      _id: user._id,
      name: user.name,
      role: user.role,
      points: user.points,
      joinedAt: user.createdAt,
    }));
  } catch (error) {
    console.error('Leaderboard error:', error.message);
    return [];
  }
}

module.exports = {
  REWARD_CONFIG,
  awardPoints,
  processTripRewards,
  getLeaderboard,
};
