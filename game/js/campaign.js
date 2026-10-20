/* WARFRONT: DOMINION — campaign "Operation Iron Dawn": scripted missions built on the same simulation. */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE;

  // helpers ---------------------------------------------------------------
  function unitsOf(w, pid, type) { return w.ents.filter((e) => !e.dead && e.owner === pid && e.kind === 'unit' && (!type || e.type === type)); }
  function bldsOf(w, pid, type) { return w.ents.filter((e) => !e.dead && e.owner === pid && e.kind === 'bld' && (!type || e.type === type)); }
  function spawnGroup(w, pid, list, x, y, spread) {
    const out = [];
    for (const [type, n] of list) for (let i = 0; i < n; i++) {
      const mv = D.UNITS[type].move;
      const p = mv === 'air' ? { x: x + w.rng.range(-spread, spread), y: y + w.rng.range(-spread, spread) } : w.map.nearestPassable(x + w.rng.range(-spread, spread), y + w.rng.range(-spread, spread), mv, 10);
      if (p) out.push(w.spawnUnit(pid, type, p.x, p.y, 0));
    }
    return out;
  }
  function amove(w, pid, units, x, y) { if (units.length) w.command(pid, { c: 'amove', ids: units.map((u) => u.id), x, y }); }
  function hqOf(w, pid) { return bldsOf(w, pid, 'hq')[0]; }
  function tileC(tx, ty) { return { x: tx * TILE + 16, y: ty * TILE + 16 }; }
  function standardDefeat(w, pid) {
    let ok = false;
    for (const e of w.ents) if (!e.dead && e.owner === pid && (e.type === 'hq' || e.type === 'factory' || (e.kind === 'unit' && D.UNITS[e.type].builder))) { ok = true; break; }
    return !ok;
  }

  const MISSIONS = [
    {
      id: 'm1', name: 'Beachhead', map: 'ashen_plains', faction: 'aegis', enemy: 'iron', ai: null,
      briefing: 'Commander, the Iron Dominion has seized the Ashen Plains. Establish a forward base, secure oil, and destroy their outpost to the north-east.\n\nTip: select a Construction Rig and use BUILD. Extractors must sit on dark oil fields.',
      setup(w) {
        w.setupStandardStart();
        // remove enemy default start; place a small outpost instead
        for (const e of w.ents.filter((e) => e.owner === 1)) { e.hp = 0; w.removeEntity(e, null); }
        w.players[1].stats.lost = 0; w.players[1].stats.bldLost = 0;
        const s = w.map.spawns[1];
        const blds = [['barracks', s.tx - 1, s.ty - 1], ['power', s.tx + 3, s.ty - 1], ['turret_mg', s.tx - 4, s.ty + 2], ['turret_mg', s.tx + 1, s.ty + 3], ['turret_gun', s.tx - 3, s.ty + 4]];
        for (const [t, x, y] of blds) w.placeBuilding(1, t, x, y, true);
        spawnGroup(w, 1, [['rifle', 4], ['at_team', 2]], s.tx * TILE, s.ty * TILE + 120, 60);
      },
      objectives: [
        { id: 'power', text: 'Build a Power Plant', check: (w) => bldsOf(w, 0, 'power').some((b) => b.built) ? 'done' : null },
        { id: 'barracks', text: 'Build Barracks', check: (w) => bldsOf(w, 0, 'barracks').some((b) => b.built) ? 'done' : null },
        { id: 'oil', text: 'Build an Oil Extractor', check: (w) => bldsOf(w, 0, 'extractor').some((b) => b.built) ? 'done' : null },
        { id: 'outpost', text: 'Destroy the Iron Dominion outpost', check: (w) => bldsOf(w, 1).length === 0 ? 'done' : null },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your forces were wiped out.' : null,
      tick(w, M) {
        if (!M.flags.wave && w.time > 300) { M.flags.wave = 1; const s = w.map.spawns[1]; amove(w, 1, spawnGroup(w, 1, [['rifle', 4], ['light_tank', 2]], s.tx * TILE, s.ty * TILE + 100, 50), hqOf(w, 0) ? hqOf(w, 0).x : 300, hqOf(w, 0) ? hqOf(w, 0).y : 300); M.say('Enemy patrol inbound! Defend the base.', 'alert'); }
      },
    },
    {
      id: 'm2', name: 'Hold the Ridge', map: 'iron_pass', faction: 'aegis', enemy: 'iron', ai: null,
      briefing: 'Iron Dominion armour is pouring through the mountain passes. Hold the ridge for 10 minutes until reinforcements arrive.\n\nTip: turrets and walls at the chokepoints multiply your strength. Keep power positive.',
      setup(w) {
        w.setupStandardStart();
        for (const e of w.ents.filter((e) => e.owner === 1)) { e.hp = 0; w.removeEntity(e, null); }
        w.players[1].stats.lost = 0; w.players[1].stats.bldLost = 0;
        w.players[0].res = { c: 5000, m: 1800 };
        const s = w.map.spawns[0];
        w.placeBuilding(0, 'power', s.tx + 3, s.ty - 2, true); w.placeBuilding(0, 'factory', s.tx - 6, s.ty - 2, true); w.placeBuilding(0, 'barracks', s.tx + 3, s.ty + 1, true);
        spawnGroup(w, 0, [['med_tank', 3], ['at_team', 4]], s.tx * TILE, (s.ty - 8) * TILE, 70);
        w.updatePower();
      },
      objectives: [
        { id: 'hold', text: 'Survive until reinforcements arrive (10:00)', check: (w, M) => w.time >= 600 ? 'done' : null, timer: 600 },
        { id: 'hq', text: 'Command HQ must survive', optional: true, check: (w) => hqOf(w, 0) ? null : 'fail' },
      ],
      fail: (w) => hqOf(w, 0) ? null : 'The HQ has fallen.',
      tick(w, M) {
        const t = w.time; M.flags.next = M.flags.next || 60;
        if (t >= M.flags.next && t < 590) {
          const k = Math.floor(M.flags.next / 60);
          const passes = [13, 47, 82]; const px = passes[k % 3] * TILE;
          const comp = [['rifle', 2 + Math.floor(k * 0.7)], ['light_tank', 1 + (k >> 2)], ['med_tank', k >= 3 ? (k - 1) >> 1 : 0], ['mlrs', k >= 6 ? 1 : 0], ['heavy_tank', k >= 8 ? 1 : 0], ['gunship', k >= 7 ? 1 : 0]];
          const hq = hqOf(w, 0);
          amove(w, 1, spawnGroup(w, 1, comp.filter((c) => c[1] > 0), px, 3 * TILE, 70), hq ? hq.x : 1500, hq ? hq.y : 2200);
          M.say('Wave ' + k + ' approaching through the ' + ['west', 'central', 'east'][k % 3] + ' pass!', 'alert');
          M.flags.next += 60;
        }
        if (t >= 600 && !M.flags.reinf) { M.flags.reinf = 1; const s = w.map.spawns[0]; spawnGroup(w, 0, [['heavy_tank', 3], ['flak', 2]], s.tx * TILE, (s.ty + 2) * TILE, 60); M.say('Reinforcements have arrived. Well done, Commander.', 'good'); }
      },
    },
    {
      id: 'm3', name: 'Lost Patrol', map: 'twin_rivers', faction: 'aegis', enemy: 'vortex', ai: 'easy',
      briefing: 'A Pathfinder patrol is pinned down beyond the eastern river after a Vortex ambush. Their radios are jammed. Reach them, then bring them home to the HQ.\n\nTip: Vortex Ghost teams are cloaked — scouts and radar detect them.',
      setup(w) {
        w.setupStandardStart();
        const p = w.map.nearestPassable(62 * TILE, 40 * TILE, 'ground', 10);
        const lost = spawnGroup(w, 0, [['recon', 2], ['rifle', 2]], p.x, p.y, 30);
        for (const u of lost) u.locked = true;
        w._lost = lost.map((u) => u.id);
        spawnGroup(w, 1, [['rifle', 3], ['light_tank', 1]], p.x + 160, p.y - 100, 40);
      },
      objectives: [
        { id: 'reach', text: 'Reach the lost patrol', check: (w) => {
          const lost = w._lost.map((id) => w.get(id)).filter(Boolean); if (!lost.length) return 'fail';
          const near = w.ents.some((e) => !e.dead && e.owner === 0 && e.kind === 'unit' && !e.locked && lost.some((l) => U.dist(l.x, l.y, e.x, e.y) < 220));
          if (near) { for (const l of lost) l.locked = false; return 'done'; } return null;
        } },
        { id: 'home', text: 'Bring at least 2 survivors back to the HQ', check: (w, M) => {
          const lost = w._lost.map((id) => w.get(id)).filter(Boolean); if (lost.length < 2) return 'fail';
          if (!M.done('reach')) return null; const hq = hqOf(w, 0); if (!hq) return 'fail';
          return lost.filter((l) => U.dist(l.x, l.y, hq.x, hq.y) < 260).length >= 2 ? 'done' : null;
        } },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your base was destroyed.' : null,
      serializeExtra: (w) => ({ lost: w._lost }), restoreExtra: (w, x) => { w._lost = x.lost; },
    },
    {
      id: 'm4', name: 'Island Grab', map: 'archipelago', faction: 'aegis', enemy: 'vortex', ai: 'normal',
      briefing: 'The Archipelago holds the richest oil in the region. Capture and hold the three marked zones for 90 seconds to claim the territory.\n\nTip: zones count as held when you have units there and the enemy does not. A Shipyard lets you reach the outer islands.',
      setup(w) {
        w.setupStandardStart();
        const z = (tx, ty) => Object.assign(tileC(tx, ty), { r: 150, hold: 0, owner: -1 });
        w._zones = [z(55, 47), z(80, 76), z(30, 18)];
        w.opts.aiAttackDelay = 420;
      },
      objectives: [
        { id: 'zones', text: 'Hold all 3 zones for 90 seconds', check: (w, M) => {
          let all = true;
          for (const zn of w._zones) {
            let mine = 0, theirs = 0;
            for (const e of w.ents) if (!e.dead && e.kind === 'unit' && !e.inside && U.dist2(e.x, e.y, zn.x, zn.y) < zn.r * zn.r) { if (e.owner === 0) mine++; else if (w.isEnemy(0, e.owner)) theirs++; }
            zn.owner = mine && !theirs ? 0 : theirs && !mine ? 1 : zn.owner === 0 && mine ? 0 : -1;
            if (zn.owner !== 0) all = false;
          }
          M.flags.held = all ? (M.flags.held || 0) + 0.25 : 0;
          return M.flags.held >= 90 ? 'done' : null;
        }, progress: (w, M) => (M.flags.held || 0) / 90 },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your base was destroyed.' : null,
      serializeExtra: (w) => ({ zones: w._zones }), restoreExtra: (w, x) => { w._zones = x.zones; },
    },
    {
      id: 'm5', name: 'Silence the Guns', map: 'iron_pass', faction: 'aegis', enemy: 'iron', ai: 'easy',
      briefing: 'Four Longbow howitzer batteries are shelling our positions from behind the ridge. Destroy all enemy artillery before our base is levelled.\n\nTip: gunships and fast raiders can bypass the passes; artillery is weak up close.',
      setup(w) {
        w.setupStandardStart();
        w.players[0].res = { c: 3500, m: 1200 };
        const spots = [[20, 22], [40, 18], [58, 20], [76, 24]];
        w._arty = [];
        for (const [tx, ty] of spots) {
          const g = spawnGroup(w, 1, [['howitzer', 1]], tx * TILE, ty * TILE, 10); for (const u of g) { u.hold = true; w._arty.push(u.id); }
          spawnGroup(w, 1, [['rifle', 2], ['flak', 1]], tx * TILE, (ty + 2) * TILE, 40).forEach((u) => (u.hold = true));
        }
      },
      objectives: [
        { id: 'arty', text: 'Destroy all 4 enemy howitzers', check: (w) => w._arty.every((id) => !w.get(id)) ? 'done' : null, progress: (w) => w._arty.filter((id) => !w.get(id)).length / 4 },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your base was destroyed.' : null,
      tick(w, M) {
        // artillery barrage on our base every 25s (fired by live howitzers that can see/through spotters)
        M.flags.bt = (M.flags.bt || 30) - 0.25;
        if (M.flags.bt <= 0) {
          M.flags.bt = 32;
          const hq = hqOf(w, 0); const blds = bldsOf(w, 0);
          for (const id of w._arty) {
            const a = w.get(id); if (!a || !blds.length) continue;
            const nonHq = blds.filter((b) => b.type !== 'hq'); const t = w.rng.pick(nonHq.length ? nonHq : blds);
            for (let i = 0; i < 1; i++) w.projectiles.push({ kind: 'artyshell', x: a.x, y: a.y, sx: a.x, sy: a.y, tx: t.x + w.rng.gauss() * 50, ty: t.y + w.rng.gauss() * 50, t: -i * 0.4, dur: 4, dmg: 90, type: 'he', splash: 55, owner: 1, team: w.players[1].team, target: 0, arc: 1, w: 'howitzer', src: a.id });
          }
          if (hq) M.say('Incoming artillery!', 'alert');
        }
      },
      serializeExtra: (w) => ({ arty: w._arty }), restoreExtra: (w, x) => { w._arty = x.arty; },
    },
    {
      id: 'm6', name: 'The Long Road', map: 'crossroads', faction: 'aegis', enemy: 'vortex', ai: 'normal', players: 2,
      briefing: 'A supply convoy must cross the Highland Crossroads to the allied depot in the south-east. Escort it: at least 2 of 3 trucks must arrive.\n\nTip: the convoy follows the road automatically. Scout ahead and clear ambushes.',
      setup(w) {
        w.setupStandardStart();
        const s = w.map.spawns[0];
        const trucks = spawnGroup(w, 0, [['supply', 3]], (s.tx + 6) * TILE, (s.ty + 6) * TILE, 20);
        for (const t of trucks) t.locked = true;
        w._convoy = trucks.map((t) => t.id);
        w._depot = tileC(98, 98); w._depot.r = 200;
        spawnGroup(w, 0, [['med_tank', 2], ['flak', 1], ['rifle', 2]], (s.tx + 8) * TILE, (s.ty + 8) * TILE, 40);
        // ambushes along the road
        spawnGroup(w, 1, [['rifle', 3], ['at_team', 2]], 56 * TILE, 40 * TILE, 50).forEach((u) => (u.hold = true));
        spawnGroup(w, 1, [['hover_tank', 2], ['at_team', 2]], 70 * TILE, 56 * TILE, 50).forEach((u) => (u.hold = true));
        spawnGroup(w, 1, [['ghost', 2], ['light_tank', 2]], 82 * TILE, 82 * TILE, 50).forEach((u) => (u.hold = true));
        // ally depot owned by player (neutral-friendly structure)
        w.placeBuilding(0, 'repair', 97, 97, true);
        w.opts.aiAttackDelay = 420;
      },
      objectives: [
        { id: 'convoy', text: 'Escort the convoy to the depot (2 of 3 trucks)', check: (w) => {
          const alive = w._convoy.map((id) => w.get(id)).filter(Boolean); if (alive.length < 2) return 'fail';
          return alive.filter((t) => U.dist(t.x, t.y, w._depot.x, w._depot.y) < w._depot.r).length >= 2 ? 'done' : null;
        } },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your base was destroyed.' : null,
      tick(w, M) {
        if (w.time > 45 && !M.flags.go) { M.flags.go = 1; M.say('Convoy is moving out. Keep it safe!', 'good'); }
        if (M.flags.go) {
          const route = [tileC(56, 18), tileC(56, 56), tileC(84, 56), tileC(96, 92)];
          for (const id of w._convoy) {
            const t = w.get(id); if (!t) continue;
            t.wp = t.wp || 0; const p = route[t.wp];
            if (!p) continue;
            if (U.dist(t.x, t.y, p.x, p.y) < 70) t.wp++;
            else if (!t.orders.length || (w.tick % 100 === 0)) { t.orders = [{ t: 'move', x: p.x + (id % 3) * 20, y: p.y }]; t.path = null; }
          }
        }
      },
      serializeExtra: (w) => ({ convoy: w._convoy, depot: w._depot }), restoreExtra: (w, x) => { w._convoy = x.convoy; w._depot = x.depot; },
    },
    {
      id: 'm7', name: 'Iron Warlord', map: 'twin_rivers', faction: 'aegis', enemy: 'iron', ai: 'normal',
      briefing: 'Warlord Kragen commands the Iron Dominion from a fortified citadel, guarded by his Colossus Siege Walker. Break the fortress, destroy the Colossus and level his HQ.\n\nTip: research Heavy Armor and Experimental Program; siege units and bombers crack fortifications.',
      setup(w) {
        w.setupStandardStart();
        w.players[0].res = { c: 5000, m: 2000 };
        const s = w.map.spawns[1];
        const ring = [[-6, -2], [-6, 2], [-2, 5], [2, 5], [5, 2], [-4, -5], [3, -5]];
        for (const [dx, dy] of ring) w.placeBuilding(1, w.rng.next() < 0.5 ? 'turret_gun' : 'turret_mg', s.tx + dx, s.ty + dy, true);
        w.placeBuilding(1, 'turret_aa', s.tx - 3, s.ty + 3, true); w.placeBuilding(1, 'power', s.tx + 3, s.ty - 3, true); w.placeBuilding(1, 'power', s.tx + 6, s.ty - 1, true);
        w.placeBuilding(1, 'factory', s.tx - 4, s.ty - 9, true); w.placeBuilding(1, 'barracks', s.tx + 3, s.ty + 7, true);
        for (let i = -9; i <= -7; i++) w.canPlace(1, 'wall', s.tx + i, s.ty + 6).ok && w.placeBuilding(1, 'wall', s.tx + i, s.ty + 6, true);
        const col = spawnGroup(w, 1, [['colossus', 1]], (s.tx - 4) * TILE, (s.ty + 9) * TILE, 10); w._boss = col[0] ? col[0].id : 0;
        if (col[0]) col[0].hold = true;
        w.players[1].res = { c: 2000, m: 800 };
        w.opts.aiAttackDelay = 540; // the Warlord waits behind his walls before counter-attacking
        w.updatePower();
      },
      objectives: [
        { id: 'boss', text: 'Destroy the Colossus of Warlord Kragen', check: (w) => w.get(w._boss) ? null : 'done' },
        { id: 'hq', text: 'Destroy the enemy Command HQ', check: (w) => hqOf(w, 1) ? null : 'done' },
      ],
      fail: (w) => standardDefeat(w, 0) ? 'Your base was destroyed.' : null,
      serializeExtra: (w) => ({ boss: w._boss }), restoreExtra: (w, x) => { w._boss = x.boss; },
    },
  ];

  class MissionRunner {
    constructor(def, world) {
      this.def = def; this.custom = true; this.status = {}; this.flags = {}; this.w = world; this.result = null; this.t = 0;
      for (const o of def.objectives) this.status[o.id] = null;
    }
    say(text, kind) { this.w.msg(text, 0, kind || 'info'); if (kind === 'alert') this.w.emit({ e: 'alert', owner: 0 }); }
    done(id) { return this.status[id] === 'done'; }
    tick(w, dt) {
      this.t += dt; if (this.t < 0.25) return; this.t = 0;
      if (w.over) return;
      if (this.def.tick) this.def.tick(w, this);
      for (const o of this.def.objectives) {
        if (this.status[o.id] === 'done' || this.status[o.id] === 'fail') continue;
        const r = o.check(w, this);
        if (r === 'done') { this.status[o.id] = 'done'; this.say('Objective complete: ' + o.text, 'good'); w.emit({ e: 'objective', owner: 0 }); }
        else if (r === 'fail') { this.status[o.id] = 'fail'; this.finish(w, false, 'Objective failed: ' + o.text); return; }
      }
      const f = this.def.fail && this.def.fail(w); if (f) { this.finish(w, false, f); return; }
      if (this.def.objectives.every((o) => this.status[o.id] === 'done' || o.optional)) this.finish(w, true, 'All objectives complete.');
    }
    finish(w, win, reason) {
      this.result = { win, reason }; w.over = true; w.winner = win ? w.players[0].team : w.players[1].team;
      w.emit({ e: 'gameover', winner: w.winner });
    }
    serialize() { return { id: this.def.id, status: this.status, flags: this.flags, extra: this.def.serializeExtra ? this.def.serializeExtra(this.w) : null }; }
    static restore(w, s) {
      const def = MISSIONS.find((m) => m.id === s.id); if (!def) return null;
      const r = new MissionRunner(def, w); r.status = s.status; r.flags = s.flags;
      if (def.restoreExtra && s.extra) def.restoreExtra(w, s.extra);
      return r;
    }
  }

  WF.MISSIONS = MISSIONS; WF.MissionRunner = MissionRunner;

  /** Create a world for a campaign mission. */
  WF.createMissionWorld = function (idx, difficulty) {
    const def = MISSIONS[idx];
    const players = [{ name: 'You', faction: def.faction, team: 0, color: 0 }, { name: 'Enemy', faction: def.enemy, team: 1, color: 1, ai: def.ai ? (difficulty || def.ai) : null }];
    const w = new WF.World({ mapId: def.map, seed: 100 + idx, players, unitCap: 200, missionId: def.id, campaign: idx });
    def.setup(w);
    w.mission = new MissionRunner(def, w);
    w.attachAIs();
    w.updatePower(); w.updateFog();
    return w;
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
