/**
 * routeRoutes.js
 *
 * All 4 query types from the paper (Definition 5):
 *
 *   GET /api/route        → SR    (n=1, m=1)  single source, single dest
 *   GET /api/route/fsr    → FSR   (n=1, m>1)  single source, flexible dest
 *   GET /api/route/gsr    → GSR   (n>1, m=1)  group sources, single dest
 *   GET /api/route/gfsr   → GFSR  (n>1, m>1)  group sources, flexible dest
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

const {
    findSafestPath,
    findFlexibleSafestRoute,
    findGroupSafestRoute,
    findGroupFlexibleSafestRoute,
} = require('../utils/pathFinder');

const { selectQueryGroup, aggregatePSS } = require('../services/crowdService');
const { getConfidenceLevel }             = require('../services/safetyService');

// ── Parse helper: comma-separated coords → [{ x, y }, ...] ──────────────────
function parseCells(xStr, yStr) {
    if (!xStr || !yStr) return [];
    const xs = String(xStr).split(',').map(Number);
    const ys = String(yStr).split(',').map(Number);
    if (xs.length !== ys.length) return [];
    return xs.map((x, i) => ({ x, y: ys[i] }));
}

// ── Load grid data (global or crowd-aggregated) ───────────────────────────────
async function loadGridData(userId, start, end, ratio) {
    if (!userId) {
        const [rows] = await db.query('SELECT grid_x, grid_y, safety_score FROM safety_scores');
        return { gridData: rows, crowdStats: null };
    }

    const [globalScores] = await db.query('SELECT grid_x, grid_y, safety_score FROM safety_scores');
    if (!globalScores.length) throw new Error('No safety data. Run /api/safety/compute first.');

    const safetyMap = {};
    globalScores.forEach(c => { safetyMap[`${c.grid_x},${c.grid_y}`] = parseFloat(c.safety_score); });

    // BFS to compute delta
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const shortestDist = (() => {
        const ek = `${end.x},${end.y}`, sk = `${start.x},${start.y}`;
        if (sk === ek) return 0;
        const visited = new Set([sk]);
        let q = [{ x: start.x, y: start.y, dist: 0 }];
        while (q.length) {
            const c = q.shift();
            for (const [dx, dy] of dirs) {
                const nk = `${c.x+dx},${c.y+dy}`;
                if (!(nk in safetyMap) || visited.has(nk)) continue;
                if (nk === ek) return c.dist + 1;
                visited.add(nk);
                q.push({ x: c.x+dx, y: c.y+dy, dist: c.dist + 1 });
            }
        }
        return Infinity;
    })();

    if (shortestDist === Infinity) return { gridData: [], crowdStats: null };

    const delta   = ratio * shortestDist;
    const AqCells = Object.keys(safetyMap)
        .filter(ck => {
            const [cx, cy] = ck.split(',').map(Number);
            return Math.sqrt((cx-start.x)**2+(cy-start.y)**2) +
                   Math.sqrt((cx-end.x)  **2+(cy-end.y)  **2) <= delta;
        })
        .map(ck => { const [x,y] = ck.split(',').map(Number); return { grid_x: x, grid_y: y }; });

    const groupIds = await selectQueryGroup(AqCells);
    const SSq      = await aggregatePSS(groupIds, AqCells);
    const gridData = Object.entries(SSq).map(([k, ss]) => {
        const [x, y] = k.split(',').map(Number);
        return { grid_x: x, grid_y: y, safety_score: ss };
    });

    return { gridData, crowdStats: { groupSize: groupIds.length, cellsCovered: AqCells.length } };
}

// ── Build standard response object ────────────────────────────────────────────
async function buildResponse(path, stats, gridData, ratio, zVal, crowdStats, extra = {}) {
    if (!path || path.length === 0) return null;
    const sm = {};
    gridData.forEach(r => { sm[`${r.grid_x},${r.grid_y}`] = parseFloat(r.safety_score); });
    const minSS = Math.min(...path.map(c => sm[`${c.x},${c.y}`] ?? 0));
    const CL    = await getConfidenceLevel(path, zVal);
    return {
        path,
        totalSteps:      path.length,
        minSafetyScore:  parseFloat(minSS.toFixed(4)),
        confidenceLevel: CL,
        deltaRatioUsed:  ratio,
        algorithm:       stats?.algorithm || 'G_DirA',
        privacyStats: {
            commFreq:    stats?.commFreq    ?? 1,
            pssRevealed: stats?.pssRevealed ?? 0,
        },
        crowdStats,
        ...extra,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// SR — GET /api/route   (n=1, m=1)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        const { startX, startY, endX, endY,
                deltaRatio=1.2, z=50, userId=null, algorithm='G_DirA', Xit=40 } = req.query;

        if (!startX || !startY || !endX || !endY)
            return res.status(400).json({ error: 'Missing: startX, startY, endX, endY' });

        const start = { x: parseInt(startX), y: parseInt(startY) };
        const end   = { x: parseInt(endX),   y: parseInt(endY)   };
        const ratio = parseFloat(deltaRatio);
        const algo  = algorithm === 'G_ItA' ? 'G_ItA' : 'G_DirA';

        const { gridData, crowdStats } = await loadGridData(userId, start, end, ratio);
        if (!gridData?.length) return res.status(503).json({ error: 'No safety data.' });

        const result = findSafestPath(gridData, start, end, ratio, algo, parseInt(Xit));
        const path   = result.path || result;
        const stats  = result.stats || {};

        if (!path?.length)
            return res.status(404).json({ error: `No SR route within δ=${ratio}. Try increasing deltaRatio.` });

        const resp = await buildResponse(path, stats, gridData, ratio, parseFloat(z), crowdStats, {
            queryType: 'SR',
            message:   `SR: route found with ${path.length} steps.`,
        });
        res.json(resp);
    } catch (err) {
        console.error('[SR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// FSR — GET /api/route/fsr   (n=1, m>1)
// Params: startX, startY, destX=x1,x2,x3  destY=y1,y2,y3
// ══════════════════════════════════════════════════════════════════════════════
router.get('/fsr', async (req, res) => {
    try {
        const { startX, startY, deltaRatio=1.2, z=50,
                userId=null, algorithm='G_DirA', Xit=40 } = req.query;

        let destinations = [];
        if (req.query.dests) {
            try { destinations = JSON.parse(req.query.dests); } catch { return res.status(400).json({ error: 'dests must be JSON' }); }
        } else {
            destinations = parseCells(req.query.destX, req.query.destY);
        }

        if (!startX || !startY) return res.status(400).json({ error: 'Missing startX, startY' });
        if (destinations.length < 2) return res.status(400).json({ error: 'FSR needs ≥2 destinations.' });

        const start = { x: parseInt(startX), y: parseInt(startY) };
        const ratio = parseFloat(deltaRatio);
        const algo  = algorithm === 'G_ItA' ? 'G_ItA' : 'G_DirA';

        const { gridData, crowdStats } = await loadGridData(userId, start, destinations[0], ratio);
        if (!gridData?.length) return res.status(503).json({ error: 'No safety data.' });

        const fsr = findFlexibleSafestRoute(gridData, start, destinations, ratio, algo, parseInt(Xit));
        if (!fsr.path?.length)
            return res.status(404).json({ error: `FSR: no route within δ=${ratio}.`, allResults: fsr.allResults });

        const resp = await buildResponse(fsr.path, fsr.stats, gridData, ratio, parseFloat(z), crowdStats, {
            queryType:         'FSR',
            selectedDest:      fsr.destination,
            selectedDestIndex: fsr.destIndex,
            allDestResults:    fsr.allResults,
            message: `FSR: destination ${fsr.destIndex+1} is safest (minSS=${fsr.minSS?.toFixed(3)}).`,
        });
        res.json(resp);
    } catch (err) {
        console.error('[FSR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GSR — GET /api/route/gsr   (n>1, m=1)
// Multiple group members → single fixed destination
// Params: srcX=x1,x2,x3  srcY=y1,y2,y3  endX  endY
// Returns: one route per member, routeSetMinSS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/gsr', async (req, res) => {
    try {
        const { endX, endY, deltaRatio=1.2, z=50,
                userId=null, algorithm='G_DirA', Xit=40 } = req.query;

        const sources = parseCells(req.query.srcX, req.query.srcY);

        if (!endX || !endY)     return res.status(400).json({ error: 'Missing: endX, endY' });
        if (sources.length < 2) return res.status(400).json({ error: 'GSR needs ≥2 sources (srcX=x1,x2 srcY=y1,y2).' });

        const destination = { x: parseInt(endX), y: parseInt(endY) };
        const ratio       = parseFloat(deltaRatio);
        const algo        = algorithm === 'G_ItA' ? 'G_ItA' : 'G_DirA';

        // Load grid using first source for Aq approximation
        const { gridData, crowdStats } = await loadGridData(userId, sources[0], destination, ratio);
        if (!gridData?.length) return res.status(503).json({ error: 'No safety data.' });

        const gsr = findGroupSafestRoute(gridData, sources, destination, ratio, algo, parseInt(Xit));

        if (gsr.routes.every(r => r.length === 0))
            return res.status(404).json({ error: `GSR: no routes within δ=${ratio} for any member.` });

        // Build per-member responses
        const memberResponses = await Promise.all(
            gsr.routes.map(async (path, i) => {
                if (!path || path.length === 0)
                    return { memberIndex: i, source: sources[i], reachable: false, path: [] };
                const sm = {};
                gridData.forEach(r => { sm[`${r.grid_x},${r.grid_y}`] = parseFloat(r.safety_score); });
                const minSS = Math.min(...path.map(c => sm[`${c.x},${c.y}`] ?? 0));
                const CL    = await getConfidenceLevel(path, parseFloat(z));
                return {
                    memberIndex:     i,
                    source:          sources[i],
                    reachable:       true,
                    path,
                    totalSteps:      path.length,
                    minSafetyScore:  parseFloat(minSS.toFixed(4)),
                    confidenceLevel: CL,
                };
            })
        );

        res.json({
            queryType:      'GSR',
            destination,
            algorithm:      algo,
            deltaRatioUsed: ratio,
            routeSetMinSS:  parseFloat(gsr.routeSetMinSS.toFixed(4)),
            memberRoutes:   memberResponses,
            memberResults:  gsr.memberResults,
            crowdStats,
            message: `GSR: ${sources.length} members → dest(${destination.x},${destination.y}). routeSetMinSS=${gsr.routeSetMinSS.toFixed(3)}.`,
        });
    } catch (err) {
        console.error('[GSR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GFSR — GET /api/route/gfsr   (n>1, m>1)
// Multiple group members → multiple candidate destinations
// Picks destination where worst member's route is still the safest
// Params: srcX, srcY, destX, destY (all comma-separated)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/gfsr', async (req, res) => {
    try {
        const { deltaRatio=1.2, z=50,
                userId=null, algorithm='G_DirA', Xit=40 } = req.query;

        const sources      = parseCells(req.query.srcX,  req.query.srcY);
        const destinations = parseCells(req.query.destX, req.query.destY);

        if (sources.length < 2)      return res.status(400).json({ error: 'GFSR needs ≥2 sources.' });
        if (destinations.length < 2) return res.status(400).json({ error: 'GFSR needs ≥2 destinations.' });

        const ratio = parseFloat(deltaRatio);
        const algo  = algorithm === 'G_ItA' ? 'G_ItA' : 'G_DirA';

        const { gridData, crowdStats } = await loadGridData(userId, sources[0], destinations[0], ratio);
        if (!gridData?.length) return res.status(503).json({ error: 'No safety data.' });

        const gfsr = findGroupFlexibleSafestRoute(gridData, sources, destinations, ratio, algo, parseInt(Xit));

        if (!gfsr.destination)
            return res.status(404).json({
                error: `GFSR: no valid destination within δ=${ratio}.`,
                allDestResults: gfsr.allDestResults,
            });

        // Build per-member responses for the winning destination
        const memberResponses = await Promise.all(
            (gfsr.routes || []).map(async (path, i) => {
                if (!path || path.length === 0)
                    return { memberIndex: i, source: sources[i], reachable: false, path: [] };
                const sm = {};
                gridData.forEach(r => { sm[`${r.grid_x},${r.grid_y}`] = parseFloat(r.safety_score); });
                const minSS = Math.min(...path.map(c => sm[`${c.x},${c.y}`] ?? 0));
                const CL    = await getConfidenceLevel(path, parseFloat(z));
                return {
                    memberIndex:     i,
                    source:          sources[i],
                    reachable:       true,
                    path,
                    totalSteps:      path.length,
                    minSafetyScore:  parseFloat(minSS.toFixed(4)),
                    confidenceLevel: CL,
                };
            })
        );

        res.json({
            queryType:       'GFSR',
            selectedDest:    gfsr.destination,
            selectedDestIndex: gfsr.destIndex,
            algorithm:       algo,
            deltaRatioUsed:  ratio,
            routeSetMinSS:   parseFloat(gfsr.routeSetMinSS.toFixed(4)),
            memberRoutes:    memberResponses,
            memberResults:   gfsr.memberResults,
            allDestResults:  gfsr.allDestResults,
            crowdStats,
            message: `GFSR: safest meeting point is destination ${gfsr.destIndex+1} (${gfsr.destination.x},${gfsr.destination.y}). routeSetMinSS=${gfsr.routeSetMinSS.toFixed(3)}.`,
        });
    } catch (err) {
        console.error('[GFSR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
