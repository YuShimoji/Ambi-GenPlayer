// peaks-worker.js (module worker)
// Receives channel data and computes min/max peaks per bin in batches, sending progress.

self.onmessage = (e) => {
  try {
    const msg = e.data || {};
    if (msg.type !== 'compute') return;
    const ch0Buf = msg.ch0;
    const ch1Buf = msg.ch1; // optional
    const total = msg.total >>> 0;
    const bins = msg.bins >>> 0;
    const samplesPerBatch = Math.max(10_000, Number(msg.samplesPerBatch) || 200_000);

    const ch0 = new Float32Array(ch0Buf);
    const ch1 = ch1Buf ? new Float32Array(ch1Buf) : null;
    const step = Math.max(1, Math.floor(total / bins));
    const nBins = Math.ceil(total / step);

    const mins = new Float32Array(nBins);
    const maxs = new Float32Array(nBins);
    for (let i = 0; i < nBins; i++) { mins[i] = 1.0; maxs[i] = -1.0; }

    let processed = 0;
    while (processed < total) {
      const endSamp = Math.min(total, processed + samplesPerBatch);
      for (let j = processed; j < endSamp; j++) {
        const a = ch0[j];
        const b = ch1 ? ch1[j] : a;
        const v = (a + b) * 0.5;
        const bi = Math.min(nBins - 1, Math.floor(j / step));
        if (v < mins[bi]) mins[bi] = v;
        if (v > maxs[bi]) maxs[bi] = v;
      }
      processed = endSamp;
      self.postMessage({ type: 'progress', value: processed / total });
    }

    // Transfer buffers back to avoid copies
    self.postMessage({ type: 'done', mins: mins.buffer, maxs: maxs.buffer, nBins }, [mins.buffer, maxs.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
