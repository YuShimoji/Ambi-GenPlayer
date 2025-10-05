// tone-audio-engine.js
// Tone.js based audio engine (skeleton for Issue #11: crossfade loop)

// This module lazy-loads Tone.js from CDN only when instantiated.
// It mirrors the public API of the Html AudioEngine:
// - loadTrack(url, trackId)
// - startTrack(trackId, { reset })
// - playAll({ reset })
// - pauseAll()
// - stopAll()
// - setTrackVolume(trackId, value)
// - setMasterVolume(value)

export class ToneAudioEngine {
  constructor({ loopCrossfade = 0.05, useGrain = true } = {}) {
    this._Tone = null;
    this._ready = this._loadTone();
    this.loopCrossfade = loopCrossfade; // seconds (for Grain overlap)
    this.useGrain = useGrain;

    this.tracks = new Map(); // id -> { player, gain, isLoaded, pendingPlay }
    this.isPlaying = false;
  }

  get context() {
    // Expose underlying WebAudio context for utilities that expect it (e.g., decode for static peaks)
    if (!this._Tone) return null;
    try {
      const { Tone } = this._Tone;
      const ctx = Tone?.getContext?.().rawContext || Tone?.context?._context || null;
      return ctx || null;
    } catch {
      return null;
    }
  }

  async _loadTone() {
    if (this._Tone) return this._Tone;
    // Prefer esm.sh for ESM import
    const mod = await import('https://esm.sh/tone@14.8.49');
    const Tone = mod.Tone || mod.default || mod;
    this._Tone = { Tone };
    // Master
    this.masterGain = new Tone.Gain(1);
    this.masterGain.connect(Tone.Destination);
    return this._Tone;
  }

  async loadTrack(url, trackId) {
    await this._ready;
    if (!trackId) throw new Error('trackId is required');
    const { Tone } = this._Tone;

    let t = this.tracks.get(trackId);
    const gain = t?.gain || new Tone.Gain(1).connect(this.masterGain);

    let player;
    if (this.useGrain && Tone.GrainPlayer) {
      player = new Tone.GrainPlayer({ url, loop: true, overlap: this.loopCrossfade }).connect(gain);
    } else {
      player = new Tone.Player({ url, loop: true }).connect(gain);
      // Not true loop xfade, but keep fadeIn/Out small to soften edges
      if (typeof player.fadeIn === 'number') player.fadeIn = this.loopCrossfade;
      if (typeof player.fadeOut === 'number') player.fadeOut = this.loopCrossfade;
    }

    t = { player, gain, isLoaded: false, pendingPlay: false };
    this.tracks.set(trackId, t);

    await player.load();
    // Initialize loop region to full duration after load
    try {
      const dur = player.buffer?.duration || null;
      if (dur && isFinite(dur) && dur > 0) {
        if (player.loopStart !== undefined) player.loopStart = 0;
        if (player.loopEnd !== undefined) player.loopEnd = dur;
      }
    } catch {}
    t.isLoaded = true;
    return { trackId, url };
  }

  async startTrack(trackId, { reset = true } = {}) {
    await this._ready;
    const t = this.tracks.get(trackId);
    if (!t) return;
    const { player } = t;
    if (!player) return;

    if (reset) {
      try { player.stop(); } catch {}
      try { player.start(); } catch {}
      return;
    }

    // resume from current position if possible
    try { player.start(); } catch {}
  }

  async playAll({ reset = false } = {}) {
    await this._ready;
    const startOps = [];
    this.tracks.forEach((t) => {
      if (!t?.player) return;
      if (reset) {
        startOps.push(Promise.resolve().then(() => { try { t.player.stop(); } catch {}; try { t.player.start(); } catch {} }));
      } else {
        startOps.push(Promise.resolve().then(() => { try { t.player.start(); } catch {} }));
      }
    });
    await Promise.allSettled(startOps);
    this.isPlaying = true;
  }

  pauseAll() {
    this.tracks.forEach((t) => {
      try { t.player.pause && t.player.pause(); } catch {
        try { t.player.stop(); } catch {}
      }
    });
    this.isPlaying = false;
  }

  stopAll() {
    this.tracks.forEach((t) => {
      try { t.player.stop(); } catch {}
    });
    this.isPlaying = false;
  }

  setTrackVolume(trackId, value) {
    const v = Math.max(0, Math.min(1, Number(value)));
    const t = this.tracks.get(trackId);
    if (t?.gain?.gain?.value !== undefined) t.gain.gain.value = v;
  }

  setMasterVolume(value) {
    const v = Math.max(0, Math.min(1, Number(value)));
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  setLoopCrossfade(seconds = 0.05) {
    const s = Math.max(0, Number(seconds) || 0);
    this.loopCrossfade = s;
    this.tracks.forEach((t) => {
      const p = t?.player; if (!p) return;
      try {
        if (p.overlap !== undefined) p.overlap = s; // GrainPlayer
        if (typeof p.fadeIn === 'number') p.fadeIn = s; // Player (best-effort)
        if (typeof p.fadeOut === 'number') p.fadeOut = s;
      } catch {}
    });
  }

  setLoopRegion(trackId, start = 0, end = null) {
    const t = this.tracks.get(trackId);
    const p = t?.player; if (!p) return;
    try {
      const dur = p.buffer?.duration || 0;
      const s = Math.max(0, Math.min(Number(start) || 0, dur));
      const e = Math.max(s, Math.min(end == null ? dur : Number(end), dur));
      if (p.loopStart !== undefined) p.loopStart = s;
      if (p.loopEnd !== undefined) p.loopEnd = e;
      p.loop = true;
    } catch {}
  }

  getTrackProgress(trackId) {
    // Progress reporting for Tone Player is non-trivial without private fields; return 0 for now.
    // Future: maintain our own clock on start/stop and mod by loopEnd-start.
    return 0;
  }
}
