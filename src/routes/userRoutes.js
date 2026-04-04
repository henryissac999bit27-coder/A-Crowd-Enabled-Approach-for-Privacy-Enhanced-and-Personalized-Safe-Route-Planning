/**
 * userRoutes.js
 *
 * User management API endpoints for the crowd system.
 *
 * GET  /api/users              → list all users with cell count
 * POST /api/users/register     → register a new crowd user
 * POST /api/users/checkin      → record a visit (updates pSS + KS)
 * GET  /api/users/:id/scores   → get one user's pSS values
 */

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { recordCheckin, getAllUsers } = require('../services/crowdService');

/**
 * GET /api/users
 * Returns all users with how many cells they know.
 */
router.get('/', async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/users/register
 * Body: { username }
 * Creates a new crowd user.
 */
router.post('/register', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'username required' });

        const userId = uuidv4();
        await db.query(
            'INSERT INTO users (user_id, username) VALUES (?, ?)',
            [userId, username]
        );

        res.json({ userId, username, message: 'User registered successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/users/checkin
 * Body: { userId, gridX, gridY, isUnsafe }
 *
 * Records a user visit to a grid cell.
 * Updates their personal pSS (paper Section 5) and KS (Definition 1).
 *
 * isUnsafe = true  → unsafe event (crime/harassment experienced)
 * isUnsafe = false → safe visit
 */
router.post('/checkin', async (req, res) => {
    try {
        const { userId, gridX, gridY, isUnsafe = false } = req.body;

        if (!userId || gridX === undefined || gridY === undefined) {
            return res.status(400).json({ error: 'userId, gridX, gridY required' });
        }

        const result = await recordCheckin(
            userId,
            parseInt(gridX),
            parseInt(gridY),
            isUnsafe
        );

        res.json({
            message:  `Check-in recorded for ${userId}`,
            gridCell: `(${gridX}, ${gridY})`,
            event:    isUnsafe ? 'unsafe' : 'safe',
            newPSS:   result.newPSS,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/users/:id/scores
 * Returns one user's personal pSS values for all cells they know.
 */
router.get('/:id/scores', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT grid_x, grid_y, pss, last_updated FROM user_pss WHERE user_id = ? ORDER BY pss ASC',
            [req.params.id]
        );
        res.json({ userId: req.params.id, cellCount: rows.length, scores: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
