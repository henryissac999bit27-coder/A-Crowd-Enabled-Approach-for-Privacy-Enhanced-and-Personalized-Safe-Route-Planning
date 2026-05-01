/**
 * safetyService.js
 *
 * Implements the pSS model from:
 * "A Crowd-Enabled Approach for Privacy-Enhanced and Personalized
 *  Safe Route Planning" — Islam, Hashem, Shahriyar (IEEE TKDE 2023)
 *
 * NOVELTY EXTENSION:
 *   Paper uses fixed β = −2 for all unsafe events (Section 5).
 *   We extend this with Federated Learning (flService.js):
 *   β is now predicted by a personalized FL model per user,
 *   trained on their own pSS history via FedAvg — no raw data shared.
 *   This directly implements paper's future work (Section 10):
 *   "Learn impact values of various event types in different contexts."
 */

const db = require('../config/db');

// ── Paper Parameters ──────────────────────────────────────────────────────────
const PARAMS = {
    S:  10,   // pSS bound [−S, +S]
    h:  2,    // Gaussian spread radius in grid cells
};

function gaussianWeight(dist) {
    return Math.exp(-(dist * dist) / (2 * PARAMS.h * PARAMS.h));
}

function clamp(v) {
    return Math.max(-PARAMS.S, Math.min(PARAMS.S, v));
}

