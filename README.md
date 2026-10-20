# WARFRONT: DOMINION

An original real-time strategy war game for Android (landscape phones and tablets), playable fully offline against AI.
Build bases, run a three-resource economy, research technology and command large combined-arms armies across land, sea and air.

- **Install:** copy `dist/WarfrontDominion.apk` to an Android 7.0+ device and open it (allow "install unknown apps" for your file manager or browser when asked).
- **Play in a browser (desktop or phone):** open `game/index.html`. Mouse/keyboard and touch are both supported.

- **Player manual (Arabic, 26 pages):** `dist/WarfrontDominion_Manual_AR.pdf`, generated from the live game data by `tools/manual/manual.html` (unit/building/research stats are always in sync with `data.js`).

## Version 2.0 — what changed

- **New art engine** (`art.js`, `art_units.js`, `art_bld.js`, `art_terrain.js`): supersampled sprites with directional lighting, bevels, panel lines and soft blurred shadows; per-faction camouflage (woodland / digital / rust); animated tank tracks; turrets with cast shadows and rings; extruded pseudo-3D buildings with concrete pads, emblems, blinking lights and smoke stacks.
- **Natural terrain:** tileable material textures blended through smoothed, domain-warped masks; soft shorelines with foam and wave crests; relief shading for plateaus; real oriented bridges; dense tree, conifer, boulder and bush props.
- **Effects:** ground light from explosions, embers, shockwaves, foam wakes behind ships, screen vignette.
- **UI:** hand-drawn SVG icon set (`icons.js`), faction emblems, rendered unit/building portraits in the selection panel and build menus, tactical panels with gold corner brackets, bundled Rajdhani and Black Ops One fonts (SIL OFL).
- Twin Rivers bridge moved for a cleaner river crossing (connectivity re-validated).
- Re-tested: 44/44 simulation tests, 28/28 browser E2E checks, 15 full AI-vs-AI matches; APK v2.0.0 (versionCode 2) verified with androguard and aapt2.

---

## What is in the game

| Area | Implemented |
|---|---|
| Factions | **Aegis Coalition** (balanced combined arms, +15% building HP, stronger repairs), **Vortex Directorate** (stealth, drones, hover tanks, EW; +20% vision, cheaper aircraft, longer radar), **Iron Dominion** (super-heavy armor, siege, fortresses; tougher vehicles and turrets, slower) — each with its own roster, unit names, faction research and visual style |
| Units (28 types) | Rifle, anti-tank and cloaked recon infantry; construction rigs; scout cars; light / main battle / hover / heavy / super-heavy tanks; flak tracks; rocket artillery; howitzers; siege mortar; supply truck (field repair); EW rig (jamming + detection); amphibious transport (carries 6 infantry); recon drone; attack helicopter; interceptor jet; bomber; patrol boat; missile boat; destroyer (sonar); submarine (stealth); 3 faction experimentals |
| Structures (16 types) | HQ, oil extractor, ore mine, power plant, barracks, vehicle factory, airfield (rearms jets), shipyard (coastal), research lab, repair station, radar array, MG nest, cannon turret, SAM site, walls, strategic missile silo (superweapon) |
| Economy | Credits (oil), Metal (ore), Power grid. Low power slows production, research, extraction and turret fire, and switches radar off. Costs are paid up-front and refunded on cancel; resources can never go negative. |
| Combat | Projectile simulation (bullets, shells, rockets, homing missiles, artillery arcs, bombs, torpedoes, plasma), 8 damage types × 6 armor classes, accuracy and misses, splash with falloff, min/max ranges, line of sight past cliffs, turret rotation and recoil, salvoes, ammo + rearming for jets |
| Terrain | Grass, dirt, roads, forests (concealment + infantry cover + slow), cliffs (block movement and direct fire), hills (+vision, +range), rivers, sea, shallows, bridges, beaches |
| Intelligence | Fog of war with explored memory and faded "last known" enemy structures, radar blips, stealth units revealed only by detectors or when they fire, EW jamming (-35% enemy accuracy, -15% range, hides from radar) |
| Orders | Move, attack, attack-move, patrol, stop, hold position, retreat (to repair/HQ), regroup, guard leash, repair, build, load/unload, rally points, command queue, 5 formations (auto, line, column, wedge, box), 5 control groups |
| AI | 4 levels (Recruit, Veteran, Commander, Warlord). Builds and expands its economy, scouts, researches, counters your composition, defends its base, launches attack waves (two-pronged flanking on higher levels), retreats damaged units for repair, repairs buildings, uses bombers, fighters, navy and the superweapon. Plays under the same fog and rules as you; only Warlord gets a documented +25% income bonus (can be turned off in Settings). |
| Modes | **Campaign** "Operation Iron Dawn" (7 missions: establish a base, hold against waves, rescue, capture zones, destroy artillery, escort a convoy, defeat a fortified warlord), **Skirmish** (5 maps, up to 4 players, FFA or teams, 3 victory conditions, starting resources), **Sandbox** (reveal map, spawn any unit for any player, instant cash/research) |
| Maps | Twin Rivers, Iron Pass, Archipelago Front, Highland Crossroads (4 players), Ashen Plains — handcrafted, mirrored for fairness, connectivity-validated |
| Saves | 3 manual slots + autosave (every 2 minutes and whenever the app is backgrounded), integrity-checked (hash) and version-checked, atomic file writes on Android; campaign progress and settings persist |
| Presentation | All art, effects, icons and sound are procedurally generated by the game's own code (no third-party assets). Particle explosions, smoke, muzzle flashes, tracers, wakes, scorch marks, wrecks, rubble, damage smoke/fire, animated radar/pumps/rotors, screen shake. Procedural music and sound effects with master/music/effects volume. |
| Mobile UX | Tap select / smart orders, drag pan with inertia, pinch zoom, long-press box select (or ▢ toggle), double-tap select-all-of-type, minimap navigation, build placement with confirm button, under-attack alerts with tap-to-jump, adjustable camera speed, zoom sensitivity and UI scale, Android back button, immersive fullscreen, adaptive render resolution to hold frame-rate on weak devices |

