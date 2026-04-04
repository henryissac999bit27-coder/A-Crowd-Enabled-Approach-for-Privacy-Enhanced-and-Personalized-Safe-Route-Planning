/**
 * pathFinder.js
 *
 * Implements BOTH algorithms from:
 * "A Crowd-Enabled Approach for Privacy-Enhanced and Personalized
 *  Safe Route Planning" — Islam, Hashem, Shahriyar (IEEE TKDE 2023)
 *
 * Algorithm 1 — G_DirA: collects ALL pSSs at once (comm. freq = 1)
 * Algorithm 2 — G_ItA:  collects pSSs LAZILY per visited cell (43% fewer exposed)
 */

const key = (x, y) => `${x},${y}`;

function euclideanDist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getNeighbors(node) {
    return [
        { x: node.x + 1, y: node.y },
        { x: node.x - 1, y: node.y },
        { x: node.x,     y: node.y + 1 },
        { x: node.x,     y: node.y - 1 },
    ];
}

function isBetterRoute(a, b) {
    if (a.minSS !== b.minSS)             return a.minSS > b.minSS;
    if (a.distAtMinSS !== b.distAtMinSS) return a.distAtMinSS < b.distAtMinSS;
    return a.totalDist < b.totalDist;
}

function canPossiblyBeat(current, best) {
    if (current.minSS > best.minSS) return true;
    if (current.minSS < best.minSS) return false;
    return true;
}

function bfsShortestDistance(safetyMap, start, end) {
    const endKey = key(end.x, end.y), startKey = key(start.x, start.y);
    if (startKey === endKey) return 0;
    const visited = new Set([startKey]);
    let queue = [{ x: start.x, y: start.y, dist: 0 }];
    while (queue.length > 0) {
        const c = queue.shift();
        for (const n of getNeighbors(c)) {
            const nk = key(n.x, n.y);
            if (!(nk in safetyMap) || visited.has(nk)) continue;
            const d = c.dist + 1;
            if (nk === endKey) return d;
            visited.add(nk);
            queue.push({ x: n.x, y: n.y, dist: d });
        }
    }
    return Infinity;
}

function bfsReachable(start, end, delta, subgraph) {
    const endKey = key(end.x, end.y), startKey = key(start.x, start.y);
    if (!(startKey in subgraph) || !(endKey in subgraph)) return false;
    if (startKey === endKey) return true;
    const visited = new Set([startKey]);
    let queue = [{ x: start.x, y: start.y, dist: 0 }];
    while (queue.length > 0) {
        const c = queue.shift();
        if (c.dist >= delta) continue;
        for (const n of getNeighbors(c)) {
            const nk = key(n.x, n.y);
            if (!(nk in subgraph) || visited.has(nk)) continue;
            if (nk === endKey) return true;
            visited.add(nk);
            queue.push({ x: n.x, y: n.y, dist: c.dist + 1 });
        }
    }
    return false;
}

function reconstructPath(prevMap, startKey, endKey) {
    const path = [];
    let curr = endKey;
    while (curr && curr !== startKey) {
        const [x, y] = curr.split(',').map(Number);
        path.push({ x, y });
        const e = prevMap[curr];
        if (!e) break;
        curr = e.parentKey;
    }
    const [sx, sy] = startKey.split(',').map(Number);
    path.push({ x: sx, y: sy });
    return path.reverse();
}

// ── Step 1: Ellipse query area ────────────────────────────────────────────────
function computeQueryArea(start, end, delta, safetyMap) {
    const Aq = {};
    for (const ck of Object.keys(safetyMap)) {
        const [cx, cy] = ck.split(',').map(Number);
        if (euclideanDist({ x: cx, y: cy }, start) + euclideanDist({ x: cx, y: cy }, end) <= delta) {
            Aq[ck] = safetyMap[ck];
        }
    }
    return Aq;
}

// ── Step 4: Binary search refinement ─────────────────────────────────────────
function refineQueryArea(start, end, delta, SSq) {
    const ssVals = [...new Set(Object.values(SSq))].sort((a, b) => a - b);
    if (!ssVals.length) return SSq;
    let lo = 0, hi = ssVals.length - 1, bestN = SSq;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const refined = {};
        for (const [k, ss] of Object.entries(SSq)) {
            if (ss > ssVals[mid]) refined[k] = ss;
        }
        if (bfsReachable(start, end, delta, refined)) { bestN = refined; lo = mid + 1; }
        else hi = mid - 1;
    }
    const sk = key(start.x, start.y), ek = key(end.x, end.y);
    if (!(sk in bestN)) bestN[sk] = SSq[sk] ?? 0;
    if (!(ek in bestN)) bestN[ek] = SSq[ek] ?? 0;
    return bestN;
}

