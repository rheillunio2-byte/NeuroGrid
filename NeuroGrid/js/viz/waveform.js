/* NeuroGrid — multi-lane scrolling waveform renderer (Canvas 2D).
 * Stateless w.r.t. data: callers hand it typed arrays every frame (or once, for static plots). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const U = NG.util;
  const MONO = '500 11px "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  class Waveform {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.opts = opts;
      this.pointer = null; this.last = null; this.static = !!opts.static;
      this.fit();
      this.ro = new ResizeObserver(() => { this.fit(); if (this.static || (NG.engine && !NG.engine.running)) this.redraw(); });
      this.ro.observe(canvas);
      this._move = (e) => { const r = canvas.getBoundingClientRect(); this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; if (this.static || (NG.engine && !NG.engine.running)) this.redraw(); };
      this._leave = () => { this.pointer = null; if (this.static || (NG.engine && !NG.engine.running)) this.redraw(); };
      canvas.addEventListener('pointermove', this._move); canvas.addEventListener('pointerdown', this._move); canvas.addEventListener('pointerleave', this._leave);
      canvas.addEventListener('pointercancel', this._leave);
    }
    fit() { const f = U.fitCanvas(this.cv); this.w = f.w; this.h = f.h; this.dpr = f.dpr; }
    destroy() { this.ro.disconnect(); this.cv.removeEventListener('pointermove', this._move); this.cv.removeEventListener('pointerdown', this._move); this.cv.removeEventListener('pointerleave', this._leave); this.cv.removeEventListener('pointercancel', this._leave); }
    redraw() { if (this.last) this.draw(this.last); }

    /** cfg: { lanes:[{label, sub, data, n, data2, n2, color, color2, selected}], fs, windowSec, endIndex, originIndex, scale, showGrid, glow, lineWidth,
     *         paused, watermark, timeAxis, ts, empty } */
    draw(cfg) {
      this.last = cfg;
      const { ctx, w, h, dpr } = this, C = NG.theme.c, lanes = cfg.lanes || [];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const gutter = cfg.gutter != null ? cfg.gutter : w < 520 ? 42 : 62, rightPad = 12, top = 8, bottom = cfg.timeAxis === false ? 8 : 22;
      const x0 = gutter, x1 = w - rightPad, pw = x1 - x0, ph = h - top - bottom;
      const laneH = ph / Math.max(1, lanes.length), fs = cfg.fs || 256, windowN = Math.round(cfg.windowSec * fs), pps = pw / windowN, scale = cfg.scale || 50;
      const showGrid = cfg.showGrid !== false, glow = cfg.glow !== false && NG.motion.level >= 1, lw = cfg.lineWidth || 1.6;

      // ----- grid & time markers
      const end = cfg.endIndex || 0, origin = cfg.originIndex || 0, step = (cfg.windowSec > 8 ? 2 : 1) * fs;
      ctx.font = MONO; ctx.textBaseline = 'alphabetic';
      if (showGrid) {
        ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.beginPath();
        for (let m = Math.floor(end / step) * step; ; m -= step) {
          const x = x1 - (end - 1 - m) * pps; if (x < x0) break;
          if (x <= x1) { ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, top + ph); }
        }
        ctx.stroke();
        ctx.setLineDash([2, 5]); ctx.beginPath();
        lanes.forEach((_, i) => { const cy = top + laneH * (i + 0.5); for (const f of [-0.5, 0.5]) { const y = Math.round(cy + f * laneH * 0.92) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y); } });
        ctx.stroke(); ctx.setLineDash([]);
      }
      // lane separators
      ctx.strokeStyle = C.line; ctx.beginPath();
      for (let i = 0; i <= lanes.length; i++) { const y = Math.round(top + laneH * i) + 0.5; ctx.moveTo(x0 - gutter + 6, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      if (cfg.timeAxis !== false) {
        ctx.fillStyle = C.text3; ctx.textAlign = 'center';
        for (let m = Math.floor(end / step) * step; ; m -= step) {
          const x = x1 - (end - 1 - m) * pps; if (x < x0) break;
          const t = (m - origin) / fs;
          if (x <= x1 - 8 && t >= 0) ctx.fillText(Math.round(t) + 's', x, h - 6);
        }
        ctx.textAlign = 'right'; ctx.fillText('now', x1 + 4, h - 6);
      }

      // ----- lanes
      const pxu = (laneH * 0.46) / scale;
      lanes.forEach((ln, i) => {
        const cy = top + laneH * (i + 0.5);
        ctx.textAlign = 'left'; ctx.font = '600 12px "DM Mono", ui-monospace, monospace';
        ctx.fillStyle = ln.selected ? C.accentInk : C.text2; ctx.fillText(ln.label, 10, cy - (ln.sub ? 1 : -4));
        if (ln.sub) { ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = C.text3; ctx.fillText(ln.sub, 10, cy + 12); }
        if (!ln.data || !ln.n) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, top + laneH * i + 1, pw + 2, laneH - 2); ctx.clip();
        if (ln.data2 && ln.n2) this._trace(ln.data2, ln.n2, x1, pps, cy, pxu, ln.color2 || C.text3, lw, false, cfg.dash2 ? [5, 4] : null);
        this._trace(ln.data, ln.n, x1, pps, cy, pxu, ln.color || C.accent, lw, glow, null);
        ctx.restore();
        if (!cfg.static && !cfg.noDot) {
          const v = ln.data[ln.n - 1], y = U.clamp(cy - v * pxu, top + laneH * i + 3, top + laneH * (i + 1) - 3);
          const pulse = NG.motion.level >= 2 && !cfg.paused ? ((cfg.ts || 0) % 1400) / 1400 : 0;
          ctx.fillStyle = ln.color || C.accent;
          if (pulse) { ctx.globalAlpha = (1 - pulse) * 0.5; ctx.beginPath(); ctx.arc(x1, y, 3 + pulse * 7, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
          ctx.beginPath(); ctx.arc(x1, y, 3, 0, 6.283); ctx.fill();
        }
      });

      if (showGrid) { ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = C.text3; ctx.textAlign = 'left'; ctx.fillText(cfg.scaleLabel || `±${scale} µV`, x0 + 6, top + 12); }

      ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.textAlign = 'right';
      let bx = x1 - 6;
      if (cfg.paused) { ctx.fillStyle = C.amber; ctx.fillText('PAUSED', bx, top + 12); bx -= 62; }
      if (cfg.watermark) { ctx.fillStyle = C.text3; ctx.globalAlpha = 0.9; ctx.fillText(cfg.watermark, bx, top + 12); ctx.globalAlpha = 1; }

      if (cfg.empty) { ctx.textAlign = 'center'; ctx.font = '500 12px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = C.text3; ctx.fillText(cfg.empty, (x0 + x1) / 2, top + ph / 2); }

      // ----- crosshair
      const p = this.pointer;
      if (p && p.x >= x0 && p.x <= x1 && !cfg.empty) {
        ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(p.x) + 0.5, top); ctx.lineTo(Math.round(p.x) + 0.5, top + ph); ctx.stroke();
        const secAgo = (x1 - p.x) / pps / fs;
        ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
        const tag = secAgo < 0.005 ? 'now' : `−${secAgo.toFixed(2)} s`;
        const tw = ctx.measureText(tag).width + 10, tx = U.clamp(p.x - tw / 2, x0, x1 - tw);
        ctx.fillStyle = C.surface; ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.roundRect(tx, top + ph - 16, tw, 16, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.fillText(tag, tx + tw / 2, top + ph - 5);
        lanes.forEach((ln, i) => {
          if (!ln.data || !ln.n) return;
          const j = Math.round(ln.n - 1 - (x1 - p.x) / pps); if (j < 0 || j >= ln.n) return;
          const cy = top + laneH * (i + 0.5), v = ln.data[j], y = U.clamp(cy - v * pxu, top + laneH * i + 3, top + laneH * (i + 1) - 3);
          ctx.fillStyle = ln.color || C.accent; ctx.beginPath(); ctx.arc(p.x, y, 3.5, 0, 6.283); ctx.fill();
          const txt = (cfg.unit === 'z' ? v.toFixed(2) : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' µV'), tw2 = ctx.measureText(txt).width + 10;
          const lx = p.x + 10 + tw2 > x1 ? p.x - 10 - tw2 : p.x + 10, ly = U.clamp(y - 8, top + laneH * i + 1, top + laneH * (i + 1) - 17);
          ctx.fillStyle = C.surface; ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.roundRect(lx, ly, tw2, 16, 5); ctx.fill(); ctx.stroke();
          ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(txt, lx + 5, ly + 11.5);
        });
      }
    }

    _trace(data, n, x1, pps, cy, pxu, color, lw, glow, dash) {
      const ctx = this.ctx, dense = pps < 0.6;
      const build = () => {
        ctx.beginPath();
        if (!dense) {
          for (let j = 0; j < n; j++) { const x = x1 - (n - 1 - j) * pps, y = cy - data[j] * pxu; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        } else {
          let px = NaN, mn = 0, mx = 0, started = false, ly = 0;
          const flush = () => {
            if (px !== px) return;
            const a = cy - mx * pxu, b = cy - mn * pxu, first = Math.abs(ly - a) < Math.abs(ly - b) ? a : b, second = first === a ? b : a;
            if (!started) { ctx.moveTo(px + 0.5, first); started = true; } else ctx.lineTo(px + 0.5, first);
            ctx.lineTo(px + 0.5, second); ly = second;
          };
          for (let j = 0; j < n; j++) {
            const x = x1 - (n - 1 - j) * pps, xi = Math.floor(x), v = data[j];
            if (xi !== px) { flush(); px = xi; mn = mx = v; } else { if (v < mn) mn = v; if (v > mx) mx = v; }
          }
          flush();
        }
      };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (glow) { build(); ctx.strokeStyle = color; ctx.globalAlpha = 0.16; ctx.lineWidth = lw * 3.4; ctx.stroke(); ctx.globalAlpha = 1; }
      build(); ctx.strokeStyle = color; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  NG.viz = NG.viz || {};
  NG.viz.Waveform = Waveform;
})();
