/* WARFRONT: DOMINION — procedural audio engine (WebAudio). All sounds and music are synthesized
 * at runtime: no external audio files, no licensing issues. Voices are throttled for mobile CPUs. */
(function (WF) {
  'use strict';
  class Audio {
    constructor(settings) {
      this.s = settings; this.ctx = null; this.ok = false; this.last = {}; this.voices = 0; this.musicOn = false;
    }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.connect(c.destination);
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 6; this.comp.connect(this.master);
      this.sfx = c.createGain(); this.sfx.connect(this.comp);
      this.music = c.createGain(); this.music.connect(this.master);
      const len = c.sampleRate; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b; this.ok = true; this.apply();
    }
    apply() {
      if (!this.ok) return;
      this.master.gain.value = this.s.master; this.sfx.gain.value = this.s.sfx; this.music.gain.value = this.s.music * 0.5;
    }
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    _gate(key, ms) { const t = performance.now(); if (this.last[key] && t - this.last[key] < ms) return false; this.last[key] = t; return true; }
    _pos(x, y, cam) {
      if (x == null || !cam) return { vol: 1, pan: 0 };
      const dx = (x - cam.x) * cam.zoom, dy = (y - cam.y) * cam.zoom; const d = Math.sqrt(dx * dx + dy * dy);
      const vol = Math.max(0, 1 - d / 900) * (0.55 + 0.45 * Math.min(1, cam.zoom));
      return { vol, pan: Math.max(-1, Math.min(1, dx / 500)) };
    }
    _out(vol, pan) {
      const c = this.ctx; const g = c.createGain(); g.gain.value = vol;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
      return g;
    }
    _noise(out, t, dur, type, f0, f1, q, v0) {
      const c = this.ctx; const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
      const g = c.createGain(); g.gain.setValueAtTime(v0, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
      this.voices++; src.onended = () => this.voices--;
    }
    _tone(out, t, dur, type, f0, f1, v0, attack) {
      const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v0, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); this.voices++; o.onended = () => this.voices--;
    }

    weapon(snd, x, y, cam) {
      if (!this.ok || !snd || this.voices > 28) return;
      const { vol, pan } = this._pos(x, y, cam); if (vol < 0.05) return;
      if (!this._gate(snd, snd === 'mg' || snd === 'rifle' ? 70 : 90)) return;
      const t = this.ctx.currentTime, out = this._out(vol, pan);
      switch (snd) {
        case 'rifle': this._noise(out, t, 0.09, 'highpass', 1800, 0, 0.7, 0.45); this._noise(out, t, 0.05, 'lowpass', 900, 0, 1, 0.3); break;
        case 'mg': this._noise(out, t, 0.06, 'bandpass', 1400, 600, 0.8, 0.5); break;
        case 'cannon_s': this._tone(out, t, 0.25, 'sine', 160, 50, 0.6); this._noise(out, t, 0.22, 'lowpass', 1600, 300, 0.7, 0.5); break;
        case 'cannon': this._tone(out, t, 0.4, 'sine', 120, 38, 0.8); this._noise(out, t, 0.35, 'lowpass', 1200, 200, 0.7, 0.6); break;
        case 'cannon_h': this._tone(out, t, 0.6, 'sine', 95, 30, 0.9); this._noise(out, t, 0.55, 'lowpass', 900, 120, 0.6, 0.7); break;
        case 'rocket': this._noise(out, t, 0.45, 'bandpass', 500, 2400, 1.5, 0.35); this._tone(out, t, 0.12, 'triangle', 200, 80, 0.2); break;
        case 'missile': this._noise(out, t, 0.6, 'bandpass', 900, 3000, 2, 0.3); break;
        case 'flak': this._noise(out, t, 0.12, 'bandpass', 900, 300, 1, 0.5); this._tone(out, t, 0.1, 'square', 220, 90, 0.08); break;
        case 'plasma': this._tone(out, t, 0.22, 'sawtooth', 1400, 180, 0.18); this._tone(out, t, 0.18, 'sine', 700, 120, 0.25); break;
        case 'torpedo': this._noise(out, t, 0.5, 'lowpass', 400, 150, 1, 0.4); break;
        case 'bomb': this._tone(out, t, 0.5, 'sine', 1400, 500, 0.08); break;
      }
    }
    impact(e, cam) {
      if (!this.ok || this.voices > 30) return;
      const { vol, pan } = this._pos(e.x, e.y, cam); if (vol < 0.05) return;
      const big = e.kind === 'nuke' ? 3 : e.splash > 45 ? 2 : e.splash > 20 ? 1 : 0;
      if (!this._gate('imp' + big, big ? 70 : 110)) return;
      const t = this.ctx.currentTime, out = this._out(vol * (big === 3 ? 1.6 : 1), pan);
      if (e.water) { this._noise(out, t, 0.4, 'highpass', 800, 0, 0.5, 0.3); return; }
      const dur = [0.25, 0.5, 0.8, 3.2][big];
      this._noise(out, t, dur, 'lowpass', [1800, 1200, 800, 600][big], 60, 0.7, [0.4, 0.6, 0.8, 1][big]);
      this._tone(out, t, dur * 0.8, 'sine', [110, 80, 60, 45][big], 25, [0.3, 0.6, 0.9, 1][big]);
    }
    explosion(size, x, y, cam) {
      if (!this.ok) return; const { vol, pan } = this._pos(x, y, cam); if (vol < 0.05) return;
      if (!this._gate('boom' + size, 120)) return;
      const t = this.ctx.currentTime, out = this._out(vol, pan);
      if (size === 0) { this._noise(out, t, 0.2, 'bandpass', 700, 300, 1, 0.25); return; }
      this._noise(out, t, size === 2 ? 1.6 : 0.9, 'lowpass', 1400, 50, 0.6, 0.9);
      this._tone(out, t, size === 2 ? 1.2 : 0.7, 'sine', 70, 22, 1);
      if (size === 2) this._noise(out, t + 0.15, 1.2, 'lowpass', 600, 60, 0.6, 0.6);
    }
    ui(kind) {
      if (!this.ok) return; if (!this._gate('ui' + kind, 60)) return;
      const t = this.ctx.currentTime, out = this._out(0.5, 0);
      switch (kind) {
        case 'click': this._tone(out, t, 0.05, 'square', 1200, 900, 0.06); break;
        case 'select': this._tone(out, t, 0.08, 'triangle', 700, 900, 0.12); break;
        case 'move': this._tone(out, t, 0.08, 'triangle', 520, 640, 0.12); this._tone(out, t + 0.06, 0.08, 'triangle', 640, 780, 0.1); break;
        case 'attack': this._tone(out, t, 0.12, 'sawtooth', 300, 200, 0.1); this._tone(out, t + 0.07, 0.12, 'sawtooth', 300, 180, 0.1); break;
        case 'error': this._tone(out, t, 0.18, 'square', 160, 120, 0.12); break;
        case 'built': this._tone(out, t, 0.18, 'sine', 660, 0, 0.2); this._tone(out, t + 0.12, 0.25, 'sine', 990, 0, 0.2); break;
        case 'ready': this._tone(out, t, 0.12, 'sine', 880, 0, 0.12); this._tone(out, t + 0.08, 0.14, 'sine', 1175, 0, 0.1); break;
        case 'research': [523, 659, 784, 1046].forEach((f, i) => this._tone(out, t + i * 0.09, 0.3, 'triangle', f, 0, 0.15)); break;
        case 'place': this._noise(out, t, 0.15, 'lowpass', 600, 200, 1, 0.4); this._tone(out, t, 0.12, 'square', 220, 110, 0.08); break;
        case 'alarm': for (let i = 0; i < 3; i++) { this._tone(out, t + i * 0.5, 0.45, 'sawtooth', 520, 820, 0.12, 0.2); } break;
        case 'warn': this._tone(out, t, 0.15, 'square', 440, 0, 0.1); this._tone(out, t + 0.2, 0.15, 'square', 440, 0, 0.1); break;
        case 'victory': [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(out, t + i * 0.16, 0.9, 'triangle', f, 0, 0.18, 0.02)); break;
        case 'defeat': [440, 392, 349, 262].forEach((f, i) => this._tone(out, t + i * 0.3, 0.9, 'sawtooth', f, f * 0.98, 0.1, 0.05)); break;
      }
    }

    // ------------------------------------------------------------ procedural music
    startMusic(mode) {
      if (!this.ok) return; this.musicMode = mode || 'battle';
      if (this.musicOn) return; this.musicOn = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
      const tick = () => {
        if (!this.musicOn) return;
        while (this.nextT < this.ctx.currentTime + 0.3) { this._musicStep(this.nextT, this.step++); this.nextT += this.musicMode === 'menu' ? 0.32 : 0.26; }
        this.musicTimer = setTimeout(tick, 100);
      };
      tick();
    }
    stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
    _musicStep(t, s) {
      if (this.s.music <= 0.001) return;
      const out = this.music; const bar = Math.floor(s / 16) % 4; const st = s % 16;
      const roots = [55, 55 * 1.189, 55 * 0.891, 55 * 1.059]; const r = roots[bar];
      const menu = this.musicMode === 'menu';
      if (st === 0) { // pad chord (minor)
        for (const m of [2, 2 * 1.189, 3]) this._tone(out, t, menu ? 5 : 4, 'sawtooth', r * m * 2, 0, 0.025, 1.2);
        this._tone(out, t, 4, 'sine', r, 0, 0.18, 0.3);
      }
      if (!menu) {
        if (st % 4 === 0) this._tone(out, t, 0.25, 'sine', 70, 35, 0.35); // kick
        if (st % 8 === 4) this._noise(out, t, 0.18, 'highpass', 1500, 0, 0.6, 0.12); // snare
        if (st % 2 === 1 && Math.random() < 0.5) this._noise(out, t, 0.04, 'highpass', 6000, 0, 0.6, 0.04); // hat
        if ((st === 6 || st === 7 || st === 14) && Math.random() < 0.7) this._tone(out, t, 0.2, 'triangle', r * 2, 0, 0.12); // bass ostinato
      } else if (st % 8 === 0) this._tone(out, t, 1.2, 'triangle', r * 4 * [1, 1.189, 1.335, 1.5][Math.floor(Math.random() * 4)], 0, 0.05, 0.1);
    }
  }
  WF.Audio = Audio;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
