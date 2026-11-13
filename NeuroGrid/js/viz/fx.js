/* NeuroGrid — ambient visuals: the drifting neural-network background and the band-activity orb. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const U = NG.util;
  NG.viz = NG.viz || {};

  /* ============ background: drifting nodes joined by proximity lines ============ */
  NG.viz.background = (function () {
    let cv, ctx, nodes = [], w = 0, h = 0, packets = [], ptr = { x: -999, y: -999 }, acc = 0, started = false;
    const COUNT = [0, 26, 44, 70];

    function size() {
      w = innerWidth; h = innerHeight; cv.width = w; cv.height = h; // 1× pixel density: it's a soft backdrop
      const target = Math.round(COUNT[Math.max(1, NG.motion.level)] * U.clamp((w * h) / (1280 * 720), 0.45, 1.5));
      while (nodes.length < target) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, r: 1 + Math.random() * 1.4 });
      nodes.length = target;
      drawFrame(0);
    }
    function drawFrame(dt) {
      const C = NG.theme.c, lvl = NG.motion.level, link = 150 + (lvl === 3 ? 30 : 0), a0 = C.light ? 0.16 : 0.2;
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (dt) {
          n.x += n.vx * dt; n.y += n.vy * dt;
          if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
          const dx = n.x - ptr.x, dy = n.y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < 22000 && d2 > 1) { const f = (1 - d2 / 22000) * 26 * dt; n.x += (dx / Math.sqrt(d2)) * f * 6; n.y += (dy / Math.sqrt(d2)) * f * 6; }
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
          if (d < link * link) { ctx.strokeStyle = `rgba(${C.accentRgb},${(1 - Math.sqrt(d) / link) * a0})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
      ctx.fillStyle = `rgba(${C.accentRgb},${C.light ? 0.4 : 0.5})`;
      for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.283); ctx.fill(); }
      if (lvl >= 3 && dt) {
        if (packets.length < 6 && Math.random() < dt * 1.2 && nodes.length > 2) {
          const a = nodes[(Math.random() * nodes.length) | 0], near = nodes.filter((b) => b !== a && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < link * link);
          if (near.length) packets.push({ a, b: near[(Math.random() * near.length) | 0], t: 0 });
        }
        for (let i = packets.length - 1; i >= 0; i--) {
          const p = packets[i]; p.t += dt * 0.9; if (p.t >= 1) { packets.splice(i, 1); continue; }
          ctx.fillStyle = `rgba(${C.accentRgb},.9)`; ctx.beginPath(); ctx.arc(U.lerp(p.a.x, p.b.x, p.t), U.lerp(p.a.y, p.b.y, p.t), 2.2, 0, 6.283); ctx.fill();
        }
      }
    }
    function tick(dt) {
      acc += dt; if (acc < 1 / 30) return; const d = acc; acc = 0; drawFrame(d);
    }
    function sync() {
      if (!started) return;
      const lvl = NG.motion.level;
      NG.loop.remove('bg');
      size();
      if (lvl >= 1) NG.loop.add('bg', tick);
    }
    return {
      init() {
        cv = U.$('#bgCanvas'); ctx = cv.getContext('2d'); started = true;
        addEventListener('resize', U.debounce(sync, 150));
        addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
        NG.motion.on('change', sync); NG.theme.on('change', () => drawFrame(0));
        sync();
      },
    };
  })();

  /* ============ orb: five rings, one per EEG band, driven by real relative band power ============ */
  NG.viz.Orb = class Orb {
    constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.t = 0; this.vals = [0.2, 0.2, 0.2, 0.2, 0.2]; this.fit(); this.ro = new ResizeObserver(() => { this.fit(); this.draw(0); }); this.ro.observe(canvas); }
    fit() { const f = U.fitCanvas(this.cv); this.w = f.w; this.h = f.h; this.dpr = f.dpr; }
    destroy() { this.ro.disconnect(); }
    draw(dt) {
      const { ctx, w, h, dpr } = this, C = NG.theme.c, rel = NG.engine.stats.rel, lvl = NG.motion.level;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (w < 24 || h < 24) return; // hidden / not laid out yet
      this.t += dt; const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;
      const speeds = [0.35, 0.7, 1.1, 1.8, 2.8];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5); g.addColorStop(0, NG.theme.a(0.22)); g.addColorStop(1, NG.theme.a(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 6.283); ctx.fill();
      for (let b = 0; b < 5; b++) {
        this.vals[b] += (rel[b] - this.vals[b]) * Math.min(1, dt * 4 + (dt ? 0 : 1));
        const base = R * (0.34 + b * 0.13), amp = 1.5 + this.vals[b] * 15, lobes = 3 + b * 2, ph = this.t * speeds[b] * (lvl ? 1 : 0);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * 6.283, r = base + Math.sin(a * lobes + ph) * amp * (0.6 + 0.4 * Math.sin(a * 2 - ph * 0.5));
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = NG.theme.alpha(C.bands[b], 0.35 + this.vals[b] * 0.65); ctx.lineWidth = 1.2 + this.vals[b] * 2.4; ctx.stroke();
      }
      const pulse = lvl ? 1 + Math.sin(this.t * 2.2) * 0.06 : 1;
      ctx.fillStyle = NG.theme.a(0.9); ctx.beginPath(); ctx.arc(cx, cy, 3.2 * pulse, 0, 6.283); ctx.fill();
    }
  };
})();
