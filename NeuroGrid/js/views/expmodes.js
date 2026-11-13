/* NeuroGrid 3.0 — extra Experiment modes (artifact recognition, band ID, filter identification,
 * spectrogram interpretation, model evaluation, BCI pipeline). Loaded BEFORE experiments.js, which merges
 * NG.expModes / NG.expGens. Every answer is computed from the generated data (Welch PSD, STFT, real filter
 * output, confusion-matrix arithmetic) — nothing is a canned "prediction". All signals are SIMULATED. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, dsp = NG.dsp, sim = NG.sim, store = NG.store;
  const BANDS = dsp.BANDS, FS = 256;
  const rnd = (a, b) => a + Math.random() * (b - a), pickN = (a) => a[Math.floor(Math.random() * a.length)];
  const NOISE = { beginner: [0.04, 0.08], intermediate: [0.1, 0.2], expert: [0.2, 0.35] };
  const nOpt = (d) => (d === 'beginner' ? 3 : d === 'intermediate' ? 4 : 5);
  const seg = (profile, d, extra = {}) => sim.makeSegment(profile, Object.assign({ seconds: 4, warmup: 1, channel: 'C3', noise: rnd(...NOISE[d]), line: 0, drift: 0.05, mains: store.get('ui.mains') }, extra));
  const welch = (x) => { const r = dsp.welch(x, FS, 512); return { psd: r.psd, df: r.df, bp: dsp.bandPowers(r.psd, r.df) }; };
  const pct = (v) => Math.round(v * 100) + '%';

  NG.expModes = {
    artifact: { name: 'Artifact Hunt', icon: 'zap', blurb: 'A recording is contaminated by one simulated artifact. Identify which.' },
    band: { name: 'Band Identification', icon: 'wave', blurb: 'Read the power spectrum and name the band that holds the most power.' },
    filter: { name: 'Filter Detective', icon: 'sliders', blurb: 'See the before and after traces and spectra, then name the filter that was applied.' },
    spectro: { name: 'Spectrogram Reading', icon: 'grid', blurb: 'A signal changes state part-way through. Read the spectrogram to find what it changed to.' },
    model: { name: 'Model Evaluation', icon: 'brain', blurb: 'Compute precision, recall, F1 and accuracy from a confusion matrix, and spot misleading metrics.' },
    bci: { name: 'BCI Pipeline', icon: 'target', blurb: 'Questions about acquisition, preprocessing, features, classification and honest evaluation.' },
  };

  const gens = (NG.expGens = {});

  /* ---------- artifact recognition ---------- */
  gens.artifact = (d) => {
    const A = NG.artifacts, pool = { beginner: ['blink', 'line', 'drift'], intermediate: ['blink', 'line', 'drift', 'emg'], expert: ['blink', 'line', 'drift', 'emg', 'pop'] }[d];
    const kind = pickN(pool), K = A.KINDS.find((k) => k.id === kind), mains = store.get('ui.mains');
    const s = seg('calm', d, { channel: kind === 'blink' ? 'Fp1' : 'C3', noise: rnd(...NOISE[d]) * 0.6 });
    const amp = K.def * (d === 'beginner' ? 1.3 : d === 'intermediate' ? 1 : 0.75), cfg = A.defaults(); cfg[kind] = { on: true, amp };
    const x = Float32Array.from(s.samples); A.render(cfg, 0, x.length, FS, Math.floor(Math.random() * 1e6), x, { add: true, mains });
    const r = welch(x), r0 = welch(s.samples), p2p0 = dsp.peakToPeak(s.samples), p2p1 = dsp.peakToPeak(x);
    const hf = (bp) => bp.rel[3] + bp.rel[4];
    const ids = U.shuffle(pool.filter((k) => k !== kind)).slice(0, nOpt(d) - 1), all = U.shuffle([kind, ...ids]);
    const name = (id) => A.KINDS.find((k) => k.id === id).name;
    const evidence = `Peak-to-peak went from ${p2p0.toFixed(0)} to ${p2p1.toFixed(0)} µV and beta+gamma share from ${pct(hf(r0.bp))} to ${pct(hf(r.bp))} after the artifact was added.`;
    return {
      id: 'art-' + kind, mode: 'artifact', prompt: 'One simulated artifact has been added to this clean recording. Which one?', clue: d === 'beginner' ? 'Clue: ' + K.desc.split('.')[0] + '.' : null,
      options: all.map((id) => ({ id, label: name(id), sub: A.KINDS.find((k) => k.id === id).unit })), answer: kind,
      hint: 'Check both views: is the problem slow or fast in the waveform, and narrow or broad in the spectrum?',
      explain: `<b>${K.name}.</b> ${U.esc(K.desc)} ${U.esc(evidence)} <i>Typical handling:</i> ${U.esc(K.fix)}`,
      visual: { lanes: [{ label: 'Signal', sub: s.channel, data: x }], spec: [{ psd: r.psd, df: r.df, label: 'PSD', colorKey: 'accent' }], specHidden: d === 'beginner', sel: -1, mains: kind === 'line' ? mains : null },
    };
  };

  /* ---------- band identification ---------- */
  gens.band = (d) => {
    const prof = pickN(d === 'beginner' ? ['relaxed', 'active', 'drowsy'] : ['relaxed', 'active', 'drowsy', 'deep', 'calm']);
    const s = seg(prof, d), r = welch(s.samples), dom = dsp.dominantBand(r.bp.rel), idx = d === 'beginner' ? [1, 2, 3] : d === 'intermediate' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4];
    const ids = U.shuffle(idx.filter((i) => i !== dom)).slice(0, nOpt(d) - 1), all = U.shuffle([dom, ...ids].filter((v, i, a) => a.indexOf(v) === i));
    const bandsTxt = BANDS.map((b, i) => `${b.sym} ${pct(r.bp.rel[i])}`).join(' · ');
    return {
      id: 'band-' + BANDS[dom].id, mode: 'band', prompt: 'Which band holds the <b>most relative power</b> in this signal?', clue: d === 'beginner' ? 'Clue: find the tallest hump in the spectrum.' : null,
      options: all.map((i) => ({ id: 'b' + i, label: BANDS[i].name, sub: `${BANDS[i].lo}–${BANDS[i].hi} Hz` })), answer: 'b' + dom,
      hint: 'Open the spectrum and compare the area under the curve in each band, not just a single peak.',
      explain: `<b>${BANDS[dom].name}.</b> Welch power spectrum, relative power: ${bandsTxt}. Note that relative power is a share of the total, so strong low-frequency drift can reduce every other band’s share.`,
      visual: { lanes: [{ label: 'Signal', sub: s.channel, data: s.samples }], spec: [{ psd: r.psd, df: r.df, label: 'PSD', colorKey: 'accent' }], specHidden: true, sel: dom },
    };
  };

  /* ---------- filter identification ---------- */
  gens.filter = (d) => {
    const m = store.get('ui.mains');
    const T = {
      notch: { label: `Notch ${m} Hz`, sub: 'narrow stop band', cfg: (c) => { c.notch.on = true; c.notch.f0 = m; c.notch.q = 30; }, src: () => seg('calm', d, { line: 1 }), why: `the narrow spike at ${m} Hz disappears while neighbouring frequencies are almost unchanged` },
      hp: { label: 'High-pass 1 Hz', sub: 'cuts slow components', cfg: (c) => { c.hp.on = true; c.hp.fc = 1; c.hp.order = 2; }, src: () => seg('relaxed', d, { drift: 1 }), why: 'power below about 1 Hz is removed and the baseline stops wandering' },
      lp: { label: 'Low-pass 40 Hz', sub: 'cuts fast components', cfg: (c) => { c.lp.on = true; c.lp.fc = 40; c.lp.order = 4; }, src: () => seg('calm', d, { noise: 0.6 }), why: 'power above about 40 Hz falls away while the lower bands are preserved' },
      bp: { label: 'Band-pass 8–13 Hz', sub: 'keeps alpha only', cfg: (c) => { c.bp.on = true; c.bp.lo = 8; c.bp.hi = 13; c.bp.order = 4; }, src: () => seg('relaxed', d, { noise: 0.2 }), why: 'only the 8–13 Hz window survives; everything slower and faster is strongly reduced' },
      median: { label: 'Median filter', sub: 'ignores brief spikes', cfg: (c) => { c.nr.on = true; c.nr.method = 'median'; c.nr.ms = 16; }, src: () => { const s = seg('calm', d); const y = Float32Array.from(s.samples); for (let k = 0; k < 6; k++) y[40 + Math.floor(Math.random() * (y.length - 80))] += (Math.random() < 0.5 ? -1 : 1) * rnd(70, 120); s.samples = y; return s; }, why: 'the isolated spikes are gone but the waves around them are intact' },
    };
    const pool = d === 'beginner' ? ['notch', 'hp', 'lp'] : ['notch', 'hp', 'lp', 'bp', 'median'], key = pickN(pool), t = T[key], s = t.src();
    const cfg = store.defaults('studio.chain'); t.cfg(cfg);
    const chain = dsp.makeChain(cfg, FS), after = chain.apply(s.samples, { zeroPhase: true }), rb = welch(s.samples), ra = welch(after);
    const wrong = U.shuffle(pool.filter((k) => k !== key)).slice(0, nOpt(d) - 1), all = U.shuffle([key, ...wrong]);
    return {
      id: 'flt-' + key, mode: 'filter', prompt: 'The lower trace is the upper trace after <b>one</b> filter. Which filter was it?', clue: d === 'beginner' ? 'Clue: compare the two spectra — which part disappeared?' : null,
      options: all.map((k) => ({ id: k, label: T[k].label, sub: T[k].sub })), answer: key,
      hint: 'Look for where the “after” spectrum differs from the “before” one. Narrow gap, one-sided gap, or everything outside a window?',
      explain: `<b>${t.label}.</b> In the spectra, ${t.why}. This result was produced by the same filter code used in the Processing Studio (zero-phase).`,
      visual: { lanes: [{ label: 'Before', sub: s.channel, data: s.samples }, { label: 'After', sub: 'filtered', data: after }], spec: [{ psd: rb.psd, df: rb.df, label: 'before', colorKey: 'accent' }, { psd: ra.psd, df: ra.df, label: 'after', colorKey: 'green' }], specHidden: false, sel: -1 },
    };
  };

  /* ---------- spectrogram interpretation ---------- */
  gens.spectro = (d) => {
    const pairs = d === 'beginner' ? [['drowsy', 'active'], ['relaxed', 'drowsy'], ['active', 'relaxed']] : [['drowsy', 'active'], ['relaxed', 'drowsy'], ['active', 'relaxed'], ['deep', 'relaxed'], ['calm', 'drowsy']];
    const [a, b] = pickN(pairs), sa = seg(a, d, { seconds: 4 }), sb = seg(b, d, { seconds: 4 });
    const x = new Float32Array(sa.samples.length + sb.samples.length); x.set(sa.samples, 0); x.set(sb.samples, sa.samples.length);
    const spec = NG.stft.stft(x, FS, { nfft: 256, overlap: 0.75, window: 'hann', detrend: true });
    const half = (from, to) => { const acc = new Float64Array(BANDS.length); for (let f = 0; f < spec.frames; f++) { if (spec.times[f] < from || spec.times[f] >= to) continue; BANDS.forEach((bd, i) => { acc[i] += NG.stft.bandTrace({ frames: 1, bins: spec.bins, freqs: spec.freqs, df: spec.df, power: spec.power.subarray(f * spec.bins, (f + 1) * spec.bins) }, bd.lo, bd.hi)[0]; }); } return dsp.dominantBand(Array.from(acc)); };
    const dur = x.length / FS, d1 = half(0.5, dur / 2 - 0.5), d2 = half(dur / 2 + 0.5, dur - 0.5);
    const idx = [0, 1, 2, 3, 4].slice(0, d === 'beginner' ? 4 : 5), ids = U.shuffle(idx.filter((i) => i !== d2)).slice(0, nOpt(d) - 1), all = U.shuffle([d2, ...ids]);
    return {
      id: 'spg-' + b, mode: 'spectro', prompt: 'This spectrogram is one recording whose state switches <b>halfway through</b> (at 4 s). Which band dominates the <b>second half</b>?', clue: d === 'beginner' ? 'Clue: colour is power, vertical is frequency. Look for the brightest horizontal band right of the middle.' : null,
      options: all.map((i) => ({ id: 'b' + i, label: BANDS[i].name, sub: `${BANDS[i].lo}–${BANDS[i].hi} Hz` })), answer: 'b' + d2,
      hint: 'Ignore the left half. Find the brightest frequency range after the middle of the plot, then match it to a band using the dotted band guides.',
      explain: `<b>${BANDS[d2].name}.</b> Measured from the STFT (256-sample Hann window, 75 % overlap): the first half was dominated by <b>${BANDS[d1].name}</b> (“${a}” profile), the second half by <b>${BANDS[d2].name}</b> (“${b}” profile). Spectrograms trade time resolution against frequency resolution, so the switch looks smeared by about one window (1 s).`,
      visual: { lanes: [{ label: 'Signal', sub: sa.channel, data: x }], stft: spec, stftDur: dur, spec: [], specHidden: false, sel: -1 },
    };
  };

  /* ---------- model evaluation (confusion-matrix arithmetic) ---------- */
  gens.model = (d) => {
    const k = d === 'beginner' ? 2 : 3, names = k === 2 ? ['Relax', 'Active'] : ['Left', 'Right', 'Rest'], cm = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cm[i][j] = i === j ? 12 + Math.floor(Math.random() * 28) : Math.floor(Math.random() * (d === 'expert' ? 14 : 9));
    if (d === 'expert') cm[k - 1] = cm[k - 1].map((v, j) => (j === k - 1 ? v + 60 : v)); // imbalance
    const M = NG.evalkit.classMetrics(cm), c = Math.floor(Math.random() * k);
    const kind = pickN(d === 'beginner' ? ['accuracy', 'precision', 'recall'] : ['precision', 'recall', 'f1', 'macro', 'weighted']);
    const fmt = (v) => (v * 100).toFixed(1) + '%', value = kind === 'accuracy' ? M.accuracy : kind === 'macro' ? M.macro.f1 : kind === 'weighted' ? M.weighted.f1 : M.per[c][kind];
    const label = kind === 'macro' ? 'macro-averaged F1' : kind === 'weighted' ? 'weighted F1' : kind === 'accuracy' ? 'overall accuracy' : `${kind} for “${names[c]}”`;
    const set = new Set([fmt(value)]); let guard = 0;
    const alts = [M.accuracy, M.macro.f1, M.weighted.f1, M.per[c].precision, M.per[c].recall, M.per[c].f1, value + 0.07, value - 0.06, value + 0.13].map(fmt);
    for (const a of U.shuffle(alts)) { if (set.size >= nOpt(d)) break; if (!set.has(a) && !(Math.abs(parseFloat(a) - value * 100) < 1.5)) set.add(a); }
    while (set.size < nOpt(d) && guard++ < 20) set.add(fmt(Math.max(0.05, Math.min(0.99, value + rnd(-0.25, 0.25)))));
    const opts = U.shuffle([...set]), table = `<table class="tbl cm-q"><thead><tr><th>true ↓ / predicted →</th>${names.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${cm.map((r, i) => `<tr><th>${names[i]}</th>${r.map((v, j) => `<td class="${i === j ? 'diag' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const how = { accuracy: 'correct ÷ total = diagonal sum ÷ all cells', precision: 'TP ÷ (TP + FP): the column’s diagonal over the column sum', recall: 'TP ÷ (TP + FN): the row’s diagonal over the row sum', f1: 'the harmonic mean 2·P·R ÷ (P + R)', macro: 'the unweighted mean of per-class F1 — every class counts equally', weighted: 'per-class F1 weighted by class size (support)' }[kind];
    return {
      id: 'mdl-' + kind, mode: 'model', prompt: `Simulated classifier results (rows = true class, columns = predicted):${table}What is the <b>${label}</b>?`, clue: null,
      options: opts.map((o, i) => ({ id: 'm' + i, label: o })), answer: 'm' + opts.indexOf(fmt(value)),
      hint: kind === 'accuracy' ? 'Add the diagonal, divide by the sum of all cells.' : 'Decide whether you need a row or a column of the matrix.',
      explain: `<b>${fmt(value)}.</b> ${label[0].toUpperCase() + label.slice(1)} is ${how}. Overall accuracy here is ${fmt(M.accuracy)}, macro F1 ${fmt(M.macro.f1)}, weighted F1 ${fmt(M.weighted.f1)} — when classes are imbalanced these can differ a lot, which is why accuracy alone can mislead. (These counts are invented for practice; they are not results from any real EEG model.)`,
      visual: null,
    };
  };

  /* ---------- BCI pipeline ---------- */
  const BCI = {
    beginner: [
      ['Which is the correct order of a BCI pipeline?', 'Acquire → preprocess → extract features → classify → output', ['Classify → acquire → output → preprocess', 'Output → classify → preprocess → acquire', 'Preprocess → output → acquire → classify'], 'Signals must be measured first, cleaned, summarised as features, classified, and only then turned into an output.'],
      ['In a left/right motor-imagery BCI, what is the usual feature?', 'Mu/beta band power over the motor cortex', ['The electrode’s serial number', 'Screen brightness', 'Heart rate only'], 'Imagined movement changes mu (8–13 Hz) and beta power over the motor cortex (e.g. C3/C4), so band power is a standard feature.'],
      ['If the electrode contact is poor, what should happen to the BCI output?', 'It becomes less reliable', ['It becomes more accurate', 'Nothing changes', 'It reads thoughts better'], 'Noise hides the features the classifier needs. In the BCI Playground, lowering signal quality really lowers accuracy.'],
      ['Does the BCI Playground read your real intentions?', 'No — it uses simulated activity', ['Yes, through the camera', 'Yes, through the microphone', 'Only on mobile'], 'Everything in the playground is simulated. It demonstrates the pipeline; it does not decode a person.'],
      ['What does the classifier output?', 'A predicted class (and usually a confidence)', ['A new EEG signal', 'A filter cut-off', 'The electrode map'], 'It maps features to a label such as “left” or “right”.'],
    ],
    intermediate: [
      ['Why is the decoder trained on features rather than raw samples in this playground?', 'Features are compact and highlight the informative bands', ['Raw samples are illegal', 'Features contain no noise at all', 'It makes the model slower'], 'Band-power features summarise the part of the signal that changes between tasks and greatly reduce dimensionality.'],
      ['A decoder shows 100 % on training trials but 60 % on new trials. This indicates…', 'Overfitting', ['A perfect BCI', 'Underfitting', 'A hardware fault only'], 'A large train/test gap means the model memorised training data.'],
      ['Why must the feature scaler be fitted on the training set only?', 'Otherwise information from the test set leaks into training', ['Because scalers are slow', 'To make accuracy lower', 'It does not matter'], 'Fitting statistics on all data lets test information influence training and inflates results.'],
      ['Why does a causal filter matter in an online BCI?', 'It cannot use future samples, as real-time systems cannot see them', ['It is always more accurate', 'It removes all noise', 'It avoids classifiers'], 'Real-time output only has the past; zero-phase filtering needs the future, so offline results can be optimistic.'],
      ['Two classes, 50 trials each, 62 % accuracy on 20 test trials. What is a fair statement?', 'Too few trials to be confident; the interval is wide', ['It proves the decoder works', 'It proves the decoder fails', 'Accuracy is exactly 62 % with no uncertainty'], 'With 20 trials the 95 % confidence interval is very wide. Chance for two balanced classes is 50 %.'],
    ],
    expert: [
      ['When splitting BCI trials into train/validation/test, why group by recording session or subject?', 'Neighbouring trials are correlated, so random splits leak', ['It speeds up training', 'Sessions are always identical', 'To balance classes automatically'], 'Trials from the same session share drift and electrode impedance; a random split lets the model recognise the session rather than the task.'],
      ['Accuracy on a 90/10 imbalanced task is 90 %. What should you check?', 'Whether it is just predicting the majority class', ['Nothing — 90 % is excellent', 'The sampling rate', 'The monitor'], 'A constant majority-class guess already scores 90 %. Look at per-class recall, macro F1 and the confusion matrix.'],
      ['Why can a BCI demo with simulated data NOT be quoted as evidence for real-world performance?', 'The simulator’s effect size and noise were set by the author', ['Simulations are always wrong', 'Real EEG has no noise', 'Classifiers cannot run on simulations'], 'The class difference in simulated data is built in. Real performance depends on subjects, hardware, artefacts and variability.'],
      ['Which change most plausibly improves online stability without retraining?', 'Smoothing or requiring several consistent predictions before acting', ['Raising the learning rate', 'Removing the filter', 'Using the test set for tuning'], 'Temporal smoothing/voting trades latency for fewer spurious commands.'],
      ['Wiping the high-frequency band with a 20 Hz low-pass in a motor-imagery pipeline is…', 'Risky: it removes beta that carries information', ['Always helpful', 'Irrelevant', 'Required by law'], 'Beta (13–30 Hz) is informative for motor imagery, so a low cut-off throws away useful signal.'],
    ],
  };
  gens.bci = (d) => {
    const bank = BCI[d], i = Math.floor(Math.random() * bank.length), [q, right, wrong, why] = bank[i], opts = U.shuffle([right, ...wrong.slice(0, nOpt(d) - 1)]);
    return { id: `bci-${d[0]}${i}`, mode: 'bci', prompt: q, clue: null, options: opts.map((t, k) => ({ id: 'o' + k, label: t })), answer: 'o' + opts.indexOf(right), hint: 'Remove options that contradict how data flows through the pipeline or how evaluation should be done.', explain: why, visual: null };
  };
})();
