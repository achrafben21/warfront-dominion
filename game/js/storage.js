/* WARFRONT: DOMINION — persistent storage: native Android file bridge (atomic writes) with localStorage fallback. */
(function (WF) {
  'use strict';
  const nat = typeof window !== 'undefined' && window.WarfrontNative ? window.WarfrontNative : null;
  const S = {
    native: !!nat,
    get(key) {
      try { if (nat) { const v = nat.load(key); return v == null ? null : String(v); } return localStorage.getItem('wf_' + key); } catch (e) { return null; }
    },
    set(key, val) {
      try { if (nat) return !!nat.save(key, val); localStorage.setItem('wf_' + key, val); return true; } catch (e) { return false; }
    },
    remove(key) { try { if (nat) return nat.remove(key); localStorage.removeItem('wf_' + key); return true; } catch (e) { return false; } },
    getJSON(key, def) { const v = S.get(key); if (!v) return def; try { return JSON.parse(v); } catch (e) { return def; } },
    setJSON(key, obj) { return S.set(key, JSON.stringify(obj)); },
  };
  S.defaults = {
    master: 0.8, music: 0.45, sfx: 0.85, camSpeed: 1, zoomSpeed: 1, uiScale: 1, quality: 'medium', lowFx: false, shake: true,
    unitCap: 200, edgePan: true, showFps: false, aiIncomeBonus: true, campaignDiff: 'normal', haptics: true,
  };
  S.loadSettings = () => Object.assign({}, S.defaults, S.getJSON('settings', {}));
  S.saveSettings = (s) => S.setJSON('settings', s);
  WF.Store = S;
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
