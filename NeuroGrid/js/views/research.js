/* NeuroGrid — Research Workspace: define, run, save, compare and export reproducible experiments on simulated or imported data. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, kit = NG.evalkit, dsp = NG.dsp, ml = NG.ml, exporters = NG.exporters;
  NG.views = NG.views || {};
  const F = { name: '', source: 'simulated', perClass: 60, fs: 256, noiseMax: 35, seed: 11, bandpass: true, notch: false, features: kit.DEFAULT_FEATURES.slice(), channels: ['C3', 'C4'], hidden: '8,6', lr: 0.1, batch: 16, epochs: 60, val: 15, test: 20, grouped: true, balance: 'none', winSec: 4, blockWin: 10 };

  NG.views.research = {
    id: 'research', title: 'Research Workspace', icon: 'clipboard', saved: [], sel: new Set(), result: null, job: null,
    render() {
      return `${ui.pageHead('11 · Research Workspace', 'Reproducible <em>experiments</em>', 'Design an experiment, run it, save the exact configuration, then compare and export. Every saved record contains the seed, sampling rate, dataset, filter, feature, model and split settings needed to repeat it.')}
      <div class="rs-layout">
        <section class="card" data-reveal aria-labelledby="rsCT"><div class="card-head"><div><h2 class="card-title" id="rsCT">1 · Design</h2></div></div><div class="card-body stack" id="rsCfg"></div></section>
        <section class="card" data-reveal aria-labelledby="rsRT"><div class="card-head"><div><h2 class="card-title" id="rsRT">2 · Run &amp; review</h2><p class="card-sub" id="rsSub">Configure the experiment and press Run.</p></div><div class="row"><button class="btn" id="rsCancel" type="button" hidden>Cancel</button><button class="btn btn-primary" id="rsRun" type="button">${ui.icon('play')}<span>Run experiment</span></button></div></div><div class="card-body stack"><div class="bar" id="rsBar" hidden><i></i></div><div id="rsRes"><div class="empty"><strong>No experiment has been run</strong><span>Results appear here. Nothing is pre-filled.</span></div></div></div></section>
        <section class="card rs-saved" data-reveal aria-labelledby="rsST"><div class="card-head"><div><h2 class="card-title" id="rsST">3 · Saved experiments</h2><p class="card-sub" id="rsSavedSub">Stored in this browser (IndexedDB).</p></div><button class="btn btn-sm" id="rsCompare" type="button" disabled>${ui.icon('layers')}<span>Compare selected</span></button></div><div class="card-body stack" id="rsSaved"></div></section>
        <section class="card rs-cmp" data-reveal id="rsCmpCard" hidden><div class="card-head"><div><h2 class="card-title">Comparison</h2></div></div><div class="card-body stack" id="rsCmp"></div></section>
      </div>`;
    },
    init(root) {
      this.root = root; const c = U.$('#rsCfg', root);
      const name = U.h('div.field', U.h('label.label', { for: 'rsName' }, 'Experiment name'), U.h('input.input', { id: 'rsName', placeholder: 'e.g. alpha vs beta, 2 channels', maxlength: 80 })); name.querySelector('input').addEventListener('input', (e) => { F.name = e.target.value; });
      this.fSrc = ui.segField({ label: 'Dataset', value: F.source, options: [{ value: 'simulated', label: 'Simulated' }, { value: 'imported', label: 'Imported (labelled)' }], onChange: (v) => { F.source = v; this.srcUi(); } });
      this.srcBox = U.h('div.stack');
      const sl = (label, key, min, max, step, fmt, hint) => ui.slider({ label, min, max, step, value: F[key], fmt: fmt || ((v) => v), hint, onInput: (v) => { F[key] = v; } }).el;
      const chip = (label, arr, key, items) => U.h('div.field', U.h('span.label', label), U.h('div.chip-row.left', items.map(([id, n]) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(F[key].includes(id)) }, n); b.addEventListener('click', () => { F[key] = F[key].includes(id) ? F[key].filter((x) => x !== id) : [...F[key], id]; b.setAttribute('aria-pressed', String(F[key].includes(id))); }); return b; })));
      this.chCh = chip('Channels', F.channels, 'channels', ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'].map((n) => [n, n]));
      const pre = U.h('div.field-row', ui.switchField('Band-pass 1–40 Hz', F.bandpass, 'Before feature extraction', (v) => { F.bandpass = v; }), ui.switchField('Notch at 60 Hz', F.notch, '', (v) => { F.notch = v; }));
      const feat = chip('Features', F.features, 'features', kit.FEATURES.map((f) => [f.id, f.name]));
      const hid = U.h('div.field', U.h('label.label', { for: 'rsHid' }, 'Hidden layers'), U.h('input.input', { id: 'rsHid', value: F.hidden }), U.h('span.hint', 'Comma-separated neuron counts; empty for none.')); hid.querySelector('input').addEventListener('input', (e) => { F.hidden = e.target.value; });
      const grp = ui.switchField('Grouped split', F.grouped, 'Whole recordings (or blocks of windows) stay in one split.', (v) => { F.grouped = v; });
      const bal = ui.selectField({ label: 'Balancing (train only)', value: F.balance, options: [['none', 'None'], ['under', 'Undersample'], ['over', 'Oversample']], onChange: (v) => { F.balance = v; } });
      c.append(name, this.fSrc.el, this.srcBox, this.chCh, pre, feat, hid, U.h('div.field-row', sl('Learning rate', 'lr', 0.01, 1, 0.01, (v) => v.toFixed(2)), sl('Epochs', 'epochs', 5, 300, 5), sl('Batch size', 'batch', 4, 128, 4)), U.h('div.field-row', sl('Test fraction (%)', 'test', 10, 40, 5), sl('Validation fraction (%)', 'val', 0, 30, 5), sl('Random seed', 'seed', 1, 999, 1, null, 'Controls data, split and weights.')), grp, bal.el);
      U.$('#rsRun', root).addEventListener('click', () => this.run()); U.$('#rsCancel', root).addEventListener('click', () => this.job && NG.mlRunner.cancel(this.job.id)); U.$('#rsCompare', root).addEventListener('click', () => this.compare());
      this.srcUi(); this.loadSaved();
    },
    srcUi() {
      const b = this.srcBox; b.innerHTML = ''; const sl = (label, key, min, max, step, fmt, hint) => ui.slider({ label, min, max, step, value: F[key], fmt: fmt || ((v) => v), hint, onInput: (v) => { F[key] = v; } }).el;
      if (F.source === 'simulated') { b.append(sl('Samples per class', 'perClass', 20, 200, 10, null, 'Classes: Relaxed, Focused, Drowsy — each sample is its own simulated recording.'), ui.segField({ label: 'Sampling rate (Hz)', value: F.fs, options: [128, 256, 512].map((v) => ({ value: v, label: String(v) })), onChange: (v) => { F.fs = +v; } }).el, sl('Maximum noise (%)', 'noiseMax', 5, 80, 5)); this.chCh.hidden = false; }
      else { const ds = NG.data.current; this.chCh.hidden = true;
        if (!ds) b.append(U.html('<div class="empty"><strong>No imported dataset</strong><span>Import a CSV in Data Import first.</span></div>'));
        else if (!ds.labels) b.append(U.html(`<div class="callout callout-warn">${ui.icon('alert')}<div><strong>${U.esc(ds.filename)} has no label column.</strong> Supervised experiments need labels. Re-import the file and choose a label column.</div></div>`));
        else { const labs = [...new Set(ds.labels.filter(Boolean))]; b.append(U.html(`<p class="hint">Imported: <b>${U.esc(ds.filename)}</b> · ${ds.channels.length} channels · ${ds.fs} Hz · classes found: ${labs.map(U.esc).join(', ')}</p>`), sl('Window length (s)', 'winSec', 1, 8, 1), sl('Windows per grouped block', 'blockWin', 2, 40, 1, null, 'Consecutive windows are near-duplicates, so blocks are kept together in one split.')); } }
    },
    /** Build features from the imported dataset (main thread; windows are short). */
    importedData() {
      const ds = NG.data.current; if (!ds || !ds.labels) throw new Error('Import a labelled dataset first.');
      const W = Math.round(F.winSec * ds.fs), step = W, ids = F.features, X = [], Y = [], G = [], labs = [...new Set(ds.labels.filter(Boolean))].sort(); if (labs.length < 2) throw new Error('At least two label classes are needed.');
      if (W < 64) throw new Error('Windows are shorter than 64 samples; raise the window length.');
      const pre = F.bandpass || F.notch ? { bandpass: F.bandpass, lo: 1, hi: 40, notch: F.notch, mains: 60 } : null; let wi = 0;
      for (let s = 0; s + W <= ds.n && X.length < 3000; s += step) {
        const cnt = {}; for (let i = s; i < s + W; i++) { const l = ds.labels[i]; if (l) cnt[l] = (cnt[l] || 0) + 1; } const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (!top || top[1] < W * 0.8) continue; // skip mixed-label windows
        X.push(kit.multiChannelFeatures(ds.channels.map((c) => NG.job.prefilter(c.data.subarray(s, s + W), ds.fs, pre)), ds.fs, ids)); Y.push(labs.indexOf(top[0])); G.push(Math.floor(wi++ / F.blockWin));
      }
      const counts = labs.map((_, k) => Y.filter((y) => y === k).length); if (counts.some((n) => n < 5)) throw new Error('Each class needs at least 5 windows; found ' + counts.join(', ') + '. Use a shorter window or more data.');
      return { X, Y, groups: G, classes: labs, featureIds: ids, channels: ds.channels.map((c) => c.name), fs: ds.fs, datasetId: ds.id };
    },
    config() { const t = String(F.hidden).trim(); return { hidden: t ? t.split(/[,\s]+/).filter(Boolean).map(Number) : [], lr: F.lr, batch: F.batch, epochs: F.epochs, seed: F.seed, val: F.val / 100, test: F.test / 100, balance: F.balance, grouped: F.grouped }; },
    async run() {
      if (this.job) return; const root = this.root, $ = (s) => U.$(s, root), config = this.config(), errs = kit.validateConfig(config);
      if (!F.features.length) errs.push('Choose at least one feature.'); if (F.source === 'simulated' && !F.channels.length) errs.push('Choose at least one channel.');
      let data = null, payload; const pre = { bandpass: F.bandpass, lo: 1, hi: 40, notch: F.notch, mains: 60 };
      try { if (!errs.length) { if (F.source === 'imported') { data = this.importedData(); payload = { data, config }; } else payload = { dataset: { perClass: F.perClass, seed: F.seed, noiseMin: 0.05, noiseMax: F.noiseMax / 100, features: F.features, channels: F.channels, seconds: 4, fs: F.fs, pre }, config }; } } catch (e) { errs.push(e.message); }
      if (errs.length) { $('#rsSub').textContent = errs[0]; ui.toast(errs[0], { type: 'warn', ms: 6000 }); return; }
      $('#rsRun').hidden = true; $('#rsCancel').hidden = false; $('#rsBar').hidden = false; const bar = $('#rsBar i'); bar.style.width = '0%'; $('#rsSub').textContent = 'Running…';
      const p = NG.mlRunner.run('train', payload, (m) => { if (m.type === 'started') $('#rsSub').textContent = `Training on ${m.counts.train} · validating ${m.counts.val} · testing ${m.counts.test}`; else if (m.stage === 'dataset') { bar.style.width = m.value * 40 + '%'; $('#rsSub').textContent = `Generating simulated recordings… ${Math.round(m.value * 100)}%`; } else if (m.stage === 'train') { bar.style.width = 40 + m.value * 60 + '%'; } });
      this.job = p;
      try {
        const res = await p, imported = F.source === 'imported', ds = NG.data.current;
        this.result = { id: 'X' + Date.now().toString(36), name: F.name.trim() || `Experiment ${this.saved.length + 1}`, createdAt: new Date().toISOString(), source: imported ? 'IMPORTED' : 'SIMULATED', fs: imported ? ds.fs : F.fs, datasetId: imported ? ds.id + ' (' + ds.filename + ')' : `sim:seed${F.seed}:n${F.perClass}`, signalParams: imported ? { filename: ds.filename, unit: ds.unit, windowSec: F.winSec, blockWindows: F.blockWin } : { classes: ml.CLASSES.map((c) => c.name), perClass: F.perClass, noiseRange: [0.05, F.noiseMax / 100], windowSec: 4, generator: 'NeuroGrid simulator' }, pre, featureIds: res.featureIds, channels: res.channels, config: res.config, counts: res.counts, classes: res.classes, results: { train: res.train, val: res.val, test: res.test }, history: res.history, leakage: res.leakage, scaler: res.scaler, version: 'NeuroGrid 3.0' };
        this.renderResult(); $('#rsSub').textContent = 'Finished.'; ui.toast('Experiment finished.', { type: 'success' });
      } catch (e) { $('#rsSub').textContent = e.cancelled ? 'Cancelled.' : 'Failed: ' + e.message; ui.toast(e.cancelled ? 'Experiment cancelled.' : e.message, { type: 'warn', ms: 6000 }); }
      this.job = null; $('#rsRun').hidden = false; $('#rsCancel').hidden = true; $('#rsBar').hidden = true;
    },
    renderResult() {
      const r = this.result, box = U.$('#rsRes', this.root), pc = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'), t = r.results.test, dg = kit.diagnose({ train: r.results.train, val: r.results.val, test: t, classes: r.classes }), w = kit.wilson(Math.round(t.accuracy * t.n), t.n);
      box.innerHTML = `<div class="row wrap">${ui.sourceBadge(r.source)}<span class="hint">${U.esc(r.name)} · ${U.fmtDate(r.createdAt)}</span></div>
        <div class="stats-grid"><div class="stat"><div class="stat-k">Train</div><div class="stat-v stat-v-sm">${pc(r.results.train.accuracy)}</div><div class="stat-n">n=${r.counts.train}</div></div><div class="stat"><div class="stat-k">Validation</div><div class="stat-v stat-v-sm">${pc(r.results.val && r.results.val.accuracy)}</div><div class="stat-n">n=${r.counts.val}</div></div><div class="stat"><div class="stat-k">Test</div><div class="stat-v stat-v-sm">${pc(t.accuracy)}</div><div class="stat-n">n=${t.n} · 95% ${pc(w.lo)}–${pc(w.hi)}</div></div><div class="stat"><div class="stat-k">Test macro F1</div><div class="stat-v stat-v-sm">${pc(t.macro.f1)}</div><div class="stat-n">weighted ${pc(t.weighted.f1)}</div></div></div>
        <div class="callout ${dg.kind === 'ok' ? '' : 'callout-warn'}">${ui.icon(dg.kind === 'ok' ? 'check' : 'alert')}<div>${U.esc(dg.text)} ${t.n < 60 ? '<b>The test set is small, so this is not statistically reliable.</b>' : ''} ${r.source === 'SIMULATED' ? 'This describes NeuroGrid’s simulator, not real EEG.' : 'Imported data is analysed as provided; generalisation to other people or sessions is not tested here.'}</div></div>
        ${ui.confusionHtml(t.confusion, r.classes)}
        <dl class="kv"><div><dt>Reproducibility</dt><dd>seed ${r.config.seed} · ${r.fs} Hz · ${r.featureIds.length} features × ${r.channels.length} ch · hidden ${r.config.hidden.join('-') || 'none'} · split ${r.counts.train}/${r.counts.val}/${r.counts.test}${r.config.grouped ? ' (grouped)' : ''} · leakage ${r.leakage ? 'FAILED' : 'none'}</dd></div></dl>
        <div class="row wrap"><button class="btn btn-primary" id="rsSave" type="button">${ui.icon('check')}<span>Save experiment</span></button><button class="btn" id="rsCsv" type="button">${ui.icon('download')}<span>CSV</span></button><button class="btn" id="rsJson" type="button">${ui.icon('download')}<span>JSON</span></button><button class="btn" id="rsHtml" type="button">${ui.icon('file')}<span>Report (HTML → print to PDF)</span></button></div>`;
      U.$('#rsSave', box).addEventListener('click', () => this.save(this.result)); U.$('#rsCsv', box).addEventListener('click', () => this.exportOne(this.result, 'csv')); U.$('#rsJson', box).addEventListener('click', () => this.exportOne(this.result, 'json')); U.$('#rsHtml', box).addEventListener('click', () => this.report(this.result));
    },
    slim(r) { const o = JSON.parse(JSON.stringify(r)); return o; },
    async save(r) { try { await NG.db.put('experiments', this.slim(r)); NG.progress.unlock('researcher'); ui.toast('Experiment saved in this browser.', { type: 'success' }); this.loadSaved(); } catch (e) { ui.toast(e.message.includes('exists') ? 'This experiment is already saved (it is never overwritten). Run it again to save a new one.' : e.message, { type: 'warn', ms: 6000 }); } },
    exportOne(r, kind) { const base = `neurogrid-${r.source.toLowerCase()}-experiment-${r.id}`; if (kind === 'csv') U.download(base + '.csv', exporters.experimentCsv(r)); else U.download(base + '.json', exporters.experimentJson(r), 'application/json'); ui.toast(`${kind.toUpperCase()} exported (${r.source}).`, { type: 'success' }); },
    report(r) {
      const t = r.results.test, pc = (v) => (v * 100).toFixed(1) + '%', rows = exporters.experimentRows(r).map(([k, v]) => `<tr><td>${U.esc(k)}</td><td>${U.esc(v)}</td></tr>`).join(''), cm = ui.confusionHtml(t.confusion, r.classes);
      const html = `<!doctype html><meta charset="utf-8"><title>NeuroGrid report — ${U.esc(r.name)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#111}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:4px 10px;text-align:left}.warn{border:1px solid #c80;background:#fff7e6;padding:10px 14px;border-radius:8px}h1{font-size:22px}</style><h1>NeuroGrid 3.0 experiment report</h1><p class="warn"><b>Data source: ${r.source}.</b> ${r.source === 'SIMULATED' ? 'All signals were generated by the NeuroGrid simulator. Results do not represent real EEG or real-world BCI performance.' : 'Imported data analysed as provided. Not a clinical analysis.'}</p><h2>${U.esc(r.name)}</h2><p>Created ${U.esc(r.createdAt)}</p><h3>Results</h3><p>Train ${pc(r.results.train.accuracy)} · ${r.results.val ? 'Validation ' + pc(r.results.val.accuracy) + ' · ' : ''}Test <b>${pc(t.accuracy)}</b> (n=${t.n}) · macro F1 ${pc(t.macro.f1)} · weighted F1 ${pc(t.weighted.f1)}</p>${cm}<h3>Configuration</h3><table>${rows}</table><p><i>Use your browser’s Print dialog to save this page as a PDF.</i></p>`;
      U.download(`neurogrid-report-${r.source.toLowerCase()}-${r.id}.html`, html, 'text/html'); ui.toast('Report saved as an HTML file.', { type: 'success' });
    },
    async loadSaved() {
      const box = U.$('#rsSaved', this.root); try { this.saved = await NG.db.list('experiments'); } catch (e) { box.innerHTML = `<div class="callout callout-warn">${ui.icon('alert')}<div>Saved experiments could not be read: ${U.esc(e.message)}</div></div>`; return; }
      this.sel = new Set([...this.sel].filter((id) => this.saved.some((s) => s.id === id))); U.$('#rsSavedSub', this.root).textContent = NG.db.persistent ? 'Stored in this browser (IndexedDB). Nothing is uploaded.' : 'IndexedDB is unavailable, so experiments are kept only until you close this tab.';
      if (!this.saved.length) { box.innerHTML = '<div class="empty"><strong>No saved experiments</strong><span>Run an experiment and press “Save experiment”.</span></div>'; U.$('#rsCompare', this.root).disabled = true; return; }
      box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><span class="sr-only">Select</span></th><th>Name</th><th>Source</th><th>Date</th><th>Test acc</th><th></th></tr></thead><tbody>${this.saved.map((s) => `<tr><td><input type="checkbox" data-sel="${s.id}" aria-label="Select ${U.esc(s.name)} for comparison" ${this.sel.has(s.id) ? 'checked' : ''}></td><td>${U.esc(s.name)}</td><td>${ui.sourceBadge(s.source)}</td><td class="mono">${U.fmtDate(s.createdAt)}</td><td class="mono">${(s.results.test.accuracy * 100).toFixed(1)}%</td><td class="row"><button class="btn btn-sm btn-ghost" data-ren="${s.id}">Rename</button><button class="btn btn-sm btn-ghost" data-csv="${s.id}">CSV</button><button class="btn btn-sm btn-ghost" data-json="${s.id}">JSON</button><button class="btn btn-icon btn-ghost btn-sm" data-del="${s.id}" aria-label="Delete ${U.esc(s.name)}">${ui.icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`;
      const upd = () => { U.$('#rsCompare', this.root).disabled = this.sel.size < 2; };
      U.$$('[data-sel]', box).forEach((c) => c.addEventListener('change', () => { c.checked ? this.sel.add(c.dataset.sel) : this.sel.delete(c.dataset.sel); upd(); })); upd();
      const get = (id) => this.saved.find((s) => s.id === id);
      U.$$('[data-csv]', box).forEach((b) => b.addEventListener('click', () => this.exportOne(get(b.dataset.csv), 'csv'))); U.$$('[data-json]', box).forEach((b) => b.addEventListener('click', () => this.exportOne(get(b.dataset.json), 'json')));
      U.$$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => { const s = get(b.dataset.del); if (await ui.modal.confirm({ title: 'Delete this experiment?', message: `“${s.name}” will be permanently removed from this browser.`, confirmText: 'Delete', danger: true })) { await NG.db.del('experiments', s.id); ui.toast('Experiment deleted.'); this.loadSaved(); } }));
      U.$$('[data-ren]', box).forEach((b) => b.addEventListener('click', async () => { const s = get(b.dataset.ren), n = prompt('New name', s.name); if (n && n.trim()) { await NG.db.rename('experiments', s.id, n.trim()); this.loadSaved(); } }));
    },
    compare() {
      const list = this.saved.filter((s) => this.sel.has(s.id)); if (list.length < 2) return; U.$('#rsCmpCard', this.root).hidden = false; const pc = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
      const rows = [['Source', (s) => s.source], ['Dataset', (s) => s.datasetId], ['Sampling rate', (s) => s.fs + ' Hz'], ['Seed', (s) => s.config.seed], ['Preprocessing', (s) => (s.pre.bandpass ? 'band-pass 1–40' : 'none') + (s.pre.notch ? ' + notch' : '')], ['Channels', (s) => s.channels.join(' ')], ['Features', (s) => s.featureIds.join(' ')], ['Hidden layers', (s) => s.config.hidden.join('-') || 'none'], ['Learning rate / epochs / batch', (s) => `${s.config.lr} / ${s.config.epochs} / ${s.config.batch}`], ['Split train/val/test', (s) => `${s.counts.train}/${s.counts.val}/${s.counts.test}${s.config.grouped ? ' grouped' : ''}`], ['Train accuracy', (s) => pc(s.results.train.accuracy)], ['Validation accuracy', (s) => pc(s.results.val && s.results.val.accuracy)], ['Test accuracy', (s) => pc(s.results.test.accuracy)], ['Test macro F1', (s) => pc(s.results.test.macro.f1)]];
      const diff = (vals) => new Set(vals.map(String)).size > 1;
      U.$('#rsCmp', this.root).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Setting / result</th>${list.map((s) => `<th>${U.esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([n, f]) => { const v = list.map(f); return `<tr class="${diff(v) ? 'differs' : ''}"><td>${n}</td>${v.map((x) => `<td class="mono">${U.esc(x)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div><p class="hint">Highlighted rows differ between experiments. Mixed simulated and imported experiments are not directly comparable. With small test sets, accuracy differences of a few points are within chance variation.</p>`;
    },
    show() { this.srcUi(); this.loadSaved(); this.offD = NG.data.on('change', () => this.srcUi()); }, hide() { this.offD && this.offD(); },
  };
})();
