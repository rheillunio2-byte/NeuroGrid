/* NeuroGrid — small form-control factories shared by the 3.0 views. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui; let seq = 0;
  /** Range slider with label and live value. Returns { el, input, set(v), get() }. */
  ui.slider = (opts) => {
    const id = 'ctl' + ++seq, input = U.h('input.range', { type: 'range', id, min: opts.min, max: opts.max, step: opts.step || 1 }), out = U.h('output.value-out', { for: id });
    const fmt = opts.fmt || ((v) => v), set = (v) => { ui.setRange(input, v); out.textContent = fmt(+v); };
    input.addEventListener('input', () => { out.textContent = fmt(+input.value); if (opts.onInput) opts.onInput(+input.value); });
    ui.range(input); set(opts.value);
    const el = U.h('div.field', U.h('div.field-top', U.h('label.label', { for: id }, opts.label), out), input, opts.hint ? U.h('span.hint', opts.hint) : null);
    return { el, input, set, get: () => +input.value };
  };
  /** Labelled <select>. options: [[value,label]]. */
  ui.selectField = (opts) => {
    const id = 'ctl' + ++seq, sel = U.h('select.select', { id }); opts.options.forEach(([v, l]) => sel.append(U.h('option', { value: v }, l))); sel.value = opts.value;
    sel.addEventListener('change', () => opts.onChange && opts.onChange(sel.value));
    return { el: U.h('div.field', U.h('label.label', { for: id }, opts.label), sel, opts.hint ? U.h('span.hint', opts.hint) : null), sel, set: (v) => { sel.value = v; }, get: () => sel.value };
  };
  /** Segmented field. */
  ui.segField = (opts) => { const host = U.h('div'); const s = ui.segmented(host, opts); return { el: U.h('div.field', U.h('span.label', opts.label), host, opts.hint ? U.h('span.hint', opts.hint) : null), seg: s }; };
  /** Source badge: SIMULATED or IMPORTED. */
  ui.sourceBadge = (src) => `<span class="badge ${src === 'IMPORTED' ? 'badge-live' : 'badge-sim'}">${src === 'IMPORTED' ? 'Imported data' : 'Simulated'}</span>`;
  /** Switch element wired to a callback. */
  ui.switchField = (label, checked, desc, onChange) => { const el = U.html(ui.switchHtml('sw' + ++seq, label, checked, desc)); el.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked)); return el; };
  /** Draw a simple line chart onto a canvas (training curves etc.). series: [{label, color, values:[number|null]}]. */
  ui.lineChart = (cv, opts) => {
    const f = U.fitCanvas(cv), ctx = cv.getContext('2d'), C = NG.theme.c, w = f.w, h = f.h, g = { l: 40, r: 10, t: 14, b: 22 }; ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const all = opts.series.flatMap((s) => s.values.filter((v) => v != null && isFinite(v))), n = Math.max(1, ...opts.series.map((s) => s.values.length));
    ctx.font = '500 10px "DM Mono", monospace'; if (!all.length) { ctx.fillStyle = C.text3; ctx.textAlign = 'center'; ctx.fillText(opts.empty || 'No data yet', w / 2, h / 2); return; }
    let lo = opts.min != null ? opts.min : Math.min(...all), hi = opts.max != null ? opts.max : Math.max(...all); if (hi - lo < 1e-9) hi = lo + 1;
    const X = (i) => g.l + (n === 1 ? 0 : (i / (n - 1)) * (w - g.l - g.r)), Y = (v) => g.t + (1 - (v - lo) / (hi - lo)) * (h - g.t - g.b);
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.text3; ctx.textAlign = 'right'; for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(g.l, y); ctx.lineTo(w - g.r, y); ctx.stroke(); ctx.fillText(v.toFixed(opts.digits == null ? 2 : opts.digits), g.l - 5, y + 3); }
    ctx.textAlign = 'center'; ctx.fillText('epoch', w / 2, h - 4); ctx.textAlign = 'left'; ctx.fillText('1', g.l, h - 4); ctx.textAlign = 'right'; ctx.fillText(String(n), w - g.r, h - 4);
    opts.series.forEach((s) => { ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.setLineDash(s.dash || []); ctx.beginPath(); let st = false; s.values.forEach((v, i) => { if (v == null || !isFinite(v)) return; if (!st) { ctx.moveTo(X(i), Y(v)); st = true; } else ctx.lineTo(X(i), Y(v)); }); ctx.stroke(); ctx.setLineDash([]); });
    let lx = g.l + 6; ctx.textAlign = 'left'; opts.series.forEach((s) => { ctx.fillStyle = s.color; ctx.fillRect(lx, 4, 10, 3); ctx.fillStyle = C.text2; ctx.fillText(s.label, lx + 14, 9); lx += ctx.measureText(s.label).width + 30; });
  };
  /** Confusion-matrix HTML table. */
  ui.confusionHtml = (cm, classes) => { const max = Math.max(1, ...cm.flat()); return `<div class="conf-wrap"><table class="conf" aria-label="Confusion matrix: rows are true classes, columns are predictions"><thead><tr><th scope="col"></th>${classes.map((c) => `<th scope="col">${U.esc(c)}</th>`).join('')}</tr><tr><th scope="col" class="conf-corner">true ↓ / predicted →</th>${classes.map(() => '<th></th>').join('')}</tr></thead><tbody>${cm.map((r, i) => `<tr><th scope="row">${U.esc(classes[i])}</th>${r.map((v, j) => `<td class="${i === j ? 'diag' : ''}" style="--a:${(v / max).toFixed(2)}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; };
})();
