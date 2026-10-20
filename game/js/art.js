/* WARFRONT: DOMINION — procedural original art. Every unit, building and terrain texture is
 * generated at runtime from vector drawing code (no external image assets), cached as bitmaps. */
(function (WF) {
  'use strict';
  const D = WF.D;
  const ART = {};
  const SS = 2; // supersampling factor for sprites
  const cache = new Map();

  // ---------------------------------------------------------------- color helpers
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb(a, al) { return al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(a, f) { return f >= 0 ? mix(a, [255, 255, 255], f) : mix(a, [0, 0, 0], -f); }
  ART.hex = hex; ART.rgb = rgb; ART.mix = mix; ART.shade = shade;

  const FSTYLE = {
    aegis: { base: hex('#6b7448'), metal: hex('#4a503a'), accent: hex('#d9c27a'), glow: null },
    vortex: { base: hex('#3a4450'), metal: hex('#262c34'), accent: hex('#5ff3ff'), glow: '#5ff3ff' },
    iron: { base: hex('#76604f'), metal: hex('#4b3e35'), accent: hex('#ffb347'), glow: '#ff8a3a' },
  };

  function palette(faction, colorIdx) {
    const fs = FSTYLE[faction] || FSTYLE.aegis; const tc = D.TEAM_COLORS[colorIdx % D.TEAM_COLORS.length];
    const team = hex(tc.main);
    return {
      hull: mix(fs.base, team, 0.42), hullD: shade(mix(fs.base, team, 0.35), -0.35), hullL: shade(mix(fs.base, team, 0.45), 0.25),
      metal: fs.metal, metalL: shade(fs.metal, 0.25), team, teamL: hex(tc.light), teamD: hex(tc.dark), accent: fs.accent, glow: fs.glow,
      track: [34, 34, 32], trackL: [70, 70, 64], dark: [20, 22, 24], glass: [120, 190, 230], style: (D.FACTIONS[faction] || D.FACTIONS.aegis).style,
    };
  }
  ART.palette = palette;

  function mk(w, h) {
    const c = typeof OffscreenCanvas !== 'undefined' && !ART.forceDOM ? new OffscreenCanvas(w, h) : (() => { const e = document.createElement('canvas'); e.width = w; e.height = h; return e; })();
    if (c.width !== w) { c.width = w; c.height = h; }
    return c;
  }
  ART.mk = mk;

  // ---------------------------------------------------------------- primitive helpers
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function chamfer(g, x, y, w, h, c) { g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); }
  function hullPath(g, style, x, y, w, h) {
    if (style === 'sleek') rr(g, x, y, w, h, Math.min(w, h) * 0.42);
    else if (style === 'bulky') chamfer(g, x, y, w, h, Math.min(w, h) * 0.12);
    else chamfer(g, x, y, w, h, Math.min(w, h) * 0.28);
  }
  function fillShaded(g, P, col, x, y, w, h) {
    const gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, rgb(shade(col, 0.22))); gr.addColorStop(0.5, rgb(col)); gr.addColorStop(1, rgb(shade(col, -0.3)));
    g.fillStyle = gr; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = rgb(shade(col, -0.55), 0.9); g.stroke();
  }
  function tracks(g, P, L, W, tw, wheels) {
    for (const s of [-1, 1]) {
      const y = s < 0 ? -W / 2 : W / 2 - tw;
      rr(g, -L / 2, y, L, tw, tw * 0.4); g.fillStyle = rgb(P.track); g.fill();
      g.strokeStyle = rgb(P.trackL, 0.7); g.lineWidth = 0.8;
      for (let x = -L / 2 + 2; x < L / 2 - 1; x += 3) { g.beginPath(); g.moveTo(x, y + 0.6); g.lineTo(x, y + tw - 0.6); g.stroke(); }
      if (wheels) { g.fillStyle = rgb(P.trackL); for (let i = 0; i < wheels; i++) { const x = -L / 2 + (i + 0.5) * L / wheels; g.beginPath(); g.arc(x, y + tw / 2, tw * 0.28, 0, 7); g.fill(); } }
    }
  }
  function wheels(g, P, L, W, n, r) {
    g.fillStyle = rgb(P.dark);
    for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * L / n; for (const s of [-1, 1]) { rr(g, x - r, s * W / 2 - r * 0.6, r * 2, r * 1.2, r * 0.4); g.fill(); } }
  }
  function barrel(g, P, x0, len, wid, col, muzzle) {
    rr(g, x0, -wid / 2, len, wid, wid * 0.3); g.fillStyle = rgb(col || P.metal); g.fill(); g.strokeStyle = rgb(P.dark, 0.7); g.lineWidth = 0.7; g.stroke();
    if (muzzle) { g.fillStyle = rgb(P.dark); g.fillRect(x0 + len - wid * 0.9, -wid * 0.7, wid * 0.9, wid * 1.4); }
  }
  function teamStripe(g, P, x, y, w, h) { g.fillStyle = rgb(P.team); g.fillRect(x, y, w, h); g.fillStyle = rgb(P.teamL, 0.5); g.fillRect(x, y, w, h * 0.35); }
  function light(g, x, y, r, col) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  function rivets(g, P, pts) { g.fillStyle = rgb(shade(P.hull, -0.4)); for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 0.6, 0, 7); g.fill(); } }
  function star(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); }

  /** Create a sprite of logical size (radius R) with draw(g) in local coords centered at 0,0 facing +x. */
  function sprite(key, R, draw) {
    if (cache.has(key)) return cache.get(key);
    const ss = ART.SS || SS;
    const size = Math.ceil(R * 2 * ss) + 4;
    const c = mk(size, size); const g = c.getContext('2d');
    g.translate(size / 2, size / 2); g.scale(ss, ss);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    const s = { img: c, w: size / ss, h: size / ss };
    cache.set(key, s); return s;
  }
  ART.sprite = sprite;

  // ================================================================ UNIT BODIES
  const BODY = {};
  const TURRET = {};

  function tankBody(L, W, opt) {
    return (g, P) => {
      const tw = W * 0.26;
      if (opt.hover) {
        g.fillStyle = rgb(P.dark, 0.6); rr(g, -L / 2 - 1, -W / 2 - 1, L + 2, W + 2, W * 0.45); g.fill();
        if (P.glow) { g.globalAlpha = 0.55; light(g, -L * 0.42, -W * 0.3, W * 0.35, P.glow); light(g, -L * 0.42, W * 0.3, W * 0.35, P.glow); g.globalAlpha = 1; }
      } else tracks(g, P, L, W, tw, opt.wheels || 4);
      const hx = -L / 2 + (opt.hover ? 0 : L * 0.04), hw = L * (opt.hover ? 1 : 0.92), hy = -W / 2 + (opt.hover ? 1 : tw * 0.7), hh = W - (opt.hover ? 2 : tw * 1.4);
      hullPath(g, opt.hover ? 'sleek' : P.style, hx, hy, hw, hh); fillShaded(g, P, P.hull, hx, hy, hw, hh);
      // engine deck & panel lines
      g.strokeStyle = rgb(P.hullD, 0.8); g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(hx + hw * 0.2, hy + 1.5); g.lineTo(hx + hw * 0.2, hy + hh - 1.5); g.stroke();
      g.fillStyle = rgb(P.hullD, 0.6);
      for (let i = 0; i < 3; i++) g.fillRect(hx + 2 + i * 2.2, hy + hh * 0.25, 1.2, hh * 0.5);
      // front glacis highlight
      g.fillStyle = rgb(P.hullL, 0.45); g.fillRect(hx + hw * 0.78, hy + 1.5, hw * 0.16, hh - 3);
      teamStripe(g, P, hx + hw * 0.22, hy + 0.8, hw * 0.12, 1.6); teamStripe(g, P, hx + hw * 0.22, hy + hh - 2.4, hw * 0.12, 1.6);
      if (P.style === 'bulky' || opt.plates) { g.fillStyle = rgb(shade(P.hull, -0.15)); g.fillRect(hx + hw * 0.3, hy - 1, hw * 0.45, 2); g.fillRect(hx + hw * 0.3, hy + hh - 1, hw * 0.45, 2); rivets(g, P, [[hx + hw * 0.35, hy + 2], [hx + hw * 0.6, hy + 2], [hx + hw * 0.35, hy + hh - 2], [hx + hw * 0.6, hy + hh - 2]]); }
      if (P.glow && P.style === 'sleek') { g.globalAlpha = 0.7; light(g, hx + hw - 2, hy + 2.5, 2.5, P.glow); light(g, hx + hw - 2, hy + hh - 2.5, 2.5, P.glow); g.globalAlpha = 1; }
      else { g.fillStyle = 'rgba(255,240,190,0.85)'; g.fillRect(hx + hw - 1.6, hy + 1.5, 1.2, 1.6); g.fillRect(hx + hw - 1.6, hy + hh - 3.1, 1.2, 1.6); }
    };
  }
  function tankTurret(r, barrels, blen, bw, opt) {
    return (g, P) => {
      const n = barrels; const sp = bw * 1.5;
      if (n === 2) { g.save(); g.translate(0, -sp / 2); barrel(g, P, r * 0.4, blen, bw, P.metalL, true); g.translate(0, sp); barrel(g, P, r * 0.4, blen, bw, P.metalL, true); g.restore(); }
      else { barrel(g, P, r * 0.4, blen, bw, P.metalL, true); }
      if (P.style === 'sleek') { g.beginPath(); g.ellipse(-r * 0.1, 0, r * 1.05, r * 0.85, 0, 0, 7); }
      else if (P.style === 'bulky') { chamfer(g, -r * 1.05, -r * 0.9, r * 1.9, r * 1.8, r * 0.3); }
      else { g.beginPath(); g.moveTo(r * 0.85, -r * 0.55); g.lineTo(r * 0.85, r * 0.55); g.lineTo(r * 0.2, r * 0.9); g.lineTo(-r * 0.95, r * 0.75); g.lineTo(-r * 0.95, -r * 0.75); g.lineTo(r * 0.2, -r * 0.9); g.closePath(); }
      fillShaded(g, P, shade(P.hull, 0.05), -r, -r, 2 * r, 2 * r);
      g.fillStyle = rgb(P.hullD); g.beginPath(); g.arc(-r * 0.3, -r * 0.3, r * 0.28, 0, 7); g.fill();
      g.fillStyle = rgb(P.hullL, 0.6); g.beginPath(); g.arc(-r * 0.32, -r * 0.33, r * 0.12, 0, 7); g.fill();
      if (opt && opt.mg) { g.fillStyle = rgb(P.dark); g.fillRect(-r * 0.4, r * 0.25, r * 0.9, 1); }
      teamStripe(g, P, -r * 0.9, -0.8, r * 0.35, 1.6);
      if (opt && opt.plasma && P.glow) { g.globalAlpha = 0.8; light(g, r * 0.4 + blen, 0, bw * 1.2, P.glow); g.globalAlpha = 1; }
    };
  }

  BODY.light_tank = (R) => tankBody(R * 2.0, R * 1.5, { wheels: 4 });
  TURRET.light_tank = (R) => tankTurret(R * 0.5, 1, R * 1.25, 2.2);
  BODY.med_tank = (R) => tankBody(R * 2.05, R * 1.55, { wheels: 5 });
  TURRET.med_tank = (R) => tankTurret(R * 0.58, 1, R * 1.3, 3, { mg: true });
  BODY.heavy_tank = (R) => tankBody(R * 2.05, R * 1.6, { wheels: 6, plates: true });
  TURRET.heavy_tank = (R) => tankTurret(R * 0.6, 2, R * 1.2, 3, { mg: true });
  BODY.mammoth = (R) => tankBody(R * 2.0, R * 1.65, { wheels: 7, plates: true });
  TURRET.mammoth = (R) => tankTurret(R * 0.62, 2, R * 1.15, 3.6, { mg: true });
  BODY.hover_tank = (R) => tankBody(R * 2.0, R * 1.4, { hover: true });
  TURRET.hover_tank = (R) => tankTurret(R * 0.5, 1, R * 1.1, 2.6, { plasma: true });

  BODY.recon = (R) => (g, P) => {
    const L = R * 2, W = R * 1.35; wheels(g, P, L * 0.8, W, 2, 2.6);
    hullPath(g, P.style, -L / 2, -W / 2 + 1.5, L, W - 3); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    g.fillStyle = rgb(P.glass, 0.85); g.fillRect(L * 0.12, -W / 2 + 3, L * 0.16, W - 6);
    teamStripe(g, P, -L * 0.38, -1, L * 0.3, 2);
  };
  TURRET.recon = (R) => (g, P) => { barrel(g, P, 0, R * 0.9, 1.4, P.dark); g.fillStyle = rgb(P.metal); g.beginPath(); g.arc(0, 0, R * 0.32, 0, 7); g.fill(); };

  BODY.builder = (R) => (g, P) => {
    const L = R * 2.05, W = R * 1.5; tracks(g, P, L, W, W * 0.24, 4);
    hullPath(g, P.style, -L / 2 + 1, -W / 2 + 2, L - 2, W - 4); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    // cab
    rr(g, L * 0.12, -W / 2 + 3, L * 0.3, W - 6, 2); fillShaded(g, P, shade(P.hull, 0.1), 0, -W / 2, L, W);
    g.fillStyle = rgb(P.glass, 0.9); g.fillRect(L * 0.32, -W / 2 + 4, L * 0.08, W - 8);
    // hazard stripes
    g.save(); g.beginPath(); g.rect(-L / 2 + 2, -W / 2 + 3, L * 0.3, W - 6); g.clip();
    for (let i = -10; i < 20; i += 4) { g.fillStyle = i % 8 === 0 ? '#e8c22a' : '#222'; g.beginPath(); g.moveTo(-L / 2 + i, -W / 2); g.lineTo(-L / 2 + i + 2, -W / 2); g.lineTo(-L / 2 + i + 2 + W, W / 2); g.lineTo(-L / 2 + i + W, W / 2); g.fill(); }
    g.restore();
    light(g, L * 0.2, 0, 2.2, 'rgba(255,170,40,0.9)');
  };
  TURRET.builder = (R) => (g, P) => { // crane arm
    g.fillStyle = '#e0b62a'; rr(g, -R * 0.6, -1.6, R * 1.6, 3.2, 1); g.fill(); g.strokeStyle = '#5a4a10'; g.lineWidth = 0.6; g.stroke();
    g.strokeStyle = '#5a4a10'; for (let x = -R * 0.5; x < R; x += 2.5) { g.beginPath(); g.moveTo(x, -1.4); g.lineTo(x + 1.5, 1.4); g.stroke(); }
    g.fillStyle = rgb(P.dark); g.beginPath(); g.arc(R * 1.0, 0, 1.6, 0, 7); g.fill();
    g.fillStyle = rgb(P.metal); g.beginPath(); g.arc(-R * 0.5, 0, 2.6, 0, 7); g.fill();
  };

  BODY.supply = (R) => (g, P) => {
    const L = R * 2.1, W = R * 1.35; wheels(g, P, L * 0.85, W, 3, 2.4);
    rr(g, -L / 2, -W / 2 + 1.5, L * 0.66, W - 3, 1.5); fillShaded(g, P, shade(P.hull, -0.05), -L / 2, -W / 2, L, W);
    g.fillStyle = '#f2f2ea'; g.fillRect(-L * 0.25, -2.4, 7, 1.6); g.fillRect(-L * 0.25 + 2.7, -5.1, 1.6, 7);
    g.fillStyle = '#d33'; g.fillRect(-L * 0.25 + 0.4, -2.2, 6.2, 1.2); g.fillRect(-L * 0.25 + 2.9, -4.7, 1.2, 6.2);
    rr(g, L * 0.2, -W / 2 + 2, L * 0.3, W - 4, 2); fillShaded(g, P, P.hull, 0, -W / 2, L, W);
    g.fillStyle = rgb(P.glass, 0.9); g.fillRect(L * 0.4, -W / 2 + 3, L * 0.07, W - 6);
    teamStripe(g, P, -L / 2 + 1, -W / 2 + 1.5, L * 0.66, 1.4);
  };

  BODY.flak = (R) => tankBody(R * 2.0, R * 1.5, { wheels: 4 });
  TURRET.flak = (R) => (g, P) => {
    g.save(); for (const s of [-1, 1]) { g.save(); g.translate(0, s * 2.4); barrel(g, P, R * 0.2, R * 0.95, 1.6, P.metalL, true); g.restore(); } g.restore();
    rr(g, -R * 0.55, -R * 0.62, R * 1.0, R * 1.24, 2); fillShaded(g, P, shade(P.hull, 0.08), -R, -R, R * 2, R * 2);
    g.fillStyle = rgb(P.dark); g.fillRect(-R * 0.4, -1, R * 0.5, 2); teamStripe(g, P, -R * 0.5, -R * 0.55, R * 0.25, 1.4);
    // radar dish
    g.fillStyle = rgb(P.metalL); g.beginPath(); g.ellipse(-R * 0.35, R * 0.35, 1.6, 2.6, 0, 0, 7); g.fill();
  };

  BODY.mlrs = (R) => (g, P) => {
    const L = R * 2.1, W = R * 1.45; wheels(g, P, L * 0.85, W, 3, 2.5);
    hullPath(g, P.style, -L / 2, -W / 2 + 1.5, L, W - 3); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    rr(g, L * 0.24, -W / 2 + 2.5, L * 0.22, W - 5, 2); fillShaded(g, P, shade(P.hull, 0.12), 0, -W / 2, L, W);
    g.fillStyle = rgb(P.glass, 0.9); g.fillRect(L * 0.4, -W / 2 + 3.5, 1.4, W - 7);
  };
  TURRET.mlrs = (R) => (g, P) => {
    rr(g, -R * 0.75, -R * 0.55, R * 1.35, R * 1.1, 1.5); fillShaded(g, P, shade(P.hull, -0.05), -R, -R, R * 2, R * 2);
    g.fillStyle = rgb(P.dark); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(R * 0.5, -R * 0.36 + i * R * 0.24, R * 0.09, 0, 7); g.fill(); g.beginPath(); g.arc(R * 0.5 - (j + 1) * 0.1, -R * 0.36 + i * R * 0.24, R * 0.06, 0, 7); g.fill(); }
    teamStripe(g, P, -R * 0.7, -R * 0.5, R * 0.3, 1.4);
  };

  BODY.howitzer = (R) => (g, P) => {
    const L = R * 1.8, W = R * 1.5; tracks(g, P, L, W, W * 0.25, 4);
    hullPath(g, P.style, -L / 2, -W / 2 + 2.5, L, W - 5); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    // long barrel fixed forward with muzzle brake
    barrel(g, P, -R * 0.1, R * 1.25, 3.2, P.metalL, true);
    chamfer(g, -R * 0.6, -R * 0.55, R * 0.9, R * 1.1, 2); fillShaded(g, P, shade(P.hull, 0.08), -R, -R, R * 2, R * 2);
    g.fillStyle = rgb(P.dark); g.fillRect(-L / 2 - 2, -W * 0.35, 2.5, W * 0.7); // spade
    teamStripe(g, P, -R * 0.55, -R * 0.5, R * 0.3, 1.4);
  };
  BODY.siege = (R) => (g, P) => {
    const L = R * 1.9, W = R * 1.6; tracks(g, P, L, W, W * 0.25, 6);
    hullPath(g, 'bulky', -L / 2, -W / 2 + 2.5, L, W - 5); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    rivets(g, P, [[-L * 0.3, -W * 0.3], [0, -W * 0.3], [L * 0.3, -W * 0.3], [-L * 0.3, W * 0.3], [0, W * 0.3], [L * 0.3, W * 0.3]]);
    // fat mortar
    g.fillStyle = rgb(P.metal); g.beginPath(); g.arc(R * 0.1, 0, R * 0.55, 0, 7); g.fill(); g.strokeStyle = rgb(P.dark); g.lineWidth = 1; g.stroke();
    g.fillStyle = rgb(P.dark); g.beginPath(); g.arc(R * 0.1, 0, R * 0.32, 0, 7); g.fill();
    g.fillStyle = rgb(P.metalL, 0.5); g.beginPath(); g.arc(R * 0.0, -R * 0.12, R * 0.12, 0, 7); g.fill();
    teamStripe(g, P, -L * 0.45, -W * 0.38, L * 0.2, 1.6);
  };
  BODY.ew = (R) => (g, P) => {
    const L = R * 2.0, W = R * 1.45; wheels(g, P, L * 0.85, W, 3, 2.5);
    hullPath(g, 'sleek', -L / 2, -W / 2 + 1.5, L, W - 3); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    g.strokeStyle = rgb(P.accent, 0.8); g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-L * 0.4 + i * 3, -W * 0.3); g.lineTo(-L * 0.4 + i * 3, W * 0.3); g.stroke(); }
    teamStripe(g, P, L * 0.1, -W / 2 + 2, L * 0.3, 1.4);
  };
  TURRET.ew = (R) => (g, P) => {
    g.fillStyle = rgb(P.metalL); g.beginPath(); g.ellipse(0, 0, R * 0.25, R * 0.75, 0, 0, 7); g.fill(); g.strokeStyle = rgb(P.dark); g.lineWidth = 0.6; g.stroke();
    g.strokeStyle = rgb(P.metal); g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.4, 0); g.stroke();
    light(g, R * 0.4, 0, 2.5, P.glow || 'rgba(120,255,255,0.9)');
  };
  BODY.amph = (R) => (g, P) => {
    const L = R * 2.05, W = R * 1.5;
    g.fillStyle = rgb(P.dark, 0.85); rr(g, -L / 2, -W / 2, L, W, W * 0.45); g.fill();
    rr(g, -L / 2 + 2, -W / 2 + 2, L - 4, W - 4, W * 0.35); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    g.fillStyle = rgb(P.hullD); g.fillRect(-L * 0.25, -W * 0.25, L * 0.45, W * 0.5);
    g.fillStyle = rgb(P.metal); for (const s of [-1, 1]) { g.beginPath(); g.arc(-L / 2 + 3, s * W * 0.28, 2.6, 0, 7); g.fill(); }
    teamStripe(g, P, -L * 0.25, -W * 0.3, L * 0.45, 1.4);
    g.fillStyle = rgb(P.glass, 0.9); g.fillRect(L * 0.28, -W * 0.22, 2, W * 0.44);
  };
  TURRET.amph = TURRET.recon;
  BODY.citadel = (R) => (g, P) => {
    const L = R * 2.0, W = R * 1.7; tracks(g, P, L, W * 0.5, W * 0.12, 6); g.save(); g.translate(0, W * 0.25); tracks(g, P, L, W * 0.5, W * 0.12, 6); g.restore(); g.save(); g.translate(0, -W * 0.25); tracks(g, P, L, W * 0.5, W * 0.12, 6); g.restore();
    hullPath(g, P.style, -L / 2 + 2, -W / 2 + 4, L - 4, W - 8); fillShaded(g, P, P.hull, -L / 2, -W / 2, L, W);
    // SAM pods and deck
    for (const s of [-1, 1]) { rr(g, -L * 0.42, s * W * 0.28 - 3.5, 9, 7, 1.5); fillShaded(g, P, P.metal, -L, -W, L, W); g.fillStyle = rgb(P.dark); for (let i = 0; i < 3; i++) g.fillRect(-L * 0.42 + 1.5 + i * 2.6, s * W * 0.28 - 2, 1.6, 4); }
    g.fillStyle = rgb(P.hullD); g.fillRect(L * 0.3, -W * 0.3, 3, W * 0.6);
    teamStripe(g, P, -L * 0.1, -W / 2 + 4, L * 0.3, 2); teamStripe(g, P, -L * 0.1, W / 2 - 6, L * 0.3, 2);
    star(g, -L * 0.25, 0, 3.5, rgb(P.accent));
  };
  TURRET.citadel = (R) => tankTurret(R * 0.42, 2, R * 0.85, 4, { mg: true });
  BODY.colossus = (R) => (g, P) => {
    // four armored legs
    g.strokeStyle = rgb(P.metal); g.lineWidth = 5; g.lineCap = 'round';
    for (const [a, b] of [[0.7, 1], [-0.7, 1], [2.4, 1], [-2.4, 1]]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); g.stroke(); g.fillStyle = rgb(P.dark); g.beginPath(); g.arc(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 3.6, 0, 7); g.fill(); }
    hullPath(g, 'bulky', -R * 0.7, -R * 0.62, R * 1.4, R * 1.24); fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R);
    rivets(g, P, [[-R * 0.5, -R * 0.45], [R * 0.5, -R * 0.45], [-R * 0.5, R * 0.45], [R * 0.5, R * 0.45]]);
    teamStripe(g, P, -R * 0.6, -R * 0.55, R * 0.3, 2);
  };
  TURRET.colossus = (R) => tankTurret(R * 0.48, 1, R * 1.1, 6.5, {});

  // infantry squads: small soldiers in formation
  function squad(n, kind) {
    return (R) => (g, P) => {
      const pts = n === 4 ? [[3, -3.5], [3, 3.5], [-3.5, -2.5], [-3.5, 3]] : n === 3 ? [[3.5, 0], [-2.5, -4], [-2.5, 4]] : [[3, -3], [3, 3], [-3, 0]];
      g.scale(1.25, 1.25);
      for (const [x, y] of pts) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x - 0.5, y + 0.8, 2.6, 2.2, 0, 0, 7); g.fill();
        // weapon
        if (kind === 'at') { g.fillStyle = rgb(P.metal); rr(g, x - 3, y - 2.6, 7, 1.6, 0.6); g.fill(); g.fillStyle = rgb(P.dark); g.fillRect(x + 3.2, y - 2.7, 1, 1.8); }
        else { g.strokeStyle = rgb(P.dark); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y + 0.9); g.lineTo(x + 4.2, y + 0.6); g.stroke(); }
        // shoulders/body
        g.fillStyle = rgb(kind === 'ghost' ? shade(P.metal, -0.1) : shade(P.hull, -0.12)); g.beginPath(); g.ellipse(x, y, 1.6, 2.4, 0, 0, 7); g.fill();
        // helmet (team color)
        g.fillStyle = rgb(P.team); g.beginPath(); g.arc(x + 0.3, y, 1.35, 0, 7); g.fill();
        g.fillStyle = rgb(P.teamL, 0.7); g.beginPath(); g.arc(x, y - 0.4, 0.55, 0, 7); g.fill();
      }
    };
  }
  BODY.rifle = squad(4, 'rifle'); BODY.at_team = squad(3, 'at'); BODY.ghost = squad(3, 'ghost');

  // aircraft
  BODY.drone = (R) => (g, P) => {
    g.strokeStyle = rgb(P.metal); g.lineWidth = 1.6;
    for (const a of [0.78, 2.36, 3.93, 5.5]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke(); g.fillStyle = 'rgba(200,220,230,0.25)'; g.beginPath(); g.arc(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, R * 0.42, 0, 7); g.fill(); }
    rr(g, -R * 0.4, -R * 0.3, R * 0.85, R * 0.6, 2); fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R);
    g.fillStyle = rgb(P.team); g.fillRect(-R * 0.3, -1, R * 0.4, 2); light(g, R * 0.35, 0, 2.2, 'rgba(255,60,60,0.9)');
  };
  BODY.gunship = (R) => (g, P) => {
    // tail boom
    g.fillStyle = rgb(P.hullD); rr(g, -R * 1.05, -1.6, R * 1.0, 3.2, 1.2); g.fill();
    g.fillStyle = rgb(P.metal); g.fillRect(-R * 1.05, -4, 2, 8);
    // stub wings + rocket pods
    g.fillStyle = rgb(P.hullD); g.fillRect(-R * 0.15, -R * 0.75, R * 0.3, R * 1.5);
    for (const s of [-1, 1]) { rr(g, -R * 0.2, s * R * 0.7 - 2, R * 0.55, 4, 1.5); g.fillStyle = rgb(P.metal); g.fill(); }
    // fuselage
    g.beginPath(); g.ellipse(R * 0.1, 0, R * 0.6, R * 0.32, 0, 0, 7); fillShaded(g, P, P.hull, -R, -R * 0.4, 2 * R, R * 0.8);
    g.fillStyle = rgb(P.glass, 0.9); g.beginPath(); g.ellipse(R * 0.45, 0, R * 0.2, R * 0.18, 0, 0, 7); g.fill();
    teamStripe(g, P, -R * 0.35, -1, R * 0.3, 2);
  };
  BODY.fighter = (R) => (g, P) => {
    g.beginPath(); g.moveTo(R, 0); g.lineTo(R * 0.2, -R * 0.18); g.lineTo(-R * 0.2, -R * 0.95); g.lineTo(-R * 0.45, -R * 0.95); g.lineTo(-R * 0.35, -R * 0.2); g.lineTo(-R * 0.9, -R * 0.45); g.lineTo(-R * 0.95, 0);
    g.lineTo(-R * 0.9, R * 0.45); g.lineTo(-R * 0.35, R * 0.2); g.lineTo(-R * 0.45, R * 0.95); g.lineTo(-R * 0.2, R * 0.95); g.lineTo(R * 0.2, R * 0.18); g.closePath();
    fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R);
    g.fillStyle = rgb(P.glass, 0.9); g.beginPath(); g.ellipse(R * 0.45, 0, R * 0.2, R * 0.08, 0, 0, 7); g.fill();
    teamStripe(g, P, -R * 0.35, -R * 0.85, R * 0.18, R * 1.7);
  };
  BODY.bomber = (R) => (g, P) => {
    g.beginPath(); g.moveTo(R * 0.55, 0); g.lineTo(R * 0.1, -R * 0.12); g.lineTo(-R * 0.15, -R); g.lineTo(-R * 0.45, -R); g.lineTo(-R * 0.3, -R * 0.12); g.lineTo(-R * 0.85, -R * 0.12); g.lineTo(-R * 0.95, -R * 0.4); g.lineTo(-R, 0);
    g.lineTo(-R * 0.95, R * 0.4); g.lineTo(-R * 0.85, R * 0.12); g.lineTo(-R * 0.3, R * 0.12); g.lineTo(-R * 0.45, R); g.lineTo(-R * 0.15, R); g.lineTo(R * 0.1, R * 0.12); g.closePath();
    fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R);
    g.fillStyle = rgb(P.dark); for (const s of [-1, 1]) for (const k of [0.45, 0.75]) { rr(g, -R * 0.25, s * R * k - 1.5, R * 0.35, 3, 1.2); g.fill(); }
    g.fillStyle = rgb(P.glass, 0.9); g.fillRect(R * 0.35, -1.2, R * 0.12, 2.4);
    teamStripe(g, P, -R * 0.35, -R * 0.95, R * 0.12, R * 1.9);
  };
  BODY.aurora = (R) => (g, P) => {
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); } g.closePath(); fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R);
    g.beginPath(); g.arc(0, 0, R * 0.55, 0, 7); fillShaded(g, P, shade(P.hull, 0.12), -R, -R, 2 * R, 2 * R);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; light(g, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 4, P.glow || 'rgba(140,255,255,0.9)'); }
    light(g, 0, 0, R * 0.4, 'rgba(160,255,255,0.7)'); teamStripe(g, P, -R * 0.5, -1.5, R * 0.3, 3);
  };

  // naval
  function boatHull(g, P, L, W) {
    g.beginPath(); g.moveTo(L / 2, 0); g.quadraticCurveTo(L * 0.3, -W / 2, -L * 0.2, -W / 2); g.lineTo(-L / 2, -W * 0.42); g.lineTo(-L / 2, W * 0.42); g.lineTo(-L * 0.2, W / 2); g.quadraticCurveTo(L * 0.3, W / 2, L / 2, 0); g.closePath();
    fillShaded(g, P, shade(P.hull, -0.08), -L / 2, -W / 2, L, W);
    g.fillStyle = rgb(shade(P.metal, 0.15)); g.beginPath(); g.moveTo(L * 0.4, 0); g.quadraticCurveTo(L * 0.25, -W * 0.36, -L * 0.2, -W * 0.36); g.lineTo(-L * 0.45, -W * 0.3); g.lineTo(-L * 0.45, W * 0.3); g.lineTo(-L * 0.2, W * 0.36); g.quadraticCurveTo(L * 0.25, W * 0.36, L * 0.4, 0); g.fill();
  }
  BODY.patrol = (R) => (g, P) => { const L = R * 2.1, W = R * 0.95; boatHull(g, P, L, W); rr(g, -L * 0.18, -W * 0.24, L * 0.26, W * 0.48, 1.5); fillShaded(g, P, P.hull, -L, -W, L, W); g.fillStyle = rgb(P.glass, 0.9); g.fillRect(L * 0.03, -W * 0.18, 1.4, W * 0.36); teamStripe(g, P, -L * 0.42, -1, L * 0.18, 2); };
  TURRET.patrol = (R) => (g, P) => { barrel(g, P, 0, R * 0.7, 2, P.metalL, true); g.fillStyle = rgb(P.metal); g.beginPath(); g.arc(0, 0, R * 0.28, 0, 7); g.fill(); };
  BODY.missile_boat = (R) => (g, P) => { const L = R * 2.1, W = R * 1.0; boatHull(g, P, L, W); rr(g, -L * 0.3, -W * 0.24, L * 0.22, W * 0.48, 1.5); fillShaded(g, P, P.hull, -L, -W, L, W); teamStripe(g, P, -L * 0.45, -1, L * 0.14, 2); };
  TURRET.missile_boat = (R) => (g, P) => { rr(g, -R * 0.35, -R * 0.35, R * 0.75, R * 0.7, 1.5); fillShaded(g, P, P.metal, -R, -R, 2 * R, 2 * R); g.fillStyle = rgb(P.dark); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(R * 0.1 + j * 3, -R * 0.15 + i * R * 0.3, 1.1, 0, 7); g.fill(); } };
  BODY.destroyer = (R) => (g, P) => {
    const L = R * 2.2, W = R * 0.82; boatHull(g, P, L, W);
    rr(g, -L * 0.15, -W * 0.28, L * 0.3, W * 0.56, 2); fillShaded(g, P, P.hull, -L, -W, L, W);
    g.fillStyle = rgb(P.metalL); g.beginPath(); g.arc(-L * 0.02, 0, W * 0.16, 0, 7); g.fill();
    // rear turret (static) + VLS cells
    g.fillStyle = rgb(P.dark); for (let i = 0; i < 4; i++) g.fillRect(-L * 0.38 + (i % 2) * 2.5, -3 + Math.floor(i / 2) * 3.5, 2, 2.6);
    g.fillStyle = rgb(P.metal); g.beginPath(); g.arc(L * 0.22, 0, W * 0.18, 0, 7); g.fill();
    teamStripe(g, P, -L * 0.45, -1, L * 0.08, 2); light(g, -L * 0.02, 0, 2, 'rgba(255,90,90,0.8)');
  };
  TURRET.destroyer = (R) => (g, P) => { g.save(); for (const s of [-1, 1]) { g.save(); g.translate(0, s * 1.4); barrel(g, P, 0, R * 0.65, 1.6, P.metalL); g.restore(); } g.restore(); chamfer(g, -R * 0.28, -R * 0.24, R * 0.5, R * 0.48, 2); fillShaded(g, P, P.metal, -R, -R, 2 * R, 2 * R); };
  BODY.submarine = (R) => (g, P) => {
    const L = R * 2.1, W = R * 0.65; g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, 7); fillShaded(g, P, shade(P.metal, -0.15), -L / 2, -W / 2, L, W);
    rr(g, -L * 0.05, -W * 0.22, L * 0.18, W * 0.44, 2); fillShaded(g, P, P.hull, -L, -W, L, W);
    g.fillStyle = rgb(P.dark); g.fillRect(-L / 2 - 1, -W * 0.45, 2, W * 0.9); teamStripe(g, P, -L * 0.3, -1, L * 0.15, 2);
  };

  ART.hasTurret = (type) => !!TURRET[type];
  const ROTOR = { gunship: 1.1, drone: 0 };
  ART.rotor = (type) => ROTOR[type] || 0;

  ART.unitBody = function (type, faction, color, R) {
    const key = 'u|' + type + '|' + faction + '|' + color;
    const P = palette(faction, color);
    const f = (BODY[type] || BODY.med_tank)(R);
    return sprite(key, R * 1.35, (g) => f(g, P));
  };
  ART.unitTurret = function (type, faction, color, R) {
    if (!TURRET[type]) return null;
    const key = 't|' + type + '|' + faction + '|' + color;
    const P = palette(faction, color);
    const f = TURRET[type](R);
    return sprite(key, R * 1.6, (g) => f(g, P));
  };
  ART.shadowOf = function (type, faction, R) {
    const key = 's|' + type + '|' + faction;
    const P = palette(faction, 0);
    const f = (BODY[type] || BODY.med_tank)(R);
    return sprite(key, R * 1.35, (g) => { f(g, P); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(-R * 2, -R * 2, R * 4, R * 4); });
  };

  // ================================================================ BUILDINGS
  const BLD = {};
  function slab(g, P, w, h, col) {
    chamfer(g, 1, 1, w - 2, h - 2, 3); fillShaded(g, P, col || [98, 100, 96], 0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.6; for (let x = 6; x < w - 4; x += 8) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x, h - 3); g.stroke(); }
  }
  function roofBox(g, P, x, y, w, h, col, inset) {
    hullPath(g, P.style, x, y, w, h); fillShaded(g, P, col, x, y, w, h);
    if (inset !== false) { g.fillStyle = rgb(shade(col, -0.12)); hullPath(g, P.style, x + 3, y + 3, w - 6, h - 6); g.fill(); g.fillStyle = rgb(shade(col, 0.2), 0.6); g.fillRect(x + 3, y + 3, w - 6, 1.2); }
  }
  function vents(g, x, y, n) { g.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 0; i < n; i++) g.fillRect(x + i * 3, y, 1.6, 6); }
  function hazard(g, x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); for (let i = -h; i < w + h; i += 6) { g.fillStyle = '#e1b928'; g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + 3, y); g.lineTo(x + i + 3 - h, y + h); g.lineTo(x + i - h, y + h); g.fill(); } g.restore(); }

  BLD.hq = (g, P, w, h) => {
    slab(g, P, w, h, [84, 88, 84]);
    roofBox(g, P, 8, 8, w - 16, h - 16, P.hull);
    // central command dome
    const cx = w / 2, cy = h / 2; g.beginPath(); g.arc(cx, cy, w * 0.17, 0, 7); fillShaded(g, P, shade(P.hull, 0.12), cx - 20, cy - 20, 40, 40);
    star(g, cx, cy, w * 0.09, rgb(P.accent));
    // helipad corner
    g.fillStyle = 'rgba(30,30,30,0.85)'; g.beginPath(); g.arc(w - 18, h - 18, 10, 0, 7); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#e8e8e0'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w - 18, h - 17.5);
    // antenna + team flags
    g.strokeStyle = rgb(P.metalL); g.lineWidth = 1.2; g.beginPath(); g.moveTo(16, 16); g.lineTo(26, 26); g.stroke(); light(g, 16, 16, 3, 'rgba(255,60,60,0.9)');
    teamStripe(g, P, 10, h - 14, 22, 4); teamStripe(g, P, w - 32, 10, 22, 4);
    vents(g, 12, 30, 4); vents(g, w - 26, h - 46, 4);
  };
  BLD.extractor = (g, P, w, h) => {
    slab(g, P, w, h, [70, 66, 60]);
    // oil tanks
    for (const [x, y] of [[w * 0.27, h * 0.7], [w * 0.5, h * 0.78]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); fillShaded(g, P, [170, 166, 150], x - 7, y - 7, 14, 14); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.stroke(); }
    // pump base
    roofBox(g, P, w * 0.52, h * 0.18, w * 0.38, h * 0.32, P.hull, false);
    teamStripe(g, P, w * 0.55, h * 0.2, w * 0.3, 2.5);
    g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.2, h * 0.3); g.lineTo(w * 0.55, h * 0.3); g.stroke();
  };
  BLD.mine = (g, P, w, h) => {
    slab(g, P, w, h, [78, 70, 62]);
    // ore pile
    for (let i = 0; i < 9; i++) { const x = w * 0.25 + (i % 3) * 6, y = h * 0.62 + Math.floor(i / 3) * 5; g.fillStyle = i % 2 ? '#c98a4b' : '#9da3a8'; g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y); g.fill(); }
    roofBox(g, P, w * 0.45, h * 0.12, w * 0.45, h * 0.45, P.hull);
    g.fillStyle = '#2a2a2a'; g.fillRect(w * 0.18, h * 0.35, w * 0.32, 4); // conveyor
    g.strokeStyle = '#666'; g.lineWidth = 0.6; for (let x = w * 0.18; x < w * 0.5; x += 3) { g.beginPath(); g.moveTo(x, h * 0.35); g.lineTo(x, h * 0.35 + 4); g.stroke(); }
    teamStripe(g, P, w * 0.5, h * 0.48, w * 0.35, 2.5);
  };
  BLD.power = (g, P, w, h) => {
    slab(g, P, w, h, [86, 88, 90]);
    const cx = w * 0.38, cy = h * 0.42; g.beginPath(); g.arc(cx, cy, w * 0.27, 0, 7);
    const gr = g.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, w * 0.27); gr.addColorStop(0, '#d8d8d2'); gr.addColorStop(1, '#8c8c86'); g.fillStyle = gr; g.fill();
    g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(cx, cy, w * 0.17, 0, 7); g.fill();
    light(g, cx, cy, w * 0.15, P.glow ? P.glow : 'rgba(255,200,80,0.6)');
    roofBox(g, P, w * 0.6, h * 0.55, w * 0.32, h * 0.36, P.hull, false);
    teamStripe(g, P, w * 0.62, h * 0.58, w * 0.28, 2.5);
    g.fillStyle = '#ffd34a'; g.beginPath(); g.moveTo(w * 0.78, h * 0.64); g.lineTo(w * 0.72, h * 0.76); g.lineTo(w * 0.77, h * 0.76); g.lineTo(w * 0.73, h * 0.86); g.lineTo(w * 0.82, h * 0.72); g.lineTo(w * 0.77, h * 0.72); g.closePath(); g.fill();
  };
  BLD.barracks = (g, P, w, h) => {
    slab(g, P, w, h, [92, 90, 82]);
    roofBox(g, P, 5, 6, w - 10, h * 0.55, P.hull);
    g.strokeStyle = rgb(P.hullD); g.lineWidth = 1; for (let x = 10; x < w - 8; x += 6) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 6 + h * 0.55 - 2); g.stroke(); }
    g.fillStyle = '#222'; g.fillRect(w * 0.4, h * 0.62, w * 0.2, h * 0.12);
    // flag
    g.strokeStyle = '#ccc'; g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.8, h * 0.88); g.lineTo(w * 0.8, h * 0.66); g.stroke();
    g.fillStyle = rgb(P.team); g.fillRect(w * 0.8, h * 0.66, 8, 5);
    teamStripe(g, P, 8, h * 0.82, w * 0.4, 3);
  };
  BLD.factory = (g, P, w, h) => {
    slab(g, P, w, h, [82, 84, 82]);
    roofBox(g, P, 6, 6, w * 0.7, h - 12, P.hull);
    // roof ribs
    g.strokeStyle = rgb(P.hullD, 0.9); g.lineWidth = 1.2; for (let y = 14; y < h - 12; y += 7) { g.beginPath(); g.moveTo(10, y); g.lineTo(w * 0.7 + 2, y); g.stroke(); }
    // bay door
    g.fillStyle = '#1e1e1e'; g.fillRect(w * 0.76, h * 0.28, w * 0.18, h * 0.44); hazard(g, w * 0.76, h * 0.28, w * 0.18, 4); hazard(g, w * 0.76, h * 0.72 - 4, w * 0.18, 4);
    // chimneys
    for (const [x, y] of [[w * 0.18, h * 0.2], [w * 0.3, h * 0.2]]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fillStyle = '#555'; g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    teamStripe(g, P, 10, h - 16, w * 0.6, 4);
    star(g, w * 0.45, h * 0.55, 6, rgb(P.accent));
  };
  BLD.airfield = (g, P, w, h) => {
    g.fillStyle = '#3b3e40'; chamfer(g, 1, 1, w - 2, h - 2, 4); g.fill(); g.strokeStyle = '#222'; g.stroke();
    g.strokeStyle = '#e8e2c8'; g.lineWidth = 1.2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(8, h / 2); g.lineTo(w - 8, h / 2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#d8d0a0'; g.beginPath(); g.arc(w * 0.62, h * 0.5, 14, 0, 7); g.stroke();
    g.fillStyle = '#e8e2c8'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w * 0.62, h * 0.51);
    roofBox(g, P, 6, 6, w * 0.25, h * 0.3, P.hull, false); g.fillStyle = rgb(P.glass, 0.8); g.fillRect(8, 8, w * 0.25 - 4, 4);
    teamStripe(g, P, 6, h - 12, w - 12, 3); light(g, w - 8, 8, 3, 'rgba(80,255,120,0.9)'); light(g, w - 8, h - 8, 3, 'rgba(255,80,80,0.9)');
  };
  BLD.shipyard = (g, P, w, h) => {
    slab(g, P, w, h, [80, 82, 84]);
    g.fillStyle = 'rgba(30,70,100,0.85)'; g.fillRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
    g.strokeStyle = '#cbb874'; g.lineWidth = 1; g.strokeRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
    // gantry crane
    g.fillStyle = '#d8a826'; g.fillRect(w * 0.1, h * 0.45, w * 0.8, 4); g.fillRect(w * 0.1, h * 0.2, 4, h * 0.6); g.fillRect(w * 0.86, h * 0.2, 4, h * 0.6);
    roofBox(g, P, 4, 4, w * 0.3, h * 0.16, P.hull, false); teamStripe(g, P, w * 0.4, 5, w * 0.5, 3);
  };
  BLD.lab = (g, P, w, h) => {
    slab(g, P, w, h, [90, 92, 96]);
    const cx = w / 2, cy = h / 2; g.beginPath(); g.arc(cx, cy, w * 0.33, 0, 7);
    const gr = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, w * 0.33); gr.addColorStop(0, '#e0f2ff'); gr.addColorStop(0.6, rgb(P.hullL)); gr.addColorStop(1, rgb(P.hullD)); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; for (let a = 0; a < 6.28; a += 0.785) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * w * 0.33); g.stroke(); }
    light(g, cx, cy, 8, P.glow || 'rgba(140,220,255,0.9)'); teamStripe(g, P, 4, h - 8, w - 8, 3);
  };
  BLD.repair = (g, P, w, h) => {
    g.fillStyle = '#4a4d4f'; chamfer(g, 1, 1, w - 2, h - 2, 4); g.fill(); g.strokeStyle = '#222'; g.stroke();
    hazard(g, 3, 3, w - 6, 4); hazard(g, 3, h - 7, w - 6, 4);
    g.fillStyle = '#e8e8e0'; g.fillRect(w / 2 - 10, h / 2 - 3, 20, 6); g.fillRect(w / 2 - 3, h / 2 - 10, 6, 20);
    g.fillStyle = rgb(P.team); g.fillRect(w / 2 - 8, h / 2 - 1.8, 16, 3.6); g.fillRect(w / 2 - 1.8, h / 2 - 8, 3.6, 16);
    for (const [x, y] of [[8, 14], [w - 8, h - 14]]) { g.fillStyle = '#d8a826'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  };
  BLD.radar = (g, P, w, h) => { slab(g, P, w, h, [88, 90, 88]); roofBox(g, P, 8, 8, w - 16, h - 16, P.hull); teamStripe(g, P, 10, h - 14, w - 20, 3); };
  BLD.turret_mg = (g, P, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, 7); fillShaded(g, P, [104, 104, 98], 0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(w * 0.25, h * 0.45, w * 0.5, 2); };
  BLD.turret_gun = (g, P, w, h) => { chamfer(g, 1, 1, w - 2, h - 2, w * 0.28); fillShaded(g, P, [96, 98, 96], 0, 0, w, h); teamStripe(g, P, 4, h - 5, w - 8, 2); };
  BLD.turret_aa = (g, P, w, h) => { chamfer(g, 2, 2, w - 4, h - 4, w * 0.2); fillShaded(g, P, [92, 96, 100], 0, 0, w, h); hazard(g, 3, 3, w - 6, 2.5); };
  BLD.wall = (g, P, w, h) => {
    chamfer(g, 0.5, 0.5, w - 1, h - 1, 4); fillShaded(g, P, P.style === 'bulky' ? [120, 108, 96] : [126, 128, 122], 0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(4, 4, w - 8, 3); g.fillStyle = rgb(P.team, 0.7); g.fillRect(w / 2 - 3, h / 2 - 1.5, 6, 3);
  };
  BLD.silo = (g, P, w, h) => {
    slab(g, P, w, h, [70, 72, 74]);
    hazard(g, 4, 4, w - 8, h - 8); g.fillStyle = '#2d3033'; chamfer(g, 9, 9, w - 18, h - 18, 6); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke();
    light(g, w / 2, h / 2, 6, 'rgba(255,60,40,0.8)'); teamStripe(g, P, 4, h - 4, w - 8, 2);
  };

  // turrets/antennas on buildings
  const BTUR = {
    turret_mg: (R) => (g, P) => { barrel(g, P, 0, R * 1.2, 1.6, P.dark); g.save(); g.translate(0, 2.4); barrel(g, P, 0, R * 1.1, 1.6, P.dark); g.restore(); g.beginPath(); g.arc(0, 0, R * 0.5, 0, 7); fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R); },
    turret_gun: (R) => tankTurret(R * 0.62, 1, R * 1.35, 3.6, {}),
    turret_aa: (R) => (g, P) => { for (const s of [-1, 1]) { rr(g, -R * 0.3, s * R * 0.42 - 3, R * 1.0, 6, 1.5); fillShaded(g, P, P.metal, -R, -R, 2 * R, 2 * R); g.fillStyle = rgb(P.dark); g.beginPath(); g.arc(R * 0.65, s * R * 0.42, 1.6, 0, 7); g.fill(); } g.beginPath(); g.arc(0, 0, R * 0.42, 0, 7); fillShaded(g, P, P.hull, -R, -R, 2 * R, 2 * R); },
    radar: (R) => (g, P) => { g.fillStyle = rgb(P.metalL); g.beginPath(); g.ellipse(0, 0, R * 0.32, R * 0.95, 0, 0, 7); g.fill(); g.strokeStyle = rgb(P.dark); g.lineWidth = 0.8; g.stroke(); g.strokeStyle = rgb(P.metal); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.6, 0); g.stroke(); light(g, R * 0.6, 0, 2.5, 'rgba(255,90,90,0.9)'); },
    extractor: (R) => (g, P) => { g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.beginPath(); g.moveTo(-R * 0.8, 0); g.lineTo(R * 0.8, 0); g.stroke(); g.fillStyle = '#3a3a3a'; g.beginPath(); g.moveTo(R * 0.8, -3); g.lineTo(R * 1.15, 0); g.lineTo(R * 0.8, 3); g.fill(); g.fillStyle = '#e1b928'; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill(); },
  };
  ART.bldTurret = function (type, faction, color, R) {
    if (!BTUR[type]) return null;
    const key = 'bt|' + type + '|' + faction + '|' + color; const P = palette(faction, color);
    const f = BTUR[type](R); return sprite(key, R * 1.8, (g) => f(g, P));
  };
  ART.bld = function (type, faction, color) {
    const key = 'b|' + type + '|' + faction + '|' + color;
    if (cache.has(key)) return cache.get(key);
    const d = D.BUILDINGS[type]; const w = d.w * 32, h = d.h * 32;
    const c = mk(w * SS, h * SS); const g = c.getContext('2d'); g.scale(SS, SS); g.lineJoin = 'round';
    const P = palette(faction, color);
    // soft drop shadow
    g.fillStyle = 'rgba(0,0,0,0.25)'; chamfer(g, 3, 4, w - 3, h - 3, 6); g.fill();
    (BLD[type] || BLD.barracks)(g, P, w, h);
    const s = { img: c, w, h }; cache.set(key, s); return s;
  };
  /** Construction scaffold overlay for a building footprint. */
  ART.scaffold = function (w, h) {
    const key = 'sc|' + w + '|' + h; if (cache.has(key)) return cache.get(key);
    const c = mk(w * SS, h * SS); const g = c.getContext('2d'); g.scale(SS, SS);
    g.fillStyle = 'rgba(60,60,55,0.75)'; g.fillRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#d8b030'; g.lineWidth = 1.2; g.strokeRect(2, 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(220,190,90,0.55)'; g.lineWidth = 0.8;
    for (let i = -h; i < w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    const s = { img: c, w, h }; cache.set(key, s); return s;
  };

  // ================================================================ ICONS (for UI buttons) — rendered to data URLs
  ART.iconURL = function (kind, type, faction, color) {
    const key = 'ic|' + kind + '|' + type + '|' + faction + '|' + color;
    if (cache.has(key)) return cache.get(key);
    const size = 96; const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, size); bg.addColorStop(0, '#2b3530'); bg.addColorStop(1, '#141a17'); g.fillStyle = bg; g.fillRect(0, 0, size, size);
    if (kind === 'unit') {
      const d = D.UNITS[type]; const R = d.radius;
      const body = ART.unitBody(type, faction, color, R); const tur = ART.unitTurret(type, faction, color, R);
      const sc = Math.min(3.2, (size * 0.8) / (body.w)); g.translate(size / 2, size / 2); g.rotate(-Math.PI / 2 + (d.cls === 'air' ? 0 : -0.35)); g.scale(sc, sc);
      g.drawImage(body.img, -body.w / 2, -body.h / 2, body.w, body.h);
      if (tur) g.drawImage(tur.img, -tur.w / 2, -tur.h / 2, tur.w, tur.h);
    } else if (kind === 'bld') {
      const b = ART.bld(type, faction, color); const sc = Math.min((size * 0.82) / b.w, (size * 0.82) / b.h);
      g.translate(size / 2, size / 2); g.scale(sc, sc); g.drawImage(b.img, -b.w / 2, -b.h / 2, b.w, b.h);
      const t = ART.bldTurret(type, faction, color, Math.min(b.w, b.h) * 0.4); if (t) { g.rotate(-Math.PI / 4); g.drawImage(t.img, -t.w / 2, -t.h / 2, t.w, t.h); }
    }
    const url = c.toDataURL(); cache.set(key, url); return url;
  };

  // ================================================================ TERRAIN
  const TCOL = {
    0: [78, 104, 56], 1: [122, 102, 72], 2: [52, 78, 42], 3: [104, 100, 96], 4: [30, 66, 98], 5: [176, 160, 118], 6: [92, 80, 66], 7: [96, 88, 76], 8: [48, 98, 122],
  };
  ART.TCOL = TCOL;

  /** Build the base color image at 4px per tile with domain-warped tile lookup (organic terrain edges). */
  ART.BASE_RES = 4;
  ART.terrainBase = function (map) {
    const R = ART.BASE_RES; const W = map.w * R, H = map.h * R;
    const c = mk(W, H); const g = c.getContext('2d'); const img = g.createImageData(W, H);
    // smooth value noise for warping and tint
    const nz = (seed, sc) => { const gw = Math.ceil(W / sc) + 2, gh = Math.ceil(H / sc) + 2; const a = new Float32Array(gw * gh); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = s / 0x7fffffff; } return (x, y) => { x = Math.abs(x); y = Math.abs(y); const fx = x / sc, fy = y / sc; let ix = fx | 0, iy = fy | 0; let tx = fx - ix, ty = fy - iy; ix %= (gw - 1); iy %= (gh - 1); tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); const i = iy * gw + ix; return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + gw] * (1 - tx) + a[i + gw + 1] * tx) * ty; }; };
    const n1 = nz(7, 9), n2 = nz(13, 9), n3 = nz(29, 22), n4 = nz(31, 5);
    const d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = x + (n1(x, y) - 0.5) * R * 2.0 + (n4(x * 3, y * 3) - 0.5) * R * 0.6, wy = y + (n2(x, y) - 0.5) * R * 2.0 + (n4(y * 3 + 50, x * 3) - 0.5) * R * 0.6;
      const tx = Math.min(map.w - 1, Math.max(0, Math.floor(wx / R))), ty = Math.min(map.h - 1, Math.max(0, Math.floor(wy / R)));
      const i = ty * map.w + tx; const t = map.t[i];
      let col = TCOL[t];
      if (t === 2) col = TCOL[0]; // forest floor = grass, trees drawn on top
      if (t === 3) col = [96, 94, 86];
      const tint = (n3(x, y) - 0.5) * 22 + (n4(x, y) - 0.5) * 10;
      let r = col[0] + tint, gg = col[1] + tint * 1.1, b = col[2] + tint * 0.6;
      if (t === 2) { r -= 14; gg -= 10; b -= 8; }
      if (map.elev[i] && t !== 4 && t !== 8) { r += 12; gg += 12; b += 8; }
      const o = (y * W + x) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    // smooth elevation relief: blurred warped height field, lit from the north-west
    const E = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = x + (n1(x, y) - 0.5) * R * 2.0, wy = y + (n2(x, y) - 0.5) * R * 2.0;
      const tx = Math.min(map.w - 1, Math.max(0, Math.floor(wx / R))), ty = Math.min(map.h - 1, Math.max(0, Math.floor(wy / R)));
      E[y * W + x] = map.elev[ty * map.w + tx];
    }
    const blurE = (src, rad) => {
      const tmp = new Float32Array(src.length), out = new Float32Array(src.length); const n = 2 * rad + 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -rad; k <= rad; k++) a += src[y * W + Math.min(W - 1, Math.max(0, x + k))]; tmp[y * W + x] = a / n; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -rad; k <= rad; k++) a += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x]; out[y * W + x] = a / n; }
      return out;
    };
    let Eb = blurE(E, 3); Eb = blurE(Eb, 2);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const gx = Eb[y * W + x + 1] - Eb[y * W + x - 1], gy = Eb[(y + 1) * W + x] - Eb[(y - 1) * W + x];
      const light = -(gx + gy) * 110; // NW light
      const o = (y * W + x) * 4; d[o] += light; d[o + 1] += light; d[o + 2] += light * 0.8;
    }
    // separable box blur (radius 1) to soften transitions further
    const tmp = new Uint8ClampedArray(d.length);
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? d : tmp, dst = pass === 0 ? tmp : d;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0, n = 0;
          for (let k = -1; k <= 1; k++) { const xx = pass === 0 ? x + k : x, yy = pass === 0 ? y : y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; sum += src[(yy * W + xx) * 4 + ch]; n++; }
          dst[o + ch] = sum / n;
        }
        dst[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };

  let grain = null;
  function grainPattern() {
    if (grain) return grain;
    const c = mk(128, 128); const g = c.getContext('2d'); const img = g.createImageData(128, 128);
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 128 * 128; i++) { const v = rnd() * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 26; }
    g.putImageData(img, 0, 0); grain = c; return grain;
  }

  /** Render one terrain chunk (cx,cy in chunk units of size CH tiles) to a canvas at 1px = 1 world px. */
  ART.terrainChunk = function (map, base, cx, cy, CH, deposits) {
    const T = WF.T; const px = CH * 32;
    const c = mk(px, px); const g = c.getContext('2d');
    const tx0 = cx * CH, ty0 = cy * CH;
    // smooth blended base (bilinear upscale of 1px/tile map)
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const BR = ART.BASE_RES, sx0 = Math.max(0, tx0 * BR - 2), sy0 = Math.max(0, ty0 * BR - 2);
    const sw = Math.min(base.width - sx0, CH * BR + 4), sh = Math.min(base.height - sy0, CH * BR + 4);
    const k = 32 / BR;
    g.drawImage(base, sx0, sy0, sw, sh, (sx0 - tx0 * BR) * k, (sy0 - ty0 * BR) * k, sw * k, sh * k);
    // grain texture
    const gp = g.createPattern(grainPattern(), 'repeat'); g.fillStyle = gp; g.globalCompositeOperation = 'overlay'; g.fillRect(0, 0, px, px); g.globalCompositeOperation = 'source-over';
    const rnd = (i, k) => { let x = (map.deco[i] * 374761393 + k * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    for (let ty = ty0 - 1; ty < ty0 + CH + 1; ty++) for (let tx = tx0 - 1; tx < tx0 + CH + 1; tx++) {
      if (!map.inb(tx, ty)) continue;
      const i = map.idx(tx, ty), t = map.t[i]; const x = (tx - tx0) * 32, y = (ty - ty0) * 32;
      if (t === T.GRASS) {
        if (rnd(i, 1) < 0.5) { g.fillStyle = 'rgba(140,170,90,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(x + rnd(i, k + 2) * 30, y + rnd(i, k + 9) * 30, 1.2, 2.5); }
        if (rnd(i, 3) < 0.05) { g.fillStyle = 'rgba(230,220,120,0.6)'; g.fillRect(x + rnd(i, 4) * 28, y + rnd(i, 5) * 28, 2, 2); }
      } else if (t === T.DIRT || t === T.ROAD) {
        g.fillStyle = 'rgba(60,45,30,0.25)'; for (let k = 0; k < 5; k++) g.fillRect(x + rnd(i, k) * 30, y + rnd(i, k + 7) * 30, 2, 1.5);
        if (t === T.ROAD) { g.fillStyle = 'rgba(210,200,170,0.14)'; for (let k = 0; k < 6; k++) g.fillRect(x + rnd(i, k + 20) * 30, y + rnd(i, k + 30) * 30, 1.5, 1.5); }
      } else if (t === T.SAND) {
        g.fillStyle = 'rgba(255,240,200,0.18)'; for (let k = 0; k < 4; k++) g.fillRect(x + rnd(i, k) * 30, y + rnd(i, k + 5) * 30, 3, 1);
      } else if (t === T.WATER || t === T.SHALLOW) {
        g.strokeStyle = t === T.SHALLOW ? 'rgba(200,240,255,0.18)' : 'rgba(160,210,240,0.12)'; g.lineWidth = 1;
        for (let k = 0; k < 2; k++) { const wx = x + rnd(i, k) * 26, wy = y + rnd(i, k + 3) * 28; g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 4, wy - 2, wx + 8, wy); g.stroke(); }
      } else if (t === T.BRIDGE) {
        g.fillStyle = '#5d4a36'; g.fillRect(x, y, 32, 32);
        g.strokeStyle = '#3d2f22'; g.lineWidth = 1; for (let k = 0; k < 32; k += 5) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + 32); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y, 32, 3);
        // rails along edges adjacent to water
        g.fillStyle = '#8a8a84';
        if (map.inb(tx, ty - 1) && (map.t[i - map.w] === T.WATER || map.t[i - map.w] === T.SHALLOW)) g.fillRect(x, y, 32, 2.5);
        if (map.inb(tx, ty + 1) && (map.t[i + map.w] === T.WATER || map.t[i + map.w] === T.SHALLOW)) g.fillRect(x, y + 29.5, 32, 2.5);
        if (map.inb(tx - 1, ty) && (map.t[i - 1] === T.WATER || map.t[i - 1] === T.SHALLOW)) g.fillRect(x, y, 2.5, 32);
        if (map.inb(tx + 1, ty) && (map.t[i + 1] === T.WATER || map.t[i + 1] === T.SHALLOW)) g.fillRect(x + 29.5, y, 2.5, 32);
      }
    }
    // deposits (under trees/rocks)
    for (const d of deposits) {
      if (d.tx < tx0 - 2 || d.ty < ty0 - 2 || d.tx > tx0 + CH + 1 || d.ty > ty0 + CH + 1) continue;
      const x = (d.tx - tx0) * 32 + 32, y = (d.ty - ty0) * 32 + 32;
      if (d.kind === 'oil') {
        const gr = g.createRadialGradient(x, y, 2, x, y, 28); gr.addColorStop(0, 'rgba(10,8,8,0.95)'); gr.addColorStop(0.7, 'rgba(20,16,14,0.7)'); gr.addColorStop(1, 'rgba(20,16,14,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 28, 22, 0.3, 0, 7); g.fill();
        g.strokeStyle = 'rgba(120,90,200,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x - 4, y - 3, 10, 6, 0.3, 0, 7); g.stroke();
        g.strokeStyle = 'rgba(60,200,180,0.25)'; g.beginPath(); g.ellipse(x + 5, y + 4, 7, 4, 0.3, 0, 7); g.stroke();
      } else {
        for (let k = 0; k < 11; k++) {
          const a = k * 2.4, r = 6 + (k % 4) * 5; const ox = x + Math.cos(a) * r, oy = y + Math.sin(a) * r * 0.8; const s = 4 + (k % 3) * 2;
          g.fillStyle = k % 3 === 0 ? '#c98a4b' : k % 3 === 1 ? '#a6adb3' : '#8a6a4a';
          g.beginPath(); g.moveTo(ox, oy - s); g.lineTo(ox + s * 0.9, oy - s * 0.2); g.lineTo(ox + s * 0.5, oy + s * 0.8); g.lineTo(ox - s * 0.7, oy + s * 0.6); g.lineTo(ox - s * 0.9, oy - s * 0.3); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(ox, oy - s); g.lineTo(ox + s * 0.9, oy - s * 0.2); g.lineTo(ox, oy); g.fill();
        }
      }
    }
    // rocks and trees (extend beyond tile => draw after base for all tiles)
    for (let ty = ty0 - 1; ty < ty0 + CH + 1; ty++) for (let tx = tx0 - 1; tx < tx0 + CH + 1; tx++) {
      if (!map.inb(tx, ty)) continue;
      const i = map.idx(tx, ty), t = map.t[i]; const x = (tx - tx0) * 32, y = (ty - ty0) * 32;
      if (t === T.ROCK) {
        for (let k = 0; k < 3; k++) {
          const ox = x + 6 + rnd(i, k) * 20, oy = y + 6 + rnd(i, k + 4) * 20, s = 9 + rnd(i, k + 8) * 8;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(ox + 3, oy + 4, s, s * 0.8, 0, 0, 7); g.fill();
          const col = shade([118, 112, 104], (rnd(i, k + 12) - 0.5) * 0.3);
          g.fillStyle = rgb(col); g.beginPath();
          for (let q = 0; q < 7; q++) { const a = q / 7 * Math.PI * 2, r = s * (0.75 + rnd(i, q + k * 7) * 0.35); g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.85); } g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(ox - s * 0.25, oy - s * 0.3, s * 0.45, s * 0.3, -0.5, 0, 7); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ox - s * 0.4, oy + s * 0.1); g.lineTo(ox + s * 0.3, oy - s * 0.1); g.stroke();
        }
      } else if (t === T.FOREST) {
        for (let k = 0; k < 3; k++) {
          const ox = x + 5 + rnd(i, k) * 22, oy = y + 5 + rnd(i, k + 4) * 22, r = 8 + rnd(i, k + 8) * 6;
          g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.arc(ox + 4, oy + 5, r, 0, 7); g.fill();
          const dark = rnd(i, k + 11) < 0.5;
          const gr = g.createRadialGradient(ox - r * 0.35, oy - r * 0.35, 1, ox, oy, r);
          gr.addColorStop(0, dark ? '#4f7a3a' : '#5f8f42'); gr.addColorStop(0.7, dark ? '#2f5226' : '#3a6a2c'); gr.addColorStop(1, '#203a1a');
          g.fillStyle = gr; g.beginPath();
          for (let q = 0; q < 9; q++) { const a = q / 9 * Math.PI * 2, rr2 = r * (0.85 + rnd(i, q + 20) * 0.2); g.lineTo(ox + Math.cos(a) * rr2, oy + Math.sin(a) * rr2); } g.closePath(); g.fill();
        }
      }
    }
    return c;
  };

  /** Minimap terrain image (2px per tile). */
  ART.minimapBase = function (map) {
    const c = mk(map.w * 2, map.h * 2); const g = c.getContext('2d'); const img = g.createImageData(map.w * 2, map.h * 2);
    for (let y = 0; y < map.h * 2; y++) for (let x = 0; x < map.w * 2; x++) {
      const i = ((y >> 1) * map.w + (x >> 1)); let col = TCOL[map.t[i]]; if (map.t[i] === 2) col = [40, 70, 34]; if (map.elev[i] && map.t[i] !== 4) col = shade(col, 0.15);
      const o = (y * map.w * 2 + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const d of map.deposits) { g.fillStyle = d.kind === 'oil' ? '#111' : '#c98a4b'; g.fillRect(d.tx * 2, d.ty * 2, 4, 4); }
    return c;
  };

  ART.clear = () => cache.clear();
  WF.ART = ART;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
