/* NeuroGrid — digital signal processing toolkit.
 * Pure functions, no DOM. Works in the browser (NG.dsp) and in Node (require) for tests.
 * Everything here is real math: radix-2 FFT, Hann-windowed periodograms / Welch PSD,
 * RBJ biquads, Butterworth cascades, forward-backward (zero-phase) filtering, etc. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.dsp = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;

  /** The five conventional EEG bands (Hz). */
  const BANDS = [
    { id: 'delta', name: 'Delta', sym: 'δ', lo: 0.5, hi: 4 },
    { id: 'theta', name: 'Theta', sym: 'θ', lo: 4, hi: 8 },
    { id: 'alpha', name: 'Alpha', sym: 'α', lo: 8, hi: 13 },
    { id: 'beta', name: 'Beta', sym: 'β', lo: 13, hi: 30 },
    { id: 'gamma', name: 'Gamma', sym: 'γ', lo: 30, hi: 100 },
  ];

  /* ------------------------------------------------------------------ basic stats */
  function mean(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : 0; }
  function meanSquare(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return x.length ? s / x.length : 0; }
  function rms(x) { return Math.sqrt(meanSquare(x)); }
  function variance(x) { const m = mean(x); let s = 0; for (let i = 0; i < x.length; i++) { const d = x[i] - m; s += d * d; } return x.length ? s / x.length : 0; }
  function peakToPeak(x) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < x.length; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; } return x.length ? hi - lo : 0; }
  function lineLength(x) { let s = 0; for (let i = 1; i < x.length; i++) s += Math.abs(x[i] - x[i - 1]); return s; }
  function zeroCrossings(x) { const m = mean(x); let c = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] - m) * (x[i] - m) < 0) c++; return c; }

  /** SNR in dB from separately known signal and noise components (simulation ground truth). */
  function snrDb(signal, noise, cap = 60) {
    const ps = meanSquare(signal), pn = meanSquare(noise);
    if (pn < 1e-12) return cap;
    if (ps < 1e-12) return -cap;
    return Math.max(-cap, Math.min(cap, 10 * Math.log10(ps / pn)));
  }

  /* ------------------------------------------------------------------ FFT / spectra */
  /** In-place iterative radix-2 FFT. re/im must have power-of-two length. */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  const _win = new Map();
  /** Periodic Hann window (cached). */
  function hann(n) {
    let w = _win.get(n);
    if (!w) {
      w = new Float64Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / n);
      _win.set(n, w);
    }
    return w;
  }

  const _scratch = new Map();
  function scratch(n) {
    let s = _scratch.get(n);
    if (!s) { s = { re: new Float64Array(n), im: new Float64Array(n) }; _scratch.set(n, s); }
    return s;
  }

  /** One-sided Hann periodogram in units²/Hz. Uses the last `nfft` samples (zero-pads if shorter). */
  function periodogram(x, fs, nfft = 512, out) {
    const { re, im } = scratch(nfft);
    const w = hann(nfft);
    const n = Math.min(x.length, nfft), off = x.length - n;
    let m = 0;
    for (let i = 0; i < n; i++) m += x[off + i];
    m = n ? m / n : 0;
    let s2 = 0;
    for (let i = 0; i < nfft; i++) {
      re[i] = i < n ? (x[off + i] - m) * w[i] : 0;
      im[i] = 0;
      s2 += w[i] * w[i];
    }
    fft(re, im);
    const half = nfft >> 1, p = out && out.length === half + 1 ? out : new Float64Array(half + 1);
    const scale = 1 / (fs * s2);
    for (let k = 0; k <= half; k++) {
      let v = (re[k] * re[k] + im[k] * im[k]) * scale;
      if (k > 0 && k < half) v *= 2;
      p[k] = v;
    }
    return p;
  }

  /** Welch PSD estimate (averaged, 50 % overlap by default). Returns { psd, df }. */
  function welch(x, fs, nperseg = 256, overlap = 0.5) {
    const step = Math.max(1, Math.round(nperseg * (1 - overlap)));
    const half = nperseg >> 1, acc = new Float64Array(half + 1), seg = new Float64Array(nperseg), tmp = new Float64Array(half + 1);
    let count = 0;
    if (x.length < nperseg) {
      periodogram(x, fs, nperseg, acc); count = 1;
    } else {
      for (let s = 0; s + nperseg <= x.length; s += step) {
        for (let i = 0; i < nperseg; i++) seg[i] = x[s + i];
        periodogram(seg, fs, nperseg, tmp);
        for (let k = 0; k <= half; k++) acc[k] += tmp[k];
        count++;
      }
    }
    for (let k = 0; k <= half; k++) acc[k] /= Math.max(1, count);
    return { psd: acc, df: fs / nperseg };
  }

  /** Integrate PSD bins whose centre lies in [lo, hi). */
  function bandPower(psd, df, lo, hi) {
    let s = 0;
    for (let k = Math.ceil(lo / df - 1e-9); k < psd.length; k++) {
      const f = k * df;
      if (f >= hi - 1e-9) break;
      if (f >= lo - 1e-9) s += psd[k];
    }
    return s * df;
  }

  /** Absolute and relative power in the five EEG bands. */
  function bandPowers(psd, df, bands = BANDS) {
    const abs = bands.map((b) => bandPower(psd, df, b.lo, b.hi));
    const total = abs.reduce((a, b) => a + b, 0);
    const rel = abs.map((v) => (total > 1e-12 ? v / total : 0));
    return { abs, rel, total };
  }

  function dominantBand(rel) { let bi = 0; for (let i = 1; i < rel.length; i++) if (rel[i] > rel[bi]) bi = i; return bi; }

  /** Frequency of the largest PSD bin inside [lo, hi]. */
  function peakFrequency(psd, df, lo = 1, hi = 45) {
    let best = -1, bk = 0;
    for (let k = Math.ceil(lo / df); k <= Math.floor(hi / df) && k < psd.length; k++) if (psd[k] > best) { best = psd[k]; bk = k; }
    return bk * df;
  }

  /** Power-weighted mean frequency over [lo, hi] (spectral centroid). */
  function spectralCentroid(psd, df, lo = 1, hi = 40) {
    let num = 0, den = 0;
    for (let k = Math.ceil(lo / df); k <= Math.floor(hi / df) && k < psd.length; k++) { num += k * df * psd[k]; den += psd[k]; }
    return den > 1e-12 ? num / den : 0;
  }

  /** 6-element feature vector used by the neural-network demo:
   *  relative power of the five bands + spectral centroid / 20 Hz. */
  function features(x, fs) {
    const { psd, df } = welch(x, fs, 256, 0.5);
    const bp = bandPowers(psd, df);
    return Float64Array.from([...bp.rel, spectralCentroid(psd, df, 1, 40) / 20]);
  }

  /* ------------------------------------------------------------------ biquads (RBJ cookbook) */
  /** Returns normalised coefficients { b0, b1, b2, a1, a2 } (a0 = 1). */
  function biquad(type, fc, fs, q = Math.SQRT1_2) {
    fc = Math.min(Math.max(fc, 1e-3), fs * 0.499);
    const w0 = TAU * fc / fs, cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; }
    else throw new Error('Unknown biquad type: ' + type);
    const a0 = 1 + alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cw) / a0, a2: (1 - alpha) / a0 };
  }

  /** Even-order Butterworth low/high-pass as a cascade of biquads. */
  function butterworth(type, fc, fs, order = 4) {
    order = Math.max(2, Math.round(order / 2) * 2);
    const secs = [];
    for (let k = 1; k <= order / 2; k++) {
      const q = 1 / (2 * Math.cos(((2 * k - 1) * Math.PI) / (2 * order)));
      secs.push(biquad(type, fc, fs, q));
    }
    return secs;
  }

  /** Causal cascade filter (direct form II transposed). Returns a new Float32Array. */
  function sosFilter(secs, x) {
    const n = x.length, y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = x[i];
    for (let s = 0; s < secs.length; s++) {
      const { b0, b1, b2, a1, a2 } = secs[s];
      let z1 = 0, z2 = 0;
      for (let i = 0; i < n; i++) {
        const v = y[i];
        const o = b0 * v + z1;
        z1 = b1 * v - a1 * o + z2;
        z2 = b2 * v - a2 * o;
        y[i] = o;
      }
    }
    return Float32Array.from(y);
  }

  /** Zero-phase (forward-backward) filtering with odd-reflection edge padding. */
  function sosFiltFilt(secs, x, padLen = 256) {
    const n = x.length;
    if (!secs.length || n < 4) return Float32Array.from(x);
    const pad = Math.min(padLen, n - 1), m = n + 2 * pad, ext = new Float64Array(m);
    for (let i = 0; i < pad; i++) { ext[pad - 1 - i] = 2 * x[0] - x[i + 1]; ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]; }
    for (let i = 0; i < n; i++) ext[pad + i] = x[i];
    let y = sosFilter(secs, ext);
    y.reverse();
    y = sosFilter(secs, y);
    y.reverse();
    return y.slice(pad, pad + n);
  }

  /** |H(e^jw)| of one biquad at frequency f (Hz). */
  function biquadMag(c, f, fs) {
    const w = TAU * f / fs, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c.b0 + c.b1 * cw + c.b2 * c2, ni = -(c.b1 * sw + c.b2 * s2);
    const dr = 1 + c.a1 * cw + c.a2 * c2, di = -(c.a1 * sw + c.a2 * s2);
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }

  /** Magnitude response of a cascade at f (Hz). */
  function sosMag(secs, f, fs) { let m = 1; for (let i = 0; i < secs.length; i++) m *= biquadMag(secs[i], f, fs); return m; }

  /* ------------------------------------------------------------------ smoothing / normalisation */
  /** Moving average of length k. Causal (trailing) by default; centred when opts.centered. */
  function movingAverage(x, k, opts = {}) {
    const n = x.length, y = new Float32Array(n);
    k = Math.max(1, Math.round(k));
    if (k === 1) { y.set(x); return y; }
    const before = opts.centered ? (k - 1) >> 1 : k - 1, after = opts.centered ? k - 1 - before : 0;
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - before), b = Math.min(n - 1, i + after);
      y[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
    return y;
  }

  /** Median filter of length k (odd). Causal by default; centred when opts.centered. */
  function medianFilter(x, k, opts = {}) {
    const n = x.length, y = new Float32Array(n);
    k = Math.max(1, Math.round(k)); if (k % 2 === 0) k++;
    if (k === 1) { y.set(x); return y; }
    const before = opts.centered ? (k - 1) >> 1 : k - 1, after = opts.centered ? (k - 1) >> 1 : 0;
    const win = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - before), b = Math.min(n - 1, i + after), len = b - a + 1;
      for (let j = 0; j < len; j++) win[j] = x[a + j];
      const w = win.subarray(0, len).sort();
      y[i] = len % 2 ? w[len >> 1] : 0.5 * (w[len / 2 - 1] + w[len / 2]);
    }
    return y;
  }

  function zscore(x) {
    const m = mean(x), s = Math.sqrt(variance(x)) || 1, y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = (x[i] - m) / s;
    return y;
  }
  /** Rescale to [-1, 1]. */
  function minmax(x) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < x.length; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
    const r = hi - lo || 1, y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = ((x[i] - lo) / r) * 2 - 1;
    return y;
  }

  /* ------------------------------------------------------------------ processing chain */
  const DEFAULT_CHAIN = {
    hp: { on: false, fc: 0.5, order: 2 },
    lp: { on: false, fc: 40, order: 4 },
    bp: { on: false, lo: 8, hi: 13, order: 4 },
    notch: { on: false, f0: 60, q: 30 },
    nr: { on: false, method: 'mean', ms: 20 },
    norm: { on: false, method: 'zscore' },
  };

  /** Build a chain from a config object. Stage order is fixed:
   *  high-pass → low-pass → band-pass → notch → noise reduction → normalisation. */
  function makeChain(cfg, fs) {
    const c = Object.assign({}, DEFAULT_CHAIN, cfg);
    const secs = [];
    if (c.hp.on) secs.push(...butterworth('highpass', c.hp.fc, fs, c.hp.order));
    if (c.lp.on) secs.push(...butterworth('lowpass', c.lp.fc, fs, c.lp.order));
    if (c.bp.on) {
      const lo = Math.max(0.05, Math.min(c.bp.lo, c.bp.hi - 0.5)), hi = Math.max(c.bp.hi, lo + 0.5);
      secs.push(...butterworth('highpass', lo, fs, c.bp.order), ...butterworth('lowpass', hi, fs, c.bp.order));
    }
    if (c.notch.on) secs.push(biquad('notch', c.notch.f0, fs, c.notch.q));
    const nrK = c.nr.on ? Math.max(1, Math.round((c.nr.ms * fs) / 1000)) : 1;

    /** Run filters + noise reduction (no normalisation). */
    function filter(x, opts = {}) {
      let y = secs.length ? (opts.zeroPhase ? sosFiltFilt(secs, x) : sosFilter(secs, x)) : Float32Array.from(x);
      if (c.nr.on) y = c.nr.method === 'median' ? medianFilter(y, nrK, { centered: !!opts.zeroPhase }) : movingAverage(y, nrK, { centered: !!opts.zeroPhase });
      return y;
    }
    function normalize(y) { return c.norm.on ? (c.norm.method === 'minmax' ? minmax(y) : zscore(y)) : y; }

    /** Linear magnitude response at f (Hz). Median filtering is non-linear and is not included. */
    function magnitude(f, opts = {}) {
      let m = sosMag(secs, f, fs);
      if (opts.zeroPhase) m *= m;
      if (c.nr.on && c.nr.method === 'mean' && nrK > 1) {
        const w = Math.PI * f / fs, d = nrK * Math.sin(w);
        m *= Math.abs(d) < 1e-9 ? 1 : Math.abs(Math.sin(nrK * w) / d);
      }
      return m;
    }
    const active = ['hp', 'lp', 'bp', 'notch', 'nr', 'norm'].filter((k) => c[k].on);
    return { cfg: c, sections: secs, filter, normalize, apply: (x, o) => normalize(filter(x, o)), magnitude, active, nrSamples: nrK };
  }

  return {
    BANDS, DEFAULT_CHAIN,
    mean, meanSquare, rms, variance, peakToPeak, lineLength, zeroCrossings, snrDb,
    fft, hann, periodogram, welch, bandPower, bandPowers, dominantBand, peakFrequency, spectralCentroid, features,
    biquad, butterworth, sosFilter, sosFiltFilt, biquadMag, sosMag,
    movingAverage, medianFilter, zscore, minmax, makeChain,
  };
});
