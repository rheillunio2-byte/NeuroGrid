/* NeuroGrid — Experiments: four learning modes, three difficulty levels, scoring, streaks,
 * explanations, achievements and a progress dashboard. Answers are derived from the generated
 * signals themselves (band power via Welch PSD, real filter output) — never random "predictions". */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, dsp = NG.dsp, sim = NG.sim, progress = NG.progress;
  const BANDS = dsp.BANDS, FS = 256;
  NG.views = NG.views || {};

  const DIFF = {
    beginner: { name: 'Beginner', base: 10, noise: [0.04, 0.1], blurb: 'Clear signals, 3 choices, gentle clues.' },
    intermediate: { name: 'Intermediate', base: 15, noise: [0.14, 0.28], blurb: 'More noise and one extra choice.' },
    expert: { name: 'Expert', base: 20, noise: [0.3, 0.5], blurb: 'Messy signals, similar profiles, no clues.' },
  };
  const MODES = {
    pattern: { name: 'Pattern Detective', icon: 'target', blurb: 'Look at a simulated signal and work out which brain-state profile produced it.' },
    compare: { name: 'Compare Signals', icon: 'layers', blurb: 'Two signals, one band. Which has more activity there? The answer is measured, not guessed.' },
    quiz: { name: 'Band & Basics Quiz', icon: 'book', blurb: 'Questions about frequency bands, EEG and BCI concepts.' },
    dsp: { name: 'DSP Challenge', icon: 'sliders', blurb: 'A signal has a problem. Pick the processing that fixes it, then see the real result.' },
  };
  Object.assign(MODES, NG.expModes || {});
  const ROUND = 10;
  const LETTERS = 'ABCDE';
  const bandName = (i) => BANDS[i].name;
  const pct = (v) => Math.round(v * 100) + '%';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickN = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------------------------------------------------------------- generators */
  function relPowers(x, nper = 512) { const { psd, df } = dsp.welch(x, FS, nper); return { psd, df, bp: dsp.bandPowers(psd, df) }; }
  function segFor(profile, d, extra = {}) {
    const c = DIFF[d];
    return sim.makeSegment(profile, Object.assign({ seconds: 4, warmup: 1, channel: d === 'expert' ? pickN(['C3', 'C4']) : 'C3', noise: rnd(c.noise[0], c.noise[1]), line: rnd(0, 0.08), drift: rnd(0.02, 0.2), amplitude: d === 'expert' ? rnd(0.8, 1.25) : 1, mains: store.get('ui.mains') }, extra));
  }
  const PICK_LABEL = { relaxed: ['Relaxed', 'Strong alpha'], calm: ['Calm focus', 'Alpha + some beta'], active: ['Focused thinking', 'Beta dominant'], drowsy: ['Drowsy', 'Theta + delta'], deep: ['Deep concentration', 'Beta + gamma, low alpha'] };
  const clue = { relaxed: 'Smooth, large, regular waves.', calm: 'Regular waves with a little fast ripple.', active: 'Small, fast, busy waves.', drowsy: 'Slow, rolling, large waves.', deep: 'Very fast, fine ripples riding on slower ones.' };

  function genPattern(d) {
    const pools = { beginner: ['relaxed', 'active', 'drowsy'], intermediate: ['relaxed', 'active', 'drowsy', 'deep'], expert: ['calm', 'relaxed', 'active', 'drowsy', 'deep'] };
    const pool = pools[d], id = pickN(pool), seg = segFor(id, d), r = relPowers(seg.samples), dom = dsp.dominantBand(r.bp.rel);
    const bandsTxt = BANDS.map((b, i) => `${b.sym} ${pct(r.bp.rel[i])}`).join(' · ');
    return {
      id: 'pat-' + id, mode: 'pattern', prompt: 'Which simulated brain-state profile generated this signal?', clue: d === 'beginner' ? 'Clue: ' + clue[id] : d === 'intermediate' ? 'Clue: think about how fast the dominant wave is.' : null,
      options: U.shuffle(pool).map((p) => ({ id: p, label: PICK_LABEL[p][0], sub: PICK_LABEL[p][1] })), answer: id,
      hint: `Open the spectrum: the tallest shaded band is the biggest clue. The slowest bands are on the left, the fastest on the right.`,
      explain: `<b>${PICK_LABEL[id][0]}.</b> Measured relative power in this window: ${bandsTxt}. The strongest band is <b>${bandName(dom)}</b>. ${sim.PROFILES[id].desc}`,
      visual: { lanes: [{ label: 'Signal', sub: seg.channel, data: seg.samples }], spec: [{ psd: r.psd, df: r.df, label: 'PSD', colorKey: 'accent' }], specHidden: true, sel: -1 },
    };
  }

  function genCompare(d) {
    const pools = { beginner: { bands: [1, 2, 3], min: 2.5 }, intermediate: { bands: [0, 1, 2, 3], min: 1.7 }, expert: { bands: [0, 1, 2, 3, 4], min: 1.35 } };
    const cfg = pools[d], ids = ['calm', 'active', 'relaxed', 'drowsy', 'deep'];
    for (let tries = 0; tries < 120; tries++) {
      const b = pickN(cfg.bands), [pa, pb] = U.shuffle(ids).slice(0, 2), sa = segFor(pa, d), sb = segFor(pb, d);
      const ra = relPowers(sa.samples), rb = relPowers(sb.samples), A = ra.bp.abs[b], B = rb.bp.abs[b], ratio = Math.max(A, B) / Math.max(1e-9, Math.min(A, B));
      if (ratio < cfg.min && tries < 119) continue;
      const aWins = A > B;
      return {
        id: 'cmp-' + BANDS[b].id, mode: 'compare', prompt: `Which signal has more <b>${bandName(b)}</b> (${BANDS[b].lo}–${BANDS[b].hi} Hz) activity?`, clue: d === 'beginner' ? `Clue: ${bandName(b)} is ${b < 2 ? 'a slow' : b === 2 ? 'a medium-speed' : 'a fast'} rhythm.` : null,
        options: [{ id: 'A', label: 'Signal A', sub: 'top trace' }, { id: 'B', label: 'Signal B', sub: 'bottom trace' }], answer: aWins ? 'A' : 'B',
        hint: `Show the spectra: compare the height of the two curves inside the highlighted ${bandName(b)} band.`,
        explain: `<b>Signal ${aWins ? 'A' : 'B'}</b> has more ${bandName(b)} power: ${Math.max(A, B).toFixed(1)} µV² vs ${Math.min(A, B).toFixed(1)} µV² (${ratio.toFixed(1)}× more), measured with a Welch power spectrum of each trace. (A was the “${PICK_LABEL[pa][0]}” profile, B was “${PICK_LABEL[pb][0]}”.)`,
        visual: { lanes: [{ label: 'Signal A', sub: '', data: sa.samples }, { label: 'Signal B', sub: '', data: sb.samples }], spec: [{ psd: ra.psd, df: ra.df, label: 'A', colorKey: 'accent' }, { psd: rb.psd, df: rb.df, label: 'B', colorKey: 'violet' }], specHidden: true, sel: b },
      };
    }
  }

  const BANK = {
    beginner: [
      ['Which brainwave band is most associated with relaxed wakefulness, especially with eyes closed?', 'Alpha (8–13 Hz)', ['Delta (0.5–4 Hz)', 'Beta (13–30 Hz)', 'Gamma (30–100 Hz)'], 'Alpha is the classic relaxed-wakefulness rhythm, strongest over the back of the head when the eyes are closed.'],
      ['What frequency range is the “beta” band?', '13–30 Hz', ['0.5–4 Hz', '4–8 Hz', '8–13 Hz'], 'Beta spans roughly 13–30 Hz and is linked with alert, active processing.'],
      ['What does an EEG electrode on the scalp pick up?', 'Tiny electrical signals from large groups of neurons', ['Blood flow in the brain', 'Thoughts as words', 'Heat from the brain'], 'EEG measures voltage fluctuations — microvolts — produced by many neurons acting together. It does not read thoughts.'],
      ['Which is the slowest of the five classic EEG bands?', 'Delta', ['Theta', 'Alpha', 'Gamma'], 'Delta (about 0.5–4 Hz) is the slowest, dominant in deep sleep.'],
      ['What does BCI stand for?', 'Brain-Computer Interface', ['Basic Cortex Indicator', 'Binary Control Input', 'Brain Cell Imaging'], 'A BCI translates brain activity into commands for a computer or device.'],
      ['Why does 50/60 Hz “hum” appear in EEG recordings?', 'Nearby mains power lines induce interference', ['The brain naturally oscillates at 60 Hz', 'Electrodes get hot', 'Eye blinks create it'], 'Electrical mains wiring couples into the very small EEG voltages. A notch filter removes it.'],
      ['What does a low-pass filter do?', 'Lets slow frequencies through and blocks fast ones', ['Lets fast frequencies through', 'Makes the signal louder', 'Removes only one frequency'], 'Low-pass = “low frequencies pass”. It removes high-frequency fuzz such as muscle noise.'],
      ['In NeuroGrid, where does the EEG-like signal come from?', 'A simulator running in your browser', ['Your own brain through the webcam', 'A hospital database', 'Your phone’s sensors'], 'Every signal in NeuroGrid is synthetic. Nothing is recorded from you.'],
      ['Which band tends to increase as a person becomes drowsy?', 'Theta', ['Gamma', 'Beta', 'None of them change'], 'Slower theta (4–8 Hz) activity rises in drowsiness and light sleep.'],
      ['A sampling rate of 256 Hz means…', '256 measurements are taken every second', ['The signal is 256 Hz only', 'Data is saved every 256 seconds', '256 electrodes are used'], 'Sampling rate = measurements per second. 256 Hz is common for EEG.'],
      ['Electrode names such as Fp1, C3 and O1 come from…', 'The international 10–20 placement system', ['A random numbering', 'The manufacturer', 'The brain’s folds'], 'The 10–20 system standardises where electrodes sit: Fp = frontal pole, C = central, O = occipital.'],
      ['Eye blinks show up most strongly on which electrodes?', 'Frontal ones (Fp1, Fp2)', ['Occipital ones (O1, O2)', 'None — blinks are invisible', 'Only on the ears'], 'Frontal electrodes sit closest to the eyes, so blink artefacts are largest there.'],
    ],
    intermediate: [
      ['With a 256 Hz sampling rate, what is the highest frequency that can be represented correctly?', '128 Hz', ['256 Hz', '64 Hz', '512 Hz'], 'The Nyquist limit is half the sampling rate: 256 ÷ 2 = 128 Hz.'],
      ['What does a band-pass filter set to 8–13 Hz keep?', 'Mostly alpha activity', ['Mostly beta', 'Everything except alpha', 'Only 60 Hz hum'], 'A band-pass keeps frequencies between its edges — here, the alpha band.'],
      ['A notch filter is mainly used to…', 'Remove one narrow frequency such as mains hum', ['Remove all slow drift', 'Smooth the whole signal', 'Amplify alpha'], 'A notch has a very narrow stop band, ideal for 50/60 Hz interference.'],
      ['After z-score normalisation, a signal has…', 'Mean 0 and standard deviation 1', ['Values between −1 and 1', 'No noise', 'A 60 Hz peak'], 'Z-score subtracts the mean and divides by the standard deviation.'],
      ['Why use a median filter on EEG?', 'It rejects brief spikes without smearing them', ['It speeds up the signal', 'It isolates alpha', 'It adds noise'], 'The median ignores outliers, so isolated spikes disappear. A moving average would smear them.'],
      ['Over the motor cortex, the mu/beta rhythm typically…', 'Drops when you move or imagine moving', ['Doubles when you imagine moving', 'Disappears forever', 'Turns into delta'], 'This event-related desynchronisation (ERD) is a foundation of motor-imagery BCIs.'],
      ['“Relative band power” means…', 'Power in a band divided by total power', ['Power measured relative to a friend’s brain', 'The band’s centre frequency', 'Power after filtering'], 'Dividing by the total makes values comparable between recordings of different overall amplitude.'],
      ['Raising a Butterworth filter’s order makes it…', 'Cut off more steeply', ['Pass more noise', 'Shift its cut-off frequency', 'Slower to compute only'], 'Higher order = steeper roll-off between pass band and stop band.'],
      ['What is aliasing?', 'Fast frequencies masquerading as slow ones when sampled too slowly', ['Two electrodes touching', 'A filter ringing', 'Noise from the amplifier'], 'If a signal has frequencies above Nyquist, they fold back to lower, false frequencies.'],
      ['What does the FFT compute?', 'The frequency content of a signal', ['The brain’s location', 'Electrode impedance', 'A classification label'], 'The fast Fourier transform converts time-domain samples into frequency-domain amplitudes.'],
      ['A signal-to-noise ratio of 10 dB means signal power is…', '10× the noise power', ['10% of the noise power', 'Equal to the noise', '100× the noise'], 'SNR(dB) = 10·log10(Psignal/Pnoise); 10 dB is a factor of 10 in power.'],
      ['Which artefact is slow, large and mostly frontal?', 'Eye blink', ['Mains hum', 'Muscle (EMG) fuzz', 'Alpha rhythm'], 'Blinks produce a smooth, tall deflection lasting a few hundred milliseconds.'],
    ],
    expert: [
      ['Why can’t zero-phase (forward–backward) filtering be used in a real-time BCI?', 'It needs future samples', ['It is too inaccurate', 'It only works at 60 Hz', 'It removes the signal'], 'Running the filter backwards requires data that hasn’t arrived yet. Real-time systems use causal filters and accept the delay.'],
      ['Filtering forward then backward does what to the magnitude response?', 'Squares it (and cancels phase shift)', ['Halves it', 'Leaves it unchanged', 'Adds a notch'], 'Two passes apply the magnitude twice — doubling attenuation in dB — while the phase lag cancels out.'],
      ['Applying a window (such as Hann) before an FFT mainly reduces…', 'Spectral leakage', ['Sampling rate', 'Nyquist frequency', 'Mains hum'], 'Windowing tapers the segment edges, so energy from one frequency leaks less into others.'],
      ['Welch’s method gives a lower-variance spectrum by…', 'Averaging periodograms of overlapping segments', ['Using a longer filter', 'Removing the mean only', 'Sampling faster'], 'Averaging several segment spectra trades a little frequency resolution for a much smoother estimate.'],
      ['A Butterworth filter is designed to be…', 'Maximally flat in the pass band', ['Perfectly sharp', 'Linear phase', 'Non-causal'], 'Butterworth has no ripple in the pass band, at the cost of a gentler roll-off than some alternatives.'],
      ['Why is a 10 Hz high-pass a poor way to “remove drift” in EEG?', 'It would also delete delta, theta and much alpha', ['It would add 60 Hz noise', 'Drift is above 10 Hz', 'It makes the sampling rate drop'], 'Drift is below about 1 Hz; a 10 Hz cut-off removes most real brain rhythms too.'],
      ['Overfitting means a model…', 'Memorises training data and fails on new data', ['Is too small to learn', 'Trains too quickly', 'Needs more electrodes'], 'The tell-tale sign is high training accuracy but much lower accuracy on held-out data.'],
      ['Why evaluate a classifier on held-out data?', 'To estimate performance on data it has never seen', ['To make training faster', 'To remove noise', 'To choose electrode positions'], 'Accuracy on training data is optimistic; held-out data shows how well it generalises.'],
      ['A notch with Q = 30 at 60 Hz has a −3 dB bandwidth of about…', '2 Hz', ['30 Hz', '0.2 Hz', '60 Hz'], 'Bandwidth ≈ f0 / Q = 60 / 30 = 2 Hz.'],
      ['Which BCI paradigm relies on flickering stimuli at known frequencies?', 'SSVEP', ['P300 speller', 'Motor imagery', 'Neurofeedback'], 'Steady-state visual evoked potentials: looking at a target flickering at f Hz raises EEG power at f Hz (and harmonics) over visual cortex.'],
      ['The P300 is…', 'A positive deflection about 300 ms after a rare, attended stimulus', ['A 300 Hz oscillation', 'A 300 µV artefact', 'A filter type'], 'P300 spellers flash letters and detect which flash evoked the “oddball” response.'],
      ['Why is scalp gamma activity hard to interpret?', 'It is weak and easily contaminated by muscle activity', ['It does not exist', 'It is below Nyquist', 'It only occurs in sleep'], 'Facial and neck muscles generate broadband fast activity that overlaps the gamma range.'],
    ],
  };
  function genQuiz(d, used) {
    const bank = BANK[d], idx = Array.from(bank.keys()).filter((i) => !used.has(i)), i = pickN(idx.length ? idx : Array.from(bank.keys()));
    used.add(i);
    const [q, right, wrong, why] = bank[i], opts = U.shuffle([right, ...wrong.slice(0, d === 'beginner' ? 2 : 3)]);
    return { id: `quiz-${d[0]}${i}`, mode: 'quiz', prompt: q, clue: null, options: opts.map((t, k) => ({ id: 'o' + opts.indexOf(t), label: t })), answer: 'o' + opts.indexOf(right), hint: 'Eliminate the options that clearly contradict what you know, then choose between the rest.', explain: why, visual: null };
  }

  /* DSP challenge */
  const TECH = {
    notch: (m) => ({ label: `Notch filter at ${m} Hz`, sub: 'cuts one narrow frequency', cfg: (c) => { c.notch.on = true; c.notch.f0 = m; c.notch.q = 30; } }),
    hp: () => ({ label: 'High-pass filter at 1 Hz', sub: 'removes slow drift', cfg: (c) => { c.hp.on = true; c.hp.fc = 1; c.hp.order = 2; } }),
    lp: () => ({ label: 'Low-pass filter at 40 Hz', sub: 'removes fast fuzz', cfg: (c) => { c.lp.on = true; c.lp.fc = 40; c.lp.order = 4; } }),
    bp: () => ({ label: 'Band-pass filter 8–13 Hz', sub: 'keeps only alpha', cfg: (c) => { c.bp.on = true; c.bp.lo = 8; c.bp.hi = 13; c.bp.order = 4; } }),
    median: () => ({ label: 'Median filter (16 ms)', sub: 'ignores brief spikes', cfg: (c) => { c.nr.on = true; c.nr.method = 'median'; c.nr.ms = 16; } }),
    avg: () => ({ label: 'Long moving average (200 ms)', sub: 'heavy smoothing', cfg: (c) => { c.nr.on = true; c.nr.method = 'mean'; c.nr.ms = 80; } }),
    lp5: () => ({ label: 'Low-pass filter at 5 Hz', sub: 'keeps only very slow waves', cfg: (c) => { c.lp.on = true; c.lp.fc = 5; c.lp.order = 4; } }),
    hp10: () => ({ label: 'High-pass filter at 10 Hz', sub: 'removes everything slow', cfg: (c) => { c.hp.on = true; c.hp.fc = 10; c.hp.order = 4; } }),
    norm: () => ({ label: 'Z-score normalisation', sub: 'rescale to mean 0, SD 1', cfg: (c) => { c.norm.on = true; c.norm.method = 'zscore'; } }),
    hpNotch: (m) => ({ label: `High-pass 1 Hz + notch ${m} Hz`, sub: 'two stages', cfg: (c) => { TECH.hp().cfg(c); TECH.notch(m).cfg(c); } }),
    lpNotch: (m) => ({ label: `Notch ${m} Hz + low-pass 40 Hz`, sub: 'two stages', cfg: (c) => { TECH.lp().cfg(c); TECH.notch(m).cfg(c); } }),
    hpMedian: () => ({ label: 'High-pass 1 Hz + median filter', sub: 'two stages', cfg: (c) => { TECH.hp().cfg(c); TECH.median().cfg(c); } }),
    lp5hp: () => ({ label: 'Low-pass 5 Hz + median filter', sub: 'two stages', cfg: (c) => { TECH.lp5().cfg(c); TECH.median().cfg(c); } }),
    avgNotch: (m) => ({ label: `Long average + notch ${m} Hz`, sub: 'two stages', cfg: (c) => { TECH.avg().cfg(c); TECH.notch(m).cfg(c); } }),
  };
  function addSpikes(x) {
    const y = Float32Array.from(x), n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) { const p = 40 + Math.floor(Math.random() * (y.length - 80)), a = (Math.random() < 0.5 ? -1 : 1) * rnd(70, 120); y[p] += a; if (Math.random() < 0.5) y[p + 1] += a * 0.6; }
    return y;
  }
  function genDsp(d) {
    const m = store.get('ui.mains');
    const S = {
      hum: { prompt: `The spectrum shows a sharp spike at <b>${m} Hz</b> on top of normal brain activity. What is the best fix?`, make: () => segFor('calm', d, { line: 1, noise: 0.06, drift: 0.05 }), ans: TECH.notch(m), wrong: ['hp', 'lp5', 'avg'], hint: 'The problem is one narrow frequency, so use the narrowest tool.', why: 'The interference sits at exactly one frequency, so a narrow <b>notch</b> removes it while leaving neighbouring brain rhythms almost untouched.' },
      drift: { prompt: 'The trace wanders slowly up and down, while the faster waves ride on top. What is the best fix?', make: () => segFor('relaxed', d, { drift: 1, noise: 0.05, line: 0 }), ans: TECH.hp(), wrong: ['lp', 'notch', 'avg', 'bp'], hint: 'The unwanted part is much slower than the brain rhythms.', why: 'Drift lives below about 1 Hz. A gentle <b>high-pass</b> filter removes it and keeps delta-through-gamma rhythms.' },
      fuzz: { prompt: 'Fast, jagged fuzz covers the waveform and the spectrum is raised at high frequencies. What is the best fix?', make: () => segFor('calm', d, { noise: 0.6, line: 0, drift: 0.05 }), ans: TECH.lp(), wrong: ['hp', 'hp10', 'norm', 'lp5'], hint: 'Fuzz is fast. Which filter blocks fast things?', why: 'Muscle and electronic noise are high-frequency, so a <b>low-pass</b> near 40 Hz cleans the trace while keeping the classic EEG bands.' },
      isolate: { prompt: 'You want to study only the <b>alpha rhythm</b> (8–13 Hz) in this signal. What should you apply?', make: () => segFor('relaxed', d, { noise: 0.25, drift: 0.2, line: 0 }), ans: TECH.bp(), wrong: ['lp', 'hp', 'notch', 'median'], hint: 'You need to keep a window of frequencies, not just cut one end.', why: 'A <b>band-pass</b> with edges at 8 and 13 Hz keeps alpha and rejects both slower and faster activity.' },
      spikes: { prompt: 'A few sharp, isolated spikes stand out from the trace. Which filter removes them best without blurring the waves?', make: () => { const s = segFor('calm', d, { noise: 0.1, line: 0, drift: 0.05 }); s.samples = addSpikes(s.samples); return s; }, ans: TECH.median(), wrong: ['avg', 'hp', 'norm', 'lp5'], hint: 'Averaging spreads a spike out; something else ignores it entirely.', why: 'A <b>median</b> filter ignores outliers, so brief spikes vanish. A moving average would just smear them into small bumps.' },
      scale: { prompt: 'Two recordings have the same shape but one is about 10× larger. You want to compare their shapes fairly. What helps?', make: () => { const a = segFor('active', d, { amplitude: 0.35, noise: 0.08, line: 0 }), b = segFor('active', d, { amplitude: 3.2, noise: 0.08, line: 0 }); return { samples: a.samples, other: b.samples, scale: true, channel: 'C3' }; }, ans: TECH.norm(), wrong: ['lp', 'hp', 'notch'], hint: 'You are changing units, not frequency content.', why: '<b>Normalisation</b> (such as z-score) puts both signals on the same scale — mean 0, spread 1 — so only their shapes differ.' },
      combo1: { prompt: `The trace drifts slowly <b>and</b> has a spike at ${m} Hz in the spectrum. Which chain fixes both?`, make: () => segFor('calm', d, { drift: 1, line: 1, noise: 0.08 }), ans: TECH.hpNotch(m), wrong: ['lpNotch', 'lp5hp', 'avgNotch'], hint: 'Name the two problems first: one is slow, one is narrow.', why: 'Drift needs a <b>high-pass</b>; the hum needs a <b>notch</b>. A low-pass would not touch slow drift.' },
      combo2: { prompt: `Strong ${m} Hz hum and heavy high-frequency fuzz are both present. Which chain is best?`, make: () => segFor('active', d, { line: 1, noise: 0.6, drift: 0.05 }), ans: TECH.lpNotch(m), wrong: ['hpNotch', 'lp5hp', 'avgNotch'], hint: 'One problem is narrow, one is “everything fast”.', why: 'A <b>notch</b> removes the hum and a <b>low-pass</b> removes the fuzz. A long average would also blur genuine beta rhythms.' },
      combo3: { prompt: 'Slow drift plus a handful of sharp spikes. Which chain suits it?', make: () => { const s = segFor('calm', d, { drift: 1, noise: 0.1, line: 0 }); s.samples = addSpikes(s.samples); return s; }, ans: TECH.hpMedian(), wrong: ['lpNotch', 'lp5hp', 'avgNotch'], hint: 'Slow problem → high-pass. Spikes → something that ignores outliers.', why: 'A <b>high-pass</b> removes the drift and a <b>median</b> filter removes the spikes. A 5 Hz low-pass would erase alpha and beta.' },
    };
    const pools = { beginner: ['hum', 'drift', 'fuzz', 'isolate'], intermediate: ['hum', 'drift', 'fuzz', 'isolate', 'spikes', 'scale'], expert: ['combo1', 'combo2', 'combo3', 'spikes', 'isolate', 'hum'] };
    const key = pickN(pools[d]), sc = S[key], seg = sc.make(), nOpt = d === 'beginner' ? 3 : 4;
    const ans = sc.ans, wrong = U.shuffle(sc.wrong.map((w) => TECH[w](m))).slice(0, nOpt - 1), all = U.shuffle([ans, ...wrong]);
    const r = relPowers(seg.samples);
    return {
      id: 'dsp-' + key, mode: 'dsp', prompt: sc.prompt, clue: null, options: all.map((t, i) => ({ id: 't' + i, label: t.label, sub: t.sub })), answer: 't' + all.indexOf(ans), hint: sc.hint, explain: sc.why,
      visual: { lanes: [{ label: 'Signal', sub: seg.channel || '', data: seg.samples }].concat(seg.other ? [{ label: 'Signal 2', sub: '10× larger', data: seg.other }] : []), spec: [{ psd: r.psd, df: r.df, label: 'PSD', colorKey: 'accent' }], specHidden: false, sel: -1, apply: ans, mains: m, samples: seg.samples, other: seg.other },
    };
  }

  /* ---------------------------------------------------------------- view */
  const state = { tab: 'play', stage: 'setup', mode: 'pattern', diff: 'beginner', round: null, disposables: [], timed: false, tick: null };
  const TIME_LIMIT = 30;

  NG.views.experiments = {
    id: 'experiments', title: 'Experiments', icon: 'flask',
    render() {
      return `
      ${ui.pageHead('03 · Experiments', 'Train your <em>intuition</em>', 'Four short learning rounds built on the simulator. Answers are worked out from the actual signals — measured band power and real filter output — so every explanation can be checked.',
        '<div class="tabs" id="expTabs" role="tablist" aria-label="Experiment sections"><button class="tab" role="tab" data-tab="play" aria-selected="true">' + ui.icon('flask') + 'Play</button><button class="tab" role="tab" data-tab="progress" aria-selected="false">' + ui.icon('trophy') + 'Progress &amp; achievements</button></div>')}
      <div id="expPanels">
        <div data-panel="play"><div id="expStage"></div></div>
        <div data-panel="progress" hidden><div id="expProgress"></div></div>
      </div>`;
    },
    init(root) {
      this.root = root;
      this.tabs = ui.tabs(U.$('#expTabs', root), U.$('#expPanels', root), (id) => { state.tab = id; if (id === 'progress') this.renderProgress(); });
      this.keyHandler = (e) => this.onKey(e);
      this.renderStage();
      progress.on('change', () => { if (this.visible && state.tab === 'progress') this.renderProgress(); });
    },
    show() { this.visible = true; document.addEventListener('keydown', this.keyHandler); requestAnimationFrame(() => { this.tabs.select(state.tab); }); },
    hide() { this.visible = false; document.removeEventListener('keydown', this.keyHandler); },

    dispose() { clearInterval(state.tick); state.disposables.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); state.disposables = []; },

    /* ---------- setup screen ---------- */
    renderStage() {
      this.dispose();
      const host = U.$('#expStage', this.root);
      if (state.stage === 'setup') return this.renderSetup(host);
      if (state.stage === 'play') return this.renderQuestion(host);
      if (state.stage === 'done') return this.renderDone(host);
    },
    renderSetup(host) {
      const st = progress.get();
      host.innerHTML = `<div class="setup-grid">
        <div class="card" data-reveal><div class="card-head"><div><h2 class="card-title">Choose an experiment</h2><p class="card-sub">Each round has ${ROUND} questions.</p></div></div>
          <div class="card-body"><div class="mode-grid" id="modeGrid" role="radiogroup" aria-label="Experiment mode"></div></div></div>
        <div class="card" data-reveal><div class="card-head"><div><h2 class="card-title">Difficulty</h2><p class="card-sub" id="diffBlurb"></p></div></div>
          <div class="card-body stack"><div id="diffSeg"></div>
            <dl class="kv"><div><dt>Points per correct answer</dt><dd id="diffPts"></dd></div><div><dt>Hint cost</dt><dd id="diffHint"></dd></div><div><dt>Streak bonus</dt><dd>+2 per answer in a row (max +10)</dd></div></dl>
            ${ui.switchHtml('expTimed', 'Timed challenge', state.timed, '30 seconds per question; running out of time counts as a miss.')}
            <button class="btn btn-primary btn-lg" id="expStart" type="button">${ui.icon('play')}<span>Start round</span></button>
            <p class="hint">${ui.icon('info', 'i-sm')} Signals are simulated and each question is generated fresh. This is a learning exercise — it does not read or infer anyone’s real mental state.</p>
          </div></div></div>`;
      const mg = U.$('#modeGrid', host);
      Object.entries(MODES).forEach(([id, m]) => {
        const rec = st.byMode[id], acc = rec && rec.a ? Math.round((rec.c / rec.a) * 100) + '% accuracy · ' + rec.a + ' answered' : 'Not played yet';
        const b = U.h('button.mode-card', { type: 'button', role: 'radio', 'aria-checked': String(state.mode === id), 'data-id': id }, U.html(`<span class="mode-ic">${ui.icon(m.icon)}</span>`), U.h('b', m.name), U.h('p', m.blurb), U.h('small.mono', acc));
        b.addEventListener('click', () => { state.mode = id; U.$$('.mode-card', host).forEach((x) => x.setAttribute('aria-checked', String(x.dataset.id === id))); });
        mg.append(b);
      });
      const upd = () => { const d = DIFF[state.diff]; U.$('#diffBlurb', host).textContent = d.blurb; U.$('#diffPts', host).textContent = d.base + ' pts'; U.$('#diffHint', host).textContent = '−' + Math.round(d.base * 0.4) + ' pts'; };
      ui.segmented(U.$('#diffSeg', host), { label: 'Difficulty', value: state.diff, options: Object.entries(DIFF).map(([v, d]) => ({ value: v, label: d.name })), onChange: (v) => { state.diff = v; upd(); } });
      upd();
      U.$('#expTimed', host).addEventListener('change', (e) => { state.timed = e.target.checked; });
      U.$('#expStart', host).addEventListener('click', () => this.startRound());
      ui.reveal(host);
    },

    startRound() {
      state.round = { mode: state.mode, diff: state.diff, i: 0, correct: 0, points: 0, streak: 0, best: 0, q: null, answered: false, hint: false, t0: 0, log: [], used: new Set() };
      state.stage = 'play'; this.nextQuestion(); NG.sound.play('start');
    },
    nextQuestion() {
      const r = state.round, g = (NG.expGens && NG.expGens[r.mode]) || { pattern: genPattern, compare: genCompare, dsp: genDsp, quiz: (d) => genQuiz(d, r.used) }[r.mode];
      r.q = g(r.diff); r.answered = false; r.hint = false; r.t0 = performance.now(); r.eliminated = new Set();
      state.stage = 'play'; this.renderStage();
    },

    /* ---------- question screen ---------- */
    renderQuestion(host) {
      const r = state.round, q = r.q, m = MODES[r.mode], d = DIFF[r.diff], acc = r.i ? Math.round((r.correct / r.i) * 100) : null;
      host.innerHTML = `<div class="exp-layout">
        <section class="card exp-main" aria-labelledby="qPrompt">
          <div class="card-head"><div><h2 class="card-title">${ui.icon(m.icon)} ${m.name} <span class="badge">${d.name}</span> <span class="badge badge-sim">Simulated</span></h2>
            <p class="card-sub">Question <b>${r.i + 1}</b> of ${ROUND}</p></div><button class="btn btn-ghost btn-sm" id="qQuit" type="button">End round</button></div>
          <div class="card-body stack">
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ROUND}" aria-valuenow="${r.i}" aria-label="Round progress"><i style="width:${(r.i / ROUND) * 100}%"></i></div>
            ${q.visual ? `<div class="exp-visual"><div class="canvas-wrap exp-wave"><canvas id="qWave" role="img" aria-label="Simulated signal for this question"></canvas></div><div class="canvas-wrap exp-spec" id="qSpecWrap" ${q.visual.specHidden ? 'hidden' : ''}><canvas id="qSpec" role="img" aria-label="Frequency spectrum of the signal"></canvas></div></div>` : ''}
            <div><h3 class="q-prompt" id="qPrompt">${q.mode === 'quiz' ? U.esc(q.prompt) : q.prompt}</h3>${q.clue ? `<p class="hint q-clue">${ui.icon('bulb', 'i-sm')} ${U.esc(q.clue.replace(/^Clue: /, ''))}</p>` : ''}</div>
            <div class="options" id="qOptions" role="radiogroup" aria-labelledby="qPrompt"></div>
            <div class="feedback" id="qFeedback" aria-live="polite"></div>
            <div class="row wrap"><button class="btn btn-ghost" id="qHint" type="button">${ui.icon('bulb')}<span>Hint (−${Math.round(d.base * 0.4)} pts)</span></button><button class="btn btn-primary right" id="qNext" type="button" hidden><span>${r.i + 1 >= ROUND ? 'See results' : 'Next question'}</span>${ui.icon('chevron-right')}</button></div>
          </div></section>
        <aside class="card exp-side" aria-label="Round score"><div class="card-body stack">
          <div class="ring" id="qRing" style="--v:${acc || 0}"><div><strong>${acc === null ? '—' : acc + '%'}</strong><small>ACCURACY</small></div></div>
          <dl class="kv"><div><dt>Points</dt><dd id="qPts">${r.points}</dd></div><div><dt>Correct</dt><dd>${r.correct} / ${r.i}</dd></div><div><dt>Streak</dt><dd id="qStreak">${r.streak}${r.streak >= 3 ? ' 🔥' : ''}</dd></div><div><dt>Best streak</dt><dd>${r.best}</dd></div></dl>
          <p class="hint">Keys: <span class="kbd">A</span>–<span class="kbd">${LETTERS[q.options.length - 1]}</span> answer · <span class="kbd">H</span> hint · <span class="kbd">Enter</span> next</p></div></aside></div>`;
      const og = U.$('#qOptions', host);
      q.options.forEach((o, i) => {
        const b = U.h('button.option', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-id': o.id }, U.h('span.opt-key', LETTERS[i]), U.h('span.opt-text', U.h('b', o.label), o.sub ? U.h('small', o.sub) : null));
        b.addEventListener('click', () => this.answer(o.id)); og.append(b);
      });
      U.$('#qHint', host).addEventListener('click', () => this.useHint());
      U.$('#qNext', host).addEventListener('click', () => this.advance());
      U.$('#qQuit', host).addEventListener('click', async () => { if (await ui.modal.confirm({ title: 'End this round?', message: r.i ? `You’ve answered ${r.i} of ${ROUND}. Your answers so far are already saved to your progress.` : 'No questions have been answered yet.', confirmText: 'End round', cancelText: 'Keep playing', danger: true })) { r.i ? this.finish() : this.toSetup(); } });
      if (q.visual) this.mountVisual(host, q.visual);
      this.startTimer(host);
      const pr = U.$('#qPrompt', host); pr.setAttribute('tabindex', '-1'); pr.focus({ preventScroll: true });
    },

    mountVisual(host, v) {
      const C = () => NG.theme.c, wave = new NG.viz.Waveform(U.$('#qWave', host), { static: true }), spec = v.stft ? new NG.viz.SpectrogramView(U.$('#qSpec', host)) : new NG.viz.Spectrum(U.$('#qSpec', host));
      state.disposables.push(() => wave.destroy(), () => spec.destroy());
      this.vis = { wave, spec, v, revealed: null };
      const draw = () => {
        const c = C(), r = state.round, vv = this.vis.v, lanes = vv.lanes.map((l, i) => ({ label: l.label, sub: l.sub, data: l.data, n: l.data.length, color: [c.accent, c.violet, c.amber][i % 3] }));
        const max = Math.max(...vv.lanes.map((l) => dsp.peakToPeak(l.data) / 2)), scale = [25, 50, 100, 200, 400].find((s) => s >= max * 1.05) || 400;
        const cfg = { lanes, fs: FS, windowSec: 4, endIndex: vv.lanes[0].data.length, originIndex: 0, scale, showGrid: store.get('ui.grid'), glow: store.get('ui.glow'), lineWidth: store.get('ui.lineWidth'), watermark: 'SIMULATED', gutter: 62, static: true };
        if (vv.after && vv.lanes.length) { cfg.lanes = [lanes[0], { label: 'After', sub: 'processed', data: vv.after, n: vv.after.length, color: c.green }]; }
        wave.static = true; wave.draw(cfg);
        if (vv.stft) { spec.draw({ spec: vv.stft, signal: null, fs: FS, t0: 0, t1: vv.stftDur, fmin: 0, fmax: 60, cmap: 'viridis', dbRange: 50, watermark: 'SIMULATED' }); return; }
        spec.draw({ series: vv.spec.map((s) => ({ psd: s.psd, df: s.df, label: s.label, color: c[s.colorKey], fill: vv.spec.length === 1, width: 1.7 })), fmax: 100, scale: 'db', selected: vv.sel, markers: vv.mains && vv.lanes.length ? [{ f: vv.mains, label: vv.mains + ' Hz' }] : [] });
      };
      this.vis.draw = draw; draw();
      const off = NG.theme.on('change', draw); state.disposables.push(off);
    },

    startTimer(host) {
      clearInterval(state.tick); const r = state.round; if (!state.timed || r.answered) return; r.left = TIME_LIMIT;
      const el = U.h('span.badge.badge-bad', { id: 'qTimer', role: 'timer' }, TIME_LIMIT + ' s'); U.$('.exp-main .card-sub', host).append(' ', el);
      state.tick = setInterval(() => { if (r.answered) { clearInterval(state.tick); return; } r.left--; el.textContent = Math.max(0, r.left) + ' s'; if (r.left === 10) ui.announce('10 seconds left'); if (r.left <= 0) { clearInterval(state.tick); this.answer('__timeout__'); } }, 1000);
    },
    useHint() {
      const r = state.round, q = r.q; if (r.answered || r.hint) return;
      r.hint = true; const d = DIFF[r.diff];
      const wrong = q.options.filter((o) => o.id !== q.answer && !r.eliminated.has(o.id)), kill = pickN(wrong);
      if (kill) { r.eliminated.add(kill.id); const b = U.$(`.option[data-id="${kill.id}"]`, this.root); b.disabled = true; b.classList.add('eliminated'); }
      const spw = U.$('#qSpecWrap', this.root); if (spw && spw.hidden) { spw.hidden = false; this.vis.spec.fit(); this.vis.draw(); }
      U.$('#qFeedback', this.root).innerHTML = `<div class="callout">${ui.icon('bulb')}<div><strong>Hint:</strong> ${U.esc(q.hint)} <span class="hint">(one wrong option removed, −${Math.round(d.base * 0.4)} pts if you answer correctly)</span></div></div>`;
      U.$('#qHint', this.root).disabled = true; ui.announce('Hint shown. One wrong option was removed.');
    },

    answer(id) {
      const r = state.round, q = r.q; if (r.answered) return; r.answered = true; clearInterval(state.tick);
      const ms = performance.now() - r.t0, ok = id === q.answer, d = DIFF[r.diff];
      if (ok) { r.correct++; r.streak++; r.best = Math.max(r.best, r.streak); } else r.streak = 0;
      const bonus = ok ? Math.min(10, Math.max(0, r.streak - 1) * 2) : 0, base = ok ? Math.max(1, d.base - (r.hint ? Math.round(d.base * 0.4) : 0)) : 0, pts = base + bonus;
      r.points += pts; r.i++;
      const optText = (oid) => { const o = q.options.find((x) => x.id === oid); return o ? o.label : oid === '__timeout__' ? '(time ran out)' : oid; };
      const rec = { mode: r.mode, difficulty: r.diff, qid: q.id, prompt: q.prompt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160), selected: optText(id), answer: optText(q.answer), correct: ok, ms, points: pts, hint: r.hint };
      r.log.push(rec); progress.recordTrial(rec, r.streak);
      const root = this.root;
      U.$$('.option', root).forEach((b) => { b.disabled = true; b.setAttribute('aria-checked', String(b.dataset.id === id)); if (b.dataset.id === q.answer) b.classList.add('correct'); else if (b.dataset.id === id) b.classList.add('wrong'); });
      const fb = U.$('#qFeedback', root);
      fb.innerHTML = `<div class="result ${ok ? 'ok' : 'bad'}"><div class="result-head">${ui.icon(ok ? 'check' : 'x')}<b>${ok ? 'Correct' : 'Not quite'}</b><span class="badge ${ok ? 'badge-ok' : 'badge-bad'} right">${ok ? '+' + pts + ' pts' + (bonus ? ` (incl. +${bonus} streak)` : '') : '0 pts'}</span></div><p>${q.explain}</p></div>`;
      U.$('#qHint', root).hidden = true; const nx = U.$('#qNext', root); nx.hidden = false; nx.focus();
      this.updateSide(); this.revealVisual(q);
      ui.announce(ok ? 'Correct.' : 'Incorrect. ' + U.$('#qFeedback', root).textContent);
      NG.sound.play(ok ? 'correct' : 'wrong');
      if (ok && r.streak >= 3) ui.burstAt(U.$('.option.correct', root), { count: 18 });
    },
    updateSide() {
      const r = state.round, root = this.root, acc = Math.round((r.correct / r.i) * 100);
      const ring = U.$('#qRing', root); ring.style.setProperty('--v', acc); ring.querySelector('strong').textContent = acc + '%';
      const kv = U.$$('.exp-side .kv dd', root); kv[0].textContent = r.points; kv[1].textContent = `${r.correct} / ${r.i}`; kv[2].textContent = r.streak + (r.streak >= 3 ? ' 🔥' : ''); kv[3].textContent = r.best;
      const bar = U.$('.exp-main .bar', root); bar.setAttribute('aria-valuenow', r.i); bar.firstElementChild.style.width = (r.i / ROUND) * 100 + '%';
    },
    revealVisual(q) {
      if (!this.vis) return; const v = this.vis.v, spw = U.$('#qSpecWrap', this.root);
      if (spw && spw.hidden) { spw.hidden = false; this.vis.spec.fit(); }
      if (v.apply) { // show the genuinely processed result
        const cfg = store.defaults('studio.chain'); v.apply.cfg(cfg); const ch = dsp.makeChain(cfg, FS), after = ch.apply(v.samples, { zeroPhase: true });
        v.after = after; v.spec = [{ psd: v.spec[0].psd, df: v.spec[0].df, label: 'before', colorKey: 'accent' }, (() => { const p = dsp.welch(ch.filter(v.samples, { zeroPhase: true }), FS, 512); return { psd: p.psd, df: p.df, label: 'after', colorKey: 'green' }; })()];
        if (v.other) { v.lanes = [v.lanes[0]]; }
        v.lanes = [v.lanes[0]];
      }
      this.vis.draw();
    },
    advance() { const r = state.round; if (r.i >= ROUND) this.finish(); else this.nextQuestion(); },

    finish() {
      const r = state.round; progress.recordRound({ mode: r.mode, difficulty: r.diff, correct: r.correct, total: r.i, timed: state.timed });
      state.stage = 'done'; this.renderStage(); const acc = r.i ? r.correct / r.i : 0;
      if (acc >= 0.8) setTimeout(() => ui.burst(innerWidth / 2, innerHeight * 0.35, { count: 60 }), 250);
    },
    toSetup() { state.stage = 'setup'; this.renderStage(); },

    renderDone(host) {
      const r = state.round, acc = r.i ? Math.round((r.correct / r.i) * 100) : 0, d = DIFF[r.diff];
      const msg = acc === 100 ? 'Flawless round!' : acc >= 80 ? 'Excellent work.' : acc >= 60 ? 'Solid progress.' : acc >= 40 ? 'Getting there — review the explanations below.' : 'Tricky one. The explanations below are the best way to learn.';
      host.innerHTML = `<div class="done-grid">
        <section class="card done-card" data-reveal><div class="card-body stack center">
          <span class="eyebrow">Round complete</span><div class="ring ring-lg" style="--v:${acc}"><div><strong>${acc}%</strong><small>ACCURACY</small></div></div>
          <h2 class="done-title">${msg}</h2><p class="muted">${MODES[r.mode].name} · ${d.name}</p>
          <div class="done-stats"><div class="stat"><div class="stat-k">Points</div><div class="stat-v">${r.points}</div></div><div class="stat"><div class="stat-k">Correct</div><div class="stat-v">${r.correct}<small>/ ${r.i}</small></div></div><div class="stat"><div class="stat-k">Best streak</div><div class="stat-v">${r.best}</div></div><div class="stat"><div class="stat-k">Avg time</div><div class="stat-v">${r.log.length ? (r.log.reduce((s, x) => s + x.ms, 0) / r.log.length / 1000).toFixed(1) : '—'}<small>s</small></div></div></div>
          <div class="row wrap center"><button class="btn btn-primary" id="dAgain" type="button">${ui.icon('refresh')}<span>Play again</span></button><button class="btn" id="dChange" type="button">Change experiment</button><button class="btn btn-ghost" id="dCsv" type="button">${ui.icon('download')}<span>Export results (CSV)</span></button></div>
        </div></section>
        <section class="card" data-reveal><div class="card-head"><div><h2 class="card-title">Question review</h2><p class="card-sub">What you answered and what was right</p></div></div><div class="card-body"><ol class="review">${r.log.map((l, i) => `<li class="${l.correct ? 'ok' : 'bad'}">${ui.icon(l.correct ? 'check' : 'x')}<div><b>${i + 1}. ${U.esc(l.prompt)}</b><small>${l.correct ? 'You chose “' + U.esc(l.selected) + '”' : 'You chose “' + U.esc(l.selected) + '” · correct: “' + U.esc(l.answer) + '”'}${l.hint ? ' · hint used' : ''}</small></div><span class="mono tnum">${l.points ? '+' + l.points : '0'}</span></li>`).join('')}</ol></div></section></div>`;
      U.$('#dAgain', host).addEventListener('click', () => { state.mode = r.mode; state.diff = r.diff; this.startRound(); });
      U.$('#dChange', host).addEventListener('click', () => this.toSetup());
      U.$('#dCsv', host).addEventListener('click', () => this.exportCsv());
      ui.reveal(host);
    },

    exportCsv() {
      if (!progress.get().history.length) { ui.toast('No experiment results yet — play a round first.', { type: 'warn' }); return; }
      U.download(`neurogrid-experiment-results-${U.stamp()}.csv`, progress.trialsCsv()); ui.toast('Experiment results exported (labelled as simulated).', { type: 'success' });
    },

    /* ---------- progress tab ---------- */
    renderProgress() {
      const host = U.$('#expProgress', this.root), s = progress.get(), acc = s.answered ? Math.round((s.correct / s.answered) * 100) : null;
      const unlocked = progress.ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
      host.innerHTML = `<div class="progress-layout">
        <div class="stats-grid"><div class="stat"><div class="stat-k">Questions answered</div><div class="stat-v">${U.fmtInt(s.answered)}</div></div><div class="stat"><div class="stat-k">Accuracy</div><div class="stat-v">${acc === null ? '—' : acc + '%'}</div></div><div class="stat"><div class="stat-k">Total points</div><div class="stat-v">${U.fmtInt(s.points)}</div></div><div class="stat"><div class="stat-k">Best streak</div><div class="stat-v">${s.bestStreak}</div></div><div class="stat"><div class="stat-k">Rounds finished</div><div class="stat-v">${s.rounds}</div></div><div class="stat"><div class="stat-k">Achievements</div><div class="stat-v">${unlocked}<small>/ ${progress.ACHIEVEMENTS.length}</small></div></div></div>
        <div class="two-col">
          <section class="card"><div class="card-head"><div><h2 class="card-title">Accuracy by experiment</h2></div></div><div class="card-body stack">${Object.entries(MODES).map(([id, m]) => { const rec = s.byMode[id], a = rec && rec.a ? Math.round((rec.c / rec.a) * 100) : null; return `<div class="acc-row"><div class="row between"><span>${ui.icon(m.icon)} ${m.name}</span><span class="mono tnum">${a === null ? 'not played' : a + '% · ' + rec.a}</span></div><div class="bar"><i style="width:${a || 0}%"></i></div></div>`; }).join('')}
            <div class="row wrap"><button class="btn btn-sm" id="pCsv" type="button">${ui.icon('download')}<span>Export all results (CSV)</span></button><button class="btn btn-sm btn-danger" id="pReset" type="button">${ui.icon('trash')}<span>Reset progress</span></button></div></div></section>
          <section class="card"><div class="card-head"><div><h2 class="card-title">Round history</h2><p class="card-sub">Last 10 rounds · stored in this browser only</p></div></div><div class="card-body">${(s.roundLog || []).length ? `<table class="tbl"><thead><tr><th>When</th><th>Experiment</th><th>Level</th><th>Score</th></tr></thead><tbody>${s.roundLog.slice(-10).reverse().map((l) => `<tr><td>${U.esc(U.fmtDate(l.ts))}</td><td>${MODES[l.mode] ? MODES[l.mode].name : U.esc(l.mode)}${l.timed ? ' ⏱' : ''}</td><td>${DIFF[l.difficulty] ? DIFF[l.difficulty].name : ''}</td><td class="mono tnum">${l.correct}/${l.total}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><strong>No rounds yet</strong><span>Finish a round to start a history.</span></div>'}</div></section>
          <section class="card"><div class="card-head"><div><h2 class="card-title">Recent answers</h2><p class="card-sub">Last 8 questions</p></div></div><div class="card-body">${s.history.length ? `<ol class="review compact">${s.history.slice(-8).reverse().map((l) => `<li class="${l.correct ? 'ok' : 'bad'}">${ui.icon(l.correct ? 'check' : 'x')}<div><b>${U.esc(l.prompt.slice(0, 90))}${l.prompt.length > 90 ? '…' : ''}</b><small>${MODES[l.mode] ? MODES[l.mode].name : l.mode} · ${DIFF[l.difficulty] ? DIFF[l.difficulty].name : l.difficulty}</small></div></li>`).join('')}</ol>` : '<div class="empty"><strong>Nothing recorded yet</strong><span>Answer a question and it will show up here.</span></div>'}</div></section>
        </div>
        <section class="card"><div class="card-head"><div><h2 class="card-title">Achievements</h2><p class="card-sub">Earned by what you actually do in NeuroGrid</p></div></div><div class="card-body"><div class="ach-grid">${progress.ACHIEVEMENTS.map((a) => { const on = s.ach[a.id]; return `<div class="ach ${on ? 'on' : ''}"><span class="ach-ic">${ui.icon(on ? a.icon : 'lock')}</span><div><b>${a.title}</b><small>${a.desc}</small>${on ? `<small class="mono">${U.fmtDate(on)}</small>` : ''}</div></div>`; }).join('')}</div></div></section></div>`;
      U.$('#pCsv', host).addEventListener('click', () => this.exportCsv());
      U.$('#pReset', host).addEventListener('click', async () => { if (await ui.modal.confirm({ title: 'Reset all progress?', message: 'This permanently deletes your answers, scores and achievements on this device.', confirmText: 'Reset progress', danger: true })) { progress.reset(); ui.toast('Progress reset.'); this.renderProgress(); } });
    },

    onKey(e) {
      if (state.tab !== 'play' || state.stage !== 'play' || e.ctrlKey || e.metaKey || e.altKey || ui.modal.count) return;
      const t = e.target; if (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;
      const r = state.round; if (!r) return;
      const k = e.key.toLowerCase();
      if (!r.answered) {
        const i = LETTERS.toLowerCase().indexOf(k);
        if (i >= 0 && i < r.q.options.length) { const o = r.q.options[i]; if (!r.eliminated.has(o.id)) { e.preventDefault(); this.answer(o.id); } }
        else if (k === 'h') { e.preventDefault(); this.useHint(); }
      } else if (e.key === 'Enter' && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); this.advance(); }
    },
  };
})();
