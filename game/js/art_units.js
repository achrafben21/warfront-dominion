/* WARFRONT: DOMINION v2 — unit sprites. Detailed lit vector art: camouflage, bevels, hatches,
 * animated track links (3 frames), barrels with muzzle brakes, glass, glows. Facing +x. */
(function (WF) {
  'use strict';
  const D = WF.D, ART = WF.ART, P2 = ART.P2, L = ART.L, rgb = ART.rgb, shade = ART.shade, mix = ART.mix;
  const BODY = {}, TURRET = {};
  const TRACKED = { light_tank: 1, med_tank: 1, heavy_tank: 1, mammoth: 1, flak: 1, howitzer: 1, siege: 1, builder: 1, citadel: 1 };
  ART.tracked = (t) => !!TRACKED[t];

  // ---------------------------------------------------------------- shared parts
  function trackPair(g, P, Lh, W, tw, frame, y0) {
    for (const s of [-1, 1]) {
      const y = (y0 || 0) + (s < 0 ? -W / 2 : W / 2 - tw);
      P2.rr(g, -Lh / 2, y, Lh, tw, tw * 0.45); g.fillStyle = rgb(P.track); g.fill();
      g.save(); g.clip();
      const step = Math.max(1.6, tw * 0.55); const off = (frame || 0) * step / 3;
      for (let x = -Lh / 2 - step + off; x < Lh / 2 + step; x += step) {
        g.fillStyle = rgb(P.trackL); g.fillRect(x, y + 0.3, step * 0.45, tw - 0.6);
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + step * 0.45, y + 0.3, step * 0.12, tw - 0.6);
      }
      const gr = g.createLinearGradient(0, y, 0, y + tw); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = gr; g.fillRect(-Lh / 2, y, Lh, tw);
      g.restore();
      g.lineWidth = 0.5; g.strokeStyle = 'rgba(0,0,0,0.9)'; P2.rr(g, -Lh / 2, y, Lh, tw, tw * 0.45); g.stroke();
    }
  }
  function wheelSet(g, P, Lh, W, n, r) {
    for (let i = 0; i < n; i++) {
      const x = -Lh / 2 + (i + 0.5) * Lh / n;
      for (const s of [-1, 1]) {
        P2.rr(g, x - r, s * W / 2 - r * 0.55, r * 2, r * 1.1, r * 0.45); g.fillStyle = '#16171a'; g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - r * 0.8, s * W / 2 - r * 0.45, r * 1.6, r * 0.25);
      }
    }
  }
  function exhausts(g, x, y, W) { for (const s of [-1, 1]) { g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(x, y + s * W * 0.3, 0.9, 1.4, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(80,60,40,0.5)'; g.beginPath(); g.ellipse(x - 0.6, y + s * W * 0.3, 0.5, 1, 0, 0, 7); g.fill(); } }
  function headlights(g, x, W, P) {
    for (const s of [-1, 1]) {
      if (P.glow && P.style === 'sleek') L.lightDot(g, x, s * W * 0.36, P.glow, 0.8);
      else { g.fillStyle = 'rgba(255,240,190,0.95)'; g.beginPath(); g.arc(x, s * W * 0.36, 0.7, 0, 7); g.fill(); L.glow(g, x + 0.6, s * W * 0.36, 2, 'rgba(255,240,190,0.35)'); }
    }
  }
  function emblem(g, P, x, y, r) {
    if (P.faction === 'vortex') { g.strokeStyle = rgb(P.accent, 0.9); g.lineWidth = 0.45; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.45, 0, 7); g.stroke(); }
    else if (P.faction === 'iron') { g.fillStyle = rgb(P.accent, 0.9); P2.poly(g, [[x, y - r], [x + r * 0.9, y], [x, y + r], [x - r * 0.9, y]]); g.fill(); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6); }
    else { g.fillStyle = rgb(P.accent, 0.95); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  }
  function smokeLaunchers(g, P, x, y) { for (let i = 0; i < 3; i++) { g.save(); g.translate(x, y + i * 0.95); L.cyl(g, 0, 0, 1.6, 0.75, P.metal, { bore: false }); g.restore(); } }

  // ---------------------------------------------------------------- tanks
  function tank(Lh, W, opt) {
    return (g, P, frame) => {
      const tw = W * (opt.trackW || 0.24);
      if (opt.hover) {
        P2.rr(g, -Lh / 2 - 1, -W / 2 - 1, Lh + 2, W + 2, W * 0.45); g.fillStyle = 'rgba(10,12,14,0.85)'; g.fill();
        if (P.glow) { g.globalAlpha = 0.7; for (const s of [-1, 1]) L.glow(g, -Lh * 0.35, s * W * 0.32, W * 0.32, P.glow); L.glow(g, Lh * 0.3, 0, W * 0.25, P.glow); g.globalAlpha = 1; }
      } else trackPair(g, P, Lh, W, tw, frame);
      const hx = -Lh / 2 + (opt.hover ? 0 : Lh * 0.035), hw = Lh * (opt.hover ? 1 : 0.93), hy = -W / 2 + (opt.hover ? 1 : tw * 0.62), hh = W - (opt.hover ? 2 : tw * 1.24);
      // side skirts
      if (opt.skirts) for (const s of [-1, 1]) { const y = s < 0 ? -W / 2 - 0.3 : W / 2 - tw * 0.55 + 0.3; P2.rr(g, hx + hw * 0.08, y, hw * 0.78, tw * 0.55, 0.6); L.fill(g, shade(P.hull, -0.08), [hx, y, hw, tw], { bevel: 0.8, lw: 0.45 }); for (let k = 1; k < 5; k++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(hx + hw * 0.08 + k * hw * 0.156, y, 0.35, tw * 0.55); } }
      P2.hull(g, opt.hover ? 'sleek' : P.style, hx, hy, hw, hh);
      L.fill(g, P.hull, [hx, hy, hw, hh], { bevel: 2 });
      P2.hull(g, opt.hover ? 'sleek' : P.style, hx, hy, hw, hh); L.camo(g, P, [hx, hy, hw, hh], Lh * 7 + W);
      // turret ring (darkened recess under the turret)
      if (!opt.noRing) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(-Lh * 0.04, 0, hh * 0.42, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.6; g.stroke(); }
      // engine deck
      L.grille(g, hx + hw * 0.05, hy + hh * 0.24, hw * 0.16, hh * 0.52, 5, true);
      exhausts(g, hx + 0.8, 0, hh);
      // panel lines
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.4;
      g.beginPath(); g.moveTo(hx + hw * 0.24, hy + 1); g.lineTo(hx + hw * 0.24, hy + hh - 1); g.moveTo(hx + hw * 0.74, hy + 1.2); g.lineTo(hx + hw * 0.74, hy + hh - 1.2); g.stroke();
      // glacis
      const gl = g.createLinearGradient(hx + hw * 0.76, 0, hx + hw, 0); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0.22)'); g.fillStyle = gl; g.fillRect(hx + hw * 0.76, hy + 1, hw * 0.22, hh - 2);
      // stowage & tools
      L.box(g, hx + hw * 0.27, hy + 0.5, hw * 0.16, hh * 0.13, shade(P.hull, -0.1));
      L.box(g, hx + hw * 0.27, hy + hh - hh * 0.13 - 0.5, hw * 0.16, hh * 0.13, shade(P.hull, -0.1));
      g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(hx + hw * 0.46, hy + 1.1); g.lineTo(hx + hw * 0.66, hy + 1.1); g.stroke();
      if (opt.era) { for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const y = s < 0 ? hy + 0.3 : hy + hh - 1.6; L.box(g, hx + hw * (0.48 + i * 0.1), y, hw * 0.085, 1.3, shade(P.hull, -0.05)); } }
      if (opt.spare) { g.fillStyle = rgb(P.track); for (let i = 0; i < 3; i++) g.fillRect(hx + hw * 0.86, hy + hh * (0.3 + i * 0.14), hw * 0.06, hh * 0.1); }
      L.stripe(g, P, hx + hw * 0.43, hy + 0.4, hw * 0.08, 1.3); L.stripe(g, P, hx + hw * 0.43, hy + hh - 1.7, hw * 0.08, 1.3);
      if (opt.hover && P.glow) { g.globalAlpha = 0.9; g.strokeStyle = P.glow; g.lineWidth = 0.5; P2.rr(g, hx + 1.5, hy + 1.5, hw - 3, hh - 3, hh * 0.4); g.stroke(); g.globalAlpha = 1; }
      headlights(g, hx + hw - 1, hh, P);
      if (opt.bolts !== false && P.style === 'bulky') L.bolts(g, [[hx + 1.5, hy + 1.5], [hx + hw - 2, hy + 1.5], [hx + 1.5, hy + hh - 1.5], [hx + hw - 2, hy + hh - 1.5], [hx + hw * 0.5, hy + 1.2], [hx + hw * 0.5, hy + hh - 1.2]], P.hull);
    };
  }
  function tankTurret(r, opt) {
    return (g, P) => {
      const n = opt.barrels || 1, bw = opt.bw, blen = opt.blen; const sp = bw * 1.55;
      // barrels
      for (let i = 0; i < n; i++) { const y = n === 2 ? (i ? sp / 2 : -sp / 2) : 0; L.cyl(g, r * 0.55, y, blen, bw, P.metalL, { brake: opt.brake !== false, sleeve: true }); }
      if (opt.plasma && P.glow) { g.globalAlpha = 0.85; L.glow(g, r * 0.55 + blen, 0, bw * 1.6, P.glow); g.globalAlpha = 1; for (let k = 0; k < 3; k++) { g.fillStyle = P.glow; g.fillRect(r * 0.6 + blen * (0.25 + k * 0.22), -bw * 0.62, bw * 0.3, bw * 1.24); } }
      // mantlet
      L.box(g, r * 0.48, -r * (n === 2 ? 0.62 : 0.42), r * 0.42, r * (n === 2 ? 1.24 : 0.84), shade(P.hull, -0.12));
      // turret body (with cast shadow onto the hull)
      const tpath = () => {
        if (P.style === 'sleek') { g.beginPath(); g.ellipse(-r * 0.12, 0, r * 1.08, r * 0.86, 0, 0, 7); }
        else if (P.style === 'bulky') P2.chamfer(g, -r * 1.1, -r * 0.92, r * 1.85, r * 1.84, r * 0.3);
        else P2.poly(g, [[r * 0.75, -r * 0.62], [r * 0.75, r * 0.62], [r * 0.15, r * 0.95], [-r * 0.95, r * 0.8], [-r * 1.05, r * 0.4], [-r * 1.05, -r * 0.4], [-r * 0.95, -r * 0.8], [r * 0.15, -r * 0.95]]);
      };
      g.save(); g.translate(r * 0.14 + 0.8, r * 0.2 + 1.1); tpath(); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); g.restore();
      tpath(); L.fill(g, shade(P.hull, 0.22), [-r, -r, 2 * r, 2 * r], { bevel: Math.max(1.6, r * 0.3), lw: 1.1 });
      tpath();
      L.camo(g, P, [-r * 1.1, -r, r * 2, r * 2], r * 13);
      // bustle rack
      if (!opt.noRack) { g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 0.35; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-r * 1.0 + k * 0.7, -r * 0.55); g.lineTo(-r * 1.0 + k * 0.7, r * 0.55); g.stroke(); } }
      // hatches
      L.hatch(g, -r * 0.3, -r * 0.38, r * 0.27, P.hull);
      L.hatch(g, -r * 0.35, r * 0.4, r * 0.2, P.hull);
      if (opt.mg) { g.save(); g.translate(-r * 0.3, -r * 0.38); L.cyl(g, 0, 0, r * 0.9, 0.55, P.dark, { bore: false }); g.restore(); }
      smokeLaunchers(g, P, r * 0.2, -r * 0.92); smokeLaunchers(g, P, r * 0.2, r * 0.92 - 1.9);
      L.antenna(g, -r * 0.85, r * 0.55, r * 0.9, Math.PI * 0.85);
      // optics block
      g.fillStyle = rgb(P.glass, 0.85); g.fillRect(r * 0.25, -r * 0.62, r * 0.18, r * 0.16);
      L.stripe(g, P, -r * 0.9, -0.7, r * 0.32, 1.4);
      emblem(g, P, -r * 0.35, r * 0.05, Math.max(0.9, r * 0.17));
    };
  }

  BODY.light_tank = (R) => tank(R * 2.0, R * 1.48, { skirts: false });
  TURRET.light_tank = (R) => tankTurret(R * 0.44, { blen: R * 1.2, bw: 1.9, mg: false });
  BODY.med_tank = (R) => tank(R * 2.05, R * 1.55, { skirts: true, spare: true });
  TURRET.med_tank = (R) => tankTurret(R * 0.5, { blen: R * 1.3, bw: 2.6, mg: true });
  BODY.heavy_tank = (R) => tank(R * 2.05, R * 1.6, { skirts: true, era: true });
  TURRET.heavy_tank = (R) => tankTurret(R * 0.53, { blen: R * 1.2, bw: 2.6, barrels: 2, mg: true });
  BODY.mammoth = (R) => tank(R * 2.0, R * 1.66, { skirts: true, era: true, spare: true, trackW: 0.27 });
  TURRET.mammoth = (R) => tankTurret(R * 0.55, { blen: R * 1.12, bw: 3.2, barrels: 2, mg: true });
  BODY.hover_tank = (R) => tank(R * 2.0, R * 1.4, { hover: true });
  TURRET.hover_tank = (R) => tankTurret(R * 0.5, { blen: R * 1.08, bw: 2.3, plasma: true, brake: false, noRack: true });

  // ---------------------------------------------------------------- wheeled & support
  function wheeledHull(g, P, Lh, W, cabFront, seed) {
    P2.hull(g, P.style, -Lh / 2, -W / 2 + 1.4, Lh, W - 2.8); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 1.6 });
    P2.hull(g, P.style, -Lh / 2, -W / 2 + 1.4, Lh, W - 2.8); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], seed);
  }
  function cab(g, P, x, W, len) {
    P2.rr(g, x, -W / 2 + 2.2, len, W - 4.4, 1.6); L.fill(g, shade(P.hull, 0.1), [x, -W / 2, len, W], { bevel: 1.2 });
    const gr = g.createLinearGradient(x + len * 0.55, 0, x + len, 0); gr.addColorStop(0, rgb(P.glass, 0.6)); gr.addColorStop(1, 'rgba(230,250,255,0.95)');
    P2.rr(g, x + len * 0.6, -W / 2 + 2.8, len * 0.3, W - 5.6, 0.8); g.fillStyle = gr; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + len * 0.66, -W / 2 + 3.2, len * 0.08, (W - 6.4) * 0.4);
  }
  BODY.recon = (R) => (g, P) => {
    const Lh = R * 2.05, W = R * 1.35; wheelSet(g, P, Lh * 0.78, W, 2, 2.4);
    wheeledHull(g, P, Lh, W, true, 31);
    cab(g, P, Lh * 0.02, W, Lh * 0.32);
    L.grille(g, -Lh * 0.46, -W * 0.22, Lh * 0.12, W * 0.44, 4, true);
    L.stripe(g, P, -Lh * 0.32, -0.8, Lh * 0.28, 1.6);
    headlights(g, Lh / 2 - 1, W - 2, P);
    L.antenna(g, -Lh * 0.38, -W * 0.3, Lh * 0.5, Math.PI * 0.92);
  };
  TURRET.recon = (R) => (g, P) => { L.cyl(g, 0, 0, R * 0.95, 1.2, P.dark, { sleeve: false }); g.beginPath(); g.arc(0, 0, R * 0.34, 0, 7); L.fill(g, P.metal, [-R * 0.34, -R * 0.34, R * 0.68, R * 0.68], { bevel: 0.8 }); L.box(g, -R * 0.15, -R * 0.4, R * 0.3, R * 0.16, P.metalL); };
  TURRET.amph = TURRET.recon;

  BODY.builder = (R) => (g, P, frame) => {
    const Lh = R * 2.05, W = R * 1.5; trackPair(g, P, Lh, W, W * 0.24, frame);
    P2.rr(g, -Lh / 2 + 1, -W / 2 + 2, Lh - 2, W - 4, 1.4); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 1.6 });
    cab(g, P, Lh * 0.1, W, Lh * 0.32);
    // hazard plate & blade
    g.save(); P2.rr(g, -Lh / 2 + 2, -W / 2 + 3, Lh * 0.3, W - 6, 1); g.clip();
    for (let i = -12; i < 22; i += 3.2) { g.fillStyle = Math.round(i / 3.2) % 2 ? '#e8c22a' : '#1d1d1d'; P2.poly(g, [[-Lh / 2 + i, -W / 2], [-Lh / 2 + i + 1.6, -W / 2], [-Lh / 2 + i + 1.6 + W, W / 2], [-Lh / 2 + i + W, W / 2]]); g.fill(); }
    g.restore();
    P2.rr(g, Lh / 2 - 1.2, -W / 2 - 0.2, 2.2, W + 0.4, 0.8); L.fill(g, [200, 170, 60], [Lh / 2 - 1.2, -W / 2, 2.2, W], { bevel: 0.6, lw: 0.4 });
    L.lightDot(g, Lh * 0.22, -W * 0.18, 'rgba(255,170,40,1)', 1); L.lightDot(g, Lh * 0.22, W * 0.18, 'rgba(255,170,40,1)', 1);
    L.stripe(g, P, -Lh * 0.12, W / 2 - 3.3, Lh * 0.2, 1.3);
  };
  TURRET.builder = (R) => (g, P) => {
    // articulated crane arm
    P2.rr(g, -R * 0.6, -1.7, R * 1.65, 3.4, 1); L.fill(g, [226, 182, 44], [-R * 0.6, -1.7, R * 1.65, 3.4], { bevel: 0.8, lw: 0.5 });
    g.strokeStyle = 'rgba(70,55,10,0.8)'; g.lineWidth = 0.4; for (let x = -R * 0.5; x < R; x += 2.2) { g.beginPath(); g.moveTo(x, -1.5); g.lineTo(x + 1.2, 1.5); g.moveTo(x + 1.2, -1.5); g.lineTo(x, 1.5); g.stroke(); }
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(R * 1.05, 0, 1.8, 0, 7); g.fill(); g.fillStyle = '#888'; g.beginPath(); g.arc(R * 1.05, 0, 0.7, 0, 7); g.fill();
    L.hatch(g, -R * 0.5, 0, 2.6, P.metal);
  };
  BODY.supply = (R) => (g, P) => {
    const Lh = R * 2.15, W = R * 1.35; wheelSet(g, P, Lh * 0.85, W, 3, 2.3);
    P2.rr(g, -Lh / 2, -W / 2 + 1.2, Lh * 0.64, W - 2.4, 1.4); L.fill(g, shade(P.hull, -0.06), [-Lh / 2, -W / 2, Lh, W], { bevel: 1.4 });
    // canvas cover ribs
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.5; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(-Lh / 2 + i * Lh * 0.1, -W / 2 + 1.6); g.lineTo(-Lh / 2 + i * Lh * 0.1, W / 2 - 1.6); g.stroke(); }
    // medical cross
    const cx = -Lh * 0.2; g.fillStyle = '#f2f2ea'; g.fillRect(cx - 3.2, -1.1, 6.4, 2.2); g.fillRect(cx - 1.1, -3.2, 2.2, 6.4); g.fillStyle = '#d2302a'; g.fillRect(cx - 2.6, -0.6, 5.2, 1.2); g.fillRect(cx - 0.6, -2.6, 1.2, 5.2);
    cab(g, P, Lh * 0.17, W, Lh * 0.32);
    L.stripe(g, P, -Lh / 2 + 1, -W / 2 + 1.2, Lh * 0.62, 1.2);
    headlights(g, Lh / 2 - 1, W - 2, P);
  };
  BODY.flak = (R) => tank(R * 2.0, R * 1.5, {});
  TURRET.flak = (R) => (g, P) => {
    for (const s of [-1, 1]) for (const k of [-1, 1]) L.cyl(g, R * 0.15, s * R * 0.38 + k * 0.85, R * 0.95, 1.1, P.metalL, { sleeve: false });
    g.fillStyle = 'rgba(0,0,0,0.4)'; P2.rr(g, -R * 0.6 + 1, -R * 0.62 + 1.3, R * 1.0, R * 1.24, 2); g.fill();
    P2.rr(g, -R * 0.6, -R * 0.62, R * 1.0, R * 1.24, 2); L.fill(g, shade(P.hull, 0.14), [-R * 0.6, -R * 0.62, R, R * 1.24], { bevel: 1.2 });
    P2.rr(g, -R * 0.6, -R * 0.62, R * 1.0, R * 1.24, 2); L.camo(g, P, [-R * 0.6, -R * 0.62, R, R * 1.24], 77);
    // radar dish
    g.beginPath(); g.ellipse(-R * 0.4, 0, R * 0.16, R * 0.42, 0, 0, 7); L.fill(g, P.metalL, [-R * 0.56, -R * 0.42, R * 0.32, R * 0.84], { bevel: 0.6, lw: 0.4 });
    L.stripe(g, P, -R * 0.1, -R * 0.58, R * 0.3, 1.2);
  };
  BODY.mlrs = (R) => (g, P) => {
    const Lh = R * 2.15, W = R * 1.45; wheelSet(g, P, Lh * 0.86, W, 3, 2.4);
    wheeledHull(g, P, Lh, W, true, 41);
    cab(g, P, Lh * 0.2, W, Lh * 0.28);
    // stabilizer jacks
    g.fillStyle = '#2a2a2a'; for (const s of [-1, 1]) g.fillRect(-Lh * 0.42, s * W / 2 - (s > 0 ? 0 : 1.2), 2.2, 1.2);
    headlights(g, Lh / 2 - 1, W - 2, P);
  };
  TURRET.mlrs = (R) => (g, P) => {
    g.fillStyle = 'rgba(0,0,0,0.4)'; P2.rr(g, -R * 0.8 + 1, -R * 0.58 + 1.3, R * 1.45, R * 1.16, 1.2); g.fill();
    P2.rr(g, -R * 0.8, -R * 0.58, R * 1.45, R * 1.16, 1.2); L.fill(g, shade(P.metal, 0.25), [-R * 0.8, -R * 0.58, R * 1.45, R * 1.16], { bevel: 1.2 });
    P2.rr(g, -R * 0.8, -R * 0.58, R * 1.45, R * 1.16, 1.2); L.camo(g, P, [-R * 0.8, -R * 0.58, R * 1.45, R * 1.16], 52);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const y = -R * 0.4 + i * R * 0.27, x = R * 0.55 - j * 1.5; g.fillStyle = '#121212'; g.beginPath(); g.arc(x, y, R * 0.1, 0, 7); g.fill(); g.fillStyle = 'rgba(255,90,60,0.8)'; g.beginPath(); g.arc(x, y, R * 0.04, 0, 7); g.fill(); }
    L.stripe(g, P, -R * 0.72, -R * 0.52, R * 0.32, 1.2);
  };
  BODY.howitzer = (R) => (g, P, frame) => {
    const Lh = R * 1.85, W = R * 1.5; trackPair(g, P, Lh, W, W * 0.25, frame);
    P2.hull(g, P.style, -Lh / 2, -W / 2 + 2.4, Lh, W - 4.8); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 1.6 });
    P2.hull(g, P.style, -Lh / 2, -W / 2 + 2.4, Lh, W - 4.8); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], 61);
    L.cyl(g, -R * 0.1, 0, R * 1.35, 3, P.metalL, { brake: true, sleeve: true });
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.4; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(R * 0.2 + k * 2, -1.4); g.lineTo(R * 0.2 + k * 2, 1.4); g.stroke(); }
    P2.chamfer(g, -R * 0.65, -R * 0.58, R * 0.95, R * 1.16, 2); L.fill(g, shade(P.hull, 0.06), [-R * 0.65, -R * 0.58, R * 0.95, R * 1.16], { bevel: 1.4 });
    L.hatch(g, -R * 0.3, -R * 0.25, R * 0.2, P.hull);
    g.fillStyle = '#222'; g.fillRect(-Lh / 2 - 2.2, -W * 0.36, 2.6, W * 0.72); // spade
    L.stripe(g, P, -R * 0.6, R * 0.25, R * 0.3, 1.3);
  };
  BODY.siege = (R) => (g, P, frame) => {
    const Lh = R * 1.9, W = R * 1.6; trackPair(g, P, Lh, W, W * 0.26, frame);
    P2.chamfer(g, -Lh / 2, -W / 2 + 2.4, Lh, W - 4.8, 3); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 2 });
    P2.chamfer(g, -Lh / 2, -W / 2 + 2.4, Lh, W - 4.8, 3); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], 71);
    L.bolts(g, [[-Lh * 0.42, -W * 0.3], [-Lh * 0.15, -W * 0.3], [Lh * 0.15, -W * 0.3], [Lh * 0.42, -W * 0.3], [-Lh * 0.42, W * 0.3], [-Lh * 0.15, W * 0.3], [Lh * 0.15, W * 0.3], [Lh * 0.42, W * 0.3]], P.hull);
    // huge mortar tube seen from above
    g.beginPath(); g.arc(R * 0.1, 0, R * 0.6, 0, 7); L.fill(g, P.metal, [R * 0.1 - R * 0.6, -R * 0.6, R * 1.2, R * 1.2], { bevel: 2 });
    const gr = g.createRadialGradient(R * 0.05, -R * 0.05, 0, R * 0.1, 0, R * 0.4); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#2a2a2a'); g.fillStyle = gr; g.beginPath(); g.arc(R * 0.1, 0, R * 0.38, 0, 7); g.fill();
    g.strokeStyle = rgb(P.metalL); g.lineWidth = 0.6; g.beginPath(); g.arc(R * 0.1, 0, R * 0.5, 0, 7); g.stroke();
    L.stripe(g, P, -Lh * 0.46, -W * 0.36, Lh * 0.2, 1.5); emblem(g, P, -Lh * 0.3, W * 0.15, 1.6);
  };
  BODY.ew = (R) => (g, P) => {
    const Lh = R * 2.0, W = R * 1.45; wheelSet(g, P, Lh * 0.85, W, 3, 2.4);
    P2.rr(g, -Lh / 2, -W / 2 + 1.4, Lh, W - 2.8, W * 0.35); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 1.6 });
    P2.rr(g, -Lh / 2, -W / 2 + 1.4, Lh, W - 2.8, W * 0.35); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], 81);
    for (let i = 0; i < 4; i++) { g.fillStyle = rgb(P.accent, 0.75); g.fillRect(-Lh * 0.42 + i * 2.2, -W * 0.28, 0.6, W * 0.56); }
    cab(g, P, Lh * 0.15, W, Lh * 0.3);
    for (const s of [-1, 1]) L.antenna(g, -Lh * 0.1, s * W * 0.32, Lh * 0.45, Math.PI + s * 0.35);
  };
  TURRET.ew = (R) => (g, P) => {
    g.beginPath(); g.ellipse(0, 0, R * 0.26, R * 0.78, 0, 0, 7); L.fill(g, P.metalL, [-R * 0.26, -R * 0.78, R * 0.52, R * 1.56], { bevel: 0.8 });
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.35; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-R * 0.2, k * R * 0.28); g.lineTo(R * 0.2, k * R * 0.28); g.stroke(); }
    g.strokeStyle = rgb(P.metal); g.lineWidth = 0.7; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.45, 0); g.stroke();
    L.lightDot(g, R * 0.45, 0, P.glow || 'rgba(140,255,255,1)', 1.1);
  };
  BODY.amph = (R) => (g, P) => {
    const Lh = R * 2.05, W = R * 1.5;
    P2.rr(g, -Lh / 2, -W / 2, Lh, W, W * 0.45); g.fillStyle = '#15171a'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.5; for (let k = 0; k < 3; k++) { P2.rr(g, -Lh / 2 + k * 0.6, -W / 2 + k * 0.6, Lh - k * 1.2, W - k * 1.2, W * 0.45); g.stroke(); }
    P2.rr(g, -Lh / 2 + 2, -W / 2 + 2, Lh - 4, W - 4, W * 0.35); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 1.6 });
    P2.rr(g, -Lh / 2 + 2, -W / 2 + 2, Lh - 4, W - 4, W * 0.35); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], 91);
    P2.rr(g, -Lh * 0.3, -W * 0.24, Lh * 0.48, W * 0.48, 1.5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(); // troop bay
    for (const s of [-1, 1]) { g.save(); g.translate(-Lh / 2 + 2.6, s * W * 0.27); g.beginPath(); g.arc(0, 0, 2.6, 0, 7); L.fill(g, P.metal, [-2.6, -2.6, 5.2, 5.2], { bevel: 0.8 }); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.4; for (let a = 0; a < 6.28; a += 1.05) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 2.3, Math.sin(a) * 2.3); g.stroke(); } g.restore(); }
    L.stripe(g, P, -Lh * 0.28, -W * 0.33, Lh * 0.45, 1.3);
    g.fillStyle = rgb(P.glass, 0.9); P2.rr(g, Lh * 0.26, -W * 0.22, 2, W * 0.44, 0.6); g.fill();
  };

  // ---------------------------------------------------------------- experimentals
  BODY.citadel = (R) => (g, P, frame) => {
    const Lh = R * 2.0, W = R * 1.72;
    for (const y of [-W * 0.25, W * 0.25]) trackPair(g, P, Lh, W * 0.5, W * 0.12, frame, y);
    P2.hull(g, P.style, -Lh / 2 + 2, -W / 2 + 4, Lh - 4, W - 8); L.fill(g, P.hull, [-Lh / 2, -W / 2, Lh, W], { bevel: 2.6 });
    P2.hull(g, P.style, -Lh / 2 + 2, -W / 2 + 4, Lh - 4, W - 8); L.camo(g, P, [-Lh / 2, -W / 2, Lh, W], 101);
    for (const s of [-1, 1]) { L.box(g, -Lh * 0.43, s * W * 0.27 - 4, 10, 8, P.metal); g.fillStyle = '#111'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(-Lh * 0.43 + 2 + i * 3, s * W * 0.27 - 1.8 + j * 3.4, 0.9, 0, 7); g.fill(); } }
    L.grille(g, -Lh * 0.18, -W * 0.36, Lh * 0.12, W * 0.18, 4, true); L.grille(g, -Lh * 0.18, W * 0.18, Lh * 0.12, W * 0.18, 4, true);
    L.stripe(g, P, -Lh * 0.05, -W / 2 + 4.5, Lh * 0.3, 2); L.stripe(g, P, -Lh * 0.05, W / 2 - 6.5, Lh * 0.3, 2);
    emblem(g, P, Lh * 0.36, 0, 3.4); headlights(g, Lh / 2 - 3, W - 8, P);
    L.lightDot(g, -Lh * 0.47, -W * 0.42, 'rgba(255,60,60,1)', 1); L.lightDot(g, -Lh * 0.47, W * 0.42, 'rgba(255,60,60,1)', 1);
  };
  TURRET.citadel = (R) => tankTurret(R * 0.42, { blen: R * 0.86, bw: 3.6, barrels: 2, mg: true });
  BODY.colossus = (R) => (g, P) => {
    for (const a of [0.75, -0.75, 2.4, -2.4]) {
      const fx = Math.cos(a) * R * 0.98, fy = Math.sin(a) * R * 0.98;
      g.strokeStyle = rgb(P.metalD); g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(fx * 0.6, fy * 0.6); g.stroke();
      g.strokeStyle = rgb(P.metal); g.lineWidth = 4.2; g.beginPath(); g.moveTo(fx * 0.55, fy * 0.55); g.lineTo(fx, fy); g.stroke();
      g.save(); g.translate(fx, fy); g.rotate(a); P2.rr(g, -3.6, -2.8, 7.2, 5.6, 1.4); L.fill(g, P.metalL, [-3.6, -2.8, 7.2, 5.6], { bevel: 1 }); g.restore();
      L.hatch(g, fx * 0.55, fy * 0.55, 2.3, P.metal);
    }
    P2.chamfer(g, -R * 0.72, -R * 0.62, R * 1.44, R * 1.24, 4); L.fill(g, P.hull, [-R * 0.72, -R * 0.62, R * 1.44, R * 1.24], { bevel: 2.6 });
    P2.chamfer(g, -R * 0.72, -R * 0.62, R * 1.44, R * 1.24, 4); L.camo(g, P, [-R * 0.72, -R * 0.62, R * 1.44, R * 1.24], 111);
    L.bolts(g, [[-R * 0.6, -R * 0.5], [R * 0.6, -R * 0.5], [-R * 0.6, R * 0.5], [R * 0.6, R * 0.5], [0, -R * 0.55], [0, R * 0.55]], P.hull);
    L.grille(g, -R * 0.62, -R * 0.25, R * 0.16, R * 0.5, 4, true);
    L.stripe(g, P, -R * 0.4, -R * 0.58, R * 0.35, 2.2); emblem(g, P, -R * 0.4, R * 0.35, 3);
  };
  TURRET.colossus = (R) => tankTurret(R * 0.5, { blen: R * 1.12, bw: 6, mg: false });

  // ---------------------------------------------------------------- infantry
  function soldier(g, P, x, y, kind, scale) {
    g.save(); g.translate(x, y); g.scale(scale, scale);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(-0.6, 0.9, 2.6, 2.2, 0, 0, 7); g.fill();
    // weapon
    if (kind === 'at') { L.cyl(g, -3.2, -2.1, 7.4, 1.5, P.metal, { bore: true }); }
    else { g.strokeStyle = '#151515'; g.lineWidth = 0.75; g.beginPath(); g.moveTo(0.4, 0.9); g.lineTo(4.6, 0.6); g.stroke(); g.fillStyle = '#151515'; g.fillRect(1.6, 0.3, 1, 1.2); }
    // backpack
    P2.rr(g, -2.3, -1.3, 1.5, 2.6, 0.5); g.fillStyle = rgb(shade(P.camoA, -0.15)); g.fill();
    // body / shoulders
    g.beginPath(); g.ellipse(-0.1, 0, 1.6, 2.35, 0, 0, 7);
    const bodyCol = kind === 'ghost' ? shade(P.metal, 0.05) : shade(P.hull, -0.1);
    L.fill(g, bodyCol, [-1.7, -2.4, 3.4, 4.8], { bevel: 0.5, lw: 0.35 });
    // arms
    g.fillStyle = rgb(shade(bodyCol, -0.1)); g.beginPath(); g.ellipse(1.1, 1.1, 1.1, 0.55, 0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(1.1, -1.0, 1.0, 0.5, -0.4, 0, 7); g.fill();
    // helmet
    g.beginPath(); g.arc(0.35, 0, 1.4, 0, 7); const hg = g.createRadialGradient(-0.1, -0.5, 0.1, 0.35, 0, 1.5); hg.addColorStop(0, rgb(P.teamL)); hg.addColorStop(0.55, rgb(P.team)); hg.addColorStop(1, rgb(P.teamD)); g.fillStyle = hg; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.3; g.stroke();
    if (kind === 'ghost' && P.glow) { g.globalAlpha = 0.8; g.fillStyle = P.glow; g.fillRect(1.2, -0.5, 0.5, 1); g.globalAlpha = 1; }
    g.restore();
  }
  function squad(pts, kind) { return (R) => (g, P) => { for (const [x, y] of pts) soldier(g, P, x, y, kind, 1.22); }; }
  BODY.rifle = squad([[3.4, -3.8], [3.4, 3.8], [-3.6, -2.6], [-3.6, 3.2]], 'rifle');
  BODY.at_team = squad([[3.6, 0], [-2.8, -4.2], [-2.8, 4.2]], 'at');
  BODY.ghost = squad([[3.6, 0], [-2.8, -4.2], [-2.8, 4.2]], 'ghost');

  // ---------------------------------------------------------------- aircraft
  function canopy(g, x, y, rx, ry) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); const gr = g.createLinearGradient(x - rx, y - ry, x + rx, y + ry); gr.addColorStop(0, 'rgba(220,245,255,0.95)'); gr.addColorStop(0.5, 'rgba(90,150,190,0.9)'); gr.addColorStop(1, 'rgba(30,50,70,0.95)');
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.35; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.2, -0.3, 0, 7); g.fill();
  }
  BODY.drone = (R) => (g, P) => {
    for (const a of [0.78, 2.36, 3.93, 5.5]) {
      const x = Math.cos(a) * R * 0.78, y = Math.sin(a) * R * 0.78;
      g.strokeStyle = rgb(P.metalD); g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke();
      g.fillStyle = 'rgba(210,225,235,0.22)'; g.beginPath(); g.arc(x, y, R * 0.42, 0, 7); g.fill();
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 0.35; g.beginPath(); g.arc(x, y, R * 0.42, 0, 7); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, 0.9, 0, 7); g.fill();
    }
    P2.rr(g, -R * 0.42, -R * 0.3, R * 0.9, R * 0.6, 2); L.fill(g, P.hull, [-R * 0.42, -R * 0.3, R * 0.9, R * 0.6], { bevel: 1 });
    g.fillStyle = '#0c0c0c'; g.beginPath(); g.arc(R * 0.3, 0, 1.3, 0, 7); g.fill(); g.fillStyle = 'rgba(120,200,255,0.9)'; g.beginPath(); g.arc(R * 0.3, 0, 0.6, 0, 7); g.fill();
    L.stripe(g, P, -R * 0.3, -0.7, R * 0.4, 1.4); L.lightDot(g, -R * 0.38, 0, 'rgba(255,60,60,1)', 0.7);
  };
  BODY.gunship = (R) => (g, P) => {
    P2.rr(g, -R * 1.08, -1.4, R * 1.05, 2.8, 1.2); L.fill(g, P.hullD, [-R * 1.08, -1.4, R * 1.05, 2.8], { bevel: 0.6, lw: 0.4 });
    P2.rr(g, -R * 1.12, -4.2, 2.4, 8.4, 0.8); L.fill(g, P.metal, [-R * 1.12, -4.2, 2.4, 8.4], { bevel: 0.5, lw: 0.4 });
    P2.rr(g, -R * 0.18, -R * 0.78, R * 0.32, R * 1.56, 1); L.fill(g, P.hullD, [-R * 0.18, -R * 0.78, R * 0.32, R * 1.56], { bevel: 0.7, lw: 0.4 });
    for (const s of [-1, 1]) { g.save(); g.translate(-R * 0.22, s * R * 0.7); L.cyl(g, 0, 0, R * 0.6, 3.4, P.metal, { bore: false }); g.fillStyle = '#111'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(R * 0.58, k * 1, 0.45, 0, 7); g.fill(); } g.restore(); }
    g.beginPath(); g.ellipse(R * 0.12, 0, R * 0.62, R * 0.33, 0, 0, 7); L.fill(g, P.hull, [-R * 0.5, -R * 0.33, R * 1.24, R * 0.66], { bevel: 1.2 });
    g.beginPath(); g.ellipse(R * 0.12, 0, R * 0.62, R * 0.33, 0, 0, 7); L.camo(g, P, [-R * 0.5, -R * 0.33, R * 1.24, R * 0.66], 121);
    canopy(g, R * 0.48, 0, R * 0.22, R * 0.17);
    L.cyl(g, R * 0.62, R * 0.12, R * 0.3, 0.9, P.dark, { bore: false });
    L.stripe(g, P, -R * 0.38, -1, R * 0.3, 2); L.lightDot(g, -R * 1.05, 0, 'rgba(255,60,60,1)', 0.7);
  };
  BODY.fighter = (R) => (g, P) => {
    const wing = [[R, 0], [R * 0.25, -R * 0.17], [-R * 0.15, -R * 0.95], [-R * 0.45, -R * 0.95], [-R * 0.35, -R * 0.2], [-R * 0.88, -R * 0.45], [-R * 0.98, -R * 0.12], [-R * 0.98, R * 0.12], [-R * 0.88, R * 0.45], [-R * 0.35, R * 0.2], [-R * 0.45, R * 0.95], [-R * 0.15, R * 0.95], [R * 0.25, R * 0.17]];
    P2.poly(g, wing); L.fill(g, P.hull, [-R, -R, 2 * R, 2 * R], { bevel: 1.2 });
    P2.poly(g, wing); L.camo(g, P, [-R, -R, 2 * R, 2 * R], 131);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(-R * 0.1, -R * 0.75); g.lineTo(-R * 0.3, -R * 0.3); g.moveTo(-R * 0.1, R * 0.75); g.lineTo(-R * 0.3, R * 0.3); g.stroke();
    for (const s of [-1, 1]) { g.save(); g.translate(-R * 0.35, s * R * 0.6); L.cyl(g, 0, 0, R * 0.45, 1, [220, 220, 210], { bore: false }); g.fillStyle = '#c33'; g.fillRect(R * 0.38, -0.5, 0.8, 1); g.restore(); }
    for (const s of [-1, 1]) { g.fillStyle = '#222'; g.beginPath(); g.arc(-R * 0.96, s * R * 0.07, 1.1, 0, 7); g.fill(); }
    canopy(g, R * 0.45, 0, R * 0.22, R * 0.09);
    L.stripe(g, P, -R * 0.36, -R * 0.88, R * 0.16, R * 0.4); L.stripe(g, P, -R * 0.36, R * 0.48, R * 0.16, R * 0.4);
  };
  BODY.bomber = (R) => (g, P) => {
    const shp = [[R * 0.55, 0], [R * 0.12, -R * 0.13], [-R * 0.12, -R], [-R * 0.45, -R], [-R * 0.32, -R * 0.13], [-R * 0.82, -R * 0.12], [-R * 0.95, -R * 0.42], [-R * 1.0, 0], [-R * 0.95, R * 0.42], [-R * 0.82, R * 0.12], [-R * 0.32, R * 0.13], [-R * 0.45, R], [-R * 0.12, R], [R * 0.12, R * 0.13]];
    P2.poly(g, shp); L.fill(g, P.hull, [-R, -R, 2 * R, 2 * R], { bevel: 1.6 });
    P2.poly(g, shp); L.camo(g, P, [-R, -R, 2 * R, 2 * R], 141);
    for (const s of [-1, 1]) for (const k of [0.42, 0.72]) { g.save(); g.translate(-R * 0.3, s * R * k); L.cyl(g, 0, 0, R * 0.42, 3, P.metal, { bore: false }); g.fillStyle = 'rgba(255,170,80,0.7)'; g.beginPath(); g.arc(0, 0, 0.9, 0, 7); g.fill(); g.restore(); }
    canopy(g, R * 0.38, 0, R * 0.12, R * 0.07);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(R * 0.4, 0); g.lineTo(-R * 0.9, 0); g.stroke();
    L.stripe(g, P, -R * 0.36, -R * 0.95, R * 0.12, R * 0.5); L.stripe(g, P, -R * 0.36, R * 0.45, R * 0.12, R * 0.5);
    L.lightDot(g, -R * 0.12, -R * 0.97, 'rgba(255,60,60,1)', 0.8); L.lightDot(g, -R * 0.12, R * 0.97, 'rgba(60,255,90,1)', 0.8);
  };
  BODY.aurora = (R) => (g, P) => {
    const hexp = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; hexp.push([Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96]); }
    P2.poly(g, hexp); L.fill(g, P.hull, [-R, -R, 2 * R, 2 * R], { bevel: 2.4 });
    P2.poly(g, hexp); L.camo(g, P, [-R, -R, 2 * R, 2 * R], 151);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); g.lineTo(Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83); g.stroke(); }
    g.beginPath(); g.arc(0, 0, R * 0.52, 0, 7); L.fill(g, shade(P.hull, 0.12), [-R * 0.52, -R * 0.52, R * 1.04, R * 1.04], { bevel: 1.8 });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; L.glow(g, Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, 4.5, P.glow || 'rgba(140,255,255,0.95)'); g.fillStyle = '#fff'; g.beginPath(); g.arc(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, 1, 0, 7); g.fill(); }
    L.glow(g, 0, 0, R * 0.4, 'rgba(170,255,255,0.75)'); emblem(g, P, 0, 0, 3);
    L.stripe(g, P, -R * 0.5, -R * 0.62, R * 0.3, 2.4);
  };

  // ---------------------------------------------------------------- naval
  function boatHull(g, P, Lh, W, seed) {
    const hull = () => { g.beginPath(); g.moveTo(Lh / 2, 0); g.quadraticCurveTo(Lh * 0.32, -W / 2, -Lh * 0.18, -W / 2); g.lineTo(-Lh / 2, -W * 0.42); g.lineTo(-Lh / 2, W * 0.42); g.lineTo(-Lh * 0.18, W / 2); g.quadraticCurveTo(Lh * 0.32, W / 2, Lh / 2, 0); g.closePath(); };
    hull(); L.fill(g, shade(P.hull, -0.12), [-Lh / 2, -W / 2, Lh, W], { bevel: 1.4 });
    // deck
    g.save(); g.beginPath(); g.moveTo(Lh * 0.42, 0); g.quadraticCurveTo(Lh * 0.26, -W * 0.37, -Lh * 0.18, -W * 0.37); g.lineTo(-Lh * 0.46, -W * 0.3); g.lineTo(-Lh * 0.46, W * 0.3); g.lineTo(-Lh * 0.18, W * 0.37); g.quadraticCurveTo(Lh * 0.26, W * 0.37, Lh * 0.42, 0); g.closePath();
    g.fillStyle = rgb(shade(P.metal, 0.22)); g.fill(); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.3; for (let y = -W / 2; y < W / 2; y += 1.2) { g.beginPath(); g.moveTo(-Lh / 2, y); g.lineTo(Lh / 2, y); g.stroke(); }
    g.restore();
  }
  function superstructure(g, P, x, y, w, h) {
    P2.rr(g, x, y, w, h, 1.2); L.fill(g, P.hull, [x, y, w, h], { bevel: 1.2 });
    g.fillStyle = rgb(P.glass, 0.9); for (let i = 0; i < 3; i++) g.fillRect(x + w - 1.2, y + 0.8 + i * (h - 1.6) / 3, 0.7, (h - 1.6) / 3 - 0.4);
  }
  BODY.patrol = (R) => (g, P) => { const Lh = R * 2.15, W = R * 0.95; boatHull(g, P, Lh, W); superstructure(g, P, -Lh * 0.2, -W * 0.25, Lh * 0.28, W * 0.5); L.antenna(g, -Lh * 0.1, 0, Lh * 0.25, Math.PI); L.stripe(g, P, -Lh * 0.44, -1, Lh * 0.18, 2); L.lightDot(g, Lh * 0.42, 0, 'rgba(255,240,190,1)', 0.6); };
  TURRET.patrol = (R) => (g, P) => { L.cyl(g, 0, 0, R * 0.72, 1.8, P.metalL, { brake: false }); g.beginPath(); g.arc(0, 0, R * 0.3, 0, 7); L.fill(g, P.metal, [-R * 0.3, -R * 0.3, R * 0.6, R * 0.6], { bevel: 1 }); };
  BODY.missile_boat = (R) => (g, P) => { const Lh = R * 2.15, W = R * 1.0; boatHull(g, P, Lh, W); superstructure(g, P, -Lh * 0.32, -W * 0.25, Lh * 0.24, W * 0.5); L.stripe(g, P, -Lh * 0.46, -1, Lh * 0.12, 2); L.antenna(g, -Lh * 0.22, 0, Lh * 0.2, Math.PI); };
  TURRET.missile_boat = (R) => (g, P) => { L.box(g, -R * 0.38, -R * 0.36, R * 0.8, R * 0.72, P.metal); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = '#111'; g.beginPath(); g.arc(R * 0.15 + j * 2.6, -R * 0.15 + i * R * 0.3, 1, 0, 7); g.fill(); g.fillStyle = '#d33'; g.beginPath(); g.arc(R * 0.15 + j * 2.6, -R * 0.15 + i * R * 0.3, 0.4, 0, 7); g.fill(); } };
  BODY.destroyer = (R) => (g, P) => {
    const Lh = R * 2.2, W = R * 0.84; boatHull(g, P, Lh, W);
    superstructure(g, P, -Lh * 0.16, -W * 0.28, Lh * 0.32, W * 0.56);
    g.beginPath(); g.arc(-Lh * 0.02, 0, W * 0.15, 0, 7); L.fill(g, P.metalL, [-Lh * 0.02 - W * 0.15, -W * 0.15, W * 0.3, W * 0.3], { bevel: 0.6 });
    for (let i = 0; i < 8; i++) L.box(g, -Lh * 0.4 + (i % 4) * 2.2, -2.4 + Math.floor(i / 4) * 2.8, 1.8, 2.2, P.metalD);
    g.beginPath(); g.arc(Lh * 0.24, 0, W * 0.17, 0, 7); L.fill(g, P.metal, [Lh * 0.24 - 3, -3, 6, 6], { bevel: 0.8 });
    L.cyl(g, Lh * 0.24, 0, Lh * 0.12, 1.2, P.metalL, { bore: false });
    L.stripe(g, P, -Lh * 0.47, -1, Lh * 0.07, 2); L.lightDot(g, -Lh * 0.02, 0, 'rgba(255,90,90,1)', 0.8);
    for (const s of [-1, 1]) L.box(g, -Lh * 0.05, s * W * 0.38 - 0.8, 3, 1.6, [230, 120, 40]);
  };
  TURRET.destroyer = (R) => (g, P) => { for (const s of [-1, 1]) L.cyl(g, 0, s * 1.4, R * 0.68, 1.5, P.metalL, { brake: false }); P2.chamfer(g, -R * 0.3, -R * 0.26, R * 0.55, R * 0.52, 2); L.fill(g, P.metal, [-R * 0.3, -R * 0.26, R * 0.55, R * 0.52], { bevel: 1 }); };
  BODY.submarine = (R) => (g, P) => {
    const Lh = R * 2.15, W = R * 0.66;
    g.beginPath(); g.ellipse(0, 0, Lh / 2, W / 2, 0, 0, 7); L.fill(g, shade(P.metal, -0.15), [-Lh / 2, -W / 2, Lh, W], { bevel: 1.4 });
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.4; for (let x = -Lh * 0.4; x < Lh * 0.4; x += 3) { g.beginPath(); g.moveTo(x, -W * 0.4); g.lineTo(x, W * 0.4); g.stroke(); }
    P2.rr(g, -Lh * 0.06, -W * 0.2, Lh * 0.2, W * 0.4, 2); L.fill(g, P.hull, [-Lh * 0.06, -W * 0.2, Lh * 0.2, W * 0.4], { bevel: 1 });
    for (const s of [-1, 1]) { g.fillStyle = rgb(P.metalD); P2.poly(g, [[Lh * 0.02, s * W * 0.2], [Lh * 0.08, s * W * 0.2], [Lh * 0.05, s * W * 0.55]]); g.fill(); }
    g.fillStyle = '#111'; g.fillRect(-Lh / 2 - 1, -W * 0.45, 2, W * 0.9);
    L.stripe(g, P, -Lh * 0.32, -1, Lh * 0.14, 2);
  };

  // ---------------------------------------------------------------- public API
  ART.hasTurret = (type) => !!TURRET[type];
  ART.unitBody = function (type, faction, color, R, frame) {
    frame = TRACKED[type] ? (frame | 0) % 3 : 0;
    const key = 'u|' + type + '|' + faction + '|' + color + '|' + frame;
    if (ART.cache.has(key)) return ART.cache.get(key);
    const P = ART.palette(faction, color);
    const f = (BODY[type] || BODY.med_tank)(R);
    return ART.sprite(key, R * 1.4, (g) => f(g, P, frame));
  };
  ART.unitTurret = function (type, faction, color, R) {
    if (!TURRET[type]) return null;
    const key = 't|' + type + '|' + faction + '|' + color;
    if (ART.cache.has(key)) return ART.cache.get(key);
    const P = ART.palette(faction, color);
    const f = TURRET[type](R);
    return ART.sprite(key, R * 1.65, (g) => f(g, P));
  };
  ART.shadowOf = function (type, faction, R) {
    const body = ART.unitBody(type, faction, 0, R, 0);
    return ART.shadowFromSprite('s|' + type + '|' + faction, body, D.UNITS[type] && D.UNITS[type].cls === 'air' ? 1.6 : 1.1, 0.5);
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
