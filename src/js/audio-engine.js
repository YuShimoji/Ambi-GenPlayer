// audio-engine.js
// MVP skeleton for phase-1. Provides method stubs and safe defaults.

export class AudioEngine {
  constructor() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioCtx();

    // Master gain controls overall volume
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.context.destination);

    // Track registry: trackId -> { url, gainNode, media, source, isLoaded, pendingPlay }
    this.tracks = new Map();
    this.isPlaying = false;

    // In many browsers, context starts suspended until user gesture.
    // We keep it as-is to avoid policy issues; UI will trigger resume on play.
  }

  // Load a track via HTMLAudioElement to support file:// and http(s) without fetch for local dev.
  async loadTrack(url, trackId) {
    if (!trackId) throw new Error('trackId is required');

    // Reuse track container if exists
    let track = this.tracks.get(trackId);
    const gain = track?.gainNode ?? this.context.createGain();
    gain.gain.value = track?.gainNode?.gain?.value ?? 1.0;
    gain.connect(this.masterGain);

    const media = new Audio();
    media.crossOrigin = 'anonymous';
    media.src = url;
    media.preload = 'auto';
    media.loop = true; // AE-01: each source loops

    track = {
      url,
      gainNode: gain,
      media,
      source: null, // MediaElementAudioSourceNode (created once upon first play)
      isLoaded: false,
      pendingPlay: false,
    };
    this.tracks.set(trackId, track);

    // Resolve when the media is sufficiently loaded to play through
    const loadPromise = new Promise((resolve, reject) => {
      const onReady = () => {
        track.isLoaded = true;
        cleanup();
        resolve({ trackId, url });
      };
      const onError = (e) => {
        cleanup();
        console.warn('[AudioEngine] loadTrack error', { trackId, url, e });
        reject(new Error(`Failed to load track: ${url}`));
      };
      const cleanup = () => {
        media.removeEventListener('canplaythrough', onReady);
        media.removeEventListener('loadeddata', onReady);
        media.removeEventListener('error', onError);
      };

      media.addEventListener('canplaythrough', onReady, { once: true });
      media.addEventListener('loadeddata', onReady, { once: true });
      media.addEventListener('error', onError, { once: true });
    });

    console.log('[AudioEngine] loadTrack registered', { trackId, url });
    return loadPromise;
  }

  // Convenience method to load multiple tracks concurrently
  async loadTracks(entries) {
    if (!Array.isArray(entries)) return [];
    return Promise.all(entries.map((e) => this.loadTrack(e.url, e.trackId)));
  }

  // Start a single track by id. If not yet loaded, schedule start on ready.
  async startTrack(trackId, { reset = true } = {}) {
    const track = this.tracks.get(trackId);
    if (!track || !track.media) return;

    const start = () => {
      if (!track.source) {
        try {
          track.source = this.context.createMediaElementSource(track.media);
          track.source.connect(track.gainNode);
        } catch (e) {
          console.warn('[AudioEngine] createMediaElementSource failed', { trackId, e });
        }
      }
      try {
        if (reset) track.media.currentTime = 0;
        const p = track.media.play();
        return p && typeof p.then === 'function' ? p : Promise.resolve();
      } catch (e) {
        console.warn('[AudioEngine] startTrack play failed', { trackId, e });
        return Promise.resolve();
      }
    };

    if (track.isLoaded) {
      return start();
    }

    track.pendingPlay = true;
    return new Promise((resolve) => {
      const onReady = () => {
        track.isLoaded = true;
        track.media.removeEventListener('canplaythrough', onReady);
        track.media.removeEventListener('loadeddata', onReady);
        if (track.pendingPlay) {
          start().finally(resolve);
        } else {
          resolve();
        }
      };
      track.media.addEventListener('canplaythrough', onReady, { once: true });
      track.media.addEventListener('loadeddata', onReady, { once: true });
    });
  }

  playAll() {
    // Resume AudioContext if needed
    if (this.context.state === 'suspended') {
      this.context.resume().catch((e) => console.warn('AudioContext resume failed', e));
    }

    // Start all loaded media elements at currentTime=0; schedule start for not-yet-loaded ones.
    const startPromises = [];
    const startTrack = (track, trackId) => {
      if (!track) return;
      if (!track.source) {
        try {
          track.source = this.context.createMediaElementSource(track.media);
          track.source.connect(track.gainNode);
        } catch (e) {
          console.warn('[AudioEngine] createMediaElementSource failed', { trackId, e });
        }
      }
      try {
        track.media.currentTime = 0;
        const p = track.media.play();
        if (p && typeof p.then === 'function') startPromises.push(p);
      } catch (e) {
        console.warn('[AudioEngine] play failed', { trackId, e });
      }
    };

    this.tracks.forEach((track, trackId) => {
      if (!track || !track.media) return;
      if (track.isLoaded) {
        startTrack(track, trackId);
      } else {
        // mark to start once loaded
        track.pendingPlay = true;
        const onReady = () => {
          track.isLoaded = true;
          track.media.removeEventListener('canplaythrough', onReady);
          track.media.removeEventListener('loadeddata', onReady);
          if (track.pendingPlay) startTrack(track, trackId);
        };
        track.media.addEventListener('canplaythrough', onReady, { once: true });
        track.media.addEventListener('loadeddata', onReady, { once: true });
      }
    });

    Promise.allSettled(startPromises).then(() => {
      this.isPlaying = true;
      console.log('[AudioEngine] playAll started', { tracks: this.tracks.size });
    });
  }

  pauseAll() {
    // Pause each media element to preserve playback position
    this.tracks.forEach((track, trackId) => {
      try {
        if (track) track.pendingPlay = false;
        if (track?.media && !track.media.paused) track.media.pause();
      } catch (e) {
        console.warn('[AudioEngine] pause failed', { trackId, e });
      }
    });
    this.isPlaying = false;
    console.log('[AudioEngine] pauseAll');
  }

  setTrackVolume(trackId, volume) {
    const v = Math.max(0, Math.min(1, Number(volume)));
    const track = this.tracks.get(trackId);
    if (track && track.gainNode) {
      track.gainNode.gain.value = v;
      console.log(`[AudioEngine] setTrackVolume`, { trackId, volume: v });
    } else {
      console.warn(`[AudioEngine] setTrackVolume: track not found`, { trackId });
    }
  }

  setMasterVolume(volume) {
    const v = Math.max(0, Math.min(1, Number(volume)));
    this.masterGain.gain.value = isFinite(v) ? v : 0;
    console.log('[AudioEngine] setMasterVolume', { volume: this.masterGain.gain.value });
  }
}
