/* Run with:  node tests/dsp.test.js   (no dependencies) */
'use strict';
const assert = require('assert');
const path = require('path');
const dsp = require(path.join(__dirname, '../js/dsp/dsp.js'));
const sim = require(path.join(__dirname, '../js/sim/generator.js'));
const csv = require(path.join(__dirname, '../js/core/csv.js'));
const ml = require(path.join(__dirname, '../js/ml/mlp.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const sine = (f, A, fs, n, ph = 0) => Float32Array.from({ length: n }, (_, i) => A * Math.sin((2 * Math.PI * f * i) / fs + ph));
const FS = 256;

console.log('DSP');
test('FFT of a pure bin-centred tone lands in the right bin', () => {
  const n = 256, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 10 * i) / n);
  dsp.fft(re, im);
  near(Math.hypot(re[10], im[10]), n / 2, 1e-6, 'bin 10 magnitude');
  near(Math.hypot(re[11], im[11]), 0, 1e-6, 'bin 11 magnitude');
});
test('Periodogram obeys Parseval: ∑P·df ≈ A²/2 for a sine', () => {
  const x = sine(10, 20, FS, 512), p = dsp.periodogram(x, FS, 512), df = FS / 512;
  let s = 0; for (const v of p) s += v * df;
  near(s, 200, 200 * 0.03, 'total power');
});
test('Band power puts a 10 Hz sine in alpha', () => {
  const { psd, df } = dsp.welch(sine(10.3, 15, FS, 1024), FS);
  const bp = dsp.bandPowers(psd, df);
  assert.strictEqual(dsp.BANDS[dsp.dominantBand(bp.rel)].id, 'alpha');
  assert.ok(bp.rel[2] > 0.9, 'alpha share ' + bp.rel[2]);
});
test('Peak frequency of a 17 Hz tone', () => {
  const { psd, df } = dsp.welch(sine(17, 10, FS, 1024), FS);
  near(dsp.peakFrequency(psd, df), 17, 1.1);
});
test('SNR of equal-power signal and noise is ~0 dB; 10x power is 10 dB', () => {
  const a = sine(10, 1, FS, 1024), b = sine(23, 1, FS, 1024);
  near(dsp.snrDb(a, b), 0, 0.2);
  near(dsp.snrDb(sine(10, Math.sqrt(10), FS, 1024), b), 10, 0.2);
});

