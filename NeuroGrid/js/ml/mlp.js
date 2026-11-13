/* NeuroGrid — a tiny, real multi-layer perceptron plus a simulated-data dataset builder.
 * Fully-connected layers, tanh hidden units, softmax output, cross-entropy loss,
 * mini-batch SGD with back-propagation. It is trained ONLY on NeuroGrid's own synthetic
 * signals, so it recognises the simulator's patterns — it does not read real brains. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../dsp/dsp.js'), require('../sim/generator.js'));
  else { root.NG = root.NG || {}; root.NG.ml = factory(root.NG.dsp, root.NG.sim); }
})(typeof self !== 'undefined' ? self : this, function (dsp, sim) {
  'use strict';

  const CLASSES = [
    { id: 'relaxed', name: 'Relaxed', profiles: ['relaxed', 'calm'] },
    { id: 'focused', name: 'Focused', profiles: ['active', 'deep'] },
    { id: 'drowsy', name: 'Drowsy', profiles: ['drowsy'] },
  ];
  const FEATURE_NAMES = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma', 'Centroid'];
  const FEATURE_HINTS = ['Relative delta power', 'Relative theta power', 'Relative alpha power', 'Relative beta power', 'Relative gamma power', 'Spectral centroid ÷ 20 Hz'];

  class MLP {
    /** sizes e.g. [6, 8, 6, 3] */
    constructor(sizes, seed = 7) {
      this.sizes = sizes.slice();
      this.rng = sim.mulberry32(seed);
      this.init();
    }
    init() {
      this.W = []; this.b = [];
      for (let l = 0; l < this.sizes.length - 1; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1], lim = Math.sqrt(6 / (nin + nout));
        this.W.push(Array.from({ length: nout }, () => Float64Array.from({ length: nin }, () => (this.rng() * 2 - 1) * lim)));
        this.b.push(new Float64Array(nout));
      }
      this.epochs = 0;
    }
    /** Returns { a: activations per layer (a[0] = input), probs }. */
    forward(x) {
      const a = [Float64Array.from(x)];
      const L = this.W.length;
      for (let l = 0; l < L; l++) {
        const prev = a[l], out = new Float64Array(this.sizes[l + 1]);
        for (let j = 0; j < out.length; j++) {
          let s = this.b[l][j]; const w = this.W[l][j];
          for (let i = 0; i < prev.length; i++) s += w[i] * prev[i];
          out[j] = l === L - 1 ? s : Math.tanh(s);
        }
        if (l === L - 1) { // softmax
          let m = -Infinity; for (const v of out) if (v > m) m = v;
          let z = 0; for (let j = 0; j < out.length; j++) { out[j] = Math.exp(out[j] - m); z += out[j]; }
          for (let j = 0; j < out.length; j++) out[j] /= z;
        }
        a.push(out);
      }
      return { a, probs: a[L] };
    }
    predict(x) { const p = this.forward(x).probs; let bi = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[bi]) bi = i; return bi; }

    /** One epoch of mini-batch SGD. X: Float64Array[], Y: class indices. Returns mean loss. */
    trainEpoch(X, Y, lr = 0.1, batch = 24) {
      const n = X.length, idx = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      let loss = 0;
      const L = this.W.length;
      for (let s = 0; s < n; s += batch) {
        const gW = this.W.map((lay) => lay.map((r) => new Float64Array(r.length)));
        const gB = this.b.map((v) => new Float64Array(v.length));
        const end = Math.min(n, s + batch);
        for (let k = s; k < end; k++) {
          const { a, probs } = this.forward(X[idx[k]]);
          const y = Y[idx[k]];
          loss += -Math.log(Math.max(1e-12, probs[y]));
          let delta = Float64Array.from(probs); delta[y] -= 1;
          for (let l = L - 1; l >= 0; l--) {
            const prev = a[l];
            for (let j = 0; j < delta.length; j++) {
              gB[l][j] += delta[j];
              const gw = gW[l][j];
              for (let i = 0; i < prev.length; i++) gw[i] += delta[j] * prev[i];
            }
            if (l > 0) {
              const nd = new Float64Array(prev.length);
              for (let i = 0; i < prev.length; i++) {
                let sum = 0;
                for (let j = 0; j < delta.length; j++) sum += this.W[l][j][i] * delta[j];
                nd[i] = sum * (1 - prev[i] * prev[i]);
              }
              delta = nd;
            }
          }
        }
        const scale = lr / (end - s);
        for (let l = 0; l < L; l++) for (let j = 0; j < this.W[l].length; j++) {
          const w = this.W[l][j], g = gW[l][j];
          for (let i = 0; i < w.length; i++) w[i] -= scale * g[i];
          this.b[l][j] -= scale * gB[l][j];
        }
      }
      this.epochs++;
      return loss / n;
    }
    evaluate(X, Y) {
      let loss = 0, ok = 0;
      for (let i = 0; i < X.length; i++) {
        const p = this.forward(X[i]).probs;
        loss += -Math.log(Math.max(1e-12, p[Y[i]]));
        let bi = 0; for (let k = 1; k < p.length; k++) if (p[k] > p[bi]) bi = k;
        if (bi === Y[i]) ok++;
      }
      return { loss: loss / X.length, acc: ok / X.length };
    }
  }

  /** Feature vector for one simulated segment. */
  function segmentFeatures(profileId, rnd, opts = {}) {
    const seg = sim.makeSegment(profileId, {
      seconds: 4, warmup: 1, seed: Math.floor(rnd() * 1e9),
      channel: ['C3', 'C4', 'O1', 'O2'][Math.floor(rnd() * 4)],
      amplitude: 0.7 + rnd() * 0.7, noise: opts.noiseMin + rnd() * (opts.noiseMax - opts.noiseMin), line: rnd() * 0.1, drift: rnd() * 0.3,
    });
    return dsp.features(seg.samples, seg.fs);
  }

  /** Build a labelled dataset (balanced classes) from simulated signals. Synchronous.
   *  Use makeSample() in a loop for progress reporting. */
  function makeSample(classIdx, rnd, opts) {
    const cls = CLASSES[classIdx], prof = cls.profiles[Math.floor(rnd() * cls.profiles.length)];
    return { x: segmentFeatures(prof, rnd, opts), y: classIdx, profile: prof };
  }
  function makeDataset(perClass, seed = 11, opts = { noiseMin: 0.05, noiseMax: 0.35 }) {
    const rnd = sim.mulberry32(seed), X = [], Y = [];
    for (let i = 0; i < perClass; i++) for (let c = 0; c < CLASSES.length; c++) { const s = makeSample(c, rnd, opts); X.push(s.x); Y.push(s.y); }
    return { X, Y };
  }

  return { MLP, CLASSES, FEATURE_NAMES, FEATURE_HINTS, makeDataset, makeSample, segmentFeatures };
});