// ── Step 5: Minimax priority queue search ────────────────────────────────────
function computeSafestRoute(start, end, delta, N2) {
    const sk = key(start.x, start.y), ek = key(end.x, end.y);
    if (!(sk in N2) || !(ek in N2)) return [];
    const startSS = N2[sk] ?? 0;
    const bestAt  = { [sk]: { minSS: startSS, distAtMinSS: 1, totalDist: 0 } };
    const prevMap = {};
    let queue = [{ x: start.x, y: start.y, totalDist: 0, minSS: startSS, distAtMinSS: 1, prev: null }];
    let bestAnswer = null;

    while (queue.length > 0) {
        queue.sort((a, b) => b.minSS !== a.minSS ? b.minSS - a.minSS : a.distAtMinSS !== b.distAtMinSS ? a.distAtMinSS - b.distAtMinSS : a.totalDist - b.totalDist);
        const cur = queue.shift();
        const ck  = key(cur.x, cur.y);

        if (cur.x === end.x && cur.y === end.y) {
            if (!bestAnswer || isBetterRoute(cur, bestAnswer)) bestAnswer = { ...cur, endKey: ck };
            continue;
        }
        if (cur.totalDist + euclideanDist(cur, end) > delta) continue;
        if (bestAnswer && !canPossiblyBeat(cur, bestAnswer)) continue;

        for (const nb of getNeighbors(cur)) {
            const nk = key(nb.x, nb.y);
            if (!(nk in N2)) continue;
            const nSS = N2[nk], nDist = cur.totalDist + 1;
            if (nDist > delta) continue;
            let newMin, newDist;
            if      (nSS < cur.minSS)  { newMin = nSS;       newDist = 1; }
            else if (nSS === cur.minSS) { newMin = cur.minSS; newDist = cur.distAtMinSS + 1; }
            else                        { newMin = cur.minSS; newDist = cur.distAtMinSS; }
            const cand = { x: nb.x, y: nb.y, totalDist: nDist, minSS: newMin, distAtMinSS: newDist, prev: ck };
            const ex = bestAt[nk];
            if (ex && !isBetterRoute(cand, ex)) continue;
            bestAt[nk] = { minSS: newMin, distAtMinSS: newDist, totalDist: nDist };
            prevMap[nk] = { parentKey: ck };
            queue.push(cand);
        }
    }
    if (!bestAnswer) return [];
    return reconstructPath(prevMap, sk, bestAnswer.endKey);
}

// ══════════════════════════════════════════════════════════════════════════════
// ALGORITHM 1 — G_DirA
// ══════════════════════════════════════════════════════════════════════════════
function findSafestPath_GDirA(gridData, start, end, deltaRatio = 1.2) {
    const stats = { algorithm: 'G_DirA', commFreq: 1, pssRevealed: 0, steps: [] };
    const safetyMap = {};
    gridData.forEach(c => { safetyMap[key(c.grid_x, c.grid_y)] = parseFloat(c.safety_score); });

    const shortestDist = bfsShortestDistance(safetyMap, start, end);
    if (shortestDist === Infinity) return { path: [], stats };
    const delta = deltaRatio * shortestDist;

    const Aq  = computeQueryArea(start, end, delta, safetyMap);
    stats.pssRevealed = Object.keys(Aq).length; // all Aq cells revealed at once
    stats.steps.push(`Step1: Aq=${Object.keys(Aq).length} cells | Step4: binary search | Step5: minimax`);

    const N2   = refineQueryArea(start, end, delta, Aq);
    const path = computeSafestRoute(start, end, delta, N2);
    stats.steps.push(`Route: ${path.length} steps, delta=${delta.toFixed(2)}`);
    return { path, stats };
}

