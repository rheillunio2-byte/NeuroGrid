/* NeuroGrid — theme bridge: applies theme/accent preferences to <html> and exposes
 * resolved colours to canvas renderers (canvas cannot read CSS variables directly). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const store = NG.store;
  const ACCENTS = {
    cyan: ['94,234,212', 'Cyan'], violet: ['167,139,250', 'Violet'], blue: ['122,167,255', 'Blue'],
    green: ['110,231,168', 'Green'], amber: ['244,192,106', 'Amber'], rose: ['242,137,159', 'Rose'],
  };
  const THEMES = { midnight: 'Midnight', abyss: 'Abyss', daylight: 'Daylight' };
  const theme = (NG.theme = NG.util.emitter({ ACCENTS, THEMES, c: {} }));

  const css = (cs, name) => cs.getPropertyValue(name).trim();
  theme.refresh = () => {
    const cs = getComputedStyle(document.documentElement), c = theme.c;
    c.accentRgb = css(cs, '--accent-rgb'); c.accent = `rgb(${c.accentRgb})`; c.accentInk = css(cs, '--accent-ink') || c.accent;
    c.text = css(cs, '--text'); c.text2 = css(cs, '--text-2'); c.text3 = css(cs, '--text-3');
    c.line = css(cs, '--line'); c.line2 = css(cs, '--line-2'); c.grid = css(cs, '--grid'); c.bg = css(cs, '--bg'); c.surface = css(cs, '--surface');
    c.violet = css(cs, '--violet'); c.blue = css(cs, '--blue'); c.amber = css(cs, '--amber'); c.rose = css(cs, '--rose'); c.green = css(cs, '--green');
    c.bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'].map((b) => css(cs, '--band-' + b));
    c.light = document.documentElement.dataset.theme === 'daylight';
    theme.emit('change', c);
  };
  theme.apply = () => {
    const root = document.documentElement, t = store.get('ui.theme'), a = store.get('ui.accent');
    root.dataset.theme = t; root.dataset.accent = a;
    root.style.setProperty('--accent-rgb', ACCENTS[a][0]);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = { midnight: '#060a14', abyss: '#010204', daylight: '#eef2f9' }[t];
    requestAnimationFrame(theme.refresh);
  };
  theme.burstColors = () => [theme.c.accent, theme.c.violet, theme.c.blue, theme.c.amber];
  /** rgba string from the accent with alpha */
  theme.a = (alpha) => `rgba(${theme.c.accentRgb},${alpha})`;
  /** hex or css colour -> rgba with alpha (supports #rrggbb) */
  theme.alpha = (hex, alpha) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  store.on('ui.theme', theme.apply); store.on('ui.accent', theme.apply); store.on('reset', theme.apply);
  theme.apply(); theme.refresh();
})();
