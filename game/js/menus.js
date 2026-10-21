/* WARFRONT: DOMINION — menus and screens: main, skirmish, sandbox, campaign, briefing, settings,
 * save/load, help, loading, pause, game over, dialogs. */
(function (WF) {
  'use strict';
  const D = WF.D, U = WF.U, Store = WF.Store, ART = WF.ART;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TIPS = [
    'Long-press and drag on the battlefield to box-select units.',
    'Double-tap a unit to select every unit of that type on screen.',
    'Long-press a group button to assign the current selection to it.',
    'Units in forests are concealed and infantry take less damage there.',
    'Hills extend vision and weapon range.',
    'Radar Arrays reveal enemy movement on the minimap and detect cloaked units nearby.',
    'Artillery cannot fire at targets that are too close — protect it with tanks.',
    'Low power slows production, research and turret fire rate.',
    'Anti-tank infantry is cheap and deadly against armour, but weak against infantry.',
    'Supply Trucks and Repair Stations heal units that are not under fire.',
    'Jets rearm automatically at an Airfield after spending their ammunition.',
    'Attack-move makes units engage anything they meet on the way.',
  ];

  class Menus {
    constructor(G) { this.G = G; this.root = $('screens'); this.stack = []; this.mapPrev = {}; this.cfg = null; }
    isOpen() { return this.root.children.length > 0 || !$('modal').classList.contains('hidden'); }
    clear() { this.root.innerHTML = ''; }
    screen(cls, html) { this.clear(); const d = document.createElement('div'); d.className = 'screen ' + cls; d.innerHTML = html; this.root.appendChild(d); return d; }
    click(el, fn) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; this.G.audioInit(); this.G.audio.ui('click'); fn(b.dataset.a, b, e); }); }
    back() {
      if (!$('modal').classList.contains('hidden')) { if (this.G.running && this.G.paused && this.modalKind === 'pause') { this.G.togglePause(); } else if (this.modalKind === 'pause-sub') this.pauseMenu(); else this.closeModal(); return true; }
      if (this.root.children.length && this.current && this.current !== 'main' && this.current !== 'loading' && this.current !== 'gameover') { this.showMain(); return true; }
      return false;
    }

    // ------------------------------------------------------------ main menu
    showMain() {
      this.current = 'main';
      const camp = Store.getJSON('campaign', { unlocked: 0, done: {} });
      const hasAuto = !!Store.get('save_auto');
      const I = WF.ICON;
      const MB = (a, icon, title, sub) => `<button class="mbtn" data-a="${a}"><span class="mi">${I[icon]}</span><span class="mt">${title}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
      const el = this.screen('menu-main', `
        <div class="logowrap"><svg class="logomark" viewBox="0 0 64 64"><defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#a87c1c"/></linearGradient></defs><path d="M32 3l25 9v19c0 15-10.5 24.5-25 30C17.5 55.5 7 46 7 31V12z" fill="#151c16" stroke="url(#lg1)" stroke-width="3"/><path d="M32 12l18 6.5v12.5c0 10.5-7.5 17-18 21-10.5-4-18-10.5-18-21V18.5z" fill="none" stroke="rgba(232,184,74,0.35)" stroke-width="1.5"/><path d="M20 38l12-16 12 16" fill="none" stroke="url(#lg1)" stroke-width="4" stroke-linejoin="round"/><path d="M24 45l8-10 8 10" fill="none" stroke="url(#lg1)" stroke-width="3" stroke-linejoin="round"/></svg>
        <div class="logo"><div>Warfront<span>Dominion <i class="v2badge">v2</i></span></div></div></div>
        <div class="tag">Real-time strategy · Three factions · Fully offline</div>
        <div class="mgrid">${hasAuto ? MB('continue', 'play2', 'Continue', 'Resume your last autosaved battle') : ''}
        ${MB('campaign', 'flag', 'Campaign', 'Operation Iron Dawn — ' + Object.keys(camp.done).length + '/' + WF.MISSIONS.length + ' missions')}
        ${MB('skirmish', 'sword', 'Skirmish', 'Battle up to 3 AI commanders')}
        ${MB('sandbox', 'sandbox', 'Sandbox', 'Experiment with every unit and system')}
        ${MB('load', 'load', 'Load Game', '')}
        ${MB('settings', 'settings', 'Settings', '')}
        ${MB('help', 'book', 'Field Manual', '')}</div>
        <div class="ver">v${this.G.VERSION} · ${Store.native ? 'Android' : 'Web'} build · Created by <b class="author">Achraf Benhachem</b></div>`);
      this.click(el, (a) => {
        if (a === 'continue') this.tryLoad('auto');
        else if (a === 'campaign') this.campaign();
        else if (a === 'skirmish') this.skirmish(false);
        else if (a === 'sandbox') this.skirmish(true);
        else if (a === 'load') this.loadMenu(false);
        else if (a === 'settings') this.settings(false);
        else if (a === 'help') this.help();
      });
    }

    tryLoad(slot) {
      try { this.G.loadGame(slot); }
      catch (e) { this.alert('Could not load save: ' + e.message); }
    }

    // ------------------------------------------------------------ skirmish setup
    mapPreview(id) {
      if (this.mapPrev[id]) return this.mapPrev[id];
      const m = WF.buildMap(id, 1); const base = ART.minimapBase(m);
      const c = document.createElement('canvas'); c.width = 180; c.height = 120; const g = c.getContext('2d');
      g.fillStyle = '#05080a'; g.fillRect(0, 0, 180, 120);
      const sc = Math.min(180 / base.width, 120 / base.height); const w = base.width * sc, h = base.height * sc;
      g.drawImage(base, (180 - w) / 2, (120 - h) / 2, w, h);
      m.spawns.forEach((s, i) => { g.fillStyle = D.TEAM_COLORS[i].main; g.beginPath(); g.arc((180 - w) / 2 + s.tx * 2 * sc, (120 - h) / 2 + s.ty * 2 * sc, 5, 0, 7); g.fill(); g.strokeStyle = '#000'; g.stroke(); });
      const url = c.toDataURL(); this.mapPrev[id] = url; return url;
    }
    skirmish(sandbox) {
      this.current = 'skirmish';
      const last = Store.getJSON(sandbox ? 'last_sandbox' : 'last_skirmish', null);
      const c = this.cfg = last || { map: sandbox ? 'ashen_plains' : 'twin_rivers', res: sandbox ? 'high' : 'normal', victory: 'standard', players: [{ name: 'You', faction: 'aegis', team: 0, color: 0, ai: null }, { name: 'AI 1', faction: 'iron', team: 1, color: 1, ai: sandbox ? 'none' : 'normal' }] };
      c.sandbox = sandbox; c.reveal = sandbox ? (c.reveal !== false) : false;
      const render = () => {
        const maxP = WF.MAPS[c.map].players; while (c.players.length > maxP) c.players.pop();
        const fac = (sel, attr) => Object.keys(D.FACTIONS).map((f) => `<button class="${sel === f ? 'on' : ''}" data-a="${attr}:${f}">${D.FACTIONS[f].short}</button>`).join('');
        const ai = (sel, i) => [['none', 'Passive'], ...D.AI_LEVELS.map((l) => [l.id, l.name])].filter((x) => x[0] !== 'none' || sandbox).map(([k, n]) => `<button class="${sel === k ? 'on' : ''}" data-a="ai:${i}:${k}">${n}</button>`).join('');
        const el = this.screen('page dim', `
          <h2><button class="btn back" data-a="back">‹ Back</button>${sandbox ? 'Sandbox' : 'Skirmish'}</h2>
          <div class="body"><div class="cols">
            <div class="col" style="flex:1.3">
              <div class="label">Battlefield</div>
              <div class="cards">${Object.keys(WF.MAPS).map((id) => `<button class="card ${c.map === id ? 'on' : ''}" data-a="map:${id}"><img src="${this.mapPreview(id)}" alt=""><b>${esc(WF.MAPS[id].name)}</b><span>${WF.MAPS[id].size} · ${WF.MAPS[id].players} players<br>${esc(WF.MAPS[id].desc)}</span></button>`).join('')}</div>
            </div>
            <div class="col">
              <div class="label">Your faction</div>
              <div class="cards">${Object.keys(D.FACTIONS).map((f) => `<button class="card ${c.players[0].faction === f ? 'on' : ''}" data-a="myfac:${f}" title="${esc(D.FACTIONS[f].desc)}"><span class="emb">${WF.factionEmblem(f, 30)}</span><b style="color:var(--acc)">${esc(D.FACTIONS[f].name)}</b><span><i>${esc(D.FACTIONS[f].motto)}</i><br>${esc(D.FACTIONS[f].tagline)}</span></button>`).join('')}</div>
              <div class="label">Opponents & teams</div>
              ${c.players.slice(1).map((p, k) => { const i = k + 1; return `<div class="slot"><span class="sw" style="background:${D.TEAM_COLORS[p.color].main}"></span><b>${esc(p.name)}</b><div class="seg">${fac(p.faction, 'fac:' + i)}</div><div class="seg">${ai(p.ai || 'normal', i)}</div><div class="seg">${[0, 1, 2, 3].map((t) => `<button class="${p.team === t ? 'on' : ''}" data-a="team:${i}:${t}">T${t + 1}</button>`).join('')}</div>${i > 1 ? `<button class="btn danger" data-a="rem:${i}">✕</button>` : ''}</div>`; }).join('')}
              ${c.players.length < maxP ? '<button class="btn" data-a="add">+ Add opponent</button>' : ''}
              <div class="row"><span>Your team</span><div class="seg">${[0, 1, 2, 3].map((t) => `<button class="${c.players[0].team === t ? 'on' : ''}" data-a="team:0:${t}">T${t + 1}</button>`).join('')}</div></div>
              <div class="row"><span>Starting resources</span><div class="seg">${['low', 'normal', 'high'].map((r) => `<button class="${c.res === r ? 'on' : ''}" data-a="res:${r}">${r}</button>`).join('')}</div></div>
              <div class="row"><span>Victory condition</span><div class="seg">${[['standard', 'Standard'], ['hq', 'Destroy HQ'], ['annihilation', 'Annihilation']].map(([k, n]) => `<button class="${c.victory === k ? 'on' : ''}" data-a="vic:${k}">${n}</button>`).join('')}</div></div>
              ${sandbox ? `<div class="row"><span>Reveal map</span><div class="seg"><button class="${c.reveal ? 'on' : ''}" data-a="rev:1">On</button><button class="${!c.reveal ? 'on' : ''}" data-a="rev:0">Off</button></div></div>` : ''}
              <div style="font-size:.72em;color:var(--dim);margin-top:6px">Warlord AI receives a +25% income bonus (can be disabled in Settings). All other levels play with exactly your economy.</div>
            </div>
          </div></div>
          <div class="footer"><button class="btn pri" data-a="start">Deploy ▸</button></div>`);
        this.click(el, (a) => {
          const [k, x, y] = a.split(':');
          if (k === 'back') return this.showMain();
          if (k === 'map') c.map = x;
          if (k === 'myfac') c.players[0].faction = x;
          if (k === 'fac') c.players[+x].faction = y;
          if (k === 'ai') c.players[+x].ai = y;
          if (k === 'team') c.players[+x].team = +y;
          if (k === 'res') c.res = x;
          if (k === 'vic') c.victory = x;
          if (k === 'rev') c.reveal = x === '1';
          if (k === 'rem') c.players.splice(+x, 1);
          if (k === 'add') { const i = c.players.length; c.players.push({ name: 'AI ' + i, faction: Object.keys(D.FACTIONS)[i % 3], team: i, color: i, ai: 'normal' }); }
          if (k === 'start') {
            const teams = new Set(c.players.map((p) => p.team)); if (teams.size < 2) { this.alert('At least two different teams are required.'); return; }
            c.players.forEach((p, i) => { p.color = i; if (p.ai === 'none') p.ai = null; if (i > 0 && p.ai == null && !sandbox) p.ai = 'normal'; });
            Store.setJSON(sandbox ? 'last_sandbox' : 'last_skirmish', c);
            const cfg = JSON.parse(JSON.stringify(c)); cfg.players.forEach((p, i) => { if (i > 0 && sandbox && !p.ai) p.ai = null; });
            this.G.newSkirmish(cfg); return;
          }
          render();
        });
      };
      // passive AI in sandbox stored as 'none'
      c.players.forEach((p, i) => { if (i > 0 && !p.ai) p.ai = sandbox ? 'none' : 'normal'; });
      render();
    }

    // ------------------------------------------------------------ campaign
    campaign() {
      this.current = 'campaign';
      const camp = Store.getJSON('campaign', { unlocked: 0, done: {} });
      const el = this.screen('page dim', `
        <h2><button class="btn back" data-a="back">‹ Back</button>Operation Iron Dawn</h2>
        <div class="body">
          <div style="font-size:.85em;color:var(--dim);margin-bottom:8px">Aegis Coalition campaign. Each mission introduces new systems. Difficulty:
            <span class="seg">${D.AI_LEVELS.slice(0, 3).map((l) => `<button class="${this.G.settings.campaignDiff === l.id ? 'on' : ''}" data-a="diff:${l.id}">${l.name}</button>`).join('')}</span></div>
          ${WF.MISSIONS.map((m, i) => `<button class="mission ${i > camp.unlocked ? 'locked' : ''}" data-a="m:${i}"><div class="n">${i + 1}</div><div><b>${esc(m.name)}</b><span>${esc(WF.MAPS[m.map].name)} · vs ${esc(D.FACTIONS[m.enemy].name)} — ${esc(m.objectives.map((o) => o.text).join(' · '))}</span></div><div class="st">${camp.done[m.id] ? '✓ Complete' : i > camp.unlocked ? '🔒' : ''}</div></button>`).join('')}
        </div>`);
      this.click(el, (a) => {
        const [k, x] = a.split(':');
        if (k === 'back') return this.showMain();
        if (k === 'diff') { this.G.settings.campaignDiff = x; Store.saveSettings(this.G.settings); return this.campaign(); }
        if (k === 'm') { if (+x > camp.unlocked) { this.alert('Complete the previous mission to unlock this one.'); return; } this.briefing(+x); }
      });
    }
    briefing(idx) {
      this.current = 'briefing';
      const m = WF.MISSIONS[idx];
      const el = this.screen('page dim', `
        <h2><button class="btn back" data-a="back">‹ Missions</button>Mission ${idx + 1}: ${esc(m.name)}</h2>
        <div class="body"><div class="cols"><div class="col" style="flex:2"><div class="brief">${esc(m.briefing)}</div></div>
        <div class="col"><img src="${this.mapPreview(m.map)}" style="width:100%;border-radius:8px"><div class="label">Objectives</div>${m.objectives.map((o) => `<div style="font-size:.85em;margin:3px 0">◇ ${esc(o.text)}</div>`).join('')}
        <div class="label">Forces</div><div style="font-size:.82em">${esc(D.FACTIONS[m.faction].name)} vs ${esc(D.FACTIONS[m.enemy].name)}</div></div></div></div>
        <div class="footer"><button class="btn pri" data-a="go">Begin Mission ▸</button></div>`);
      this.click(el, (a) => { if (a === 'back') this.campaign(); else if (a === 'go') this.G.startMission(idx); });
    }

    // ------------------------------------------------------------ settings
    settings(inGame) {
      const s = this.G.settings;
      const html = `
        <div class="row"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-k="master"></div>
        <div class="row"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></div>
        <div class="row"><span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></div>
        <div class="row"><span>Camera pan speed</span><input type="range" min="0.4" max="2" step="0.1" value="${s.camSpeed}" data-k="camSpeed"></div>
        <div class="row"><span>Zoom sensitivity</span><input type="range" min="0.4" max="2" step="0.1" value="${s.zoomSpeed}" data-k="zoomSpeed"></div>
        <div class="row"><span>Interface scale</span><input type="range" min="0.7" max="1.4" step="0.05" value="${s.uiScale}" data-k="uiScale"></div>
        <div class="row"><span>Graphics quality</span><div class="seg">${['low', 'medium', 'high'].map((q) => `<button class="${s.quality === q ? 'on' : ''}" data-a="quality:${q}">${q}</button>`).join('')}</div></div>
        <div class="row"><span>Effects detail</span><div class="seg"><button class="${!s.lowFx ? 'on' : ''}" data-a="lowFx:0">Full</button><button class="${s.lowFx ? 'on' : ''}" data-a="lowFx:1">Reduced</button></div></div>
        <div class="row"><span>Screen shake</span><div class="seg"><button class="${s.shake ? 'on' : ''}" data-a="shake:1">On</button><button class="${!s.shake ? 'on' : ''}" data-a="shake:0">Off</button></div></div>
        <div class="row"><span>Vibration</span><div class="seg"><button class="${s.haptics ? 'on' : ''}" data-a="haptics:1">On</button><button class="${!s.haptics ? 'on' : ''}" data-a="haptics:0">Off</button></div></div>
        <div class="row"><span>Unit cap (new games)</span><div class="seg">${[100, 150, 200, 300].map((n) => `<button class="${s.unitCap === n ? 'on' : ''}" data-a="unitCap:${n}">${n}</button>`).join('')}</div></div>
        <div class="row"><span>Warlord AI income bonus</span><div class="seg"><button class="${s.aiIncomeBonus ? 'on' : ''}" data-a="aiIncomeBonus:1">+25%</button><button class="${!s.aiIncomeBonus ? 'on' : ''}" data-a="aiIncomeBonus:0">Off</button></div></div>
        <div class="row"><span>Edge scrolling (mouse)</span><div class="seg"><button class="${s.edgePan ? 'on' : ''}" data-a="edgePan:1">On</button><button class="${!s.edgePan ? 'on' : ''}" data-a="edgePan:0">Off</button></div></div>
        <div class="row"><span>Show FPS</span><div class="seg"><button class="${s.showFps ? 'on' : ''}" data-a="showFps:1">On</button><button class="${!s.showFps ? 'on' : ''}" data-a="showFps:0">Off</button></div></div>`;
      const bind = (el, rerender) => {
        el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { s[inp.dataset.k] = parseFloat(inp.value); this.G.applySettings(); Store.saveSettings(s); }));
        this.click(el, (a) => {
          const [k, v] = a.split(':');
          if (k === 'back') { inGame ? this.pauseMenu() : this.showMain(); return; }
          if (k === 'quality') { s.quality = v; } else if (k === 'unitCap') s.unitCap = +v; else if (k in s) s[k] = v === '1';
          Store.saveSettings(s); this.G.applySettings(); rerender();
        });
      };
      if (inGame) {
        const r = () => { const d = this.modal(`<h3>Settings</h3>${html}<div class="footer"><button class="btn pri" data-a="back">Done</button></div>`, 'pause-sub'); bind(d, r); };
        r();
      } else {
        this.current = 'settings';
        const r = () => { const el = this.screen('page dim', `<h2><button class="btn back" data-a="back">‹ Back</button>Settings</h2><div class="body">${html}</div>`); bind(el, r); };
        r();
      }
    }

    // ------------------------------------------------------------ save / load
    slots() {
      return ['auto', '1', '2', '3'].map((k) => ({ k, meta: Store.getJSON('savemeta_' + k, null) }));
    }
    slotLabel(s) {
      if (!s.meta) return `<b>${s.k === 'auto' ? 'Autosave' : 'Slot ' + s.k}</b><span style="color:var(--dim)">Empty</span>`;
      const m = s.meta; const d = new Date(m.t);
      return `<b>${s.k === 'auto' ? 'Autosave' : 'Slot ' + s.k}</b><span style="font-size:.78em;color:var(--dim);text-align:right">${esc(m.mission || m.map)} · ${U.fmtTime(m.time)} · ${esc(D.FACTIONS[m.faction] ? D.FACTIONS[m.faction].short : '')}<br>${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</span>`;
    }
    loadMenu(inGame) {
      const html = this.slots().map((s) => `<button class="mbtn saveslot" data-a="load:${s.k}" ${s.meta ? '' : 'disabled'}>${this.slotLabel(s)}</button>`).join('');
      if (inGame) { const d = this.modal(`<h3>Load Game</h3>${html}<div class="footer"><button class="btn" data-a="back">Back</button></div>`, 'pause-sub'); this.click(d, (a) => { if (a === 'back') return this.pauseMenu(); this.closeModal(); this.tryLoad(a.split(':')[1]); }); return; }
      this.current = 'load';
      const el = this.screen('page dim', `<h2><button class="btn back" data-a="back">‹ Back</button>Load Game</h2><div class="body" style="max-width:520px">${html}</div>`);
      this.click(el, (a) => { if (a === 'back') return this.showMain(); this.tryLoad(a.split(':')[1]); });
    }
    saveMenu() {
      const html = this.slots().filter((s) => s.k !== 'auto').map((s) => `<button class="mbtn saveslot" data-a="save:${s.k}">${this.slotLabel(s)}</button>`).join('');
      const d = this.modal(`<h3>Save Game</h3>${html}<div class="footer"><button class="btn" data-a="back">Back</button></div>`, 'pause-sub');
      this.click(d, (a) => {
        if (a === 'back') return this.pauseMenu();
        const k = a.split(':')[1]; const ok = this.G.saveGame(k);
        this.G.hud.toast(ok ? 'Game saved to slot ' + k : 'Save failed', ok ? 'good' : 'alert'); this.pauseMenu();
      });
    }

    // ------------------------------------------------------------ help
    help() {
      this.current = 'help';
      const el = this.screen('page dim', `<h2><button class="btn back" data-a="back">‹ Back</button>Field Manual</h2><div class="body help"><div class="cols">
        <div class="col"><h3>Controls (touch)</h3><ul>
          <li><b>Tap</b> a unit to select it. Tap the ground to move. Tap an enemy to attack.</li>
          <li><b>Drag</b> one finger to pan; <b>pinch</b> to zoom. Two-finger tap deselects.</li>
          <li><b>Long-press, then drag</b> to box-select (or toggle ▢ on the left).</li>
          <li><b>Double-tap</b> a unit to select all of that type on screen.</li>
          <li>Group buttons 1–5: <b>long-press</b> to assign, tap to recall, double-tap to jump.</li>
          <li>Tap the <b>minimap</b> to move the camera.</li></ul>
          <h3>Controls (mouse/keyboard)</h3><ul><li>Left-click select / drag box · Right-click order · Wheel zoom · Arrows or screen edge pan</li><li>Ctrl+1–5 assign group · 1–5 recall · A attack-move · S stop · H hold · P patrol · R retreat · F formation · B build · Space HQ · Esc pause</li></ul></div>
        <div class="col"><h3>Economy</h3><p>Credits come from Oil Extractors (built on dark oil fields), Metal from Ore Mines (on ore deposits). Both also trickle in from your HQ. Power Plants supply energy; if consumption exceeds generation, production, research, extraction and turrets slow down and radar goes offline.</p>
          <h3>Combat</h3><p>Damage depends on weapon type vs armor: bullets shred infantry, AP shells crack armor, HE and siege wreck structures, flak and missiles down aircraft, torpedoes sink ships. Artillery fires indirectly over obstacles but has a minimum range. Direct-fire weapons need line of sight past rocks.</p>
          <h3>Terrain & intelligence</h3><p>Forests hide ground units from distant observers and protect infantry. Hills grant extra vision and range. Water is for ships, hover and amphibious units. Fog of war hides the map; last-known enemy structures remain as faded ghosts. Radar shows enemy movement as red blips; stealth units are only revealed by detectors (scouts, drones, radar, destroyers, EW rigs) or when they fire.</p></div>
        <div class="col"><h3>Factions</h3>${Object.values(D.FACTIONS).map((f) => `<p><b style="color:var(--acc)">${esc(f.name)}</b> — ${esc(f.desc)}</p>`).join('')}
          <h3>Victory</h3><p>Standard: eliminate every HQ, Vehicle Factory and Construction Rig of all enemy teams. Destroy HQ: lose your HQ, lose the match. Annihilation: destroy everything.</p></div>
      </div></div>`);
      this.click(el, (a) => { if (a === 'back') this.showMain(); });
    }

    // ------------------------------------------------------------ loading
    loading(task) {
      this.current = 'loading';
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      const el = this.screen('loading', `<div class="logo" style="font-size:28px">Deploying Forces</div><div class="bar"><b></b></div><div class="tip">${esc(tip)}</div>`);
      const bar = el.querySelector('.bar b');
      const progress = (f) => new Promise((res) => { bar.style.width = Math.round(f * 100) + '%'; requestAnimationFrame(() => setTimeout(res, 0)); });
      task(progress).then(() => { this.clear(); this.current = null; }).catch((e) => { console.error(e); this.alert('Failed to start: ' + e.message); this.showMain(); });
    }

    // ------------------------------------------------------------ modal dialogs
    modal(html, kind) { const m = $('modal'); m.innerHTML = `<div class="dialog">${html}</div>`; m.classList.remove('hidden'); this.modalKind = kind || 'dialog'; return m.firstChild; }
    closeModal() { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; this.modalKind = null; }
    alert(text) { const d = this.modal(`<h3>Notice</h3><p>${esc(text)}</p><div class="footer"><button class="btn pri" data-a="ok">OK</button></div>`); this.click(d, () => this.closeModal()); }
    confirm(text, yes) { const d = this.modal(`<h3>Confirm</h3><p>${esc(text)}</p><div class="footer"><button class="btn" data-a="no">Cancel</button><button class="btn pri" data-a="yes">Confirm</button></div>`); this.click(d, (a) => { this.closeModal(); if (a === 'yes') yes(); }); }
    groupPicker() {
      const d = this.modal(`<h3>Assign selection to group</h3><div class="btnrow">${[1, 2, 3, 4, 5].map((n) => `<button class="btn pri" data-a="${n}">Group ${n}</button>`).join('')}</div><div class="footer"><button class="btn" data-a="x">Cancel</button></div>`);
      this.click(d, (a) => { this.closeModal(); if (a !== 'x') this.G.assignGroup(+a); });
    }

    pauseMenu() {
      const G = this.G; const w = G.world; const camp = G.matchOpts && G.matchOpts.kind === 'campaign';
      const d = this.modal(`<h3>Paused — ${esc(w.mission ? w.mission.def.name : w.map.name)} · ${U.fmtTime(w.time)}</h3>
        <button class="mbtn" data-a="resume">Resume</button>
        <button class="mbtn" data-a="save">Save Game</button>
        <button class="mbtn" data-a="load">Load Game</button>
        <button class="mbtn" data-a="stats">Battle Statistics</button>
        <button class="mbtn" data-a="settings">Settings</button>
        <button class="mbtn" data-a="restart">Restart ${camp ? 'Mission' : 'Match'}</button>
        <button class="mbtn" data-a="quit">Quit to Main Menu</button>`, 'pause');
      this.click(d, (a) => {
        if (a === 'resume') { G.togglePause(); }
        else if (a === 'save') this.saveMenu();
        else if (a === 'load') this.loadMenu(true);
        else if (a === 'settings') this.settings(true);
        else if (a === 'stats') { const s = this.modal(`<h3>Battle Statistics</h3>${this.statsHTML()}<div class="footer"><button class="btn" data-a="back">Back</button></div>`, 'pause-sub'); this.click(s, () => this.pauseMenu()); }
        else if (a === 'restart') this.confirm('Restart and lose current progress?', () => { G.paused = false; G.restart(); });
        else if (a === 'quit') this.confirm('Quit to the main menu? (an autosave is kept)', () => { G.saveGame('auto'); this.closeModal(); G.paused = false; G.quitToMenu(); });
      });
    }
    statsHTML() {
      const w = this.G.world;
      let h = '<div class="statgrid"><div class="h">Commander</div><div class="h">Built</div><div class="h">Lost</div><div class="h">Kills</div><div class="h">Earned</div>';
      for (const p of w.players) h += `<div style="color:${D.TEAM_COLORS[p.color].main}">${esc(p.name)} (${D.FACTIONS[p.faction].short})</div><div>${p.stats.built}u · ${p.stats.bldBuilt}b</div><div>${p.stats.lost}u · ${p.stats.bldLost}b</div><div>${p.stats.kills}</div><div>${U.fmt(p.stats.earnedC)}c ${U.fmt(p.stats.earnedM)}m</div>`;
      return h + '</div>';
    }

    // ------------------------------------------------------------ game over
    gameOver() {
      const G = this.G; const w = G.world; const me = w.players[G.pid]; const win = w.winner === me.team;
      const camp = G.matchOpts && G.matchOpts.kind === 'campaign'; const idx = G.matchOpts && G.matchOpts.idx;
      if (camp && win) { const c = Store.getJSON('campaign', { unlocked: 0, done: {} }); c.done[WF.MISSIONS[idx].id] = true; c.unlocked = Math.max(c.unlocked, Math.min(idx + 1, WF.MISSIONS.length - 1)); Store.setJSON('campaign', c); }
      Store.remove('save_auto'); Store.remove('savemeta_auto');
      const reason = w.mission && w.mission.result ? w.mission.result.reason : win ? 'All enemy forces have been eliminated.' : 'Your command has been destroyed.';
      this.current = 'gameover'; G.hud.hide(); G.running = false;
      const el = this.screen('page dim', `<div style="text-align:center;margin-top:8px"><div class="big ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</div><div style="color:var(--dim)">${esc(reason)} · ${U.fmtTime(w.time)}</div></div>
        <div class="body" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;align-items:flex-start">
          <div>${this.statsHTML()}</div><canvas id="armychart" width="320" height="140" style="background:rgba(0,0,0,.3);border-radius:8px;max-width:100%"></canvas></div>
        <div class="footer">${camp && win && idx + 1 < WF.MISSIONS.length ? '<button class="btn pri" data-a="next">Next Mission ▸</button>' : ''}<button class="btn" data-a="restart">${camp ? 'Retry' : 'Rematch'}</button><button class="btn" data-a="menu">Main Menu</button></div>`);
      this.drawChart(el.querySelector('#armychart'));
      this.click(el, (a) => {
        if (a === 'next') this.briefing(idx + 1);
        else if (a === 'restart') { G.restart(); }
        else if (a === 'menu') { G.quitToMenu(); }
      });
    }
    drawChart(c) {
      const g = c.getContext('2d'); const snap = this.G.statsSnap; const w = this.G.world;
      g.fillStyle = '#8fa294'; g.font = '11px sans-serif'; g.fillText('Army value over time', 8, 14);
      if (snap.length < 2) return; let max = 1; for (const s of snap) for (const v of s) max = Math.max(max, v);
      w.players.forEach((p, i) => {
        g.strokeStyle = D.TEAM_COLORS[p.color].main; g.lineWidth = 2; g.beginPath();
        snap.forEach((s, k) => { const x = 8 + k / (snap.length - 1) * 304, y = 132 - (s[i] / max) * 108; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      });
    }
  }
  WF.Menus = Menus;
})(window.WF = window.WF || {});
