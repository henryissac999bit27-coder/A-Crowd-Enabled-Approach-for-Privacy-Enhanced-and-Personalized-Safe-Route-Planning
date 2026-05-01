// authRoutes.js
// POST /api/auth/register  -- create account
// POST /api/auth/login     -- login, get JWT
// GET  /api/auth/me        -- get current user info (protected)

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db       = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

const JWT_SECRET  = process.env.JWT_SECRET || 'saferoute_secret_2024';
const JWT_EXPIRES = '7d'; // token valid for 7 days

// POST /api/auth/register
router.post('/register', async function(req, res) {
    try {
        var username = req.body.username;
        var password = req.body.password;
        var email    = req.body.email || null;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Check if username already taken
        var existing = await db.query('SELECT user_id FROM users WHERE username=?', [username]);
        if (existing[0].length > 0) {
            return res.status(409).json({ error: 'Username already taken. Choose another.' });
        }

        // Hash password
        var salt         = await bcrypt.genSalt(10);
        var passwordHash = await bcrypt.hash(password, salt);
        var userId       = uuidv4();

        // Create user
        await db.query(
            'INSERT INTO users (user_id, username, email, password_hash) VALUES (?,?,?,?)',
            [userId, username, email, passwordHash]
        );

        // Generate JWT
        var token = jwt.sign(
            { userId: userId, username: username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        console.log('[auth] New user registered: ' + username + ' (' + userId.slice(0,8) + ')');

        res.status(201).json({
            message:  'Account created successfully.',
            token:    token,
            userId:   userId,
            username: username,
        });

    } catch (err) {
        console.error('[auth register]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async function(req, res) {
    try {
        var username = req.body.username;
        var password = req.body.password;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required.' });
        }

        // Find user
        var result = await db.query(
            'SELECT user_id, username, password_hash FROM users WHERE username=?',
            [username]
        );
        var users = result[0];

        if (users.length === 0) {
            return res.status(401).json({ error: 'Username not found.' });
        }

        var user = users[0];

        // Check if user has a password (seeded users don't)
        if (!user.password_hash) {
            return res.status(401).json({ error: 'This account was seeded and has no password. Register a new account.' });
        }

        // Verify password
        var validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        // Update last_login
        await db.query('UPDATE users SET last_login=NOW() WHERE user_id=?', [user.user_id]);

        // Generate JWT
        var token = jwt.sign(
            { userId: user.user_id, username: user.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        console.log('[auth] Login: ' + user.username);

        res.json({
            message:  'Login successful.',
            token:    token,
            userId:   user.user_id,
            username: user.username,
        });

    } catch (err) {
        console.error('[auth login]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me  (protected)
router.get('/me', verifyToken, async function(req, res) {
    try {
        var result = await db.query(
            'SELECT u.user_id, u.username, u.email, u.created_at, u.last_login, ' +
            'COUNT(DISTINCT k.grid_x) AS cells_known, ' +
            '(SELECT w0 FROM user_fl_weights WHERE user_id=u.user_id LIMIT 1) AS personal_beta ' +
            'FROM users u ' +
            'LEFT JOIN user_ks k ON k.user_id=u.user_id AND k.ks=1 ' +
            'WHERE u.user_id=? GROUP BY u.user_id',
            [req.userId]
        );
        var user = result[0][0];
        if (!user) return res.status(404).json({ error: 'User not found.' });

        res.json({
            userId:       user.user_id,
            username:     user.username,
            email:        user.email,
            createdAt:    user.created_at,
            lastLogin:    user.last_login,
            cellsKnown:   user.cells_known,
            personalBeta: user.personal_beta || -2,
            defaultBeta:  -2,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
