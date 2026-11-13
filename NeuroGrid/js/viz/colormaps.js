/* NeuroGrid — perceptual colour maps (control-point approximations of Viridis, Inferno, Plasma) + grayscale. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.colormaps = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const hex = (s) => s.split(' ').map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const MAPS = {
    viridis: hex('#440154 #482878 #3e4989 #31688e #26828e #1f9e89 #35b779 #6ece58 #b5de2b #fde725'),
    inferno: hex('#000004 #160b39 #420a68 #6a176e #932667 #bc3754 #dd513a #f37819 #fca50a #f6d746 #fcffa4'),
    plasma: hex('#0d0887 #46039f #7201a8 #9c179e #bd3786 #d8576b #ed7953 #fb9f3a #fdca26 #f0f921'),
    gray: hex('#000000 #ffffff'),
  };
  const NAMES = { viridis: 'Viridis', inferno: 'Inferno', plasma: 'Plasma', gray: 'Grayscale' };
  /** t in [0,1] → [r,g,b] */
  function color(name, t) {
    const m = MAPS[name] || MAPS.viridis; t = t !== t ? 0 : Math.min(1, Math.max(0, t));
    const p = t * (m.length - 1), i = Math.min(m.length - 2, Math.floor(p)), f = p - i, a = m[i], b = m[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  /** 256-entry lookup table (Uint8ClampedArray, RGB) for fast image painting. */
  function lut(name) { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const c = color(name, i / 255); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; } return o; }
  return { MAPS, NAMES, color, lut };
});
