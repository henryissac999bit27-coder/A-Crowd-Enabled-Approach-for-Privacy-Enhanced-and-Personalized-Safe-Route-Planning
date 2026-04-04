/**
 * seedUsers.js
 *
 * Creates 10 simulated crowd users with random check-ins
 * across Chicago grid cells from the crimes table.
 *
 * Run once: node src/seeds/seedUsers.js
 *
 * Paper simulation approach:
 *   - Each user gets assigned a random subset of grid cells they "know"
 *   - For each known cell, they get a pSS based on the crime density there
 *   - Their KS = 1 for all their known cells
 *   - This simulates 10 people who live/travel in different parts of Chicago
 */

const db   = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ── Paper parameters (Section 5) ─────────────────────────────────────────────
const PARAMS = {
    beta:        -2,
    S:            10,
    h:            2,
    KS_WINDOW:   30,   // w = 30 days — KS=1 if visited in last 30 days
};

const USERS = [
    { username: 'user_alice'   },
    { username: 'user_bob'     },
    { username: 'user_carol'   },
    { username: 'user_david'   },
    { username: 'user_eva'     },
    { username: 'user_frank'   },
    { username: 'user_grace'   },
    { username: 'user_henry'   },
    { username: 'user_iris'    },
    { username: 'user_james'   },
];

function gaussianWeight(dist) {
    return Math.exp(-(dist * dist) / (2 * PARAMS.h * PARAMS.h));
}

function normalizeSS(pSS) {
    return parseFloat(((pSS + PARAMS.S) / (2 * PARAMS.S)).toFixed(4));
}

async function seed() {
    console.log('=== Crowd System Seed Script ===');
    console.log('Simulating 10 users with random Chicago check-ins\n');

    // ── Load all grid cells from safety_scores ────────────────────────────────
    const [allCells] = await db.query(
        'SELECT grid_x, grid_y, crime_count FROM safety_scores'
    );

    if (allCells.length === 0) {
        console.error('No safety_scores found. Run server first to compute scores.');
        process.exit(1);
    }

    console.log(`Loaded ${allCells.length} grid cells from safety_scores`);

    // ── Clear existing seed data ──────────────────────────────────────────────
    await db.query('DELETE FROM user_ks');
    await db.query('DELETE FROM user_pss');
    await db.query('DELETE FROM users');
    console.log('Cleared existing user data\n');

    const createdUsers = [];

    for (const userData of USERS) {
        const userId = uuidv4();

        // Insert user
        await db.query(
            'INSERT INTO users (user_id, username) VALUES (?, ?)',
            [userId, userData.username]
        );

        // Each user knows a RANDOM 20-40% subset of all cells
        // (simulates people who travel in different neighbourhoods)
        const coveragePercent = 0.20 + Math.random() * 0.20;
        const shuffled        = [...allCells].sort(() => Math.random() - 0.5);
        const knownCells      = shuffled.slice(0, Math.floor(shuffled.length * coveragePercent));

        console.log(`${userData.username} (${userId.slice(0,8)}...) knows ${knownCells.length} cells`);

        const pssValues  = [];
        const ksValues   = [];

        for (const cell of knownCells) {

            // Find nearby crimes (within spread radius) to compute this user's pSS
            const nearbyCells = allCells.filter(c => {
                const dx = c.grid_x - cell.grid_x;
                const dy = c.grid_y - cell.grid_y;
                return Math.sqrt(dx * dx + dy * dy) <= PARAMS.h * 3;
            });

            // Compute Gaussian-weighted density for this user's experience
            // Add personal variance: each user perceives safety slightly differently
            const personalBias = 0.8 + Math.random() * 0.4; // 0.8 to 1.2× multiplier

            let weightedDensity = 0;
            for (const nearby of nearbyCells) {
                const dx   = nearby.grid_x - cell.grid_x;
                const dy   = nearby.grid_y - cell.grid_y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                weightedDensity += nearby.crime_count * gaussianWeight(dist) * personalBias;
            }

            // Get global max density for normalization
            // (We use a rough max based on highest crime_count × full gaussian)
            const maxCrimeCount = Math.max(...allCells.map(c => c.crime_count));
            const roughMaxDensity = maxCrimeCount * 1.0; // dist=0, weight=1

            const normalized  = Math.min(weightedDensity / roughMaxDensity, 1);
            const pSS         = parseFloat((-PARAMS.S * normalized).toFixed(4));

            pssValues.push([userId, cell.grid_x, cell.grid_y, pSS]);
            ksValues.push([userId, cell.grid_x, cell.grid_y, 1]);
        }

        // Batch insert pSS values
        if (pssValues.length > 0) {
            await db.query(
                'INSERT INTO user_pss (user_id, grid_x, grid_y, pss) VALUES ?',
                [pssValues]
            );
        }

        // Batch insert KS values
        if (ksValues.length > 0) {
            await db.query(
                'INSERT INTO user_ks (user_id, grid_x, grid_y, ks) VALUES ?',
                [ksValues]
            );
        }

        createdUsers.push({ userId, username: userData.username, cellCount: knownCells.length });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n=== Seed Complete ===');
    console.log('Created users:');
    createdUsers.forEach(u => {
        console.log(`  ${u.username.padEnd(15)} id=${u.userId.slice(0,8)}...  cells=${u.cellCount}`);
    });

    console.log('\nYou can now use these userIds in /api/route?userId=...');
    console.log('Or use GET /api/users to list all users\n');

    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
