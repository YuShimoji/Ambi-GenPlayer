// main.js
// Phase 1 bootstrap: wire UI and AudioEngine with minimal, non-failing stubs.

import { AudioEngine } from './audio-engine.js';
import { createAudioEngine } from './engine-factory.js';
import { UIHandler } from './ui-handler.js';
import { TagLibrary, loadTracksByTags } from './tag-library.js';
import { createWaveformRenderer } from './waveform-renderer.js';
import { createStaticWaveformRenderer, computePeaksFromFileWorker, computePeaksFromUrlWorker, computePeaksFromFileAsync, computePeaksFromUrlAsync } from './static-waveform.js';

function onReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
}

onReady(async () => {
  const params = new URLSearchParams(location.search);
  const impl = params.get('engine') || (window.__engine || 'html');
  const audioEngine = await createAudioEngine(impl);
  const library = new TagLibrary();
  const renderers = new Map(); // trackId -> { start, stop }
  const staticRenderers = new Map(); // trackId -> { setPeaks, setProgress, setLoadingProgress, updateSize, renderOnce }
  let staticTickerId = 0;
  let lastStaticTick = 0;
  let isStaticMode = false;

  const ui = new UIHandler({
    playButton: '#playBtn',
    pauseButton: '#pauseBtn',
    stopButton: '#stopBtn',
    masterVolumeSlider: '#masterVolume',
    masterVolumeValue: '#masterVolumeValue',
    trackControlsContainer: '#trackControls',
    dropZone: '#dropZone',
    waveformModeToggle: '#waveformMode',
    crossfadeMsSlider: '#crossfadeMs',
    crossfadeMsValue: '#crossfadeMsValue',
  });

  function applyPersistedSettings() {
    try {
      const wf = localStorage.getItem('waveformMode');
      if (wf != null && ui.waveformToggle) {
        ui.waveformToggle.checked = wf === '1';
        const evCh = new Event('change');
        ui.waveformToggle.dispatchEvent(evCh);
      }
      const xf = localStorage.getItem('crossfadeMs');
      if (xf != null && ui.crossfadeSlider) {
        ui.crossfadeSlider.value = String(Math.max(0, Number(xf) || 0));
        const ev = new Event('input');
        ui.crossfadeSlider.dispatchEvent(ev);
      }
    } catch {}
  }

  // Wire UI events to AudioEngine methods
  ui.onPlayAll(() => {
    // Resume from paused positions by default
    audioEngine.playAll({ reset: false });
    // start all renderers
    if (isStaticMode) {
      renderers.forEach((r) => r.stop());
      startStaticTicker();
    } else {
      renderers.forEach((r) => r.start());
      stopStaticTicker(false);
    }
  });
  ui.onPauseAll(() => {
    audioEngine.pauseAll();
    // stop all renderers
    renderers.forEach((r) => { r.stop(); r.renderOnce && r.renderOnce(); });
    stopStaticTicker(true); // freeze playhead at current position
  });
  ui.onStopAll(() => {
    audioEngine.stopAll();
    // draw initial frame after reset
    renderers.forEach((r) => { r.updateSize && r.updateSize(); r.renderOnce && r.renderOnce(); });
    // reset static overview playhead to 0
    staticRenderers.forEach((sr) => { sr.updateSize && sr.updateSize(); sr.setProgress && sr.setProgress(0); sr.renderOnce && sr.renderOnce(); });
    stopStaticTicker(false);
  });
  ui.onWaveformModeChange((on) => {
    isStaticMode = !!on;
    try { localStorage.setItem('waveformMode', on ? '1' : '0'); } catch {}
    updateWaveModeViews();
    if (audioEngine.isPlaying) {
      if (isStaticMode) {
        renderers.forEach((r) => r.stop());
        startStaticTicker();
      } else {
        stopStaticTicker(false);
        renderers.forEach((r) => r.start());
      }
    } else {
      // paused or stopped: render single frame of the active mode
      if (isStaticMode) {
        staticRenderers.forEach((sr) => sr.renderOnce && sr.renderOnce());
      } else {
        renderers.forEach((r) => r.renderOnce && r.renderOnce());
      }
    }
  });

  ui.onCrossfadeChange((ms) => {
    const s = Math.max(0, Number(ms) || 0) / 1000;
    try { localStorage.setItem('crossfadeMs', String(Math.max(0, Number(ms) || 0))); } catch {}
    console.log('[UI] crossfade changed', { ms: Math.max(0, Number(ms) || 0), seconds: s });
    if (typeof audioEngine.setLoopCrossfade === 'function') {
      try { audioEngine.setLoopCrossfade(s); } catch {}
    }
  });
  ui.onMasterVolumeChange((value) => audioEngine.setMasterVolume(value));
  ui.onTrackVolumeChange((trackId, value) => audioEngine.setTrackVolume(trackId, value));

  // restore persisted UI after handlers are ready
  applyPersistedSettings();

  function ensureRenderer(trackId) {
    if (renderers.has(trackId)) return renderers.get(trackId);
    const row = document.querySelector(`[data-track-id="${trackId}"]`);
    const canvas = row?.querySelector('canvas.wave');
    const track = audioEngine.tracks?.get(trackId);
    const analyser = track?.analyser;
    if (!canvas || !analyser) return null;
    // Provide playhead as currentTime/duration (guarded)
    const playheadProvider = () => {
      const m = track?.media;
      if (!m || !m.duration || !isFinite(m.duration) || m.duration <= 0) return 0;
      return (m.currentTime % m.duration) / m.duration;
    };
    const renderer = createWaveformRenderer({ analyser, canvas, fps: 30, playheadProvider });
    renderers.set(trackId, renderer);
    // draw one frame immediately for stable initial display (no animation while paused)
    renderer.updateSize();
    renderer.renderOnce();
    return renderer;
  }

  function ensureStaticRenderer(trackId) {
    if (staticRenderers.has(trackId)) return staticRenderers.get(trackId);
    const row = document.querySelector(`[data-track-id="${trackId}"]`);
    const canvas = row?.querySelector('canvas.wave-static');
    if (!canvas) return null;
    const sr = createStaticWaveformRenderer({ canvas });
    staticRenderers.set(trackId, sr);
    sr.updateSize();
    sr.renderOnce();
    return sr;
  }

  function updateWaveModeViews() {
    // Toggle visibility per row
    staticRenderers.forEach((_, trackId) => {
      const row = document.querySelector(`[data-track-id="${trackId}"]`);
      if (!row) return;
      const cvsStatic = row.querySelector('canvas.wave-static');
      const cvsDyn = row.querySelector('canvas.wave');
      if (cvsStatic) cvsStatic.style.display = isStaticMode ? 'block' : 'none';
      if (cvsDyn) cvsDyn.style.display = isStaticMode ? 'none' : 'block';
    });
  }

  function updateStaticProgressAll() {
    staticRenderers.forEach((sr, trackId) => {
      const t = audioEngine.tracks?.get(trackId);
      const m = t?.media;
      if (!m || !m.duration || !isFinite(m.duration) || m.duration <= 0) return;
      const p = (m.currentTime % m.duration) / m.duration;
      sr.setProgress && sr.setProgress(p);
      sr.renderOnce && sr.renderOnce();
    });
  }

  function startStaticTicker() {
    if (staticTickerId) return;
    const tick = (ts) => {
      if (!audioEngine.isPlaying) { staticTickerId = 0; return; }
      if (!lastStaticTick || ts - lastStaticTick > 100) { // ~10fps for static
        updateStaticProgressAll();
        lastStaticTick = ts;
      }
      staticTickerId = requestAnimationFrame(tick);
    };
    staticTickerId = requestAnimationFrame(tick);
  }

  function stopStaticTicker(freeze = true) {
    if (staticTickerId) cancelAnimationFrame(staticTickerId);
    staticTickerId = 0;
    if (freeze) updateStaticProgressAll();
  }

  // Sample tracks loader (disabled by default to avoid console errors when files are not present)
  const ENABLE_SAMPLE_TRACKS = true; // Set true after placing audio files under assets/audio/
  if (ENABLE_SAMPLE_TRACKS) {
    const sampleTracks = [
      { id: 'track1', label: 'Track 1', url: './assets/audio/sample1.mp3' },
      { id: 'track2', label: 'Track 2', url: './assets/audio/sample2.mp3' },
    ];

    for (const t of sampleTracks) {
      try {
        // register in library (Issue #8)
        library.addTrack({ id: t.id, url: t.url, label: t.label, tags: ['sample', 'ambient'] });
        audioEngine.loadTrack(t.url, t.id);
        ui.ensureTrackSlider(t.id, t.label);
        const r = ensureRenderer(t.id);
        const sr = ensureStaticRenderer(t.id);
        // Best-effort peaks for URL (only if served via http(s) with CORS)
        try {
          const isHttp = typeof location !== 'undefined' && /^https?:/i.test(location.protocol);
          if (isHttp) {
            const useWorker = typeof Worker !== 'undefined' && isHttp;
            const compute = useWorker ? computePeaksFromUrlWorker : computePeaksFromUrlAsync;
            compute(t.url, audioEngine.context, 1024, {
              onProgress: (p) => { sr && sr.setLoadingProgress && sr.setLoadingProgress(p); sr && sr.renderOnce && sr.renderOnce(); },
            }).then((peaks) => {
              if (sr) { sr.setLoadingProgress && sr.setLoadingProgress(null); sr.setPeaks(peaks); sr.renderOnce(); }
            }).catch(async () => {
              // Fallback from worker to async if it failed
              try {
                const peaks = await computePeaksFromUrlAsync(t.url, audioEngine.context, 1024, {
                  onProgress: (p) => { sr && sr.setLoadingProgress && sr.setLoadingProgress(p); sr && sr.renderOnce && sr.renderOnce(); },
                });
                if (sr) { sr.setLoadingProgress && sr.setLoadingProgress(null); sr.setPeaks(peaks); sr.renderOnce(); }
              } catch {}
            });
          }
        } catch {}
        if (audioEngine.isPlaying) {
          r && r.start();
          if (isStaticMode) startStaticTicker();
        } else {
          r && r.renderOnce();
          sr && sr.renderOnce();
        }
        updateWaveModeViews();
      } catch (err) {
        console.warn('サンプルトラックの準備に失敗しました:', t, err);
      }
    }
  }

  // Drag & Drop handler: load dropped audio files as new tracks
  ui.onFilesDropped(async (files) => {
    const audioExt = /\.(mp3|wav|ogg|oga|opus|webm|m4a|aac|flac)$/i;
    const audioFiles = files.filter((f) => (f.type && f.type.startsWith('audio/')) || audioExt.test(f.name));
    if (!audioFiles.length) {
      console.warn('Audio以外のファイルは無視しました');
      return;
    }

    const now = Date.now();
    let index = 0;
    for (const file of audioFiles) {
      const label = file.name.replace(/\.[^/.]+$/, '');
      const trackId = `drop-${now}-${index++}`; // unique, deterministic per drop
      const objectUrl = URL.createObjectURL(file);

      try {
        // register in library (Issue #8)
        library.addTrack({ id: trackId, url: objectUrl, label, tags: ['drop'] });
        ui.ensureTrackSlider(trackId, label);
        await audioEngine.loadTrack(objectUrl, trackId);
        const r = ensureRenderer(trackId);
        const sr = ensureStaticRenderer(trackId);
        // compute static peaks from the dropped file (async with progress)
        try {
          if (sr) { sr.setLoadingProgress && sr.setLoadingProgress(0); sr.renderOnce && sr.renderOnce(); }
          const useWorker = typeof Worker !== 'undefined' && (typeof location !== 'undefined' && /^https?:/i.test(location.protocol));
          let peaks;
          if (useWorker) {
            try {
              peaks = await computePeaksFromFileWorker(file, audioEngine.context, 1024, {
                onProgress: (p) => { sr && sr.setLoadingProgress && sr.setLoadingProgress(p); sr && sr.renderOnce && sr.renderOnce(); },
              });
            } catch {
              peaks = await computePeaksFromFileAsync(file, audioEngine.context, 1024, {
                onProgress: (p) => { sr && sr.setLoadingProgress && sr.setLoadingProgress(p); sr && sr.renderOnce && sr.renderOnce(); },
              });
            }
          } else {
            peaks = await computePeaksFromFileAsync(file, audioEngine.context, 1024, {
              onProgress: (p) => { sr && sr.setLoadingProgress && sr.setLoadingProgress(p); sr && sr.renderOnce && sr.renderOnce(); },
            });
          }
          if (sr) { sr.setLoadingProgress && sr.setLoadingProgress(null); sr.setPeaks(peaks); sr.renderOnce(); }
        } catch (e) {
          console.warn('静的波形の生成に失敗:', e);
        }
        if (audioEngine.isPlaying) {
          // if already playing, start this new track immediately without resetting others
          await audioEngine.startTrack(trackId, { reset: false });
          if (!isStaticMode && r) r.start();
          if (isStaticMode) startStaticTicker();
        } else {
          r && r.renderOnce();
          sr && sr.renderOnce();
        }
        updateWaveModeViews();
      } catch (err) {
        console.warn('DnDでのトラック追加に失敗:', { file, err });
      }
    }
  });

  // Resize handling: update all renderer canvas sizes on window resize
  window.addEventListener('resize', () => {
    renderers.forEach((r) => {
      if (!r) return;
      r.updateSize && r.updateSize();
      r.renderOnce && r.renderOnce();
    });
    staticRenderers.forEach((sr) => {
      if (!sr) return;
      sr.updateSize && sr.updateSize();
      sr.renderOnce && sr.renderOnce();
    });
  });

  // Expose for console-driven testing
  window.__audioEngine = audioEngine;
  window.__ui = ui;
  window.__library = library;
  window.__loadByTags = (tags, mode = 'AND', autoStart = true, reset = true) =>
    loadTracksByTags({ audioEngine, ui, library, tags, mode, autoStart, reset });
});
