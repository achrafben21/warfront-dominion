/* WARFRONT: DOMINION — strategic AI opponent.
 * Plays by the same rules as the human: same commands, same fog of war, same costs.
 * The only optional advantage is the documented income multiplier of the 'brutal' level (configurable). */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE;

  const COMBAT_ROLE = {
    rifle: 'inf', at_team: 'at', ghost: 'scout', recon: 'scout', light_tank: 'tank', med_tank: 'tank', hover_tank: 'tank', heavy_tank: 'tank', mammoth: 'tank',
    flak: 'aa', mlrs: 'arty', howitzer: 'arty', siege: 'arty', supply: 'support', ew: 'support', amph: 'transport',
    drone: 'scout', gunship: 'air', fighter: 'fighter', bomber: 'bomber', patrol: 'navy', missile_boat: 'navy', destroyer: 'navy', submarine: 'navy',
    citadel: 'tank', aurora: 'air', colossus: 'tank',
  };

  class AI {
    constructor(world, pid, level) {
      this.w = world; this.pid = pid; this.p = world.players[pid];
      this.L = D.AI_LEVELS.find((l) => l.id === level) || D.AI_LEVELS[1];
      this.p.incomeMul = world.opts.aiIncomeBonus === false ? 1 : this.L.income;
      this.t = world.rng.range(0, 1); this.thinkT = 0;
      this.attackT = 0; this.waveNo = 0; this.lastAttackTime = -999;
      this.scouted = {}; this.scoutId = 0; this.defending = false;
      this.retreating = new Set();
      this.enemySeen = { air: 0, heavy: 0, light: 0, inf: 0, naval: 0, arty: 0, total: 0 };
      this.buildPlan = [];
      this.waterMap = this.w.map.deposits.some((d) => d.island) || this._waterShare() > 0.25;
    }
    _waterShare() { let n = 0; for (let i = 0; i < this.w.map.n; i++) if (this.w.map.t[i] === WF.T.WATER) n++; return n / this.w.map.n; }
    serialize() { return { pid: this.pid, level: this.L.id, waveNo: this.waveNo, attackT: this.attackT }; }
    restore(s) { this.waveNo = s.waveNo || 0; this.attackT = s.attackT || 0; }

    cmd(c) { return this.w.command(this.pid, c); }

    update(dt) {
      if (!this.p.alive || this.w.over) return;
      this.thinkT -= dt;
      if (this.thinkT > 0) return;
      this.thinkT = this.L.think * (0.85 + this.w.rng.next() * 0.3);
      this.scan();
      this.economy();
      this.production();
      this.research();
      this.military();
      this.superweapon();
      this.reserve = 0;
    }

    // ---------------------------------------------------------------- perception (fog-limited)
    scan() {
      const w = this.w, team = this.p.team;
      this.mine = []; this.army = []; this.builders = []; this.blds = []; this.sites = [];
      this.enemyUnitsVisible = []; this.enemyBlds = [];
      const es = { air: 0, heavy: 0, light: 0, inf: 0, naval: 0, arty: 0, total: 0 };
      for (const e of w.ents) {
        if (e.dead || e.inside) continue;
        if (e.owner === this.pid) {
          if (e.kind === 'unit') { this.mine.push(e); if (D.UNITS[e.type].builder) this.builders.push(e); else this.army.push(e); }
          else { this.blds.push(e); if (!e.built) this.sites.push(e); }
        } else if (w.isEnemy(this.pid, e.owner)) {
          if (e.kind === 'bld') { if (e.seen[team] || w.visibleTo(e, team)) this.enemyBlds.push(e); }
          else if (w.visibleTo(e, team) || (e.radarVis & (1 << team))) {
            this.enemyUnitsVisible.push(e);
            const d = D.UNITS[e.type]; const v = d.cost.c + d.cost.m * 2;
            if (e.mv === 'air') es.air += v; else if (e.cls === 'naval') es.naval += v; else if (e.cls === 'inf') es.inf += v;
            else if (d.weapons && D.WEAPONS[d.weapons[0]].indirect) es.arty += v; else if (e.armor === 'heavy') es.heavy += v; else es.light += v;
            es.total += v;
          }
        }
      }
      // exponential memory of enemy composition
      for (const k in es) this.enemySeen[k] = this.enemySeen[k] * 0.85 + es[k] * 0.15 * 4;
      this.hq = this.blds.find((b) => b.type === 'hq') || this.blds.find((b) => b.built) || this.mine[0];
      this.base = this.hq ? { x: this.hq.x, y: this.hq.y } : null;
    }

    has(type, sites) { return this.blds.some((b) => b.type === type && (sites || b.built)); }
    count(type, sites) { return this.blds.filter((b) => b.type === type && (sites || b.built)).length; }

    // ---------------------------------------------------------------- economy & base building
    economy() {
      const w = this.w, p = this.p;
      if (!this.base) return;
      // builders
      const wantBuilders = Math.min(2 + Math.floor(w.time / 240) + (this.L.expand > 0.9 ? 1 : 0), 6);
      const buildersQueued = this.blds.reduce((n, b) => n + b.queue.filter((q) => q === 'builder').length, 0);
      if (this.builders.length + buildersQueued < wantBuilders && w.time - (this.lastBuilderT || -99) > (this.builders.length < 2 ? 10 : 50)) {
        this.lastBuilderT = w.time;
        const src = this.blds.find((b) => b.built && (b.type === 'hq' || b.type === 'factory') && b.queue.length < 2);
        if (src) this.cmd({ c: 'produce', id: src.id, type: 'builder' });
      }
      // idle builders help unfinished sites / repairs first
      const idle = this.builders.filter((b) => !b.orders.length);
      for (const s of this.sites) {
        const helpers = this.builders.filter((b) => b.orders[0] && b.orders[0].id === s.id).length;
        if (helpers === 0 && idle.length) { const b = idle.shift(); this.cmd({ c: 'repair', ids: [b.id], id: s.id }); }
      }
      if (!idle.length) return;
      const next = this.nextBuilding();
      if (!next) {
        // repair damaged buildings
        const dmg = this.blds.find((b) => b.built && b.hp < b.maxHp * 0.7);
        if (dmg && idle.length) this.cmd({ c: 'repair', ids: [idle[0].id], id: dmg.id });
        return;
      }
      const cost = w.buildingCost(this.pid, next.type);
      if (!w.canAfford(this.pid, cost)) { this.saveFor = { c: cost.c, m: cost.m, t: w.time }; return; }
      this.saveFor = null;
      const spot = next.spot || this.findSpot(next.type, next.near);
      if (!spot) { this.failed = (this.failed || {}); this.failed[next.type] = w.time; return; }
      const b = this.closest(idle, spot.tx * TILE, spot.ty * TILE);
      const r = this.cmd({ c: 'build', ids: [b.id], type: next.type, tx: spot.tx, ty: spot.ty });
      if (!r.ok) { this.failed = (this.failed || {}); this.failed[next.type + (next.spot ? next.spot.tx + ',' + next.spot.ty : '')] = w.time; }
    }

    nextBuilding() {
      const w = this.w, p = this.p, t = w.time;
      const powerSlack = p.power.gen - p.power.use;
      const n = (ty) => this.count(ty, true);
      const recentlyFailed = (k) => this.failed && this.failed[k] && t - this.failed[k] < 20;
      if (this.sites.length >= 2 + (t > 300 ? 1 : 0)) return null;
      if (powerSlack < 12 && !this.sites.some((s) => s.type === 'power')) return { type: 'power' };
      // resource expansion
      const ext = this.freeDeposit('oil'), mine = this.freeDeposit('ore');
      const wantExt = 2 + Math.floor(t / 150 * this.L.expand), wantMine = 2 + Math.floor(t / 200 * this.L.expand);
      if (n('extractor') < 1 && ext && !recentlyFailed('extractor' + ext.tx + ',' + ext.ty)) return { type: 'extractor', spot: ext };
      if (n('barracks') < 1) return { type: 'barracks' };
      if (n('mine') < 1 && mine && !recentlyFailed('mine' + mine.tx + ',' + mine.ty)) return { type: 'mine', spot: mine };
      if (n('factory') < 1 && !recentlyFailed('factory')) return { type: 'factory' };
      if (n('extractor') < wantExt && ext && !recentlyFailed('extractor' + ext.tx + ',' + ext.ty)) return { type: 'extractor', spot: ext };
      if (n('mine') < wantMine && mine && !recentlyFailed('mine' + mine.tx + ',' + mine.ty)) return { type: 'mine', spot: mine };
      if (t > 150 && n('lab') < 1) return { type: 'lab' };
      if (t > 200 && n('radar') < 1) return { type: 'radar' };
      if (t > 220 && n('repair') < 1) return { type: 'repair', near: this.frontPoint(0.25) };
      if (this.waterMap && n('shipyard') < 1 && t > 240 && !recentlyFailed('shipyard')) return { type: 'shipyard' };
      if (t > 300 && n('airfield') < 1 && this.L.id !== 'easy') return { type: 'airfield' };
      if (t > 260 && n('factory') < 2 && p.res.c > 1200 && this.L.id !== 'easy') return { type: 'factory' };
      // defenses: more vs threat, at front edge of base and near exposed extractors
      const turrets = n('turret_gun') + n('turret_mg') + n('turret_aa');
      if (t > 180 && turrets < Math.min(2 + Math.floor(t / 180), 8) && p.res.c > 700) {
        let type = 'turret_gun';
        if (this.enemySeen.inf > this.enemySeen.heavy + this.enemySeen.light) type = 'turret_mg';
        if (this.enemySeen.air > 300 && this.has('radar')) type = 'turret_aa';
        if (!w.buildReqMissing(this.pid, type)) return { type, near: this.frontPoint(0.18) };
      }
      if (t > 600 && p.has('experimental') && n('silo') < 1 && p.res.c > 3500) return { type: 'silo' };
      if (n('barracks') < 2 && t > 420 && p.res.c > 900) return { type: 'barracks' };
      return null;
    }

    frontPoint(f) {
      const enemy = this.enemyBase();
      if (!enemy) return this.base;
      return { x: U.lerp(this.base.x, enemy.x, f), y: U.lerp(this.base.y, enemy.y, f) };
    }

    enemyBase() {
      const known = this.enemyBlds.filter((b) => b.type === 'hq');
      if (known.length) return this.closest(known, this.base.x, this.base.y);
      if (this.enemyBlds.length) return this.closest(this.enemyBlds, this.base.x, this.base.y);
      // start positions are public knowledge in skirmish
      const sp = this.w.map.spawns.filter((s, i) => i < this.w.players.length && this.w.players[i] && this.w.isEnemy(this.pid, i) && this.w.players[i].alive);
      if (!sp.length) return null;
      const s = sp.sort((a, b) => U.dist2(a.tx, a.ty, this.base.x / TILE, this.base.y / TILE) - U.dist2(b.tx, b.ty, this.base.x / TILE, this.base.y / TILE))[0];
      return { x: s.tx * TILE + 16, y: s.ty * TILE + 16 };
    }

    freeDeposit(kind) {
      const w = this.w; let best = null, bd = 1e18;
      const lab = this.groundLab || (this.groundLab = w.map.components('ground'));
      const baseLab = lab[w.map.idx((this.base.x / TILE) | 0, (this.base.y / TILE) | 0)];
      const enemyNear = (x, y) => this.enemyUnitsVisible.some((e) => U.dist2(e.x, e.y, x, y) < 300 * 300) || this.enemyBlds.some((e) => U.dist2(e.x, e.y, x, y) < 400 * 400);
      for (const d of w.map.deposits) {
        if (d.kind !== kind) continue;
        if (w.map.occ[w.map.idx(d.tx, d.ty)]) continue;
        if (lab[w.map.idx(d.tx, d.ty)] !== baseLab) continue;
        const x = d.tx * TILE + 32, y = d.ty * TILE + 32;
        if (enemyNear(x, y)) continue;
        const dd = U.dist2(x, y, this.base.x, this.base.y);
        if (dd > (1200 + w.time * 4) ** 2) continue;
        if (dd < bd) { bd = dd; best = d; }
      }
      return best ? { tx: best.tx, ty: best.ty } : null;
    }

    findSpot(type, near) {
      const w = this.w, m = w.map, d = D.BUILDINGS[type];
      const c = near || this.base; if (!c) return null;
      const ctx = Math.floor(c.x / TILE), cty = Math.floor(c.y / TILE);
      const rng = w.rng;
      for (let r = 3; r < 18; r++) {
        for (let k = 0; k < 14; k++) {
          const a = rng.range(0, Math.PI * 2); const tx = Math.round(ctx + Math.cos(a) * r - d.w / 2), ty = Math.round(cty + Math.sin(a) * r - d.h / 2);
          // keep 1-tile lanes between buildings
          let clear = true;
          for (let y = ty - 1; y <= ty + d.h && clear; y++) for (let x = tx - 1; x <= tx + d.w; x++) { if (!m.inb(x, y)) { clear = false; break; } if (m.occ[m.idx(x, y)]) { clear = false; break; } }
          if (!clear && type !== 'wall') continue;
          if (w.canPlace(this.pid, type, tx, ty).ok) return { tx, ty };
        }
      }
      return null;
    }

    closest(list, x, y) { let b = null, bd = 1e18; for (const e of list) { const d = U.dist2(e.x, e.y, x, y); if (d < bd) { bd = d; b = e; } } return b; }

    // ---------------------------------------------------------------- production
    production() {
      const w = this.w, p = this.p;
      // budget: save for planned structures / research unless under attack
      let reserve = 100;
      if (!this.defending) {
        if (this.saveFor && w.time - this.saveFor.t < 30) reserve += this.saveFor.c;
        if (this.researchWant) reserve += this.researchWant.c * 0.7;
      }
      reserve = Math.min(reserve, 1600);
      const fac = this.blds.filter((b) => b.built && D.BUILDINGS[b.type].produces && b.type !== 'hq');
      const armyValue = this.army.reduce((s, u) => s + D.UNITS[u.type].cost.c, 0);
      const infN = this.army.filter((u) => u.cls === 'inf').length, vehN = this.army.filter((u) => u.cls !== 'inf').length;
      for (const b of fac) {
        if (b.queue.length >= (this.L.id === 'easy' ? 1 : 2)) continue;
        if (b.type === 'barracks' && infN > vehN * 1.5 + 6 && !this.defending) continue; // keep a combined-arms mix
        // stick to the chosen unit for a while so expensive units are actually saved for
        let type = b.aiPick && w.time - b.aiPickT < 25 ? b.aiPick : null;
        if (!type || w.unitReqMissing(this.pid, type)) { type = this.pickUnit(b); b.aiPick = type; b.aiPickT = w.time; }
        if (!type) continue;
        const cost = D.unitFor(type, p.faction).cost;
        if (p.res.c - cost.c < reserve || p.res.m < cost.m) continue;
        if (D.UNITS[type].cls === 'inf' && p.res.m > 1500 && w.rng.next() < 0.6) continue; // metal-rich: prefer vehicles
        if (this.cmd({ c: 'produce', id: b.id, type }).ok) b.aiPick = null;
      }
      // rally production toward the front edge of the base
      if (this.base && w.time % 30 < this.L.think) {
        const fp = this.frontPoint(0.12);
        for (const b of fac) if (b.type !== 'shipyard' && fp) { const r = w.map.nearestPassable(fp.x, fp.y, 'ground', 8); if (r) this.cmd({ c: 'rally', id: b.id, x: r.x, y: r.y }); }
      }
    }

    pickUnit(b) {
      const w = this.w, p = this.p, f = p.faction, rng = w.rng;
      const ok = (t) => D.BUILDINGS[b.type].produces.indexOf(t) >= 0 && !w.unitReqMissing(this.pid, t);
      const es = this.enemySeen, cnt = {};
      for (const u of this.army) { const r = COMBAT_ROLE[u.type]; cnt[r] = (cnt[r] || 0) + 1; }
      const counter = rng.next() < this.L.counter;
      const weights = {};
      const add = (t, wgt) => { if (ok(t)) weights[t] = (weights[t] || 0) + wgt; };
      if (b.type === 'barracks') {
        add('rifle', 3 + (counter && es.inf > es.heavy ? 2 : 0));
        add('at_team', 2 + (counter && es.heavy > 400 ? 3 : 0));
        add('ghost', 0.5);
      } else if (b.type === 'factory') {
        add('light_tank', 2); add('med_tank', 3); add('hover_tank', 3); add('heavy_tank', 3); add('mammoth', 2);
        add('mlrs', (cnt.arty || 0) < 3 ? 1.5 : 0.4); add('howitzer', (cnt.arty || 0) < 3 ? 1.2 : 0.3); add('siege', es.total > 0 ? 0.8 : 0.4);
        add('flak', counter && es.air > 200 ? 4 : (cnt.aa || 0) < 1 ? 0.5 : 0.2);
        add('supply', (cnt.support || 0) < 1 ? 0.6 : 0.05); add('ew', (cnt.support || 0) < 2 ? 0.5 : 0.05);
        add('recon', (cnt.scout || 0) < 1 ? 1 : 0.05);
        if (!this.army.some((u) => D.UNITS[u.type].experimental) && p.res.c > 3000) { add('citadel', 6); add('colossus', 6); }
      } else if (b.type === 'airfield') {
        add('drone', (cnt.scout || 0) < 2 ? 1 : 0.1); add('gunship', 3);
        add('fighter', counter && es.air > 300 ? 4 : 0.5); add('bomber', 1.2);
        if (!this.army.some((u) => D.UNITS[u.type].experimental) && p.res.c > 3000) add('aurora', 6);
      } else if (b.type === 'shipyard') {
        add('patrol', 2); add('missile_boat', 2); add('destroyer', 1.5); add('submarine', counter && es.naval > 400 ? 3 : 1);
        if (this.army.filter((u) => u.cls === 'naval').length > 10) return null;
      }
      let tot = 0; for (const k in weights) tot += weights[k];
      if (tot <= 0) return null;
      let r = rng.next() * tot; for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
      return Object.keys(weights)[0];
    }

    research() {
      const p = this.p; const labs = this.blds.filter((b) => b.type === 'lab' && b.built && !b.research);
      if (!labs.length) return;
      const order = { aegis: 'aegis_logistics', vortex: 'vortex_cloak', iron: 'iron_hulls' };
      const prio = ['extraction', 'munitions', order[p.faction], 'heavy_armor', 'composite_armor', 'artillery', 'aviation', 'optics', 'experimental'];
      for (const t of prio) {
        if (!t || p.has(t)) continue;
        const r = D.RESEARCH[t]; if ((r.req || []).some((q) => !p.has(q))) continue;
        if (this.w.ents.some((e) => !e.dead && e.owner === this.pid && e.research === t)) continue;
        if (p.res.c < r.cost.c || p.res.m < r.cost.m) { this.researchWant = r.cost; return; }
        this.cmd({ c: 'research', id: labs[0].id, tech: t }); return;
      }
    }

    // ---------------------------------------------------------------- military
    military() {
      const w = this.w; if (!this.base) return;
      const combat = this.army.filter((u) => u.weapons.length && COMBAT_ROLE[u.type] !== 'transport');
      // 1. retreat badly damaged units (micro)
      if (this.L.micro && (this.has('repair') || this.has('hq'))) {
        for (const u of combat) {
          if (this.retreating.has(u.id)) { if (u.hp > u.maxHp * 0.9 || !u.orders.length && u.hp > u.maxHp * 0.6) this.retreating.delete(u.id); continue; }
          if (u.hp < u.maxHp * 0.28 && !D.UNITS[u.type].experimental && u.mv !== 'air') { this.cmd({ c: 'retreat', ids: [u.id] }); this.retreating.add(u.id); }
        }
      }
      const ready = combat.filter((u) => !this.retreating.has(u.id));
      // 2. defend: enemies near our buildings
      const threats = this.enemyUnitsVisible.filter((e) => (e.weapons.length || D.UNITS[e.type].builder) && this.blds.some((b) => U.dist2(b.x, b.y, e.x, e.y) < 700 * 700));
      // unarmed scouts over the base: let AA deal with them, do not stall the war
      const scoutsOver = this.enemyUnitsVisible.filter((e) => !e.weapons.length && e.mv === 'air' && this.blds.some((b) => U.dist2(b.x, b.y, e.x, e.y) < 600 * 600));
      if (scoutsOver.length) { const aa = ready.filter((u) => (u.type === 'flak' || u.type === 'fighter') && !u.orders.length); if (aa.length) this.cmd({ c: 'attack', ids: aa.map((u) => u.id), id: scoutsOver[0].id }); }
      if (threats.length) {
        let tx = 0, ty = 0; for (const e of threats) { tx += e.x; ty += e.y; } tx /= threats.length; ty /= threats.length;
        const near = ready.filter((u) => u.mv !== 'air' ? U.dist2(u.x, u.y, tx, ty) < 1600 * 1600 : true);
        const threatVal = threats.reduce((s, e) => s + D.UNITS[e.type].cost.c, 0);
        let sent = 0;
        for (const u of near) {
          if (sent > threatVal * 1.8 && sent > 600) break;
          if (u.cls === 'naval' && !WF.PASS.naval[w.map.tileAt(tx, ty)]) continue;
          if (!threats.some((t) => w.canEverHit(u, t))) continue;
          if (!u.orders.length || (u.orders[0].t !== 'attack' && u.orders[0].t !== 'amove')) this.cmd({ c: 'amove', ids: [u.id], x: tx, y: ty });
          sent += D.UNITS[u.type].cost.c;
        }
        this.defending = true;
        if (threatVal > 400) return;
      }
      this.defending = false;
      // 3. scouting
      this.scout();
      // 4. attack waves
      const idleArmy = ready.filter((u) => (!u.orders.length || u.orders[0].t === 'move' && u.orders[0].rally) && COMBAT_ROLE[u.type] !== 'scout' && u.cls !== 'naval');
      const value = idleArmy.reduce((s, u) => s + D.UNITS[u.type].cost.c + D.UNITS[u.type].cost.m, 0);
      const minWave = this.L.waveMin * 160 * (1 + this.waveNo * 0.35) / this.L.aggression;
      const timeOK = w.time > Math.max(this.L.id === 'easy' ? 420 : this.L.id === 'normal' ? 300 : 200, w.opts.aiAttackDelay || 0);
      if (timeOK && (value >= minWave || (value > minWave * 0.5 && w.time - this.lastAttackTime > 420))) this.launchAttack(idleArmy);
      // naval group: hunt
      const navy = ready.filter((u) => u.cls === 'naval' && !u.orders.length);
      if (navy.length >= 4) {
        const tgt = this.pickTarget(true);
        if (tgt) this.cmd({ c: 'amove', ids: navy.map((u) => u.id), x: tgt.x, y: tgt.y });
      }
      // fighters: patrol over base / chase visible air
      const fighters = ready.filter((u) => u.type === 'fighter' && !u.orders.length);
      const air = this.enemyUnitsVisible.filter((e) => e.mv === 'air');
      if (fighters.length && air.length) this.cmd({ c: 'attack', ids: fighters.map((u) => u.id), id: this.closest(air, this.base.x, this.base.y).id });
      // bombers: strike valuable structures
      const bombers = ready.filter((u) => u.type === 'bomber' && !u.orders.length && u.weapons[0].ammo > 0);
      if (bombers.length >= 2) { const t = this.pickTarget(false, true); if (t) this.cmd({ c: 'attack', ids: bombers.map((u) => u.id), id: t.id }); }
      // keep idle units gathered at the front edge of base
      const gather = this.frontPoint(0.15);
      for (const u of idleArmy) if (u.mv !== 'air' && U.dist2(u.x, u.y, gather.x, gather.y) > 500 * 500 && !u.orders.length) this.cmd({ c: 'move', ids: [u.id], x: gather.x + w.rng.range(-80, 80), y: gather.y + w.rng.range(-80, 80) });
    }

    pickTarget(naval, structureOnly) {
      const team = this.p.team;
      const value = { extractor: 6, mine: 5, power: 4, factory: 5, airfield: 4, lab: 4, hq: 3, barracks: 3, radar: 3, silo: 10, shipyard: 4, repair: 3, turret_gun: 1, turret_mg: 1, turret_aa: 1, wall: 0 };
      let best = null, bs = -1e9;
      for (const b of this.enemyBlds) {
        if (naval && !this.nearWater(b)) continue;
        const d = U.dist(this.base.x, this.base.y, b.x, b.y);
        const defended = this.enemyBlds.filter((o) => o.weapons.length && U.dist2(o.x, o.y, b.x, b.y) < 300 * 300).length;
        const s = (value[b.type] || 1) * 2 - d / 800 - defended * (this.L.id === 'easy' ? 0 : 1.2) + (b.hp < b.maxHp * 0.5 ? 1 : 0);
        if (s > bs) { bs = s; best = b; }
      }
      if (!best && !structureOnly) { const eb = this.enemyBase(); if (eb) return { x: eb.x, y: eb.y }; }
      return best;
    }
    nearWater(b) { const m = this.w.map; for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (WF.PASS.naval[m.tileAt(b.x + Math.cos(a) * r * 32, b.y + Math.sin(a) * r * 32)]) return true; } return false; }

    /** Estimated defensive strength (cost-weighted) around a target from what this AI has seen. */
    defenseAt(x, y) {
      let v = 0;
      for (const b of this.enemyBlds) if (b.weapons.length && U.dist2(b.x, b.y, x, y) < 450 * 450) v += (D.BUILDINGS[b.type].cost.c + D.BUILDINGS[b.type].cost.m) * 1.6 * (b.hp / b.maxHp);
      for (const e of this.enemyUnitsVisible) if (e.weapons.length && U.dist2(e.x, e.y, x, y) < 700 * 700) v += D.UNITS[e.type].cost.c + D.UNITS[e.type].cost.m;
      return v;
    }

    launchAttack(units) {
      const w = this.w; const tgt = this.pickTarget(false);
      if (!tgt || !units.length) return;
      // don't throw the army at a fortress it cannot crack (unless it has been waiting a long time)
      const army = units.reduce((s, u) => s + D.UNITS[u.type].cost.c + D.UNITS[u.type].cost.m, 0);
      const need = { easy: 0.5, normal: 0.9, hard: 1.25, brutal: 1.35 }[this.L.id] || 1;
      if (army < this.defenseAt(tgt.x, tgt.y) * need && w.time - this.lastAttackTime < 900 && this.w.unitCount(this.pid) < this.w.unitCap * 0.9) return;
      this.waveNo++; this.lastAttackTime = w.time;
      const ground = units.filter((u) => u.mv !== 'air'), air = units.filter((u) => u.mv === 'air' && u.type !== 'bomber' && u.type !== 'fighter');
      const split = this.L.id === 'hard' || this.L.id === 'brutal';
      if (split && ground.length >= 8 && this.waveNo % 2 === 0) {
        // two-pronged attack: flanking waypoint for half the force
        const half = Math.floor(ground.length / 2);
        const a = U.angleTo(this.base.x, this.base.y, tgt.x, tgt.y); const d = U.dist(this.base.x, this.base.y, tgt.x, tgt.y);
        const side = w.rng.next() < 0.5 ? 1 : -1;
        const fx = U.lerp(this.base.x, tgt.x, 0.55) + Math.cos(a + side * Math.PI / 2) * d * 0.3, fy = U.lerp(this.base.y, tgt.y, 0.55) + Math.sin(a + side * Math.PI / 2) * d * 0.3;
        const wp = w.map.nearestPassable(U.clamp(fx, 64, w.map.pw - 64), U.clamp(fy, 64, w.map.ph - 64), 'ground', 10);
        const g1 = ground.slice(0, half).map((u) => u.id), g2 = ground.slice(half).map((u) => u.id);
        if (wp) { this.cmd({ c: 'amove', ids: g1, x: wp.x, y: wp.y, formation: 'wedge' }); this.cmd({ c: 'amove', ids: g1, x: tgt.x, y: tgt.y, queue: true }); }
        else this.cmd({ c: 'amove', ids: g1, x: tgt.x, y: tgt.y });
        this.cmd({ c: 'amove', ids: g2, x: tgt.x, y: tgt.y, formation: 'line' });
      } else if (ground.length) {
        this.cmd({ c: 'amove', ids: ground.map((u) => u.id), x: tgt.x, y: tgt.y, formation: this.L.id === 'easy' ? 'auto' : 'line' });
      }
      if (air.length) this.cmd({ c: 'amove', ids: air.map((u) => u.id), x: tgt.x, y: tgt.y });
      if (tgt.kind === 'bld' && tgt.id) {
        const siege = ground.filter((u) => u.type === 'siege' || u.type === 'howitzer');
        if (siege.length) this.cmd({ c: 'attack', ids: siege.map((u) => u.id), id: tgt.id, queue: true });
      }
    }

    scout() {
      const w = this.w;
      let s = w.get(this.scoutId);
      if (!s || s.dead) {
        const cand = this.army.find((u) => (COMBAT_ROLE[u.type] === 'scout') && !u.orders.length);
        if (!cand) return; s = cand; this.scoutId = s.id;
      }
      if (s.orders.length) return;
      // visit unexplored spawns and deposits
      const fog = w.fog[this.p.team];
      const pts = w.map.spawns.map((p) => ({ x: p.tx * TILE, y: p.ty * TILE })).concat(w.map.deposits.map((d) => ({ x: d.tx * TILE + 32, y: d.ty * TILE + 32 })));
      const unexplored = pts.filter((p) => !fog.vis[w.map.idx((p.x / TILE) | 0, (p.y / TILE) | 0)]);
      if (!unexplored.length) return;
      const t = w.rng.pick(unexplored);
      this.cmd({ c: 'move', ids: [s.id], x: t.x, y: t.y });
    }

    superweapon() {
      const silo = this.blds.find((b) => b.type === 'silo' && b.built && b.charge >= 1);
      if (!silo) return;
      // strike the densest known enemy cluster (structures weighted)
      let best = null, bs = 0;
      const cands = this.enemyBlds.concat(this.enemyUnitsVisible);
      for (const c of cands) {
        let s = 0; for (const o of cands) if (U.dist2(o.x, o.y, c.x, c.y) < 170 * 170) s += o.kind === 'bld' ? 3 : 1;
        if (s > bs) { bs = s; best = c; }
      }
      if (best && bs >= 3) this.cmd({ c: 'strike', id: silo.id, x: best.x, y: best.y });
    }
  }

  WF.AI = AI;
  WF.World.prototype.attachAIs = function () {
    this.ais = [];
    this.players.forEach((p) => { if (p.ai) this.ais.push(new AI(this, p.id, p.ai)); });
    if (this._pendingAI) { for (const s of this._pendingAI) { const a = this.ais.find((x) => x.pid === s.pid); if (a) a.restore(s); } this._pendingAI = null; }
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
