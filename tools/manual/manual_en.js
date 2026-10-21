/* Builds the English player manual from the live game data (stats are always in sync with data.js). */
(function () {
  'use strict';
  const D = WF.D, ART = WF.ART;
  ART.forceDOM = true; ART.SS = 5;
  const doc = document.getElementById('doc');
  const E = (s) => `<span class="en">${s}</span>`;
  const AUTHOR = 'Achraf Benhachem';

  const EN_UNIT = {
    rifle: 'Cheap, fast-to-train infantry squad. Excellent against other infantry and digs in well inside forests.',
    at_team: 'Anti-armor infantry carrying armor-piercing rockets. Deadly to tanks, vulnerable to infantry.',
    ghost: 'Cloaked recon team, invisible unless detected or firing. Ideal for scouting.',
    builder: 'Construction rig: builds and repairs every structure. Protect it — it is your economy.',
    recon: 'Very fast scout car with long sight that detects nearby cloaked units.',
    light_tank: 'Fast light tank for raiding extractors and light vehicles.',
    med_tank: 'Main battle tank: balanced armor and firepower, the backbone of any army.',
    hover_tank: 'Hover tank with a plasma cannon; fast and crosses both water and land.',
    heavy_tank: 'Twin-cannon heavy tank; slow but breaks defensive lines.',
    mammoth: 'Super-heavy assault tank with an anti-air machine gun. A moving fortress.',
    flak: 'Mobile anti-air vehicle that shreds aircraft and helicopters.',
    mlrs: 'Rocket artillery that saturates large areas with indirect fire.',
    howitzer: 'Long-range howitzer; must stop to fire and has a minimum range.',
    siege: 'Heavy siege mortar that wrecks buildings and fortifications.',
    supply: 'Logistics truck that repairs nearby vehicles in the field.',
    ew: 'Electronic-warfare rig: jams enemy weapons (−35% accuracy) and detects cloaked units.',
    amph: 'Amphibious transport carrying 6 infantry squads over water and land.',
    drone: 'Recon drone with a very wide view that detects cloaked units.',
    gunship: 'Rocket attack helicopter; an armor hunter that ignores terrain.',
    fighter: 'Air-superiority interceptor that returns to the airfield to rearm.',
    bomber: 'Heavy bomber that carpets ground targets, then returns to rearm.',
    patrol: 'Fast patrol boat for coastal raids, with an anti-air machine gun.',
    missile_boat: 'Guided-missile boat against ships, ground and air.',
    destroyer: 'Heavy destroyer with twin guns and missiles; its sonar reveals submarines.',
    submarine: 'Stealth submarine with ship-killing torpedoes.',
    citadel: 'Experimental mobile fortress with twin cannons, SAMs and field repair.',
    aurora: 'Experimental hovering strike platform firing energy beams at every target type.',
    colossus: 'Experimental giant siege walker whose cannon crushes buildings.',
  };
  const EN_BLD = {
    hq: 'Command HQ: produces construction rigs and gives base income. Losing it is very dangerous.',
    extractor: 'Oil extractor: built on an oil field (dark glossy patches) and produces Credits.',
    mine: 'Ore mine: built on ore deposits (crystal rocks) and produces Metal.',
    power: 'Power plant: +50 power. Low power slows everything down.',
    barracks: 'Barracks: trains infantry.',
    factory: 'Vehicle factory: tanks, artillery and support vehicles.',
    airfield: 'Airfield: aircraft and helicopters; rearms jets.',
    shipyard: 'Shipyard: must touch water. Builds naval units.',
    lab: 'Research lab: develops technologies and upgrades.',
    repair: 'Repair station: quickly repairs nearby units.',
    radar: 'Radar array: shows enemy movement as red blips and detects nearby cloaked units.',
    turret_mg: 'MG nest: anti-infantry defense with light anti-air.',
    turret_gun: 'Defensive anti-armor cannon.',
    turret_aa: 'Long-range surface-to-air missile site.',
    wall: 'Cheap fortified wall that blocks paths.',
    silo: 'Strategic missile silo: superweapon launching a devastating strike every 4 minutes.',
  };
  const EN_RES = {
    extraction: '+25% income from extractors and mines.', munitions: '+15% damage for all weapons.', composite_armor: '+20% HP for vehicles and ships.',
    optics: '+15% vision and +8% weapon range.', heavy_armor: 'Unlocks heavy tanks and siege vehicles.', artillery: 'Unlocks the howitzer; +10% artillery accuracy.',
    aviation: 'Unlocks fighters and bombers.', experimental: 'Unlocks the faction experimental unit and the missile silo.',
    aegis_logistics: 'Aegis only: units self-repair out of combat; supply aura doubled.',
    vortex_cloak: 'Vortex only: unlocks Ghost and Spectre EW; drones become cloaked.',
    iron_hulls: 'Iron only: +30% building and turret HP; walls at half price.',
  };
  const EN_MAP = {
    twin_rivers: 'Two rivers guard each base; controlling the bridges and the central plateau is the key to victory.',
    iron_pass: 'A mountain wall with three narrow passes. Artillery and fortifications rule this map.',
    archipelago: 'Coastal war across scattered islands and a single land bridge; naval power decides the rest.',
    crossroads: 'Four armies, one crown: a central plateau where the great roads meet (up to 4 players).',
    ashen_plains: 'A small open arena of scorched fields: fast, brutal battles.',
  };
  const EN_MIS = [
    'Establish a forward base — power plant, barracks and an oil extractor — then destroy the enemy outpost.',
    'Hold for 10 minutes against armored waves pouring through the mountain passes until reinforcements arrive.',
    'Find a patrol trapped across the river and bring at least two survivors back to HQ.',
    'Capture the three marked zones and hold them for 90 consecutive seconds.',
    'Destroy the four howitzer batteries shelling your base.',
    'Escort the supply convoy through the crossroads; at least two trucks must arrive.',
    'Storm the fortress and destroy the Colossus siege walker and the enemy HQ.',
  ];

  let pageNo = 0;
  function page(title, html, opt) {
    pageNo++; opt = opt || {};
    const d = document.createElement('section'); d.className = 'page' + (opt.cls ? ' ' + opt.cls : '');
    d.innerHTML = (opt.noHead ? '' : `<div class="pghead"><span>${title || ''}</span><span class="en">WARFRONT · DOMINION</span></div>`) + html +
      (opt.noFoot ? '' : `<div class="foot"><span>Commander's Manual — v2.0 · by ${AUTHOR}</span><span class="en">${pageNo}</span></div>`);
    doc.appendChild(d); return pageNo;
  }
  const img = (src, cap) => `<img class="shot" src="img/${src}">` + (cap ? `<div class="cap">${cap}</div>` : '');
  const tiles = (px) => (px / 32).toFixed(1);
  function dps(type, f) { const u = D.unitFor(type, f); let s = 0; for (const w of u.weapons || []) { const wd = D.WEAPONS[w]; s += wd.dmg * (wd.salvo || 1) / wd.rof; } return s; }
  function unitCard(type, f, color) {
    const u = D.unitFor(type, f); const wd = u.weapons ? D.WEAPONS[u.weapons[0]] : null;
    const cls = u.experimental ? 'exp' : u.cls; const lbl = { inf: 'INFANTRY', veh: 'VEHICLE', air: 'AIR', naval: 'NAVAL', exp: 'EXPERIMENTAL' }[cls];
    const st = [`<span><i>HP</i>${u.hp}</span>`, `<span><i>SPD</i>${tiles(u.speed)}</span>`];
    if (wd) { st.push(`<span><i>RNG</i>${tiles(wd.range)}</span>`); st.push(`<span><i>DPS</i>${dps(type, f).toFixed(0)}</span>`); st.push(`<span><i>DMG</i>${wd.type.toUpperCase()}</span>`); }
    st.push(`<span><i>¢</i>${u.cost.c}${u.cost.m ? ' · ' + u.cost.m + 'm' : ''}</span>`); st.push(`<span><i>⏱</i>${u.time}s</span>`);
    return `<div class="uc"><img src="${ART.iconURL('unit', type, f, color)}"><div><div class="nm">${u.name} <span class="tag ${cls}">${lbl}</span></div><div class="ar">${EN_UNIT[type] || ''}</div><div class="st">${st.join('')}</div></div></div>`;
  }

  // ------------------------------------------------------------------ COVER
  page('', `<img class="bg" src="img/cover.jpg"><div class="shade"></div><div class="content">
    <div class="logo">WARFRONT<span>DOMINION</span></div>
    <div class="title">The Commander's Manual</div>
    <div class="sub">Everything you need to lead your armies to victory: interface, economy, units, tactics and the campaign.</div>
    <div class="badge">VERSION 2.0</div>
    <div class="author">A game by <b>${AUTHOR}</b></div>
    <div class="emblems"><div>${WF.factionEmblem('aegis', 34)} ${E('Aegis Coalition')}</div><div>${WF.factionEmblem('vortex', 34)} ${E('Vortex Directorate')}</div><div>${WF.factionEmblem('iron', 34)} ${E('Iron Dominion')}</div></div>
  </div>`, { cls: 'cover', noHead: true, noFoot: true });

  page('Contents', '<h1>Contents</h1><div class="toc" id="toc"></div>');
  const toc = [];
  const sec = (t, html, opt) => { const n = page(t, html, opt); toc.push([t, n]); return n; };

  // ------------------------------------------------------------------ INTRO
  sec('Welcome, Commander', `<h1>Welcome, Commander<small>Warfront: Dominion — a real-time strategy war game by ${AUTHOR}</small></h1>
  <p class="lead"><b>Warfront: Dominion</b> is a real-time strategy (RTS) war game designed for phones and tablets in landscape, and it runs completely offline. Build bases, run a three-resource economy, research technology, then command armies of infantry, tanks, artillery, aircraft and ships against an AI that thinks and adapts.</p>
  ${img('battle.jpg', 'Aegis (blue) and Iron Dominion (red) forces clash')}
  <div class="grid2"><div>
  <h3>What's new in version 2.0</h3>
  <ul><li>Completely new graphics: real lighting and shadows, per-faction camouflage and animated tracks.</li>
  <li>Natural terrain with smooth rivers, shoreline foam, real bridges and dense forests.</li>
  <li>Explosion effects that light the ground, with sparks, smoke and shockwaves.</li>
  <li>A professional military interface with drawn icons, unit portraits and new fonts.</li></ul></div><div>
  <h3>Requirements &amp; installation</h3>
  <ol><li>An Android 7.0+ device with an up-to-date Android System WebView.</li>
  <li>Copy <b>WarfrontDominion.apk</b> to the phone and open it.</li>
  <li>When asked, allow “Install unknown apps” for your file manager or browser.</li>
  <li>Launch the game: it runs in landscape and needs no account or internet.</li></ol></div></div>
  <div class="box tip"><b class="t">Tip:</b> new to strategy games? Start with the campaign — the first mission, “Beachhead”, teaches building and economy step by step.</div>`);

  // ------------------------------------------------------------------ QUICK START
  sec('Quick Start', `<h1>Quick Start<small>Your first five minutes in any battle</small></h1>
  <ol class="lead">
  <li><b>Build a power plant:</b> tap the BUILD button on the left, choose Power Plant, tap the map to place it, then press ✓. The nearest construction rig drives there automatically.</li>
  <li><b>Secure oil:</b> build an Oil Extractor on the nearest oil field (dark glossy patches). The blueprint snaps to the field.</li>
  <li><b>Metal:</b> build an Ore Mine on ore deposits (orange and silver rocks).</li>
  <li><b>Army:</b> build Barracks for infantry, then a Vehicle Factory for tanks. Tap a factory to open its production list: tap = one unit, long-press = 5 units.</li>
  <li><b>Rally point:</b> with the factory selected, tap the ground to set where new units gather.</li>
  <li><b>Scout:</b> send the Pathfinder Scout to find the enemy base and resource sites.</li>
  <li><b>Expand and defend:</b> every extra extractor raises income, and turrets at chokepoints multiply your strength.</li>
  <li><b>Attack:</b> select your army with a long-press drag, then use ATK-MOVE toward the enemy.</li></ol>
  ${img('build.jpg', 'The build menu: cost on top of each card; locked buildings show why they are locked')}
  <div class="box note"><b>Goal:</b> in standard victory you win when every enemy has lost its HQ, vehicle factories and all construction rigs.</div>`);

  // ------------------------------------------------------------------ HUD
  sec('Battle Interface', `<h1>Battle Interface<small>Every element on the screen</small></h1>
  <div class="shotwrap">${img('hud.jpg')}
    <div class="callout" style="top:9%;left:1%">1</div><div class="callout" style="top:9%;left:8%">2</div><div class="callout" style="top:9%;left:21%">3</div><div class="callout" style="top:9%;left:34%">4</div><div class="callout" style="top:9%;right:7%">5</div>
    <div class="callout" style="top:26%;left:5%">6</div><div class="callout" style="top:21%;left:16%">7</div><div class="callout" style="bottom:30%;left:11%">8</div><div class="callout" style="bottom:17%;left:30%">9</div><div class="callout" style="bottom:30%;left:79%">10</div><div class="callout" style="top:22%;left:56%">11</div>
  </div>
  <div class="legend">
  <div><b>1</b>Menu and pause (save, load, settings).</div>
  <div><b>2</b>Credits and income per second.</div>
  <div><b>3</b>Metal and its income rate.</div>
  <div><b>4</b>Power: produced / used (flashes red on deficit).</div>
  <div><b>5</b>Clock, game speed (0.5× to 2×) and pause.</div>
  <div><b>6</b>Quick tools: box select, build, whole army, idle construction rig.</div>
  <div><b>7</b>Control groups 1–5: long-press to assign, tap to recall, double-tap to jump.</div>
  <div><b>8</b>Minimap: tap to move the camera. Pulsing red dots are radar blips.</div>
  <div><b>9</b>Selection panel: portrait, health and info.</div>
  <div><b>10</b>Command buttons for the current selection.</div>
  <div><b>11</b>Battle alerts: tap to jump the camera there. (Build and production drawer opens on the right.)</div>
  </div>
  <div class="box tip"><b class="t">Alerts:</b> when your base or forces are attacked off-screen a red message appears; tap it to jump the camera to the attack instantly.</div>`);

  // ------------------------------------------------------------------ CONTROLS
  sec('Controls', `<h1>Controls<small>Touch, mouse and keyboard</small></h1>
  <table><tr><th>Touch gesture</th><th>Action</th></tr>
  <tr><td>Tap a unit</td><td>Select it (double-tap = all units of that type on screen)</td></tr>
  <tr><td>Tap the ground</td><td>Move selected units there</td></tr>
  <tr><td>Tap an enemy</td><td>Direct attack order</td></tr>
  <tr><td>Tap a damaged building (with a rig selected)</td><td>Repair / finish construction</td></tr>
  <tr><td>Tap a transport (with infantry selected)</td><td>Board the transport</td></tr>
  <tr><td>One-finger drag</td><td>Pan the camera (with inertia)</td></tr>
  <tr><td>Two-finger pinch</td><td>Zoom; two-finger drag also pans</td></tr>
  <tr><td>Long-press then drag</td><td>Box select (or enable the ▢ button for direct box select)</td></tr>
  <tr><td>Two-finger tap</td><td>Deselect</td></tr>
  <tr><td>Long-press a group button</td><td>Assign the current selection to that group</td></tr>
  <tr><td>Long-press a unit in a production list</td><td>Queue 5 units</td></tr>
  <tr><td>Android back button</td><td>Cancel the current order or open the pause menu</td></tr></table>
  <table><tr><th>Mouse / key</th><th>Action</th></tr>
  <tr><td>Left click / drag</td><td>Select / box select</td></tr><tr><td>Right click</td><td>Smart order (move / attack / load)</td></tr>
  <tr><td>Wheel</td><td>Zoom</td></tr><tr><td>Arrows or screen edge</td><td>Pan the camera</td></tr>
  <tr><td><span class="kbd">Ctrl+1…5</span> / <span class="kbd">1…5</span></td><td>Assign / recall groups</td></tr>
  <tr><td><span class="kbd">A</span> <span class="kbd">S</span> <span class="kbd">H</span> <span class="kbd">P</span> <span class="kbd">R</span> <span class="kbd">F</span></td><td>Attack-move, stop, hold, patrol, retreat, formation</td></tr>
  <tr><td><span class="kbd">B</span> <span class="kbd">Space</span> <span class="kbd">Esc</span> <span class="kbd">Delete</span></td><td>Build, jump to HQ, pause, demolish building</td></tr></table>`);

  // ------------------------------------------------------------------ ECONOMY
  const inc = (t) => D.BUILDINGS[t].income;
  sec('Economy & Power', `<h1>Economy &amp; Power<small>Three resources drive the war machine</small></h1>
  <div class="grid3">
  <div class="box"><h3>${WF.ICON.credits} Credits</h3><p>The core resource for everything. Comes from oil extractors (+${inc('extractor').c}/s each) and the HQ (+${inc('hq').c}/s).</p></div>
  <div class="box"><h3>${WF.ICON.metal} Metal</h3><p>Needed for heavy vehicles, aircraft and research. Comes from ore mines (+${inc('mine').m}/s each) and the HQ (+${inc('hq').m}/s).</p></div>
  <div class="box"><h3>${WF.ICON.power} Power</h3><p>Not a stockpile but a grid: each plant gives +50 and every building draws some. Watch the meter in the top bar.</p></div></div>
  <h2>What happens on low power?</h2>
  <ul><li>Production and research slow in proportion to available power (down to a minimum of 35% speed).</li><li>Extractor and mine output drops.</li><li>Defensive turrets fire more slowly.</li><li>Radar switches off and a lightning icon appears over affected buildings.</li></ul>
  <h2>Economy rules</h2>
  <ul><li>Costs are paid up front, fully refunded when production is cancelled, and 75% refunded when a construction is cancelled before it starts.</li>
  <li>Demolishing returns 40% of the building's value, scaled by its condition.</li><li>Resources can never go negative.</li>
  <li>Extractors and mines can only be built on their sites; those sites are reserved for them.</li>
  <li>The Deep Extraction research raises all extractor and mine income by 25%.</li></ul>
  <div class="box tip"><b class="t">Golden rule:</b> keep power at least 15 above consumption, and build a new extractor roughly every two minutes early in a match.</div>`);

  // ------------------------------------------------------------------ BUILDINGS
  const bOrder = ['hq', 'power', 'extractor', 'mine', 'barracks', 'factory', 'airfield', 'shipyard', 'lab', 'repair', 'radar', 'turret_mg', 'turret_gun', 'turret_aa', 'wall', 'silo'];
  const bRow = (t) => { const b = D.bldFor(t, 'aegis'); const req = (b.req || []).map((r) => D.BUILDINGS[r].name).concat((b.reqTech || []).map((r) => D.RESEARCH[r].name)); return `<tr><td><img src="${ART.iconURL('bld', t, 'aegis', 0)}" style="width:11mm;height:11mm;border-radius:1.5mm;vertical-align:middle"></td><td><div class="en" style="color:var(--gold2)">${b.name}</div><div style="font-size:8.6pt;color:#cfd9cb">${EN_BLD[t]}</div></td><td class="num">${t === 'hq' ? '—' : b.cost.c + (b.cost.m ? ' / ' + b.cost.m : '')}</td><td class="num">${b.power > 0 ? '+' : ''}${b.power}</td><td class="num">${b.hp}</td><td style="font-size:8.4pt">${req.join(', ') || '—'}</td></tr>`; };
  const bHead = '<tr><th></th><th>Building</th><th class="num">Cost ¢/m</th><th class="num">Power</th><th class="num">HP</th><th>Requires</th></tr>';
  sec('Buildings', `<h1>Buildings<small>Every structure, its role and requirements</small></h1><table>${bHead}${bOrder.slice(0, 9).map(bRow).join('')}</table>`);
  page('Buildings', `<table>${bHead}${bOrder.slice(9).map(bRow).join('')}</table>
  <h2>Construction rules</h2><ul><li>Buildings must be inside your base area (near existing buildings), except extractors and mines.</li><li>No building on water, rocks, forests or bridges, or on top of enemy units.</li>
  <li>The game blocks any building that would seal off every path out of your base.</li><li>Several rigs on the same building finish it faster.</li>
  <li>Idle construction rigs automatically repair nearby damaged buildings.</li><li>Walls: after placing a wall you stay in build mode to place the next one quickly.</li></ul>`);

  // ------------------------------------------------------------------ COMBAT
  const types = ['bullet', 'ap', 'he', 'flak', 'missile', 'torpedo', 'siege', 'beam'];
  const EN_DT = { bullet: 'Bullet', ap: 'Armor-piercing', he: 'High explosive', flak: 'Flak', missile: 'Missile', torpedo: 'Torpedo', siege: 'Siege', beam: 'Energy beam' };
  const col = (v) => v >= 1.2 ? '#5fdc7a' : v >= 0.9 ? '#c8e07a' : v >= 0.5 ? '#e8b84a' : v > 0 ? '#ef7a4b' : '#555';
  sec('Combat System', `<h1>Combat System<small>Armor, damage types, range and line of sight</small></h1>
  <p>Every weapon has a damage type and every target has an armor class. Final damage = weapon damage × the multiplier in this table. Match the right unit to the right target!</p>
  <table class="mult"><tr><th>Damage type</th>${D.ARMOR.map((a) => `<th class="num">${{ inf: 'Infantry', light: 'Light', heavy: 'Heavy', air: 'Air', bld: 'Building', naval: 'Naval' }[a]}</th>`).join('')}</tr>
  ${types.map((t) => `<tr><td style="text-align:left;font-family:Tajawal;font-weight:700">${EN_DT[t]}</td>${D.ARMOR.map((a) => `<td style="color:${col(D.DMG[t][a])}">×${D.DMG[t][a].toFixed(2)}</td>`).join('')}</tr>`).join('')}</table>
  <div class="grid2"><div><h3>Hits and accuracy</h3><ul><li>Direct shots have a hit chance; fast targets and infantry in forests are harder to hit.</li><li>Artillery (rockets and howitzers) fires indirectly with scatter and arcs over obstacles.</li><li>Direct-fire weapons need line of sight, which rocks and cliffs block.</li><li>Splash damage falls off with distance from the blast centre.</li></ul></div>
  <div><h3>Key rules</h3><ul><li>Artillery has a minimum range: protect it with tanks.</li><li>Howitzers and siege mortars stop before firing.</li><li>Infantry in forests take 30% less damage.</li><li>Jets fly sorties, then return to the airfield to rearm.</li><li>Units never fire at what your team cannot see (no blind fire into fog).</li></ul></div></div>
  <div class="box tip"><b class="t">Weapon triangle:</b> anti-tank infantry beats tanks, tanks beat light vehicles, machine guns and artillery mow down infantry, and anti-air brings down aircraft.</div>`);

  // ------------------------------------------------------------------ UNITS per faction
  const fcol = { aegis: 0, vortex: 3, iron: 1 };
  for (const f of ['aegis', 'vortex', 'iron']) {
    const F = D.FACTIONS[f];
    const list = F.units;
    const head = `<div class="fhead">${WF.factionEmblem(f, 46)}<div><h2>${F.name}</h2><div style="color:var(--dim);font-size:9.5pt">${F.motto}</div></div></div>`;
    const PER = 12;
    for (let i = 0; i < list.length; i += PER) {
      const last = i + PER >= list.length;
      const n = page('Units — ' + F.name, (i === 0 ? head : '') + `<div class="ucards">${list.slice(i, i + PER).map((t) => unitCard(t, f, fcol[f])).join('')}</div>` +
        (last ? `<div class="box note" style="margin-top:4mm"><b>Reading a card:</b> HP health · SPD speed (tiles/s) · RNG range in tiles · DPS damage per second · DMG damage type · ¢ cost (credits · metal) · ⏱ build time.</div>` : ''));
      if (i === 0) toc.push(['Units: ' + F.name, n]);
    }
  }

  // ------------------------------------------------------------------ ORDERS
  const I = WF.ICON; const ic = (k) => `<span style="display:inline-flex;width:6mm;height:6mm;color:var(--gold2);vertical-align:middle">${I[k].replace('width="1em" height="1em"', 'width="100%" height="100%"')}</span>`;
  sec('Orders & Formations', `<h1>Orders &amp; Formations<small>Precise control of every battalion</small></h1>
  <table><tr><th></th><th>Order</th><th>Description</th></tr>
  <tr><td>${ic('stop')}</td><td class="en">STOP</td><td>Cancel all orders immediately.</td></tr>
  <tr><td>${ic('hold')}</td><td class="en">HOLD</td><td>Hold position: units fire at anything in range but do not chase.</td></tr>
  <tr><td>${ic('amove')}</td><td class="en">ATK-MOVE</td><td>Move while engaging any enemy on the way — the ideal attack order.</td></tr>
  <tr><td>${ic('patrol')}</td><td class="en">PATROL</td><td>Patrol back and forth between the current position and a chosen point.</td></tr>
  <tr><td>${ic('retreat')}</td><td class="en">RETREAT</td><td>Fall back to the nearest repair station or HQ (aircraft to the airfield).</td></tr>
  <tr><td>${ic('formation')}</td><td class="en">FORMATION</td><td>Cycle formations: auto, line, column, wedge, box.</td></tr>
  <tr><td>${ic('regroup')}</td><td class="en">REGROUP</td><td>Gather the selected units into a tight formation.</td></tr>
  <tr><td>${ic('queue')}</td><td class="en">QUEUE</td><td>Queue mode: new orders are added after the current ones (draw routes).</td></tr>
  <tr><td>${ic('unload')}</td><td class="en">UNLOAD</td><td>Unload infantry from the amphibious transport at a chosen point.</td></tr>
  <tr><td>${ic('rally')}</td><td class="en">RALLY</td><td>Rally point for new units leaving a factory.</td></tr>
  <tr><td>${ic('strike')}</td><td class="en">LAUNCH</td><td>Launch the strategic missile from the silo when fully charged.</td></tr></table>
  <h2>Formations</h2><ul><li><b>Line:</b> a wide front that brings the most guns to bear at once.</li><li><b>Column:</b> ideal for bridges and narrow passes.</li><li><b>Wedge:</b> a spearhead for breakthroughs with heavy tanks in front.</li><li><b>Box:</b> all-round defense with support and artillery in the middle.</li></ul>
  <p>In any formation other than auto, the group moves at the speed of its slowest unit to stay together; heavy tanks always lead while artillery and support trail behind.</p>`);

  // ------------------------------------------------------------------ TERRAIN & INTEL
  sec('Terrain & Intelligence', `<h1>Terrain &amp; Intelligence<small>Information is half the battle</small></h1>
  ${img('terrain.jpg', 'Rivers, bridges, forests and plateaus: every terrain type changes the tactics')}
  <table><tr><th>Terrain</th><th>Effect</th></tr>
  <tr><td>Grass, dirt and roads</td><td>Normal movement; roads are slightly faster.</td></tr>
  <tr><td>Forests</td><td>Slow vehicles, hide ground units from distant observers, and protect infantry (−30% damage).</td></tr>
  <tr><td>Plateaus</td><td>+20% vision and +12% weapon range for units standing on them.</td></tr>
  <tr><td>Rocks and cliffs</td><td>Impassable, and block direct fire.</td></tr>
  <tr><td>Water</td><td>Ships, hovercraft and amphibians only. Bridges let ground forces cross.</td></tr></table>
  <div class="grid2"><div><h3>Fog of war</h3><p>Unexplored areas are black. Previously explored areas are dimmed and keep faded “ghosts” of the last enemy buildings you saw — they may have been destroyed or changed!</p>
  <h3>Radar</h3><p>The Radar Array shows enemy units in its range as pulsing red blips on the map and minimap, and needs enough power to work.</p></div>
  <div><h3>Stealth and detection</h3><p>Ghost Recon and submarines (and Vortex drones after research) are invisible except within range of detectors — scouts, drones, radar, destroyers and EW rigs — or at the moment they fire.</p>
  <h3>Electronic warfare</h3><p>The Spectre EW rig jams enemies inside its aura: −35% accuracy, −15% range, and it hides friendly units from enemy radar.</p></div></div>`);

  // ------------------------------------------------------------------ RESEARCH
  sec('Research', `<h1>Research<small>Technology makes the difference</small></h1><p>Research happens in the Research Lab (one project per lab at a time). Build more labs to research in parallel.</p>
  <table><tr><th>Research</th><th>Effect</th><th class="num">Cost ¢/m</th><th class="num">Time</th><th>Requires</th></tr>
  ${Object.keys(D.RESEARCH).map((k) => { const r = D.RESEARCH[k]; return `<tr><td class="en" style="color:var(--gold2)">${r.name}${r.faction ? ' ★' : ''}</td><td style="font-size:9pt">${EN_RES[k]}</td><td class="num">${r.cost.c} / ${r.cost.m}</td><td class="num">${r.time}s</td><td style="font-size:8.6pt">${(r.req || []).map((q) => D.RESEARCH[q].name).join(', ') || '—'}</td></tr>`; }).join('')}</table>
  <div class="box tip"><b class="t">Suggested order:</b> Deep Extraction first to boost the economy, then your faction research, then Improved Munitions and the Heavy Armor Program, and the experimental program in the late game.</div>`);

  // ------------------------------------------------------------------ FACTIONS
  const EN_F = {
    aegis: ['A conventional, balanced military coalition. Reliable tanks, artillery and strong defenses.', 'Vehicles 10% cheaper, +15% building HP, and repair stations 50% stronger.', 'Build a solid economy and defend with turrets, then advance with a mixed army supported by supply trucks and a repair station near the front.', 'Citadel mobile fortress'],
    vortex: ['A high-tech force built on drones, stealth and electronic warfare.', '+20% vision, +15% infantry HP, aircraft 15% cheaper, and radar 25% longer.', 'Know everything before your enemy: scout with drones, strike with fast Wraith hover tanks across water, and jam the enemy with EW rigs.', 'Aurora strike platform'],
    iron: ['An industrial heavy war machine: super-heavy armor, siege weapons and fortifications.', '+5% vehicle HP (10% slower), and +30% turret HP.', 'Advance slowly but relentlessly: Mammoth tanks in front, siege mortars behind, and fortify every area you take.', 'Colossus siege walker'],
  };
  sec('The Three Factions', `<h1>The Three Factions<small>Three different ways to wage war</small></h1>
  ${['aegis', 'vortex', 'iron'].map((f) => `<div class="box" style="display:flex;gap:4mm;align-items:flex-start">${WF.factionEmblem(f, 60)}<div><h3 style="margin-top:0">${D.FACTIONS[f].name} — <span style="color:var(--dim);font-size:10pt">${D.FACTIONS[f].motto}</span></h3>
  <p>${EN_F[f][0]}</p><p><b style="color:var(--gold2)">Strengths:</b> ${EN_F[f][1]}</p><p><b style="color:var(--gold2)">Play style:</b> ${EN_F[f][2]}</p><p><b style="color:var(--gold2)">Experimental unit:</b> ${EN_F[f][3]}</p></div></div>`).join('')}`);

  // ------------------------------------------------------------------ AI
  sec('AI Opponents', `<h1>AI Opponents<small>A real AI that plays by the same rules</small></h1>
  <p>The AI does not cheat: it only sees what its team sees through the fog of war and pays the same costs. It builds and expands its economy, scouts, analyses your army composition to produce counters, defends its base, pulls damaged units back for repair, and weighs your defenses before attacking.</p>
  <table><tr><th>Level</th><th>Description</th></tr>
  <tr><td class="en">Recruit</td><td>Beginner: slow decisions, small late attacks, rarely builds counters.</td></tr>
  <tr><td class="en">Veteran</td><td>Experienced: good economy, retreats damaged units, adapts to your army.</td></tr>
  <tr><td class="en">Commander</td><td>Fast reactions, two-pronged flanking attacks and bigger waves.</td></tr>
  <tr><td class="en">Warlord</td><td>The fastest and fiercest, with a +25% income bonus (can be turned off in Settings).</td></tr></table>
  <div class="box tip"><b class="t">How to beat it:</b> raid its extractors early with light tanks, defend chokepoints with turrets and watch its movements on radar. The AI avoids attacking heavily fortified bases — use that to build a bigger economy.</div>`);

  // ------------------------------------------------------------------ CAMPAIGN
  sec('Campaign', `<h1>Campaign: Operation Iron Dawn<small>7 missions for the Aegis Coalition</small></h1>
  ${WF.MISSIONS.map((m, i) => `<div class="mission"><div class="n">${i + 1}</div><div><h3 style="margin:0">${m.name}</h3><p style="margin:0.5mm 0">${EN_MIS[i]}</p><div style="font-size:8.6pt;color:var(--dim)">Map: ${WF.MAPS[m.map].name} · Enemy: ${D.FACTIONS[m.enemy].name}</div></div></div>`).join('')}
  <div class="box note">Each mission unlocks when the previous one is complete, and progress is saved automatically. Campaign difficulty (easy / normal / hard) is chosen on the mission screen.</div>`);

  // ------------------------------------------------------------------ MODES & MAPS
  const mapCards = (ks) => ks.map((k) => `<div class="mapcard"><img src="img/map_${k}.png"><div><h3 style="margin-top:0">${WF.MAPS[k].name}</h3><div style="color:var(--dim);font-size:9pt">${WF.MAPS[k].size} · ${WF.MAPS[k].players} players</div><p>${EN_MAP[k]}</p></div></div>`).join('');
  sec('Skirmish & Maps', `<h1>Skirmish, Sandbox &amp; Maps</h1>
  <div class="grid2"><div><h3>Skirmish</h3><ul><li>Up to 4 players (you and 3 opponents) depending on the map.</li><li>Free-for-all or teams (T1–T4).</li><li>Starting resources: low, normal, high.</li><li>Victory: standard, HQ destruction, total annihilation.</li></ul></div>
  <div><h3>Sandbox</h3><ul><li>Reveal the whole map.</li><li>SPAWN tab: drop any unit for any player.</li><li>+10k resources and instant research unlock.</li><li>Perfect for testing tactics and units.</li></ul></div></div>
  ${mapCards(Object.keys(WF.MAPS).slice(0, 2))}`);
  page('Maps', `<h1>Maps</h1>${mapCards(Object.keys(WF.MAPS).slice(2))}`);

  // ------------------------------------------------------------------ TIPS
  sec('Advanced Tips', `<h1>Tips from Veteran Commanders</h1>
  ${img('naval.jpg', 'Naval and air battles: submarines hunt ships, gunships hunt armor')}
  <div class="grid2"><div><ol>
  <li><b>Economy first:</b> one extra extractor in minute one is worth two tanks at minute five.</li>
  <li><b>Never idle factories:</b> always keep two units queued.</li>
  <li><b>Combined arms:</b> tanks in front, anti-tank infantry behind, artillery at the back, and escorting anti-air.</li>
  <li><b>Use groups:</b> group 1 for the main army, 2 for artillery, 3 for aircraft.</li>
  <li><b>Attack with ATK-MOVE</b>, not a plain move, so your units don't drive past the enemy without fighting.</li></ol></div><div><ol start="6">
  <li><b>High ground:</b> put artillery and turrets on plateaus for extra range.</li>
  <li><b>Forest ambushes:</b> infantry in forests are hidden and protected.</li>
  <li><b>Retreat and repair:</b> a damaged unit pulled back is cheaper than a new one.</li>
  <li><b>Reveal the cloaked:</b> always escort your army with a drone or scout.</li>
  <li><b>The superweapon:</b> the silo draws enemy attention — defend it well and aim it at building clusters.</li></ol></div></div>`);

  // ------------------------------------------------------------------ SETTINGS / FAQ
  sec('Settings & FAQ', `<h1>Settings, Saving &amp; FAQ</h1>
  <div class="grid2"><div><h3>Settings</h3><ul><li>Master, music and effects volume.</li><li>Camera speed, zoom sensitivity and UI scale.</li><li>Graphics quality (low / medium / high), effects level, screen shake and vibration.</li><li>Unit cap (100–300) for weaker devices.</li><li>FPS counter.</li></ul>
  <h3>Saving</h3><ul><li>3 manual save slots from the pause menu.</li><li>Autosave every two minutes and when leaving the app, with a “Continue” button on the main menu.</li><li>Saves are integrity-checked; a corrupted save is safely rejected.</li></ul></div>
  <div><h3>FAQ</h3>
  <p><b>The game is slow on my device?</b> Choose “Low” quality and reduced effects, and lower the unit cap. The game also lowers its render resolution automatically to stay smooth.</p>
  <p><b>I can't build here?</b> Read the red message in the status bar: the spot may be too far from your base, on a forest, or it would block all paths.</p>
  <p><b>My units won't fire?</b> Make sure the target is visible and of a type they can hit (tanks don't attack aircraft).</p>
  <p><b>Why is everything slow?</b> Usually low power — build a power plant.</p>
  <p><b>Do I need internet?</b> No. The game is fully offline.</p></div></div>`);

  // ------------------------------------------------------------------ CREDITS
  sec('Credits', `<h1>Credits</h1>
  <div class="box" style="text-align:center;padding:8mm"><div style="color:var(--dim);letter-spacing:0.2em" class="en">CREATED BY</div><div class="en" style="font-family:BlackOps;font-size:26pt;color:var(--gold2);margin:2mm 0">${AUTHOR}</div><div style="color:var(--dim)">Game design, direction and publishing</div></div>
  <h2>Open source</h2>
  <p>Warfront: Dominion is free and open-source software. The source code is released under the MIT License; you are welcome to study it, modify it and build on it, provided the copyright notice is kept.</p>
  <h2>Assets</h2>
  <ul><li>All graphics, icons, effects, music and sound effects are generated procedurally by the game's own code — no third-party art or audio is used.</li>
  <li>Fonts: Rajdhani (Indian Type Foundry), Black Ops One (The Black-Ops Project Authors) and Tajawal (Boutros International), all under the SIL Open Font License 1.1.</li></ul>
  <div class="box" style="text-align:center;margin-top:10mm"><div class="en" style="font-family:BlackOps;font-size:20pt;color:var(--gold2)">GOOD LUCK, COMMANDER</div></div>`);

  document.getElementById('toc').innerHTML = toc.map(([t, n]) => `<a><span>${t}</span><span class="n">${n}</span></a>`).join('');
  window.MANUAL_READY = true;
})();
