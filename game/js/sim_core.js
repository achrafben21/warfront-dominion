/* WARFRONT: DOMINION — simulation core: world state, players, economy, construction,
 * production, research, fog of war, commands, victory, and serialization.
 * Pure logic (no DOM) so it can run headless in tests and stay ready for lockstep multiplayer. */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE;

  const SAVE_VERSION = 3;

  class Player {
    constructor(id, opt) {
      this.id = id;
      this.name = opt.name || ('Player ' + (id + 1));
      this.faction = opt.faction || 'aegis';
      this.team = opt.team != null ? opt.team : id;
      this.color = opt.color != null ? opt.color : id;
      this.ai = opt.ai || null;               // difficulty id or null for human
      this.res = { c: opt.res ? opt.res.c : 2500, m: opt.res ? opt.res.m : 700 };
      this.power = { gen: 0, use: 0 };
      this.tech = {};                         // researchId -> true
      this.alive = true;
      this.incomeMul = 1;
      this.stats = { built: 0, lost: 0, kills: 0, bldBuilt: 0, bldLost: 0, earnedC: 0, earnedM: 0, dmg: 0 };
      this.siloReady = false;
    }
    get lowPower() { return this.power.use > this.power.gen; }
    get powerFactor() { return this.power.use <= this.power.gen ? 1 : Math.max(0.35, this.power.gen / Math.max(1, this.power.use)); }
    has(tech) { return !!this.tech[tech]; }
  }

  class World {
    /** opts: { mapId, seed, players:[{faction,team,ai,name,color,res}], victory, unitCap, mission } */
    constructor(opts) {
      this.opts = opts;
      this.seed = opts.seed || 1;
      this.rng = new U.RNG(this.seed * 9973 + 17);
      this.map = opts.map || WF.buildMap(opts.mapId || 'twin_rivers', this.seed);
      this.tick = 0; this.time = 0;
      this.ents = []; this.byId = new Map(); this.nextId = 1;
      this.projectiles = [];
      this.events = [];
      this.players = (opts.players || []).map((p, i) => new Player(i, p));
      this.victory = opts.victory || 'standard';
      this.unitCap = opts.unitCap || 200;
      this.winner = null; this.over = false;
      this.hash = new U.SpatialHash(this.map.pw, this.map.ph, 128);
      this.airHash = new U.SpatialHash(this.map.pw, this.map.ph, 160);
      this._q = []; this._q2 = [];
      this.pathQueue = []; this.pathBudget = 10;
      // fog of war per team
      this.teams = [...new Set(this.players.map((p) => p.team))];
      this.fog = {};
      for (const t of this.teams) this.fog[t] = { vis: new Uint8Array(this.map.n), exp: new Uint8Array(this.map.n), radar: false };
      this.fogTimer = 0; this.ecoTimer = 0;
      this.mission = null;
      this.messages = [];  // {text, team, t, kind}
      this.noAI = !!opts.noAI;
      this.ais = [];
    }

    // ------------------------------------------------------------------ setup
    setupStandardStart() {
      const m = this.map;
      this.players.forEach((p, i) => {
        const s = m.spawns[i % m.spawns.length];
        const hq = this.placeBuilding(p.id, 'hq', s.tx - 1, s.ty - 1, true);
        // starting forces
        const toward = { x: m.pw / 2, y: m.ph / 2 };
        const dir = U.angleTo(hq.x, hq.y, toward.x, toward.y);
        const start = [['builder', 0], ['builder', 1], ['rifle', 2], ['rifle', 3], ['recon', 4], ['light_tank', 5]];
        for (const [t, k] of start) {
          if (!D.canProduce(p.faction, t)) continue;
          const a = dir + (k - 2.5) * 0.45, r = 110 + (k % 2) * 30;
          const pos = m.nearestPassable(hq.x + Math.cos(a) * r, hq.y + Math.sin(a) * r, 'ground', 8) || { x: hq.x + 80, y: hq.y };
          this.spawnUnit(p.id, t, pos.x, pos.y, dir);
        }
      });
      this.updatePower(); this.updateFog(true);
    }

    player(id) { return this.players[id]; }
    get(id) { const e = this.byId.get(id); return e && !e.dead ? e : null; }
    isEnemy(a, b) { return this.players[a].team !== this.players[b].team; }
    teamOf(pid) { return this.players[pid].team; }
    emit(ev) { this.events.push(ev); }
    msg(text, team, kind) { this.messages.push({ text, team: team == null ? -1 : team, t: this.time, kind: kind || 'info' }); if (this.messages.length > 40) this.messages.shift(); }

    // ------------------------------------------------------------------ entities
    spawnUnit(owner, type, x, y, angle) {
      const p = this.players[owner];
      const def = D.unitFor(type, p.faction);
      let maxHp = def.hp;
      if (p.has('composite_armor') && (def.cls === 'veh' || def.cls === 'naval')) maxHp = Math.round(maxHp * 1.2);
      const e = {
        id: this.nextId++, kind: 'unit', type, owner, x, y, px: x, py: y,
        hp: maxHp, maxHp, radius: def.radius, armor: def.armor, cls: def.cls, mv: def.move,
        angle: angle || 0, vx: 0, vy: 0, orders: [], path: null, pi: 0,
        stuckT: 0, lastX: x, lastY: y, repaths: 0,
        weapons: (def.weapons || []).map((w) => ({ w, cd: this.rng.range(0, 0.6), ta: angle || 0, target: 0, salvo: 0, st: 0, ammo: D.WEAPONS[w].ammo || 0, recoil: 0 })),
        target: 0, acqT: this.rng.range(0, 0.4), hold: false, revealT: 0, vis: 0, radarVis: 0, lastHitT: -99, kills: 0,
        alt: def.move === 'air' ? 1 : 0, cargo: def.transport ? [] : null, inside: 0, deployed: 0, formSpeed: 0,
      };
      this.ents.push(e); this.byId.set(e.id, e);
      return e;
    }

    placeBuilding(owner, type, tx, ty, complete) {
      const p = this.players[owner];
      const def = D.bldFor(type, p.faction);
      let maxHp = def.hp;
      if (p.has('iron_hulls')) maxHp = Math.round(maxHp * 1.3);
      const e = {
        id: this.nextId++, kind: 'bld', type, owner, tx, ty, w: def.w, h: def.h,
        x: (tx + def.w / 2) * TILE, y: (ty + def.h / 2) * TILE, px: 0, py: 0,
        radius: Math.max(def.w, def.h) * TILE * 0.5, armor: 'bld', cls: 'bld', mv: 'none',
        hp: complete ? maxHp : Math.max(1, maxHp * 0.1), maxHp, built: !!complete, progress: complete ? 1 : 0,
        queue: [], qprog: 0, rally: null, research: null, rprog: 0, charge: 0,
        weapons: (def.weapons || []).map((w) => ({ w, cd: 0, ta: -Math.PI / 2, target: 0, salvo: 0, st: 0, ammo: 0, recoil: 0 })),
        target: 0, acqT: 0, vis: 0, radarVis: 0, seen: {}, lastHitT: -99, angle: 0, kills: 0,
      };
      e.px = e.x; e.py = e.y;
      this.ents.push(e); this.byId.set(e.id, e);
      for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) this.map.occ[this.map.idx(x, y)] = e.id;
      this.map.version++;
      // push units out of the footprint
      for (const u of this.ents) {
        if (u.kind !== 'unit' || u.dead || u.inside || u.mv === 'air') continue;
        const utx = (u.x / TILE) | 0, uty = (u.y / TILE) | 0;
        if (utx >= tx && utx < tx + def.w && uty >= ty && uty < ty + def.h) {
          const np = this.map.nearestPassable(u.x, u.y, u.mv, 6); if (np) { u.x = np.x; u.y = np.y; u.path = null; }
        }
      }
      if (complete) this.onBuildingComplete(e, true);
      return e;
    }

    onBuildingComplete(b, silent) {
      b.built = true; b.progress = 1;
      const p = this.players[b.owner];
      if (!silent) { p.stats.bldBuilt++; this.emit({ e: 'built', id: b.id, owner: b.owner, x: b.x, y: b.y, type: b.type }); }
      if (b.type === 'factory' || b.type === 'barracks' || b.type === 'hq' || b.type === 'airfield' || b.type === 'shipyard') {
        if (!b.rally) { const c = { x: this.map.pw / 2, y: this.map.ph / 2 }; const a = U.angleTo(b.x, b.y, c.x, c.y); b.rally = this.map.nearestPassable(b.x + Math.cos(a) * (b.radius + 60), b.y + Math.sin(a) * (b.radius + 60), b.type === 'shipyard' ? 'naval' : 'ground', 8); }
      }
      this.updatePower();
    }

    removeEntity(e, killerOwner) {
      if (e.dead) return;
      e.dead = true;
      const p = this.players[e.owner];
      if (e.kind === 'bld') {
        for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) { const i = this.map.idx(x, y); if (this.map.occ[i] === e.id) this.map.occ[i] = 0; }
        this.map.version++;
        if (e.built) p.stats.bldLost++;
        // refund queued production
        for (const q of e.queue) { const d = D.unitFor(q, p.faction); p.res.c += d.cost.c; p.res.m += d.cost.m; }
        if (e.research) { const r = D.RESEARCH[e.research]; p.res.c += r.cost.c; p.res.m += r.cost.m; }
        e.queue = [];
        this.updatePower();
      } else {
        p.stats.lost++;
        if (e.cargo) for (const cid of e.cargo) { const c = this.byId.get(cid); if (c && !c.dead) { c.inside = 0; this.removeEntity(c, killerOwner); } }
      }
      if (killerOwner != null && killerOwner !== e.owner && this.players[killerOwner]) this.players[killerOwner].stats.kills++;
      this.emit({ e: 'death', id: e.id, kind: e.kind, type: e.type, owner: e.owner, x: e.x, y: e.y, r: e.radius, cls: e.cls, w: e.w, h: e.h, tx: e.tx, ty: e.ty });
    }

    // ------------------------------------------------------------------ economy
    updatePower() {
      for (const p of this.players) { p.power.gen = 0; p.power.use = 0; }
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'bld' || !e.built) continue;
        const d = D.BUILDINGS[e.type]; const p = this.players[e.owner];
        if (d.power > 0) p.power.gen += d.power; else p.power.use -= d.power;
      }
    }

    economyTick(dt) {
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'bld' || !e.built) continue;
        const d = D.BUILDINGS[e.type]; if (!d.income) continue;
        const p = this.players[e.owner];
        let mul = p.incomeMul;
        if (p.has('extraction') && e.type !== 'hq') mul *= 1.25;
        // extractors need power: low power reduces their output
        if (e.type !== 'hq') mul *= 0.5 + 0.5 * p.powerFactor;
        const c = d.income.c * mul * dt, m = d.income.m * mul * dt;
        p.res.c += c; p.res.m += m; p.stats.earnedC += c; p.stats.earnedM += m;
      }
    }

    canAfford(pid, cost) { const p = this.players[pid]; return p.res.c >= cost.c - 1e-6 && p.res.m >= cost.m - 1e-6; }
    pay(pid, cost) { const p = this.players[pid]; if (!this.canAfford(pid, cost)) return false; p.res.c -= cost.c; p.res.m -= cost.m; return true; }
    refund(pid, cost, frac) { const p = this.players[pid]; p.res.c += cost.c * frac; p.res.m += cost.m * frac; }

    buildingCost(pid, type) {
      const p = this.players[pid]; const d = D.bldFor(type, p.faction); const c = { c: d.cost.c, m: d.cost.m };
      if (type === 'wall' && p.has('iron_hulls')) { c.c = Math.round(c.c / 2); c.m = Math.round(c.m / 2); }
      return c;
    }

    countOwned(pid, type, includeSites) { let n = 0; for (const e of this.ents) if (!e.dead && e.owner === pid && e.type === type && (includeSites || e.kind !== 'bld' || e.built)) n++; return n; }
    unitCount(pid) { let n = 0; for (const e of this.ents) if (!e.dead && e.owner === pid && e.kind === 'unit') n++; return n; }
    queuedUnits(pid) { let n = 0; for (const e of this.ents) if (!e.dead && e.owner === pid && e.kind === 'bld') n += e.queue.length; return n; }

    /** Returns null if the player may build this structure type, else a reason string. */
    buildReqMissing(pid, type) {
      const p = this.players[pid]; const d = D.bldFor(type, p.faction);
      if (d.buildable === false) return 'Cannot be built';
      for (const r of d.req || []) if (this.countOwned(pid, r) === 0) return 'Requires ' + D.BUILDINGS[r].name;
      for (const r of d.reqTech || []) if (!p.has(r)) return 'Requires ' + D.RESEARCH[r].name;
      if (type === 'silo' && this.countOwned(pid, 'silo', true) > 0) return 'Only one silo allowed';
      return null;
    }
    unitReqMissing(pid, type) {
      const p = this.players[pid]; const d = D.unitFor(type, p.faction);
      if (!D.canProduce(p.faction, type)) return 'Not available to this faction';
      for (const r of d.req || []) if (!p.has(r)) return 'Requires ' + D.RESEARCH[r].name;
      if (d.experimental && this.countOwned(pid, type) + this._queuedOf(pid, type) >= 1) return 'Limit 1 experimental';
      return null;
    }
    _queuedOf(pid, type) { let n = 0; for (const e of this.ents) if (!e.dead && e.owner === pid && e.kind === 'bld') for (const q of e.queue) if (q === type) n++; return n; }

    /** Validate building placement. Returns {ok, reason}. */
    canPlace(pid, type, tx, ty) {
      const m = this.map; const d = D.BUILDINGS[type];
      if (tx < 0 || ty < 0 || tx + d.w > m.w || ty + d.h > m.h) return { ok: false, reason: 'Out of bounds' };
      for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) {
        const i = m.idx(x, y); const t = m.t[i];
        if (m.occ[i]) return { ok: false, reason: 'Blocked by structure' };
        if (!WF.PASS.ground[t] || t === WF.T.BRIDGE) return { ok: false, reason: 'Invalid terrain' };
        if (t === WF.T.FOREST) return { ok: false, reason: 'Clear ground needed (forest)' };
      }
      // units in the way (ground units get pushed; enemy units block)
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'unit' || e.inside || e.mv === 'air') continue;
        if (this.isEnemy(e.owner, pid) && e.x > tx * TILE - 8 && e.x < (tx + d.w) * TILE + 8 && e.y > ty * TILE - 8 && e.y < (ty + d.h) * TILE + 8) return { ok: false, reason: 'Enemy units in the way' };
      }
      if (d.on) {
        const dep = m.deposits.find((q) => q.kind === d.on && q.tx === tx && q.ty === ty);
        if (!dep) return { ok: false, reason: 'Must be placed on ' + (d.on === 'oil' ? 'an oil field' : 'an ore deposit') };
      } else {
        for (const q of m.deposits) if (tx < q.tx + 2 && tx + d.w > q.tx && ty < q.ty + 2 && ty + d.h > q.ty) return { ok: false, reason: 'Reserved resource site' };
      }
      if (d.coastal) {
        let water = 0;
        for (let y = ty - 1; y <= ty + d.h; y++) for (let x = tx - 1; x <= tx + d.w; x++) {
          if (m.inb(x, y) && (m.t[m.idx(x, y)] === WF.T.WATER || m.t[m.idx(x, y)] === WF.T.SHALLOW)) water++;
        }
        if (water < 3) return { ok: false, reason: 'Shipyard must touch water' };
      }
      // must be within build radius of an owned structure (territory)
      let near = false;
      const cx = (tx + d.w / 2) * TILE, cy = (ty + d.h / 2) * TILE;
      for (const e of this.ents) if (!e.dead && e.kind === 'bld' && e.owner === pid && U.dist2(e.x, e.y, cx, cy) < (d.on ? 1e12 : 520 * 520)) { near = true; break; }
      if (!near) return { ok: false, reason: 'Too far from your base' };
      // keep routes open: do not seal a tile ring completely (simple check: leave at least 1 free tile path around HQ)
      if (type === 'wall' || d.w >= 2) {
        if (!this._keepsRoutesOpen(tx, ty, d.w, d.h, pid)) return { ok: false, reason: 'Would block all routes' };
      }
      return { ok: true };
    }

    _keepsRoutesOpen(tx, ty, w, h, pid) {
      // Temporarily occupy and check that each of the player's production buildings can still reach the map centre region.
      const m = this.map; const tmp = [];
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) { const i = m.idx(x, y); tmp.push([i, m.occ[i]]); m.occ[i] = -1; }
      let ok = true;
      const hq = this.ents.find((e) => !e.dead && e.owner === pid && e.kind === 'bld' && (e.type === 'hq' || e.type === 'factory'));
      if (hq) {
        const start = m.nearestPassable(hq.x, hq.y + hq.radius + 20, 'ground', 6);
        if (!start) ok = false;
        else {
          // BFS bounded: must be able to reach at least 400 tiles
          const seen = new Uint8Array(m.n); const st = [((start.y / TILE) | 0) * m.w + ((start.x / TILE) | 0)]; seen[st[0]] = 1; let count = 0;
          while (st.length && count < 400) {
            const i = st.pop(); count++; const x = i % m.w, y = (i / m.w) | 0;
            for (let k = 0; k < 4; k++) { const nx = x + [1, -1, 0, 0][k], ny = y + [0, 0, 1, -1][k]; if (!m.inb(nx, ny)) continue; const ni = ny * m.w + nx; if (!seen[ni] && m.passable(nx, ny, 'ground')) { seen[ni] = 1; st.push(ni); } }
          }
          ok = count >= 400;
        }
      }
      for (const [i, v] of tmp) m.occ[i] = v;
      return ok;
    }

    // ------------------------------------------------------------------ commands (validated; also the multiplayer boundary)
    command(pid, c) {
      const p = this.players[pid]; if (!p || !p.alive || this.over) return { ok: false, reason: 'Inactive' };
      const own = (ids) => (ids || []).map((id) => this.get(id)).filter((e) => e && e.owner === pid && e.kind === 'unit' && !e.inside && !e.locked);
      switch (c.c) {
        case 'move': case 'amove': case 'attack': case 'patrol': case 'stop': case 'hold': case 'retreat': case 'repair': case 'load': case 'unload': case 'guard':
          return this.unitOrder(pid, own(c.ids), c);
        case 'build': {
          const b = own(c.ids).filter((u) => D.UNITS[u.type].builder);
          if (!b.length) return { ok: false, reason: 'No builder selected' };
          const miss = this.buildReqMissing(pid, c.type); if (miss) return { ok: false, reason: miss };
          const pl = this.canPlace(pid, c.type, c.tx, c.ty); if (!pl.ok) return pl;
          const cost = this.buildingCost(pid, c.type);
          if (!this.pay(pid, cost)) return { ok: false, reason: 'Insufficient resources' };
          const site = this.placeBuilding(pid, c.type, c.tx, c.ty, false);
          site.paid = cost;
          for (const u of b) { if (!c.queue) u.orders = []; u.orders.push({ t: 'build', id: site.id }); u.path = null; u.hold = false; }
          this.emit({ e: 'place', owner: pid, x: site.x, y: site.y });
          return { ok: true, id: site.id };
        }
        case 'produce': {
          const b = this.get(c.id); if (!b || b.owner !== pid || b.kind !== 'bld' || !b.built) return { ok: false, reason: 'Invalid factory' };
          const d = D.BUILDINGS[b.type]; if (!d.produces || d.produces.indexOf(c.type) < 0) return { ok: false, reason: 'Cannot produce here' };
          const miss = this.unitReqMissing(pid, c.type); if (miss) return { ok: false, reason: miss };
          if (b.queue.length >= 10) return { ok: false, reason: 'Queue full' };
          if (this.unitCount(pid) + this.queuedUnits(pid) >= this.unitCap) return { ok: false, reason: 'Unit cap reached (' + this.unitCap + ')' };
          const ud = D.unitFor(c.type, p.faction);
          const n = Math.max(1, Math.min(5, c.n || 1)); let made = 0;
          for (let i = 0; i < n; i++) { if (b.queue.length >= 10 || !this.pay(pid, ud.cost)) break; b.queue.push(c.type); made++; }
          if (!made) return { ok: false, reason: 'Insufficient resources' };
          return { ok: true, n: made };
        }
        case 'cancel': {
          const b = this.get(c.id); if (!b || b.owner !== pid || b.kind !== 'bld') return { ok: false };
          if (!b.built) { // cancel construction: refund 75%
            this.refund(pid, b.paid || this.buildingCost(pid, b.type), 0.75 * (1 - b.progress * 0.5));
            b.paid = { c: 0, m: 0 }; this.removeEntity(b, null); return { ok: true };
          }
          let idx = c.idx != null ? c.idx : b.queue.lastIndexOf(c.type);
          if (idx < 0 || idx >= b.queue.length) return { ok: false };
          const t = b.queue.splice(idx, 1)[0]; this.refund(pid, D.unitFor(t, p.faction).cost, 1);
          if (idx === 0) b.qprog = 0;
          return { ok: true };
        }
        case 'research': {
          const b = this.get(c.id); if (!b || b.owner !== pid || b.type !== 'lab' || !b.built) return { ok: false, reason: 'Need a Research Lab' };
          const r = D.RESEARCH[c.tech]; if (!r) return { ok: false };
          if (p.has(c.tech)) return { ok: false, reason: 'Already researched' };
          if (r.faction && r.faction !== p.faction) return { ok: false, reason: 'Other faction' };
          for (const q of r.req || []) if (!p.has(q)) return { ok: false, reason: 'Requires ' + D.RESEARCH[q].name };
          if (b.research) return { ok: false, reason: 'Lab busy' };
          for (const e of this.ents) if (!e.dead && e.owner === pid && e.research === c.tech) return { ok: false, reason: 'Already in progress' };
          if (!this.pay(pid, r.cost)) return { ok: false, reason: 'Insufficient resources' };
          b.research = c.tech; b.rprog = 0; return { ok: true };
        }
        case 'cancelResearch': {
          const b = this.get(c.id); if (!b || b.owner !== pid || !b.research) return { ok: false };
          this.refund(pid, D.RESEARCH[b.research].cost, 1); b.research = null; b.rprog = 0; return { ok: true };
        }
        case 'rally': { const b = this.get(c.id); if (!b || b.owner !== pid) return { ok: false }; b.rally = { x: c.x, y: c.y }; return { ok: true }; }
        case 'sell': {
          const b = this.get(c.id); if (!b || b.owner !== pid || b.kind !== 'bld' || b.type === 'hq' || !b.built) return { ok: false, reason: 'Cannot demolish' };
          this.refund(pid, this.buildingCost(pid, b.type), 0.4 * b.hp / b.maxHp); this.removeEntity(b, null); return { ok: true };
        }
        case 'strike': {
          const s = this.get(c.id); if (!s || s.owner !== pid || s.type !== 'silo' || !s.built || s.charge < 1) return { ok: false, reason: 'Silo not ready' };
          s.charge = 0; p.siloReady = false;
          this.projectiles.push({ kind: 'nuke', x: s.x, y: s.y, sx: s.x, sy: s.y, tx: c.x, ty: c.y, t: 0, dur: 6, dmg: D.WEAPONS.silo.dmg, type: D.WEAPONS.silo.type, splash: D.WEAPONS.silo.splash, owner: pid, team: p.team, target: 0, arc: 1, w: 'silo' });
          this.emit({ e: 'launch', x: s.x, y: s.y, tx: c.x, ty: c.y, owner: pid });
          for (const q of this.players) if (q.team !== p.team) this.msg('WARNING: Strategic missile launch detected!', q.team, 'alert');
          return { ok: true };
        }
      }
      return { ok: false, reason: 'Unknown command' };
    }

    // ------------------------------------------------------------------ research / production / construction
    buildingTick(b, dt) {
      const p = this.players[b.owner]; const d = D.BUILDINGS[b.type];
      if (!b.built) return;
      const pf = p.powerFactor;
      if (b.queue.length) {
        const ud = D.unitFor(b.queue[0], p.faction);
        b.qprog += dt * pf / ud.time;
        if (b.qprog >= 1) {
          if (this.unitCount(b.owner) >= this.unitCap + 5) { b.qprog = 1; } // hold at cap
          else {
            const t = b.queue.shift(); b.qprog = 0; this.releaseUnit(b, t);
          }
        }
      }
      if (b.research) {
        const r = D.RESEARCH[b.research]; b.rprog += dt * pf / r.time;
        if (b.rprog >= 1) {
          p.tech[b.research] = true; this.emit({ e: 'research', owner: b.owner, tech: b.research, x: b.x, y: b.y });
          this.msg('Research complete: ' + r.name, p.team, 'good');
          this.applyTech(p, b.research); b.research = null; b.rprog = 0;
        }
      }
      if (d.superweapon) {
        const was = b.charge >= 1; b.charge = Math.min(1, b.charge + dt * pf / d.superweapon.charge);
        if (!was && b.charge >= 1) { p.siloReady = true; this.msg('Strategic missile ready', p.team, 'good'); this.emit({ e: 'silo_ready', owner: b.owner }); }
      }
      if (d.repairAura) this._repairAura(b, d.repairAura, dt, true);
    }

    applyTech(p, tech) {
      if (tech === 'composite_armor') for (const e of this.ents) if (!e.dead && e.owner === p.id && e.kind === 'unit' && (e.cls === 'veh' || e.cls === 'naval')) { const r = e.hp / e.maxHp; e.maxHp = Math.round(e.maxHp * 1.2); e.hp = e.maxHp * r; }
      if (tech === 'iron_hulls') for (const e of this.ents) if (!e.dead && e.owner === p.id && e.kind === 'bld') { const r = e.hp / e.maxHp; e.maxHp = Math.round(e.maxHp * 1.3); e.hp = e.maxHp * r; }
    }

    releaseUnit(b, type) {
      const p = this.players[b.owner]; const ud = D.unitFor(type, p.faction);
      const mv = ud.move;
      let pos;
      if (mv === 'air') pos = { x: b.x, y: b.y };
      else {
        const rally = b.rally || { x: b.x, y: b.y + 100 };
        const a = U.angleTo(b.x, b.y, rally.x, rally.y);
        pos = this.map.nearestPassable(b.x + Math.cos(a) * (b.radius + 14), b.y + Math.sin(a) * (b.radius + 14), mv, 10);
        if (!pos) { b.queue.unshift(type); b.qprog = 0.99; return; }
      }
      const u = this.spawnUnit(b.owner, type, pos.x, pos.y, b.rally ? U.angleTo(b.x, b.y, b.rally.x, b.rally.y) : 0);
      u.home = b.id;
      p.stats.built++;
      if (b.rally) u.orders.push({ t: ud.builder ? 'move' : 'amove', x: b.rally.x + this.rng.range(-30, 30), y: b.rally.y + this.rng.range(-30, 30) });
      this.emit({ e: 'unit_ready', owner: b.owner, type, x: u.x, y: u.y, id: u.id });
    }

    constructionTick(dt) {
      // builders add progress through their order handling (sim_units); here finalize sites
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'bld' || e.built) continue;
        if (e.progress >= 1) this.onBuildingComplete(e, false);
      }
    }

    _repairAura(src, aura, dt, building) {
      const p = this.players[src.owner];
      let hps = aura.hps; if (!building && p.has('aegis_logistics')) hps *= 2;
      this.hash.query(src.x, src.y, aura.r, this._q2);
      for (const u of this._q2) {
        if (u.dead || u.kind !== 'unit' || u.owner !== src.owner || u === src || u.hp >= u.maxHp) continue;
        if (u.cls === 'inf' && !building) continue;
        if (this.time - u.lastHitT < 2) continue; // not while under fire
        u.hp = Math.min(u.maxHp, u.hp + hps * dt);
        if ((this.tick + u.id) % 20 === 0) this.emit({ e: 'repair', x: u.x, y: u.y });
      }
    }

    // ------------------------------------------------------------------ fog of war & detection
    updateFog(full) {
      const m = this.map, w = m.w, h = m.h;
      for (const t of this.teams) { this.fog[t].vis.fill(0); this.fog[t].radar = false; }
      const detectors = [];
      for (const e of this.ents) {
        if (e.dead || e.inside) continue;
        if (e.kind === 'bld' && !e.built && e.progress < 0.05) continue;
        const p = this.players[e.owner]; const f = this.fog[p.team];
        const def = e.kind === 'unit' ? D.unitFor(e.type, p.faction) : D.bldFor(e.type, p.faction);
        let vr = def.vision; if (p.has('optics')) vr *= 1.15;
        if (e.kind === 'unit' && e.mv !== 'air' && m.elevAt(e.x, e.y)) vr *= 1.2;
        if (e.kind === 'bld' && !e.built) vr = 96;
        const r = vr / TILE, cx = e.x / TILE, cy = e.y / TILE; const r2 = r * r;
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
        const vis = f.vis, exp = f.exp;
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - cy, dy2 = dy * dy, row = y * w;
          for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx + dy2 <= r2) { vis[row + x] = 1; exp[row + x] = 1; } }
        }
        if (def.detect && (e.kind === 'unit' || e.built)) detectors.push({ team: p.team, x: e.x, y: e.y, r: def.detect });
        if (e.kind === 'unit' && e.type === 'drone' && p.has('vortex_cloak')) { /* drones cloaked: handled in stealth check */ }
        if (def.radar && e.built && !p.lowPower) f.radar = { x: e.x, y: e.y, r: def.radar, team: p.team };
      }
      // radar coverage list per team
      const radars = {};
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'bld' || !e.built || e.type !== 'radar') continue;
        const p = this.players[e.owner]; if (p.lowPower) continue;
        (radars[p.team] = radars[p.team] || []).push({ x: e.x, y: e.y, r: D.bldFor('radar', p.faction).radar });
      }
      this.radars = radars;
      // jammers: enemy radar can't see units inside jam fields
      const jammers = [];
      for (const e of this.ents) if (!e.dead && e.kind === 'unit' && D.UNITS[e.type].jam) jammers.push({ team: this.teamOf(e.owner), x: e.x, y: e.y, r: D.UNITS[e.type].jam });
      this.jammers = jammers;
      // per-entity visibility bits
      for (const e of this.ents) {
        if (e.dead) continue;
        let bits = 0, rbits = 0; const et = this.teamOf(e.owner);
        const tx = (e.x / TILE) | 0, ty = (e.y / TILE) | 0, ti = ty * w + tx;
        const stealthy = this.isStealthed(e);
        const inForest = e.kind === 'unit' && e.mv === 'ground' && m.t[ti] === WF.T.FOREST;
        for (const t of this.teams) {
          if (t === et) { bits |= 1 << t; continue; }
          if (e.inside) continue;
          let seen = false;
          if (e.kind === 'bld') {
            // any tile of the footprint visible
            for (let y = e.ty; y < e.ty + e.h && !seen; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (this.fog[t].vis[y * w + x]) { seen = true; break; }
            if (seen) e.seen[t] = { hp: e.hp, built: e.built, progress: e.progress, t: this.time };
          } else if (this.fog[t].vis[ti]) {
            seen = true;
            if (stealthy && !this._detected(e, t, detectors)) seen = false;
            if (seen && inForest && e.revealT <= 0 && !this._nearEnemyOf(e, t, 150)) seen = false; // forest concealment
          }
          if (seen) bits |= 1 << t;
          else if (e.kind === 'unit' && !stealthy && radars[t] && !this._jammedFor(e, t)) {
            for (const r of radars[t]) if (U.dist2(r.x, r.y, e.x, e.y) < r.r * r.r) { rbits |= 1 << t; break; }
          }
        }
        e.vis = bits; e.radarVis = rbits;
      }
    }
    isStealthed(e) {
      if (e.kind !== 'unit') return false;
      const d = D.UNITS[e.type];
      if (e.revealT > 0) return false;
      if (d.stealth) return true;
      if (e.type === 'drone' && this.players[e.owner].has('vortex_cloak')) return true;
      return false;
    }
    _detected(e, team, detectors) { for (const d of detectors) if (d.team === team && U.dist2(d.x, d.y, e.x, e.y) <= d.r * d.r) return true; return false; }
    _jammedFor(e, team) { for (const j of this.jammers) if (j.team !== team && U.dist2(j.x, j.y, e.x, e.y) < j.r * j.r) return true; return false; }
    _nearEnemyOf(e, team, r) {
      this.hash.query(e.x, e.y, r, this._q2);
      for (const o of this._q2) if (!o.dead && this.teamOf(o.owner) === team && o.kind === 'unit') return true;
      this.airHash.query(e.x, e.y, r, this._q2);
      for (const o of this._q2) if (!o.dead && this.teamOf(o.owner) === team) return true;
      return false;
    }
    visibleTo(e, team) { return (e.vis & (1 << team)) !== 0; }

    // ------------------------------------------------------------------ victory
    checkVictory() {
      if (this.mission && this.mission.custom) return;
      for (const p of this.players) {
        if (!p.alive) continue;
        let hq = 0, prod = 0, fac = 0, builders = 0, any = 0;
        for (const e of this.ents) {
          if (e.dead || e.owner !== p.id) continue; any++;
          if (e.kind === 'bld') { if (e.type === 'hq') hq++; if (e.type === 'factory' || e.type === 'barracks' || e.type === 'airfield' || e.type === 'shipyard') prod++; if (e.type === 'factory' && e.built) fac++; }
          else if (D.UNITS[e.type].builder) builders++;
        }
        let dead;
        if (this.victory === 'hq') dead = hq === 0;
        else if (this.victory === 'annihilation') dead = any === 0;
        else dead = hq === 0 && fac === 0 && builders === 0;
        if (dead) {
          p.alive = false; this.msg(p.name + ' has been defeated', -1, 'alert'); this.emit({ e: 'eliminated', owner: p.id });
          for (const e of this.ents) if (!e.dead && e.owner === p.id && this.victory !== 'annihilation') { e.hp = 0; this.removeEntity(e, null); }
        }
      }
      const teamsAlive = new Set(this.players.filter((p) => p.alive).map((p) => p.team));
      if (teamsAlive.size <= 1 && !this.over) { this.over = true; this.winner = teamsAlive.size ? [...teamsAlive][0] : -1; this.emit({ e: 'gameover', winner: this.winner }); }
    }

    // ------------------------------------------------------------------ main step
    step() {
      const dt = U.TICK;
      this.tick++; this.time += dt;
      // spatial hashes
      this.hash.clear(); this.airHash.clear();
      for (const e of this.ents) { if (e.dead || e.inside) continue; e.px = e.x; e.py = e.y; if (e.mv === 'air') this.airHash.insert(e); else this.hash.insert(e); }
      this.pathBudget = 10;
      // units & buildings
      const n = this.ents.length;
      for (let i = 0; i < n; i++) {
        const e = this.ents[i]; if (e.dead || e.inside) continue;
        if (e.kind === 'unit') this.unitTick(e, dt); else this.buildingTick(e, dt);
        if (e.weapons.length && (e.kind === 'unit' || e.built)) this.weaponsTick(e, dt);
      }
      this.projectilesTick(dt);
      this.constructionTick(dt);
      this.ecoTimer += dt; if (this.ecoTimer >= 0.5) { this.economyTick(this.ecoTimer); this.ecoTimer = 0; }
      this.fogTimer += dt; if (this.fogTimer >= 0.25) { this.fogTimer = 0; this.updateFog(); }
      if (!this.noAI) for (const ai of this.ais) ai.update(dt);
      if (this.mission) this.mission.tick(this, dt);
      if (this.tick % 10 === 0) this.checkVictory();
      // compact entity list
      if (this.tick % 40 === 0) { this.ents = this.ents.filter((e) => !e.dead); for (const [id, e] of this.byId) if (e.dead) this.byId.delete(id); }
      if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
    }

    // ------------------------------------------------------------------ serialization
    serialize() {
      const ents = this.ents.filter((e) => !e.dead).map((e) => {
        const o = Object.assign({}, e); delete o.path; delete o.pi; return o;
      });
      const enc = (arr) => { // RLE for explored
        const out = []; let v = arr[0], c = 0; for (let i = 0; i < arr.length; i++) { if (arr[i] === v) c++; else { out.push(v, c); v = arr[i]; c = 1; } } out.push(v, c); return out;
      };
      const fog = {}; for (const t of this.teams) fog[t] = enc(this.fog[t].exp);
      const data = {
        v: SAVE_VERSION, opts: Object.assign({}, this.opts, { map: undefined }), seed: this.seed, rng: this.rng.s, tick: this.tick, time: this.time, nextId: this.nextId,
        players: this.players.map((p) => ({ id: p.id, name: p.name, faction: p.faction, team: p.team, color: p.color, ai: p.ai, res: p.res, tech: p.tech, alive: p.alive, stats: p.stats, incomeMul: p.incomeMul })),
        ents, projectiles: this.projectiles, fog, over: this.over, winner: this.winner, victory: this.victory, unitCap: this.unitCap,
        aiState: this.ais.map((a) => a.serialize()), mission: this.mission ? this.mission.serialize() : null, mapId: this.map.id,
      };
      const json = JSON.stringify(data);
      return JSON.stringify({ h: U.hash(json), d: json });
    }

    static deserialize(str) {
      let wrap; try { wrap = JSON.parse(str); } catch (e) { throw new Error('Save file is corrupted (invalid JSON)'); }
      if (!wrap || typeof wrap.d !== 'string' || U.hash(wrap.d) !== wrap.h) throw new Error('Save file failed integrity check');
      const d = JSON.parse(wrap.d);
      if (d.v !== SAVE_VERSION) throw new Error('Save version ' + d.v + ' is not compatible');
      const opts = Object.assign({}, d.opts, { mapId: d.mapId, seed: d.seed, players: d.players.map((p) => ({ name: p.name, faction: p.faction, team: p.team, color: p.color, ai: p.ai, res: p.res })) });
      const w = new World(opts);
      w.rng.s = d.rng; w.tick = d.tick; w.time = d.time; w.nextId = d.nextId; w.over = d.over; w.winner = d.winner;
      w.victory = d.victory; w.unitCap = d.unitCap;
      d.players.forEach((pp, i) => { const p = w.players[i]; p.res = pp.res; p.tech = pp.tech; p.alive = pp.alive; p.stats = pp.stats; p.incomeMul = pp.incomeMul || 1; });
      for (const e of d.ents) {
        e.path = null; e.pi = 0; w.ents.push(e); w.byId.set(e.id, e);
        if (e.kind === 'bld') for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) w.map.occ[w.map.idx(x, y)] = e.id;
      }
      w.projectiles = d.projectiles || [];
      for (const t of w.teams) {
        const arr = d.fog[t]; if (!arr) continue; let k = 0; const exp = w.fog[t].exp;
        for (let i = 0; i < arr.length; i += 2) { exp.fill(arr[i], k, k + arr[i + 1]); k += arr[i + 1]; }
      }
      w._pendingAI = d.aiState; w._pendingMission = d.mission;
      w.updatePower(); w.updateFog();
      return w;
    }
  }

  WF.World = World; WF.Player = Player; WF.SAVE_VERSION = SAVE_VERSION;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
