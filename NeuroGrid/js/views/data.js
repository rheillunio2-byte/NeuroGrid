/* NeuroGrid — Data Import: bring your own EEG CSV. Parsing, validation and analysis all happen in this browser tab. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, imp = NG.csvimport, dsp = NG.dsp;
  NG.views = NG.views || {};
  const MAX_BYTES = 80 * 1024 * 1024;
  const S = { file: null, text: null, rows: null, delim: ',', header: null, an: null, m: null, cancel: null };

  NG.views.data = {
    id: 'data', title: 'Data Import', icon: 'upload',
    render() {
      return `${ui.pageHead('06 · Data Import', 'Analyse <em>your own</em> EEG', 'Load a CSV file, tell NeuroGrid which columns are EEG and how fast it was sampled, and explore it with the same tools used for simulated signals. Your file never leaves this browser tab.',
        `<button class="btn" id="dtExample" type="button">${ui.icon('download')}<span>Download example CSV</span></button>`)}
      <div class="dt-layout">
        <section class="card dt-drop" data-reveal aria-labelledby="dtT"><div class="card-head"><div><h2 class="card-title" id="dtT">1 · Choose a file</h2><p class="card-sub">CSV, TSV or semicolon-separated text. EDF/BDF files are not supported in this version.</p></div></div>
          <div class="card-body stack"><div class="dropzone" id="dtZone" tabindex="0" role="button" aria-label="Drop a CSV file here or press Enter to choose one"><div>${ui.icon('upload', 'i-lg')}</div><strong>Drop a CSV file here</strong><span>or click to browse · up to ${MAX_BYTES / 1048576} MB</span><input type="file" id="dtFile" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden></div>
            <div class="bar" id="dtProg" hidden><i></i></div><div class="row" id="dtProgRow" hidden><span class="hint" id="dtProgTxt"></span><button class="btn btn-sm btn-ghost right" id="dtCancel" type="button">Cancel</button></div>
            <p class="hint">${ui.icon('lock', 'i-sm')} Privacy: the file is read locally with the browser’s File API. Nothing is uploaded, and the data is held in memory only (unless you choose to save it to this browser).</p></div></section>
        <section class="card dt-prev" data-reveal aria-labelledby="dtPT" hidden id="dtPrevCard"><div class="card-head"><div><h2 class="card-title" id="dtPT">2 · Preview &amp; map columns</h2><p class="card-sub" id="dtPSub"></p></div></div><div class="card-body stack" id="dtPrev"></div></section>
        <section class="card dt-res" data-reveal aria-labelledby="dtRT" hidden id="dtResCard"><div class="card-head"><div><h2 class="card-title" id="dtRT">3 · Result</h2></div></div><div class="card-body stack" id="dtRes"></div></section>
        <section class="card dt-info" data-reveal aria-labelledby="dtIT"><div class="card-head"><div><h2 class="card-title" id="dtIT">Loaded dataset</h2><p class="card-sub">The dataset used by the Spectrogram, Topography and Research views.</p></div></div><div class="card-body stack" id="dtInfo"></div></section>
      </div>`;
    },
    init(root) {
      this.root = root; const $ = (s) => U.$(s, root), z = $('#dtZone'), f = $('#dtFile');
      z.addEventListener('click', () => f.click()); z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } });
      f.addEventListener('change', () => { if (f.files[0]) this.load(f.files[0]); f.value = ''; });
      ['dragenter', 'dragover'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('over'); })); ['dragleave', 'drop'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.remove('over'); }));
      z.addEventListener('drop', (e) => { const fl = e.dataTransfer && e.dataTransfer.files[0]; if (fl) this.load(fl); });
      $('#dtCancel').addEventListener('click', () => { if (S.cancel) S.cancel.cancelled = true; });
      $('#dtExample').addEventListener('click', () => this.example());
      this.renderInfo();
    },
    show() { this.renderInfo(); this.off = NG.data.on('change', () => this.renderInfo()); },
    hide() { this.off && this.off(); },
    example() {
      const r = NG.workbench.generate({ profile: 'relaxed', profile2: 'active', fs: 250, seconds: 20, seed: 5, channels: ['Fp1', 'C3', 'C4', 'O1'] }), rows = ['time_s,Fp1,C3,C4,O1'];
      for (let i = 0; i < r.n; i++) rows.push([(i / r.fs).toFixed(4), ...r.channels.map((c) => c.data[i].toFixed(3))].join(','));
      U.download('neurogrid-example-SIMULATED-20s-250Hz.csv', rows.join('\n') + '\n'); ui.toast('Example saved. It is simulated; importing it will test the import flow.', { type: 'success' });
    },
    async load(file) {
      const $ = (s) => U.$(s, this.root);
      if (file.size > MAX_BYTES) { this.fail(`This file is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${MAX_BYTES / 1048576} MB. Split or down-sample it first.`); return; }
      if (!file.size) { this.fail('The file is empty (0 bytes).'); return; }
      S.file = file; S.cancel = { cancelled: false }; $('#dtProg').hidden = false; $('#dtProgRow').hidden = false; $('#dtPrevCard').hidden = true; $('#dtResCard').hidden = true; const bar = $('#dtProg i'), txt = $('#dtProgTxt');
      try {
        txt.textContent = 'Reading file…'; bar.style.width = '5%'; const text = await file.text();
        if (/\u0000/.test(text.slice(0, 4096))) throw new Error('This looks like a binary file, not text. EDF/BDF and other binary formats are not supported yet.');
        txt.textContent = 'Parsing…'; const parsed = await imp.parseCsvChunked(text, { signal: S.cancel, onProgress: (p) => { bar.style.width = 5 + p * 90 + '%'; txt.textContent = `Parsing… ${Math.round(p * 100)}%`; } });
        S.rows = parsed.rows; S.delim = parsed.delimiter; S.header = null; this.analyze();
        $('#dtProg').hidden = true; $('#dtProgRow').hidden = true;
      } catch (e) { $('#dtProg').hidden = true; $('#dtProgRow').hidden = true; if (e.cancelled) ui.toast('Import cancelled.'); else this.fail(e.message); }
    },
    fail(msg) { ui.toast(msg, { type: 'warn', ms: 7000 }); const c = U.$('#dtResCard', this.root); c.hidden = false; U.$('#dtRes', this.root).innerHTML = `<div class="callout callout-warn">${ui.icon('alert')}<div><strong>Import problem.</strong> ${U.esc(msg)}</div></div>`; },
    analyze() {
      const an = imp.analyze(S.rows, { header: S.header }); S.an = an;
      if (an.error) { this.fail(an.error); return; }
      const numCols = an.cols.filter((c) => c.numeric && c.index !== an.timeGuess && c.index !== an.labelGuess).map((c) => c.index);
      S.m = { timeCol: an.timeGuess == null ? null : an.timeGuess, channelCols: numCols, labelCol: an.labelGuess == null ? null : an.labelGuess, fs: 250, timeUnit: 's', unit: 'uV', convertToUV: false, missing: 'interpolate' };
      this.renderPrev();
    },
    renderPrev() {
      const an = S.an, m = S.m, root = this.root, $ = (s) => U.$(s, root); $('#dtPrevCard').hidden = false; ui.reveal(root);
      $('#dtPSub').textContent = `${S.file.name} · ${(S.file.size / 1024).toFixed(0)} KB · ${U.fmtInt(an.rowCount)} data rows · ${an.width} columns · delimiter “${S.delim === '\t' ? 'tab' : S.delim}”`;
      const prev = an.body.slice(0, 6), head = an.header;
      const tbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${U.esc(h)}</th>`).join('')}</tr></thead><tbody>${prev.map((r) => `<tr>${head.map((_, i) => `<td>${U.esc(r[i] == null ? '' : r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      const box = $('#dtPrev'); box.innerHTML = tbl;
      const opts = [['', '— none (use the sampling rate below) —'], ...an.cols.map((c) => [c.index, `${c.name}${c.numeric ? '' : ' (not numeric)'}`])];
      const f1 = U.h('label.check', U.h('input', { type: 'checkbox', checked: an.hasHeader || null }), 'First row is a header');
      f1.querySelector('input').addEventListener('change', (e) => { S.header = e.target.checked; this.analyze(); });
      const tc = ui.selectField({ label: 'Time column', value: m.timeCol == null ? '' : m.timeCol, options: opts, hint: 'If given, the sampling rate is checked against the time stamps.', onChange: (v) => { m.timeCol = v === '' ? null : +v; m.channelCols = m.channelCols.filter((c) => c !== m.timeCol); this.renderPrev(); } });
      const tu = ui.segField({ label: 'Time unit', value: m.timeUnit, options: [{ value: 's', label: 'seconds' }, { value: 'ms', label: 'milliseconds' }], onChange: (v) => { m.timeUnit = v; } });
      const chk = U.h('div.field', U.h('span.label', 'EEG channel columns'), U.h('div.chip-row.left', an.cols.filter((c) => c.index !== m.timeCol).map((c) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(m.channelCols.includes(c.index)), disabled: !c.numeric || null, 'data-tip': c.numeric ? `${(c.numericRatio * 100).toFixed(0)}% numeric` : 'Not numeric — cannot be an EEG channel' }, c.name); b.addEventListener('click', () => { m.channelCols = m.channelCols.includes(c.index) ? m.channelCols.filter((x) => x !== c.index) : [...m.channelCols, c.index]; b.setAttribute('aria-pressed', String(m.channelCols.includes(c.index))); }); return b; })));
      const lc = ui.selectField({ label: 'Label column (optional)', value: m.labelCol == null ? '' : m.labelCol, options: [['', '— none —'], ...an.cols.map((c) => [c.index, c.name])], hint: 'Text labels (e.g. rest/task) enable supervised analysis in the Research Workspace.', onChange: (v) => { m.labelCol = v === '' ? null : +v; } });
      const fs = U.h('div.field', U.h('label.label', { for: 'dtFs' }, 'Sampling rate (Hz)'), U.h('input.input', { id: 'dtFs', type: 'number', min: 1, max: 20000, step: 'any', value: m.timeCol == null ? m.fs : '' , placeholder: m.timeCol == null ? 'required' : 'from time column' }), U.h('span.hint', 'Required without a time column. With one, leave blank to use the rate implied by the time stamps.'));
      fs.querySelector('input').addEventListener('input', (e) => { m.fs = e.target.value === '' ? 0 : +e.target.value; });
      m.fs = m.timeCol == null ? m.fs : 0;
      const un = ui.segField({ label: 'Units of the EEG values', value: m.unit, options: [{ value: 'uV', label: 'µV' }, { value: 'mV', label: 'mV' }, { value: 'V', label: 'V' }, { value: 'au', label: 'arbitrary' }], hint: 'Stored as given. Nothing is converted unless you tick the box below.', onChange: (v) => { m.unit = v; cv.querySelector('input').disabled = v === 'uV' || v === 'au'; } });
      const cv = ui.switchField('Convert to µV', m.convertToUV, 'Explicit conversion for mV or V data. Recorded in the dataset notes.', (v) => { m.convertToUV = v; }); cv.querySelector('input').disabled = true;
      const ms = ui.selectField({ label: 'Missing / invalid values', value: m.missing, options: [['interpolate', 'Fill by linear interpolation'], ['zero', 'Replace with zero'], ['reject', 'Reject the file']], onChange: (v) => { m.missing = v; } });
      const go = U.h('button.btn.btn-primary', { type: 'button' }, U.html(ui.icon('check')), U.h('span', 'Validate & load dataset')); go.addEventListener('click', () => this.build());
      box.append(U.h('div.field-row', f1, tc.el, tu.el), chk, U.h('div.field-row', lc.el, fs, un.el), U.h('div.field-row', cv, ms.el), go);
    },
    build() {
      const m = S.m, res = imp.buildDataset(S.an, m, { filename: S.file.name, size: S.file.size }), root = this.root, $ = (s) => U.$(s, root); $('#dtResCard').hidden = false;
      const list = (a, cls) => (a.length ? `<ul class="msg ${cls}">${a.map((x) => `<li>${U.esc(x)}</li>`).join('')}</ul>` : '');
      if (!res.ok) { $('#dtRes').innerHTML = `<div class="callout callout-warn">${ui.icon('alert')}<div><strong>This dataset cannot be analysed correctly yet.</strong> Fix the following and try again:${list(res.errors, 'bad')}${list(res.warnings, 'warn')}</div></div>`; ui.toast('Validation failed — see the details below.', { type: 'warn' }); return; }
      NG.data.set(res.dataset); NG.progress.unlock('importer'); const d = res.dataset;
      $('#dtRes').innerHTML = `<div class="callout">${ui.icon('check')}<div><strong>Dataset loaded</strong> — ${d.channels.length} channel(s), ${U.fmtInt(d.n)} samples at ${d.fs.toFixed(d.fs % 1 ? 2 : 0)} Hz.${res.warnings.length ? '<br>Please note:' + list(res.warnings, 'warn') : ''}</div></div><div class="row wrap"><a class="btn btn-primary" href="#/spectrogram">Open in Spectrogram</a><a class="btn" href="#/topography">Open in Topography</a><a class="btn" href="#/research">Use in Research Workspace</a></div>`;
      ui.toast('Dataset loaded (imported data).', { type: 'success' }); this.renderInfo();
    },
    renderInfo() {
      const box = U.$('#dtInfo', this.root), d = NG.data.current; if (!box) return;
      if (!d) { box.innerHTML = '<div class="empty"><strong>Nothing imported</strong><span>No dataset is loaded. The rest of NeuroGrid keeps using simulated data until you import one.</span></div>'; return; }
      const st = d.channels.map((c) => { const x = c.data; return `<tr><td>${U.esc(c.name)}</td><td class="mono">${dsp.mean(x).toFixed(3)}</td><td class="mono">${dsp.rms(x).toFixed(3)}</td><td class="mono">${(Math.min(...x.subarray(0, 200000))).toFixed(2)} … ${(Math.max(...x.subarray(0, 200000))).toFixed(2)}</td><td class="mono">${c.missing + c.invalid}</td></tr>`; }).join('');
      box.innerHTML = `<div class="stats-grid"><div class="stat"><div class="stat-k">Data source</div><div class="stat-v stat-v-sm">${ui.sourceBadge('IMPORTED')}</div><div class="stat-n">not simulated</div></div><div class="stat"><div class="stat-k">Filename</div><div class="stat-v stat-v-sm">${U.esc(d.filename)}</div></div><div class="stat"><div class="stat-k">Samples / channels</div><div class="stat-v stat-v-sm">${U.fmtInt(d.n)} × ${d.channels.length}</div></div><div class="stat"><div class="stat-k">Sampling rate</div><div class="stat-v stat-v-sm">${d.fs.toFixed(d.fs % 1 ? 3 : 0)} Hz</div></div><div class="stat"><div class="stat-k">Duration</div><div class="stat-v stat-v-sm">${U.fmtDuration(d.duration)}</div></div><div class="stat"><div class="stat-k">Units</div><div class="stat-v stat-v-sm">${U.esc(d.unit)}</div></div><div class="stat"><div class="stat-k">Missing / invalid</div><div class="stat-v stat-v-sm">${d.missing} / ${d.invalid}</div></div></div>
      <div class="canvas-wrap dt-wave"><canvas id="dtWave" role="img" aria-label="Preview of the imported signal"></canvas></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Channel</th><th>Mean</th><th>RMS</th><th>Min … max</th><th>Gaps filled</th></tr></thead><tbody>${st}</tbody></table></div>
      <div class="row wrap"><button class="btn" id="dtSave" type="button">${ui.icon('download')}<span>Save to this browser</span></button><button class="btn btn-danger btn-sm" id="dtClear" type="button">${ui.icon('trash')}<span>Remove dataset</span></button></div>`;
      U.$('#dtClear', box).addEventListener('click', () => { NG.data.clear(); ui.toast('Imported dataset removed from memory.'); });
      U.$('#dtSave', box).addEventListener('click', () => this.save(d));
      requestAnimationFrame(() => this.preview(d));
    },
    preview(d) {
      const cv = U.$('#dtWave', this.root); if (!cv) return; const w = new NG.viz.Waveform(cv, { static: true }), n = Math.min(d.n, Math.round(d.fs * 10)), C = NG.theme.c; let mx = 1e-9; d.channels.forEach((c) => { for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(c.data[i])); });
      const nice = [0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500, 1000, 5000, 1e4, 1e5].find((v) => v >= mx * 0.6) || mx; const cols = [C.accent, C.violet, C.amber, C.green, C.rose, C.blue];
      w.draw({ lanes: d.channels.slice(0, 8).map((c, i) => ({ label: c.name, data: c.data.subarray(0, n), n, color: cols[i % 6] })), fs: d.fs, windowSec: n / d.fs, endIndex: n, originIndex: 0, scale: nice, unit: 'z', scaleLabel: `±${nice} ${d.unit}`, watermark: 'IMPORTED', static: true, showGrid: true, glow: false, lineWidth: 1.2 });
      setTimeout(() => { try { w.destroy(); } catch (e) { /* ignore */ } }, 0);
    },
    async save(d) {
      try { await NG.db.put('datasets', { id: d.id, name: d.filename, createdAt: d.importedAt, source: 'IMPORTED', meta: { fs: d.fs, n: d.n, unit: d.unit, missing: d.missing, invalid: d.invalid }, channels: d.channels.map((c) => ({ name: c.name, data: c.data })) }); ui.toast('Saved to this browser (IndexedDB). It never leaves your device.', { type: 'success' }); }
      catch (e) { ui.toast(e.message, { type: 'warn' }); }
    },
  };
})();
