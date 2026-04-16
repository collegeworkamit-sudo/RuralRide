const mongoose = require('mongoose');

const gpsLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
    speed: {
      type: Number,
      default: 0,
    },
    heading: {
      type: Number,
      default: 0,
    },
    sessionId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for geospatial + time queries
gpsLogSchema.index({ userId: 1, createdAt: -1 });
gpsLogSchema.index({ sessionId: 1 });

module.exports = mongoose.model('GpsLog', gpsLogSchema);
