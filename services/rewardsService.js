// ⭐ Rewards Service — Coupons, Badges, Milestones
const User = require('../models/User');
const Coupon = require('../models/Coupon');

// ── Badge Definitions ──
const BADGES = [
  { id: 'first_trip', name: 'First Steps', emoji: '🐣', requirement: 'Complete your first trip', pointsNeeded: 10 },
  { id: 'explorer', name: 'Route Explorer', emoji: '🧭', requirement: 'Discover your first ghost route', pointsNeeded: 50 },
  { id: 'trailblazer', name: 'Trailblazer', emoji: '🔥', requirement: 'Earn 100 points', pointsNeeded: 100 },
  { id: 'pathfinder', name: 'Pathfinder', emoji: '🗺️', requirement: 'Earn 250 points', pointsNeeded: 250 },
  { id: 'navigator', name: 'Navigator', emoji: '⭐', requirement: 'Earn 500 points', pointsNeeded: 500 },
  { id: 'legend', name: 'Transit Legend', emoji: '👑', requirement: 'Earn 1000 points', pointsNeeded: 1000 },
  { id: 'stop_hunter', name: 'Stop Hunter', emoji: '🚏', requirement: 'Help detect 5+ stops', pointsNeeded: 75 },
  { id: 'community', name: 'Community Hero', emoji: '🤝', requirement: 'Confirm 3+ routes', pointsNeeded: 75 },
];

// ── Default Coupons (seeded on first run) ──
const DEFAULT_COUPONS = [
  {
    name: '10% Off Metro Pass',
    description: 'Get 10% off your next monthly metro pass',
    code: 'METRO10',
    pointsCost: 50,
    category: 'transport',
    discountType: 'percentage',
    discountValue: 10,
    brand: 'Delhi Metro',
    emoji: '🚇',
    totalStock: 200,
  },
  {
    name: '₹50 Off Uber Ride',
    description: 'Flat ₹50 off your next Uber ride in Delhi',
    code: 'RIDE50',
    pointsCost: 80,
    category: 'transport',
    discountType: 'flat',
    discountValue: 50,
    brand: 'Uber',
    emoji: '🚕',
    totalStock: 150,
  },
  {
    name: '20% Off Swiggy',
    description: 'Get 20% off your next Swiggy order (max ₹100)',
    code: 'SWIGGY20',
    pointsCost: 100,
    category: 'food',
    discountType: 'percentage',
    discountValue: 20,
    brand: 'Swiggy',
    emoji: '🍔',
    totalStock: 100,
  },
  {
    name: 'Free Coffee ☕',
    description: 'Redeem a free coffee at partnered cafés',
    code: 'FREECOFFEE',
    pointsCost: 60,
    category: 'food',
    discountType: 'flat',
    discountValue: 150,
    brand: 'Café Coffee Day',
    emoji: '☕',
    totalStock: 80,
  },
  {
    name: '₹100 Off Rapido',
    description: 'Flat ₹100 off your next Rapido bike ride',
    code: 'RAPIDO100',
    pointsCost: 120,
    category: 'transport',
    discountType: 'flat',
    discountValue: 100,
    brand: 'Rapido',
    emoji: '🏍️',
    totalStock: 100,
  },
  {
    name: '15% Off Amazon',
    description: '15% off on Amazon shopping (max ₹200)',
    code: 'AMZN15',
    pointsCost: 200,
    category: 'shopping',
    discountType: 'percentage',
    discountValue: 15,
    brand: 'Amazon',
    emoji: '📦',
    totalStock: 50,
  },
  {
    name: 'Free Movie Ticket',
    description: 'One free movie ticket at PVR Cinemas',
    code: 'PVRMOVIE',
    pointsCost: 300,
    category: 'entertainment',
    discountType: 'flat',
    discountValue: 250,
    brand: 'PVR Cinemas',
    emoji: '🎬',
    totalStock: 30,
  },
  {
    name: '₹200 Off Ola',
    description: 'Flat ₹200 off on your next Ola ride',
    code: 'OLA200',
    pointsCost: 150,
    category: 'transport',
    discountType: 'flat',
    discountValue: 200,
    brand: 'Ola',
    emoji: '🚗',
    totalStock: 75,
  },
];

/**
 * Seed default coupons if none exist.
 */
