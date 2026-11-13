/* NeuroGrid — learner progress: experiment statistics, trial history and achievements.
 * Persisted in localStorage. Nothing here is pre-filled: it only reflects what the user did. */
(function () {
  'use strict';
  const NG = (window.NG = window.NG || {});
  const KEY = 'neurogrid.v2.stats';

  const ACHIEVEMENTS = [
    { id: 'first_answer', title: 'First Contact', desc: 'Answer your first experiment question.', icon: 'sparkles' },
    { id: 'streak5', title: 'On a Roll', desc: 'Get 5 correct answers in a row.', icon: 'zap' },
    { id: 'streak10', title: 'Unstoppable', desc: 'Get 10 correct answers in a row.', icon: 'zap' },
    { id: 'perfect_round', title: 'Flawless', desc: 'Finish a round with every answer correct.', icon: 'trophy' },
    { id: 'pattern_spotter', title: 'Pattern Spotter', desc: 'Identify 15 signal patterns correctly.', icon: 'target' },
    { id: 'filter_wizard', title: 'Filter Wizard', desc: 'Score 80 % or more in a DSP Challenge round.', icon: 'sliders' },
    { id: 'expert_analyst', title: 'Expert Analyst', desc: 'Score 75 % or more in an Expert round.', icon: 'trophy' },
    { id: 'well_rounded', title: 'Well-Rounded', desc: 'Complete a round in all four experiment modes.', icon: 'flask' },
    { id: 'explorer', title: 'Cartographer', desc: 'Visit every section of NeuroGrid.', icon: 'network' },
    { id: 'recorder', title: 'Data Logger', desc: 'Record a simulated session of 10 s or more.', icon: 'record' },
    { id: 'tinkerer', title: 'Signal Tinkerer', desc: 'Switch on all six processing stages in the Studio.', icon: 'sliders' },
    { id: 'spectro_seer', title: 'Time–Frequency Seer', desc: 'Generate a spectrogram of a signal.', icon: 'grid' },
    { id: 'importer', title: 'Bring Your Own Data', desc: 'Import and validate a CSV dataset.', icon: 'download' },
    { id: 'bci_pilot', title: 'BCI Pilot', desc: 'Train a decoder and run a trial in the BCI Playground.', icon: 'brain' },
    { id: 'researcher', title: 'Careful Researcher', desc: 'Run and save a reproducible experiment.', icon: 'clipboard' },
    { id: 'scholar', title: 'Scholar', desc: 'Open all ten Learning Center topics.', icon: 'book' },
  ];

  const blank = () => ({ answered: 0, correct: 0, points: 0, bestStreak: 0, rounds: 0, byMode: {}, ach: {}, history: [], visited: {}, topics: {}, stages: {}, modesDone: {}, roundLog: [] });
  const progress = (NG.progress = NG.util.emitter({ ACHIEVEMENTS }));
  let s = Object.assign(blank(), NG.storage.get(KEY, {}));
  let t;
  const save = () => { clearTimeout(t); t = setTimeout(() => NG.storage.set(KEY, s), 200); progress.emit('change', s); };

  progress.get = () => s;
  progress.has = (id) => !!s.ach[id];
  progress.unlock = (id) => {
    if (s.ach[id]) return false;
    const def = ACHIEVEMENTS.find((a) => a.id === id); if (!def) return false;
    s.ach[id] = new Date().toISOString(); save(); progress.emit('achievement', def); return true;
  };

  /** rec: { mode, difficulty, qid, prompt, selected, answer, correct(bool), ms, points, hint } */
  progress.recordTrial = (rec, streak) => {
    s.answered++; if (rec.correct) s.correct++;
    s.points += rec.points || 0;
    s.bestStreak = Math.max(s.bestStreak, streak || 0);
    const m = (s.byMode[rec.mode] = s.byMode[rec.mode] || { a: 0, c: 0 });
    m.a++; if (rec.correct) m.c++;
    s.history.push(Object.assign({ ts: new Date().toISOString() }, rec));
    if (s.history.length > 500) s.history.splice(0, s.history.length - 500);
    progress.unlock('first_answer');
    if (streak >= 5) progress.unlock('streak5');
    if (streak >= 10) progress.unlock('streak10');
    if (rec.mode === 'pattern' && m.c >= 15) progress.unlock('pattern_spotter');
    save();
  };

  /** r: { mode, difficulty, correct, total } */
  progress.recordRound = (r) => {
    s.rounds++; s.modesDone[r.mode] = true; (s.roundLog = s.roundLog || []).push({ ts: new Date().toISOString(), mode: r.mode, difficulty: r.difficulty, correct: r.correct, total: r.total, timed: !!r.timed }); if (s.roundLog.length > 100) s.roundLog.shift();
    const acc = r.total ? r.correct / r.total : 0;
    if (r.correct === r.total && r.total > 0) progress.unlock('perfect_round');
    if (r.mode === 'dsp' && acc >= 0.8) progress.unlock('filter_wizard');
    if (r.difficulty === 'expert' && acc >= 0.75) progress.unlock('expert_analyst');
    if (['pattern', 'quiz', 'compare', 'dsp'].every((m) => s.modesDone[m])) progress.unlock('well_rounded');
    save();
  };

  const VIEWS = ['overview', 'lab', 'spectrogram', 'topography', 'studio', 'data', 'network', 'bci', 'experiments', 'learn', 'research', 'sessions', 'settings'];
  progress.markVisited = (v) => { if (s.visited[v]) return; s.visited[v] = true; save(); if (VIEWS.every((x) => s.visited[x])) progress.unlock('explorer'); };
  progress.markTopic = (id, total) => { if (s.topics[id]) return; s.topics[id] = true; save(); if (Object.keys(s.topics).length >= total) progress.unlock('scholar'); };
  progress.markStage = (k) => { if (s.stages[k]) return; s.stages[k] = true; save(); if (['hp', 'lp', 'bp', 'notch', 'nr', 'norm'].every((x) => s.stages[x])) progress.unlock('tinkerer'); };

  /** Experiment results → CSV text (labelled as a simulated learning exercise). */
  progress.trialsCsv = () => {
    const head = ['trial_no', 'timestamp_iso', 'mode', 'difficulty', 'question_id', 'prompt', 'selected', 'correct_answer', 'is_correct', 'response_time_ms', 'points', 'hint_used', 'data_source'];
    const rows = s.history.map((h, i) => [i + 1, h.ts, h.mode, h.difficulty, h.qid, h.prompt, h.selected, h.answer, h.correct, Math.round(h.ms || 0), h.points || 0, !!h.hint, 'SIMULATED_LEARNING_EXERCISE']);
    return NG.csv.toCsv(head, rows);
  };
  progress.reset = () => { s = blank(); NG.storage.remove(KEY); save(); progress.emit('reset'); };
})();
