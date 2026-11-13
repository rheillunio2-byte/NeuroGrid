/* NeuroGrid — synthetic EEG-like signal generator.
 *
 * Everything produced here is SIMULATED. Each channel is the sum of
 *   • a "neural" component: banks of slowly amplitude-modulated oscillators per EEG band
 *     (delta … gamma), weighted per channel to mimic typical scalp topography, and
 *   • a "non-neural" component: white + 1/f noise, 50/60 Hz mains interference,
 *     slow baseline drift, eye-blink and muscle (EMG) artefacts.
 * The generator keeps the two components separate, so the true SNR is known exactly. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.sim = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Illustrative channels (10-20 system names). NOT electrode measurements. */
  const CHANNELS = [
    { name: 'Fp1', region: 'Left frontal pole', w: [1.35, 1.1, 0.7, 0.85, 0.9], blink: 1.0, emg: 1.0 },
    { name: 'Fp2', region: 'Right frontal pole', w: [1.3, 1.1, 0.7, 0.85, 0.9], blink: 0.95, emg: 1.0 },
    { name: 'C3', region: 'Left central (motor)', w: [0.8, 0.9, 0.95, 1.3, 0.9], blink: 0.1, emg: 0.5 },
    { name: 'C4', region: 'Right central (motor)', w: [0.8, 0.9, 0.95, 1.25, 0.9], blink: 0.1, emg: 0.5 },
    { name: 'O1', region: 'Left occipital (visual)', w: [0.8, 0.9, 1.5, 0.7, 0.6], blink: 0.03, emg: 0.3 },
    { name: 'O2', region: 'Right occipital (visual)', w: [0.8, 0.9, 1.45, 0.7, 0.6], blink: 0.03, emg: 0.3 },
  ];

  /** bands = target RMS amplitude (µV) of [delta, theta, alpha, beta, gamma] on a weight-1 channel. */
  const PROFILES = {
    calm: { id: 'calm', name: 'Calm Focus', short: 'Alpha + beta', expect: 'alpha', bands: [5, 4, 11, 9, 1.6], blink: 0.2, emg: 0, noiseBoost: 0, lineBoost: 0, desc: 'Alert but at ease: a clear alpha rhythm with moderate beta.' },
    active: { id: 'active', name: 'Active Thinking', short: 'Beta-dominant', expect: 'beta', bands: [3.5, 4.5, 6, 13, 2.8], blink: 0.3, emg: 0.1, noiseBoost: 0, lineBoost: 0, desc: 'Problem solving: faster, lower-amplitude beta activity dominates.' },
    relaxed: { id: 'relaxed', name: 'Relaxed State', short: 'Alpha-dominant', expect: 'alpha', bands: [4, 6, 16, 4, 0.9], blink: 0.1, emg: 0, noiseBoost: 0, lineBoost: 0, desc: 'Eyes-closed rest: strong, rhythmic alpha waves, especially occipital.' },
    drowsy: { id: 'drowsy', name: 'Drowsy State', short: 'Theta + delta', expect: 'theta', bands: [12, 15, 6, 2.2, 0.6], blink: 0.05, emg: 0, noiseBoost: 0, lineBoost: 0, desc: 'Falling asleep: slow, high-amplitude theta and delta waves.' },
    deep: { id: 'deep', name: 'Deep Concentration', short: 'Beta + gamma + theta', expect: 'beta', bands: [2.5, 9, 3.5, 11, 6], blink: 0.15, emg: 0.05, noiseBoost: 0, lineBoost: 0, desc: 'Sustained effort: suppressed alpha, strong beta and gamma, raised frontal theta.' },
    noisy: { id: 'noisy', name: 'Noisy Environment', short: 'Artefact-heavy', expect: null, bands: [5, 5, 6, 7, 3], blink: 1, emg: 1, noiseBoost: 0.4, lineBoost: 0.3, desc: 'Poor recording conditions: muscle fuzz, eye blinks and mains hum swamp the brain signal.' },
    custom: { id: 'custom', name: 'Custom Signal', short: 'You set the bands', expect: null, bands: [4, 6, 10, 8, 2], blink: 0.2, emg: 0, noiseBoost: 0, lineBoost: 0, desc: 'Dial in your own band amplitudes with the sliders.' },
  };
  const PROFILE_ORDER = ['calm', 'active', 'relaxed', 'drowsy', 'deep', 'noisy', 'custom'];

  const OSC_PER_BAND = 6;
  const CENTER = [2.0, 6.0, 10.0, 20.0, 42.0];
  const SIGMA = [0.8, 1.0, 0.9, 4.0, 9.0];
  const LIMITS = [[0.6, 3.9], [4.2, 7.8], [8.2, 12.8], [13.3, 29.5], [30.5, 90]];
  const MOD_COMP = 1 / Math.sqrt(1.125); // E[(1 + 0.5 sin)^2] = 1.125
  const PINK_NORM = 0.3315; // Kellet pink noise → ~unit RMS (calibrated in tests/dsp.test.js)

  class Generator {
    /** opts: { fs, seed, channels } */
    constructor(opts = {}) {
      this.fs = opts.fs || 256;
      this.channels = opts.channels || CHANNELS;
      this.nCh = this.channels.length;
      this.seed = opts.seed == null ? 1337 : opts.seed;
      this.params = { amplitude: 1, noise: 0.18, line: 0.12, drift: 0.15, mains: 60 };
      this.total = new Float32Array(this.nCh);
      this.clean = new Float32Array(this.nCh);
      this.noise = new Float32Array(this.nCh);
      this.target = new Float64Array(5);
      this.ba = new Float64Array(5);
      this.extra = { blink: 0.2, emg: 0, noiseBoost: 0, lineBoost: 0 };
      this.alpha = 1 - Math.exp(-1 / (0.7 * this.fs)); // ~0.7 s profile cross-fade
      this.reseed(this.seed);
      this.setProfile(PROFILES.calm, null, true);
    }

    reseed(seed) {
      this.seed = seed;
      const rnd = (this.rng = mulberry32(seed));
      const N = OSC_PER_BAND, nOsc = 5 * N, nCh = this.nCh;
      this._spare = null;
      this.th = new Float64Array(nOsc); this.inc = new Float64Array(nOsc);
      this.mp = new Float64Array(nOsc); this.minc = new Float64Array(nOsc);
      this.sinT = new Float64Array(nOsc); this.cosT = new Float64Array(nOsc); this.modv = new Float64Array(nOsc);
      this.offC = []; this.offS = [];
      for (let b = 0; b < 5; b++) {
        for (let i = 0; i < N; i++) {
          const o = b * N + i;
          const f = clamp(CENTER[b] + this.gauss() * SIGMA[b], LIMITS[b][0], LIMITS[b][1]);
          this.th[o] = rnd() * TAU; this.inc[o] = (TAU * f) / this.fs;
          this.mp[o] = rnd() * TAU; this.minc[o] = (TAU * (0.04 + rnd() * 0.3)) / this.fs;
        }
      }
      for (let c = 0; c < nCh; c++) {
        const oc = new Float64Array(nOsc), os = new Float64Array(nOsc);
        for (let o = 0; o < nOsc; o++) { const off = (rnd() - 0.5) * 2.4; oc[o] = Math.cos(off); os[o] = Math.sin(off); }
        this.offC.push(oc); this.offS.push(os);
      }
      this.pink = Array.from({ length: nCh }, () => new Float64Array(7));
      this.emgPrev = new Float64Array(nCh);
      this.lineOff = Float64Array.from({ length: nCh }, () => rnd() * TAU);
      this.d1 = Float64Array.from({ length: nCh }, () => rnd() * TAU);
      this.d2 = Float64Array.from({ length: nCh }, () => rnd() * TAU);
      this.linePh = 0; this.dr1 = rnd() * TAU; this.dr2 = rnd() * TAU;
      this.emgEnv = 0; this.emgTarget = 0; this.emgTimer = 0;
      this.blinkT = -1; this.blinkWait = (1.5 + rnd() * 3) * this.fs;
    }

    gauss() { // Box–Muller with spare
      if (this._spare !== null && this._spare !== undefined) { const s = this._spare; this._spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = this.rng();
      v = this.rng();
      const r = Math.sqrt(-2 * Math.log(u));
      this._spare = r * Math.sin(TAU * v);
      return r * Math.cos(TAU * v);
    }

    /** Select a profile. `custom` (5 numbers) overrides band targets for the custom profile. */
    setProfile(profile, custom, immediate) {
      const p = typeof profile === 'string' ? PROFILES[profile] : profile;
      const bands = p.id === 'custom' && custom ? custom : p.bands;
      for (let b = 0; b < 5; b++) this.target[b] = bands[b];
      this.extra = { blink: p.blink, emg: p.emg, noiseBoost: p.noiseBoost, lineBoost: p.lineBoost };
      if (immediate) this.ba.set(this.target);
    }
    setCustomBands(bands) { for (let b = 0; b < 5; b++) this.target[b] = bands[b]; }

    /** Advance one sample. Fills this.total / this.clean / this.noise (µV). */
    step() {
      const N = OSC_PER_BAND, nOsc = 5 * N, fs = this.fs, P = this.params, X = this.extra;
      for (let b = 0; b < 5; b++) this.ba[b] += (this.target[b] - this.ba[b]) * this.alpha;
      for (let o = 0; o < nOsc; o++) {
        let t = this.th[o] + this.inc[o]; if (t > TAU) t -= TAU; this.th[o] = t;
        this.mp[o] += this.minc[o];
        this.sinT[o] = Math.sin(t); this.cosT[o] = Math.cos(t);
        this.modv[o] = 1 + 0.5 * Math.sin(this.mp[o]);
      }
      const nz = clamp(P.noise + X.noiseBoost, 0, 1), art = Math.min(1.5, nz * 1.2);
      const lineAmp = clamp(P.line + X.lineBoost, 0, 1) * 30, driftAmp = clamp(P.drift, 0, 1) * 40;
      this.linePh += (TAU * P.mains) / fs; if (this.linePh > TAU) this.linePh -= TAU;
      this.dr1 += (TAU * 0.15) / fs; this.dr2 += (TAU * 0.37) / fs;

      // muscle bursts (shared envelope)
      if (--this.emgTimer <= 0) {
        this.emgTarget = this.rng() < 0.5 ? 0.15 + this.rng() * 0.85 : 0.05;
        this.emgTimer = (0.2 + this.rng() * 0.9) * fs;
      }
      this.emgEnv += (this.emgTarget - this.emgEnv) * 0.01;
      // eye blinks (shared timing)
      if (this.blinkT < 0 && --this.blinkWait <= 0) { this.blinkT = 0; this.blinkWait = (2 + this.rng() * 4) * fs; }
      let blinkShape = 0;
      if (this.blinkT >= 0) {
        const tt = this.blinkT / fs; blinkShape = Math.exp(-(((tt - 0.3) / 0.11) ** 2));
        if (++this.blinkT > fs * 0.8) this.blinkT = -1;
      }
      const blinkAmp = X.blink * art * 70, emgScale = X.emg * art * 9 * this.emgEnv;
      const amp = P.amplitude;

      for (let c = 0; c < this.nCh; c++) {
        const ch = this.channels[c], oc = this.offC[c], os = this.offS[c];
        let s = 0;
        for (let b = 0; b < 5; b++) {
          let acc = 0;
          for (let i = 0; i < N; i++) { const o = b * N + i; acc += this.modv[o] * (this.sinT[o] * oc[o] + this.cosT[o] * os[o]); }
          s += acc * Math.sqrt(2 / N) * MOD_COMP * this.ba[b] * ch.w[b];
        }
        const clean = s * amp;

        const white = this.gauss(), pk = this.pink[c];
        pk[0] = 0.99886 * pk[0] + white * 0.0555179; pk[1] = 0.99332 * pk[1] + white * 0.0750759;
        pk[2] = 0.969 * pk[2] + white * 0.153852; pk[3] = 0.8665 * pk[3] + white * 0.3104856;
        pk[4] = 0.55 * pk[4] + white * 0.5329522; pk[5] = -0.7616 * pk[5] - white * 0.016898;
        const pink = (pk[0] + pk[1] + pk[2] + pk[3] + pk[4] + pk[5] + pk[6] + white * 0.5362) * PINK_NORM;
        pk[6] = white * 0.115926;
        const w2 = this.gauss(), emg = (w2 - this.emgPrev[c]) * emgScale * ch.emg; this.emgPrev[c] = w2;
        const blink = blinkAmp * ch.blink * blinkShape;
        const line = lineAmp * (Math.sin(this.linePh + this.lineOff[c]) + 0.1 * Math.sin(2 * this.linePh + this.lineOff[c]));
        const drift = driftAmp * (0.7 * Math.sin(this.dr1 + this.d1[c]) + 0.5 * Math.sin(this.dr2 + this.d2[c]));
        const noise = nz * (12 * white * 0.7 + 8 * pink) + emg + blink + line + drift;

        this.clean[c] = clean; this.noise[c] = noise; this.total[c] = clean + noise;
      }
    }
  }

  /**
   * Synthesise a standalone segment for experiments / ML training (single channel).
   * opts: { seconds, channel (name), seed, amplitude, noise, line, drift, mains, fs, warmup }
   * Returns { fs, samples, clean, noise, profile } as Float32Arrays.
   */
  function makeSegment(profileId, opts = {}) {
    const fs = opts.fs || 256, seconds = opts.seconds || 4, warm = Math.round((opts.warmup == null ? 1 : opts.warmup) * fs);
    const chName = opts.channel || 'C3';
    const chan = CHANNELS.find((c) => c.name === chName) || CHANNELS[2];
    const g = new Generator({ fs, seed: opts.seed == null ? Math.floor(Math.random() * 1e9) : opts.seed, channels: [chan] });
    Object.assign(g.params, { amplitude: opts.amplitude == null ? 1 : opts.amplitude, noise: opts.noise == null ? 0.15 : opts.noise, line: opts.line == null ? 0 : opts.line, drift: opts.drift == null ? 0.1 : opts.drift, mains: opts.mains || 60 });
    g.setProfile(PROFILES[profileId], opts.custom || null, true);
    for (let i = 0; i < warm; i++) g.step();
    const n = Math.round(seconds * fs), samples = new Float32Array(n), clean = new Float32Array(n), noise = new Float32Array(n);
    for (let i = 0; i < n; i++) { g.step(); samples[i] = g.total[0]; clean[i] = g.clean[0]; noise[i] = g.noise[0]; }
    return { fs, samples, clean, noise, profile: profileId, channel: chan.name };
  }

  return { CHANNELS, PROFILES, PROFILE_ORDER, Generator, makeSegment, mulberry32, PINK_NORM };
});
