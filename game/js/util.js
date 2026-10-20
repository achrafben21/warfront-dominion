/* WARFRONT: DOMINION — core utilities (shared by simulation, renderer and tests) */
(function (WF) {
  'use strict';
  const U = {};

  U.TILE = 32;
  U.TICK = 1 / 20;           // fixed simulation step (20 Hz)

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.dist = (ax, ay, bx, by) => Math.sqrt(U.dist2(ax, ay, bx, by));
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  U.turnToward = (cur, target, maxStep) => {
    const d = U.wrapAngle(target - cur);
    if (Math.abs(d) <= maxStep) return target;
    return U.wrapAngle(cur + Math.sign(d) * maxStep);
  };

  /** Deterministic PRNG (mulberry32). State is serializable. */
  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let t = (this.s += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    gauss() { return (this.next() + this.next() + this.next() - 1.5) / 1.5; }
  }
  U.RNG = RNG;

  /** Uniform-grid spatial hash for fast range queries. Rebuilt once per tick. */
  class SpatialHash {
    constructor(w, h, cell) {
      this.cell = cell; this.cols = Math.ceil(w / cell) + 1; this.rows = Math.ceil(h / cell) + 1;
      this.buckets = new Array(this.cols * this.rows);
      for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    }
    clear() { for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0; }
    insert(e) {
      const cx = U.clamp((e.x / this.cell) | 0, 0, this.cols - 1), cy = U.clamp((e.y / this.cell) | 0, 0, this.rows - 1);
      this.buckets[cy * this.cols + cx].push(e);
    }
    /** Calls fn(e) for every entity whose bucket intersects the circle; caller does exact distance test. */
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = U.clamp(((x - r) / c) | 0, 0, this.cols - 1), x1 = U.clamp(((x + r) / c) | 0, 0, this.cols - 1);
      const y0 = U.clamp(((y - r) / c) | 0, 0, this.rows - 1), y1 = U.clamp(((y + r) / c) | 0, 0, this.rows - 1);
      const r2 = r * r;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const e = b[i]; const dx = e.x - x, dy = e.y - y; const rr = r + (e.radius || 0);
          if (dx * dx + dy * dy <= rr * rr || dx * dx + dy * dy <= r2) out.push(e);
        }
      }
      return out;
    }
  }
  U.SpatialHash = SpatialHash;

  /** Binary min-heap keyed by numeric priority (used by A*). */
  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(val, key) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop(); const n = k.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lk) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
    clear() { this.k.length = 0; this.v.length = 0; }
  }
  U.Heap = Heap;

  /** Simple 32-bit FNV-1a hash for save validation. */
  U.hash = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  };

  U.fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString());
  U.fmtTime = (s) => { s = Math.floor(s); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };

  WF.U = U;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
