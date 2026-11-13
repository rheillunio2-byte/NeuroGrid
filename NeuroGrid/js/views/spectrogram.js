/* NeuroGrid — Spectrogram: a real Short-Time Fourier Transform of live, generated or imported signals. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, dsp = NG.dsp, sim = NG.sim;
  NG.views = NG.views || {};
  const S = { source: 'live', channel: 'C3', nfft: 256, overlap: 0.75, win: 'hann', fmax: 60, log: false, cmap: 'viridis', dbRange: 50, bands: true, liveSec: 12,
    wb: { profile: 'relaxed', profile2: 'active', fs: 256, seconds: 30, seed: 7, noise: 0.15 }, viewLen: 20, start: 0, play: false, playhead: 0 };

  NG.views.spectrogram = {
    id: 'spectrogram', title: 'Spectrogram', icon: 'grid',
    render() {
      return `${ui.pageHead('03 · Spectrogram', 'Frequency <em>over time</em>', 'A spectrogram slices a signal into short overlapping windows and computes the Fourier transform of each (the Short-Time Fourier Transform). Colour shows power at each frequency and moment, so you can see brain-state changes that a single spectrum averages away.',
        `<button class="btn" id="spExport" type="button">${ui.icon('download')}<span>Export spectrogram CSV</span></button>`)}
      <div class="sp-layout">
        <section class="card sp-main" data-reveal aria-labelledby="spT">
          <div class="card-head"><div><h2 class="card-title" id="spT">Time–frequency map <span id="spSrc"></span></h2><p class="card-sub" id="spSub"></p></div><div class="row"><button class="btn btn-sm" id="spPlay" type="button">${ui.icon('play')}<span>Play</span></button></div></div>
          <div class="canvas-wrap sp-wrap"><canvas id="spCv" tabindex="0" role="img" aria-label="Spectrogram: time on the horizontal axis, frequency on the vertical axis, colour is power"></canvas></div>
          <div class="sp-read" id="spRead" aria-live="off"><span class="hint">Hover or touch the map to read the exact frequency, time and power at that point. Click to move the playhead.</span></div>
          <div class="sp-scrub" id="spScrubWrap" hidden></div>
        </section>
        <section class="card sp-ctl" data-reveal aria-labelledby="spCT"><div class="card-head"><div><h2 class="card-title" id="spCT">Signal source</h2></div></div><div class="card-body stack" id="spSrcCtl"></div></section>
        <section class="card sp-ctl" data-reveal aria-labelledby="spST"><div class="card-head"><div><h2 class="card-title" id="spST">STFT settings</h2><p class="card-sub">Time and frequency resolution trade off against each other.</p></div></div><div class="card-body stack" id="spStftCtl"></div></section>
        <section class="card sp-info" data-reveal aria-labelledby="spIT"><div class="card-head"><div><h2 class="card-title" id="spIT">Measured resolution</h2></div></div><div class="card-body stack"><div class="stats-grid" id="spStats"></div>
          <div class="callout">${ui.icon('info')}<div><strong>How to read it.</strong> Horizontal = time, vertical = frequency, colour = power spectral density in dB (brighter = stronger). A steady horizontal stripe near 10 Hz is a sustained alpha rhythm; a vertical streak is a brief broadband event such as a blink or a muscle burst; a stripe at 50/60 Hz is mains interference. A longer window sharpens frequency detail but blurs timing (and vice versa) — you cannot have both.</div></div>
          <p class="hint">Every pixel comes from the STFT of the displayed samples; nothing is decorative. The dB range is relative to the loudest region currently shown.</p></div></section>
      </div>`;
    },
    init(root) {
      this.root = root; const $ = (s) => U.$(s, root);
      this.view = new NG.viz.SpectrogramView($('#spCv'), { onHover: (p) => { if (p) NG.progress.unlock('spectro_seer'); this.hover(p); }, onSeek: (t) => { if (S.source !== 'live') { S.playhead = t; this.redraw(); } } });
      this.buf = new Float32Array(engine.CAP);
      /* source controls */
      const sc = $('#spSrcCtl');
      this.srcSeg = ui.segField({ label: 'Source', value: S.source, options: [{ value: 'live', label: 'Live stream' }, { value: 'workbench', label: 'Simulated recording' }, { value: 'imported', label: 'Imported' }], onChange: (v) => { S.source = v; S.start = 0; S.playhead = 0; this.buildSrc(); this.compute(true); } });
      this.srcBody = U.h('div.stack'); sc.append(this.srcSeg.el, this.srcBody);
      /* stft controls */
      const st = $('#spStftCtl');
      this.cNfft = ui.segField({ label: 'Window size (samples)', value: S.nfft, hint: 'Longer = finer frequency, blurrier time.', options: [64, 128, 256, 512, 1024].map((v) => ({ value: v, label: String(v) })), onChange: (v) => { S.nfft = +v; this.compute(true); } });
      this.cOv = ui.segField({ label: 'Overlap', value: S.overlap, hint: 'Higher overlap = smoother time axis (more frames).', options: [0, 0.5, 0.75, 0.9].map((v) => ({ value: v, label: v * 100 + '%' })), onChange: (v) => { S.overlap = +v; this.compute(true); } });
      this.cWin = ui.selectField({ label: 'Window function', value: S.win, options: [['hann', 'Hann'], ['hamming', 'Hamming'], ['blackman', 'Blackman'], ['rect', 'Rectangular (no taper)']], onChange: (v) => { S.win = v; this.compute(true); } });
      this.cFmax = ui.slider({ label: 'Maximum frequency', min: 10, max: 120, step: 5, value: S.fmax, fmt: (v) => v + ' Hz', onInput: (v) => { S.fmax = v; this.redraw(); } });
      this.cLog = ui.switchField('Logarithmic frequency axis', S.log, 'Spreads out the low frequencies.', (v) => { S.log = v; this.redraw(); });
      this.cBands = ui.switchField('Show EEG band boundaries', S.bands, 'Dashed lines at 4, 8, 13 and 30 Hz.', (v) => { S.bands = v; this.redraw(); });
      this.cMap = ui.segField({ label: 'Colour map', value: S.cmap, options: Object.entries(NG.colormaps.NAMES).map(([v, l]) => ({ value: v, label: l })), onChange: (v) => { S.cmap = v; this.redraw(); } });
      this.cDb = ui.segField({ label: 'Dynamic range', value: S.dbRange, options: [30, 50, 70].map((v) => ({ value: v, label: v + ' dB' })), onChange: (v) => { S.dbRange = +v; this.redraw(); } });
      st.append(this.cNfft.el, this.cOv.el, this.cWin.el, this.cFmax.el, this.cMap.el, this.cDb.el, this.cLog, this.cBands);
      $('#spPlay').addEventListener('click', () => this.togglePlay());
      $('#spExport').addEventListener('click', () => this.exportCsv());
      this.buildSrc();
    },
    buildSrc() {
      const b = this.srcBody; b.innerHTML = ''; const chOpts = (names) => names.map((n) => [n, n]);
      if (S.source === 'live') {
        const c = ui.selectField({ label: 'Channel', value: S.channel, options: sim.CHANNELS.map((x) => [x.name, `${x.name} — ${x.region}`]), onChange: (v) => { S.channel = v; this.compute(true); } });
        const w = ui.slider({ label: 'History shown', min: 6, max: 15, step: 1, value: S.liveSec, fmt: (v) => v + ' s', onInput: (v) => { S.liveSec = v; } });
        b.append(c.el, w.el, U.h('p.hint', 'The live simulated stream is analysed continuously (about 4 updates per second). Change the profile in Signal Lab to watch the spectrogram respond.'));
      } else if (S.source === 'workbench') {
        const P = sim.PROFILE_ORDER.filter((p) => p !== 'custom').map((p) => [p, sim.PROFILES[p].name]), w = S.wb;
        const ch = ui.selectField({ label: 'Channel', value: S.channel, options: sim.CHANNELS.map((x) => [x.name, `${x.name} — ${x.region}`]), onChange: (v) => { S.channel = v; this.compute(true); } });
        const p1 = ui.selectField({ label: 'Profile (first half)', value: w.profile, options: P, onChange: (v) => { w.profile = v; } }), p2 = ui.selectField({ label: 'Profile (second half)', value: w.profile2, options: [['', 'Same (no change)'], ...P], onChange: (v) => { w.profile2 = v; } });
        const fs = ui.segField({ label: 'Sampling rate (Hz)', value: w.fs, options: NG.workbench.FS_OPTIONS.map((v) => ({ value: v, label: String(v) })), onChange: (v) => { w.fs = +v; } });
        const dur = ui.slider({ label: 'Duration', min: 5, max: 120, step: 5, value: w.seconds, fmt: (v) => v + ' s', onInput: (v) => { w.seconds = v; } });
        const nz = ui.slider({ label: 'Noise level', min: 0, max: 100, step: 5, value: w.noise * 100, fmt: (v) => v + '%', onInput: (v) => { w.noise = v / 100; } });
        const sd = ui.slider({ label: 'Random seed', min: 1, max: 999, step: 1, value: w.seed, hint: 'Same seed + settings → identical signal.', onInput: (v) => { w.seed = v; } });
        const go = U.h('button.btn.btn-primary', { type: 'button' }, U.html(ui.icon('zap')), U.h('span', 'Generate recording'));
        go.addEventListener('click', () => { try { this.rec = NG.workbench.generate({ profile: w.profile, profile2: w.profile2 || null, fs: w.fs, seconds: w.seconds, seed: w.seed, noise: w.noise }); S.start = 0; S.playhead = 0; this.compute(true); ui.toast(`Generated ${w.seconds} s at ${w.fs} Hz (simulated).`, { type: 'success' }); } catch (e) { ui.toast(e.message, { type: 'warn' }); } });
        b.append(ch.el, p1.el, p2.el, fs.el, dur.el, nz.el, sd.el, go);
        if (!this.rec) go.click();
      } else {
        const ds = NG.data.current;
        if (!ds) { b.append(U.html(`<div class="empty"><strong>No dataset imported</strong><span>Import a CSV file in the Data Import section, then come back here.</span></div>`), U.h('a.btn', { href: '#/data' }, 'Go to Data Import')); }
        else { const c = ui.selectField({ label: 'Channel', value: S.ich && ds.channels.some((x) => x.name === S.ich) ? S.ich : ds.channels[0].name, options: chOpts(ds.channels.map((x) => x.name)), onChange: (v) => { S.ich = v; this.compute(true); } }); S.ich = c.get(); b.append(c.el, U.h('p.hint', `${ds.filename} · ${ds.fs} Hz · ${ds.duration.toFixed(1)} s · units: ${ds.unit}`)); }
      }
    },
    /** Current signal descriptor. */
    signal() {
      if (S.source === 'live') { const ci = engine.idxOf(S.channel), n = Math.min(engine.CAP, S.liveSec * engine.FS), have = engine.copyLast('total', ci, n, this.buf); return { x: this.buf.subarray(0, have), fs: engine.FS, source: 'SIMULATED', unit: 'µV', label: `Live · ${S.channel}`, live: true }; }
      if (S.source === 'workbench') { const r = this.rec; if (!r) return null; const c = r.channels.find((x) => x.name === S.channel) || r.channels[0]; return { x: c.data, fs: r.fs, source: 'SIMULATED', unit: 'µV', label: `Simulated recording · ${c.name}`, switchAt: r.switchAt }; }
      const ds = NG.data.current; if (!ds) return null; const c = ds.channels.find((x) => x.name === S.ich) || ds.channels[0]; return { x: c.data, fs: ds.fs, source: 'IMPORTED', unit: ds.unit, label: `${ds.filename} · ${c.name}` };
    },
    compute(force) {
      const sg = this.signal(), $ = (s) => U.$(s, this.root);
      $('#spSrc').innerHTML = ui.sourceBadge(sg ? sg.source : 'SIMULATED');
      if (!sg) { this.spec = null; this.sg = null; this.view.draw({ spec: null, empty: 'Import a dataset to see its spectrogram' }); $('#spSub').textContent = 'No data'; $('#spStats').innerHTML = ''; return; }
      this.sg = sg; let x = sg.x, t0 = 0; const total = x.length / sg.fs;
      if (!sg.live && total > S.viewLen) { const sw = U.$('#spScrubWrap', this.root); t0 = Math.min(S.start, total - S.viewLen); x = x.subarray(Math.round(t0 * sg.fs), Math.round((t0 + S.viewLen) * sg.fs)); this.scrub(total); } else this.scrub(0);
      this.t0 = t0;
      try { this.spec = NG.stft.stft(x, sg.fs, { nfft: S.nfft, overlap: S.overlap, window: S.win }); this.err = null; } catch (e) { this.spec = null; this.err = e.message; }
      this.xs = x; this.dur = x.length / sg.fs; this.stats(); this.redraw();
      $('#spSub').textContent = this.err ? this.err : `${sg.label} · ${sg.fs} Hz · showing ${this.dur.toFixed(1)} s${sg.live ? ' (rolling)' : ' of ' + total.toFixed(1) + ' s'}`;
    },
    scrub(total) {
      const w = U.$('#spScrubWrap', this.root); if (!total) { w.hidden = true; return; } w.hidden = false;
      if (!w._built) { w._built = true; this.vlen = ui.segField({ label: 'View length', value: S.viewLen, options: [10, 20, 30, 60].map((v) => ({ value: v, label: v + ' s' })), onChange: (v) => { S.viewLen = +v; this.compute(true); } }); this.sSlider = ui.slider({ label: 'Pan (start time)', min: 0, max: 1, step: 0.5, value: 0, fmt: (v) => v.toFixed(1) + ' s', onInput: (v) => { S.start = v; clearTimeout(this._pt); this._pt = setTimeout(() => this.compute(true), 60); } }); w.append(this.vlen.el, this.sSlider.el); }
      this.sSlider.input.max = Math.max(0, total - S.viewLen); ui.setRange(this.sSlider.input, Math.min(S.start, +this.sSlider.input.max)); this.sSlider.el.querySelector('output').textContent = (+this.sSlider.input.value).toFixed(1) + ' s';
    },
    stats() {
      const s = this.spec, el = U.$('#spStats', this.root); if (!s) { el.innerHTML = ''; return; }
      const k = (a, b, c) => `<div class="stat"><div class="stat-k">${a}</div><div class="stat-v stat-v-sm">${b}</div><div class="stat-n">${c}</div></div>`;
      el.innerHTML = k('Frequency resolution', s.df.toFixed(3) + ' Hz', `fs ÷ window = ${s.fs} ÷ ${s.nfft}`) + k('Time step', (s.dt * 1000).toFixed(0) + ' ms', `hop ${s.hop} samples`) + k('Window length', ((s.nfft / s.fs) * 1000).toFixed(0) + ' ms', s.window) + k('Frames', String(s.frames), `Nyquist limit ${s.fs / 2} Hz`);
    },
    redraw() {
      if (!this.spec) { if (this.err) this.view.draw({ spec: null, empty: this.err }); return; }
      const fmax = Math.min(S.fmax, this.sg.fs / 2), fmin = S.log ? 0.5 : 0, live = this.sg.live;
      this.view.draw({ spec: this.spec, signal: this.xs, fs: this.sg.fs, t0: 0, t1: this.dur, fmin, fmax, log: S.log, cmap: S.cmap, dbRange: S.dbRange, bandGuides: S.bands, playhead: live ? this.dur : S.playhead - this.t0, unit: this.sg.unit, watermark: this.sg.source });
    },
    hover(p) {
      const el = U.$('#spRead', this.root); if (!p) { el.innerHTML = '<span class="hint">Hover or touch the map to read the exact frequency, time and power at that point. Click to move the playhead.</span>'; return; }
      el.innerHTML = `<span class="mono">t = <b>${(p.t + this.t0).toFixed(2)} s</b></span><span class="mono">f = <b>${p.f.toFixed(2)} Hz</b></span><span class="mono">power = <b>${p.db.toFixed(1)} dB</b></span>${p.band ? `<span class="badge" style="border-color:var(--band-${p.band.id});color:var(--band-${p.band.id})">${p.band.sym} ${p.band.name}</span>` : '<span class="badge">outside EEG bands</span>'}`;
    },
    togglePlay() { S.play = !S.play; if (S.source === 'live') { if (S.play) engine.resume(); else engine.pause(); } const b = U.$('#spPlay', this.root); b.innerHTML = `${ui.icon(S.play ? 'pause' : 'play')}<span>${S.play ? 'Pause' : 'Play'}</span>`; },
    frame(dt) {
      const sg = this.sg;
      if (S.source === 'live') { this.acc = (this.acc || 0) + dt; if (this.acc > 0.25 && engine.running) { this.acc = 0; this.compute(); } return; }
      if (S.play && sg && this.dur) { S.playhead += dt; const total = sg.x.length / sg.fs; if (S.playhead >= this.t0 + this.dur) { if (this.t0 + this.dur >= total - 0.01) { S.playhead = 0; S.start = 0; this.compute(true); } else { S.start = this.t0 + this.dur; this.compute(true); } } this.redraw(); }
    },
    exportCsv() {
      if (!this.spec || !this.sg) { ui.toast('There is no spectrogram to export yet.', { type: 'warn' }); return; }
      U.download(`neurogrid-spectrogram-${this.sg.source.toLowerCase()}-${U.stamp()}.csv`, NG.exporters.spectrogramCsv(this.spec, this.sg.source)); ui.toast(`Exported ${this.spec.frames} × ${this.spec.bins} values (${this.sg.source}).`, { type: 'success' });
    },
    show() { this.buildSrc(); this.compute(true); this.view.fit(); NG.loop.add('view-spectro', (dt) => this.frame(dt)); this.offT = NG.theme.on('change', () => this.redraw()); this.offD = NG.data.on('change', () => { if (S.source === 'imported') { this.buildSrc(); this.compute(true); } }); },
    hide() { NG.loop.remove('view-spectro'); this.offT && this.offT(); this.offD && this.offD(); if (S.play) this.togglePlay(); },
  };
})();
