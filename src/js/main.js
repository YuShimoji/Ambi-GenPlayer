// main.js
// Phase 1 bootstrap: wire UI and AudioEngine with minimal, non-failing stubs.

import { AudioEngine } from './audio-engine.js';
import { UIHandler } from './ui-handler.js';
import { TagLibrary, loadTracksByTags } from './tag-library.js';
import { createWaveformRenderer } from './waveform-renderer.js';

function onReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
}

onReady(() => {
  const audioEngine = new AudioEngine();
  const library = new TagLibrary();
  const renderers = new Map(); // trackId -> { start, stop }

  const ui = new UIHandler({
    playButton: '#playBtn',
    pauseButton: '#pauseBtn',
    stopButton: '#stopBtn',
    masterVolumeSlider: '#masterVolume',
    masterVolumeValue: '#masterVolumeValue',
    trackControlsContainer: '#trackControls',
    dropZone: '#dropZone',
  });

  // Wire UI events to AudioEngine methods
  ui.onPlayAll(() => {
    // Resume from paused positions by default
    audioEngine.playAll({ reset: false });
    // start all renderers
    renderers.forEach((r) => r.start());
  });
  ui.onPauseAll(() => {
    audioEngine.pauseAll();
    // stop all renderers
    renderers.forEach((r) => { r.stop(); r.renderOnce && r.renderOnce(); });
  });
  ui.onStopAll(() => {
    audioEngine.stopAll();
    // draw initial frame after reset
    renderers.forEach((r) => { r.updateSize && r.updateSize(); r.renderOnce && r.renderOnce(); });
  });
  ui.onMasterVolumeChange((value) => audioEngine.setMasterVolume(value));
  ui.onTrackVolumeChange((trackId, value) => audioEngine.setTrackVolume(trackId, value));

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
        if (audioEngine.isPlaying) {
          r && r.start();
        } else {
          r && r.renderOnce();
        }
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
        if (audioEngine.isPlaying) {
          // if already playing, start this new track immediately without resetting others
          await audioEngine.startTrack(trackId, { reset: false });
          if (r) r.start();
        } else {
          r && r.renderOnce();
        }
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
  });

  // Expose for console-driven testing
  window.__audioEngine = audioEngine;
  window.__ui = ui;
  window.__library = library;
  window.__loadByTags = (tags, mode = 'AND', autoStart = true, reset = true) =>
    loadTracksByTags({ audioEngine, ui, library, tags, mode, autoStart, reset });
});
