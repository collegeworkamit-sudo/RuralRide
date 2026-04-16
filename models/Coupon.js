const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    code: {
      type: String,
      required: true,
      unique: true,
    },
    // Points required to unlock
    pointsCost: {
      type: Number,
      required: true,
    },
    // Category: transport, food, shopping, entertainment
    category: {
      type: String,
      enum: ['transport', 'food', 'shopping', 'entertainment'],
      default: 'transport',
    },
    // Discount info
    discountType: {
      type: String,
      enum: ['percentage', 'flat'],
      default: 'percentage',
    },
    discountValue: {
      type: Number,
      required: true,
    },
    // Availability
    totalStock: {
      type: Number,
      default: 100,
    },
    claimed: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: Date,
    // Partner brand
    brand: String,
    emoji: {
      type: String,
      default: '🎟️',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
