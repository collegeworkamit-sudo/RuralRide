const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Ghost Route',
    },
    // Array of [lng, lat] coordinate pairs forming the route polyline
    coordinates: {
      type: [[Number]],
      required: true,
    },
    stops: [
      {
        name: String,
        location: {
          type: { type: String, default: 'Point' },
          coordinates: [Number], // [lng, lat]
        },
        avgDwellTime: Number, // seconds
      },
    ],
    // Number of unique users who have traveled this route
    userCount: {
      type: Number,
      default: 1,
    },
    confidence: {
      type: Number,
      default: 0, // 0–100 confidence score
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Route', routeSchema);
