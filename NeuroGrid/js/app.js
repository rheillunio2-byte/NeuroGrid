/* NeuroGrid — application shell: router, sidebar, top bar, shortcuts, global handlers. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store, engine = NG.engine, progress = NG.progress;
  const ORDER = ['overview', 'lab', 'spectrogram', 'topography', 'studio', 'data', 'network', 'bci', 'experiments', 'learn', 'research', 'sessions', 'settings'];
  const app = (NG.app = {});

  /* shared page header (used by every view) */
  ui.pageHead = (eyebrow, title, desc, actions) => `<header class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;

  let current = null, built = false, leaveTimer = 0;
  const $app = () => U.$('#app');
  const sectionOf = (id) => U.$('#view-' + id);

  function build() {
    const host = U.$('#views');
    ORDER.forEach((id) => {
      const v = NG.views[id], sec = U.h('section.view', { id: 'view-' + id, hidden: true, 'aria-label': v.title });
      try { sec.innerHTML = v.render(); host.append(sec); v.init(sec); } catch (e) { console.error(`[NeuroGrid] failed to build view "${id}"`, e); sec.innerHTML = `<div class="callout callout-warn">${ui.icon('alert')}<div><strong>This section failed to load.</strong> Check the browser console for details.</div></div>`; host.append(sec); v.broken = true; }
    });
    built = true;
  }

  function go(id, opts = {}) {
    if (!NG.views[id]) id = 'overview';
    if (current === id && !opts.force) return;
    const prev = current, next = sectionOf(id), V = NG.views[id], motion = NG.motion.level > 0;
    clearTimeout(leaveTimer);
    if (prev) { const ps = sectionOf(prev); try { NG.views[prev].hide(); } catch (e) { console.error(e); } if (motion && !opts.instant) { ps.classList.add('is-leaving'); leaveTimer = setTimeout(() => { ps.hidden = true; ps.classList.remove('is-leaving'); }, 170); } else ps.hidden = true; }
    U.$$('.view').forEach((s) => { if (s !== next && s.id !== 'view-' + prev) s.hidden = true; });
    current = id; next.hidden = false; next.classList.remove('is-leaving');
    next.classList.add('is-entering'); ui.reveal(next); setTimeout(() => next.classList.remove('is-entering'), 1000);
    if (!V.broken) { try { V.show(); } catch (e) { console.error(`[NeuroGrid] view "${id}" failed to show`, e); } }
    U.$$('[data-view]').forEach((a) => { if (a.dataset.view === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    U.$('#crumb').textContent = V.title; document.title = `${V.title} · NeuroGrid 3.0`;
    window.scrollTo({ top: 0, behavior: 'auto' });
    progress.markVisited(id); closeDrawer(); ui.announce(`${V.title} section`);
    if (!opts.noFocus) U.$('#main').focus({ preventScroll: true });
  }
  app.go = (id) => { if (location.hash !== '#/' + id) location.hash = '#/' + id; else go(id); };
  function route() { const m = /^#\/([a-z]+)/.exec(location.hash), id = m && NG.views[m[1]] ? m[1] : 'overview'; go(id, { noFocus: !current }); }

  /* ---------------- sidebar & drawer ---------------- */
  function setSidebar(mode) {
    $app().dataset.sidebar = mode; const b = U.$('#collapseBtn'); const col = mode === 'collapsed';
    b.setAttribute('aria-label', col ? 'Expand sidebar' : 'Collapse sidebar'); b.setAttribute('data-tip', (col ? 'Expand sidebar' : 'Collapse sidebar') + ' ( [ )');
    U.$$('.nav-item').forEach((a) => (col ? a.setAttribute('data-tip', a.querySelector('.nav-text').textContent) : a.removeAttribute('data-tip')));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 520);
  }
  function openDrawer() { $app().classList.add('drawer-open'); U.$('#menuBtn').setAttribute('aria-expanded', 'true'); const a = U.$('.nav-item[aria-current]') || U.$('.nav-item'); a && a.focus(); }
  function closeDrawer() { if (!$app().classList.contains('drawer-open')) return; $app().classList.remove('drawer-open'); U.$('#menuBtn').setAttribute('aria-expanded', 'false'); }

  /* ---------------- status (sidebar + top bar) ---------------- */
  function updateStatus() {
    const rec = engine.session.state === 'recording', run = engine.running, st = rec ? 'rec' : run ? 'live' : 'paused';
    const label = rec ? 'REC' : run ? 'LIVE' : 'PAUSED';
    const top = U.$('#topStatus'); top.classList.toggle('is-rec', rec); top.classList.toggle('is-paused', !run && !rec);
    U.$('#topDot').className = 'dot ' + (st === 'live' ? 'live' : st); U.$('#topState').textContent = label;
    U.$('#topClock').textContent = U.fmtClock(rec ? engine.session.duration : engine.generated / engine.FS);
    U.$('#sideDot').className = 'dot ' + (st === 'live' ? 'live' : st); U.$('#sideState').textContent = rec ? 'RECORDING SIMULATION' : run ? 'SIMULATOR ONLINE' : 'SIMULATOR PAUSED';
    top.title = rec ? 'Recording a simulated session — elapsed time' : 'Simulated stream time';
  }

  /* ---------------- help / welcome ---------------- */
  function help(first) {
    ui.modal.open({
      eyebrow: first ? 'WELCOME TO NEUROGRID 3.0' : 'ABOUT NEUROGRID', title: 'A safe space to <em>experiment</em>.'.replace(/<[^>]+>/g, ''), wide: true,
      body: `<p>NeuroGrid generates <b>synthetic EEG-like signals</b> in your browser so you can explore signal visualisation, filtering, spectra and simple pattern classification.</p>
        <ul><li><b>Everything is simulated.</b> No hardware, no account, nothing uploaded — it all runs locally.</li><li>Statistics and spectra are <b>really computed</b> (FFT, Welch power, Butterworth filters) from the simulated samples.</li><li>The neural network is real but tiny, and trained only on simulated data.</li><li>Not a medical device. It cannot read thoughts or infer anyone’s real mental state.</li></ul>
        <p class="hint">Shortcuts: <span class="kbd">1</span>–<span class="kbd">9</span>, <span class="kbd">0</span> sections · <span class="kbd">Space</span> pause · <span class="kbd">[</span> sidebar · <span class="kbd">?</span> this dialog</p>`,
      actions: first ? [{ label: 'Open the Overview', primary: true, onClick: () => app.go('overview') }, { label: 'Explore on my own', value: true }] : [{ label: 'Got it', primary: true }],
    });
  }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || ui.modal.count) return;
    const t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== 'range' && t.type !== 'checkbox' || t.isContentEditable); if (typing) return;
    if (current === 'experiments' && engine && NG.views.experiments && document.querySelector('.options') && /^[a-hA-H]$/.test(e.key)) return;
    if (e.key >= '1' && e.key <= '9') { app.go(ORDER[+e.key - 1]); }
    else if (e.key === '0') { app.go(ORDER[9]); }
    else if (e.key === ' ' && !(t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.getAttribute('role') === 'radio' || t.tagName === 'INPUT' || t.tagName === 'SUMMARY'))) { e.preventDefault(); engine.toggle(); ui.toast(engine.running ? 'Signal resumed.' : 'Signal paused.', { icon: engine.running ? 'play' : 'pause', ms: 1400 }); }
    else if (e.key === '[') { const m = $app().dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed'; store.set('ui.sidebar', m); }
    else if (e.key === '?') { help(false); }
    else if (e.key === 'Escape') closeDrawer();
  }

  /* ---------------- reset everything ---------------- */
  app.resetAll = async () => {
    const ok = await ui.modal.confirm({ title: 'Delete all NeuroGrid data?', message: 'Removes your settings, experiment progress, achievements and saved session summaries from this browser, then reloads the app. This cannot be undone.', confirmText: 'Delete everything', danger: true });
    if (!ok) return;
    ['neurogrid.v2.prefs', 'neurogrid.v2.stats', 'neurogrid.v2.sessions', 'neurogrid.v2.welcomed', 'neurogrid.v3.presets'].forEach((k) => NG.storage.remove(k)); if (NG.db && NG.db.clearAll) { try { await NG.db.clearAll(); } catch (e) { /* ignore */ } } location.hash = '#/overview'; location.reload();
  };

  /* ---------------- boot ---------------- */
  function boot() {
    NG.motion.refresh(); NG.viz.background.init();
    build();
    setSidebar(store.get('ui.sidebar'));
    store.on('ui.sidebar', () => setSidebar(store.get('ui.sidebar'))); store.on('reset', () => setSidebar(store.get('ui.sidebar')));
    U.$('#collapseBtn').addEventListener('click', () => store.set('ui.sidebar', $app().dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed'));
    U.$('#menuBtn').addEventListener('click', () => ($app().classList.contains('drawer-open') ? closeDrawer() : openDrawer()));
    U.$('#moreBtn').addEventListener('click', openDrawer); U.$('#scrim').addEventListener('click', closeDrawer);
    U.$('#helpBtn').addEventListener('click', () => help(false));
    U.$$('.nav-item, .tabbar a, .brand').forEach((a) => a.addEventListener('click', () => { if (location.hash === a.getAttribute('href')) go(a.dataset.view || 'overview', { force: true }); }));
    window.addEventListener('hashchange', route); document.addEventListener('keydown', onKey);
    /* the single engine task + status refresh */
    NG.loop.add('engine', (dt) => engine.advance(dt));
    engine.on('stats', updateStatus); engine.on('run', updateStatus); engine.on('session', updateStatus); engine.on('reset', updateStatus); updateStatus();
    progress.on('achievement', (a) => { ui.toast(a.desc, { type: 'ach', title: 'Achievement unlocked: ' + a.title, ms: 5000 }); NG.sound.play('ach'); ui.burst(innerWidth / 2, innerHeight - 140, { count: 36 }); });
    /* theme-related canvases redraw when the theme changes — handled by each view via NG.theme.on('change') */
    document.addEventListener('visibilitychange', () => { if (document.hidden && engine.session.state === 'recording') { /* the stream stops with the tab; nothing else to do */ } });
    window.addEventListener('beforeunload', () => store.flush());
    window.addEventListener('error', (e) => { console.error('[NeuroGrid] uncaught error', e.error || e.message); });
    window.addEventListener('unhandledrejection', (e) => { console.error('[NeuroGrid] unhandled promise rejection', e.reason); });
    route();
    if (!NG.storage.get('neurogrid.v2.welcomed', false)) { NG.storage.set('neurogrid.v2.welcomed', true); setTimeout(() => help(true), 600); }
    if (!NG.storage.ok) ui.toast('Browser storage is blocked, so settings and progress will not be remembered after you close this tab.', { type: 'warn', ms: 6000 });
    document.documentElement.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
