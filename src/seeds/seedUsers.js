/**
 * seedUsers.js
 * Creates 10 simulated crowd users with random check-ins.
 * Run: node src/seeds/seedUsers.js
 */

const db   = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const PARAMS = { beta: -2, S: 10, h: 2 };

const USERS = [
    { username: 'user_alice'  },
    { username: 'user_bob'    },
    { username: 'user_carol'  },
    { username: 'user_david'  },
    { username: 'user_eva'    },
    { username: 'user_frank'  },
    { username: 'user_grace'  },
    { username: 'user_henry'  },
    { username: 'user_iris'   },
    { username: 'user_james'  },
];

function gaussianWeight(dist) {
    return Math.exp(-(dist * dist) / (2 * PARAMS.h * PARAMS.h));
}

async function seed() {
    console.log('=== Crowd System Seed Script ===');
    console.log('Simulating 10 users with random Chicago check-ins\n');

    const [allCells] = await db.query(
        'SELECT grid_x, grid_y, crime_count FROM safety_scores'
    );

    if (allCells.length === 0) {
        console.error('No safety_scores found. Run server first to compute scores.');
        process.exit(1);
    }

    console.log(`Loaded ${allCells.length} grid cells from safety_scores`);

    // ── Clear existing data — DELETE CHILDREN BEFORE PARENT ──────────────────
    // Foreign key chain: user_fl_weights → users, user_ks → users, user_pss → users
    // Must delete child tables first or MySQL throws FK constraint error
    await db.query('DELETE FROM user_fl_weights');
    await db.query('DELETE FROM user_ks');
    await db.query('DELETE FROM user_pss');
    await db.query('DELETE FROM users');
    // Reset FL global model back to default
    await db.query(`
        UPDATE fl_global_model
        SET w0=-2.0, w1=0.0, w2=0.0, w3=0.0, w4=0.0, round=0, participants=0
        WHERE id=1
    `);
    await db.query('DELETE FROM fl_rounds');
    console.log('Cleared existing user + FL data\n');

    const createdUsers = [];

    for (const userData of USERS) {
        const userId = uuidv4();

        await db.query(
            'INSERT INTO users (user_id, username) VALUES (?, ?)',
            [userId, userData.username]
        );

        // Each user knows 20-40% of all cells
        const coveragePct = 0.20 + Math.random() * 0.20;
        const shuffled    = [...allCells].sort(() => Math.random() - 0.5);
        const knownCells  = shuffled.slice(0, Math.floor(shuffled.length * coveragePct));

        console.log(`${userData.username} (${userId.slice(0,8)}...) knows ${knownCells.length} cells`);

        const pssValues = [];
        const ksValues  = [];
        const maxCrime  = Math.max(...allCells.map(c => c.crime_count));
        const personalBias = 0.8 + Math.random() * 0.4;

        for (const cell of knownCells) {
            const nearbyCells = allCells.filter(c => {
                const dx = c.grid_x - cell.grid_x;
                const dy = c.grid_y - cell.grid_y;
                return Math.sqrt(dx*dx + dy*dy) <= PARAMS.h * 3;
            });

            let weightedDensity = 0;
            for (const nearby of nearbyCells) {
                const dx   = nearby.grid_x - cell.grid_x;
                const dy   = nearby.grid_y - cell.grid_y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                weightedDensity += nearby.crime_count * gaussianWeight(dist) * personalBias;
            }

            const normalized = Math.min(weightedDensity / maxCrime, 1);
            const pSS        = parseFloat((-PARAMS.S * normalized).toFixed(4));

            pssValues.push([userId, cell.grid_x, cell.grid_y, pSS]);
            ksValues.push([userId,  cell.grid_x, cell.grid_y, 1]);
        }

        if (pssValues.length > 0) {
            await db.query(
                'INSERT INTO user_pss (user_id, grid_x, grid_y, pss) VALUES ?',
                [pssValues]
            );
        }
        if (ksValues.length > 0) {
            await db.query(
                'INSERT INTO user_ks (user_id, grid_x, grid_y, ks) VALUES ?',
                [ksValues]
            );
        }

        createdUsers.push({ userId, username: userData.username, cellCount: knownCells.length });
    }

    console.log('\n=== Seed Complete ===');
    console.log('Created users:');
    createdUsers.forEach(u => {
        console.log(`  ${u.username.padEnd(15)} id=${u.userId.slice(0,8)}...  cells=${u.cellCount}`);
    });
    console.log('\nNext steps:');
    console.log('  curl.exe -X POST http://localhost:5000/api/fl/round   (run 3-5 times)');
    console.log('  curl.exe http://localhost:5000/api/fl/status\n');

    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
