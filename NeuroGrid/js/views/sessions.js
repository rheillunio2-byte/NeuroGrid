/* NeuroGrid — Sessions & Export: record simulated sessions, review summaries, export CSV. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, engine = NG.engine, progress = NG.progress, dsp = NG.dsp;
  const { PROFILES } = NG.sim;
  NG.views = NG.views || {};

  NG.views.sessions = {
    id: 'sessions', title: 'Sessions & Export', icon: 'record',
    render() {
      return `${ui.pageHead('06 · Sessions & Export', 'Record, review, <em>export</em>', 'Start a monitoring session to capture the simulated stream, then export the samples as CSV. Nothing is recorded until you press Start, and every exported file is labelled as simulated.')}
      <div class="sess-layout">
        <section class="card sess-current" data-reveal aria-labelledby="seT"><div class="card-head"><div><h2 class="card-title" id="seT">Current session <span class="badge" id="seBadge">Idle</span></h2><p class="card-sub" id="seSub"></p></div></div><div class="card-body stack" id="seBody"></div></section>
        <section class="card" data-reveal aria-labelledby="shT"><div class="card-head"><div><h2 class="card-title" id="shT">Saved session summaries</h2><p class="card-sub">Summaries are stored in this browser. Raw samples are kept in memory only, so CSV export is available for the most recent session until you reload the page.</p></div><button class="link-btn" id="shClear" type="button">Clear all</button></div><div class="card-body" id="shBody"></div></section>
        <section class="card" data-reveal aria-labelledby="exT"><div class="card-head"><div><h2 class="card-title" id="exT">Experiment results</h2><p class="card-sub">Answers from the Experiments section</p></div></div><div class="card-body stack" id="exBody"></div></section>
        <section class="card" data-reveal aria-labelledby="stoT"><div class="card-head"><div><h2 class="card-title" id="stoT">Data on this device</h2><p class="card-sub">NeuroGrid stores preferences, progress and session summaries in your browser’s local storage. Nothing is sent anywhere.</p></div></div><div class="card-body stack" id="stoBody"></div></section>
      </div>`;
    },
    init(root) {
      this.root = root;
      U.$('#shClear', root).addEventListener('click', async () => { if (!engine.history().length) { ui.toast('There are no saved summaries to clear.'); return; } if (await ui.modal.confirm({ title: 'Clear saved summaries?', message: 'Deletes every saved session summary from this browser.', confirmText: 'Clear all', danger: true })) { engine.clearHistory(); ui.toast('Saved summaries cleared.'); } });
      this.refresh();
    },
    show() {
      this.refresh();
      this.off = [engine.on('session', () => this.refresh()), engine.on('stats', () => this.tick()), progress.on('change', () => this.renderExp())];
    },
    hide() { (this.off || []).forEach((f) => f && f()); this.off = []; },
    refresh() { this.renderCurrent(); this.renderHistory(); this.renderExp(); this.renderStorage(); },

    tick() { const s = engine.session; if (s.state !== 'recording') return; const d = U.$('#seDur', this.root), n = U.$('#seSamples', this.root); if (d) { d.textContent = U.fmtClock(s.duration); n.textContent = U.fmtInt(s.samples); U.$('#seBar', this.root).style.width = Math.min(100, (s.duration / engine.MAX_SESSION_SEC) * 100) + '%'; } },

    renderCurrent() {
      const s = engine.session, body = U.$('#seBody', this.root), badge = U.$('#seBadge', this.root), sub = U.$('#seSub', this.root);
      badge.textContent = { idle: 'Idle', recording: 'Recording', stopped: 'Finished' }[s.state]; badge.className = 'badge ' + (s.state === 'recording' ? 'badge-bad' : s.state === 'stopped' ? 'badge-ok' : '');
      if (s.state === 'idle') {
        sub.textContent = 'No session is running — no data has been collected.';
        body.innerHTML = `<div class="empty"><strong>Not recording</strong><span>Press Start to capture up to ${engine.MAX_SESSION_SEC / 60} minutes of the simulated 6-channel stream at 256 Hz.</span></div><div class="row wrap"><button class="btn btn-primary" id="seStart" type="button">${ui.icon('record')}<span>Start recording</span></button>${engine.running ? '' : '<span class="hint">The stream is paused — resume it in the Signal Lab to capture samples.</span>'}</div>`;
        U.$('#seStart', body).addEventListener('click', () => { engine.startSession(); NG.sound.play('start'); ui.toast('Recording simulated samples…', { icon: 'record' }); });
        return;
      }
      if (s.state === 'recording') {
        sub.textContent = `Started ${U.fmtDate(s.startedAt.toISOString())} · profile changes are logged`;
        body.innerHTML = `<div class="stats-grid"><div class="stat"><div class="stat-k">Duration</div><div class="stat-v tnum" id="seDur">${U.fmtClock(s.duration)}</div></div><div class="stat"><div class="stat-k">Samples / channel</div><div class="stat-v tnum" id="seSamples">${U.fmtInt(s.samples)}</div></div><div class="stat"><div class="stat-k">Channels</div><div class="stat-v">6<small>@ 256 Hz</small></div></div></div><div class="bar"><i id="seBar" style="width:${(s.duration / engine.MAX_SESSION_SEC) * 100}%"></i></div><p class="hint">Auto-stops at ${engine.MAX_SESSION_SEC / 60} minutes.${engine.running ? '' : ' The stream is paused, so no new samples are being captured.'}</p>${this.eventsHtml(s)}<div class="row wrap"><button class="btn btn-danger" id="seStop" type="button">${ui.icon('stop')}<span>Stop &amp; save</span></button><button class="btn btn-ghost" id="seDiscard" type="button">${ui.icon('trash')}<span>Discard</span></button></div>`;
        U.$('#seStop', body).addEventListener('click', () => { const r = engine.stopSession(); if (!r) ui.toast('Recording was shorter than 1 second, so nothing was saved.', { type: 'warn' }); else { NG.sound.play('stop'); ui.toast(`Saved a ${U.fmtDuration(r.durationSec)} simulated session.`, { type: 'success' }); } });
        U.$('#seDiscard', body).addEventListener('click', () => { engine.discardSession(); ui.toast('Recording discarded.'); });
        return;
      }
      const m = s.summary; sub.textContent = m ? `Finished ${U.fmtDate(m.endedAt)}` : 'The recording was too short to keep.';
      if (!m) { body.innerHTML = `<div class="empty"><strong>Nothing to save</strong><span>Sessions shorter than 1 second are not kept.</span></div><button class="btn" id="seNew" type="button">New session</button>`; U.$('#seNew', body).addEventListener('click', () => { engine.discardSession(); }); return; }
      body.innerHTML = `${this.summaryHtml(m)}${this.eventsHtml(s)}<div class="row wrap"><button class="btn btn-primary" id="seCsv" type="button">${ui.icon('download')}<span>Export samples (CSV)</span></button><button class="btn" id="seSum" type="button">${ui.icon('file')}<span>Export summary (CSV)</span></button><button class="btn btn-ghost" id="seNew" type="button">${ui.icon('refresh')}<span>New session</span></button></div><p class="hint">${ui.icon('info', 'i-sm')} Files contain a <span class="mono">data_source = SIMULATED</span> column and are named “simulated”.</p>`;
      U.$('#seCsv', body).addEventListener('click', () => this.exportSamples()); U.$('#seSum', body).addEventListener('click', () => this.exportSummary(m)); U.$('#seNew', body).addEventListener('click', () => engine.discardSession());
    },
    summaryHtml(m) {
      return `<div class="stats-grid"><div class="stat"><div class="stat-k">Duration</div><div class="stat-v">${U.fmtDuration(m.durationSec)}</div></div><div class="stat"><div class="stat-k">Samples / channel</div><div class="stat-v">${U.fmtInt(m.samples)}</div></div><div class="stat"><div class="stat-k">Dominant band</div><div class="stat-v">${m.dominant}</div></div><div class="stat"><div class="stat-k">Mean RMS</div><div class="stat-v">${m.meanRms}<small>µV</small></div></div><div class="stat"><div class="stat-k">Mean SNR</div><div class="stat-v">${m.meanSnr}<small>dB</small></div></div></div>
      <div><span class="label">Average relative band power (${m.analysisChannel})</span><div class="band-list compact">${dsp.BANDS.map((b, i) => `<div class="band-row static" style="--c:var(--band-${b.id})"><span class="band-sym">${b.sym}</span><span class="band-name"><b>${b.name}</b></span><span class="band-bar"><i style="width:${m.meanRel[i] * 100}%"></i></span><span class="band-pct mono tnum">${Math.round(m.meanRel[i] * 100)}%</span></div>`).join('')}</div></div>`;
    },
    eventsHtml(s) { return `<div><span class="label">Event log</span><ol class="events">${s.events.slice(-8).map((e) => `<li><span class="mono tnum">${U.fmtClock(e.t).slice(3)}</span>${e.type === 'start' ? 'Started with' : 'Profile changed to'} <b>${U.esc(e.detail)}</b></li>`).join('')}</ol></div>`; },

    renderHistory() {
      const hist = engine.history(), body = U.$('#shBody', this.root);
      if (!hist.length) { body.innerHTML = '<div class="empty"><strong>No saved sessions</strong><span>Record a session and its summary will appear here. Nothing is pre-filled.</span></div>'; return; }
      body.innerHTML = `<ul class="hist">${hist.map((h) => `<li><div><b>${U.fmtDate(h.startedAt)}</b><small>${U.fmtDuration(h.durationSec)} · dominant ${h.dominant} · RMS ${h.meanRms} µV · SNR ${h.meanSnr} dB${h.stopReason === 'limit' ? ' · auto-stopped' : ''}</small></div><span class="badge badge-sim">Simulated</span><button class="btn btn-icon btn-ghost btn-sm" type="button" data-del="${h.id}" aria-label="Delete this summary">${ui.icon('trash')}</button></li>`).join('')}</ul>`;
      U.$$('[data-del]', body).forEach((b) => b.addEventListener('click', () => { engine.deleteHistory(b.dataset.del); ui.toast('Summary deleted.'); }));
    },
    renderExp() {
      const s = progress.get(), body = U.$('#exBody', this.root), n = s.history.length;
      body.innerHTML = n ? `<dl class="kv"><div><dt>Answers recorded</dt><dd>${n}</dd></div><div><dt>Overall accuracy</dt><dd>${s.answered ? Math.round((s.correct / s.answered) * 100) : '—'}%</dd></div></dl><div class="row wrap"><button class="btn btn-primary" id="exCsv" type="button">${ui.icon('download')}<span>Export results (CSV)</span></button><button class="btn btn-danger btn-sm" id="exReset" type="button">${ui.icon('trash')}<span>Reset results</span></button></div>` : '<div class="empty"><strong>No experiment results yet</strong><span>Play a round in Experiments and your answers will be listed here.</span></div>';
      const c = U.$('#exCsv', body); if (c) { c.addEventListener('click', () => NG.views.experiments.exportCsv()); U.$('#exReset', body).addEventListener('click', async () => { if (await ui.modal.confirm({ title: 'Reset experiment results?', message: 'Deletes all answers, scores and achievements on this device.', confirmText: 'Reset', danger: true })) { progress.reset(); ui.toast('Experiment results reset.'); } }); }
    },
    renderStorage() {
      const body = U.$('#stoBody', this.root), use = NG.storage.usage();
      body.innerHTML = `<dl class="kv"><div><dt>Local storage</dt><dd>${NG.storage.ok ? 'available' : 'blocked — using memory only'}</dd></div><div><dt>Space used by NeuroGrid</dt><dd>${use > 1024 ? (use / 1024).toFixed(1) + ' KB' : use + ' B'}</dd></div></dl><button class="btn btn-danger btn-sm" id="stoAll" type="button">${ui.icon('trash')}<span>Delete all NeuroGrid data</span></button>`;
      U.$('#stoAll', body).addEventListener('click', () => NG.app.resetAll());
    },

    exportSamples() {
      const csv = engine.sessionCsv();
      if (!csv) { ui.toast('No samples are available — samples are kept in memory only for the latest session.', { type: 'warn' }); return; }
      U.download(`neurogrid-simulated-session-${U.stamp()}.csv`, csv);
      ui.toast(`Exported ${U.fmtInt(engine.session.samples)} samples × 6 channels.`, { type: 'success', title: 'CSV saved' });
    },
    exportSummary(m) {
      const rows = [['data_source', 'SIMULATED'], ['session_id', m.id], ['started_at', m.startedAt], ['ended_at', m.endedAt], ['duration_s', m.durationSec], ['samples_per_channel', m.samples], ['sampling_rate_hz', m.fs], ['channels', m.channels.join(' ')], ['analysis_channel', m.analysisChannel], ['dominant_band', m.dominant], ['mean_rms_uV', m.meanRms], ['mean_snr_dB', m.meanSnr], ...dsp.BANDS.map((b, i) => [`mean_relative_${b.id}`, m.meanRel[i]]), ...Object.entries(m.profileSeconds).map(([k, v]) => [`seconds_in_${k}`, v]), ['stop_reason', m.stopReason]];
      U.download(`neurogrid-simulated-session-summary-${U.stamp()}.csv`, NG.csv.toCsv(['field', 'value'], rows)); ui.toast('Summary exported.', { type: 'success' });
    },
  };
  void PROFILES;
})();
