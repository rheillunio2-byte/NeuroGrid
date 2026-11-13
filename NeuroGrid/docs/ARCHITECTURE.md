# Architecture

**Stack:** vanilla JS (no modules, no bundler), CSS custom properties, Canvas 2D. Everything hangs off `window.NG`.

## Layers
1. **Pure logic (UMD, tested in Node)** — `dsp/dsp.js` (FFT, Welch, filters, band power), `dsp/stft.js`, `sim/generator.js`, `sim/workbench.js`, `sim/bci.js`, `analysis/artifacts.js`, `analysis/topo.js`, `io/csvimport.js`, `io/exporters.js`, `ml/mlp.js`, `ml/evalkit.js`, `ml/job.js`, `core/sessionstore.js`.
2. **Core services** — `core/store.js` (validated prefs, localStorage with memory fallback), `core/loop.js` (single rAF loop), `core/db.js` (IndexedDB with memory fallback), `core/datastore.js` (the current imported dataset), `core/progress.js`.
3. **Engine** — `sim/engine.js`: continuous 256 Hz simulated stream in ring buffers (`total`, `clean`, `noise` per channel), recorder.
4. **UI/rendering** — `ui/ui.js`, `ui/ctl.js`, `viz/*` canvas components.
5. **Views** — `views/*.js`; 3.0 extends some 2.0 views by wrapping `render`/`init` (`studio2`, `sessions2`, `labx`) rather than rewriting them.
6. **Router** — `app.js` hash router, nav, shortcuts.

## Data flow
Sources: live engine, workbench recording (deterministic from seed), imported CSV (`NG.data`). Views read a source, compute (STFT, PSD, features) and draw. Every chart carries a source badge (SIMULATED / IMPORTED).

## Workers
`ml/worker.js` imports the same pure scripts and calls `NG.job.handle(msg, post)`. Message types: `train`, `dataset`, `cancel`; replies `started`, `progress`, `done`, `error`, `cancelled`. `NG.mlRunner` starts a Worker when possible, otherwise runs the same handler on the main thread, yielding between epochs so cancel and the UI keep working. `NG.mlRunner.mode` reports `worker` or `main`.

## Determinism
Artifacts are pure functions of (sample index, seed). Splits, scalers, trainers and the workbench take explicit seeds, so Research records can be re-run.

## Storage
`localStorage`: prefs, stats, presets (`neurogrid.v3.presets`). IndexedDB: stored sessions and saved experiments (no silent overwrite). "Delete all data" clears both.
