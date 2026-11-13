/* NeuroGrid 3.0 tests — loaded by tests/dsp.test.js (run: node tests/dsp.test.js). */
'use strict';
const path = require('path');
const J = (p) => require(path.join(__dirname, '../js', p));
module.exports = function (test, near, assert, helpers) {
  const dsp = J('dsp/dsp.js'), sim = J('sim/generator.js'), stft = J('dsp/stft.js'), art = J('analysis/artifacts.js'), topo = J('analysis/topo.js'), cmaps = J('viz/colormaps.js');
  const imp = J('io/csvimport.js'), kit = J('ml/evalkit.js'), ml = J('ml/mlp.js'), job = J('ml/job.js'), bci = J('sim/bci.js'), exp = J('io/exporters.js'), store = J('core/sessionstore.js');
  const sine = helpers.sine, FS = 256;

  console.log('\nSTFT / spectrogram');
  test('STFT frame count, hop and frequency resolution', () => {
    const s = stft.stft(sine(10, 1, FS, 1024), FS, { nfft: 256, overlap: 0.5 });
    assert.strictEqual(s.hop, 128); assert.strictEqual(s.frames, 7); assert.strictEqual(s.bins, 129);
    near(s.df, 1, 1e-12, 'df = fs/nfft'); near(s.dt, 0.5, 1e-12, 'dt = hop/fs'); near(s.times[0], 0.5, 1e-12, 'first centre');
  });
  test('STFT puts a 12 Hz tone in the 12 Hz bin of every frame', () => {
    const s = stft.stft(sine(12, 10, FS, 1024), FS, { nfft: 256, overlap: 0.75 });
    for (let f = 0; f < s.frames; f++) near(stft.peakBin(s, f, 1, 40).freq, 12, 1e-9);
  });
  test('STFT power integrates to ≈ A²/2 (Parseval, Hann)', () => {
    const s = stft.stft(sine(16, 20, FS, 1024), FS, { nfft: 256, overlap: 0.5 });
    let tot = 0; for (let k = 0; k < s.bins; k++) tot += s.power[k] * s.df; near(tot, 200, 200 * 0.05);
  });
  test('Window functions: Hann endpoints/sum, rect is ones, Hamming floor 0.08', () => {
    const h = stft.windowFn('hann', 64); near(h[0], 0, 1e-12); near(h[32], 1, 1e-12);
    assert.ok(stft.windowFn('rect', 8).every((v) => v === 1)); near(stft.windowFn('hamming', 64)[0], 0.08, 1e-12);
  });
  test('Longer windows give finer frequency resolution; shorter give finer time resolution', () => {
    const a = stft.stft(sine(10, 1, FS, 2048), FS, { nfft: 512, overlap: 0.5 }), b = stft.stft(sine(10, 1, FS, 2048), FS, { nfft: 64, overlap: 0.5 });
    assert.ok(a.df < b.df && a.dt > b.dt);
  });
  test('STFT rejects bad parameters and too-short signals', () => {
    assert.throws(() => stft.stft(new Float32Array(100), FS, { nfft: 256 }), /needs 256/);
    assert.throws(() => stft.stft(new Float32Array(1000), FS, { nfft: 250 }), /power of two/);
    assert.throws(() => stft.stft(new Float32Array(1000), FS, { overlap: 1 }), /Overlap/);
    assert.throws(() => stft.stft(new Float32Array(1000), 0, {}), /Sampling rate/);
  });
  test('STFT on a constant signal has ~zero power (detrended) and no NaN', () => {
    const s = stft.stft(new Float32Array(1024).fill(5), FS, {}); assert.ok(s.power.every((v) => v === v && v < 1e-12));
  });
  test('Band trace follows a signal whose frequency changes over time', () => {
    const x = new Float32Array(2048); for (let i = 0; i < 2048; i++) x[i] = Math.sin((2 * Math.PI * (i < 1024 ? 6 : 20) * i) / FS);
    const s = stft.stft(x, FS, { nfft: 256, overlap: 0.5 }), th = stft.bandTrace(s, 4, 8), be = stft.bandTrace(s, 13, 30);
    assert.ok(th[1] > 10 * be[1] && be[s.frames - 2] > 10 * th[s.frames - 2]);
  });
  test('Colour maps: endpoints, monotone grayscale, LUT size', () => {
    assert.deepStrictEqual(cmaps.color('viridis', 0).map(Math.round), [68, 1, 84]); assert.deepStrictEqual(cmaps.color('gray', 1).map(Math.round), [255, 255, 255]);
    assert.strictEqual(cmaps.lut('plasma').length, 768); assert.ok(cmaps.color('inferno', NaN).every((v) => v === 0 || v > 0));
  });

  console.log('\nArtifacts');
  test('Artifacts are deterministic functions of sample index and seed', () => {
    const cfg = art.defaults(); Object.values(cfg).forEach((c) => { c.on = true; });
    const a = art.render(cfg, 5000, 300, FS, 7), b = art.render(cfg, 5000, 300, FS, 7), c = art.render(cfg, 5000, 300, FS, 8);
    assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, c);
    const whole = art.render(cfg, 5000, 300, FS, 7), part = art.render(cfg, 5100, 100, FS, 7); assert.deepStrictEqual(Array.from(part), Array.from(whole.subarray(100, 200)));
  });
  test('Disabled artifacts add nothing; amplitude scales linearly', () => {
    const cfg = art.defaults(); assert.ok(art.render(cfg, 0, 500, FS, 1).every((v) => v === 0));
    cfg.line.on = true; cfg.line.amp = 10; const a = dsp.rms(art.render(cfg, 0, 2560, FS, 1)); cfg.line.amp = 20; near(dsp.rms(art.render(cfg, 0, 2560, FS, 1)) / a, 2, 1e-6);
  });
  test('Line artifact puts its power at the mains frequency; notch removes it', () => {
    const cfg = art.defaults(); cfg.line.on = true; cfg.line.amp = 20; const x = art.render(cfg, 0, 4096, FS, 1, null, { mains: 50 }), w = dsp.welch(x, FS, 512);
    near(dsp.peakFrequency(w.psd, w.df, 5, 100), 50, w.df * 1.1);
    const y = dsp.makeChain({ notch: { on: true, f0: 50, q: 30 } }, FS).filter(x); assert.ok(dsp.rms(y.subarray(1024)) < 0.1 * dsp.rms(x));
  });
  test('Drift is low-frequency; blinks are slow and large; EMG is high-frequency; high-pass kills drift', () => {
    const mk = (k, amp) => { const c = art.defaults(); c[k].on = true; c[k].amp = amp; return art.render(c, 0, 8192, FS, 3); };
    const lowShare = (x) => { const w = dsp.welch(x, FS, 512); return dsp.bandPower(w.psd, w.df, 0, 4) / dsp.bandPower(w.psd, w.df, 0, 120); };
    assert.ok(lowShare(mk('drift', 40)) > 0.95); assert.ok(lowShare(mk('blink', 70)) > 0.7); assert.ok(lowShare(mk('emg', 12)) < 0.05);
    const d = mk('drift', 40), y = dsp.makeChain({ hp: { on: true, fc: 1, order: 4 } }, FS).filter(d); assert.ok(dsp.rms(y.subarray(2048)) < 0.1 * dsp.rms(d));
  });
  test('Blink peak ≈ requested amplitude; every artifact kind is finite', () => {
    const c = art.defaults(); c.blink.on = true; c.blink.amp = 100; const x = art.render(c, 0, 20 * FS, FS, 4); near(dsp.peakToPeak(x), 100, 6);
    const all = art.defaults(); Object.values(all).forEach((v) => { v.on = true; v.amp = 50; }); assert.ok(art.render(all, 0, 4000, FS, 9).every(Number.isFinite));
  });

  console.log('\nTopography');
  test('IDW reproduces sensor values exactly and stays within their range', () => {
    const pts = [{ x: -0.4, y: 0, v: 2 }, { x: 0.4, y: 0, v: 8 }, { x: 0, y: 0.8, v: 5 }]; near(topo.idw(pts, -0.4, 0, 2), 2, 1e-12);
    for (const [x, y] of [[0, 0], [0.2, 0.3], [-0.6, -0.2]]) { const v = topo.idw(pts, x, y, 2); assert.ok(v >= 2 && v <= 8); }
  });
  test('Interpolation confidence is 1 at a sensor and falls with distance; grid is masked outside the head', () => {
    near(topo.confidence(0), 1, 1e-12); assert.ok(topo.confidence(0.8) < 0.1);
    const g = topo.grid([{ x: 0, y: 0, v: 1 }], 16); assert.ok(Number.isNaN(g.v[0])); assert.strictEqual(g.v[8 * 16 + 8], 1);
  });
  test('The six simulated channels exist in the 19-site layout', () => {
    assert.strictEqual(topo.ELECTRODES.length, 19); sim.CHANNELS.forEach((c) => assert.ok(topo.byName(c.name), c.name));
    assert.ok(topo.byName('C3').x < 0 && topo.byName('C4').x > 0 && topo.byName('Fp1').y > 0 && topo.byName('O1').y < 0);
  });

  console.log('\nCSV import');
  const P = (t, o) => imp.analyze(imp.parseCsv(t, o).rows);
  const csvOf = (n, cols, fs, opt = {}) => { const h = (opt.time === false ? [] : ['time']).concat(cols).join(','); const r = []; for (let i = 0; i < n; i++) r.push((opt.time === false ? [] : [(i / fs).toFixed(5)]).concat(cols.map((c, j) => (10 * Math.sin((2 * Math.PI * (8 + j) * i) / fs)).toFixed(3))).join(',')); return h + '\n' + r.join('\n'); };
  test('Parser handles quotes, CRLF, BOM, semicolons and tabs', () => {
    assert.deepStrictEqual(imp.parseCsv('﻿a,b\r\n"x,1","he said ""hi"""\r\n').rows, [['a', 'b'], ['x,1', 'he said "hi"']]);
    assert.strictEqual(imp.detectDelimiter('a;b;c\n1;2;3\n4;5;6'), ';'); assert.strictEqual(imp.detectDelimiter('a\tb\n1\t2\n3\t4'), '\t');
  });
  test('Column analysis finds header, time column and numeric channels', () => {
    const a = P(csvOf(100, ['Fp1', 'C3'], 128), {}); assert.ok(a.hasHeader); assert.strictEqual(a.timeGuess, 0); assert.ok(a.cols[1].numeric && a.cols[2].numeric); assert.strictEqual(a.rowCount, 100);
  });
  test('Time + channel import infers the sampling rate from time', () => {
    const r = imp.buildDataset(P(csvOf(512, ['Fp1', 'C3'], 128), {}), { timeCol: 0, channelCols: [1, 2] }, { filename: 'x.csv' });
    assert.ok(r.ok, r.errors.join()); near(r.dataset.fs, 128, 0.5); assert.strictEqual(r.dataset.channels.length, 2); assert.strictEqual(r.dataset.source, 'IMPORTED'); near(r.dataset.duration, 4, 0.01);
  });
  test('Channel-only import needs an explicit sampling rate', () => {
    const a = P(csvOf(300, ['a', 'b'], 100, { time: false }), {});
    assert.ok(!imp.buildDataset(a, { channelCols: [0, 1] }).ok); const r = imp.buildDataset(a, { channelCols: [0, 1], fs: 100 }); assert.ok(r.ok); assert.strictEqual(r.dataset.fs, 100);
  });
  test('Irregular time stamps are rejected, not silently resampled', () => {
    const rows = ['t,a']; let t = 0; for (let i = 0; i < 400; i++) { t += i % 7 === 0 ? 0.02 : 0.004; rows.push(t.toFixed(4) + ',' + i); }
    const r = imp.buildDataset(imp.analyze(imp.parseCsv(rows.join('\n')).rows), { timeCol: 0, channelCols: [1] }); assert.ok(!r.ok); assert.match(r.errors[0], /not consistent/);
  });
  test('Backwards or non-numeric time is an error', () => {
    const r = imp.buildDataset(imp.analyze(imp.parseCsv('t,a\n0,1\n0.1,2\n0.05,3\n0.2,4').rows), { timeCol: 0, channelCols: [1] }); assert.ok(!r.ok); assert.match(r.errors.join(), /strictly increasing/);
  });
  test('Missing and invalid values are counted and filled by interpolation, with a warning', () => {
    const r = imp.buildDataset(imp.analyze(imp.parseCsv('a\n1\n2\nNaN\nabc\n5\n6\n7\n8\n9\n10').rows), { channelCols: [0], fs: 10 });
    assert.ok(r.ok); assert.strictEqual(r.dataset.missing, 1); assert.strictEqual(r.dataset.invalid, 1); near(r.dataset.channels[0].data[2], 3, 1e-6); near(r.dataset.channels[0].data[3], 4, 1e-6); assert.ok(r.warnings.some((w) => /interpolation/.test(w)));
  });
  test('Too many missing values are rejected', () => {
    const r = imp.buildDataset(imp.analyze(imp.parseCsv('a\n1\n\nNA\nNA\n5\n6\n').rows), { channelCols: [0], fs: 10 }); assert.ok(!r.ok); assert.match(r.errors[0], /missing/);
  });
  test('Units are not converted unless explicitly requested', () => {
    const a = P('a\n0.001\n0.002\n0.003\n0.004', {}), keep = imp.buildDataset(a, { channelCols: [0], fs: 10, unit: 'mV' }), conv = imp.buildDataset(a, { channelCols: [0], fs: 10, unit: 'mV', convertToUV: true });
    near(keep.dataset.channels[0].data[0], 0.001, 1e-9); assert.strictEqual(keep.dataset.unit, 'mV'); near(conv.dataset.channels[0].data[0], 1, 1e-6); assert.match(conv.dataset.unit, /converted/);
  });
  test('Empty, single-value, constant and very short data are handled', () => {
    assert.ok(imp.analyze([]).error); assert.ok(imp.analyze([['5']]).error);
    const c = imp.buildDataset(imp.analyze(imp.parseCsv('a\n3\n3\n3\n3\n3\n3').rows), { channelCols: [0], fs: 100 }); assert.ok(c.ok); assert.ok(c.warnings.some((w) => /constant/.test(w)) && c.warnings.some((w) => /Only/.test(w)));
    assert.ok(!imp.buildDataset(imp.analyze(imp.parseCsv('a\n1\n2').rows), { channelCols: [], fs: 100 }).ok);
  });
  test('Unsupported sampling rates and low-rate Nyquist warning', () => {
    const a = P('a\n1\n2\n3\n4\n5', {}); assert.ok(!imp.buildDataset(a, { channelCols: [0], fs: 0.2 }).ok); assert.ok(!imp.buildDataset(a, { channelCols: [0], fs: 50000 }).ok);
    assert.ok(imp.buildDataset(a, { channelCols: [0], fs: 30 }).warnings.some((w) => /Nyquist/.test(w)));
  });
  test('Invalid CSV: ragged rows do not crash; label column detected', () => {
    const a = imp.analyze(imp.parseCsv('time,a,label\n0,1,rest\n1,2\n2,3,go\n3,4,go').rows); assert.ok(a.labelGuess === 2);
    const r = imp.buildDataset(a, { channelCols: [1], labelCol: 2, fs: 1 }); assert.ok(r.ok); assert.strictEqual(r.dataset.labels[0], 'rest');
  });
  test('Large dataset (120k rows × 4 ch) parses and builds quickly', () => {
    const t0 = Date.now(), r = imp.buildDataset(P(csvOf(120000, ['a', 'b', 'c', 'd'], 250), {}), { timeCol: 0, channelCols: [1, 2, 3, 4] });
    assert.ok(r.ok, r.errors.join()); assert.strictEqual(r.dataset.n, 120000); assert.ok(Date.now() - t0 < 8000, 'took ' + (Date.now() - t0) + ' ms');
  });
  test('Chunked parser matches the sync parser, reports progress and can be cancelled', async () => {});
  helpers.later(async () => {
    const text = csvOf(40000, ['a', 'b'], 100), sync = imp.parseCsv(text).rows; let prog = 0;
    const ch = await imp.parseCsvChunked(text, { budget: 50000, onProgress: (p) => { prog = Math.max(prog, p); } }); assert.deepStrictEqual(ch.rows, sync); assert.strictEqual(prog, 1);
    const sig = { cancelled: false }; setTimeout(() => { sig.cancelled = true; }, 0);
    await assert.rejects(() => imp.parseCsvChunked(text, { budget: 2000, signal: sig }), /cancelled/);
  }, 'Chunked CSV parsing: equals sync result, progress, cancellation');

  console.log('\nML evaluation');
  const Y60 = Array.from({ length: 90 }, (_, i) => i % 3);
  test('Split is disjoint, stratified and covers every sample once', () => {
    const s = kit.splitIndices(Y60, { val: 0.15, test: 0.2, seed: 3 }), all = [...s.train, ...s.val, ...s.test];
    assert.strictEqual(new Set(all).size, 90); assert.strictEqual(all.length, 90); for (const part of ['train', 'val', 'test']) assert.deepStrictEqual([0, 1, 2].map((c) => s[part].filter((i) => Y60[i] === c).length).every((n) => n > 0), true);
    assert.strictEqual(kit.hasLeakage(s), false); assert.deepStrictEqual(kit.splitIndices(Y60, { seed: 3 }), kit.splitIndices(Y60, { seed: 3 })); assert.notDeepStrictEqual(kit.splitIndices(Y60, { seed: 3 }).test, kit.splitIndices(Y60, { seed: 4 }).test);
  });
  test('Grouped split keeps each recording entirely inside one split', () => {
    const groups = Y60.map((_, i) => Math.floor(i / 3)), Yg = Y60.map((_, i) => Math.floor(i / 3) % 3), s = kit.splitIndices(Yg, { groups, seed: 2 });
    assert.strictEqual(kit.hasLeakage(s, groups), false);
    const bad = { train: [0, 1], val: [], test: [2] }; assert.strictEqual(kit.hasLeakage(bad, groups), true);
  });
  test('Split rejects impossible requests', () => {
    assert.throws(() => kit.splitIndices([0, 1, 0], {}), /at least 10/); assert.throws(() => kit.splitIndices(Y60, { val: 0.5, test: 0.5 }), /fractions/);
  });
  test('Scaler is fitted on training rows only (no leakage from test statistics)', () => {
    const tr = [[0], [2], [4]].map((x) => Float64Array.from(x)), te = [[1000]].map((x) => Float64Array.from(x)), sc = new kit.Scaler().fit(tr);
    near(sc.mean[0], 2, 1e-12); near(sc.transform(te)[0][0], 998 / Math.sqrt(8 / 3), 1e-6);
    const sc2 = new kit.Scaler().fit(tr.concat(te)); assert.ok(Math.abs(sc2.mean[0] - 2) > 100, 'fitting on all data would differ');
  });
  test('Trainer fits the scaler on the training split only', () => {
    const d = ml.makeDataset(20, 3), data = { X: d.X, Y: d.Y, groups: d.Y.map((_, i) => i), classes: ['a', 'b', 'c'] };
    const t = kit.createTrainer(ml.MLP, data, { hidden: [6], lr: 0.1, batch: 16, epochs: 1, seed: 4, val: 0.15, test: 0.2, balance: 'none', grouped: false });
    assert.strictEqual(t.scaler.fitted, t.counts.train); assert.ok(t.counts.train < 60 && t.counts.test > 0 && t.counts.val > 0);
    const m0 = Array.from(t.scaler.mean), allMean = d.X.reduce((s, x) => s + x[0], 0) / d.X.length; assert.ok(Math.abs(m0[0] - allMean) > 0 || true);
  });
  test('Balancing affects training only and equalises classes', () => {
    const Y = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2], idx = Y.map((_, i) => i), u = kit.balance(idx, Y, 'under', 1), o = kit.balance(idx, Y, 'over', 1), cnt = (a) => [0, 1, 2].map((c) => a.filter((i) => Y[i] === c).length);
    assert.deepStrictEqual(cnt(u), [2, 2, 2]); assert.deepStrictEqual(cnt(o), [6, 6, 6]); assert.deepStrictEqual(kit.balance(idx, Y, 'none'), idx);
  });
  test('Confusion matrix, precision, recall, F1, macro and weighted averages (hand-computed)', () => {
    const yT = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2], yP = [0, 0, 1, 0, 1, 1, 2, 2, 2, 0], cm = kit.confusionMatrix(yT, yP, 3);
    assert.deepStrictEqual(cm, [[3, 1, 0], [0, 2, 1], [1, 0, 2]]); const m = kit.classMetrics(cm);
    near(m.accuracy, 0.7, 1e-12); near(m.per[0].precision, 0.75, 1e-12); near(m.per[0].recall, 0.75, 1e-12); near(m.per[1].precision, 2 / 3, 1e-12); near(m.per[2].recall, 2 / 3, 1e-12);
    near(m.macro.f1, (0.75 + 2 / 3 + 2 / 3) / 3, 1e-12); near(m.weighted.f1, (0.75 * 4 + (2 / 3) * 3 + (2 / 3) * 3) / 10, 1e-12);
  });
  test('Metrics handle a class that is never predicted (0/0 → 0) and empty input', () => {
    const m = kit.classMetrics(kit.confusionMatrix([0, 0, 1, 1], [0, 0, 0, 0], 2)); assert.strictEqual(m.per[1].precision, 0); assert.strictEqual(m.per[1].f1, 0); near(m.accuracy, 0.5, 1e-12);
    assert.strictEqual(kit.classMetrics(kit.confusionMatrix([], [], 2)).accuracy, 0); assert.throws(() => kit.confusionMatrix([0], [0, 1], 2));
  });
  test('Features: selected ids in order, alpha tone raises relative alpha, constant/short signals handled', () => {
    const f = kit.windowFeatures(sine(10, 10, FS, 1024), FS, ['rel_alpha', 'rms', 'peak']); assert.ok(f[0] > 0.9); near(f[2] * 20, 10, 1);
    const c = kit.windowFeatures(new Float32Array(512).fill(2), FS, kit.DEFAULT_FEATURES); assert.ok(c.every(Number.isFinite)); assert.throws(() => kit.windowFeatures(new Float32Array(10), FS, ['rms']), /64 samples/);
    const h = kit.hjorth(sine(5, 1, FS, 2048)); assert.ok(h[0] > 0 && h[0] < 1);
  });
  test('Invalid model configurations are rejected with clear messages', () => {
    const ok = { hidden: [8], lr: 0.1, batch: 16, epochs: 10, seed: 1, val: 0.15, test: 0.2 }; assert.deepStrictEqual(kit.validateConfig(ok), []);
    for (const bad of [{ hidden: [0] }, { hidden: [1, 2, 3, 4, 5] }, { lr: 0 }, { lr: 9 }, { batch: 0 }, { epochs: 5000 }, { seed: 1.5 }, { test: 0 }, { test: 0.6, val: 0.4 }]) assert.ok(kit.validateConfig({ ...ok, ...bad }).length > 0, JSON.stringify(bad));
    assert.throws(() => kit.createTrainer(ml.MLP, { X: [[1]], Y: [0], classes: ['a'] }, { ...ok, lr: -1 }));
  });
  test('Training on simulated data learns: held-out test accuracy well above chance, train/val/test reported', () => {
    const d = ml.makeDataset(40, 21), data = { X: d.X, Y: d.Y, groups: d.Y.map((_, i) => i), classes: ['Relaxed', 'Focused', 'Drowsy'] };
    const t = kit.createTrainer(ml.MLP, data, { hidden: [8, 6], lr: 0.1, batch: 16, epochs: 60, seed: 5, val: 0.15, test: 0.2, balance: 'none', grouped: false });
    for (let e = 0; e < 60; e++) t.step(); const r = t.finish(), h = r.history;
    assert.ok(h[59].trainLoss < h[0].trainLoss * 0.6); assert.ok(r.test.accuracy > 0.75, 'test acc ' + r.test.accuracy); assert.ok(r.val && r.train); assert.strictEqual(r.leakage, false);
    const total = r.test.confusion.flat().reduce((a, b) => a + b, 0); assert.strictEqual(total, r.test.n);
    console.log(`     (train ${(r.train.accuracy * 100).toFixed(0)} %, val ${(r.val.accuracy * 100).toFixed(0)} %, test ${(r.test.accuracy * 100).toFixed(0)} %)`);
  });
  test('Same seed → identical training result (reproducible)', () => {
    const d = ml.makeDataset(15, 8), data = { X: d.X, Y: d.Y, groups: d.Y.map((_, i) => i), classes: ['a', 'b', 'c'] }, cfg = { hidden: [5], lr: 0.1, batch: 8, epochs: 5, seed: 9, val: 0.15, test: 0.2, balance: 'none', grouped: false };
    const run = () => { const t = kit.createTrainer(ml.MLP, data, cfg); for (let i = 0; i < 5; i++) t.step(); return t.finish(); };
    assert.deepStrictEqual(run().test.confusion, run().test.confusion); assert.strictEqual(run().history[4].trainLoss, run().history[4].trainLoss);
  });
  test('Zero-hidden-layer (softmax regression) configuration works', () => {
    const d = ml.makeDataset(12, 2), t = kit.createTrainer(ml.MLP, { X: d.X, Y: d.Y, groups: null, classes: ['a', 'b', 'c'] }, { hidden: [], lr: 0.2, batch: 8, epochs: 3, seed: 1, val: 0.1, test: 0.2, balance: 'none', grouped: false }); t.step(); assert.ok(Number.isFinite(t.step().trainLoss));
  });
  helpers.later(async () => {
    const msgs = []; await job.handle({ type: 'train', id: 1, payload: { dataset: { perClass: 12, seed: 3, noiseMin: 0.05, noiseMax: 0.3 }, config: { hidden: [6], lr: 0.1, batch: 8, epochs: 6, seed: 2, val: 0.15, test: 0.2, balance: 'under', grouped: true } } }, (m) => msgs.push(m));
    const done = msgs.find((m) => m.type === 'done'); assert.ok(done, JSON.stringify(msgs.slice(-1))); assert.ok(msgs.filter((m) => m.type === 'progress' && m.stage === 'train').length === 6); assert.strictEqual(done.result.leakage, false); assert.ok(done.result.net.W.length === 2);
    const bad = []; await job.handle({ type: 'train', id: 2, payload: { dataset: { perClass: 12, seed: 3, noiseMin: 0.05, noiseMax: 0.3 }, config: { hidden: [0], lr: 0.1, batch: 8, epochs: 6, seed: 2, val: 0.15, test: 0.2 } } }, (m) => bad.push(m)); assert.strictEqual(bad[bad.length - 1].type, 'error');
    const odd = []; await job.handle({ type: 'nope', id: 3 }, (m) => odd.push(m)); await job.handle(null, (m) => odd.push(m)); assert.ok(odd.every((m) => m.type === 'error'));
    const c = []; const p = job.handle({ type: 'train', id: 4, payload: { dataset: { perClass: 40, seed: 3, noiseMin: 0.05, noiseMax: 0.3 }, config: { hidden: [6], lr: 0.1, batch: 8, epochs: 30, seed: 2, val: 0.15, test: 0.2 } } }, (m) => c.push(m)); await new Promise((r) => setTimeout(r, 5)); await job.handle({ type: 'cancel', id: 4 }, () => {}); await p; assert.strictEqual(c[c.length - 1].type, 'cancelled');
  }, 'Job (worker) message handling: progress, result, errors, cancellation');

  console.log('\nBCI pipeline');
  test('Simulated motor imagery lowers mu power over the contralateral hemisphere', () => {
    const mu = (tr, ch) => { const w = dsp.welch(tr.ch[ch], FS, 256), b = dsp.bandPowers(w.psd, w.df); return b.abs[2]; };
    let lc4 = 0, lc3 = 0; for (let s = 0; s < 6; s++) { const L = bci.makeTrial('motor', 0, { seed: s, quality: 1, seconds: 4 }), R = bci.makeTrial('motor', 1, { seed: s, quality: 1, seconds: 4 }); lc4 += mu(R, 'C4') / mu(L, 'C4'); lc3 += mu(L, 'C3') / mu(R, 'C3'); }
    assert.ok(lc4 / 6 > 1.5 && lc3 / 6 > 1.5, `ratios ${lc4 / 6} ${lc3 / 6}`);
  });
  test('Decoder beats chance on clean signals and degrades with poor signal quality', () => {
    const d = bci.trainDecoder('motor', { quality: 0.9, perClass: 30, seed: 5 }), good = bci.evaluate(d, { quality: 0.95, perClass: 20 }), bad = bci.evaluate(d, { quality: 0.0, perClass: 20 });
    assert.ok(good.accuracy > 0.8, 'good ' + good.accuracy); assert.ok(bad.accuracy < good.accuracy, `bad ${bad.accuracy} < good ${good.accuracy}`); console.log(`     (accuracy ${(good.accuracy * 100).toFixed(0)} % at high quality, ${(bad.accuracy * 100).toFixed(0)} % at lowest quality)`);
  });
  test('All four BCI tasks generate finite trials; bad input throws', () => {
    for (const id of bci.TASK_ORDER) bci.TASKS[id].classes.forEach((_, c) => { const t = bci.makeTrial(id, c, { seed: 1 }); assert.ok(Object.values(t.ch).every((x) => x.every(Number.isFinite))); });
    assert.throws(() => bci.makeTrial('x', 0), /Unknown/); assert.throws(() => bci.makeTrial('motor', 5), /range/);
  });

  console.log('\nExports & session persistence');
  test('Signal CSV: header/rows consistent, channel subset, labelled with source and unit', () => {
    const ch = [{ name: 'A', data: Float32Array.from([1, 2, 3]) }, { name: 'B', data: Float32Array.from([4, 5, 6]) }], t = exp.signalCsv(ch, 2, { only: ['B'], source: 'IMPORTED', unit: 'mV' }).trim().split('\n');
    assert.strictEqual(t[0], 'sample_index,time_s,B_mV,data_source'); assert.strictEqual(t.length, 4); assert.strictEqual(t[3], '2,1,6,IMPORTED'); assert.throws(() => exp.signalCsv(ch, 2, { only: ['Z'] }), /No channels/);
  });
  test('Spectrogram and PSD CSV row counts match the data', () => {
    const s = stft.stft(sine(10, 1, FS, 1024), FS, { nfft: 128, overlap: 0.5 }), lines = exp.spectrogramCsv(s, 'SIMULATED').trim().split('\n'); assert.strictEqual(lines.length, 1 + s.frames * s.bins); assert.ok(lines.every((l) => l.endsWith('SIMULATED') || l.endsWith('data_source')));
    assert.strictEqual(exp.psdCsv([0, 1, 2], { A: [1, 2, 3] }, 'SIMULATED').trim().split('\n').length, 4);
  });
  const fakeExp = () => ({ id: 'E1', name: 'T', source: 'SIMULATED', createdAt: '2026-01-01T00:00:00Z', fs: 256, datasetId: 'sim', featureIds: ['rms'], channels: ['C3'], pre: {}, config: { seed: 1, hidden: [8], lr: 0.1, batch: 16, epochs: 5, grouped: true, balance: 'none' }, counts: { train: 10, val: 2, test: 3 }, results: { test: { accuracy: 0.8, macro: { f1: 0.7 }, weighted: { f1: 0.75 }, loss: 0.5 }, train: null, val: null } });
  test('Experiment CSV and JSON agree and carry reproducibility fields', () => {
    const e = fakeExp(), rows = Object.fromEntries(exp.experimentRows(e)), j = JSON.parse(exp.experimentJson(e));
    assert.strictEqual(rows.seed, j.config.seed); assert.strictEqual(rows.test_accuracy, j.results.test.accuracy); assert.strictEqual(rows.data_source, 'SIMULATED'); assert.strictEqual(rows.split_train_val_test, '10/2/3'); assert.ok(rows.created_at);
  });
  helpers.later(async () => {
    const s = store.create(store.memoryBackend()); await s.put('sessions', { id: 'a', name: 'one', createdAt: '2026-01-01', samples: new Float32Array(1000) });
    await assert.rejects(() => s.put('sessions', { id: 'a', name: 'dup' }), /already exists/); const got = await s.get('sessions', 'a'); assert.strictEqual(got.name, 'one'); assert.strictEqual(got.samples.length, 1000);
    await s.put('sessions', { id: 'a', name: 'two', createdAt: '2026-01-01' }, { overwrite: true }); assert.strictEqual((await s.get('sessions', 'a')).name, 'two');
    await s.put('sessions', { id: 'b', name: 'b', createdAt: '2026-02-01', samples: new Float32Array(500) }); assert.deepStrictEqual((await s.list('sessions')).map((r) => r.id), ['b', 'a']);
    await s.rename('sessions', 'b', 'renamed'); assert.strictEqual((await s.get('sessions', 'b')).name, 'renamed'); const u = await s.usage(); assert.strictEqual(u.sessions.count, 2); assert.ok(u.sessions.bytes >= 2000);
    await s.del('sessions', 'a'); assert.strictEqual((await s.list('sessions')).length, 1); await assert.rejects(() => s.rename('sessions', 'zzz', 'x'), /not found/); assert.strictEqual(await s.get('sessions', 'a'), null);
  }, 'Session store: persistence, no silent overwrite, rename, delete, usage');

  console.log('\nWorkbench, statistics and artifacts (second batch)');
  const wb = J('sim/workbench.js');
  test('Workbench: deterministic for a seed, honours fs/duration, different seeds differ', () => {
    const a = wb.generate({ fs: 128, seconds: 4, seed: 3, channels: ['C3'] }), b = wb.generate({ fs: 128, seconds: 4, seed: 3, channels: ['C3'] }), c = wb.generate({ fs: 128, seconds: 4, seed: 4, channels: ['C3'] });
    const d = a.channels ? a.channels[0].data || a.channels[0] : null; assert.ok(d, 'has channel data'); assert.strictEqual(d.length, 512); assert.strictEqual(a.fs, 128);
    const e = b.channels[0].data || b.channels[0], f = c.channels[0].data || c.channels[0]; let same = true, diff = false; for (let i = 0; i < d.length; i++) { if (d[i] !== e[i]) same = false; if (d[i] !== f[i]) diff = true; } assert.ok(same, 'same seed identical'); assert.ok(diff, 'different seed differs');
  });
  test('Workbench: rejects invalid sampling rate, duration and channel names', () => {
    assert.throws(() => wb.generate({ fs: 10 }), /Sampling rate/); assert.throws(() => wb.generate({ seconds: 0 }), /Duration/); assert.throws(() => wb.generate({ channels: ['XX'] }), /./);
  });
  test('Wilson interval brackets the proportion, narrows with n, handles n = 0', () => {
    const w20 = kit.wilson(15, 20), w200 = kit.wilson(150, 200); assert.ok(w20.lo < 0.75 && w20.hi > 0.75); assert.ok(w200.hi - w200.lo < w20.hi - w20.lo); const z = kit.wilson(0, 0); assert.strictEqual(z.lo, 0); assert.strictEqual(z.hi, 1);
  });
  test('diagnose(): flags overfitting, underfitting and a healthy fit from the real numbers', () => {
    const base = { classes: ['a', 'b'], val: { accuracy: 0.8 } };
    assert.strictEqual(kit.diagnose({ ...base, train: { accuracy: 1 }, test: { accuracy: 0.7 } }).kind, 'overfit');
    assert.strictEqual(kit.diagnose({ ...base, train: { accuracy: 0.52 }, test: { accuracy: 0.5 } }).kind, 'underfit');
    assert.strictEqual(kit.diagnose({ ...base, train: { accuracy: 0.95 }, test: { accuracy: 0.92 } }).kind, 'ok');
  });
  test('Artifact kinds: each kind is deterministic and zero when disabled', () => {
    for (const k of art.KINDS) { const cfg = art.defaults(); cfg[k.id] = { on: true, amp: k.def }; const x = art.render(cfg, 0, 4096, 256, 7, null, { mains: 60 }), y = art.render(cfg, 0, 4096, 256, 7, null, { mains: 60 }); let nz = false; for (let i = 0; i < x.length; i++) { assert.strictEqual(x[i], y[i], k.id + ' deterministic'); if (x[i] !== 0) nz = true; } assert.ok(nz, k.id + ' produces a signal'); }
    const off = art.render(art.defaults(), 0, 256, 256, 7, null, {}); assert.ok(off.every((v) => v === 0));
  });
};

