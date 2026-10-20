/* WARFRONT: DOMINION v2 — terrain renderer: tileable procedural material textures blended through
 * domain-warped soft masks, hill relief lighting, shore foam, water depth, layered forests,
 * faceted cliffs, glossy oil fields, crystalline ore, bridges and ground clutter. */
(function (WF) {
  'use strict';
  const ART = WF.ART, P2 = ART.P2, L = ART.L, rgb = ART.rgb, shade = ART.shade, mix = ART.mix;
  const TCOL = { 0: [78, 104, 56], 1: [122, 102, 72], 2: [52, 78, 42], 3: [104, 100, 96], 4: [30, 66, 98], 5: [176, 160, 118], 6: [92, 80, 66], 7: [96, 88, 76], 8: [48, 98, 122] };
  ART.TCOL = TCOL;
  const BR = 4; ART.BASE_RES = BR;

  // ---------------------------------------------------------------- periodic noise for tileable textures
  function pnoise(size, cells, seed) {
    let s = seed >>> 0; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {
      const fx = (x / size) * cells, fy = (y / size) * cells; const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const x0 = ((ix % cells) + cells) % cells, y0 = ((iy % cells) + cells) % cells, x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  }
  function fbm(size, seed, oct) { const ns = []; for (let o = 0; o < oct; o++) ns.push(pnoise(size, 4 << o, seed + o * 101)); return (x, y) => { let v = 0, amp = 0.5, tot = 0; for (const n of ns) { v += n(x, y) * amp; tot += amp; amp *= 0.5; } return v / tot; }; }

  const TEX = {};
  function texture(name, fn) {
    if (TEX[name]) return TEX[name];
    const S = 256; const c = ART.mk(S, S); const g = c.getContext('2d'); const img = g.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const col = fn(x, y); const o = (y * S + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    g.putImageData(img, 0, 0); TEX[name] = c; return c;
  }
  function textures() {
    const S = 256;
    const nA = fbm(S, 11, 5), nB = fbm(S, 23, 4), nC = pnoise(S, 32, 37), nD = pnoise(S, 64, 41);
    return {
      grass: texture('grass', (x, y) => { const v = nA(x, y), f = nC(x, y), b = nD(x, y); const base = mix([66, 92, 46], [104, 128, 64], v); const t = (f - 0.5) * 16 + (b - 0.5) * 8; return [base[0] + t * 0.8, base[1] + t, base[2] + t * 0.5]; }),
      forest: texture('forest', (x, y) => { const v = nA(x + 50, y), f = nC(x, y); const base = mix([38, 56, 30], [62, 82, 42], v); const t = (f - 0.5) * 22; return [base[0] + t * 0.7, base[1] + t, base[2] + t * 0.5]; }),
      dirt: texture('dirt', (x, y) => { const v = nB(x, y), f = nC(x * 1.0, y), b = nD(x, y); const base = mix([96, 78, 54], [138, 114, 80], v); const t = (f - 0.5) * 20 + (b > 0.85 ? 12 : b < 0.1 ? -14 : 0); return [base[0] + t, base[1] + t * 0.9, base[2] + t * 0.7]; }),
      road: texture('road', (x, y) => { const v = nB(x + 90, y), b = nD(x, y), f = nC(x, y); const base = mix([82, 78, 70], [112, 106, 94], v); const t = (b > 0.8 ? 14 : b < 0.15 ? -12 : 0) + (f - 0.5) * 10; return [base[0] + t, base[1] + t, base[2] + t * 0.9]; }),
      sand: texture('sand', (x, y) => { const v = nA(x, y + 70), rip = Math.sin((x * 0.11 + y * 0.05) + nB(x, y) * 6) * 6, b = nD(x, y); const base = mix([170, 150, 108], [206, 190, 146], v); const t = rip + (b - 0.5) * 16; return [base[0] + t, base[1] + t, base[2] + t * 0.8]; }),
      rockg: texture('rockg', (x, y) => { const v = nB(x, y + 40), f = nC(x, y), b = nD(x, y); const base = mix([78, 76, 72], [118, 114, 106], v); const t = (f - 0.5) * 22 + (b - 0.5) * 10; return [base[0] + t, base[1] + t, base[2] + t]; }),
      water: texture('water', (x, y) => { const v = nA(x, y + 120), w = Math.sin(x * 0.09 + nB(x, y) * 8) * 0.5 + 0.5; const base = mix([20, 52, 82], [34, 78, 112], v); const t = w * 10; return [base[0] + t * 0.4, base[1] + t * 0.8, base[2] + t]; }),
      shallow: texture('shallow', (x, y) => { const v = nA(x + 30, y + 120), w = Math.sin(x * 0.12 + y * 0.03 + nB(x, y) * 8) * 0.5 + 0.5; const base = mix([40, 98, 116], [70, 136, 146], v); const t = w * 14; return [base[0] + t * 0.5, base[1] + t * 0.8, base[2] + t * 0.8]; }),
    };
  }

  // ---------------------------------------------------------------- per-map base data (masks, relief)
  ART.terrainBase = function (map) {
    const T = WF.T; const W = map.w * BR, H = map.h * BR;
    const nz = (seed, sc) => { const gw = Math.ceil(W / sc) + 2, gh = Math.ceil(H / sc) + 2; const a = new Float32Array(gw * gh); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = s / 0x7fffffff; } return (x, y) => { x = Math.abs(x); y = Math.abs(y); const fx = x / sc, fy = y / sc; let ix = fx | 0, iy = fy | 0; let tx = fx - ix, ty = fy - iy; ix %= (gw - 1); iy %= (gh - 1); tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); const i = iy * gw + ix; return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + gw] * (1 - tx) + a[i + gw + 1] * tx) * ty; }; };
    const n1 = nz(7, 9), n2 = nz(13, 9), n4 = nz(31, 4);
    const layers = { dirt: [T.DIRT], road: [T.ROAD, T.BRIDGE], sand: [T.SAND], rockg: [T.ROCK], forest: [T.FOREST], shallow: [T.SHALLOW], water: [T.WATER] };
    const masks = {}; const md = {};
    for (const k in layers) { masks[k] = ART.mk(W, H); md[k] = masks[k].getContext('2d').createImageData(W, H); }
    const E = new Float32Array(W * H);
    const lk = {}; for (const k in layers) for (const t of layers[k]) lk[t] = k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = x + (n1(x, y) - 0.5) * BR * 1.9 + (n4(x, y) - 0.5) * BR * 0.6, wy = y + (n2(x, y) - 0.5) * BR * 1.9 + (n4(y + 77, x) - 0.5) * BR * 0.6;
      const tx = Math.min(map.w - 1, Math.max(0, Math.floor(wx / BR))), ty = Math.min(map.h - 1, Math.max(0, Math.floor(wy / BR)));
      const i = ty * map.w + tx; const t = map.t[i];
      // water edges: use the exact tile (less warp) so ships/shore line up
      let tt = t;
      if (t === T.WATER || t === T.SHALLOW || t === T.SAND) { const ex = Math.min(map.w - 1, Math.max(0, Math.floor((x + (n1(x, y) - 0.5) * BR * 1.5) / BR))), ey = Math.min(map.h - 1, Math.max(0, Math.floor((y + (n2(x, y) - 0.5) * BR * 1.5) / BR))); tt = map.t[ey * map.w + ex]; }
      const k = lk[tt]; const o = (y * W + x) * 4;
      if (k) { md[k].data[o + 3] = 255; }
      if (tt === T.BRIDGE) md.water.data[o + 3] = 255;
      E[y * W + x] = map.elev[i];
    }
    // blur + threshold each mask: turns tile staircases into smooth organic contours
    const A = new Float32Array(W * H), Tm = new Float32Array(W * H);
    const smooth = (data, rad, lo, hi) => {
      for (let i = 0; i < W * H; i++) A[i] = data[i * 4 + 3] / 255;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) { let acc = 0; const row = y * W; for (let x = -rad; x <= rad; x++) acc += A[row + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { Tm[row + x] = acc / (2 * rad + 1); acc += A[row + Math.min(W - 1, x + rad + 1)] - A[row + Math.max(0, x - rad)]; } }
        for (let x = 0; x < W; x++) { let acc = 0; for (let y = -rad; y <= rad; y++) acc += Tm[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { A[y * W + x] = acc / (2 * rad + 1); acc += Tm[Math.min(H - 1, y + rad + 1) * W + x] - Tm[Math.max(0, y - rad) * W + x]; } }
      }
      for (let i = 0; i < W * H; i++) { let v = (A[i] - lo) / (hi - lo); v = v < 0 ? 0 : v > 1 ? 1 : v; data[i * 4 + 3] = v * v * (3 - 2 * v) * 255; }
    };
    for (const k in md) {
      if (k === 'sand' || k === 'shallow') smooth(md[k].data, 2, 0.12, 0.38);
      else if (k === 'road') smooth(md[k].data, 2, 0.25, 0.5);
      else smooth(md[k].data, k === 'forest' ? 2 : 3, 0.38, 0.62);
    }
    for (const k in masks) masks[k].getContext('2d').putImageData(md[k], 0, 0);
    // pre-blurred variants at base resolution (cheap here, avoids per-chunk filters)
    const blurred = (src, px) => { const c = ART.mk(W, H); const g = c.getContext('2d'); if ('filter' in g) g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); g.filter = 'none'; return c; };
    masks.water_wet = blurred(masks.water, 1.0); masks.water_foam = blurred(masks.water, 0.7); masks.water_deep = blurred(masks.water, 2.2);

    // relief from blurred elevation
    const blur = (src, rad) => { const tmp = new Float32Array(src.length), out = new Float32Array(src.length); const n = 2 * rad + 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -rad; k <= rad; k++) a += src[y * W + Math.min(W - 1, Math.max(0, x + k))]; tmp[y * W + x] = a / n; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -rad; k <= rad; k++) a += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x]; out[y * W + x] = a / n; } return out; };
    const Eb = blur(blur(E, 3), 2);
    const relief = ART.mk(W, H); const rg = relief.getContext('2d'); const rd = rg.createImageData(W, H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const gx = Eb[y * W + x + 1] - Eb[y * W + x - 1], gy = Eb[(y + 1) * W + x] - Eb[(y - 1) * W + x];
      const l = -(gx + gy) * 2.2; const o = (y * W + x) * 4;
      if (l > 0) { rd.data[o] = 255; rd.data[o + 1] = 250; rd.data[o + 2] = 220; rd.data[o + 3] = Math.min(70, l * 180); }
      else { rd.data[o] = 10; rd.data[o + 1] = 14; rd.data[o + 2] = 6; rd.data[o + 3] = Math.min(120, -l * 220); }
      if (Eb[y * W + x] > 0.05) { rd.data[o + 3] = Math.max(rd.data[o + 3], 0); }
    }
    rg.putImageData(rd, 0, 0);
    // plateau tint
    const plateau = ART.mk(W, H); const pg = plateau.getContext('2d'); const pd = pg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const v = Eb[i]; if (v > 0.02) { pd.data[i * 4] = 230; pd.data[i * 4 + 1] = 225; pd.data[i * 4 + 2] = 170; pd.data[i * 4 + 3] = Math.min(18, v * 18); } }
    pg.putImageData(pd, 0, 0);
    // bridges as oriented structures (PCA over each connected bridge component)
    const bridges = []; const seen = new Uint8Array(map.n);
    for (let i0 = 0; i0 < map.n; i0++) {
      if (seen[i0] || map.t[i0] !== T.BRIDGE) continue;
      const pts = []; const st = [i0]; seen[i0] = 1;
      while (st.length) { const i = st.pop(); const x = i % map.w, y = (i / map.w) | 0; pts.push([x + 0.5, y + 0.5]);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (!map.inb(nx, ny)) continue; const j = ny * map.w + nx; if (!seen[j] && map.t[j] === T.BRIDGE) { seen[j] = 1; st.push(j); } } }
      let mx = 0, my = 0; for (const [x, y] of pts) { mx += x; my += y; } mx /= pts.length; my /= pts.length;
      let cxx = 0, cyy = 0, cxy = 0; for (const [x, y] of pts) { cxx += (x - mx) ** 2; cyy += (y - my) ** 2; cxy += (x - mx) * (y - my); }
      let ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      // prefer the axis joining the two most distant land-touching bridge tiles (bridges span water)
      const ends = pts.filter(([x, y]) => { const tx = x | 0, ty = y | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = ty + dy; if (!map.inb(nx, ny)) continue; const tt = map.t[ny * map.w + nx]; if (tt !== T.WATER && tt !== T.SHALLOW && tt !== T.BRIDGE) return true; } return false; });
      if (ends.length >= 2) { let bd = -1, A = null, B = null; for (let p = 0; p < ends.length; p++) for (let q = p + 1; q < ends.length; q++) { const d = (ends[p][0] - ends[q][0]) ** 2 + (ends[p][1] - ends[q][1]) ** 2; if (d > bd) { bd = d; A = ends[p]; B = ends[q]; } } if (bd >= 4) ang = Math.atan2(B[1] - A[1], B[0] - A[0]); }
      const ux = Math.cos(ang), uy = Math.sin(ang);
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const [x, y] of pts) { const a = (x - mx) * ux + (y - my) * uy, bb = -(x - mx) * uy + (y - my) * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb); }
      bridges.push({ x: (mx + ux * (a0 + a1) / 2 - uy * (b0 + b1) / 2) * 32, y: (my + uy * (a0 + a1) / 2 + ux * (b0 + b1) / 2) * 32, ang, len: (a1 - a0 + 1.2) * 32, wid: Math.min(3, Math.max(1.8, b1 - b0 + 0.9)) * 32 });
    }
    return { masks, relief, plateau, tex: textures(), W, H, bridges };
  };

  // ---------------------------------------------------------------- per-tile clutter helpers
  const hash = (i, k) => { let x = (i * 374761393 + k * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  function tuft(g, x, y, s, dark) {
    g.strokeStyle = dark ? 'rgba(40,62,26,0.75)' : 'rgba(140,170,86,0.7)'; g.lineWidth = 0.8;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 0.8, y); g.quadraticCurveTo(x + k * 1.4, y - s * 0.6, x + k * 2.2, y - s); g.stroke(); }
  }
  function bush(g, x, y, r, i) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 2, y + 2.5, r * 1.1, r * 0.8, 0, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + hash(i, k) * 2, rr = r * (0.5 + hash(i, k + 5) * 0.4); const cx = x + Math.cos(a) * r * 0.4, cy = y + Math.sin(a) * r * 0.35;
      const gr = g.createRadialGradient(cx - rr * 0.4, cy - rr * 0.4, 0.5, cx, cy, rr); gr.addColorStop(0, '#6c9a48'); gr.addColorStop(1, '#2c4a22'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill(); }
  }
  function stone(g, x, y, s, i) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 1, y + 1.2, s, s * 0.7, 0, 0, 7); g.fill();
    const col = shade([132, 128, 118], (hash(i, 3) - 0.5) * 0.3); g.fillStyle = rgb(col);
    P2.poly(g, [[x - s, y], [x - s * 0.4, y - s * 0.8], [x + s * 0.6, y - s * 0.6], [x + s, y + s * 0.1], [x + s * 0.3, y + s * 0.7], [x - s * 0.6, y + s * 0.6]]); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; P2.poly(g, [[x - s * 0.4, y - s * 0.8], [x + s * 0.6, y - s * 0.6], [x, y - s * 0.1]]); g.fill();
  }
  function tree(g, x, y, r, i, conifer) {
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(x + r * 0.45, y + r * 0.55, r * 1.05, r * 0.85, 0.4, 0, 7); g.fill();
    if (conifer) {
      const n = 8; for (let layer = 0; layer < 3; layer++) {
        const rr = r * (1 - layer * 0.28); g.beginPath();
        for (let k = 0; k < n * 2; k++) { const a = k * Math.PI / n + layer * 0.3, q = k % 2 ? rr * 0.55 : rr; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
        g.closePath(); const gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.35, 0.5, x, y, rr); gr.addColorStop(0, layer === 2 ? '#5f8f4a' : '#3f6e3a'); gr.addColorStop(1, '#1b3418'); g.fillStyle = gr; g.fill();
      }
      return;
    }
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + hash(i, k + 3), rr = r * (0.45 + hash(i, k + 9) * 0.25); const cx = x + Math.cos(a) * r * 0.42, cy = y + Math.sin(a) * r * 0.42;
      const gr = g.createRadialGradient(cx - rr * 0.45, cy - rr * 0.45, 0.4, cx, cy, rr); gr.addColorStop(0, '#6a9c4c'); gr.addColorStop(0.65, '#3b6a2e'); gr.addColorStop(1, '#22401c');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill();
    }
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 0.5, x, y, r * 0.6); gr.addColorStop(0, 'rgba(160,200,110,0.55)'); gr.addColorStop(1, 'rgba(160,200,110,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill();
  }
  function boulder(g, x, y, s, i) {
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(x + s * 0.35, y + s * 0.45, s * 1.05, s * 0.85, 0.3, 0, 7); g.fill();
    const pts = []; const n = 7; for (let q = 0; q < n; q++) { const a = q / n * Math.PI * 2, r = s * (0.78 + hash(i, q) * 0.3); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.86]); }
    const col = shade([118, 112, 102], (hash(i, 20) - 0.5) * 0.25);
    P2.poly(g, pts); g.fillStyle = rgb(shade(col, -0.25)); g.fill();
    // lit facets (north-west)
    const top = [[x - s * 0.15, y - s * 0.2]]; for (let q = 3; q <= 6; q++) top.push(pts[q % n]);
    P2.poly(g, [[x - s * 0.1, y - s * 0.1], pts[4], pts[5], pts[6], pts[0]]); g.fillStyle = rgb(col); g.fill();
    P2.poly(g, [[x - s * 0.1, y - s * 0.1], pts[4], pts[5]]); g.fillStyle = rgb(shade(col, 0.25)); g.fill();
    g.strokeStyle = 'rgba(20,18,16,0.55)'; g.lineWidth = 0.6; P2.poly(g, pts); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(x - s * 0.1, y - s * 0.1); g.lineTo(pts[1][0], pts[1][1]); g.stroke();
  }

  const PROPS = {};
  /** Pre-rendered prop variants (trees, conifers, boulders) drawn at size 12 inside a 40px box. */
  function propSprite(kind, v) {
    const key = kind + v; if (PROPS[key]) return PROPS[key];
    const c = ART.mk(80, 80); const g = c.getContext('2d'); g.scale(2, 2);
    const i = v * 7919 + (kind === 'b' ? 13 : kind === 'c' ? 29 : 3);
    if (kind === 'b') boulder(g, 18, 18, 12, i); else tree(g, 18, 18, 12, i, kind === 'c');
    PROPS[key] = c; return c;
  }

  function bushSprite(v) { const key = 'bush' + v; if (PROPS[key]) return PROPS[key]; const c = ART.mk(80, 80); const g = c.getContext('2d'); g.scale(2, 2); bush(g, 18, 18, 12, v * 31 + 5); PROPS[key] = c; return c; }

  /** Render one terrain chunk (cx,cy in chunk units of size CH tiles) at 1 world px = 1 canvas px. */
  ART.terrainChunk = function (map, base, cx, cy, CH, deposits) {
    const T = WF.T; const px = CH * 32;
    const c = ART.mk(px, px); const g = c.getContext('2d');
    const tx0 = cx * CH, ty0 = cy * CH; const k = 32 / BR;
    const tmp = ART.mk(px, px); const tg = tmp.getContext('2d');
    // 1. grass base
    g.fillStyle = g.createPattern(base.tex.grass, 'repeat'); g.save(); g.translate(-tx0 * 32, -ty0 * 32); g.fillRect(tx0 * 32, ty0 * 32, px, px); g.restore();
    const sx0 = Math.max(0, tx0 * BR - 3), sy0 = Math.max(0, ty0 * BR - 3);
    const sw = Math.min(base.W - sx0, CH * BR + 6), sh = Math.min(base.H - sy0, CH * BR + 6);
    const dx = (sx0 - tx0 * BR) * k, dy = (sy0 - ty0 * BR) * k;
    // which materials occur in (or right next to) this chunk?
    const has = {};
    for (let ty = ty0 - 2; ty < ty0 + CH + 2; ty++) for (let tx = tx0 - 2; tx < tx0 + CH + 2; tx++) if (map.inb(tx, ty)) has[map.t[map.idx(tx, ty)]] = 1;
    const any = (...ts) => ts.some((t) => has[t]);
    const layer = (mask, tex, alpha, blurPx, tint) => {
      tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, px, px); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
      if (blurPx && 'filter' in tg) tg.filter = `blur(${blurPx}px)`;
      tg.drawImage(mask, sx0, sy0, sw, sh, dx, dy, sw * k, sh * k); tg.filter = 'none';
      tg.globalCompositeOperation = 'source-in';
      if (tex) { tg.fillStyle = tg.createPattern(tex, 'repeat'); tg.save(); tg.translate(-tx0 * 32, -ty0 * 32); tg.fillRect(tx0 * 32, ty0 * 32, px, px); tg.restore(); }
      else { tg.fillStyle = tint; tg.fillRect(0, 0, px, px); }
      g.globalAlpha = alpha; g.drawImage(tmp, 0, 0); g.globalAlpha = 1;
    };
    if (any(T.FOREST)) layer(base.masks.forest, base.tex.forest, 1, 0);
    if (any(T.DIRT)) layer(base.masks.dirt, base.tex.dirt, 1, 0);
    if (any(T.ROCK)) layer(base.masks.rockg, base.tex.rockg, 1, 0);
    if (any(T.ROAD, T.BRIDGE)) layer(base.masks.road, base.tex.road, 1, 0);
    if (any(T.SAND)) layer(base.masks.sand, base.tex.sand, 1, 0);
    if (any(T.WATER, T.SHALLOW, T.BRIDGE)) {
    // wet sand / foam band around water
    layer(base.masks.water_wet, null, 0.55, 0, 'rgba(70,64,48,1)');
    layer(base.masks.shallow, base.tex.shallow, 1, 0);
    layer(base.masks.water_foam, null, 0.45, 0, 'rgba(235,245,250,1)'); // foam
    layer(base.masks.water, base.tex.water, 1, 0);
    layer(base.masks.water_deep, null, 0.35, 0, 'rgba(8,22,40,1)'); // deeper in the middle
    }
    // relief & plateau
    g.imageSmoothingEnabled = true; g.drawImage(base.plateau, sx0, sy0, sw, sh, dx, dy, sw * k, sh * k);
    g.drawImage(base.relief, sx0, sy0, sw, sh, dx, dy, sw * k, sh * k);

    // 2. per-tile clutter
    for (let ty = ty0 - 1; ty < ty0 + CH + 1; ty++) for (let tx = tx0 - 1; tx < tx0 + CH + 1; tx++) {
      if (!map.inb(tx, ty)) continue;
      const i = map.idx(tx, ty), t = map.t[i]; const x = (tx - tx0) * 32, y = (ty - ty0) * 32; const h = (q) => hash(i, q);
      if (t === T.GRASS) {
        for (let q = 0; q < 3; q++) if (h(q) < 0.55) tuft(g, x + h(q + 10) * 30, y + h(q + 20) * 30, 2.5 + h(q + 30) * 2.5, h(q + 40) < 0.5);
        if (h(50) < 0.06) { const fx = x + h(51) * 28, fy = y + h(52) * 28; for (let q = 0; q < 5; q++) { g.fillStyle = h(53) < 0.5 ? 'rgba(240,226,120,0.85)' : 'rgba(235,235,245,0.85)'; g.beginPath(); g.arc(fx + Math.cos(q * 1.26) * 1.4, fy + Math.sin(q * 1.26) * 1.4, 0.9, 0, 7); g.fill(); } }
        if (h(60) < 0.045) { const bs = 4 + h(63) * 3, sc = bs / 12; g.drawImage(bushSprite((i % 6)), x + 8 + h(61) * 16 - 20 * sc, y + 8 + h(62) * 16 - 20 * sc, 40 * sc, 40 * sc); }
        if (h(70) < 0.03) stone(g, x + 6 + h(71) * 20, y + 6 + h(72) * 20, 1.6 + h(73) * 1.8, i);
      } else if (t === T.DIRT) {
        if (h(1) < 0.4) stone(g, x + h(2) * 28, y + h(3) * 28, 1 + h(4) * 1.5, i);
        if (h(5) < 0.25) { g.strokeStyle = 'rgba(50,38,24,0.4)'; g.lineWidth = 0.6; const sx = x + h(6) * 26, sy = y + h(7) * 26; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 3, sy + 2); g.lineTo(sx + 4, sy + 6); g.stroke(); }
      } else if (t === T.ROAD) {
        // tire tracks along the road
        g.strokeStyle = 'rgba(40,36,30,0.18)'; g.lineWidth = 1.4;
        const hor = map.inb(tx + 1, ty) && map.t[i + 1] === T.ROAD || map.inb(tx - 1, ty) && map.t[i - 1] === T.ROAD;
        if (hor) { g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 32, y + 12); g.moveTo(x, y + 20); g.lineTo(x + 32, y + 20); g.stroke(); }
        else { g.beginPath(); g.moveTo(x + 12, y); g.lineTo(x + 12, y + 32); g.moveTo(x + 20, y); g.lineTo(x + 20, y + 32); g.stroke(); }
      } else if (t === T.SAND) {
        if (h(1) < 0.12) { g.fillStyle = 'rgba(245,235,220,0.8)'; g.beginPath(); g.ellipse(x + h(2) * 28, y + h(3) * 28, 1.4, 0.9, h(4) * 3, 0, 7); g.fill(); } // shells
      }
    }
    // 3. deposits
    for (const d of deposits) {
      if (d.tx < tx0 - 2 || d.ty < ty0 - 2 || d.tx > tx0 + CH + 1 || d.ty > ty0 + CH + 1) continue;
      const x = (d.tx - tx0) * 32 + 32, y = (d.ty - ty0) * 32 + 32;
      if (d.kind === 'oil') {
        const gr = g.createRadialGradient(x, y, 2, x, y, 30); gr.addColorStop(0, 'rgba(6,5,6,0.98)'); gr.addColorStop(0.65, 'rgba(16,12,12,0.85)'); gr.addColorStop(1, 'rgba(20,16,14,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 30, 24, 0.3, 0, 7); g.fill();
        const sh = g.createLinearGradient(x - 14, y - 10, x + 12, y + 8); sh.addColorStop(0, 'rgba(160,90,220,0.35)'); sh.addColorStop(0.4, 'rgba(60,200,190,0.3)'); sh.addColorStop(0.7, 'rgba(230,200,80,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh; g.beginPath(); g.ellipse(x - 3, y - 2, 16, 9, 0.3, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - 8, y - 6, 4, 1.3, 0.3, 0, 7); g.fill();
        for (let q = 0; q < 4; q++) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(x + Math.cos(q * 1.6) * 20, y + Math.sin(q * 1.6) * 15, 2.5, 0, 7); g.stroke(); }
      } else {
        for (let q = 0; q < 12; q++) {
          const a = q * 2.4, r = 5 + (q % 4) * 5; const ox = x + Math.cos(a) * r, oy = y + Math.sin(a) * r * 0.8; const s = 4 + (q % 3) * 2.2;
          const col = q % 3 === 0 ? [214, 140, 70] : q % 3 === 1 ? [170, 180, 188] : [150, 108, 70];
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(ox + 1.5, oy + 2, s * 0.9, s * 0.6, 0, 0, 7); g.fill();
          P2.poly(g, [[ox, oy - s * 1.2], [ox + s * 0.7, oy - s * 0.2], [ox + s * 0.4, oy + s * 0.7], [ox - s * 0.5, oy + s * 0.6], [ox - s * 0.7, oy - s * 0.3]]); g.fillStyle = rgb(shade(col, -0.25)); g.fill();
          P2.poly(g, [[ox, oy - s * 1.2], [ox + s * 0.7, oy - s * 0.2], [ox + s * 0.05, oy]]); g.fillStyle = rgb(shade(col, 0.3)); g.fill();
          P2.poly(g, [[ox, oy - s * 1.2], [ox + s * 0.05, oy], [ox - s * 0.7, oy - s * 0.3]]); g.fillStyle = rgb(col); g.fill();
          if (q % 4 === 0) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(ox - 0.5, oy - s, 1, 1); }
        }
      }
    }
    // 4. bridges (oriented decks with girders and rails)
    for (const br of base.bridges || []) {
      const bx = br.x - tx0 * 32, by = br.y - ty0 * 32; const R = Math.max(br.len, br.wid);
      if (bx < -R || by < -R || bx > px + R || by > px + R) continue;
      g.save(); g.translate(bx, by); g.rotate(br.ang);
      const L2 = br.len / 2, W2 = br.wid / 2;
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(-L2 + 6, -W2 + 8, br.len, br.wid);
      // pylons
      for (let x = -L2 + 18; x < L2 - 10; x += 34) { g.fillStyle = '#4a4a46'; g.fillRect(x - 4, -W2 - 3, 8, br.wid + 6); }
      // deck
      const dg = g.createLinearGradient(0, -W2, 0, W2); dg.addColorStop(0, '#7a644a'); dg.addColorStop(0.5, '#664f38'); dg.addColorStop(1, '#4e3b29');
      g.fillStyle = dg; g.fillRect(-L2, -W2, br.len, br.wid);
      g.strokeStyle = 'rgba(25,18,10,0.7)'; g.lineWidth = 1; for (let x = -L2; x <= L2; x += 4) { g.beginPath(); g.moveTo(x, -W2); g.lineTo(x, W2); g.stroke(); }
      g.fillStyle = 'rgba(255,240,200,0.07)'; for (let x = -L2 + 1; x < L2; x += 8) g.fillRect(x, -W2, 1.4, br.wid);
      // asphalt strip & lane marks
      g.fillStyle = 'rgba(60,58,54,0.55)'; g.fillRect(-L2, -W2 * 0.55, br.len, W2 * 1.1);
      g.strokeStyle = 'rgba(230,220,180,0.55)'; g.setLineDash([7, 6]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-L2 + 4, 0); g.lineTo(L2 - 4, 0); g.stroke(); g.setLineDash([]);
      // steel girders / rails
      for (const s2 of [-1, 1]) { const y = s2 * (W2 - 1.5); g.fillStyle = '#8c8c86'; g.fillRect(-L2, y - 1.6, br.len, 3.2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-L2, y - 1.6, br.len, 1); for (let x = -L2 + 6; x < L2; x += 10) { g.fillStyle = '#5c5c58'; g.fillRect(x, y - 2.4, 2, 4.8); } }
      g.fillStyle = '#3a3a36'; g.fillRect(-L2 - 3, -W2 - 2, 6, br.wid + 4); g.fillRect(L2 - 3, -W2 - 2, 6, br.wid + 4);
      g.restore();
    }
    // 5. cliffs and trees (overlapping tiles; sorted top-down)
    const objs = [];
    for (let ty = ty0 - 1; ty < ty0 + CH + 1; ty++) for (let tx = tx0 - 1; tx < tx0 + CH + 1; tx++) {
      if (!map.inb(tx, ty)) continue;
      const i = map.idx(tx, ty), t = map.t[i]; const x = (tx - tx0) * 32, y = (ty - ty0) * 32;
      if (t === T.ROCK) for (let q = 0; q < 3; q++) objs.push({ k: 'b', x: x + 6 + hash(i, q) * 20, y: y + 6 + hash(i, q + 4) * 20, s: 9 + hash(i, q + 8) * 8, i: i * 3 + q });
      else if (t === T.FOREST) for (let q = 0; q < 3; q++) objs.push({ k: 't', x: x + 5 + hash(i, q) * 22, y: y + 5 + hash(i, q + 4) * 22, s: 8 + hash(i, q + 8) * 6, i: i * 3 + q, c: hash(i, q + 12) < 0.3 });
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) {
      const v = (o.i * 2654435761 >>> 0) % 12; const spr = o.k === 'b' ? propSprite('b', v) : propSprite(o.c ? 'c' : 't', v);
      const sc = o.s / 12; g.drawImage(spr, o.x - 20 * sc, o.y - 20 * sc, 40 * sc, 40 * sc);
    }
    return c;
  };

  /** Minimap terrain image (2px per tile). */
  ART.minimapBase = function (map) {
    const c = ART.mk(map.w * 2, map.h * 2); const g = c.getContext('2d'); const img = g.createImageData(map.w * 2, map.h * 2);
    for (let y = 0; y < map.h * 2; y++) for (let x = 0; x < map.w * 2; x++) {
      const i = ((y >> 1) * map.w + (x >> 1)); let col = TCOL[map.t[i]]; if (map.t[i] === 2) col = [40, 70, 34]; if (map.elev[i] && map.t[i] !== 4) col = shade(col, 0.15);
      const o = (y * map.w * 2 + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const d of map.deposits) { g.fillStyle = d.kind === 'oil' ? '#111' : '#d88a40'; g.fillRect(d.tx * 2, d.ty * 2, 4, 4); }
    return c;
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