// ══════════════════════════════════════════════════════════════════════════════
// ALGORITHM 2 — G_ItA
// Paper Section 7.1.2 — lazy pSS collection
// ══════════════════════════════════════════════════════════════════════════════
function findSafestPath_GItA(gridData, start, end, deltaRatio = 1.2, Xit = 40) {
    const stats = { algorithm: 'G_ItA', commFreq: 0, pssRevealed: 0, Xit, steps: [] };
    const fullMap = {};
    gridData.forEach(c => { fullMap[key(c.grid_x, c.grid_y)] = parseFloat(c.safety_score); });

    const shortestDist = bfsShortestDistance(fullMap, start, end);
    if (shortestDist === Infinity) return { path: [], stats };
    const delta = deltaRatio * shortestDist;

    // Step 1: same ellipse as G_DirA
    const Aq = computeQueryArea(start, end, delta, fullMap);
    stats.steps.push(`Step1: Aq=${Object.keys(Aq).length} cells`);

    // SSq starts EMPTY — fetched lazily as search expands
    const SSq = {};

    // Lazy fetch: simulates collecting pSS from group members
    // Only cells the search actually visits get their pSS revealed
    function fetchCells(cellKeys) {
        const fresh = cellKeys.filter(k => !(k in SSq) && k in Aq);
        if (!fresh.length) return;
        fresh.forEach(k => { SSq[k] = Aq[k]; });
        stats.commFreq++;
        stats.pssRevealed += fresh.length;
    }

    const sk = key(start.x, start.y), ek = key(end.x, end.y);
    fetchCells([sk]); // fetch start cell

    const startSS = SSq[sk] ?? 0;
    const bestAt  = { [sk]: { minSS: startSS, distAtMinSS: 1, totalDist: 0 } };
    const prevMap = {};
    let queue = [{ x: start.x, y: start.y, totalDist: 0, minSS: startSS, distAtMinSS: 1, prev: null }];
    let bestAnswer = null;

    while (queue.length > 0) {
        queue.sort((a, b) => b.minSS !== a.minSS ? b.minSS - a.minSS : a.distAtMinSS !== b.distAtMinSS ? a.distAtMinSS - b.distAtMinSS : a.totalDist - b.totalDist);

        const cur = queue.shift();
        const ck  = key(cur.x, cur.y);

        if (cur.x === end.x && cur.y === end.y) {
            if (!bestAnswer || isBetterRoute(cur, bestAnswer)) bestAnswer = { ...cur, endKey: ck };
            continue;
        }
        if (cur.totalDist + euclideanDist(cur, end) > delta) continue;
        if (bestAnswer && !canPossiblyBeat(cur, bestAnswer)) continue;

        // G_ItA: collect cells Xit steps ahead before expanding (Algorithm 2 Lines 11-12)
        const toFetch = new Set();
        const collect = (node, depth) => {
            if (depth === 0) return;
            for (const n of getNeighbors(node)) {
                const nk = key(n.x, n.y);
                if (nk in Aq && !(nk in SSq)) toFetch.add(nk);
                if (depth > 1) collect(n, depth - 1);
            }
        };
        collect(cur, Math.min(Xit, 4)); // cap at 4 for performance
        if (toFetch.size > 0) fetchCells([...toFetch]);

        for (const nb of getNeighbors(cur)) {
            const nk = key(nb.x, nb.y);
            if (!(nk in SSq) || !(nk in Aq)) continue; // G_ItA: only known cells
            const nSS = SSq[nk], nDist = cur.totalDist + 1;
            if (nDist > delta) continue;
            let newMin, newDist;
            if      (nSS < cur.minSS)  { newMin = nSS;      newDist = 1; }
            else if (nSS === cur.minSS) { newMin = cur.minSS; newDist = cur.distAtMinSS + 1; }
            else                        { newMin = cur.minSS; newDist = cur.distAtMinSS; }
            const cand = { x: nb.x, y: nb.y, totalDist: nDist, minSS: newMin, distAtMinSS: newDist, prev: ck };
            const ex = bestAt[nk];
            if (ex && !isBetterRoute(cand, ex)) continue;
            bestAt[nk] = { minSS: newMin, distAtMinSS: newDist, totalDist: nDist };
            prevMap[nk] = { parentKey: ck };
            queue.push(cand);
        }
    }

    stats.steps.push(`G_ItA done: commFreq=${stats.commFreq}, pssRevealed=${stats.pssRevealed}`);
    if (!bestAnswer) return { path: [], stats };
    return { path: reconstructPath(prevMap, sk, bestAnswer.endKey), stats };
}

// ── Unified export ────────────────────────────────────────────────────────────
function findSafestPath(gridData, start, end, deltaRatio = 1.2, algorithm = 'G_DirA', Xit = 40) {
    if (algorithm === 'G_ItA') return findSafestPath_GItA(gridData, start, end, deltaRatio, Xit);
    return findSafestPath_GDirA(gridData, start, end, deltaRatio);
}

