# User guide

1. **Overview** — status and shortcuts. Start here.
2. **Signal Lab** — choose a profile; `Space` pauses. Scroll to *Channel comparison*, press **Capture snapshot**, pick two channels, zoom/pan, hover for values, click twice for Δt/ΔV markers.
3. **Spectrogram** — pick a source (Live / Simulated recording / Imported), window, overlap, frequency range, colour map, linear/log. Hover for time, frequency and power; click to move the playhead. Export the matrix as CSV.
4. **EEG Topography** — choose band and metric; click electrodes for region notes. The interpolation overlay is optional and marked as an estimate.
5. **Processing Studio** — enable stages or presets; enable artifacts (use Fp1/Fp2 for blinks); press *Try fix*; read residual and distortion. Undo/redo and save named presets.
6. **Data Import** — drop a CSV; check detected columns, set sampling rate and units, validate, load. See DATA_IMPORT.md.
7. **Neural Network → NN Lab** — configure, **Train**, read curves, confusion matrix and diagnosis. Add runs to compare; export the config JSON.
8. **BCI Playground** — pick a task, set quality, **Train decoder**, run trials, switch output environment. Lower quality to see accuracy drop.
9. **Experiments** — choose a mode and level, optionally *Timed*. Wrong answers are reviewed at the end; history is in Progress.
10. **Research Workspace** — see RESEARCH_WORKSPACE.md.
11. **Sessions & Export** — record, store in IndexedDB, rename/delete, compare, export.
