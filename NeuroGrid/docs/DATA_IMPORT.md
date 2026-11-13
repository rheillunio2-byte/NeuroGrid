# Data import (CSV)

**Privacy:** files are read locally with the File API and never uploaded. Imported data lives in memory until you store it in IndexedDB (your browser only).

**Format:** delimiter comma, semicolon, tab or pipe (auto-detected); quoted fields supported; optional header row. Columns may include a time column (seconds), numeric channels, and a label column (names such as `label`, `class`, `state`, `event` are recognised).

**Steps:** drop/choose file → preview first rows → review detected columns → map channels and names → set **sampling rate** (inferred from the time column when present, always shown and editable) and **units** → *Validate & load*.

**Validation:** non-increasing or irregular timestamps are rejected with the reason; missing/invalid cells are counted and filled or rejected according to a stated maximum fraction; sampling rate must be 1–20000 Hz; at least one numeric channel is required. Warnings and errors are listed.

**Never silent:** the sampling rate is never resampled, units are never converted unless you tick *convert to µV*, and the conversion is recorded in the metadata panel. Datasets carry `source: IMPORTED`, which is shown on every chart, table and export that uses them.

**Using the data:** Spectrogram and Topography accept imported data. Research experiments on imported data require a label column and build windows from it. EDF is **not** supported.
