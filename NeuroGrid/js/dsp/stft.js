/* NeuroGrid — Short-Time Fourier Transform (spectrogram) and window functions.
 * Pure maths, no DOM. Power is a one-sided PSD in units²/Hz (same scaling as dsp.periodogram). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else { root.NG = root.NG || {}; root.NG.stft = factory(root.NG.dsp); }
})(typeof self !== 'undefined' ? self : this, function (dsp) {
  'use strict';
  const TAU = Math.PI * 2;
  const WINDOWS = ['hann', 'hamming', 'blackman', 'rect'];

  function windowFn(name, n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = TAU * i / n; // periodic form (appropriate for spectral analysis)
      w[i] = name === 'hamming' ? 0.54 - 0.46 * Math.cos(p) : name === 'blackman' ? 0.42 - 0.5 * Math.cos(p) + 0.08 * Math.cos(2 * p) : name === 'rect' ? 1 : 0.5 - 0.5 * Math.cos(p);
    }
    return w;
  }
  const isPow2 = (n) => Number.isInteger(n) && n >= 8 && (n & (n - 1)) === 0;

  /** Throws a descriptive Error for unusable parameters. */
  function validate(n, fs, o) {
    if (!(fs > 0) || !isFinite(fs)) throw new Error('Sampling rate must be a positive number.');
    if (!isPow2(o.nfft)) throw new Error('FFT window size must be a power of two (8, 16, … 4096).');
    if (!(o.overlap >= 0 && o.overlap < 1)) throw new Error('Overlap must be at least 0 and below 1.');
    if (WINDOWS.indexOf(o.window) < 0) throw new Error('Unknown window: ' + o.window);
    if (!(n >= o.nfft)) throw new Error(`Signal has ${n} samples but the window needs ${o.nfft}; use a shorter window or a longer signal.`);
  }

  /**
   * x: signal, fs: Hz. opts: { nfft = 256, overlap = 0.75, window = 'hann', detrend = true }.
   * Returns { power (Float32Array frames×bins, row-major), frames, bins, df, dt, hop, times (s, window centres), freqs, nfft, window, fs, enbw }.
   */
  function stft(x, fs, opts = {}) {
    const o = { nfft: 256, overlap: 0.75, window: 'hann', detrend: true, ...opts };
    validate(x.length, fs, o);
    const nfft = o.nfft, hop = Math.max(1, Math.round(nfft * (1 - o.overlap))), frames = Math.floor((x.length - nfft) / hop) + 1, bins = (nfft >> 1) + 1;
    const w = windowFn(o.window, nfft); let s1 = 0, s2 = 0;
    for (let i = 0; i < nfft; i++) { s1 += w[i]; s2 += w[i] * w[i]; }
    const re = new Float64Array(nfft), im = new Float64Array(nfft), power = new Float32Array(frames * bins), scale = 1 / (fs * s2);
    for (let f = 0; f < frames; f++) {
      const off = f * hop; let m = 0;
      if (o.detrend) { for (let i = 0; i < nfft; i++) m += x[off + i]; m /= nfft; }
      for (let i = 0; i < nfft; i++) { re[i] = (x[off + i] - m) * w[i]; im[i] = 0; }
      dsp.fft(re, im);
      const base = f * bins;
      for (let k = 0; k < bins; k++) { let v = (re[k] * re[k] + im[k] * im[k]) * scale; if (k > 0 && k < bins - 1) v *= 2; power[base + k] = v; }
    }
    const times = new Float64Array(frames), freqs = new Float64Array(bins);
    for (let f = 0; f < frames; f++) times[f] = (f * hop + nfft / 2) / fs;
    for (let k = 0; k < bins; k++) freqs[k] = (k * fs) / nfft;
    return { power, frames, bins, df: fs / nfft, dt: hop / fs, hop, times, freqs, nfft, window: o.window, fs, enbw: (fs * s2) / (s1 * s1) };
  }

  /** Convert power to dB re 1 unit²/Hz, floored. */
  function toDb(p, floor = 1e-12) { return 10 * Math.log10(Math.max(p, floor)); }

  /** Mean band power per frame — a time course of one band, from the STFT itself. */
  function bandTrace(spec, lo, hi) {
    const out = new Float64Array(spec.frames);
    for (let f = 0; f < spec.frames; f++) { let s = 0; for (let k = 0; k < spec.bins; k++) { const fr = spec.freqs[k]; if (fr >= lo && fr < hi) s += spec.power[f * spec.bins + k] * spec.df; } out[f] = s; }
    return out;
  }

  /** Frequency of the strongest bin in a frame within [lo, hi]. */
  function peakBin(spec, frame, lo, hi) {
    let bi = -1, bv = -Infinity;
    for (let k = 0; k < spec.bins; k++) { const fr = spec.freqs[k]; if (fr < lo || fr > hi) continue; const v = spec.power[frame * spec.bins + k]; if (v > bv) { bv = v; bi = k; } }
    return bi < 0 ? null : { bin: bi, freq: spec.freqs[bi], power: bv };
  }

  return { WINDOWS, windowFn, stft, toDb, bandTrace, peakBin, isPow2 };
});
