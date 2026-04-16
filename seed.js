// 🌱 Seed Script — Inserts demo routes + stops directly into DB
// Run: node seed.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Route = require('./models/Route');
const User = require('./models/User');
const Coupon = require('./models/Coupon');
const { seedCoupons } = require('./services/rewardsService');

const MONGO_URI = process.env.MONGO_URI;

// ── 5 Routes all passing through 28.5747, 77.2195 ──
const SEED_ROUTES = [
  {
    name: 'CP → Sarojini Nagar Express',
    coordinates: [
      [28.6315, 77.2167],
      [28.6230, 77.2175],
      [28.6140, 77.2180],
      [28.6050, 77.2185],
      [28.5960, 77.2190],
      [28.5870, 77.2193],
      [28.5747, 77.2195], // 📍 USER
      [28.5650, 77.2180],
      [28.5560, 77.2160],
      [28.5470, 77.2140],
      [28.5380, 77.2110],
      [28.5310, 77.2080],
    ],
    stops: [
      {
        name: 'Mandi House',
        location: { type: 'Point', coordinates: [77.2185, 28.6050] },
        avgDwellTime: 45,
      },
      {
        name: 'Lodhi Colony',
        location: { type: 'Point', coordinates: [77.2140, 28.5470] },
        avgDwellTime: 35,
      },
    ],
    userCount: 8,
    confidence: 85,
  },
  {
    name: 'Karol Bagh → Nehru Place',
    coordinates: [
      [28.6520, 77.1900],
      [28.6400, 77.2000],
      [28.6280, 77.2080],
      [28.6160, 77.2140],
      [28.6040, 77.2170],
      [28.5900, 77.2185],
      [28.5747, 77.2195], // 📍 USER
      [28.5620, 77.2210],
      [28.5500, 77.2230],
      [28.5380, 77.2250],
    ],
    stops: [
      {
        name: 'Gole Market',
        location: { type: 'Point', coordinates: [77.2140, 28.6160] },
        avgDwellTime: 40,
      },
      {
        name: 'Defence Colony',
        location: { type: 'Point', coordinates: [77.2210, 28.5620] },
        avgDwellTime: 30,
      },
    ],
    userCount: 6,
    confidence: 70,
  },
  {
    name: 'ISBT Kashmere Gate → AIIMS',
    coordinates: [
      [28.6670, 77.2280],
      [28.6530, 77.2260],
      [28.6390, 77.2240],
      [28.6250, 77.2220],
      [28.6110, 77.2210],
      [28.5970, 77.2200],
      [28.5747, 77.2195], // 📍 USER
      [28.5620, 77.2170],
      [28.5500, 77.2130],
      [28.5400, 77.2090],
      [28.5320, 77.2050],
    ],
    stops: [
      {
        name: 'ITO',
        location: { type: 'Point', coordinates: [77.2220, 28.6250] },
        avgDwellTime: 50,
      },
      {
        name: 'Lajpat Nagar',
        location: { type: 'Point', coordinates: [77.2130, 28.5500] },
        avgDwellTime: 40,
      },
    ],
    userCount: 5,
    confidence: 60,
  },
  {
    name: 'Dwarka → Lajpat Nagar Shuttle',
    coordinates: [
      [28.5920, 77.0500],
      [28.5880, 77.0800],
      [28.5840, 77.1100],
      [28.5810, 77.1400],
      [28.5790, 77.1700],
      [28.5770, 77.1950],
      [28.5747, 77.2195], // 📍 USER
      [28.5730, 77.2300],
      [28.5710, 77.2400],
      [28.5690, 77.2500],
    ],
    stops: [
      {
        name: 'Janakpuri West',
        location: { type: 'Point', coordinates: [77.1400, 28.5810] },
        avgDwellTime: 45,
      },
      {
        name: 'Jangpura',
        location: { type: 'Point', coordinates: [77.2300, 28.5730] },
        avgDwellTime: 30,
      },
    ],
    userCount: 4,
    confidence: 50,
  },
  {
    name: 'Noida Sec 18 → Hauz Khas',
    coordinates: [
      [28.5700, 77.3200],
      [28.5710, 77.3000],
      [28.5720, 77.2800],
      [28.5730, 77.2600],
      [28.5740, 77.2450],
      [28.5745, 77.2300],
      [28.5747, 77.2195], // 📍 USER
      [28.5740, 77.2100],
      [28.5730, 77.2000],
      [28.5720, 77.1900],
      [28.5700, 77.1800],
    ],
    stops: [
      {
        name: 'Mayur Vihar',
        location: { type: 'Point', coordinates: [77.2600, 28.5730] },
        avgDwellTime: 40,
      },
      {
        name: 'Green Park',
        location: { type: 'Point', coordinates: [77.2000, 28.5730] },
        avgDwellTime: 35,
      },
    ],
    userCount: 3,
    confidence: 40,
  },
];

// ── Demo users for leaderboard ──
const SEED_USERS = [
  { name: 'Aarav Sharma', email: 'aarav@demo.com', password: 'demo123', role: 'commuter', points: 320 },
  { name: 'Priya Patel', email: 'priya@demo.com', password: 'demo123', role: 'driver', points: 540 },
  { name: 'Vikram Singh', email: 'vikram@demo.com', password: 'demo123', role: 'driver', points: 210 },
  { name: 'Neha Gupta', email: 'neha@demo.com', password: 'demo123', role: 'commuter', points: 450 },
  { name: 'Arjun Kumar', email: 'arjun@demo.com', password: 'demo123', role: 'commuter', points: 180 },
  { name: 'Kavya Reddy', email: 'kavya@demo.com', password: 'demo123', role: 'driver', points: 670 },
  { name: 'Rahul Verma', email: 'rahul@demo.com', password: 'demo123', role: 'commuter', points: 95 },
  { name: 'Ananya Das', email: 'ananya@demo.com', password: 'demo123', role: 'commuter', points: 380 },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Route.deleteMany({});
    console.log('🗑️  Cleared routes');

    // Seed routes
    for (const route of SEED_ROUTES) {
      await Route.create(route);
    }
    console.log(`🗺️  Seeded ${SEED_ROUTES.length} ghost routes (all pass through your location)`);

    // Seed demo users (skip if email exists)
    let usersCreated = 0;
    for (const userData of SEED_USERS) {
      const exists = await User.findOne({ email: userData.email });
      if (!exists) {
        await User.create(userData);
        usersCreated++;
      }
    }
    console.log(`👥 Seeded ${usersCreated} demo users for leaderboard`);

    // Seed coupons
    await seedCoupons();

    // Verify ETA
    const { getETAsFromPosition } = require('./services/etaEngine');
    const etas = await getETAsFromPosition(28.5747, 77.2195, 0);
    console.log(`\n⏱️  ETA Test from your location (28.5747, 77.2195):`);
    etas.forEach((eta) => {
      console.log(`   ${eta.routeName} → ${eta.etaMinutes} min | ${(eta.remainingDistance/1000).toFixed(1)} km | ${eta.remainingStops} stops ahead`);
    });

    console.log('\n🎉 Seed complete! Restart server and refresh browser.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
}

seed();
