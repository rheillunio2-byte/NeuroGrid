# Changelog

## 3.0.0
**Added**
- Spectrogram section (real STFT, 4 windows, log axis, 4 colour maps, hover inspection, playhead, CSV export).
- EEG Topography (10–20 schematic, band power, selectable electrodes, labelled interpolation estimate).
- Data Import (CSV: chunked parsing with cancel, column detection, mapping, units, validation, time-regularity check).
- NN Lab (configurable MLP, leak-free splits, metrics, confusion matrix, diagnosis, comparison, config export) with Web Worker training and main-thread fallback.
- BCI Playground (pipeline view, four tasks, quality-dependent accuracy, four outputs).
- Artifact simulator, undo/redo and custom presets in the Processing Studio.
- Signal Lab channel comparison, snapshot zoom/pan, marker measurements, quality table.
- Six new Experiment modes, timed option, round history; five new Learning Center topics.
- Research Workspace, IndexedDB session storage, Overview dashboard, new logo, 13-section navigation.
- `tests/v3.test.js` (58 additional tests).

**Fixed during development**
- Workbench recordings returned undefined channel data; zero/invalid duration silently became the default.
- A column named `label` holding numbers was treated as an EEG channel.

**Changed**
- Old 2.0 screenshots replaced with real 3.0 captures.

## 2.0
Initial polished release (Signal Lab, Studio, Experiments, Neural Network, Learning Center, Sessions, Settings).
