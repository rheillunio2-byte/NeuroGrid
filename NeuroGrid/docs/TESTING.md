# Testing

`node tests/dsp.test.js` runs 2.0 tests and then `tests/v3.test.js` (STFT, windows, artifacts, topography, CSV parsing/validation incl. a 120k-row file and chunked cancel, features, splitting, leakage, scaler, NN training, confusion matrix, P/R/F1, Wilson, diagnosis, job message handling, BCI, workbench, exporters, session store). Last run: **80 passed, 0 failed** (Node v22).

**Browser checks performed (headless Chromium via Playwright, served over http):** all 13 views load with no console errors (external font requests excluded: the sandbox blocks them); import of a generated 20 s two-channel CSV into Spectrogram and Topography; NN Lab training in Worker mode; Research run and save; BCI train and trial; all ten Experiment modes at three levels; session record → store → duplicate-id write blocked; spectrogram CSV export; horizontal overflow at 390, 768 and 1440 px.

**Not tested:** Firefox/Safari, real touch devices, file:// worker fallback in a real browser (logic is unit-tested in Node), screen-reader behaviour, large imports beyond the Node 120k-row test in a real browser, IndexedDB quota exhaustion.
