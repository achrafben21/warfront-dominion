/* WARFRONT: DOMINION — application controller: game loop, selection & orders, placement, save/load. */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE, Store = WF.Store;
  const VERSION = '1.0.0';

  const G = {
    VERSION, settings: Store.loadSettings(), world: null, renderer: null, audio: null, hud: null, input: null, pid: 0,
    sel: new Set(), groups: {}, placing: null, targetMode: null, formation: 'auto', paused: false, speed: 1, running: false,
    acc: 0, lastT: 0, fpsT: 0, frames: 0, fps: 0, autosaveT: 0, menuWorld: null, alertT: -99, lastMsgIdx: 0, statsSnap: [],
  };
  WF.G = G;

  // ------------------------------------------------------------------ boot
  G.boot = function () {
    G.cv = document.getElementById('view'); G.mini = document.getElementById('minimap');
    G.audio = new WF.Audio(G.settings);
    G.input = new WF.Input(G, G.cv, G.mini);
    G.hud = new WF.HUD(G);
    G.menus = new WF.Menus(G);
    G.applySettings();
    window.addEventListener('resize', () => { if (G.renderer) G.renderer.resize(); G.sizeMinimap(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) G.onAppPause(); else G.onAppResume(); });
    window.WF_onAppPause = G.onAppPause; window.WF_onAppResume = G.onAppResume; window.WF_onBack = G.onBack;
    G.menus.showMain();
    G.startAttract();
    requestAnimationFrame(G.frame);
  };
  G.applySettings = function () {
    document.documentElement.style.setProperty('--s', G.settings.uiScale);
    if (G.audio) G.audio.apply();
    document.getElementById('fps').classList.toggle('hidden', !G.settings.showFps);
    if (G.renderer) { G.renderer.settings = G.settings; G.renderer.resize(); }
  };
  G.audioInit = function () { if (G.audio) { const was = G.audio.ok; G.audio.init(); if (!was && G.audio.ok) G.audio.startMusic(G.world && G.running ? 'battle' : 'menu'); } };
  G.haptic = function (ms) { if (G.settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };
  G.screenOpen = function () { return G.menus.isOpen(); };
  G.sizeMinimap = function () { const r = G.mini.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); G.mini.width = Math.max(64, Math.round(r.width * dpr)); G.mini.height = Math.max(64, Math.round(r.height * dpr)); };

  // ------------------------------------------------------------------ attract mode (menu background battle)
  G.startAttract = function () {
    try {
      const w = new WF.World({ mapId: 'ashen_plains', seed: (Date.now() % 1000) + 1, players: [{ faction: 'aegis', ai: 'brutal' }, { faction: 'iron', ai: 'brutal', color: 1 }], noAI: false });
      w.setupStandardStart(); w.attachAIs();
      for (const p of w.players) { p.res.c = 9000; p.res.m = 4000; }
      for (let i = 0; i < 20 * 150; i++) { w.step(); w.events.length = 0; }
      G.menuWorld = w; G.world = w; G.pid = 0;
      G.renderer = new WF.Renderer(G.cv, w, 0, Object.assign({}, G.settings, { shake: false }));
      G.renderer.revealAll = true; G.renderer.updateFog(); G.renderer.cam.zoom = 0.9;
      G.attract = { t: 0 };
    } catch (e) { console.error(e); }
  };

  // ------------------------------------------------------------------ match lifecycle
  G.startWorld = function (world, opts) {
    G.stopAttract();
    G.world = world; G.pid = 0; G.sel.clear(); G.groups = {}; G.placing = null; G.targetMode = null; G.paused = false; G.speed = 1; G.acc = 0;
    G.matchOpts = opts || {}; G.autosaveT = 0; G.lastMsgIdx = world.messages.length; G.statsSnap = []; G.ended = false;
    G.menus.loading(async (progress) => {
      G.renderer = new WF.Renderer(G.cv, world, G.pid, G.settings);
      if (world.opts.reveal) G.renderer.revealAll = true;
      // prewarm sprites & chunks to avoid hitches
      const pl = world.players[G.pid]; const types = D.FACTIONS[pl.faction].units;
      for (let i = 0; i < types.length; i++) { const d = D.UNITS[types[i]]; WF.ART.unitBody(types[i], pl.faction, pl.color, d.radius); WF.ART.unitTurret(types[i], pl.faction, pl.color, d.radius); if (i % 4 === 0) await progress(0.1 + 0.4 * i / types.length); }
      for (let k = 0; k < 6; k++) { G.renderer.prewarm(3); await progress(0.5 + k * 0.08); }
      G.hud.show(); G.sizeMinimap(); G.hud.reset(); G.running = true;
      if (world.mission) G.hud.showObjectives(true);
      if (G.audio.ok) { G.audio.stopMusic(); G.audio.startMusic('battle'); }
      await progress(1);
    });
  };
  G.stopAttract = function () { G.attract = null; G.menuWorld = null; };
  G.quitToMenu = function () {
    G.running = false; G.hud.hide(); G.world = null; G.renderer = null; G.sel.clear();
    if (G.audio.ok) { G.audio.stopMusic(); G.audio.startMusic('menu'); }
    G.menus.showMain(); G.startAttract();
  };

  G.newSkirmish = function (cfg) {
    const players = cfg.players.map((p, i) => ({ name: p.name, faction: p.faction, team: p.team, color: p.color, ai: p.ai, res: Object.assign({}, D.STARTING_RES[cfg.res]) }));
    const w = new WF.World({ mapId: cfg.map, seed: cfg.seed || ((Date.now() & 0xffff) + 1), players, victory: cfg.victory, unitCap: G.settings.unitCap, aiIncomeBonus: G.settings.aiIncomeBonus, sandbox: !!cfg.sandbox, reveal: !!cfg.reveal, mode: cfg.sandbox ? 'sandbox' : 'skirmish' });
    w.setupStandardStart(); w.attachAIs();
    G.startWorld(w, { kind: cfg.sandbox ? 'sandbox' : 'skirmish', cfg });
  };
  G.startMission = function (idx) {
    const def = WF.MISSIONS[idx]; const lv = D.AI_LEVELS.map((l) => l.id);
    const shift = { easy: -1, normal: 0, hard: 1 }[G.settings.campaignDiff] || 0;
    const diff = def.ai ? lv[U.clamp(lv.indexOf(def.ai) + shift, 0, lv.length - 1)] : null;
    const w = WF.createMissionWorld(idx, diff);
    G.startWorld(w, { kind: 'campaign', idx });
  };
  G.restart = function () {
    const o = G.matchOpts || {};
    if (o.kind === 'campaign') G.startMission(o.idx); else if (o.cfg) G.newSkirmish(Object.assign({}, o.cfg, { seed: G.world.seed }));
  };

  // ------------------------------------------------------------------ save / load
  G.saveGame = function (slot) {
    if (!G.world || G.world === G.menuWorld) return false;
    const data = G.world.serialize();
    const meta = { slot, t: Date.now(), map: G.world.map.name, time: G.world.time, faction: G.world.players[G.pid].faction, kind: (G.matchOpts || {}).kind, idx: (G.matchOpts || {}).idx, cfg: (G.matchOpts || {}).cfg, mission: G.world.mission ? G.world.mission.def.name : null };
    const ok = Store.set('save_' + slot, data) && Store.setJSON('savemeta_' + slot, meta);
    return ok;
  };
  G.loadGame = function (slot) {
    const data = Store.get('save_' + slot); const meta = Store.getJSON('savemeta_' + slot, {});
    if (!data) throw new Error('No save in this slot');
    const w = WF.World.deserialize(data);
    w.attachAIs();
    if (w._pendingMission) { w.mission = WF.MissionRunner.restore(w, w._pendingMission); w._pendingMission = null; }
    G.startWorld(w, { kind: meta.kind || 'skirmish', idx: meta.idx, cfg: meta.cfg });
  };
  G.onAppPause = function () {
    if (G.running && G.world && !G.world.over) { G.saveGame('auto'); if (!G.paused) G.togglePause(true); }
    if (G.audio) G.audio.suspend();
  };
  G.onAppResume = function () { if (G.audio) G.audio.resume(); };
  G.onBack = function () {
    if (G.menus.back()) return true;
    if (G.running) { if (G.placing) { G.cancelPlace(); return true; } if (G.targetMode) { G.cancelTarget(); return true; } G.togglePause(); return true; }
    return false;
  };

  // ------------------------------------------------------------------ main loop
  G.frame = function (t) {
    requestAnimationFrame(G.frame);
    const now = t / 1000; let dt = G.lastT ? now - G.lastT : 0.016; G.lastT = now; dt = Math.min(dt, 0.1);
    // adaptive resolution: keep >= ~30 fps on weaker devices by lowering render scale
    if (G.running && !G.paused && G.renderer) {
      G.perfAcc = (G.perfAcc || 0) * 0.97 + dt * 0.03;
      G.perfT = (G.perfT || 0) + dt;
      if (G.perfT > 4 && G.perfAcc > 1 / 27 && G.renderer.dprScale > 0.55) { G.perfT = 0; G.renderer.dprScale -= 0.15; G.renderer.resize(); if (G.renderer.dprScale < 0.75) G.renderer.settings = Object.assign({}, G.renderer.settings, { lowFx: true }); }
      else if (G.perfT > 8 && G.perfAcc < 1 / 50 && G.renderer.dprScale < 1) { G.perfT = 0; G.renderer.dprScale = Math.min(1, G.renderer.dprScale + 0.15); G.renderer.resize(); }
    }
    G.frames++; G.fpsT += dt; if (G.fpsT >= 0.5) { G.fps = G.frames / G.fpsT; G.frames = 0; G.fpsT = 0; if (G.settings.showFps) document.getElementById('fps').textContent = Math.round(G.fps) + ' fps · ' + (G.world ? G.world.ents.length : 0) + ' ents' + (G.renderer ? ' · res ' + Math.round(G.renderer.dprScale * 100) + '%' : ''); }
    const w = G.world, R = G.renderer; if (!w || !R) return;
    if (G.attract) {
      G.acc += dt; let n = 0; while (G.acc >= U.TICK && n < 3) { w.step(); G.acc -= U.TICK; n++; } if (n >= 3) G.acc = 0;
      // slow cinematic camera
      G.attract.t += dt; if (!G.attract.target || G.attract.t > 9) { G.attract.t = 0; const c = w.ents.filter((e) => !e.dead && e.kind === 'unit' && e.weapons.length); const tgt = c.length ? c[Math.floor(Math.random() * c.length)] : null; G.attract.target = tgt ? { x: tgt.x, y: tgt.y } : { x: w.map.pw / 2, y: w.map.ph / 2 }; }
      R.cam.x += (G.attract.target.x - R.cam.x) * dt * 0.25; R.cam.y += (G.attract.target.y - R.cam.y) * dt * 0.25; R.clampCam();
      R.consumeEvents(null); R.draw(G.acc / U.TICK, dt, null);
      if (w.over || w.time > 900) G.startAttract();
      return;
    }
    if (!G.running) { R.draw(0, 0, G.hud); return; }
    G.input.update(dt);
    if (!G.paused && !w.over) {
      G.acc += dt * G.speed; let n = 0;
      while (G.acc >= U.TICK && n < 6) { w.step(); G.acc -= U.TICK; n++; G.afterStep(); }
      if (n >= 6) G.acc = 0;
      G.autosaveT += dt; if (G.autosaveT > 120) { G.autosaveT = 0; G.saveGame('auto'); }
    }
    R.consumeEvents(G.audio);
    R.draw(G.paused ? 0 : G.acc / U.TICK, G.paused ? 0 : dt, G.hud);
    const g = R.g; g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); G.input.drawBox(g); g.setTransform(1, 0, 0, 1, 0, 0);
    G.hud.update(dt);
    if (!G.mini.width || G.mini.width < 10) G.sizeMinimap();
    if ((G.frames & 3) === 0) R.drawMinimap(G.mini, G.mini.width);
    if (w.over && !G.ended) { G.ended = true; setTimeout(() => G.menus.gameOver(), 1600); }
  };

  /** Per-sim-step hooks: alerts, messages, stats sampling, selection cleanup. */
  G.afterStep = function () {
    const w = G.world; const me = w.players[G.pid];
    for (const ev of w.events) {
      if (ev.e === 'death' && G.sel.has(ev.id)) G.sel.delete(ev.id);
      if (ev.e === 'gameover') G.audio.ui(w.winner === me.team ? 'victory' : 'defeat');
      if (ev.e === 'objective' && ev.owner === G.pid) G.audio.ui('research');
      if (ev.e === 'alert' && ev.owner === G.pid) G.audio.ui('warn');
      if (ev.e === 'silo_ready' && ev.owner === G.pid) G.audio.ui('built');
      if (ev.e === 'eliminated') G.audio.ui('alarm');
    }
    // base under attack alert (own buildings or units hit while off-screen)
    if (w.tick % 10 === 0) {
      for (const e of w.ents) {
        if (e.dead || e.owner !== G.pid || w.time - e.lastHitT > 0.6) continue;
        if (w.time - G.alertT < 18) break;
        const s = G.renderer.worldToScreen(e.x, e.y);
        if (s.x < 0 || s.y < 0 || s.x > G.renderer.sw || s.y > G.renderer.sh) {
          G.alertT = w.time; G.renderer.ping(e.x, e.y); G.lastAlert = { x: e.x, y: e.y };
          G.hud.toast(e.kind === 'bld' ? 'Our base is under attack!' : 'Our forces are under attack!', 'alert', () => { G.renderer.cam.x = e.x; G.renderer.cam.y = e.y; G.renderer.clampCam(); });
          G.audio.ui('warn'); break;
        }
      }
      if (me.lowPower && w.tick % 400 === 0) G.hud.toast('Low power! Build more Power Plants.', 'warn');
    }
    while (G.lastMsgIdx < w.messages.length) { const m = w.messages[G.lastMsgIdx++]; if (m.team === -1 || m.team === me.team) G.hud.toast(m.text, m.kind); }
    if (G.lastMsgIdx > w.messages.length) G.lastMsgIdx = w.messages.length;
    if (w.tick % 200 === 0) G.statsSnap.push(w.players.map((p) => { let army = 0; for (const e of w.ents) if (!e.dead && e.owner === p.id && e.kind === 'unit') army += D.UNITS[e.type].cost.c; return army; }));
  };

  // ------------------------------------------------------------------ selection
  G.myUnits = function () { return G.world.ents.filter((e) => !e.dead && !e.inside && e.owner === G.pid && e.kind === 'unit' && !e.locked); };
  G.selected = function () { const out = []; for (const id of G.sel) { const e = G.world.get(id); if (e && !e.inside) out.push(e); else G.sel.delete(id); } return out; };
  G.pick = function (sx, sy) {
    const p = G.renderer.screenToWorld(sx, sy); const w = G.world; const team = w.players[G.pid].team;
    let best = null, bd = 1e9; const slop = 14 / G.renderer.cam.zoom;
    for (const e of w.ents) {
      if (e.dead || e.inside) continue;
      if (!G.renderer.revealAll && !(e.vis & (1 << team))) continue;
      if (e.kind === 'bld') {
        if (p.x >= e.tx * TILE - 4 && p.x <= (e.tx + e.w) * TILE + 4 && p.y >= e.ty * TILE - 4 && p.y <= (e.ty + e.h) * TILE + 4) { const d = U.dist(p.x, p.y, e.x, e.y) + 30; if (d < bd) { bd = d; best = e; } }
      } else {
        const d = U.dist(p.x, p.y, e.x, e.y) - (e.mv === 'air' ? 4 : 0);
        if (d < e.radius + slop && d < bd) { bd = d; best = e; }
      }
    }
    return best;
  };
  G.select = function (list, add) {
    if (!add) G.sel.clear();
    for (const e of list) G.sel.add(e.id);
    if (list.length) G.audio.ui('select');
    G.hud.refresh(true);
  };
  G.deselect = function () { G.sel.clear(); G.hud.refresh(true); };
  G.tap = function (sx, sy, add) {
    const R = G.renderer; const wp = R.screenToWorld(sx, sy);
    if (G.placing) { G.placeHover(sx, sy); if (!matchMedia('(pointer: coarse)').matches && G.placing.valid) G.confirmPlace(); return; }
    if (G.targetMode) { const ent = G.pick(sx, sy); G.targetAt(wp.x, wp.y, ent); return; }
    const ent = G.pick(sx, sy);
    const sel = G.selected(); const myUnits = sel.filter((e) => e.kind === 'unit' && e.owner === G.pid);
    if (ent && ent.owner === G.pid) {
      // smart actions with own entity as target
      if (myUnits.length && ent.kind === 'bld' && (!ent.built || ent.hp < ent.maxHp) && myUnits.some((u) => D.UNITS[u.type].builder) && !G.sel.has(ent.id)) { G.issue({ c: 'repair', ids: myUnits.map((u) => u.id), id: ent.id }, ent.x, ent.y); return; }
      if (myUnits.length && ent.kind === 'unit' && ent.cargo && myUnits.some((u) => u.cls === 'inf') && !G.sel.has(ent.id)) { G.issue({ c: 'load', ids: myUnits.map((u) => u.id), id: ent.id }, ent.x, ent.y); return; }
      if (myUnits.length && ent.kind === 'unit' && ent.hp < ent.maxHp && myUnits.every((u) => D.UNITS[u.type].builder) && !G.sel.has(ent.id)) { G.issue({ c: 'repair', ids: myUnits.map((u) => u.id), id: ent.id }, ent.x, ent.y); return; }
      if (ent.locked) { G.hud.toast('That unit is not responding (radio silence).', 'warn'); return; }
      // double tap: select all of that type on screen
      const now = performance.now();
      if (G.lastTap && G.lastTap.id === ent.id && now - G.lastTap.t < 380 && ent.kind === 'unit') {
        const vis = G.myUnits().filter((u) => u.type === ent.type && G.onScreen(u)); G.select(vis, false); G.lastTap = null; return;
      }
      G.lastTap = { id: ent.id, t: now };
      if (add && G.sel.has(ent.id)) { G.sel.delete(ent.id); G.hud.refresh(true); return; }
      G.select([ent], add);
      return;
    }
    if (myUnits.length) { G.smartOrder(wp.x, wp.y, ent, add); return; }
    // only a production building selected: tap sets rally
    const b = sel.find((e) => e.kind === 'bld' && e.owner === G.pid && D.BUILDINGS[e.type].produces);
    if (b && !ent) { G.world.command(G.pid, { c: 'rally', id: b.id, x: wp.x, y: wp.y }); G.marker(wp.x, wp.y, 'rgba(120,200,255,'); G.audio.ui('move'); return; }
    if (ent) { G.select([ent], false); return; } // inspect enemy
    G.deselect();
  };
  G.onScreen = function (e) { const s = G.renderer.worldToScreen(e.x, e.y); return s.x >= 0 && s.y >= 0 && s.x <= G.renderer.sw && s.y <= G.renderer.sh; };
  G.boxSelect = function (b, add) {
    const R = G.renderer; const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const inBox = G.myUnits().filter((u) => { const s = R.worldToScreen(u.x, u.y); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; });
    // prefer combat units over builders when mixed
    const combat = inBox.filter((u) => !D.UNITS[u.type].builder);
    G.select(combat.length ? combat : inBox, add);
  };
  G.smartOrder = function (wx, wy, ent, queue) {
    const units = G.selected().filter((e) => e.kind === 'unit' && e.owner === G.pid);
    if (!units.length) { const b = G.selected().find((e) => e.kind === 'bld' && e.owner === G.pid && D.BUILDINGS[e.type].produces); if (b) G.world.command(G.pid, { c: 'rally', id: b.id, x: wx, y: wy }); return; }
    const w = G.world;
    if (ent && w.isEnemy(G.pid, ent.owner)) { G.issue({ c: 'attack', ids: units.map((u) => u.id), id: ent.id, queue: queue || G.queueMode }, ent.x, ent.y, 'attack'); return; }
    if (ent && ent.owner === G.pid && ent.kind === 'unit' && ent.cargo && units.some((u) => u.cls === 'inf')) { G.issue({ c: 'load', ids: units.map((u) => u.id), id: ent.id }, ent.x, ent.y); return; }
    G.issue({ c: 'move', ids: units.map((u) => u.id), x: wx, y: wy, queue: queue || G.queueMode, formation: G.formation }, wx, wy);
  };
  G.issue = function (c, x, y, kind) {
    const r = G.world.command(G.pid, c);
    if (r.ok) { G.marker(x, y, kind === 'attack' ? 'rgba(255,90,80,' : c.c === 'amove' ? 'rgba(255,190,80,' : 'rgba(120,255,140,'); G.audio.ui(kind === 'attack' || c.c === 'amove' ? 'attack' : 'move'); G.haptic(8); }
    else { G.hud.toast(r.reason || 'Cannot do that', 'warn'); G.audio.ui('error'); }
    G.hud.refresh(true);
    return r;
  };
  G.marker = function (x, y, col) { G.renderer.markers.push({ x, y, t: 0, life: 0.7, col }); };

  // groups
  G.assignGroup = function (n) { G.groups[n] = [...G.sel].filter((id) => { const e = G.world.get(id); return e && e.kind === 'unit'; }); G.hud.toast('Group ' + n + ' assigned (' + G.groups[n].length + ')', 'info'); G.haptic(20); G.hud.refresh(true); };
  G.recallGroup = function (n) {
    const ids = (G.groups[n] || []).filter((id) => G.world.get(id)); G.groups[n] = ids;
    if (!ids.length) { G.hud.toast('Group ' + n + ' is empty. Long-press to assign.', 'info'); return; }
    const now = performance.now();
    if (G.lastGroup && G.lastGroup.n === n && now - G.lastGroup.t < 400) { // double tap: center camera
      let x = 0, y = 0; for (const id of ids) { const e = G.world.get(id); x += e.x; y += e.y; } G.renderer.cam.x = x / ids.length; G.renderer.cam.y = y / ids.length; G.renderer.clampCam();
    }
    G.lastGroup = { n, t: now };
    G.select(ids.map((id) => G.world.get(id)), false);
  };

  // simple commands
  G.cmd = function (name) {
    const units = G.selected().filter((e) => e.kind === 'unit' && e.owner === G.pid);
    if (name === 'sell') { const b = G.selected().find((e) => e.kind === 'bld' && e.owner === G.pid); if (b) G.menus.confirm('Demolish ' + D.BUILDINGS[b.type].name + '? (40% refund)', () => { const r = G.world.command(G.pid, { c: 'sell', id: b.id }); if (!r.ok) G.hud.toast(r.reason, 'warn'); }); return; }
    if (!units.length) return;
    const r = G.world.command(G.pid, { c: name, ids: units.map((u) => u.id) });
    if (!r.ok) G.hud.toast(r.reason || 'Cannot do that', 'warn'); else G.audio.ui('click');
    G.hud.refresh(true);
  };
  G.regroup = function () {
    const units = G.selected().filter((e) => e.kind === 'unit' && e.owner === G.pid && e.mv !== 'air'); if (!units.length) return;
    let x = 0, y = 0; for (const u of units) { x += u.x; y += u.y; } x /= units.length; y /= units.length;
    G.issue({ c: 'move', ids: units.map((u) => u.id), x, y, formation: G.formation === 'auto' ? 'box' : G.formation }, x, y);
  };
  G.cycleFormation = function () { const f = ['auto', 'line', 'column', 'wedge', 'box']; G.formation = f[(f.indexOf(G.formation) + 1) % f.length]; G.hud.toast('Formation: ' + G.formation.toUpperCase(), 'info'); G.hud.refresh(true); };

  // target mode (attack-move, patrol, unload, rally, strike, repair, sandbox spawn)
  const TARGET_MSG = { amove: 'Tap destination: units attack anything on the way', patrol: 'Tap the far end of the patrol route', unload: 'Tap where to unload passengers', rally: 'Tap the new rally point', strike: 'Tap the strike target', attack: 'Tap an enemy to attack', spawn: 'Tap to spawn' };
  G.beginTarget = function (kind, extra) {
    if (G.placing) G.cancelPlace();
    G.targetMode = Object.assign({ kind }, extra || {}); G.hud.showTarget(TARGET_MSG[kind] || 'Select target');
  };
  G.cancelTarget = function () { G.targetMode = null; G.hud.showTarget(null); };
  G.targetAt = function (wx, wy, ent) {
    const tm = G.targetMode; if (!tm) return; const w = G.world;
    const units = G.selected().filter((e) => e.kind === 'unit' && e.owner === G.pid); const ids = units.map((u) => u.id);
    switch (tm.kind) {
      case 'amove': G.issue({ c: 'amove', ids, x: wx, y: wy, formation: G.formation, queue: G.queueMode }, wx, wy, 'amove'); break;
      case 'patrol': G.issue({ c: 'patrol', ids, x: wx, y: wy }, wx, wy); break;
      case 'unload': G.issue({ c: 'unload', ids, x: wx, y: wy }, wx, wy); break;
      case 'attack': if (ent && w.isEnemy(G.pid, ent.owner)) G.issue({ c: 'attack', ids, id: ent.id }, ent.x, ent.y, 'attack'); else { G.hud.toast('Tap an enemy target', 'warn'); return; } break;
      case 'rally': { const b = G.selected().find((e) => e.kind === 'bld'); if (b) G.world.command(G.pid, { c: 'rally', id: b.id, x: wx, y: wy }); G.marker(wx, wy, 'rgba(120,200,255,'); break; }
      case 'strike': { const r = w.command(G.pid, { c: 'strike', id: tm.id, x: wx, y: wy }); if (!r.ok) G.hud.toast(r.reason, 'warn'); else G.marker(wx, wy, 'rgba(255,60,40,'); break; }
      case 'spawn': {
        const d = D.UNITS[tm.type]; const p = d.move === 'air' ? { x: wx, y: wy } : w.map.nearestPassable(wx, wy, d.move, 8);
        if (!p) { G.hud.toast('Cannot place that unit there', 'warn'); return; }
        w.spawnUnit(tm.owner, tm.type, p.x, p.y, 0); w.updateFog(); G.audio.ui('ready');
        return; // stay in spawn mode for repeated spawning
      }
    }
    G.cancelTarget();
  };

  // ------------------------------------------------------------------ building placement
  G.startPlace = function (type) {
    const w = G.world; const miss = w.buildReqMissing(G.pid, type);
    if (miss) { G.hud.toast(miss, 'warn'); G.audio.ui('error'); return; }
    if (!w.canAfford(G.pid, w.buildingCost(G.pid, type))) { G.hud.toast('Insufficient resources', 'warn'); G.audio.ui('error'); return; }
    if (G.targetMode) G.cancelTarget();
    G.placing = { type, tx: 0, ty: 0, valid: false, reason: '' };
    // initial suggestion: near the camera centre, or snap to a nearby free deposit for extractors/mines
    const c = G.renderer.cam; const d = D.BUILDINGS[type];
    if (d.on) {
      let best = null, bd = 1e18;
      for (const dep of w.map.deposits) { if (dep.kind !== d.on || w.map.occ[w.map.idx(dep.tx, dep.ty)]) continue; if (!(w.fog[w.players[G.pid].team].exp[w.map.idx(dep.tx, dep.ty)])) continue; const dd = U.dist2(dep.tx * TILE, dep.ty * TILE, c.x, c.y); if (dd < bd) { bd = dd; best = dep; } }
      if (best) { G.placing.tx = best.tx; G.placing.ty = best.ty; c.x = best.tx * TILE + 32; c.y = best.ty * TILE + 32; G.renderer.clampCam(); }
    } else { G.placing.tx = Math.floor(c.x / TILE - d.w / 2); G.placing.ty = Math.floor(c.y / TILE - d.h / 2); }
    G.validatePlace(); G.hud.showPlace(true); G.hud.closeDrawer();
  };
  G.placeHover = function (sx, sy) {
    if (!G.placing) return; const w = G.world; const d = D.BUILDINGS[G.placing.type]; const p = G.renderer.screenToWorld(sx, sy);
    let tx = Math.floor(p.x / TILE - d.w / 2 + 0.5), ty = Math.floor(p.y / TILE - d.h / 2 + 0.5);
    if (d.on) { // snap to deposit under finger
      const dep = w.map.deposits.find((q) => q.kind === d.on && Math.abs(q.tx + 1 - p.x / TILE) < 2.2 && Math.abs(q.ty + 1 - p.y / TILE) < 2.2);
      if (dep) { tx = dep.tx; ty = dep.ty; }
    }
    G.placing.tx = tx; G.placing.ty = ty; G.validatePlace();
  };
  G.validatePlace = function () {
    const pl = G.placing; const w = G.world; const team = w.players[G.pid].team; const d = D.BUILDINGS[pl.type];
    let explored = true; for (let y = pl.ty; y < pl.ty + d.h; y++) for (let x = pl.tx; x < pl.tx + d.w; x++) if (!w.map.inb(x, y) || !w.fog[team].exp[w.map.idx(x, y)]) explored = false;
    const r = explored ? w.canPlace(G.pid, pl.type, pl.tx, pl.ty) : { ok: false, reason: 'Unexplored area' };
    pl.valid = r.ok; pl.reason = r.reason || '';
    G.hud.updatePlace();
  };
  G.confirmPlace = function () {
    const pl = G.placing; if (!pl || !pl.valid) { G.audio.ui('error'); return; }
    const w = G.world;
    let builders = G.selected().filter((e) => e.kind === 'unit' && D.UNITS[e.type].builder);
    if (!builders.length) {
      // auto-assign the nearest idle (or any) builder
      const all = G.myUnits().filter((u) => D.UNITS[u.type].builder); const cx = (pl.tx + 1) * TILE, cy = (pl.ty + 1) * TILE;
      all.sort((a, b) => (a.orders.length - b.orders.length) * 1e7 + U.dist2(a.x, a.y, cx, cy) - U.dist2(b.x, b.y, cx, cy));
      if (all.length) builders = [all[0]];
    }
    if (!builders.length) { G.hud.toast('You need a Construction Rig', 'warn'); G.audio.ui('error'); return; }
    const r = w.command(G.pid, { c: 'build', ids: builders.map((b) => b.id), type: pl.type, tx: pl.tx, ty: pl.ty });
    if (!r.ok) { G.hud.toast(r.reason, 'warn'); G.audio.ui('error'); return; }
    G.audio.ui('place'); G.haptic(20);
    const type = pl.type;
    G.placing = null; G.hud.showPlace(false);
    // walls: keep placing for convenience
    if (type === 'wall' && w.canAfford(G.pid, w.buildingCost(G.pid, 'wall'))) { G.startPlace('wall'); G.placing.tx = pl.tx + 1; G.placing.ty = pl.ty; G.validatePlace(); }
    G.hud.refresh(true);
  };
  G.cancelPlace = function () { G.placing = null; G.hud.showPlace(false); };

  G.togglePause = function (force) {
    if (!G.running) return;
    G.paused = force === true ? true : !G.paused;
    if (G.paused) G.menus.pauseMenu(); else G.menus.closeModal();
    G.hud.updatePause();
  };
  G.cycleSpeed = function () { const s = [1, 1.5, 2, 0.5]; G.speed = s[(s.indexOf(G.speed) + 1) % s.length]; G.hud.updatePause(); };

  window.addEventListener('load', () => { try { G.boot(); } catch (e) { document.body.innerHTML = '<pre style="color:#f88;padding:20px">Startup error: ' + (e && e.stack || e) + '</pre>'; } });
})(window.WF = window.WF || {});