// ══════════════════════════════════════════════════════════════════════════════
// FSR — Flexible Safest Route query  (paper Section 2, Definition 5)
//
// Single source, MULTIPLE possible destinations.
// Runs SR query for each destination independently, then returns
// the destination + route whose minimum SS is the highest (safest).
//
// Tie-breaking (paper Section 2 SS-based route-set ranking):
//   1. Pick destination whose route has highest minSS
//   2. Tie → pick route with shorter distAtMinSS
//   3. Tie → pick route with shorter totalDist
//
// @param {Array}    gridData     - safety scores from DB
// @param {object}   start        - { x, y } source cell
// @param {object[]} destinations - [{ x, y }, ...] candidate destinations
// @param {number}   deltaRatio   - distance constraint (paper default 1.2)
// @param {string}   algorithm    - 'G_DirA' | 'G_ItA'
// @returns {{ path, destination, destIndex, stats }}
// ══════════════════════════════════════════════════════════════════════════════
function findFlexibleSafestRoute(gridData, start, destinations, deltaRatio = 1.2, algorithm = 'G_DirA', Xit = 40) {

    if (!destinations || destinations.length === 0) {
        return { path: [], destination: null, destIndex: -1, stats: null };
    }

    // SR query for each destination
    const results = destinations.map((dest, idx) => {
        const result = findSafestPath(gridData, start, dest, deltaRatio, algorithm, Xit);
        const path   = result.path || result;
        const stats  = result.stats || {};

        if (!path || path.length === 0) {
            return { path: [], destination: dest, destIndex: idx, minSS: -Infinity, distAtMinSS: Infinity, totalDist: Infinity, stats };
        }

        // Build safety map for metric calculation
        const safetyMap = {};
        gridData.forEach(c => { safetyMap[`${c.grid_x},${c.grid_y}`] = parseFloat(c.safety_score); });
        const scores     = path.map(c => safetyMap[`${c.x},${c.y}`] ?? 0);
        const minSS      = Math.min(...scores);
        const distAtMinSS = scores.filter(s => s === minSS).length;

        return { path, destination: dest, destIndex: idx, minSS, distAtMinSS, totalDist: path.length, stats };
    });

    // Filter out destinations with no valid route
    const valid = results.filter(r => r.path.length > 0);
    if (valid.length === 0) {
        return { path: [], destination: null, destIndex: -1, stats: null };
    }

    // Pick best by paper's 3-rule ranking (SS-based route-set ranking)
    const best = valid.reduce((a, b) => {
        if (a.minSS !== b.minSS)             return a.minSS > b.minSS ? a : b;
        if (a.distAtMinSS !== b.distAtMinSS) return a.distAtMinSS < b.distAtMinSS ? a : b;
        return a.totalDist < b.totalDist ? a : b;
    });

    console.log(`[FSR] Best destination: index=${best.destIndex} (${best.destination.x},${best.destination.y}) minSS=${best.minSS.toFixed(3)} steps=${best.totalDist}`);

    return {
        path:        best.path,
        destination: best.destination,
        destIndex:   best.destIndex,
        minSS:       best.minSS,
        allResults:  results.map(r => ({
            destIndex:  r.destIndex,
            destination: r.destination,
            minSS:      r.minSS,
            totalDist:  r.totalDist,
            reachable:  r.path.length > 0,
        })),
        stats: best.stats,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// GSR — Group Safest Route query  (paper Section 2, Definition 5)
//
// MULTIPLE sources → single fixed destination.
// Each group member gets their own individual safest route to the destination.
// Paper: n > 1, m = 1
//
// Route-set SS = minimum SS among all individual routes.
// The group's route-set is safe only if every member's route is safe.
//
// @param {Array}    gridData    - safety scores from DB
// @param {object[]} sources     - [{ x, y }, ...] one per group member
// @param {object}   destination - { x, y } fixed meeting point
// @param {number}   deltaRatio  - distance constraint
// @param {string}   algorithm   - 'G_DirA' | 'G_ItA'
// @returns {{ routes, routeSetMinSS, memberResults }}
// ══════════════════════════════════════════════════════════════════════════════
function findGroupSafestRoute(gridData, sources, destination, deltaRatio = 1.2, algorithm = 'G_DirA', Xit = 40) {
    if (!sources || sources.length === 0) return { routes: [], routeSetMinSS: -Infinity };

    const safetyMap = {};
    gridData.forEach(c => { safetyMap[`${c.grid_x},${c.grid_y}`] = parseFloat(c.safety_score); });

    // Run SR for each source independently
    const memberResults = sources.map((source, idx) => {
        const result = findSafestPath(gridData, source, destination, deltaRatio, algorithm, Xit);
        const path   = result.path || result;
        const stats  = result.stats || {};

        if (!path || path.length === 0) {
            return { memberIndex: idx, source, path: [], minSS: -Infinity, distAtMinSS: Infinity, totalDist: Infinity, reachable: false, stats };
        }

        const scores      = path.map(c => safetyMap[`${c.x},${c.y}`] ?? 0);
        const minSS       = Math.min(...scores);
        const distAtMinSS = scores.filter(s => s === minSS).length;

        return { memberIndex: idx, source, path, minSS, distAtMinSS, totalDist: path.length, reachable: true, stats };
    });

    // Route-set SS = minimum of all members' route SS (paper SS-based route-set ranking)
    const reachable     = memberResults.filter(r => r.reachable);
    const routeSetMinSS = reachable.length > 0
        ? Math.min(...reachable.map(r => r.minSS))
        : -Infinity;

    console.log(`[GSR] ${sources.length} members → dest(${destination.x},${destination.y}) | routeSetMinSS=${routeSetMinSS.toFixed(3)} | reachable=${reachable.length}/${sources.length}`);

    return {
        routes:       memberResults.map(r => r.path),
        routeSetMinSS,
        memberResults: memberResults.map(r => ({
            memberIndex: r.memberIndex,
            source:      r.source,
            minSS:       r.minSS,
            totalDist:   r.totalDist,
            reachable:   r.reachable,
        })),
        destination,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// GFSR — Group Flexible Safest Route query  (paper Section 2, Definition 5)
//
// MULTIPLE sources → MULTIPLE possible destinations.
// Combines GSR + FSR logic:
//   For each candidate destination, run GSR (get all members' routes).
//   The destination's safety = the WORST member's route SS (route-set SS).
//   Pick the destination with the highest route-set SS.
//
// Paper: n > 1, m > 1
// "H is safer than H′ if the least safe route in H is safer than in H′"
//
// @param {Array}    gridData     - safety scores from DB
// @param {object[]} sources      - [{ x, y }, ...] group member locations
// @param {object[]} destinations - [{ x, y }, ...] candidate meeting points
// @param {number}   deltaRatio
// @param {string}   algorithm
// @returns {{ routes, destination, destIndex, routeSetMinSS, allDestResults }}
// ══════════════════════════════════════════════════════════════════════════════
function findGroupFlexibleSafestRoute(gridData, sources, destinations, deltaRatio = 1.2, algorithm = 'G_DirA', Xit = 40) {
    if (!sources || sources.length === 0 || !destinations || destinations.length === 0) {
        return { routes: [], destination: null, destIndex: -1, routeSetMinSS: -Infinity };
    }

    // Run GSR for each candidate destination
    const destResults = destinations.map((dest, dIdx) => {
        const gsrResult = findGroupSafestRoute(gridData, sources, dest, deltaRatio, algorithm, Xit);
        return {
            destIndex:     dIdx,
            destination:   dest,
            routes:        gsrResult.routes,
            routeSetMinSS: gsrResult.routeSetMinSS,  // worst member's minSS
            memberResults: gsrResult.memberResults,
            reachable:     gsrResult.memberResults.every(r => r.reachable),
        };
    });

    // Filter destinations where ALL members can reach
    const fullyReachable = destResults.filter(d => d.reachable);
    const candidates     = fullyReachable.length > 0 ? fullyReachable : destResults.filter(d => d.routeSetMinSS > -Infinity);

    if (candidates.length === 0) {
        return { routes: [], destination: null, destIndex: -1, routeSetMinSS: -Infinity, allDestResults: destResults };
    }

    // Pick destination with highest route-set SS (paper SS-based route-set ranking)
    const best = candidates.reduce((a, b) => a.routeSetMinSS >= b.routeSetMinSS ? a : b);

    console.log(`[GFSR] ${sources.length} members, ${destinations.length} dests → best dest index=${best.destIndex} routeSetMinSS=${best.routeSetMinSS.toFixed(3)}`);

    return {
        routes:        best.routes,
        destination:   best.destination,
        destIndex:     best.destIndex,
        routeSetMinSS: best.routeSetMinSS,
        memberResults: best.memberResults,
        allDestResults: destResults.map(d => ({
            destIndex:     d.destIndex,
            destination:   d.destination,
            routeSetMinSS: d.routeSetMinSS,
            reachable:     d.reachable,
        })),
    };
}

module.exports = {
    findSafestPath,
    findSafestPath_GDirA,
    findSafestPath_GItA,
    findFlexibleSafestRoute,
    findGroupSafestRoute,
    findGroupFlexibleSafestRoute,
    bfsShortestDistance,
    computeQueryArea,
    refineQueryArea,
};
