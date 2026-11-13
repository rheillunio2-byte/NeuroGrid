/* NeuroGrid — schematic 10–20 electrode layout and spatial interpolation.
 * Positions are a SCHEMATIC top-view projection (nose up, radius 1 ≈ the head outline), not measured coordinates.
 * With only 6 recorded sites, any interpolated value away from them is an ESTIMATE, never a measurement. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NG = root.NG || {}; root.NG.topo = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ELECTRODES = [
    { n: 'Fp1', x: -0.28, y: 0.86, region: 'Left frontal pole', info: 'Above the left eye. Dominated by eye-blink and eye-movement artefacts; attention and executive processes are often discussed here.' },
    { n: 'Fp2', x: 0.28, y: 0.86, region: 'Right frontal pole', info: 'Above the right eye. Like Fp1, strongly affected by blinks and forehead muscle activity.' },
    { n: 'F7', x: -0.72, y: 0.55, region: 'Left inferior frontal', info: 'Lateral frontal site, near the temporalis muscle, so jaw artefacts are common.' },
    { n: 'F3', x: -0.38, y: 0.52, region: 'Left frontal', info: 'Left dorsolateral frontal cortex region; often used in frontal asymmetry studies.' },
    { n: 'Fz', x: 0, y: 0.5, region: 'Midline frontal', info: 'Frontal midline; frontal-midline theta is commonly reported during sustained mental effort.' },
    { n: 'F4', x: 0.38, y: 0.52, region: 'Right frontal', info: 'Right counterpart of F3.' },
    { n: 'F8', x: 0.72, y: 0.55, region: 'Right inferior frontal', info: 'Right counterpart of F7.' },
    { n: 'T3', x: -0.88, y: 0, region: 'Left temporal', info: 'Over the left temporal lobe (also written T7). Near the ear and temporalis muscle.' },
    { n: 'C3', x: -0.45, y: 0, region: 'Left central (motor)', info: 'Over the left sensorimotor cortex, which controls the RIGHT hand. Mu/beta rhythms here weaken (ERD) during right-hand movement or imagery.' },
    { n: 'Cz', x: 0, y: 0, region: 'Vertex', info: 'Top of the head, midway between nasion and inion; often a reference or feet-movement site.' },
    { n: 'C4', x: 0.45, y: 0, region: 'Right central (motor)', info: 'Over the right sensorimotor cortex, which controls the LEFT hand.' },
    { n: 'T4', x: 0.88, y: 0, region: 'Right temporal', info: 'Over the right temporal lobe (also written T8).' },
    { n: 'T5', x: -0.72, y: -0.55, region: 'Left posterior temporal', info: 'Between temporal and occipital regions (also written P7).' },
    { n: 'P3', x: -0.38, y: -0.52, region: 'Left parietal', info: 'Left parietal cortex: spatial attention and sensory integration.' },
    { n: 'Pz', x: 0, y: -0.5, region: 'Midline parietal', info: 'Parietal midline; P300 responses are typically largest here.' },
    { n: 'P4', x: 0.38, y: -0.52, region: 'Right parietal', info: 'Right counterpart of P3.' },
    { n: 'T6', x: 0.72, y: -0.55, region: 'Right posterior temporal', info: 'Right counterpart of T5 (also written P8).' },
    { n: 'O1', x: -0.28, y: -0.86, region: 'Left occipital (visual)', info: 'Over the left visual cortex. The posterior alpha rhythm is typically strongest here and weakens when the eyes open.' },
    { n: 'O2', x: 0.28, y: -0.86, region: 'Right occipital (visual)', info: 'Over the right visual cortex.' },
  ];
  const byName = (n) => ELECTRODES.find((e) => e.n === n) || null;

  /** Inverse-distance-weighted estimate at (x,y) from sample points [{x,y,v}]. Exact at the sample sites. */
  function idw(pts, x, y, power = 2) {
    let num = 0, den = 0;
    for (const p of pts) { const d2 = (p.x - x) ** 2 + (p.y - y) ** 2; if (d2 < 1e-12) return p.v; const w = 1 / Math.pow(d2, power / 2); num += w * p.v; den += w; }
    return den ? num / den : NaN;
  }
  /** Distance to the nearest sampled electrode. */
  function nearest(pts, x, y) { let m = Infinity; for (const p of pts) m = Math.min(m, Math.hypot(p.x - x, p.y - y)); return m; }
  /** 1 at a sensor, falling to ~0 where no sensor is near (Gaussian, σ in head-radius units). */
  const confidence = (d, sigma = 0.35) => Math.exp(-(d * d) / (2 * sigma * sigma));

  /** Grid of interpolated values inside the head circle (NaN outside). */
  function grid(pts, size = 48, power = 2) {
    const v = new Float32Array(size * size), c = new Float32Array(size * size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * 2 - 1, y = 1 - (j / (size - 1)) * 2, k = j * size + i;
      if (x * x + y * y > 1) { v[k] = NaN; c[k] = 0; continue; }
      v[k] = idw(pts, x, y, power); c[k] = confidence(nearest(pts, x, y));
    }
    return { v, conf: c, size };
  }
  return { ELECTRODES, byName, idw, nearest, confidence, grid };
});
