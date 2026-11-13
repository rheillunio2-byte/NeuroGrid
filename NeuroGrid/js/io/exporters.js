/* NeuroGrid — pure export builders (CSV / JSON). Every file states its data source. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../core/csv.js') : root.NG.csv);
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.NG = root.NG || {}; root.NG.exporters = api; }
})(typeof self !== 'undefined' ? self : this, function (csv) {
  'use strict';
  const f = (v, d = 4) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(d) : v);

  /** channels: [{name, data}], fs, source 'SIMULATED'|'IMPORTED', unit. Optional channel subset by name. */
  function signalCsv(channels, fs, opts = {}) {
    const sel = opts.only ? channels.filter((c) => opts.only.indexOf(c.name) > -1) : channels;
    if (!sel.length) throw new Error('No channels selected for export.');
    const n = Math.min(...sel.map((c) => c.data.length)), unit = opts.unit || 'uV', rows = [];
    for (let i = 0; i < n; i++) { const r = [i, f(i / fs, 5)]; for (const c of sel) r.push(f(c.data[i], 4)); r.push(opts.source || 'SIMULATED'); rows.push(r); }
    return csv.toCsv(['sample_index', 'time_s', ...sel.map((c) => c.name + '_' + unit), 'data_source'], rows);
  }
  function psdCsv(freqs, psdByName, source, unit = 'uV') {
    const names = Object.keys(psdByName), rows = [];
    for (let k = 0; k < freqs.length; k++) rows.push([f(freqs[k], 4), ...names.map((n) => f(psdByName[n][k], 6)), source]);
    return csv.toCsv(['frequency_hz', ...names.map((n) => n + '_' + unit + '2_per_hz'), 'data_source'], rows);
  }
  function spectrogramCsv(spec, source) {
    const rows = [];
    for (let fr = 0; fr < spec.frames; fr++) for (let k = 0; k < spec.bins; k++) rows.push([f(spec.times[fr], 4), f(spec.freqs[k], 4), spec.power[fr * spec.bins + k].toExponential(5), source]);
    return csv.toCsv(['time_s', 'frequency_hz', 'power_per_hz', 'data_source'], rows);
  }
  /** Experiment/model result → flat key/value CSV rows (reproducibility fields included). */
  function experimentRows(exp) {
    const rows = [['data_source', exp.source], ['experiment_id', exp.id], ['name', exp.name], ['created_at', exp.createdAt], ['seed', exp.config.seed], ['sampling_rate_hz', exp.fs], ['dataset', exp.datasetId],
      ['features', exp.featureIds.join(' ')], ['channels', exp.channels.join(' ')], ['hidden_layers', exp.config.hidden.join('-') || 'none'], ['learning_rate', exp.config.lr], ['batch_size', exp.config.batch], ['epochs', exp.config.epochs],
      ['split_train_val_test', `${exp.counts.train}/${exp.counts.val}/${exp.counts.test}`], ['grouped_split', exp.config.grouped], ['balance', exp.config.balance], ['preprocessing', JSON.stringify(exp.pre || {})]];
    for (const s of ['train', 'val', 'test']) { const r = exp.results[s]; if (!r) continue; rows.push([s + '_accuracy', f(r.accuracy)], [s + '_macro_f1', f(r.macro.f1)], [s + '_weighted_f1', f(r.weighted.f1)], [s + '_loss', f(r.loss)]); }
    return rows;
  }
  const experimentCsv = (exp) => csv.toCsv(['field', 'value'], experimentRows(exp));
  const experimentJson = (exp) => JSON.stringify(exp, (k, v) => (v instanceof Float32Array || v instanceof Float64Array ? Array.from(v) : v), 2);
  function confusionCsv(res, classes) { return csv.toCsv(['true\\predicted', ...classes], res.confusion.map((r, i) => [classes[i], ...r])); }
  return { signalCsv, psdCsv, spectrogramCsv, experimentRows, experimentCsv, experimentJson, confusionCsv };
});
