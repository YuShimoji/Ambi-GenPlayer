// waveform-renderer.js
// Lightweight waveform drawer using AnalyserNode and Canvas

export function createWaveformRenderer({ analyser, canvas, fps = 30, playheadProvider = null }) {
  if (!analyser || !canvas) throw new Error('analyser and canvas are required');
  const ctx = canvas.getContext('2d');
  const bufferLength = analyser.fftSize; // time domain data length equals fftSize
  const dataArray = new Uint8Array(bufferLength);
  let rafId = 0;
  let running = false;
  let lastTs = 0;
  const frameInterval = 1000 / Math.max(1, Math.min(60, fps));

  function updateSize() {
    // Read CSS size and scale to device pixel ratio for crisp lines
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const newW = Math.max(10, Math.floor(rect.width * dpr));
    const newH = Math.max(10, Math.floor(rect.height * dpr));
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }
  }

  function renderFrame() {
    updateSize();
    analyser.getByteTimeDomainData(dataArray);

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, width, height);

    // Grid (light)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)'; // emerald-500
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0; // 0..255 -> ~ -1..1
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Playhead (optional): vertical line indicating playback position 0..1
    if (typeof playheadProvider === 'function') {
      let p = 0;
      try { p = playheadProvider() || 0; } catch { p = 0; }
      if (Number.isFinite(p)) {
        const px = Math.max(0, Math.min(1, p)) * width;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, 0);
        ctx.lineTo(px + 0.5, height);
        ctx.stroke();
      }
    }
  }

  function draw(ts) {
    if (!running) return;
    if (ts && ts - lastTs < frameInterval) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    lastTs = ts || 0;
    renderFrame();
    rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  function renderOnce() {
    renderFrame();
  }

  return { start, stop, updateSize, renderOnce };
}
