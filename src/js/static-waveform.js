// static-waveform.js
// Compute static overview peaks and render them to a canvas

export async function computePeaksFromFile(file, audioContext, bins = 1024) {
  if (!file || !audioContext) throw new Error('file and audioContext are required');
  const buf = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf.slice(0));
  return computePeaksFromAudioBuffer(audioBuffer, bins);
}

// Worker-based computation (module worker). Copies channel data and transfers to worker.
async function computePeaksFromAudioBufferWorker(audioBuffer, bins = 1024, { samplesPerBatch = 200_000, onProgress = null } = {}) {
  if (typeof Worker === 'undefined') throw new Error('Worker unsupported');
  const workerUrl = new URL('./workers/peaks-worker.js', import.meta.url);
  const worker = new Worker(workerUrl, { type: 'module' });
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  // Copy to transferable buffers
  const c0 = new Float32Array(ch0).buffer;
  const c1 = ch1 ? new Float32Array(ch1).buffer : null;

  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const msg = e.data || {};
      if (msg.type === 'progress') {
        try { onProgress && onProgress(msg.value); } catch {}
      } else if (msg.type === 'done') {
        worker.terminate();
        const mins = new Float32Array(msg.mins);
        const maxs = new Float32Array(msg.maxs);
        const n = msg.nBins >>> 0;
        const peaks = new Array(n);
        for (let i = 0; i < n; i++) peaks[i] = { min: mins[i], max: maxs[i] };
        resolve(peaks);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message || 'worker error'));
      }
    };
    const onErr = (err) => { worker.terminate(); reject(err); };
    worker.onmessage = onMsg;
    worker.onerror = onErr;
    const transfers = c1 ? [c0, c1] : [c0];
    worker.postMessage({ type: 'compute', ch0: c0, ch1: c1, total: ch0.length, bins, samplesPerBatch }, transfers);
  });
}

export async function computePeaksFromFileWorker(file, audioContext, bins = 1024, opts = {}) {
  const buf = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf.slice(0));
  return computePeaksFromAudioBufferWorker(audioBuffer, bins, opts);
}

export async function computePeaksFromUrlWorker(url, audioContext, bins = 1024, opts = {}) {
  const proto = (typeof location !== 'undefined' && location.protocol) ? location.protocol : '';
  if (!/^https?:/i.test(proto)) throw new Error('fetch not available for non-http(s) context');
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf);
  return computePeaksFromAudioBufferWorker(audioBuffer, bins, opts);
}

export async function computePeaksFromUrl(url, audioContext, bins = 1024) {
  if (!url || !audioContext) throw new Error('url and audioContext are required');
  const proto = (typeof location !== 'undefined' && location.protocol) ? location.protocol : '';
  if (!/^https?:/i.test(proto)) throw new Error('fetch not available for non-http(s) context');
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf);
  return computePeaksFromAudioBuffer(audioBuffer, bins);
}

export async function computePeaksFromFileAsync(file, audioContext, bins = 1024, opts = {}) {
  if (!file || !audioContext) throw new Error('file and audioContext are required');
  const buf = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf.slice(0));
  return computePeaksFromAudioBufferAsync(audioBuffer, bins, opts);
}

export async function computePeaksFromUrlAsync(url, audioContext, bins = 1024, opts = {}) {
  if (!url || !audioContext) throw new Error('url and audioContext are required');
  const proto = (typeof location !== 'undefined' && location.protocol) ? location.protocol : '';
  if (!/^https?:/i.test(proto)) throw new Error('fetch not available for non-http(s) context');
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf);
  return computePeaksFromAudioBufferAsync(audioBuffer, bins, opts);
}

export function computePeaksFromAudioBuffer(audioBuffer, bins = 1024) {
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const total = ch0.length;
  const step = Math.max(1, Math.floor(total / bins));
  const peaks = new Array(Math.ceil(total / step));
  let pi = 0;
  for (let i = 0; i < total; i += step) {
    let min = 1.0, max = -1.0;
    const end = Math.min(total, i + step);
    for (let j = i; j < end; j++) {
      const a = ch0[j];
      const b = ch1 ? ch1[j] : a;
      const v = (a + b) * 0.5; // stereo combine
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[pi++] = { min, max };
  }
  return peaks;
}

// Async/batched peaks computation to keep UI responsive on large buffers
export async function computePeaksFromAudioBufferAsync(audioBuffer, bins = 1024, { samplesPerBatch = 200_000, onProgress = null } = {}) {
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const total = ch0.length;
  const step = Math.max(1, Math.floor(total / bins));
  const nBins = Math.ceil(total / step);
  const mins = new Float32Array(nBins).fill(1.0);
  const maxs = new Float32Array(nBins).fill(-1.0);

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
    if (typeof onProgress === 'function') {
      try { onProgress(processed / total); } catch {}
    }
    // Yield to event loop
    await new Promise((r) => setTimeout(r, 0));
  }

  const peaks = new Array(nBins);
  for (let i = 0; i < nBins; i++) peaks[i] = { min: mins[i], max: maxs[i] };
  return peaks;
}

export function createStaticWaveformRenderer({ canvas, peaks = null }) {
  if (!canvas) throw new Error('canvas is required');
  const ctx = canvas.getContext('2d');
  let _peaks = peaks;
  let _progress = 0; // 0..1
  let _loadingProgress = null; // 0..1 when computing peaks

  function updateSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width * dpr));
    const h = Math.max(10, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function renderOnce(progress = _progress) {
    updateSize();
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, width, height);

    // peaks
    if (Array.isArray(_peaks) && _peaks.length > 0) {
      const n = _peaks.length;
      const barW = Math.max(1, Math.floor(width / n));
      let x = 0;
      ctx.fillStyle = 'rgba(16,185,129,0.7)'; // emerald-500
      for (let i = 0; i < n; i++) {
        const { min, max } = _peaks[i];
        const y1 = height * (0.5 - Math.max(-1, Math.min(1, min)) * 0.5);
        const y2 = height * (0.5 - Math.max(-1, Math.min(1, max)) * 0.5);
        const top = Math.min(y1, y2);
        const barH = Math.max(1, Math.abs(y2 - y1));
        ctx.fillRect(x, top, barW, barH);
        x += barW;
      }
    } else {
      // placeholder with (optional) progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '12px sans-serif';
      ctx.fillText('ピーク解析中...', 8, Math.max(14, height / 2 - 8));
      if (_loadingProgress != null) {
        const pad = 8;
        const pw = Math.max(0, Math.min(1, _loadingProgress)) * (width - pad * 2);
        ctx.fillStyle = 'rgba(16,185,129,0.6)';
        ctx.fillRect(pad, height - 10, pw, 6);
      }
    }

    // playhead
    const p = Math.max(0, Math.min(1, progress));
    const px = Math.floor(p * width) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    _progress = p;
  }

  function setPeaks(peaks) { _peaks = peaks || null; }
  function setProgress(p) { _progress = Math.max(0, Math.min(1, Number(p) || 0)); }
  function setLoadingProgress(p) { _loadingProgress = p == null ? null : Math.max(0, Math.min(1, Number(p) || 0)); }

  return { setPeaks, setProgress, setLoadingProgress, updateSize, renderOnce };
}
