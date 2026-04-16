const express = require('express');
const Route = require('../models/Route');
const { protect } = require('../middleware/auth');
const { getConfirmedRoutes, getAllRoutes } = require('../services/ghostRouteEngine');
const { getETAsFromPosition } = require('../services/etaEngine');

const router = express.Router();

// @route   GET /api/routes/eta?lat=XX&lng=XX&speed=XX
// @desc    Get ETAs for nearby routes from given position
// @access  Public
router.get('/eta', async (req, res) => {
  try {
    const { lat, lng, speed } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng required' });
    }
    const etas = await getETAsFromPosition(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(speed) || 0
    );
    res.json({ success: true, etas });
  } catch (error) {
    console.error('ETA error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/routes
// @desc    Get all confirmed ghost routes
// @access  Public
router.get('/', async (req, res) => {
  try {
    const routes = await getConfirmedRoutes();
    res.json({
      success: true,
      count: routes.length,
      routes,
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/routes/all
// @desc    Get all routes including candidates
// @access  Public
router.get('/all', async (req, res) => {
  try {
    const routes = await getAllRoutes();
    res.json({
      success: true,
      count: routes.length,
      routes,
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/routes/:id
// @desc    Get a single route by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }
    res.json({ success: true, route });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/routes/clear
// @desc    Clear all ghost routes (for re-simulation)
// @access  Public
router.delete('/clear', async (req, res) => {
  try {
    const result = await Route.deleteMany({});
    console.log(`🗑️  Cleared ${result.deletedCount} routes`);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Error clearing routes:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
