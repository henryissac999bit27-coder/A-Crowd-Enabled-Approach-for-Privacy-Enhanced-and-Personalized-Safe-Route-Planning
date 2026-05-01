// crowdService.js
// Crowd system with R-tree indexed pSS lookup
// Paper Section 4 (system overview) + Section 6 (indexing)
//
// R-tree integration (Paper Section 6.1):
//   Each user's pSS values are loaded from MySQL and built into an R-tree.
//   aggregatePSS() uses R-tree search instead of raw array scan.
//   This gives O(log N) lookup per cell vs O(N) linear scan.
//   Also shows supercell compression stats (paper Table 5: avg 52% savings).

const db    = require('../config/db');
const { RTree } = require('./RTree');

// Paper parameters
const PARAMS = {
    alpha:  1,
    beta:  -2,
    S:      10,
    rd:     0.8,
    deltaD: 2,
    h:      2,
    w:      30,
};

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

// selectQueryGroup
// Paper Section 7.1: Gq = users with KS=1 in at least one cell of Aq
async function selectQueryGroup(Aq) {
    if (!Aq || Aq.length === 0) return [];

    const placeholders = Aq.map(function() { return '(?,?)'; }).join(',');
    const values       = Aq.reduce(function(acc, c) { acc.push(c.grid_x, c.grid_y); return acc; }, []);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PARAMS.w);

    const result = await db.query(
        'SELECT DISTINCT k.user_id FROM user_ks k WHERE k.ks=1 AND k.last_visit>=? AND (k.grid_x,k.grid_y) IN (' + placeholders + ')',
        [cutoff].concat(values)
    );
    const rows = result[0];
    const ids  = rows.map(function(r) { return r.user_id; });
    console.log('[crowdService] Query group Gq: ' + ids.length + ' users for ' + Aq.length + ' cells');
    return ids;
}

// aggregatePSS — now uses R-tree per user (Paper Section 6.1)
// Paper Definition 3: SS = floor(avg pSS)
async function aggregatePSS(groupIds, Aq) {
    if (!groupIds || groupIds.length === 0 || !Aq || Aq.length === 0) return {};

    const today    = new Date();
    const cellKeys = new Set(Aq.map(function(c) { return c.grid_x + ',' + c.grid_y; }));

    const placeholderUsers = groupIds.map(function() { return '?'; }).join(',');
    const placeholderCells = Aq.map(function() { return '(?,?)'; }).join(',');
    const cellValues       = Aq.reduce(function(a,c) { a.push(c.grid_x,c.grid_y); return a; }, []);

    // Load all pSS values for group users in Aq
    const result = await db.query(
        'SELECT user_id,grid_x,grid_y,pss,last_updated FROM user_pss WHERE user_id IN (' +
        placeholderUsers + ') AND (grid_x,grid_y) IN (' + placeholderCells + ')',
        groupIds.concat(cellValues)
    );
    const rows = result[0];

    // Group raw rows by user_id — build one R-tree per user
    const userRows = {};
    rows.forEach(function(r) {
        if (!userRows[r.user_id]) userRows[r.user_id] = [];
        userRows[r.user_id].push(r);
    });

    // Build R-tree per user and search for each Aq cell
    const cellPSS   = {};  // cellKey -> [pSS values from different users]
    const rtreeStats = [];

    for (var uid in userRows) {
        var tree = new RTree(uid);
        tree.build(userRows[uid]);
        rtreeStats.push(tree.getStats());

        // Search R-tree for each cell in Aq
        Aq.forEach(function(cell) {
            var key = cell.grid_x + ',' + cell.grid_y;
            var pss = tree.search(cell.grid_x, cell.grid_y);
            if (pss === null) return;

            // Apply time decay
            var row         = userRows[uid].find(function(r) { return r.grid_x === cell.grid_x && r.grid_y === cell.grid_y; });
            var daysSince   = row ? Math.floor((today - new Date(row.last_updated)) / 86400000) : 0;
            var decayedPSS  = applyTimeDecay(pss, daysSince);

            if (!cellPSS[key]) cellPSS[key] = [];
            cellPSS[key].push(decayedPSS);
        });
    }

    // Log R-tree compression stats (paper Table 5 equivalent)
    if (rtreeStats.length > 0) {
        var avgCompression = rtreeStats.reduce(function(s,r) { return s + r.compressionPct; }, 0) / rtreeStats.length;
        var avgSupercells  = rtreeStats.reduce(function(s,r) { return s + r.supercells; }, 0) / rtreeStats.length;
        console.log('[RTree] avg compression=' + avgCompression.toFixed(1) + '% avgSupercells=' + avgSupercells.toFixed(0) + ' (paper Table 5 target: 52%)');
    }

    // Aggregate: SS = floor(avg pSS) — Definition 3
    var SSq = {};
    for (var key in cellPSS) {
        var arr = cellPSS[key];
        var avg = arr.reduce(function(s,v) { return s+v; }, 0) / arr.length;
        SSq[key] = normalizeSS(Math.floor(avg));
    }

    // Fallback: cells with no user data use global safety_scores
    var missingKeys = Array.from(cellKeys).filter(function(k) { return !(k in SSq); });
    if (missingKeys.length > 0) {
        var missingCells = missingKeys.map(function(k) {
            var parts = k.split(',');
            return { grid_x: parseInt(parts[0]), grid_y: parseInt(parts[1]) };
        });
        var placeholderMiss = missingCells.map(function() { return '(?,?)'; }).join(',');
        var missingVals     = missingCells.reduce(function(a,c) { a.push(c.grid_x,c.grid_y); return a; }, []);
        var fallback        = await db.query(
            'SELECT grid_x,grid_y,safety_score FROM safety_scores WHERE (grid_x,grid_y) IN (' + placeholderMiss + ')',
            missingVals
        );
        fallback[0].forEach(function(r) {
            SSq[r.grid_x + ',' + r.grid_y] = parseFloat(r.safety_score);
        });
    }

    console.log('[crowdService] SSq: ' + Object.keys(SSq).length + ' cells | pSSs revealed: ' + rows.length);
    return SSq;
}

