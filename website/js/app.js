/**
 * app.js
 * Main application coordinator for Animatrix Studio.
 * Ties together canvas rendering, state, tools, timeline, generators, modals, and export/import.
 */

import { MatrixState } from './core/MatrixState.js?v=2.7';
import { LedCanvas } from './core/LedCanvas.js?v=2.7';
import { AnimationPlayer } from './core/AnimationPlayer.js?v=2.7';
import { DrawEngine } from './tools/DrawEngine.js?v=2.7';
import { Generators } from './tools/Generators.js?v=2.7';
import { JsonHandler } from './io/JsonHandler.js?v=2.7';
import { CppExporter } from './io/CppExporter.js?v=2.7';
import { EspUploader } from './io/EspUploader.js?v=2.7';
import { TimelineView } from './components/TimelineView.js?v=2.7';
import { PresetLibrary } from './presets/DefaultAnimations.js?v=2.7';

// Dynamic LED Phosphor / Theme Palette Management
export const THEME_PALETTES = {
  red:   { led: '#ff1a00', glow: 'rgba(255, 26, 0, 0.45)', dim: '#3a0808', badge: '#ff4433' },
  green: { led: '#00e030', glow: 'rgba(0, 224, 48, 0.45)', dim: '#083a10', badge: '#00ff44' },
  blue:  { led: '#0077ff', glow: 'rgba(0, 119, 255, 0.45)', dim: '#08183a', badge: '#3399ff' },
  amber: { led: '#ffaa00', glow: 'rgba(255, 170, 0, 0.45)', dim: '#3a2408', badge: '#ffbb22' },
  white: { led: '#e0ebff', glow: 'rgba(224, 235, 255, 0.45)', dim: '#202430', badge: '#ffffff' }
};

