/* NeuroGrid — Settings: every control here changes real behaviour and is persisted in localStorage. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, store = NG.store;
  const { PROFILES, PROFILE_ORDER } = NG.sim;
  NG.views = NG.views || {};
  const ANIM = ['Off', 'Subtle', 'Balanced', 'Rich'];
  const ANIM_DESC = ['No motion effects. The signal still streams.', 'Gentle transitions, static background glow.', 'Smooth transitions, drifting glow and neural background.', 'Everything, including travelling signal pulses and bigger particle bursts.'];

  NG.views.settings = {
    id: 'settings', title: 'Settings', icon: 'settings',
    render() {
      return `${ui.pageHead('07 · Settings', 'Make it <em>yours</em>', 'Appearance, motion, visualisation and signal preferences. Changes apply instantly and are remembered the next time you open NeuroGrid on this device.')}
      <div class="set-layout">
        <section class="card" data-reveal aria-labelledby="sa"><div class="card-head"><div><h2 class="card-title" id="sa">Appearance</h2></div></div><div class="card-body stack">
          <div class="field"><span class="label" id="thL">Theme</span><div class="theme-grid" id="setTheme" role="radiogroup" aria-labelledby="thL"></div></div>
          <div class="field"><span class="label" id="acL">Accent colour</span><div class="swatches" id="setAccent" role="radiogroup" aria-labelledby="acL"></div></div>
        </div></section>
        <section class="card" data-reveal aria-labelledby="sm"><div class="card-head"><div><h2 class="card-title" id="sm">Motion</h2></div></div><div class="card-body stack">
          <div class="field"><div class="field-top"><label class="label" for="setAnim">Animation intensity</label><output class="value-out" id="setAnimO"></output></div><input class="range" type="range" id="setAnim" min="0" max="3" step="1"><p class="hint" id="setAnimH"></p></div>
          <div class="field"><span class="label" id="rmL">Reduced motion</span><div id="setMotion"></div><p class="hint" id="setMotionH"></p></div>
        </div></section>
        <section class="card" data-reveal aria-labelledby="sv"><div class="card-head"><div><h2 class="card-title" id="sv">Visualisation</h2></div></div><div class="card-body stack">
          ${ui.switchHtml('setGrid', 'Show grid &amp; scale', true, 'Grid lines, time markers and the µV scale on waveforms')}
          ${ui.switchHtml('setGlow', 'Waveform glow', true, 'Soft halo around traces')}
          <div class="field"><div class="field-top"><label class="label" for="setLw">Line width</label><output class="value-out" id="setLwO"></output></div><input class="range" type="range" id="setLw" min="1" max="3" step="0.1"></div>
          <div class="field"><span class="label">Spectrum scale</span><div id="setSpec"></div></div>
        </div></section>
        <section class="card" data-reveal aria-labelledby="ss"><div class="card-head"><div><h2 class="card-title" id="ss">Signal</h2></div></div><div class="card-body stack">
          <div class="field"><label class="label" for="setProf">Default signal profile</label><select class="select" id="setProf"></select><p class="hint">The profile the Signal Lab starts with, and the one it is using right now.</p></div>
          <div class="field"><div class="field-top"><label class="label" for="setSpeed">Signal update speed</label><output class="value-out" id="setSpeedO"></output></div><input class="range" type="range" id="setSpeed" min="0.25" max="4" step="0.25"><p class="hint">How fast simulated time runs. 1× is real time.</p></div>
          <div class="field"><span class="label">Mains frequency</span><div id="setMains"></div><p class="hint">Where simulated power-line hum appears (50 Hz in most countries, 60 Hz in the Americas and parts of Asia).</p></div>
          ${ui.switchHtml('setSound', 'Sound effects', false, 'Short tones for answers, achievements and recording')}
          <button class="btn btn-sm" id="setSoundTest" type="button">${ui.icon('volume')}<span>Play test sound</span></button>
        </div></section>
        <section class="card" data-reveal aria-labelledby="sk"><div class="card-head"><div><h2 class="card-title" id="sk">Keyboard shortcuts</h2></div></div><div class="card-body"><dl class="kv shortcuts"><div><dt>Go to a section</dt><dd><span class="kbd">1</span>–<span class="kbd">7</span></dd></div><div><dt>Pause / resume signal</dt><dd><span class="kbd">Space</span></dd></div><div><dt>Collapse sidebar</dt><dd><span class="kbd">[</span></dd></div><div><dt>About &amp; shortcuts</dt><dd><span class="kbd">?</span></dd></div><div><dt>Answer (in a round)</dt><dd><span class="kbd">A</span>–<span class="kbd">E</span></dd></div><div><dt>Hint / next question</dt><dd><span class="kbd">H</span> · <span class="kbd">Enter</span></dd></div></dl></div></section>
        <section class="card" data-reveal aria-labelledby="sd"><div class="card-head"><div><h2 class="card-title" id="sd">Reset</h2></div></div><div class="card-body stack">
          <p class="hint">Settings are saved in your browser only. Resetting cannot be undone.</p>
          <div class="row wrap"><button class="btn" id="setReset" type="button">${ui.icon('refresh')}<span>Reset settings</span></button><button class="btn btn-danger" id="setResetAll" type="button">${ui.icon('trash')}<span>Delete all NeuroGrid data</span></button></div>
        </div></section>
      </div>`;
    },
    init(root) {
      const $ = (s) => U.$(s, root); this.root = root;
      /* theme cards */
      const tg = $('#setTheme'), PREV = { midnight: ['#060a14', '#111b30'], abyss: ['#010204', '#0b111d'], daylight: ['#edf1f8', '#ffffff'] };
      Object.entries(NG.theme.THEMES).forEach(([id, name]) => { const b = U.h('button.theme-card', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-id': id }, U.html(`<span class="theme-prev" style="background:${PREV[id][0]}"><i style="background:${PREV[id][1]}"></i><i style="background:rgb(var(--accent-rgb))"></i></span>`), U.h('b', name)); b.addEventListener('click', () => store.set('ui.theme', id)); tg.append(b); });
      const ag = $('#setAccent');
      Object.entries(NG.theme.ACCENTS).forEach(([id, [rgb, name]]) => { const b = U.h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': name, 'data-id': id, 'data-tip': name, style: { '--sw': `rgb(${rgb})` } }); b.addEventListener('click', () => store.set('ui.accent', id)); ag.append(b); });
      /* motion */
      const an = $('#setAnim'); ui.range(an); an.addEventListener('input', () => store.set('ui.anim', +an.value));
      this.motion = ui.segmented($('#setMotion'), { label: 'Reduced motion', value: store.get('ui.motion'), options: [{ value: 'auto', label: 'Follow system' }, { value: 'on', label: 'Always reduce' }, { value: 'off', label: 'Don’t reduce' }], onChange: (v) => store.set('ui.motion', v) });
      /* visualisation */
      $('#setGrid').addEventListener('change', (e) => store.set('ui.grid', e.target.checked)); $('#setGlow').addEventListener('change', (e) => store.set('ui.glow', e.target.checked));
      const lw = $('#setLw'); ui.range(lw); lw.addEventListener('input', () => store.set('ui.lineWidth', +lw.value));
      this.spec = ui.segmented($('#setSpec'), { label: 'Spectrum scale', value: store.get('ui.specScale'), options: [{ value: 'linear', label: 'Linear' }, { value: 'db', label: 'Decibel (dB)' }], onChange: (v) => store.set('ui.specScale', v) });
      /* signal */
      PROFILE_ORDER.forEach((id) => $('#setProf').append(U.h('option', { value: id }, PROFILES[id].name))); $('#setProf').addEventListener('change', (e) => store.set('lab.profile', e.target.value));
      const sp = $('#setSpeed'); ui.range(sp); sp.addEventListener('input', () => store.set('lab.speed', +sp.value));
      this.mains = ui.segmented($('#setMains'), { label: 'Mains frequency', value: store.get('ui.mains'), options: [{ value: 50, label: '50 Hz' }, { value: 60, label: '60 Hz' }], onChange: (v) => store.set('ui.mains', +v) });
      $('#setSound').addEventListener('change', (e) => { store.set('ui.sound', e.target.checked); if (e.target.checked) NG.sound.play('correct'); });
      $('#setSoundTest').addEventListener('click', () => { if (!store.get('ui.sound')) { ui.toast('Sound effects are switched off — turn them on first.', { type: 'warn' }); return; } NG.sound.play('ach'); });
      $('#setReset').addEventListener('click', async () => { if (await ui.modal.confirm({ title: 'Reset settings?', message: 'Restores theme, accent, motion, visualisation and signal settings to their defaults. Your sessions and progress are kept.', confirmText: 'Reset settings', danger: true })) { store.reset(); ui.toast('Settings restored to defaults.', { type: 'success' }); } });
      $('#setResetAll').addEventListener('click', () => NG.app.resetAll());
      this.unsubs = [store.on('*', () => this.sync()), store.on('reset', () => this.sync())]; this.sync();
    },
    sync() {
      const r = this.root, $ = (s) => U.$(s, r), ui_ = store.get('ui'), lab = store.get('lab');
      U.$$('.theme-card', r).forEach((b) => b.setAttribute('aria-checked', b.dataset.id === ui_.theme)); U.$$('.swatch', r).forEach((b) => b.setAttribute('aria-checked', b.dataset.id === ui_.accent));
      ui.setRange($('#setAnim'), ui_.anim); $('#setAnimO').textContent = ANIM[ui_.anim]; $('#setAnimH').textContent = ANIM_DESC[ui_.anim];
      this.motion.set(ui_.motion);
      const sys = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#setMotionH').textContent = ui_.motion === 'auto' ? `Following your system setting (currently ${sys ? 'reduce' : 'no preference'}). ${NG.motion.reduced ? 'Animations are minimised.' : ''}` : ui_.motion === 'on' ? 'Animations are minimised regardless of the system setting.' : 'Animations follow the intensity above, even if your system asks to reduce motion.';
      $('#setGrid').checked = ui_.grid; $('#setGlow').checked = ui_.glow; ui.setRange($('#setLw'), ui_.lineWidth); $('#setLwO').textContent = ui_.lineWidth.toFixed(1) + ' px'; this.spec.set(ui_.specScale);
      $('#setProf').value = lab.profile; ui.setRange($('#setSpeed'), lab.speed); $('#setSpeedO').textContent = lab.speed + '×'; this.mains.set(ui_.mains); $('#setSound').checked = ui_.sound;
    },
    show() { this.sync(); }, hide() {},
  };
})();
