/* NeuroGrid — browser database handle (IndexedDB, with an in-memory fallback if it is unavailable). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  let backend; try { backend = typeof indexedDB !== 'undefined' && indexedDB ? NG.sessionstore.idbBackend() : NG.sessionstore.memoryBackend(); } catch (e) { backend = NG.sessionstore.memoryBackend(); }
  const db = (NG.db = NG.sessionstore.create(backend));
  db.persistent = backend.kind === 'indexeddb';
  /** Browser-reported storage quota, if available. */
  db.estimate = async () => { try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } } catch (e) { /* ignore */ } return null; };
})();
