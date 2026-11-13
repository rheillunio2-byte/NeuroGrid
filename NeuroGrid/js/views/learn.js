/* NeuroGrid — Learning Center: expandable topics with small interactive demonstrations. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, dsp = NG.dsp, progress = NG.progress;
  const BANDS = dsp.BANDS;
  NG.views = NG.views || {};

  /* ---------- electrode map data (10–20 system, top view) ---------- */
  const ELEC = { Fp1: [40, 14], Fp2: [60, 14], F7: [21, 28], F3: [37, 30], Fz: [50, 31], F4: [63, 30], F8: [79, 28], T3: [13, 50], C3: [32, 50], Cz: [50, 50], C4: [68, 50], T4: [87, 50], T5: [21, 72], P3: [37, 70], Pz: [50, 69], P4: [63, 70], T6: [79, 72], O1: [40, 87], O2: [60, 87] };
  const REGION = { Fp: ['Frontal pole', 'Sits right above the eyes, so it records the largest eye-blink artefacts. Also used to look at frontal activity.'], F: ['Frontal', 'Planning, attention and decision-making areas. Frontal theta and beta are studied in mental-effort tasks.'], C: ['Central (sensorimotor)', 'Above the motor and sensory strips. The key location for motor-imagery BCIs: imagined hand movement changes mu/beta power here.'], T: ['Temporal', 'Near the ears. Linked with hearing, language and memory; also picks up jaw-muscle artefacts.'], P: ['Parietal', 'Integrates sensation and spatial information. Often used for the P300 response.'], O: ['Occipital (visual)', 'Over visual cortex. Alpha is strongest here with eyes closed; SSVEP BCIs listen here.'] };

  const TOPICS = [
    { id: 'bci', title: 'What is a Brain-Computer Interface?', sum: 'Turning brain activity into commands — and what that really means.',
      html: () => `<p>A <b>brain-computer interface (BCI)</b> is a system that measures activity from the nervous system, interprets it, and turns it into an output for a computer or device. A BCI does not “read minds”: it detects <i>patterns</i> that a person can learn to produce on purpose, such as imagining a hand movement, or that occur automatically, such as the response to a flashing light.</p>
        <div class="pipe" id="pipe" role="group" aria-label="BCI pipeline stages"></div><div class="pipe-info" id="pipeInfo" aria-live="polite"></div>
        <p class="hint">Non-invasive BCIs use sensors outside the head (like EEG). Invasive BCIs use implanted electrodes and are used in clinical research. NeuroGrid is a non-invasive-style <b>simulation</b> only.</p>`,
      init(b) {
        const S = [['Acquire', 'Sensors pick up tiny voltages and an amplifier digitises them into samples.'], ['Process', 'Filters remove drift, mains hum and noise so the brain-related part stands out.'], ['Extract features', 'The cleaned signal is summarised as numbers, such as power in each frequency band.'], ['Classify', 'A model maps those numbers to an intention, e.g. “left hand” or “right hand”.'], ['Act', 'The result drives something: a cursor, a speller, a wheelchair, a game. Feedback closes the loop.']];
        const pipe = U.$('#pipe', b), info = U.$('#pipeInfo', b);
        S.forEach(([t, d], i) => { const btn = U.h('button.pipe-node', { type: 'button', 'aria-pressed': 'false' }, U.h('span.pipe-i', i + 1), t); btn.addEventListener('click', () => { U.$$('.pipe-node', pipe).forEach((x) => x.setAttribute('aria-pressed', x === btn)); info.innerHTML = `<b>${t}.</b> ${d}`; }); pipe.append(btn); if (i < S.length - 1) pipe.append(U.h('i.pipe-arrow', '→')); });
        U.$('.pipe-node', pipe).click();
      } },
    { id: 'eeg', title: 'How EEG works', sum: 'Why a sensor on the scalp can see brain activity — and why it is so small.',
      html: () => `<p>Neurons communicate with tiny electrical currents. When thousands of neighbouring neurons in the cortex fire in a coordinated way, their combined voltage is just large enough to leak through the skull and scalp as a signal of a few to tens of <b>microvolts</b> (µV) — about a million times weaker than a AA battery.</p>
        <p>EEG has excellent <b>timing</b> (milliseconds) but poor <b>spatial</b> detail, because the skull smears the signal. What you see on one electrode is a blend of many sources, which is why EEG looks like a messy sum of rhythms. Try it:</p>
        <div class="demo"><canvas id="eegCv" class="demo-cv" role="img" aria-label="Sum of oscillations of different frequencies"></canvas><div class="demo-ctl" id="eegCtl"></div></div>
        <p class="hint">Thin lines are individual rhythms; the bright line is their sum — essentially how NeuroGrid builds its simulated EEG (plus noise).</p>`,
      init(b) {
        const cv = U.$('#eegCv', b), ctl = U.$('#eegCtl', b), amps = [0.5, 0.7, 1, 0.5, 0.2], freqs = [2, 6, 10, 20, 40]; let t = 0;
        BANDS.forEach((bd, i) => { const id = 'eg' + i, inp = U.h('input.range', { type: 'range', id, min: 0, max: 1, step: 0.05, value: amps[i], 'aria-label': bd.name + ' amount' }); inp.addEventListener('input', () => { amps[i] = +inp.value; }); ui.range(inp); ctl.append(U.h('div.field', U.h('div.field-top', U.h('label.label', { for: id }, `${bd.sym} ${bd.name}`), U.h('span.hint', `${freqs[i]} Hz`)), inp)); });
        const wv = new (class { constructor() { this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(cv); this.fit(); } fit() { const f = U.fitCanvas(cv); this.w = f.w; this.h = f.h; this.d = f.dpr; } })();
        const draw = (dt) => { const ctx = cv.getContext('2d'), C = NG.theme.c, w = wv.w, h = wv.h; t += dt * (NG.motion.level ? 1 : 0); ctx.setTransform(wv.d, 0, 0, wv.d, 0, 0); ctx.clearRect(0, 0, w, h);
          const n = 240, span = 1.2, rows = h * 0.5, mid = h * 0.28;
          ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(0, h * 0.74); ctx.lineTo(w, h * 0.74); ctx.stroke();
          const comp = (i, x) => amps[i] * Math.sin(2 * Math.PI * freqs[i] * (x * span + t * 0.3) / 1) * (i > 2 ? 0.5 : 1);
          BANDS.forEach((bd, i) => { ctx.beginPath(); for (let k = 0; k <= n; k++) { const x = k / n, y = 12 + i * (rows / 5) + comp(i, x) * 6 * (i > 2 ? 0.9 : 0.6) + 6; if (k) ctx.lineTo(x * w, y); else ctx.moveTo(0, y); } ctx.strokeStyle = NG.theme.alpha(NG.viz.toHex(C.bands[i]), 0.85); ctx.lineWidth = 1.2; ctx.stroke(); });
          ctx.beginPath(); for (let k = 0; k <= n; k++) { const x = k / n; let s = 0; for (let i = 0; i < 5; i++) s += comp(i, x); const y = h * 0.74 - s * 7; if (k) ctx.lineTo(x * w, y); else ctx.moveTo(0, y); } ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); };
        NG.loop.add('learn-eeg', draw); return () => { NG.loop.remove('learn-eeg'); wv.ro.disconnect(); };
      } },
    { id: 'electrodes', title: 'Understanding EEG electrodes', sum: 'The 10–20 map: where sensors go, and what each region tells you.',
      html: () => `<p>Electrodes are placed using the international <b>10–20 system</b>, so recordings from different labs are comparable. Letters name the region (<b>Fp</b> frontal pole, <b>F</b> frontal, <b>C</b> central, <b>T</b> temporal, <b>P</b> parietal, <b>O</b> occipital); odd numbers are on the left, even on the right, and <b>z</b> is the midline.</p>
        <div class="demo electrode-demo"><svg class="head" viewBox="0 0 100 100" id="headSvg" role="group" aria-label="Electrode map, top view of the head"></svg><div class="elec-info" id="elecInfo" aria-live="polite"></div></div>
        <p class="hint">Filled circles are the six channels simulated in NeuroGrid. Click or focus an electrode. The signal at each electrode is the <i>difference</i> from a reference, amplified and digitised.</p>`,
      init(b) {
        const svg = U.$('#headSvg', b), info = U.$('#elecInfo', b), used = store.CHANNEL_NAMES;
        svg.innerHTML = `<circle cx="50" cy="52" r="42" class="head-o"/><path d="M44 10 L50 2 L56 10" class="head-o" fill="none"/><path d="M8 44 q-5 8 0 16 M92 44 q5 8 0 16" class="head-o" fill="none"/>`;
        Object.entries(ELEC).forEach(([n, [x, y]]) => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'elec' + (used.includes(n) ? ' used' : '')); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', n + (used.includes(n) ? ' (simulated in NeuroGrid)' : '')); g.innerHTML = `<circle cx="${x}" cy="${y + 2}" r="4.6"/><text x="${x}" y="${y + 3.2}" text-anchor="middle">${n}</text>`; const pick = () => { U.$$('.elec', svg).forEach((e) => e.classList.toggle('sel', e === g)); const pre = n.startsWith('Fp') ? 'Fp' : n[0], r = REGION[pre]; info.innerHTML = `<h4>${n} <span class="muted">· ${r[0]}</span></h4><p>${r[1]}</p>${used.includes(n) ? '<span class="badge badge-live">Simulated in the Signal Lab</span>' : '<span class="badge">Not simulated here</span>'}`; }; g.addEventListener('click', pick); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }); svg.append(g); });
        U.$('.elec.used', svg).dispatchEvent(new Event('click'));
      } },
    { id: 'bands', title: 'EEG frequency bands', sum: 'Delta to gamma: what each rhythm looks like and is usually linked with.',
      html: () => `<p>EEG is usually described in five bands. They are <b>research conventions</b>, not sharp boundaries, and not direct readouts of thoughts. Select a band to see its rhythm.</p><div class="demo"><div id="bandPick" class="seg band-seg"></div><canvas id="bandCv" class="demo-cv short" role="img" aria-label="Animated wave at the selected band frequency"></canvas></div><div class="band-note" id="bandNote" aria-live="polite"></div>`,
      init(b) {
        const info = [['0.5–4 Hz', 'Deep sleep. In waking EEG, large slow waves are often artefacts (blinks, drift).', 2], ['4–8 Hz', 'Drowsiness and light sleep; frontal theta appears with sustained mental effort and memory tasks.', 6], ['8–13 Hz', 'Relaxed wakefulness; strongest over the back of the head with eyes closed. Drops when you open your eyes.', 10], ['13–30 Hz', 'Alert, active processing. Beta/mu changes over motor cortex drive many BCIs.', 20], ['30–100 Hz', 'Fast and weak at the scalp; easily swamped by muscle activity. Interpret with care.', 40]];
        let sel = 2, t = 0; const pick = U.$('#bandPick', b), note = U.$('#bandNote', b), cv = U.$('#bandCv', b);
        const seg = ui.segmented(pick, { label: 'EEG band', value: sel, options: BANDS.map((bd, i) => ({ value: i, label: `${bd.sym} ${bd.name}` })), onChange: (v) => { sel = +v; upd(); } });
        const upd = () => { note.innerHTML = `<b>${BANDS[sel].name} · ${info[sel][0]}</b><p>${info[sel][1]}</p>`; }; upd(); void seg;
        const ro = new ResizeObserver(() => {}); ro.observe(cv);
        const draw = (dt) => { const f = U.fitCanvas(cv), ctx = cv.getContext('2d'), C = NG.theme.c, w = f.w, h = f.h; t += dt * (NG.motion.level ? 1 : 0); ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, w, h); const hz = info[sel][2], secs = 2; ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.beginPath(); for (let x = 0; x <= w; x += 2) { const tt = (x / w) * secs + t * 0.5, y = h / 2 - Math.sin(2 * Math.PI * hz * tt) * h * 0.36; if (x) ctx.lineTo(x, y); else ctx.moveTo(0, y); } ctx.strokeStyle = NG.viz.toHex(C.bands[sel]); ctx.lineWidth = 2.2; ctx.stroke(); ctx.fillStyle = C.text3; ctx.font = '500 11px "DM Mono", monospace'; ctx.fillText(`${hz} Hz shown · ${hz * secs} cycles in ${secs} s`, 8, 16); };
        NG.loop.add('learn-bands', draw); return () => { NG.loop.remove('learn-bands'); ro.disconnect(); };
      } },
    { id: 'acquisition', title: 'Signal acquisition', sum: 'From scalp voltage to numbers — sampling, Nyquist and aliasing.',
      html: () => `<p>An electrode touches the skin (often with conductive gel or saline). A <b>differential amplifier</b> measures the tiny voltage difference between an active electrode and a reference, rejecting interference common to both. An <b>analog-to-digital converter</b> then measures it many times per second — the <b>sampling rate</b>.</p>
        <p>To capture a rhythm you must sample at <b>more than twice</b> its frequency (the <i>Nyquist</i> rule). Sample too slowly and fast waves masquerade as slower ones — <b>aliasing</b>. Drag the sliders:</p>
        <div class="demo"><canvas id="alCv" class="demo-cv" role="img" aria-label="Sampling demonstration showing a sine wave, its samples and the reconstruction"></canvas><div class="demo-ctl"><div class="field"><div class="field-top"><label class="label" for="alF">Signal frequency</label><output class="value-out" id="alFo">10 Hz</output></div><input class="range" type="range" id="alF" min="1" max="60" step="1" value="10"></div><div class="field"><div class="field-top"><label class="label" for="alS">Sampling rate</label><output class="value-out" id="alSo">64 Hz</output></div><input class="range" type="range" id="alS" min="8" max="128" step="4" value="64"></div></div></div><div class="callout" id="alMsg" aria-live="polite"></div>`,
      init(b) {
        const cv = U.$('#alCv', b), F = U.$('#alF', b), S = U.$('#alS', b); ui.range(F); ui.range(S);
        const draw = () => { const f0 = +F.value, fs = +S.value, f = U.fitCanvas(cv), ctx = cv.getContext('2d'), C = NG.theme.c, w = f.w, h = f.h; ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, w, h); const T = 0.5, y = (t) => h / 2 - Math.sin(2 * Math.PI * f0 * t) * h * 0.36;
          ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
          ctx.beginPath(); for (let x = 0; x <= w; x++) { const t = (x / w) * T; if (x) ctx.lineTo(x, y(t)); else ctx.moveTo(0, y(t)); } ctx.strokeStyle = NG.theme.alpha(NG.viz.toHex(C.text3), 0.7); ctx.lineWidth = 1.2; ctx.stroke();
          const pts = []; for (let k = 0; k * (1 / fs) <= T + 1e-9; k++) pts.push([(k / fs / T) * w, y(k / fs)]);
          ctx.beginPath(); pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.strokeStyle = f0 > fs / 2 ? C.amber : C.accent; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = C.text; pts.forEach(([x, yy]) => { ctx.beginPath(); ctx.arc(x, yy, 3, 0, 6.283); ctx.fill(); });
          ctx.fillStyle = C.text3; ctx.font = '500 10.5px "DM Mono", monospace'; ctx.fillText('grey = true wave · dots = samples · coloured = what the computer sees', 8, 14);
          const ny = fs / 2, alias = Math.abs(f0 - fs * Math.round(f0 / fs)), msg = U.$('#alMsg', b);
          U.$('#alFo', b).textContent = f0 + ' Hz'; U.$('#alSo', b).textContent = fs + ' Hz';
          if (f0 > ny) { msg.className = 'callout callout-warn'; msg.innerHTML = `${ui.icon('alert')}<div><strong>Aliasing!</strong> ${f0} Hz is above the Nyquist limit (${ny} Hz), so it appears as a false <b>${alias.toFixed(0)} Hz</b> wave.</div>`; } else { msg.className = 'callout'; msg.innerHTML = `${ui.icon('check')}<div><strong>Captured correctly.</strong> The Nyquist limit is ${ny} Hz and the signal is at ${f0} Hz. NeuroGrid samples at 256 Hz, so it can represent frequencies up to 128 Hz.</div>`; } };
        F.addEventListener('input', draw); S.addEventListener('input', draw); const ro = new ResizeObserver(draw); ro.observe(cv); const off = NG.theme.on('change', draw); draw(); return () => { ro.disconnect(); off(); };
      } },
    { id: 'dsp', title: 'Digital signal processing', sum: 'Cleaning the signal so the brain-related part can be seen.',
      html: () => `<p>Raw EEG is dominated by things you do not want: slow drift, mains hum, muscle noise and blinks. <b>Digital signal processing</b> applies mathematical operations to the samples to suppress them.</p>
        <div class="tool-grid"><div><b>High-pass</b><p>Removes slow drift (below ~0.5–1 Hz).</p></div><div><b>Low-pass</b><p>Removes fast fuzz (above ~40 Hz).</p></div><div><b>Band-pass</b><p>Keeps one band, e.g. alpha 8–13 Hz.</p></div><div><b>Notch</b><p>Cuts 50/60 Hz mains hum precisely.</p></div><div><b>Median / average</b><p>Smooths jitter; the median also ignores spikes.</p></div><div><b>Normalisation</b><p>Puts signals on a comparable scale.</p></div></div>
        <p>There is a trade-off: every filter changes the signal. Filter too hard and you delete real activity; filter too little and noise hides it. <b>Causal</b> filters work in real time but delay the signal; <b>zero-phase</b> filters avoid delay but need the whole recording.</p>
        <a class="btn btn-primary" href="#/studio">${ui.icon('sliders')}<span>Try it in the Processing Studio</span></a>` },
    { id: 'features', title: 'Feature extraction', sum: 'Summarising a signal as a few informative numbers — computed live below.',
      html: () => `<p>Classifiers rarely look at raw samples. They look at <b>features</b>: compact numbers that capture what matters, such as how much power sits in each band. Below, the features of the live simulated signal are computed from the last two seconds (they update while this panel is open).</p><div class="feat-table" id="featTable" aria-live="off"></div><p class="hint">Change the profile in the Signal Lab and come back: the numbers follow the signal.</p>`,
      init(b) {
        const box = U.$('#featTable', b), buf = new Float32Array(512); let acc = 0;
        const row = (k, v, h) => `<div class="feat-row"><span>${k}<small>${h}</small></span><b class="mono tnum">${v}</b></div>`;
        const upd = () => { const ci = engine.idxOf(store.get('lab.channel')), n = engine.copyLast('total', ci, 512, buf), x = buf.subarray(0, n); if (n < 128) return; const { psd, df } = dsp.welch(x, engine.FS, 256), bp = dsp.bandPowers(psd, df);
          box.innerHTML = BANDS.map((bd, i) => row(`${bd.sym} ${bd.name} relative power`, (bp.rel[i] * 100).toFixed(1) + ' %', `${bd.lo}–${bd.hi} Hz`)).join('') + row('Spectral centroid', dsp.spectralCentroid(psd, df, 1, 40).toFixed(1) + ' Hz', 'power-weighted mean frequency') + row('Peak frequency', dsp.peakFrequency(psd, df, 1, 45).toFixed(1) + ' Hz', 'strongest bin, 1–45 Hz') + row('RMS amplitude', dsp.rms(x).toFixed(1) + ' µV', 'overall signal size') + row('Line length', dsp.lineLength(x).toFixed(0) + ' µV', 'sum of sample-to-sample changes') + row('Zero crossings', String(dsp.zeroCrossings(x)), 'rough measure of dominant frequency'); };
        upd(); NG.loop.add('learn-feat', (dt) => { acc += dt; if (acc > 0.35) { acc = 0; upd(); } }); return () => NG.loop.remove('learn-feat');
      } },
    { id: 'ml', title: 'Machine learning in BCI', sum: 'How a model learns the link between features and intentions.',
      html: () => `<p>A classifier is shown many <b>labelled examples</b> — features plus the intention that produced them — and adjusts its internal numbers (weights) to make fewer mistakes. This is <b>supervised learning</b>. Typical BCI models include linear discriminant analysis, support vector machines and small neural networks.</p>
        <div class="tool-grid"><div><b>Train / test split</b><p>Keep some data hidden during training. Accuracy on it shows how the model handles <i>new</i> data.</p></div><div><b>Overfitting</b><p>A model that memorises training examples looks great in training and fails on new data.</p></div><div><b>Calibration</b><p>Real BCIs usually need a short calibration session per user and per day, because brain signals vary.</p></div><div><b>Uncertainty</b><p>Outputs are probabilities with errors — never perfect interpretations.</p></div></div>
        <p>NeuroGrid includes a real tiny neural network that you can train on simulated data and inspect.</p><a class="btn btn-primary" href="#/network">${ui.icon('network')}<span>Open the Neural Network view</span></a>` },
    { id: 'communication', title: 'Brain-to-computer communication', sum: 'The main “paradigms” BCIs use to turn brain signals into choices.',
      html: () => `<p>Because EEG is noisy, BCIs rely on a few well-understood signal patterns, each called a <b>paradigm</b>. Pick one:</p><div id="parSeg"></div><div class="band-note" id="parNote" aria-live="polite"></div>`,
      init(b) {
        const P = { mi: ['Motor imagery', 'Imagining a movement (say, squeezing the left hand) reduces mu/beta power over the opposite motor cortex — an effect called <b>event-related desynchronisation</b>. The BCI detects which side dropped and maps it to a command like “left” or “right”. Needs practice and calibration.'], p300: ['P300 speller', 'A grid of letters flashes in random order. When the letter you are attending to flashes, the brain produces a small positive deflection about 300 ms later — the <b>P300</b>. By averaging several flashes the system identifies your letter. Slow but reliable.'], ssvep: ['SSVEP', 'Each option flickers at a different fixed frequency. Looking at one raises EEG power at <b>that frequency</b> over visual cortex. Detecting which frequency is strongest reveals the choice. Fast, but it requires staring at flickering lights.'], nf: ['Neurofeedback', 'The system measures a band such as alpha or beta and shows it back to the user (a bar, a sound, a game). People can learn to modulate it. Research results are mixed, so claims should be treated cautiously.'] };
        const note = U.$('#parNote', b); const show = (v) => { note.innerHTML = `<b>${P[v][0]}</b><p>${P[v][1]}</p>`; };
        ui.segmented(U.$('#parSeg', b), { label: 'BCI paradigm', value: 'mi', options: Object.entries(P).map(([v, p]) => ({ value: v, label: p[0] })), onChange: show }); show('mi');
      } },
    { id: 'applications', title: 'Real-world BCI applications', sum: 'Where BCIs are used or researched — and honest limits.',
      html: () => `<div class="app-grid"><div class="app"><b>Assistive communication</b><p>Speller and selection interfaces for people who cannot speak or move; mainly clinical research and specialist systems.</p></div><div class="app"><b>Neurorehabilitation</b><p>Motor-imagery BCIs paired with feedback or stimulation are studied to support recovery after stroke.</p></div><div class="app"><b>Prosthetics &amp; cursor control</b><p>Implanted BCIs in research trials have enabled people with paralysis to move cursors and robotic arms. Scalp EEG offers coarser control.</p></div><div class="app"><b>Sleep &amp; attention monitoring</b><p>EEG is used in sleep studies and in research on alertness and workload, usually with many more channels than consumer devices.</p></div><div class="app"><b>Games &amp; creativity</b><p>Consumer headsets and art projects use simple band-power features as an extra input.</p></div><div class="app"><b>Neuroscience research</b><p>EEG helps study perception, attention and cognition with millisecond timing.</p></div></div>
        <div class="callout callout-warn">${ui.icon('alert')}<div><strong>Limits to remember.</strong> Scalp EEG is noisy and varies between people and days. BCIs are slow compared with a keyboard, need calibration, and cannot read private thoughts. Consumer devices are not medical devices and should not guide health decisions. Always consult primary sources for clinical claims.</div></div>` },
    { id: 'spectrogram', title: 'Spectrograms and the STFT', sum: 'Frequency content over time, and the trade-off that limits it.',
      html: () => `<p>A single power spectrum averages a whole recording. A <b>spectrogram</b> cuts the signal into short, overlapping windows, applies a taper (Hann, Hamming, Blackman or none) and computes the FFT of each: the <b>short-time Fourier transform (STFT)</b>. Colour shows power at each frequency and moment.</p>
        <ul><li><b>Window length</b> sets frequency resolution: resolution ≈ sampling rate ÷ window samples. A 256-sample window at 256 Hz resolves about 1 Hz but smears events over about 1 s.</li><li><b>Overlap</b> only makes the picture smoother in time; it does not add true time resolution.</li><li><b>Window shape</b> trades main-lobe width against spectral leakage.</li><li>A <b>log frequency axis</b> gives more room to slow rhythms, where EEG bands are narrow.</li></ul>
        <div class="callout">${ui.icon('info')}<div>Open the <a href="#/spectrogram">Spectrogram</a> section and change the window size while watching an alpha burst: longer windows sharpen the frequency line but blur the start and end of the burst.</div></div>` },
    { id: 'topography', title: 'Scalp maps and their limits', sum: 'What a band-power map shows — and why interpolation is only an estimate.',
      html: () => `<p>A scalp map draws each electrode at its 10–20 position and colours it by a measure such as relative alpha power. NeuroGrid draws only the electrodes that the data actually contains; empty positions stay hollow.</p>
        <p>The optional interpolated overlay uses inverse-distance weighting between the measured sites. It is an <b>estimate</b>, not a measurement: with only a handful of electrodes it cannot localise sources, and scalp EEG is blurred by the skull (volume conduction). Treat any region far from a real electrode as unknown.</p>
        <div class="callout callout-warn">${ui.icon('alert')}<div>The positions in NeuroGrid are a schematic 2-D layout, not measured head geometry.</div></div>` },
    { id: 'artifacts', title: 'Artefacts and how they distort', sum: 'Blinks, muscle, hum, drift and electrode pops — and what each fix costs.',
      html: () => `<p>Anything in the recording that is not brain activity is an <b>artefact</b>. The Processing Studio can add simulated artefacts to a clean signal so you know exactly what was injected, then try a fix and measure what remains.</p>
        <ul><li><b>Eye blink</b> — slow, large, frontal. A high-pass removes drift but not blinks; a low-pass reduces but distorts them. Regression or ICA are the usual tools in research.</li><li><b>Muscle (EMG)</b> — broadband fast fuzz that overlaps beta and gamma; low-pass filtering also removes real fast activity.</li><li><b>Mains hum</b> — a narrow peak at 50/60 Hz; a notch fixes it with little collateral damage.</li><li><b>Drift</b> — below about 1 Hz; a gentle high-pass fixes it.</li><li><b>Electrode pop</b> — an abrupt step that decays; any filter rings around it, so the segment is usually rejected.</li></ul>
        <p class="hint">Every fix changes the signal. Compare before and after instead of trusting that “cleaner looking” means “more correct”.</p>` },
    { id: 'evaluation', title: 'Evaluating a classifier honestly', sum: 'Splits, leakage, confusion matrices, precision, recall and F1.',
      html: () => `<p>A model must be judged on data it never saw. NeuroGrid splits simulated windows into <b>train / validation / test</b>; the scaler is fitted on the training set only, and a <b>grouped split</b> keeps all windows from one recording in the same subset so that near-duplicates cannot leak.</p>
        <ul><li><b>Confusion matrix</b>: rows are true classes, columns are predictions.</li><li><b>Precision</b> = TP ÷ (TP + FP); <b>recall</b> = TP ÷ (TP + FN); <b>F1</b> is their harmonic mean.</li><li><b>Macro</b> averages classes equally; <b>weighted</b> averages by class size. They diverge when classes are imbalanced.</li><li><b>Overfitting</b>: training accuracy far above validation accuracy. <b>Underfitting</b>: both low.</li></ul>
        <div class="callout callout-warn">${ui.icon('alert')}<div>High accuracy on simulated data says nothing about real EEG. The simulator’s class difference is built in by its author, and small test sets give wide confidence intervals.</div></div>` },
    { id: 'import', title: 'Bringing your own data', sum: 'CSV columns, sampling rate, units and time regularity.',
      html: () => `<p>The <a href="#/data">Data Import</a> section reads a CSV file locally in your browser. You choose the time column (or give a sampling rate), map channels and state the units. NeuroGrid checks that timestamps are increasing and regular, counts missing or invalid values and tells you what it did about them.</p>
        <ul><li>The sampling rate is never silently changed or resampled.</li><li>Units are never silently converted; conversion to µV is an explicit option recorded with the dataset.</li><li>Imported data is always labelled <b>IMPORTED</b>, separately from simulated data.</li><li>Nothing is uploaded; the file stays in your browser.</li></ul>` },
  ];

  NG.views.learn = {
    id: 'learn', title: 'Learning Center', icon: 'book',
    render() {
      return `${ui.pageHead('05 · Learning Center', 'Understand the <em>signal</em>', 'Ten short lessons on how non-invasive brain-computer interfaces work, from electrodes to machine learning. Open a card — many contain a live demonstration.',
        `<div class="searchbox">${ui.icon('search')}<input type="search" id="lnSearch" placeholder="Search topics…" aria-label="Search topics"></div><button class="btn btn-sm" id="lnExpand" type="button">Expand all</button>`)}
        <div class="learn-meta"><div class="bar" aria-hidden="true"><i id="lnBar"></i></div><span class="mono muted tnum" id="lnCount"></span></div>
        <div class="topics" id="lnTopics"></div><div class="empty" id="lnEmpty" hidden><strong>No topics match</strong><span>Try a different word, like “filter” or “alpha”.</span></div>
        <div class="callout" data-reveal>${ui.icon('info')}<div><strong>Use signals responsibly.</strong> NeuroGrid is an educational simulation — not a medical device, a diagnostic tool or a mind-reading system. Never use simulated output to make health or safety decisions.</div></div>`;
    },
    init(root) {
      this.root = root; this.disp = {}; const host = U.$('#lnTopics', root);
      TOPICS.forEach((tp, i) => {
        const id = 'tp-' + tp.id, el = U.h('article.topic.card', { 'data-id': tp.id, 'data-reveal': '' });
        el.innerHTML = `<h3 class="topic-h"><button class="topic-head" type="button" aria-expanded="false" aria-controls="${id}"><span class="topic-n">${U.pad2(i + 1)}</span><span class="topic-t"><b>${tp.title}</b><small>${tp.sum}</small></span><span class="topic-done" aria-hidden="true">${ui.icon('check')}</span>${ui.icon('chevron-down', 'topic-chev')}</button></h3><div class="topic-body" id="${id}" role="region" aria-label="${tp.title}" inert><div class="topic-inner"><div class="topic-content"></div></div></div>`;
        el.querySelector('.topic-head').addEventListener('click', () => this.toggle(tp.id));
        host.append(el);
      });
      U.$('#lnSearch', root).addEventListener('input', U.debounce(() => this.filter(), 120));
      U.$('#lnExpand', root).addEventListener('click', () => { const all = U.$$('.topic.open', root).length === TOPICS.length; TOPICS.forEach((t) => this.toggle(t.id, !all)); U.$('#lnExpand', root).textContent = all ? 'Expand all' : 'Collapse all'; });
      this.progressUi(); this.unsub = progress.on('change', () => this.progressUi());
    },
    toggle(id, force) {
      const el = U.$(`.topic[data-id="${id}"]`, this.root), tp = TOPICS.find((t) => t.id === id), open = force === undefined ? !el.classList.contains('open') : force;
      if (open === el.classList.contains('open')) return;
      el.classList.toggle('open', open); U.$('.topic-head', el).setAttribute('aria-expanded', open); const body = U.$('.topic-body', el); open ? body.removeAttribute('inert') : body.setAttribute('inert', '');
      if (open) {
        const c = U.$('.topic-content', el); if (!c.dataset.ready) { c.innerHTML = tp.html(); c.dataset.ready = '1'; }
        if (tp.init) { if (this.disp[id]) this.disp[id](); this.disp[id] = tp.init(c) || null; }
        progress.markTopic(id, TOPICS.length);
      } else if (this.disp[id]) { this.disp[id](); this.disp[id] = null; }
    },
    filter() {
      const q = U.$('#lnSearch', this.root).value.trim().toLowerCase(); let n = 0;
      TOPICS.forEach((tp) => { const el = U.$(`.topic[data-id="${tp.id}"]`, this.root), text = (tp.title + ' ' + tp.sum + ' ' + tp.html().replace(/<[^>]+>/g, ' ')).toLowerCase(), hit = !q || text.includes(q); el.hidden = !hit; if (hit) n++; });
      U.$('#lnEmpty', this.root).hidden = n > 0;
    },
    progressUi() { const n = Object.keys(progress.get().topics).length; U.$('#lnBar', this.root).style.width = (n / TOPICS.length) * 100 + '%'; U.$('#lnCount', this.root).textContent = `${n} / ${TOPICS.length} topics opened`; U.$$('.topic', this.root).forEach((el) => el.classList.toggle('seen', !!progress.get().topics[el.dataset.id])); },
    show() { /* demos start when a topic is opened */ },
    hide() { Object.keys(this.disp).forEach((id) => { if (this.disp[id]) { this.disp[id](); this.disp[id] = null; } const el = U.$(`.topic[data-id="${id}"]`, this.root); if (el && el.classList.contains('open')) { el.classList.remove('open'); U.$('.topic-head', el).setAttribute('aria-expanded', 'false'); U.$('.topic-body', el).setAttribute('inert', ''); } }); U.$('#lnExpand', this.root).textContent = 'Expand all'; },
  };
})();
