/**
 * safetyRoutes.js
 *
 * Safety score API endpoints.
 *
 *   GET /api/safety/scores   → all grid cell safety scores (pSS + normalized)
 *   GET /api/safety/danger   → high danger zones only
 *   GET /api/safety/compute  → manually recompute pSS scores from crime data
 */

const express = require('express');
const router  = express.Router();

const safetyController              = require('../controllers/safetyController');
const { computeAndStoreSafetyScores } = require('../services/safetyService');

// Existing endpoints
router.get('/scores', safetyController.getSafetyScores);
router.get('/danger', safetyController.getDangerZones);

/**
 * GET /api/safety/compute
 *
 * Manually triggers recomputation of all pSS safety scores.
 * Useful after importing new crime data.
 *
 * Paper Section 5: recomputes Gaussian decay + time decay model
 * over all crimes and writes results to safety_scores table.
 */
router.get('/compute', async (req, res) => {
    try {
        console.log('[safetyRoutes] Manual recompute triggered...');
        const results = await computeAndStoreSafetyScores();
        res.json({
            message:    'Safety scores recomputed successfully.',
            cellsUpdated: results.length,
        });
    } catch (err) {
        console.error('[safetyRoutes] Compute error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;