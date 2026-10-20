/* WARFRONT: DOMINION — touch & mouse input for the battlefield and minimap.
 * Touch: tap = select / smart order, one-finger drag = pan, pinch = zoom, long-press + drag = box select
 * (or toggle box mode), two-finger tap = deselect. Mouse: left select/box, right order, wheel zoom, WASD pan. */
(function (WF) {
  'use strict';
  const U = WF.U;
  class Input {
    constructor(game, canvas, mini) {
      this.G = game; this.cv = canvas; this.mini = mini;
      this.ptrs = new Map(); this.mode = null; this.boxMode = false; this.box = null;
      this.keys = new Set(); this.mouse = { x: -1, y: -1, inside: false };
      this.lastTap = { t: 0, id: 0 };
      const o = { passive: false };
      canvas.addEventListener('pointerdown', (e) => this.down(e), o);
      canvas.addEventListener('pointermove', (e) => this.move(e), o);
      canvas.addEventListener('pointerup', (e) => this.up(e), o);
      canvas.addEventListener('pointercancel', (e) => this.cancel(e), o);
      canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
      canvas.addEventListener('wheel', (e) => this.wheel(e), o);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      mini.addEventListener('pointerdown', (e) => { e.preventDefault(); try { mini.setPointerCapture(e.pointerId); } catch (err) {} this.miniDrag = { id: e.pointerId, btn: e.button, moved: false, sx: e.clientX, sy: e.clientY }; if (e.button !== 2) this.miniAt(e); }, o);
      mini.addEventListener('pointermove', (e) => { if (this.miniDrag && this.miniDrag.id === e.pointerId) { this.miniDrag.moved = true; if (this.miniDrag.btn !== 2) this.miniAt(e); } });
      mini.addEventListener('pointerup', (e) => { if (this.miniDrag && this.miniDrag.btn === 2) this.miniOrder(e); this.miniDrag = null; });
      mini.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
    }
    get R() { return this.G.renderer; }
    pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    miniPos(e) { const r = this.mini.getBoundingClientRect(); const sx = this.mini.width / r.width; return this.R.minimapToWorld((e.clientX - r.left) * sx, (e.clientY - r.top) * sx); }
    miniAt(e) {
      if (!this.R) return; const p = this.miniPos(e); if (!p) return;
      // if awaiting a target, a minimap tap issues it there
      if (this.G.targetMode && !this.miniDrag.moved) { this.G.targetAt(p.x, p.y); return; }
      this.R.cam.x = p.x; this.R.cam.y = p.y; this.R.clampCam();
    }
    miniOrder(e) { const p = this.miniPos(e); if (p) this.G.smartOrder(p.x, p.y, null, e.shiftKey); }

    down(e) {
      e.preventDefault(); if (!this.R) return;
      try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
      this.G.audioInit();
      const p = this.pos(e);
      this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), type: e.pointerType, btn: e.button, moved: false });
      if (e.pointerType === 'mouse') {
        if (e.button === 1) { this.mode = 'pan'; return; }
        if (e.button === 2) { this.mode = 'rclick'; return; }
        this.mode = 'mpress';
        return;
      }
      if (this.ptrs.size === 1) {
        this.mode = this.boxMode ? 'box' : 'press';
        if (this.mode === 'box') this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        clearTimeout(this.lpTimer);
        if (!this.boxMode) this.lpTimer = setTimeout(() => {
          if (this.mode === 'press') { this.mode = 'box'; this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; this.G.haptic(15); }
        }, 380);
      } else if (this.ptrs.size === 2) {
        clearTimeout(this.lpTimer); this.mode = 'pinch'; this.box = null;
        const [a, b] = [...this.ptrs.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: this.R.cam.zoom, t: performance.now(), moved: false };
      }
    }
    move(e) {
      const p = this.pos(e); this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.inside = true;
      const pt = this.ptrs.get(e.pointerId);
      if (this.G.placing && e.pointerType === 'mouse') this.G.placeHover(p.x, p.y);
      if (!pt || !this.R) return;
      e.preventDefault();
      const dx = p.x - pt.x, dy = p.y - pt.y; pt.x = p.x; pt.y = p.y;
      if (Math.hypot(p.x - pt.sx, p.y - pt.sy) > (pt.type === 'mouse' ? 5 : 10)) pt.moved = true;
      const cam = this.R.cam; const sens = this.G.settings.camSpeed;
      if (this.mode === 'press' && pt.moved) { clearTimeout(this.lpTimer); this.mode = this.G.placing ? 'placedrag' : 'pan'; }
      if (this.mode === 'placedrag') { this.G.placeHover(p.x, p.y); return; }
      if (this.mode === 'pan') { cam.x -= dx / cam.zoom * sens; cam.y -= dy / cam.zoom * sens; this.R.clampCam(); this.velocity = { x: dx, y: dy, t: performance.now() }; }
      else if (this.mode === 'mpress' && pt.moved) { this.mode = 'box'; this.box = { x0: pt.sx, y0: pt.sy, x1: p.x, y1: p.y }; }
      else if (this.mode === 'box' && this.box) { this.box.x1 = p.x; this.box.y1 = p.y; this.edgeScroll(p); }
      else if (this.mode === 'pinch' && this.ptrs.size >= 2) {
        const [a, b] = [...this.ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (Math.abs(d - this.pinch.d) > 6 || Math.hypot(cx - this.pinch.cx, cy - this.pinch.cy) > 6) this.pinch.moved = true;
        const before = this.R.screenToWorld(cx, cy);
        cam.zoom = U.clamp(this.pinch.zoom * Math.pow(d / this.pinch.d, this.G.settings.zoomSpeed), this.R.minZoom, 2.4);
        const after = this.R.screenToWorld(cx, cy);
        cam.x += before.x - after.x; cam.y += before.y - after.y;
        // two-finger pan
        cam.x -= (cx - this.pinch.cx) / cam.zoom; cam.y -= (cy - this.pinch.cy) / cam.zoom; this.pinch.cx = cx; this.pinch.cy = cy;
        this.R.clampCam();
      }
    }
    up(e) {
      const pt = this.ptrs.get(e.pointerId); if (!pt) return;
      e.preventDefault(); clearTimeout(this.lpTimer);
      const p = this.pos(e); this.ptrs.delete(e.pointerId);
      const dur = performance.now() - pt.t;
      if (this.mode === 'pinch') {
        if (this.ptrs.size === 0) { if (!this.pinch.moved && performance.now() - this.pinch.t < 300) this.G.deselect(); this.mode = null; }
        return;
      }
      if (this.mode === 'box' && this.box) {
        const b = this.box; this.box = null; this.mode = null;
        if (Math.abs(b.x1 - b.x0) > 8 || Math.abs(b.y1 - b.y0) > 8) this.G.boxSelect(b, e.shiftKey || e.ctrlKey);
        else this.G.tap(p.x, p.y, e.shiftKey);
        if (this.boxMode && !this.G.settings.stickyBox) this.G.hud.setBoxMode(false);
        return;
      }
      if (this.mode === 'rclick') { this.mode = null; if (!pt.moved) { const w = this.R.screenToWorld(p.x, p.y); if (this.G.placing) this.G.cancelPlace(); else if (this.G.targetMode) this.G.cancelTarget(); else this.G.smartOrder(w.x, w.y, this.G.pick(p.x, p.y), e.shiftKey); } return; }
      if ((this.mode === 'press' || this.mode === 'mpress') && !pt.moved && dur < 600) { this.mode = null; this.G.tap(p.x, p.y, e.shiftKey || e.ctrlKey); return; }
      if (this.mode === 'pan' && this.velocity && performance.now() - this.velocity.t < 60 && pt.type !== 'mouse') this.fling = { x: this.velocity.x, y: this.velocity.y };
      this.mode = null;
    }
    cancel(e) { this.ptrs.delete(e.pointerId); clearTimeout(this.lpTimer); if (!this.ptrs.size) { this.mode = null; this.box = null; } }
    wheel(e) {
      e.preventDefault(); if (!this.R) return;
      const p = this.pos(e); const cam = this.R.cam; const before = this.R.screenToWorld(p.x, p.y);
      cam.zoom = U.clamp(cam.zoom * Math.pow(1.0015, -e.deltaY * this.G.settings.zoomSpeed), this.R.minZoom, 2.4);
      const after = this.R.screenToWorld(p.x, p.y); cam.x += before.x - after.x; cam.y += before.y - after.y; this.R.clampCam();
    }
    edgeScroll(p) { this.edgeP = p; }
    key(e, down) {
      if (!this.R || this.G.screenOpen()) return;
      const k = e.key.toLowerCase();
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (!down) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      const G = this.G;
      if (k >= '1' && k <= '5') { if (e.ctrlKey || e.metaKey) { G.assignGroup(+k); e.preventDefault(); } else G.recallGroup(+k); }
      else if (k === 'escape') { if (G.placing) G.cancelPlace(); else if (G.targetMode) G.cancelTarget(); else G.togglePause(); }
      else if (k === 's' && !e.ctrlKey) G.cmd('stop');
      else if (k === 'h') G.cmd('hold');
      else if (k === 'a' && !e.ctrlKey && G.sel.size) G.beginTarget('amove');
      else if (k === 'p') G.beginTarget('patrol');
      else if (k === 'r') G.cmd('retreat');
      else if (k === 'f') G.cycleFormation();
      else if (k === ' ') { G.renderer.centerOn(G.world.players[G.pid]); e.preventDefault(); }
      else if (k === 'b') G.hud.openBuild();
      else if (k === 'delete') G.cmd('sell');
    }
    /** Called every frame: keyboard pan, edge pan, fling inertia. */
    update(dt) {
      if (!this.R) return;
      const cam = this.R.cam; const sp = 700 * dt / cam.zoom * this.G.settings.camSpeed; let mx = 0, my = 0;
      if (this.keys.has('arrowleft')) mx -= 1; if (this.keys.has('arrowright')) mx += 1;
      if (this.keys.has('arrowup')) my -= 1; if (this.keys.has('arrowdown')) my += 1;
      if (this.G.settings.edgePan && this.mouse.inside && !this.ptrs.size && matchMedia('(pointer: fine)').matches) {
        const m = 12; if (this.mouse.x < m) mx -= 1; if (this.mouse.x > this.R.sw - m) mx += 1; if (this.mouse.y < m) my -= 1; if (this.mouse.y > this.R.sh - m) my += 1;
      }
      if (this.mode === 'box' && this.edgeP) { const m = 30; const p = this.edgeP; if (p.x < m) mx -= 0.6; if (p.x > this.R.sw - m) mx += 0.6; if (p.y < m + 30) my -= 0.6; if (p.y > this.R.sh - m) my += 0.6; }
      if (mx || my) { cam.x += mx * sp; cam.y += my * sp; this.R.clampCam(); }
      if (this.fling && !this.ptrs.size) {
        cam.x -= this.fling.x / cam.zoom * this.G.settings.camSpeed; cam.y -= this.fling.y / cam.zoom * this.G.settings.camSpeed; this.R.clampCam();
        this.fling.x *= Math.pow(0.004, dt); this.fling.y *= Math.pow(0.004, dt);
        if (Math.abs(this.fling.x) + Math.abs(this.fling.y) < 0.3) this.fling = null;
      } else if (this.ptrs.size) this.fling = null;
    }
    drawBox(g) {
      if (!this.box) return; const b = this.box;
      g.strokeStyle = 'rgba(120,255,140,0.9)'; g.fillStyle = 'rgba(120,255,140,0.12)'; g.lineWidth = 1.5;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
    }
  }
  WF.Input = Input;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
