/* NeuroGrid — preferences store with validation, change events and localStorage persistence.
 * Keys are dotted paths, e.g. store.get('lab.noise'), store.set('ui.theme', 'abyss'). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const PREFS_KEY = 'neurogrid.v2.prefs';
  const SCHEMA_VERSION = 2;

  /* ---------- safe localStorage wrapper (falls back to memory when blocked) ---------- */
  const mem = new Map();
  let storageOk = true;
  try { localStorage.setItem('__ng_probe', '1'); localStorage.removeItem('__ng_probe'); } catch (e) { storageOk = false; }
  NG.storage = {
    ok: storageOk,
    get(key, fallback) {
      try { const raw = storageOk ? localStorage.getItem(key) : mem.get(key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (storageOk) localStorage.setItem(key, raw); else mem.set(key, raw); return true; } catch (e) { mem.set(key, raw); return false; }
    },
    remove(key) { try { if (storageOk) localStorage.removeItem(key); mem.delete(key); } catch (e) { /* ignore */ } },
    /** Approximate bytes used by NeuroGrid keys. */
    usage() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('neurogrid.')) n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { /* ignore */ } return n * 2; },
  };

  const CHANNEL_NAMES = ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'];
  const DEFAULTS = {
    ui: { theme: 'midnight', accent: 'cyan', sidebar: 'expanded', anim: 2, motion: 'auto', sound: false, grid: true, glow: true, lineWidth: 1.6, specScale: 'linear', mains: 60 },
    lab: { profile: 'calm', amplitude: 100, noise: 18, line: 12, drift: 15, timebase: 6, speed: 1, vscale: 50, channel: 'C3', channels: CHANNEL_NAMES.slice(), custom: [4, 6, 10, 8, 2], specRange: 100 },
    studio: {
      channel: 'O1', zeroPhase: false, overlay: false,
      chain: {
        hp: { on: false, fc: 0.5, order: 2 }, lp: { on: false, fc: 40, order: 4 }, bp: { on: false, lo: 8, hi: 13, order: 4 },
        notch: { on: false, f0: 60, q: 30 }, nr: { on: false, method: 'mean', ms: 20 }, norm: { on: false, method: 'zscore' },
      },
    },
  };

  const ENUM = {
    'ui.theme': ['midnight', 'abyss', 'daylight'],
    'ui.accent': ['cyan', 'violet', 'blue', 'green', 'amber', 'rose'],
    'ui.sidebar': ['expanded', 'collapsed'],
    'ui.motion': ['auto', 'on', 'off'],
    'ui.specScale': ['linear', 'db'],
    'ui.mains': [50, 60],
    'lab.profile': ['calm', 'active', 'relaxed', 'drowsy', 'deep', 'noisy', 'custom'],
    'lab.channel': CHANNEL_NAMES, 'studio.channel': CHANNEL_NAMES,
    'lab.vscale': [25, 50, 100, 200], 'lab.specRange': [40, 100],
    'studio.chain.hp.order': [2, 4, 6], 'studio.chain.lp.order': [2, 4, 6], 'studio.chain.bp.order': [2, 4, 6],
    'studio.chain.nr.method': ['mean', 'median'], 'studio.chain.norm.method': ['zscore', 'minmax'],
  };
  const RANGE = {
    'ui.anim': [0, 3, 1], 'ui.lineWidth': [1, 3, 0.1],
    'lab.amplitude': [20, 250], 'lab.noise': [0, 100], 'lab.line': [0, 100], 'lab.drift': [0, 100], 'lab.timebase': [2, 10, 1], 'lab.speed': [0.25, 4],
    'studio.chain.hp.fc': [0.1, 10], 'studio.chain.lp.fc': [5, 100], 'studio.chain.bp.lo': [0.5, 40], 'studio.chain.bp.hi': [2, 80],
    'studio.chain.notch.f0': [40, 70], 'studio.chain.notch.q': [5, 60], 'studio.chain.nr.ms': [4, 80],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const splitPath = (p) => p.split('.');
  function getIn(obj, path) { let o = obj; for (const k of splitPath(path)) { if (o == null) return undefined; o = o[k]; } return o; }
  function setIn(obj, path, val) { const ks = splitPath(path); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }

  /** Coerce `val` to something valid for `path` (given the default's type). Returns undefined when unusable. */
  function sanitize(path, val, def) {
    if (ENUM[path]) { const hit = ENUM[path].find((v) => v === val || String(v) === String(val)); return hit === undefined ? undefined : hit; }
    if (path === 'lab.channels') { return Array.isArray(val) ? CHANNEL_NAMES.filter((c) => val.includes(c)) : undefined; }
    if (path === 'lab.custom') { return Array.isArray(val) && val.length === 5 && val.every((v) => Number.isFinite(+v)) ? val.map((v) => Math.min(30, Math.max(0, +v))) : undefined; }
    if (typeof def === 'boolean') return typeof val === 'boolean' ? val : undefined;
    if (typeof def === 'number') {
      const n = +val; if (!Number.isFinite(n)) return undefined;
      const r = RANGE[path]; if (!r) return n;
      let v = Math.min(r[1], Math.max(r[0], n)); if (r[2]) v = Math.round(v / r[2]) * r[2]; return +v.toFixed(3);
    }
    if (typeof def === 'string') return typeof val === 'string' ? val : undefined;
    return undefined;
  }

  /** Merge saved data into defaults, keeping only known keys with valid values. */
  function merge(def, saved, prefix) {
    const out = {};
    for (const k of Object.keys(def)) {
      const path = prefix ? `${prefix}.${k}` : k, d = def[k], s = saved ? saved[k] : undefined;
      if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = merge(d, s && typeof s === 'object' ? s : null, path);
      else { const v = s === undefined ? undefined : sanitize(path, s, d); out[k] = v === undefined ? clone(d) : v; }
    }
    return out;
  }

  const store = (NG.store = NG.util.emitter({}));
  let state, saveTimer;
  function load() {
    const saved = NG.storage.get(PREFS_KEY, null);
    state = merge(DEFAULTS, saved && saved.v === SCHEMA_VERSION ? saved.data : null, '');
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => NG.storage.set(PREFS_KEY, { v: SCHEMA_VERSION, data: state }), 150);
  }
  function notify(path) {
    store.emit(path, getIn(state, path), path);
    const parts = splitPath(path);
    for (let i = parts.length - 1; i >= 1; i--) store.emit(parts.slice(0, i).join('.'), getIn(state, parts.slice(0, i).join('.')), path);
    store.emit('*', getIn(state, path), path);
  }

  store.get = (path) => { const v = getIn(state, path); return v && typeof v === 'object' ? clone(v) : v; };
  store.set = (path, val) => {
    const def = getIn(DEFAULTS, path);
    if (def === undefined) { console.warn('[NeuroGrid] unknown setting', path); return false; }
    if (def && typeof def === 'object' && !Array.isArray(def)) { // object: set children
      for (const k of Object.keys(def)) if (val && k in val) store.set(`${path}.${k}`, val[k]);
      return true;
    }
    const v = sanitize(path, val, def);
    if (v === undefined) return false;
    const cur = getIn(state, path);
    if (JSON.stringify(cur) === JSON.stringify(v)) return true;
    setIn(state, path, v); persist(); notify(path);
    return true;
  };
  /** Restore defaults for a section ('ui' | 'lab' | 'studio') or everything. */
  store.reset = (section) => {
    if (section) { state[section] = clone(DEFAULTS[section]); } else state = clone(DEFAULTS);
    persist();
    store.emit('reset', section || '*');
    notify(section || 'ui'); if (!section) { notify('lab'); notify('studio'); }
  };
  store.defaults = (path) => { const d = getIn(DEFAULTS, path); return d && typeof d === 'object' ? clone(d) : d; };
  store.CHANNEL_NAMES = CHANNEL_NAMES;
  store.flush = () => NG.storage.set(PREFS_KEY, { v: SCHEMA_VERSION, data: state });
  load();
})();
