/* NeuroGrid 3.0 — Signal Lab extension: channel comparison, quality table, frozen snapshot with zoom/pan and
 * two-marker cursor measurements. Extends NG.views.lab. All data here is the live SIMULATED stream. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, engine = NG.engine, dsp = NG.dsp, V = NG.views.lab, store = NG.store;
  const CH = store.CHANNEL_NAMES, FS = engine.FS, SNAP = 8 * FS;
  const S = { a: 'C3', b: 'C4', snap: null, total: 8, zoom: 1, pos: 0, m: [], hover: null, t0: 0 };

  const baseRender = V.render.bind(V);
  V.render = function () {
    const sel = (id, v) => `<select class="select" id="${id}" aria-label="Channel ${id === 'lxA' ? 'A' : 'B'}">${CH.map((c) => `<option ${c === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    return baseRender().replace(/<\/div>\s*$/, `<section class="card lx-card" data-reveal aria-labelledby="lxT" style="margin-top:16px"><div class="card-head"><div><h2 class="card-title" id="lxT">Channel comparison &amp; measurements <span class="badge badge-sim">Simulated</span></h2><p class="card-sub">Freeze the last 8 s of the live stream, overlay two channels, zoom, pan and measure with two markers. Quality columns use the simulator’s known ground truth.</p></div><button class="btn btn-primary" id="lxSnap" type="button">${ui.icon('layers')}<span>Capture snapshot</span></button></div>
      <div class="card-body stack"><div class="row wrap"><label class="field-inline"><span class="label">Channel A</span>${sel('lxA', S.a)}</label><label class="field-inline"><span class="label">Channel B</span>${sel('lxB', S.b)}</label><label class="field-inline"><span class="label">Zoom</span><input type="range" class="range" id="lxZoom" min="1" max="8" step="0.5" value="1" aria-label="Zoom"></label><label class="field-inline"><span class="label">Position</span><input type="range" class="range" id="lxPos" min="0" max="100" value="0" aria-label="Pan position"></label><button class="btn btn-ghost btn-sm" id="lxClr" type="button">Clear markers</button></div>
      <div class="canvas-wrap lx-wrap"><canvas id="lxCv" tabindex="0" role="img" aria-label="Frozen snapshot of two simulated channels"></canvas></div>
      <p class="hint" id="lxRead">Capture a snapshot, then hover to read values. Click twice to place two markers and measure Δt, frequency and ΔV.</p>
      <div id="lxStats"></div><div class="tbl-wrap"><table class="tbl" id="lxQ"></table></div></div></section></div>`);
  };

  const baseInit = V.init.bind(V);
  V.init = function (root) {
    baseInit(root); const $ = (s) => U.$(s, root), cv = $('#lxCv');
    $('#lxSnap').addEventListener('click', () => this.snapshot());
    $('#lxA').addEventListener('change', (e) => { S.a = e.target.value; if (S.snap) this.snapshot(true); });
    $('#lxB').addEventListener('change', (e) => { S.b = e.target.value; if (S.snap) this.snapshot(true); });
    $('#lxZoom').addEventListener('input', (e) => { S.zoom = +e.target.value; this.drawSnap(); });
    $('#lxPos').addEventListener('input', (e) => { S.pos = +e.target.value / 100; this.drawSnap(); });
    $('#lxClr').addEventListener('click', () => { S.m = []; this.drawSnap(); this.measure(); });
    const tOf = (e) => { const r = cv.getBoundingClientRect(), L = this.lxLayout(r.width); return S.t0 + ((e.clientX - r.left - L.x0) / (L.x1 - L.x0)) * L.span; };
    cv.addEventListener('mousemove', (e) => { if (!S.snap) return; S.hover = tOf(e); this.drawSnap(); this.readout(); });
    cv.addEventListener('mouseleave', () => { S.hover = null; this.drawSnap(); });
    cv.addEventListener('click', (e) => { if (!S.snap) return; const t = Math.max(0, Math.min(S.total, tOf(e))); S.m = S.m.length >= 2 ? [t] : S.m.concat(t); this.drawSnap(); this.measure(); });
    new ResizeObserver(() => this.drawSnap()).observe(cv);
    this.qualityTable();
    this.lxTimer = setInterval(() => { if (!this.visible || document.hidden) return; this.qualityTable(); }, 1500);
  };
  V.lxLayout = (w) => { const x0 = 44, x1 = w - 10, span = S.total / S.zoom; S.t0 = Math.max(0, Math.min(S.total - span, S.pos * (S.total - span))); return { x0, x1, span }; };

  V.snapshot = function (keepM) {
    const out = {}; let have = SNAP; [S.a, S.b].forEach((c) => { const buf = new Float32Array(SNAP); have = Math.min(have, engine.copyLast('total', engine.idxOf(c), SNAP, buf)); out[c] = buf; }); [S.a, S.b].forEach((c) => { out[c] = out[c].subarray(0, have); }); S.total = Math.max(0.5, have / FS);
    S.snap = out; if (!keepM) S.m = []; this.drawSnap(); this.measure(); this.pairStats();
  };
  V.drawSnap = function () {
    const cv = this.root && U.$('#lxCv', this.root); if (!cv) return; const { w, h, dpr } = U.fitCanvas(cv), ctx = cv.getContext('2d'), C = NG.theme.c; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (!S.snap) { ctx.fillStyle = C.text3 || '#8aa'; ctx.font = '500 12px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('No snapshot yet — press “Capture snapshot”', w / 2, h / 2); return; }
    const L = this.lxLayout(w), t1 = S.t0 + L.span, X = (t) => L.x0 + ((t - S.t0) / L.span) * (L.x1 - L.x0);
    const all = [S.a, S.b].flatMap((c) => Array.from(S.snap[c])), mx = Math.max(10, ...all.map(Math.abs)) * 1.1, Y = (v) => h / 2 - (v / mx) * (h / 2 - 16);
    ctx.strokeStyle = C.grid || 'rgba(255,255,255,.08)'; ctx.fillStyle = C.text3 || '#8aa'; ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'center';
    for (let t = Math.ceil(S.t0); t <= t1; t++) { const x = X(t); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 14); ctx.stroke(); ctx.fillText(t + 's', x, h - 3); }
    ctx.textAlign = 'right'; [-0.8, 0, 0.8].forEach((f) => { const v = f * mx, y = Y(v); ctx.beginPath(); ctx.moveTo(L.x0, y); ctx.lineTo(L.x1, y); ctx.stroke(); ctx.fillText(Math.round(v) + '', L.x0 - 4, y + 3); });
    [[S.a, C.accent], [S.b, C.violet]].forEach(([c, col], k) => { const d = S.snap[c]; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); const i0 = Math.max(0, Math.floor(S.t0 * FS)), i1 = Math.min(d.length - 1, Math.ceil(t1 * FS)); for (let i = i0; i <= i1; i++) { const x = X(i / FS), y = Y(d[i]); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(c, L.x0 + 6 + k * 40, 12); });
    S.m.forEach((t, i) => { if (t < S.t0 || t > t1) return; ctx.strokeStyle = C.amber; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(t), 0); ctx.lineTo(X(t), h - 14); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.amber; ctx.textAlign = 'left'; ctx.fillText('M' + (i + 1), X(t) + 3, 24); });
    if (S.hover != null && S.hover >= S.t0 && S.hover <= t1) { ctx.strokeStyle = C.text2 || '#ccd'; ctx.beginPath(); ctx.moveTo(X(S.hover), 0); ctx.lineTo(X(S.hover), h - 14); ctx.stroke(); }
    ctx.fillStyle = C.text3 || '#8aa'; ctx.textAlign = 'right'; ctx.fillText('µV · SIMULATED', w - 6, 12);
  };
  const at = (c, t) => S.snap[c][Math.max(0, Math.min(S.snap[c].length - 1, Math.round(t * FS)))];
  V.readout = function () { if (S.hover == null) return; U.$('#lxRead', this.root).textContent = `t = ${S.hover.toFixed(3)} s · ${S.a} ${at(S.a, S.hover).toFixed(1)} µV · ${S.b} ${at(S.b, S.hover).toFixed(1)} µV`; };
  V.measure = function () {
    const el = U.$('#lxRead', this.root); if (S.m.length < 2) { if (S.snap) el.textContent = S.m.length ? `Marker 1 at ${S.m[0].toFixed(3)} s — click again to place marker 2.` : 'Hover to read values. Click twice to place two markers.'; return; }
    const [t1, t2] = S.m, dt = Math.abs(t2 - t1); el.textContent = `Δt = ${(dt * 1000).toFixed(0)} ms (≈ ${(1 / Math.max(dt, 1e-6)).toFixed(1)} Hz if one cycle) · ΔV ${S.a} = ${(at(S.a, t2) - at(S.a, t1)).toFixed(1)} µV · ΔV ${S.b} = ${(at(S.b, t2) - at(S.b, t1)).toFixed(1)} µV`;
  };
  V.pairStats = function () {
    const a = S.snap[S.a], b = S.snap[S.b], n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    const r = saa && sbb ? sab / Math.sqrt(saa * sbb) : 0, st = (x) => { const p = dsp.welch(x, FS, 512), bp = dsp.bandPowers(p.psd, p.df); return { rms: Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length), p2p: dsp.peakToPeak(x), dom: dsp.BANDS[dsp.dominantBand(bp.rel)].name, pk: dsp.peakFrequency ? dsp.peakFrequency(p.psd, p.df, 1, 60) : NaN }; }, A = st(a), B = st(b);
    U.$('#lxStats', this.root).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>RMS (µV)</th><th>Peak-to-peak (µV)</th><th>Dominant band</th><th>Peak freq (Hz)</th></tr></thead><tbody>${[[S.a, A], [S.b, B]].map(([c, s]) => `<tr><td>${c}</td><td>${s.rms.toFixed(1)}</td><td>${s.p2p.toFixed(1)}</td><td>${s.dom}</td><td>${Number.isFinite(s.pk) ? (+s.pk).toFixed(1) : '—'}</td></tr>`).join('')}</tbody></table></div><p class="hint">Pearson correlation between ${S.a} and ${S.b} over this snapshot: <b>${r.toFixed(2)}</b>. In real EEG, nearby electrodes are correlated partly because of volume conduction, not only shared sources.</p>`;
  };
  V.qualityTable = function () {
    const q = U.$('#lxQ', this.root); if (!q) return; const n = FS * 2, tot = new Float32Array(n), cl = new Float32Array(n), nz = new Float32Array(n);
    const rows = CH.map((c) => { const i = engine.idxOf(c); engine.copyLast('total', i, n, tot); engine.copyLast('clean', i, n, cl); engine.copyLast('noise', i, n, nz); const ms = (x) => x.reduce((s, v) => s + v * v, 0) / n, snr = 10 * Math.log10(Math.max(1e-9, ms(cl)) / Math.max(1e-9, ms(nz))), rms = Math.sqrt(ms(tot)), flat = rms < 0.5; const label = flat ? 'Flat / no signal' : snr >= 10 ? 'Good' : snr >= 3 ? 'Fair' : 'Poor'; return `<tr><td>${c}</td><td>${rms.toFixed(1)}</td><td>${dsp.peakToPeak(tot).toFixed(0)}</td><td>${snr.toFixed(1)}</td><td><span class="badge ${label === 'Good' ? 'badge-ok' : label === 'Fair' ? 'badge-sim' : 'badge-bad'}">${label}</span></td></tr>`; });
    q.innerHTML = `<thead><tr><th>Channel</th><th>RMS (µV)</th><th>Peak-to-peak (µV)</th><th>SNR (dB, simulator truth)</th><th>Quality</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  };
  const baseHide = V.hide.bind(V); V.hide = function () { baseHide(); this.visible = false; }; const baseShow = V.show.bind(V); V.show = function () { baseShow(); this.visible = true; this.qualityTable(); };
})();