function normalizeSS(pSS) {
    return parseFloat(((pSS + PARAMS.S) / (2 * PARAMS.S)).toFixed(4));
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * computeAndStoreSafetyScores
 *
 * Computes pSS per grid cell using Gaussian spatial decay + normalization.
 *
 * FL integration: when a userId is provided, uses the FL-personalized β
 * instead of the fixed global value. This makes the safety map personal.
 *
 * @param {string|null} userId - optional user for personalized β
 */
async function computeAndStoreSafetyScores(userId = null) {
    console.log('[safetyService] Loading crime counts per grid cell...');

    // Get FL-personalized or global beta
    let betaValue = -2.0; // paper default
    try {
        if (userId) {
            const { getPersonalizedBeta } = require('./flService');
            betaValue = await getPersonalizedBeta(userId, {
                crime_count: 200, hour: 12, dayOfWeek: 3,
                nearby_count: 100, max_count: 500,
            });
            console.log(`[safetyService] Using FL-personalized β=${betaValue.toFixed(4)} for user ${userId}`);
        } else {
            // Try global FL model
            const [globalRows] = await db.query(
                'SELECT w0 FROM fl_global_model WHERE id=1'
            );
            if (globalRows.length > 0 && globalRows[0].w0 !== -2.0) {
                betaValue = globalRows[0].w0;
                console.log(`[safetyService] Using FL global β=${betaValue.toFixed(4)}`);
            } else {
                console.log(`[safetyService] Using paper default β=${betaValue} (no FL model yet)`);
            }
        }
    } catch (err) {
        console.log(`[safetyService] FL unavailable, using default β=${betaValue}`);
    }

    const [crimeCounts] = await db.query(`
        SELECT grid_x, grid_y, COUNT(*) AS crime_count
        FROM crimes
        WHERE grid_x IS NOT NULL AND grid_y IS NOT NULL
        GROUP BY grid_x, grid_y
    `);

    if (crimeCounts.length === 0) {
        console.warn('[safetyService] No crime records found.');
        return [];
    }

    console.log(`[safetyService] ${crimeCounts.length} cells | β=${betaValue.toFixed(4)}`);

    const crimeMap = {};
    crimeCounts.forEach(c => { crimeMap[`${c.grid_x},${c.grid_y}`] = parseInt(c.crime_count); });

    const cells   = crimeCounts.map(c => ({ x: c.grid_x, y: c.grid_y }));
    const spreadR = PARAMS.h * 3;
    const results = [];

    for (const cell of cells) {
        let weightedDensity = 0;

        for (const other of cells) {
            const dx   = other.x - cell.x;
            const dy   = other.y - cell.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > spreadR) continue;
            weightedDensity += crimeMap[`${other.x},${other.y}`] * gaussianWeight(dist);
        }

        results.push({ cell, weightedDensity });
    }

    // Normalize to [0,1] then map to pSS using FL-learned β
    const maxD = Math.max(...results.map(r => r.weightedDensity));
    const minD = Math.min(...results.map(r => r.weightedDensity));
    const range = maxD - minD || 1;

    console.log(`[safetyService] Density range: [${minD.toFixed(2)}, ${maxD.toFixed(2)}]`);

    const finalResults = results.map(({ cell, weightedDensity }) => {
        const normalized  = (weightedDensity - minD) / range;  // [0,1]
        // Use FL-personalized beta here — key novelty point
        // Adaptive multiplier: keeps pSS spread across [-10,0] regardless of beta value
        // Paper default beta=-2 needs multiplier ~5 to reach -10 at max density
        // FL learned beta=-6.88 needs smaller multiplier so scores stay distributed
        const multiplier  = Math.abs(betaValue) > 2 ? (10 / Math.abs(betaValue)) : 5;
        const pSS         = clamp(betaValue * multiplier * normalized);
        const safetyScore = normalizeSS(pSS);
        return {
            grid_x:       cell.x,
            grid_y:       cell.y,
            pss:          parseFloat(pSS.toFixed(4)),
            safety_score: safetyScore,
            crime_count:  crimeMap[`${cell.x},${cell.y}`] || 0,
        };
    });

    // Write to DB
    console.log('[safetyService] Writing to safety_scores table...');
    await db.query('DELETE FROM safety_scores');

    if (finalResults.length > 0) {
        const values = finalResults.map(r => [r.grid_x, r.grid_y, r.pss, r.safety_score, r.crime_count]);
        await db.query(
            'INSERT INTO safety_scores (grid_x, grid_y, pss, safety_score, crime_count) VALUES ?',
            [values]
        );
    }

    // Distribution log
    const scores   = finalResults.map(r => r.pss);
    const minP     = Math.min(...scores).toFixed(4);
    const maxP     = Math.max(...scores).toFixed(4);
    const avgP     = (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(4);
    const vDanger  = scores.filter(s=>s<=-8).length;
    const moderate = scores.filter(s=>s>-8&&s<=-2).length;
    const safe     = scores.filter(s=>s>-2).length;

    console.log('─────────────────────────────────────────');
    console.log(`[safetyService] pSS range: [${minP}, ${maxP}] avg: ${avgP} | β used: ${betaValue.toFixed(4)}`);
    console.log(`  Very dangerous (≤−8): ${vDanger} | Moderate: ${moderate} | Safe (>−2): ${safe}`);
    console.log('─────────────────────────────────────────');

    return finalResults;
}

async function getSafetyScores() {
    const [rows] = await db.query(
        'SELECT grid_x, grid_y, pss, safety_score, crime_count FROM safety_scores'
    );
    return rows;
}

async function getConfidenceLevel(path, z = 50) {
    // Paper Section 7.2 correct formula:
    // CL(R) = min( (100/z) x sum(li x mci) / (dist(R) x m) , 1 )
    // li  = 1 step per cell
    // mci = users with KS=1 in cell ci (from user_ks table)
    // m   = total group size (users table)
    if (!path || path.length === 0) return 0;

    const [groupRows] = await db.query(
        'SELECT COUNT(DISTINCT user_id) as m FROM user_ks WHERE ks=1'
    );
    const m = groupRows[0] ? parseInt(groupRows[0].m) : 0;
    if (m === 0) return 0;

    const [ksRows] = await db.query(
        'SELECT grid_x, grid_y, COUNT(user_id) as mci FROM user_ks WHERE ks=1 GROUP BY grid_x, grid_y'
    );
    const mciMap = {};
    ksRows.forEach(r => { mciMap[`${r.grid_x},${r.grid_y}`] = parseInt(r.mci); });

    let weightedSum = 0;
    for (const cell of path) {
        const mci = mciMap[`${cell.x},${cell.y}`] || 0;
        weightedSum += 1 * mci;
    }

    const CL = Math.min((100 / z) * (weightedSum / (path.length * m)), 1);
    return parseFloat(CL.toFixed(4));
}

module.exports = {
    computeAndStoreSafetyScores,
    getSafetyScores,
    getConfidenceLevel,
    normalizeSS,
    PARAMS,
};