/* NeuroGrid — machine-learning evaluation toolkit: leak-free splitting, scaling, metrics, features, config validation.
 * Everything here is deterministic given a seed. Pure logic (no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../dsp/dsp.js'), require('../sim/generator.js'));
  else { root.NG = root.NG || {}; root.NG.evalkit = factory(root.NG.dsp, root.NG.sim); }
})(typeof self !== 'undefined' ? self : this, function (dsp, sim) {
  'use strict';
  const rngOf = (seed) => sim.mulberry32(seed >>> 0);
  function shuffled(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /**
   * Split indices into train / validation / test BEFORE any fitting.
   * Y: class per sample. groups (optional): recording id per sample — whole groups go to one split (prevents leakage between
   * windows of the same recording). Stratified by class. fractions: { val, test } of the whole.
   */
  function splitIndices(Y, opts = {}) {
    const n = Y.length, o = { val: 0.15, test: 0.2, seed: 1, groups: null, ...opts };
    if (!(o.val >= 0 && o.test > 0 && o.val + o.test < 0.9)) throw new Error('Validation + test fractions must leave at least 10% for training.');
    if (n < 10) throw new Error(`Only ${n} samples: at least 10 are needed to split into train/validation/test.`);
    const rnd = rngOf(o.seed), out = { train: [], val: [], test: [] };
    const units = new Map(); // unit key → {idx[], cls}
    for (let i = 0; i < n; i++) { const key = o.groups ? 'g' + o.groups[i] : 'i' + i; if (!units.has(key)) units.set(key, { idx: [], cls: Y[i] }); units.get(key).idx.push(i); }
    const byClass = new Map(); for (const u of units.values()) { if (!byClass.has(u.cls)) byClass.set(u.cls, []); byClass.get(u.cls).push(u); }
    for (const list of byClass.values()) {
      const l = shuffled(list, rnd), k = l.length, nTest = k >= 3 ? Math.max(1, Math.round(k * o.test)) : 0, nVal = o.val > 0 && k - nTest >= 3 ? Math.max(1, Math.round(k * o.val)) : 0;
      l.forEach((u, i) => { (i < nTest ? out.test : i < nTest + nVal ? out.val : out.train).push(...u.idx); });
    }
    out.train = shuffled(out.train, rnd);
    if (!out.train.length || !out.test.length) throw new Error('Too few samples per class to make a train and a test set. Generate more samples.');
    return out;
  }
  /** True if any index appears in more than one split (or, with groups, a group straddles splits). */
  function hasLeakage(split, groups) {
    const seen = new Map();
    for (const s of ['train', 'val', 'test']) for (const i of split[s]) { const key = groups ? groups[i] : i; if (seen.has(key) && seen.get(key) !== s) return true; seen.set(key, s); }
    return false;
  }

  /** z-score scaler. fit() must only ever see TRAINING rows. */
  class Scaler {
    fit(X) { const d = X[0].length, n = X.length; this.mean = new Float64Array(d); this.std = new Float64Array(d); for (const x of X) for (let j = 0; j < d; j++) this.mean[j] += x[j] / n; for (const x of X) for (let j = 0; j < d; j++) this.std[j] += (x[j] - this.mean[j]) ** 2 / n; for (let j = 0; j < d; j++) this.std[j] = Math.sqrt(this.std[j]) || 1; this.fitted = n; return this; }
    transform(X) { return X.map((x) => Float64Array.from(x, (v, j) => (v - this.mean[j]) / this.std[j])); }
    toJSON() { return { mean: Array.from(this.mean), std: Array.from(this.std), fittedOn: this.fitted }; }
  }

  /** Balance the TRAINING indices only. mode: 'none' | 'under' | 'over'. */
  function balance(idx, Y, mode, seed = 1) {
    if (mode !== 'under' && mode !== 'over') return idx.slice();
    const rnd = rngOf(seed), by = new Map(); for (const i of idx) { if (!by.has(Y[i])) by.set(Y[i], []); by.get(Y[i]).push(i); }
    const sizes = [...by.values()].map((a) => a.length), target = mode === 'under' ? Math.min(...sizes) : Math.max(...sizes), out = [];
    for (const list of by.values()) { const l = shuffled(list, rnd); if (mode === 'under') out.push(...l.slice(0, target)); else { for (let i = 0; i < target; i++) out.push(l[i % l.length]); } }
    return shuffled(out, rnd);
  }

  /* ----------------------------------------------------------- metrics */
  function confusionMatrix(yTrue, yPred, k) {
    if (yTrue.length !== yPred.length) throw new Error('Label arrays must be the same length.');
    const m = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < yTrue.length; i++) { const a = yTrue[i], b = yPred[i]; if (a >= 0 && a < k && b >= 0 && b < k) m[a][b]++; }
    return m;
  }
  /** Per-class precision / recall / F1 plus macro and support-weighted averages. A 0/0 ratio is reported as 0. */
  function classMetrics(cm) {
    const k = cm.length, per = [];
    let total = 0, correct = 0;
    for (let c = 0; c < k; c++) {
      let tp = cm[c][c], fp = 0, fn = 0, support = 0;
      for (let j = 0; j < k; j++) { if (j !== c) { fp += cm[j][c]; fn += cm[c][j]; } support += cm[c][j]; }
      const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0, f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      per.push({ precision, recall, f1, support }); total += support; correct += tp;
    }
    const macro = { precision: 0, recall: 0, f1: 0 }, weighted = { precision: 0, recall: 0, f1: 0 };
    for (const p of per) for (const key of ['precision', 'recall', 'f1']) { macro[key] += p[key] / k; weighted[key] += total ? (p[key] * p.support) / total : 0; }
    return { accuracy: total ? correct / total : 0, per, macro, weighted, total };
  }

  /* ----------------------------------------------------------- features */
  const FEATURES = [
    { id: 'rel_delta', name: 'Relative delta', group: 'Band power' }, { id: 'rel_theta', name: 'Relative theta', group: 'Band power' }, { id: 'rel_alpha', name: 'Relative alpha', group: 'Band power' },
    { id: 'rel_beta', name: 'Relative beta', group: 'Band power' }, { id: 'rel_gamma', name: 'Relative gamma', group: 'Band power' },
    { id: 'log_alpha', name: 'log alpha power', group: 'Band power' }, { id: 'log_beta', name: 'log beta power', group: 'Band power' },
    { id: 'centroid', name: 'Spectral centroid', group: 'Spectral' }, { id: 'peak', name: 'Peak frequency', group: 'Spectral' },
    { id: 'rms', name: 'RMS amplitude (log)', group: 'Time domain' }, { id: 'linelen', name: 'Line length', group: 'Time domain' }, { id: 'zcr', name: 'Zero-crossing rate', group: 'Time domain' },
    { id: 'hj_mob', name: 'Hjorth mobility', group: 'Time domain' }, { id: 'hj_cmp', name: 'Hjorth complexity', group: 'Time domain' },
  ];
  const DEFAULT_FEATURES = ['rel_delta', 'rel_theta', 'rel_alpha', 'rel_beta', 'rel_gamma', 'centroid'];
  function hjorth(x) { const n = x.length; if (n < 3) return [0, 0]; const d1 = new Float64Array(n - 1), d2 = new Float64Array(n - 2); for (let i = 1; i < n; i++) d1[i - 1] = x[i] - x[i - 1]; for (let i = 1; i < n - 1; i++) d2[i - 1] = d1[i] - d1[i - 1]; const v0 = dsp.variance(x), v1 = dsp.variance(d1), v2 = dsp.variance(d2); const mob = v0 > 0 ? Math.sqrt(v1 / v0) : 0, mob2 = v1 > 0 ? Math.sqrt(v2 / v1) : 0; return [mob, mob ? mob2 / mob : 0]; }
  /** Feature values (selected ids, in order) for one window of one channel. Needs ≥ 64 samples. */
  function windowFeatures(x, fs, ids) {
    if (!x || x.length < 64) throw new Error('A window needs at least 64 samples to estimate features.');
    const need = new Set(ids), nper = Math.min(256, 1 << Math.floor(Math.log2(x.length))), w = dsp.welch(x, fs, nper, 0.5), bp = dsp.bandPowers(w.psd, w.df);
    const v = {};
    if (need.has('rel_delta') || need.has('rel_theta') || need.has('rel_alpha') || need.has('rel_beta') || need.has('rel_gamma')) dsp.BANDS.forEach((b, i) => { v['rel_' + b.id] = bp.rel[i]; });
    v.log_alpha = Math.log10(Math.max(1e-9, bp.abs[2])); v.log_beta = Math.log10(Math.max(1e-9, bp.abs[3]));
    v.centroid = dsp.spectralCentroid(w.psd, w.df, 1, 40) / 20; v.peak = dsp.peakFrequency(w.psd, w.df, 1, 45) / 20;
    v.rms = Math.log10(Math.max(1e-9, dsp.rms(x))); v.linelen = dsp.lineLength(x) / x.length; v.zcr = dsp.zeroCrossings(x) / (x.length / fs) / 50;
    const h = hjorth(x); v.hj_mob = h[0]; v.hj_cmp = h[1];
    return ids.map((id) => (v[id] === undefined ? 0 : v[id]));
  }
  /** Concatenate features of several channels. */
  function multiChannelFeatures(chData, fs, ids) { const out = []; for (const x of chData) out.push(...windowFeatures(x, fs, ids)); return Float64Array.from(out); }

  /* ----------------------------------------------------------- config validation */
  function validateConfig(c) {
    const e = [], int = Number.isInteger;
    if (!Array.isArray(c.hidden) || c.hidden.length > 4) e.push('Use between 0 and 4 hidden layers.');
    else if (c.hidden.some((h) => !int(h) || h < 1 || h > 64)) e.push('Each hidden layer needs 1–64 neurons.');
    if (!(c.lr > 0 && c.lr <= 2)) e.push('Learning rate must be above 0 and at most 2.');
    if (!int(c.batch) || c.batch < 1 || c.batch > 512) e.push('Batch size must be a whole number from 1 to 512.');
    if (!int(c.epochs) || c.epochs < 1 || c.epochs > 1000) e.push('Epochs must be a whole number from 1 to 1000.');
    if (!int(c.seed)) e.push('Seed must be a whole number.');
    if (!(c.test > 0 && c.val >= 0 && c.test + c.val < 0.9)) e.push('Test must be above 0 and validation + test below 90%.');
    return e;
  }

  /** Incremental trainer: call step() once per epoch. All learned preprocessing is fitted on the TRAINING rows only. */
  function createTrainer(MLP, data, cfg) {
    const errs = validateConfig(cfg); if (errs.length) throw new Error(errs.join(' '));
    const split = splitIndices(data.Y, { val: cfg.val, test: cfg.test, seed: cfg.seed, groups: cfg.grouped ? data.groups : null });
    const trainIdx = balance(split.train, data.Y, cfg.balance, cfg.seed + 5);
    const pick = (idx) => ({ X: idx.map((i) => data.X[i]), Y: idx.map((i) => data.Y[i]) });
    const tr = pick(trainIdx), va = pick(split.val), te = pick(split.test);
    const scaler = new Scaler().fit(tr.X), Xtr = scaler.transform(tr.X), Xva = va.X.length ? scaler.transform(va.X) : [], Xte = scaler.transform(te.X);
    const k = data.classes.length, nIn = data.X[0].length, net = new MLP([nIn, ...cfg.hidden, k], cfg.seed);
    const history = [];
    return {
      net, scaler, split, counts: { train: tr.X.length, val: va.X.length, test: te.X.length, trainBeforeBalance: split.train.length }, history, epoch: 0, total: cfg.epochs,
      step() {
        const loss = net.trainEpoch(Xtr, tr.Y, cfg.lr, cfg.batch), a = net.evaluate(Xtr, tr.Y), v = Xva.length ? net.evaluate(Xva, va.Y) : null;
        const rec = { epoch: ++this.epoch, trainLoss: loss, trainAcc: a.acc, valLoss: v ? v.loss : null, valAcc: v ? v.acc : null }; history.push(rec); return rec;
      },
      finish() {
        const evalSet = (X, Y) => { if (!X.length) return null; const pred = X.map((x) => net.predict(x)), cm = confusionMatrix(Y, pred, k), m = classMetrics(cm), ev = net.evaluate(X, Y); return { n: X.length, loss: ev.loss, accuracy: m.accuracy, confusion: cm, per: m.per, macro: m.macro, weighted: m.weighted }; };
        return { train: evalSet(Xtr, tr.Y), val: evalSet(Xva, va.Y), test: evalSet(Xte, te.Y), counts: this.counts, history, scaler: scaler.toJSON(), classes: data.classes, leakage: hasLeakage(split, cfg.grouped ? data.groups : null), config: { ...cfg } };
      },
    };
  }

  /** 95% Wilson score interval for a proportion k/n (honest uncertainty for small test sets). */
  function wilson(k, n, z = 1.96) { if (!n) return { lo: 0, hi: 1 }; const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return { lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) }; }
  /** Plain-language diagnosis from the actual train/val/test numbers. */
  function diagnose(r) {
    const tr = r.train && r.train.accuracy, te = r.test && r.test.accuracy, va = r.val ? r.val.accuracy : null; if (tr == null || te == null) return { kind: 'unknown', text: 'Not enough results to judge.' };
    const k = r.classes.length, chance = 1 / k, gap = tr - te;
    if (te < chance + 0.1 && tr < chance + 0.15) return { kind: 'underfit', text: `Underfitting: even the training accuracy (${(tr * 100).toFixed(0)}%) is close to chance (${(chance * 100).toFixed(0)}%). The model (or the features) is too limited, or training was too short.` };
    if (gap > 0.12) return { kind: 'overfit', text: `Possible overfitting: training accuracy (${(tr * 100).toFixed(0)}%) is ${(gap * 100).toFixed(0)} points above test accuracy (${(te * 100).toFixed(0)}%). The model memorised training windows more than it learned a general rule.` };
    if (tr < 0.7 && te < 0.7) return { kind: 'underfit', text: `Likely underfitting: both training (${(tr * 100).toFixed(0)}%) and test (${(te * 100).toFixed(0)}%) accuracy are modest. More epochs, more neurons or better features may help.` };
    return { kind: 'ok', text: `Train (${(tr * 100).toFixed(0)}%)${va != null ? `, validation (${(va * 100).toFixed(0)}%)` : ''} and test (${(te * 100).toFixed(0)}%) are close, so there is no strong sign of over- or underfitting on this simulated task.` };
  }

  return { wilson, diagnose, splitIndices, hasLeakage, Scaler, balance, confusionMatrix, classMetrics, FEATURES, DEFAULT_FEATURES, windowFeatures, multiChannelFeatures, hjorth, validateConfig, createTrainer, shuffled };
});
