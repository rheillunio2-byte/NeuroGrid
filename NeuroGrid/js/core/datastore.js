/* NeuroGrid — holds the currently loaded IMPORTED dataset (in memory only; never uploaded). */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const d = (NG.data = NG.util.emitter({ current: null }));
  d.set = (ds) => { d.current = ds; d.emit('change', ds); };
  d.clear = () => { d.current = null; d.emit('change', null); };
  /** Short, honest description of where a signal comes from. */
  d.label = (src) => (src === 'IMPORTED' ? 'IMPORTED' : 'SIMULATED');
})();
