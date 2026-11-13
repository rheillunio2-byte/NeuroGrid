/* NeuroGrid 3.0 — Sessions: IndexedDB storage of full recordings, naming, comparison, selective export, storage usage. Extends NG.views.sessions. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, engine = NG.engine, dsp = NG.dsp, store = NG.store, exporters = NG.exporters, V = NG.views.sessions;
  const CH = NG.sim.CHANNELS.map((c) => c.name), nCh = CH.length; let sel = new Set(), stored = [], exp = null;

  const baseRender = V.render.bind(V);
  V.render = function () {
    return baseRender().replace(/<\/div>\s*$/, `<section class="card ss-stored" data-reveal aria-labelledby="ssT"><div class="card-head"><div><h2 class="card-title" id="ssT">Stored recordings <span class="badge" id="ssKind"></span></h2><p class="card-sub">Full-resolution samples saved in this browser (IndexedDB). Nothing is uploaded.</p></div><button class="btn btn-sm" id="ssCmp" type="button" disabled>${ui.icon('layers')}<span>Compare selected</span></button></div><div class="card-body stack"><div id="ssSave"></div><div id="ssList"></div><div id="ssExport"></div><div id="ssCmpOut"></div><div id="ssUsage"></div></div></section></div>`);
  };
  const baseRefresh = V.refresh.bind(V);
  V.refresh = function () { baseRefresh(); this.renderStored(); };
  const baseInit = V.init.bind(V);
  V.init = function (root) { baseInit(root); U.$('#ssCmp', root).addEventListener('click', () => this.compareStored()); };

  V.renderStored = async function () {
    const root = this.root, s = engine.session; if (!root) return; U.$('#ssKind', root).textContent = NG.db.persistent ? 'IndexedDB' : 'memory only';
    const save = U.$('#ssSave', root);
    if (s.state === 'stopped' && s.summary && s.buf) {
      save.innerHTML = `<div class="callout">${ui.icon('info')}<div>The latest recording (${U.fmtDuration(s.summary.durationSec)}, simulated) is only in memory. Give it a name and store it to keep the raw samples.</div></div><div class="row wrap"><input class="input" id="ssName" maxlength="80" aria-label="Recording name" value="Session ${U.fmtDate(s.summary.startedAt)}"><button class="btn btn-primary" id="ssDo" type="button">${ui.icon('check')}<span>Store recording</span></button></div>`;
      U.$('#ssDo', save).addEventListener('click', async () => {
        const n = s.samples; try { await NG.db.put('sessions', { id: s.id, name: U.$('#ssName', save).value.trim() || s.id, createdAt: s.summary.startedAt, source: 'SIMULATED', fs: engine.FS, channels: CH, summary: s.summary, samples: Float32Array.from(s.buf.subarray(0, n * nCh)), n }); ui.toast('Recording stored in this browser.', { type: 'success' }); this.renderStored(); }
        catch (e) { ui.toast(/exists/.test(e.message) ? 'This session is already stored — it was not overwritten.' : 'Could not store the recording: ' + e.message, { type: 'warn', ms: 6000 }); }
      });
    } else save.innerHTML = '';
    try { stored = await NG.db.list('sessions'); } catch (e) { U.$('#ssList', root).innerHTML = `<div class="callout callout-warn">${ui.icon('alert')}<div>${U.esc(e.message)}</div></div>`; return; }
    sel = new Set([...sel].filter((id) => stored.some((r) => r.id === id)));
    const list = U.$('#ssList', root);
    list.innerHTML = stored.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><span class="sr-only">Select</span></th><th>Name</th><th>Date</th><th>Duration</th><th>Size</th><th></th></tr></thead><tbody>${stored.map((r) => `<tr><td><input type="checkbox" data-s="${r.id}" aria-label="Select ${U.esc(r.name)}" ${sel.has(r.id) ? 'checked' : ''}></td><td>${U.esc(r.name)} ${ui.sourceBadge('SIMULATED')}</td><td class="mono">${U.fmtDate(r.createdAt)}</td><td class="mono">${U.fmtDuration(r.n / r.fs)}</td><td class="mono">${(NG.sessionstore.bytesOf(r) / 1048576).toFixed(2)} MB</td><td class="row"><button class="btn btn-sm btn-ghost" data-x="${r.id}">Export…</button><button class="btn btn-sm btn-ghost" data-r="${r.id}">Rename</button><button class="btn btn-icon btn-ghost btn-sm" data-d="${r.id}" aria-label="Delete ${U.esc(r.name)}">${ui.icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>No stored recordings</strong><span>Record a session, stop it, then store it here. Nothing is pre-filled.</span></div>';
    const upd = () => { U.$('#ssCmp', root).disabled = sel.size !== 2; };
    U.$$('[data-s]', list).forEach((c) => c.addEventListener('change', () => { c.checked ? sel.add(c.dataset.s) : sel.delete(c.dataset.s); upd(); })); upd();
    U.$$('[data-x]', list).forEach((b) => b.addEventListener('click', () => { exp = { id: b.dataset.x, ch: new Set(CH), kind: 'raw' }; this.renderExport(); }));
    U.$$('[data-r]', list).forEach((b) => b.addEventListener('click', async () => { const r = stored.find((x) => x.id === b.dataset.r), n = prompt('New name', r.name); if (n && n.trim()) { await NG.db.rename('sessions', r.id, n.trim()); this.renderStored(); } }));
    U.$$('[data-d]', list).forEach((b) => b.addEventListener('click', async () => { const r = stored.find((x) => x.id === b.dataset.d); if (await ui.modal.confirm({ title: 'Delete this recording?', message: `“${r.name}” and its raw samples will be permanently removed from this browser.`, confirmText: 'Delete', danger: true })) { await NG.db.del('sessions', r.id); if (exp && exp.id === r.id) exp = null; ui.toast('Recording deleted.'); this.renderStored(); this.renderExport(); } }));
    this.renderExport(); this.renderUsage();
  };
  V.renderUsage = async function () {
    const box = U.$('#ssUsage', this.root); if (!box) return; const u = await NG.db.usage(), q = await NG.db.estimate(), mb = (b) => (b / 1048576).toFixed(2) + ' MB';
    box.innerHTML = `<dl class="kv"><div><dt>Stored recordings</dt><dd>${u.sessions.count} · ${mb(u.sessions.bytes)}</dd></div><div><dt>Saved experiments</dt><dd>${u.experiments.count} · ${mb(u.experiments.bytes)}</dd></div><div><dt>Saved datasets</dt><dd>${u.datasets.count} · ${mb(u.datasets.bytes)}</dd></div>${q ? `<div><dt>Browser quota used</dt><dd>${mb(q.usage)} of ${(q.quota / 1073741824).toFixed(1)} GB (${((q.usage / q.quota) * 100).toFixed(2)}%)</dd></div>` : ''}</dl>`;
  };
  V.renderExport = function () {
    const box = U.$('#ssExport', this.root); if (!box) return; if (!exp) { box.innerHTML = ''; return; }
    const r = stored.find((x) => x.id === exp.id); if (!r) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="callout">${ui.icon('download')}<div><strong>Export “${U.esc(r.name)}”</strong> (simulated)<div class="row wrap" style="margin-top:10px" id="ssChips"></div><div id="ssKindSeg" style="margin-top:10px"></div><p class="hint" id="ssKindHint"></p><div class="row wrap"><button class="btn btn-primary" id="ssGo" type="button">${ui.icon('download')}<span>Download CSV</span></button><button class="btn btn-ghost" id="ssClose" type="button">Close</button></div></div></div>`;
    const chips = U.$('#ssChips', box); CH.forEach((n) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(exp.ch.has(n)) }, n); b.addEventListener('click', () => { exp.ch.has(n) ? exp.ch.delete(n) : exp.ch.add(n); b.setAttribute('aria-pressed', String(exp.ch.has(n))); }); chips.append(b); });
    const hints = { raw: 'Raw simulated samples of the selected channels.', processed: 'Samples after the current Processing Studio filter chain (zero-phase). The chain settings are those last used in the Studio.', psd: 'Welch power spectral density (256-sample segments) per selected channel.', spec: 'STFT of the first selected channel (window 256, overlap 75%, Hann): one row per time–frequency cell.' };
    const seg = ui.segmented(U.$('#ssKindSeg', box), { label: 'What to export', value: exp.kind, options: [{ value: 'raw', label: 'Raw samples' }, { value: 'processed', label: 'Processed signals' }, { value: 'psd', label: 'PSD' }, { value: 'spec', label: 'Spectrogram' }], onChange: (v) => { exp.kind = v; U.$('#ssKindHint', box).textContent = hints[v]; } }); U.$('#ssKindHint', box).textContent = hints[exp.kind]; void seg;
    U.$('#ssClose', box).addEventListener('click', () => { exp = null; this.renderExport(); }); U.$('#ssGo', box).addEventListener('click', () => this.doExport(r));
  };
  const chData = (r, ci) => { const x = new Float32Array(r.n); for (let i = 0; i < r.n; i++) x[i] = r.samples[i * nCh + ci]; return x; };
  V.doExport = function (r) {
    const names = CH.filter((n) => exp.ch.has(n)); if (!names.length) { ui.toast('Select at least one channel.', { type: 'warn' }); return; }
    try {
      const data = names.map((n) => ({ name: n, data: chData(r, CH.indexOf(n)) })); let text, tag = exp.kind;
      if (exp.kind === 'raw') text = exporters.signalCsv(data, r.fs, { source: 'SIMULATED' });
      else if (exp.kind === 'processed') { const chain = dsp.makeChain(store.get('studio.chain'), r.fs); if (!chain.active.length) throw new Error('The Processing Studio chain has no active stages. Turn some on there first.'); text = exporters.signalCsv(data.map((d) => ({ name: d.name, data: chain.apply(d.data, { zeroPhase: true }) })), r.fs, { source: 'SIMULATED' }); }
      else if (exp.kind === 'psd') { const o = {}; let freqs; data.forEach((d) => { const w = dsp.welch(d.data, r.fs, 256, 0.5); o[d.name] = w.psd; freqs = Array.from(w.psd, (_, k) => k * w.df); }); text = exporters.psdCsv(freqs, o, 'SIMULATED'); }
      else text = exporters.spectrogramCsv(NG.stft.stft(data[0].data, r.fs, { nfft: 256, overlap: 0.75 }), 'SIMULATED');
      U.download(`neurogrid-simulated-${tag}-${r.id}.csv`, text); ui.toast('Exported (SIMULATED).', { type: 'success' });
    } catch (e) { ui.toast(e.message, { type: 'warn', ms: 6000 }); }
  };
  V.compareStored = function () {
    const [a, b] = stored.filter((r) => sel.has(r.id)); if (!a || !b) return; const out = U.$('#ssCmpOut', this.root);
    const stat = (r) => { const w = dsp.welch(chData(r, 2), r.fs, 256, 0.5), bp = dsp.bandPowers(w.psd, w.df); return { dur: r.n / r.fs, rms: dsp.rms(chData(r, 2)), rel: bp.rel, dom: dsp.BANDS[dsp.dominantBand(bp.rel)].name }; };
    const A = stat(a), B = stat(b), pc = (v) => (v * 100).toFixed(0) + '%';
    out.innerHTML = `<h3 class="q-prompt">Comparison (channel C3, computed from the stored samples)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>${U.esc(a.name)}</th><th>${U.esc(b.name)}</th></tr></thead><tbody><tr><td>Duration</td><td class="mono">${U.fmtDuration(A.dur)}</td><td class="mono">${U.fmtDuration(B.dur)}</td></tr><tr><td>RMS (µV)</td><td class="mono">${A.rms.toFixed(2)}</td><td class="mono">${B.rms.toFixed(2)}</td></tr><tr><td>Dominant band</td><td class="mono">${A.dom}</td><td class="mono">${B.dom}</td></tr>${dsp.BANDS.map((bd, i) => `<tr><td>${bd.name} (relative)</td><td class="mono">${pc(A.rel[i])}</td><td class="mono">${pc(B.rel[i])}</td></tr>`).join('')}</tbody></table></div>`;
  };
})();
