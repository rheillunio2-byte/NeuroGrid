/* NeuroGrid — Processing Studio: a real DSP chain applied to the live simulated signal.
 * Stages (fixed order): high-pass → low-pass → band-pass → notch → noise reduction → normalisation. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, dsp = NG.dsp;
  const { CHANNELS } = NG.sim;
  NG.views = NG.views || {};

  const STAGES = [
    { k: 'hp', name: 'High-pass filter', tag: 'Removes slow drift', params: [{ key: 'fc', label: 'Cutoff', min: 0.1, max: 10, step: 0.1, unit: 'Hz', d: 1 }, { key: 'order', label: 'Order', seg: [2, 4, 6] }],
      how: 'Lets fast waves through and blocks very slow ones. EEG recordings wander slowly (sweat, electrode movement, breathing). A high-pass around 0.5–1 Hz flattens that wander without touching brain rhythms. A higher <b>order</b> makes the cut-off steeper.' },
    { k: 'lp', name: 'Low-pass filter', tag: 'Removes fast fuzz', params: [{ key: 'fc', label: 'Cutoff', min: 5, max: 100, step: 1, unit: 'Hz', d: 0 }, { key: 'order', label: 'Order', seg: [2, 4, 6] }],
      how: 'Lets slow waves through and blocks fast ones. Muscle activity and electronic noise live at high frequencies, so a low-pass near 30–45 Hz cleans up the trace. Lower the cutoff too far and you start removing real beta and gamma activity.' },
    { k: 'bp', name: 'Band-pass filter', tag: 'Keeps one band', params: [{ key: 'lo', label: 'Low edge', min: 0.5, max: 40, step: 0.5, unit: 'Hz', d: 1 }, { key: 'hi', label: 'High edge', min: 2, max: 80, step: 0.5, unit: 'Hz', d: 1 }, { key: 'order', label: 'Order', seg: [2, 4, 6] }],
      how: 'A high-pass and a low-pass together: only frequencies between the two edges survive. Try 8–13 Hz to isolate alpha, or 13–30 Hz for beta. Brain–computer interfaces often band-pass around the band that carries their control signal.' },
    { k: 'notch', name: 'Notch filter', tag: 'Cuts mains hum', params: [{ key: 'f0', label: 'Centre', min: 40, max: 70, step: 1, unit: 'Hz', d: 0 }, { key: 'q', label: 'Quality (Q)', min: 5, max: 60, step: 1, unit: '', d: 0 }],
      how: 'A very narrow cut at one frequency. Power lines induce a 50 or 60 Hz hum in every recording; a notch removes it while leaving neighbouring frequencies almost untouched. A higher <b>Q</b> means a narrower notch.' , extra: 'mains' },
    { k: 'nr', name: 'Noise reduction', tag: 'Smooths random jitter', params: [{ key: 'method', label: 'Method', seg: ['mean', 'median'], labels: { mean: 'Average', median: 'Median' } }, { key: 'ms', label: 'Window', min: 4, max: 80, step: 2, unit: 'ms', d: 0 }],
      how: 'Replaces each sample with the <b>average</b> (smooth, but blurs spikes) or the <b>median</b> (ignores sudden spikes completely) of its neighbours in a short window. A longer window smooths more but also flattens fast brain rhythms.' },
    { k: 'norm', name: 'Normalisation', tag: 'Puts signals on one scale', params: [{ key: 'method', label: 'Method', seg: ['zscore', 'minmax'], labels: { zscore: 'Z-score', minmax: 'Min–max' } }],
      how: 'Rescales the signal so different channels or recordings can be compared fairly. <b>Z-score</b> shifts the mean to 0 and the spread (standard deviation) to 1. <b>Min–max</b> squeezes everything into −1 … +1. The shape is unchanged — only the units are.' },
  ];

  const PRESETS = [
    { id: 'clean', name: 'Clean EEG', desc: '0.5 Hz high-pass · 40 Hz low-pass · mains notch', set: (c) => { c.hp.on = true; c.hp.fc = 0.5; c.hp.order = 2; c.lp.on = true; c.lp.fc = 40; c.lp.order = 4; c.notch.on = true; c.notch.f0 = store.get('ui.mains'); } },
    { id: 'alpha', name: 'Isolate alpha', desc: '8–13 Hz band-pass', set: (c) => { c.bp.on = true; c.bp.lo = 8; c.bp.hi = 13; c.bp.order = 4; } },
    { id: 'hum', name: 'Remove hum', desc: 'Notch at the mains frequency', set: (c) => { c.notch.on = true; c.notch.f0 = store.get('ui.mains'); c.notch.q = 30; } },
    { id: 'smooth', name: 'Smooth muscle noise', desc: '30 Hz low-pass + 20 ms average', set: (c) => { c.lp.on = true; c.lp.fc = 30; c.lp.order = 4; c.nr.on = true; c.nr.method = 'mean'; c.nr.ms = 20; } },
    { id: 'spikes', name: 'Reject spikes', desc: '16 ms median filter', set: (c) => { c.nr.on = true; c.nr.method = 'median'; c.nr.ms = 16; } },
  ];

  const WIN = 6, WARM = 2; // seconds shown / seconds of filter warm-up discarded

  NG.views.studio = {
    id: 'studio', title: 'Processing Studio', icon: 'sliders',
    render() {
      return `
      ${ui.pageHead('02 · Processing Studio', 'Shape the signal with <em>real DSP</em>', 'Switch processing stages on and tune them. Filters here are genuine Butterworth and biquad implementations running on the live simulated stream — the waveform, spectrum and numbers all change because the maths changes.',
        `<button class="btn" id="stFreeze" type="button">${ui.icon('pause')}<span>Freeze signal</span></button><button class="btn" id="stStress" type="button" data-tip="Raises noise, mains hum and drift in the Signal Lab so the filters have something to remove">${ui.icon('zap')}<span>Stress-test signal</span></button>`)}
      <div class="studio-layout">
        <section class="card studio-view" data-reveal aria-labelledby="stViewT">
          <div class="card-head"><div><h2 class="card-title" id="stViewT">Before &amp; after <span class="badge badge-sim">Simulated</span></h2><p class="card-sub" id="stViewSub">Channel O1 · last 6 s</p></div>
            <div class="row wrap"><div class="field-inline"><label class="label" for="stCh">Channel</label><select class="select select-sm" id="stCh"></select></div></div></div>
          <div class="studio-canvases">
            <div class="canvas-wrap st-wave" id="stBeforeWrap"><canvas id="stBefore" role="img" aria-label="Original simulated waveform"></canvas></div>
            <div class="canvas-wrap st-wave"><canvas id="stAfter" role="img" aria-label="Processed waveform"></canvas></div>
          </div>
          <div class="wave-foot">
            ${ui.switchHtml('stOverlay', 'Overlay original', false, 'Draw the original faintly behind the result')}
            ${ui.switchHtml('stZero', 'Zero-phase (offline)', false, 'Filter forwards then backwards: no delay, doubled steepness')}
          </div>
          <div class="active-chain" id="stChainBar" aria-label="Active processing chain"></div>
        </section>

        <section class="stats-grid st-stats" data-reveal aria-label="Before and after statistics">
          <div class="stat"><div class="stat-k">RMS amplitude</div><div class="stat-v"><span id="sRmsB">—</span><i class="arr">→</i><span id="sRmsA">—</span></div><div class="stat-n" id="sRmsN">µV, before → after</div></div>
          <div class="stat"><div class="stat-k">Peak-to-peak</div><div class="stat-v"><span id="sPpB">—</span><i class="arr">→</i><span id="sPpA">—</span></div><div class="stat-n">µV, before → after</div></div>
          <div class="stat"><div class="stat-k">SNR <span data-tip="Computed against the simulator's known clean signal: P(filtered clean) ÷ P(filtered signal − filtered clean). Real recordings can't be scored this exactly.">${ui.icon('info', 'i-sm')}</span></div><div class="stat-v"><span id="sSnrB">—</span><i class="arr">→</i><span id="sSnrA">—</span></div><div class="stat-n" id="sSnrN">dB, before → after</div></div>
          <div class="stat"><div class="stat-k">Dominant band</div><div class="stat-v stat-v-sm"><span id="sDomB">—</span><i class="arr">→</i><span id="sDomA">—</span></div><div class="stat-n">before → after</div></div>
        </section>

        <section class="card studio-spec" data-reveal aria-labelledby="stSpecT">
          <div class="card-head"><div><h2 class="card-title" id="stSpecT">Spectrum &amp; filter response</h2><p class="card-sub"><span class="key key-a"></span>after <span class="key key-b"></span>before <span class="key key-c"></span>filter gain (0–1)</p></div><div id="stSpecScale"></div></div>
          <div class="canvas-wrap spec-wrap"><canvas id="stSpec" role="img" aria-label="Spectrum before and after processing with filter response"></canvas></div>
        </section>

        <section class="card studio-chain" data-reveal aria-labelledby="stChainT">
          <div class="card-head"><div><h2 class="card-title" id="stChainT">Processing chain</h2><p class="card-sub">Stages run top to bottom. Presets give you a starting point.</p></div><button class="link-btn" id="stClear" type="button">Reset all stages</button></div>
          <div class="card-body stack">
            <div class="preset-row" id="stPresets" role="group" aria-label="Presets"></div>
            <div class="stage-list" id="stStages"></div>
          </div>
        </section>
      </div>`;
    },

    init(root) {
      const $ = (s) => U.$(s, root);
      this.root = root; this.dirty = true; this.acc = 0; this.statAcc = 1; this.chain = null; this.cfgKey = '';
      const N = (WIN + WARM) * engine.FS;
      this.raw = new Float32Array(N); this.cln = new Float32Array(N); this.sbuf = new Float32Array(512);
      this.psdB = new Float64Array(257); this.psdA = new Float64Array(257);
      this.before = new NG.viz.Waveform($('#stBefore')); this.after = new NG.viz.Waveform($('#stAfter'));
      this.spec = new NG.viz.Spectrum($('#stSpec'));
      this.specScale = 'db';
      this.sseg = ui.segmented($('#stSpecScale'), { label: 'Spectrum scale', value: 'db', options: [{ value: 'db', label: 'dB' }, { value: 'linear', label: 'Linear' }], onChange: (v) => { this.specScale = v; this.dirty = true; this.analyse(); } });
      const sel = $('#stCh'); CHANNELS.forEach((c) => sel.append(U.h('option', { value: c.name }, `${c.name} — ${c.region}`)));
      sel.addEventListener('change', () => store.set('studio.channel', sel.value));
      $('#stOverlay').addEventListener('change', (e) => store.set('studio.overlay', e.target.checked));
      $('#stZero').addEventListener('change', (e) => store.set('studio.zeroPhase', e.target.checked));
      $('#stFreeze').addEventListener('click', () => engine.toggle());
      $('#stStress').addEventListener('click', () => {
        store.set('lab.noise', 45); store.set('lab.line', 70); store.set('lab.drift', 60); store.set('lab.profile', 'calm');
        ui.toast('Stress test on: strong noise, mains hum and drift. Now try the presets!', { icon: 'zap' });
      });
      $('#stClear').addEventListener('click', () => { store.set('studio.chain', store.defaults('studio.chain')); ui.toast('All processing stages switched off.'); });
      const pr = $('#stPresets');
      PRESETS.forEach((p) => {
        const b = U.h('button.preset', { type: 'button', 'data-tip': p.desc }, U.h('b', p.name), U.h('small', p.desc));
        b.addEventListener('click', () => {
          const c = store.defaults('studio.chain'); p.set(c); store.set('studio.chain', c);
          Object.keys(c).forEach((k) => c[k].on && NG.progress.markStage(k));
          ui.toast(`Preset applied: ${p.name}.`, { type: 'success' });
        });
        pr.append(b);
      });
      /* stage cards */
      const list = $('#stStages'); this.stageEls = {};
      STAGES.forEach((s, idx) => {
        const base = `studio.chain.${s.k}`;
        const el = U.h('div.stage', { 'data-k': s.k });
        const head = U.html(`<div class="stage-head"><span class="stage-num">${idx + 1}</span>${ui.switchHtml('sw-' + s.k, s.name, false, s.tag)}<button class="btn btn-ghost btn-sm btn-icon stage-help" type="button" aria-expanded="false" aria-controls="how-${s.k}" aria-label="How ${s.name} works" data-tip="How it works">${ui.icon('help')}</button></div>`);
        el.append(head);
        const sw = head.querySelector('input'); sw.addEventListener('change', () => { store.set(`${base}.on`, sw.checked); if (sw.checked) NG.progress.markStage(s.k); });
        const body = U.h('div.stage-body'); el.append(body);
        const how = U.h('div.how', { id: 'how-' + s.k, hidden: true, html: `<p>${s.how}</p>` }); el.append(how);
        head.querySelector('.stage-help').addEventListener('click', (e) => { const b = e.currentTarget, open = how.hidden; how.hidden = !open; b.setAttribute('aria-expanded', open); });
        const ctl = {};
        s.params.forEach((p) => {
          const id = `p-${s.k}-${p.key}`;
          if (p.seg) {
            const host = U.h('div'); const f = U.h('div.field', U.h('span.label', p.label), host); body.append(f);
            ctl[p.key] = ui.segmented(host, { label: `${s.name} ${p.label}`, value: store.get(`${base}.${p.key}`), options: p.seg.map((v) => ({ value: v, label: p.labels ? p.labels[v] : String(v) })), onChange: (v) => store.set(`${base}.${p.key}`, typeof p.seg[0] === 'number' ? +v : v) });
          } else {
            const input = U.h('input.range', { type: 'range', id, min: p.min, max: p.max, step: p.step }), out = U.h('output.value-out', { for: id });
            input.addEventListener('input', () => { out.textContent = (+input.value).toFixed(p.d) + (p.unit ? ' ' + p.unit : ''); store.set(`${base}.${p.key}`, +input.value); });
            ui.range(input); body.append(U.h('div.field', U.h('div.field-top', U.h('label.label', { for: id }, p.label), out), input));
            ctl[p.key] = { input, out, p };
          }
        });
        if (s.extra === 'mains') {
          const b = U.h('button.link-btn', { type: 'button' }, 'Match my mains frequency');
          b.addEventListener('click', () => store.set('studio.chain.notch.f0', store.get('ui.mains'))); body.append(b);
        }
        this.stageEls[s.k] = { el, sw, ctl };
        list.append(el);
      });
      this.unsubs = [store.on('studio', () => { this.syncControls(); this.dirty = true; }), store.on('lab', () => { this.dirty = true; }), store.on('ui', () => { this.dirty = true; }), store.on('reset', () => { this.syncControls(); this.dirty = true; }), NG.theme.on('change', () => { this.dirty = true; })];
      this.onResize = () => { this.dirty = true; };
      this.syncControls();
    },

    syncControls() {
      const r = this.root, st = store.get('studio');
      U.$('#stCh', r).value = st.channel; U.$('#stOverlay', r).checked = st.overlay; U.$('#stZero', r).checked = st.zeroPhase;
      STAGES.forEach((s) => {
        const e = this.stageEls[s.k], c = st.chain[s.k]; e.sw.checked = c.on; e.el.classList.toggle('is-on', c.on);
        s.params.forEach((p) => { const w = e.ctl[p.key]; if (p.seg) w.set(c[p.key]); else { ui.setRange(w.input, c[p.key]); w.out.textContent = (+c[p.key]).toFixed(p.d) + (p.unit ? ' ' + p.unit : ''); } });
        U.$$('.stage-body', e.el).forEach((b) => b.classList.toggle('dim', !c.on));
      });
      const act = STAGES.filter((s) => st.chain[s.k].on), bar = U.$('#stChainBar', r);
      bar.innerHTML = act.length ? `<span class="label">Chain</span>` + ['<span class="node">Original</span>', ...act.map((s) => `<span class="node on">${s.name.replace(' filter', '')}</span>`)].join('<i>→</i>') + '<i>→</i><span class="node">Result</span>' : `<span class="hint">${ui.icon('info', 'i-sm')} No stages are on — the result equals the original. Turn a stage on or pick a preset.</span>`;
      U.$('#stViewSub', r).textContent = `Channel ${st.channel} · last ${WIN} s · ${st.zeroPhase ? 'zero-phase' : 'causal (real-time)'} filtering`;
      U.$('#stBeforeWrap', r).hidden = st.overlay;
    },

    getChain() {
      const cfg = store.get('studio.chain'), key = JSON.stringify(cfg);
      if (key !== this.cfgKey) { this.chain = dsp.makeChain(cfg, engine.FS); this.cfgKey = key; }
      return this.chain;
    },

    /** Processes the newest window and caches arrays for drawing. */
    process() {
      const st = store.get('studio'), ci = engine.idxOf(st.channel), chain = this.getChain(), fs = engine.FS;
      const n = engine.copyLast('total', ci, (WIN + WARM) * fs, this.raw); engine.copyLast('clean', ci, (WIN + WARM) * fs, this.cln);
      const disp = Math.min(n, WIN * fs), start = n - disp, rawIn = this.raw.subarray(0, n);
      const zp = st.zeroPhase, y = chain.filter(rawIn, { zeroPhase: zp });
      this.yFilt = y.subarray(start); this.xRaw = this.raw.subarray(start, n);
      this.yOut = chain.normalize(Float32Array.from(this.yFilt));
      this.nOut = this.yOut.length; this.zp = zp; this.st = st;
      if (st.chain.norm.on) this.xNorm = chain.normalize(Float32Array.from(this.xRaw)); else this.xNorm = this.xRaw;
    },

    analyse() {
      if (!this.yFilt) this.process();
      const fs = engine.FS, chain = this.chain, st = this.st, n = this.xRaw.length + (0);
      const nTot = engine.copyLast('total', engine.idxOf(st.channel), (WIN + WARM) * fs, this.raw);
      const clean = this.cln.subarray(0, nTot), cleanF = chain.filter(clean, { zeroPhase: st.zeroPhase }).subarray(nTot - n);
      const xr = this.xRaw, yf = this.yFilt;
      const noiseB = new Float32Array(n), noiseA = new Float32Array(n), cb = clean.subarray(nTot - n);
      for (let i = 0; i < n; i++) { noiseB[i] = xr[i] - cb[i]; noiseA[i] = yf[i] - cleanF[i]; }
      const snrB = dsp.snrDb(cb, noiseB), snrA = dsp.snrDb(cleanF, noiseA);
      const $ = (q) => U.$(q, this.root), f1 = (v) => v.toFixed(1);
      $('#sRmsB').textContent = f1(dsp.rms(xr)); $('#sRmsA').textContent = st.chain.norm.on ? f1(dsp.rms(this.yOut)) : f1(dsp.rms(yf)); $('#sRmsN').textContent = st.chain.norm.on ? 'µV → normalised units' : 'µV, before → after';
      $('#sPpB').textContent = f1(dsp.peakToPeak(xr)); $('#sPpA').textContent = st.chain.norm.on ? f1(dsp.peakToPeak(this.yOut)) : f1(dsp.peakToPeak(yf));
      $('#sSnrB').textContent = f1(snrB); $('#sSnrA').textContent = f1(snrA);
      const d = snrA - snrB; $('#sSnrN').textContent = chain.active.length ? `dB · ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} dB change` : 'dB, before → after';
      $('#sSnrA').dataset.dir = d > 0.3 ? 'up' : d < -0.3 ? 'down' : 'flat';
      dsp.periodogram(xr, fs, 512, this.psdB); dsp.periodogram(yf, fs, 512, this.psdA);
      const df = fs / 512, bB = dsp.bandPowers(this.psdB, df), bA = dsp.bandPowers(this.psdA, df);
      $('#sDomB').textContent = dsp.BANDS[dsp.dominantBand(bB.rel)].name; $('#sDomA').textContent = dsp.BANDS[dsp.dominantBand(bA.rel)].name;
      this.drawSpec();
    },

    drawSpec() {
      const C = NG.theme.c, fs = engine.FS, chain = this.chain, f = [], m = [];
      for (let hz = 0; hz <= 100; hz += 0.5) { f.push(hz); m.push(chain.active.some((k) => k !== 'norm') ? chain.magnitude(Math.max(hz, 0.05), { zeroPhase: this.zp }) : 1); }
      this.spec.draw({ series: [{ psd: this.psdB, df: fs / 512, color: C.text3, label: 'before', width: 1.2 }, { psd: this.psdA, df: fs / 512, color: C.accent, label: 'after', width: 1.8, fill: true }], fmax: 100, scale: this.specScale, response: { f, m, color: C.amber }, markers: store.get('lab.line') > 5 ? [{ f: store.get('ui.mains'), label: store.get('ui.mains') + ' Hz' }] : [] });
    },

    frame(dt, ts) {
      const running = engine.running; if (!running && !this.dirty) return;
      this.acc += dt; if (this.acc < 1 / 30 && !this.dirty) return; this.acc = 0;
      this.process();
      const C = NG.theme.c, st = this.st, norm = st.chain.norm.on, fs = engine.FS, n = this.nOut;
      const sc = norm ? (st.chain.norm.method === 'minmax' ? 1.15 : 3.5) : store.get('lab.vscale'), unit = norm ? 'z' : 'uV';
      const common = { fs, windowSec: WIN, endIndex: engine.generated, originIndex: 0, showGrid: store.get('ui.grid'), glow: store.get('ui.glow'), lineWidth: store.get('ui.lineWidth'), paused: !running, ts, gutter: 62 };
      this.before.draw(Object.assign({ lanes: [{ label: 'Before', sub: st.channel, data: this.xRaw, n: this.xRaw.length, color: C.blue }], scale: store.get('lab.vscale'), watermark: 'SIMULATED' }, common));
      const lane = { label: 'After', sub: st.channel, data: this.yOut, n, color: C.accent };
      if (st.overlay) { lane.data2 = this.xNorm; lane.n2 = this.xNorm.length; lane.color2 = NG.theme.alpha(NG.viz.toHex(C.text3), 0.8); }
      this.after.draw(Object.assign({ lanes: [lane], scale: sc, unit, scaleLabel: norm ? (st.chain.norm.method === 'minmax' ? '±1 (min–max)' : '±3.5 σ (z-score)') : `±${sc} µV`, watermark: st.overlay ? 'SIMULATED · ORIGINAL BEHIND' : 'SIMULATED' }, common));
      this.statAcc += 1 / 30; if (this.statAcc >= 0.25 || this.dirty) { this.statAcc = 0; this.analyse(); }
      this.dirty = false;
    },

    show() {
      this.dirty = true; this.syncControls(); this.before.fit(); this.after.fit(); this.spec.fit();
      this.updateFreeze(); NG.loop.add('view-studio', (dt, ts) => this.frame(dt, ts));
      this.off = [engine.on('run', () => { this.updateFreeze(); this.dirty = true; })];
      addEventListener('resize', this.onResize);
    },
    hide() { NG.loop.remove('view-studio'); (this.off || []).forEach((f) => f && f()); removeEventListener('resize', this.onResize); },
    updateFreeze() { const b = U.$('#stFreeze', this.root), run = engine.running; b.innerHTML = `${ui.icon(run ? 'pause' : 'play')}<span>${run ? 'Freeze signal' : 'Resume signal'}</span>`; },
  };
})();
