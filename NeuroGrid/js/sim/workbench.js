/* NeuroGrid — standalone simulated recordings with a chosen sampling rate, duration, seed and (optional) mid-recording profile change.
 * Used by the Spectrogram, Topography and Research views. Always SIMULATED. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./generator.js'));
  else { root.NG = root.NG || {}; root.NG.workbench = factory(root.NG.sim); }
})(typeof self !== 'undefined' ? self : this, function (sim) {
  'use strict';
  const FS_OPTIONS = [128, 250, 256, 500, 512, 1000];
  /** opts: { profile, profile2 (switch at the midpoint), fs, seconds, seed, channels (names, default all 6), noise 0..1, line, drift, custom } */
  function generate(opts = {}) {
    const fs = opts.fs == null ? 256 : opts.fs, seconds = opts.seconds == null ? 20 : opts.seconds, seed = opts.seed == null ? 1 : opts.seed;
    if (!(fs >= 64 && fs <= 2000)) throw new Error('Sampling rate must be between 64 and 2000 Hz.');
    if (!(seconds >= 1 && seconds <= 300)) throw new Error('Duration must be between 1 and 300 seconds.');
    const names = opts.channels && opts.channels.length ? opts.channels : sim.CHANNELS.map((c) => c.name), chans = names.map((n) => { const c = sim.CHANNELS.find((x) => x.name === n); if (!c) throw new Error('Unknown channel ' + n); return c; });
    const g = new sim.Generator({ fs, seed, channels: chans }), P = g.params;
    Object.assign(P, { amplitude: opts.amplitude == null ? 1 : opts.amplitude, noise: opts.noise == null ? 0.15 : opts.noise, line: opts.line == null ? 0.05 : opts.line, drift: opts.drift == null ? 0.1 : opts.drift, mains: opts.mains || 60 });
    const p1 = opts.profile || 'calm', p2 = opts.profile2 && opts.profile2 !== p1 ? opts.profile2 : null;
    g.setProfile(sim.PROFILES[p1], opts.custom || null, true);
    for (let i = 0; i < fs; i++) g.step(); // 1 s warm-up, discarded
    const n = Math.round(seconds * fs), mk = () => chans.map(() => new Float32Array(n)), total = mk(), clean = mk(), noise = mk();
    for (let i = 0; i < n; i++) {
      if (p2 && i === Math.floor(n / 2)) g.setProfile(sim.PROFILES[p2], opts.custom || null, false);
      g.step(); for (let c = 0; c < chans.length; c++) { total[c][i] = g.total[c]; clean[c][i] = g.clean[c]; noise[c][i] = g.noise[c]; }
    }
    return { source: 'SIMULATED', fs, n, duration: seconds, seed, profile: p1, profile2: p2, switchAt: p2 ? seconds / 2 : null, channels: chans.map((c, i) => ({ name: c.name, region: c.region, data: total[i], clean: clean[i], noise: noise[i] })), unit: 'µV' };
  }
  return { generate, FS_OPTIONS };
});