console.log('Filters');
test('Butterworth low-pass: −3 dB at cutoff, strong stop-band', () => {
  const s = dsp.butterworth('lowpass', 30, FS, 4);
  near(dsp.sosMag(s, 30, FS), Math.SQRT1_2, 0.01, '|H(fc)|');
  assert.ok(dsp.sosMag(s, 3, FS) > 0.999);
  assert.ok(dsp.sosMag(s, 90, FS) < 0.02);
});
test('Butterworth high-pass: attenuates below cutoff, passes above', () => {
  const s = dsp.butterworth('highpass', 5, FS, 4);
  assert.ok(dsp.sosMag(s, 0.5, FS) < 0.001);
  near(dsp.sosMag(s, 5, FS), Math.SQRT1_2, 0.01);
  assert.ok(dsp.sosMag(s, 40, FS) > 0.999);
});
test('Notch removes a 60 Hz tone and keeps 10 Hz', () => {
  const n = FS * 8, x = new Float32Array(n);
  const a = sine(10, 10, FS, n), b = sine(60, 10, FS, n);
  for (let i = 0; i < n; i++) x[i] = a[i] + b[i];
  const y = dsp.sosFilter([dsp.biquad('notch', 60, FS, 30)], x).slice(FS * 3);
  const { psd, df } = dsp.welch(y, FS, 256);
  const p10 = dsp.bandPower(psd, df, 9, 11), p60 = dsp.bandPower(psd, df, 59, 61);
  assert.ok(p60 < p10 * 0.01, `60 Hz power ${p60} vs 10 Hz ${p10}`);
});
test('Measured gain of a filtered sine matches the analytic response', () => {
  const secs = dsp.butterworth('lowpass', 12, FS, 4), n = FS * 10;
  const y = dsp.sosFilter(secs, sine(20, 1, FS, n)).slice(FS * 3);
  near(dsp.rms(y) * Math.SQRT2, dsp.sosMag(secs, 20, FS), 0.01);
});
test('Zero-phase filtering has no lag; causal filtering does', () => {
  const secs = dsp.butterworth('lowpass', 20, FS, 4), n = FS * 8, x = sine(8, 1, FS, n);
  const zp = dsp.sosFiltFilt(secs, x), ca = dsp.sosFilter(secs, x);
  const lo = FS * 3, hi = FS * 5;
  let ez = 0, ec = 0;
  for (let i = lo; i < hi; i++) { ez += (zp[i] - x[i]) ** 2; ec += (ca[i] - x[i]) ** 2; }
  assert.ok(ez < ec * 0.05, `zero-phase err ${ez} vs causal ${ec}`);
});
test('Moving average and median behave', () => {
  const x = Float32Array.from([0, 0, 10, 0, 0, 0, 0]);
  assert.strictEqual(dsp.medianFilter(x, 3, { centered: true })[2], 0, 'median rejects spike');
  near(dsp.movingAverage(x, 3, { centered: true })[2], 10 / 3, 1e-6);
  near(dsp.movingAverage(Float32Array.from([1, 2, 3, 4]), 2)[3], 3.5, 1e-6);
});
test('z-score and min-max normalisation', () => {
  const z = dsp.zscore(Float32Array.from([1, 2, 3, 4, 5]));
  near(dsp.mean(z), 0, 1e-6); near(Math.sqrt(dsp.variance(z)), 1, 1e-6);
  const m = dsp.minmax(Float32Array.from([2, 4, 6]));
  assert.deepStrictEqual(Array.from(m), [-1, 0, 1]);
});
test('Chain: stages apply in order and magnitude() agrees with measurement', () => {
  const chain = dsp.makeChain({ hp: { on: true, fc: 1, order: 2 }, lp: { on: true, fc: 30, order: 4 }, notch: { on: true, f0: 60, q: 30 } }, FS);
  assert.deepStrictEqual(chain.active, ['hp', 'lp', 'notch']);
  const y = chain.filter(sine(45, 1, FS, FS * 10)).slice(FS * 3);
  near(dsp.rms(y) * Math.SQRT2, chain.magnitude(45), 0.02);
});

