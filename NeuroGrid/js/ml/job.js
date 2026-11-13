/* NeuroGrid — background jobs for dataset generation and model training.
 * handle(msg, post, ctl) is plain JS so it runs inside a Web Worker AND on the main thread (fallback) AND in Node tests.
 * Long loops yield between epochs/samples so a 'cancel' message can be processed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../dsp/dsp.js'), require('../sim/generator.js'), require('./mlp.js'), require('./evalkit.js'));
  else { root.NG = root.NG || {}; root.NG.job = factory(root.NG.dsp, root.NG.sim, root.NG.ml, root.NG.evalkit); }
})(typeof self !== 'undefined' ? self : this, function (dsp, sim, ml, kit) {
  'use strict';
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  const cancelled = new Set();
  const PROFILE_CLASSES = ml.CLASSES;

  /** Optional preprocessing applied to every window BEFORE feature extraction (same for train and test). */
  function prefilter(x, fs, pre) {
    if (!pre || (!pre.bandpass && !pre.notch)) return x;
    const chain = dsp.makeChain({ hp: { on: !!pre.bandpass, fc: pre.lo || 1, order: 2 }, lp: { on: !!pre.bandpass, fc: Math.min(pre.hi || 40, fs / 2 - 1), order: 4 }, notch: { on: !!pre.notch && (pre.mains || 60) < fs / 2, f0: pre.mains || 60, q: 30 } }, fs);
    return chain.filter(x, { zeroPhase: true });
  }
  /** Build a labelled simulated dataset: `per` windows per class, each from its own generator seed (its own "recording"). */
  async function makeSimDataset(p, post, id) {
    const per = p.perClass, ids = p.features || kit.DEFAULT_FEATURES, chans = p.channels || ['C3'], rnd = sim.mulberry32(p.seed), X = [], Y = [], groups = [];
    if (!(per >= 4 && per <= 1000)) throw new Error('Samples per class must be between 4 and 1000.');
    const classes = PROFILE_CLASSES.map((c) => c.name);
    let g = 0;
    for (let i = 0; i < per; i++) {
      for (let c = 0; c < PROFILE_CLASSES.length; c++) {
        const prof = PROFILE_CLASSES[c].profiles[Math.floor(rnd() * PROFILE_CLASSES[c].profiles.length)], seed = Math.floor(rnd() * 1e9), amp = 0.7 + rnd() * 0.7, noise = p.noiseMin + rnd() * (p.noiseMax - p.noiseMin);
        const wins = chans.map((ch) => sim.makeSegment(prof, { seconds: p.seconds || 4, warmup: 1, seed, channel: ch, amplitude: amp, noise, line: rnd() * 0.1, drift: rnd() * 0.3, fs: p.fs || 256 }));
        X.push(kit.multiChannelFeatures(wins.map((w) => prefilter(w.samples, wins[0].fs, p.pre)), wins[0].fs, ids)); Y.push(c); groups.push(g++);
      }
      if (i % 5 === 0) { post({ type: 'progress', id, stage: 'dataset', value: (i + 1) / per }); await yieldNow(); if (cancelled.has(id)) throw Object.assign(new Error('Cancelled'), { cancelled: true }); }
    }
    return { X, Y, groups, classes, featureIds: ids, channels: chans };
  }

  async function train(p, post, id) {
    const data = p.data || (await makeSimDataset(p.dataset, post, id)); // may be given or generated here
    const trainer = kit.createTrainer(ml.MLP, data, p.config);
    post({ type: 'started', id, counts: trainer.counts, sizes: trainer.net.sizes });
    for (let e = 0; e < p.config.epochs; e++) {
      if (cancelled.has(id)) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      const rec = trainer.step(); post({ type: 'progress', id, stage: 'train', value: (e + 1) / p.config.epochs, rec });
      if (e % 2 === 1 || p.config.epochs < 40) await yieldNow();
    }
    const result = trainer.finish();
    result.net = { sizes: trainer.net.sizes, W: trainer.net.W.map((l) => l.map((r) => Array.from(r))), b: trainer.net.b.map((v) => Array.from(v)) };
    result.featureIds = data.featureIds; result.channels = data.channels;
    return result;
  }

  /** message: { type: 'train'|'dataset'|'cancel', id, payload }. post(msg) delivers results. Returns a promise. */
  async function handle(msg, post) {
    if (!msg || typeof msg !== 'object') { post({ type: 'error', id: null, message: 'Malformed message.' }); return; }
    if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
    const id = msg.id;
    try {
      if (msg.type === 'train') post({ type: 'done', id, result: await train(msg.payload, post, id) });
      else if (msg.type === 'dataset') post({ type: 'done', id, result: await makeSimDataset(msg.payload, post, id) });
      else post({ type: 'error', id, message: 'Unknown job type: ' + msg.type });
    } catch (e) { post({ type: e.cancelled ? 'cancelled' : 'error', id, message: e.message }); }
    finally { cancelled.delete(id); }
  }
  return { handle, makeSimDataset, train, prefilter };
});
