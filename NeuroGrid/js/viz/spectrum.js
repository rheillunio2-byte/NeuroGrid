/* NeuroGrid — frequency-spectrum renderer with EEG band shading, hover read-out and band picking. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const U = NG.util, BANDS = NG.dsp.BANDS;
  const FONT = '500 10px "DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  class Spectrum {
    /** opts: { onBand(index) } */
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.opts = opts; this.pointer = null; this.ymax = 40; this.last = null;
      this.fit(); this.ro = new ResizeObserver(() => { this.fit(); this.redraw(); }); this.ro.observe(canvas);
      this._move = (e) => { const r = canvas.getBoundingClientRect(); this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; this.redraw(); };
      this._leave = () => { this.pointer = null; this.redraw(); };
      this._click = (e) => {
        if (!opts.onBand || !this.last) return; const r = canvas.getBoundingClientRect(), f = this.freqAt(e.clientX - r.left);
        if (f == null) return; const i = BANDS.findIndex((b) => f >= b.lo && f < b.hi); if (i >= 0) opts.onBand(i);
      };
      canvas.addEventListener('pointermove', this._move); canvas.addEventListener('pointerleave', this._leave); canvas.addEventListener('click', this._click);
      if (opts.onBand) canvas.style.cursor = 'pointer';
    }
    fit() { const f = U.fitCanvas(this.cv); this.w = f.w; this.h = f.h; this.dpr = f.dpr; }
    destroy() { this.ro.disconnect(); this.cv.removeEventListener('pointermove', this._move); this.cv.removeEventListener('pointerleave', this._leave); this.cv.removeEventListener('click', this._click); }
    redraw() { if (this.last) this.draw(this.last); }
    freqAt(x) { const g = this.geo; if (!g || x < g.x0 || x > g.x1) return null; return ((x - g.x0) / (g.x1 - g.x0)) * this.last.fmax; }

    /** cfg: { series:[{psd, df, color, fill, width, dash, label}], fmax, scale:'linear'|'db', selected, markers:[{f,label}], response:{f:[],m:[],color,label}, yLabel } */
    draw(cfg) {
      this.last = cfg;
      const { ctx, w, h, dpr } = this, C = NG.theme.c;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const x0 = 38, x1 = w - 10, top = 22, bot = h - 22, ph = bot - top, fmax = cfg.fmax, db = cfg.scale === 'db';
      this.geo = { x0, x1, top, bot };
      const X = (f) => x0 + (f / fmax) * (x1 - x0);

      let lo = 0, hi;
      if (db) { lo = -20; hi = 30; }
      else {
        let m = 1e-9;
        for (const s of cfg.series) { const kmax = Math.min(s.psd.length - 1, Math.floor(fmax / s.df)); for (let k = 1; k <= kmax; k++) if (s.psd[k] > m) m = s.psd[k]; }
        this.ymax += (m * 1.18 - this.ymax) * (m * 1.18 > this.ymax ? 0.35 : 0.04); hi = Math.max(this.ymax, 1);
      }
      const Y = (v) => { const t = db ? (10 * Math.log10(Math.max(v, 1e-6)) - lo) / (hi - lo) : v / hi; return bot - U.clamp(t, 0, 1.02) * ph; };

      ctx.font = FONT; ctx.textAlign = 'center';
      BANDS.forEach((b, i) => {
        if (b.lo >= fmax) return;
        const a = X(b.lo), z = X(Math.min(b.hi, fmax)), sel = cfg.selected === i;
        ctx.fillStyle = NG.theme.alpha(C.bands[i], sel ? 0.2 : 0.07); ctx.fillRect(a, top, z - a, ph);
        if (sel) { ctx.strokeStyle = NG.theme.alpha(C.bands[i], 0.8); ctx.lineWidth = 1; ctx.strokeRect(a + 0.5, top + 0.5, z - a - 1, ph - 1); }
        if (z - a > 22) { ctx.fillStyle = sel ? C.text : NG.theme.alpha(C.bands[i], 1); ctx.fillText(z - a > 44 ? `${b.sym} ${b.name}` : b.sym, (a + z) / 2, top - 7); }
      });

      ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.fillStyle = C.text3; ctx.beginPath();
      const fstep = fmax <= 40 ? 5 : 10;
      for (let f = 0; f <= fmax; f += fstep) { const x = Math.round(X(f)) + 0.5; ctx.moveTo(x, top); ctx.lineTo(x, bot); }
      for (let i = 0; i <= 4; i++) { const y = Math.round(top + (ph * i) / 4) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      ctx.textAlign = 'center'; for (let f = 0; f <= fmax; f += fstep) ctx.fillText(String(f), X(f), h - 8);
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const v = db ? hi - ((hi - lo) * i) / 4 : hi - (hi * i) / 4;
        ctx.fillText(db ? (v > 0 ? '+' : '') + Math.round(v) : v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1), x0 - 5, top + (ph * i) / 4 + 3);
      }
      ctx.textAlign = 'left'; ctx.fillText(db ? 'dB' : 'µV²/Hz', 4, 11); ctx.textAlign = 'right'; ctx.fillText('Hz', x1, h - 8);

      for (const m of cfg.markers || []) {
        if (m.f > fmax) continue;
        ctx.strokeStyle = C.amber; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(m.f) + 0.5, top); ctx.lineTo(X(m.f) + 0.5, bot); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.amber; ctx.textAlign = 'center'; ctx.fillText(m.label, Math.min(X(m.f), x1 - 20), top + 10);
      }

      if (cfg.response) {
        const r = cfg.response; ctx.beginPath();
        r.f.forEach((f, i) => { const y = bot - U.clamp(r.m[i], 0, 1.1) * ph * 0.9; if (i) ctx.lineTo(X(f), y); else ctx.moveTo(X(f), y); });
        ctx.strokeStyle = r.color || C.amber; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      }

      ctx.save(); ctx.beginPath(); ctx.rect(x0, top - 2, x1 - x0, ph + 4); ctx.clip();
      for (const s of cfg.series) {
        const kmin = 1, kmax = Math.min(s.psd.length - 1, Math.floor(fmax / s.df));
        ctx.beginPath();
        for (let k = kmin; k <= kmax; k++) { const x = X(k * s.df), y = Y(s.psd[k]); if (k === kmin) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        if (s.fill) {
          const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, NG.theme.alpha(hex(s.color), 0.35)); g.addColorStop(1, NG.theme.alpha(hex(s.color), 0));
          ctx.save(); ctx.lineTo(X(kmax * s.df), bot); ctx.lineTo(X(kmin * s.df), bot); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
          ctx.beginPath(); for (let k = kmin; k <= kmax; k++) { const x = X(k * s.df), y = Y(s.psd[k]); if (k === kmin) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        }
        ctx.lineJoin = 'round'; ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6; if (s.dash) ctx.setLineDash(s.dash); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();

      const p = this.pointer;
      if (p && p.x >= x0 && p.x <= x1) {
        const f = ((p.x - x0) / (x1 - x0)) * fmax;
        ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(Math.round(p.x) + 0.5, top); ctx.lineTo(Math.round(p.x) + 0.5, bot); ctx.stroke();
        const s0 = cfg.series[0], k = Math.round(f / s0.df), v = s0.psd[k] || 0;
        const band = BANDS.find((b) => f >= b.lo && f < b.hi);
        const lines = [`${f.toFixed(1)} Hz${band ? ' · ' + band.name : ''}`, ...cfg.series.map((s) => `${s.label || 'PSD'} ${db ? (10 * Math.log10(Math.max(s.psd[k] || 0, 1e-6))).toFixed(1) + ' dB' : (s.psd[k] || 0).toFixed(2)}`)];
        ctx.font = FONT; const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, th = lines.length * 14 + 8;
        const tx = p.x + 12 + tw > x1 ? p.x - 12 - tw : p.x + 12, ty = top + 6;
        ctx.fillStyle = C.surface; ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, tx + 7, ty + 15 + i * 14));
        ctx.fillStyle = cfg.series[0].color; ctx.beginPath(); ctx.arc(p.x, Y(v), 3.5, 0, 6.283); ctx.fill();
      }
    }
  }
  /** rgb()/#hex → #rrggbb (so NG.theme.alpha can parse it) */
  function hex(c) {
    if (c[0] === '#') return c;
    const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c); if (!m) return '#5eead4';
    return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
  }
  NG.viz = NG.viz || {};
  NG.viz.Spectrum = Spectrum; NG.viz.toHex = hex;
})();
