// ui-handler.js
// MVP skeleton to bind UI controls and forward events to callbacks.

export class UIHandler {
  constructor(selectorsOrElements) {
    this.playBtn = this._resolve(selectorsOrElements.playButton);
    this.pauseBtn = this._resolve(selectorsOrElements.pauseButton);
    this.stopBtn = this._resolve(selectorsOrElements.stopButton);
    this.masterSlider = this._resolve(selectorsOrElements.masterVolumeSlider);
    this.masterValue = this._resolve(selectorsOrElements.masterVolumeValue);
    this.tracksContainer = this._resolve(selectorsOrElements.trackControlsContainer);
    this.dropZone = this._resolve(selectorsOrElements.dropZone);
    // New controls
    this.waveformToggle = this._resolve(selectorsOrElements.waveformModeToggle);
    this.crossfadeSlider = this._resolve(selectorsOrElements.crossfadeMsSlider);
    this.crossfadeValue = this._resolve(selectorsOrElements.crossfadeMsValue);

    this._playHandlers = [];
    this._pauseHandlers = [];
    this._stopHandlers = [];
    this._masterVolumeHandlers = [];
    this._trackVolumeHandlers = [];
    this._dropHandlers = [];
    this._waveformModeHandlers = [];
    this._crossfadeHandlers = [];

    this._bindBaseEvents();
    this._bindDropEvents();
  }

  _resolve(selOrEl) {
    if (!selOrEl) return null;
    if (typeof selOrEl === 'string') return document.querySelector(selOrEl);
    return selOrEl;
  }

  _bindBaseEvents() {
    if (this.playBtn) this.playBtn.addEventListener('click', () => this._playHandlers.forEach((h) => h()));
    if (this.pauseBtn) this.pauseBtn.addEventListener('click', () => this._pauseHandlers.forEach((h) => h()));
    if (this.stopBtn) this.stopBtn.addEventListener('click', () => this._stopHandlers.forEach((h) => h()));

    if (this.masterSlider) {
      const update = () => {
        const value = Number(this.masterSlider.value);
        if (this.masterValue) this.masterValue.textContent = value.toFixed(2);
        this._masterVolumeHandlers.forEach((h) => h(value));
      };
      this.masterSlider.addEventListener('input', update);
      update(); // init display
    }

    if (this.waveformToggle) {
      const updateWaveMode = () => {
        const on = !!this.waveformToggle.checked;
        this._waveformModeHandlers.forEach((h) => h(on));
      };
      this.waveformToggle.addEventListener('change', updateWaveMode);
      updateWaveMode();
    }

    if (this.crossfadeSlider) {
      const updateXf = () => {
        const ms = Number(this.crossfadeSlider.value);
        if (this.crossfadeValue) this.crossfadeValue.textContent = String(ms);
        this._crossfadeHandlers.forEach((h) => h(ms));
      };
      this.crossfadeSlider.addEventListener('input', updateXf);
      updateXf();
    }
  }

  _bindDropEvents() {
    if (!this.dropZone) return;

    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    const highlight = () => this.dropZone.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-500/10');
    const unhighlight = () => this.dropZone.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-500/10');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => {
      this.dropZone.addEventListener(ev, prevent, false);
    });

    this.dropZone.addEventListener('dragenter', highlight, false);
    this.dropZone.addEventListener('dragover', highlight, false);
    this.dropZone.addEventListener('dragleave', unhighlight, false);
    this.dropZone.addEventListener('drop', (e) => {
      unhighlight();
      const dt = e.dataTransfer;
      const files = Array.from(dt?.files || []);
      if (!files.length) return;
      this._dropHandlers.forEach((h) => h(files));
    }, false);
  }

  onPlayAll(handler) { this._playHandlers.push(handler); }
  onPauseAll(handler) { this._pauseHandlers.push(handler); }
  onStopAll(handler) { this._stopHandlers.push(handler); }
  onMasterVolumeChange(handler) { this._masterVolumeHandlers.push(handler); }
  onTrackVolumeChange(handler) { this._trackVolumeHandlers.push(handler); }
  onFilesDropped(handler) { this._dropHandlers.push(handler); }
  onWaveformModeChange(handler) { this._waveformModeHandlers.push(handler); }
  onCrossfadeChange(handler) { this._crossfadeHandlers.push(handler); }

  ensureTrackSlider(trackId, label = trackId) {
    if (!this.tracksContainer || !trackId) return;
    const existing = this.tracksContainer.querySelector(`[data-track-id="${trackId}"]`);
    if (existing) return existing;

    const row = document.createElement('div');
    row.className = 'space-y-2';
    row.dataset.trackId = trackId;

    const name = document.createElement('span');
    name.className = 'w-28 text-sm text-gray-300';
    name.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '1';
    slider.className = 'w-64';

    const out = document.createElement('output');
    out.className = 'text-xs text-gray-400';
    out.textContent = '1.00';

    // Canvas for static overview waveform
    const canvasStatic = document.createElement('canvas');
    canvasStatic.className = 'wave-static bg-black/30 rounded border border-gray-700 w-full h-10 block flex-1 min-w-[240px]';
    canvasStatic.width = 320;
    canvasStatic.height = 40;

    // Canvas for realtime waveform visualization
    const canvas = document.createElement('canvas');
    canvas.className = 'wave bg-black/40 rounded border border-gray-700 w-full h-12 block flex-1 min-w-[240px]';
    canvas.width = 320; // device pixels for crisp drawing (logical); actual will be set by renderer
    canvas.height = 48;

    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      out.textContent = value.toFixed(2);
      this._trackVolumeHandlers.forEach((h) => h(trackId, value));
    });

    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-3 flex-wrap';
    controls.appendChild(name);
    controls.appendChild(slider);
    controls.appendChild(out);

    row.appendChild(canvasStatic);
    row.appendChild(canvas);
    row.appendChild(controls);
    this.tracksContainer.appendChild(row);
    return row;
  }
}
