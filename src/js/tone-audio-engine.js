// tone-audio-engine.js
// Tone.js based audio engine (Issue #11 crossfade, Issue #12 random loop)
//
// This module lazy-loads Tone.js from CDN only when instantiated.
// It mirrors the public API of the Html AudioEngine:
// - loadTrack(url, trackId)
// - startTrack(trackId, { reset })
// - playAll({ reset })
// - pauseAll()
// - stopAll()
// - setTrackVolume(trackId, value)
// - setMasterVolume(value)

const DEFAULT_RANDOM_LOOP_CONFIG = Object.freeze({
  enabled: false,
  startMin: 0,
  startMax: 0,
  lengthMin: 1,
  lengthMax: 4,
  mode: 'perLoop',
  intervalSeconds: 8,
  seed: null,
});

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  let normalized;
  if (seed == null || seed === '' || Number.isNaN(seed)) {
    normalized = Math.floor(Math.random() * 0xffffffff) >>> 0;
  } else {
    normalized = Math.abs(Math.floor(seed)) % 0xffffffff;
  }
  if (!normalized) normalized = 1;
  return mulberry32(normalized);
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function normalizeRandomConfig(cfg = {}) {
  const base = { ...DEFAULT_RANDOM_LOOP_CONFIG };
  const merged = { ...base, ...(cfg || {}) };
  merged.startMin = Math.max(0, Number(merged.startMin) || 0);
  merged.startMax = Math.max(merged.startMin, Number(merged.startMax) || merged.startMin);
  merged.lengthMin = Math.max(0.05, Number(merged.lengthMin) || base.lengthMin);
  merged.lengthMax = Math.max(merged.lengthMin, Number(merged.lengthMax) || merged.lengthMin);
  merged.intervalSeconds = Math.max(1, Number(merged.intervalSeconds) || base.intervalSeconds);
  merged.mode = merged.mode === 'interval' ? 'interval' : 'perLoop';
  if (merged.seed == null || merged.seed === '') merged.seed = null;
  return merged;
}

function pickRandom(rng, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min;
  const span = Math.max(0, max - min);
  if (span <= 0) return min;
  return min + rng() * span;
}

