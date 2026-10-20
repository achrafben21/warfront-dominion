/* WARFRONT: DOMINION — game data: armor model, weapons, units, buildings, research, factions.
 * All balance numbers live here (not in logic code). Units: px, px/s, seconds. 1 tile = 32 px. */
(function (WF) {
  'use strict';
  const D = {};

  // ---------------------------------------------------------------- Damage model
  D.ARMOR = ['inf', 'light', 'heavy', 'air', 'bld', 'naval'];
  // multiplier[damageType][armorClass]
  D.DMG = {
    bullet:  { inf: 1.00, light: 0.55, heavy: 0.15, air: 0.45, bld: 0.12, naval: 0.25 },
    ap:      { inf: 0.35, light: 1.00, heavy: 1.25, air: 0.00, bld: 0.70, naval: 1.00 },
    he:      { inf: 1.30, light: 0.80, heavy: 0.45, air: 0.00, bld: 1.20, naval: 0.70 },
    flak:    { inf: 0.50, light: 0.25, heavy: 0.10, air: 1.60, bld: 0.10, naval: 0.15 },
    missile: { inf: 0.55, light: 1.00, heavy: 0.95, air: 1.25, bld: 0.80, naval: 1.10 },
    torpedo: { inf: 0.00, light: 0.00, heavy: 0.00, air: 0.00, bld: 0.40, naval: 1.70 },
    siege:   { inf: 0.80, light: 0.90, heavy: 0.80, air: 0.00, bld: 2.20, naval: 0.90 },
    beam:    { inf: 0.90, light: 1.00, heavy: 1.00, air: 1.00, bld: 0.90, naval: 1.00 },
  };
  D.ARMOR_LABEL = { inf: 'Infantry', light: 'Light armor', heavy: 'Heavy armor', air: 'Aircraft', bld: 'Structure', naval: 'Naval' };

  // ---------------------------------------------------------------- Weapons
  // tg: target domains g=ground, a=air, n=naval. proj: visual/physical projectile type.
  D.WEAPONS = {
    rifle:       { range: 150, rof: 0.9, dmg: 9, type: 'bullet', proj: 'bullet', speed: 900, acc: 0.86, tg: 'gn', snd: 'rifle' },
    mg:          { range: 160, rof: 0.32, dmg: 6, type: 'bullet', proj: 'bullet', speed: 950, acc: 0.82, tg: 'gn', snd: 'mg' },
    mg_aa:       { range: 170, rof: 0.25, dmg: 6, type: 'bullet', proj: 'bullet', speed: 950, acc: 0.8, tg: 'gna', snd: 'mg' },
    at_rocket:   { range: 190, rof: 2.8, dmg: 72, type: 'ap', proj: 'rocket', speed: 280, acc: 0.85, tg: 'gn', snd: 'rocket' },
    light_gun:   { range: 190, rof: 1.4, dmg: 34, type: 'ap', proj: 'shell', speed: 560, acc: 0.88, tg: 'gn', snd: 'cannon_s', recoil: 3 },
    tank_gun:    { range: 210, rof: 2.0, dmg: 72, type: 'ap', proj: 'shell', speed: 600, acc: 0.88, tg: 'gn', snd: 'cannon', recoil: 4 },
    hover_gun:   { range: 205, rof: 1.0, dmg: 42, type: 'beam', proj: 'plasma', speed: 700, acc: 0.92, tg: 'gn', snd: 'plasma', recoil: 2 },
    heavy_gun:   { range: 230, rof: 2.4, dmg: 74, type: 'ap', proj: 'shell', speed: 620, acc: 0.88, tg: 'gn', snd: 'cannon', salvo: 2, salvoDelay: 0.18, recoil: 5 },
    mammoth_gun: { range: 240, rof: 3.0, dmg: 120, type: 'ap', proj: 'shell', speed: 600, acc: 0.86, tg: 'gn', snd: 'cannon_h', salvo: 2, salvoDelay: 0.25, recoil: 6 },
    flak_gun:    { range: 270, rof: 0.45, dmg: 19, type: 'flak', proj: 'flak', speed: 900, acc: 0.85, tg: 'a', splash: 22, snd: 'flak' },
    mlrs:        { range: 400, minRange: 96, rof: 8.5, dmg: 22, type: 'he', proj: 'artyrocket', speed: 300, acc: 1, scatter: 42, tg: 'gn', splash: 36, salvo: 8, salvoDelay: 0.12, indirect: true, snd: 'rocket' },
    howitzer:    { range: 580, minRange: 140, rof: 5.5, dmg: 120, type: 'he', proj: 'artyshell', speed: 420, acc: 1, scatter: 30, tg: 'gn', splash: 58, indirect: true, deploy: true, snd: 'cannon_h' },
    mortar:      { range: 360, minRange: 80, rof: 4.5, dmg: 240, type: 'siege', proj: 'artyshell', speed: 300, acc: 1, scatter: 22, tg: 'g', splash: 64, indirect: true, deploy: true, snd: 'cannon_h' },
    heli_rockets:{ range: 215, rof: 1.6, dmg: 42, type: 'missile', proj: 'rocket', speed: 360, acc: 0.85, tg: 'gn', salvo: 2, salvoDelay: 0.15, snd: 'rocket' },
    aa_missile:  { range: 270, rof: 1.7, dmg: 75, type: 'missile', proj: 'missile', speed: 460, acc: 0.95, tg: 'a', homing: true, ammo: 6, snd: 'missile' },
    bombs:       { range: 40, rof: 0.22, dmg: 150, type: 'he', proj: 'bomb', speed: 0, acc: 1, scatter: 18, tg: 'gn', splash: 70, ammo: 6, bomb: true, snd: 'bomb' },
    boat_gun:    { range: 230, rof: 1.3, dmg: 36, type: 'he', proj: 'shell', speed: 560, acc: 0.86, tg: 'gn', splash: 18, snd: 'cannon_s' },
    ship_missile:{ range: 310, rof: 2.6, dmg: 60, type: 'missile', proj: 'missile', speed: 420, acc: 0.95, tg: 'gna', homing: true, snd: 'missile' },
    naval_gun:   { range: 320, rof: 2.4, dmg: 85, type: 'he', proj: 'shell', speed: 600, acc: 0.85, tg: 'gn', splash: 34, salvo: 2, salvoDelay: 0.2, snd: 'cannon_h', recoil: 4 },
    torpedo:     { range: 270, rof: 3.5, dmg: 190, type: 'torpedo', proj: 'torpedo', speed: 170, acc: 0.95, tg: 'n', snd: 'torpedo' },
    turret_mg:   { range: 220, rof: 0.22, dmg: 8, type: 'bullet', proj: 'bullet', speed: 1000, acc: 0.85, tg: 'gna', snd: 'mg' },
    turret_gun:  { range: 260, rof: 2.0, dmg: 85, type: 'ap', proj: 'shell', speed: 650, acc: 0.9, tg: 'gn', snd: 'cannon', recoil: 4 },
    sam:         { range: 340, rof: 1.5, dmg: 70, type: 'missile', proj: 'missile', speed: 500, acc: 0.95, tg: 'a', homing: true, salvo: 2, salvoDelay: 0.2, snd: 'missile' },
    citadel_gun: { range: 260, rof: 2.2, dmg: 110, type: 'ap', proj: 'shell', speed: 650, acc: 0.9, tg: 'gn', salvo: 2, salvoDelay: 0.2, snd: 'cannon_h', recoil: 5 },
    lance_beam:  { range: 250, rof: 0.9, dmg: 55, type: 'beam', proj: 'plasma', speed: 900, acc: 0.95, tg: 'gna', snd: 'plasma' },
    colossus_gun:{ range: 300, rof: 3.2, dmg: 240, type: 'siege', proj: 'shell', speed: 560, acc: 0.9, tg: 'gn', splash: 52, snd: 'cannon_h', recoil: 8 },
    silo:        { range: 99999, rof: 999, dmg: 1000, type: 'siege', proj: 'nuke', speed: 0, acc: 1, tg: 'gn', splash: 170 },
  };

  // ---------------------------------------------------------------- Units
  // cls: inf|veh|air|naval  move: ground|naval|hover|air  air: heli|jet
  D.UNITS = {
    rifle:      { name: 'Rifle Squad', cls: 'inf', move: 'ground', armor: 'inf', hp: 120, speed: 34, turn: 6, radius: 8, vision: 230, cost: { c: 100, m: 0 }, time: 6, from: 'barracks', weapons: ['rifle'], role: 'Cheap infantry. Strong vs infantry, holds forests.', icon: 'inf' },
    at_team:    { name: 'Lancer AT Team', cls: 'inf', move: 'ground', armor: 'inf', hp: 110, speed: 30, turn: 6, radius: 8, vision: 220, cost: { c: 140, m: 35 }, time: 8, from: 'barracks', weapons: ['at_rocket'], role: 'Anti-armor infantry. Weak vs infantry.', icon: 'at' },
    ghost:      { name: 'Ghost Recon Team', cls: 'inf', move: 'ground', armor: 'inf', hp: 90, speed: 44, turn: 6, radius: 8, vision: 340, cost: { c: 220, m: 40 }, time: 10, from: 'barracks', weapons: ['rifle'], stealth: true, detect: 140, req: ['vortex_cloak'], role: 'Cloaked scouts. Invisible unless detected.', icon: 'ghost' },
    builder:    { name: 'Construction Rig', cls: 'veh', move: 'ground', armor: 'light', hp: 320, speed: 52, turn: 3.5, radius: 11, vision: 220, cost: { c: 250, m: 0 }, time: 10, from: 'hq|factory', builder: true, buildRate: 1, repairRate: 22, role: 'Builds and repairs structures.', icon: 'builder' },
    recon:      { name: 'Pathfinder Scout', cls: 'veh', move: 'ground', armor: 'light', hp: 170, speed: 108, turn: 5, radius: 9, vision: 380, cost: { c: 150, m: 0 }, time: 6, from: 'factory', weapons: ['mg'], detect: 130, role: 'Fast scout with long sight. Detects stealth nearby.', icon: 'recon' },
    light_tank: { name: 'Viper Light Tank', cls: 'veh', move: 'ground', armor: 'light', hp: 350, speed: 78, turn: 3.4, radius: 11, vision: 250, cost: { c: 240, m: 80 }, time: 10, from: 'factory', weapons: ['light_gun'], role: 'Fast raider. Good vs light vehicles.', icon: 'ltank' },
    med_tank:   { name: 'Bastion Battle Tank', cls: 'veh', move: 'ground', armor: 'heavy', hp: 640, speed: 58, turn: 2.6, radius: 13, vision: 250, cost: { c: 400, m: 180 }, time: 15, from: 'factory', weapons: ['tank_gun', 'mg'], role: 'Main battle tank. Backbone of the army.', icon: 'mtank' },
    hover_tank: { name: 'Wraith Hover Tank', cls: 'veh', move: 'hover', armor: 'light', hp: 540, speed: 88, turn: 3.5, radius: 12, vision: 270, cost: { c: 380, m: 160 }, time: 14, from: 'factory', weapons: ['hover_gun'], role: 'Fast amphibious plasma tank. Crosses water.', icon: 'hover' },
    heavy_tank: { name: 'Juggernaut Heavy Tank', cls: 'veh', move: 'ground', armor: 'heavy', hp: 1300, speed: 40, turn: 1.9, radius: 16, vision: 260, cost: { c: 720, m: 360 }, time: 24, from: 'factory', weapons: ['heavy_gun', 'mg'], req: ['heavy_armor'], role: 'Twin-cannon heavy tank. Breaks lines.', icon: 'htank' },
    mammoth:    { name: 'Mammoth Assault Tank', cls: 'veh', move: 'ground', armor: 'heavy', hp: 1700, speed: 34, turn: 1.6, radius: 18, vision: 260, cost: { c: 950, m: 460 }, time: 30, from: 'factory', weapons: ['mammoth_gun', 'mg_aa'], req: ['heavy_armor'], role: 'Super-heavy tank with AA machine gun.', icon: 'mammoth' },
    flak:       { name: 'Skyguard Flak Track', cls: 'veh', move: 'ground', armor: 'light', hp: 300, speed: 62, turn: 3, radius: 11, vision: 300, cost: { c: 260, m: 100 }, time: 11, from: 'factory', weapons: ['flak_gun'], role: 'Mobile anti-aircraft. Shreds air units.', icon: 'flak' },
    mlrs:       { name: 'Tempest Rocket Battery', cls: 'veh', move: 'ground', armor: 'light', hp: 260, speed: 52, turn: 2.6, radius: 12, vision: 240, cost: { c: 380, m: 150 }, time: 15, from: 'factory', weapons: ['mlrs'], role: 'Indirect rocket barrage. Area damage.', icon: 'mlrs' },
    howitzer:   { name: 'Longbow Howitzer', cls: 'veh', move: 'ground', armor: 'light', hp: 300, speed: 40, turn: 2, radius: 13, vision: 230, cost: { c: 520, m: 240 }, time: 20, from: 'factory', weapons: ['howitzer'], req: ['artillery'], role: 'Long-range artillery. Must stop to fire.', icon: 'howitzer' },
    siege:      { name: 'Breacher Siege Mortar', cls: 'veh', move: 'ground', armor: 'heavy', hp: 950, speed: 30, turn: 1.6, radius: 16, vision: 230, cost: { c: 650, m: 340 }, time: 24, from: 'factory', weapons: ['mortar'], req: ['heavy_armor'], role: 'Heavy siege vehicle. Devastates structures.', icon: 'siege' },
    supply:     { name: 'Quartermaster Supply Truck', cls: 'veh', move: 'ground', armor: 'light', hp: 300, speed: 62, turn: 3, radius: 11, vision: 220, cost: { c: 240, m: 40 }, time: 10, from: 'factory', repairAura: { r: 120, hps: 7 }, role: 'Logistics: repairs nearby vehicles in the field.', icon: 'supply' },
    ew:         { name: 'Spectre EW Rig', cls: 'veh', move: 'ground', armor: 'light', hp: 340, speed: 60, turn: 3, radius: 12, vision: 300, cost: { c: 450, m: 120 }, time: 16, from: 'factory', jam: 230, detect: 260, req: ['vortex_cloak'], role: 'Jams enemy weapons (-35% accuracy) and detects stealth.', icon: 'ew' },
    amph:       { name: 'Mako Amphibious Transport', cls: 'veh', move: 'hover', armor: 'light', hp: 420, speed: 74, turn: 3, radius: 13, vision: 240, cost: { c: 300, m: 60 }, time: 12, from: 'factory|shipyard', weapons: ['mg'], transport: 6, role: 'Carries 6 infantry across land and water.', icon: 'amph' },
    drone:      { name: 'Hawkeye Recon Drone', cls: 'air', move: 'air', air: 'heli', armor: 'air', hp: 90, speed: 140, turn: 4, radius: 9, vision: 420, cost: { c: 120, m: 0 }, time: 7, from: 'airfield', detect: 200, role: 'Wide-area scouting and stealth detection.', icon: 'drone' },
    gunship:    { name: 'Harrier Attack Helicopter', cls: 'air', move: 'air', air: 'heli', armor: 'air', hp: 400, speed: 105, turn: 3, radius: 13, vision: 280, cost: { c: 500, m: 100 }, time: 16, from: 'airfield', weapons: ['heli_rockets'], role: 'Hovering rocket gunship. Hunts armor.', icon: 'heli' },
    fighter:    { name: 'Falcon Interceptor', cls: 'air', move: 'air', air: 'jet', armor: 'air', hp: 300, speed: 240, turn: 2.6, radius: 12, vision: 320, cost: { c: 450, m: 100 }, time: 15, from: 'airfield', weapons: ['aa_missile'], req: ['aviation'], role: 'Air superiority jet. Rearms at airfield.', icon: 'fighter' },
    bomber:     { name: 'Thunderhead Bomber', cls: 'air', move: 'air', air: 'jet', armor: 'air', hp: 700, speed: 150, turn: 1.5, radius: 18, vision: 280, cost: { c: 850, m: 220 }, time: 24, from: 'airfield', weapons: ['bombs'], req: ['aviation'], role: 'Carpet-bombs ground targets, then rearms.', icon: 'bomber' },
    patrol:     { name: 'Corsair Patrol Boat', cls: 'naval', move: 'naval', armor: 'naval', hp: 320, speed: 92, turn: 2.6, radius: 13, vision: 280, cost: { c: 260, m: 50 }, time: 10, from: 'shipyard', weapons: ['boat_gun', 'mg_aa'], role: 'Fast patrol craft. Coastal raids.', icon: 'boat' },
    missile_boat:{ name: 'Stinger Missile Boat', cls: 'naval', move: 'naval', armor: 'naval', hp: 300, speed: 86, turn: 2.6, radius: 13, vision: 300, cost: { c: 380, m: 90 }, time: 13, from: 'shipyard', weapons: ['ship_missile'], role: 'Guided missiles vs ships, ground and air.', icon: 'mboat' },
    destroyer:  { name: 'Warden Destroyer', cls: 'naval', move: 'naval', armor: 'naval', hp: 1150, speed: 56, turn: 1.4, radius: 20, vision: 320, cost: { c: 800, m: 240 }, time: 26, from: 'shipyard', weapons: ['naval_gun', 'ship_missile'], detect: 230, role: 'Heavy warship. Sonar detects submarines.', icon: 'destroyer' },
    submarine:  { name: 'Leviathan Submarine', cls: 'naval', move: 'naval', armor: 'naval', hp: 600, speed: 60, turn: 1.8, radius: 15, vision: 260, cost: { c: 650, m: 180 }, time: 22, from: 'shipyard', weapons: ['torpedo'], stealth: true, role: 'Stealthy torpedo boat. Kills ships.', icon: 'sub' },
    citadel:    { name: 'Citadel Mobile Fortress', cls: 'veh', move: 'ground', armor: 'heavy', hp: 4200, speed: 26, turn: 1.0, radius: 26, vision: 320, cost: { c: 2600, m: 900 }, time: 60, from: 'factory', weapons: ['citadel_gun', 'sam', 'mg'], repairAura: { r: 150, hps: 10 }, req: ['experimental'], experimental: true, role: 'Experimental fortress with AA and field repair.', icon: 'citadel' },
    aurora:     { name: 'Aurora Strike Platform', cls: 'air', move: 'air', air: 'heli', armor: 'air', hp: 2400, speed: 70, turn: 1.4, radius: 26, vision: 360, cost: { c: 2400, m: 850 }, time: 55, from: 'airfield', weapons: ['lance_beam', 'lance_beam'], detect: 260, req: ['experimental'], experimental: true, role: 'Experimental hovering beam platform.', icon: 'aurora' },
    colossus:   { name: 'Colossus Siege Walker', cls: 'veh', move: 'ground', armor: 'heavy', hp: 5600, speed: 24, turn: 0.9, radius: 28, vision: 320, cost: { c: 2800, m: 1000 }, time: 65, from: 'factory', weapons: ['colossus_gun', 'mg_aa', 'mg_aa'], req: ['experimental'], experimental: true, role: 'Experimental super-heavy siege walker.', icon: 'colossus' },
  };

  // ---------------------------------------------------------------- Buildings
  // w,h in tiles; power: + produces / - consumes
  D.BUILDINGS = {
    hq:        { name: 'Command HQ', w: 3, h: 3, hp: 4000, power: 20, cost: { c: 3000, m: 1000 }, time: 90, vision: 330, produces: ['builder'], income: { c: 5, m: 1 }, role: 'Command center. Lose all HQs and factories and you lose.', buildable: false },
    extractor: { name: 'Oil Extractor', w: 2, h: 2, hp: 800, power: -5, cost: { c: 300, m: 0 }, time: 14, vision: 200, on: 'oil', income: { c: 8, m: 0 }, role: '+8 credits/s. Must be built on an oil field.' },
    mine:      { name: 'Ore Mine', w: 2, h: 2, hp: 900, power: -5, cost: { c: 260, m: 40 }, time: 14, vision: 200, on: 'ore', income: { c: 0, m: 2.6 }, role: '+2.6 metal/s. Must be built on an ore deposit.' },
    power:     { name: 'Power Plant', w: 2, h: 2, hp: 900, power: 50, cost: { c: 260, m: 0 }, time: 12, vision: 200, role: '+50 power. Low power slows production and weapons.' },
    barracks:  { name: 'Barracks', w: 2, h: 2, hp: 1200, power: -10, cost: { c: 350, m: 0 }, time: 16, vision: 220, produces: ['rifle', 'at_team', 'ghost'], role: 'Trains infantry.' },
    factory:   { name: 'Vehicle Factory', w: 3, h: 3, hp: 2000, power: -20, cost: { c: 700, m: 150 }, time: 26, vision: 240, req: ['power'], produces: ['builder', 'recon', 'light_tank', 'med_tank', 'hover_tank', 'heavy_tank', 'mammoth', 'flak', 'mlrs', 'howitzer', 'siege', 'supply', 'ew', 'amph', 'citadel', 'colossus'], role: 'Produces ground vehicles.' },
    airfield:  { name: 'Airfield', w: 3, h: 3, hp: 1800, power: -25, cost: { c: 800, m: 200 }, time: 28, vision: 260, req: ['lab'], produces: ['drone', 'gunship', 'fighter', 'bomber', 'aurora'], rearm: true, role: 'Produces and rearms aircraft.' },
    shipyard:  { name: 'Shipyard', w: 3, h: 3, hp: 1800, power: -20, cost: { c: 650, m: 150 }, time: 24, vision: 260, req: ['factory'], coastal: true, produces: ['patrol', 'missile_boat', 'destroyer', 'submarine', 'amph'], role: 'Produces naval units. Must touch water.' },
    lab:       { name: 'Research Lab', w: 2, h: 2, hp: 1100, power: -20, cost: { c: 600, m: 150 }, time: 22, vision: 220, req: ['factory'], research: true, role: 'Researches technologies.' },
    repair:    { name: 'Repair Station', w: 2, h: 2, hp: 1000, power: -10, cost: { c: 400, m: 80 }, time: 16, vision: 220, req: ['factory'], repairAura: { r: 110, hps: 24 }, role: 'Repairs nearby units quickly.' },
    radar:     { name: 'Radar Array', w: 2, h: 2, hp: 900, power: -15, cost: { c: 450, m: 60 }, time: 18, vision: 260, req: ['power'], radar: 1100, detect: 240, role: 'Shows enemy movement on the minimap. Detects stealth nearby.' },
    turret_mg: { name: 'Sentinel MG Nest', w: 1, h: 1, hp: 900, armor: 'bld', power: -3, cost: { c: 200, m: 20 }, time: 8, vision: 260, weapons: ['turret_mg'], req: ['barracks'], role: 'Anti-infantry defense. Light AA.' },
    turret_gun:{ name: 'Rampart Cannon', w: 1, h: 1, hp: 1500, power: -6, cost: { c: 400, m: 100 }, time: 14, vision: 280, weapons: ['turret_gun'], req: ['factory'], role: 'Anti-armor defensive cannon.' },
    turret_aa: { name: 'Aegis SAM Site', w: 1, h: 1, hp: 1000, power: -6, cost: { c: 380, m: 80 }, time: 14, vision: 340, weapons: ['sam'], req: ['radar'], role: 'Long-range anti-air missiles.' },
    wall:      { name: 'Fortified Wall', w: 1, h: 1, hp: 1400, power: 0, cost: { c: 40, m: 10 }, time: 3, vision: 64, role: 'Blocks movement. Cheap and tough.' },
    silo:      { name: 'Strategic Missile Silo', w: 2, h: 2, hp: 2500, power: -40, cost: { c: 3000, m: 1200 }, time: 80, vision: 220, req: ['lab'], reqTech: ['experimental'], superweapon: { charge: 240 }, role: 'Superweapon: launches a strategic strike every 4 minutes.' },
  };
  D.BUILD_MENU = ['power', 'extractor', 'mine', 'barracks', 'factory', 'lab', 'radar', 'repair', 'airfield', 'shipyard', 'turret_mg', 'turret_gun', 'turret_aa', 'wall', 'silo'];

  // ---------------------------------------------------------------- Research
  D.RESEARCH = {
    extraction:     { name: 'Deep Extraction', cost: { c: 300, m: 50 }, time: 30, desc: '+25% resource income from extractors and mines.' },
    munitions:      { name: 'Improved Munitions', cost: { c: 350, m: 120 }, time: 35, desc: '+15% weapon damage for all units and turrets.' },
    composite_armor:{ name: 'Composite Armor', cost: { c: 400, m: 150 }, time: 40, desc: '+20% max HP for vehicles and ships.' },
    optics:         { name: 'Advanced Optics', cost: { c: 300, m: 100 }, time: 30, desc: '+15% vision and +8% weapon range.' },
    heavy_armor:    { name: 'Heavy Armor Program', cost: { c: 500, m: 200 }, time: 45, desc: 'Unlocks heavy tanks and siege vehicles.' },
    artillery:      { name: 'Ballistic Computers', cost: { c: 450, m: 150 }, time: 40, desc: 'Unlocks Longbow Howitzer. +10% artillery accuracy.' },
    aviation:       { name: 'Aviation Doctrine', cost: { c: 450, m: 150 }, time: 40, desc: 'Unlocks Interceptors and Bombers.' },
    experimental:   { name: 'Experimental Program', cost: { c: 1200, m: 500 }, time: 90, req: ['heavy_armor', 'munitions'], desc: 'Unlocks the faction experimental unit and Missile Silo.' },
    aegis_logistics:{ name: 'Field Logistics', faction: 'aegis', cost: { c: 400, m: 100 }, time: 35, desc: 'Units slowly self-repair out of combat. Supply aura doubled.' },
    vortex_cloak:   { name: 'Phase Cloak', faction: 'vortex', cost: { c: 450, m: 150 }, time: 40, desc: 'Unlocks Ghost Recon and Spectre EW Rig. Drones become stealthed.' },
    iron_hulls:     { name: 'Reinforced Hulls', faction: 'iron', cost: { c: 400, m: 150 }, time: 35, desc: 'Buildings and turrets +30% HP. Walls cost half.' },
  };

  // ---------------------------------------------------------------- Factions
  D.FACTIONS = {
    aegis: {
      name: 'Aegis Coalition', short: 'AEGIS', motto: 'Hold the line. Move as one.', tagline: 'Balanced combined arms · tough bases · fast repairs',
      desc: 'Conventional combined-arms military. Reliable tanks, artillery and strong defensive works. Vehicles 10% cheaper, buildings +15% HP, repair stations +50%.',
      style: 'angular',
      units: ['builder', 'rifle', 'at_team', 'recon', 'light_tank', 'med_tank', 'heavy_tank', 'flak', 'mlrs', 'howitzer', 'supply', 'amph', 'drone', 'gunship', 'fighter', 'bomber', 'patrol', 'destroyer', 'submarine', 'citadel'],
      mods: { bldHp: 1.15, repairMul: 1.5, vehCost: 0.9 },
      names: {},
    },
    vortex: {
      name: 'Vortex Directorate', short: 'VORTEX', motto: 'See first. Strike once.', tagline: 'Stealth · drones · hover tanks · electronic warfare',
      desc: 'High-tech force of drones, hover tanks, stealth and electronic warfare. +20% vision, +15% infantry HP, aircraft 15% cheaper, radar +25% range.',
      style: 'sleek',
      units: ['builder', 'rifle', 'at_team', 'ghost', 'recon', 'light_tank', 'hover_tank', 'flak', 'mlrs', 'ew', 'amph', 'drone', 'gunship', 'fighter', 'bomber', 'patrol', 'missile_boat', 'submarine', 'aurora'],
      mods: { vision: 1.2, airCost: 0.85, radar: 1.25, infHp: 1.15 },
      names: { rifle: 'Directorate Operatives', light_tank: 'Kestrel Strike Tank', mlrs: 'Swarm Missile Rack', builder: 'Fabricator Drone Rig' },
    },
    iron: {
      name: 'Iron Dominion', short: 'IRON', motto: 'Steel conquers all.', tagline: 'Super-heavy armor · siege guns · fortresses',
      desc: 'Heavy industrial war machine. Super-heavy armor, siege weapons and fortresses. Vehicles +5% HP but 10% slower; turrets +30% HP.',
      style: 'bulky',
      units: ['builder', 'rifle', 'at_team', 'recon', 'med_tank', 'heavy_tank', 'mammoth', 'siege', 'flak', 'mlrs', 'howitzer', 'supply', 'amph', 'drone', 'gunship', 'bomber', 'patrol', 'destroyer', 'colossus'],
      mods: { vehHp: 1.05, vehSpeed: 0.9, turretHp: 1.3 },
      names: { rifle: 'Conscript Battalion', med_tank: 'Anvil Battle Tank', heavy_tank: 'Hammer Heavy Tank', recon: 'Warden Armored Car', builder: 'Foundry Crawler' },
    },
  };

  // Team colors (index = team slot). Distinct, colorblind-friendly-ish.
  D.TEAM_COLORS = [
    { name: 'Blue', main: '#3d8bff', dark: '#1f4f9e', light: '#9cc7ff' },
    { name: 'Red', main: '#e8443a', dark: '#8f201a', light: '#ffa29b' },
    { name: 'Gold', main: '#e8b323', dark: '#8a6510', light: '#ffe08a' },
    { name: 'Green', main: '#3cc46b', dark: '#1d6e38', light: '#a3ecbc' },
  ];

  D.AI_LEVELS = [
    { id: 'easy', name: 'Recruit', think: 3.0, apm: 0.5, waveMin: 6, aggression: 0.5, counter: 0.2, micro: false, income: 1.0, expand: 0.5 },
    { id: 'normal', name: 'Veteran', think: 1.8, apm: 1, waveMin: 9, aggression: 0.75, counter: 0.6, micro: true, income: 1.0, expand: 0.8 },
    { id: 'hard', name: 'Commander', think: 1.0, apm: 2, waveMin: 12, aggression: 1.0, counter: 0.9, micro: true, income: 1.0, expand: 1.0 },
    { id: 'brutal', name: 'Warlord', think: 0.6, apm: 4, waveMin: 14, aggression: 1.2, counter: 1.0, micro: true, income: 1.25, expand: 1.0 },
  ];

  D.STARTING_RES = { low: { c: 1200, m: 300 }, normal: { c: 2500, m: 700 }, high: { c: 6000, m: 2000 } };

  /** Resolve a unit type for a faction (applies faction name + mods). Cached. */
  const cache = {};
  D.unitFor = function (type, faction) {
    const key = type + '|' + faction;
    if (cache[key]) return cache[key];
    const base = D.UNITS[type];
    const f = D.FACTIONS[faction] || D.FACTIONS.aegis;
    const u = Object.assign({}, base, { type });
    u.cost = Object.assign({}, base.cost);
    if (f.names[type]) u.name = f.names[type];
    const m = f.mods;
    if (u.cls === 'veh' && m.vehHp) u.hp = Math.round(u.hp * m.vehHp);
    if (u.cls === 'veh' && m.vehSpeed) u.speed = u.speed * m.vehSpeed;
    if (m.vision) u.vision = Math.round(u.vision * m.vision);
    if (u.cls === 'inf' && m.infHp) u.hp = Math.round(u.hp * m.infHp);
    if (u.cls === 'veh' && m.vehCost) { u.cost.c = Math.round(u.cost.c * m.vehCost); u.cost.m = Math.round(u.cost.m * m.vehCost); }
    if (u.cls === 'air' && m.airCost) { u.cost.c = Math.round(u.cost.c * m.airCost); u.cost.m = Math.round(u.cost.m * m.airCost); }
    if (faction === 'iron' && type === 'rifle') { u.cost.c = 80; u.hp = 130; }
    return (cache[key] = u);
  };
  D.bldFor = function (type, faction) {
    const key = 'B' + type + '|' + faction;
    if (cache[key]) return cache[key];
    const base = D.BUILDINGS[type];
    const f = D.FACTIONS[faction] || D.FACTIONS.aegis;
    const b = Object.assign({}, base, { type });
    b.cost = Object.assign({}, base.cost);
    if (f.mods.bldHp) b.hp = Math.round(b.hp * f.mods.bldHp);
    if (b.weapons && f.mods.turretHp) b.hp = Math.round(b.hp * f.mods.turretHp);
    if (b.radar && f.mods.radar) b.radar = Math.round(b.radar * f.mods.radar);
    if (b.repairAura && f.mods.repairMul) b.repairAura = { r: b.repairAura.r, hps: b.repairAura.hps * f.mods.repairMul };
    if (faction === 'aegis' && type === 'turret_aa') b.name = 'Aegis SAM Site';
    if (faction === 'vortex' && type === 'turret_aa') b.name = 'Halo SAM Array';
    if (faction === 'iron' && type === 'turret_aa') b.name = 'Bulwark Flak Tower';
    return (cache[key] = b);
  };
  D.canProduce = function (faction, unitType) { return (D.FACTIONS[faction] || D.FACTIONS.aegis).units.indexOf(unitType) >= 0; };

  WF.D = D;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
