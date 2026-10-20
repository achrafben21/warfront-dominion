/* WARFRONT: DOMINION — terrain, handcrafted map generation, pathfinding and line of sight */
(function (WF) {
  'use strict';
  const U = WF.U, TILE = U.TILE;

  const T = { GRASS: 0, DIRT: 1, FOREST: 2, ROCK: 3, WATER: 4, SAND: 5, BRIDGE: 6, ROAD: 7, SHALLOW: 8 };
  const PASS = {
    ground: [1, 1, 1, 0, 0, 1, 1, 1, 0],
    naval:  [0, 0, 0, 0, 1, 0, 1, 0, 1],
    hover:  [1, 1, 1, 0, 1, 1, 1, 1, 1],
    air:    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  };
  // movement cost multipliers (inverse speed) by move class
  const COST = {
    ground: [1, 0.95, 1.6, 99, 99, 1.15, 0.9, 0.85, 99],
    naval:  [99, 99, 99, 99, 1, 99, 1, 99, 1.1],
    hover:  [1, 0.95, 1.5, 99, 0.9, 1.1, 0.9, 0.85, 0.9],
    air:    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  };

  class GameMap {
    constructor(w, h) {
      this.w = w; this.h = h; this.n = w * h;
      this.t = new Uint8Array(this.n);           // terrain type
      this.elev = new Uint8Array(this.n);        // 0 low, 1 hill
      this.occ = new Int32Array(this.n);         // building id occupying tile (0 = none)
      this.deco = new Uint8Array(this.n);        // visual variation seed
      this.deposits = [];                        // {kind:'oil'|'ore', tx, ty}
      this.spawns = [];                          // {tx, ty}
      this.name = ''; this.id = '';
      this.version = 0;                          // bump when occupancy changes (path cache invalidation)
      this._initPF();
    }
    get pw() { return this.w * TILE; }
    get ph() { return this.h * TILE; }
    idx(tx, ty) { return ty * this.w + tx; }
    inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
    tileAt(px, py) { const tx = (px / TILE) | 0, ty = (py / TILE) | 0; return this.inb(tx, ty) ? this.t[ty * this.w + tx] : T.ROCK; }
    passable(tx, ty, mv) {
      if (!this.inb(tx, ty)) return false;
      const i = ty * this.w + tx;
      if (!PASS[mv][this.t[i]]) return false;
      if (mv !== 'air' && mv !== 'naval' && this.occ[i] !== 0) return false;
      if (mv === 'naval' && this.occ[i] !== 0 && this.t[i] !== T.BRIDGE) return false;
      return true;
    }
    passablePx(px, py, mv) { return this.passable((px / TILE) | 0, (py / TILE) | 0, mv); }
    speedMul(px, py, mv) {
      const tx = (px / TILE) | 0, ty = (py / TILE) | 0;
      if (!this.inb(tx, ty) || mv === 'air') return 1;
      const c = COST[mv][this.t[ty * this.w + tx]];
      return c >= 99 ? 0.4 : 1 / c;
    }
    isForest(px, py) { return this.tileAt(px, py) === T.FOREST; }
    elevAt(px, py) { const tx = (px / TILE) | 0, ty = (py / TILE) | 0; return this.inb(tx, ty) ? this.elev[ty * this.w + tx] : 0; }

    /** Nearest passable tile center to (px,py) for a move class, spiral search. */
    nearestPassable(px, py, mv, maxR) {
      const tx0 = (px / TILE) | 0, ty0 = (py / TILE) | 0;
      if (this.passable(tx0, ty0, mv)) return { x: px, y: py };
      maxR = maxR || 12;
      for (let r = 1; r <= maxR; r++) {
        let best = null, bd = 1e9;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = tx0 + dx, ty = ty0 + dy;
          if (this.passable(tx, ty, mv)) {
            const cx = tx * TILE + 16, cy = ty * TILE + 16; const d = U.dist2(cx, cy, px, py);
            if (d < bd) { bd = d; best = { x: cx, y: cy }; }
          }
        }
        if (best) return best;
      }
      return null;
    }

    // ------------------------------------------------------------ Line of sight
    /** True if a direct-fire line between two points is not blocked by cliffs/rock. */
    los(ax, ay, bx, by) {
      const d = U.dist(ax, ay, bx, by); const steps = Math.ceil(d / 14);
      for (let i = 1; i < steps; i++) {
        const t = i / steps; const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (this.tileAt(x, y) === T.ROCK) return false;
      }
      return true;
    }
    /** Walkable straight line for a move class (used for path smoothing). */
    walkLine(ax, ay, bx, by, mv) {
      const d = U.dist(ax, ay, bx, by); const steps = Math.ceil(d / 10);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps; const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (!this.passablePx(x, y, mv)) return false;
        // avoid corner clipping: check lateral offsets
        if (!this.passablePx(x + 6, y + 6, mv) || !this.passablePx(x - 6, y - 6, mv) || !this.passablePx(x + 6, y - 6, mv) || !this.passablePx(x - 6, y + 6, mv)) return false;
      }
      return true;
    }

    // ------------------------------------------------------------ Pathfinding (A*)
    _initPF() {
      this._g = new Float32Array(this.n); this._came = new Int32Array(this.n);
      this._stamp = new Uint32Array(this.n); this._closed = new Uint32Array(this.n);
      this._gen = 1; this._heap = new U.Heap();
    }
    /** A* from pixel to pixel for a move class. Returns array of {x,y} waypoints or null.
     *  If the goal is unreachable returns path to the closest reached tile. maxNodes bounds CPU. */
    findPath(sx, sy, gx, gy, mv, maxNodes) {
      const w = this.w, h = this.h;
      let stx = U.clamp((sx / TILE) | 0, 0, w - 1), sty = U.clamp((sy / TILE) | 0, 0, h - 1);
      let gtx = U.clamp((gx / TILE) | 0, 0, w - 1), gty = U.clamp((gy / TILE) | 0, 0, h - 1);
      if (!this.passable(stx, sty, mv)) {
        const p = this.nearestPassable(sx, sy, mv, 4); if (!p) return null;
        stx = (p.x / TILE) | 0; sty = (p.y / TILE) | 0;
      }
      let goalOk = this.passable(gtx, gty, mv);
      if (!goalOk) {
        const p = this.nearestPassable(gx, gy, mv, 10);
        if (p) { gtx = (p.x / TILE) | 0; gty = (p.y / TILE) | 0; goalOk = true; gx = p.x; gy = p.y; }
      }
      const gen = ++this._gen; if (gen > 4e9) { this._stamp.fill(0); this._closed.fill(0); this._gen = 1; }
      const G = this._g, came = this._came, stamp = this._stamp, closed = this._closed, heap = this._heap;
      heap.clear();
      const cost = COST[mv], tt = this.t;
      const start = sty * w + stx, goal = gty * w + gtx;
      G[start] = 0; stamp[start] = gen; came[start] = -1;
      const hfn = (i) => { const dx = Math.abs((i % w) - gtx), dy = Math.abs(((i / w) | 0) - gty); return (dx + dy + (1.4142 - 2) * Math.min(dx, dy)) * 0.85; };
      heap.push(start, hfn(start));
      let best = start, bestH = hfn(start), nodes = 0; maxNodes = maxNodes || 9000;
      const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
      while (heap.size) {
        const cur = heap.pop();
        if (closed[cur] === gen) continue;
        closed[cur] = gen;
        if (cur === goal) { best = cur; break; }
        if (++nodes > maxNodes) break;
        const cx = cur % w, cy = (cur / w) | 0;
        const hc = hfn(cur); if (hc < bestH) { bestH = hc; best = cur; }
        for (let k = 0; k < 8; k++) {
          const nx = cx + DX[k], ny = cy + DY[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!this.passable(nx, ny, mv)) continue;
          if (k >= 4 && (!this.passable(cx + DX[k], cy, mv) || !this.passable(cx, cy + DY[k], mv))) continue; // no corner cutting
          const ni = ny * w + nx; if (closed[ni] === gen) continue;
          const step = (k >= 4 ? 1.4142 : 1) * cost[tt[ni]];
          const ng = G[cur] + step;
          if (stamp[ni] !== gen || ng < G[ni]) { stamp[ni] = gen; G[ni] = ng; came[ni] = cur; heap.push(ni, ng + hfn(ni)); }
        }
      }
      // reconstruct
      const tiles = [];
      for (let i = best; i !== -1 && tiles.length < 4000; i = came[i]) { tiles.push(i); if (i === start) break; }
      tiles.reverse();
      const pts = tiles.map((i) => ({ x: (i % w) * TILE + 16, y: ((i / w) | 0) * TILE + 16 }));
      if (best === goal && goalOk) pts.push({ x: gx, y: gy }); // exact final point
      // smooth (string pulling)
      const out = []; let a = { x: sx, y: sy }; let i = 0;
      while (i < pts.length) {
        let j = pts.length - 1;
        while (j > i && !this.walkLine(a.x, a.y, pts[j].x, pts[j].y, mv)) j--;
        out.push(pts[j]); a = pts[j]; i = j + 1;
      }
      out.reachedGoal = best === goal;
      return out;
    }

    /** Connected-component labels for a move class (used for validation and AI reachability). */
    components(mv) {
      const lab = new Int32Array(this.n).fill(-1); let c = 0; const st = [];
      for (let s = 0; s < this.n; s++) {
        if (lab[s] !== -1 || !PASS[mv][this.t[s]]) continue;
        lab[s] = c; st.push(s);
        while (st.length) {
          const i = st.pop(); const x = i % this.w, y = (i / this.w) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = x + [1, -1, 0, 0][k], ny = y + [0, 0, 1, -1][k];
            if (!this.inb(nx, ny)) continue; const ni = ny * this.w + nx;
            if (lab[ni] === -1 && PASS[mv][this.t[ni]]) { lab[ni] = c; st.push(ni); }
          }
        }
        c++;
      }
      return lab;
    }

    serializeTerrain() { return { w: this.w, h: this.h, id: this.id }; }
  }

  // ================================================================ Map generation
  function valueNoise(seed, w, h, scale) {
    const rng = new U.RNG(seed); const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
    const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rng.next();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / scale, fy = y / scale; const ix = fx | 0, iy = fy | 0; let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
    }
    return out;
  }

  class Painter {
    constructor(m) { this.m = m; }
    set(tx, ty, t) { if (this.m.inb(tx, ty)) this.m.t[ty * this.m.w + tx] = t; }
    get(tx, ty) { return this.m.inb(tx, ty) ? this.m.t[ty * this.m.w + tx] : -1; }
    circle(cx, cy, r, t, onlyIf) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) { if (!onlyIf || onlyIf(this.get(x, y))) this.set(x, y, t); }
      }
    }
    elevCircle(cx, cy, r) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (this.m.inb(x, y) && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.m.elev[y * this.m.w + x] = 1;
    }
    line(pts, width, t, onlyIf) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const d = Math.hypot(bx - ax, by - ay); const steps = Math.ceil(d * 2);
        for (let s = 0; s <= steps; s++) { const k = s / steps; this.circle(ax + (bx - ax) * k, ay + (by - ay) * k, width / 2, t, onlyIf); }
      }
    }
    rect(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t); }
  }

  /** Mirror the map with 180° point symmetry (fair 1v1). The bottom half is the design source. */
  function mirrorPoint(m) {
    const n = m.n;
    for (let j = Math.ceil(n / 2); j < n; j++) { const i = n - 1 - j; m.t[i] = m.t[j]; m.elev[i] = m.elev[j]; }
  }
  /** Mirror quadrant (top-left) onto other quadrants (4-player fairness). */
  function mirrorQuad(m) {
    const w = m.w, h = m.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x < w / 2 ? x : w - 1 - x, sy = y < h / 2 ? y : h - 1 - y;
      const s = sy * w + sx, d = y * w + x; m.t[d] = m.t[s]; m.elev[d] = m.elev[s];
    }
  }

  function scatterForest(m, seed, density, protect) {
    const n = valueNoise(seed, m.w, m.h, 7), n2 = valueNoise(seed + 7, m.w, m.h, 3);
    for (let i = 0; i < m.n; i++) {
      if (m.t[i] !== T.GRASS) continue;
      const v = n[i] * 0.75 + n2[i] * 0.25;
      if (v > 1 - density) m.t[i] = T.FOREST;
      else if (v < 0.22) m.t[i] = T.DIRT;
    }
    if (protect) for (const p of protect) new Painter(m).circle(p[0], p[1], p[2], T.GRASS, (t) => t === T.FOREST || t === T.DIRT);
  }

  function addSand(m) {
    const out = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x; if (m.t[i] === T.WATER || m.t[i] === T.BRIDGE || m.t[i] === T.ROCK || m.t[i] === T.SAND || m.t[i] === T.SHALLOW) continue;
      for (let k = 0; k < 4; k++) { const nx = x + [1, -1, 0, 0][k], ny = y + [0, 0, 1, -1][k]; if (m.inb(nx, ny) && m.t[ny * m.w + nx] === T.WATER) { out.push(i); break; } }
    }
    for (const i of out) if (m.t[i] !== T.ROAD) m.t[i] = T.SAND;
    // shallow ring inside water next to sand
    const sh = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x; if (m.t[i] !== T.WATER) continue;
      for (let k = 0; k < 4; k++) { const nx = x + [1, -1, 0, 0][k], ny = y + [0, 0, 1, -1][k]; if (m.inb(nx, ny) && m.t[ny * m.w + nx] === T.SAND) { sh.push(i); break; } }
    }
    for (const i of sh) m.t[i] = T.SHALLOW;
  }

  function clearDeposit(m, tx, ty) { const p = new Painter(m); p.rect(tx - 1, ty - 1, tx + 2, ty + 2, T.DIRT); for (let y = ty - 1; y <= ty + 2; y++) for (let x = tx - 1; x <= tx + 2; x++) if (m.inb(x, y)) m.elev[y * m.w + x] = m.elev[ty * m.w + tx]; }
  function clearBase(m, tx, ty, r) { new Painter(m).circle(tx, ty, r, T.GRASS, (t) => t !== T.WATER && t !== T.SHALLOW || true); }

  /** Ensure every spawn and deposit is ground-connected to spawn 0; carve roads if not. */
  function ensureConnectivity(m) {
    const p = new Painter(m);
    for (let iter = 0; iter < 6; iter++) {
      const lab = m.components('ground'); const base = lab[m.idx(m.spawns[0].tx, m.spawns[0].ty)];
      const targets = m.spawns.concat(m.deposits.filter((d) => !d.island));
      let fixed = false;
      for (const s of targets) {
        if (lab[m.idx(s.tx, s.ty)] !== base) {
          const a = m.spawns[0]; p.line([[s.tx, s.ty], [a.tx, a.ty]], 3, T.ROAD, (t) => t === T.ROCK || t === T.FOREST);
          p.line([[s.tx, s.ty], [a.tx, a.ty]], 2, T.BRIDGE, (t) => t === T.WATER || t === T.SHALLOW);
          fixed = true;
        }
      }
      if (!fixed) return true;
    }
    return false;
  }

  function finalize(m, seed) {
    addSand(m);
    for (const s of m.spawns) new Painter(m).circle(s.tx, s.ty, 6, T.GRASS, (t) => t === T.FOREST || t === T.ROCK || t === T.DIRT);
    for (const d of m.deposits) clearDeposit(m, d.tx, d.ty);
    ensureConnectivity(m);
    const rng = new U.RNG(seed * 31 + 7);
    for (let i = 0; i < m.n; i++) m.deco[i] = (rng.next() * 256) | 0;
    return m;
  }

  // ---------------------------------------------------------------- Handcrafted maps
  const MAPS = {};

  MAPS.twin_rivers = {
    name: 'Twin Rivers', players: 2, size: '96×96', desc: 'Two rivers shield each base. Bridges and a central highland decide control.',
    build(seed) {
      const m = new GameMap(96, 96); m.id = 'twin_rivers'; m.name = this.name; const p = new Painter(m);
      scatterForest(m, 11, 0.3);
      p.elevCircle(47.5, 47.5, 9); p.elevCircle(30, 62, 4); p.elevCircle(62, 80, 3);
      p.circle(40, 56, 2.2, T.ROCK); p.circle(22, 52, 1.8, T.ROCK); p.circle(70, 66, 2, T.ROCK);
      // river curving around the SW base
      p.line([[0, 58], [14, 62], [28, 70], [34, 84], [33, 96]], 4.5, T.WATER);
      // roads and bridges
      p.line([[12, 84], [30, 66], [47, 48]], 2, T.ROAD, (t) => t !== T.WATER);
      p.line([[12, 84], [44, 88], [72, 72]], 2, T.ROAD, (t) => t !== T.WATER);
      p.line([[23, 73], [30.5, 65.5]], 2.2, T.BRIDGE, (t) => t === T.WATER || t === T.SHALLOW || t === T.ROAD);
      p.line([[31, 88], [38, 88]], 2.4, T.BRIDGE, (t) => t === T.WATER || t === T.ROAD);
      p.line([[8, 56], [8, 63]], 2.4, T.BRIDGE, (t) => t === T.WATER);
      mirrorPoint(m);
      m.spawns = [{ tx: 12, ty: 84 }, { tx: 83, ty: 11 }];
      const deps = [['oil', 5, 78], ['oil', 19, 90], ['ore', 5, 89], ['ore', 21, 77], ['oil', 42, 78], ['ore', 26, 58], ['oil', 44, 58], ['ore', 54, 66], ['oil', 6, 50]];
      for (const [k, x, y] of deps) { m.deposits.push({ kind: k, tx: x, ty: y }); m.deposits.push({ kind: k, tx: 94 - x, ty: 94 - y }); }
      return finalize(m, seed);
    },
  };

  MAPS.iron_pass = {
    name: 'Iron Pass', players: 2, size: '96×80', desc: 'A mountain wall with three narrow passes. Artillery and fortifications rule.',
    build(seed) {
      const m = new GameMap(96, 80); m.id = 'iron_pass'; m.name = this.name; const p = new Painter(m);
      scatterForest(m, 23, 0.26);
      for (let x = 0; x < 96; x++) { const y = 41 + Math.round(Math.sin(x / 7) * 2); p.rect(x, y - 3, x, y + 3, T.ROCK); }
      for (const px of [13, 47.5, 82]) p.rect(Math.floor(px - 2), 34, Math.ceil(px + 2), 46, T.DIRT);
      p.rect(46, 34, 49, 46, T.ROAD);
      p.elevCircle(47.5, 52, 5); p.elevCircle(13, 50, 3); p.elevCircle(82, 50, 3);
      p.circle(30, 60, 2.5, T.ROCK); p.circle(66, 58, 2, T.ROCK);
      p.line([[47, 75], [47, 46]], 2, T.ROAD);
      p.line([[47, 68], [20, 68], [13, 50]], 2, T.ROAD); p.line([[47, 68], [76, 68], [82, 50]], 2, T.ROAD);
      p.circle(70, 76, 3, T.WATER); p.circle(24, 56, 2.5, T.WATER);
      mirrorPoint(m);
      m.spawns = [{ tx: 47, ty: 71 }, { tx: 48, ty: 8 }];
      const deps = [['oil', 37, 73], ['oil', 56, 69], ['ore', 38, 64], ['ore', 56, 63], ['oil', 6, 60], ['ore', 88, 58], ['oil', 28, 49], ['ore', 66, 49], ['oil', 41, 52]];
      for (const [k, x, y] of deps) { m.deposits.push({ kind: k, tx: x, ty: y }); m.deposits.push({ kind: k, tx: 94 - x, ty: 78 - y }); }
      return finalize(m, seed);
    },
  };

  MAPS.archipelago = {
    name: 'Archipelago Front', players: 2, size: '112×96', desc: 'Coastal war across a broken sea. One land bridge; naval power decides the rest.',
    build(seed) {
      const m = new GameMap(112, 96); m.id = 'archipelago'; m.name = this.name; const p = new Painter(m);
      m.t.fill(T.WATER);
      p.circle(24, 74, 22, T.GRASS); p.circle(8, 56, 10, T.GRASS); p.circle(46, 90, 10, T.GRASS);
      p.circle(55.5, 47.5, 9, T.GRASS);
      p.circle(80, 76, 7, T.GRASS);
      p.line([[36, 62], [52, 52]], 4, T.GRASS);
      scatterForest(m, 5, 0.3, [[20, 78, 9]]);
      p.elevCircle(55.5, 47.5, 5); p.circle(16, 62, 2, T.ROCK); p.circle(38, 80, 1.8, T.ROCK); p.circle(80, 76, 1.5, T.ROCK);
      p.line([[20, 78], [36, 62], [55, 48]], 2, T.ROAD);
      mirrorPoint(m);
      m.spawns = [{ tx: 20, ty: 78 }, { tx: 91, ty: 17 }];
      const deps = [['oil', 10, 70], ['oil', 28, 88], ['ore', 11, 83], ['ore', 32, 70], ['oil', 5, 54], ['ore', 46, 90], ['oil', 54, 52], ['oil', 82, 72, true], ['ore', 76, 78, true]];
      for (const [k, x, y, isl] of deps) { m.deposits.push({ kind: k, tx: x, ty: y, island: !!isl }); m.deposits.push({ kind: k, tx: 110 - x, ty: 94 - y, island: !!isl }); }
      return finalize(m, seed);
    },
  };

  MAPS.crossroads = {
    name: 'Highland Crossroads', players: 4, size: '112×112', desc: 'Four armies, one crown: a central highland at the meeting of the great roads.',
    build(seed) {
      const m = new GameMap(112, 112); m.id = 'crossroads'; m.name = this.name; const p = new Painter(m);
      scatterForest(m, 41, 0.3);
      p.elevCircle(56, 56, 11); p.elevCircle(30, 30, 4);
      p.line([[56, 0], [56, 56]], 2.5, T.ROAD); p.line([[0, 56], [56, 56]], 2.5, T.ROAD);
      p.line([[14, 14], [40, 40]], 2, T.ROAD);
      p.circle(26, 44, 3, T.WATER); p.circle(44, 22, 2.5, T.ROCK); p.circle(44, 48, 1.6, T.ROCK); p.circle(48, 44, 1.6, T.ROCK);
      p.line([[0, 36], [8, 34], [16, 36]], 2.5, T.WATER);
      mirrorQuad(m);
      m.spawns = [{ tx: 13, ty: 13 }, { tx: 98, ty: 98 }, { tx: 98, ty: 13 }, { tx: 13, ty: 98 }];
      const deps = [['oil', 6, 22], ['oil', 22, 6], ['ore', 22, 20], ['ore', 6, 6], ['oil', 34, 52], ['ore', 52, 34], ['oil', 50, 50]];
      for (const [k, x, y] of deps) {
        for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const tx = fx ? 110 - x : x, ty = fy ? 110 - y : y;
          if (!m.deposits.some((d) => Math.abs(d.tx - tx) < 3 && Math.abs(d.ty - ty) < 3)) m.deposits.push({ kind: k, tx, ty });
        }
      }
      return finalize(m, seed);
    },
  };

  MAPS.ashen_plains = {
    name: 'Ashen Plains', players: 2, size: '80×80', desc: 'Small open battlefield of scorched fields. Fast, brutal engagements.',
    build(seed) {
      const m = new GameMap(80, 80); m.id = 'ashen_plains'; m.name = this.name; const p = new Painter(m);
      scatterForest(m, 77, 0.22);
      p.elevCircle(39.5, 39.5, 6); p.elevCircle(24, 52, 3);
      p.circle(32, 46, 1.6, T.ROCK); p.circle(18, 44, 2, T.ROCK); p.circle(48, 60, 1.4, T.ROCK);
      p.line([[10, 69], [39.5, 39.5]], 2, T.ROAD);
      p.circle(56, 66, 2.5, T.WATER);
      mirrorPoint(m);
      m.spawns = [{ tx: 10, ty: 69 }, { tx: 69, ty: 10 }];
      const deps = [['oil', 3, 62], ['oil', 17, 75], ['ore', 3, 74], ['ore', 18, 61], ['oil', 30, 56], ['ore', 38, 48]];
      for (const [k, x, y] of deps) { m.deposits.push({ kind: k, tx: x, ty: y }); m.deposits.push({ kind: k, tx: 78 - x, ty: 78 - y }); }
      return finalize(m, seed);
    },
  };

  WF.T = T; WF.PASS = PASS; WF.GameMap = GameMap; WF.MAPS = MAPS; WF.Painter = Painter;
  WF.buildMap = function (id, seed) { const def = MAPS[id] || MAPS.twin_rivers; return def.build(seed || 1); };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