// getRTreeStats — for /api/rtree/stats endpoint
async function getRTreeStats() {
    var usersResult = await db.query('SELECT user_id, username FROM users');
    var users = usersResult[0];
    var allStats = [];

    for (var i = 0; i < users.length; i++) {
        var user = users[i];
        var rowsResult = await db.query(
            'SELECT grid_x,grid_y,pss,last_updated FROM user_pss WHERE user_id=?',
            [user.user_id]
        );
        var rows = rowsResult[0];
        if (rows.length === 0) continue;

        var tree = new RTree(user.user_id);
        tree.build(rows);
        var stats = tree.getStats();
        stats.username = user.username;
        allStats.push(stats);
    }

    var totalRaw        = allStats.reduce(function(s,r) { return s + r.rawCells; }, 0);
    var totalSupercells = allStats.reduce(function(s,r) { return s + r.supercells; }, 0);
    var avgCompression  = allStats.length > 0
        ? allStats.reduce(function(s,r) { return s + r.compressionPct; }, 0) / allStats.length
        : 0;

    return {
        perUser:       allStats,
        summary: {
            totalUsers:       allStats.length,
            totalRawCells:    totalRaw,
            totalSupercells:  totalSupercells,
            avgCompression:   parseFloat(avgCompression.toFixed(1)),
            paperTarget:      52.0,
            paperMatch:       Math.abs(avgCompression - 52.0) < 15,
        },
        paperRef: 'Table 5: avg 8438 pSSs stored as 3552 supercells = 52% compression',
    };
}

// recordCheckin — updates pSS + KS on user visit
async function recordCheckin(userId, gridX, gridY, isUnsafe) {
    var gamma = isUnsafe ? PARAMS.beta : PARAMS.alpha;

    var existResult = await db.query(
        'SELECT pss,last_updated FROM user_pss WHERE user_id=? AND grid_x=? AND grid_y=?',
        [userId, gridX, gridY]
    );
    var existing = existResult[0];

    var currentPSS = 0;
    if (existing.length > 0) {
        var daysSince = Math.floor((Date.now() - new Date(existing[0].last_updated)) / 86400000);
        currentPSS = applyTimeDecay(existing[0].pss, daysSince);
    }

    var directImpact = clamp(currentPSS + gamma);
    await db.query(
        'INSERT INTO user_pss (user_id,grid_x,grid_y,pss,last_updated) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE pss=?,last_updated=NOW()',
        [userId, gridX, gridY, directImpact, directImpact]
    );

    await db.query(
        'INSERT INTO user_ks (user_id,grid_x,grid_y,ks,last_visit) VALUES (?,?,?,1,NOW()) ON DUPLICATE KEY UPDATE ks=1,last_visit=NOW()',
        [userId, gridX, gridY]
    );

    return { userId: userId, gridX: gridX, gridY: gridY, newPSS: directImpact, isUnsafe: isUnsafe };
}

async function getAllUsers() {
    var result = await db.query(
        'SELECT u.user_id,u.username,u.created_at,COUNT(DISTINCT k.grid_x) AS cells_known FROM users u LEFT JOIN user_ks k ON u.user_id=k.user_id AND k.ks=1 GROUP BY u.user_id ORDER BY u.username'
    );
    return result[0];
}

module.exports = {
    selectQueryGroup: selectQueryGroup,
    aggregatePSS:     aggregatePSS,
    recordCheckin:    recordCheckin,
    getAllUsers:       getAllUsers,
    getRTreeStats:    getRTreeStats,
    PARAMS:           PARAMS,
};
