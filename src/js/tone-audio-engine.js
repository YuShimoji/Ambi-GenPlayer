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

    this.tracks = new Map(); // id -> grain: { mode:'grain', player, gain, isLoaded } | dual: { mode:'dual', players:{a,b}, gain, isLoaded, loopStart, loopEnd, scheduler:null, active:'a'|'b' }
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

    if (this.useGrain && Tone.GrainPlayer) {
      // Grain path (simple loop with overlap)
      const grainSize = Math.max(0.02, this.loopCrossfade * 2);
      const player = new Tone.GrainPlayer({ url, loop: true, overlap: this.loopCrossfade, grainSize }).connect(gain);
      t = { mode: 'grain', player, gain, isLoaded: false };
      this.tracks.set(trackId, t);
      await player.load();
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

    // Dual-Player layered crossfade path
    const pA = new Tone.Player({ url, loop: false }).connect(gain);
    await pA.load();
    const pB = new Tone.Player({ loop: false }).connect(gain);
    // Share buffer to avoid second fetch
    pB.buffer = pA.buffer;
    // Initialize fades
    if (typeof pA.fadeIn === 'number') pA.fadeIn = this.loopCrossfade;
    if (typeof pA.fadeOut === 'number') pA.fadeOut = this.loopCrossfade;
    if (typeof pB.fadeIn === 'number') pB.fadeIn = this.loopCrossfade;
    if (typeof pB.fadeOut === 'number') pB.fadeOut = this.loopCrossfade;

    let loopStart = 0;
    let loopEnd = pA.buffer?.duration || 0;
    if (!isFinite(loopEnd) || loopEnd <= 0) loopEnd = 0;

    t = { mode: 'dual', players: { a: pA, b: pB }, gain, isLoaded: true, loopStart, loopEnd, scheduler: null, active: 'a' };
    this.tracks.set(trackId, t);
    return { trackId, url };
  }

  async startTrack(trackId, { reset = true } = {}) {
    await this._ready;
    const t = this.tracks.get(trackId);
    if (!t) return;
    if (t.mode === 'grain') {
      const { player } = t;
      if (!player) return;
      if (reset) { try { player.stop(); } catch {}; try { player.start(); } catch {}; return; }
      try { player.start(); } catch {}
      return;
    }
    // dual mode
    this._dualStart(t, { reset });
  }

  async playAll({ reset = false } = {}) {
    await this._ready;
    const startOps = [];
    this.tracks.forEach((t) => {
      if (t?.mode === 'grain') {
        const p = t.player; if (!p) return;
        if (reset) {
          startOps.push(Promise.resolve().then(() => { try { p.stop(); } catch {}; try { p.start(); } catch {} }));
        } else {
          startOps.push(Promise.resolve().then(() => { try { p.start(); } catch {} }));
        }
      } else if (t?.mode === 'dual') {
        startOps.push(Promise.resolve().then(() => this._dualStart(t, { reset })));
      }
    });
    await Promise.allSettled(startOps);
    this.isPlaying = true;
  }

  pauseAll() {
    this.tracks.forEach((t) => {
      try {
        if (t.mode === 'grain') {
          t.player.pause && t.player.pause();
        } else if (t.mode === 'dual') {
          this._dualStop(t);
        }
      } catch {
        try { if (t.mode === 'grain') t.player.stop(); } catch {}
      }
    });
    this.isPlaying = false;
  }

  stopAll() {
    this.tracks.forEach((t) => {
      try {
        if (t.mode === 'grain') { t.player.stop(); }
        else if (t.mode === 'dual') { this._dualStop(t, { reset: true }); }
      } catch {}
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
      try {
        if (t.mode === 'grain') {
          const p = t.player; if (!p) return;
          if (p.overlap !== undefined) {
            p.overlap = s; // GrainPlayer
            if (p.grainSize !== undefined) {
              // 粒長はオーバーラップの約2倍を目安にし、下限は20ms
              p.grainSize = Math.max(0.02, s * 2);
            }
          }
          if (typeof p.fadeIn === 'number') p.fadeIn = s; // Player (best-effort)
          if (typeof p.fadeOut === 'number') p.fadeOut = s;
        } else if (t.mode === 'dual') {
          const a = t.players?.a; const b = t.players?.b;
          if (a) { if (typeof a.fadeIn === 'number') a.fadeIn = s; if (typeof a.fadeOut === 'number') a.fadeOut = s; }
          if (b) { if (typeof b.fadeIn === 'number') b.fadeIn = s; if (typeof b.fadeOut === 'number') b.fadeOut = s; }
        }
      } catch {}
    });
  }

  setLoopRegion(trackId, start = 0, end = null) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    try {
      if (t.mode === 'grain') {
        const p = t.player; if (!p) return;
        const dur = p.buffer?.duration || 0;
        const s = Math.max(0, Math.min(Number(start) || 0, dur));
        const e = Math.max(s, Math.min(end == null ? dur : Number(end), dur));
        if (p.loopStart !== undefined) p.loopStart = s;
        if (p.loopEnd !== undefined) p.loopEnd = e;
        p.loop = true;
      } else if (t.mode === 'dual') {
        const dur = t.players?.a?.buffer?.duration || 0;
        const s = Math.max(0, Math.min(Number(start) || 0, dur));
        const e = Math.max(s, Math.min(end == null ? dur : Number(end), dur));
        t.loopStart = s; t.loopEnd = e;
        // will apply on next scheduling cycle
      }
    } catch {}
  }

  getTrackProgress(trackId) {
    // Progress reporting for Tone Player is non-trivial without private fields; return 0 for now.
    // Future: maintain our own clock on start/stop and mod by loopEnd-start.
    return 0;
  }
}

