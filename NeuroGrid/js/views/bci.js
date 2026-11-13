/* NeuroGrid — BCI Playground: a complete SIMULATED brain–computer-interface pipeline you can poke at.
 * acquisition → preprocessing → feature extraction → classification → output action.
 * The "user" is a simulator with a hand-set effect; this does not detect anyone's real intention. */
(function () {
  'use strict';
  const NG = window.NG, U = NG.util, ui = NG.ui, bci = NG.bci, kit = NG.evalkit, dsp = NG.dsp;
  NG.views = NG.views || {};
  const S = { task: 'command', quality: 0.8, strength: 0.6, bandpass: true, notch: false, env: 'cursor', intent: 0, auto: false, dec: null, decQ: null, log: [], tally: { n: 0, ok: 0 }, last: null, sweep: null, env_state: { x: 0.5, y: 0.5, goal: 0.9, hits: 0, lit: -1, tile: 0, on: false } };
  const STAGES = [['Signal acquisition', 'Simulated electrodes record the trial'], ['Preprocessing', 'Band-pass / notch filtering'], ['Feature extraction', 'Log mu & beta power per channel'], ['Classification', 'Small neural network (trained on simulated trials)'], ['Output action', 'Command moves something on screen']];

  NG.views.bci = {
    id: 'bci', title: 'BCI Playground', icon: 'brain',
    render() {
      return `${ui.pageHead('08 · BCI Playground', 'A brain–computer interface, <em>end to end</em>', 'Walk a simulated trial through all five stages of a BCI and watch how signal quality changes the decision. The “brain activity” is produced by NeuroGrid’s simulator with a deliberately simple, hand-set effect.')}
      <div class="callout callout-warn" data-reveal>${ui.icon('alert')}<div><strong>Simulation, not mind-reading.</strong> The intent you choose below is fed to a signal <em>simulator</em>, and a classifier trained on other simulated trials guesses it back. Real BCIs deal with far weaker, messier, person-specific signals and need calibration on each user. Nothing here detects real human intention.</div></div>
      <ol class="pipe" id="bcPipe" aria-label="BCI pipeline stages"></ol>
      <div class="bc-layout">
        <section class="card" data-reveal aria-labelledby="bcCT"><div class="card-head"><div><h2 class="card-title" id="bcCT">Set up</h2></div></div><div class="card-body stack" id="bcCtl"></div></section>
        <section class="card bc-run" data-reveal aria-labelledby="bcRT"><div class="card-head"><div><h2 class="card-title" id="bcRT">Trial <span class="badge badge-sim">Simulated</span></h2><p class="card-sub" id="bcRSub">Choose an intended class and run a trial.</p></div></div><div class="card-body stack" id="bcRun"></div></section>
        <section class="card bc-env" data-reveal aria-labelledby="bcET"><div class="card-head"><div><h2 class="card-title" id="bcET">Output environment</h2><p class="card-sub" id="bcESub"></p></div><div id="bcEnvSeg"></div></div><div class="card-body stack" id="bcEnv"></div></section>
        <section class="card bc-eval" data-reveal aria-labelledby="bcVT"><div class="card-head"><div><h2 class="card-title" id="bcVT">How signal quality changes accuracy</h2><p class="card-sub">Each point is measured on freshly simulated trials the decoder never saw.</p></div></div><div class="card-body stack" id="bcEval"></div></section>
      </div>`;
    },
    init(root) {
      this.root = root; const t = () => bci.TASKS[S.task];
      const pipe = U.$('#bcPipe', root); STAGES.forEach((s, i) => pipe.append(U.html(`<li class="pipe-step" data-i="${i}"><span class="pipe-n">${i + 1}</span><b>${s[0]}</b><small>${s[1]}</small></li>`)));
      const c = U.$('#bcCtl', root);
      this.fTask = ui.selectField({ label: 'Task', value: S.task, options: bci.TASK_ORDER.map((id) => [id, bci.TASKS[id].name]), onChange: (v) => { S.task = v; S.dec = null; S.intent = 0; S.tally = { n: 0, ok: 0 }; this.refresh(); } });
      this.fDesc = U.h('p.hint');
      this.fQ = ui.slider({ label: 'Signal quality', min: 0, max: 100, step: 5, value: S.quality * 100, fmt: (v) => v + '%', hint: 'Low quality adds broadband electrode noise to every simulated channel.', onInput: (v) => { S.quality = v / 100; } });
      this.fS = ui.slider({ label: 'Simulated effect strength', min: 10, max: 90, step: 5, value: S.strength * 100, fmt: (v) => v + '%', hint: 'How much the simulator weakens mu/beta over the relevant region.', onInput: (v) => { S.strength = v / 100; } });
      this.fBp = ui.switchField('Band-pass 1–40 Hz', S.bandpass, 'Removes drift and high-frequency noise.', (v) => { S.bandpass = v; S.dec = null; }); this.fNo = ui.switchField('Notch at mains', S.notch, 'Removes 60 Hz hum.', (v) => { S.notch = v; S.dec = null; });
      this.btnTrain = U.h('button.btn.btn-primary', { type: 'button' }, U.html(ui.icon('zap')), U.h('span', 'Train decoder')); this.btnTrain.addEventListener('click', () => this.train());
      this.decInfo = U.h('p.hint', 'No decoder yet — train one first.');
      c.append(this.fTask.el, this.fDesc, this.fQ.el, this.fS.el, this.fBp, this.fNo, this.btnTrain, this.decInfo);
      ui.segmented(U.$('#bcEnvSeg', root), { label: 'Output environment', value: S.env, options: [{ value: 'cursor', label: 'Cursor' }, { value: 'object', label: 'Object' }, { value: 'panel', label: 'Command panel' }, { value: 'ui', label: 'Interface' }], onChange: (v) => { S.env = v; this.renderEnv(); } });
      this.refresh();
    },
    refresh() { const t = bci.TASKS[S.task]; this.fDesc.textContent = t.desc; this.renderRun(); this.renderEnv(); this.renderEval(); this.stage(-1); },
    stage(i) { U.$$('.pipe-step', this.root).forEach((e, k) => { e.classList.toggle('on', k === i); e.classList.toggle('done', i > k); }); },
    pre() { return { bandpass: S.bandpass, lo: 1, hi: 40, notch: S.notch, mains: 60 }; },
    train() {
      this.btnTrain.disabled = true; this.btnTrain.querySelector('span').textContent = 'Training…';
      setTimeout(() => { try { NG.progress.unlock('bci_pilot'); S.dec = bci.trainDecoder(S.task, { quality: Math.max(0.6, S.quality), perClass: 40, pre: this.pre(), seed: 5 }); S.decQ = Math.max(0.6, S.quality); this.decInfo.textContent = `Decoder trained on ${S.dec.nTrain} simulated trials (signal quality ${Math.round(S.decQ * 100)}%).`; ui.toast('Decoder trained on simulated trials.', { type: 'success' }); } catch (e) { ui.toast(e.message, { type: 'warn' }); } this.btnTrain.disabled = false; this.btnTrain.querySelector('span').textContent = 'Train decoder'; this.renderEval(); }, 30);
    },
    renderRun() {
      const t = bci.TASKS[S.task], box = U.$('#bcRun', this.root);
      box.innerHTML = `<div class="field"><span class="label">Simulated intent (what the simulator “imagines”)</span><div class="chip-row left" id="bcIntent"></div></div>
        <div class="row wrap"><button class="btn btn-primary" id="bcGo" type="button">${ui.icon('play')}<span>Run trial</span></button><button class="btn" id="bcAuto" type="button" aria-pressed="false">${ui.icon('refresh')}<span>Auto-run</span></button><span class="hint" id="bcTally"></span></div>
        <div class="canvas-wrap bc-wave"><canvas id="bcWave" role="img" aria-label="Raw and processed simulated trial signals"></canvas></div>
        <div class="bc-cols"><div><span class="label">Features (log10 µV²)</span><div id="bcFeat" class="bars"></div></div><div><span class="label">Classifier output</span><div id="bcProb" class="bars"></div><div class="bc-out" id="bcOut" aria-live="polite">—</div></div></div>`;
      const ch = U.$('#bcIntent', box); t.classes.forEach((c, i) => { const b = U.h('button.chip', { type: 'button', 'aria-pressed': String(S.intent === i) }, c); b.addEventListener('click', () => { S.intent = i; U.$$('.chip', ch).forEach((x, k) => x.setAttribute('aria-pressed', String(k === i))); }); ch.append(b); });
      U.$('#bcGo', box).addEventListener('click', () => this.run());
      const a = U.$('#bcAuto', box); a.addEventListener('click', () => { S.auto = !S.auto; a.setAttribute('aria-pressed', String(S.auto)); a.classList.toggle('btn-primary', S.auto); this.autoT = 0; });
      this.cv = U.$('#bcWave', box); this.tally(); this.drawTrial();
    },
    tally() { const el = U.$('#bcTally', this.root); if (el) el.textContent = S.tally.n ? `Decisions: ${S.tally.ok} / ${S.tally.n} correct (${Math.round((100 * S.tally.ok) / S.tally.n)}%) — measured against the simulator’s known intent` : 'No trials run yet.'; },
    run(intent) {
      const t = bci.TASKS[S.task]; if (!S.dec) { ui.toast('Train a decoder first (Set up → Train decoder).', { type: 'warn' }); return; }
      if (intent == null) intent = S.intent; const seed = Math.floor(Math.random() * 1e9);
      const tr = bci.makeTrial(S.task, intent, { seed, quality: S.quality, strength: S.strength }), pre = bci.preprocess(tr.ch, this.pre()), fe = bci.extract(pre), pr = S.dec.classify(tr);
      S.last = { tr, pre, fe, pr, intent }; S.tally.n++; if (pr.cls === intent) S.tally.ok++;
      this.stage(4); setTimeout(() => this.stage(-1), 900); this.drawTrial(); this.apply(t.cmd[pr.cls], pr.cls === intent); this.tally();
    },
    drawTrial() {
      const L = S.last, root = this.root; if (!this.cv) return; const t = bci.TASKS[S.task];
      const w = new NG.viz.Waveform(this.cv, { static: true }), C = NG.theme.c;
      if (L) { const names = Object.keys(L.tr.ch), lanes = []; names.forEach((n, i) => { lanes.push({ label: n + ' raw', data: L.tr.ch[n], n: L.tr.ch[n].length, color: C.text3 }); lanes.push({ label: n + ' filtered', data: L.pre[n], n: L.pre[n].length, color: [C.accent, C.violet][i % 2] }); });
        w.draw({ lanes, fs: bci.FS, windowSec: 2, endIndex: L.tr.ch[names[0]].length, originIndex: 0, scale: 100, watermark: 'SIMULATED', static: true, showGrid: true, glow: false, lineWidth: 1.2 }); }
      else w.draw({ lanes: [], fs: bci.FS, windowSec: 2, endIndex: 1, originIndex: 0, scale: 100, empty: 'Run a trial to see the simulated signals', static: true });
      setTimeout(() => { try { w.destroy(); } catch (e) { /* ignore */ } }, 0);
      const f = U.$('#bcFeat', root), p = U.$('#bcProb', root), o = U.$('#bcOut', root); if (!L) { f.innerHTML = p.innerHTML = ''; o.textContent = '—'; return; }
      const fv = Array.from(L.fe.x), lo = Math.min(...fv), hi = Math.max(...fv) + 1e-9;
      f.innerHTML = L.fe.names.map((n, i) => `<div class="bar-row"><span>${n}</span><span class="bar-track"><i style="width:${5 + 95 * (fv[i] - lo) / (hi - lo)}%"></i></span><span class="mono">${fv[i].toFixed(2)}</span></div>`).join('');
      p.innerHTML = t.classes.map((c, i) => `<div class="bar-row ${i === L.pr.cls ? 'win' : ''}"><span>${c}</span><span class="bar-track"><i style="width:${(L.pr.probs[i] * 100).toFixed(0)}%"></i></span><span class="mono">${(L.pr.probs[i] * 100).toFixed(0)}%</span></div>`).join('');
      o.innerHTML = `Decoded: <b>${t.classes[L.pr.cls]}</b> → command <b>${t.cmd[L.pr.cls]}</b> <span class="badge ${L.pr.cls === L.intent ? 'badge-ok' : 'badge-bad'}">${L.pr.cls === L.intent ? 'matches simulated intent' : 'does not match (intent was ' + t.classes[L.intent] + ')'}</span>`;
    },
    /* ---------------- output environments ---------------- */
    apply(cmd) {
      const e = S.env_state, step = 0.14;
      if (cmd === 'LEFT') { e.x = U.clamp(e.x - step, 0.04, 0.96); e.tile = (e.tile + 3) % 4; } else if (cmd === 'RIGHT') { e.x = U.clamp(e.x + step, 0.04, 0.96); e.tile = (e.tile + 1) % 4; } else if (cmd === 'GO' || cmd === 'ON') { e.y = U.clamp(e.y - step, 0.06, 0.94); e.on = cmd === 'ON' ? true : e.on; if (S.env === 'ui' && cmd === 'GO') e.sel = e.tile; } else if (cmd === 'REST' || cmd === 'OFF') { e.y = U.clamp(e.y + step, 0.06, 0.94); e.on = cmd === 'OFF' ? false : e.on; } else if (cmd === 'STOP') { if (S.env === 'ui') e.sel = e.tile; }
      e.lit = bci.TASKS[S.task].cmd.indexOf(cmd); if (Math.abs(e.x - e.goal) < 0.08) { e.hits++; e.goal = Math.random() < 0.5 ? 0.12 + Math.random() * 0.25 : 0.63 + Math.random() * 0.25; }
      this.renderEnv();
    },
    renderEnv() {
      const t = bci.TASKS[S.task], e = S.env_state, box = U.$('#bcEnv', this.root); if (!box) return; U.$('#bcESub', this.root).textContent = 'Driven only by the decoder’s output commands: ' + t.cmd.join(' · ');
      if (S.env === 'panel') { box.innerHTML = `<div class="cmd-panel">${t.cmd.map((c, i) => `<div class="cmd ${e.lit === i ? 'lit' : ''}"><b>${c}</b><small>${t.classes[i]}</small></div>`).join('')}</div><p class="hint">The lit command is the most recent decoder output.</p>`; return; }
      if (S.env === 'ui') { const tiles = ['Lights', 'Music', 'Message', 'Door']; box.innerHTML = `<div class="tiles">${tiles.map((n, i) => `<div class="tile ${e.tile === i ? 'hl' : ''} ${e.sel === i ? 'act' : ''}"><b>${n}</b><small>${e.sel === i ? 'activated' : e.tile === i ? 'highlighted' : ''}</small></div>`).join('')}</div><p class="hint">LEFT/RIGHT move the highlight; STOP/GO activates the highlighted tile.</p>`; return; }
      box.innerHTML = `<div class="canvas-wrap bc-envcv"><canvas id="bcEnvCv" role="img" aria-label="${S.env === 'cursor' ? 'Cursor on a track' : 'Moving object on a grid'}"></canvas></div><p class="hint">${S.env === 'cursor' ? `Reach the target marker with LEFT/RIGHT. Targets reached: <b>${e.hits}</b>` : 'LEFT/RIGHT move the ball sideways; GO/ON up; REST/OFF down.'}</p><button class="btn btn-sm btn-ghost" id="bcResetEnv" type="button">Reset position</button>`;
      U.$('#bcResetEnv', box).addEventListener('click', () => { Object.assign(e, { x: 0.5, y: 0.5, hits: 0, sel: undefined, tile: 0 }); this.renderEnv(); });
      const cv = U.$('#bcEnvCv', box), f = U.fitCanvas(cv), ctx = cv.getContext('2d'), C = NG.theme.c; ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); const w = f.w, h = f.h;
      ctx.strokeStyle = C.grid; for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo((i * w) / 10, 0); ctx.lineTo((i * w) / 10, h); ctx.stroke(); }
      if (S.env === 'cursor') { ctx.fillStyle = C.line2; ctx.fillRect(10, h / 2 - 2, w - 20, 4); ctx.fillStyle = C.amber; ctx.fillRect(e.goal * w - 10, h / 2 - 22, 20, 44); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(e.x * w, h / 2, 13, 0, 6.283); ctx.fill(); }
      else { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(e.x * w, e.y * h, 15, 0, 6.283); ctx.fill(); ctx.fillStyle = e.on ? C.amber : C.text3; ctx.fillRect(w - 28, 8, 20, 20); }
    },
    /* ---------------- accuracy vs quality ---------------- */
    renderEval() {
      const box = U.$('#bcEval', this.root); if (!box) return;
      box.innerHTML = `<div class="row wrap"><button class="btn btn-primary" id="bcSweep" type="button" ${S.dec ? '' : 'disabled'}>${ui.icon('zap')}<span>Measure accuracy at 5 quality levels</span></button><span class="hint">${S.dec ? 'Uses the trained decoder; 20 new trials per class per level.' : 'Train a decoder first.'}</span></div><div id="bcSweepOut"></div>`;
      U.$('#bcSweep', box).addEventListener('click', () => this.sweep()); if (S.sweep && S.sweep.task === S.task) this.sweepOut();
    },
    sweep() {
      const b = U.$('#bcSweep', this.root); b.disabled = true; b.querySelector('span').textContent = 'Measuring…';
      setTimeout(() => { const qs = [0, 0.25, 0.5, 0.75, 1], res = qs.map((q) => { const r = bci.evaluate(S.dec, { quality: q, perClass: 20, seed: 321 }); return { q, acc: r.accuracy, f1: r.macro.f1, cm: r.cm, n: r.n }; }); S.sweep = { task: S.task, res, trainQ: S.decQ }; this.renderEval(); }, 30);
    },
    sweepOut() {
      const t = bci.TASKS[S.task], s = S.sweep, out = U.$('#bcSweepOut', this.root), chance = 1 / t.classes.length;
      out.innerHTML = `<div class="bars">${s.res.map((r) => `<div class="bar-row"><span>quality ${Math.round(r.q * 100)}%</span><span class="bar-track"><i style="width:${(r.acc * 100).toFixed(0)}%"></i></span><span class="mono">${(r.acc * 100).toFixed(0)}% <small>(n=${r.n})</small></span></div>`).join('')}</div><p class="hint">Chance level for ${t.classes.length} classes is ${(chance * 100).toFixed(0)}%. The decoder was trained at ${Math.round(s.trainQ * 100)}% quality; accuracy is measured on new simulated trials only, so these numbers describe this simulation, not real-world BCI performance. With only ${s.res[0].n} trials per level, differences of a few percent are within chance variation.</p>`;
    },
    show() { this.autoT = 0; NG.loop.add('view-bci', (dt) => { if (S.auto && S.dec) { this.autoT = (this.autoT || 0) + dt; if (this.autoT > 1.3) { this.autoT = 0; this.run(Math.floor(Math.random() * bci.TASKS[S.task].classes.length)); } } }); this.renderEnv(); this.drawTrial(); },
    hide() { NG.loop.remove('view-bci'); },
  };
})();
