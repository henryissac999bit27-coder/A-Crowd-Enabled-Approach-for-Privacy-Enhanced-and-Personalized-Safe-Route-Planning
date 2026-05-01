// authMiddleware.js
// Verifies JWT token on protected routes

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'saferoute_secret_2024';

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'No token. Please login.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId    = decoded.userId;
        req.username  = decoded.username;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token. Please login again.' });
    }
}

// Optional middleware — attaches userId if token present, but does not block
function optionalToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'saferoute_secret_2024');
            req.userId   = decoded.userId;
            req.username = decoded.username;
        } catch (e) {
            // ignore invalid token for optional routes
        }
    }
    next();
}

module.exports = { verifyToken, optionalToken };
