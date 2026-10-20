/* Full AI-vs-AI matches on every map (smoke + balance check). node tests/ai_matches.js */
const WF = require('./load.js');
const combos = [['aegis', 'iron'], ['vortex', 'aegis'], ['iron', 'vortex']];
const maps = Object.keys(WF.MAPS);
let ok = true; const rows = [];
for (const map of maps) {
  for (let k = 0; k < combos.length; k++) {
    const [a, b] = combos[k];
    const nP = WF.MAPS[map].players;
    const players = [{ faction: a, ai: 'hard' }, { faction: b, ai: 'hard' }];
    if (nP === 4 && k === 0) { players.push({ faction: 'vortex', ai: 'normal' }, { faction: 'aegis', ai: 'normal' }); }
    const w = new WF.World({ mapId: map, seed: 20 + k, players });
    w.setupStandardStart(); w.attachAIs();
    const t0 = Date.now(); let maxStep = 0, negative = false;
    for (let i = 0; i < 20 * 60 * 45 && !w.over; i++) {
      const s = Date.now(); w.step(); w.events.length = 0; maxStep = Math.max(maxStep, Date.now() - s);
      if (i % 200 === 0) for (const p of w.players) if (p.res.c < -0.01 || p.res.m < -0.01) negative = true;
    }
    const winner = w.over ? w.players.filter((p) => p.team === w.winner).map((p) => p.faction).join('+') : 'none (45 min limit)';
    rows.push(`${map.padEnd(13)} ${players.map((p) => p.faction).join(' vs ').padEnd(30)} winner=${winner.padEnd(22)} time=${(w.time / 60).toFixed(1)}m  wall=${((Date.now() - t0) / 1000).toFixed(1)}s maxStep=${maxStep}ms`);
    console.log(rows[rows.length - 1]);
    if (negative) { ok = false; console.log('  NEGATIVE RESOURCES DETECTED'); }
  }
}
process.exit(ok ? 0 : 1);
