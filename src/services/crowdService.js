/**
 * crowdService.js
 *
 * Implements the crowd system from:
 * "A Crowd-Enabled Approach for Privacy-Enhanced and Personalized
 *  Safe Route Planning" — Islam, Hashem, Shahriyar (IEEE TKDE 2023)
 *
 * Paper Section 4 — System Overview:
 *   - Central server stores KS per user per cell
 *   - When query arrives, server selects query-relevant group Gq
 *   - Query requestor collects pSSs from Gq members
 *   - pSSs are aggregated to SS per cell (Definition 3)
 *
 * Paper Section 5 — Quantification of Safety:
 *   - User check-in updates their personal pSS using Gaussian decay
 *   - Time decay applied every Δd days
 *   - pSS bounded to [−S, +S]
 */

const db = require('../config/db');

// ── Paper Parameters ──────────────────────────────────────────────────────────
const PARAMS = {
    alpha:   1,     // safe event impact
    beta:   -2,     // unsafe event impact
    S:       10,    // pSS bound [−S, +S]
    rd:      0.8,   // time decay rate
    deltaD:  2,     // decay interval in days
    h:       2,     // Gaussian spread radius
    w:       30,    // KS window in days (KS=1 if visited in last w days)
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function gaussianDecay(gamma, dist) {
    return gamma * Math.exp(-(dist * dist) / (2 * PARAMS.h * PARAMS.h));
}

function applyTimeDecay(pSS, daysSince) {
    const intervals = Math.min(Math.floor(daysSince / PARAMS.deltaD), 30);
    return intervals > 0 ? pSS * Math.pow(PARAMS.rd, intervals) : pSS;
}

function clamp(v) {
    return Math.max(-PARAMS.S, Math.min(PARAMS.S, v));
}

function normalizeSS(pSS) {
    return parseFloat(((pSS + PARAMS.S) / (2 * PARAMS.S)).toFixed(4));
}

// ── Step 2: selectQueryGroup ──────────────────────────────────────────────────

/**
 * selectQueryGroup
 *
 * Paper Section 7.1 — Query-Relevant Group:
 *   "The query-relevant group Gq is formed by including any user
 *    whose KS is 1 in at least one grid cell of Aq."
 *
 * @param {object[]} Aq - array of { grid_x, grid_y } cells in query area
 * @returns {string[]} userIds of query-relevant group members
 */
async function selectQueryGroup(Aq) {
    if (!Aq || Aq.length === 0) return [];

    // Build placeholders for all cells in Aq
    const placeholders = Aq.map(() => '(?, ?)').join(', ');
    const values       = Aq.flatMap(c => [c.grid_x, c.grid_y]);

    // Find all users with KS=1 in at least one cell of Aq
    // Paper: KS window check — KS expires after w days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PARAMS.w);

    const [rows] = await db.query(`
        SELECT DISTINCT k.user_id
        FROM user_ks k
        WHERE k.ks = 1
          AND k.last_visit >= ?
          AND (k.grid_x, k.grid_y) IN (${placeholders})
    `, [cutoffDate, ...values]);

    const groupIds = rows.map(r => r.user_id);
    console.log(`[crowdService] Query group Gq: ${groupIds.length} users selected from ${Aq.length} cells`);
    return groupIds;
}

// ── Step 3: aggregatePSS ──────────────────────────────────────────────────────

/**
 * aggregatePSS
 *
 * Paper Definition 3 — Safety Score (SS):
 *   SS = floor( (pSS₁ + pSS₂ + ... + pSSₙ) / n )
 *
 * Collects pSSs from all group members for cells in Aq,
 * then aggregates to one SS per cell.
 *
 * Also applies time decay to each user's pSS based on last_updated.
 *
 * @param {string[]} groupIds - user IDs in query group Gq
 * @param {object[]} Aq       - cells in query area
 * @returns {object} SSq map: { "grid_x,grid_y" → safety_score [0,1] }
 */
async function aggregatePSS(groupIds, Aq) {
    if (!groupIds || groupIds.length === 0 || !Aq || Aq.length === 0) {
        return {};
    }

    const today        = new Date();
    const cellKeys     = new Set(Aq.map(c => `${c.grid_x},${c.grid_y}`));

    // Fetch pSSs from all group members for all Aq cells
    const placeholderUsers = groupIds.map(() => '?').join(', ');
    const placeholderCells = Aq.map(() => '(?, ?)').join(', ');
    const cellValues       = Aq.flatMap(c => [c.grid_x, c.grid_y]);

    const [rows] = await db.query(`
        SELECT user_id, grid_x, grid_y, pss, last_updated
        FROM user_pss
        WHERE user_id IN (${placeholderUsers})
          AND (grid_x, grid_y) IN (${placeholderCells})
    `, [...groupIds, ...cellValues]);

    console.log(`[crowdService] Collected ${rows.length} pSS values from ${groupIds.length} users`);

    // Group pSS values by cell
    const cellPSS = {}; // cellKey → [pSS values]

    for (const row of rows) {
        const key = `${row.grid_x},${row.grid_y}`;
        if (!cellKeys.has(key)) continue;

        // Apply time decay (paper Section 5)
        const daysSince     = Math.floor((today - new Date(row.last_updated)) / (1000 * 60 * 60 * 24));
        const decayedPSS    = applyTimeDecay(row.pss, daysSince);

        if (!cellPSS[key]) cellPSS[key] = [];
        cellPSS[key].push(decayedPSS);
    }

    // Aggregate: SS = floor(avg pSS)  — Definition 3
    const SSq = {};
    for (const [key, pssArray] of Object.entries(cellPSS)) {
        const avg    = pssArray.reduce((s, v) => s + v, 0) / pssArray.length;
        const SS     = Math.floor(avg);
        SSq[key]     = normalizeSS(SS);
    }

    // For cells in Aq with NO user data → use global safety_scores as fallback
    const missingKeys = [...cellKeys].filter(k => !(k in SSq));
    if (missingKeys.length > 0) {
        const missingCells    = missingKeys.map(k => {
            const [x, y] = k.split(',').map(Number);
            return { grid_x: x, grid_y: y };
        });
        const placeholderMiss = missingCells.map(() => '(?, ?)').join(', ');
        const missingVals     = missingCells.flatMap(c => [c.grid_x, c.grid_y]);

        const [fallback] = await db.query(`
            SELECT grid_x, grid_y, safety_score
            FROM safety_scores
            WHERE (grid_x, grid_y) IN (${placeholderMiss})
        `, missingVals);

        for (const row of fallback) {
            SSq[`${row.grid_x},${row.grid_y}`] = parseFloat(row.safety_score);
        }
    }

    console.log(`[crowdService] SSq computed for ${Object.keys(SSq).length} cells`);
    console.log(`[crowdService] pSSs revealed: ${rows.length} (privacy metric)`);

    return SSq;
}

// ── Check-in (updates user pSS + KS) ─────────────────────────────────────────

/**
 * recordCheckin
 *
 * Records a user visit to a grid cell.
 * Updates their personal pSS using the paper's model (Section 5).
 * Updates their KS = 1 for this cell.
 *
 * @param {string}  userId   - user ID
 * @param {number}  gridX    - grid cell X
 * @param {number}  gridY    - grid cell Y
 * @param {boolean} isUnsafe - true = unsafe event, false = safe event
 */
async function recordCheckin(userId, gridX, gridY, isUnsafe = false) {
    const gamma = isUnsafe ? PARAMS.beta : PARAMS.alpha;

    // Get current pSS for this user+cell
    const [existing] = await db.query(
        'SELECT pss, last_updated FROM user_pss WHERE user_id=? AND grid_x=? AND grid_y=?',
        [userId, gridX, gridY]
    );

    let currentPSS = 0;
    if (existing.length > 0) {
        const daysSince = Math.floor(
            (Date.now() - new Date(existing[0].last_updated)) / (1000 * 60 * 60 * 24)
        );
        currentPSS = applyTimeDecay(existing[0].pss, daysSince);
    }

    // Update pSS for this cell and nearby cells (Gaussian spread)
    const spreadR = PARAMS.h * 3;

    // Find all cells this user knows within spread radius
    const [nearbyCells] = await db.query(`
        SELECT grid_x, grid_y, pss FROM user_pss
        WHERE user_id = ?
          AND ABS(grid_x - ?) <= ? AND ABS(grid_y - ?) <= ?
    `, [userId, gridX, spreadR, gridY, spreadR]);

    // Update the target cell
    const directImpact = clamp(currentPSS + gamma);
    await db.query(`
        INSERT INTO user_pss (user_id, grid_x, grid_y, pss, last_updated)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE pss=?, last_updated=NOW()
    `, [userId, gridX, gridY, directImpact, directImpact]);

    // Spread Gaussian impact to nearby cells
    for (const nearby of nearbyCells) {
        if (nearby.grid_x === gridX && nearby.grid_y === gridY) continue;
        const dx      = nearby.grid_x - gridX;
        const dy      = nearby.grid_y - gridY;
        const dist    = Math.sqrt(dx * dx + dy * dy);
        const impact  = gaussianDecay(gamma, dist);
        const newPSS  = clamp(nearby.pss + impact);

        await db.query(
            'UPDATE user_pss SET pss=?, last_updated=NOW() WHERE user_id=? AND grid_x=? AND grid_y=?',
            [newPSS, userId, nearby.grid_x, nearby.grid_y]
        );
    }

    // Update KS = 1 for this cell (paper Section 2, Definition 1)
    await db.query(`
        INSERT INTO user_ks (user_id, grid_x, grid_y, ks, last_visit)
        VALUES (?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE ks=1, last_visit=NOW()
    `, [userId, gridX, gridY]);

    return { userId, gridX, gridY, newPSS: directImpact, isUnsafe };
}

// ── Get all users ─────────────────────────────────────────────────────────────

async function getAllUsers() {
    const [rows] = await db.query(`
        SELECT u.user_id, u.username, u.created_at,
               COUNT(DISTINCT k.grid_x) AS cells_known
        FROM users u
        LEFT JOIN user_ks k ON u.user_id = k.user_id AND k.ks = 1
        GROUP BY u.user_id
        ORDER BY u.username
    `);
    return rows;
}

module.exports = {
    selectQueryGroup,
    aggregatePSS,
    recordCheckin,
    getAllUsers,
    PARAMS,
};
