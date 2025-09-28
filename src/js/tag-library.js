// tag-library.js
// Tag-based track management for Ambi-GenPlayer (Issue #8: ML-01)

export class TagLibrary {
  constructor(initial = []) {
    // id -> { id, url, label, tags: Set<string> }
    this._tracks = new Map();
    if (Array.isArray(initial)) {
      for (const t of initial) this.addTrack(t);
    }
  }

  addTrack({ id, url, label = id, tags = [] }) {
    if (!id || !url) throw new Error('id and url are required');
    const entry = {
      id,
      url,
      label,
      tags: new Set((tags || []).map((x) => String(x).toLowerCase())),
    };
    this._tracks.set(id, entry);
    return entry;
  }

  addTags(id, tags) {
    const e = this._tracks.get(id);
    if (!e) throw new Error(`track not found: ${id}`);
    for (const t of tags || []) e.tags.add(String(t).toLowerCase());
    return e;
  }

  removeTag(id, tag) {
    const e = this._tracks.get(id);
    if (!e) throw new Error(`track not found: ${id}`);
    e.tags.delete(String(tag).toLowerCase());
    return e;
  }

  get(id) {
    return this._tracks.get(id) || null;
  }

  getAll() {
    return Array.from(this._tracks.values());
  }

  listTags() {
    const s = new Set();
    for (const e of this._tracks.values()) for (const t of e.tags) s.add(t);
    return Array.from(s).sort();
  }

  // mode: 'AND' | 'OR' (default: 'AND')
  findByTags(tags, mode = 'AND') {
    const q = Array.from(new Set((tags || []).map((x) => String(x).toLowerCase())));
    if (!q.length) return this.getAll();
    const andMode = String(mode).toUpperCase() !== 'OR';
    const res = [];
    for (const e of this._tracks.values()) {
      const has = q.map((t) => e.tags.has(t));
      const ok = andMode ? has.every(Boolean) : has.some(Boolean);
      if (ok) res.push(e);
    }
    return res;
  }
}

// Utilities to work with AudioEngine & UIHandler
export async function loadTracksByTags({ audioEngine, ui, library, tags = [], mode = 'AND', autoStart = false, reset = true }) {
  if (!audioEngine || !ui || !library) throw new Error('audioEngine, ui, library are required');
  const entries = library.findByTags(tags, mode);
  const toLoad = [];
  for (const e of entries) {
    // Skip if already registered in engine
    if (!audioEngine.tracks || !audioEngine.tracks.has(e.id)) {
      toLoad.push(e);
    }
    ui.ensureTrackSlider(e.id, e.label);
  }
  await Promise.all(toLoad.map((e) => audioEngine.loadTrack(e.url, e.id)));

  if (autoStart) {
    if (audioEngine.isPlaying) {
      // Start only newly added tracks to avoid resetting others
      for (const e of toLoad) await audioEngine.startTrack(e.id, { reset });
    } else {
      audioEngine.playAll();
    }
  }
  return { loaded: toLoad.length, total: entries.length };
}