export class ToneAudioEngine {
  constructor({ loopCrossfade = 0.05, useGrain = false, randomLoopConfig = DEFAULT_RANDOM_LOOP_CONFIG } = {}) {
    this._Tone = null;
    this._ready = this._loadTone();
    this.loopCrossfade = loopCrossfade; // seconds (for Grain overlap)
    this.useGrain = useGrain;

    this.tracks = new Map(); // id -> grain: { mode:'grain', player, gain, isLoaded } | dual: { mode:'dual', players:{a,b}, gain, isLoaded, loopStart, loopEnd, scheduler:null, active:'a'|'b' }
    this.isPlaying = false;
    this.randomLoopGlobal = normalizeRandomConfig(randomLoopConfig);
    console.log('[ToneAudioEngine] initialized', { useGrain: this.useGrain, loopCrossfade: this.loopCrossfade, randomLoop: this.randomLoopGlobal });
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
    // Initialize fades (Tone.Player accepts seconds)
    pA.fadeIn = this.loopCrossfade;
    pA.fadeOut = this.loopCrossfade;
    pB.fadeIn = this.loopCrossfade;
    pB.fadeOut = this.loopCrossfade;

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
    try { await this._Tone.Tone.start(); } catch {}
    try { this._Tone.Tone.getContext().resume(); } catch {}
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
    console.log('[ToneAudioEngine] setLoopCrossfade', { seconds: s });
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
          if (a) { a.fadeIn = s; a.fadeOut = s; }
          if (b) { b.fadeIn = s; b.fadeOut = s; }
          if (this.isPlaying) {
            // reschedule with new crossfade
            this._dualStart(t, { reset: false });
          }
        }
      } catch {}
    });
  }

  setLoopRegion(trackId, start = 0, end = null) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    console.log('[ToneAudioEngine] setLoopRegion', { trackId, start, end });
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
        if (this.isPlaying) this._dualStart(t, { reset: false });
      }
    } catch {}
  }

  getTrackProgress(trackId) {
    // Progress reporting for Tone Player is non-trivial without private fields; return 0 for now.
    // Future: maintain our own clock on start/stop and mod by loopEnd-start.
    return 0;
  }

  // ===== Random Loop Configuration =====
  setRandomLoopGlobalConfig(config) {
    this.randomLoopGlobal = normalizeRandomConfig(config);
    console.log('[ToneAudioEngine] setRandomLoopGlobalConfig', this.randomLoopGlobal);
    // Apply to all existing tracks that don't have their own config
    this.tracks.forEach((t, trackId) => {
      if (!t.randomLoop?.hasOwnConfig) {
        this._applyRandomConfig(trackId, this.randomLoopGlobal);
      }
    });
  }

  setRandomLoopConfig(trackId, config) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    const normalized = normalizeRandomConfig(config);
    t.randomLoop = {
      ...t.randomLoop,
      hasOwnConfig: true,
      config: normalized,
      enabled: normalized.enabled,
      rng: createRng(normalized.seed),
    };
    console.log('[ToneAudioEngine] setRandomLoopConfig', { trackId, config: normalized });
    // If playing, reschedule with new random params
    if (this.isPlaying && t.mode === 'dual') {
      this._dualStart(t, { reset: false });
    }
  }

  disableRandomLoop(trackId) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    if (t.randomLoop) {
      t.randomLoop.enabled = false;
    }
    console.log('[ToneAudioEngine] disableRandomLoop', { trackId });
    // Reschedule with fixed loop
    if (this.isPlaying && t.mode === 'dual') {
      this._dualStart(t, { reset: false });
    }
  }

  getRandomLoopState(trackId) {
    const t = this.tracks.get(trackId);
    if (!t || !t.randomLoop) return null;
    return {
      enabled: t.randomLoop.enabled,
      config: t.randomLoop.config,
      currentLoopStart: t.loopStart,
      currentLoopEnd: t.loopEnd,
    };
  }

  _applyRandomConfig(trackId, config) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    const normalized = normalizeRandomConfig(config);
    t.randomLoop = {
      hasOwnConfig: false,
      config: normalized,
      enabled: normalized.enabled,
      rng: createRng(normalized.seed),
    };
  }

  _generateRandomLoopParams(t) {
    if (!t.randomLoop?.enabled || !t.randomLoop?.config) {
      return { loopStart: t.loopStart ?? 0, loopEnd: t.loopEnd ?? 0 };
    }
    const cfg = t.randomLoop.config;
    const rng = t.randomLoop.rng || Math.random;
    const bufDur = t.players?.a?.buffer?.duration || 10;
    
    // Pick random start within range, clamped to buffer
    const startMin = clamp(cfg.startMin, 0, bufDur);
    const startMax = clamp(cfg.startMax, startMin, bufDur);
    const loopStart = pickRandom(rng, startMin, startMax);
    
    // Pick random length, ensure it's at least 2x crossfade and fits in buffer
    const minLen = Math.max(cfg.lengthMin, this.loopCrossfade * 2 + 0.1);
    const maxLen = Math.min(cfg.lengthMax, bufDur - loopStart);
    const loopLen = Math.max(minLen, pickRandom(rng, minLen, Math.max(minLen, maxLen)));
    const loopEnd = Math.min(bufDur, loopStart + loopLen);
    
    return { loopStart, loopEnd };
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

  // Generate loop params (random if enabled, otherwise use fixed)
  const getLoopParams = () => {
    if (t.randomLoop?.enabled && t.randomLoop?.config) {
      return this._generateRandomLoopParams(t);
    }
    return {
      loopStart: t.loopStart ?? 0,
      loopEnd: t.loopEnd ?? (a.buffer?.duration || 0),
    };
  };

  const initialParams = getLoopParams();
  let start = initialParams.loopStart;
  let loopDur = Math.max(0.05, initialParams.loopEnd - start);
  let cross = Math.max(0, Number(this.loopCrossfade) || 0);
  if (cross > loopDur / 2) cross = loopDur / 2 - 0.005;

  // ensure fades are in place
  if (typeof a.fadeIn === 'number') a.fadeIn = cross;
  if (typeof a.fadeOut === 'number') a.fadeOut = cross;
  if (typeof b.fadeIn === 'number') b.fadeIn = cross;
  if (typeof b.fadeOut === 'number') b.fadeOut = cross;

  const base = Tone.now() + 0.05;
  // initial events
  try {
    a.start(base, start); a.stop(base + loopDur);
    const bParams = getLoopParams();
    const bLoopStart = bParams.loopStart;
    const bLoopDur = Math.max(0.05, bParams.loopEnd - bLoopStart);
    const bStart = base + (loopDur - cross);
    b.start(bStart, bLoopStart); b.stop(bStart + bLoopDur);
  } catch {}

  // Calculate period based on initial loop
  const period = Math.max(loopDur, 2 * (loopDur - cross));

  // schedule subsequent events with independent timers (regenerate random params each cycle)
  const scheduleA = (at) => {
    const delayMs = Math.max(0, (at - Tone.now() - 0.01) * 1000);
    t.scheduler.a = setTimeout(() => {
      const params = getLoopParams();
      const ls = params.loopStart;
      const ld = Math.max(0.05, params.loopEnd - ls);
      try { a.start(at, ls); a.stop(at + ld); } catch {}
      const nextPeriod = Math.max(ld, 2 * (ld - cross));
      scheduleA(at + nextPeriod);
    }, delayMs);
  };
  const scheduleB = (at) => {
    const delayMs = Math.max(0, (at - Tone.now() - 0.01) * 1000);
    t.scheduler.b = setTimeout(() => {
      const params = getLoopParams();
      const ls = params.loopStart;
      const ld = Math.max(0.05, params.loopEnd - ls);
      try { b.start(at, ls); b.stop(at + ld); } catch {}
      const nextPeriod = Math.max(ld, 2 * (ld - cross));
      scheduleB(at + nextPeriod);
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
