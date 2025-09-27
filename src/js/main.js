// main.js
// Phase 1 bootstrap: wire UI and AudioEngine with minimal, non-failing stubs.

import { AudioEngine } from './audio-engine.js';
import { UIHandler } from './ui-handler.js';

function onReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
}

onReady(() => {
  const audioEngine = new AudioEngine();

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
  ui.onPlayAll(() => audioEngine.playAll());
  ui.onPauseAll(() => audioEngine.pauseAll());
  ui.onStopAll(() => audioEngine.pauseAll()); // stub: pause acts as stop for MVP skeleton
  ui.onMasterVolumeChange((value) => audioEngine.setMasterVolume(value));
  ui.onTrackVolumeChange((trackId, value) => audioEngine.setTrackVolume(trackId, value));

  // Sample tracks loader (disabled by default to avoid console errors when files are not present)
  const ENABLE_SAMPLE_TRACKS = true; // Set true after placing audio files under assets/audio/
  if (ENABLE_SAMPLE_TRACKS) {
    const sampleTracks = [
      { id: 'track1', label: 'Track 1', url: './assets/audio/sample1.mp3' },
      { id: 'track2', label: 'Track 2', url: './assets/audio/sample2.mp3' },
    ];

    for (const t of sampleTracks) {
      try {
        audioEngine.loadTrack(t.url, t.id);
        ui.ensureTrackSlider(t.id, t.label);
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
        ui.ensureTrackSlider(trackId, label);
        await audioEngine.loadTrack(objectUrl, trackId);
        if (audioEngine.isPlaying) {
          // if already playing, start this new track immediately without resetting others
          await audioEngine.startTrack(trackId, { reset: false });
        }
      } catch (err) {
        console.warn('DnDでのトラック追加に失敗:', { file, err });
      }
    }
  });

  // Expose for console-driven testing
  window.__audioEngine = audioEngine;
  window.__ui = ui;
});
