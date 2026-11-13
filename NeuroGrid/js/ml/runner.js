/* NeuroGrid — main-thread client for ML jobs. Uses a Web Worker when the browser allows it (needs http/https, not file://),
 * otherwise runs the identical job code on the main thread in yielding chunks. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {}), pending = new Map();
  let worker = null, tried = false, mode = 'unknown', seq = 0;
  function ensure() {
    if (tried) return; tried = true;
    try {
      worker = new Worker('js/ml/worker.js');
      worker.onmessage = (e) => route(e.data);
      worker.onerror = () => { worker = null; mode = 'main'; };
      mode = 'worker';
    } catch (e) { worker = null; mode = 'main'; }
  }
  function route(m) { const p = pending.get(m.id); if (!p) return; if (m.type === 'progress' || m.type === 'started') { p.onMessage && p.onMessage(m); return; } pending.delete(m.id); if (m.type === 'done') p.resolve(m.result); else p.reject(Object.assign(new Error(m.message), { cancelled: m.type === 'cancelled' })); }
  NG.mlRunner = {
    get mode() { ensure(); return mode; },
    run(type, payload, onMessage) {
      ensure(); const id = ++seq;
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onMessage });
        const msg = { type, id, payload };
        if (worker) { try { worker.postMessage(msg); return; } catch (e) { worker = null; mode = 'main'; } }
        NG.job.handle(msg, route);
      });
      promise.id = id; return promise;
    },
    cancel(id) { if (worker) worker.postMessage({ type: 'cancel', id }); else NG.job.handle({ type: 'cancel', id }, () => {}); },
  };
})();
