const express = require('express');
const router = express.Router();

// Placeholder — will be implemented in Phase 4 (Ghost Routes)
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Routes API — Coming in Phase 4' });
});

module.exports = router;