## Controls

**Touch:** tap unit = select · tap ground = move · tap enemy = attack · drag = pan · pinch = zoom · long-press then drag = box select · double-tap unit = all of that type on screen · two-finger tap = deselect · group buttons: long-press = assign, tap = select, double-tap = jump camera.

**Mouse/keyboard:** left click/drag select, right click order, wheel zoom, arrows/screen edges pan, Ctrl+1–5 / 1–5 groups, A attack-move, S stop, H hold, P patrol, R retreat, F formation, B build, Space jump to HQ, Esc pause.

## Project layout

```
game/                 The complete game (HTML5 canvas + JavaScript, no dependencies)
  index.html, css/    UI
  js/util.js          math, deterministic RNG, spatial hash, heap
  js/data.js          ALL balance data: weapons, armor table, units, buildings, research, factions, AI levels
  js/map.js           terrain, 5 handcrafted maps, A* pathfinding, line of sight
  js/sim_core.js      world state, economy, construction, production, research, fog, commands, victory, save/load
  js/sim_units.js     orders, formations, steering, combat, projectiles
  js/ai.js            AI commander
  js/campaign.js      campaign missions
  js/art.js           procedural sprites, icons and terrain
  js/render.js        renderer, effects, fog overlay, minimap
  js/audio.js         procedural audio and music
  js/input.js hud.js menus.js storage.js main.js   interface and app shell
  tests/              automated tests (not packaged into the APK)
android/
  src/.../MainActivity.java   native shell: fullscreen WebView + atomic file-save bridge
  icon.png                    launcher icon (rendered from the game's own art)
  gradle-project/             equivalent standard Android Studio / Gradle project (see below)
tools/
  build_apk.py        self-contained APK builder (manifest/resources encoder, dex, zip-align, v2 signing)
  verify_apk.py       independent APK verification
dist/WarfrontDominion.apk
```

The simulation (`util`, `data`, `map`, `sim_*`, `ai`, `campaign`) has no DOM access and runs identically in Node. All player and AI actions go through `world.command(playerId, cmd)`, a validated command stream with a fixed 20 Hz deterministic tick — the boundary a future lockstep multiplayer layer would use. Multiplayer itself is **not** implemented.

## Building the APK

The build machine used for this release had no Android SDK, so `tools/build_apk.py` implements the needed steps itself:

```
# requirements: Python 3 with `cryptography` and `Pillow`, a JDK (javac/java),
# android.jar (API 33) and the `dx` dexer (built from AOSP dalvik/dx sources)
ANDROID_JAR=/path/to/android.jar DX_JAR=/path/to/dx.jar python3 tools/build_apk.py
```

It produces `dist/WarfrontDominion.apk` (minSdk 24 / targetSdk 33, signed with APK Signature Scheme v2). The signing key is created on first build in `android/keys/` — **keep it**: Android only installs updates signed with the same key.

**Alternative (standard toolchain):** `android/gradle-project` is a normal Android Studio project with the same manifest and activity. Open it in Android Studio (or run `gradle assembleRelease` with an SDK installed); a Gradle task copies `game/` into the APK assets automatically. This project was *not* built here (no SDK available), so treat it as a convenience starting point.

## Testing

```
node game/tests/sim.test.js        # 44 simulation tests
node game/tests/ai_matches.js      # full AI-vs-AI matches on every map
python3 game/tests/e2e.py          # 28 UI checks in headless Chromium with touch input (needs Playwright)
python3 tools/verify_apk.py dist/WarfrontDominion.apk   # needs androguard
aapt2 dump badging dist/WarfrontDominion.apk            # Android's own parser
```

See `TESTING.md` for what was verified in this release and the known limitations.
