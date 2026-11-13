# Research Workspace

Create an experiment (name, dataset: simulated or imported-labelled, sampling rate 128/256/512, noise, channels, filter, features, model, split, seed) → **Run** → review metrics (train/validation/test accuracy, macro F1, Wilson interval, diagnosis, confusion matrix) → **Save** to IndexedDB.

Each record stores everything needed to reproduce it: seed, sampling rate, dataset source and size, channels, filter settings, feature set, model architecture and training settings, split sizes, app version, timestamp. Saved records can be renamed, deleted (with confirmation), compared side by side, and exported as CSV or JSON. *Report* produces an HTML file you can print to PDF (no built-in PDF generator). Saving never overwrites an existing record.

Small test sets are flagged as statistically unreliable. Results describe the simulator or your own labelled windows, not real-world BCI performance.
