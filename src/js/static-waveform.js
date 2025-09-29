// static-waveform.js
// Compute static overview peaks and render them to a canvas

export async function computePeaksFromFile(file, audioContext, bins = 1024) {
  if (!file || !audioContext) throw new Error('file and audioContext are required');
  const buf = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buf.slice(0));
  return computePeaksFromAudioBuffer(audioBuffer, bins);
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

export function createStaticWaveformRenderer({ canvas, peaks = null }) {
  if (!canvas) throw new Error('canvas is required');
  const ctx = canvas.getContext('2d');
  let _peaks = peaks;
  let _progress = 0; // 0..1

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
      // placeholder
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px sans-serif';
      ctx.fillText('Static overview not available', 8, Math.max(14, height / 2));
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

  return { setPeaks, setProgress, updateSize, renderOnce };
}
