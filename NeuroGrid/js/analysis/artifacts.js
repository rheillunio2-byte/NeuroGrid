/* NeuroGrid — artifact simulator.
 * Every artifact is a PURE function of (absolute sample index, seed), so a scrolling display shows the same
 * artifact at the same moment on every frame, and tests can reproduce them exactly. All values are SIMULATED µV. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.artifacts = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2;

  /** Deterministic hash → [0,1). */
  function hash(i, seed) {
    let h = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul((seed | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function gauss(i, seed) { const u = Math.max(1e-12, hash(i, seed)), v = hash(i, seed ^ 0x5bd1e995); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

  const KINDS = [
    { id: 'blink', name: 'Eye blinks', unit: 'µV peak', max: 150, def: 70, desc: 'Slow, large, frontal-dominant deflections (~0.3 s) caused by the eye moving behind the eyelid.', fix: 'Low-pass or ICA/regression are used in practice; a plain high-pass cannot fully remove them.' },
    { id: 'emg', name: 'Muscle (EMG)', unit: 'µV RMS', max: 40, def: 12, desc: 'Broadband, high-frequency fuzz from jaw and neck muscles, arriving in bursts.', fix: 'Low-pass or smoothing reduces it, but it overlaps beta/gamma, so real activity is lost too.' },
    { id: 'line', name: 'Power-line hum', unit: 'µV amplitude', max: 60, def: 20, desc: 'A narrow spectral spike at the mains frequency (50 or 60 Hz) and a weak harmonic.', fix: 'A narrow notch filter removes it with little damage to nearby frequencies.' },
    { id: 'drift', name: 'Baseline drift', unit: 'µV amplitude', max: 120, def: 40, desc: 'Very slow wandering of the baseline from sweat, electrode settling or movement.', fix: 'A gentle high-pass (≈0.5 Hz) removes it.' },
    { id: 'pop', name: 'Electrode movement', unit: 'µV step', max: 200, def: 80, desc: 'Abrupt steps or “pops” that decay slowly, caused by an electrode shifting on the skin.', fix: 'Hard to filter without distortion; epochs containing pops are usually rejected.' },
    { id: 'noise', name: 'Random noise', unit: 'µV RMS', max: 30, def: 8, desc: 'Broadband Gaussian noise from the amplifier and electrode–skin interface.', fix: 'Averaging trials or low-pass filtering reduces it; it never vanishes entirely.' },
  ];
  const defaults = () => { const c = {}; KINDS.forEach((k) => { c[k.id] = { on: false, amp: k.def }; }); return c; };

  /** Blink events: one candidate per 2.5 s slot at a hashed offset (so spacing is irregular but reproducible). */
  function blinkAt(i, fs, seed) {
    const slot = 2.5 * fs, s0 = Math.floor(i / slot); let v = 0;
    for (let s = s0 - 1; s <= s0; s++) {
      if (hash(s, seed + 11) < 0.35) continue; // some slots have no blink
      const c = (s + 0.15 + 0.7 * hash(s, seed + 12)) * slot, t = (i - c) / fs;
      if (Math.abs(t) < 0.6) v += Math.exp(-((t / 0.11) ** 2));
    }
    return v;
  }
  function popAt(i, fs, seed) {
    const slot = 4 * fs, s0 = Math.floor(i / slot); let v = 0;
    for (let s = s0 - 1; s <= s0; s++) {
      if (hash(s, seed + 21) < 0.4) continue;
      const c = Math.floor((s + 0.1 + 0.8 * hash(s, seed + 22)) * slot), t = (i - c) / fs;
      if (t >= 0 && t < 2) v += (hash(s, seed + 23) < 0.5 ? -1 : 1) * Math.exp(-t / 0.6);
    }
    return v;
  }
  function emgEnv(i, fs, seed) {
    const slot = 0.8 * fs, s = Math.floor(i / slot), f = i / slot - s, a = hash(s, seed + 31) < 0.5 ? 0.15 + 0.85 * hash(s, seed + 32) : 0.05, b = hash(s + 1, seed + 31) < 0.5 ? 0.15 + 0.85 * hash(s + 1, seed + 32) : 0.05;
    const m = (1 - Math.cos(Math.PI * f)) / 2; return a + (b - a) * m;
  }

  /** Value (µV) of one artifact kind at absolute sample index i. */
  function sample(kind, i, fs, amp, seed, mains) {
    switch (kind) {
      case 'blink': return amp * blinkAt(i, fs, seed);
      case 'emg': return amp * emgEnv(i, fs, seed) * 1.7 * (gauss(i, seed + 41) - gauss(i - 1, seed + 41)) * 0.7071;
      case 'line': { const ph = (TAU * (mains || 60) * i) / fs; return amp * (Math.sin(ph) + 0.1 * Math.sin(2 * ph)); }
      case 'drift': { const t = i / fs; return amp * (0.7 * Math.sin(TAU * 0.11 * t + 1.3) + 0.5 * Math.sin(TAU * 0.29 * t + 0.4)); }
      case 'pop': return amp * popAt(i, fs, seed);
      case 'noise': return amp * gauss(i, seed + 51);
      default: return 0;
    }
  }

  /** Render the enabled artifacts of cfg for samples [i0, i0+n) into out (added to what is there if add=true).
   *  cfg: { blink:{on,amp}, … }. Returns out. */
  function render(cfg, i0, n, fs, seed, out, opts = {}) {
    out = out || new Float32Array(n); if (!opts.add) out.fill(0);
    for (const k of KINDS) { const c = cfg[k.id]; if (!c || !c.on || !(c.amp > 0)) continue; for (let j = 0; j < n; j++) out[j] += sample(k.id, i0 + j, fs, c.amp, seed, opts.mains); }
    return out;
  }
  /** Fraction of channel `c` weight for an artifact (frontal channels see blinks more). */
  const channelGain = { blink: { Fp1: 1, Fp2: 0.95, C3: 0.1, C4: 0.1, O1: 0.03, O2: 0.03 }, emg: { Fp1: 1, Fp2: 1, C3: 0.5, C4: 0.5, O1: 0.3, O2: 0.3 } };

  return { KINDS, defaults, hash, gauss, sample, render, channelGain, blinkAt };
});
