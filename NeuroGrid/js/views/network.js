/* NeuroGrid — Neural Network visualizer. Draws a REAL small network (6→8→6→3, tanh + softmax)
 * that can be trained in the browser on NeuroGrid's own simulated signals. Before training the
 * weights are random and the view says so. It has never seen a real brain signal. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, dsp = NG.dsp, sim = NG.sim, ml = NG.ml;
  NG.views = NG.views || {};
  const SIZES = [6, 8, 6, 3];
  const LAYER = [
    { name: 'Input layer', short: 'Input · 6 features', body: 'Six numbers extracted from a 4-second window of the signal: the <b>relative power</b> in delta, theta, alpha, beta and gamma, plus the <b>spectral centroid</b> (the signal’s “average frequency”). Turning raw samples into features like these is called <i>feature extraction</i>.' },
    { name: 'Hidden layer 1', short: 'Hidden 1 · 8 neurons', body: 'Each neuron computes a <b>weighted sum</b> of all six inputs plus a bias, then squashes it with <code>tanh</code> into −1 … +1. Early hidden neurons often learn simple combinations such as “alpha high and beta low”.' },
    { name: 'Hidden layer 2', short: 'Hidden 2 · 6 neurons', body: 'The same idea again, but now the inputs are the first layer’s neurons. Stacking layers lets the network combine simple patterns into more abstract ones.' },
    { name: 'Output layer', short: 'Output · 3 classes', body: 'One neuron per class — Relaxed, Focused, Drowsy. <b>Softmax</b> converts their raw scores into probabilities that add up to 100 %. The largest probability is the network’s answer, and its size is the network’s confidence.' },
  ];
  const DEMO_PROFILES = [['relaxed', 'Relaxed (alpha-rich)'], ['calm', 'Calm focus'], ['active', 'Active thinking'], ['deep', 'Deep concentration'], ['drowsy', 'Drowsy (theta/delta)'], ['noisy', 'Noisy environment (never trained!)']];
  const EXPECT = { relaxed: 0, calm: 0, active: 1, deep: 1, drowsy: 2 };
  const STAGE_T = 0.85;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  NG.views.network = {
    id: 'network', title: 'Neural Network', icon: 'network',
    render() {
      return `
      ${ui.pageHead('04 · Neural Network', 'See how a <em>classifier</em> thinks', 'A small but real neural network you can train right here, then watch simulated data flow through it. It learns only from NeuroGrid’s synthetic signals — it has never seen a real brain.',
        `<button class="btn" id="nnReset" type="button">${ui.icon('refresh')}<span>Reset network</span></button><button class="btn btn-primary" id="nnTrain" type="button">${ui.icon('zap')}<span>Train network</span></button>`)}
      <div class="tabs" id="nnTabs" role="tablist" aria-label="Neural network sections"><button class="tab" role="tab" data-tab="diagram" aria-selected="true">${ui.icon('network')}Network &amp; inspector</button><button class="tab" role="tab" data-tab="lab" aria-selected="false">${ui.icon('flask')}Training lab</button></div>
      <div id="nnPanels"><div data-panel="diagram">
      <div class="net-layout">
        <section class="card net-card" data-reveal aria-labelledby="nnT">
          <div class="card-head"><div><h2 class="card-title" id="nnT">Network diagram <span class="badge" id="nnState">Untrained · random weights</span></h2><p class="card-sub">Click any neuron or layer to inspect it. Line brightness shows weight size; cyan is positive, amber is negative.</p></div></div>
          <div class="canvas-wrap net-wrap"><canvas id="nnCanvas" role="img" aria-label="Neural network diagram with input, two hidden layers and output layer"></canvas></div>
          <div class="net-controls">
            <div class="field-inline"><label class="label" for="nnProfile">Simulated input</label><select class="select select-sm" id="nnProfile"></select></div>
            <button class="btn btn-primary" id="nnRun" type="button">${ui.icon('play')}<span>Run demonstration</span></button>
          </div>
        </section>
        <section class="card net-explain" data-reveal aria-labelledby="nnExT"><div class="card-head"><div><h2 class="card-title" id="nnExT">Inspector</h2><p class="card-sub" id="nnExSub">Layers</p></div></div><div class="card-body" id="nnInspector" aria-live="polite"></div></section>
        <section class="card net-result" data-reveal aria-labelledby="nnResT"><div class="card-head"><div><h2 class="card-title" id="nnResT">Demonstration result</h2><p class="card-sub">Features in, probabilities out</p></div></div><div class="card-body" id="nnResult"><div class="empty"><strong>No demonstration yet</strong><span>Pick a simulated signal and press “Run demonstration”.</span></div></div></section>
        <section class="card net-train" data-reveal aria-labelledby="nnTrT"><div class="card-head"><div><h2 class="card-title" id="nnTrT">Training</h2><p class="card-sub" id="nnTrSub">Press “Train network” to generate a simulated dataset and run backpropagation.</p></div></div>
          <div class="card-body stack"><div class="bar" id="nnProg" hidden><i></i></div><div class="canvas-wrap loss-wrap"><canvas id="nnLoss" role="img" aria-label="Training loss and accuracy per epoch"></canvas></div>
            <div class="train-stats" id="nnTrStats"></div><div id="nnConf"></div>
            <p class="hint">${ui.icon('info', 'i-sm')} Training uses 180 simulated windows (60 per class) and tests on 75 different ones. Backpropagation nudges every weight to reduce cross-entropy loss, epoch after epoch. Scores apply to NeuroGrid’s simulator only.</p></div></section>
      </div></div><div data-panel="lab" hidden>${NG.mllab.render()}</div></div>`;
    },

    init(root) {
      const $ = (s) => U.$(s, root);
      NG.mllab.init(root); this.tabs = ui.tabs($('#nnTabs'), $('#nnPanels'), (id) => { this.tab = id; if (id === 'lab') requestAnimationFrame(() => NG.mllab.onShow()); else requestAnimationFrame(() => { this.fit(); this.drawLoss(); }); });
      this.root = root; this.net = new ml.MLP(SIZES, 7); this.trained = false; this.busy = false; this.sel = null; this.hover = null; this.demo = null; this.parts = []; this.hist = { loss: [], tr: [], va: [] }; this.val = null; this.ambient = 0;
      this.cv = $('#nnCanvas'); this.ctx = this.cv.getContext('2d'); this.lossCv = $('#nnLoss'); this.lossCtx = this.lossCv.getContext('2d');
      this.ro = new ResizeObserver(() => { this.fit(); this.drawLoss(); }); this.ro.observe(this.cv); this.ro.observe(this.lossCv); this.fit();
      DEMO_PROFILES.forEach(([id, name]) => $('#nnProfile').append(U.h('option', { value: id }, name)));
      $('#nnRun').addEventListener('click', () => this.runDemo());
      $('#nnTrain').addEventListener('click', () => this.train());
      $('#nnReset').addEventListener('click', () => this.resetNet());
      const pos = (e) => { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this.cv.addEventListener('pointermove', (e) => { this.hover = this.hit(pos(e)); this.cv.style.cursor = this.hover || this.hitLayer(pos(e)) !== null ? 'pointer' : 'default'; });
      this.cv.addEventListener('pointerleave', () => { this.hover = null; });
      this.cv.addEventListener('click', (e) => { const p = pos(e), n = this.hit(p); if (n) this.select(n); else { const l = this.hitLayer(p); if (l !== null) this.select({ l, i: -1 }); else this.select(null); } });
      this.cv.tabIndex = 0;
      this.cv.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.select(null); });
      this.renderInspector(); this.renderTrainStats();
      this.onTheme = NG.theme.on('change', () => this.drawLoss());
    },

    fit() { const f = U.fitCanvas(this.cv); this.w = f.w; this.h = f.h; this.dpr = f.dpr; const g = U.fitCanvas(this.lossCv); this.lw = g.w; this.lh = g.h; this.ldpr = g.dpr; this.layout(); },
    layout() {
      const { w, h } = this, padX = w > 560 ? 100 : 30, top = 34, bot = 22; this.pos = [];
      SIZES.forEach((n, l) => { const x = padX + ((w - padX * 2) * l) / (SIZES.length - 1), span = h - top - bot, gap = Math.min(46, span / n), y0 = top + span / 2 - (gap * (n - 1)) / 2; this.pos.push(Array.from({ length: n }, (_, i) => ({ x, y: y0 + gap * i }))); });
    },
    hit(p) { let best = null, bd = 18 * 18; this.pos.forEach((col, l) => col.forEach((n, i) => { const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2; if (d < bd) { bd = d; best = { l, i }; } })); return best; },
    hitLayer(p) { if (p.y > 28) return null; let best = null, bd = 60; this.pos.forEach((col, l) => { const d = Math.abs(col[0].x - p.x); if (d < bd) { bd = d; best = l; } }); return best; },

    select(n) { this.sel = n; this.renderInspector(); },

    renderInspector() {
      const box = U.$('#nnInspector', this.root), sub = U.$('#nnExSub', this.root), n = this.sel, net = this.net;
      if (!n) {
        sub.textContent = 'Layers — select one';
        box.innerHTML = `<div class="layer-list">${LAYER.map((L, l) => `<button class="layer-item" type="button" data-l="${l}"><span class="layer-n">${l + 1}</span><span><b>${L.name}</b><small>${L.short}</small></span>${ui.icon('chevron-right')}</button>`).join('')}</div><p class="hint">Data flows left to right. Every line is a learned weight; every circle is a neuron.</p>`;
        U.$$('.layer-item', box).forEach((b) => b.addEventListener('click', () => this.select({ l: +b.dataset.l, i: -1 })));
        return;
      }
      const L = LAYER[n.l]; let extra = '';
      if (n.i >= 0) {
        const lab = n.l === 0 ? ml.FEATURE_NAMES[n.i] : n.l === 3 ? ml.CLASSES[n.i].name : `Neuron ${n.i + 1}`; sub.textContent = `${L.name} · ${lab}`;
        const act = this.demo ? this.demo.acts[n.l][n.i] : null;
        if (n.l === 0) extra = `<dl class="kv"><div><dt>Feature</dt><dd>${ml.FEATURE_HINTS[n.i]}</dd></div><div><dt>Value (last demo)</dt><dd>${act === null ? '—' : act.toFixed(3)}</dd></div></dl>`;
        else {
          const w = net.W[n.l - 1][n.i], names = n.l === 1 ? ml.FEATURE_NAMES : Array.from({ length: SIZES[n.l - 1] }, (_, k) => `H${n.l - 1}.${k + 1}`);
          const top = Array.from(w, (v, k) => ({ v, k })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
          extra = `<dl class="kv"><div><dt>Bias</dt><dd>${net.b[n.l - 1][n.i].toFixed(3)}</dd></div><div><dt>${n.l === 3 ? 'Probability' : 'Activation'} (last demo)</dt><dd>${act === null ? '—' : n.l === 3 ? (act * 100).toFixed(1) + ' %' : act.toFixed(3)}</dd></div><div><dt>Strongest inputs</dt><dd>${top.map((t) => `${names[t.k]} ${t.v >= 0 ? '+' : '−'}${Math.abs(t.v).toFixed(2)}`).join('<br>')}</dd></div></dl>`;
        }
      } else sub.textContent = L.name;
      box.innerHTML = `<p>${L.body}</p>${extra}<div class="row wrap"><button class="btn btn-sm btn-ghost" id="nnBack" type="button">${ui.icon('chevron-left')}<span>All layers</span></button>${n.l < 3 ? `<button class="btn btn-sm btn-ghost" id="nnNext" type="button"><span>Next layer</span>${ui.icon('chevron-right')}</button>` : ''}</div>`;
      U.$('#nnBack', box).addEventListener('click', () => this.select(null));
      const nx = U.$('#nnNext', box); if (nx) nx.addEventListener('click', () => this.select({ l: n.l + 1, i: -1 }));
    },

    /* ---------- demonstration ---------- */
    runDemo() {
      if (this.busy) return;
      const id = U.$('#nnProfile', this.root).value, seg = sim.makeSegment(id, { seconds: 4, warmup: 1, channel: U.pick(['C3', 'C4']), noise: 0.12, drift: 0.1, line: 0.03, seed: Math.floor(Math.random() * 1e9) });
      const x = dsp.features(seg.samples, seg.fs), { a, probs } = this.net.forward(x), acts = a.map((v) => Array.from(v));
      this.demo = { id, t: 0, acts, probs: Array.from(probs), done: false, spawned: new Set(), samples: seg.samples };
      this.parts.length = 0; this.renderResult(false); this.renderInspector();
      ui.announce('Demonstration started. Data is flowing through the network.');
    },
    renderResult(done) {
      const d = this.demo, box = U.$('#nnResult', this.root); if (!d) return;
      const feats = d.acts[0], pred = d.probs.indexOf(Math.max(...d.probs)), exp = EXPECT[d.id];
      const verdict = done ? (exp === undefined ? `<div class="callout callout-warn">${ui.icon('alert')}<div><strong>Out of distribution.</strong> The network only knows three classes, so it must pick one even for a noisy signal it never saw. Real classifiers share this weakness.</div></div>` : pred === exp ? `<div class="callout">${ui.icon('check')}<div>Prediction matches the profile that generated the signal.</div></div>` : `<div class="callout callout-warn">${ui.icon('alert')}<div>Prediction <b>differs</b> from the generating profile (${ml.CLASSES[exp].name}). Classifiers make mistakes — especially with few training windows or noisy input.</div></div>`) : '';
      box.innerHTML = `<div class="res-grid"><div><span class="label">Input features</span><div class="feat-list">${Array.from(feats, (v, i) => `<div class="feat"><span>${ml.FEATURE_NAMES[i]}</span><div class="bar"><i style="width:${Math.min(100, v * 100)}%"></i></div><span class="mono tnum">${v.toFixed(2)}</span></div>`).join('')}</div></div>
        <div><span class="label">Output probabilities</span><div class="feat-list" id="nnOut">${ml.CLASSES.map((c, i) => `<div class="feat ${done && i === pred ? 'win' : ''}"><span>${c.name}</span><div class="bar"><i style="width:${done ? d.probs[i] * 100 : 0}%"></i></div><span class="mono tnum">${done ? (d.probs[i] * 100).toFixed(0) + '%' : '…'}</span></div>`).join('')}</div>
        ${done ? `<p class="pred">Prediction: <b>${ml.CLASSES[pred].name}</b> <span class="muted">(confidence ${(d.probs[pred] * 100).toFixed(0)}%)</span></p>` : '<p class="hint">Computing…</p>'}${!this.trained ? `<p class="hint">${ui.icon('alert', 'i-sm')} This network is <b>untrained</b> — its answer is essentially arbitrary. Train it and run again.</p>` : ''}</div></div>${verdict}`;
      if (done) requestAnimationFrame(() => U.$$('#nnOut .bar i', box).forEach((b, i) => { b.style.width = d.probs[i] * 100 + '%'; }));
    },

    /* ---------- training ---------- */
    async train() {
      if (this.busy) return; this.busy = true; const $ = (s) => U.$(s, this.root), btn = $('#nnTrain'), prog = $('#nnProg'), sub = $('#nnTrSub');
      btn.disabled = true; $('#nnRun').disabled = true; $('#nnReset').disabled = true; prog.hidden = false; this.net.init(); this.trained = false; this.hist = { loss: [], tr: [], va: [] }; this.demo = null; this.parts.length = 0;
      this.setState('Training…'); this.renderInspector();
      try {
        const rng = sim.mulberry32(Math.floor(Math.random() * 1e9)), opts = { noiseMin: 0.05, noiseMax: 0.35 }, TR = 60, VA = 25, total = (TR + VA) * 3, X = [], Y = [], VX = [], VY = [];
        sub.textContent = 'Generating simulated windows…'; let made = 0;
        for (let k = 0; k < TR + VA; k++) {
          for (let c = 0; c < 3; c++) { const s = ml.makeSample(c, rng, opts); if (k < TR) { X.push(s.x); Y.push(s.y); } else { VX.push(s.x); VY.push(s.y); } made++; }
          if (k % 8 === 7) { prog.firstElementChild.style.width = (made / total) * 30 + '%'; await nextFrame(); }
        }
        const EPOCHS = 100, per = NG.motion.level ? 2 : 10;
        for (let e = 0; e < EPOCHS; e += per) {
          for (let k = 0; k < per; k++) { const loss = this.net.trainEpoch(X, Y, 0.2, 24); this.hist.loss.push(loss); const tr = this.net.evaluate(X, Y), va = this.net.evaluate(VX, VY); this.hist.tr.push(tr.acc); this.hist.va.push(va.acc); }
          prog.firstElementChild.style.width = 30 + ((e + per) / EPOCHS) * 70 + '%'; sub.textContent = `Epoch ${this.hist.loss.length} of ${EPOCHS}`; this.drawLoss(); this.renderTrainStats(); await nextFrame();
        }
        this.val = { X: VX, Y: VY, conf: this.confusion(VX, VY), n: VX.length }; this.trained = true;
        const fin = this.net.evaluate(VX, VY); this.setState(`Trained · ${Math.round(fin.acc * 100)}% held-out accuracy`, true);
        sub.textContent = `Finished ${EPOCHS} epochs on simulated data.`; ui.toast(`Network trained — ${Math.round(fin.acc * 100)}% accuracy on unseen simulated windows.`, { type: 'success' });
      } catch (err) { console.error('[NeuroGrid] training failed', err); ui.toast('Training failed — see the console for details.', { type: 'warn' }); this.setState('Untrained · random weights'); }
      finally { this.busy = false; btn.disabled = false; $('#nnRun').disabled = false; $('#nnReset').disabled = false; setTimeout(() => { prog.hidden = true; }, 500); this.renderTrainStats(); this.drawLoss(); }
    },
    confusion(X, Y) { const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; X.forEach((x, i) => { m[Y[i]][this.net.predict(x)]++; }); return m; },
    resetNet() { if (this.busy) return; this.net.init(); this.trained = false; this.hist = { loss: [], tr: [], va: [] }; this.val = null; this.demo = null; this.parts.length = 0; this.setState('Untrained · random weights'); U.$('#nnResult', this.root).innerHTML = '<div class="empty"><strong>No demonstration yet</strong><span>Pick a simulated signal and press “Run demonstration”.</span></div>'; U.$('#nnTrSub', this.root).textContent = 'Press “Train network” to generate a simulated dataset and run backpropagation.'; this.renderTrainStats(); this.drawLoss(); this.renderInspector(); ui.toast('Network reset to new random weights.'); },
    setState(t, ok) { const b = U.$('#nnState', this.root); b.textContent = t; b.className = 'badge' + (ok ? ' badge-ok' : ''); },
    renderTrainStats() {
      const h = this.hist, n = h.loss.length, box = U.$('#nnTrStats', this.root);
      box.innerHTML = n ? `<div class="stat"><div class="stat-k">Epochs</div><div class="stat-v">${n}</div></div><div class="stat"><div class="stat-k">Training loss</div><div class="stat-v">${h.loss[n - 1].toFixed(3)}</div></div><div class="stat"><div class="stat-k">Train accuracy</div><div class="stat-v">${Math.round(h.tr[n - 1] * 100)}%</div></div><div class="stat"><div class="stat-k">Held-out accuracy</div><div class="stat-v">${Math.round(h.va[n - 1] * 100)}%</div></div>` : '<div class="empty"><strong>Not trained yet</strong><span>The loss curve appears here while training.</span></div>';
      const cf = U.$('#nnConf', this.root);
      if (this.val && this.trained) { const m = this.val.conf; cf.innerHTML = `<span class="label">Confusion matrix on held-out windows</span><table class="conf"><caption class="sr-only">Rows are true classes, columns are predicted classes</caption><thead><tr><th></th>${ml.CLASSES.map((c) => `<th scope="col">pred. ${c.name}</th>`).join('')}</tr></thead><tbody>${m.map((row, i) => `<tr><th scope="row">true ${ml.CLASSES[i].name}</th>${row.map((v, j) => `<td class="${i === j ? 'diag' : v ? 'off' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`; } else cf.innerHTML = '';
    },
    drawLoss() {
      const ctx = this.lossCtx, w = this.lw, h = this.lh, C = NG.theme.c, hs = this.hist; if (!w) return;
      ctx.setTransform(this.ldpr, 0, 0, this.ldpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const x0 = 38, x1 = w - 12, t = 10, b = h - 22; ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.strokeStyle = C.grid; ctx.fillStyle = C.text3; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = Math.round(t + ((b - t) * i) / 4) + 0.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText((1 - i / 4).toFixed(2), x0 - 5, y + 3); }
      ctx.textAlign = 'center'; ctx.fillText('epochs →', (x0 + x1) / 2, h - 6);
      if (!hs.loss.length) { ctx.fillStyle = C.text3; ctx.fillText('loss and accuracy will be drawn here', (x0 + x1) / 2, (t + b) / 2); return; }
      const N = Math.max(100, hs.loss.length), X = (i) => x0 + (i / (N - 1)) * (x1 - x0), Y = (v) => b - Math.min(1, Math.max(0, v)) * (b - t);
      const line = (arr, col, scale) => { ctx.beginPath(); arr.forEach((v, i) => { const y = Y(scale ? v / scale : v); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke(); };
      line(hs.loss, C.amber, Math.max(1.2, hs.loss[0])); line(hs.tr, C.text3); line(hs.va, C.accent);
      ctx.textAlign = 'left'; [['loss (scaled)', C.amber], ['train acc.', C.text3], ['held-out acc.', C.accent]].forEach(([l, c], i) => { ctx.fillStyle = c; ctx.fillText('● ' + l, x0 + 8 + i * 104, t + 10); });
    },

    /* ---------- drawing ---------- */
    frame(dt, ts) {
      const ctx = this.ctx, C = NG.theme.c, { w, h } = this, net = this.net, sel = this.sel, d = this.demo, lvl = NG.motion.level;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (d) { d.t += dt; const stage = Math.floor(d.t / STAGE_T); for (let s = 0; s <= Math.min(2, stage); s++) if (!d.spawned.has(s)) { d.spawned.add(s); this.spawn(s); } if (!d.done && d.t > STAGE_T * 3 + 0.6) { d.done = true; this.renderResult(true); if (this.sel) this.renderInspector(); } }
      // ambient particles
      this.ambient += dt; if (lvl >= 2 && this.ambient > 0.12 && this.parts.length < 90 && !d) { this.ambient = 0; const l = Math.floor(Math.random() * 3), i = Math.floor(Math.random() * SIZES[l]), j = Math.floor(Math.random() * SIZES[l + 1]); this.parts.push({ l, i, j, t: 0, sp: 0.5 + Math.random() * 0.4, a: 0.35 }); }
      // connections
      let maxW = 1e-6; net.W.forEach((L) => L.forEach((r) => r.forEach((v) => { if (Math.abs(v) > maxW) maxW = Math.abs(v); })));
      for (let l = 0; l < 3; l++) for (let j = 0; j < SIZES[l + 1]; j++) for (let i = 0; i < SIZES[l]; i++) {
        const wv = net.W[l][j][i], mag = Math.abs(wv) / maxW, A = this.pos[l][i], B = this.pos[l + 1][j];
        const on = sel && ((sel.l === l && sel.i === i) || (sel.l === l + 1 && sel.i === j) || (sel.i < 0 && (sel.l === l || sel.l === l + 1)));
        const dim = sel && !on ? 0.35 : 1; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = wv >= 0 ? `rgba(${C.accentRgb},${(0.05 + mag * 0.5) * dim * (on ? 1.6 : 1)})` : NG.theme.alpha(NG.viz.toHex(C.amber), (0.05 + mag * 0.45) * dim * (on ? 1.6 : 1)); ctx.lineWidth = 0.6 + mag * 1.6 + (on ? 0.6 : 0); ctx.stroke();
      }
      // particles
      for (let k = this.parts.length - 1; k >= 0; k--) {
        const p = this.parts[k]; p.t += dt * p.sp / (p.demo ? 0.8 : 1.2) * (p.demo ? 1 : 0.9); if (p.t >= 1) { this.parts.splice(k, 1); continue; } if (p.t < 0) continue;
        const A = this.pos[p.l][p.i], B = this.pos[p.l + 1][p.j], e = p.t * p.t * (3 - 2 * p.t), x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e;
        ctx.globalAlpha = (p.a || 0.9) * Math.sin(p.t * Math.PI); ctx.fillStyle = p.neg ? C.amber : C.accent; ctx.beginPath(); ctx.arc(x, y, p.demo ? 2.6 : 1.8, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // nodes
      this.pos.forEach((col, l) => col.forEach((n, i) => {
        let act = 0, signed = 1;
        if (d) { const reveal = Math.max(0, Math.min(1, (d.t - l * STAGE_T) / 0.45)); const v = d.acts[l][i]; act = Math.min(1, Math.abs(v)) * reveal; signed = v >= 0 ? 1 : -1; }
        const isSel = sel && sel.l === l && sel.i === i, isHover = this.hover && this.hover.l === l && this.hover.i === i, r = 11 + (isSel || isHover ? 2 : 0) + act * 2.5;
        if (act > 0.1) { const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2.8); const col = signed > 0 ? C.accentRgb : '244,192,106'; g.addColorStop(0, `rgba(${col},${0.5 * act})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.8, 0, 6.283); ctx.fill(); }
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.283); ctx.fillStyle = C.surface; ctx.fill();
        ctx.fillStyle = act > 0 ? `rgba(${signed > 0 ? C.accentRgb : '244,192,106'},${0.15 + act * 0.7})` : 'transparent'; ctx.fill();
        ctx.lineWidth = isSel ? 2.4 : 1.4; ctx.strokeStyle = isSel || isHover ? C.accent : C.line2; ctx.stroke();
      }));
      // labels
      ctx.font = '500 10.5px "DM Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      this.pos.forEach((col, l) => { const on = sel && sel.l === l && sel.i < 0; ctx.fillStyle = on ? C.accentInk : C.text3; const parts = LAYER[l].short.toUpperCase().split(' · '), txt = parts[0] + (w > 700 ? ' · ' + parts[1] : ''), tw = ctx.measureText(txt).width; ctx.fillText(txt, Math.min(w - tw / 2 - 4, Math.max(tw / 2 + 4, col[0].x)), 18); });
      ctx.textAlign = 'right'; this.pos[0].forEach((n, i) => { if (w > 560) { ctx.fillStyle = C.text3; ctx.fillText(ml.FEATURE_NAMES[i], n.x - 18, n.y + 3.5); } });
      ctx.textAlign = 'left'; this.pos[3].forEach((n, i) => { if (w > 560) { ctx.fillStyle = d && d.done && d.probs[i] === Math.max(...d.probs) ? C.accentInk : C.text3; ctx.fillText(ml.CLASSES[i].name + (d && d.done ? ' ' + Math.round(d.probs[i] * 100) + '%' : ''), n.x + 18, n.y + 3.5); } });
    },
    spawn(s) {
      const d = this.demo, a = d.acts[s], A = this.net.W[s];
      for (let i = 0; i < SIZES[s]; i++) for (let j = 0; j < SIZES[s + 1]; j++) { const flow = Math.abs(a[i]) * Math.abs(A[j][i]); if (flow > 0.04 || Math.random() < 0.15) { const n = Math.min(3, 1 + Math.floor(flow * 3)); for (let k = 0; k < n; k++) this.parts.push({ l: s, i, j, t: -k * 0.18 - Math.random() * 0.12, sp: 1, demo: true, a: 0.95, neg: A[j][i] * a[i] < 0 }); } }
      if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
    },

    show() { this.fit(); this.drawLoss(); NG.loop.add('view-network', (dt, ts) => this.frame(dt, ts)); },
    hide() { NG.loop.remove('view-network'); },
  };
})();
