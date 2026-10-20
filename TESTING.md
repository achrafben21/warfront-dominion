# Test report — WARFRONT: DOMINION v1.0.0

All results below were actually executed for this release.

## Automated

| Suite | Result |
|---|---|
| `node game/tests/sim.test.js` — economy transactions, refunds, no negative resources, construction prerequisites, placement validation (terrain, deposits, territory, route-sealing), single completion events, production timing/caps/tech gates, research, armor multipliers, weapon ranges, air/ground targeting rules, fog-limited targeting, stealth detection, splash radius, artillery min range, river/bridge pathing, land/water movement rules, choke-point congestion (24 units), aircraft over cliffs, transports, repair, superweapon, save/load round-trip, corrupted/tampered save rejection, determinism, 3 victory modes, team victory, AI economy/army/research, AI income-bonus switch, all 7 campaign missions (setup, run, save/restore), mission objective completion | **44 / 44 passed** |
| `python3 game/tests/e2e.py` — headless Chromium, 844×390 phone landscape, touch input: menus, skirmish setup, tap-select, build drawer, placement + confirm, construction, HQ production, tap-to-move, one-finger pan, pinch zoom, long-press box select, attack-move button, group assign, minimap navigation, pause, save to slot, load from slot, portrait/landscape resize, victory screen, campaign briefing + objectives, defeat screen, settings persistence, zero JS errors | **28 / 28 passed** |
| `node game/tests/ai_matches.js` — 15 full AI-vs-AI matches (Commander level) on all 5 maps incl. a 4-player FFA | All matches ran without errors or negative resources; most end in 14–40 min, a few long defensive matches hit the 45-min cap. 18-match faction sweep after balancing: Aegis 7, Iron 5, Vortex 4, 2 draws. |
| Campaign playability (AI plays the player side) | Missions 1, 2 and 5 completed; the finale (7) is hard — the AI-player destroyed the Colossus but lost its base, which is intended for the last mission. |
| APK — `tools/verify_apk.py` (androguard) | Manifest, launcher activity, SDK levels, label, icon resource, dex classes, v2 signature digest + RSA check, zip integrity, 4-byte alignment: **all passed** |
| APK — `aapt2 dump badging / xmltree / resources` (Android's own tool, from Apktool's prebuilt) | Parses package, activity, icons for 5 densities, landscape feature |

Performance (headless Chromium, software rendering, 1688×780 px): simulation ≈ 2.4 ms/tick with 370 units; frame render 16–22 ms in a 300-unit battle. Phones render on the GPU and the game automatically lowers its render resolution if the frame-rate drops below ~27 fps.

## Not verified

- **The APK has not been run on a physical Android device or emulator** — none was available in the build environment. The package structure, signature and manifest were validated with two independent parsers, and the game itself was tested in Chromium (the same engine as Android's WebView), but install/launch on hardware is unconfirmed.
- The Gradle project in `android/gradle-project` was not built (no Android SDK available).

## Known limitations

- Multiplayer is not implemented (architecture is command-stream based to allow it later).
- Transports carry infantry only; air transports are not included.
- Visuals are procedural 2D vector art, not hand-painted sprites.
- AI does not use amphibious transports and only lightly uses naval units on mixed maps.
- Maps are handcrafted (5); there is no procedural map generator or map editor.
- Requires Android 7.0+ with an up-to-date Android System WebView (standard on Play-enabled devices).
