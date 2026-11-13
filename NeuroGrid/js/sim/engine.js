/* NeuroGrid — the live simulation engine.
 * Owns the generator, the rolling sample buffers, the 10 Hz analysis tick
 * (real FFT / band power / RMS / SNR on the simulated signal) and the session recorder.
 * It runs for the whole page lifetime; views just subscribe to its events. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const { Generator, CHANNELS, PROFILES, PROFILE_ORDER } = NG.sim;
  const dsp = NG.dsp, U = NG.util, store = NG.store;

  const FS = 256, CAP = 4096, MASK = CAP - 1, NFFT = 512, MAX_SESSION_SEC = 600;
  const SESSIONS_KEY = 'neurogrid.v2.sessions';
  const nCh = CHANNELS.length;
  const idxOf = (name) => Math.max(0, CHANNELS.findIndex((c) => c.name === name));

  const engine = (NG.engine = U.emitter({ FS, CAP, NFFT, MAX_SESSION_SEC, channels: CHANNELS }));
  const gen = new Generator({ fs: FS, seed: 20260701 });
  const rings = { total: [], clean: [], noise: [] };
  for (let c = 0; c < nCh; c++) for (const k of Object.keys(rings)) rings[k].push(new Float32Array(CAP));

  let wp = 0, base = 0, acc = 0, statTimer = 0, running = true, speed = 1;
  const tmp = new Float32Array(NFFT), tmpC = new Float32Array(FS), tmpN = new Float32Array(FS), tmpP = new Float64Array(NFFT / 2 + 1);
  const psd = new Float64Array(NFFT / 2 + 1);
  let psdFresh = true;
  const stats = { t: 0, ch: 'C3', rms: 0, power: 0, p2p: 0, snr: 60, quality: 1, qualityLabel: 'Excellent', rel: [0, 0, 0, 0, 0], abs: [0, 0, 0, 0, 0], total: 0, dominant: 2, peakHz: 10, centroid: 10, samples: 0, profile: 'calm' };

  Object.assign(engine, { psd, df: FS / NFFT, stats, gen });
  Object.defineProperties(engine, {
    total: { get: () => wp }, generated: { get: () => wp - base }, running: { get: () => running }, speed: { get: () => speed },
  });

  /* ---------------- parameters follow the store ---------------- */
  function applyParams() {
    const lab = store.get('lab');
    Object.assign(gen.params, { amplitude: lab.amplitude / 100, noise: lab.noise / 100, line: lab.line / 100, drift: lab.drift / 100, mains: store.get('ui.mains') });
    speed = lab.speed;
    if (lab.profile === 'custom') gen.setCustomBands(lab.custom);
  }
  let lastProfile = store.get('lab.profile');
  function applyProfile(initial) {
    const id = store.get('lab.profile');
    gen.setProfile(PROFILES[id], store.get('lab.custom'), !!initial);
    if (!initial && id !== lastProfile) {
      if (session.state === 'recording') session.events.push({ t: session.samples / FS, type: 'profile', detail: PROFILES[id].name });
      engine.emit('profile', id);
    }
    lastProfile = id;
    psdFresh = false;
  }
  store.on('lab', () => { applyParams(); applyProfile(false); });
  store.on('ui.mains', applyParams);
  store.on('reset', () => { applyParams(); applyProfile(false); });
  applyParams(); applyProfile(true);

  /* ---------------- buffers ---------------- */
  /** Copy the newest `n` samples (chronological) of kind 'total' | 'clean' | 'noise' into out; returns count. */
  engine.copyLast = (kind, ch, n, out) => {
    const ring = rings[kind][ch]; n = Math.min(n, wp, CAP);
    const start = wp - n;
    for (let i = 0; i < n; i++) out[i] = ring[(start + i) & MASK];
    return n;
  };
  engine.idxOf = idxOf;

  /* ---------------- control ---------------- */
  engine.pause = () => { if (!running) return; running = false; engine.emit('run', false); };
  engine.resume = () => { if (running) return; running = true; engine.emit('run', true); };
  engine.toggle = () => (running ? engine.pause() : engine.resume());
  engine.reset = () => {
    if (session.state === 'recording') engine.discardSession();
    for (const k of Object.keys(rings)) for (const r of rings[k]) r.fill(0);
    wp = 0; base = 0; acc = 0; statTimer = 0; psdFresh = true;
    gen.reseed(20260701 + Math.floor(Math.random() * 1000));
    applyProfile(true);
    computeStats(); engine.emit('reset');
  };

  /* ---------------- session recorder ---------------- */
  const session = (engine.session = {
    state: 'idle', // idle | recording | stopped
    id: null, startedAt: null, samples: 0, buf: null, prof: null, cap: 0, events: [], profSamples: new Float64Array(PROFILE_ORDER.length), accum: null, summary: null,
    get duration() { return this.samples / FS; },
  });
  const newAccum = () => ({ n: 0, rel: [0, 0, 0, 0, 0], rms: 0, snr: 0 });
  function ensureCap(minSamples) {
    if (session.cap >= minSamples) return;
    const cap = Math.min(MAX_SESSION_SEC * FS + FS, Math.max(FS * 60, session.cap * 2, minSamples));
    const nb = new Float32Array(cap * nCh), np = new Uint8Array(cap);
    if (session.buf) { nb.set(session.buf.subarray(0, session.samples * nCh)); np.set(session.prof.subarray(0, session.samples)); }
    session.buf = nb; session.prof = np; session.cap = cap;
  }
  engine.startSession = () => {
    if (session.state === 'recording') return false;
    Object.assign(session, { state: 'recording', id: 'S' + Date.now().toString(36), startedAt: new Date(), samples: 0, events: [{ t: 0, type: 'start', detail: PROFILES[store.get('lab.profile')].name }], summary: null, accum: newAccum() });
    session.profSamples.fill(0); session.buf = null; session.cap = 0; ensureCap(FS * 60);
    engine.emit('session', { type: 'start' });
    return true;
  };
  function finalize(reason) {
    const secs = session.samples / FS, a = session.accum, n = Math.max(1, a.n);
    const dom = dsp.dominantBand(a.rel.map((v) => v / n));
    const share = {}; PROFILE_ORDER.forEach((id, i) => { if (session.profSamples[i] > 0) share[id] = +(session.profSamples[i] / FS).toFixed(2); });
    return {
      id: session.id, startedAt: session.startedAt.toISOString(), endedAt: new Date().toISOString(), durationSec: +secs.toFixed(2), samples: session.samples, fs: FS,
      channels: CHANNELS.map((c) => c.name), meanRel: a.rel.map((v) => +(v / n).toFixed(4)), dominant: dsp.BANDS[dom].name, meanRms: +(a.rms / n).toFixed(2), meanSnr: +(a.snr / n).toFixed(1),
      profileSeconds: share, stopReason: reason || 'user', simulated: true, analysisChannel: store.get('lab.channel'),
    };
  }
  engine.stopSession = (reason) => {
    if (session.state !== 'recording') return null;
    session.state = 'stopped';
    if (session.samples < FS) { session.summary = null; engine.emit('session', { type: 'stop', summary: null, tooShort: true }); return null; }
    const summary = (session.summary = finalize(reason));
    const hist = NG.storage.get(SESSIONS_KEY, []); hist.unshift(summary); NG.storage.set(SESSIONS_KEY, hist.slice(0, 20));
    if (summary.durationSec >= 10) NG.progress.unlock('recorder');
    engine.emit('session', { type: 'stop', summary });
    return summary;
  };
  engine.discardSession = () => {
    Object.assign(session, { state: 'idle', samples: 0, buf: null, prof: null, cap: 0, summary: null, events: [], accum: null });
    session.profSamples.fill(0);
    engine.emit('session', { type: 'discard' });
  };
  engine.history = () => NG.storage.get(SESSIONS_KEY, []);
  engine.deleteHistory = (id) => { NG.storage.set(SESSIONS_KEY, engine.history().filter((s) => s.id !== id)); engine.emit('session', { type: 'history' }); };
  engine.clearHistory = () => { NG.storage.remove(SESSIONS_KEY); engine.emit('session', { type: 'history' }); };
  engine.hasSessionData = () => session.state !== 'idle' && session.samples > 0;

  /** Recorded samples → CSV (every row labelled SIMULATED). */
  engine.sessionCsv = () => {
    if (!session.buf || !session.samples) return null;
    const head = ['sample_index', 'time_s', 'profile', ...CHANNELS.map((c) => c.name + '_uV'), 'data_source'];
    const parts = [head.join(',')], CH = 4000;
    for (let s0 = 0; s0 < session.samples; s0 += CH) {
      const lines = [], end = Math.min(session.samples, s0 + CH);
      for (let i = s0; i < end; i++) {
        let l = i + ',' + (i / FS).toFixed(5) + ',' + PROFILE_ORDER[session.prof[i]];
        for (let c = 0; c < nCh; c++) l += ',' + session.buf[i * nCh + c].toFixed(3);
        lines.push(l + ',SIMULATED');
      }
      parts.push(lines.join('\n'));
    }
    return parts.join('\n') + '\n';
  };

  /* ---------------- per-frame advance ---------------- */
  engine.advance = (dt) => {
    if (!running) return;
    acc += dt * FS * speed;
    let n = Math.floor(acc); acc -= n; n = Math.min(n, 1200);
    const profIdx = PROFILE_ORDER.indexOf(lastProfile), rec = session.state === 'recording';
    for (let i = 0; i < n; i++) {
      gen.step();
      const pos = wp & MASK;
      for (let c = 0; c < nCh; c++) { rings.total[c][pos] = gen.total[c]; rings.clean[c][pos] = gen.clean[c]; rings.noise[c][pos] = gen.noise[c]; }
      wp++;
      if (rec && session.state === 'recording') {
        ensureCap(session.samples + 1);
        const o = session.samples * nCh;
        for (let c = 0; c < nCh; c++) session.buf[o + c] = gen.total[c];
        session.prof[session.samples] = profIdx; session.profSamples[profIdx]++; session.samples++;
        if (session.samples >= MAX_SESSION_SEC * FS) { engine.stopSession('limit'); break; }
      }
    }
    statTimer += dt;
    if (statTimer >= 0.1 && n > 0) { statTimer = 0; computeStats(); }
  };

  /* ---------------- analysis (all computed from the simulated buffers) ---------------- */
  function computeStats() {
    const ci = idxOf(store.get('lab.channel')), have = engine.copyLast('total', ci, NFFT, tmp);
    if (have < 64) { stats.samples = wp - base; stats.t = wp / FS; engine.emit('stats', stats); return; }
    dsp.periodogram(tmp.subarray(0, have), FS, NFFT, tmpP);
    if (psdFresh) { psd.set(tmpP); psdFresh = false; } else for (let k = 0; k < psd.length; k++) psd[k] += (tmpP[k] - psd[k]) * 0.3;
    const bp = dsp.bandPowers(psd, FS / NFFT);
    const n1 = engine.copyLast('total', ci, FS, tmp);
    const nc = engine.copyLast('clean', ci, FS, tmpC), nn = engine.copyLast('noise', ci, FS, tmpN);
    const x = tmp.subarray(0, n1), snr = dsp.snrDb(tmpC.subarray(0, nc), tmpN.subarray(0, nn));
    Object.assign(stats, {
      t: wp / FS, ch: CHANNELS[ci].name, rms: dsp.rms(x), power: dsp.meanSquare(x), p2p: dsp.peakToPeak(x), snr,
      quality: U.clamp((snr + 4) / 28, 0, 1), qualityLabel: snr >= 20 ? 'Excellent' : snr >= 12 ? 'Good' : snr >= 6 ? 'Fair' : 'Poor',
      rel: bp.rel, abs: bp.abs, total: bp.total, dominant: dsp.dominantBand(bp.rel),
      peakHz: dsp.peakFrequency(psd, FS / NFFT, 1, 45), centroid: dsp.spectralCentroid(psd, FS / NFFT, 1, 40), samples: wp - base, profile: store.get('lab.profile'),
    });
    if (session.state === 'recording' && session.accum) {
      const a = session.accum; a.n++; for (let b = 0; b < 5; b++) a.rel[b] += bp.rel[b]; a.rms += stats.rms; a.snr += snr;
    }
    engine.emit('stats', stats);
  }
  engine.computeStats = computeStats;

  /* prime the buffers so the first frame already shows a signal (warm-up only: the visible counter starts from zero) */
  (function prime() { const n = FS * 6; for (let i = 0; i < n; i++) { gen.step(); const pos = wp & MASK; for (let c = 0; c < nCh; c++) { rings.total[c][pos] = gen.total[c]; rings.clean[c][pos] = gen.clean[c]; rings.noise[c][pos] = gen.noise[c]; } wp++; } base = wp; computeStats(); })();
})();
