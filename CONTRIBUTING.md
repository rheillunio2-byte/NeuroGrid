# Contributing to NeuroGrid

NeuroGrid is a small, dependency-free educational project. Please keep it that way.

## Setup
No install. Run `python3 -m http.server 8000` in the project folder and `node tests/dsp.test.js` for tests.

## Conventions
- Plain `<script>` tags and the `window.NG` namespace. Script order lives in `index.html`; add new files there, pure logic before UI.
- Pure logic (`dsp`, `stft`, `artifacts`, `topo`, `csvimport`, `evalkit`, `job`, `bci`, `workbench`, `exporters`, `sessionstore`) is UMD so it runs in the browser, a Worker and Node. No DOM access in those files; every one needs tests.
- Views expose `render()`, `init(root)`, `show()`, `hide()`. Register animation with `NG.loop` only while visible; dispose listeners, timers, canvases and workers in `hide`/`dispose`.
- Heavy work (training, long parsing) must be chunked or in a Worker, cancellable, and report progress.
- Colours come from `css/tokens.css` / `NG.theme.c`. Persist through `NG.store`, `NG.storage` or `NG.db`, never raw `localStorage`.
- Respect reduced motion; every control needs a label and keyboard access.
- No runtime dependencies, no network calls, no analytics, no uploads.

## Honesty rules
- Label simulated and imported data wherever it appears (charts, tables, exports).
- Never silently change units or sampling rate.
- No claims of thought reading, diagnosis, or real-EEG performance. Do not invent metrics.
- Statistically weak analyses (tiny test sets) must say so.
- Screenshots must be real captures. Do not invent contributors, licences or URLs.

## Before a change
- [ ] `node tests/dsp.test.js` passes; new logic has tests (including edge cases).
- [ ] App loads with no console errors; checked at phone, tablet, desktop widths without horizontal scroll.
- [ ] Works with reduced motion and with Workers unavailable (`file://`).
- [ ] Docs and CHANGELOG updated.
- [ ] State what you tested and what you did not.
