/* NeuroGrid — spectrogram renderer: waveform strip + time–frequency image from a real STFT result (NG.stft). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {}), U = NG.util, MONO = '500 10px "DM Mono", ui-monospace, monospace';
  class SpectrogramView {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.opts = opts; this.pointer = null; this.last = null;
      this.off = document.createElement('canvas'); this.fit();
      this.ro = new ResizeObserver(() => { this.fit(); this.redraw(); }); this.ro.observe(canvas);
      this._m = (e) => { const r = canvas.getBoundingClientRect(); this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; this.redraw(); if (opts.onHover) opts.onHover(this.probe()); };
      this._l = () => { this.pointer = null; this.redraw(); if (opts.onHover) opts.onHover(null); };
      this._c = (e) => { const r = canvas.getBoundingClientRect(), p = this.hit(e.clientX - r.left, e.clientY - r.top); if (p && opts.onSeek) opts.onSeek(p.t); };
      canvas.addEventListener('pointermove', this._m); canvas.addEventListener('pointerdown', this._m); canvas.addEventListener('pointerleave', this._l); canvas.addEventListener('click', this._c);
    }
    fit() { const f = U.fitCanvas(this.cv); this.w = f.w; this.h = f.h; this.dpr = f.dpr; }
    destroy() { this.ro.disconnect(); this.cv.removeEventListener('pointermove', this._m); this.cv.removeEventListener('pointerdown', this._m); this.cv.removeEventListener('pointerleave', this._l); this.cv.removeEventListener('click', this._c); }
    redraw() { if (this.last) this.draw(this.last); }
    layout() { const w = this.w, h = this.h, gl = 50, gr = 58, top = 6, trace = Math.round(h * 0.24), gap = 10, bot = 22; return { gl, gr, top, trace, x0: gl, x1: w - gr, sy0: top + trace + gap, sy1: h - bot, w, h }; }
    freqToY(f, L, c) { const { fmin, fmax, log } = c, a = log ? Math.log10(Math.max(f, fmin)) : f, lo = log ? Math.log10(fmin) : fmin, hi = log ? Math.log10(fmax) : fmax; return L.sy1 - ((a - lo) / (hi - lo)) * (L.sy1 - L.sy0); }
    yToFreq(y, L, c) { const t = (L.sy1 - y) / (L.sy1 - L.sy0), { fmin, fmax, log } = c; return log ? Math.pow(10, Math.log10(fmin) + t * (Math.log10(fmax) - Math.log10(fmin))) : fmin + t * (fmax - fmin); }
    hit(x, y) { const c = this.last; if (!c) return null; const L = this.layout(); if (x < L.x0 || x > L.x1) return null; const t = c.t0 + ((x - L.x0) / (L.x1 - L.x0)) * (c.t1 - c.t0); return { t, inImage: y >= L.sy0 && y <= L.sy1, f: y >= L.sy0 && y <= L.sy1 ? this.yToFreq(y, L, c) : null }; }
    /** Spectral value under the pointer, from the actual STFT matrix. */
    probe() {
      const c = this.last, p = this.pointer; if (!c || !p) return null; const h = this.hit(p.x, p.y); if (!h || !h.inImage) return null;
      const s = c.spec, fr = Math.max(0, Math.min(s.frames - 1, Math.round((h.t - s.times[0]) / s.dt))), bin = Math.max(0, Math.min(s.bins - 1, Math.round(h.f / s.df)));
      const pw = s.power[fr * s.bins + bin]; return { t: h.t, f: s.freqs[bin], frame: fr, bin, db: 10 * Math.log10(Math.max(pw, 1e-12)), power: pw, band: NG.dsp.BANDS.find((b) => s.freqs[bin] >= b.lo && s.freqs[bin] < b.hi) || null };
    }
    /** cfg: { spec, signal (Float32Array for the trace), fs, t0, t1 (time range shown), fmin, fmax, log, cmap, dbRange, playhead (s), label, unit, watermark } */
    draw(cfg) {
      this.last = cfg; const { ctx, dpr } = this, C = NG.theme.c, L = this.layout(), s = cfg.spec; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L.w, L.h);
      if (!s) { ctx.fillStyle = C.text3; ctx.font = '500 12px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(cfg.empty || 'No data', L.w / 2, L.h / 2); return; }
      const iw = Math.max(1, Math.floor(L.x1 - L.x0)), ih = Math.max(1, Math.floor(L.sy1 - L.sy0)), lut = NG.colormaps.lut(cfg.cmap || 'viridis'), off = this.off; off.width = iw; off.height = ih;
      const im = off.getContext('2d').createImageData(iw, ih), d = im.data, bins = s.bins;
      // dB range from the displayed region (99th percentile → max, dynamic range below)
      const kLo = Math.max(0, Math.floor(cfg.fmin / s.df)), kHi = Math.min(bins - 1, Math.ceil(cfg.fmax / s.df)), vals = []; const step = Math.max(1, Math.floor((s.frames * (kHi - kLo + 1)) / 6000));
      for (let f = 0, c = 0; f < s.frames; f++) for (let k = kLo; k <= kHi; k++, c++) if (c % step === 0) vals.push(10 * Math.log10(Math.max(s.power[f * bins + k], 1e-12)));
      vals.sort((a, b) => a - b); const dbMax = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))] : 0, dbMin = dbMax - (cfg.dbRange || 50); this.db = { dbMin, dbMax };
      const colFrame = new Int32Array(iw); for (let x = 0; x < iw; x++) { const t = cfg.t0 + ((x + 0.5) / iw) * (cfg.t1 - cfg.t0); colFrame[x] = Math.round((t - s.times[0]) / s.dt); }
      for (let y = 0; y < ih; y++) {
        const f = this.yToFreq(L.sy1 - y - 0.5, L, cfg), kf = f / s.df, k0 = Math.max(0, Math.min(bins - 1, Math.floor(kf))), k1 = Math.min(bins - 1, k0 + 1), w = kf - k0;
        for (let x = 0; x < iw; x++) {
          const fr = colFrame[x], o = (y * iw + x) * 4;
          if (fr < 0 || fr >= s.frames) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 0; continue; }
          const p = s.power[fr * bins + k0] * (1 - w) + s.power[fr * bins + k1] * w, v = (10 * Math.log10(Math.max(p, 1e-12)) - dbMin) / (dbMax - dbMin), i = Math.max(0, Math.min(255, Math.round(v * 255))) * 3;
          d[o] = lut[i]; d[o + 1] = lut[i + 1]; d[o + 2] = lut[i + 2]; d[o + 3] = 255;
        }
      }
      off.getContext('2d').putImageData(im, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, L.x0, L.sy0, iw, ih);
      ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.strokeRect(L.x0 + 0.5, L.sy0 + 0.5, iw - 1, ih - 1);
      // frequency axis + EEG band guides
      ctx.font = MONO; ctx.fillStyle = C.text3; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const ticks = cfg.log ? [0.5, 1, 2, 4, 8, 13, 30, 60, 100, 200, 400].filter((f) => f >= cfg.fmin && f <= cfg.fmax) : this.niceTicks(cfg.fmin, cfg.fmax);
      for (const f of ticks) { const y = this.freqToY(f, L, cfg); ctx.fillText(String(f), L.x0 - 6, y); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(L.x0, Math.round(y) + 0.5); ctx.lineTo(L.x1, Math.round(y) + 0.5); ctx.stroke(); }
      ctx.save(); ctx.translate(12, (L.sy0 + L.sy1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Frequency (Hz)', 0, 0); ctx.restore();
      if (cfg.bandGuides) NG.dsp.BANDS.forEach((b, i) => { for (const f of [b.lo, b.hi]) { if (f > cfg.fmin && f < cfg.fmax) { const y = this.freqToY(f, L, cfg); ctx.strokeStyle = C.bands[i]; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(L.x0, y); ctx.lineTo(L.x1, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; } } });
      // time axis
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; const span = cfg.t1 - cfg.t0, tstep = [0.5, 1, 2, 5, 10, 20, 30, 60].find((v) => span / v <= 10) || 60;
      for (let t = Math.ceil(cfg.t0 / tstep) * tstep; t <= cfg.t1 + 1e-9; t += tstep) { const x = L.x0 + ((t - cfg.t0) / span) * (L.x1 - L.x0); ctx.fillStyle = C.text3; ctx.fillText(t.toFixed(tstep < 1 ? 1 : 0) + 's', x, L.h - 6); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, L.top); ctx.lineTo(Math.round(x) + 0.5, L.sy0 - 4); ctx.stroke(); }
      // colour bar
      const cbx = L.x1 + 14, cbw = 10; for (let y = 0; y < ih; y++) { const i = Math.round((1 - y / (ih - 1)) * 255) * 3; ctx.fillStyle = `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`; ctx.fillRect(cbx, L.sy0 + y, cbw, 1.5); }
      ctx.fillStyle = C.text3; ctx.textAlign = 'left'; ctx.fillText(dbMax.toFixed(0), cbx + cbw + 3, L.sy0 + 8); ctx.fillText(dbMin.toFixed(0), cbx + cbw + 3, L.sy1); ctx.fillText('dB', cbx, L.sy0 - 2 + 0);
      // trace strip
      if (cfg.signal) {
        const x = cfg.signal, fs = cfg.fs, i0 = Math.max(0, Math.floor(cfg.t0 * fs)), i1 = Math.min(x.length, Math.ceil(cfg.t1 * fs)); let mx = 1e-9; for (let i = i0; i < i1; i++) { const a = Math.abs(x[i]); if (a > mx) mx = a; }
        const cy = L.top + L.trace / 2, amp = (L.trace / 2 - 2) / mx, pw = L.x1 - L.x0, per = (i1 - i0) / pw; ctx.save(); ctx.beginPath(); ctx.rect(L.x0, L.top, pw, L.trace); ctx.clip(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2; ctx.beginPath();
        if (per <= 1) { for (let i = i0; i < i1; i++) { const px = L.x0 + ((i / fs - cfg.t0) / span) * pw, py = cy - x[i] * amp; i === i0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } }
        else for (let px = 0; px < pw; px++) { const a = i0 + Math.floor(px * per), b = Math.min(i1, i0 + Math.floor((px + 1) * per) + 1); let lo = Infinity, hi = -Infinity; for (let i = a; i < b; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; } if (lo <= hi) { ctx.moveTo(L.x0 + px + 0.5, cy - hi * amp); ctx.lineTo(L.x0 + px + 0.5, cy - lo * amp); } }
        ctx.stroke(); ctx.restore(); ctx.strokeStyle = C.line; ctx.strokeRect(L.x0 + 0.5, L.top + 0.5, pw - 1, L.trace - 1); ctx.fillStyle = C.text3; ctx.textAlign = 'left'; ctx.fillText(`±${mx.toFixed(1)} ${cfg.unit || 'µV'}`, L.x0 + 5, L.top + 11);
      }
      ctx.textAlign = 'right'; ctx.fillStyle = C.amber; ctx.fillText(cfg.watermark || '', L.x1 - 6, L.sy0 + 13);
      // playhead + pointer
      const marker = (t, col, dashed) => { const x = L.x0 + ((t - cfg.t0) / span) * (L.x1 - L.x0); if (x < L.x0 || x > L.x1) return; ctx.strokeStyle = col; ctx.lineWidth = 1.5; if (dashed) ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, L.top); ctx.lineTo(x, L.sy1); ctx.stroke(); ctx.setLineDash([]); };
      if (cfg.playhead != null) marker(cfg.playhead, '#ffffff', false);
      const pr = this.probe(); if (pr) { const x = L.x0 + ((pr.t - cfg.t0) / span) * (L.x1 - L.x0), y = this.freqToY(pr.f, L, cfg); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, L.top); ctx.lineTo(x, L.sy1); ctx.moveTo(L.x0, y); ctx.lineTo(L.x1, y); ctx.stroke(); ctx.setLineDash([]); }
    }
    niceTicks(lo, hi) { const span = hi - lo, st = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((v) => span / v <= 8) || 100, out = []; for (let f = Math.ceil(lo / st) * st; f <= hi + 1e-9; f += st) out.push(f); return out; }
  }
  NG.viz = NG.viz || {}; NG.viz.SpectrogramView = SpectrogramView;
})();
