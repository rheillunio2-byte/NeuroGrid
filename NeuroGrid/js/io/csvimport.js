/* NeuroGrid — EEG CSV import: tolerant parser, column analysis, validation and dataset building.
 * Pure logic (no DOM). Imported data is NEVER uploaded; it stays in memory in the browser.
 * Units and sampling rates are never changed silently: the dataset records exactly what the user chose. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.csvimport = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DELIMS = [',', ';', '\t', '|'];
  const MISSING = /^(|nan|na|n\/a|null|none|-|--|\?)$/i;
  const UNIT_FACTORS = { uV: 1, mV: 1000, V: 1e6 }; // factor to µV, used ONLY if the user asks to convert

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/, 8).filter((l) => l.trim());
    let best = ',', score = -1;
    for (const d of DELIMS) {
      const counts = lines.map((l) => l.split(d).length - 1);
      const c0 = counts[0] || 0; if (!c0) continue;
      const consistent = counts.filter((c) => c === c0).length / counts.length;
      const s = consistent * 10 + Math.min(c0, 20) / 20;
      if (s > score) { score = s; best = d; }
    }
    return best;
  }

  /** Resumable, quote-aware parser core. Returns {rows, pos, done}. Budget = max characters per call. */
  function makeParser(text, delimiter) {
    let pos = 0, row = [], field = '', inQ = false; const rows = [], n = text.length;
    if (text.charCodeAt(0) === 0xfeff) pos = 1;
    function step(budget) {
      const end = Math.min(n, pos + budget);
      while (pos < end) {
        const ch = text[pos];
        if (inQ) {
          if (ch === '"') { if (text[pos + 1] === '"') { field += '"'; pos++; } else inQ = false; } else field += ch;
        } else if (ch === '"' && field === '') inQ = true;
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[pos + 1] === '\n') pos++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
        else field += ch;
        pos++;
      }
      if (pos >= n) { if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); field = ''; row = []; } return true; }
      return false;
    }
    return { rows, step, get pos() { return pos; }, total: n };
  }

  /** Synchronous parse. Returns { rows, delimiter }. */
  function parseCsv(text, opts = {}) {
    if (typeof text !== 'string') throw new Error('CSV input must be text.');
    const delimiter = opts.delimiter || detectDelimiter(text), p = makeParser(text, delimiter);
    p.step(Infinity); return { rows: p.rows, delimiter };
  }
  /** Chunked parse for large files: yields to the event loop, reports progress, and can be cancelled. */
  async function parseCsvChunked(text, opts = {}) {
    const delimiter = opts.delimiter || detectDelimiter(text), p = makeParser(text, delimiter), budget = opts.budget || 400000;
    while (!p.step(budget)) {
      if (opts.signal && opts.signal.cancelled) throw Object.assign(new Error('Import cancelled.'), { cancelled: true });
      if (opts.onProgress) opts.onProgress(p.pos / p.total);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (opts.onProgress) opts.onProgress(1);
    return { rows: p.rows, delimiter };
  }

  const isNum = (s) => { const t = String(s).trim(); return t !== '' && isFinite(Number(t)); };

  /** Look at parsed rows and describe the columns. */
  function analyze(rows, opts = {}) {
    if (!rows || !rows.length) return { error: 'The file is empty.' };
    const width = Math.max(...rows.map((r) => r.length));
    if (rows.length < 2 && width < 2) return { error: 'The file has only one value; there is no signal to analyse.' };
    const first = rows[0], numericFirst = first.filter((c) => isNum(c)).length;
    const auto = numericFirst < first.length / 2 || (first.some((c) => /[a-z]/i.test(c) && !isNum(c)) && numericFirst < first.length), hasHeader = opts.header == null ? auto : !!opts.header;
    const header = hasHeader ? first.map((c, i) => String(c).trim() || 'col' + (i + 1)) : Array.from({ length: width }, (_, i) => 'col' + (i + 1));
    const body = hasHeader ? rows.slice(1) : rows, sample = body.slice(0, 2000), cols = [];
    for (let c = 0; c < width; c++) {
      let num = 0, miss = 0, bad = 0, mono = true, prev = -Infinity, cnt = 0;
      for (const r of sample) { const v = r[c]; if (v == null || MISSING.test(String(v).trim())) { miss++; continue; } if (isNum(v)) { num++; const x = Number(v); if (x <= prev) mono = false; prev = x; cnt++; } else bad++; }
      const used = sample.length || 1;
      cols.push({ index: c, name: header[c] || 'col' + (c + 1), numericRatio: num / used, missing: miss, nonNumeric: bad, increasing: mono && cnt > 2, numeric: num / used >= 0.8 });
    }
    const timeGuess = cols.find((c) => c.numeric && c.increasing && /^(time|t|sec|seconds|s|ms|timestamp|time_s|time_ms|elapsed)/i.test(c.name)) || null;
    const labelGuess = cols.find((c) => !c.numeric && c.nonNumeric > 0 && /label|class|state|event|marker|stage/i.test(c.name)) || cols.find((c) => c.numeric && /^(label|labels|class|target|marker|event|stage|state|condition|task|trigger)$/i.test(String(c.name).trim())) || null;
    return { hasHeader, header, width, rowCount: body.length, cols, timeGuess: timeGuess && timeGuess.index, labelGuess: labelGuess && labelGuess.index, body };
  }

  /**
   * Build a dataset. mapping: { timeCol (index|null), channelCols [index], labelCol (index|null), fs (Hz, used when no time col),
   *   timeUnit 's'|'ms', unit 'uV'|'mV'|'V'|'au', convertToUV (bool, explicit), missing 'interpolate'|'zero'|'reject', maxMissing (fraction), jitterTol (fraction) }
   * Returns { ok, errors[], warnings[], dataset }.
   */
  function buildDataset(parsed, mapping, meta = {}) {
    const errors = [], warnings = [];
    if (!parsed || parsed.error) return { ok: false, errors: [parsed ? parsed.error : 'Nothing to import.'], warnings };
    const m = { timeCol: null, channelCols: [], labelCol: null, fs: 0, timeUnit: 's', unit: 'uV', convertToUV: false, missing: 'interpolate', maxMissing: 0.2, jitterTol: 0.05, ...mapping };
    const body = parsed.body, n = body.length;
    if (!m.channelCols.length) errors.push('Select at least one column that contains EEG samples.');
    if (n < 2) errors.push('At least two rows of data are needed.');
    for (const c of m.channelCols) if (c === m.timeCol) errors.push('A column cannot be both time and a channel.');
    if (errors.length) return { ok: false, errors, warnings };

    let fs = m.fs, timeInfo = null;
    if (m.timeCol != null) {
      const t = new Float64Array(n); let bad = 0;
      for (let i = 0; i < n; i++) { const v = body[i][m.timeCol]; const x = isNum(v) ? Number(v) : NaN; if (x !== x) bad++; t[i] = m.timeUnit === 'ms' ? x / 1000 : x; }
      if (bad) errors.push(`The time column has ${bad} non-numeric or empty value(s); sampling intervals cannot be trusted.`);
      else {
        const dts = new Float64Array(n - 1); let nonInc = 0; for (let i = 1; i < n; i++) { dts[i - 1] = t[i] - t[i - 1]; if (dts[i - 1] <= 0) nonInc++; }
        if (nonInc) errors.push(`Time is not strictly increasing (${nonInc} step(s) go backwards or repeat).`);
        else {
          const sorted = Float64Array.from(dts).sort(), med = sorted[Math.floor(sorted.length / 2)];
          let maxDev = 0, irregular = 0; for (const d of dts) { const dev = Math.abs(d - med) / med; if (dev > maxDev) maxDev = dev; if (dev > m.jitterTol) irregular++; }
          const est = 1 / med; timeInfo = { medianDt: med, estimatedFs: est, maxRelDeviation: maxDev, irregularSteps: irregular };
          if (irregular / dts.length > 0.01) errors.push(`Sampling intervals are not consistent (${irregular} of ${dts.length} deviate by more than ${(m.jitterTol * 100).toFixed(0)}%). Fixed-rate analysis would be wrong; resample the file first.`);
          else {
            if (fs > 0 && Math.abs(fs - est) / est > 0.02) warnings.push(`The sampling rate you entered (${fs} Hz) differs from the rate implied by the time column (${est.toFixed(2)} Hz). Your value is used; check it is right.`);
            if (!(fs > 0)) fs = est;
          }
        }
      }
    }
    if (!(fs > 0) && !errors.length) errors.push('Enter the sampling rate in Hz (it cannot be inferred without a time column).');
    if (fs > 0 && (fs < 1 || fs > 20000)) errors.push(`A sampling rate of ${fs} Hz is outside the supported range (1–20,000 Hz).`);
    if (errors.length) return { ok: false, errors, warnings, timeInfo };

    const channels = [], factor = m.convertToUV ? UNIT_FACTORS[m.unit] || 1 : 1; let totalMissing = 0, totalInvalid = 0; const perMissing = [];
    for (const c of m.channelCols) {
      const d = new Float32Array(n); let miss = 0, inv = 0; const gap = [];
      for (let i = 0; i < n; i++) { const raw = body[i][c]; if (raw == null || MISSING.test(String(raw).trim())) { miss++; gap.push(i); d[i] = NaN; } else if (!isNum(raw)) { inv++; gap.push(i); d[i] = NaN; } else d[i] = Number(raw) * factor; }
      const frac = (miss + inv) / n;
      if (frac > m.maxMissing) { errors.push(`Column “${parsed.header[c]}” is ${(frac * 100).toFixed(1)}% missing or invalid; that is above the ${(m.maxMissing * 100).toFixed(0)}% limit.`); continue; }
      if (miss + inv && m.missing === 'reject') { errors.push(`Column “${parsed.header[c]}” has ${miss + inv} missing/invalid value(s) and rejection was selected.`); continue; }
      if (miss + inv) fillGaps(d, m.missing);
      let allSame = true; for (let i = 1; i < n; i++) if (d[i] !== d[0]) { allSame = false; break; }
      if (allSame) warnings.push(`Column “${parsed.header[c]}” is constant; its spectrum and statistics are not meaningful.`);
      channels.push({ name: parsed.header[c], data: d, missing: miss, invalid: inv }); totalMissing += miss; totalInvalid += inv; perMissing.push(miss + inv);
    }
    if (errors.length) return { ok: false, errors, warnings, timeInfo };
    if (totalMissing + totalInvalid) warnings.push(`${totalMissing} missing and ${totalInvalid} invalid value(s) were ${m.missing === 'zero' ? 'replaced by zero' : 'filled by linear interpolation'} — those samples are not real measurements.`);
    if (n / fs < 4) warnings.push(`Only ${(n / fs).toFixed(2)} s of data: spectra and band-power estimates will be unreliable.`);
    if (fs < 60) warnings.push(`At ${fs} Hz the Nyquist limit is ${fs / 2} Hz, so gamma (30–100 Hz) and mains frequencies cannot be analysed.`);
    let labels = null;
    if (m.labelCol != null) labels = body.map((r) => String(r[m.labelCol] == null ? '' : r[m.labelCol]).trim());
    const dataset = { source: 'IMPORTED', filename: meta.filename || 'unnamed.csv', size: meta.size || 0, fs, n, duration: n / fs, unit: m.convertToUV ? 'µV (converted from ' + m.unit + ')' : m.unit === 'au' ? 'arbitrary units' : m.unit === 'uV' ? 'µV' : m.unit, unitRaw: m.unit, converted: !!m.convertToUV, channels, labels, missing: totalMissing, invalid: totalInvalid, timeInfo, importedAt: new Date().toISOString(), id: 'D' + Date.now().toString(36) };
    return { ok: true, errors, warnings, dataset, timeInfo };
  }

  function fillGaps(d, mode) {
    const n = d.length;
    if (mode === 'zero') { for (let i = 0; i < n; i++) if (d[i] !== d[i]) d[i] = 0; return; }
    let first = -1; for (let i = 0; i < n; i++) if (d[i] === d[i]) { first = i; break; }
    if (first < 0) { d.fill(0); return; }
    for (let i = 0; i < first; i++) d[i] = d[first];
    let prev = first;
    for (let i = first + 1; i < n; i++) {
      if (d[i] === d[i]) { prev = i; continue; }
      let j = i; while (j < n && d[j] !== d[j]) j++;
      if (j >= n) { for (let k = i; k < n; k++) d[k] = d[prev]; break; }
      for (let k = i; k < j; k++) d[k] = d[prev] + ((d[j] - d[prev]) * (k - prev)) / (j - prev);
      i = j; prev = j;
    }
  }

  return { detectDelimiter, parseCsv, parseCsvChunked, analyze, buildDataset, fillGaps, UNIT_FACTORS, isNum };
});
