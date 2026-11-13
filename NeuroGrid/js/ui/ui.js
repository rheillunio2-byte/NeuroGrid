/* NeuroGrid — shared UI toolkit: icons, tooltips, toasts, modals, controls, particle bursts, sound. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const U = NG.util, store = NG.store;
  const ui = (NG.ui = {});

  ui.icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

  /* ---------- live-region announcer (screen readers) ---------- */
  ui.announce = (msg) => { const el = U.$('#srLive'); if (!el) return; el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };

  /* ---------- toasts ---------- */
  ui.toast = (msg, opts = {}) => {
    const host = U.$('#toasts'); if (!host) return;
    const type = opts.type || 'info', ms = opts.ms || 3200;
    const icon = opts.icon || { success: 'check', warn: 'alert', info: 'info', ach: 'trophy' }[type] || 'info';
    const el = U.h('div.toast.toast-' + type, { role: 'status' }, U.html(ui.icon(icon, 'toast-i')), U.h('div.toast-body', opts.title ? U.h('strong', opts.title) : null, U.h('span', msg)));
    host.append(el);
    while (host.children.length > 4) host.firstChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), NG.motion.level ? 260 : 0); };
    setTimeout(close, ms);
    el.addEventListener('click', close);
    return el;
  };

  /* ---------- modals ---------- */
  const modals = [];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  ui.modal = {
    /** opts: { title, eyebrow, body (string|Node), actions:[{label,primary,danger,onClick,keepOpen}], wide, onClose } */
    open(opts) {
      const root = U.$('#modalRoot'), id = 'modal-' + U.uid(), opener = document.activeElement;
      const body = U.h('div.modal-body');
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.append(opts.body);
      const actions = U.h('div.modal-actions');
      const el = U.h('div.modal' + (opts.wide ? '.modal-wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
        U.h('button.modal-x.btn.btn-icon.btn-ghost', { type: 'button', 'aria-label': 'Close dialog', html: ui.icon('x') }),
        opts.eyebrow ? U.h('div.eyebrow', opts.eyebrow) : null, U.h('h2.modal-title', { id }, opts.title || ''), body, actions);
      const backdrop = U.h('div.modal-backdrop', el);
      const handle = { el, body, close };
      let closed = false;
      function close(result) {
        if (closed) return; closed = true;
        const i = modals.indexOf(handle); if (i >= 0) modals.splice(i, 1);
        backdrop.classList.remove('in');
        setTimeout(() => { backdrop.remove(); if (!modals.length) { U.$('#app').removeAttribute('inert'); } }, NG.motion.level ? 220 : 0);
        document.removeEventListener('keydown', onKey, true);
        if (opener && opener.focus && document.contains(opener)) opener.focus();
        if (opts.onClose) opts.onClose(result);
      }
      for (const a of opts.actions || []) {
        const b = U.h('button.btn' + (a.primary ? '.btn-primary' : a.danger ? '.btn-danger' : '.btn-ghost'), { type: 'button' }, a.label);
        b.addEventListener('click', () => { if (a.onClick) a.onClick(handle); if (!a.keepOpen) close(a.value); });
        actions.append(b);
      }
      if (!opts.actions || !opts.actions.length) actions.remove();
      function onKey(e) {
        if (modals[modals.length - 1] !== handle) return;
        if (e.key === 'Escape') { e.stopPropagation(); close(false); }
        else if (e.key === 'Tab') {
          const f = U.$$(FOCUSABLE, el).filter((n) => n.offsetParent !== null);
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      el.querySelector('.modal-x').addEventListener('click', () => close(false));
      backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(false); });
      root.append(backdrop); modals.push(handle);
      U.$('#app').setAttribute('inert', '');
      requestAnimationFrame(() => { backdrop.classList.add('in'); (el.querySelector('.btn-primary, .btn-danger') || el.querySelector(FOCUSABLE)).focus(); });
      return handle;
    },
    confirm(opts) {
      return new Promise((resolve) => {
        ui.modal.open({
          title: opts.title, eyebrow: opts.eyebrow, body: `<p>${opts.message}</p>`, onClose: (r) => resolve(r === true),
          actions: [{ label: opts.cancelText || 'Cancel', value: false }, { label: opts.confirmText || 'Confirm', primary: !opts.danger, danger: !!opts.danger, value: true }],
        });
      });
    },
    get count() { return modals.length; },
  };

  /* ---------- tooltips (delegated; any element with data-tip) ---------- */
  (function tooltips() {
    let tip, target, timer;
    const ensure = () => tip || (tip = U.$('#tooltip'));
    function show(el) {
      const text = el.getAttribute('data-tip'); if (!text) return;
      target = el; const t = ensure(); t.textContent = text; t.classList.add('show');
      el.setAttribute('aria-describedby', 'tooltip');
      const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect(), pad = 8;
      let pos = el.getAttribute('data-tip-pos') || 'top', x, y;
      if (pos === 'right') { x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2; if (x + tr.width > innerWidth - pad) pos = 'top'; }
      if (pos !== 'right') { x = r.left + r.width / 2 - tr.width / 2; y = pos === 'bottom' ? r.bottom + 10 : r.top - tr.height - 10; if (y < pad) y = r.bottom + 10; }
      t.style.transform = `translate(${Math.round(U.clamp(x, pad, innerWidth - tr.width - pad))}px, ${Math.round(U.clamp(y, pad, innerHeight - tr.height - pad))}px)`;
    }
    function hide() { clearTimeout(timer); if (target) target.removeAttribute('aria-describedby'); target = null; if (ensure()) ensure().classList.remove('show'); }
    document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el !== target) { clearTimeout(timer); timer = setTimeout(() => show(el), 280); } else if (!el) hide(); });
    document.addEventListener('mouseout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) show(el); });
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    document.addEventListener('scroll', hide, true);
    document.addEventListener('pointerdown', hide, true);
  })();

  /* ---------- form controls ---------- */
  ui.range = (input) => {
    const sync = () => { const min = +input.min || 0, max = +input.max || 100; input.style.setProperty('--p', ((+input.value - min) / (max - min)) * 100 + '%'); };
    input.addEventListener('input', sync); sync(); input._sync = sync; return sync;
  };
  ui.setRange = (input, v) => { input.value = v; if (input._sync) input._sync(); else input.style.setProperty('--p', ((v - (+input.min || 0)) / ((+input.max || 100) - (+input.min || 0))) * 100 + '%'); };

  ui.switchHtml = (id, label, checked, desc) => `<label class="switch" for="${id}"><input type="checkbox" role="switch" id="${id}"${checked ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text"><span class="switch-label">${label}</span>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  /** Accessible radio-group made of buttons. opts: { options:[{value,label,tip,html}], value, label, onChange } */
  ui.segmented = (host, opts) => {
    host.classList.add('seg'); host.setAttribute('role', 'radiogroup'); if (opts.label) host.setAttribute('aria-label', opts.label);
    host.innerHTML = '';
    let value = opts.value;
    const btns = opts.options.map((o) => {
      const b = U.h('button.seg-btn', { type: 'button', role: 'radio', 'data-value': String(o.value), 'data-tip': o.tip || null }, o.html ? U.html(`<span>${o.html}</span>`) : o.label);
      b.addEventListener('click', () => set(o.value, true)); host.append(b); return b;
    });
    function paint() { btns.forEach((b, i) => { const on = String(opts.options[i].value) === String(value); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }); }
    function set(v, fire) { value = v; paint(); if (fire && opts.onChange) opts.onChange(v); }
    host.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement); if (i < 0) return;
      let n = -1; if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % btns.length; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + btns.length) % btns.length;
      if (n >= 0) { e.preventDefault(); btns[n].focus(); set(opts.options[n].value, true); }
    });
    paint();
    return { set: (v) => set(v, false), get: () => value };
  };

  /** Tab list: host contains [role=tab][data-tab]; panels are elements with [data-panel] inside `panels`. */
  ui.tabs = (host, panels, onChange) => {
    const tabs = U.$$('[role=tab]', host);
    function select(id, focus) {
      tabs.forEach((t) => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      U.$$('[data-panel]', panels).forEach((p) => { p.hidden = p.dataset.panel !== id; });
      if (host.classList.contains('tabs')) {
        const act = tabs.find((t) => t.dataset.tab === id);
        if (act) { host.style.setProperty('--ind-x', act.offsetLeft + 'px'); host.style.setProperty('--ind-w', act.offsetWidth + 'px'); }
      }
      if (onChange) onChange(id);
    }
    tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab)));
    host.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      let n = -1; if (e.key === 'ArrowRight') n = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
      if (n >= 0) { e.preventDefault(); select(tabs[n].dataset.tab, true); }
    });
    return { select };
  };

  /** Stagger card entrance animations (CSS reads --i). */
  ui.reveal = (root) => { U.$$('[data-reveal]', root).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12))); };

  /* ---------- pointer spotlight on cards ---------- */
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.spot'); if (!card) return;
    const r = card.getBoundingClientRect(); card.style.setProperty('--mx', e.clientX - r.left + 'px'); card.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });

  /* ---------- particle bursts ---------- */
  (function bursts() {
    let cv, ctx, parts = [];
    function step(dt) {
      if (!cv) return;
      const w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985;
        ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!parts.length) { NG.loop.remove('fx'); ctx.clearRect(0, 0, w, h); }
    }
    ui.burst = (x, y, opts = {}) => {
      const lvl = NG.motion.level; if (lvl < 2) return;
      cv = cv || U.$('#fxCanvas'); if (!cv) return;
      if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; ctx = cv.getContext('2d'); }
      ctx = ctx || cv.getContext('2d');
      const n = Math.round((opts.count || 26) * (lvl === 3 ? 1.6 : 1)), cols = NG.theme ? NG.theme.burstColors() : ['#5eead4', '#a78bfa', '#7aa7ff'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 300;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 160, r: 1.5 + Math.random() * 2.6, c: cols[i % cols.length], life: 0.7 + Math.random() * 0.6, max: 1.3 });
      }
      NG.loop.add('fx', step);
    };
    ui.burstAt = (el, opts) => { const r = el.getBoundingClientRect(); ui.burst(r.left + r.width / 2, r.top + r.height / 2, opts); };
  })();

  /* ---------- sound effects (Web Audio, off by default) ---------- */
  (function sound() {
    let ac;
    const SEQ = { correct: [[660, 0.09], [880, 0.14]], wrong: [[240, 0.18]], ach: [[523, 0.09], [659, 0.09], [784, 0.09], [1046, 0.2]], start: [[440, 0.07], [660, 0.12]], stop: [[600, 0.08], [380, 0.14]], click: [[700, 0.03]] };
    NG.sound = {
      play(name) {
        if (!store.get('ui.sound')) return;
        try {
          ac = ac || new (window.AudioContext || window.webkitAudioContext)();
          if (ac.state === 'suspended') ac.resume();
          let t = ac.currentTime;
          for (const [f, d] of SEQ[name] || []) {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
          }
        } catch (e) { /* audio unavailable */ }
      },
    };
  })();
})();
