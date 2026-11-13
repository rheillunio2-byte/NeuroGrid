/* NeuroGrid — Overview: status of the simulator, dataset, recent sessions, learning progress and quick access to every module. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, engine = NG.engine, progress = NG.progress, store = NG.store;
  NG.views = NG.views || {};
  const MODULES = [
    ['lab', 'Signal Lab', 'activity', 'Six simulated channels, live statistics and spectrum.'], ['spectrogram', 'Spectrogram', 'grid', 'Real STFT time–frequency maps.'], ['topography', 'EEG Topography', 'head', '10–20 scalp map of band power.'],
    ['studio', 'Processing Studio', 'sliders', 'Filters, artifacts and before/after analysis.'], ['data', 'Data Import', 'upload', 'Validate and analyse your own CSV.'], ['network', 'Neural Network', 'network', 'Diagram and a configurable training lab.'],
    ['bci', 'BCI Playground', 'brain', 'A full simulated BCI pipeline.'], ['experiments', 'Experiments', 'flask', 'Challenges with hints, review and progress.'], ['learn', 'Learning Center', 'book', 'Ten illustrated topics.'],
    ['research', 'Research Workspace', 'clipboard', 'Reproducible experiments, compare and export.'], ['sessions', 'Sessions & Export', 'record', 'Record, store, compare and export data.'],
  ];
  NG.views.overview = {
    id: 'overview', title: 'Overview', icon: 'home',
    render() {
      return `<section class="ov-hero" data-reveal><div class="ov-hero-text"><span class="eyebrow">NEUROGRID 3.0 · EEG &amp; BCI LEARNING LABORATORY</span><h1>Explore how brain signals are <em>measured, processed and decoded</em>.</h1><p>An interactive laboratory for EEG signal analysis, digital signal processing, machine learning and brain–computer-interface concepts. Real mathematics, running locally in your browser, on simulated signals or your own CSV data.</p><div class="row wrap"><a class="btn btn-primary btn-lg" href="#/lab">${ui.icon('activity')}<span>Open Signal Lab</span></a><a class="btn btn-lg" href="#/data">${ui.icon('upload')}<span>Import my data</span></a></div></div>
        <div class="ov-hero-art" aria-hidden="true"><canvas id="ovOrb"></canvas></div></section>
      <div class="ov-grid">
        <section class="card" data-reveal aria-labelledby="ovS"><div class="card-head"><div><h2 class="card-title" id="ovS">Simulation</h2></div></div><div class="card-body stack" id="ovSim"></div></section>
        <section class="card" data-reveal aria-labelledby="ovD"><div class="card-head"><div><h2 class="card-title" id="ovD">Dataset</h2></div></div><div class="card-body stack" id="ovData"></div></section>
        <section class="card" data-reveal aria-labelledby="ovR"><div class="card-head"><div><h2 class="card-title" id="ovR">Recent sessions</h2></div></div><div class="card-body stack" id="ovRecent"></div></section>
        <section class="card" data-reveal aria-labelledby="ovL"><div class="card-head"><div><h2 class="card-title" id="ovL">Learning progress</h2></div></div><div class="card-body stack" id="ovLearn"></div></section>
      </div>
      <h2 class="section-title" data-reveal>Modules</h2>
      <div class="mod-grid" data-reveal>${MODULES.map(([id, n, ic, d]) => `<a class="mod" href="#/${id}"><span class="mod-ic">${ui.icon(ic)}</span><b>${n}</b><small>${d}</small></a>`).join('')}</div>
      <div class="callout callout-warn" data-reveal>${ui.icon('info')}<div><strong>Scientific honesty.</strong> Signals in the live stream, the BCI playground and the training lab are <b>simulated</b>. Imported data is labelled <b>imported</b> everywhere. NeuroGrid is an educational tool: it is not a medical device, cannot read thoughts, and models trained here do not transfer to real EEG.</div></div>`;
    },
    init(root) { this.root = root; this.orb = NG.viz.Orb ? new NG.viz.Orb(U.$('#ovOrb', root)) : null; this.refresh(); },
    async refresh() {
      const root = this.root, st = engine.stats, prof = NG.sim.PROFILES[store.get('lab.profile')], ds = NG.data.current, pr = progress.get();
      U.$('#ovSim', root).innerHTML = `<div class="row wrap">${ui.sourceBadge('SIMULATED')}<span class="badge ${engine.running ? 'badge-live' : ''}">${engine.running ? 'Running' : 'Paused'}</span></div><dl class="kv"><div><dt>Profile</dt><dd>${U.esc(prof.name)}</dd></div><div><dt>Sampling</dt><dd>${engine.FS} Hz × 6 ch</dd></div><div><dt>Quality</dt><dd>${st.qualityLabel} · SNR ${st.snr.toFixed(1)} dB</dd></div><div><dt>Samples generated</dt><dd>${U.fmtInt(engine.generated)}</dd></div></dl><button class="btn btn-sm" id="ovToggle" type="button">${ui.icon(engine.running ? 'pause' : 'play')}<span>${engine.running ? 'Pause' : 'Resume'}</span></button>`;
      U.$('#ovToggle', root).addEventListener('click', () => { engine.toggle(); this.refresh(); });
      U.$('#ovData', root).innerHTML = ds ? `<div class="row wrap">${ui.sourceBadge('IMPORTED')}</div><dl class="kv"><div><dt>File</dt><dd>${U.esc(ds.filename)}</dd></div><div><dt>Shape</dt><dd>${U.fmtInt(ds.n)} samples × ${ds.channels.length} ch</dd></div><div><dt>Rate · duration</dt><dd>${ds.fs} Hz · ${U.fmtDuration(ds.duration)}</dd></div><div><dt>Units</dt><dd>${U.esc(ds.unit)}</dd></div></dl>` : `<div class="empty"><strong>No dataset imported</strong><span>The app is using simulated data only.</span></div><a class="btn btn-sm" href="#/data">Import a CSV</a>`;
      let sess = []; try { sess = (await NG.db.list('sessions')).slice(0, 3); } catch (e) { /* ignore */ }
      const old = engine.history().slice(0, 3 - sess.length);
      U.$('#ovRecent', root).innerHTML = sess.length || old.length ? `<ul class="hist">${sess.map((s) => `<li><div><b>${U.esc(s.name)}</b><small>${U.fmtDate(s.createdAt)} · ${U.fmtDuration(s.summary.durationSec)} · stored</small></div>${ui.sourceBadge('SIMULATED')}</li>`).join('')}${old.map((h) => `<li><div><b>${U.fmtDate(h.startedAt)}</b><small>${U.fmtDuration(h.durationSec)} · ${h.dominant}</small></div>${ui.sourceBadge('SIMULATED')}</li>`).join('')}</ul>` : '<div class="empty"><strong>No sessions yet</strong><span>Record one in Signal Lab. Nothing is pre-filled.</span></div>';
      const topics = Object.keys(pr.topics).length, ach = Object.keys(pr.ach).length, acc = pr.answered ? Math.round((pr.correct / pr.answered) * 100) : null;
      U.$('#ovLearn', root).innerHTML = `<dl class="kv"><div><dt>Learning topics opened</dt><dd>${topics} / 10</dd></div><div><dt>Questions answered</dt><dd>${pr.answered}${acc != null ? ` · ${acc}% correct` : ''}</dd></div><div><dt>Achievements</dt><dd>${ach} / ${progress.ACHIEVEMENTS.length}</dd></div><div><dt>Sections visited</dt><dd>${Object.keys(pr.visited).length} / 13</dd></div></dl><div class="bar"><i style="width:${(topics / 10) * 100}%"></i></div><a class="btn btn-sm" href="#/experiments">Continue learning</a>`;
    },
    show() { this.refresh(); this.offE = engine.on('run', () => this.refresh()); this.offP = progress.on('change', () => this.refresh()); this.offD = NG.data.on('change', () => this.refresh()); if (this.orb) { this.orb.fit(); NG.loop.add('view-ov', (dt) => this.orb.draw(dt)); } },
    hide() { [this.offE, this.offP, this.offD].forEach((f) => f && f()); NG.loop.remove('view-ov'); },
  };
})();