async function seedCoupons() {
  try {
    const count = await Coupon.countDocuments();
    if (count === 0) {
      await Coupon.insertMany(DEFAULT_COUPONS);
      console.log(`🎟️  Seeded ${DEFAULT_COUPONS.length} default coupons`);
    }
  } catch (error) {
    console.error('Coupon seeding error:', error.message);
  }
}

/**
 * Get all available coupons with stock remaining.
 */
async function getAvailableCoupons() {
  try {
    const coupons = await Coupon.find({ isActive: true }).sort({ pointsCost: 1 });
    return coupons
      .filter((c) => c.claimed < c.totalStock)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        description: c.description,
        code: c.code,
        pointsCost: c.pointsCost,
        category: c.category,
        discountType: c.discountType,
        discountValue: c.discountValue,
        brand: c.brand,
        emoji: c.emoji,
        remaining: c.totalStock - c.claimed,
      }));
  } catch (error) {
    console.error('Get coupons error:', error.message);
    return [];
  }
}

/**
 * Claim a coupon — deducts points from user.
 */
async function claimCoupon(userId, couponId) {
  try {
    const user = await User.findById(userId);
    if (!user) return { success: false, message: 'User not found' };

    const coupon = await Coupon.findById(couponId);
    if (!coupon) return { success: false, message: 'Coupon not found' };
    if (!coupon.isActive) return { success: false, message: 'Coupon is no longer active' };
    if (coupon.claimed >= coupon.totalStock) return { success: false, message: 'Coupon out of stock' };

    // Check if user has enough points
    if (user.points < coupon.pointsCost) {
      return {
        success: false,
        message: `Need ${coupon.pointsCost} points, you have ${user.points}`,
      };
    }

    // Check if already claimed this coupon
    const alreadyClaimed = user.claimedCoupons?.some(
      (c) => c.couponId?.toString() === couponId
    );
    if (alreadyClaimed) {
      return { success: false, message: 'You already claimed this coupon' };
    }

    // Deduct points
    user.points -= coupon.pointsCost;

    // Add to claimed coupons
    user.claimedCoupons.push({
      couponId: coupon._id,
      code: coupon.code,
      name: coupon.name,
    });

    await user.save();

    // Update coupon stock
    coupon.claimed += 1;
    await coupon.save();

    console.log(`🎟️  ${user.name} claimed "${coupon.name}" for ${coupon.pointsCost} pts`);

    return {
      success: true,
      coupon: {
        name: coupon.name,
        code: coupon.code,
        emoji: coupon.emoji,
        brand: coupon.brand,
      },
      remainingPoints: user.points,
    };
  } catch (error) {
    console.error('Claim coupon error:', error.message);
    return { success: false, message: 'Server error' };
  }
}

/**
 * Check and award badges based on points.
 */
async function checkAndAwardBadges(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    const newBadges = [];
    const existingBadgeIds = (user.badges || []).map((b) => b.id);

    for (const badge of BADGES) {
      if (!existingBadgeIds.includes(badge.id) && user.points >= badge.pointsNeeded) {
        const newBadge = {
          id: badge.id,
          name: badge.name,
          emoji: badge.emoji,
        };
        user.badges.push(newBadge);
        newBadges.push(newBadge);
        console.log(`🏅 ${user.name} unlocked badge: ${badge.emoji} ${badge.name}`);
      }
    }

    if (newBadges.length > 0) {
      await user.save();
    }

    return newBadges;
  } catch (error) {
    console.error('Badge check error:', error.message);
    return [];
  }
}

/**
 * Get user's profile with badges and coupons.
 */
async function getUserProfile(userId) {
  try {
    const user = await User.findById(userId).select('-password');
    if (!user) return null;

    // Find next badge milestone
    const existingBadgeIds = (user.badges || []).map((b) => b.id);
    const nextBadge = BADGES.find(
      (b) => !existingBadgeIds.includes(b.id) && b.pointsNeeded > user.points
    );

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points,
      badges: user.badges || [],
      claimedCoupons: user.claimedCoupons || [],
      nextBadge: nextBadge
        ? {
            name: nextBadge.name,
            emoji: nextBadge.emoji,
            pointsNeeded: nextBadge.pointsNeeded,
            remaining: nextBadge.pointsNeeded - user.points,
          }
        : null,
    };
  } catch (error) {
    console.error('Profile error:', error.message);
    return null;
  }
}

module.exports = {
  BADGES,
  seedCoupons,
  getAvailableCoupons,
  claimCoupon,
  checkAndAwardBadges,
  getUserProfile,
};