console.log('Generator');
test('Pink-noise normalisation constant is calibrated (unit RMS)', () => {
  const rnd = sim.mulberry32(9); let b = new Float64Array(7), s = 0, n = 200000;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (let i = 0; i < n; i++) {
    const w = gauss();
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856; b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
    const p = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * sim.PINK_NORM; b[6] = w * 0.115926; s += p * p;
  }
  near(Math.sqrt(s / n), 1, 0.2, 'pink rms');
});
test('Each profile has the intended dominant band (on an unweighted channel)', () => {
  for (const id of ['calm', 'active', 'relaxed', 'drowsy', 'deep']) {
    const seg = sim.makeSegment(id, { seconds: 16, seed: 42, channel: 'C3', noise: 0.05, line: 0, drift: 0, amplitude: 1 });
    const { psd, df } = dsp.welch(seg.clean, seg.fs, 512);
    const bp = dsp.bandPowers(psd, df), dom = dsp.BANDS[dsp.dominantBand(bp.rel)].id;
    const want = sim.PROFILES[id].expect;
    if (id === 'calm') { const o1 = sim.makeSegment(id, { seconds: 16, seed: 42, channel: 'O1', noise: 0.05, line: 0, drift: 0 }); const q = dsp.welch(o1.clean, o1.fs, 512); assert.strictEqual(dsp.BANDS[dsp.dominantBand(dsp.bandPowers(q.psd, q.df).rel)].id, 'alpha', 'calm on O1'); }
    else assert.strictEqual(dom, want, `${id}: got ${dom} want ${want} rel=${bp.rel.map((v) => v.toFixed(2))}`);
  }
});
test('Band amplitude targets are honoured (alpha RMS ≈ target on a weight-1 band)', () => {
  const seg = sim.makeSegment('relaxed', { seconds: 30, seed: 3, channel: 'C3', noise: 0, line: 0, drift: 0 });
  const { psd, df } = dsp.welch(seg.clean, seg.fs, 512);
  const alphaRms = Math.sqrt(dsp.bandPower(psd, df, 8, 13));
  near(alphaRms, 16 * 0.95, 16 * 0.95 * 0.3, 'alpha rms');
});
test('Mains hum appears at the configured frequency', () => {
  const seg = sim.makeSegment('calm', { seconds: 8, seed: 1, channel: 'C3', noise: 0, line: 1, drift: 0, mains: 50 });
  const { psd, df } = dsp.welch(seg.samples, seg.fs, 512);
  near(dsp.peakFrequency(psd, df, 40, 70), 50, 1);
});
test('clean + noise === total, and noise=0 gives a clean signal', () => {
  const seg = sim.makeSegment('active', { seconds: 2, seed: 8, noise: 0, line: 0, drift: 0 });
  for (let i = 0; i < seg.samples.length; i++) near(seg.samples[i], seg.clean[i] + seg.noise[i], 1e-3);
  assert.ok(dsp.rms(seg.noise) < 1e-6);
});
test('Same seed → identical output (deterministic)', () => {
  const a = sim.makeSegment('drowsy', { seed: 99 }), b = sim.makeSegment('drowsy', { seed: 99 });
  assert.deepStrictEqual(Array.from(a.samples.slice(0, 50)), Array.from(b.samples.slice(0, 50)));
});

console.log('CSV');
test('Escapes quotes, commas, newlines and neutralises formulas', () => {
  assert.strictEqual(csv.cell('a,b'), '"a,b"');
  assert.strictEqual(csv.cell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csv.cell('=SUM(A1)'), "'=SUM(A1)");
  assert.strictEqual(csv.cell(-3.5), '-3.5');
  assert.strictEqual(csv.cell('8–13 Hz µV'), '8-13 Hz uV');
  assert.strictEqual(csv.toCsv(['a', 'b'], [[1, 'x'], [2, null]]), 'a,b\n1,x\n2,\n');
});

console.log('MLP');
test('Network learns the simulated 3-class problem (held-out accuracy)', () => {
  const train = ml.makeDataset(60, 21), test_ = ml.makeDataset(25, 99);
  const net = new ml.MLP([6, 8, 6, 3], 5);
  const first = net.trainEpoch(train.X, train.Y, 0.2);
  let last = first;
  for (let e = 0; e < 120; e++) last = net.trainEpoch(train.X, train.Y, 0.2);
  const ev = net.evaluate(test_.X, test_.Y);
  assert.ok(last < first * 0.6, `loss ${first} → ${last}`);
  assert.ok(ev.acc > 0.85, 'held-out accuracy ' + ev.acc);
  console.log(`     (loss ${first.toFixed(3)} → ${last.toFixed(3)}, held-out accuracy ${(ev.acc * 100).toFixed(0)} %)`);
});
test('Untrained network is near chance', () => {
  const t = ml.makeDataset(30, 5), net = new ml.MLP([6, 8, 6, 3], 3);
  assert.ok(net.evaluate(t.X, t.Y).acc < 0.8);
});

const laterTests = [];
require('./v3.test.js')(test, near, assert, { sine, later: (fn, name) => laterTests.push([fn, name]) });
(async () => {
  for (const [fn, name] of laterTests) { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message); } }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
