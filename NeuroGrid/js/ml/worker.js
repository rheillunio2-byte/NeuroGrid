/* NeuroGrid — Web Worker shell: loads the same pure modules and forwards messages to NG.job.handle. */
importScripts('../dsp/dsp.js', '../sim/generator.js', 'mlp.js', 'evalkit.js', 'job.js');
self.onmessage = (e) => { self.NG.job.handle(e.data, (m) => self.postMessage(m)); };
