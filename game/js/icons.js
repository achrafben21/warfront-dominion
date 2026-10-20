/* WARFRONT: DOMINION v2 — UI iconography (inline SVG, consistent 24px stroke set) and
 * rendered unit/structure portraits for buttons and panels. */
(function (WF) {
  'use strict';
  const ART = WF.ART, D = WF.D;
  const S = (body, fill) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const I = {
    menu: S('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    pause: S('<path d="M8 5v14M16 5v14"/>'),
    play: S('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
    box: S('<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="3 2.5"/><path d="M14 14l6 6"/>'),
    build: S('<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/><path d="M12 5V2"/>'),
    army: S('<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L13 3h3v3l-3.5 3.5"/>'),
    wrench: S('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/>'),
    hold: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12h6"/>'),
    amove: S('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
    patrol: S('<path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M6 21v-4h4"/>'),
    retreat: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    formation: S('<circle cx="6" cy="7" r="1.6" fill="currentColor"/><circle cx="12" cy="7" r="1.6" fill="currentColor"/><circle cx="18" cy="7" r="1.6" fill="currentColor"/><circle cx="9" cy="13" r="1.6" fill="currentColor"/><circle cx="15" cy="13" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>'),
    regroup: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>'),
    queue: S('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3 6h1M3 12h1M3 18h1"/>'),
    group: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>'),
    unload: S('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>'),
    produce: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    rally: S('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    research: S('<path d="M9 3h6M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
    strike: S('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 10L9 4.8a8 8 0 0 1 6 0z" fill="currentColor"/><path d="M13.7 13l6 .1a8 8 0 0 1-3 5.2z" fill="currentColor"/><path d="M10.3 13l-3 5.3a8 8 0 0 1-3-5.2z" fill="currentColor"/>'),
    demolish: S('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/><path d="M10 11v6M14 11v6"/>'),
    cancel: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: S('<path d="M4 12l5 5L20 6"/>'),
    credits: S('<circle cx="12" cy="12" r="9" fill="#e8b84a" stroke="#8a6510"/><path d="M12 7v10M9.5 9.5c0-1.4 5-1.4 5 0s-5 1.6-5 3.2 5 1.6 5 0" stroke="#4a3407" stroke-width="1.6"/>'),
    metal: S('<path d="M4 9l8-5 8 5-8 5z" fill="#c7d3dc" stroke="#5d6873"/><path d="M4 9v6l8 5 8-5V9" fill="#8b98a3" stroke="#5d6873"/><path d="M12 14v6" stroke="#5d6873"/>'),
    power: S('<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#ffd34a" stroke="#b07a10"/>'),
    units: S('<circle cx="9" cy="8" r="3.2" fill="#9cc7ff" stroke="#9cc7ff"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" fill="#9cc7ff" stroke="#9cc7ff"/><circle cx="17" cy="9" r="2.4" stroke="#9cc7ff"/><path d="M15.5 14c3 0 5.5 2 5.5 5" stroke="#9cc7ff"/>'),
    clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    speed: S('<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor"/>'),
    star: S('<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor"/>'),
    settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    save: S('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    load: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    book: S('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z"/><path d="M4 4.5v18"/><path d="M9 7h7M9 11h5"/>'),
    flag: S('<path d="M5 21V4"/><path d="M5 4c5-3 8 3 14 0v9c-6 3-9-3-14 0"/>'),
    sword: S('<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4"/>'),
    sandbox: S('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
    play2: S('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
    info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'),
  };
  WF.ICON = I;

  /** Faction emblem as SVG (for menus & cards). */
  WF.factionEmblem = function (f, size) {
    const s = size || 40;
    if (f === 'vortex') return `<svg viewBox="0 0 40 40" width="${s}" height="${s}"><defs><radialGradient id="ve" cx="50%" cy="40%"><stop offset="0" stop-color="#9ffaff"/><stop offset="1" stop-color="#1b6d78"/></radialGradient></defs><path d="M20 2l16 9v18l-16 9-16-9V11z" fill="#1b2430" stroke="#5ff3ff" stroke-width="2"/><circle cx="20" cy="20" r="9" fill="none" stroke="url(#ve)" stroke-width="3"/><circle cx="20" cy="20" r="3.5" fill="#5ff3ff"/></svg>`;
    if (f === 'iron') return `<svg viewBox="0 0 40 40" width="${s}" height="${s}"><path d="M20 2l17 18-17 18L3 20z" fill="#2a1f18" stroke="#ffb347" stroke-width="2"/><path d="M20 9l10 11-10 11-10-11z" fill="#ffb347"/><rect x="16" y="16" width="8" height="8" fill="#2a1f18"/></svg>`;
    return `<svg viewBox="0 0 40 40" width="${s}" height="${s}"><path d="M20 2l15 5v12c0 9-6.5 15-15 19C11.5 34 5 28 5 19V7z" fill="#1d2414" stroke="#e3c46e" stroke-width="2"/><path d="M20 10l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" fill="#e3c46e"/></svg>`;
  };

  /** Rendered portrait icons (data URLs) for units and structures. */
  ART.iconURL = function (kind, type, faction, color) {
    const key = 'ic2|' + kind + '|' + type + '|' + faction + '|' + color;
    if (ART.cache.has(key)) return ART.cache.get(key);
    const size = 112; const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
    const bg = g.createRadialGradient(size * 0.45, size * 0.35, 4, size / 2, size / 2, size * 0.75);
    bg.addColorStop(0, '#3a4a3c'); bg.addColorStop(0.6, '#1d2620'); bg.addColorStop(1, '#0c110e'); g.fillStyle = bg; g.fillRect(0, 0, size, size);
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1; for (let i = -size; i < size; i += 8) { g.beginPath(); g.moveTo(i, size); g.lineTo(i + size, 0); g.stroke(); }
    const old = ART.SS; ART.SS = 4;
    try {
      if (kind === 'unit') {
        const d = D.UNITS[type]; const R = d.radius;
        const body = ART.unitBody(type, faction, color, R, 0); const tur = ART.unitTurret(type, faction, color, R);
        const sc = Math.min(3.4, (size * 0.86) / body.w);
        g.save(); g.translate(size / 2 + 3, size / 2 + 4); g.rotate(-Math.PI / 2 - (d.cls === 'air' ? 0 : 0.4)); g.scale(sc, sc); g.globalAlpha = 0.45; g.filter = 'blur(2px)'; g.drawImage(body.img, -body.w / 2, -body.h / 2, body.w, body.h); g.restore();
        g.save(); g.translate(size / 2, size / 2); g.rotate(-Math.PI / 2 - (d.cls === 'air' ? 0 : 0.4)); g.scale(sc, sc);
        g.drawImage(body.img, -body.w / 2, -body.h / 2, body.w, body.h);
        if (tur) g.drawImage(tur.img, -tur.w / 2, -tur.h / 2, tur.w, tur.h);
        g.restore();
      } else if (kind === 'bld') {
        const b = ART.bld(type, faction, color); const sc = Math.min((size * 0.9) / b.w, (size * 0.9) / b.h);
        g.save(); g.translate(size / 2, size / 2); g.scale(sc, sc); g.drawImage(b.img, -b.w / 2, -b.h / 2, b.w, b.h);
        const t = ART.bldTurret(type, faction, color, Math.min(b.w, b.h) * 0.32); if (t) { g.rotate(-Math.PI / 4); g.drawImage(t.img, -t.w / 2, -t.h / 2, t.w, t.h); }
        g.restore();
      }
    } finally { ART.SS = old; }
    const vg = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, size, size);
    const url = c.toDataURL(); ART.cache.set(key, url); return url;
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (global.WF = global.WF || {}));
