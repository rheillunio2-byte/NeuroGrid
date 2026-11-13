/* NeuroGrid — EEG topography: schematic 10–20 scalp map with band power at the sampled electrodes. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, engine = NG.engine, dsp = NG.dsp, sim = NG.sim, topo = NG.topo;
  NG.views = NG.views || {};
  const S = { source: 'live', band: 2, metric: 'rel', cmap: 'inferno', interp: false, labels: true, sel: 'O1', map: {} };

  NG.views.topography = {
    id: 'topography', title: 'EEG Topography', icon: 'head',
    render() {
      return `${ui.pageHead('04 · EEG Topography', 'Where the <em>power</em> sits on the scalp', 'A top-down view of the head (nose at the top) on the 10–20 electrode layout. Filled circles are electrodes that this dataset actually measures; hollow circles are standard positions with no data.')}
      <div class="tp-layout">
        <section class="card tp-main" data-reveal aria-labelledby="tpT"><div class="card-head"><div><h2 class="card-title" id="tpT">Band power map <span id="tpSrc"></span></h2><p class="card-sub" id="tpSub"></p></div></div>
          <div class="canvas-wrap tp-wrap"><canvas id="tpCv" tabindex="0" role="img" aria-label="Schematic scalp map of band power at the available electrodes"></canvas></div>
          <div class="tp-legend" id="tpLegend"></div></section>
        <section class="card" data-reveal aria-labelledby="tpCT"><div class="card-head"><div><h2 class="card-title" id="tpCT">Display</h2></div></div><div class="card-body stack" id="tpCtl"></div></section>
        <section class="card" data-reveal aria-labelledby="tpIT"><div class="card-head"><div><h2 class="card-title" id="tpIT">Electrode</h2><p class="card-sub" id="tpIsub">Click an electrode</p></div></div><div class="card-body stack" id="tpInfo"></div></section>
        <section class="card tp-warn" data-reveal><div class="card-body"><div class="callout callout-warn">${ui.icon('alert')}<div><strong>Sparse coverage — read with care.</strong> Only the electrodes with filled circles are measured. Scalp EEG has coarse spatial resolution: each electrode sums activity from a wide patch of cortex and is blurred by the skull, so a map from a handful of sites cannot localise brain sources. The 10–20 layout itself is a coarse standard (about 19 sites); the positions drawn here are a schematic projection, not individual head measurements. When “interpolated estimate” is on, colours between electrodes are a mathematical guess (inverse-distance weighting) and fade out away from real sensors — they are <em>not</em> measurements.</div></div></div></section>
      </div>`;
    },
    init(root) {
      this.root = root; this.view = null; this.cv = U.$('#tpCv', root); this.ctx = this.cv.getContext('2d'); this.vals = {}; this.pos = [];
      this.ro = new ResizeObserver(() => { U.fitCanvas(this.cv); this.draw(); }); this.ro.observe(this.cv);
      const c = U.$('#tpCtl', root);
      this.cSrc = ui.segField({ label: 'Data source', value: S.source, options: [{ value: 'live', label: 'Live (simulated)' }, { value: 'imported', label: 'Imported' }], onChange: (v) => { S.source = v; this.compute(); this.buildMap(); } });
      this.cBand = ui.segField({ label: 'Frequency band', value: S.band, options: dsp.BANDS.map((b, i) => ({ value: i, label: b.sym + ' ' + b.name, tip: `${b.lo}–${b.hi} Hz` })), onChange: (v) => { S.band = +v; this.compute(); } });
      this.cMet = ui.segField({ label: 'Measure', value: S.metric, options: [{ value: 'rel', label: 'Relative power' }, { value: 'abs', label: 'Absolute (log)' }], hint: 'Relative = share of total power 0.5–45 Hz. Absolute = log10 of band power.', onChange: (v) => { S.metric = v; this.compute(); } });
      this.cMap = ui.segField({ label: 'Colour map', value: S.cmap, options: Object.entries(NG.colormaps.NAMES).map(([v, l]) => ({ value: v, label: l })), onChange: (v) => { S.cmap = v; this.draw(); } });
      this.cInt = ui.switchField('Show interpolated estimate', S.interp, 'Off by default: shows only real measurements.', (v) => { S.interp = v; this.draw(); });
      this.cLab = ui.switchField('Electrode labels', S.labels, '', (v) => { S.labels = v; this.draw(); });
      this.mapBox = U.h('div.stack'); c.append(this.cSrc.el, this.cBand.el, this.cMet.el, this.cMap.el, this.cInt, this.cLab, this.mapBox);
      const pos = (e) => { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this.cv.addEventListener('pointermove', (e) => { const h = this.hit(pos(e)); if (h !== this.hover) { this.hover = h; this.draw(); } this.cv.style.cursor = h ? 'pointer' : 'default'; });
      this.cv.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      this.cv.addEventListener('click', (e) => { const h = this.hit(pos(e)); if (h) { S.sel = h; this.info(); this.draw(); } });
      this.cv.addEventListener('keydown', (e) => { const L = topo.ELECTRODES, i = L.findIndex((x) => x.n === S.sel); if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { S.sel = L[(i + 1) % L.length].n; } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { S.sel = L[(i - 1 + L.length) % L.length].n; } else return; e.preventDefault(); this.info(); this.draw(); });
    },
    buildMap() {
      const b = this.mapBox; b.innerHTML = ''; const ds = NG.data.current; if (S.source !== 'imported') return;
      if (!ds) { b.append(U.html('<div class="empty"><strong>No dataset imported</strong><span>Import a CSV in Data Import first.</span></div>')); return; }
      b.append(U.h('span.label', 'Map columns to electrodes'));
      ds.channels.forEach((ch) => { const guess = topo.byName(ch.name) ? ch.name : ''; if (S.map[ds.id + ch.name] === undefined) S.map[ds.id + ch.name] = guess;
        const f = ui.selectField({ label: ch.name, value: S.map[ds.id + ch.name], options: [['', '— not mapped —'], ...topo.ELECTRODES.map((e) => [e.n, e.n + ' · ' + e.region])], onChange: (v) => { S.map[ds.id + ch.name] = v; this.compute(); } }); b.append(f.el); });
      b.append(U.h('p.hint', 'Names that match a 10–20 label are mapped automatically. Check that the mapping is right — NeuroGrid cannot know where your electrodes were.'));
    },
    compute() {
      const vals = {}, bi = S.band, ds = NG.data.current; let src = 'SIMULATED', note = '';
      const feed = (name, x, fs) => { const nper = Math.min(512, 1 << Math.floor(Math.log2(x.length))); if (nper < 64) return; const w = dsp.welch(x, fs, nper, 0.5), bp = dsp.bandPowers(w.psd, w.df); vals[name] = { rel: bp.rel[bi], abs: Math.log10(Math.max(1e-9, bp.abs[bi])), all: bp }; };
      if (S.source === 'live') { const buf = new Float32Array(engine.CAP); sim.CHANNELS.forEach((c) => { const n = engine.copyLast('total', engine.idxOf(c.name), 2048, buf); feed(c.name, buf.subarray(0, n), engine.FS); }); note = 'last 8 s of the live simulated stream'; }
      else if (ds) { src = 'IMPORTED'; ds.channels.forEach((ch) => { const e = S.map[ds.id + ch.name]; if (e) feed(e, ch.data.length > 8192 ? ch.data.subarray(0, 8192) : ch.data, ds.fs); }); note = `${ds.filename} (first ${Math.min(32, ds.duration).toFixed(0)} s)`; }
      this.vals = vals; this.src = src; U.$('#tpSrc', this.root).innerHTML = ui.sourceBadge(src);
      const n = Object.keys(vals).length, b = dsp.BANDS[bi]; U.$('#tpSub', this.root).textContent = n ? `${b.name} (${b.lo}–${b.hi} Hz) · ${S.metric === 'rel' ? 'relative' : 'absolute log10'} power · ${n} measured electrode${n > 1 ? 's' : ''} · ${note}` : 'No electrodes with data. Map channels to electrodes first.';
      this.range(); this.info(); this.draw();
    },
    range() { const v = Object.values(this.vals).map((o) => o[S.metric]); if (!v.length) { this.lo = 0; this.hi = 1; return; } let lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < 1e-6) { lo -= 0.5; hi += 0.5; } this.lo = lo; this.hi = hi; },
    layout() { const w = this.cv.clientWidth, h = this.cv.clientHeight, r = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2 + r * 0.05; return { w, h, r, cx, cy }; },
    p(e, L) { return { x: L.cx + e.x * L.r, y: L.cy - e.y * L.r }; },
    hit(pt) { const L = this.layout(); let best = null, bd = 22 * 22; for (const e of topo.ELECTRODES) { const q = this.p(e, L), d = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2; if (d < bd) { bd = d; best = e.n; } } return best; },
    draw() {
      const f = U.fitCanvas(this.cv), ctx = this.ctx, C = NG.theme.c; ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, f.w, f.h); const L = this.layout(), { cx, cy, r } = L;
      const col = (v, a = 1) => { const t = (v - this.lo) / (this.hi - this.lo), c = NG.colormaps.color(S.cmap, t); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };
      // optional interpolated estimate (clearly secondary)
      const pts = topo.ELECTRODES.filter((e) => this.vals[e.n]).map((e) => ({ x: e.x, y: e.y, v: this.vals[e.n][S.metric] }));
      if (S.interp && pts.length >= 3) { const g = topo.grid(pts, 40, 2), cell = (2 * r) / 40; for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) { const k = j * 40 + i; if (g.v[k] !== g.v[k]) continue; ctx.fillStyle = col(g.v[k], 0.08 + 0.62 * g.conf[k]); ctx.fillRect(cx - r + i * cell, cy - r + j * cell, cell + 0.6, cell + 0.6); } ctx.fillStyle = C.amber; ctx.font = '500 10px "DM Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText('INTERPOLATED ESTIMATE — NOT MEASURED', 10, 16); }
      else if (S.interp) { ctx.fillStyle = C.amber; ctx.font = '500 10px "DM Mono", monospace'; ctx.fillText('Need ≥ 3 measured electrodes to interpolate', 10, 16); }
      // head
      ctx.strokeStyle = C.text2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r * 0.12, cy - r * 0.985); ctx.lineTo(cx, cy - r * 1.14); ctx.lineTo(cx + r * 0.12, cy - r * 0.985); ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * r * 0.995, cy - r * 0.12); ctx.quadraticCurveTo(cx + s * r * 1.12, cy, cx + s * r * 0.995, cy + r * 0.2); ctx.stroke(); }
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.fillStyle = C.text3; ctx.font = '500 10px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('FRONT (nose)', cx, cy - r * 1.18 - 4); ctx.fillText('BACK', cx, cy + r + 16); ctx.textAlign = 'left'; ctx.fillText('L', cx - r - 22, cy + 4); ctx.textAlign = 'right'; ctx.fillText('R', cx + r + 22, cy + 4);
      // electrodes
      for (const e of topo.ELECTRODES) {
        const q = this.p(e, L), v = this.vals[e.n], on = e.n === S.sel, hov = e.n === this.hover, rad = v ? 15 : 9;
        if (v) { ctx.fillStyle = col(v[S.metric]); ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.283); ctx.fill(); ctx.strokeStyle = on ? C.text : C.line2; ctx.lineWidth = on ? 3 : 1.5; ctx.stroke(); }
        else { ctx.strokeStyle = hov || on ? C.accent : C.text3; ctx.lineWidth = on ? 2.5 : 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
        if (hov && v) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, rad + 4, 0, 6.283); ctx.stroke(); }
        if (S.labels) { ctx.fillStyle = v ? (C.light ? '#0a1020' : '#fff') : C.text3; ctx.font = (v ? '600 ' : '500 ') + '10px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.shadowColor = v ? 'rgba(0,0,0,.6)' : 'transparent'; ctx.shadowBlur = 3; ctx.fillText(e.n, q.x, q.y + 3.5); ctx.shadowBlur = 0; }
      }
      if (this.hover) { const e = topo.byName(this.hover), q = this.p(e, L), v = this.vals[e.n]; const txt = `${e.n} · ${e.region}${v ? ` · ${S.metric === 'rel' ? (v.rel * 100).toFixed(1) + '%' : v.abs.toFixed(2)}` : ' · no data'}`; ctx.font = '500 11px "DM Mono", monospace'; const tw = ctx.measureText(txt).width + 14, tx = U.clamp(q.x - tw / 2, 4, L.w - tw - 4), ty = q.y - 34 < 4 ? q.y + 22 : q.y - 34; ctx.fillStyle = C.surface; ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.roundRect(tx, ty, tw, 22, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(txt, tx + 7, ty + 15); }
      // legend
      const lg = U.$('#tpLegend', this.root), b = dsp.BANDS[S.band], fmt = (v) => (S.metric === 'rel' ? (v * 100).toFixed(0) + '%' : v.toFixed(2));
      lg.innerHTML = `<span class="mono">${fmt(this.lo)}</span><i class="tp-bar" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map((t) => { const c = NG.colormaps.color(S.cmap, t); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }).join(',')})"></i><span class="mono">${fmt(this.hi)}</span><span class="hint">${b.name} ${S.metric === 'rel' ? 'relative power' : 'log10 power'} · scale spans the measured electrodes only · ○ dashed = no data</span>`;
    },
    info() {
      const e = topo.byName(S.sel), v = this.vals[S.sel], box = U.$('#tpInfo', this.root); U.$('#tpIsub', this.root).textContent = e ? `${e.n} — ${e.region}` : 'Click an electrode';
      if (!e) return;
      box.innerHTML = `<p>${U.esc(e.info)}</p>` + (v ? `<div><span class="label">Band power at ${e.n} (${this.src === 'IMPORTED' ? 'imported' : 'simulated'})</span><div class="band-list compact">${dsp.BANDS.map((b, i) => `<div class="band-row static" style="--c:var(--band-${b.id})"><span class="band-sym">${b.sym}</span><span class="band-name"><b>${b.name}</b></span><span class="band-bar"><i style="width:${v.all.rel[i] * 100}%"></i></span><span class="band-pct mono tnum">${Math.round(v.all.rel[i] * 100)}%</span></div>`).join('')}</div></div>` : `<div class="empty"><strong>No data at ${e.n}</strong><span>This position is part of the standard layout, but the current data has no channel for it.</span></div>`);
    },
    show() { this.buildMap(); this.compute(); U.fitCanvas(this.cv); this.draw(); NG.loop.add('view-topo', (dt) => { this.acc = (this.acc || 0) + dt; if (S.source === 'live' && engine.running && this.acc > 0.4) { this.acc = 0; this.compute(); } }); this.offT = NG.theme.on('change', () => this.draw()); this.offD = NG.data.on('change', () => { this.buildMap(); this.compute(); }); },
    hide() { NG.loop.remove('view-topo'); this.offT && this.offT(); this.offD && this.offD(); },
  };
})();
