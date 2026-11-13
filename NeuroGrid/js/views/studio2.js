/* NeuroGrid 3.0 — Processing Studio extensions: artifact simulator with ground truth, residual/distortion metrics,
 * band-power before/after, undo / redo / custom presets. Extends NG.views.studio. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, dsp = NG.dsp, art = NG.artifacts, V = NG.views.studio;
  const WIN = 6, WARM = 2, SEED = 4242;
  const A = { mode: 'live', cfg: art.defaults(), hist: [], idx: -1, applying: false, timer: 0 };
  const PKEY = 'neurogrid.v3.presets';
  const FIX = { blink: ['Low-pass 12 Hz', (c) => { c.lp.on = true; c.lp.fc = 12; c.lp.order = 4; }], emg: ['Low-pass 30 Hz + median 16 ms', (c) => { c.lp.on = true; c.lp.fc = 30; c.lp.order = 4; c.nr.on = true; c.nr.method = 'median'; c.nr.ms = 16; }], line: ['Notch at mains', (c) => { c.notch.on = true; c.notch.f0 = store.get('ui.mains'); c.notch.q = 30; }], drift: ['High-pass 1 Hz', (c) => { c.hp.on = true; c.hp.fc = 1; c.hp.order = 2; }], pop: ['High-pass 1 Hz (partial)', (c) => { c.hp.on = true; c.hp.fc = 1; c.hp.order = 2; }], noise: ['Low-pass 30 Hz', (c) => { c.lp.on = true; c.lp.fc = 30; c.lp.order = 4; }] };

  const baseRender = V.render.bind(V);
  V.render = function () {
    return baseRender().replace(/<\/div>\s*$/, `
      <section class="card st-art" data-reveal aria-labelledby="stArtT"><div class="card-head"><div><h2 class="card-title" id="stArtT">Artifact simulator <span class="badge badge-sim">Simulated</span></h2><p class="card-sub">Add known artifacts to the clean simulated EEG, then see how well each filter removes them — and what it damages.</p></div><div id="stArtSeg"></div></div>
        <div class="card-body stack"><div class="art-grid" id="stArt"></div>
          <div class="stats-grid" id="stArtStats"></div>
          <div class="callout callout-warn">${ui.icon('alert')}<div><strong>Removal is never free.</strong> Filters cannot tell brain activity from artifact — they only act on frequency. A filter that removes an eye blink also removes real slow brain activity; a low-pass that tames muscle noise also removes real beta/gamma. “Distortion” below measures exactly that damage on the known clean signal. No filter “separates all brain activity from noise”.</div></div></div></section>
      <section class="card st-hist" data-reveal aria-labelledby="stHistT"><div class="card-head"><div><h2 class="card-title" id="stHistT">Chain history &amp; presets</h2></div><div class="row wrap"><button class="btn btn-sm" id="stUndo" type="button">${ui.icon('chevron-left')}<span>Undo</span></button><button class="btn btn-sm" id="stRedo" type="button"><span>Redo</span>${ui.icon('chevron-right')}</button></div></div>
        <div class="card-body stack"><div class="row wrap"><input class="input" id="stPName" maxlength="40" placeholder="Name for current chain" aria-label="Custom preset name"><button class="btn btn-sm" id="stPSave" type="button">Save as preset</button></div><div class="preset-row" id="stMine" role="group" aria-label="Your presets"></div><p class="hint">Stage order is fixed (high-pass → low-pass → band-pass → notch → noise reduction → normalisation) so results stay comparable; enable, disable and tune any stage. Custom presets are stored in this browser.</p></div></section></div>`);
  };
  const baseInit = V.init.bind(V);
  V.init = function (root) {
    baseInit(root); const $ = (s) => U.$(s, root);
    ui.segmented($('#stArtSeg'), { label: 'Signal source', value: A.mode, options: [{ value: 'live', label: 'Live stream' }, { value: 'artifacts', label: 'Clean + artifacts' }], onChange: (v) => { A.mode = v; this.dirty = true; this.paintArt(); } });
    const g = $('#stArt'); this.artEls = {};
    art.KINDS.forEach((k) => {
      const sw = ui.switchField(k.name, A.cfg[k.id].on, k.desc, (v) => { A.cfg[k.id].on = v; if (v && A.mode !== 'artifacts') { A.mode = 'artifacts'; ui.toast('Switched to “Clean + artifacts” so the artifact is measured against a known clean signal.'); this.syncSeg(); } this.dirty = true; this.paintArt(); if (v && (k.id === 'blink' || k.id === 'emg') && !/^Fp/.test(store.get('studio.channel'))) ui.toast('Blinks and muscle activity are strongest on frontal channels. On ' + store.get('studio.channel') + ' they are heavily attenuated — choose Fp1 or Fp2 as the channel to see them clearly.', { type: 'info', ms: 6000 }); });
      const sl = ui.slider({ label: 'Amount (' + k.unit + ')', min: 1, max: k.max, step: 1, value: A.cfg[k.id].amp, fmt: (v) => v, onInput: (v) => { A.cfg[k.id].amp = v; this.dirty = true; } });
      const fix = U.h('button.btn.btn-sm.btn-ghost', { type: 'button' }, 'Try fix: ' + FIX[k.id][0]); fix.addEventListener('click', () => { const c = store.defaults('studio.chain'); FIX[k.id][1](c); store.set('studio.chain', c); Object.keys(c).forEach((x) => c[x].on && NG.progress.markStage(x)); if (A.mode !== 'artifacts' || !A.cfg[k.id].on) { A.cfg[k.id].on = true; A.mode = 'artifacts'; this.syncSeg(); const inp = this.artEls[k.id]; inp.sw.querySelector('input').checked = true; } ui.toast(`Applied: ${FIX[k.id][0]}. ${k.fix}`, { ms: 6500 }); this.dirty = true; this.paintArt(); });
      const box = U.h('div.art', sw, sl.el, fix); g.append(box); this.artEls[k.id] = { sw, sl };
    });
    $('#stUndo').addEventListener('click', () => this.step(-1)); $('#stRedo').addEventListener('click', () => this.step(1));
    $('#stPSave').addEventListener('click', () => { const n = $('#stPName').value.trim(); if (!n) { ui.toast('Name the preset first.', { type: 'warn' }); return; } const all = NG.storage.get(PKEY, []); if (all.some((p) => p.name === n)) { ui.toast('A preset with that name exists; choose another name (presets are never silently overwritten).', { type: 'warn' }); return; } all.push({ name: n, chain: JSON.parse(JSON.stringify(store.get('studio.chain'))) }); NG.storage.set(PKEY, all.slice(-12)); $('#stPName').value = ''; this.paintMine(); ui.toast('Preset saved.', { type: 'success' }); });
    A.hist = [JSON.stringify(store.get('studio.chain'))]; A.idx = 0;
    this.unsub2 = store.on('studio', () => { if (A.applying) return; clearTimeout(A.timer); A.timer = setTimeout(() => { const j = JSON.stringify(store.get('studio.chain')); if (j === A.hist[A.idx]) return; A.hist = A.hist.slice(0, A.idx + 1); A.hist.push(j); if (A.hist.length > 40) A.hist.shift(); A.idx = A.hist.length - 1; this.paintHist(); }, 350); });
    this.paintMine(); this.paintHist(); this.paintArt();
  };
  V.syncSeg = function () { const b = U.$$('#stArtSeg .seg-btn', this.root); b.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === A.mode))); };
  V.step = function (d) { const n = A.idx + d; if (n < 0 || n >= A.hist.length) return; A.idx = n; A.applying = true; store.set('studio.chain', JSON.parse(A.hist[n])); A.applying = false; this.dirty = true; this.paintHist(); ui.announce(d < 0 ? 'Undone' : 'Redone'); };
  V.paintHist = function () { U.$('#stUndo', this.root).disabled = A.idx <= 0; U.$('#stRedo', this.root).disabled = A.idx >= A.hist.length - 1; };
  V.paintMine = function () {
    const box = U.$('#stMine', this.root), all = NG.storage.get(PKEY, []); box.innerHTML = all.length ? '' : '<span class="hint">No custom presets yet.</span>';
    all.forEach((p, i) => { const b = U.h('button.preset', { type: 'button' }, U.h('b', p.name), U.h('small', 'click to apply · right-click to delete')); b.addEventListener('click', () => { store.set('studio.chain', JSON.parse(JSON.stringify(p.chain))); ui.toast('Preset applied: ' + p.name); }); b.addEventListener('contextmenu', async (e) => { e.preventDefault(); if (await ui.modal.confirm({ title: 'Delete preset?', message: `“${p.name}” will be removed.`, confirmText: 'Delete', danger: true })) { const a = NG.storage.get(PKEY, []); a.splice(i, 1); NG.storage.set(PKEY, a); this.paintMine(); } }); box.append(b); });
  };
  V.paintArt = function () { U.$$('.art', this.root).forEach((e, i) => e.classList.toggle('on', A.cfg[art.KINDS[i].id].on)); U.$('#stArtStats', this.root).hidden = A.mode !== 'artifacts'; };

  /* ---- replace process(): optionally inject artifacts into the clean signal ---- */
  V.process = function () {
    const st = store.get('studio'), ci = engine.idxOf(st.channel), chain = this.getChain(), fs = engine.FS, N = (WIN + WARM) * fs;
    const n = engine.copyLast('total', ci, N, this.raw); engine.copyLast('clean', ci, N, this.cln);
    this.artOn = A.mode === 'artifacts'; this.artSum = null;
    if (this.artOn) {
      const a = new Float32Array(n); art.render(A.cfg, engine.generated - n, n, fs, SEED, a, { mains: store.get('ui.mains') });
      const gain = (k) => (art.channelGain[k] && art.channelGain[k][st.channel] != null ? art.channelGain[k][st.channel] : 1);
      // per-channel gain: blink/EMG depend on electrode position; apply by re-rendering each kind
      const sum = new Float32Array(n); for (const k of art.KINDS) { if (!A.cfg[k.id].on) continue; const one = {}; one[k.id] = A.cfg[k.id]; const t = art.render(one, engine.generated - n, n, fs, SEED, null, { mains: store.get('ui.mains') }), g = gain(k.id); for (let i = 0; i < n; i++) sum[i] += t[i] * g; }
      for (let i = 0; i < n; i++) this.raw[i] = this.cln[i] + sum[i]; this.artSum = sum;
    }
    const disp = Math.min(n, WIN * fs), start = n - disp, rawIn = this.raw.subarray(0, n), zp = st.zeroPhase, y = chain.filter(rawIn, { zeroPhase: zp });
    this.yFilt = y.subarray(start); this.xRaw = this.raw.subarray(start, n); this.yOut = chain.normalize(Float32Array.from(this.yFilt)); this.nOut = this.yOut.length; this.zp = zp; this.st = st;
    this.xNorm = st.chain.norm.on ? chain.normalize(Float32Array.from(this.xRaw)) : this.xRaw;
  };
  const baseAnalyse = V.analyse.bind(V);
  V.analyse = function () {
    baseAnalyse(); const box = U.$('#stArtStats', this.root); if (!box || !this.artOn || !this.artSum) return;
    const fs = engine.FS, chain = this.chain, st = this.st, n = this.xRaw.length, nTot = this.raw.length, off = Math.min(nTot, (WIN + WARM) * fs);
    const clean = this.cln.subarray(0, off), cleanF = chain.filter(clean, { zeroPhase: st.zeroPhase }).subarray(off - n), cb = clean.subarray(off - n), art0 = this.artSum.subarray(this.artSum.length - n), yf = this.yFilt;
    let eRes = 0, eDis = 0, eArt = 0, eCl = 0; const skip = Math.round(0.5 * fs);
    for (let i = skip; i < n; i++) { const res = yf[i] - cleanF[i], dis = cleanF[i] - cb[i]; eRes += res * res; eDis += dis * dis; eArt += art0[i] * art0[i]; eCl += cb[i] * cb[i]; }
    const m = n - skip, rms = (e) => Math.sqrt(e / m), cl = rms(eCl) || 1;
    const k = (a, b, c) => `<div class="stat"><div class="stat-k">${a}</div><div class="stat-v stat-v-sm">${b}</div><div class="stat-n">${c}</div></div>`, dirs = !chain.active.length;
    box.innerHTML = k('Artifact power added', rms(eArt).toFixed(1) + ' µV RMS', 'known: the simulator injected it') + k('Artifact left after processing', dirs ? rms(eArt).toFixed(1) + ' µV RMS' : rms(eRes).toFixed(1) + ' µV RMS', dirs ? 'no stages active' : `${((rms(eRes) / (rms(eArt) || 1)) * 100).toFixed(0)}% of the original artifact`) + k('Damage to clean signal', dirs ? '0%' : ((rms(eDis) / cl) * 100).toFixed(1) + '%', st.zeroPhase ? 'RMS of (filtered clean − clean) ÷ clean RMS' : 'causal filters also add a delay, which counts here as distortion');
  };
  /* mark source in watermark & subtitle */
  const baseSync = V.syncControls.bind(V);
  V.syncControls = function () { baseSync(); if (this.root && A.mode === 'artifacts') { const s = U.$('#stViewSub', this.root); if (s) s.textContent += ' · clean EEG + injected artifacts'; } };
})();