// ===== Dual Player Scheduling Helpers =====
// Schedule alternating starts for two Tone.Player instances with crossfade overlap
// Times are in Tone seconds (relative to audio context).
ToneAudioEngine.prototype._dualStart = function(t, { reset = true } = {}) {
  const { Tone } = this._Tone;
  if (!t || t.mode !== 'dual') return;
  const a = t.players?.a; const b = t.players?.b; if (!a || !b) return;
  // stop any currently scheduled playback
  this._dualStop(t);

  const start = t.loopStart ?? 0;
  const durRaw = (t.loopEnd ?? (a.buffer?.duration || 0)) - start;
  const loopDur = Math.max(0.05, Number.isFinite(durRaw) ? durRaw : 0.05);
  let cross = Math.max(0, Number(this.loopCrossfade) || 0);
  if (cross > loopDur / 2) cross = loopDur / 2 - 0.005; // avoid self-overlap
  const period = Math.max(loopDur, 2 * (loopDur - cross));

  // ensure fades are in place
  if (typeof a.fadeIn === 'number') a.fadeIn = cross;
  if (typeof a.fadeOut === 'number') a.fadeOut = cross;
  if (typeof b.fadeIn === 'number') b.fadeIn = cross;
  if (typeof b.fadeOut === 'number') b.fadeOut = cross;

  const base = Tone.now() + 0.05;
  // initial events
  try {
    a.start(base, start, loopDur); a.stop(base + loopDur);
    const bStart = base + (loopDur - cross);
    b.start(bStart, start, loopDur); b.stop(bStart + loopDur);
  } catch {}

  // schedule subsequent events with independent timers
  const scheduleA = (at) => {
    const delayMs = Math.max(0, (at - Tone.now() - 0.01) * 1000);
    t.scheduler.a = setTimeout(() => {
      try { a.start(at, start, loopDur); a.stop(at + loopDur); } catch {}
      scheduleA(at + period);
    }, delayMs);
  };
  const scheduleB = (at) => {
    const delayMs = Math.max(0, (at - Tone.now() - 0.01) * 1000);
    t.scheduler.b = setTimeout(() => {
      try { b.start(at, start, loopDur); b.stop(at + loopDur); } catch {}
      scheduleB(at + period);
    }, delayMs);
  };
  t.scheduler = { a: null, b: null };
  scheduleA(base + period);
  scheduleB(base + period + (loopDur - cross));
};

ToneAudioEngine.prototype._dualStop = function(t, { reset = false } = {}) {
  const { Tone } = this._Tone;
  if (!t || t.mode !== 'dual') return;
  if (t.scheduler) {
    try { if (t.scheduler.a) clearTimeout(t.scheduler.a); } catch {}
    try { if (t.scheduler.b) clearTimeout(t.scheduler.b); } catch {}
    t.scheduler = null;
  }
  const now = Tone.now();
  try { t.players?.a?.stop(now + 0.001); } catch {}
  try { t.players?.b?.stop(now + 0.001); } catch {}
};
