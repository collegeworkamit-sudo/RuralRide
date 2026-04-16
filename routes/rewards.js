const express = require('express');
const router = express.Router();

// Placeholder — will be implemented in Phase 5 (Rewards)
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Rewards API — Coming in Phase 5' });
});

module.exports = router;
