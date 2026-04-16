const express = require('express');
const { getLeaderboard, REWARD_CONFIG } = require('../services/rewardsEngine');
const {
  getAvailableCoupons,
  claimCoupon,
  checkAndAwardBadges,
  getUserProfile,
  BADGES,
} = require('../services/rewardsService');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/rewards/leaderboard
// @desc    Get top users by points
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const leaderboard = await getLeaderboard(limit);
    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/rewards/config
// @desc    Get reward point values
// @access  Public
router.get('/config', (req, res) => {
  res.json({ success: true, config: REWARD_CONFIG });
});

// @route   GET /api/rewards/badges
// @desc    Get all available badges
// @access  Public
router.get('/badges', (req, res) => {
  res.json({ success: true, badges: BADGES });
});

// @route   GET /api/rewards/coupons
// @desc    Get all available coupons
// @access  Public
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await getAvailableCoupons();
    res.json({ success: true, coupons });
  } catch (error) {
    console.error('Coupons error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/rewards/coupons/:id/claim
// @desc    Claim a coupon (spend points)
// @access  Protected
router.post('/coupons/:id/claim', protect, async (req, res) => {
  try {
    const result = await claimCoupon(req.user._id, req.params.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/rewards/profile
// @desc    Get user profile with badges and claimed coupons
// @access  Protected
router.get('/profile', protect, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user._id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check for new badges
    const newBadges = await checkAndAwardBadges(req.user._id);

    res.json({
      success: true,
      profile,
      newBadges: newBadges.length > 0 ? newBadges : undefined,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/rewards/my-points
// @desc    Get current user's points
// @access  Protected
router.get('/my-points', protect, async (req, res) => {
  res.json({
    success: true,
    points: req.user.points || 0,
    name: req.user.name,
  });
});

module.exports = router;
