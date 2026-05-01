// RTree.js
// Modified R-Tree for pSS storage — Paper Section 6.1
// Islam et al. IEEE TKDE 2023
//
// Purpose: store per-user pSS values efficiently using supercell merging.
// Adjacent grid cells with the same pSS are grouped into MBRs (supercells).
// Paper result: saves avg 52% storage vs flat grid storage.
//
// Paper complexity:
//   Build:  O(xc * yc)
//   Search: O(N) worst case
//   Update: O(N + xc*yc + Nsc*log N)
//
// Used by: crowdService.js aggregatePSS()
// Replaces: raw array scan over user_pss rows

// MBR node: represents a supercell (group of adjacent cells with same pSS)
class MBRNode {
    constructor(x1, y1, x2, y2, pss, lastUpdated) {
        this.x1          = x1;           // min grid_x
        this.y1          = y1;           // min grid_y
        this.x2          = x2;           // max grid_x
        this.y2          = y2;           // max grid_y
        this.pss         = pss;          // safety score for all cells in this MBR
        this.lastUpdated = lastUpdated;  // avg last_updated timestamp
    }

    contains(x, y) {
        return x >= this.x1 && x <= this.x2 && y >= this.y1 && y <= this.y2;
    }

    size() {
        return (this.x2 - this.x1 + 1) * (this.y2 - this.y1 + 1);
    }
}

class RTree {
    constructor(userId) {
        this.userId      = userId;
        this.nodes       = [];           // array of MBRNode (supercells)
        this.rawCount    = 0;            // original cell count before merging
        this.buildTimeMs = 0;
    }

    // Build R-tree from flat cell array
    // cells: [{ grid_x, grid_y, pss, last_updated }, ...]
    // Paper Section 6.1: scan row-wise AND column-wise, pick scan with fewer supercells
    build(cells) {
        if (!cells || cells.length === 0) return;
        this.rawCount = cells.length;
        const t0 = Date.now();

        // Build a 2D map for fast lookup
        const cellMap = {};
        cells.forEach(c => {
            cellMap[c.grid_x + ',' + c.grid_y] = {
                pss:         parseFloat(c.pss),
                lastUpdated: c.last_updated || new Date(),
            };
        });

        // Get bounding box
        const xs = cells.map(c => c.grid_x);
        const ys = cells.map(c => c.grid_y);
        const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);

        // Row-wise scan: merge horizontally first, then vertically
        const rowSupercells = this._scanRowWise(cellMap, minX, maxX, minY, maxY);

        // Column-wise scan: merge vertically first, then horizontally
        const colSupercells = this._scanColWise(cellMap, minX, maxX, minY, maxY);

        // Paper: pick scan that produces fewer supercells (better compression)
        this.nodes = rowSupercells.length <= colSupercells.length
            ? rowSupercells
            : colSupercells;

