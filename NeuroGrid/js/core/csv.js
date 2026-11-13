/* NeuroGrid — CSV helpers (UMD so they can be unit-tested in Node). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.csv = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ASCII_MAP = { '–': '-', '—': '-', '−': '-', 'µ': 'u', 'μ': 'u', '’': "'", '‘': "'", '“': '"', '”': '"', '×': 'x', '≥': '>=', '≤': '<=', '→': '->', '·': '-', '…': '...', 'δ': 'delta', 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', '²': '2' };

  /** Keep exports plain ASCII so spreadsheet apps never show mojibake. */
  function ascii(s) {
    return String(s).replace(/[^\x00-\x7f]/g, (c) => (c in ASCII_MAP ? ASCII_MAP[c] : '?'));
  }

  /** Escape one value. Strings that look like spreadsheet formulas are neutralised. */
  function cell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = ascii(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function row(values) { return values.map(cell).join(','); }

  /** headers: string[]; rows: any[][] -> CSV text (LF line endings, trailing newline). */
  function toCsv(headers, rows) {
    const out = [row(headers)];
    for (let i = 0; i < rows.length; i++) out.push(row(rows[i]));
    return out.join('\n') + '\n';
  }

  return { ascii, cell, row, toCsv };
});
