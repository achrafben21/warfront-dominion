/* WARFRONT: DOMINION — headless simulation test-suite (run: node tests/sim.test.js) */
'use strict';
const WF = require('./load.js');
const { D, U } = WF;
const TILE = U.TILE;

let pass = 0, fail = 0; const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}
function assert(c, msg) { if (!c) throw new Error('Assertion failed: ' + (msg || '')); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function near(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error((msg || 'expected near') + ': ' + a + ' vs ' + b); }

function world(opts) {
  const w = new WF.World(Object.assign({ mapId: 'ashen_plains', seed: 3, players: [{ faction: 'aegis' }, { faction: 'iron' }] }, opts || {}));
  w.setupStandardStart();
  return w;
}
function run(w, secs) { for (let i = 0; i < secs * 20; i++) { w.step(); w.events.length = 0; } }
function hq(w, pid) { return w.ents.find((e) => !e.dead && e.owner === pid && e.type === 'hq'); }
function builder(w, pid) { return w.ents.find((e) => !e.dead && e.owner === pid && e.type === 'builder'); }
function clearUnits(w) { for (const e of w.ents) if (e.kind === 'unit') { e.hp = 0; w.removeEntity(e, null); } run(w, 0.05); }
function freeSpot(w, pid, type) {
  const h = hq(w, pid); const d = D.BUILDINGS[type];
  for (let r = 3; r < 14; r++) for (let a = 0; a < 16; a++) {
    const tx = Math.round(h.tx + 1 + Math.cos(a / 16 * 6.28) * r - d.w / 2), ty = Math.round(h.ty + 1 + Math.sin(a / 16 * 6.28) * r - d.h / 2);
    if (w.canPlace(pid, type, tx, ty).ok) return { tx, ty };
  }
  return null;
}

console.log('\nResource transactions');
test('produce deducts exact cost and cancel refunds in full', () => {
  const w = world(); const p = w.players[0]; const h = hq(w, 0);
  const before = { c: p.res.c, m: p.res.m };
  const r = w.command(0, { c: 'produce', id: h.id, type: 'builder' }); assert(r.ok, r.reason);
  eq(p.res.c, before.c - D.unitFor('builder', 'aegis').cost.c, 'credits deducted');
  w.command(0, { c: 'cancel', id: h.id, type: 'builder' });
  eq(p.res.c, before.c, 'credits refunded'); eq(h.queue.length, 0, 'queue empty');
});
test('insufficient resources are rejected and never go negative', () => {
  const w = world(); const p = w.players[0]; const h = hq(w, 0);
  p.res.c = 100; p.res.m = 0;
  const r = w.command(0, { c: 'produce', id: h.id, type: 'builder' });
  assert(!r.ok, 'should fail'); eq(p.res.c, 100);
  const b = builder(w, 0); const spot = freeSpot(w, 0, 'barracks'); p.res.c = 349;
  const r2 = w.command(0, { c: 'build', ids: [b.id], type: 'barracks', tx: spot.tx, ty: spot.ty });
  assert(!r2.ok, 'build should fail'); assert(p.res.c >= 0 && p.res.m >= 0, 'non-negative');
});
test('batch produce stops at what the player can afford', () => {
  const w = world(); const p = w.players[0]; const h = hq(w, 0); p.res.c = 600; p.res.m = 0;
  const r = w.command(0, { c: 'produce', id: h.id, type: 'builder', n: 5 });
  const bc = D.unitFor('builder', 'aegis').cost.c; eq(r.n, Math.min(5, Math.floor(600 / bc)), 'only affordable count'); eq(p.res.c, 600 - r.n * bc);
});
test('extractors and mines generate income over time', () => {
  const w = world(); const p = w.players[0];
  const dep = w.map.deposits.find((d) => d.kind === 'oil' && U.dist(d.tx * TILE, d.ty * TILE, hq(w, 0).x, hq(w, 0).y) < 400);
  const e = w.placeBuilding(0, 'extractor', dep.tx, dep.ty, true); w.updatePower();
  const c0 = p.res.c; run(w, 10);
  const expected = (D.BUILDINGS.hq.income.c + D.BUILDINGS.extractor.income.c) * 10;
  near(p.res.c - c0, expected, expected * 0.08, 'income');
  assert(e.built);
});

console.log('\nConstruction prerequisites & placement');
test('factory requires a power plant', () => {
  const w = world(); const miss = w.buildReqMissing(0, 'factory'); assert(miss && /Power/.test(miss), miss);
  const s = freeSpot(w, 0, 'power'); w.placeBuilding(0, 'power', s.tx, s.ty, true);
  eq(w.buildReqMissing(0, 'factory'), null);
});
test('extractor must be placed on an oil field', () => {
  const w = world(); const h = hq(w, 0);
  eq(w.canPlace(0, 'extractor', h.tx + 5, h.ty).ok, false);
  const dep = w.map.deposits.find((d) => d.kind === 'oil');
  assert(w.canPlace(0, 'extractor', dep.tx, dep.ty).ok, 'on oil ok');
  eq(w.canPlace(0, 'mine', dep.tx, dep.ty).ok, false, 'mine not on oil');
});
test('cannot build on water, rock, or occupied tiles, or far from base', () => {
  const w = world({ mapId: 'twin_rivers' });
  let water = null, rock = null;
  for (let i = 0; i < w.map.n && (!water || !rock); i++) { if (w.map.t[i] === WF.T.WATER && !water) water = i; if (w.map.t[i] === WF.T.ROCK && !rock) rock = i; }
  eq(w.canPlace(0, 'wall', water % w.map.w, (water / w.map.w) | 0).ok, false, 'water');
  eq(w.canPlace(0, 'wall', rock % w.map.w, (rock / w.map.w) | 0).ok, false, 'rock');
  const h = hq(w, 0); eq(w.canPlace(0, 'wall', h.tx, h.ty).ok, false, 'occupied');
  eq(w.canPlace(0, 'power', 80, 80).ok, false, 'far away');
});
test('building completes exactly once when constructed by a builder', () => {
  const w = world(); clearUnits(w);
  const h = hq(w, 0); const b = w.spawnUnit(0, 'builder', h.x + 90, h.y, 0);
  const s = freeSpot(w, 0, 'power'); const r = w.command(0, { c: 'build', ids: [b.id], type: 'power', tx: s.tx, ty: s.ty }); assert(r.ok, r.reason);
  let built = 0;
  for (let i = 0; i < 20 * 40; i++) { w.step(); for (const ev of w.events) if (ev.e === 'built') built++; w.events.length = 0; }
  const site = w.get(r.id); assert(site && site.built, 'site completed'); eq(built, 1, 'built event once'); eq(w.players[0].stats.bldBuilt, 1);
  eq(w.players[0].power.gen, D.BUILDINGS.hq.power + 50, 'power applied');
});
test('placement that would seal the base is rejected', () => {
  const w = world(); const h = hq(w, 0);
  // fill a ring of walls around the HQ leaving no exit; the last wall must be rejected
  let rejected = false; w.players[0].res.c = 1e6; w.players[0].res.m = 1e6;
  for (let y = h.ty - 2; y <= h.ty + 4; y++) for (let x = h.tx - 2; x <= h.tx + 4; x++) {
    if (x > h.tx - 2 && x < h.tx + 4 && y > h.ty - 2 && y < h.ty + 4) continue;
    const c = w.canPlace(0, 'wall', x, y);
    if (c.ok) w.placeBuilding(0, 'wall', x, y, true); else if (/routes/.test(c.reason)) rejected = true;
  }
  assert(rejected, 'should refuse to seal');
});

console.log('\nProduction');
test('produced unit appears after its build time and only once', () => {
  const w = world(); const h = hq(w, 0); const n0 = w.ents.filter((e) => e.type === 'builder' && e.owner === 0).length;
  w.command(0, { c: 'produce', id: h.id, type: 'builder' });
  let ready = 0;
  for (let i = 0; i < 20 * (D.UNITS.builder.time + 2); i++) { w.step(); for (const ev of w.events) if (ev.e === 'unit_ready') ready++; w.events.length = 0; }
  eq(ready, 1); eq(w.ents.filter((e) => !e.dead && e.type === 'builder' && e.owner === 0).length, n0 + 1);
});
test('unit cap blocks production', () => {
  const w = world({ unitCap: 7 }); const h = hq(w, 0); w.players[0].res.c = 1e5;
  const r1 = w.command(0, { c: 'produce', id: h.id, type: 'builder' }); assert(r1.ok);
  const r2 = w.command(0, { c: 'produce', id: h.id, type: 'builder' }); assert(!r2.ok && /cap/i.test(r2.reason), r2.reason);
});
test('tech requirements gate units', () => {
  const w = world(); const s = freeSpot(w, 0, 'power'); w.placeBuilding(0, 'power', s.tx, s.ty, true);
  const s2 = freeSpot(w, 0, 'factory'); const f = w.placeBuilding(0, 'factory', s2.tx, s2.ty, true);
  w.players[0].res = { c: 1e5, m: 1e5 };
  assert(!w.command(0, { c: 'produce', id: f.id, type: 'heavy_tank' }).ok, 'heavy locked');
  w.players[0].tech.heavy_armor = true;
  assert(w.command(0, { c: 'produce', id: f.id, type: 'heavy_tank' }).ok, 'heavy unlocked');
  assert(!w.command(0, { c: 'produce', id: f.id, type: 'hover_tank' }).ok, 'other faction unit refused');
});
test('research completes, applies effects and charges once', () => {
  const w = world(); const p = w.players[0]; p.res = { c: 5000, m: 5000 };
  const s = freeSpot(w, 0, 'lab'); const lab = w.placeBuilding(0, 'lab', s.tx, s.ty, true);
  const c0 = p.res.c; assert(w.command(0, { c: 'research', id: lab.id, tech: 'extraction' }).ok);
  assert(!w.command(0, { c: 'research', id: lab.id, tech: 'munitions' }).ok, 'lab busy');
  eq(p.res.c, c0 - D.RESEARCH.extraction.cost.c);
  run(w, D.RESEARCH.extraction.time + 1);
  assert(p.has('extraction'), 'tech acquired');
  assert(!w.command(0, { c: 'research', id: lab.id, tech: 'extraction' }).ok, 'cannot research twice');
});

console.log('\nCombat, armor and targeting');
test('armor multipliers: bullets barely scratch heavy armor, AP is effective', () => {
  const w = world(); clearUnits(w);
  const t = w.spawnUnit(1, 'med_tank', 1000, 1000, 0); const hp0 = t.hp;
  w.damage(t, 100, 'bullet', 0, 0); near(hp0 - t.hp, 100 * D.DMG.bullet.heavy, 0.01);
  const h1 = t.hp; w.damage(t, 100, 'ap', 0, 0); near(h1 - t.hp, 100 * D.DMG.ap.heavy, 0.01);
});
test('unit fires only within weapon range and kills the target', () => {
  const w = world(); clearUnits(w); w.noAI = true;
  const a = w.spawnUnit(0, 'med_tank', 1200, 1200, 0); const range = D.WEAPONS.tank_gun.range;
  const t = w.spawnUnit(1, 'light_tank', 1200 + range + 140, 1200, Math.PI); t.hold = true; a.hold = true;
  let fired = 0; for (let i = 0; i < 60; i++) { w.step(); for (const ev of w.events) if (ev.e === 'fire' && ev.id === a.id && ev.w === 'tank_gun') fired++; w.events.length = 0; }
  eq(fired, 0, 'no fire out of range');
  t.x = 1200 + range - 40; t.y = 1200;
  for (let i = 0; i < 20 * 25 && !t.dead; i++) { w.step(); w.events.length = 0; }
  assert(t.dead, 'target destroyed'); assert(a.kills >= 1, 'kill credited');
});
test('ground-only weapons never target aircraft; AA engages aircraft', () => {
  const w = world(); clearUnits(w);
  const tank = w.spawnUnit(0, 'med_tank', 1200, 1200, 0); const flak = w.spawnUnit(0, 'flak', 1180, 1240, 0);
  const heli = w.spawnUnit(1, 'gunship', 1300, 1200, 0); heli.hold = true;
  let tankShots = 0, flakShots = 0;
  for (let i = 0; i < 20 * 6; i++) { w.step(); for (const ev of w.events) if (ev.e === 'fire') { if (ev.id === tank.id && ev.w === 'tank_gun') tankShots++; if (ev.id === flak.id) flakShots++; } w.events.length = 0; }
  eq(tankShots, 0, 'tank cannon never fires at air'); assert(flakShots > 0, 'flak fires');
  assert(heli.dead || heli.hp < heli.maxHp, 'heli damaged');
});
test('units do not target enemies hidden by fog of war', () => {
  const w = world(); clearUnits(w);
  const a = w.spawnUnit(0, 'howitzer', 1000, 1000, 0); a.hold = true;
  const t = w.spawnUnit(1, 'med_tank', 1000 + 450, 1000, 0); t.hold = true; // inside howitzer range, outside its vision
  w.updateFog();
  assert(!w.visibleTo(t, w.players[0].team), 'not visible');
  let fired = 0; for (let i = 0; i < 20 * 4; i++) { w.step(); for (const ev of w.events) if (ev.e === 'fire' && ev.id === a.id) fired++; w.events.length = 0; }
  eq(fired, 0, 'no blind fire');
  const spotter = w.spawnUnit(0, 'recon', 1400, 1000, 0); spotter.hold = true;
  for (let i = 0; i < 20 * 8; i++) { w.step(); for (const ev of w.events) if (ev.e === 'fire' && ev.id === a.id) fired++; w.events.length = 0; }
  assert(fired > 0, 'fires once spotted');
});
test('stealth units are invisible until detected', () => {
  const w = world({ players: [{ faction: 'aegis' }, { faction: 'vortex' }] }); clearUnits(w);
  const sub = w.spawnUnit(1, 'ghost', 1500, 1500, 0); const obs = w.spawnUnit(0, 'rifle', 1500 + 120, 1500, 0);
  w.updateFog(); assert(!w.visibleTo(sub, w.players[0].team), 'cloaked');
  w.spawnUnit(0, 'recon', 1500 + 60, 1500, 0); w.hash.clear(); w.updateFog();
  assert(w.visibleTo(sub, w.players[0].team), 'detected by scout');
});
test('area damage respects blast radius', () => {
  const w = world(); clearUnits(w);
  const near1 = w.spawnUnit(1, 'rifle', 2000, 2000, 0), far1 = w.spawnUnit(1, 'rifle', 2000 + 140, 2000, 0);
  w.hash.clear(); for (const e of w.ents) if (!e.dead) w.hash.insert(e);
  w.impact({ tx: 2000, ty: 2000, splash: 60, dmg: 50, type: 'he', team: w.players[0].team, owner: 0, kind: 'artyshell' });
  assert(near1.hp < near1.maxHp, 'near damaged'); eq(far1.hp, far1.maxHp, 'far untouched');
});
test('artillery respects minimum range', () => {
  const w = world(); clearUnits(w);
  const a = w.spawnUnit(0, 'howitzer', 1000, 1000, 0); a.hold = true; const t = w.spawnUnit(1, 'rifle', 1060, 1000, 0); t.hold = true;
  let fired = 0; for (let i = 0; i < 20 * 6; i++) { w.step(); for (const ev of w.events) if (ev.e === 'fire' && ev.id === a.id) fired++; w.events.length = 0; }
  eq(fired, 0);
});

console.log('\nMovement & pathfinding');
test('ground units path around a river via bridges and reach the goal', () => {
  const w = world({ mapId: 'twin_rivers' }); clearUnits(w);
  const sp = w.map.nearestPassable(16 * TILE, 80 * TILE, 'ground', 6); const u = w.spawnUnit(0, 'recon', sp.x, sp.y, 0);
  const gx = 70 * TILE, gy = 30 * TILE; w.command(0, { c: 'move', ids: [u.id], x: gx, y: gy });
  run(w, 90);
  assert(U.dist(u.x, u.y, gx, gy) < 60, 'arrived: ' + Math.round(U.dist(u.x, u.y, gx, gy)));
});
test('ground units never stand on water; naval units never on land', () => {
  const w = world({ mapId: 'archipelago' }); w.attachAIs();
  let tile = WF.T;
  for (let i = 0; i < 20 * 240; i++) {
    w.step(); w.events.length = 0;
    if (i % 100) continue;
    for (const e of w.ents) {
      if (e.dead || e.kind !== 'unit' || e.inside) continue;
      const t = w.map.tileAt(e.x, e.y);
      if (e.mv === 'ground') assert(WF.PASS.ground[t], e.type + ' on impassable tile ' + t);
      if (e.mv === 'naval') assert(WF.PASS.naval[t], e.type + ' on land');
    }
  }
});
test('naval path requests never route over land', () => {
  const w = world({ mapId: 'archipelago' });
  const sea = w.map.nearestPassable(60 * TILE, 85 * TILE, 'naval', 20);
  const p = w.map.findPath(sea.x, sea.y, 100 * TILE, 50 * TILE, 'naval');
  assert(p && p.length, 'path exists');
  for (let i = 0; i < p.length - 1; i++) assert(w.map.walkLine(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, 'naval') || i === 0, 'segment on water');
});
test('a large group moving through a choke does not get permanently stuck', () => {
  const w = world({ mapId: 'iron_pass' }); clearUnits(w);
  const ids = []; for (let i = 0; i < 24; i++) ids.push(w.spawnUnit(0, i % 2 ? 'light_tank' : 'rifle', (40 + (i % 6) * 2) * TILE, (66 + Math.floor(i / 6) * 2) * TILE, 0).id);
  w.command(0, { c: 'move', ids, x: 48 * TILE, y: 18 * TILE, formation: 'column' });
  run(w, 150);
  const arrived = ids.map((id) => w.get(id)).filter((u) => u && u.y < 30 * TILE).length;
  assert(arrived >= 22, 'arrived ' + arrived + '/24');
});
test('air units fly over cliffs and water', () => {
  const w = world({ mapId: 'iron_pass' }); clearUnits(w);
  const d = w.spawnUnit(0, 'drone', 10 * TILE, 70 * TILE, 0); w.command(0, { c: 'move', ids: [d.id], x: 80 * TILE, y: 10 * TILE });
  run(w, 30); assert(U.dist(d.x, d.y, 80 * TILE, 10 * TILE) < 50, 'drone arrived');
});

console.log('\nTransport, logistics, superweapon');
test('infantry boards and unloads from the amphibious transport', () => {
  const w = world(); clearUnits(w);
  const t = w.spawnUnit(0, 'amph', 1200, 1200, 0); const inf = [w.spawnUnit(0, 'rifle', 1150, 1200, 0), w.spawnUnit(0, 'at_team', 1150, 1240, 0)];
  w.command(0, { c: 'load', ids: inf.map((u) => u.id), id: t.id }); run(w, 6);
  eq(t.cargo.length, 2, 'boarded'); assert(inf.every((u) => u.inside === t.id));
  w.command(0, { c: 'unload', ids: [t.id], x: 1500, y: 1250 }); run(w, 12);
  eq(t.cargo.length, 0, 'unloaded'); assert(inf.every((u) => !u.inside && WF.PASS.ground[w.map.tileAt(u.x, u.y)]));
});
test('repair station heals damaged units not under fire', () => {
  const w = world(); clearUnits(w); const s = freeSpot(w, 0, 'repair'); const r = w.placeBuilding(0, 'repair', s.tx, s.ty, true);
  const u = w.spawnUnit(0, 'med_tank', r.x + 40, r.y + 40, 0); u.hp = 100; u.hold = true; run(w, 6);
  assert(u.hp > 200, 'healed to ' + u.hp);
});
test('missile silo charges and strikes', () => {
  const w = world(); clearUnits(w); const p = w.players[0];
  const s = freeSpot(w, 0, 'silo'); const silo = w.placeBuilding(0, 'silo', s.tx, s.ty, true);
  for (let i = 0; i < 6; i++) { const sp = freeSpot(w, 0, 'power'); w.placeBuilding(0, 'power', sp.tx, sp.ty, true); }
  silo.charge = 0.999; run(w, 2); assert(silo.charge >= 1, 'charged');
  const victim = w.spawnUnit(1, 'med_tank', 2200, 600, 0);
  assert(w.command(0, { c: 'strike', id: silo.id, x: 2200, y: 600 }).ok); run(w, 7);
  assert(victim.dead, 'strike destroyed target'); eq(silo.charge < 0.2, true);
});

console.log('\nSave/load, determinism, victory');
test('save → load restores state exactly', () => {
  const w = world(); w.attachAIs(); run(w, 120);
  const s1 = w.serialize(); const w2 = WF.World.deserialize(s1); w2.attachAIs();
  eq(w2.ents.length, w.ents.filter((e) => !e.dead).length, 'entity count');
  for (const e of w.ents) { if (e.dead) continue; const f = w2.byId.get(e.id); assert(f, 'entity ' + e.id); eq(f.hp, e.hp); eq(f.x, e.x); eq(JSON.stringify(f.queue || []), JSON.stringify(e.queue || [])); }
  eq(JSON.stringify(w2.players.map((p) => [p.res, p.tech])), JSON.stringify(w.players.map((p) => [p.res, p.tech])));
  eq(w2.fog[0].exp.reduce((a, b) => a + b, 0), w.fog[0].exp.reduce((a, b) => a + b, 0), 'explored map');
  run(w2, 30); assert(!w2.over || w2.winner != null, 'continues');
});
test('corrupted or tampered saves are rejected', () => {
  const w = world(); const s = w.serialize();
  let threw = false; try { WF.World.deserialize(s.slice(0, s.length / 2)); } catch (e) { threw = true; } assert(threw, 'truncated');
  const wrap = JSON.parse(s); wrap.d = wrap.d.replace('"hp":', '"hp":9'); threw = false; try { WF.World.deserialize(JSON.stringify(wrap)); } catch (e) { threw = true; } assert(threw, 'tampered');
});
test('simulation is deterministic for the same seed', () => {
  const mk = () => { const w = world({ seed: 11 }); w.attachAIs(); run(w, 90); return U.hash(JSON.stringify(w.ents.filter((e) => !e.dead).map((e) => [e.id, e.type, Math.round(e.x * 100), Math.round(e.hp * 100)]))); };
  eq(mk(), mk());
});
test('destroying all enemy HQ, factories and builders wins the match', () => {
  const w = world();
  for (const e of w.ents) if (e.owner === 1 && (e.type === 'hq' || e.type === 'factory' || e.type === 'builder')) { e.hp = 0; w.removeEntity(e, 0); }
  run(w, 1); assert(w.over, 'game over'); eq(w.winner, w.players[0].team, 'player 0 wins'); eq(w.players[1].alive, false);
});
test('HQ victory mode: losing the HQ loses the match', () => {
  const w = world({ victory: 'hq' }); const h = hq(w, 0); h.hp = 0; w.removeEntity(h, 1); run(w, 1);
  assert(w.over); eq(w.winner, w.players[1].team);
});
test('team games: allies share victory', () => {
  const w = new WF.World({ mapId: 'crossroads', seed: 5, players: [{ faction: 'aegis', team: 0 }, { faction: 'iron', team: 1 }, { faction: 'vortex', team: 0 }, { faction: 'iron', team: 1 }] });
  w.setupStandardStart();
  for (const e of w.ents) if (w.players[e.owner].team === 1) { e.hp = 0; w.removeEntity(e, 0); }
  run(w, 1); assert(w.over); eq(w.winner, 0);
});

console.log('\nAI');
test('AI builds an economy, researches and fields an army (no cheating at normal)', () => {
  const w = world({ players: [{ faction: 'aegis', ai: 'normal' }, { faction: 'iron', ai: 'normal' }] }); w.attachAIs();
  eq(w.players[0].incomeMul, 1, 'normal AI has no income bonus');
  run(w, 420);
  for (const p of w.players) {
    const mine = w.ents.filter((e) => !e.dead && e.owner === p.id);
    assert(mine.filter((e) => e.type === 'extractor').length >= 2, p.faction + ' extractors');
    assert(mine.filter((e) => e.kind === 'unit').length >= 8, p.faction + ' army');
    assert(p.res.c >= 0 && p.res.m >= 0, 'non-negative');
    assert(Object.keys(p.tech).length >= 1, p.faction + ' research');
  }
});
test('Warlord AI income bonus is applied and can be disabled', () => {
  const w = world({ players: [{ faction: 'aegis' }, { faction: 'iron', ai: 'brutal' }] }); w.attachAIs(); eq(w.players[1].incomeMul, 1.25);
  const w2 = world({ players: [{ faction: 'aegis' }, { faction: 'iron', ai: 'brutal' }], aiIncomeBonus: false }); w2.attachAIs(); eq(w2.players[1].incomeMul, 1);
});

console.log('\nCampaign');
for (let i = 0; i < WF.MISSIONS.length; i++) {
  test('mission ' + (i + 1) + ' "' + WF.MISSIONS[i].name + '" sets up and runs', () => {
    const w = WF.createMissionWorld(i, null); run(w, 90);
    assert(w.mission, 'mission attached');
    const s = w.serialize(); const w2 = WF.World.deserialize(s); w2.mission = WF.MissionRunner.restore(w2, w2._pendingMission); w2.attachAIs(); run(w2, 10);
    assert(w2.mission && w2.mission.def.id === WF.MISSIONS[i].id, 'mission restored');
  });
}
test('mission 1 objectives complete when conditions are met', () => {
  const w = WF.createMissionWorld(0, null);
  for (const t of ['power', 'barracks']) { const s = freeSpot(w, 0, t); w.placeBuilding(0, t, s.tx, s.ty, true); }
  const dep = w.map.deposits.find((d) => d.kind === 'oil' && U.dist(d.tx * TILE, d.ty * TILE, hq(w, 0).x, hq(w, 0).y) < 500); w.placeBuilding(0, 'extractor', dep.tx, dep.ty, true);
  for (const e of w.ents) if (e.owner === 1 && e.kind === 'bld') { e.hp = 0; w.removeEntity(e, 0); }
  run(w, 2);
  assert(w.over, 'mission over'); assert(w.mission.result.win, 'won');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED: ' + failures.join('; ')); process.exit(1); }
