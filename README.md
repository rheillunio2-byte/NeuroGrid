# NeuroGrid 3.0 — EEG & BCI Learning Laboratory

![Version](https://img.shields.io/badge/version-3.0-22d3ee) ![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-7c8cff) ![Dependencies](https://img.shields.io/badge/dependencies-none-2ea44f) ![Data](https://img.shields.io/badge/data-simulated%20%2B%20your%20own%20CSV-f5a524)

NeuroGrid is a browser-based laboratory for learning how EEG signals are generated, inspected, filtered, analysed and used in a brain-computer-interface (BCI) pipeline. It runs entirely in your browser: no server, no upload, no build step, no dependencies.

> **Honesty notice.** Built-in signals are **simulated**. A BCI "intent" in the playground is the simulator's own label, not a thought. NeuroGrid is an educational tool: not a medical device, not for diagnosis, and its models say nothing about real-EEG performance. Imported CSV data is always labelled **IMPORTED** and stays in your browser.

![Overview](docs/screenshots/01-overview.jpg)

## What is in 3.0

| Section | What it does |
|---|---|
| **Overview** | Dashboard: stream status, current dataset, recent stored sessions, learning progress, module shortcuts. |
| **Signal Lab** | Six simulated channels, seven profiles, spectrum. New: channel comparison, frozen 8 s snapshot with zoom/pan, two-marker measurements (Δt, ΔV), per-channel quality table. |
| **Spectrogram** | Real STFT. Window (Hann/Hamming/Blackman/rectangular), size, overlap, frequency range, linear/log axis, Viridis/Inferno/Plasma/Grayscale, dB range, hover frequency readout, playhead. Sources: live stream, **simulated recording** (adjustable 128–512 Hz and duration), imported CSV. |
| **EEG Topography** | Schematic 10–20 map, selectable electrodes, band power, region explanations. Optional interpolated overlay is labelled an **estimate** with a sparse-coverage warning. |
| **Processing Studio** | Real Butterworth/biquad filters, chain, before/after waveform and PSD. New: artifact simulator (blink, EMG, hum, drift, electrode pop, noise) with known ground truth, "Try fix" demos that report residual artifact and distortion, undo/redo, custom presets. |
| **Data Import** | Drag-and-drop CSV, preview, column detection, channel mapping, sampling-rate and unit configuration, validation, time-regularity check, metadata panel. |
| **Neural Network** | The 2.0 diagram plus **NN Lab**: configurable MLP, train/validation/test split with leakage guards, seeds, class balancing, loss/accuracy curves, confusion matrix, precision/recall/F1 (macro and weighted), Wilson interval, over/underfitting diagnosis, model comparison, JSON config export. |
| **BCI Playground** | Acquisition → preprocessing → features → classification → output, four simulated tasks, signal quality that really changes accuracy, four output environments. |
| **Experiments** | Ten modes (adds Artifact Hunt, Band Identification, Filter Detective, Spectrogram Reading, Model Evaluation, BCI Pipeline), three levels, optional timed challenge, review of wrong answers, round history, achievements. |
| **Learning Center** | Fifteen topics including spectrograms, scalp maps, artifacts, classifier evaluation and data import. |
| **Research Workspace** | Configure → run → review → save → compare → export experiments, with seed, sampling rate, dataset, filter, features, model and split recorded for reproducibility. CSV, JSON and printable HTML report. |
| **Sessions & Export** | Record sessions; store recordings in **IndexedDB** with rename, delete-with-confirmation, comparison, storage usage; export raw/processed signals, PSD, spectrogram CSV. Records are never silently overwritten. |
| **Settings** | Theme, accent, motion, mains frequency, reset (including IndexedDB). |

## Screenshots

Real captures from the running app (headless Chromium, 1440×900 unless noted).

| | |
|---|---|
| ![Signal Lab](docs/screenshots/02-signal-lab.jpg) | ![Comparison](docs/screenshots/03-signal-lab-comparison.jpg) |
| ![Spectrogram](docs/screenshots/04-spectrogram.jpg) | ![Topography](docs/screenshots/05-topography.jpg) |
| ![Studio](docs/screenshots/06-processing-studio.jpg) | ![Artifacts](docs/screenshots/07-artifact-simulator.jpg) |
| ![Import](docs/screenshots/08-data-import.jpg) | ![NN Lab](docs/screenshots/09-neural-network-lab.jpg) |
| ![Evaluation](docs/screenshots/10-nn-evaluation.jpg) | ![BCI](docs/screenshots/11-bci-playground.jpg) |
| ![Experiments](docs/screenshots/12-experiments.jpg) | ![Research](docs/screenshots/13-research-workspace.jpg) |

Mobile (390 px wide): ![Mobile overview](docs/screenshots/14-mobile-overview.jpg)

## Run it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
node tests/dsp.test.js          # unit tests (Node 16+), also runs tests/v3.test.js
```

Opening `index.html` directly (`file://`) works, but browsers do not allow Web Workers there. NN Lab and Research then train in small chunks on the main thread; the UI states which mode is active. Serve over `http://` for worker mode.

Shortcuts: `1`–`9`, `0` sections · `Space` pause · `[` collapse sidebar · `?` help.

## Project structure

```
index.html            shell, icon sprite, script order
css/                  tokens, base, components, layout, views, v3 (new views)
js/core/              util, store, loop, progress, csv, db (IndexedDB), sessionstore, datastore
js/dsp/               dsp (FFT, Welch, filters, band power), stft
js/sim/               generator, engine, workbench (adjustable recordings), bci
js/analysis/          artifacts, topo (10–20 + interpolation)
js/io/                csvimport, exporters
js/ml/                mlp, evalkit, job, worker, runner
js/viz/               theme, waveform, spectrum, spectrogram, colormaps, fx
js/ui/                ui, ctl (controls and charts)
js/views/             one file per section (+ *2/*x extensions of 2.0 views)
tests/                dsp.test.js, v3.test.js
docs/                 architecture, scientific background, guides, screenshots
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SCIENTIFIC_BACKGROUND.md](docs/SCIENTIFIC_BACKGROUND.md), [docs/USER_GUIDE.md](docs/USER_GUIDE.md), [docs/DATA_IMPORT.md](docs/DATA_IMPORT.md), [docs/RESEARCH_WORKSPACE.md](docs/RESEARCH_WORKSPACE.md), [docs/TESTING.md](docs/TESTING.md) and [CHANGELOG.md](CHANGELOG.md).

## Known limitations (honest list)

- The **live stream is fixed at 256 Hz**. Adjustable sampling rate and duration are offered in the *Simulated recording* source (Spectrogram, Research), not in the live Signal Lab.
- **EDF import is not implemented**; CSV only.
- No PDF export. The Research report is an HTML file you can print to PDF.
- The Processing Studio chain order is fixed (high-pass → low-pass → band-pass → notch → noise reduction → normalisation).
- Topography is a schematic 2-D layout; interpolation is an estimate.
- All model results are on simulated data (or your imported labelled windows) and are not evidence of real-world BCI performance. Small test sets give wide confidence intervals; the app says so.
- Browser testing was done in headless Chromium only (see docs/TESTING.md).
