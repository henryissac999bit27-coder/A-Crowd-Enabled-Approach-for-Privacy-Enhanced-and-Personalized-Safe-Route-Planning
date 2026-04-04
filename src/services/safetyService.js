/**
 * safetyService.js
 *
 * Implements the Safety Score (pSS) model from:
 * "A Crowd-Enabled Approach for Privacy-Enhanced and Personalized
 *  Safe Route Planning" — Islam, Hashem, Shahriyar (IEEE TKDE 2023)
 *
 * ROOT CAUSE HISTORY:
 *   v1: All identical  → time decay collapsed everything to same tiny value
 *   v2: Still narrow   → maxIntervals cap still too small per crime
 *   v3: All −10        → raw Gaussian × 256 crimes saturates immediately
 *
 * CORRECT APPROACH (final):
 *   The paper says (Section 9.1): "We normalize the crime count per grid
 *   cell for each day in the range [0,1] to get the crime probability."
 *
 *   So pSS is NOT computed by summing raw impacts.
 *   It is computed from the NORMALIZED crime density of each cell
 *   relative to the busiest cell. This gives a proper spread [−S, 0].
 *
 *   Formula derived from paper:
 *     crimeRatio = cell_crime_count / max_crime_count   ∈ [0, 1]
 *     pSS = −S × crimeRatio × gaussianWeight
 *
 *   This guarantees:
 *     - Most dangerous cell  → pSS = −10
 *     - Least dangerous cell → pSS near 0
 *     - All others           → spread between −10 and 0
 */

const db = require('../config/db');

