/**
 * app.js
 * Main application coordinator for Animatrix Studio.
 * Ties together canvas rendering, state, tools, timeline, generators, modals, and export/import.
 */

import { MatrixState } from './core/MatrixState.js?v=2.8';
import { LedCanvas } from './core/LedCanvas.js?v=2.7';
import { AnimationPlayer } from './core/AnimationPlayer.js?v=2.7';
import { DrawEngine } from './tools/DrawEngine.js?v=2.9';
import { Generators } from './tools/Generators.js?v=2.7';
import { JsonHandler } from './io/JsonHandler.js?v=2.7';
import { CppExporter } from './io/CppExporter.js?v=2.7';
import { EspUploader } from './io/EspUploader.js?v=2.7';
import { TimelineView } from './components/TimelineView.js?v=2.8';
import { PresetLibrary } from './presets/DefaultAnimations.js?v=2.7';
import { PresetThumbnails } from './ui/PresetThumbnails.js?v=3.0';
import { renderTextToBitmap3 } from './tools/MicroFont.js?v=2.7';

// Dynamic LED Phosphor / Theme Palette Management
export const THEME_PALETTES = {
  red: { led: '#ff1a00', glow: 'rgba(255, 26, 0, 0.45)', dim: '#3a0808', badge: '#ff4433' },
  green: { led: '#00e030', glow: 'rgba(0, 224, 48, 0.45)', dim: '#083a10', badge: '#00ff44' },
  blue: { led: '#0077ff', glow: 'rgba(0, 119, 255, 0.45)', dim: '#08183a', badge: '#3399ff' },
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
  const swatchFg = document.getElementById('swatchFg');
  const swatchBg = document.getElementById('swatchBg');
  const swatchSwapBtn = document.getElementById('swatchSwapBtn');
  const swatchResetBtn = document.getElementById('swatchResetBtn');

  // PWM Brightness Modal Elements
  const pwmModal = document.getElementById('pwmModal');
  const pwmModalTitle = document.getElementById('pwmModalTitle');
  const pwmTabFg = document.getElementById('pwmTabFg');
  const pwmTabBg = document.getElementById('pwmTabBg');
  const pwmTabFgSwatch = document.getElementById('pwmTabFgSwatch');
  const pwmTabBgSwatch = document.getElementById('pwmTabBgSwatch');
  const pwmLedBead = document.getElementById('pwmLedBead');
  const pwmTargetName = document.getElementById('pwmTargetName');
  const pwmPercentBadge = document.getElementById('pwmPercentBadge');
  const pwmValueBadge = document.getElementById('pwmValueBadge');
  const pwmNumberInput = document.getElementById('pwmNumberInput');
  const pwmSlider = document.getElementById('pwmSlider');
  const pwmPresetTiles = document.querySelectorAll('.pwm-preset-tile');
  const pwmModalSwapBtn = document.getElementById('pwmModalSwapBtn');
  const pwmModalResetBtn = document.getElementById('pwmModalResetBtn');
  const pwmModalDoneBtn = document.getElementById('pwmModalDoneBtn');

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

  // 4b. Welcome Onboarding Modal ("Welcome to the world of tomorrow!")
  const welcomeModal = document.getElementById('welcomeModal');
  const welcomeBlankBtn = document.getElementById('welcomeBlankBtn');
  const welcomeRandomBtn = document.getElementById('welcomeRandomBtn');
  const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');

  function closeWelcomeModal() {
    if (welcomeModal) welcomeModal.classList.remove('active');
  }

  function startBlankAnimation() {
    matrixState.frames = [{
      id: matrixState._generateId(),
      durationMs: matrixState.defaultDurationMs,
      data: matrixState.createBuffer()
    }];
    matrixState.activeFrameIndex = 0;
    matrixState.name = 'blank_sequence';
    matrixState.undoStack = [];
    matrixState.redoStack = [];
    matrixState.notify('frames_reloaded');
    timelineView.render();
    ledCanvas.render();
    updateStatusLabels();
    closeWelcomeModal();
  }

  function startRandomAnimation() {
    const randomChoices = [
      // 1. Robotic Eyes (Random expression & style)
      () => {
        const expressions = ['blink', 'wink_left', 'wink_right', 'squint', 'scan', 'shock'];
        const styles = ['block', 'slit', 'brackets'];
        const exp = expressions[Math.floor(Math.random() * expressions.length)];
        const sty = styles[Math.floor(Math.random() * styles.length)];
        const eyeW = Math.min(10, Math.max(4, Math.floor(matrixState.width * 0.25)));
        PresetLibrary.loadPreset('robot_eyes', matrixState, {
          expression: exp,
          style: sty,
          eyeWidth: eyeW,
          targetTotalFrames: 48
        });
        matrixState.name = `robot_${exp}`;
      },
      // 2. Audio Spectrum Equalizer
      () => {
        const styles = ['solid', 'peak_dots', 'waveform'];
        const bandsList = [8, 16, 20];
        const sty = styles[Math.floor(Math.random() * styles.length)];
        const bands = bandsList[Math.floor(Math.random() * bandsList.length)];
        PresetLibrary.loadPreset('equalizer', matrixState, {
          style: sty,
          bands: bands,
          numFrames: 48
        });
        matrixState.name = `eq_${sty}_${bands}band`;
      },
      // 3. Pulse / Heartbeat
      () => {
        const patterns = ['breathe', 'heartbeat', 'strobe', 'curtain'];
        const pat = patterns[Math.floor(Math.random() * patterns.length)];
        PresetLibrary.loadPreset('pulse', matrixState, {
          pattern: pat,
          numPulses: 2,
          framesPerCycle: 24
        });
        matrixState.name = `visor_pulse_${pat}`;
      },
      // 4. Daft Punk / Sci-Fi Track Marquee
      () => {
        const tracks = [
          'WORLD OF TOMORROW',
          'HUMAN AFTER ALL',
          'AROUND THE WORLD',
          'HARDER BETTER FASTER',
          'ROBOT ROCK',
          'TECHNO LOGIC',
          'ANIMATRIX',
          'DISCOVERY 2001'
        ];
        const text = tracks[Math.floor(Math.random() * tracks.length)];
        generators.generateMarquee(text, {
          fps: matrixState.globalFps,
          scrollDirection: 'left',
          tracking: 1,
          leadInBlankCols: 6,
          leadOutBlankCols: 10,
          brightness: 255,
          insertion: { mode: 'replace' }
        });
        matrixState.name = text.toLowerCase().replace(/\s+/g, '_');
      },
      // 5. High-Speed Bouncing Chevron Cylon (48 frames)
      () => {
        PresetLibrary.loadPreset('cylon', matrixState, {
          shape: 'fading_chevron',
          roundTrip: true,
          startDirection: Math.random() > 0.5 ? 'left_to_right' : 'right_to_left',
          repetitions: 2,
          framesPerPass: 12,
          beamWidth: 3,
          tailLength: 8,
          headBrightness: 255
        });
        matrixState.name = 'hyper_chevron_bounce';
      }
    ];

    const pick = randomChoices[Math.floor(Math.random() * randomChoices.length)];
    pick();
    timelineView.render();
    ledCanvas.render();
    updateStatusLabels();
    closeWelcomeModal();
  }

  if (welcomeBlankBtn) welcomeBlankBtn.addEventListener('click', startBlankAnimation);
  if (welcomeRandomBtn) welcomeRandomBtn.addEventListener('click', startRandomAnimation);
  if (welcomeCloseBtn) welcomeCloseBtn.addEventListener('click', closeWelcomeModal);
  if (welcomeModal) {
    welcomeModal.addEventListener('click', (e) => {
      if (e.target === welcomeModal) closeWelcomeModal();
    });
    // Greet user on arrival
    welcomeModal.classList.add('active');
  }

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

  // 6. Foreground / Background PWM Management
  let currentPwmTarget = 'fg'; // 'fg' | 'bg'

  function getActiveTheme() {
    const colorName = matrixState.color || ledCanvas.ledColor || 'red';
    return THEME_PALETTES[colorName] || THEME_PALETTES.red;
  }

  function updateSwatchDisplay() {
    const theme = getActiveTheme();
    const fg = drawEngine.fgBrightness;
    const bg = drawEngine.bgBrightness;

    if (swatchFg) {
      swatchFg.title = `Foreground PWM: ${fg} (Click to edit)`;
      const fgRatio = fg / 255;
      if (fg === 0) {
        swatchFg.style.backgroundColor = '#0d0d14';
        swatchFg.style.boxShadow = 'none';
        swatchFg.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      } else {
        swatchFg.style.backgroundColor = theme.led;
        swatchFg.style.opacity = Math.max(0.4, 0.2 + fgRatio * 0.8);
        swatchFg.style.boxShadow = `0 0 ${Math.round(fgRatio * 12)}px ${theme.glow}`;
        swatchFg.style.borderColor = fgRatio > 0.5 ? '#ffffff' : theme.badge;
      }
    }

    if (swatchBg) {
      swatchBg.title = `Background PWM: ${bg} (Click to edit)`;
      const bgRatio = bg / 255;
      if (bg === 0) {
        swatchBg.style.backgroundColor = '#0d0d14';
        swatchBg.style.boxShadow = 'none';
        swatchBg.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      } else {
        swatchBg.style.backgroundColor = theme.led;
        swatchBg.style.opacity = Math.max(0.4, 0.2 + bgRatio * 0.8);
        swatchBg.style.boxShadow = `0 0 ${Math.round(bgRatio * 10)}px ${theme.glow}`;
        swatchBg.style.borderColor = bgRatio > 0.5 ? '#ffffff' : theme.badge;
      }
    }

    if (pwmTabFgSwatch) {
      pwmTabFgSwatch.style.backgroundColor = fg > 0 ? theme.led : '#0d0d14';
      pwmTabFgSwatch.style.opacity = Math.max(0.2, fg / 255);
    }
    if (pwmTabBgSwatch) {
      pwmTabBgSwatch.style.backgroundColor = bg > 0 ? theme.led : '#0d0d14';
      pwmTabBgSwatch.style.opacity = Math.max(0.2, bg / 255);
    }

    // Synchronize fill colors in preset tiles with active LED theme
    document.querySelectorAll('.pwm-square-fill').forEach((fill) => {
      fill.style.backgroundColor = theme.led;
    });
  }

  function syncModalValues() {
    const val = currentPwmTarget === 'fg' ? drawEngine.fgBrightness : drawEngine.bgBrightness;
    const theme = getActiveTheme();
    const ratio = val / 255;
    const percent = Math.round(ratio * 100);

    if (pwmModalTitle) {
      pwmModalTitle.textContent = currentPwmTarget === 'fg' ? 'FOREGROUND PWM BRIGHTNESS' : 'BACKGROUND PWM BRIGHTNESS';
    }
    if (pwmTargetName) {
      pwmTargetName.textContent = currentPwmTarget === 'fg' ? 'Foreground PWM Intensity' : 'Background PWM Intensity';
    }
    if (pwmPercentBadge) pwmPercentBadge.textContent = `${percent}%`;
    if (pwmValueBadge) pwmValueBadge.textContent = `${val} / 255 PWM`;

    if (pwmTabFg) pwmTabFg.classList.toggle('active', currentPwmTarget === 'fg');
    if (pwmTabBg) pwmTabBg.classList.toggle('active', currentPwmTarget === 'bg');

    if (pwmSlider) pwmSlider.value = val;
    if (pwmNumberInput) pwmNumberInput.value = val;

    // LED Bead Preview
    if (pwmLedBead) {
      const core = pwmLedBead.querySelector('.pwm-bead-core');
      if (core) {
        core.style.backgroundColor = theme.led;
        core.style.opacity = Math.max(0.04, ratio);
        core.style.transform = `scale(${0.5 + ratio * 0.5})`;
        core.style.boxShadow = val > 0 ? `0 0 ${Math.round(ratio * 20)}px ${theme.glow}` : 'none';
      }
      pwmLedBead.style.boxShadow = val > 0
        ? `0 0 ${Math.round(ratio * 25)}px ${theme.glow}, inset 0 0 10px ${theme.dim}`
        : 'inset 0 2px 4px rgba(0, 0, 0, 0.8)';
    }

    // Active state on matching preset tile
    pwmPresetTiles.forEach((tile) => {
      tile.classList.toggle('active', parseInt(tile.dataset.pwm, 10) === val);
    });
  }

  function setPwmForCurrentTarget(rawVal) {
    const num = Math.max(0, Math.min(255, Math.round(parseInt(rawVal, 10) || 0)));
    if (currentPwmTarget === 'fg') {
      drawEngine.setFgBrightness(num);
    } else {
      drawEngine.setBgBrightness(num);
    }
    updateSwatchDisplay();
    syncModalValues();
  }

  function openPwmModal(target = 'fg') {
    currentPwmTarget = target;
    if (pwmModal) {
      pwmModal.classList.add('active');
      syncModalValues();
    }
  }

  function closePwmModal() {
    if (pwmModal) pwmModal.classList.remove('active');
  }

  // Bind Swatch Widget Actions
  if (swatchFg) swatchFg.addEventListener('click', () => openPwmModal('fg'));
  if (swatchBg) swatchBg.addEventListener('click', () => openPwmModal('bg'));

  if (swatchSwapBtn) {
    swatchSwapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawEngine.swapFgBg();
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
    });
  }

  if (swatchResetBtn) {
    swatchResetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawEngine.resetFgBg();
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
    });
  }

  // Bind PWM Modal Tabs and Inputs
  if (pwmTabFg) pwmTabFg.addEventListener('click', () => { currentPwmTarget = 'fg'; syncModalValues(); });
  if (pwmTabBg) pwmTabBg.addEventListener('click', () => { currentPwmTarget = 'bg'; syncModalValues(); });

  if (pwmSlider) pwmSlider.addEventListener('input', (e) => setPwmForCurrentTarget(e.target.value));
  if (pwmNumberInput) pwmNumberInput.addEventListener('input', (e) => setPwmForCurrentTarget(e.target.value));

  pwmPresetTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      setPwmForCurrentTarget(tile.dataset.pwm);
    });
  });

  if (pwmModalSwapBtn) {
    pwmModalSwapBtn.addEventListener('click', () => {
      drawEngine.swapFgBg();
      updateSwatchDisplay();
      syncModalValues();
    });
  }

  if (pwmModalResetBtn) {
    pwmModalResetBtn.addEventListener('click', () => {
      drawEngine.resetFgBg();
      updateSwatchDisplay();
      syncModalValues();
    });
  }

  if (pwmModalDoneBtn) pwmModalDoneBtn.addEventListener('click', closePwmModal);
  if (pwmModal) {
    const modalCloseBtn = pwmModal.querySelector('.modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePwmModal);
    pwmModal.addEventListener('click', (e) => {
      if (e.target === pwmModal) closePwmModal();
    });
  }

  drawEngine.onEyedropperPick = (pickedBrightness) => {
    setPwmForCurrentTarget(pickedBrightness);
  };

  // Initial Swatch Visuals
  updateSwatchDisplay();

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

  const barAddFrameBtn = document.getElementById('barAddFrameBtn');
  if (barAddFrameBtn) {
    barAddFrameBtn.addEventListener('click', () => {
      matrixState.pushUndo();
      matrixState.addFrame(matrixState.activeFrameIndex + 1, false);
    });
  }

  const barDupFrameBtn = document.getElementById('barDupFrameBtn');
  if (barDupFrameBtn) {
    barDupFrameBtn.addEventListener('click', () => {
      matrixState.pushUndo();
      matrixState.duplicateFrame(matrixState.activeFrameIndex);
    });
  }

  const barInvertAllBtn = document.getElementById('barInvertAllBtn');
  if (barInvertAllBtn) {
    barInvertAllBtn.addEventListener('click', () => {
      matrixState.invertAllFrames();
    });
  }

  const barReverseAllBtn = document.getElementById('barReverseAllBtn');
  if (barReverseAllBtn) {
    barReverseAllBtn.addEventListener('click', () => {
      matrixState.reverseFrames();
    });
  }

  const barClearAllBtn = document.getElementById('barClearAllBtn');
  if (barClearAllBtn) {
    barClearAllBtn.addEventListener('click', () => {
      const hasContent = matrixState.frames.length > 1 || matrixState.frames[0].data.some(b => b > 0);
      if (hasContent) {
        if (!confirm('Clear entire animation and start with a blank slate?')) {
          return;
        }
      }
      animationPlayer.stop();
      matrixState.clearAnimation();
    });
  }

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
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
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
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
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

    const open = () => {
      modal.classList.add('active');
      if (modalId === 'presetModal') {
        PresetThumbnails.start();
      }
    };
    const close = () => {
      modal.classList.remove('active');
      if (modalId === 'presetModal') {
        PresetThumbnails.stop();
      }
    };

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

  // Initialize live preset thumbnail preview canvases
  PresetThumbnails.init();

  if (openPresetModalBtn) {
    openPresetModalBtn.addEventListener('click', () => {
      updateEyeControls();
      const modeRadio = document.querySelector('input[name="presetInsertMode"]:checked');
      if (modeRadio && modeRadio.value === 'overlay') {
        updateOverlaySyncUI();
      } else {
        setInputLockState(false);
      }
    });
  }

  // Dynamic input locking for overlay mode
  function setInputLockState(isLocked) {
    // 1. Cylon
    const cylonGroup = document.getElementById('cylonFramesGroup');
    const cylonInput = document.getElementById('cylonFramesInput');
    const cylonHelp = document.getElementById('cylonFramesHelp');
    if (cylonGroup && cylonInput) {
      cylonInput.disabled = isLocked;
      cylonGroup.classList.toggle('input-locked', isLocked);
      if (cylonHelp) {
        cylonHelp.textContent = isLocked
          ? '🔒 Locked to timeline sync (adjust speed using Harmonic Speed Division above).'
          : 'Fewer frames = faster speed (e.g. 12 frames runs 2× faster than 24 frames).';
      }
    }

    // 2. Robot Eyes
    const eyeGroup = document.getElementById('eyeFramesGroup');
    const eyeInput = document.getElementById('eyeFramesInput');
    const eyeHelp = document.getElementById('eyeFramesHelp');
    if (eyeGroup && eyeInput) {
      eyeInput.disabled = isLocked;
      eyeGroup.classList.toggle('input-locked', isLocked);
      if (eyeHelp) {
        eyeHelp.textContent = isLocked
          ? '🔒 Locked to timeline sync (adjust cycle using Harmonic Speed Division above).'
          : 'Total frames for hold + expression cycle.';
      }
    }

    // 3. Equalizer
    const eqGroup = document.getElementById('eqFramesGroup');
    const eqInput = document.getElementById('eqFramesInput');
    const eqHelp = document.getElementById('eqFramesHelp');
    if (eqGroup && eqInput) {
      eqInput.disabled = isLocked;
      eqGroup.classList.toggle('input-locked', isLocked);
      if (eqHelp) {
        eqHelp.textContent = isLocked
          ? '🔒 Locked to timeline duration sync.'
          : 'Set to 48 frames to match a 48-frame sweep or custom timeline loop.';
      }
    }

    // 4. Pulse
    const pulseGroup = document.getElementById('pulseFramesCycleGroup');
    const pulseInput = document.getElementById('pulseFramesCycleInput');
    const pulseHelp = document.getElementById('pulseFramesCycleHelp');
    if (pulseGroup && pulseInput) {
      pulseInput.disabled = isLocked;
      pulseGroup.classList.toggle('input-locked', isLocked);
      if (pulseHelp) {
        pulseHelp.textContent = isLocked
          ? '🔒 Locked to timeline sync.'
          : 'Controls speed. Fewer frames per cycle breathe faster.';
      }
    }

    // 5. Marquee Pause (if stop_at_center or pause_and_exit)
    const marqueePauseGroup = document.getElementById('marqueePauseGroup');
    const marqueePauseInput = document.getElementById('presetMarqueePauseInput');
    const marqueePauseHelp = document.getElementById('presetMarqueePauseHelp');
    if (marqueePauseGroup && marqueePauseInput) {
      marqueePauseInput.disabled = isLocked;
      marqueePauseGroup.classList.toggle('input-locked', isLocked);
      if (marqueePauseHelp) {
        marqueePauseHelp.textContent = isLocked
          ? '🔒 Locked to timeline sync (center hold conforms to active timeline loop).'
          : 'Number of frames to hold text stationary when it reaches the center position.';
      }
    }
  }

  // Harmonic Speed & Timeline Synchronization for Overlay Mode
  function updateOverlaySyncUI() {
    const timelineLenEl = document.getElementById('presetActiveTimelineLen');
    const syncLoopText = document.getElementById('presetSyncLoopText');
    const divisionSelect = document.getElementById('presetHarmonicDivisionSelect');

    const timelineFrames = matrixState.frames.length;
    if (timelineLenEl) timelineLenEl.textContent = timelineFrames;

    const division = parseInt(divisionSelect ? divisionSelect.value : '1', 10) || 1;
    const targetCycleFrames = Math.max(2, Math.floor(timelineFrames / division));

    if (syncLoopText) {
      if (division === 1) {
        syncLoopText.textContent = `✓ Seamless 1:1 Loop (${targetCycleFrames}f)`;
      } else {
        syncLoopText.textContent = `✓ Seamless ${division}× Loop (${targetCycleFrames}f / cycle)`;
      }
    }

    // Lock frame inputs because duration is governed by overlay timeline sync
    setInputLockState(true);

    // Auto-adjust generator inputs to conform to targetCycleFrames
    if (activePresetTab === 'cylon') {
      const roundTrip = document.getElementById('cylonRoundTripSelect')?.value === 'true';
      const passes = roundTrip ? 2 : 1;
      const cylonInput = document.getElementById('cylonFramesInput');
      if (cylonInput) {
        cylonInput.value = Math.max(2, Math.floor(targetCycleFrames / passes));
        const badge = document.getElementById('cylonFramesVal');
        if (badge) badge.textContent = `${cylonInput.value} frames`;
        updateCylonSummary();
      }
    } else if (activePresetTab === 'robot_eyes') {
      const eyeInput = document.getElementById('eyeFramesInput');
      if (eyeInput) {
        eyeInput.value = targetCycleFrames;
        const badge = document.getElementById('eyeFramesVal');
        if (badge) badge.textContent = `${eyeInput.value} frames`;
      }
    } else if (activePresetTab === 'equalizer') {
      const eqInput = document.getElementById('eqFramesInput');
      if (eqInput) {
        eqInput.value = targetCycleFrames;
        const badge = document.getElementById('eqFramesVal');
        if (badge) badge.textContent = `${eqInput.value} frames`;
        updateEqSummary();
      }
    } else if (activePresetTab === 'pulse') {
      const numPulses = parseInt(document.getElementById('pulseCountSelect')?.value, 10) || 2;
      const pulseInput = document.getElementById('pulseFramesCycleInput');
      if (pulseInput) {
        pulseInput.value = Math.max(2, Math.floor(targetCycleFrames / numPulses));
        const badge = document.getElementById('pulseFramesCycleVal');
        if (badge) badge.textContent = `${pulseInput.value} frames`;
        updatePulseSummary();
      }
    } else if (activePresetTab === 'marquee') {
      const motionMode = document.getElementById('presetMarqueeMotionSelect')?.value || 'stop_at_center';
      const dir = document.getElementById('presetMarqueeDirectionSelect')?.value || 'left';
      const speed = parseInt(document.getElementById('presetMarqueeSpeedInput')?.value, 10) || 1;
      const text = document.getElementById('presetMarqueeTextInput')?.value || 'ANIMATRIX';
      const tracking = parseInt(document.getElementById('presetMarqueeTrackingSelect')?.value, 10) || 1;
      const bitmap = renderTextToBitmap3(text, tracking);
      const textW = bitmap.width;
      const textH = bitmap.height;
      const matrixW = matrixState.width;
      const matrixH = matrixState.height;
      const centerX = Math.floor((matrixW - textW) / 2);
      const centerY = Math.max(0, Math.floor((matrixH - textH) / 2));

      let stepsIn = 0;
      if (dir === 'left') stepsIn = matrixW - centerX;
      else if (dir === 'right') stepsIn = centerX + textW;
      else if (dir === 'down') stepsIn = centerY + textH;
      else if (dir === 'up') stepsIn = matrixH - centerY;

      const pauseInput = document.getElementById('presetMarqueePauseInput');
      if (pauseInput && (motionMode === 'stop_at_center' || motionMode === 'pause_and_exit')) {
        const inDuration = Math.ceil(stepsIn / speed);
        pauseInput.value = Math.max(0, targetCycleFrames - inDuration);
        const badge = document.getElementById('presetMarqueePauseVal');
        if (badge) badge.textContent = `${pauseInput.value} frames`;
        updateMarqueeSummary();
      }
    }
  }

  const harmonicSelect = document.getElementById('presetHarmonicDivisionSelect');
  if (harmonicSelect) {
    harmonicSelect.addEventListener('change', updateOverlaySyncUI);
  }

  // Update Marquee Transition UI state based on timeline mixing mode
  function updateMarqueeTransitionUI(mode) {
    const transitionSelect = document.getElementById('presetMarqueeTransitionSelect');
    const transitionHelp = document.getElementById('presetMarqueeTransitionHelp');
    const transitionGroup = document.getElementById('marqueeTransitionGroup');
    if (!transitionSelect || !transitionHelp) return;

    const isAppend = (mode === 'append');
    transitionSelect.disabled = !isAppend;
    if (transitionGroup) {
      transitionGroup.classList.toggle('input-locked', !isAppend);
    }
    if (isAppend) {
      transitionHelp.textContent = 'Active: Seamlessly pushes or fades the last frame of your existing timeline as new text enters.';
    } else {
      transitionHelp.textContent = 'ℹ️ Only active when "Append to End" timeline mixing is selected.';
    }
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
        if (mode === 'overlay') {
          updateOverlaySyncUI();
        } else {
          setInputLockState(false);
        }
        updateMarqueeTransitionUI(mode);
      });
    });
  }

  setupModePills('preset', 'presetOverlayOptions');
  updateMarqueeTransitionUI('replace');

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
      const modeRadio = document.querySelector('input[name="presetInsertMode"]:checked');
      if (modeRadio && modeRadio.value === 'overlay') {
        updateOverlaySyncUI();
      } else {
        setInputLockState(false);
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
  bindSliderBadge('eyeFramesInput', 'eyeFramesVal', ' frames');
  bindSliderBadge('eqFramesInput', 'eqFramesVal', ' frames');
  bindSliderBadge('pulseFramesCycleInput', 'pulseFramesCycleVal', ' frames');
  bindSliderBadge('presetMarqueeSpeedInput', 'presetMarqueeSpeedVal', ' px/frame');
  bindSliderBadge('presetMarqueePauseInput', 'presetMarqueePauseVal', ' frames');

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

  function updateMarqueeSummary() {
    const text = document.getElementById('presetMarqueeTextInput')?.value || 'ANIMATRIX';
    const motionMode = document.getElementById('presetMarqueeMotionSelect')?.value || 'stop_at_center';
    const dir = document.getElementById('presetMarqueeDirectionSelect')?.value || 'left';
    const speed = parseInt(document.getElementById('presetMarqueeSpeedInput')?.value, 10) || 1;
    const pauseFrames = parseInt(document.getElementById('presetMarqueePauseInput')?.value, 10) || 0;
    const tracking = parseInt(document.getElementById('presetMarqueeTrackingSelect')?.value, 10) || 1;
    const badge = document.getElementById('marqueeTotalFramesBadge');
    const pauseGroup = document.getElementById('marqueePauseGroup');

    if (pauseGroup) {
      pauseGroup.style.display = (motionMode === 'scroll_through') ? 'none' : 'flex';
    }

    const bitmap = renderTextToBitmap3(text, tracking);
    const textW = bitmap.width;
    const textH = bitmap.height;
    const matrixW = matrixState.width;
    const matrixH = matrixState.height;
    const centerX = Math.floor((matrixW - textW) / 2);
    const centerY = Math.max(0, Math.floor((matrixH - textH) / 2));

    let stepsIn = 0;
    let stepsOut = 0;

    if (dir === 'left') {
      stepsIn = matrixW - centerX;
      stepsOut = centerX + textW;
    } else if (dir === 'right') {
      stepsIn = centerX + textW;
      stepsOut = matrixW - centerX;
    } else if (dir === 'down') {
      stepsIn = centerY + textH;
      stepsOut = matrixH - centerY;
    } else if (dir === 'up') {
      stepsIn = matrixH - centerY;
      stepsOut = centerY + textH;
    }

    let totalFrames = 0;
    let detail = '';
    const inFrames = Math.ceil(stepsIn / speed);
    const outFrames = Math.ceil(stepsOut / speed);

    if (motionMode === 'scroll_through') {
      totalFrames = Math.ceil((stepsIn + stepsOut) / speed);
      detail = `${totalFrames} frames (${speed} px/frame • continuous scroll)`;
    } else if (motionMode === 'stop_at_center') {
      totalFrames = inFrames + pauseFrames;
      detail = `${totalFrames} frames (${speed} px/frame • ${inFrames}f in + ${pauseFrames}f center hold)`;
    } else if (motionMode === 'pause_and_exit') {
      totalFrames = inFrames + pauseFrames + outFrames;
      detail = `${totalFrames} frames (${speed} px/frame • ${inFrames}f in + ${pauseFrames}f pause + ${outFrames}f out)`;
    }

    if (badge) badge.textContent = detail;
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

  ['presetMarqueeTextInput', 'presetMarqueeMotionSelect', 'presetMarqueeDirectionSelect', 'presetMarqueeSpeedInput', 'presetMarqueePauseInput', 'presetMarqueeTrackingSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateMarqueeSummary);
      el.addEventListener('change', updateMarqueeSummary);
    }
  });

  const eyeWidthInputEl = document.getElementById('eyeWidthInput');
  if (eyeWidthInputEl) {
    eyeWidthInputEl.addEventListener('input', updateEyeSummary);
    eyeWidthInputEl.addEventListener('change', updateEyeSummary);
  }

  // Run initial calculations
  updateCylonSummary();
  updatePulseSummary();
  updateEqSummary();
  updateMarqueeSummary();
  updateEyeControls();

  // Generate Preset Action
  document.getElementById('generatePresetBtn').onclick = () => {
    const modeRadio = document.querySelector('input[name="presetInsertMode"]:checked');
    const mode = modeRadio ? modeRadio.value : 'replace';
    const blendMode = document.getElementById('presetBlendModeSelect')?.value || 'add';
    const divisionSelect = document.getElementById('presetHarmonicDivisionSelect');
    const harmonicDivision = parseInt(divisionSelect ? divisionSelect.value : '1', 10) || 1;
    const insertionOptions = { mode, blendMode };

    let targetTotalFrames = null;
    if (mode === 'overlay' && matrixState.frames.length > 0) {
      targetTotalFrames = Math.max(2, Math.floor(matrixState.frames.length / harmonicDivision));
    }

    if (activePresetTab === 'cylon') {
      const shape = document.getElementById('cylonShapeSelect').value;
      const roundTrip = document.getElementById('cylonRoundTripSelect').value === 'true';
      const startDirection = document.getElementById('cylonDirectionSelect').value || 'left_to_right';
      const repetitions = parseInt(document.getElementById('cylonRepetitionsSelect').value, 10) || 1;
      const leftEndMode = document.getElementById('cylonLeftEndSelect').value;
      const rightEndMode = document.getElementById('cylonRightEndSelect').value;
      const beamWidth = parseInt(document.getElementById('cylonBeamWidthInput').value, 10) || 3;
      const tailLength = parseInt(document.getElementById('cylonTailLengthInput').value, 10) || 6;
      const framesPerPass = parseInt(document.getElementById('cylonFramesInput').value, 10) || 24;

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
        targetTotalFrames,
        headBrightness: drawEngine.brushBrightness
      }, insertionOptions);
    } else if (activePresetTab === 'robot_eyes') {
      const expression = document.getElementById('eyeExpressionSelect').value;
      const style = document.getElementById('eyeStyleSelect').value;
      const eyeWidth = parseInt(document.getElementById('eyeWidthInput').value, 10) || 10;
      const eyeFrames = parseInt(document.getElementById('eyeFramesInput')?.value, 10) || 48;

      PresetLibrary.loadPreset('robot_eyes', matrixState, {
        expression,
        style,
        eyeWidth,
        targetTotalFrames: targetTotalFrames || eyeFrames
      }, insertionOptions);
    } else if (activePresetTab === 'equalizer') {
      const style = document.getElementById('eqStyleSelect').value;
      const bands = parseInt(document.getElementById('eqBandsSelect').value, 10) || 16;
      const numFrames = parseInt(document.getElementById('eqFramesInput').value, 10) || 48;

      PresetLibrary.loadPreset('equalizer', matrixState, {
        style,
        bands,
        numFrames,
        targetTotalFrames
      }, insertionOptions);
    } else if (activePresetTab === 'pulse') {
      const pattern = document.getElementById('pulsePatternSelect').value;
      const numPulses = parseInt(document.getElementById('pulseCountSelect').value, 10) || 2;
      const framesPerCycle = parseInt(document.getElementById('pulseFramesCycleInput').value, 10) || 24;

      PresetLibrary.loadPreset('pulse', matrixState, {
        pattern,
        numPulses,
        framesPerCycle,
        targetTotalFrames
      }, insertionOptions);
    } else if (activePresetTab === 'marquee') {
      const text = document.getElementById('presetMarqueeTextInput')?.value || 'ANIMATRIX';
      const motionMode = document.getElementById('presetMarqueeMotionSelect')?.value || 'stop_at_center';
      const dir = document.getElementById('presetMarqueeDirectionSelect')?.value || 'left';
      const pixelsPerFrame = parseInt(document.getElementById('presetMarqueeSpeedInput')?.value, 10) || 1;
      const pauseFrames = parseInt(document.getElementById('presetMarqueePauseInput')?.value, 10) || 24;
      const tracking = parseInt(document.getElementById('presetMarqueeTrackingSelect')?.value, 10) || 1;
      const transition = document.getElementById('presetMarqueeTransitionSelect')?.value || 'push';

      generators.generateMarquee(text, {
        fps: matrixState.globalFps,
        motionMode,
        scrollDirection: dir,
        pixelsPerFrame,
        pauseFrames,
        tracking,
        transition,
        brightness: drawEngine.brushBrightness,
        targetTotalFrames,
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
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
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
  const downloadJsonBtn = document.getElementById('downloadJsonBtn');
  const copyJsonBtn = document.getElementById('copyJsonBtn');

  function refreshExportPreview() {
    const format = exportEncodingSelect.value;
    if (format === 'cpp_progmem') {
      exportJsonCode.value = cppExporter.generateHeaderCode();
      downloadJsonBtn.textContent = 'Download .h';
      copyJsonBtn.textContent = 'Copy C++';
    } else {
      const jsonStr = jsonHandler.exportToJsonString({ indent: true });
      exportJsonCode.value = jsonStr;
      downloadJsonBtn.textContent = 'Download .json';
      copyJsonBtn.textContent = 'Copy JSON';
    }
  }

  openExportModalBtn.addEventListener('click', refreshExportPreview);
  exportEncodingSelect.addEventListener('change', refreshExportPreview);

  downloadJsonBtn.onclick = () => {
    const format = exportEncodingSelect.value;
    if (format === 'cpp_progmem') {
      cppExporter.downloadHeader();
    } else {
      jsonHandler.downloadJson({ indent: true });
    }
  };

  copyJsonBtn.onclick = () => {
    const isCpp = exportEncodingSelect.value === 'cpp_progmem';
    navigator.clipboard.writeText(exportJsonCode.value).then(() => {
      alert((isCpp ? 'C++ header' : 'JSON') + ' copied to clipboard!');
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
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }

    if (e.key === 'Escape') {
      [presetModal, resizeModal, exportModal].forEach(m => m && m.close && m.close());
      return;
    }

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
    } else if (e.key === 'x' || e.key === 'X') {
      drawEngine.swapFgBg();
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
    } else if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      matrixState.pushUndo();
      matrixState.duplicateFrame(matrixState.activeFrameIndex);
    } else if (e.key === 'd' || e.key === 'D') {
      drawEngine.resetFgBg();
      updateSwatchDisplay();
      if (pwmModal && pwmModal.classList.contains('active')) syncModalValues();
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
