/* WARFRONT: DOMINION v2 — structure sprites: pseudo-3D extruded buildings lit from the north-west,
 * concrete foundations, roof machinery, emblems; plus turret/radar/pump parts and FX anchors. */
(function (WF) {
  'use strict';
  const D = WF.D, ART = WF.ART, P2 = ART.P2, L = ART.L, rgb = ART.rgb, shade = ART.shade, mix = ART.mix;
  const BLD = {};

  function concrete(g, w, h, col, seed) {
    P2.chamfer(g, 1, 1, w - 2, h - 2, 4); L.fill(g, col || [104, 106, 100], [0, 0, w, h], { bevel: 1.6 });
    let s = seed || 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.save(); P2.chamfer(g, 1, 1, w - 2, h - 2, 4); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.5;
    for (let x = 8; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 8; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = 0; i < w * h / 60; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1); }
    g.strokeStyle = 'rgba(30,25,20,0.25)'; g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 8 - 4, y + rnd() * 8); g.stroke(); }
    g.restore();
  }
  /** Extruded block: walls visible on south and east, roof on top. Height in px. */
  function block(g, P, x, y, w, h, ht, roof, opt) {
    opt = opt || {};
    const wallCol = shade(roof, -0.42), wallCol2 = shade(roof, -0.25);
    // south wall
    g.beginPath(); g.moveTo(x, y + h - ht); g.lineTo(x + w - ht * 0.0, y + h - ht); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
    // full extrusion polygon (south + east faces)
    P2.poly(g, [[x + w - ht, y], [x + w, y + ht * 0.5], [x + w, y + h], [x, y + h], [x, y + h - ht * 0.0]]);
    g.fillStyle = rgb(wallCol); g.fillRect(x, y + h - ht, w, ht);
    g.fillStyle = rgb(wallCol2); g.fillRect(x + w - ht * 0.5, y, ht * 0.5, h);
    // windows / panel seams on south wall
    if (opt.windows) { g.fillStyle = rgb(P.glass, 0.75); for (let wx = x + 3; wx < x + w - 4; wx += 5) g.fillRect(wx, y + h - ht + 1.2, 2.4, Math.max(1, ht - 2.4)); }
    else { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.4; for (let wx = x + 4; wx < x + w; wx += 6) { g.beginPath(); g.moveTo(wx, y + h - ht); g.lineTo(wx, y + h); g.stroke(); } }
    // roof
    const rx = x, ry = y, rw = w - ht * 0.5, rh = h - ht;
    if (opt.round) { g.beginPath(); g.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, 7); }
    else P2.hull(g, P.style === 'sleek' ? 'sleek' : 'bulky', rx, ry, rw, rh);
    L.fill(g, roof, [rx, ry, rw, rh], { bevel: 2 });
    return { x: rx, y: ry, w: rw, h: rh };
  }
  function ac(g, x, y, s) { L.box(g, x, y, s, s, [150, 152, 148]); g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.32, 0, 7); g.fill(); g.strokeStyle = '#777'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(x + s * 0.2, y + s / 2); g.lineTo(x + s * 0.8, y + s / 2); g.moveTo(x + s / 2, y + s * 0.2); g.lineTo(x + s / 2, y + s * 0.8); g.stroke(); }
  function pipe(g, pts, wd, col) { g.lineCap = 'round'; g.strokeStyle = rgb(shade(col, -0.45)); g.lineWidth = wd + 0.8; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.strokeStyle = rgb(col); g.lineWidth = wd; g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = wd * 0.3; g.stroke(); }
  function hazard(g, x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#1d1d1d'; g.fillRect(x, y, w, h); for (let i = -h; i < w + h; i += 5) { g.fillStyle = '#e1b928'; P2.poly(g, [[x + i, y], [x + i + 2.5, y], [x + i + 2.5 - h, y + h], [x + i - h, y + h]]); g.fill(); } g.restore(); }
  function emblem(g, P, x, y, r) {
    g.beginPath(); g.arc(x, y, r * 1.35, 0, 7); g.fillStyle = rgb(P.teamD); g.fill(); g.strokeStyle = rgb(P.accent); g.lineWidth = 0.8; g.stroke();
    g.fillStyle = rgb(P.accent);
    if (P.faction === 'vortex') { g.strokeStyle = rgb(P.accent); g.lineWidth = 0.9; g.beginPath(); g.arc(x, y, r * 0.75, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.3, 0, 7); g.fill(); }
    else if (P.faction === 'iron') { P2.poly(g, [[x, y - r], [x + r * 0.9, y], [x, y + r], [x - r * 0.9, y]]); g.fill(); g.fillStyle = rgb(P.teamD); g.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6); }
    else { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  }
  function roofCol(P) { return mix(shade(P.hull, 0.05), [120, 122, 118], 0.25); }

  BLD.hq = (g, P, w, h) => {
    concrete(g, w, h, [96, 98, 94], 11);
    hazard(g, 4, h - 7, 20, 3);
    const r = block(g, P, 7, 6, w - 14, h - 13, 6, roofCol(P), { windows: true });
    // central command dome
    const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.48;
    g.beginPath(); g.arc(cx, cy, r.w * 0.22, 0, 7); L.fill(g, shade(P.hull, 0.15), [cx - 20, cy - 20, 40, 40], { bevel: 3 });
    g.beginPath(); g.arc(cx, cy, r.w * 0.22, 0, 7); const gl = g.createRadialGradient(cx - 6, cy - 7, 1, cx, cy, r.w * 0.22); gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fill();
    emblem(g, P, cx, cy, r.w * 0.09);
    // roof machinery
    ac(g, r.x + 4, r.y + 4, 7); ac(g, r.x + 13, r.y + 4, 7);
    L.grille(g, r.x + r.w - 16, r.y + 4, 11, 6, 5, true);
    pipe(g, [[r.x + 6, r.y + r.h - 6], [r.x + 20, r.y + r.h - 6], [r.x + 20, r.y + r.h - 14]], 1.6, [140, 140, 136]);
    // helipad
    const hx = r.x + r.w - 13, hy = r.y + r.h - 13;
    g.beginPath(); g.arc(hx, hy, 9, 0, 7); g.fillStyle = '#2a2d2f'; g.fill(); g.strokeStyle = '#e8e2c8'; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = '#e8e2c8'; g.fillRect(hx - 3.5, hy - 4, 1.4, 8); g.fillRect(hx + 2.1, hy - 4, 1.4, 8); g.fillRect(hx - 3.5, hy - 0.7, 7, 1.4);
    L.antenna(g, r.x + r.w - 5, r.y + 5, 10, -Math.PI * 0.75);
    L.stripe(g, P, r.x + 3, r.y + r.h - 4, 22, 2.5);
  };
  BLD.extractor = (g, P, w, h) => {
    concrete(g, w, h, [86, 82, 76], 21);
    // oil tanks (cylinders seen from above)
    for (const [x, y, r] of [[w * 0.25, h * 0.72, 8], [w * 0.52, h * 0.8, 6]]) {
      g.beginPath(); g.arc(x + 1.5, y + 1.8, r, 0, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, 7); L.fill(g, [178, 172, 156], [x - r, y - r, 2 * r, 2 * r], { bevel: 2 });
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.5; g.beginPath(); g.arc(x, y, r * 0.65, 0, 7); g.stroke();
      g.fillStyle = rgb(P.team); g.fillRect(x - r * 0.7, y - 1, r * 1.4, 2);
    }
    pipe(g, [[w * 0.25, h * 0.6], [w * 0.25, h * 0.45], [w * 0.6, h * 0.45]], 1.6, [110, 110, 105]);
    const r = block(g, P, w * 0.52, h * 0.12, w * 0.4, h * 0.36, 4, roofCol(P));
    L.grille(g, r.x + 3, r.y + 3, r.w - 6, 4, 6, true);
    L.stripe(g, P, r.x + 2, r.y + r.h - 4, r.w - 4, 2);
  };
  BLD.mine = (g, P, w, h) => {
    concrete(g, w, h, [92, 84, 74], 31);
    // ore heap
    for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = 3 + (i % 4) * 2.4; const x = w * 0.28 + Math.cos(a) * rr, y = h * 0.68 + Math.sin(a) * rr * 0.7, s = 2.5 + (i % 3);
      g.fillStyle = i % 3 === 0 ? '#c98a4b' : i % 3 === 1 ? '#a8afb5' : '#7d5f42'; P2.poly(g, [[x, y - s], [x + s, y - s * 0.2], [x + s * 0.5, y + s * 0.8], [x - s * 0.7, y + s * 0.6], [x - s, y - s * 0.3]]); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)'; P2.poly(g, [[x, y - s], [x + s, y - s * 0.2], [x, y]]); g.fill(); }
    const r = block(g, P, w * 0.46, h * 0.1, w * 0.46, h * 0.46, 5, roofCol(P));
    L.grille(g, r.x + 3, r.y + 3, 8, r.h - 6, 4, false);
    // conveyor
    g.save(); g.translate(w * 0.18, h * 0.42); g.rotate(-0.25); g.fillStyle = '#262626'; g.fillRect(0, 0, w * 0.34, 4); g.strokeStyle = '#6a6a6a'; g.lineWidth = 0.4; for (let x = 0; x < w * 0.34; x += 2.2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 4); g.stroke(); } g.restore();
    L.stripe(g, P, r.x + 2, r.y + r.h - 4, r.w - 4, 2);
  };
  BLD.power = (g, P, w, h) => {
    concrete(g, w, h, [100, 102, 104], 41);
    // cooling tower (hyperboloid from above)
    const cx = w * 0.38, cy = h * 0.42, R = w * 0.29;
    g.beginPath(); g.arc(cx + 2, cy + 2.5, R, 0, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); const gr = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R); gr.addColorStop(0, '#e6e6e0'); gr.addColorStop(0.7, '#a8a8a2'); gr.addColorStop(1, '#6e6e68'); g.fillStyle = gr; g.fill();
    g.beginPath(); g.arc(cx, cy, R * 0.66, 0, 7); g.fillStyle = '#2f3134'; g.fill();
    const ig = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.66); ig.addColorStop(0, P.glow ? P.glow.replace(/[\d.]+\)$/, '0.55)') : 'rgba(255,190,80,0.45)'); ig.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ig; g.fill();
    g.strokeStyle = rgb(P.team); g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R * 0.86, 0.3, 1.6); g.stroke();
    const r = block(g, P, w * 0.6, h * 0.55, w * 0.33, h * 0.37, 4, roofCol(P));
    // lightning sign
    g.fillStyle = '#ffd34a'; P2.poly(g, [[r.x + r.w * 0.6, r.y + 2], [r.x + r.w * 0.3, r.y + r.h * 0.55], [r.x + r.w * 0.5, r.y + r.h * 0.55], [r.x + r.w * 0.35, r.y + r.h - 2], [r.x + r.w * 0.75, r.y + r.h * 0.4], [r.x + r.w * 0.55, r.y + r.h * 0.4]]); g.fill();
    pipe(g, [[cx + R * 0.7, cy + R * 0.7], [r.x + 2, r.y + 4]], 1.5, [140, 140, 136]);
    // transformer
    L.box(g, w * 0.1, h * 0.8, 8, 5, [90, 92, 96]); g.strokeStyle = '#ddd'; g.lineWidth = 0.4; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w * 0.1 + 2 + i * 2, h * 0.8); g.lineTo(w * 0.1 + 2 + i * 2, h * 0.8 - 2); g.stroke(); }
  };
  BLD.barracks = (g, P, w, h) => {
    concrete(g, w, h, [104, 100, 90], 51);
    const r = block(g, P, 5, 5, w - 10, h * 0.58, 5, roofCol(P), { windows: true });
    // corrugated roof
    g.save(); P2.rr(g, r.x, r.y, r.w, r.h, 2); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.7; for (let x = r.x + 2; x < r.x + r.w; x += 2.6) { g.beginPath(); g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); g.stroke(); } g.restore();
    L.stripe(g, P, r.x + 2, r.y + r.h - 4, r.w - 4, 2.2);
    // training yard
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.6; g.strokeRect(6, h * 0.72, w * 0.5, h * 0.2);
    for (let i = 0; i < 3; i++) { L.box(g, 9 + i * 7, h * 0.76, 4, 4, [120, 110, 80]); }
    // flag pole
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w * 0.82 + 1, h * 0.7, 1, 16);
    g.strokeStyle = '#d0d0d0'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(w * 0.82, h * 0.9); g.lineTo(w * 0.82, h * 0.66); g.stroke();
    g.fillStyle = rgb(P.team); P2.poly(g, [[w * 0.82, h * 0.66], [w * 0.82 + 9, h * 0.67], [w * 0.82 + 8, h * 0.72], [w * 0.82, h * 0.73]]); g.fill();
    emblem(g, P, w * 0.82 + 4, h * 0.695, 1.4);
  };
  BLD.factory = (g, P, w, h) => {
    concrete(g, w, h, [96, 98, 96], 61);
    const r = block(g, P, 5, 5, w * 0.72, h - 12, 7, roofCol(P));
    // saw-tooth roof with skylights
    g.save(); P2.rr(g, r.x, r.y, r.w, r.h, 2); g.clip();
    for (let y = r.y + 4; y < r.y + r.h - 2; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 7); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(r.x, y, r.w, 7); g.fillStyle = rgb(P.glass, 0.55); g.fillRect(r.x + 4, y + 0.8, r.w - 8, 1.6); }
    g.restore();
    // bay door
    const dx = r.x + r.w + 4, dy = h * 0.28; g.fillStyle = '#151617'; g.fillRect(dx, dy, w - dx - 4, h * 0.44);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.5; for (let y = dy + 2; y < dy + h * 0.44; y += 2.5) { g.beginPath(); g.moveTo(dx, y); g.lineTo(w - 4, y); g.stroke(); }
    hazard(g, dx, dy - 4, w - dx - 4, 3.5); hazard(g, dx, dy + h * 0.44 + 0.5, w - dx - 4, 3.5);
    // chimneys
    for (const [x, y] of [[r.x + 10, r.y + 9], [r.x + 22, r.y + 9]]) { g.beginPath(); g.arc(x, y, 4.2, 0, 7); L.fill(g, [110, 106, 100], [x - 4, y - 4, 8, 8], { bevel: 1.2 }); g.fillStyle = '#0d0d0d'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); g.fillStyle = '#c33'; g.fillRect(x - 4.2, y - 0.6, 8.4, 1.2); }
    ac(g, r.x + r.w - 14, r.y + r.h - 14, 9);
    emblem(g, P, r.x + r.w * 0.55, r.y + r.h * 0.55, 5);
    L.stripe(g, P, r.x + 4, r.y + r.h - 5, r.w * 0.4, 2.5);
  };
  BLD.airfield = (g, P, w, h) => {
    P2.chamfer(g, 1, 1, w - 2, h - 2, 4); L.fill(g, [58, 61, 64], [0, 0, w, h], { bevel: 1.4 });
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.5; for (let x = 6; x < w; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = '#e8e2c8'; g.lineWidth = 1.2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(8, h / 2); g.lineTo(w - 8, h / 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.45 + i * 5, h / 2 - 3 + (i % 2), 4, 1.3); // tire marks
    g.strokeStyle = '#e1b928'; g.lineWidth = 1.3; g.beginPath(); g.arc(w * 0.64, h * 0.5, 14, 0, 7); g.stroke();
    g.fillStyle = '#e8e2c8'; g.fillRect(w * 0.64 - 6, h * 0.5 - 7, 2.2, 14); g.fillRect(w * 0.64 + 3.8, h * 0.5 - 7, 2.2, 14); g.fillRect(w * 0.64 - 6, h * 0.5 - 1.1, 12, 2.2);
    const r = block(g, P, 5, 5, w * 0.27, h * 0.3, 6, roofCol(P), { windows: true });
    g.beginPath(); g.arc(r.x + r.w * 0.5, r.y + r.h * 0.5, 4, 0, 7); g.fillStyle = rgb(P.glass, 0.9); g.fill();
    L.stripe(g, P, 6, h - 10, w - 12, 2.5);
    for (let i = 0; i < 5; i++) { L.lightDot(g, 8 + i * (w - 16) / 4, 6, 'rgba(120,255,140,1)', 0.7); L.lightDot(g, 8 + i * (w - 16) / 4, h - 5, 'rgba(255,90,80,1)', 0.7); }
  };
  BLD.shipyard = (g, P, w, h) => {
    concrete(g, w, h, [92, 94, 96], 71);
    g.fillStyle = '#163248'; g.fillRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
    const wg = g.createLinearGradient(0, h * 0.22, 0, h * 0.78); wg.addColorStop(0, 'rgba(120,190,230,0.35)'); wg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = wg; g.fillRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
    g.strokeStyle = '#cbb874'; g.lineWidth = 1; g.strokeRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
    // gantry crane
    for (const x of [w * 0.1, w * 0.86]) { L.box(g, x, h * 0.16, 4, h * 0.68, [212, 168, 40]); }
    L.box(g, w * 0.08, h * 0.45, w * 0.84, 4, [226, 182, 44]);
    g.strokeStyle = 'rgba(80,60,10,0.7)'; g.lineWidth = 0.4; for (let x = w * 0.1; x < w * 0.9; x += 3) { g.beginPath(); g.moveTo(x, h * 0.45); g.lineTo(x + 1.5, h * 0.45 + 4); g.stroke(); }
    L.box(g, w * 0.48, h * 0.42, 7, 10, [70, 70, 70]);
    const r = block(g, P, 4, 3, w * 0.32, h * 0.14, 3, roofCol(P), { windows: true });
    L.stripe(g, P, w * 0.42, 4, w * 0.5, 2.5);
  };
  BLD.lab = (g, P, w, h) => {
    concrete(g, w, h, [100, 104, 108], 81);
    const cx = w / 2, cy = h * 0.46, R = w * 0.34;
    g.beginPath(); g.arc(cx + 2, cy + 2.5, R, 0, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(cx, cy, R, 0, 7);
    const gr = g.createRadialGradient(cx - R * 0.45, cy - R * 0.45, 1, cx, cy, R); gr.addColorStop(0, '#f2fbff'); gr.addColorStop(0.45, rgb(mix(P.glass, P.team, 0.3))); gr.addColorStop(1, rgb(shade(P.hull, -0.3))); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.5;
    for (let a = 0; a < 6.28; a += 0.628) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    for (const k of [0.4, 0.75]) { g.beginPath(); g.arc(cx, cy, R * k, 0, 7); g.stroke(); }
    L.glow(g, cx, cy, R * 0.5, P.glow || 'rgba(150,220,255,0.75)');
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.strokeStyle = rgb(P.team); g.lineWidth = 1.2; g.stroke();
    L.stripe(g, P, 4, h - 7, w - 8, 2.2); ac(g, w - 11, 3, 7);
  };
  BLD.repair = (g, P, w, h) => {
    P2.chamfer(g, 1, 1, w - 2, h - 2, 4); L.fill(g, [70, 74, 76], [0, 0, w, h], { bevel: 1.4 });
    hazard(g, 3, 3, w - 6, 4); hazard(g, 3, h - 7, w - 6, 4);
    // pad circle
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, 7); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#f0f0e8'; g.fillRect(w / 2 - 9, h / 2 - 2.8, 18, 5.6); g.fillRect(w / 2 - 2.8, h / 2 - 9, 5.6, 18);
    g.fillStyle = rgb(P.team); g.fillRect(w / 2 - 7.5, h / 2 - 1.6, 15, 3.2); g.fillRect(w / 2 - 1.6, h / 2 - 7.5, 3.2, 15);
    // robotic arms
    for (const [x, y, a] of [[7, 13, 0.6], [w - 7, h - 13, 3.7]]) { g.save(); g.translate(x, y); g.rotate(a); L.box(g, 0, -1.2, 10, 2.4, [214, 170, 44]); g.beginPath(); g.arc(0, 0, 2.6, 0, 7); L.fill(g, [90, 90, 90], [-2.6, -2.6, 5.2, 5.2], { bevel: 0.8 }); g.restore(); }
  };
  BLD.radar = (g, P, w, h) => { concrete(g, w, h, [98, 100, 98], 91); const r = block(g, P, 7, 7, w - 14, h - 14, 5, roofCol(P)); L.stripe(g, P, r.x + 2, r.y + r.h - 4, r.w - 4, 2); L.grille(g, r.x + 3, r.y + 3, r.w - 6, 4, 5, true); };
  BLD.turret_mg = (g, P, w, h) => {
    g.beginPath(); g.arc(w / 2 + 1, h / 2 + 1.5, w * 0.46, 0, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, 7); L.fill(g, [116, 112, 100], [0, 0, w, h], { bevel: 2 });
    // sandbags ring
    for (let a = 0; a < 6.28; a += 0.52) { g.save(); g.translate(w / 2 + Math.cos(a) * w * 0.38, h / 2 + Math.sin(a) * h * 0.38); g.rotate(a + 1.57); P2.rr(g, -2.4, -1.3, 4.8, 2.6, 1.2); L.fill(g, [168, 150, 108], [-2.4, -1.3, 4.8, 2.6], { bevel: 0.5, lw: 0.35 }); g.restore(); }
  };
  BLD.turret_gun = (g, P, w, h) => { P2.chamfer(g, 1, 1, w - 2, h - 2, w * 0.28); L.fill(g, [100, 102, 100], [0, 0, w, h], { bevel: 2 }); L.bolts(g, [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]], [100, 102, 100]); L.stripe(g, P, 5, h - 4, w - 10, 1.6); };
  BLD.turret_aa = (g, P, w, h) => { P2.chamfer(g, 1.5, 1.5, w - 3, h - 3, w * 0.2); L.fill(g, [96, 100, 104], [0, 0, w, h], { bevel: 2 }); hazard(g, 4, 3, w - 8, 2.2); };
  BLD.wall = (g, P, w, h) => {
    const col = P.style === 'bulky' ? [126, 112, 98] : P.style === 'sleek' ? [104, 112, 122] : [132, 134, 126];
    g.fillStyle = 'rgba(0,0,0,0.35)'; P2.chamfer(g, 2, 3, w - 2, h - 2, 4); g.fill();
    P2.chamfer(g, 0.5, 0.5, w - 2, h - 3, 4); L.fill(g, col, [0, 0, w, h], { bevel: 2.4 });
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(3, h - 6, w - 7, 2.5);
    g.fillStyle = rgb(P.team, 0.85); g.fillRect(w / 2 - 4, h / 2 - 2, 8, 2.4);
    L.bolts(g, [[4, 4], [w - 6, 4]], col);
  };
  BLD.silo = (g, P, w, h) => {
    concrete(g, w, h, [80, 82, 84], 101);
    hazard(g, 4, 4, w - 8, h - 8);
    P2.chamfer(g, 9, 9, w - 18, h - 18, 6); L.fill(g, [46, 50, 54], [9, 9, w - 18, h - 18], { bevel: 1.6 });
    g.strokeStyle = '#0c0c0c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke();
    L.bolts(g, [[w / 2 - 6, 14], [w / 2 + 6, 14], [w / 2 - 6, h - 14], [w / 2 + 6, h - 14]], [70, 70, 70]);
    L.stripe(g, P, 4, h - 4, w - 8, 2);
  };

  // FX anchors (fractions of footprint): blinking lights and smoke stacks
  ART.bldFx = {
    hq: { lights: [[0.82, 0.12, 'rgba(255,60,60,1)'], [0.12, 0.88, 'rgba(120,255,140,1)']] },
    factory: { smoke: [[0.11, 0.2], [0.24, 0.2]], lights: [[0.95, 0.24, 'rgba(255,190,60,1)']] },
    power: { smoke: [[0.38, 0.42]] },
    extractor: { lights: [[0.9, 0.1, 'rgba(255,190,60,1)']] },
    radar: { lights: [[0.15, 0.15, 'rgba(255,60,60,1)']] },
    shipyard: { lights: [[0.5, 0.48, 'rgba(255,190,60,1)']] },
    airfield: {}, lab: { lights: [[0.5, 0.46, 'rgba(140,240,255,1)']] }, silo: { lights: [[0.5, 0.5, 'rgba(255,40,30,1)']] },
    repair: { lights: [[0.1, 0.1, 'rgba(120,255,140,1)'], [0.9, 0.9, 'rgba(120,255,140,1)']] },
  };

  // rotating / animated parts on buildings
  const BTUR = {
    turret_mg: (R) => (g, P) => { for (const s of [-1, 1]) L.cyl(g, 0, s * 1.2, R * 1.2, 1.3, P.dark, { bore: true }); g.beginPath(); g.arc(0, 0, R * 0.48, 0, 7); L.fill(g, P.hull, [-R * 0.48, -R * 0.48, R * 0.96, R * 0.96], { bevel: 1.2 }); L.box(g, -R * 0.4, -R * 0.15, R * 0.3, R * 0.3, P.metal); },
    turret_gun: (R) => (g, P) => { L.cyl(g, R * 0.3, 0, R * 1.15, 3.4, P.metalL, { brake: true, sleeve: true }); P2.chamfer(g, -R * 0.6, -R * 0.55, R * 1.15, R * 1.1, R * 0.28); L.fill(g, shade(P.hull, 0.05), [-R * 0.6, -R * 0.55, R * 1.15, R * 1.1], { bevel: 1.6 }); P2.chamfer(g, -R * 0.6, -R * 0.55, R * 1.15, R * 1.1, R * 0.28); L.camo(g, P, [-R * 0.6, -R * 0.55, R * 1.15, R * 1.1], 7); L.hatch(g, -R * 0.2, -R * 0.15, R * 0.18, P.hull); },
    turret_aa: (R) => (g, P) => { for (const s of [-1, 1]) { L.box(g, -R * 0.35, s * R * 0.45 - 3, R * 1.05, 6, P.metal); for (const k of [-1.4, 1.4]) { g.fillStyle = '#e8e8e0'; g.beginPath(); g.arc(R * 0.68, s * R * 0.45 + k, 1.1, 0, 7); g.fill(); g.fillStyle = '#c33'; g.beginPath(); g.arc(R * 0.68, s * R * 0.45 + k, 0.5, 0, 7); g.fill(); } } g.beginPath(); g.arc(0, 0, R * 0.42, 0, 7); L.fill(g, P.hull, [-R * 0.42, -R * 0.42, R * 0.84, R * 0.84], { bevel: 1.2 }); },
    radar: (R) => (g, P) => { g.beginPath(); g.ellipse(0, 0, R * 0.3, R * 0.98, 0, 0, 7); L.fill(g, [200, 204, 206], [-R * 0.3, -R, R * 0.6, R * 2], { bevel: 1 }); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.4; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-R * 0.25, k * R * 0.26); g.lineTo(R * 0.25, k * R * 0.26); g.stroke(); } g.strokeStyle = rgb(P.metal); g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.6, 0); g.stroke(); L.lightDot(g, R * 0.6, 0, 'rgba(255,90,90,1)', 1); },
    extractor: (R) => (g, P) => { L.box(g, -R * 0.85, -1.4, R * 1.7, 2.8, [52, 52, 52]); g.fillStyle = '#2b2b2b'; P2.poly(g, [[R * 0.85, -3.2], [R * 1.2, 0], [R * 0.85, 3.2]]); g.fill(); g.beginPath(); g.arc(0, 0, 3, 0, 7); L.fill(g, [225, 185, 40], [-3, -3, 6, 6], { bevel: 0.8 }); },
  };
  ART.bldTurret = function (type, faction, color, R) {
    if (!BTUR[type]) return null;
    const key = 'bt|' + type + '|' + faction + '|' + color + '|' + R;
    if (ART.cache.has(key)) return ART.cache.get(key);
    const P = ART.palette(faction, color);
    const f = BTUR[type](R); return ART.sprite(key, R * 1.8, (g) => f(g, P));
  };
  ART.bld = function (type, faction, color) {
    const key = 'b|' + type + '|' + faction + '|' + color;
    if (ART.cache.has(key)) return ART.cache.get(key);
    const d = D.BUILDINGS[type]; const w = d.w * 32, h = d.h * 32; const ss = ART.SS || 2;
    const pad = 6;
    const c = ART.mk((w + pad * 2) * ss, (h + pad * 2) * ss); const g = c.getContext('2d'); g.scale(ss, ss); g.translate(pad, pad); g.lineJoin = 'round';
    const P = ART.palette(faction, color);
    // soft ground shadow (south-east)
    g.save(); if ('filter' in g) g.filter = `blur(${3 * ss}px)`; g.fillStyle = 'rgba(0,0,0,0.45)'; P2.chamfer(g, 4, 5, w, h, 6); g.fill(); g.restore();
    (BLD[type] || BLD.barracks)(g, P, w, h);
    const s = { img: c, w: w + pad * 2, h: h + pad * 2, pad }; ART.cache.set(key, s); return s;
  };
  ART.scaffold = function (w, h) {
    const key = 'sc|' + w + '|' + h; if (ART.cache.has(key)) return ART.cache.get(key);
    const ss = 2; const c = ART.mk(w * ss, h * ss); const g = c.getContext('2d'); g.scale(ss, ss);
    g.fillStyle = 'rgba(70,68,60,0.7)'; g.fillRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#d8b030'; g.lineWidth = 1.4; g.strokeRect(2, 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(220,190,90,0.6)'; g.lineWidth = 0.8;
    for (let x = 2; x < w; x += 8) { g.beginPath(); g.moveTo(x, 2); g.lineTo(x, h - 2); g.stroke(); }
    for (let y = 2; y < h; y += 8) { g.beginPath(); g.moveTo(2, y); g.lineTo(w - 2, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,190,90,0.35)'; for (let i = -h; i < w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    const s = { img: c, w, h, pad: 0 }; ART.cache.set(key, s); return s;
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