// ─── Paper Parameters ─────────────────────────────────────────────────────────
const PARAMS = {
    S: 10,  // pSS range [−S, +S]  (paper Section 5, Section 9.1 uses S=10)
    h: 2,   // Gaussian spread in grid cells
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * gaussianWeight
 * Computes the spatial weight for a cell based on distance from crime cluster.
 * w(dist) = e^(−dist² / 2h²)
 *
 * dist=0 → w=1.000  (crime is at this cell)
 * dist=1 → w=0.778
 * dist=2 → w=0.368  (= h, boundary of main influence)
 * dist=4 → w=0.018  (negligible)
 * dist=6 → w=0.000
 */
function gaussianWeight(dist) {
    return Math.exp(-(dist * dist) / (2 * PARAMS.h * PARAMS.h));
}

function clamp(value) {
    return Math.max(-PARAMS.S, Math.min(PARAMS.S, value));
}

/**
 * normalizeSS
 * pSS [−S, +S] → safety_score [0, 1]
 *   pSS = −10 → 0.0  (most dangerous)
 *   pSS =   0 → 0.5
 *   pSS = +10 → 1.0  (safest — not reachable with only crime data)
 */
function normalizeSS(pSS) {
    return parseFloat(((pSS + PARAMS.S) / (2 * PARAMS.S)).toFixed(4));
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * computeAndStoreSafetyScores
 *
 * Step 1: Count crimes per grid cell
 * Step 2: For each cell, compute Gaussian-weighted crime density
 *         from all cells within spread radius
 * Step 3: Normalize against the maximum weighted density
 * Step 4: Map to pSS = −S × normalizedDensity
 * Step 5: Write to safety_scores table
 */
async function computeAndStoreSafetyScores() {
    console.log('[safetyService] Loading crime counts per grid cell...');

    // ── Step 1: Crime count per cell ──────────────────────────────────────────
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

    console.log(`[safetyService] ${crimeCounts.length} unique grid cells with crimes.`);

    // Build a fast lookup: cellKey → crime_count
    const crimeMap = {};
    crimeCounts.forEach(c => {
        crimeMap[`${c.grid_x},${c.grid_y}`] = parseInt(c.crime_count);
    });

    const cells    = crimeCounts.map(c => ({ x: c.grid_x, y: c.grid_y }));
    const spreadR  = PARAMS.h * 3; // 6 cells radius

    // ── Step 2: Gaussian-weighted crime density per cell ─────────────────────
    // For each cell, sum up (crime_count × gaussianWeight(dist))
    // from all cells within the spread radius.
    // This means: a cell surrounded by high-crime neighbors also scores poorly.
    const densities = [];

    for (const cell of cells) {
        let weightedDensity = 0;

        for (const other of cells) {
            const dx   = other.x - cell.x;
            const dy   = other.y - cell.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > spreadR) continue;

            const count  = crimeMap[`${other.x},${other.y}`] || 0;
            const weight = gaussianWeight(dist);
            weightedDensity += count * weight;
        }

        densities.push({ cell, weightedDensity });
    }

    // ── Step 3: Normalize densities to [0, 1] ─────────────────────────────────
    const maxDensity = Math.max(...densities.map(d => d.weightedDensity));
    const minDensity = Math.min(...densities.map(d => d.weightedDensity));
    const range      = maxDensity - minDensity || 1; // avoid divide by zero

    console.log(`[safetyService] Density range: [${minDensity.toFixed(2)}, ${maxDensity.toFixed(2)}]`);

    // ── Step 4: Compute pSS from normalized density ───────────────────────────
    // pSS = −S × normalizedDensity
    //   highest density → pSS = −10  (most dangerous)
    //   lowest  density → pSS = 0    (least dangerous)
    const results = densities.map(({ cell, weightedDensity }) => {
        const normalized  = (weightedDensity - minDensity) / range;  // [0, 1]
        const pSS         = clamp(-PARAMS.S * normalized);            // [−10, 0]
        const safetyScore = normalizeSS(pSS);
        const crimeCount  = crimeMap[`${cell.x},${cell.y}`] || 0;

        return {
            grid_x:       cell.x,
            grid_y:       cell.y,
            pss:          parseFloat(pSS.toFixed(4)),
            safety_score: safetyScore,
            crime_count:  crimeCount,
        };
    });

    // ── Step 5: Write to DB ───────────────────────────────────────────────────
    console.log('[safetyService] Writing to safety_scores table...');

    await db.query('DELETE FROM safety_scores');

    if (results.length > 0) {
        const values = results.map(r => [
            r.grid_x, r.grid_y, r.pss, r.safety_score, r.crime_count
        ]);
        await db.query(
            'INSERT INTO safety_scores (grid_x, grid_y, pss, safety_score, crime_count) VALUES ?',
            [values]
        );
    }

    // ── Distribution log ──────────────────────────────────────────────────────
    const scores   = results.map(r => r.pss);
    const minP     = Math.min(...scores).toFixed(4);
    const maxP     = Math.max(...scores).toFixed(4);
    const avgP     = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4);
    const vDanger  = scores.filter(s => s <= -8).length;
    const danger   = scores.filter(s => s > -8  && s <= -5).length;
    const moderate = scores.filter(s => s > -5  && s <= -2).length;
    const fairSafe = scores.filter(s => s > -2  && s <= -0.5).length;
    const safe     = scores.filter(s => s > -0.5).length;

    console.log('─────────────────────────────────────────');
    console.log(`[safetyService] pSS range : [${minP}, ${maxP}]  avg: ${avgP}`);
    console.log(`  Very dangerous  (≤ −8)     : ${vDanger}  cells`);
    console.log(`  Dangerous    (−8 to −5)    : ${danger}  cells`);
    console.log(`  Moderate     (−5 to −2)    : ${moderate}  cells`);
    console.log(`  Fairly safe  (−2 to −0.5)  : ${fairSafe}  cells`);
    console.log(`  Safe         (> −0.5)       : ${safe}  cells`);
    console.log('─────────────────────────────────────────');

    return results;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function getSafetyScores() {
    const [rows] = await db.query(
        'SELECT grid_x, grid_y, pss, safety_score, crime_count FROM safety_scores'
    );
    return rows;
}

/**
 * getConfidenceLevel — paper Section 7.2
 * CL(R) = min( (100/z) × Σ(li × mci) / (dist(R) × m) , 1 )
 */
async function getConfidenceLevel(path, z = 50) {
    if (!path || path.length === 0) return 0;

    const [scores] = await db.query(
        'SELECT grid_x, grid_y, crime_count FROM safety_scores'
    );

    const scoreMap    = {};
    let   totalCrimes = 0;
    scores.forEach(s => {
        scoreMap[`${s.grid_x},${s.grid_y}`] = s.crime_count;
        totalCrimes += s.crime_count;
    });

    if (totalCrimes === 0) return 0;

    let weightedSum = 0;
    for (const cell of path) {
        weightedSum += (scoreMap[`${cell.x},${cell.y}`] || 0);
    }

    const CL = Math.min(
        (100 / z) * (weightedSum / (path.length * totalCrimes)),
        1
    );
    return parseFloat(CL.toFixed(4));
}

module.exports = {
    computeAndStoreSafetyScores,
    getSafetyScores,
    getConfidenceLevel,
    normalizeSS,
    PARAMS,
};