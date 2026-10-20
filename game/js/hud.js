/* WARFRONT: DOMINION — in-game HUD: resources, selection, commands, build/production/research drawer,
 * groups, toasts, objectives, placement & targeting bars, world overlays. */
(function (WF) {
  'use strict';
  const U = WF.U, D = WF.D, TILE = U.TILE, ART = WF.ART;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class HUD {
    constructor(G) {
      this.G = G; this.el = $('hud'); this.t = 0; this.sig = ''; this.tab = null; this.drawerOpen = false; this.toastList = [];
      this.spawnOwner = 1;
      // static buttons
      $('btn-menu').onclick = () => { G.audio.ui('click'); G.togglePause(true); };
      $('btn-pause').onclick = () => { G.audio.ui('click'); G.togglePause(); };
      $('btn-speed').onclick = () => { G.audio.ui('click'); G.cycleSpeed(); };
      $('btn-box').onclick = () => { this.setBoxMode(!G.input.boxMode); };
      $('btn-army').onclick = () => { const u = G.myUnits().filter((e) => e.weapons.length && !D.UNITS[e.type].builder); G.select(u, false); if (!u.length) this.toast('No combat units', 'info'); };
      $('btn-idle').onclick = () => {
        const b = G.myUnits().filter((e) => D.UNITS[e.type].builder); if (!b.length) { this.toast('No Construction Rigs', 'warn'); return; }
        b.sort((x, y) => x.orders.length - y.orders.length); this.idleIdx = ((this.idleIdx || 0) + 1) % b.length; const pick = b[0].orders.length ? b[this.idleIdx] : b[0];
        G.select([pick], false); G.renderer.cam.x = pick.x; G.renderer.cam.y = pick.y; G.renderer.clampCam();
      };
      const bb = document.createElement('button'); bb.className = 'side-btn'; bb.id = 'btn-build'; bb.title = 'Build structures'; bb.textContent = '🏗'; bb.onclick = () => this.openBuild();
      $('leftcol').insertBefore(bb, $('btn-army'));
      $('place-ok').onclick = () => G.confirmPlace();
      $('place-cancel').onclick = () => G.cancelPlace();
      $('place-rot').onclick = () => { G.audio.ui('click'); this.toast('Drag or tap on the map to move the blueprint', 'info'); };
      $('target-cancel').onclick = () => G.cancelTarget();
      $('objectives').onclick = () => { this.objMini = !this.objMini; this.updateObjectives(); };
      $('cmds').addEventListener('click', (e) => this.onCmd(e));
      $('drawer-body').addEventListener('click', (e) => this.onDrawer(e));
      $('drawer-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.tab = b.dataset.tab; if (this.tab === 'close') { this.closeDrawer(); return; } this.sig = ''; this.refresh(true); });
      // long-press on drawer items = queue 5
      $('drawer-body').addEventListener('pointerdown', (e) => {
        const it = e.target.closest('[data-prod]'); if (!it) return;
        clearTimeout(this.lp); this.lpFired = false;
        this.lp = setTimeout(() => { this.lpFired = true; this.produce(it.dataset.prod, 5); G.haptic(25); }, 450);
      });
      $('drawer-body').addEventListener('pointerup', () => clearTimeout(this.lp));
      $('drawer-body').addEventListener('pointercancel', () => clearTimeout(this.lp));
      $('drawer-body').addEventListener('pointermove', (e) => { if (Math.abs(e.movementY) > 4) clearTimeout(this.lp); });
    }
    get w() { return this.G.world; }
    get selSet() { return this.G.sel; }
    show() { this.el.classList.remove('hidden'); }
    hide() { this.el.classList.add('hidden'); this.closeDrawer(); this.showPlace(false); this.showTarget(null); $('objectives').classList.add('hidden'); }
    reset() {
      const gr = $('groups'); gr.innerHTML = '';
      for (let n = 1; n <= 5; n++) {
        const b = document.createElement('button'); b.className = 'grp'; b.dataset.g = n; b.innerHTML = n + '<small></small>';
        let lp = null, fired = false;
        b.addEventListener('pointerdown', () => { fired = false; lp = setTimeout(() => { fired = true; this.G.assignGroup(n); }, 500); });
        b.addEventListener('pointerup', () => { clearTimeout(lp); if (!fired) this.G.recallGroup(n); });
        b.addEventListener('pointerleave', () => clearTimeout(lp));
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        gr.appendChild(b);
      }
      this.sig = ''; this.tab = null; this.closeDrawer(); this.setBoxMode(false); this.updatePause();
      $('toasts').innerHTML = '';
      const sandbox = this.w.opts.sandbox;
      this.refresh(true);
      if (sandbox) this.toast('Sandbox: open the 🏗 menu → SPAWN tab to drop any unit for any player.', 'good');
    }
    setBoxMode(on) { this.G.input.boxMode = on; $('btn-box').classList.toggle('on', on); if (on) this.toast('Box select: drag over units', 'info'); }
    updatePause() { $('btn-pause').textContent = this.G.paused ? '▶' : '❚❚'; $('btn-speed').textContent = this.G.speed + '×'; $('btn-speed').classList.toggle('hidden', !!this.w && !!this.w.mission && false); }

    toast(text, kind, onClick) {
      const box = $('toasts'); const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = text;
      if (onClick) { d.style.pointerEvents = 'auto'; d.onclick = onClick; }
      box.appendChild(d); while (box.children.length > 4) box.removeChild(box.firstChild);
      setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, kind === 'alert' ? 4500 : 3200);
    }

    // ------------------------------------------------------------ per-frame
    update(dt) {
      this.t += dt; const w = this.w; if (!w) return;
      const me = w.players[this.G.pid];
      if (this.t > 0.2) {
        this.t = 0;
        const inc = this.incomeRate();
        $('r-credits').querySelector('span').textContent = U.fmt(me.res.c); $('r-credits').querySelector('em').textContent = '+' + inc.c.toFixed(0);
        $('r-metal').querySelector('span').textContent = U.fmt(me.res.m); $('r-metal').querySelector('em').textContent = '+' + inc.m.toFixed(1);
        $('r-power').querySelector('span').textContent = me.power.gen + '/' + me.power.use; $('r-power').classList.toggle('warn', me.lowPower);
        $('r-units').querySelector('span').textContent = w.unitCount(this.G.pid) + '/' + w.unitCap;
        $('r-time').querySelector('span').textContent = U.fmtTime(w.time);
        // groups
        for (const b of $('groups').children) { const ids = (this.G.groups[b.dataset.g] || []).filter((id) => w.get(id)); b.classList.toggle('has', ids.length > 0); b.querySelector('small').textContent = ids.length || ''; }
        const sig = this.signature(); if (sig !== this.sig) this.refresh(true); else this.updateProgress();
        if (w.mission) this.updateObjectives();
      }
    }
    incomeRate() {
      const w = this.w, p = w.players[this.G.pid]; let c = 0, m = 0;
      for (const e of w.ents) {
        if (e.dead || e.owner !== p.id || e.kind !== 'bld' || !e.built) continue; const d = D.BUILDINGS[e.type]; if (!d.income) continue;
        let mul = p.incomeMul; if (p.has('extraction') && e.type !== 'hq') mul *= 1.25; if (e.type !== 'hq') mul *= 0.5 + 0.5 * p.powerFactor;
        c += d.income.c * mul; m += d.income.m * mul;
      }
      return { c, m };
    }
    signature() {
      const w = this.w, p = w.players[this.G.pid]; const sel = this.G.selected();
      let s = [...this.G.sel].join(',') + '|' + this.tab + '|' + this.drawerOpen + '|' + !!this.G.queueMode + '|' + Object.keys(p.tech).join(',') + '|' + this.G.formation + '|' + (this.G.placing ? 1 : 0);
      for (const e of sel) { if (e.kind === 'bld') s += '|' + e.queue.join('.') + ':' + e.research + ':' + e.built + ':' + (e.charge >= 1); else s += '|' + (e.cargo ? e.cargo.length : '') + (e.orders[0] ? e.orders[0].t : ''); }
      // affordability buckets (only matters while drawer open)
      if (this.drawerOpen) s += '|' + Math.floor(p.res.c / 50) + ':' + Math.floor(p.res.m / 20) + ':' + w.unitCount(this.G.pid) + ':' + this.countBlds();
      if (this.drawerOpen && this.tab === 'spawn') s += '|' + this.spawnOwner;
      return s;
    }
    countBlds() { let n = 0; for (const e of this.w.ents) if (!e.dead && e.owner === this.G.pid && e.kind === 'bld' && e.built) n++; return n; }

    // ------------------------------------------------------------ selection panel + drawer
    refresh(force) {
      const w = this.w; if (!w || !this.G.running) return;
      this.sig = this.signature();
      const sel = this.G.selected(); const pid = this.G.pid;
      const sp = $('selpanel'); const info = $('selinfo'); const cmds = $('cmds');
      if (!sel.length) { sp.classList.add('hidden'); if (this.drawerOpen && this.tab !== 'build' && this.tab !== 'spawn') this.closeDrawer(); else if (this.drawerOpen) this.renderDrawer(null); return; }
      sp.classList.remove('hidden');
      const first = sel[0]; const own = first.owner === pid; const pl = w.players[first.owner];
      // info
      if (sel.length === 1) {
        const e = first; const d = e.kind === 'unit' ? D.unitFor(e.type, pl.faction) : D.bldFor(e.type, pl.faction);
        let sub = esc(d.role || '');
        if (e.kind === 'unit' && d.weapons) { const wd = D.WEAPONS[d.weapons[0]]; sub += `<br>Range ${Math.round(wd.range / TILE)} · ${wd.type.toUpperCase()} · ${D.ARMOR_LABEL[d.armor]}`; }
        if (e.kind === 'bld') { if (d.power) sub += `<br>Power ${d.power > 0 ? '+' : ''}${d.power}`; if (d.income) sub += ` · Income ${d.income.c ? '+' + d.income.c + ' cr/s' : ''}${d.income.m ? ' +' + d.income.m + ' mt/s' : ''}`; if (!e.built) sub += `<br>Under construction ${Math.round(e.progress * 100)}%`; }
        if (!own) sub = `<span style="color:${D.TEAM_COLORS[pl.color].main}">${esc(pl.name)} · ${esc(D.FACTIONS[pl.faction].name)}</span><br>` + sub;
        if (e.kills) sub += `<br>Kills: ${e.kills}`;
        info.innerHTML = `<div class="nm">${esc(d.name)}</div><div class="hp"><b data-hp="${e.id}" style="width:${(e.hp / e.maxHp * 100).toFixed(0)}%"></b></div><div class="sub">${sub}</div>`;
      } else {
        const cnt = {}; for (const e of sel) cnt[e.type] = (cnt[e.type] || 0) + 1;
        info.innerHTML = `<div class="nm">${sel.length} selected</div><div class="mix">` + Object.keys(cnt).map((t) => `<span>${cnt[t]}× ${esc(D.UNITS[t] ? D.unitFor(t, pl.faction).name.split(' ')[0] : D.BUILDINGS[t].name)}</span>`).join('') + '</div>';
      }
      // commands
      let h = '';
      const units = sel.filter((e) => e.kind === 'unit' && e.owner === pid);
      const B = (act, icon, label, cls) => `<button class="cmd ${cls || ''}" data-act="${act}">${icon}<small>${label}</small></button>`;
      if (units.length) {
        h += B('stop', '■', 'Stop') + B('hold', '⛉', 'Hold') + B('amove', '⚔', 'Atk-Move') + B('patrol', '↻', 'Patrol') + B('retreat', '⟲', 'Retreat');
        if (units.length > 1) h += B('formation', '⋮⋮', this.G.formation) + B('regroup', '◎', 'Regroup');
        h += B('queue', '⧉', 'Queue', this.G.queueMode ? 'on' : '');
        if (units.some((u) => D.UNITS[u.type].builder)) h += B('build', '🏗', 'Build', this.drawerOpen && this.tab === 'build' ? 'on' : '');
        if (units.some((u) => u.cargo && u.cargo.length)) h += B('unload', '⇩', 'Unload');
        h += B('group', '#', 'Group');
      } else if (own && first.kind === 'bld') {
        const d = D.BUILDINGS[first.type];
        if (d.produces && first.built) h += B('produce', '⚙', 'Produce', this.drawerOpen ? 'on' : '') + B('rally', '⚑', 'Rally');
        if (d.research && first.built) h += B('research', '⚗', 'Research', this.drawerOpen ? 'on' : '');
        if (d.superweapon && first.built) h += B('strike', '☢', first.charge >= 1 ? 'Launch' : Math.floor(first.charge * 100) + '%', first.charge >= 1 ? 'danger' : '');
        if (first.hp < first.maxHp && first.built) h += B('fix', '🔧', 'Repair');
        if (!first.built) h += B('cancelb', '✕', 'Cancel', 'danger');
        else if (first.type !== 'hq') h += B('sell', '⌫', 'Demolish', 'danger');
      }
      cmds.innerHTML = h;
      // drawer
      if (own && first.kind === 'bld' && first.built && sel.length === 1) {
        const d = D.BUILDINGS[first.type];
        if (d.produces || d.research) { if (!this.drawerOpen || (this.tab !== 'produce' && this.tab !== 'research')) { this.tab = d.research ? 'research' : 'produce'; this.drawerOpen = true; } }
        else if (this.drawerOpen && this.tab !== 'build' && this.tab !== 'spawn') this.closeDrawer();
      } else if (this.drawerOpen && (this.tab === 'produce' || this.tab === 'research')) this.closeDrawer();
      if (this.drawerOpen) this.renderDrawer(sel.length === 1 && first.kind === 'bld' && own ? first : null);
      this.sig = this.signature();
    }

    openBuild() {
      if (!this.G.running) return;
      if (this.drawerOpen && this.tab === 'build') { this.closeDrawer(); return; }
      this.tab = 'build'; this.drawerOpen = true; this.renderDrawer(null); this.refresh(true);
    }
    closeDrawer() { this.drawerOpen = false; $('drawer').classList.add('hidden'); document.documentElement.style.setProperty('--drawer-w', '0px'); this.sig = ''; }

    renderDrawer(bld) {
      const w = this.w, G = this.G, pid = G.pid, p = w.players[pid];
      $('drawer').classList.remove('hidden'); document.documentElement.style.setProperty('--drawer-w', $('drawer').getBoundingClientRect().width + 'px');
      const tabs = [];
      if (bld && D.BUILDINGS[bld.type].produces) tabs.push(['produce', 'Produce']);
      if (bld && D.BUILDINGS[bld.type].research) tabs.push(['research', 'Research']);
      if (!bld || this.tab === 'build') tabs.push(['build', 'Build']);
      if (w.opts.sandbox) tabs.push(['spawn', 'Spawn']);
      tabs.push(['close', '✕']);
      if (!tabs.some((t) => t[0] === this.tab)) this.tab = tabs[0][0];
      $('drawer-tabs').innerHTML = tabs.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('');
      let h = '';
      const costH = (c) => `<span class="c">${c.c}</span>${c.m ? ` <span class="m">${c.m}</span>` : ''}`;
      if (this.tab === 'build') {
        const groups = [['Economy', ['power', 'extractor', 'mine', 'radar']], ['Production', ['barracks', 'factory', 'airfield', 'shipyard', 'lab', 'repair']], ['Defense', ['turret_mg', 'turret_gun', 'turret_aa', 'wall', 'silo']]];
        for (const [title, list] of groups) {
          h += `<div class="dhead"><span>${title}</span></div><div class="grid">`;
          for (const t of list) {
            const d = D.bldFor(t, p.faction); const miss = w.buildReqMissing(pid, t); const cost = w.buildingCost(pid, t); const poor = !w.canAfford(pid, cost);
            const img = ART.iconURL('bld', t, p.faction, p.color);
            h += `<button class="item ${miss ? 'locked' : poor ? 'poor' : ''}" data-build="${t}" style="background-image:url(${img})"><div class="cost">${costH(cost)}</div><div class="nm">${esc(d.name)}</div>${miss ? `<div class="lock">${esc(miss)}</div>` : ''}</button>`;
          }
          h += '</div>';
        }
        h += `<div class="dhead"><span>Tip</span></div><div style="font-size:.72em;color:var(--dim);line-height:1.35">Pick a structure, tap the map to position it, then press ✓. The nearest Construction Rig is assigned automatically. Power: <b style="color:${p.lowPower ? 'var(--bad)' : 'var(--good)'}">${p.power.gen}/${p.power.use}</b></div>`;
      } else if (this.tab === 'produce' && bld) {
        const d = D.BUILDINGS[bld.type];
        if (bld.queue.length) {
          h += `<div class="dhead"><span>Queue (${bld.queue.length})</span><span>tap to cancel</span></div><div class="qrow">`;
          bld.queue.forEach((t, i) => { h += `<button class="qi" data-cancel="${i}" style="background-image:url(${ART.iconURL('unit', t, p.faction, p.color)})">${i === 0 ? `<b data-qprog="${bld.id}" style="width:${(bld.qprog * 100).toFixed(0)}%"></b>` : ''}</button>`; });
          h += '</div>';
        }
        h += `<div class="dhead"><span>Units</span><span>hold = ×5</span></div><div class="grid">`;
        for (const t of d.produces) {
          if (!D.canProduce(p.faction, t)) continue;
          const ud = D.unitFor(t, p.faction); const miss = w.unitReqMissing(pid, t); const poor = !w.canAfford(pid, ud.cost); const q = bld.queue.filter((x) => x === t).length;
          h += `<button class="item ${miss ? 'locked' : poor ? 'poor' : ''}" data-prod="${t}" title="${esc(ud.role)}" style="background-image:url(${ART.iconURL('unit', t, p.faction, p.color)})"><div class="cost">${costH(ud.cost)}</div>${q ? `<div class="q">${q}</div>` : ''}<div class="nm">${esc(ud.name)}</div>${miss ? `<div class="lock">${esc(miss)}</div>` : ''}</button>`;
        }
        h += '</div>';
        if (bld.type === 'shipyard' || bld.type === 'airfield') h += `<div style="font-size:.7em;color:var(--dim);margin-top:6px">${bld.type === 'airfield' ? 'Jets return here automatically to rearm.' : 'Naval units only move on water.'}</div>`;
      } else if (this.tab === 'research' && bld) {
        for (const id in D.RESEARCH) {
          const r = D.RESEARCH[id]; if (r.faction && r.faction !== p.faction) continue;
          const done = p.has(id); const busy = w.ents.find((e) => !e.dead && e.owner === pid && e.research === id);
          const reqMiss = (r.req || []).filter((q) => !p.has(q)).map((q) => D.RESEARCH[q].name);
          const poor = !w.canAfford(pid, r.cost);
          h += `<button class="tech ${done ? 'done' : busy ? 'busy' : ''}" data-tech="${id}"><div><b>${esc(r.name)}${r.faction ? ' ★' : ''}</b><span>${esc(r.desc)}${reqMiss.length ? '<br><i style="color:#ffb4a8">Needs ' + esc(reqMiss.join(', ')) + '</i>' : ''}</span></div><div class="tc">${done ? '✓' : busy ? `<span data-rprog="${busy.id}">${Math.round(busy.rprog * 100)}%</span>` : `<span style="color:${poor ? 'var(--bad)' : '#ffd979'}">${r.cost.c}</span><br><span style="color:#c9d6e0">${r.cost.m}</span><br>${r.time}s`}</div></button>`;
        }
        if (bld.research) h += `<div class="btnrow"><button class="btn danger" data-cancelres="1">Cancel research</button></div>`;
      } else if (this.tab === 'spawn') {
        h += `<div class="dhead"><span>Owner</span></div><div class="seg" style="margin-bottom:6px">` + w.players.map((q, i) => `<button data-owner="${i}" class="${this.spawnOwner === i ? 'on' : ''}" style="color:${D.TEAM_COLORS[q.color].main}">P${i + 1}</button>`).join('') + '</div>';
        const of = w.players[this.spawnOwner]; h += '<div class="grid">';
        for (const t of D.FACTIONS[of.faction].units) h += `<button class="item" data-spawn="${t}" style="background-image:url(${ART.iconURL('unit', t, of.faction, of.color)})"><div class="nm">${esc(D.unitFor(t, of.faction).name)}</div></button>`;
        h += '</div><div class="btnrow"><button class="btn" data-sandbox="cash">+10k resources</button><button class="btn" data-sandbox="reveal">Toggle reveal map</button><button class="btn" data-sandbox="tech">All research</button></div>';
      }
      $('drawer-body').innerHTML = h;
    }

    updateProgress() {
      const w = this.w;
      for (const b of document.querySelectorAll('[data-qprog]')) { const e = w.get(+b.dataset.qprog); if (e) b.style.width = (e.qprog * 100).toFixed(0) + '%'; }
      for (const b of document.querySelectorAll('[data-rprog]')) { const e = w.get(+b.dataset.rprog); if (e) b.textContent = Math.round(e.rprog * 100) + '%'; }
      for (const b of document.querySelectorAll('[data-hp]')) { const e = w.get(+b.dataset.hp); if (e) { const f = e.hp / e.maxHp; b.style.width = (f * 100).toFixed(0) + '%'; b.style.background = f > 0.6 ? 'var(--good)' : f > 0.3 ? 'var(--acc)' : 'var(--bad)'; } }
      const strike = document.querySelector('[data-act="strike"] small'); if (strike) { const s = this.G.selected()[0]; if (s && s.type === 'silo') strike.textContent = s.charge >= 1 ? 'Launch' : Math.floor(s.charge * 100) + '%'; }
    }

    onCmd(e) {
      const b = e.target.closest('[data-act]'); if (!b) return; const G = this.G; const act = b.dataset.act; G.audio.ui('click');
      const sel = G.selected(); const bld = sel.find((x) => x.kind === 'bld');
      switch (act) {
        case 'stop': case 'hold': case 'retreat': G.cmd(act); break;
        case 'amove': case 'patrol': case 'unload': G.beginTarget(act); break;
        case 'formation': G.cycleFormation(); break;
        case 'regroup': G.regroup(); break;
        case 'queue': G.queueMode = !G.queueMode; this.toast(G.queueMode ? 'Queue mode ON: orders are added after current ones' : 'Queue mode OFF', 'info'); this.refresh(true); break;
        case 'build': this.openBuild(); break;
        case 'group': G.menus.groupPicker(); break;
        case 'produce': case 'research': if (this.drawerOpen) this.closeDrawer(); else { this.tab = act; this.drawerOpen = true; } this.refresh(true); break;
        case 'rally': G.beginTarget('rally'); break;
        case 'strike': if (bld && bld.charge >= 1) G.beginTarget('strike', { id: bld.id }); else this.toast('Silo is still charging', 'warn'); break;
        case 'sell': G.cmd('sell'); break;
        case 'cancelb': if (bld) { G.world.command(G.pid, { c: 'cancel', id: bld.id }); G.deselect(); } break;
        case 'fix': {
          const rigs = G.myUnits().filter((u) => D.UNITS[u.type].builder).sort((a, c) => a.orders.length - c.orders.length || U.dist2(a.x, a.y, bld.x, bld.y) - U.dist2(c.x, c.y, bld.x, bld.y));
          if (!rigs.length) { this.toast('No Construction Rig available', 'warn'); break; }
          G.world.command(G.pid, { c: 'repair', ids: [rigs[0].id], id: bld.id }); this.toast('Construction Rig dispatched for repairs', 'good'); break;
        }
      }
    }
    produce(type, n) {
      const G = this.G; const bld = G.selected().find((x) => x.kind === 'bld'); if (!bld) return;
      const r = G.world.command(G.pid, { c: 'produce', id: bld.id, type, n });
      if (!r.ok) { this.toast(r.reason, 'warn'); G.audio.ui('error'); } else G.audio.ui('click');
      this.refresh(true);
    }
    onDrawer(e) {
      const G = this.G, w = this.w; const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.build) { G.audio.ui('click'); G.startPlace(t.dataset.build); return; }
      if (t.dataset.prod) { if (this.lpFired) { this.lpFired = false; return; } this.produce(t.dataset.prod, 1); return; }
      if (t.dataset.cancel != null) { const bld = G.selected().find((x) => x.kind === 'bld'); if (bld) w.command(G.pid, { c: 'cancel', id: bld.id, idx: +t.dataset.cancel }); G.audio.ui('click'); this.refresh(true); return; }
      if (t.dataset.tech) { const bld = G.selected().find((x) => x.type === 'lab'); const r = w.command(G.pid, { c: 'research', id: bld && bld.id, tech: t.dataset.tech }); if (!r.ok) { this.toast(r.reason, 'warn'); G.audio.ui('error'); } else G.audio.ui('click'); this.refresh(true); return; }
      if (t.dataset.cancelres) { const bld = G.selected().find((x) => x.type === 'lab'); if (bld) w.command(G.pid, { c: 'cancelResearch', id: bld.id }); this.refresh(true); return; }
      if (t.dataset.owner != null) { this.spawnOwner = +t.dataset.owner; this.refresh(true); return; }
      if (t.dataset.spawn) { G.beginTarget('spawn', { type: t.dataset.spawn, owner: this.spawnOwner }); return; }
      if (t.dataset.sandbox === 'cash') { const p = w.players[G.pid]; p.res.c += 10000; p.res.m += 10000; this.toast('+10k credits and metal', 'good'); }
      if (t.dataset.sandbox === 'reveal') { G.renderer.revealAll = !G.renderer.revealAll; G.renderer.updateFog(); }
      if (t.dataset.sandbox === 'tech') { const p = w.players[G.pid]; for (const id in D.RESEARCH) { const r = D.RESEARCH[id]; if (!r.faction || r.faction === p.faction) { if (!p.has(id)) { p.tech[id] = true; w.applyTech(p, id); } } } this.toast('All research unlocked', 'good'); this.refresh(true); }
    }

    // ------------------------------------------------------------ placement & target bars
    showPlace(on) { $('placebar').classList.toggle('hidden', !on); if (on) this.updatePlace(); }
    updatePlace() {
      const pl = this.G.placing; if (!pl) return; const d = D.BUILDINGS[pl.type];
      $('place-msg').textContent = pl.valid ? d.name + ' — tap ✓ to build' : pl.reason || 'Invalid position';
      $('place-msg').style.color = pl.valid ? 'var(--good)' : 'var(--bad)'; $('place-ok').disabled = !pl.valid;
    }
    showTarget(msg) { $('targetbar').classList.toggle('hidden', !msg); if (msg) $('target-msg').textContent = msg; }

    // ------------------------------------------------------------ objectives
    showObjectives(on) { $('objectives').classList.toggle('hidden', !on); if (on) this.updateObjectives(); }
    updateObjectives() {
      const m = this.w.mission; if (!m) return;
      const doneN = m.def.objectives.filter((o) => m.status[o.id] === 'done').length;
      let h = `<h4>${esc(m.def.name)} <span style="color:var(--dim);font-weight:400">${doneN}/${m.def.objectives.length} ${this.objMini ? '▸' : '▾'}</span></h4>`;
      if (this.objMini) { $('objectives').innerHTML = h; return; }
      for (const o of m.def.objectives) {
        const st = m.status[o.id]; let extra = '';
        if (o.timer && st !== 'done') extra = ' — ' + U.fmtTime(Math.max(0, o.timer - this.w.time));
        if (o.progress && st !== 'done') extra = ' — ' + Math.round(o.progress(this.w, m) * 100) + '%';
        h += `<div class="${st || ''}">${st === 'done' ? '✓' : st === 'fail' ? '✕' : '◇'} ${esc(o.text)}${extra}</div>`;
      }
      $('objectives').innerHTML = h;
    }

    // ------------------------------------------------------------ world overlays (called by renderer in world space)
    drawWorldOverlay(g, R) {
      const G = this.G, w = this.w; const z = R.cam.zoom;
      // mission zones
      if (w._zones) for (const zn of w._zones) {
        g.strokeStyle = zn.owner === 0 ? 'rgba(120,255,140,0.8)' : zn.owner === 1 ? 'rgba(255,90,80,0.8)' : 'rgba(255,220,120,0.7)'; g.lineWidth = 2 / z; g.setLineDash([10 / z, 6 / z]);
        g.beginPath(); g.arc(zn.x, zn.y, zn.r, 0, 7); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,220,120,0.06)'; g.fill();
      }
      if (w._depot) { g.strokeStyle = 'rgba(120,200,255,0.8)'; g.lineWidth = 2 / z; g.setLineDash([10 / z, 6 / z]); g.beginPath(); g.arc(w._depot.x, w._depot.y, w._depot.r, 0, 7); g.stroke(); g.setLineDash([]); }
      if (w._lost) for (const id of w._lost) { const u = w.get(id); if (u && u.locked) { const p = 0.5 + 0.5 * Math.sin(R.time * 4); g.strokeStyle = `rgba(255,220,80,${0.4 + p * 0.5})`; g.lineWidth = 2 / z; g.beginPath(); g.arc(u.x, u.y, 30 + p * 10, 0, 7); g.stroke(); } }
      // selected single unit: weapon range & aura
      const sel = G.selected();
      if (sel.length === 1 && sel[0].kind === 'unit') {
        const e = sel[0]; const d = D.UNITS[e.type];
        if (d.weapons) { const wd = D.WEAPONS[d.weapons[0]]; g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1 / z; g.beginPath(); g.arc(e.x, e.y, w.weaponRange(e, wd), 0, 7); g.stroke(); if (wd.minRange) { g.strokeStyle = 'rgba(255,90,80,0.2)'; g.beginPath(); g.arc(e.x, e.y, wd.minRange, 0, 7); g.stroke(); } }
        if (d.jam) { g.fillStyle = 'rgba(120,255,255,0.05)'; g.beginPath(); g.arc(e.x, e.y, d.jam, 0, 7); g.fill(); }
        if (d.repairAura) { g.strokeStyle = 'rgba(120,255,140,0.2)'; g.beginPath(); g.arc(e.x, e.y, d.repairAura.r, 0, 7); g.stroke(); }
      }
      // placement ghost
      const pl = G.placing;
      if (pl) {
        const d = D.BUILDINGS[pl.type]; const p = w.players[G.pid];
        // highlight valid deposits
        if (d.on) for (const dep of w.map.deposits) { if (dep.kind !== d.on || w.map.occ[w.map.idx(dep.tx, dep.ty)]) continue; g.strokeStyle = 'rgba(120,255,140,0.5)'; g.lineWidth = 1.5 / z; g.strokeRect(dep.tx * TILE, dep.ty * TILE, 64, 64); }
        const s = ART.bld(pl.type, p.faction, p.color);
        g.globalAlpha = 0.6; g.drawImage(s.img, pl.tx * TILE, pl.ty * TILE, d.w * TILE, d.h * TILE); g.globalAlpha = 1;
        g.fillStyle = pl.valid ? 'rgba(80,255,120,0.22)' : 'rgba(255,60,50,0.3)'; g.fillRect(pl.tx * TILE, pl.ty * TILE, d.w * TILE, d.h * TILE);
        g.strokeStyle = pl.valid ? 'rgba(80,255,120,0.9)' : 'rgba(255,60,50,0.9)'; g.lineWidth = 2 / z; g.strokeRect(pl.tx * TILE, pl.ty * TILE, d.w * TILE, d.h * TILE);
        const bd = D.bldFor(pl.type, p.faction);
        if (bd.weapons) { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc((pl.tx + d.w / 2) * TILE, (pl.ty + d.h / 2) * TILE, D.WEAPONS[bd.weapons[0]].range, 0, 7); g.stroke(); }
        if (bd.radar) { g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc((pl.tx + d.w / 2) * TILE, (pl.ty + d.h / 2) * TILE, bd.radar, 0, 7); g.stroke(); }
      }
      if (G.targetMode && G.targetMode.kind === 'strike') { const s = R.screenToWorld(G.input.mouse.x, G.input.mouse.y); g.strokeStyle = 'rgba(255,60,40,0.8)'; g.lineWidth = 2 / z; g.beginPath(); g.arc(s.x, s.y, D.WEAPONS.silo.splash, 0, 7); g.stroke(); }
    }
  }
  WF.HUD = HUD;
})(window.WF = window.WF || {});
