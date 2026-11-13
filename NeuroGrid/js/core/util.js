/* NeuroGrid — small shared helpers (namespace: window.NG). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const U = (NG.util = {});

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.map = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
  U.pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.uid = () => Math.random().toString(36).slice(2, 9);
  U.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  U.pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
  U.shuffle = (arr, rnd = Math.random) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** 3725 -> "01:02:05" */
  U.fmtClock = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${U.pad2(sec / 3600)}:${U.pad2((sec % 3600) / 60)}:${U.pad2(sec % 60)}`; };
  /** 75 -> "1 min 15 s" */
  U.fmtDuration = (sec) => { sec = Math.round(sec); if (sec < 60) return `${sec} s`; const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m} min ${s} s` : `${m} min`; };
  U.fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  U.fmtSigned = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  U.fmtDate = (iso) => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  U.stamp = () => { const d = new Date(); return `${d.getFullYear()}${U.pad2(d.getMonth() + 1)}${U.pad2(d.getDate())}-${U.pad2(d.getHours())}${U.pad2(d.getMinutes())}${U.pad2(d.getSeconds())}`; };

  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /** Tiny element builder: h('div.card#id', {class, dataset, onclick, ...attrs}, ...children) */
  U.h = (tag, attrs, ...kids) => {
    const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)$/i.exec(tag);
    const el = document.createElement(m ? m[1] : tag);
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className += ' ' + v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    } else if (attrs != null) kids.unshift(attrs);
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(k));
    return el;
  };
  U.html = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };

  /** Trigger a client-side file download. */
  U.download = (filename, text, mime = 'text/csv;charset=utf-8') => {
    const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /** Size a canvas to its CSS box × devicePixelRatio; returns {w,h,dpr}. */
  U.fitCanvas = (canvas, maxDpr = 2) => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    return { w, h, dpr };
  };

  /** Minimal event emitter mixin. */
  U.emitter = (target = {}) => {
    const map = new Map();
    target.on = (evt, fn) => { if (!map.has(evt)) map.set(evt, new Set()); map.get(evt).add(fn); return () => map.get(evt).delete(fn); };
    target.off = (evt, fn) => map.get(evt) && map.get(evt).delete(fn);
    target.emit = (evt, ...a) => { const s = map.get(evt); if (s) for (const fn of [...s]) { try { fn(...a); } catch (e) { console.error(`[NeuroGrid] listener for "${evt}" failed`, e); } } };
    return target;
  };
})();
