/* WARFRONT: DOMINION — battlefield renderer: camera, chunked terrain, units, buildings, projectiles,
 * particle effects, fog of war overlay, last-known building ghosts, overlays and minimap. */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, ART = WF.ART, TILE = U.TILE;
  const CH = 16; // chunk size in tiles (512 px)

  class Particles {
    constructor(max) { this.max = max; this.list = []; }
    add(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(p); return p; }
    update(dt) {
      const l = this.list; let j = 0;
      for (let i = 0; i < l.length; i++) {
        const p = l[i]; p.t += dt;
        if (p.t >= p.life) continue;
        p.x += p.vx * dt; p.y += p.vy * dt; if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
        l[j++] = p;
      }
      l.length = j;
    }
  }

  const SOFT = new Map();
  /** Pre-baked soft radial sprite (avoids per-frame gradient creation on mobile GPUs). */
  function soft(key, stops) {
    let c = SOFT.get(key); if (c) return c;
    c = ART.mk(64, 64); const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SOFT.set(key, c); return c;
  }
  const smokeSprite = (gv) => { const v = Math.round(gv / 30) * 30; return soft('sm' + v, [[0, `rgba(${v},${v},${v},1)`], [0.55, `rgba(${v},${v},${v},0.75)`], [1, `rgba(${v},${v},${v},0)`]]); };
  const fireSprite = () => soft('fire', [[0, 'rgba(255,250,215,1)'], [0.35, 'rgba(255,170,60,0.9)'], [1, 'rgba(160,40,0,0)']]);
  const flameSprite = () => soft('flame', [[0, 'rgba(255,220,120,0.95)'], [1, 'rgba(255,80,0,0)']]);
  const flashSprite = (col) => soft('fl' + col, [[0, `rgba(${col},1)`], [1, `rgba(${col},0)`]]);
  const scorchSprite = () => soft('scorch', [[0, 'rgba(18,14,10,0.42)'], [0.6, 'rgba(18,14,10,0.25)'], [1, 'rgba(18,14,10,0)']]);
  const dustSprite = () => soft('dust', [[0, 'rgba(150,130,100,1)'], [1, 'rgba(150,130,100,0)']]);
  function blit(g, img, x, y, r, a) { if (a <= 0.01) return; g.globalAlpha = Math.min(1, a); g.drawImage(img, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }

  class Renderer {
    constructor(canvas, world, viewerPid, settings) {
      this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false });
      this.w = world; this.pid = viewerPid; this.team = world.players[viewerPid].team;
      this.settings = settings || {};
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.chunks = new Map(); this.chunkOrder = [];
      this.base = ART.terrainBase(world.map);
      this.minibase = ART.minimapBase(world.map);
      this.fogCv = ART.mk(world.map.w, world.map.h); this.fogG = this.fogCv.getContext('2d');
      this.fogImg = this.fogG.createImageData(world.map.w, world.map.h);
      this.fx = new Particles(this.settings.lowFx ? 500 : 1400);
      this.decals = [];
      this.rubble = [];
      this.ghosts = new Map();
      this.markers = [];
      this.time = 0;
      this.revealAll = false;
      this.dpr = 1;
      this.shake = 0;
      this.resize();
      this.updateFog();
      this.centerOn(world.players[viewerPid]);
    }

    centerOn(p) {
      const hq = this.w.ents.find((e) => e.owner === p.id && e.type === 'hq') || this.w.ents.find((e) => e.owner === p.id);
      if (hq) { this.cam.x = hq.x + 120; this.cam.y = hq.y - 40; }
      if (this.sh && this.sh < 520) this.cam.zoom = 1.25;
      this.clampCam();
    }

    resize() {
      const dprCap = this.settings.quality === 'low' ? 1 : this.settings.quality === 'high' ? 2.5 : 1.75;
      if (this.dprScale == null) this.dprScale = 1;
      this.dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, dprCap) * this.dprScale);
      const r = this.cv.getBoundingClientRect();
      this.sw = Math.max(1, r.width); this.sh = Math.max(1, r.height);
      this.cv.width = Math.round(this.sw * this.dpr); this.cv.height = Math.round(this.sh * this.dpr);
      this.minZoom = Math.max(0.28, Math.min(this.sw / this.w.map.pw, this.sh / this.w.map.ph));
      this.clampCam();
    }

    clampCam() {
      const c = this.cam; c.zoom = U.clamp(c.zoom, this.minZoom || 0.3, 2.4);
      const hw = this.sw / 2 / c.zoom, hh = this.sh / 2 / c.zoom; const pw = this.w.map.pw, ph = this.w.map.ph;
      c.x = pw > hw * 2 ? U.clamp(c.x, hw - 40, pw - hw + 40) : pw / 2;
      c.y = ph > hh * 2 ? U.clamp(c.y, hh - 40, ph - hh + 120) : ph / 2;
    }
    screenToWorld(sx, sy) { const c = this.cam; return { x: c.x + (sx - this.sw / 2) / c.zoom, y: c.y + (sy - this.sh / 2) / c.zoom }; }
    worldToScreen(x, y) { const c = this.cam; return { x: (x - c.x) * c.zoom + this.sw / 2, y: (y - c.y) * c.zoom + this.sh / 2 }; }

    // ------------------------------------------------------------ fog
    tileVisible(x, y) {
      if (this.revealAll) return true;
      const m = this.w.map; const tx = (x / TILE) | 0, ty = (y / TILE) | 0; if (!m.inb(tx, ty)) return false;
      return this.w.fog[this.team].vis[ty * m.w + tx] === 1;
    }
    tileExplored(x, y) { const m = this.w.map; const tx = (x / TILE) | 0, ty = (y / TILE) | 0; return m.inb(tx, ty) && this.w.fog[this.team].exp[ty * m.w + tx] === 1; }
    updateFog() {
      const f = this.w.fog[this.team]; const d = this.fogImg.data; const n = this.w.map.n;
      for (let i = 0; i < n; i++) {
        const o = i * 4; d[o] = 6; d[o + 1] = 9; d[o + 2] = 12;
        d[o + 3] = this.revealAll ? 0 : f.vis[i] ? 0 : f.exp[i] ? 140 : 250;
      }
      this.fogG.putImageData(this.fogImg, 0, 0);
      // ghosts: remember last seen enemy structures; forget when location is seen empty
      for (const e of this.w.ents) {
        if (e.dead || e.kind !== 'bld' || !this.w.isEnemy(e.owner, this.pid)) continue;
        if (this.w.visibleTo(e, this.team)) this.ghosts.set(e.id, { id: e.id, type: e.type, owner: e.owner, x: e.x, y: e.y, tx: e.tx, ty: e.ty, w: e.w, h: e.h, built: e.built, hp: e.hp / e.maxHp });
      }
      for (const [id, gh] of this.ghosts) {
        const e = this.w.byId.get(id);
        if (!e || e.dead) {
          let seen = false; for (let y = gh.ty; y < gh.ty + gh.h && !seen; y++) for (let x = gh.tx; x < gh.tx + gh.w; x++) if (f.vis[y * this.w.map.w + x]) { seen = true; break; }
          if (seen) this.ghosts.delete(id);
        }
      }
    }

    // ------------------------------------------------------------ events -> effects
    consumeEvents(audio) {
      const ev = this.w.events; const own = this.pid;
      for (const e of ev) {
        const vis = e.x == null || this.tileVisible(e.x, e.y) || e.owner === own;
        switch (e.e) {
          case 'fire': if (vis) { this.muzzle(e); if (audio) audio.weapon(e.snd, e.x, e.y, this.cam); } break;
          case 'impact': if (vis || this.tileVisible(e.x, e.y)) { this.impactFx(e); if (audio && (e.splash > 20 || e.kind === 'shell' || e.kind === 'nuke')) audio.impact(e, this.cam); } break;
          case 'death': if (vis) { this.deathFx(e); if (audio) audio.explosion(e.kind === 'bld' ? 2 : e.cls === 'inf' ? 0 : 1, e.x, e.y, this.cam); } else if (e.kind === 'bld') this.rubbleAt(e); break;
          case 'weld': if (vis) for (let i = 0; i < 2; i++) this.fx.add({ k: 'spark', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, t: 0, life: 0.35, drag: 2 }); break;
          case 'repair': if (vis) this.fx.add({ k: 'plus', x: e.x + (Math.random() - 0.5) * 10, y: e.y, vx: 0, vy: -18, t: 0, life: 0.8 }); break;
          case 'built': if (e.owner === own && audio) audio.ui('built'); break;
          case 'unit_ready': if (e.owner === own && audio) audio.ui('ready'); break;
          case 'research': if (e.owner === own && audio) audio.ui('research'); break;
          case 'launch': if (audio) audio.ui('alarm'); this.fx.add({ k: 'flash', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.6, r: 80 }); break;
          case 'order': break;
        }
      }
      ev.length = 0;
    }

    muzzle(e) {
      const w = D.WEAPONS[e.w]; if (!w) return;
      const big = w.recoil >= 4 || w.indirect;
      this.fx.add({ k: 'flash', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: big ? 0.12 : 0.06, r: big ? 14 : 6, a: e.a, cone: w.proj !== 'missile' && w.proj !== 'artyrocket' });
      if (big || w.proj === 'rocket' || w.proj === 'artyrocket' || w.proj === 'missile') for (let i = 0; i < (big ? 4 : 2); i++) this.fx.add({ k: 'smoke', x: e.x, y: e.y, vx: Math.cos(e.a) * 20 + (Math.random() - 0.5) * 30, vy: Math.sin(e.a) * 20 + (Math.random() - 0.5) * 30, t: 0, life: 0.9 + Math.random() * 0.6, r: big ? 6 : 4, g: 160, drag: 1.5 });
      if (big) this.shakeAt(e.x, e.y, 0.6);
    }
    impactFx(e) {
      const s = e.splash;
      if (e.water) {
        this.fx.add({ k: 'ring', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.6, r: Math.max(8, s * 0.6), col: '200,235,255' });
        for (let i = 0; i < 5; i++) this.fx.add({ k: 'droplet', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, t: 0, life: 0.5, drag: 2 });
        return;
      }
      if (e.kind === 'nuke') return this.bigBoom(e.x, e.y, s);
      if (e.kind === 'bullet') {
        this.fx.add({ k: 'spark', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, t: 0, life: 0.18, drag: 3 });
        if (!e.hit) this.fx.add({ k: 'dust', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.5, r: 3 });
        return;
      }
      if (e.type === 'flak') { this.fx.add({ k: 'puff', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.7, r: 9 }); this.fx.add({ k: 'flash', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.08, r: 10 }); return; }
      if (e.kind === 'plasma') { this.fx.add({ k: 'flash', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.18, r: 14, col: '120,255,255' }); this.fx.add({ k: 'ring', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.3, r: 14, col: '140,255,255' }); return; }
      const r = Math.max(8, s || (e.kind === 'shell' ? 10 : 8));
      this.explosion(e.x, e.y, r, s > 30);
      if (!e.air) this.decal(e.x, e.y, r * 0.8);
    }
    explosion(x, y, r, big) {
      this.fx.add({ k: 'flash', x, y, vx: 0, vy: 0, t: 0, life: 0.12, r: r * 1.6 });
      this.fx.add({ k: 'fireball', x, y, vx: 0, vy: 0, t: 0, life: 0.45 + r * 0.004, r: r * 0.9 });
      const n = big ? 6 : 3;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 10 + Math.random() * r; this.fx.add({ k: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 1.2 + Math.random() * 1.2, r: r * 0.45, g: 70, drag: 1.2 }); }
      for (let i = 0; i < n + 2; i++) { const a = Math.random() * 6.28, sp = 60 + Math.random() * 120; this.fx.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.3 + Math.random() * 0.3, drag: 2.5 }); }
      if (big) { this.fx.add({ k: 'ring', x, y, vx: 0, vy: 0, t: 0, life: 0.35, r: r * 1.6, col: '255,230,180' }); this.shakeAt(x, y, r / 20); }
    }
    bigBoom(x, y, r) {
      this.fx.add({ k: 'flash', x, y, vx: 0, vy: 0, t: 0, life: 0.8, r: r * 2.5 });
      this.fx.add({ k: 'ring', x, y, vx: 0, vy: 0, t: 0, life: 1.2, r: r * 2, col: '255,240,200' });
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = Math.random() * r; this.fx.add({ k: 'fireball', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: 0, vy: 0, t: -Math.random() * 0.4, life: 0.9, r: 20 + Math.random() * 20 }); }
      for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, sp = 20 + Math.random() * 80; this.fx.add({ k: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 4 + Math.random() * 3, r: 26 + Math.random() * 20, g: 60, drag: 0.6 }); }
      this.decal(x, y, r * 1.1); this.shake = Math.max(this.shake, 14);
    }
    deathFx(e) {
      if (e.kind === 'bld') {
        const R = Math.max(e.w, e.h) * 16;
        for (let i = 0; i < 6; i++) { const ox = (Math.random() - 0.5) * R * 1.4, oy = (Math.random() - 0.5) * R * 1.4; this.explosion(e.x + ox, e.y + oy, 16 + Math.random() * 14, i % 2 === 0); }
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, sp = 40 + Math.random() * 90; this.fx.add({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.8 + Math.random() * 0.5, drag: 2, rot: Math.random() * 6 }); }
        this.rubbleAt(e); this.shakeAt(e.x, e.y, 6);
      } else if (e.cls === 'inf') {
        this.fx.add({ k: 'dust', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.9, r: 8 });
        this.decals.push({ x: e.x, y: e.y, r: 5, k: 'blood', t: 0 });
      } else {
        this.explosion(e.x, e.y, e.r * 1.4, true);
        for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, sp = 50 + Math.random() * 100; this.fx.add({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.7 + Math.random() * 0.4, drag: 2.2, rot: Math.random() * 6 }); }
        if (e.cls !== 'air' && e.cls !== 'naval') this.decals.push({ x: e.x, y: e.y, r: e.r, k: 'wreck', t: 0, a: Math.random() * 6.28 });
        if (e.cls === 'naval') this.fx.add({ k: 'ring', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 1, r: e.r * 2, col: '200,235,255' });
      }
      if (this.decals.length > 260) this.decals.splice(0, this.decals.length - 260);
    }
    rubbleAt(e) { this.rubble.push({ tx: e.tx, ty: e.ty, w: e.w, h: e.h, seed: e.id }); if (this.rubble.length > 120) this.rubble.shift(); }
    decal(x, y, r) { if (this.settings.lowFx) return; this.decals.push({ x, y, r, k: 'scorch', t: 0 }); if (this.decals.length > 260) this.decals.shift(); }
    shakeAt(x, y, amt) { if (this.settings.shake === false) return; const s = this.worldToScreen(x, y); if (s.x > -100 && s.y > -100 && s.x < this.sw + 100 && s.y < this.sh + 100) this.shake = Math.min(12, this.shake + amt); }

    // ------------------------------------------------------------ terrain chunks
    chunk(cx, cy) {
      const k = cx + ',' + cy; let c = this.chunks.get(k);
      if (!c) {
        c = ART.terrainChunk(this.w.map, this.base, cx, cy, CH, this.w.map.deposits);
        this.chunks.set(k, c); this.chunkOrder.push(k);
        const maxC = this.settings.quality === 'low' ? 16 : 30;
        while (this.chunkOrder.length > maxC) { const old = this.chunkOrder.shift(); this.chunks.delete(old); }
      }
      return c;
    }
    prewarm(n) { // build a few chunks per frame around camera to avoid hitches
      const m = this.w.map; let built = 0;
      const ccx = Math.floor(this.cam.x / (CH * TILE)), ccy = Math.floor(this.cam.y / (CH * TILE));
      for (let r = 0; r < 3 && built < n; r++) for (let dy = -r; dy <= r && built < n; dy++) for (let dx = -r; dx <= r && built < n; dx++) {
        const cx = ccx + dx, cy = ccy + dy; if (cx < 0 || cy < 0 || cx * CH >= m.w || cy * CH >= m.h) continue;
        if (!this.chunks.has(cx + ',' + cy)) { this.chunk(cx, cy); built++; }
      }
    }

    // ------------------------------------------------------------ main draw
    draw(alpha, dt, ui) {
      this.time += dt;
      const g = this.g, w = this.w, c = this.cam;
      this.fx.update(dt);
      if (this.fogDirty !== w.tick && w.tick % 5 === 0) { this.updateFog(); this.fogDirty = w.tick; }
      // camera shake
      let sx = 0, sy = 0; if (this.shake > 0.1) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dt); } else this.shake = 0;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#05080a'; g.fillRect(0, 0, this.sw, this.sh);
      g.setTransform(this.dpr * c.zoom, 0, 0, this.dpr * c.zoom, this.dpr * (this.sw / 2 - c.x * c.zoom + sx), this.dpr * (this.sh / 2 - c.y * c.zoom + sy));
      const vx0 = c.x - this.sw / 2 / c.zoom - 64, vy0 = c.y - this.sh / 2 / c.zoom - 64, vx1 = c.x + this.sw / 2 / c.zoom + 64, vy1 = c.y + this.sh / 2 / c.zoom + 64;
      this.view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
      const inView = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
      // terrain
      const m = w.map, CP = CH * TILE;
      g.imageSmoothingEnabled = true;
      for (let cy = Math.max(0, Math.floor(vy0 / CP)); cy <= Math.min(Math.ceil(m.h / CH) - 1, Math.floor(vy1 / CP)); cy++)
        for (let cx = Math.max(0, Math.floor(vx0 / CP)); cx <= Math.min(Math.ceil(m.w / CH) - 1, Math.floor(vx1 / CP)); cx++)
          g.drawImage(this.chunk(cx, cy), cx * CP, cy * CP, CP + 0.5, CP + 0.5);
      // animated water glints
      if (!this.settings.lowFx) this.drawWater(g);
      // decals
      for (const d of this.decals) {
        if (!inView(d.x, d.y, d.r * 2)) continue;
        if (d.k === 'scorch') blit(g, scorchSprite(), d.x, d.y, d.r * 1.3, 1);
        else if (d.k === 'wreck') { g.save(); g.translate(d.x, d.y); g.rotate(d.a); g.fillStyle = 'rgba(28,26,24,0.85)'; g.fillRect(-d.r * 0.9, -d.r * 0.6, d.r * 1.8, d.r * 1.2); g.fillStyle = 'rgba(70,60,50,0.6)'; g.fillRect(-d.r * 0.4, -d.r * 0.4, d.r * 0.7, d.r * 0.7); g.restore(); }
        else if (d.k === 'blood') { g.fillStyle = 'rgba(40,20,15,0.4)'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill(); }
      }
      for (const r of this.rubble) this.drawRubble(g, r);
      // ghosts (last known enemy structures under fog)
      for (const gh of this.ghosts.values()) {
        const e = w.byId.get(gh.id);
        if (e && !e.dead && w.visibleTo(e, this.team)) continue;
        if (!inView(gh.x, gh.y, 100)) continue;
        const pl = w.players[gh.owner]; const s = gh.built ? ART.bld(gh.type, pl.faction, pl.color) : ART.scaffold(gh.w * 32, gh.h * 32);
        g.globalAlpha = 0.55; g.drawImage(s.img, gh.tx * TILE, gh.ty * TILE, s.w, s.h); g.globalAlpha = 1;
      }
      // entities
      const team = this.team; const sel = ui ? ui.selSet : null;
      const bl = [], gl = [], nl = [], al = [];
      for (const e of w.ents) {
        if (e.dead || e.inside) continue;
        if (!inView(e.x, e.y, (e.radius || 32) + 30)) continue;
        if (!this.revealAll && !(e.vis & (1 << team))) continue;
        if (e.kind === 'bld') bl.push(e); else if (e.mv === 'air') al.push(e); else if (e.cls === 'naval') nl.push(e); else gl.push(e);
      }
      for (const e of bl) this.drawBuilding(g, e, sel);
      for (const e of nl) this.drawUnit(g, e, alpha, sel);
      for (const e of gl) this.drawUnit(g, e, alpha, sel);
      this.drawProjectiles(g, alpha, inView);
      this.drawFx(g, inView, false);
      for (const e of al) this.drawUnit(g, e, alpha, sel);
      this.drawFx(g, inView, true);
      // fog overlay
      g.imageSmoothingEnabled = true;
      if (!this.revealAll) g.drawImage(this.fogCv, 0, 0, m.w, m.h, 0, 0, m.pw, m.ph);
      // radar blips (enemy units seen only by radar)
      for (const e of w.ents) {
        if (e.dead || e.kind !== 'unit' || !(e.radarVis & (1 << team)) || (e.vis & (1 << team))) continue;
        if (!inView(e.x, e.y, 20)) continue;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5 + e.id);
        g.fillStyle = `rgba(255,80,60,${0.35 + pulse * 0.35})`; g.beginPath(); g.arc(e.x, e.y, 5 + pulse * 2, 0, 7); g.fill();
      }
      // overlays (selection, health bars) above fog
      for (const e of bl) this.drawBldOverlay(g, e, sel);
      for (const e of gl.concat(nl, al)) this.drawUnitOverlay(g, e, alpha, sel);
      if (ui) ui.drawWorldOverlay(g, this);
      // markers
      this.markers = this.markers.filter((mk) => (mk.t += dt) < mk.life);
      for (const mk of this.markers) {
        const k = mk.t / mk.life; g.strokeStyle = mk.col + (1 - k) + ')'; g.lineWidth = 2 / c.zoom;
        g.beginPath(); g.arc(mk.x, mk.y, 6 + 14 * (1 - k), 0, 7); g.stroke();
        g.beginPath(); g.moveTo(mk.x - 4, mk.y); g.lineTo(mk.x + 4, mk.y); g.moveTo(mk.x, mk.y - 4); g.lineTo(mk.x, mk.y + 4); g.stroke();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawWater(g) {
      // sparse moving glints over visible water tiles
      const m = this.w.map; const v = this.view; const t = this.time;
      const tx0 = Math.max(0, (v.x0 / TILE) | 0), tx1 = Math.min(m.w - 1, (v.x1 / TILE) | 0), ty0 = Math.max(0, (v.y0 / TILE) | 0), ty1 = Math.min(m.h - 1, (v.y1 / TILE) | 0);
      if ((tx1 - tx0) * (ty1 - ty0) > 9000) return;
      g.fillStyle = 'rgba(220,240,255,0.16)';
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * m.w + tx; const tt = m.t[i]; if (tt !== 4 && tt !== 8) continue;
        const ph = (m.deco[i] / 255) * 6.28; const s = Math.sin(t * 1.3 + ph);
        if (s > 0.6) { const x = tx * 32 + 6 + (m.deco[i] % 18), y = ty * 32 + 8 + ((m.deco[i] >> 3) % 16); g.fillRect(x + s * 3, y, 7 * (s - 0.5), 1.4); }
      }
    }

    drawRubble(g, r) {
      const x0 = r.tx * TILE, y0 = r.ty * TILE, w = r.w * TILE, h = r.h * TILE;
      g.fillStyle = 'rgba(30,28,26,0.55)'; g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      let s = r.seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < r.w * r.h * 4; i++) { g.fillStyle = i % 3 ? 'rgba(90,86,80,0.8)' : 'rgba(55,50,46,0.9)'; g.fillRect(x0 + rnd() * (w - 6), y0 + rnd() * (h - 6), 3 + rnd() * 5, 3 + rnd() * 4); }
    }

    drawBuilding(g, e, sel) {
      const pl = this.w.players[e.owner];
      const x = e.tx * TILE, y = e.ty * TILE, W = e.w * TILE, H = e.h * TILE;
      if (!e.built) {
        // construction: frame + partially revealed structure
        const s = ART.bld(e.type, pl.faction, pl.color);
        g.save(); g.beginPath(); g.rect(x, y + H * (1 - e.progress), W, H * e.progress); g.clip(); g.globalAlpha = 0.85; g.drawImage(s.img, x, y, W, H); g.restore();
        const sc = ART.scaffold(W, H); g.globalAlpha = 0.75 * (1 - e.progress * 0.6); g.drawImage(sc.img, x, y, W, H); g.globalAlpha = 1;
        return;
      }
      const s = ART.bld(e.type, pl.faction, pl.color);
      g.drawImage(s.img, x, y, W, H);
      const d = D.BUILDINGS[e.type];
      // animated parts
      const t = this.time;
      if (e.type === 'radar' && !pl.lowPower) { const tu = ART.bldTurret('radar', pl.faction, pl.color, 18); this.drawRot(g, tu, e.x, e.y, t * 1.6); }
      else if (e.type === 'radar') { const tu = ART.bldTurret('radar', pl.faction, pl.color, 18); this.drawRot(g, tu, e.x, e.y, 0.4); }
      if (e.type === 'extractor') { const tu = ART.bldTurret('extractor', pl.faction, pl.color, 14); this.drawRot(g, tu, x + W * 0.36, y + H * 0.32, Math.sin(t * 3 + e.id) * 0.35); }
      if (e.weapons.length) { const ws = e.weapons[0]; const tu = ART.bldTurret(e.type, pl.faction, pl.color, 14); if (tu) { const rc = ws.recoil || 0; this.drawRot(g, tu, e.x - Math.cos(ws.ta) * rc, e.y - Math.sin(ws.ta) * rc, ws.ta); } }
      if (e.type === 'power' && !this.settings.lowFx) { const p = 0.5 + 0.5 * Math.sin(t * 2 + e.id); g.fillStyle = `rgba(255,220,120,${0.08 + p * 0.1})`; g.beginPath(); g.arc(x + W * 0.38, y + H * 0.42, 10, 0, 7); g.fill(); }
      if (e.type === 'silo' && e.charge >= 1) { const p = 0.5 + 0.5 * Math.sin(t * 6); g.fillStyle = `rgba(255,40,30,${0.2 + p * 0.3})`; g.fillRect(x + 6, y + 6, W - 12, H - 12); }
      // damage states
      const hpf = e.hp / e.maxHp;
      if (hpf < 0.6 && Math.random() < dtChance(hpf)) this.fx.add({ k: 'smoke', x: x + Math.random() * W, y: y + Math.random() * H, vx: 6, vy: -10, t: 0, life: 2 + Math.random(), r: 7, g: hpf < 0.3 ? 40 : 90, drag: 0.3 });
      if (hpf < 0.3 && Math.random() < 0.15) this.fx.add({ k: 'fire', x: x + W * (0.2 + Math.random() * 0.6), y: y + H * (0.2 + Math.random() * 0.6), vx: 0, vy: -12, t: 0, life: 0.6, r: 6 });
      if (hpf < 0.5) { g.fillStyle = `rgba(20,14,10,${(0.5 - hpf) * 0.6})`; g.fillRect(x + 2, y + 2, W - 4, H - 4); }
      if (pl.lowPower && d.power < 0 && Math.sin(t * 4) > 0) { g.fillStyle = 'rgba(255,200,0,0.9)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('⚡', e.x, y + 12); }
    }
    drawRot(g, s, x, y, a) { if (!s) return; g.save(); g.translate(x, y); g.rotate(a); g.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h); g.restore(); }

    drawUnit(g, e, alpha, sel) {
      const pl = this.w.players[e.owner]; const d = D.unitFor(e.type, pl.faction);
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
      const R = d.radius;
      const stealthed = this.w.isStealthed(e);
      const air = e.mv === 'air';
      const bob = air && d.air === 'heli' ? Math.sin(this.time * 2 + e.id) * 1.2 : 0;
      const alt = air ? (e.landed ? 2 : d.air === 'jet' ? 26 : 16) : 0;
      if (stealthed) g.globalAlpha = e.owner === this.pid ? 0.45 : 0.25;
      // shadow
      const sh = ART.shadowOf(e.type, pl.faction, R);
      if (air) { g.save(); g.translate(x + alt * 0.5, y + alt * 0.7); g.rotate(e.angle); g.drawImage(sh.img, -sh.w / 2, -sh.h / 2, sh.w, sh.h); g.restore(); }
      else if (e.cls !== 'naval') { g.save(); g.translate(x + 1.5, y + 2.5); g.rotate(e.angle); g.drawImage(sh.img, -sh.w / 2, -sh.h / 2, sh.w, sh.h); g.restore(); }
      // naval wake
      if (e.cls === 'naval' && (e.vx || e.vy) && !this.settings.lowFx && Math.random() < 0.3) this.fx.add({ k: 'wake', x: x - Math.cos(e.angle) * R, y: y - Math.sin(e.angle) * R, vx: 0, vy: 0, t: 0, life: 1.4, r: R * 0.5 });
      // dust from moving ground vehicles
      if (e.cls === 'veh' && e.mv === 'ground' && (e.vx * e.vx + e.vy * e.vy) > 400 && !this.settings.lowFx && Math.random() < 0.08) this.fx.add({ k: 'dust', x: x - Math.cos(e.angle) * R, y: y - Math.sin(e.angle) * R, vx: 0, vy: 0, t: 0, life: 0.8, r: R * 0.4 });
      if (e.mv === 'hover' && (e.vx || e.vy) && Math.random() < 0.1) this.fx.add({ k: 'dust', x: x - Math.cos(e.angle) * R, y: y - Math.sin(e.angle) * R, vx: 0, vy: 0, t: 0, life: 0.6, r: R * 0.5 });
      const body = ART.unitBody(e.type, pl.faction, pl.color, R);
      g.save(); g.translate(x, y + bob - (air ? 0 : 0)); g.rotate(e.angle);
      if (air) { const sc = 1 + alt / 260; g.scale(sc, sc); }
      // colossus walk wobble
      if (e.type === 'colossus' && (e.vx || e.vy)) g.rotate(Math.sin(this.time * 4) * 0.03);
      g.drawImage(body.img, -body.w / 2, -body.h / 2, body.w, body.h);
      g.restore();
      // turrets
      if (ART.hasTurret(e.type)) {
        const tu = ART.unitTurret(e.type, pl.faction, pl.color, R);
        const ws = e.weapons[0]; const ta = ws ? ws.ta : e.angle; const rc = ws ? ws.recoil : 0;
        const off = e.type === 'destroyer' ? R * 0.6 : e.type === 'patrol' || e.type === 'missile_boat' ? R * 0.35 : e.type === 'builder' ? -R * 0.3 : e.type === 'mlrs' || e.type === 'flak' ? -R * 0.25 : -R * 0.08;
        const tx = x + Math.cos(e.angle) * off - Math.cos(ta) * rc, ty = y + Math.sin(e.angle) * off - Math.sin(ta) * rc;
        let tang = ta; if (e.type === 'ew') tang = this.time * 2 + e.id;
        if (e.type === 'builder') tang = e.angle + (e.orders[0] && (e.orders[0].t === 'build' || e.orders[0].t === 'repair') ? Math.sin(this.time * 2) * 0.8 : 0);
        this.drawRot(g, tu, tx, ty, tang);
      }
      // rotors
      if (e.type === 'gunship' || e.type === 'drone') {
        g.save(); g.translate(x, y + bob); g.strokeStyle = 'rgba(30,30,30,0.55)'; g.lineWidth = 1.6;
        const rr = e.type === 'gunship' ? R * 1.1 : R * 0.42;
        if (e.type === 'gunship') { const a = this.time * 30; for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(Math.cos(a + k * 1.57) * rr, Math.sin(a + k * 1.57) * rr); g.lineTo(-Math.cos(a + k * 1.57) * rr, -Math.sin(a + k * 1.57) * rr); g.stroke(); } g.fillStyle = 'rgba(200,200,200,0.08)'; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.fill(); }
        g.restore();
      }
      // engine glow for jets
      if (air && d.air === 'jet' && !e.landed) { const bx = x - Math.cos(e.angle) * R * 0.95, by = y - Math.sin(e.angle) * R * 0.95; g.fillStyle = 'rgba(255,170,80,0.7)'; g.beginPath(); g.arc(bx, by, 2.5 + Math.random(), 0, 7); g.fill(); if (Math.random() < 0.4) this.fx.add({ k: 'contrail', x: bx, y: by, vx: 0, vy: 0, t: 0, life: 0.6, r: 2 }); }
      // damaged unit smoke
      if (e.hp < e.maxHp * 0.35 && e.cls !== 'inf' && Math.random() < 0.12) this.fx.add({ k: 'smoke', x, y, vx: 4, vy: -8, t: 0, life: 1.2, r: R * 0.35, g: 50, drag: 0.5 });
      g.globalAlpha = 1;
    }

    drawUnitOverlay(g, e, alpha, sel) {
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha; const R = e.radius;
      const isSel = sel && sel.has(e.id); const z = this.cam.zoom;
      const col = D.TEAM_COLORS[this.w.players[e.owner].color];
      if (isSel) {
        g.strokeStyle = e.owner === this.pid ? 'rgba(120,255,140,0.95)' : col.main; g.lineWidth = 1.6 / Math.max(0.6, z);
        g.beginPath(); g.ellipse(x, y + (e.mv === 'air' ? 0 : 1), R + 4, (R + 4) * 0.8, 0, 0, 7); g.stroke();
      } else if (z < 0.75 || e.owner !== this.pid) {
        // team marker for readability at low zoom
        g.fillStyle = col.main; g.globalAlpha = z < 0.75 ? 0.9 : 0.55; g.beginPath(); g.arc(x, y - R - 3, Math.max(2, 2.5 / z), 0, 7); g.fill(); g.globalAlpha = 1;
      }
      const hpf = e.hp / e.maxHp;
      if (isSel || hpf < 0.999) {
        const bw = Math.max(14, R * 1.8), bh = Math.max(2.5, 3 / z); const bx = x - bw / 2, by = y - R - 7 - bh;
        g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
        g.fillStyle = hpf > 0.6 ? '#4ee36b' : hpf > 0.3 ? '#f1c232' : '#ef4b3d'; g.fillRect(bx, by, bw * hpf, bh);
      }
      if (isSel && e.cargo && e.cargo.length) { g.fillStyle = '#fff'; g.font = `${Math.max(8, 9 / z)}px sans-serif`; g.textAlign = 'center'; g.fillText('▣ ' + e.cargo.length, x, y + R + 12); }
      if (isSel && e.owner === this.pid) {
        // order lines
        let px = x, py = y; g.strokeStyle = 'rgba(120,255,140,0.35)'; g.lineWidth = 1 / z; g.setLineDash([4 / z, 4 / z]);
        g.beginPath(); g.moveTo(px, py);
        for (const o of e.orders) {
          let ox = o.x, oy = o.y; if (o.id) { const t = this.w.get(o.id); if (!t) continue; ox = t.x; oy = t.y; g.strokeStyle = o.t === 'attack' ? 'rgba(255,90,80,0.5)' : 'rgba(255,220,100,0.5)'; }
          if (o.t === 'patrol') { ox = o.bx; oy = o.by; }
          if (ox == null) continue; g.lineTo(ox, oy);
        }
        g.stroke(); g.setLineDash([]);
      }
      if (e.kills >= 3) { g.fillStyle = '#ffd34a'; g.font = `${Math.max(7, 8 / z)}px sans-serif`; g.textAlign = 'center'; g.fillText(e.kills >= 10 ? '★★' : '★', x + R, y - R); }
    }

    drawBldOverlay(g, e, sel) {
      const isSel = sel && sel.has(e.id); const z = this.cam.zoom;
      const x = e.tx * TILE, y = e.ty * TILE, W = e.w * TILE, H = e.h * TILE;
      if (isSel) {
        g.strokeStyle = e.owner === this.pid ? 'rgba(120,255,140,0.95)' : 'rgba(255,120,100,0.95)'; g.lineWidth = 2 / Math.max(0.6, z); const k = 8;
        g.beginPath();
        g.moveTo(x, y + k); g.lineTo(x, y); g.lineTo(x + k, y); g.moveTo(x + W - k, y); g.lineTo(x + W, y); g.lineTo(x + W, y + k);
        g.moveTo(x + W, y + H - k); g.lineTo(x + W, y + H); g.lineTo(x + W - k, y + H); g.moveTo(x + k, y + H); g.lineTo(x, y + H); g.lineTo(x, y + H - k); g.stroke();
        if (e.rally && e.owner === this.pid) { g.strokeStyle = 'rgba(120,200,255,0.6)'; g.setLineDash([5 / z, 5 / z]); g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.rally.x, e.rally.y); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(120,200,255,0.9)'; g.beginPath(); g.arc(e.rally.x, e.rally.y, 4, 0, 7); g.fill(); }
        const d = D.BUILDINGS[e.type];
        if (d.weapons) { const r = this.w.weaponRange(e, D.WEAPONS[d.weapons[0]]); g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1 / z; g.beginPath(); g.arc(e.x, e.y, r, 0, 7); g.stroke(); }
        if (d.repairAura) { g.strokeStyle = 'rgba(120,255,140,0.18)'; g.beginPath(); g.arc(e.x, e.y, d.repairAura.r, 0, 7); g.stroke(); }
      }
      const hpf = e.hp / e.maxHp;
      if (isSel || hpf < 0.999 || !e.built) {
        const bw = W - 8, bh = Math.max(3, 3.5 / z); g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x + 4, y - bh - 3, bw, bh + 1);
        g.fillStyle = hpf > 0.6 ? '#4ee36b' : hpf > 0.3 ? '#f1c232' : '#ef4b3d'; g.fillRect(x + 4.5, y - bh - 2.5, (bw - 1) * hpf, bh);
      }
      if (e.owner === this.pid || this.revealAll) {
        let p = -1, col = '#7fc8ff';
        if (!e.built) { p = e.progress; col = '#e8c22a'; }
        else if (e.queue.length) p = e.qprog;
        else if (e.research) { p = e.rprog; col = '#c891ff'; }
        else if (e.type === 'silo') { p = e.charge; col = '#ff5a4a'; }
        if (p >= 0) { const bw = W - 8, bh = Math.max(2.5, 3 / z); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 4, y + H - bh - 3, bw, bh + 1); g.fillStyle = col; g.fillRect(x + 4.5, y + H - bh - 2.5, (bw - 1) * Math.min(1, p), bh); }
        if (e.queue.length > 1) { g.fillStyle = '#fff'; g.font = `bold ${Math.max(8, 9 / z)}px sans-serif`; g.textAlign = 'right'; g.fillText('×' + e.queue.length, x + W - 4, y + H - 8); }
      }
    }

    drawProjectiles(g, alpha, inView) {
      for (const p of this.w.projectiles) {
        const k = Math.min(1, (p.t + alpha * U.TICK) / p.dur);
        const x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k;
        if (!inView(x, y, 40)) continue;
        if (!this.revealAll && !this.tileVisible(x, y) && p.owner !== this.pid) continue;
        const a = Math.atan2(p.ty - p.sy, p.tx - p.sx);
        switch (p.kind) {
          case 'bullet': { g.strokeStyle = 'rgba(255,230,140,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); g.stroke(); break; }
          case 'shell': { g.strokeStyle = 'rgba(255,200,120,0.35)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * 16, y - Math.sin(a) * 16); g.stroke(); g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); break; }
          case 'plasma': { blit(g, soft('plasma', [[0, 'rgba(230,255,255,1)'], [0.4, 'rgba(90,240,255,0.8)'], [1, 'rgba(90,240,255,0)']]), x, y, 7, 1); g.strokeStyle = 'rgba(120,255,255,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * 14, y - Math.sin(a) * 14); g.stroke(); break; }
          case 'rocket': case 'missile': case 'torpedo': {
            if (p.kind === 'torpedo') { g.strokeStyle = 'rgba(220,245,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * 18, y - Math.sin(a) * 18); g.stroke(); break; }
            g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#d8d8d0'; g.fillRect(-4, -1, 7, 2); g.fillStyle = 'rgba(255,170,60,0.95)'; g.beginPath(); g.arc(-5, 0, 2.2, 0, 7); g.fill(); g.restore();
            if (Math.random() < 0.7) this.fx.add({ k: 'trail', x: x - Math.cos(a) * 5, y: y - Math.sin(a) * 5, vx: 0, vy: 0, t: 0, life: 0.6, r: 2.5 });
            break;
          }
          case 'artyshell': case 'artyrocket': case 'nuke': {
            const h = Math.sin(Math.PI * k) * (p.kind === 'nuke' ? 260 : 60 + 120 * (p.arc || 0));
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x, y, p.kind === 'nuke' ? 6 : 2.5, 0, 7); g.fill();
            const yy = y - h;
            if (p.kind === 'artyshell') { g.fillStyle = '#ffe6a0'; g.beginPath(); g.arc(x, yy, 2.4, 0, 7); g.fill(); }
            else { g.fillStyle = p.kind === 'nuke' ? '#eee' : '#d8d8d0'; g.beginPath(); g.arc(x, yy, p.kind === 'nuke' ? 4 : 2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,170,60,0.9)'; g.beginPath(); g.arc(x - Math.cos(a) * 3, yy + 2, p.kind === 'nuke' ? 4 : 2, 0, 7); g.fill(); if (Math.random() < 0.8) this.fx.add({ k: 'trail', x, y: yy, vx: 0, vy: 0, t: 0, life: p.kind === 'nuke' ? 2 : 0.7, r: p.kind === 'nuke' ? 6 : 2.5 }); }
            break;
          }
          case 'flak': { g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(x, y - 6, 1.5, 0, 7); g.fill(); break; }
          case 'bomb': { const s = 3 * (1 - k * 0.6); g.fillStyle = '#222'; g.beginPath(); g.ellipse(x, y, s * 1.4, s, a, 0, 7); g.fill(); break; }
        }
      }
    }

    drawFx(g, inView, top) {
      for (const p of this.fx.list) {
        if (p.t < 0) continue;
        const isTop = p.k === 'contrail' || p.k === 'puff' || p.k === 'flashTop';
        if (isTop !== top) continue;
        if (!inView(p.x, p.y, 60)) continue;
        const k = p.t / p.life;
        switch (p.k) {
          case 'smoke': case 'trail': case 'contrail': case 'puff': {
            const r = (p.r || 4) * (1 + k * (p.k === 'trail' ? 1.6 : 2.2)); const gv = p.g != null ? p.g : p.k === 'contrail' ? 220 : 150;
            blit(g, smokeSprite(gv), p.x, p.y, r, (p.k === 'puff' ? 0.6 : p.k === 'contrail' ? 0.32 : 0.42) * (1 - k)); break;
          }
          case 'dust': blit(g, dustSprite(), p.x, p.y, (p.r || 4) * (1 + k * 1.5), 0.4 * (1 - k)); break;
          case 'wake': { const r = (p.r || 4) * (1 + k * 2); g.strokeStyle = `rgba(230,245,255,${0.35 * (1 - k)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); break; }
          case 'fire': { g.globalCompositeOperation = 'lighter'; blit(g, flameSprite(), p.x, p.y, p.r * (1 - k * 0.5), 0.9 * (1 - k)); g.globalCompositeOperation = 'source-over'; break; }
          case 'fireball': { g.globalCompositeOperation = 'lighter'; blit(g, fireSprite(), p.x, p.y, p.r * (0.5 + k * 0.9), 1 - k); g.globalCompositeOperation = 'source-over'; break; }
          case 'flash': {
            g.globalCompositeOperation = 'lighter'; const r = p.r * (1 - k * 0.3); const col = p.col || '255,230,160';
            blit(g, flashSprite(col), p.x, p.y, r, 1 - k);
            if (p.cone && p.a != null) { const L = Math.min(r, 9); g.fillStyle = `rgba(255,205,120,${0.75 * (1 - k)})`; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(p.a - 0.3) * L * 1.2, p.y + Math.sin(p.a - 0.3) * L * 1.2); g.lineTo(p.x + Math.cos(p.a) * L * 1.8, p.y + Math.sin(p.a) * L * 1.8); g.lineTo(p.x + Math.cos(p.a + 0.3) * L * 1.2, p.y + Math.sin(p.a + 0.3) * L * 1.2); g.fill(); }
            g.globalCompositeOperation = 'source-over'; break;
          }
          case 'spark': { g.strokeStyle = `rgba(255,220,120,${1 - k})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); break; }
          case 'droplet': { g.fillStyle = `rgba(220,240,255,${0.8 * (1 - k)})`; g.fillRect(p.x, p.y, 1.6, 1.6); break; }
          case 'debris': { g.save(); g.translate(p.x, p.y); g.rotate(p.rot + k * 8); g.fillStyle = `rgba(40,36,32,${1 - k * 0.5})`; g.fillRect(-2.5, -1.5, 5, 3); g.restore(); break; }
          case 'ring': { g.strokeStyle = `rgba(${p.col || '255,255,255'},${0.7 * (1 - k)})`; g.lineWidth = 2 * (1 - k) + 0.5; g.beginPath(); g.arc(p.x, p.y, p.r * (0.3 + k), 0, 7); g.stroke(); break; }
          case 'plus': { g.fillStyle = `rgba(110,255,140,${1 - k})`; g.fillRect(p.x - 3, p.y - 1, 6, 2); g.fillRect(p.x - 1, p.y - 3, 2, 6); break; }
        }
      }
    }

    // ------------------------------------------------------------ minimap
    drawMinimap(mc, size) {
      const g = mc.getContext('2d'); const m = this.w.map;
      const sc = size / Math.max(m.pw, m.ph); const mw = m.pw * sc, mh = m.ph * sc; const ox = (size - mw) / 2, oy = (size - mh) / 2;
      this.mini = { sc, ox, oy };
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, size, size);
      g.imageSmoothingEnabled = true; g.drawImage(this.minibase, ox, oy, mw, mh);
      const team = this.team;
      for (const gh of this.ghosts.values()) { const e = this.w.byId.get(gh.id); if (e && !e.dead && this.w.visibleTo(e, team)) continue; g.fillStyle = D.TEAM_COLORS[this.w.players[gh.owner].color].dark; g.fillRect(ox + gh.tx * TILE * sc, oy + gh.ty * TILE * sc, Math.max(2, gh.w * TILE * sc), Math.max(2, gh.h * TILE * sc)); }
      for (const e of this.w.ents) {
        if (e.dead || e.inside) continue;
        const vis = this.revealAll || (e.vis & (1 << team));
        const col = D.TEAM_COLORS[this.w.players[e.owner].color];
        if (vis) {
          g.fillStyle = e.owner === this.pid ? col.light : col.main;
          if (e.kind === 'bld') g.fillRect(ox + e.tx * TILE * sc, oy + e.ty * TILE * sc, Math.max(2, e.w * TILE * sc), Math.max(2, e.h * TILE * sc));
          else { const s = e.mv === 'air' ? 2 : 2.2; g.fillRect(ox + e.x * sc - s / 2, oy + e.y * sc - s / 2, s, s); }
        } else if (e.radarVis & (1 << team)) {
          const p = 0.5 + 0.5 * Math.sin(this.time * 6 + e.id); g.fillStyle = `rgba(255,70,60,${0.5 + p * 0.5})`; g.fillRect(ox + e.x * sc - 1.5, oy + e.y * sc - 1.5, 3, 3);
        }
      }
      if (!this.revealAll) { g.globalAlpha = 0.86; g.drawImage(this.fogCv, ox, oy, mw, mh); g.globalAlpha = 1; }
      // camera rect
      const c = this.cam; const vw = this.sw / c.zoom, vh = this.sh / c.zoom;
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1; g.strokeRect(ox + (c.x - vw / 2) * sc, oy + (c.y - vh / 2) * sc, vw * sc, vh * sc);
      // alert pings
      if (this.pings) { this.pings = this.pings.filter((p) => this.time - p.t < 3); for (const p of this.pings) { const k = (this.time - p.t) / 3; g.strokeStyle = `rgba(255,60,40,${1 - k})`; g.lineWidth = 1.5; g.beginPath(); g.arc(ox + p.x * sc, oy + p.y * sc, 4 + k * 12, 0, 7); g.stroke(); } }
    }
    ping(x, y) { (this.pings = this.pings || []).push({ x, y, t: this.time }); }
    minimapToWorld(mx, my) { const mi = this.mini; if (!mi) return null; return { x: (mx - mi.ox) / mi.sc, y: (my - mi.oy) / mi.sc }; }
  }
  function dtChance(hpf) { return hpf < 0.3 ? 0.35 : 0.12; }

  WF.Renderer = Renderer;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
