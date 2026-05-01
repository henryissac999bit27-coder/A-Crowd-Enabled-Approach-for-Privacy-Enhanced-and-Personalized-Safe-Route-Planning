// rtreeRoutes.js
// GET /api/rtree/stats  -- shows supercell compression per user (paper Table 5)

const express = require('express');
const router  = express.Router();
const { getRTreeStats } = require('../services/crowdService');

router.get('/stats', async function(req, res) {
    try {
        var stats = await getRTreeStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
