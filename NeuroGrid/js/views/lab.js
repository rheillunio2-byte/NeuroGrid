/* NeuroGrid — Signal Lab view: live multichannel monitor, statistics, generator controls, spectrum. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, dsp = NG.dsp;
  const { PROFILES, PROFILE_ORDER, CHANNELS } = NG.sim;
  const BANDS = dsp.BANDS;
  NG.views = NG.views || {};

  const BAND_INFO = [
    { feel: 'Deep sleep, very slow activity', note: 'Dominant in deep, dreamless sleep. In awake adults, large delta can also come from eye movements and slow drift — one reason raw EEG needs careful cleaning.' },
    { feel: 'Drowsiness, light sleep, memory', note: 'Rises as you get drowsy. Frontal theta is also studied during sustained mental effort and memory tasks.' },
    { feel: 'Relaxed wakefulness, eyes closed', note: 'The classic “Berger rhythm”: strongest over the back of the head when you close your eyes and relax, and it drops when you open them or concentrate.' },
    { feel: 'Active thinking, motor planning', note: 'Linked with alert, engaged processing. Over motor cortex, beta (and the related mu rhythm) changes when you move or imagine moving — a key BCI signal.' },
    { feel: 'Fast activity, high-level processing', note: 'Fast and weak at the scalp, and easily contaminated by muscle activity (EMG). Treat scalp gamma with caution.' },
  ];

  const view = (NG.views.lab = {
    id: 'lab', title: 'Signal Lab', icon: 'activity',
    render() {
      return `
      ${ui.pageHead('01 · Signal Lab', 'Live neural <em>signal monitor</em>', 'Watch six illustrative EEG channels stream in real time. Every sample is synthesised in your browser from band oscillators plus realistic interference — the statistics and spectrum below are computed from those samples with real signal-processing maths.',
        `<button class="btn" id="labPause" type="button">${ui.icon('pause')}<span>Pause</span></button>
         <button class="btn" id="labReset" type="button">${ui.icon('refresh')}<span>Reset</span></button>
         <button class="btn btn-primary" id="labRec" type="button">${ui.icon('record')}<span>Record session</span></button>`)}
      <div class="lab-layout">
        <section class="card wave-card" data-reveal aria-labelledby="labWaveT">
          <div class="card-head">
            <div><h2 class="card-title" id="labWaveT">Multichannel EEG <span class="badge badge-sim">Simulated</span> <span class="badge badge-live" id="labLive">Live</span></h2>
              <p class="card-sub" id="labWaveSub">Illustrative channels named after the 10–20 system · 256 Hz · hover or touch the trace to read values</p></div>
            <div class="chip-row" id="labChips" role="group" aria-label="Visible channels"></div>
          </div>
          <div class="canvas-wrap wave-wrap"><canvas id="labWave" role="img" aria-label="Live simulated multichannel EEG waveform"></canvas></div>
          <div class="wave-foot">
            <div class="field-inline"><span class="label">Scale</span><div id="labVscale"></div></div>
            <div class="field-inline"><span class="label">Window</span><div id="labTimebase"></div></div>
            <span class="hint" id="labHintSim">Simulated data — not recorded from a person.</span>
          </div>
        </section>

        <section class="stats-grid" aria-label="Live statistics" data-reveal>
          <div class="stat"><div class="stat-k">Amplitude (RMS)</div><div class="stat-v"><span id="stRms">—</span><small>µV</small></div><div class="stat-n" id="stP2p">peak-to-peak —</div></div>
          <div class="stat"><div class="stat-k">Signal power</div><div class="stat-v"><span id="stPow">—</span><small>µV²</small></div><div class="stat-n">mean square, last 1 s</div></div>
          <div class="stat"><div class="stat-k">SNR <span data-tip="Signal-to-noise ratio. The simulator knows the true brain-like part and the interference separately, so this is exact ground truth — real EEG can only estimate it.">${ui.icon('info', 'i-sm')}</span></div><div class="stat-v"><span id="stSnr">—</span><small>dB</small></div><div class="stat-n">simulator ground truth</div></div>
          <div class="stat"><div class="stat-k">Signal quality</div><div class="stat-v" id="stQual">—</div><div class="meter"><i id="stQualBar"></i></div></div>
          <div class="stat"><div class="stat-k">Dominant band</div><div class="stat-v" id="stDom">—</div><div class="stat-n" id="stPeak">peak — Hz</div></div>
          <div class="stat"><div class="stat-k">Samples generated</div><div class="stat-v"><span id="stSamples">0</span></div><div class="stat-n">× 6 channels</div></div>
          <div class="stat"><div class="stat-k">Sampling rate</div><div class="stat-v">256<small>Hz</small></div><div class="stat-n" id="stNy">Nyquist limit 128 Hz</div></div>
          <div class="stat"><div class="stat-k">Profile · duration</div><div class="stat-v stat-v-sm" id="stProf">—</div><div class="stat-n" id="stDur">monitoring 00:00:00</div></div>
        </section>

        <section class="card controls-card" data-reveal aria-labelledby="labCtlT">
          <div class="card-head"><div><h2 class="card-title" id="labCtlT">Signal generator</h2><p class="card-sub">Shape the simulated brain state and the interference around it.</p></div><button class="link-btn" id="labRandom" type="button">${ui.icon('shuffle', 'i-sm')} Randomize</button></div>
          <div class="card-body stack">
            <div class="field"><span class="label" id="profLbl">Neural profile</span><div class="profile-grid" id="labProfiles" role="radiogroup" aria-labelledby="profLbl"></div><p class="hint" id="labProfDesc"></p></div>
            <div class="custom-bands" id="labCustom" hidden>
              <span class="label">Custom band amplitudes (µV RMS)</span>
              <div class="custom-grid" id="labCustomGrid"></div>
            </div>
            <div class="slider-grid" id="labSliders"></div>
            <div class="field-row">
              <div class="field"><label class="label" for="labCh">Analysis channel</label><select class="select" id="labCh"></select><p class="hint">Stats and spectrum are computed for this channel.</p></div>
              <div class="field"><span class="label" id="mainsLbl">Mains frequency</span><div id="labMains"></div><p class="hint">Sets where power-line hum appears.</p></div>
            </div>
          </div>
        </section>

        <section class="card spectrum-card" data-reveal aria-labelledby="labSpecT">
          <div class="card-head"><div><h2 class="card-title" id="labSpecT">Frequency spectrum <span class="badge badge-live">FFT · Hann window</span></h2><p class="card-sub" id="labSpecSub">Power spectral density of the analysis channel — click a band to learn about it</p></div>
            <div class="row"><div id="labSpecScale"></div><div id="labSpecRange"></div></div></div>
          <div class="canvas-wrap spec-wrap"><canvas id="labSpec" role="img" aria-label="Frequency spectrum with EEG bands shaded"></canvas></div>
        </section>

        <section class="card bands-card" data-reveal aria-labelledby="labBandT">
          <div class="card-head"><div><h2 class="card-title" id="labBandT">Band activity</h2><p class="card-sub">Relative power computed from the spectrum above · select a band</p></div></div>
          <div class="card-body">
            <div class="band-list" id="labBands" role="radiogroup" aria-label="EEG frequency bands"></div>
            <div class="band-info" id="labBandInfo" aria-live="polite"></div>
          </div>
        </section>
      </div>`;
    },

    init(root) {
      const $ = (s) => U.$(s, root);
      this.root = root;
      this.selBand = -1; this.dirty = true;
      this.bufs = CHANNELS.map(() => new Float32Array(engine.CAP));
      this.wave = new NG.viz.Waveform($('#labWave'));
      this.spec = new NG.viz.Spectrum($('#labSpec'), { onBand: (i) => this.selectBand(i) });
      this.counters = {
        rms: NG.counter($('#stRms'), { decimals: 1 }), pow: NG.counter($('#stPow'), { decimals: 1 }), snr: NG.counter($('#stSnr'), { decimals: 1 }),
        samples: NG.counter($('#stSamples'), { format: (v) => U.fmtInt(v) }),
      };
      /* channel chips */
      const chips = $('#labChips');
      CHANNELS.forEach((c) => {
        const b = U.h('button.chip', { type: 'button', 'aria-pressed': 'true', 'data-ch': c.name, 'data-tip': c.region + ' (illustrative)' }, c.name);
        b.addEventListener('click', () => {
          const cur = store.get('lab.channels'), on = cur.includes(c.name);
          if (on && cur.length === 1) { ui.toast('At least one channel must stay visible.', { type: 'warn' }); return; }
          store.set('lab.channels', on ? cur.filter((n) => n !== c.name) : [...cur, c.name]);
        });
        chips.append(b);
      });
      /* segmented controls */
      this.vscale = ui.segmented($('#labVscale'), { label: 'Vertical scale', value: store.get('lab.vscale'), options: [25, 50, 100, 200].map((v) => ({ value: v, label: '±' + v, tip: `Full lane height = ±${v} µV` })), onChange: (v) => store.set('lab.vscale', +v) });
      this.tb = ui.segmented($('#labTimebase'), { label: 'Time window', value: store.get('lab.timebase'), options: [2, 4, 6, 8, 10].map((v) => ({ value: v, label: v + ' s' })), onChange: (v) => store.set('lab.timebase', +v) });
      this.sscale = ui.segmented($('#labSpecScale'), { label: 'Spectrum scale', value: store.get('ui.specScale'), options: [{ value: 'linear', label: 'Linear' }, { value: 'db', label: 'dB' }], onChange: (v) => store.set('ui.specScale', v) });
      this.srange = ui.segmented($('#labSpecRange'), { label: 'Frequency range', value: store.get('lab.specRange'), options: [{ value: 40, label: '0–40 Hz' }, { value: 100, label: '0–100 Hz' }], onChange: (v) => store.set('lab.specRange', +v) });
      this.mains = ui.segmented($('#labMains'), { label: 'Mains frequency', value: store.get('ui.mains'), options: [{ value: 50, label: '50 Hz' }, { value: 60, label: '60 Hz' }], onChange: (v) => store.set('ui.mains', +v) });
      /* profile picker */
      const pg = $('#labProfiles');
      PROFILE_ORDER.forEach((id) => {
        const p = PROFILES[id];
        const b = U.h('button.profile-btn', { type: 'button', role: 'radio', 'data-id': id }, U.h('b', p.name), U.h('small', p.short));
        b.addEventListener('click', () => store.set('lab.profile', id));
        pg.append(b);
      });
      pg.addEventListener('keydown', (e) => {
        const btns = U.$$('.profile-btn', pg), i = btns.indexOf(document.activeElement); if (i < 0) return;
        const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % btns.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + btns.length) % btns.length : -1;
        if (n >= 0) { e.preventDefault(); btns[n].focus(); btns[n].click(); }
      });
      /* custom band sliders */
      const cg = $('#labCustomGrid');
      BANDS.forEach((b, i) => {
        const id = 'cb' + i;
        const input = U.h('input.range', { type: 'range', id, min: 0, max: 30, step: 0.5, 'aria-label': b.name + ' amplitude' });
        const out = U.h('output.value-out', { for: id });
        input.addEventListener('input', () => { const a = store.get('lab.custom'); a[i] = +input.value; out.textContent = (+input.value).toFixed(1); store.set('lab.custom', a); });
        ui.range(input);
        cg.append(U.h('div.field', U.h('div.field-top', U.h('label.label', { for: id }, `${b.sym} ${b.name}`), out), input));
        input._out = out; input._i = i;
      });
      /* generic sliders */
      const SL = [
        { k: 'lab.amplitude', label: 'Signal intensity', min: 20, max: 250, step: 5, fmt: (v) => v + '%', hint: 'Scales the neural component only' },
        { k: 'lab.noise', label: 'Noise level', min: 0, max: 100, step: 1, fmt: (v) => v + '%', hint: 'Broadband noise, muscle activity and blinks' },
        { k: 'lab.line', label: 'Mains hum', min: 0, max: 100, step: 1, fmt: (v) => v + '%', hint: 'Power-line interference at 50/60 Hz' },
        { k: 'lab.drift', label: 'Baseline drift', min: 0, max: 100, step: 1, fmt: (v) => v + '%', hint: 'Slow wandering of the baseline' },
        { k: 'lab.speed', label: 'Stream speed', min: 0.25, max: 4, step: 0.25, fmt: (v) => v + '×', hint: 'Simulation speed (1× = real time)' },
      ];
      this.sliders = {};
      const sg = $('#labSliders');
      SL.forEach((s) => {
        const id = 'sl-' + s.k.replace('.', '-');
        const input = U.h('input.range', { type: 'range', id, min: s.min, max: s.max, step: s.step, 'aria-describedby': id + '-h' });
        const out = U.h('output.value-out', { for: id });
        input.addEventListener('input', () => { out.textContent = s.fmt(+input.value); store.set(s.k, +input.value); });
        ui.range(input);
        sg.append(U.h('div.field', U.h('div.field-top', U.h('label.label', { for: id }, s.label), out), input, U.h('span.hint', { id: id + '-h' }, s.hint)));
        this.sliders[s.k] = { input, out, fmt: s.fmt };
      });
      /* channel select */
      const sel = $('#labCh'); CHANNELS.forEach((c) => sel.append(U.h('option', { value: c.name }, `${c.name} — ${c.region}`)));
      sel.addEventListener('change', () => { store.set('lab.channel', sel.value); engine.computeStats(); });
      /* band list */
      const bl = $('#labBands');
      BANDS.forEach((b, i) => {
        const row = U.h('button.band-row', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-i': i, style: { '--c': `var(--band-${b.id})` } },
          U.h('span.band-sym', b.sym), U.h('span.band-name', U.h('b', b.name), U.h('small', `${b.lo}–${b.hi} Hz`)),
          U.h('span.band-bar', U.h('i')), U.h('span.band-pct.mono.tnum', '0%'));
        row.addEventListener('click', () => this.selectBand(this.selBand === i ? -1 : i));
        bl.append(row);
      });
      /* buttons */
      $('#labPause').addEventListener('click', () => engine.toggle());
      $('#labReset').addEventListener('click', async () => {
        if (engine.session.state === 'recording' && engine.session.samples > 0) {
          const ok = await ui.modal.confirm({ title: 'Reset stream?', message: 'A recording is in progress. Resetting clears the signal buffers <b>and discards the unsaved recording</b>.', confirmText: 'Reset and discard', danger: true });
          if (!ok) return;
        }
        engine.reset(); ui.toast('Signal buffers cleared and generator reseeded.'); this.dirty = true;
      });
      $('#labRec').addEventListener('click', () => this.toggleRecord());
      $('#labRandom').addEventListener('click', () => {
        const ids = PROFILE_ORDER.filter((x) => x !== 'custom' && x !== store.get('lab.profile'));
        store.set('lab.profile', U.pick(ids)); store.set('lab.amplitude', 60 + Math.round(Math.random() * 100)); store.set('lab.noise', Math.round(Math.random() * 45));
        ui.toast('New signal profile generated.');
      });
      /* subscriptions that live as long as the page */
      this.unsubs = [
        store.on('lab', () => { this.syncControls(); this.dirty = true; }), store.on('ui.specScale', () => { this.sscale.set(store.get('ui.specScale')); this.dirty = true; }),
        store.on('ui.mains', () => { this.mains.set(store.get('ui.mains')); this.dirty = true; }), store.on('ui', () => { this.dirty = true; }),
        NG.theme.on('change', () => { this.dirty = true; }), store.on('reset', () => { this.syncControls(); this.dirty = true; }),
      ];
      this.syncControls();
      this.onResize = () => { this.dirty = true; };
    },

    syncControls() {
      const r = this.root, lab = store.get('lab');
      U.$$('.chip', r).forEach((b) => b.setAttribute('aria-pressed', lab.channels.includes(b.dataset.ch)));
      this.vscale.set(lab.vscale); this.tb.set(lab.timebase); this.srange.set(lab.specRange); this.sscale.set(store.get('ui.specScale')); this.mains.set(store.get('ui.mains'));
      U.$$('.profile-btn', r).forEach((b) => { const on = b.dataset.id === lab.profile; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
      U.$('#labProfDesc', r).textContent = PROFILES[lab.profile].desc;
      U.$('#labCustom', r).hidden = lab.profile !== 'custom';
      U.$$('#labCustomGrid input', r).forEach((inp) => { ui.setRange(inp, lab.custom[inp._i]); inp._out.textContent = (+lab.custom[inp._i]).toFixed(1); });
      for (const [k, s] of Object.entries(this.sliders)) { const v = store.get(k); ui.setRange(s.input, v); s.out.textContent = s.fmt(v); }
      U.$('#labCh', r).value = lab.channel;
      U.$('#labSpecSub', r).textContent = `Power spectral density of ${lab.channel} — click a band to learn about it`;
      U.$('#labWaveSub', r).textContent = `Illustrative channels named after the 10–20 system · 256 Hz · analysis channel ${lab.channel}`;
    },

    selectBand(i) {
      this.selBand = i; this.dirty = true;
      U.$$('.band-row', this.root).forEach((b, k) => b.setAttribute('aria-checked', k === i));
      const box = U.$('#labBandInfo', this.root);
      if (i < 0) { box.innerHTML = `<p class="hint">${ui.icon('info', 'i-sm')} Select a band (or click the spectrum) to see what it is usually associated with.</p>`; return; }
      const b = BANDS[i], inf = BAND_INFO[i], st = engine.stats;
      box.innerHTML = `<div class="band-card" style="--c:var(--band-${b.id})"><div class="row"><span class="band-sym big">${b.sym}</span><div><b>${b.name} · ${b.lo}–${b.hi} Hz</b><div class="hint">${inf.feel}</div></div><span class="badge right">${(st.rel[i] * 100).toFixed(0)}% of power now</span></div><p>${inf.note}</p><p class="hint">These associations are broad research conventions — they are <b>not</b> readouts of a person’s thoughts, and in this app the signals are simulated.</p></div>`;
    },

    toggleRecord() {
      if (engine.session.state === 'recording') {
        const s = engine.stopSession();
        if (!s) ui.toast('Recording was shorter than 1 second, so nothing was saved.', { type: 'warn' });
        else { ui.toast(`Saved a ${U.fmtDuration(s.durationSec)} simulated session. Export it from Sessions & Export.`, { type: 'success', title: 'Session saved' }); NG.sound.play('stop'); }
      } else {
        if (engine.session.state === 'stopped' && engine.session.samples > 0) engine.discardSession();
        engine.startSession(); NG.sound.play('start'); ui.toast('Recording simulated samples… press Stop to finish.', { icon: 'record' });
      }
    },

    updateStats() {
      const s = engine.stats, r = this.root, c = this.counters, $ = (q) => U.$(q, r);
      c.rms.set(s.rms); c.pow.set(s.power); c.snr.set(s.snr); c.samples.set(s.samples);
      $('#stP2p').textContent = `peak-to-peak ${s.p2p.toFixed(1)} µV`;
      $('#stQual').textContent = s.qualityLabel; $('#stQual').dataset.q = s.qualityLabel.toLowerCase(); $('#stQualBar').style.width = (s.quality * 100).toFixed(0) + '%';
      const b = BANDS[s.dominant]; $('#stDom').innerHTML = `${b.sym} ${b.name}`; $('#stPeak').textContent = `peak ${s.peakHz.toFixed(1)} Hz · centroid ${s.centroid.toFixed(1)} Hz`;
      $('#stProf').textContent = PROFILES[s.profile].name; $('#stDur').textContent = 'monitoring ' + U.fmtClock(engine.generated / engine.FS);
      U.$$('.band-row', r).forEach((row, i) => { row.querySelector('.band-bar i').style.width = (s.rel[i] * 100).toFixed(1) + '%'; row.querySelector('.band-pct').textContent = Math.round(s.rel[i] * 100) + '%'; row.classList.toggle('is-dom', i === s.dominant); row.title = `${s.abs[i].toFixed(1)} µV² in band`; });
      if (this.selBand >= 0) { const badge = U.$('#labBandInfo .badge', r); if (badge) badge.textContent = `${(s.rel[this.selBand] * 100).toFixed(0)}% of power now`; }
      this.drawSpectrum();
      this.updateRec();
    },

    updateRec() {
      const btn = U.$('#labRec', this.root), rec = engine.session.state === 'recording';
      btn.classList.toggle('is-rec', rec);
      btn.querySelector('span').textContent = rec ? `Stop · ${U.fmtClock(engine.session.duration).slice(3)}` : 'Record session';
      btn.firstElementChild.outerHTML = rec ? ui.icon('stop') : ui.icon('record');
    },

    drawSpectrum() {
      const C = NG.theme.c, mains = store.get('ui.mains'), fmax = store.get('lab.specRange');
      this.spec.draw({ series: [{ psd: engine.psd, df: engine.df, color: C.accent, fill: true, label: 'PSD', width: 1.7 }], fmax, scale: store.get('ui.specScale'), selected: this.selBand, markers: store.get('lab.line') > 5 ? [{ f: mains, label: mains + ' Hz mains' }] : [] });
    },

    frame(dt, ts) {
      const lab = store.get('lab'), running = engine.running;
      if (!running && !this.dirty) return;
      const fs = engine.FS, n = Math.round(lab.timebase * fs), vis = CHANNELS.filter((c) => lab.channels.includes(c.name));
      const lanes = vis.map((c) => { const i = engine.idxOf(c.name), m = engine.copyLast('total', i, n, this.bufs[i]); return { label: c.name, sub: c.region.split(' ')[0], data: this.bufs[i], n: m, selected: c.name === lab.channel, color: c.name === lab.channel ? NG.theme.c.accent : NG.theme.c.blue }; });
      this.wave.draw({ lanes, fs, windowSec: lab.timebase, endIndex: engine.generated, originIndex: 0, scale: lab.vscale, showGrid: store.get('ui.grid'), glow: store.get('ui.glow'), lineWidth: store.get('ui.lineWidth'), paused: !running, watermark: 'SIMULATED', ts });
      if (!running) this.drawSpectrum();
      this.dirty = false;
    },

    show() {
      this.dirty = true; this.syncControls(); this.selectBand(this.selBand); this.updateStats(); this.updateRunState();
      this.wave.fit(); this.spec.fit();
      NG.loop.add('view-lab', (dt, ts) => this.frame(dt, ts));
      this.off = [engine.on('stats', () => this.updateStats()), engine.on('run', () => { this.updateRunState(); this.dirty = true; }), engine.on('session', () => this.updateRec()), engine.on('reset', () => { this.updateStats(); }), engine.on('profile', () => { this.dirty = true; })];
      addEventListener('resize', this.onResize);
    },
    hide() { NG.loop.remove('view-lab'); (this.off || []).forEach((f) => f && f()); this.off = []; removeEventListener('resize', this.onResize); },

    updateRunState() {
      const run = engine.running, b = U.$('#labPause', this.root);
      b.innerHTML = `${ui.icon(run ? 'pause' : 'play')}<span>${run ? 'Pause' : 'Resume'}</span>`;
      const l = U.$('#labLive', this.root); l.textContent = run ? 'Live' : 'Paused'; l.className = 'badge ' + (run ? 'badge-live' : 'badge-sim');
    },
  });
})();
