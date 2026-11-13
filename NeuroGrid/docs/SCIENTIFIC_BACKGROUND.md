# Scientific background and limits

- **EEG** records microvolt-scale scalp potentials; rhythms are grouped as delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30, gamma 30+ Hz.
- **Power spectrum:** Welch averaging of Hann-windowed segments; units µV²/Hz. Relative band power is a share of the total, so strong drift lowers every other share.
- **STFT:** sliding windowed FFT. Frequency resolution ≈ fs / window length; the window sets time smearing. Overlap smooths but adds no information. Power uses the same scaling as the periodogram. Window functions trade main-lobe width against leakage (Hann/Hamming/Blackman/rectangular).
- **Filters:** Butterworth sections (high/low/band-pass), biquad notch with Q. Causal filters delay the signal; zero-phase (forward-backward) filtering is offline only and uses the future. Every filter distorts something; the Studio measures residual artifact and damage against the known clean signal.
- **Artifacts:** blinks (slow, frontal), EMG (broadband, overlaps beta/gamma), mains hum (narrow line), drift (< 1 Hz), electrode pops (steps). Simple filters cannot separate artifact from brain activity that shares its frequencies; research practice uses regression/ICA or rejection (not implemented here).
- **Topography:** 10–20 positions are schematic. Inverse-distance interpolation between a few electrodes is an estimate; volume conduction blurs real scalp EEG. No source localisation is performed or implied.
- **Motor imagery BCI:** imagined movement tends to reduce mu (8–13 Hz) and beta power over contralateral motor cortex (event-related desynchronisation). The simulator hand-sets such an effect, with a strength you control, so decoder accuracy is a property of the simulator.
- **Evaluation:** train/validation/test split; scaler fitted on training only; grouped split keeps related windows together; balancing applies to training only. Precision, recall, F1; macro (equal class weight) vs weighted (by support). Wilson 95 % interval for test accuracy. Over/underfitting from train–validation gap and absolute accuracy.
- **Not claimed:** diagnosis, thought reading, clinical validity, or that any result transfers to real EEG.
