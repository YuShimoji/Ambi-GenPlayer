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
    this.randomToggle = this._resolve(selectorsOrElements.randomCrossfadeToggle);
    this.randomPanel = this._resolve(selectorsOrElements.randomCrossfadePanel);
    this.randomStartMin = this._resolve(selectorsOrElements.randomStartMin);
    this.randomStartMax = this._resolve(selectorsOrElements.randomStartMax);
    this.randomLengthMin = this._resolve(selectorsOrElements.randomLengthMin);
    this.randomLengthMax = this._resolve(selectorsOrElements.randomLengthMax);
    this.randomMode = this._resolve(selectorsOrElements.randomModeSelect);
    this.randomInterval = this._resolve(selectorsOrElements.randomIntervalInput);
    this.randomSeed = this._resolve(selectorsOrElements.randomSeedInput);

    this._playHandlers = [];
    this._pauseHandlers = [];
    this._stopHandlers = [];
    this._masterVolumeHandlers = [];
    this._trackVolumeHandlers = [];
    this._dropHandlers = [];
    this._waveformModeHandlers = [];
    this._crossfadeHandlers = [];
    this._randomToggleHandlers = [];
    this._randomConfigHandlers = [];

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
        if (this.masterValue) this.masterValue.textContent = Math.round(value * 100) + '%';
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
        if (this.crossfadeValue) this.crossfadeValue.textContent = ms + 'ms';
        this._crossfadeHandlers.forEach((h) => h(ms));
      };
      this.crossfadeSlider.addEventListener('input', updateXf);
      updateXf();
    }

    if (this.randomToggle) {
      const updateRandomToggle = () => {
        const enabled = !!this.randomToggle.checked;
        this._setRandomInputsDisabled(!enabled);
        this._randomToggleHandlers.forEach((h) => h(enabled));
        this._emitRandomConfig();
      };
      this.randomToggle.addEventListener('change', updateRandomToggle);
      updateRandomToggle();
    }

    const randomInputs = [
      this.randomStartMin,
      this.randomStartMax,
      this.randomLengthMin,
      this.randomLengthMax,
      this.randomMode,
      this.randomInterval,
      this.randomSeed,
    ].filter(Boolean);
    if (randomInputs.length) {
      const emit = () => this._emitRandomConfig();
      randomInputs.forEach((el) => el.addEventListener('input', emit));
    }
  }

  _bindDropEvents() {
    if (!this.dropZone) return;

    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    const highlight = () => this.dropZone.classList.add('drag-over');
    const unhighlight = () => this.dropZone.classList.remove('drag-over');

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
  onRandomCrossfadeToggle(handler) { this._randomToggleHandlers.push(handler); }
  onRandomCrossfadeConfigChange(handler) { this._randomConfigHandlers.push(handler); }

  getRandomCrossfadeConfig() {
    return {
      enabled: !!(this.randomToggle && this.randomToggle.checked),
      startMin: Number(this.randomStartMin?.value ?? 0) || 0,
      startMax: Number(this.randomStartMax?.value ?? 0) || 0,
      lengthMin: Number(this.randomLengthMin?.value ?? 0) || 0,
      lengthMax: Number(this.randomLengthMax?.value ?? 0) || 0,
      mode: this.randomMode?.value === 'interval' ? 'interval' : 'perLoop',
      intervalSeconds: Number(this.randomInterval?.value ?? 0) || 0,
      seed: this.randomSeed?.value !== '' && this.randomSeed?.value != null ? Number(this.randomSeed.value) : null,
    };
  }

  setRandomCrossfadeConfig(cfg) {
    if (!cfg) return;
    if (this.randomStartMin) this.randomStartMin.value = String(cfg.startMin ?? 0);
    if (this.randomStartMax) this.randomStartMax.value = String(cfg.startMax ?? 0);
    if (this.randomLengthMin) this.randomLengthMin.value = String(cfg.lengthMin ?? 0);
    if (this.randomLengthMax) this.randomLengthMax.value = String(cfg.lengthMax ?? 0);
    if (this.randomMode) this.randomMode.value = cfg.mode === 'interval' ? 'interval' : 'perLoop';
    if (this.randomInterval) this.randomInterval.value = String(cfg.intervalSeconds ?? 0);
    if (this.randomSeed) this.randomSeed.value = cfg.seed != null && cfg.seed !== '' ? String(cfg.seed) : '';
    this._emitRandomConfig();
  }

  setRandomCrossfadeEnabled(enabled) {
    if (this.randomToggle) {
      this.randomToggle.checked = !!enabled;
      this._setRandomInputsDisabled(!enabled);
    }
  }

  _emitRandomConfig() {
    if (!this._randomConfigHandlers.length) return;
    const cfg = this.getRandomCrossfadeConfig();
    this._randomConfigHandlers.forEach((h) => h(cfg));
  }

  _setRandomInputsDisabled(disabled) {
    const inputs = [
      this.randomStartMin,
      this.randomStartMax,
      this.randomLengthMin,
      this.randomLengthMax,
      this.randomMode,
      this.randomInterval,
      this.randomSeed,
    ];
    inputs.forEach((el) => {
      if (!el) return;
      if (disabled) {
        el.setAttribute('disabled', '');
      } else {
        el.removeAttribute('disabled');
      }
    });
    if (this.randomPanel) {
      if (disabled) {
        this.randomPanel.setAttribute('aria-disabled', 'true');
        this.randomPanel.classList.add('opacity-50');
      } else {
        this.randomPanel.removeAttribute('aria-disabled');
        this.randomPanel.classList.remove('opacity-50');
      }
    }
  }

  ensureTrackSlider(trackId, label = trackId) {
    if (!this.tracksContainer || !trackId) return;
    const existing = this.tracksContainer.querySelector(`[data-track-id="${trackId}"]`);
    if (existing) return existing;

    // Track Card Container
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.trackId = trackId;

    // Header: Icon + Info
    const header = document.createElement('div');
    header.className = 'track-card-header';

    const icon = document.createElement('div');
    icon.className = 'track-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>`;

    const info = document.createElement('div');
    info.className = 'track-info';

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = label;
    name.title = label;

    const meta = document.createElement('div');
    meta.className = 'track-meta';
    meta.textContent = 'Audio Track';

    info.appendChild(name);
    info.appendChild(meta);
    header.appendChild(icon);
    header.appendChild(info);

    // Waveform Container
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'track-waveform';

    // Canvas for static overview waveform
    const canvasStatic = document.createElement('canvas');
    canvasStatic.className = 'wave-static';
    canvasStatic.width = 320;
    canvasStatic.height = 48;

    // Canvas for realtime waveform visualization
    const canvas = document.createElement('canvas');
    canvas.className = 'wave';
    canvas.width = 320;
    canvas.height = 48;

    waveformContainer.appendChild(canvasStatic);
    waveformContainer.appendChild(canvas);

    // Volume Controls
    const volumeRow = document.createElement('div');
    volumeRow.className = 'track-volume-row';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '1';
    slider.className = 'track-volume-slider';

    const out = document.createElement('output');
    out.className = 'track-volume-value';
    out.textContent = '100%';

    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      out.textContent = Math.round(value * 100) + '%';
      this._trackVolumeHandlers.forEach((h) => h(trackId, value));
    });

    volumeRow.appendChild(slider);
    volumeRow.appendChild(out);

    // Assemble card
    card.appendChild(header);
    card.appendChild(waveformContainer);
    card.appendChild(volumeRow);
    this.tracksContainer.appendChild(card);
    return card;
  }
}
