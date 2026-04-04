const db = require('../config/db');

// Get all safety scores
exports.getSafetyScores = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM safety_scores");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get dangerous areas (low safety)
exports.getDangerZones = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM safety_scores WHERE safety_score < 0.5"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};