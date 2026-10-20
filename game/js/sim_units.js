/* WARFRONT: DOMINION — unit behaviour: orders, formations, movement/steering, combat, projectiles */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE;
  const W = WF.World.prototype;

  const RANK = { heavy_tank: 0, mammoth: 0, citadel: 0, colossus: 0, siege: 1, med_tank: 1, hover_tank: 1, light_tank: 1, recon: 1, amph: 2, rifle: 2, at_team: 2, ghost: 2, flak: 3, supply: 3, ew: 3, builder: 4, mlrs: 4, howitzer: 4 };

  // ================================================================== ORDERS
  W.unitOrder = function (pid, units, c) {
    if (!units.length) return { ok: false, reason: 'No units' };
    const q = !!c.queue;
    const setOrders = (u, ord) => { if (!q) { u.orders = []; u.path = null; u.target = 0; } u.orders.push(ord); u.hold = false; u.repaths = 0; u.deployed = 0; };
    switch (c.c) {
      case 'stop': for (const u of units) { u.orders = []; u.path = null; u.target = 0; u.hold = false; u.formSpeed = 0; } return { ok: true };
      case 'hold': for (const u of units) { u.orders = []; u.path = null; u.hold = true; u.formSpeed = 0; } return { ok: true };
      case 'attack': {
        const t = this.get(c.id);
        if (!t || !this.isEnemy(pid, t.owner)) return { ok: false, reason: 'Invalid target' };
        if (!this.visibleTo(t, this.teamOf(pid)) && !(t.kind === 'bld' && t.seen[this.teamOf(pid)])) return { ok: false, reason: 'Target not visible' };
        let any = false;
        for (const u of units) { if (this.canEverHit(u, t)) { setOrders(u, { t: 'attack', id: t.id }); u.formSpeed = 0; any = true; } }
        return any ? { ok: true } : { ok: false, reason: 'Selected units cannot attack that target' };
      }
      case 'move': case 'amove': {
        const slots = this.formationSlots(units, c.x, c.y, c.formation || 'auto');
        const keep = c.formation && c.formation !== 'auto' && units.length > 1;
        let minSpeed = 1e9; if (keep) for (const u of units) if (u.mv !== 'air') minSpeed = Math.min(minSpeed, D.unitFor(u.type, this.players[u.owner].faction).speed);
        // shared path for the bulk of ground units
        const shared = {};
        for (const u of units) {
          const s = slots.get(u.id);
          setOrders(u, { t: c.c, x: s.x, y: s.y });
          u.formSpeed = keep && u.mv !== 'air' ? minSpeed : 0;
          if (!q && u.mv !== 'air') {
            const key = u.mv; (shared[key] = shared[key] || []).push(u);
          }
        }
        for (const mv in shared) {
          const grp = shared[mv]; if (grp.length < 3) continue;
          let cx = 0, cy = 0; for (const u of grp) { cx += u.x; cy += u.y; } cx /= grp.length; cy /= grp.length;
          const st = this.map.nearestPassable(cx, cy, mv, 6); if (!st) continue;
          const path = this.map.findPath(st.x, st.y, c.x, c.y, mv, 12000);
          if (!path || path.length < 2) continue;
          for (const u of grp) {
            if (U.dist2(u.x, u.y, cx, cy) > 260 * 260) continue;
            const s = slots.get(u.id);
            const p = path.slice(0, -1); p.push({ x: s.x, y: s.y });
            u.path = p; u.pi = 0; u.pathGoalX = s.x; u.pathGoalY = s.y;
          }
        }
        this.emit({ e: 'order', owner: pid, x: c.x, y: c.y, kind: c.c });
        return { ok: true };
      }
      case 'patrol': {
        const slots = this.formationSlots(units, c.x, c.y, 'auto');
        for (const u of units) { const s = slots.get(u.id); setOrders(u, { t: 'patrol', ax: u.x, ay: u.y, bx: s.x, by: s.y, leg: 1 }); }
        return { ok: true };
      }
      case 'retreat': {
        for (const u of units) {
          const dest = this.retreatPoint(u);
          if (dest) setOrders(u, { t: 'retreat', x: dest.x + this.rng.range(-40, 40), y: dest.y + this.rng.range(-40, 40) });
        }
        return { ok: true };
      }
      case 'repair': {
        const t = this.get(c.id); if (!t || t.owner !== pid) return { ok: false, reason: 'Invalid target' };
        let any = false;
        for (const u of units) if (D.UNITS[u.type].builder) { setOrders(u, { t: t.kind === 'bld' && !t.built ? 'build' : 'repair', id: t.id }); any = true; }
        return any ? { ok: true } : { ok: false, reason: 'Needs a builder' };
      }
      case 'load': {
        const t = this.get(c.id); if (!t || t.owner !== pid || !t.cargo) return { ok: false, reason: 'Not a transport' };
        let any = false;
        for (const u of units) if (u.cls === 'inf') { setOrders(u, { t: 'load', id: t.id }); any = true; }
        return any ? { ok: true } : { ok: false, reason: 'Only infantry can board' };
      }
      case 'unload': {
        let any = false;
        for (const u of units) if (u.cargo && u.cargo.length) { setOrders(u, { t: 'unload', x: c.x, y: c.y }); any = true; }
        return any ? { ok: true } : { ok: false, reason: 'No loaded transport selected' };
      }
    }
    return { ok: false };
  };

  W.retreatPoint = function (u) {
    let best = null, bd = 1e18;
    for (const e of this.ents) {
      if (e.dead || e.owner !== u.owner || e.kind !== 'bld' || !e.built) continue;
      if (u.mv === 'air' ? e.type !== 'airfield' && e.type !== 'hq' : (e.type !== 'repair' && e.type !== 'hq')) continue;
      const pri = e.type === 'repair' || e.type === 'airfield' ? 0.5 : 1;
      const d = U.dist2(u.x, u.y, e.x, e.y) * pri; if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    if (u.mv === 'air') return { x: best.x, y: best.y };
    return this.map.nearestPassable(best.x, best.y + best.radius + 30, u.mv, 8);
  };

  /** Formation slot assignment. Returns Map(unitId -> {x,y}). */
  W.formationSlots = function (units, tx, ty, type) {
    const out = new Map();
    const n = units.length;
    if (n === 1) { const u = units[0]; const p = u.mv === 'air' ? { x: tx, y: ty } : (this.map.nearestPassable(tx, ty, u.mv, 10) || { x: tx, y: ty }); out.set(u.id, p); return out; }
    let cx = 0, cy = 0; for (const u of units) { cx += u.x; cy += u.y; } cx /= n; cy /= n;
    const dir = U.angleTo(cx, cy, tx, ty); const fx = Math.cos(dir), fy = Math.sin(dir); const lx = -fy, ly = fx;
    let maxR = 8; for (const u of units) maxR = Math.max(maxR, u.radius);
    const sp = Math.min(maxR * 2 + 12, 60);
    const sorted = units.slice().sort((a, b) => (RANK[a.type] != null ? RANK[a.type] : 2) - (RANK[b.type] != null ? RANK[b.type] : 2) || a.id - b.id);
    const rel = []; // [lateral, depth]
    if (type === 'column') { for (let i = 0; i < n; i++) rel.push([(i % 2) - 0.5, -Math.floor(i / 2)]); }
    else if (type === 'wedge') { let row = 0, k = 0; for (let i = 0; i < n; i++) { const inRow = row + 1; rel.push([(k - row / 2) * 1.2, -row]); k++; if (k >= inRow) { row++; k = 0; } } }
    else if (type === 'box') {
      const side = Math.max(2, Math.ceil(Math.sqrt(n))); const ring = [];
      for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) { const edge = i === 0 || j === 0 || i === side - 1 || j === side - 1; ring.push([j - (side - 1) / 2, -(i - (side - 1) / 2), edge ? 0 : 1]); }
      ring.sort((a, b) => a[2] - b[2]); // edge slots first for front-line ranks
      for (let i = 0; i < n; i++) rel.push(ring[i]);
    } else {
      const width = type === 'line' ? Math.max(4, Math.min(12, Math.ceil(n / 2))) : Math.max(2, Math.min(10, Math.ceil(Math.sqrt(n * 1.5))));
      for (let i = 0; i < n; i++) { const row = Math.floor(i / width), col = i % width; const inRow = Math.min(width, n - row * width); rel.push([col - (inRow - 1) / 2, -row]); }
    }
    for (let i = 0; i < n; i++) {
      const u = sorted[i]; const [la, de] = rel[i];
      const x = tx + lx * la * sp + fx * de * sp, y = ty + ly * la * sp + fy * de * sp;
      const p = u.mv === 'air' ? { x: U.clamp(x, 16, this.map.pw - 16), y: U.clamp(y, 16, this.map.ph - 16) } : (this.map.nearestPassable(U.clamp(x, 16, this.map.pw - 16), U.clamp(y, 16, this.map.ph - 16), u.mv, 8) || this.map.nearestPassable(tx, ty, u.mv, 16) || { x: tx, y: ty });
      out.set(u.id, p);
    }
    return out;
  };

  // ================================================================== TARGETING HELPERS
  W.domainOf = function (t) { if (t.mv === 'air') return 'a'; if (t.cls === 'naval') return 'n'; return 'g'; };
  W.weaponCanHit = function (wd, t) { return wd.tg.indexOf(this.domainOf(t)) >= 0 && (D.DMG[wd.type][t.armor] > 0); };
  W.canEverHit = function (u, t) { for (const ws of u.weapons) if (this.weaponCanHit(D.WEAPONS[ws.w], t)) return true; return false; };
  W.weaponRange = function (e, wd) {
    const p = this.players[e.owner]; let r = wd.range;
    if (p.has('optics')) r *= 1.08;
    if (e.kind === 'unit' && e.mv !== 'air' && this.map.elevAt(e.x, e.y)) r *= 1.12;
    if (this._jammed(e)) r *= 0.85;
    return r;
  };
  W._jammed = function (e) {
    if (!this.jammers || !this.jammers.length) return false;
    const team = this.teamOf(e.owner);
    for (const j of this.jammers) if (j.team !== team && U.dist2(j.x, j.y, e.x, e.y) < j.r * j.r) return true;
    return false;
  };

  /** Best visible enemy within radius r for the given unit (any of its weapons). */
  W.acquire = function (e, r, wdFilter) {
    const team = this.teamOf(e.owner); let best = null, bs = -1e9;
    const consider = (list) => {
      for (const t of list) {
        if (t.dead || t.inside || this.teamOf(t.owner) === team) continue;
        if (!(t.vis & (1 << team))) continue;
        if (t.kind === 'bld' && !t.built && t.progress < 0.02) continue;
        let mult = 0;
        for (const ws of e.weapons) { const wd = D.WEAPONS[ws.w]; if (wdFilter && wd !== wdFilter) continue; if (this.weaponCanHit(wd, t)) mult = Math.max(mult, D.DMG[wd.type][t.armor]); }
        if (mult <= 0) continue;
        const d = Math.sqrt(U.dist2(e.x, e.y, t.x, t.y)) - t.radius; if (d > r) continue;
        let s = mult * 2 - d / Math.max(r, 1);
        if (t.kind === 'bld') { s -= t.weapons.length ? 0.2 : 1.2; if (t.type === 'wall') s -= 2; }
        else { const td = D.UNITS[t.type]; if (td.weapons) s += 0.6; if (td.experimental) s += 0.3; if (td.builder) s += 0.2; }
        if (t.hp < t.maxHp * 0.3) s += 0.4; // finish off
        if (t.id === e.target) s += 0.3;     // stickiness
        if (s > bs) { bs = s; best = t; }
      }
    };
    consider(this.hash.query(e.x, e.y, r + 30, this._q));
    let canAir = false; for (const ws of e.weapons) if (D.WEAPONS[ws.w].tg.indexOf('a') >= 0) canAir = true;
    if (canAir) consider(this.airHash.query(e.x, e.y, r + 30, this._q));
    return best;
  };

  // ================================================================== UNIT TICK
  W.unitTick = function (e, dt) {
    const def = D.unitFor(e.type, this.players[e.owner].faction);
    if (e.revealT > 0) e.revealT -= dt;
    // field logistics self-repair
    if (this.players[e.owner].has('aegis_logistics') && e.hp < e.maxHp && this.time - e.lastHitT > 6) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
    if (def.repairAura) this._repairAura(e, def.repairAura, dt, false);
    // auto-acquire target periodically (staggered)
    e.acqT -= dt;
    const hasW = e.weapons.length > 0;
    if (hasW && e.acqT <= 0) {
      e.acqT = 0.4 + (e.id % 5) * 0.03;
      const cur = this.get(e.target);
      const leash = def.vision * 1.05;
      if (!cur || !this.visibleTo(cur, this.teamOf(e.owner)) || U.dist(e.x, e.y, cur.x, cur.y) > leash + 40) {
        const t = this.acquire(e, leash); e.target = t ? t.id : 0;
      } else {
        const t = this.acquire(e, leash); if (t) e.target = t.id;
      }
    }
    const o = e.orders[0];
    if (e.mv === 'air' && def.air === 'jet') return this.jetTick(e, def, o, dt);
    if (!o) return this.idleTick(e, def, dt);
    switch (o.t) {
      case 'move': case 'retreat':
        if (this.moveTo(e, def, o.x, o.y, dt, e.orders.length > 1 ? 24 : 12)) this.nextOrder(e);
        break;
      case 'amove': {
        const t = this.get(e.target);
        if (t && hasW && !def.builder) { this.engage(e, def, t, dt); }
        else if (this.moveTo(e, def, o.x, o.y, dt, 14)) this.nextOrder(e);
        break;
      }
      case 'patrol': {
        const t = this.get(e.target);
        if (t && hasW) { this.engage(e, def, t, dt); break; }
        const gx = o.leg ? o.bx : o.ax, gy = o.leg ? o.by : o.ay;
        if (this.moveTo(e, def, gx, gy, dt, 16)) { o.leg = 1 - o.leg; e.path = null; }
        break;
      }
      case 'attack': {
        const t = this.get(o.id);
        const team = this.teamOf(e.owner);
        if (!t || (!this.visibleTo(t, team) && t.kind !== 'bld')) { this.nextOrder(e); break; }
        e.target = t.id;
        this.engage(e, def, t, dt, true);
        break;
      }
      case 'build': case 'repair': {
        const t = this.get(o.id);
        if (!t || t.owner !== e.owner || (o.t === 'build' && t.built) || (o.t === 'repair' && t.hp >= t.maxHp)) { this.nextOrder(e); break; }
        const reach = t.radius + e.radius + 20;
        if (U.dist(e.x, e.y, t.x, t.y) > reach) { this.moveTo(e, def, t.x, t.y, dt, reach - 4, t); }
        else {
          this.stopMoving(e); e.angle = U.turnToward(e.angle, U.angleTo(e.x, e.y, t.x, t.y), def.turn * dt);
          if (o.t === 'build') {
            const bd = D.bldFor(t.type, this.players[t.owner].faction);
            const inc = dt * def.buildRate * this.players[e.owner].powerFactor ** 0.3 / bd.time;
            t.progress = Math.min(1, t.progress + inc); t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.9 * inc);
            if ((this.tick + e.id) % 6 === 0) this.emit({ e: 'weld', x: t.x + this.rng.range(-t.radius, t.radius) * 0.6, y: t.y + this.rng.range(-t.radius, t.radius) * 0.6 });
          } else {
            t.hp = Math.min(t.maxHp, t.hp + def.repairRate * dt * (t.kind === 'bld' ? 1.5 : 1));
            if ((this.tick + e.id) % 6 === 0) this.emit({ e: 'weld', x: t.x + this.rng.range(-t.radius, t.radius) * 0.6, y: t.y + this.rng.range(-t.radius, t.radius) * 0.6 });
          }
        }
        break;
      }
      case 'load': {
        const t = this.get(o.id);
        if (!t || !t.cargo || t.cargo.length >= D.UNITS[t.type].transport) { this.nextOrder(e); break; }
        if (U.dist(e.x, e.y, t.x, t.y) < t.radius + 22) { t.cargo.push(e.id); e.inside = t.id; e.orders = []; e.path = null; this.emit({ e: 'board', x: t.x, y: t.y }); }
        else this.moveTo(e, def, t.x, t.y, dt, t.radius + 16, t);
        break;
      }
      case 'unload': {
        if (!e.cargo || !e.cargo.length) { this.nextOrder(e); break; }
        if (this.moveTo(e, def, o.x, o.y, dt, 30) || (U.dist(e.x, e.y, o.x, o.y) < 60 && this.map.passablePx(e.x, e.y, 'ground'))) {
          const tile = this.map.tileAt(e.x, e.y);
          if (!WF.PASS.ground[tile]) { // on water: find nearest shore point
            const sh = this.map.nearestPassable(e.x, e.y, 'ground', 6); if (sh) { o.x = sh.x; o.y = sh.y; e.path = null; } else this.nextOrder(e);
            break;
          }
          let k = 0;
          for (const cid of e.cargo) {
            const c = this.byId.get(cid); if (!c || c.dead) continue;
            const a = (k++ / e.cargo.length) * Math.PI * 2; const p = this.map.nearestPassable(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, 'ground', 6) || { x: e.x, y: e.y };
            c.inside = 0; c.x = p.x; c.y = p.y; c.px = p.x; c.py = p.y; c.orders = []; c.path = null;
          }
          e.cargo = []; this.emit({ e: 'board', x: e.x, y: e.y }); this.nextOrder(e);
        }
        break;
      }
      default: this.nextOrder(e);
    }
  };

  W.nextOrder = function (e) { e.orders.shift(); e.path = null; e.repaths = 0; if (!e.orders.length) { e.formSpeed = 0; this.stopMoving(e); } };
  W.stopMoving = function (e) { e.vx = 0; e.vy = 0; };

  W.idleTick = function (e, def, dt) {
    this.stopMoving(e);
    if (def.builder) {
      // auto-repair/build nearby friendly structures
      if ((this.tick + e.id) % 20 === 0) {
        let best = null, bd = 260 * 260;
        for (const b of this.hash.query(e.x, e.y, 260, this._q)) {
          if (b.dead || b.owner !== e.owner || b.kind !== 'bld') continue;
          if (b.built && b.hp >= b.maxHp) continue;
          const d = U.dist2(e.x, e.y, b.x, b.y); if (d < bd) { bd = d; best = b; }
        }
        if (best) e.orders.push({ t: best.built ? 'repair' : 'build', id: best.id, auto: true });
      }
      this.separate(e, def, dt);
      return;
    }
    const t = this.get(e.target);
    if (t && e.weapons.length) {
      if (e.hold) { this.faceFixedWeapons(e, def, t, dt); }
      else {
        // chase within guard leash, then come back
        if (!e.guardX) { e.guardX = e.x; e.guardY = e.y; }
        if (U.dist(e.guardX, e.guardY, t.x, t.y) < def.vision * 1.4) { this.engage(e, def, t, dt); return; }
      }
    } else if (e.guardX && !e.hold && U.dist(e.x, e.y, e.guardX, e.guardY) > 40) {
      if (this.moveTo(e, def, e.guardX, e.guardY, dt, 20)) { e.guardX = 0; }
      return;
    } else { e.guardX = 0; }
    this.separate(e, def, dt);
  };

  /** Move into weapon range of t (with LOS) and let weapons fire; returns nothing. */
  W.engage = function (e, def, t, dt, forced) {
    // primary weapon = longest-range weapon that can hit t
    let best = null, br = 0;
    for (const ws of e.weapons) { const wd = D.WEAPONS[ws.w]; if (this.weaponCanHit(wd, t)) { const r = this.weaponRange(e, wd); if (r > br) { br = r; best = wd; } } }
    if (!best) { if (forced) this.nextOrder(e); return; }
    const d = U.dist(e.x, e.y, t.x, t.y) - t.radius;
    const inRange = d <= br * 0.92 && (best.indirect || e.mv === 'air' || this.map.los(e.x, e.y, t.x, t.y));
    if (inRange && (!best.minRange || d > best.minRange)) {
      this.stopMoving(e); e.path = null;
      this.faceFixedWeapons(e, def, t, dt);
      this.separate(e, def, dt);
    } else if (best.minRange && d <= best.minRange) {
      // too close for artillery: back off
      const a = U.angleTo(t.x, t.y, e.x, e.y);
      this.moveTo(e, def, e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120, dt, 10);
    } else {
      if (e.hold) { this.separate(e, def, dt); return; }
      this.moveTo(e, def, t.x, t.y, dt, Math.max(8, br * 0.8), t);
    }
  };

  W.faceFixedWeapons = function (e, def, t, dt) {
    const fixed = e.mv === 'air' || e.cls === 'inf' || e.weapons.some((ws) => D.WEAPONS[ws.w].deploy);
    if (fixed) e.angle = U.turnToward(e.angle, U.angleTo(e.x, e.y, t.x, t.y), (e.cls === 'inf' ? 10 : def.turn) * dt);
  };

  // ================================================================== MOVEMENT
  /** Steer along a path toward (gx,gy). Returns true on arrival. `ent` = optional target entity (arrive near its edge). */
  W.moveTo = function (e, def, gx, gy, dt, arrive, ent) {
    const dGoal = U.dist(e.x, e.y, gx, gy);
    if (dGoal <= arrive) { this.stopMoving(e); return true; }
    if (e.mv === 'air') { this.flyToward(e, def, gx, gy, dt, arrive); return false; }
    // (re)path
    if (!e.path || U.dist2(e.pathGoalX, e.pathGoalY, gx, gy) > (ent ? 80 * 80 : 24 * 24) || e.pathVer !== this.map.version && (this.tick + e.id) % 40 === 0) {
      if (this.pathBudget <= 0) { this.separate(e, def, dt); return false; }
      this.pathBudget--;
      e.path = this.map.findPath(e.x, e.y, gx, gy, e.mv, 9000) || [{ x: gx, y: gy }];
      e.pi = 0; e.pathGoalX = gx; e.pathGoalY = gy; e.pathVer = this.map.version;
      if (!e.path.length) e.path.push({ x: gx, y: gy });
    }
    let wp = e.path[e.pi];
    while (wp && U.dist(e.x, e.y, wp.x, wp.y) < Math.max(10, e.radius) && e.pi < e.path.length - 1) { e.pi++; wp = e.path[e.pi]; }
    if (!wp) wp = { x: gx, y: gy };
    const last = e.pi >= e.path.length - 1;
    if (last && U.dist(e.x, e.y, wp.x, wp.y) <= Math.max(6, Math.min(arrive, 10))) {
      // path ended (goal unreachable or arrived)
      if (!e.path.reachedGoal && dGoal > arrive) { this.stopMoving(e); e.stuckT += dt; if (e.stuckT > 1) { e.stuckT = 0; return true; } return false; }
      this.stopMoving(e); return true;
    }
    this.steer(e, def, wp.x, wp.y, dt, last ? U.dist(e.x, e.y, wp.x, wp.y) : 999);
    // stuck detection
    e.stuckT += dt;
    if (e.stuckT > 1.5) {
      const moved = U.dist(e.x, e.y, e.lastX, e.lastY);
      e.lastX = e.x; e.lastY = e.y; e.stuckT = 0;
      if (moved < 8) {
        e.repaths = (e.repaths || 0) + 1; e.path = null;
        // congestion: sidestep randomly so jams dissolve
        const a = this.rng.range(0, Math.PI * 2); this.applyMove(e, Math.cos(a) * 6, Math.sin(a) * 6);
        if (e.repaths > 3 && dGoal < 160) { e.repaths = 0; return true; }
        if (e.repaths > 10) { e.repaths = 0; return true; } // give up after ~15 s of no progress
      } else e.repaths = 0;
    }
    return false;
  };

  W.steer = function (e, def, wx, wy, dt, distLeft) {
    const desired = U.angleTo(e.x, e.y, wx, wy);
    const turn = def.turn * dt;
    let spd = (e.formSpeed || def.speed) * this.map.speedMul(e.x, e.y, e.mv);
    if (distLeft < 40) spd *= Math.max(0.35, distLeft / 40);
    if (e.cls === 'inf') { e.angle = U.turnToward(e.angle, desired, 12 * dt); }
    else {
      e.angle = U.turnToward(e.angle, desired, turn);
      const diff = Math.abs(U.wrapAngle(desired - e.angle));
      const f = Math.cos(Math.min(diff, Math.PI / 2)); spd *= f * f;
      if (diff > 1.2) spd = Math.min(spd, def.speed * 0.15);
    }
    e.vx = Math.cos(e.angle) * spd; e.vy = Math.sin(e.angle) * spd;
    this.applyMove(e, e.vx * dt, e.vy * dt);
    this.separate(e, def, dt);
  };

  W.applyMove = function (e, dx, dy) {
    const nx = e.x + dx, ny = e.y + dy, m = this.map;
    if (!m.passablePx(e.x, e.y, e.mv)) { // trapped (e.g. a structure was placed on top): allow escape
      const np = m.nearestPassable(e.x, e.y, e.mv, 4); if (np) { e.x += (np.x - e.x) * 0.2; e.y += (np.y - e.y) * 0.2; } else { e.x = nx; e.y = ny; }
      return true;
    }
    if (m.passablePx(nx, ny, e.mv)) { e.x = nx; e.y = ny; return true; }
    if (m.passablePx(nx, e.y, e.mv)) { e.x = nx; return true; }
    if (m.passablePx(e.x, ny, e.mv)) { e.y = ny; return true; }
    return false;
  };

  /** Soft separation from nearby units of the same layer (prevents pile-ups, pushes idle allies aside). */
  W.separate = function (e, def, dt) {
    const list = (e.mv === 'air' ? this.airHash : this.hash).query(e.x, e.y, e.radius + 30, this._q);
    let sx = 0, sy = 0;
    for (const o of list) {
      if (o === e || o.dead || o.inside) continue;
      if (o.kind === 'bld') continue;
      const rr = e.radius + o.radius + 3; const dx = e.x - o.x, dy = e.y - o.y; const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.01; const push = (rr - d) / rr;
      // moving units push idle ones more than vice versa
      const w = (o.orders.length && !e.orders.length) ? 1.6 : (e.orders.length && !o.orders.length) ? 0.4 : 1;
      sx += (dx / d) * push * w; sy += (dy / d) * push * w;
      if (d < 0.5) { sx += ((e.id % 7) - 3) * 0.3; sy += ((e.id % 5) - 2) * 0.3; }
    }
    if (sx || sy) {
      const k = Math.min(def.speed, 70) * dt * 1.6;
      this.applyMove(e, sx * k, sy * k);
    }
  };

  // ------------------------------------------------------------------ air
  W.flyToward = function (e, def, gx, gy, dt, arrive) {
    const d = U.dist(e.x, e.y, gx, gy);
    const desired = U.angleTo(e.x, e.y, gx, gy);
    e.angle = U.turnToward(e.angle, desired, def.turn * dt);
    const spd = def.speed * Math.min(1, d / 60 + 0.2);
    const diff = Math.abs(U.wrapAngle(desired - e.angle));
    const f = diff > 1 ? 0.4 : 1;
    e.vx = Math.cos(desired) * spd * f; e.vy = Math.sin(desired) * spd * f;
    e.x = U.clamp(e.x + e.vx * dt, 8, this.map.pw - 8); e.y = U.clamp(e.y + e.vy * dt, 8, this.map.ph - 8);
    this.separate(e, def, dt);
  };

  W.jetTick = function (e, def, o, dt) {
    // jets always move forward; attack runs; return to rearm when out of ammo
    const wsList = e.weapons; const hasAmmo = wsList.some((ws) => ws.ammo > 0);
    let gx, gy, target = null;
    if (!hasAmmo || (o && o.t === 'retreat')) {
      const af = this.retreatPoint(e);
      if (af) {
        gx = af.x; gy = af.y;
        if (U.dist(e.x, e.y, gx, gy) < 40) {
          // landed: rearm
          e.rearmT = (e.rearmT || 0) + dt;
          e.x += (gx - e.x) * 0.1; e.y += (gy - e.y) * 0.1; e.vx = 0; e.vy = 0;
          e.landed = 1;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);
          if (e.rearmT > 6) { for (const ws of wsList) ws.ammo = D.WEAPONS[ws.w].ammo || 0; e.rearmT = 0; e.landed = 0; if (o && o.t === 'retreat') this.nextOrder(e); }
          return;
        }
      } else { gx = e.x + Math.cos(e.angle) * 100; gy = e.y + Math.sin(e.angle) * 100; }
    } else if (o && o.t === 'attack') {
      target = this.get(o.id); if (!target || !this.visibleTo(target, this.teamOf(e.owner))) { this.nextOrder(e); return; }
      gx = target.x; gy = target.y;
    } else {
      const t = this.get(e.target);
      if (t && (!o || o.t === 'amove' || o.t === 'patrol')) { target = t; gx = t.x; gy = t.y; }
      else if (o) {
        gx = o.t === 'patrol' ? (o.leg ? o.bx : o.ax) : o.x; gy = o.t === 'patrol' ? (o.leg ? o.by : o.ay) : o.y;
        if (U.dist(e.x, e.y, gx, gy) < 60) { if (o.t === 'patrol') o.leg = 1 - o.leg; else { e.orbitX = gx; e.orbitY = gy; this.nextOrder(e); } }
      } else {
        // orbit
        if (!e.orbitX) { const af = this.retreatPoint(e); e.orbitX = af ? af.x : e.x; e.orbitY = af ? af.y : e.y; }
        const a = U.angleTo(e.orbitX, e.orbitY, e.x, e.y) + 0.9; gx = e.orbitX + Math.cos(a) * 110; gy = e.orbitY + Math.sin(a) * 110;
      }
    }
    e.landed = 0;
    let desired = U.angleTo(e.x, e.y, gx, gy);
    // after passing a target, keep flying a bit before turning (attack run)
    if (target && U.dist(e.x, e.y, gx, gy) < 50 && Math.abs(U.wrapAngle(desired - e.angle)) > 1.5) desired = e.angle;
    e.angle = U.turnToward(e.angle, desired, def.turn * dt);
    const spd = def.speed;
    e.vx = Math.cos(e.angle) * spd; e.vy = Math.sin(e.angle) * spd;
    e.x += e.vx * dt; e.y += e.vy * dt;
    // keep inside map: turn back at edges
    if (e.x < 20 || e.y < 20 || e.x > this.map.pw - 20 || e.y > this.map.ph - 20) {
      e.angle = U.turnToward(e.angle, U.angleTo(e.x, e.y, this.map.pw / 2, this.map.ph / 2), def.turn * dt * 2);
      e.x = U.clamp(e.x, 10, this.map.pw - 10); e.y = U.clamp(e.y, 10, this.map.ph - 10);
    }
  };

  // ================================================================== WEAPONS
  W.weaponsTick = function (e, dt) {
    const p = this.players[e.owner]; const team = p.team;
    const rofF = e.kind === 'bld' ? p.powerFactor : 1;
    const moving = (e.vx * e.vx + e.vy * e.vy) > 25;
    const forced = e.kind === 'unit' && e.orders[0] && e.orders[0].t === 'attack' ? this.get(e.orders[0].id) : null;
    for (let i = 0; i < e.weapons.length; i++) {
      const ws = e.weapons[i]; const wd = D.WEAPONS[ws.w];
      if (ws.cd > 0) ws.cd -= dt * rofF;
      if (ws.recoil > 0) ws.recoil = Math.max(0, ws.recoil - dt * 12);
      const range = this.weaponRange(e, wd);
      // choose target
      let t = null;
      if (forced && this.weaponCanHit(wd, forced)) t = forced;
      else {
        const cur = this.get(ws.target);
        if (cur && this.visibleTo(cur, team) && this.weaponCanHit(wd, cur) && U.dist(e.x, e.y, cur.x, cur.y) - cur.radius <= range) t = cur;
        else {
          const ut = this.get(e.target);
          if (ut && this.visibleTo(ut, team) && this.weaponCanHit(wd, ut) && U.dist(e.x, e.y, ut.x, ut.y) - ut.radius <= range) t = ut;
          else if ((this.tick + e.id + i) % 8 === 0) t = this.acquire(e, range, wd);
        }
      }
      ws.target = t ? t.id : 0;
      // turret aim
      const turret = !(e.mv === 'air' || e.cls === 'inf' || wd.deploy);
      const baseA = e.kind === 'bld' ? 0 : e.angle;
      if (t) {
        const want = U.angleTo(e.x, e.y, t.x, t.y);
        if (turret) ws.ta = U.turnToward(ws.ta, want, (e.kind === 'bld' ? 3.5 : 4.5) * dt);
        else ws.ta = e.angle;
      } else if (turret && e.kind === 'unit') ws.ta = U.turnToward(ws.ta, baseA, 2 * dt);
      // salvo continuation
      if (ws.salvo > 0) {
        ws.st -= dt;
        if (ws.st <= 0) { const st = this.get(ws.starget); if (st || ws.sx != null) { this.fire(e, ws, wd, st, ws.sx, ws.sy); } ws.salvo--; ws.st = wd.salvoDelay || 0.1; if (wd.ammo) ws.ammo = Math.max(0, ws.ammo - (wd.bomb ? 1 : 0)); }
        continue;
      }
      if (!t || ws.cd > 0) continue;
      if (wd.ammo && ws.ammo <= 0) continue;
      const d = U.dist(e.x, e.y, t.x, t.y) - t.radius;
      if (d > range || (wd.minRange && d < wd.minRange)) continue;
      if (wd.deploy && moving) continue;
      const aimErr = Math.abs(U.wrapAngle(U.angleTo(e.x, e.y, t.x, t.y) - (turret ? ws.ta : e.angle)));
      if (aimErr > (wd.bomb ? Math.PI : e.mv === 'air' ? 0.45 : 0.18)) continue;
      if (!wd.indirect && e.mv !== 'air' && t.mv !== 'air' && !this.map.los(e.x, e.y, t.x, t.y)) continue;
      // fire
      ws.cd = wd.rof * (0.95 + this.rng.next() * 0.1);
      this.fire(e, ws, wd, t, t.x, t.y);
      if (wd.ammo) ws.ammo--;
      if (wd.salvo > 1) { ws.salvo = wd.salvo - 1; ws.st = wd.salvoDelay; ws.starget = t.id; ws.sx = t.x; ws.sy = t.y; }
      if (e.kind === 'unit' && this.isStealthed(e) === false && D.UNITS[e.type].stealth) {}
      if (e.kind === 'unit' && (D.UNITS[e.type].stealth)) e.revealT = 2.5; // firing reveals stealth units
    }
  };

  W.fire = function (e, ws, wd, t, aimX, aimY) {
    const p = this.players[e.owner];
    let dmg = wd.dmg; if (p.has('munitions')) dmg *= 1.15;
    const ang = ws.ta;
    const mx = e.x + Math.cos(e.kind === 'bld' || (e.mv !== 'air' && e.cls !== 'inf' && !wd.deploy) ? ang : e.angle) * (e.radius * 0.9);
    const my = e.y + Math.sin(e.kind === 'bld' || (e.mv !== 'air' && e.cls !== 'inf' && !wd.deploy) ? ang : e.angle) * (e.radius * 0.9);
    const tx = t ? t.x : aimX, ty = t ? t.y : aimY;
    let acc = wd.acc; if (this._jammed(e)) acc *= 0.65;
    if (t && t.kind === 'unit' && (t.vx * t.vx + t.vy * t.vy) > 3600) acc *= 0.85;
    if (t && t.cls === 'inf' && this.map.isForest(t.x, t.y)) acc *= 0.85;
    if (p.has('artillery') && wd.indirect) acc = Math.min(1, acc * 1.1);
    let ix = tx, iy = ty, hit = false;
    if (wd.indirect || wd.bomb) {
      const sc = (wd.scatter || 0) * (p.has('artillery') ? 0.85 : 1) * (this._jammed(e) ? 1.4 : 1);
      ix += this.rng.gauss() * sc; iy += this.rng.gauss() * sc;
    } else {
      hit = this.rng.next() < acc;
      if (!hit && t) { const a = this.rng.range(0, Math.PI * 2), r = t.radius + this.rng.range(6, 26); ix = tx + Math.cos(a) * r; iy = ty + Math.sin(a) * r; }
    }
    const dist = U.dist(mx, my, ix, iy);
    const dur = wd.bomb ? 0.9 : Math.max(0.05, dist / wd.speed);
    this.projectiles.push({
      kind: wd.proj, x: mx, y: my, sx: mx, sy: my, tx: ix, ty: iy, t: 0, dur, dmg, type: wd.type, splash: wd.splash || 0,
      owner: e.owner, team: p.team, target: t ? t.id : 0, hit, homing: !!wd.homing, w: ws.w, src: e.id, air: t ? t.mv === 'air' : false,
      arc: wd.indirect ? Math.min(1, dist / 400) : 0,
    });
    ws.recoil = wd.recoil || 0;
    this.emit({ e: 'fire', w: ws.w, x: mx, y: my, a: Math.atan2(iy - my, ix - mx), owner: e.owner, id: e.id, snd: wd.snd });
  };

  W.projectilesTick = function (dt) {
    const keep = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (pr.homing && pr.target) {
        const t = this.get(pr.target);
        if (t) { pr.tx = t.x; pr.ty = t.y; }
      } else if (!pr.homing && pr.hit && pr.target && pr.kind !== 'artyshell') {
        const t = this.get(pr.target); if (t) { pr.tx = t.x; pr.ty = t.y; }
      }
      const k = Math.min(1, pr.t / pr.dur);
      pr.x = pr.sx + (pr.tx - pr.sx) * k; pr.y = pr.sy + (pr.ty - pr.sy) * k;
      if (pr.t >= pr.dur) this.impact(pr); else keep.push(pr);
    }
    this.projectiles = keep;
  };

  W.impact = function (pr) {
    const team = pr.team;
    if (pr.splash > 0) {
      const airOnly = pr.type === 'flak';
      const list = airOnly ? this.airHash.query(pr.tx, pr.ty, pr.splash + 30, this._q) : this.hash.query(pr.tx, pr.ty, pr.splash + 30, this._q);
      for (const t of list.slice()) {
        if (t.dead || t.inside || this.teamOf(t.owner) === team) continue;
        const d = U.dist(pr.tx, pr.ty, t.x, t.y) - t.radius * 0.6;
        if (d > pr.splash) continue;
        const fall = d <= 0 ? 1 : 1 - 0.5 * (d / pr.splash);
        this.damage(t, pr.dmg * fall, pr.type, pr.owner, pr.src);
      }
      // direct hit bonus for non-splash-primary weapons (e.g. boat gun) handled by splash center
    } else if (pr.hit && pr.target) {
      const t = this.get(pr.target);
      if (t && U.dist(t.x, t.y, pr.tx, pr.ty) < t.radius + 30) this.damage(t, pr.dmg, pr.type, pr.owner, pr.src);
    }
    this.emit({ e: 'impact', kind: pr.kind, x: pr.tx, y: pr.ty, splash: pr.splash, type: pr.type, hit: pr.hit, air: pr.air, w: pr.w, water: !WF.PASS.ground[this.map.tileAt(pr.tx, pr.ty)] });
  };

  W.damage = function (t, amount, type, attackerOwner, attackerId) {
    if (t.dead) return;
    let mult = D.DMG[type][t.armor]; if (mult === undefined) mult = 1;
    if (t.cls === 'inf' && this.map.isForest(t.x, t.y)) mult *= 0.7;
    if (t.kind === 'bld' && !t.built) mult *= 1.2;
    const dmg = amount * mult; if (dmg <= 0) return;
    t.hp -= dmg; t.lastHitT = this.time;
    if (attackerOwner != null && this.players[attackerOwner]) this.players[attackerOwner].stats.dmg += dmg;
    t.lastAttacker = attackerId || 0;
    if (t.kind === 'unit' && t.revealT < 1) t.revealT = Math.max(t.revealT, 0.5);
    // retaliation: idle units respond to attackers they can see
    if (t.kind === 'unit' && !t.orders.length && attackerId) {
      const a = this.get(attackerId);
      if (a && this.canEverHit(t, a) && this.visibleTo(a, this.teamOf(t.owner))) t.target = a.id;
    }
    if (this.mission && this.mission.onDamage) this.mission.onDamage(this, t, attackerOwner);
    if (t.hp <= 0) {
      t.hp = 0;
      const a = this.byId.get(attackerId); if (a) a.kills = (a.kills || 0) + 1;
      this.removeEntity(t, attackerOwner);
    }
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
