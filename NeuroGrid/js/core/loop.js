/* NeuroGrid — the one and only requestAnimationFrame loop, plus motion preferences.
 * Anything that animates registers a subscriber here (and removes it when hidden),
 * so there are never duplicate loops or leaked animation frames. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});

  /* ---------------- motion preferences ---------------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const motion = (NG.motion = NG.util.emitter({ reduced: false, level: 2 }));
  motion.refresh = () => {
    const pref = NG.store.get('ui.motion'), anim = NG.store.get('ui.anim');
    motion.reduced = pref === 'on' || (pref === 'auto' && mq.matches);
    motion.level = motion.reduced ? 0 : anim;
    const root = document.documentElement;
    root.dataset.anim = String(motion.level);
    root.dataset.reduced = String(motion.reduced);
    motion.emit('change', motion);
  };
  if (mq.addEventListener) mq.addEventListener('change', motion.refresh);
  NG.store.on('ui.motion', motion.refresh);
  NG.store.on('ui.anim', motion.refresh);
  NG.store.on('reset', motion.refresh);

  /* ---------------- central loop ---------------- */
  const subs = new Map();
  const failed = new Set();
  let raf = 0, last = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016;
    last = ts;
    for (const [id, fn] of subs) {
      try { fn(dt, ts); } catch (e) {
        if (!failed.has(id)) { failed.add(id); console.error(`[NeuroGrid] frame task "${id}" failed`, e); }
        subs.delete(id);
      }
    }
  }
  const loop = (NG.loop = {
    add(id, fn) { subs.set(id, fn); failed.delete(id); if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    remove(id) { subs.delete(id); },
    has(id) { return subs.has(id); },
    get size() { return subs.size; },
  });
  document.addEventListener('visibilitychange', () => { last = 0; });

  /* ---------------- animated number counters ---------------- */
  const counters = new Set();
  NG.counter = function counter(el, opts = {}) {
    const c = { el, value: null, shown: null, dec: opts.decimals ?? 0, prefix: opts.prefix || '', suffix: opts.suffix || '', fmt: opts.format || null };
    c.render = (v) => { el.textContent = c.prefix + (c.fmt ? c.fmt(v) : v.toFixed(c.dec)) + c.suffix; };
    c.set = (v) => {
      if (!Number.isFinite(v)) { c.value = null; c.shown = null; el.textContent = opts.fallback || '—'; counters.delete(c); return; }
      c.value = v;
      if (c.shown === null || motion.reduced || motion.level === 0) { c.shown = v; c.render(v); counters.delete(c); }
      else counters.add(c);
      if (counters.size) loop.add('counters', tickCounters);
    };
    return c;
  };
  function tickCounters(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (const c of counters) {
      c.shown += (c.value - c.shown) * k;
      const eps = Math.pow(10, -c.dec) * 0.5;
      if (Math.abs(c.value - c.shown) < eps) { c.shown = c.value; counters.delete(c); }
      c.render(c.shown);
    }
    if (!counters.size) loop.remove('counters');
  }
})();