        this.buildTimeMs = Date.now() - t0;
    }

    // Row-wise scan: for each row, merge adjacent cells with same pSS
    // Then try to merge resulting horizontal strips vertically
    _scanRowWise(cellMap, minX, maxX, minY, maxY) {
        const strips = [];

        for (var x = minX; x <= maxX; x++) {
            var startY = null, currentPSS = null, lastUpd = null;

            for (var y = minY; y <= maxY + 1; y++) {
                const key = x + ',' + y;
                const cell = cellMap[key];
                const pss  = cell ? cell.pss : null;

                if (pss !== null && startY === null) {
                    // Start new strip
                    startY = y; currentPSS = pss; lastUpd = cell.lastUpdated;
                } else if (pss !== null && this._samePSS(pss, currentPSS)) {
                    // Extend strip
                } else if (startY !== null) {
                    // End strip
                    strips.push(new MBRNode(x, startY, x, y - 1, currentPSS, lastUpd));
                    startY = pss !== null ? y      : null;
                    currentPSS = pss !== null ? pss : null;
                    lastUpd = pss !== null ? cell.lastUpdated : null;
                }
            }
        }

        // Merge adjacent identical horizontal strips into 2D supercells
        return this._mergeStrips(strips, true);
    }

    // Column-wise scan: for each column, merge adjacent cells with same pSS
    _scanColWise(cellMap, minX, maxX, minY, maxY) {
        const strips = [];

        for (var y = minY; y <= maxY; y++) {
            var startX = null, currentPSS = null, lastUpd = null;

            for (var x = minX; x <= maxX + 1; x++) {
                const key = x + ',' + y;
                const cell = cellMap[key];
                const pss  = cell ? cell.pss : null;

                if (pss !== null && startX === null) {
                    startX = x; currentPSS = pss; lastUpd = cell.lastUpdated;
                } else if (pss !== null && this._samePSS(pss, currentPSS)) {
                    // extend
                } else if (startX !== null) {
                    strips.push(new MBRNode(startX, y, x - 1, y, currentPSS, lastUpd));
                    startX = pss !== null ? x   : null;
                    currentPSS = pss !== null ? pss : null;
                    lastUpd = pss !== null ? cell.lastUpdated : null;
                }
            }
        }

        return this._mergeStrips(strips, false);
    }

    // Merge adjacent strips with same pSS into 2D MBRs
    _mergeStrips(strips, horizontal) {
        if (strips.length === 0) return [];
        const merged = [];
        const used   = new Array(strips.length).fill(false);

        for (var i = 0; i < strips.length; i++) {
            if (used[i]) continue;
            var current = strips[i];
            used[i] = true;

            // Try to extend current strip by merging with adjacent strips
            var extended = true;
            while (extended) {
                extended = false;
                for (var j = i + 1; j < strips.length; j++) {
                    if (used[j]) continue;
                    const s = strips[j];
                    if (this._canMerge(current, s, horizontal)) {
                        current = this._merge(current, s);
                        used[j] = true;
                        extended = true;
                    }
                }
            }
            merged.push(current);
        }
        return merged;
    }

    // Two strips can merge if they are adjacent and have same pSS
    _canMerge(a, b, horizontal) {
        if (!this._samePSS(a.pss, b.pss)) return false;
        if (horizontal) {
            // Adjacent rows with same y range
            return (a.x2 + 1 === b.x1 || b.x2 + 1 === a.x1) &&
                   a.y1 === b.y1 && a.y2 === b.y2;
        } else {
            // Adjacent columns with same x range
            return (a.y2 + 1 === b.y1 || b.y2 + 1 === a.y1) &&
                   a.x1 === b.x1 && a.x2 === b.x2;
        }
    }

    _merge(a, b) {
        return new MBRNode(
            Math.min(a.x1, b.x1), Math.min(a.y1, b.y1),
            Math.max(a.x2, b.x2), Math.max(a.y2, b.y2),
            a.pss,
            a.lastUpdated
        );
    }

    // Two pSS values are "same" if within tolerance (paper uses integer pSS)
    _samePSS(a, b) {
        return Math.abs(a - b) < 0.0001;
    }

    // Search: find pSS for grid cell (x, y)
    // Returns pSS or null if not found
    // Paper: O(N) worst case
    search(x, y) {
        for (var i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i].contains(x, y)) {
                return this.nodes[i].pss;
            }
        }
        return null;
    }

    // Update pSS for a cell — split affected supercell and reinsert
    // Paper Section 6.1: compute working MBR, remove overlapping supercells, recompute
    update(x, y, newPSS) {
        // Find which node contains this cell
        var affectedIdx = -1;
        for (var i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i].contains(x, y)) {
                affectedIdx = i; break;
            }
        }

        if (affectedIdx === -1) {
            // New cell — add as single-cell MBR
            this.nodes.push(new MBRNode(x, y, x, y, newPSS, new Date()));
            return;
        }

        const old = this.nodes[affectedIdx];
        this.nodes.splice(affectedIdx, 1);

        // If old supercell was single cell, just update
        if (old.x1 === old.x2 && old.y1 === old.y2) {
            this.nodes.push(new MBRNode(x, y, x, y, newPSS, new Date()));
            return;
        }

        // Split: create new single-cell node for updated cell
        // Keep remaining cells with old pSS as new smaller supercells
        this.nodes.push(new MBRNode(x, y, x, y, newPSS, new Date()));

        // Re-add surrounding cells as individual nodes (simplified split)
        // Full paper implementation would recompute supercells in working MBR
        for (var cx = old.x1; cx <= old.x2; cx++) {
            for (var cy = old.y1; cy <= old.y2; cy++) {
                if (cx === x && cy === y) continue;
                this.nodes.push(new MBRNode(cx, cy, cx, cy, old.pss, old.lastUpdated));
            }
        }

        // Re-merge where possible after split
        this._remerge();
    }

    // Re-merge nodes after update (simplified compaction)
    _remerge() {
        const rebuilt = this._mergeStrips(this.nodes, true);
        const rebuilt2 = this._mergeStrips(this.nodes, false);
        this.nodes = rebuilt.length <= rebuilt2.length ? rebuilt : rebuilt2;
    }

    // Get all cells as flat array (for aggregation)
    // Returns [{ x, y, pss }, ...]
    getAllCells() {
        const cells = [];
        for (var i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i];
            for (var x = n.x1; x <= n.x2; x++) {
                for (var y = n.y1; y <= n.y2; y++) {
                    cells.push({ x: x, y: y, pss: n.pss });
                }
            }
        }
        return cells;
    }

    // Statistics — for /api/rtree/stats endpoint
    getStats() {
        return {
            userId:          this.userId,
            rawCells:        this.rawCount,
            supercells:      this.nodes.length,
            compressionPct:  this.rawCount > 0
                ? parseFloat((100 * (1 - this.nodes.length / this.rawCount)).toFixed(1))
                : 0,
            buildTimeMs:     this.buildTimeMs,
            avgSupercellSize: this.nodes.length > 0
                ? parseFloat((this.rawCount / this.nodes.length).toFixed(2))
                : 0,
        };
    }
}

module.exports = { RTree, MBRNode };
