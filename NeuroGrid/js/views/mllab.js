/* NeuroGrid — Training Lab (part of the Neural Network section): configurable MLP, leak-free evaluation, learning curves, model comparison.
 * Trains in a Web Worker when available. All data is SIMULATED. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, kit = NG.evalkit;
  const CFG = { hidden: '8,6', lr: 0.1, batch: 16, epochs: 80, seed: 7, val: 15, test: 20, grouped: true, balance: 'none', perClass: 60, features: kit.DEFAULT_FEATURES.slice(), channels: ['C3', 'C4'], noiseMax: 35 };
  const lab = (NG.mllab = { runs: [], current: null, job: null });

  lab.render = () => `<div class="ml-layout">
    <section class="card" aria-labelledby="mlCT"><div class="card-head"><div><h2 class="card-title" id="mlCT">Configuration</h2><p class="card-sub">Everything is reproducible from the seed.</p></div></div><div class="card-body stack" id="mlCfg"></div></section>
    <section class="card" aria-labelledby="mlPT"><div class="card-head"><div><h2 class="card-title" id="mlPT">Training <span class="badge badge-sim">Simulated data</span></h2><p class="card-sub" id="mlSub">Not trained yet.</p></div><div class="row"><button class="btn" id="mlCancel" type="button" hidden>Cancel</button><button class="btn btn-primary" id="mlTrain" type="button">${ui.icon('zap')}<span>Train model</span></button></div></div>
      <div class="card-body stack"><div class="bar" id="mlBar" hidden><i></i></div><div class="ml-charts"><div class="canvas-wrap ml-ch"><canvas id="mlLoss" role="img" aria-label="Training and validation loss per epoch"></canvas></div><div class="canvas-wrap ml-ch"><canvas id="mlAcc" role="img" aria-label="Training and validation accuracy per epoch"></canvas></div></div>
      <p class="hint" id="mlMode"></p></div></section>
    <section class="card" aria-labelledby="mlRT"><div class="card-head"><div><h2 class="card-title" id="mlRT">Evaluation</h2><p class="card-sub">Train, validation and test are separated <em>before</em> fitting; the feature scaler is fitted on training rows only.</p></div></div><div class="card-body stack" id="mlRes"><div class="empty"><strong>No results yet</strong><span>Train a model to see accuracy, precision, recall, F1 and the confusion matrix. Nothing is pre-filled.</span></div></div></section>
    <section class="card" aria-labelledby="mlKT"><div class="card-head"><div><h2 class="card-title" id="mlKT">Model comparison</h2><p class="card-sub">Add runs to compare architectures and settings side by side.</p></div></div><div class="card-body stack" id="mlCmp"></div></section>
  </div>`;

  lab.init = (root) => {
    lab.root = root; const $ = (s) => U.$(s, root), c = $('#mlCfg');
    const num = (id, label, key, min, max, step, hint) => { const s = ui.slider({ label, min, max, step, value: CFG[key], hint, fmt: (v) => (key === 'lr' ? v.toFixed(2) : v), onInput: (v) => { CFG[key] = v; } }); return s.el; };
    lab.fHidden = U.h('input.input', { id: 'mlHidden', value: CFG.hidden, 'aria-describedby': 'mlHiddenH', placeholder: 'e.g. 8,6' }); lab.fHidden.addEventListener('input', () => { CFG.hidden = lab.fHidden.value; });
    const hid = U.h('div.field', U.h('label.label', { for: 'mlHidden' }, 'Hidden layers (neurons per layer)'), lab.fHidden, U.h('span.hint', { id: 'mlHiddenH' }, 'Comma-separated, 0–4 layers of 1–64 neurons. Empty = no hidden layer (plain softmax regression).'));
    const pre = U.h('div.chip-row.left', [['Tiny', '4'], ['Default', '8,6'], ['Wide', '32'], ['Deep', '16,12,8']].map(([n, v]) => { const b = U.h('button.chip', { type: 'button' }, n); b.addEventListener('click', () => { CFG.hidden = v; lab.fHidden.value = v; }); return b; }));
    const feat = U.h('div.field', U.h('span.label', 'Features (per channel)'), U.h('div.chip-row.left', kit.FEATURES.map((f) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(CFG.features.includes(f.id)), 'data-tip': f.group }, f.name); b.addEventListener('click', () => { CFG.features = CFG.features.includes(f.id) ? CFG.features.filter((x) => x !== f.id) : [...CFG.features, f.id]; b.setAttribute('aria-pressed', String(CFG.features.includes(f.id))); }); return b; })));
    const chs = U.h('div.field', U.h('span.label', 'EEG channels used'), U.h('div.chip-row.left', ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'].map((n) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(CFG.channels.includes(n)) }, n); b.addEventListener('click', () => { CFG.channels = CFG.channels.includes(n) ? CFG.channels.filter((x) => x !== n) : [...CFG.channels, n]; b.setAttribute('aria-pressed', String(CFG.channels.includes(n))); }); return b; })));
    const bal = ui.selectField({ label: 'Class balancing (training set only)', value: CFG.balance, options: [['none', 'None'], ['under', 'Undersample majority'], ['over', 'Oversample minority']], onChange: (v) => { CFG.balance = v; } });
    const grp = ui.switchField('Grouped split', CFG.grouped, 'Keeps every simulated recording entirely in one split, so near-duplicates cannot leak across train and test.', (v) => { CFG.grouped = v; });
    c.append(hid, pre, num('lr', 'Learning rate', 'lr', 0.01, 1, 0.01), num('b', 'Batch size', 'batch', 4, 128, 4), num('e', 'Epochs', 'epochs', 5, 300, 5), num('s', 'Random seed', 'seed', 1, 999, 1, 'Seeds the data generation, the split and the weights.'), num('n', 'Samples per class', 'perClass', 20, 200, 10, 'Each sample is a different simulated 4 s recording.'), num('t', 'Test fraction (%)', 'test', 10, 40, 5), num('v', 'Validation fraction (%)', 'val', 0, 30, 5), grp, bal.el, chs, feat);
    $('#mlTrain').addEventListener('click', () => lab.train()); $('#mlCancel').addEventListener('click', () => lab.job && NG.mlRunner.cancel(lab.job.id));
    const ro = new ResizeObserver(() => lab.charts()); ro.observe($('#mlLoss')); lab.renderCmp();
  };

  lab.parseHidden = () => { const t = String(CFG.hidden).trim(); if (!t) return []; const parts = t.split(/[,\s]+/).filter(Boolean).map(Number); return parts; };
  lab.config = () => ({ hidden: lab.parseHidden(), lr: CFG.lr, batch: CFG.batch, epochs: CFG.epochs, seed: CFG.seed, val: CFG.val / 100, test: CFG.test / 100, balance: CFG.balance, grouped: CFG.grouped });

  lab.train = async () => {
    const root = lab.root, $ = (s) => U.$(s, root); if (lab.job) return;
    const config = lab.config(), errs = kit.validateConfig(config); if (!CFG.features.length) errs.push('Choose at least one feature.'); if (!CFG.channels.length) errs.push('Choose at least one channel.');
    if (errs.length) { ui.toast(errs[0], { type: 'warn', ms: 6000 }); $('#mlSub').textContent = errs.join(' '); return; }
    const hist = { loss: [], vloss: [], acc: [], vacc: [] }; lab.hist = hist; lab.charts();
    $('#mlTrain').hidden = true; $('#mlCancel').hidden = false; $('#mlBar').hidden = false; const bar = $('#mlBar i'); bar.style.width = '0%'; $('#mlSub').textContent = 'Generating simulated recordings…';
    const payload = { dataset: { perClass: CFG.perClass, seed: CFG.seed, noiseMin: 0.05, noiseMax: CFG.noiseMax / 100, features: CFG.features, channels: CFG.channels, seconds: 4 }, config };
    $('#mlMode').textContent = NG.mlRunner.mode === 'worker' ? 'Running in a background Web Worker — the page stays responsive.' : 'Web Workers are unavailable here (for example when opened from a file), so training runs on the main thread in small slices.';
    const p = NG.mlRunner.run('train', payload, (m) => {
      if (m.type === 'started') { $('#mlSub').textContent = `Training on ${m.counts.train} windows · validating on ${m.counts.val} · held-out test ${m.counts.test}`; return; }
      if (m.stage === 'dataset') { bar.style.width = m.value * 30 + '%'; $('#mlSub').textContent = `Generating simulated recordings… ${Math.round(m.value * 100)}%`; return; }
      if (m.stage === 'train') { const r = m.rec; hist.loss.push(r.trainLoss); hist.vloss.push(r.valLoss); hist.acc.push(r.trainAcc); hist.vacc.push(r.valAcc); bar.style.width = 30 + m.value * 70 + '%'; $('#mlSub').textContent = `Epoch ${r.epoch} / ${config.epochs} · loss ${r.trainLoss.toFixed(3)} · train acc ${(r.trainAcc * 100).toFixed(0)}%`; lab.charts(); }
    });
    lab.job = p; ui.announce('Training started');
    try { const res = await p; lab.current = { id: 'M' + Date.now().toString(36), createdAt: new Date().toISOString(), cfg: { ...CFG }, res }; lab.show(res); ui.toast('Training finished. Results are on held-out simulated data.', { type: 'success' }); }
    catch (e) { $('#mlSub').textContent = e.cancelled ? 'Training cancelled.' : 'Training failed: ' + e.message; ui.toast(e.cancelled ? 'Training cancelled.' : e.message, { type: 'warn', ms: 6000 }); }
    lab.job = null; $('#mlTrain').hidden = false; $('#mlCancel').hidden = true; $('#mlBar').hidden = true;
  };

  lab.charts = () => {
    const h = lab.hist || { loss: [], vloss: [], acc: [], vacc: [] }, C = NG.theme.c, root = lab.root; if (!root) return;
    ui.lineChart(U.$('#mlLoss', root), { series: [{ label: 'train loss', color: C.accent, values: h.loss }, { label: 'validation loss', color: C.amber, values: h.vloss, dash: [4, 3] }], empty: 'Loss curve appears during training' });
    ui.lineChart(U.$('#mlAcc', root), { series: [{ label: 'train acc', color: C.accent, values: h.acc }, { label: 'validation acc', color: C.amber, values: h.vacc, dash: [4, 3] }], min: 0, max: 1, digits: 1, empty: 'Accuracy curve appears during training' });
  };

  lab.show = (res) => {
    const root = lab.root, box = U.$('#mlRes', root), pc = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'), cls = res.classes, dg = kit.diagnose(res), w = res.test ? kit.wilson(Math.round(res.test.accuracy * res.test.n), res.test.n) : null;
    const col = (name, r) => r ? `<div class="stat"><div class="stat-k">${name} · n=${r.n}</div><div class="stat-v stat-v-sm">${pc(r.accuracy)}</div><div class="stat-n">macro F1 ${pc(r.macro.f1)} · loss ${r.loss.toFixed(3)}</div></div>` : `<div class="stat"><div class="stat-k">${name}</div><div class="stat-v stat-v-sm">—</div><div class="stat-n">not used</div></div>`;
    const t = res.test, per = t.per.map((p, i) => `<tr><td>${U.esc(cls[i])}</td><td class="mono">${pc(p.precision)}</td><td class="mono">${pc(p.recall)}</td><td class="mono">${pc(p.f1)}</td><td class="mono">${p.support}</td></tr>`).join('');
    box.innerHTML = `<div class="stats-grid">${col('Train', res.train)}${col('Validation', res.val)}${col('Test (held out)', res.test)}</div>
      <div class="callout ${dg.kind === 'ok' ? '' : 'callout-warn'}">${ui.icon(dg.kind === 'ok' ? 'check' : 'alert')}<div><strong>${dg.kind === 'overfit' ? 'Overfitting?' : dg.kind === 'underfit' ? 'Underfitting?' : 'Fit check'}</strong> ${U.esc(dg.text)}</div></div>
      <div class="callout">${ui.icon('info')}<div><strong>Reliability.</strong> Test accuracy ${pc(t.accuracy)} on only ${t.n} windows has a 95% interval of about ${pc(w.lo)}–${pc(w.hi)}. ${t.n < 60 ? '<b>This is too few for a statistically reliable comparison</b> between close models.' : 'Differences smaller than this interval should not be over-interpreted.'} Results describe NeuroGrid’s simulator, <b>not</b> real EEG. Leakage check: ${res.leakage ? '<b>FAILED</b>' : 'no overlap between splits'}${res.config.grouped ? ' (grouped by recording)' : ''}.</div></div>
      <div class="ml-two"><div><span class="label">Test-set confusion matrix</span>${ui.confusionHtml(t.confusion, cls)}</div>
      <div><span class="label">Per-class performance (test)</span><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead><tbody>${per}<tr class="tbl-sum"><td>Macro average</td><td class="mono">${pc(t.macro.precision)}</td><td class="mono">${pc(t.macro.recall)}</td><td class="mono">${pc(t.macro.f1)}</td><td></td></tr><tr class="tbl-sum"><td>Weighted average</td><td class="mono">${pc(t.weighted.precision)}</td><td class="mono">${pc(t.weighted.recall)}</td><td class="mono">${pc(t.weighted.f1)}</td><td class="mono">${t.n}</td></tr></tbody></table></div>
      <p class="hint"><b>Macro</b> averages the classes equally (so a rare class counts as much as a common one); <b>weighted</b> averages by support. Headline “macro F1” above uses the macro average. Precision = of the windows predicted as a class, how many were right; recall = of the true windows of a class, how many were found.</p></div></div>
      <div class="row wrap"><button class="btn" id="mlAdd" type="button">${ui.icon('layers')}<span>Add to comparison</span></button><button class="btn" id="mlExp" type="button">${ui.icon('download')}<span>Export configuration &amp; results (JSON)</span></button><button class="btn btn-ghost" id="mlReset" type="button">${ui.icon('refresh')}<span>Reset model</span></button></div>`;
    U.$('#mlAdd', box).addEventListener('click', () => { lab.runs.push(lab.current); lab.renderCmp(); ui.toast('Added to comparison.'); });
    U.$('#mlExp', box).addEventListener('click', () => U.download(`neurogrid-model-simulated-${U.stamp()}.json`, JSON.stringify({ data_source: 'SIMULATED', note: 'Trained and evaluated only on NeuroGrid simulated signals.', created_at: lab.current.createdAt, ui_settings: lab.current.cfg, ...res }, null, 2), 'application/json'));
    U.$('#mlReset', box).addEventListener('click', () => { lab.current = null; lab.hist = null; lab.charts(); box.innerHTML = '<div class="empty"><strong>Model reset</strong><span>Weights, curves and results were discarded. Train again to get new ones.</span></div>'; U.$('#mlSub', root).textContent = 'Not trained yet.'; });
  };

  lab.renderCmp = () => {
    const box = U.$('#mlCmp', lab.root), pc = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
    if (!lab.runs.length) { box.innerHTML = '<div class="empty"><strong>No runs added</strong><span>After training, press “Add to comparison”. Change a setting, train again and add another.</span></div>'; return; }
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Hidden</th><th>LR</th><th>Epochs</th><th>Features×ch</th><th>Train</th><th>Val</th><th>Test</th><th>Test macro F1</th><th></th></tr></thead><tbody>${lab.runs.map((r, i) => `<tr><td>${i + 1}</td><td class="mono">${r.res.config.hidden.join('-') || 'none'}</td><td class="mono">${r.res.config.lr}</td><td class="mono">${r.res.config.epochs}</td><td class="mono">${r.res.featureIds.length}×${r.res.channels.length}</td><td class="mono">${pc(r.res.train.accuracy)}</td><td class="mono">${r.res.val ? pc(r.res.val.accuracy) : '—'}</td><td class="mono">${pc(r.res.test.accuracy)}</td><td class="mono">${pc(r.res.test.macro.f1)}</td><td><button class="btn btn-icon btn-ghost btn-sm" data-rm="${i}" aria-label="Remove run ${i + 1}">${ui.icon('trash')}</button></td></tr>`).join('')}</tbody></table></div><p class="hint">All runs use simulated data. Differences between runs with small test sets may be pure chance — see the reliability note above.</p>`;
    U.$$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { lab.runs.splice(+b.dataset.rm, 1); lab.renderCmp(); }));
  };
  lab.onShow = () => { lab.charts(); };
})();
