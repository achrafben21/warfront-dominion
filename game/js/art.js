/* WARFRONT: DOMINION v2 — procedural art core: palette, lighting helpers, sprite cache.
 * Everything visual is generated at runtime from vector code (no external image assets). */
(function (WF) {
  'use strict';
  const D = WF.D;
  const ART = {};
  const cache = new Map();
  ART.cache = cache;
  ART.SS = 0; // optional supersampling override (icons/manual renders)
  ART.defaultSS = 3;

  // ---------------------------------------------------------------- color helpers
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb(a, al) { return al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(a, f) { return f >= 0 ? mix(a, [255, 255, 255], f) : mix(a, [0, 0, 0], -f); }
  ART.hex = hex; ART.rgb = rgb; ART.mix = mix; ART.shade = shade;

  // faction material styles
  const FSTYLE = {
    aegis: { base: hex('#6e7a4c'), metal: hex('#4c5240'), accent: hex('#e3c46e'), glow: null, camo: 'woodland', camoA: hex('#556238'), camoB: hex('#8a8a5c') },
    vortex: { base: hex('#465260'), metal: hex('#2a3038'), accent: hex('#5ff3ff'), glow: 'rgba(95,243,255,0.95)', camo: 'digital', camoA: hex('#384350'), camoB: hex('#5b6878') },
    iron: { base: hex('#7a6150'), metal: hex('#4d4038'), accent: hex('#ffb347'), glow: 'rgba(255,140,60,0.95)', camo: 'rust', camoA: hex('#5c463a'), camoB: hex('#9a7a5e') },
  };
  ART.FSTYLE = FSTYLE;

  function palette(faction, colorIdx) {
    const fs = FSTYLE[faction] || FSTYLE.aegis; const tc = D.TEAM_COLORS[colorIdx % D.TEAM_COLORS.length];
    const team = hex(tc.main);
    const hull = mix(fs.base, team, 0.5);
    return {
      faction, hull, hullD: shade(hull, -0.35), hullL: shade(hull, 0.25),
      camoA: mix(fs.camoA, team, 0.42), camoB: mix(fs.camoB, team, 0.4), camo: fs.camo,
      metal: fs.metal, metalL: shade(fs.metal, 0.3), metalD: shade(fs.metal, -0.35),
      team, teamL: hex(tc.light), teamD: hex(tc.dark), accent: fs.accent, glow: fs.glow,
      track: [30, 30, 28], trackL: [78, 76, 70], dark: [18, 20, 22], glass: [130, 200, 235], style: (D.FACTIONS[faction] || D.FACTIONS.aegis).style,
    };
  }
  ART.palette = palette;

  function mk(w, h) {
    const c = typeof OffscreenCanvas !== 'undefined' && !ART.forceDOM ? new OffscreenCanvas(w, h) : (() => { const e = document.createElement('canvas'); e.width = w; e.height = h; return e; })();
    if (c.width !== w) { c.width = w; c.height = h; }
    return c;
  }
  ART.mk = mk;

  // ---------------------------------------------------------------- path helpers
  const P2 = {};
  P2.rr = (g, x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  P2.chamfer = (g, x, y, w, h, c) => { c = Math.min(c, w / 2, h / 2); g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); };
  P2.poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  P2.hull = (g, style, x, y, w, h) => {
    if (style === 'sleek') P2.rr(g, x, y, w, h, Math.min(w, h) * 0.45);
    else if (style === 'bulky') P2.chamfer(g, x, y, w, h, Math.min(w, h) * 0.1);
    else { // angular: sloped glacis at the front
      const c = Math.min(w, h) * 0.2, f = Math.min(w, h) * 0.32;
      P2.poly(g, [[x + c, y], [x + w - f, y], [x + w, y + f * 0.7], [x + w, y + h - f * 0.7], [x + w - f, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]);
    }
  };
  ART.P2 = P2;

  // ---------------------------------------------------------------- lighting helpers (light from top-left)
  const L = {};
  /** Fill current path with a lit material: directional gradient, bevel rim, outline. bbox = [x,y,w,h]. */
  L.fill = (g, col, bbox, opt) => {
    opt = opt || {};
    const [x, y, w, h] = bbox;
    const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
    gr.addColorStop(0, rgb(shade(col, 0.2))); gr.addColorStop(0.45, rgb(col)); gr.addColorStop(1, rgb(shade(col, -0.32)));
    g.fillStyle = gr; g.fill();
    if (!opt.noBevel) {
      g.save(); g.clip();
      const bv = g.createLinearGradient(x, y, x + w, y + h);
      bv.addColorStop(0, 'rgba(255,255,255,0.5)'); bv.addColorStop(0.5, 'rgba(255,255,255,0)'); bv.addColorStop(0.5, 'rgba(0,0,0,0)'); bv.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.lineWidth = opt.bevel || 2.2; g.strokeStyle = bv; g.stroke();
      g.restore();
    }
    g.lineWidth = opt.lw || 0.75; g.strokeStyle = rgb(shade(col, -0.72), 0.95); g.stroke();
  };
  /** Cylinder (barrel) along +x with round shading. */
  L.cyl = (g, x0, y0, len, wid, col, opt) => {
    opt = opt || {};
    const gr = g.createLinearGradient(0, y0 - wid / 2, 0, y0 + wid / 2);
    gr.addColorStop(0, rgb(shade(col, -0.25))); gr.addColorStop(0.3, rgb(shade(col, 0.45))); gr.addColorStop(0.6, rgb(col)); gr.addColorStop(1, rgb(shade(col, -0.55)));
    P2.rr(g, x0, y0 - wid / 2, len, wid, wid * 0.25); g.fillStyle = gr; g.fill();
    g.lineWidth = 0.45; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
    if (opt.sleeve) { g.fillStyle = rgb(shade(col, -0.22)); g.fillRect(x0 + len * 0.3, y0 - wid * 0.62, len * 0.2, wid * 1.24); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + len * 0.3, y0 - wid * 0.62, len * 0.2, wid * 0.3); }
    if (opt.brake) { const bw = wid * 1.55; g.fillStyle = rgb(shade(col, -0.3)); P2.rr(g, x0 + len - wid * 1.3, y0 - bw / 2, wid * 1.3, bw, 0.6); g.fill(); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 + len - wid * 0.9, y0 - bw / 2, wid * 0.25, bw); }
    if (opt.bore !== false) { g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.arc(x0 + len - 0.2, y0, wid * 0.22, 0, 7); g.fill(); }
  };
  L.glow = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  L.hatch = (g, x, y, r, col) => {
    g.beginPath(); g.arc(x, y, r, 0, 7); L.fill(g, shade(col, -0.05), [x - r, y - r, 2 * r, 2 * r], { bevel: Math.max(0.6, r * 0.4), lw: 0.5 });
    g.fillStyle = rgb(shade(col, -0.3)); g.beginPath(); g.arc(x + r * 0.08, y + r * 0.08, r * 0.52, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(x - r * 0.28, y - r * 0.28, r * 0.22, 0, 7); g.fill();
  };
  L.grille = (g, x, y, w, h, n, vertical) => {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < n; i++) { if (vertical) g.fillRect(x + (i + 0.3) * w / n, y + 0.3, w / n * 0.38, h - 0.6); else g.fillRect(x + 0.3, y + (i + 0.3) * h / n, w - 0.6, h / n * 0.38); }
  };
  L.bolts = (g, pts, col) => { for (const [x, y] of pts) { g.fillStyle = rgb(shade(col, -0.5)); g.beginPath(); g.arc(x + 0.15, y + 0.15, 0.5, 0, 7); g.fill(); g.fillStyle = rgb(shade(col, 0.35)); g.beginPath(); g.arc(x - 0.1, y - 0.1, 0.32, 0, 7); g.fill(); } };
  L.box = (g, x, y, w, h, col) => { P2.rr(g, x, y, w, h, Math.min(w, h) * 0.2); L.fill(g, col, [x, y, w, h], { bevel: 0.8, lw: 0.45 }); };
  L.antenna = (g, x, y, len, a) => { g.strokeStyle = 'rgba(15,15,15,0.8)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x, y, 0.65, 0, 7); g.fill(); };
  L.stripe = (g, P, x, y, w, h) => { g.fillStyle = rgb(P.teamD); g.fillRect(x, y, w, h); g.fillStyle = rgb(P.team); g.fillRect(x, y, w, h * 0.75); g.fillStyle = rgb(P.teamL, 0.6); g.fillRect(x, y, w, h * 0.25); };
  L.lightDot = (g, x, y, col, r) => { r = r || 1; L.glow(g, x, y, r * 2.6, col.replace(/[\d.]+\)$/, '0.45)')); g.fillStyle = col; g.beginPath(); g.arc(x, y, r * 0.7, 0, 7); g.fill(); };
  /** Camouflage + weathering clipped to the current path. */
  L.camo = (g, P, bbox, seed) => {
    const [x, y, w, h] = bbox; let s = (seed * 9301 + 49297) % 233280; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.save(); g.clip(); g.globalAlpha = 0.5;
    if (P.camo === 'digital') {
      const q = Math.max(1.1, Math.min(w, h) / 9);
      for (let yy = y; yy < y + h; yy += q) for (let xx = x; xx < x + w; xx += q) { const r = rnd(); if (r < 0.2) { g.fillStyle = rgb(P.camoA); g.fillRect(xx, yy, q, q); } else if (r < 0.33) { g.fillStyle = rgb(P.camoB); g.fillRect(xx, yy, q, q); } }
    } else if (P.camo === 'rust') {
      for (let i = 0; i < 14; i++) { g.fillStyle = rgb(i % 2 ? P.camoA : [118, 74, 42], 0.55); const sx = x + rnd() * w, sy = y + rnd() * h; g.beginPath(); g.ellipse(sx, sy, w * 0.12 * (0.5 + rnd()), h * 0.07 * (0.5 + rnd()), rnd() * 3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(70,42,22,0.45)'; g.lineWidth = 0.45; for (let i = 0; i < 9; i++) { const sx = x + rnd() * w, sy = y + rnd() * h; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + rnd() * 1.5, sy + 2 + rnd() * 3); g.stroke(); }
    } else {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = rgb(i % 3 === 0 ? P.camoB : P.camoA);
        const cx = x + rnd() * w, cy = y + rnd() * h, r = Math.min(w, h) * (0.16 + rnd() * 0.18);
        g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, rr2 = r * (0.6 + rnd() * 0.6); g.lineTo(cx + Math.cos(a) * rr2 * 1.4, cy + Math.sin(a) * rr2); } g.closePath(); g.fill();
      }
    }
    g.globalAlpha = 1;
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(32,24,14,0.38)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(190,170,130,0.2)'; for (let i = 0; i < 20; i++) g.fillRect(x + rnd() * w, y + rnd() * h, 0.55, 0.55);
    g.restore();
  };
  ART.L = L;

  /** Create (or fetch) a sprite of logical radius R. draw(g) works in local coords centered at 0,0 facing +x. */
  function sprite(key, R, draw, ssOverride) {
    if (cache.has(key)) return cache.get(key);
    const ss = ssOverride || ART.SS || ART.defaultSS;
    const size = Math.ceil(R * 2 * ss) + 4;
    const c = mk(size, size); const g = c.getContext('2d');
    g.translate(size / 2, size / 2); g.scale(ss, ss);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    const s = { img: c, w: size / ss, h: size / ss };
    cache.set(key, s); return s;
  }
  ART.sprite = sprite;

  /** Soft drop-shadow from a sprite (blurred silhouette). */
  ART.shadowFromSprite = function (key, src, blur, alpha) {
    if (cache.has(key)) return cache.get(key);
    const k = src.img.width / src.w; const pad = Math.ceil(blur * k * 2.5) + 2;
    const W = src.img.width + pad * 2, H = src.img.height + pad * 2;
    const c = mk(W, H); const g = c.getContext('2d');
    if ('filter' in g) g.filter = `blur(${blur * k}px)`;
    g.drawImage(src.img, pad, pad);
    g.filter = 'none'; g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgba(0,0,0,${alpha || 0.45})`; g.fillRect(0, 0, W, H);
    const s = { img: c, w: W / k, h: H / k }; cache.set(key, s); return s;
  };

  ART.clear = () => cache.clear();
  WF.ART = ART;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
