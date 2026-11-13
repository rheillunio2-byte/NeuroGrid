/* NeuroGrid — durable store for sessions, datasets and experiments.
 * IndexedDB in the browser (large Float32 payloads), an in-memory backend for Node tests / private windows.
 * Records are never silently overwritten: put() with an existing id throws unless {overwrite:true}. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.NG = root.NG || {}; root.NG.sessionstore = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STORES = ['sessions', 'experiments', 'datasets'];

  function memoryBackend() {
    const m = {}; STORES.forEach((s) => { m[s] = new Map(); });
    const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
    return { kind: 'memory', async put(s, rec) { m[s].set(rec.id, clone(rec)); }, async get(s, id) { const r = m[s].get(id); return r ? clone(r) : null; }, async all(s) { return [...m[s].values()].map(clone); }, async del(s, id) { m[s].delete(id); } };
  }
  function idbBackend(name = 'neurogrid-v3') {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const rq = indexedDB.open(name, 1); rq.onupgradeneeded = () => { STORES.forEach((s) => { if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s, { keyPath: 'id' }); }); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error || new Error('IndexedDB could not be opened.')); rq.onblocked = () => rej(new Error('IndexedDB is blocked.')); }));
    const tx = async (s, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(s, mode), st = t.objectStore(s), rq = fn(st); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage transaction aborted (quota?).')); }); };
    return { kind: 'indexeddb', put: (s, rec) => tx(s, 'readwrite', (st) => st.put(rec)), get: async (s, id) => (await tx(s, 'readonly', (st) => st.get(id))) || null, all: async (s) => (await tx(s, 'readonly', (st) => st.getAll())) || [], del: (s, id) => tx(s, 'readwrite', (st) => st.delete(id)) };
  }
  function bytesOf(rec) { let n = 0; (function walk(v) { if (!v) return; if (v.byteLength != null && typeof v === 'object') { n += v.byteLength; return; } if (typeof v === 'string') { n += v.length * 2; return; } if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]); else n += 8; })(rec); return n; }

  function create(backend) {
    return {
      get kind() { return backend.kind; },
      async put(store, rec, opts = {}) {
        if (!rec || !rec.id) throw new Error('Record needs an id.');
        if (!opts.overwrite && (await backend.get(store, rec.id))) throw new Error(`A record with id ${rec.id} already exists; it was not overwritten.`);
        await backend.put(store, rec); return rec.id;
      },
      get: (store, id) => backend.get(store, id),
      async list(store) { return (await backend.all(store)).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); },
      del: (store, id) => backend.del(store, id),
      /** Remove every stored record (used by “Delete all data”). */
      async clearAll() { let n = 0; for (const st of STORES) for (const r of await backend.all(st)) { await backend.del(st, r.id); n++; } return n; },
      async rename(store, id, name) { const r = await backend.get(store, id); if (!r) throw new Error('Record not found.'); r.name = String(name).slice(0, 80); await backend.put(store, r); return r; },
      async usage() { const out = {}; let total = 0; for (const s of STORES) { const a = await backend.all(s); out[s] = { count: a.length, bytes: a.reduce((t, r) => t + bytesOf(r), 0) }; total += out[s].bytes; } out.total = total; return out; },
    };
  }
  return { create, memoryBackend, idbBackend, bytesOf, STORES };
});