export function applyColorTheme(colorName) {
  const theme = THEME_PALETTES[colorName] || THEME_PALETTES.red;
  document.documentElement.style.setProperty('--led-red', theme.led);
  document.documentElement.style.setProperty('--led-glow', theme.glow);
  document.documentElement.style.setProperty('--led-dim', theme.dim);
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize State & Core Engines
  const matrixState = new MatrixState(40, 3);
  const canvasElement = document.getElementById('matrixCanvas');
  const ledCanvas = new LedCanvas(canvasElement, matrixState);
  const animationPlayer = new AnimationPlayer(matrixState);
  const drawEngine = new DrawEngine(matrixState, ledCanvas);
  const generators = new Generators(matrixState);
  const jsonHandler = new JsonHandler(matrixState);
  const cppExporter = new CppExporter(matrixState);
  const espUploader = new EspUploader(jsonHandler);

  // 2. Initialize Timeline View
  const timelineContainer = document.getElementById('timelineContainer');
  const timelineView = new TimelineView(timelineContainer, matrixState, animationPlayer);

  // 3. UI Elements
  const toolButtons = document.querySelectorAll('[data-tool]');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessVal = document.getElementById('brightnessVal');
  const brightnessPresets = document.querySelectorAll('[data-brightness]');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const prevFrameBtn = document.getElementById('prevFrameBtn');
  const nextFrameBtn = document.getElementById('nextFrameBtn');
  const fpsSlider = document.getElementById('fpsSlider');
  const fpsVal = document.getElementById('fpsVal');
  const loopModeSelect = document.getElementById('loopModeSelect');
  const currentFrameInfo = document.getElementById('currentFrameInfo');
  const matrixDimensionLabel = document.getElementById('matrixDimensionLabel');
  const coordDisplay = document.getElementById('coordDisplay');

  // Display toggles
  const toggleGlow = document.getElementById('toggleGlow');
  const toggleVisor = document.getElementById('toggleVisor');
  const toggleOnion = document.getElementById('toggleOnion');
  const toggleDivider = document.getElementById('toggleDivider');

  // Modals & Triggers
  const openPresetModalBtn = document.getElementById('openPresetModalBtn');
  const openResizeModalBtn = document.getElementById('openResizeModalBtn');
  const openExportModalBtn = document.getElementById('openExportModalBtn');
  const openEspModalBtn = document.getElementById('openEspModalBtn');

  // Animation Name Display & Rename Elements
  const hudAnimName = document.getElementById('hudAnimName');
  const renameAnimBtn = document.getElementById('renameAnimBtn');
  const hudColorBadge = document.getElementById('hudColorBadge');
  const hudResolutionBadge = document.getElementById('hudResolutionBadge');
  const ledColorSelect = document.getElementById('ledColorSelect');

  function promptRenameAnimation() {
    const newName = prompt('Enter animation sequence name:', matrixState.name);
    if (newName && newName.trim()) {
      matrixState.name = newName.trim();
      updateStatusLabels();
    }
  }

  if (hudAnimName) hudAnimName.addEventListener('click', promptRenameAnimation);
  if (renameAnimBtn) renameAnimBtn.addEventListener('click', promptRenameAnimation);

  // 4. Initial Setup & Default Animation
  PresetLibrary.loadPreset('cylon', matrixState);
  updateStatusLabels();

  // 5. Tool Selection
  function selectTool(toolName) {
    drawEngine.setTool(toolName);
    toolButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
  }

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  // Brightness Control
  function updateBrightness(val) {
    const num = Math.max(0, Math.min(255, parseInt(val, 10)));
    drawEngine.setBrightness(num);
    brightnessSlider.value = num;
    brightnessVal.textContent = num;
    brightnessPresets.forEach((p) => {
      p.classList.toggle('active', parseInt(p.dataset.brightness, 10) === num);
    });
  }

  brightnessSlider.addEventListener('input', (e) => updateBrightness(e.target.value));

  brightnessPresets.forEach((btn) => {
    btn.addEventListener('click', () => updateBrightness(btn.dataset.brightness));
  });

  drawEngine.onEyedropperPick = (pickedBrightness) => {
    updateBrightness(pickedBrightness);
  };

  // LED Size Controls (XS, S, M, L, XL)
  const ledSizeVal = document.getElementById('ledSizeVal');
  const sizePresets = document.querySelectorAll('[data-size-preset]');

  function updateLedSizeUI(size) {
    if (ledSizeVal) ledSizeVal.textContent = `${size}px`;
    sizePresets.forEach((p) => {
      p.classList.toggle('active', parseInt(p.dataset.sizePreset, 10) === size);
    });
  }

  // Initialize UI with current LedCanvas size
  updateLedSizeUI(ledCanvas.userLedSize);

  sizePresets.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.sizePreset, 10);
      ledCanvas.setLedSize(size);
      updateLedSizeUI(size);
    });
  });

  // 6. Playback Controls
  playPauseBtn.addEventListener('click', () => {
    animationPlayer.toggle();
  });

  stopBtn.addEventListener('click', () => {
    animationPlayer.stop();
  });

  prevFrameBtn.addEventListener('click', () => {
    animationPlayer.stepBackward();
  });

  nextFrameBtn.addEventListener('click', () => {
    animationPlayer.stepForward();
  });

  fpsSlider.addEventListener('input', (e) => {
    const fps = parseInt(e.target.value, 10);
    fpsVal.textContent = `${fps} FPS`;
    matrixState.setGlobalFps(fps, true);
  });

  loopModeSelect.addEventListener('change', (e) => {
    matrixState.loopMode = e.target.value;
  });

  animationPlayer.subscribe((event, data) => {
    if (event === 'play_state_change') {
      playPauseBtn.classList.toggle('is-playing', data.isPlaying);
      playPauseBtn.innerHTML = data.isPlaying
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>Pause</span>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Play</span>`;
    }
  });

  // Initial theme application
  applyColorTheme(matrixState.color || 'red');

  // 7. Matrix & Frame State Subscriptions
  matrixState.subscribe((event, data) => {
    ledCanvas.render();
    updateStatusLabels();
    if (event === 'global_fps_change') {
      fpsSlider.value = data.fps;
      fpsVal.textContent = `${data.fps} FPS`;
    }
    if (event === 'color_change') {
      applyColorTheme(data.color);
      ledCanvas.setLedColor(data.color);
      timelineView.updateAllThumbnails();
    }
  });

  ledCanvas.onHoverChange = (x, y) => {
    if (x >= 0 && y >= 0) {
      const b = matrixState.getPixel(x, y);
      coordDisplay.textContent = `Col: ${x + 1} | Row: ${y + 1} | PWM: ${b}`;
    } else {
      coordDisplay.textContent = 'Studio Ready';
    }
  };

  function updateStatusLabels() {
    const total = matrixState.frames.length;
    const current = matrixState.activeFrameIndex + 1;
    currentFrameInfo.textContent = `Frame ${current} of ${total}`;
    matrixDimensionLabel.textContent = `${matrixState.width} × ${matrixState.height} (${matrixState.totalPixels} LEDs)`;
    if (hudAnimName) hudAnimName.textContent = matrixState.name || 'untitled_animation';
    if (hudResolutionBadge) hudResolutionBadge.textContent = `${matrixState.width} × ${matrixState.height}`;
    const colorName = matrixState.color || ledCanvas.ledColor || 'red';
    if (hudColorBadge) {
      hudColorBadge.textContent = `${colorName.toUpperCase()} LED`;
      const theme = THEME_PALETTES[colorName] || THEME_PALETTES.red;
      hudColorBadge.style.color = theme.badge;
      hudColorBadge.style.borderColor = theme.led;
    }
    if (ledColorSelect && ledColorSelect.value !== colorName) {
      ledColorSelect.value = colorName;
    }
  }

  if (ledColorSelect) {
    ledColorSelect.addEventListener('change', (e) => {
      const col = e.target.value;
      matrixState.setColor(col);
      ledCanvas.setLedColor(col);
      timelineView.updateAllThumbnails();
      applyColorTheme(col);
      updateStatusLabels();
    });
  }

  // 8. Transform & Canvas Actions
  document.getElementById('nudgeLeftBtn').onclick = () => drawEngine.shift(-1, 0);
  document.getElementById('nudgeRightBtn').onclick = () => drawEngine.shift(1, 0);
  document.getElementById('nudgeUpBtn').onclick = () => drawEngine.shift(0, -1);
  document.getElementById('nudgeDownBtn').onclick = () => drawEngine.shift(0, 1);
  document.getElementById('flipHBtn').onclick = () => drawEngine.flipHorizontal();
  document.getElementById('flipVBtn').onclick = () => drawEngine.flipVertical();
  document.getElementById('invertBtn').onclick = () => drawEngine.invert();
  document.getElementById('clearFrameBtn').onclick = () => matrixState.clearFrame();
  document.getElementById('fillFrameBtn').onclick = () => matrixState.fillFrame(drawEngine.brushBrightness);
  document.getElementById('undoBtn').onclick = () => matrixState.undo();
  document.getElementById('redoBtn').onclick = () => matrixState.redo();

  // 9. Display Toggles
  toggleGlow.addEventListener('change', (e) => {
    ledCanvas.showGlow = e.target.checked;
    ledCanvas.render();
  });

  toggleVisor.addEventListener('change', (e) => {
    ledCanvas.showVisorFilter = e.target.checked;
    ledCanvas.render();
  });

  toggleOnion.addEventListener('change', (e) => {
    ledCanvas.onionSkinning = e.target.checked;
    ledCanvas.render();
  });

  toggleDivider.addEventListener('change', (e) => {
    ledCanvas.showCenterAxis = e.target.checked;
    ledCanvas.showCenterDivider = e.target.checked;
    ledCanvas.render();
  });

  // 10. Modals Management
  function setupModal(modalId, openBtn) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const closeBtn = modal.querySelector('.modal-close-btn');

    const open = () => modal.classList.add('active');
    const close = () => modal.classList.remove('active');

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    return { open, close };
  }

  const presetModal = setupModal('presetModal', openPresetModalBtn);
  const resizeModal = setupModal('resizeModal', openResizeModalBtn);
  const exportModal = setupModal('exportModal', openExportModalBtn);
  if (openEspModalBtn) setupModal('espModal', openEspModalBtn);

  if (openPresetModalBtn) {
    openPresetModalBtn.addEventListener('click', () => updateEyeControls());
  }

  // Mode pill selections for Preset
  function setupModePills(groupName, overlayOptionsId) {
    const pills = document.querySelectorAll(`[data-pill-group="${groupName}"]`);
    const overlayOptions = document.getElementById(overlayOptionsId);

    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const radio = pill.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        const mode = pill.dataset.mode;
        if (overlayOptions) {
          overlayOptions.style.display = (mode === 'overlay') ? 'flex' : 'none';
        }
      });
    });
  }

  setupModePills('preset', 'presetOverlayOptions');

  // Parametric Preset Studio Management
  let activePresetTab = 'cylon';
  const presetTabBtns = document.querySelectorAll('[data-preset-tab]');
  const presetPanes = document.querySelectorAll('.preset-pane');

  presetTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activePresetTab = btn.dataset.presetTab;
      presetTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      presetPanes.forEach(p => p.classList.toggle('active', p.id === `pane-${activePresetTab}`));
      if (activePresetTab === 'robot_eyes') {
        updateEyeControls();
      }
    });
  });

  // Slider value badge synchronization
  function bindSliderBadge(sliderId, badgeId, suffix = '') {
    const slider = document.getElementById(sliderId);
    const badge = document.getElementById(badgeId);
    if (slider && badge) {
      slider.addEventListener('input', () => {
        badge.textContent = `${slider.value}${suffix}`;
      });
    }
  }

  bindSliderBadge('cylonBeamWidthInput', 'cylonWidthVal', ' px');
  bindSliderBadge('cylonTailLengthInput', 'cylonTailVal', ' px');
  bindSliderBadge('cylonFramesInput', 'cylonFramesVal', ' frames');
  bindSliderBadge('eyeWidthInput', 'eyeWidthVal', ' px');
  bindSliderBadge('eyeHoldInput', 'eyeHoldVal', ' ms');
  bindSliderBadge('eqFramesInput', 'eqFramesVal', ' frames');
  bindSliderBadge('pulseFramesCycleInput', 'pulseFramesCycleVal', ' frames');

  // Live calculation summaries for presets
  function updateCylonSummary() {
    const roundTrip = document.getElementById('cylonRoundTripSelect').value === 'true';
    const framesPerPass = parseInt(document.getElementById('cylonFramesInput').value, 10) || 40;
    const repetitions = parseInt(document.getElementById('cylonRepetitionsSelect').value, 10) || 1;
    const badge = document.getElementById('cylonTotalFramesBadge');
    if (!badge) return;

    if (roundTrip) {
      const totalFrames = (framesPerPass * 2) * repetitions;
      const speedMult = (40 / framesPerPass).toFixed(1).replace(/\.0$/, '');
      const speedText = speedMult !== '1' ? ` • ${speedMult}× speed` : '';
      badge.textContent = `${totalFrames} frames (${repetitions} bounce cycle${repetitions > 1 ? 's' : ''} × ${framesPerPass * 2} frames${speedText})`;
    } else {
      const totalFrames = framesPerPass * repetitions;
      const speedMult = (40 / framesPerPass).toFixed(1).replace(/\.0$/, '');
      const speedText = speedMult !== '1' ? ` • ${speedMult}× speed` : '';
      badge.textContent = `${totalFrames} frames (${repetitions} pass${repetitions > 1 ? 'es' : ''} × ${framesPerPass} frames${speedText})`;
    }
  }

  function updatePulseSummary() {
    const pattern = document.getElementById('pulsePatternSelect').value;
    const numPulses = parseInt(document.getElementById('pulseCountSelect').value, 10) || 2;
    const framesCycleGroup = document.getElementById('pulseFramesCycleGroup');
    const framesPerCycle = parseInt(document.getElementById('pulseFramesCycleInput').value, 10) || 20;
    const badge = document.getElementById('pulseTotalFramesBadge');
    if (!badge) return;

    if (framesCycleGroup) {
      framesCycleGroup.style.display = (pattern === 'breathe') ? 'flex' : 'none';
    }

    if (pattern === 'breathe') {
      const totalFrames = numPulses * framesPerCycle;
      badge.textContent = `${totalFrames} frames (${numPulses} cycles × ${framesPerCycle} frames)`;
    } else if (pattern === 'heartbeat') {
      badge.textContent = `${numPulses * 18} frames (${numPulses} heartbeat cycles)`;
    } else if (pattern === 'strobe') {
      badge.textContent = `${numPulses * 6} frames (${numPulses * 3} strobe flashes)`;
    } else if (pattern === 'curtain') {
      badge.textContent = `42 frames (center curtain open & close)`;
    }
  }

  function updateEqSummary() {
    const numFrames = parseInt(document.getElementById('eqFramesInput').value, 10) || 40;
    const badge = document.getElementById('eqTotalFramesBadge');
    if (badge) {
      badge.textContent = `${numFrames} frames`;
    }
  }

  function updateEyeSummary() {
    const w = matrixState.width;
    const eyeInput = document.getElementById('eyeWidthInput');
    const badge = document.getElementById('eyeLayoutBadge');
    if (!eyeInput || !badge) return;

    const maxEyeW = Math.max(1, Math.floor((w - 1) / 2));
    const eyeWidth = Math.max(1, Math.min(parseInt(eyeInput.value, 10) || 6, maxEyeW));

    const wHalf = Math.floor(w / 2);
    const outerMargin = Math.max(0, Math.floor((wHalf - eyeWidth) / 2));
    const leftEyeEnd = outerMargin + eyeWidth - 1;
    const rightEyeEnd = (w - 1) - outerMargin;
    const rightEyeStart = rightEyeEnd - eyeWidth + 1;
    const centerGap = Math.max(0, rightEyeStart - leftEyeEnd - 1);

    badge.textContent = `2 × ${eyeWidth}px eyes • ${centerGap}px center gap • ${outerMargin}px outer margins`;
  }

  function updateEyeControls(resetValue = false) {
    const eyeInput = document.getElementById('eyeWidthInput');
    const eyeVal = document.getElementById('eyeWidthVal');
    if (!eyeInput) return;

    const w = matrixState.width;
    const maxEyeW = Math.max(1, Math.floor((w - 1) / 2));
    const minEyeW = Math.min(2, maxEyeW);

    eyeInput.min = minEyeW;
    eyeInput.max = maxEyeW;

    let curVal = parseInt(eyeInput.value, 10);
    if (resetValue || isNaN(curVal) || curVal > maxEyeW || curVal < minEyeW) {
      let defaultW = Math.floor(w * 0.25);
      if (w === 16) defaultW = 6;
      else if (defaultW < minEyeW) defaultW = minEyeW;
      else if (defaultW > maxEyeW) defaultW = maxEyeW;
      eyeInput.value = defaultW;
    }

    if (eyeVal) {
      eyeVal.textContent = `${eyeInput.value} px`;
    }
    updateEyeSummary();
  }

  ['cylonRoundTripSelect', 'cylonFramesInput', 'cylonRepetitionsSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateCylonSummary);
      el.addEventListener('change', updateCylonSummary);
    }
  });

  ['pulsePatternSelect', 'pulseCountSelect', 'pulseFramesCycleInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updatePulseSummary);
      el.addEventListener('change', updatePulseSummary);
    }
  });

  const eqFramesInputEl = document.getElementById('eqFramesInput');
  if (eqFramesInputEl) {
    eqFramesInputEl.addEventListener('input', updateEqSummary);
  }

  const eyeWidthInputEl = document.getElementById('eyeWidthInput');
  if (eyeWidthInputEl) {
    eyeWidthInputEl.addEventListener('input', updateEyeSummary);
    eyeWidthInputEl.addEventListener('change', updateEyeSummary);
  }

  // Run initial calculations
  updateCylonSummary();
  updatePulseSummary();
  updateEqSummary();
  updateEyeControls();

  // Generate Preset Action
  document.getElementById('generatePresetBtn').onclick = () => {
    const modeRadio = document.querySelector('input[name="presetInsertMode"]:checked');
    const mode = modeRadio ? modeRadio.value : 'replace';
    const blendMode = document.getElementById('presetBlendModeSelect').value || 'add';
    const durationSync = document.getElementById('presetDurationSyncSelect').value || 'loop';
    const insertionOptions = { mode, blendMode, durationSync };

    if (activePresetTab === 'cylon') {
      const shape = document.getElementById('cylonShapeSelect').value;
      const roundTrip = document.getElementById('cylonRoundTripSelect').value === 'true';
      const startDirection = document.getElementById('cylonDirectionSelect').value || 'left_to_right';
      const repetitions = parseInt(document.getElementById('cylonRepetitionsSelect').value, 10) || 1;
      const leftEndMode = document.getElementById('cylonLeftEndSelect').value;
      const rightEndMode = document.getElementById('cylonRightEndSelect').value;
      const beamWidth = parseInt(document.getElementById('cylonBeamWidthInput').value, 10) || 3;
      const tailLength = parseInt(document.getElementById('cylonTailLengthInput').value, 10) || 6;
      const framesPerPass = parseInt(document.getElementById('cylonFramesInput').value, 10) || 40;

      PresetLibrary.loadPreset('cylon', matrixState, {
        shape,
        roundTrip,
        startDirection,
        repetitions,
        leftEndMode,
        rightEndMode,
        beamWidth,
        tailLength,
        framesPerPass,
        headBrightness: drawEngine.brushBrightness
      }, insertionOptions);
    } else if (activePresetTab === 'robot_eyes') {
      const expression = document.getElementById('eyeExpressionSelect').value;
      const style = document.getElementById('eyeStyleSelect').value;
      const eyeWidth = parseInt(document.getElementById('eyeWidthInput').value, 10) || 10;
      const holdDurationMs = parseInt(document.getElementById('eyeHoldInput').value, 10) || 1200;

      PresetLibrary.loadPreset('robot_eyes', matrixState, {
        expression,
        style,
        eyeWidth,
        holdDurationMs
      }, insertionOptions);
    } else if (activePresetTab === 'equalizer') {
      const style = document.getElementById('eqStyleSelect').value;
      const bands = parseInt(document.getElementById('eqBandsSelect').value, 10) || 16;
      const numFrames = parseInt(document.getElementById('eqFramesInput').value, 10) || 40;

      PresetLibrary.loadPreset('equalizer', matrixState, {
        style,
        bands,
        numFrames
      }, insertionOptions);
    } else if (activePresetTab === 'pulse') {
      const pattern = document.getElementById('pulsePatternSelect').value;
      const numPulses = parseInt(document.getElementById('pulseCountSelect').value, 10) || 2;
      const framesPerCycle = parseInt(document.getElementById('pulseFramesCycleInput').value, 10) || 20;

      PresetLibrary.loadPreset('pulse', matrixState, {
        pattern,
        numPulses,
        framesPerCycle
      }, insertionOptions);
    } else if (activePresetTab === 'marquee') {
      const text = document.getElementById('presetMarqueeTextInput')?.value || 'ANIMATRIX';
      const dir = document.getElementById('presetMarqueeDirectionSelect')?.value || 'left';
      const tracking = parseInt(document.getElementById('presetMarqueeTrackingSelect')?.value, 10) || 1;

      generators.generateMarquee(text, {
        fps: matrixState.globalFps,
        scrollDirection: dir,
        tracking: tracking,
        leadInBlankCols: 6,
        leadOutBlankCols: 10,
        brightness: drawEngine.brushBrightness,
        insertion: insertionOptions
      });
    }

    presetModal.close();
  };

  // Resize Matrix Submit
  document.getElementById('applyResizeBtn').onclick = () => {
    const w = parseInt(document.getElementById('matrixWidthInput').value, 10);
    const h = parseInt(document.getElementById('matrixHeightInput').value, 10);
    const color = ledColorSelect ? ledColorSelect.value : 'red';

    if (color) {
      matrixState.setColor(color);
      ledCanvas.setLedColor(color);
      timelineView.updateAllThumbnails();
      applyColorTheme(color);
    }

    if (w > 0 && h > 0) {
      matrixState.resize(w, h);
      ledCanvas.resizeCanvas();
      updateEyeControls(true);
    }
    updateStatusLabels();
    resizeModal.close();
  };

  // Export Modal Handlers
  const exportJsonCode = document.getElementById('exportJsonCode');
  const exportEncodingSelect = document.getElementById('exportEncodingSelect');

  function refreshExportPreview() {
    const encoding = exportEncodingSelect.value;
    const jsonStr = jsonHandler.exportToJsonString({ encoding, indent: true });
    exportJsonCode.value = jsonStr;
  }

  openExportModalBtn.addEventListener('click', refreshExportPreview);
  exportEncodingSelect.addEventListener('change', refreshExportPreview);

  document.getElementById('downloadJsonBtn').onclick = () => {
    jsonHandler.downloadJson({ encoding: exportEncodingSelect.value, indent: true });
  };

  document.getElementById('downloadCppBtn').onclick = () => {
    cppExporter.downloadHeader();
  };

  document.getElementById('copyJsonBtn').onclick = () => {
    navigator.clipboard.writeText(exportJsonCode.value).then(() => {
      alert('JSON copied to clipboard!');
    });
  };

  // Import JSON File
  const jsonFileInput = document.getElementById('jsonFileInput');
  jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = jsonHandler.importFromJson(event.target.result);
        alert(`Successfully imported "${result.name}" (${result.framesCount} frames, ${result.width}x${result.height})`);
        exportModal.close();
        ledCanvas.resizeCanvas();
        updateEyeControls(true);
      } catch (err) {
        alert(`Import error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    jsonFileInput.value = ''; // Reset
  });


  // ESP32 Direct Upload Handlers
  const espIpInput = document.getElementById('espIpInput');
  const espStatusMsg = document.getElementById('espStatusMsg');
  espIpInput.value = espUploader.targetIp;

  espIpInput.addEventListener('change', (e) => {
    espUploader.setTargetIp(e.target.value);
  });

  document.getElementById('testEspPingBtn').onclick = async () => {
    espStatusMsg.textContent = 'Pinging helmet ESP32...';
    espStatusMsg.className = 'status-badge pending';
    const res = await espUploader.ping();
    if (res.success) {
      espStatusMsg.textContent = 'ESP32 Connected & Online!';
      espStatusMsg.className = 'status-badge online';
    } else {
      espStatusMsg.textContent = `Offline: ${res.error}`;
      espStatusMsg.className = 'status-badge offline';
    }
  };

  document.getElementById('pushToHelmetBtn').onclick = async () => {
    espStatusMsg.textContent = 'Uploading animation sequence to helmet...';
    espStatusMsg.className = 'status-badge pending';
    const res = await espUploader.uploadAnimation();
    if (res.success) {
      espStatusMsg.textContent = 'Upload Successful! Playing on Visor.';
      espStatusMsg.className = 'status-badge online';
    } else {
      espStatusMsg.textContent = `Upload failed: ${res.error}`;
      espStatusMsg.className = 'status-badge offline';
    }
  };

  // 11. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ignore if inside an input or textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      animationPlayer.toggle();
    } else if (e.code === 'BracketLeft') {
      animationPlayer.stepBackward();
    } else if (e.code === 'BracketRight') {
      animationPlayer.stepForward();
    } else if (e.key === 'b' || e.key === 'B') {
      selectTool('pencil');
    } else if (e.key === 'e' || e.key === 'E') {
      selectTool('eraser');
    } else if (e.key === 'i' || e.key === 'I') {
      selectTool('eyedropper');
    } else if (e.key === 'g' || e.key === 'G') {
      selectTool('fill');
    } else if (e.key === 'l' || e.key === 'L') {
      selectTool('line');
    } else if (e.key === 'r' || e.key === 'R') {
      selectTool('rect');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        matrixState.redo();
      } else {
        matrixState.undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      matrixState.redo();
    } else if (e.shiftKey && e.code === 'ArrowLeft') {
      drawEngine.shift(-1, 0);
    } else if (e.shiftKey && e.code === 'ArrowRight') {
      drawEngine.shift(1, 0);
    } else if (e.shiftKey && e.code === 'ArrowUp') {
      drawEngine.shift(0, -1);
    } else if (e.shiftKey && e.code === 'ArrowDown') {
      drawEngine.shift(0, 1);
    } else if (e.key === '=' || e.key === '+') {
      const next = Math.min(52, (ledCanvas.pixelSize || ledCanvas.userLedSize) + 4);
      ledCanvas.setLedSize(next);
      updateLedSizeUI(next);
    } else if (e.key === '-' || e.key === '_') {
      const next = Math.max(10, (ledCanvas.pixelSize || ledCanvas.userLedSize) - 4);
      ledCanvas.setLedSize(next);
      updateLedSizeUI(next);
    }
  });

  // Window resize handler
  window.addEventListener('resize', () => {
    ledCanvas.resizeCanvas();
  });
});
