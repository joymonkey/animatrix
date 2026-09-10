/**
 * Generators.js
 * Procedural animation generators for Daft Punk helmet visors.
 * Includes:
 * 1. Text Marquee Scroller (using MicroFont 3-row bitmap)
 * 2. Cylon / KITT Visor Scanner (customizable shapes & turnaround margins)
 * 3. Audio Spectrum Equalizer (solid, peak dots, waveforms)
 * 4. Robot Eye Expressions (Blink, Wink L/R, Squint, Scan, Shock)
 * 5. Breathing Visor Pulse & Strobe (Sine, Heartbeat, Curtain, Strobe)
 */

import { renderTextToBitmap3 } from './MicroFont.js';

export class Generators {
  constructor(matrixState) {
    this.state = matrixState;
  }

  /**
   * Generates a smooth scrolling text marquee across the matrix
   */
  generateMarquee(text = 'DAFT PUNK', options = {}) {
    const {
      fps = 24,
      scrollDirection = 'left', // 'left' or 'right'
      leadInBlankCols = this.state.width,
      leadOutBlankCols = this.state.width,
      brightness = 255,
      tracking = 1
    } = options;

    const bitmap = renderTextToBitmap3(text, tracking);
    const textWidth = bitmap.width;
    const textHeight = bitmap.height; // 3
    const matrixW = this.state.width;
    const matrixH = this.state.height;

    const startY = Math.max(0, Math.floor((matrixH - textHeight) / 2));
    const totalSteps = leadInBlankCols + textWidth + leadOutBlankCols;
    const frameDurationMs = Math.round(1000 / fps);
    const newFrames = [];

    for (let step = 0; step < totalSteps; step++) {
      const buffer = new Uint8Array(matrixW * matrixH);
      const textLeft = (scrollDirection === 'left') ? (matrixW - step) : (-textWidth + step);

      for (let r = 0; r < textHeight; r++) {
        const destY = startY + r;
        if (destY >= matrixH) continue;

        for (let c = 0; c < textWidth; c++) {
          const destX = textLeft + c;
          if (destX >= 0 && destX < matrixW) {
            if (bitmap.rows[r][c] === 1) {
              buffer[destY * matrixW + destX] = brightness;
            }
          }
        }
      }

      newFrames.push({
        id: 'gen_' + Math.random().toString(36).substring(2, 9),
        durationMs: frameDurationMs,
        data: buffer
      });
    }

    this._applyGeneratedFrames(newFrames, `marquee_${text.substring(0, 8).toLowerCase()}`, options.insertion);
  }

  /**
   * Generates a Cylon / KITT Visor Scanner with customizable shapes, turnaround points,
   * frame counts per sweep, and repetitions.
   * Shapes: 'fading_line', 'single_line', 'fading_chevron', 'chevron'
   * Endpoints: 'offscreen', 'edge', 'margin_2', 'margin_4', 'margin_8'
   */
  generateCylonScanner(options = {}) {
    const {
      shape = 'fading_line',            // 'single_line', 'chevron', 'fading_line', 'fading_chevron'
      leftEndMode = 'offscreen',        // 'offscreen', 'edge', 'margin_2', 'margin_4', 'margin_8'
      rightEndMode = 'offscreen',       // 'offscreen', 'edge', 'margin_2', 'margin_4', 'margin_8'
      beamWidth = 3,
      tailLength = 6,
      headBrightness = 255,
      framesPerPass = 40,               // Number of frames for a single pass
      repetitions = 1,                  // Number of cycles / sweeps
      roundTrip = true,                 // true = bounce back and forth; false = one-way
      startDirection = 'left_to_right'  // 'left_to_right' or 'right_to_left'
    } = options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = this.state.defaultDurationMs;
    const newFrames = [];

    const effectiveTail = (shape === 'fading_line' || shape === 'fading_chevron') ? tailLength : 0;
    const chevronOffset = (shape === 'chevron' || shape === 'fading_chevron') ? Math.max(1, Math.round((h - 1) / 2)) : 0;

    // Calculate left turnaround limit (minX)
    let minX;
    if (leftEndMode === 'offscreen') {
      minX = -(effectiveTail + beamWidth + chevronOffset + 2);
    } else if (leftEndMode === 'edge') {
      minX = 0;
    } else if (leftEndMode === 'margin_2') {
      minX = 2;
    } else if (leftEndMode === 'margin_4') {
      minX = 4;
    } else if (leftEndMode === 'margin_8') {
      minX = 8;
    } else {
      minX = typeof leftEndMode === 'number' ? leftEndMode : 0;
    }

    // Calculate right turnaround limit (maxX)
    let maxX;
    if (rightEndMode === 'offscreen') {
      maxX = w + effectiveTail + beamWidth + chevronOffset + 2;
    } else if (rightEndMode === 'edge') {
      maxX = w - 1;
    } else if (rightEndMode === 'margin_2') {
      maxX = w - 3;
    } else if (rightEndMode === 'margin_4') {
      maxX = w - 5;
    } else if (rightEndMode === 'margin_8') {
      maxX = w - 9;
    } else {
      maxX = typeof rightEndMode === 'number' ? rightEndMode : (w - 1);
    }

    // Ensure minX < maxX
    if (minX >= maxX) {
      minX = 0;
      maxX = w - 1;
    }

    // Assemble steps according to framesPerPass, repetitions, and startDirection
    const stepList = [];
    const count = Math.max(2, framesPerPass);

    for (let rep = 0; rep < repetitions; rep++) {
      if (roundTrip) {
        // Full round-trip cycle of (count * 2) frames with uniform spacing and zero duplicate turnarounds
        const totalCycle = count * 2;
        const dir1 = (startDirection === 'left_to_right') ? 1 : -1;
        const startX = (dir1 === 1) ? minX : maxX;
        const endX = (dir1 === 1) ? maxX : minX;

        for (let i = 0; i < totalCycle; i++) {
          let t, dir;
          if (i < count) {
            // Forward leg: t moves smoothly from 0 up towards 1
            t = i / count;
            dir = dir1;
          } else {
            // Return leg: t moves smoothly from 1 down towards 0
            t = (totalCycle - i) / count;
            dir = -dir1;
          }
          const headX = startX + (endX - startX) * t;
          stepList.push({ headX, dir });
        }
      } else {
        // One-way sweep: exactly count frames per pass
        const dir = (startDirection === 'left_to_right') ? 1 : -1;
        const startX = (dir === 1) ? minX : maxX;
        const endX = (dir === 1) ? maxX : minX;

        for (let s = 0; s < count; s++) {
          const t = s / (count - 1);
          const headX = startX + (endX - startX) * t;
          stepList.push({ headX, dir });
        }
      }
    }

    const midY = (h - 1) / 2;

    for (const step of stepList) {
      const buffer = new Uint8Array(w * h);
      const { headX, dir } = step;

      for (let y = 0; y < h; y++) {
        let rowCenterX = headX;
        if (shape === 'chevron' || shape === 'fading_chevron') {
          const rowOffset = Math.abs(y - midY) * 1.3;
          rowCenterX = headX - (dir * rowOffset);
        }

        for (let x = 0; x < w; x++) {
          const dist = Math.abs(x - rowCenterX);

          // 1. Core beam
          if (dist <= beamWidth / 2) {
            buffer[y * w + x] = headBrightness;
          }

          // 2. Fading tail trailing behind motion
          if (effectiveTail > 0) {
            const tailDelta = (rowCenterX - x) * dir;
            if (tailDelta > 0 && tailDelta <= effectiveTail) {
              const decay = Math.pow(1 - (tailDelta / effectiveTail), 2);
              const b = Math.round(headBrightness * decay * 0.75);
              buffer[y * w + x] = Math.max(buffer[y * w + x], b);
            }
          }
        }
      }

      newFrames.push({
        id: 'cylon_' + Math.random().toString(36).substring(2, 9),
        durationMs: frameDurationMs,
        data: buffer
      });
    }

    this._applyGeneratedFrames(newFrames, `cylon_${shape}_sweep`, options.insertion);
  }

  /**
   * Generates an Audio Spectrum / Equalizer simulation
   */
  generateEqualizer(options = {}) {
    const {
      style = 'solid',      // 'solid', 'peak_dots', 'waveform'
      bands = 16,           // 8, 16, 20, 40
      numFrames = 40
    } = options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = options.fps ? Math.round(1000 / options.fps) : this.state.defaultDurationMs;
    const newFrames = [];
    const colPerBand = Math.ceil(w / bands);

    // Track simulated peak dots per band
    const peakPositions = new Float32Array(bands);

    for (let f = 0; f < numFrames; f++) {
      const buffer = new Uint8Array(w * h);
      const t = f * 0.35;

      for (let b = 0; b < bands; b++) {
        // Pseudo-random audio height wave
        const rawHeight = (Math.sin(t + b * 0.85) * 0.45 + 0.5) * (Math.cos(t * 1.3 - b * 0.4) * 0.35 + 0.65);
        const level = rawHeight * h;

        // Update peak dot with gravity
        if (level > peakPositions[b]) {
          peakPositions[b] = level;
        } else {
          peakPositions[b] = Math.max(0, peakPositions[b] - 0.25);
        }

        for (let c = 0; c < colPerBand; c++) {
          const col = b * colPerBand + c;
          if (col >= w) continue;

          for (let y = 0; y < h; y++) {
            const rowFromBottom = (h - 1) - y;

            if (style === 'solid') {
              if (rowFromBottom < Math.floor(level)) {
                buffer[y * w + col] = 255;
              } else if (rowFromBottom < level) {
                const frac = level - Math.floor(level);
                buffer[y * w + col] = Math.round(255 * frac);
              }
            } else if (style === 'peak_dots') {
              // Bar + floating peak dot
              if (rowFromBottom < Math.floor(level)) {
                buffer[y * w + col] = 180;
              }
              const peakRow = Math.min(h - 1, Math.round(peakPositions[b]));
              if (rowFromBottom === peakRow) {
                buffer[y * w + col] = 255;
              }
            } else if (style === 'waveform') {
              // Symmetrical soundwave from middle row
              const midRow = (h - 1) / 2;
              const distFromMid = Math.abs(y - midRow);
              if (distFromMid <= level / 2) {
                buffer[y * w + col] = 255;
              }
            }
          }
        }
      }

      newFrames.push({
        id: 'eq_' + Math.random().toString(36).substring(2, 9),
        durationMs: frameDurationMs,
        data: buffer
      });
    }

    this._applyGeneratedFrames(newFrames, `equalizer_${style}`, options.insertion);
  }

  /**
   * Generates Robot Eye Expression sequences
   */
  generateRobotEyes(options = {}) {
    const {
      expression = 'blink',  // 'blink', 'wink_left', 'wink_right', 'squint', 'scan', 'shock'
      style = 'block',       // 'block', 'slit', 'brackets'
      eyeWidth = 10,
      holdDurationMs = 1200,
      fps = 24
    } = typeof options === 'string' ? { expression: options } : options;

    const w = this.state.width;
    const h = this.state.height;
    const newFrames = [];

    // Constrain eye width so two eyes fit with at least 1-2px center gap
    const maxEyeW = Math.max(1, Math.floor((w - 1) / 2));
    const actualEyeW = Math.max(1, Math.min(eyeWidth, maxEyeW));

    // Calculate left and right eye boundaries
    // Split matrix into left half (0..wHalf-1) and right half (w-wHalf..w-1)
    const wHalf = Math.floor(w / 2);
    const outerMargin = Math.max(0, Math.floor((wHalf - actualEyeW) / 2));

    const leftEyeStart = outerMargin;
    const leftEyeEnd = leftEyeStart + actualEyeW - 1;

    const rightEyeEnd = (w - 1) - outerMargin;
    const rightEyeStart = rightEyeEnd - actualEyeW + 1;

    // Adaptive midpoint for vertical eyelid dynamics
    const midY = Math.floor(h / 2);

    const makeEyeFrame = (eyeLState, eyeRState, eyeLOffset = 0, eyeROffset = 0) => {
      const buf = new Uint8Array(w * h);

      const drawEye = (xStart, xEnd, eyeState, offset) => {
        const left = xStart + offset;
        const right = xEnd + offset;

        for (let x = left; x <= right; x++) {
          if (x < 0 || x >= w) continue;

          for (let y = 0; y < h; y++) {
            if (eyeState === 'open') {
              if (style === 'brackets') {
                const isBorder = (x === left || x === right || y === 0 || y === h - 1);
                if (isBorder) buf[y * w + x] = 255;
              } else if (style === 'slit') {
                if (y === midY) buf[y * w + x] = 255;
              } else {
                buf[y * w + x] = 255; // solid block
              }
            } else if (eyeState === 'half') {
              if (y >= midY) buf[y * w + x] = 210;
            } else if (eyeState === 'slit') {
              if (y === midY) buf[y * w + x] = 255;
            } else if (eyeState === 'closed') {
              buf[y * w + x] = 0;
            }
          }
        }
      };

      drawEye(leftEyeStart, leftEyeEnd, eyeLState, eyeLOffset);
      drawEye(rightEyeStart, rightEyeEnd, eyeRState, eyeROffset);
      return buf;
    };

    if (expression === 'blink') {
      newFrames.push({ id: 'eye_open1', durationMs: holdDurationMs, data: makeEyeFrame('open', 'open') });
      newFrames.push({ id: 'eye_squint1', durationMs: 45, data: makeEyeFrame('half', 'half') });
      newFrames.push({ id: 'eye_slit1', durationMs: 35, data: makeEyeFrame('slit', 'slit') });
      newFrames.push({ id: 'eye_closed', durationMs: 70, data: makeEyeFrame('closed', 'closed') });
      newFrames.push({ id: 'eye_slit2', durationMs: 35, data: makeEyeFrame('slit', 'slit') });
      newFrames.push({ id: 'eye_squint2', durationMs: 45, data: makeEyeFrame('half', 'half') });
      newFrames.push({ id: 'eye_open2', durationMs: Math.round(holdDurationMs * 0.6), data: makeEyeFrame('open', 'open') });
    } else if (expression === 'wink_left') {
      newFrames.push({ id: 'wink_open', durationMs: holdDurationMs, data: makeEyeFrame('open', 'open') });
      newFrames.push({ id: 'wink_down', durationMs: 50, data: makeEyeFrame('slit', 'open') });
      newFrames.push({ id: 'wink_shut', durationMs: 350, data: makeEyeFrame('closed', 'open') });
      newFrames.push({ id: 'wink_up', durationMs: 50, data: makeEyeFrame('slit', 'open') });
      newFrames.push({ id: 'wink_rest', durationMs: 600, data: makeEyeFrame('open', 'open') });
    } else if (expression === 'wink_right') {
      newFrames.push({ id: 'wink_open', durationMs: holdDurationMs, data: makeEyeFrame('open', 'open') });
      newFrames.push({ id: 'wink_down', durationMs: 50, data: makeEyeFrame('open', 'slit') });
      newFrames.push({ id: 'wink_shut', durationMs: 350, data: makeEyeFrame('open', 'closed') });
      newFrames.push({ id: 'wink_up', durationMs: 50, data: makeEyeFrame('open', 'slit') });
      newFrames.push({ id: 'wink_rest', durationMs: 600, data: makeEyeFrame('open', 'open') });
    } else if (expression === 'squint') {
      newFrames.push({ id: 'squint_open', durationMs: 600, data: makeEyeFrame('open', 'open') });
      newFrames.push({ id: 'squint_hold', durationMs: holdDurationMs, data: makeEyeFrame('slit', 'slit') });
      newFrames.push({ id: 'squint_end', durationMs: 600, data: makeEyeFrame('open', 'open') });
    } else if (expression === 'scan') {
      // Proportional scan offset so eyes stay comfortably within view
      const maxShift = Math.max(1, Math.min(4, Math.round(actualEyeW * 0.35)));
      const scanShift = outerMargin > 0 ? Math.max(1, Math.min(maxShift, outerMargin)) : 1;

      newFrames.push({ id: 'scan_c1', durationMs: 500, data: makeEyeFrame('open', 'open', 0, 0) });
      newFrames.push({ id: 'scan_l', durationMs: 700, data: makeEyeFrame('open', 'open', -scanShift, -scanShift) });
      newFrames.push({ id: 'scan_c2', durationMs: 350, data: makeEyeFrame('open', 'open', 0, 0) });
      newFrames.push({ id: 'scan_r', durationMs: 700, data: makeEyeFrame('open', 'open', scanShift, scanShift) });
      newFrames.push({ id: 'scan_c3', durationMs: 350, data: makeEyeFrame('open', 'open', 0, 0) });
    } else if (expression === 'shock') {
      newFrames.push({ id: 'shock_norm', durationMs: 600, data: makeEyeFrame('half', 'half') });
      newFrames.push({ id: 'shock_wide', durationMs: holdDurationMs, data: makeEyeFrame('open', 'open') });
    }

    this._applyGeneratedFrames(newFrames, `robot_eyes_${expression}`, options.insertion);
  }

  /**
   * Generates a Strobe or Pulse animation
   */
  generatePulse(options = {}) {
    const {
      pattern = 'breathe',  // 'breathe', 'heartbeat', 'strobe', 'curtain'
      numPulses = 2,
      framesPerCycle = 20
    } = typeof options === 'number' ? { numPulses: options } : options;

    const w = this.state.width;
    const h = this.state.height;
    const newFrames = [];
    const frameDurationMs = options.fps ? Math.round(1000 / options.fps) : this.state.defaultDurationMs;

    if (pattern === 'heartbeat') {
      // Lub-dub double pulse
      for (let p = 0; p < numPulses; p++) {
        // First thump
        for (let i = 0; i < 6; i++) {
          const b = Math.round(255 * Math.sin((i / 6) * Math.PI));
          const buf = new Uint8Array(w * h);
          buf.fill(b);
          newFrames.push({ id: 'hb1_' + Math.random().toString(36).substring(2, 7), durationMs: 35, data: buf });
        }
        // Small pause
        const pause1 = new Uint8Array(w * h);
        newFrames.push({ id: 'pause1', durationMs: 60, data: pause1 });
        // Second stronger thump
        for (let i = 0; i < 8; i++) {
          const b = Math.round(255 * Math.sin((i / 8) * Math.PI));
          const buf = new Uint8Array(w * h);
          buf.fill(b);
          newFrames.push({ id: 'hb2_' + Math.random().toString(36).substring(2, 7), durationMs: 35, data: buf });
        }
        // Long pause
        const pause2 = new Uint8Array(w * h);
        newFrames.push({ id: 'pause2', durationMs: 450, data: pause2 });
      }
    } else if (pattern === 'strobe') {
      // Rapid strobe flash
      for (let p = 0; p < numPulses * 3; p++) {
        const onBuf = new Uint8Array(w * h);
        onBuf.fill(255);
        newFrames.push({ id: 'strobe_on', durationMs: 40, data: onBuf });

        const offBuf = new Uint8Array(w * h);
        newFrames.push({ id: 'strobe_off', durationMs: 60, data: offBuf });
      }
    } else if (pattern === 'curtain') {
      // Center-out curtain wipe
      const midX = (w - 1) / 2;
      const steps = Math.ceil(w / 2);
      for (let s = 0; s <= steps; s++) {
        const buf = new Uint8Array(w * h);
        for (let x = 0; x < w; x++) {
          if (Math.abs(x - midX) <= s) {
            for (let y = 0; y < h; y++) buf[y * w + x] = 255;
          }
        }
        newFrames.push({ id: 'curtain_' + s, durationMs: frameDurationMs, data: buf });
      }
      for (let s = steps; s >= 0; s--) {
        const buf = new Uint8Array(w * h);
        for (let x = 0; x < w; x++) {
          if (Math.abs(x - midX) <= s) {
            for (let y = 0; y < h; y++) buf[y * w + x] = 255;
          }
        }
        newFrames.push({ id: 'curtain_rev_' + s, durationMs: frameDurationMs, data: buf });
      }
    } else {
      // Standard smooth sinusoidal breathing
      const stepsPerPulse = Math.max(4, framesPerCycle);
      for (let p = 0; p < numPulses; p++) {
        for (let s = 0; s < stepsPerPulse; s++) {
          const rad = (s / stepsPerPulse) * Math.PI;
          const brightness = Math.round(255 * Math.sin(rad));
          const buf = new Uint8Array(w * h);
          buf.fill(brightness);

          newFrames.push({
            id: 'pulse_' + Math.random().toString(36).substring(2, 9),
            durationMs: frameDurationMs,
            data: buf
          });
        }
      }
    }

    this._applyGeneratedFrames(newFrames, `visor_${pattern}`, options.insertion);
  }

  /**
   * Applies generated frames according to the insertion/compositing options:
   * mode: 'replace' | 'overlay' | 'append'
   * blendMode: 'add' (additive flare) | 'max' (lighten) | 'overwrite' | 'screen'
   * durationSync: 'loop' (polyrhythmic seamless loop) | 'pad' (stop when shorter finishes)
   */
  _applyGeneratedFrames(newFrames, animationName, insertionOptions = {}) {
    if (!newFrames || newFrames.length === 0) return;
    this.state.pushUndo();

    const {
      mode = 'replace',
      blendMode = 'add',
      durationSync = 'loop'
    } = insertionOptions;

    const w = this.state.width;
    const h = this.state.height;
    const totalPixels = w * h;

    // 1. Append Mode: Chain after existing frames
    if (mode === 'append') {
      const isBlankSingle = this.state.frames.length === 1 && this.state.frames[0].data.every(v => v === 0);
      if (isBlankSingle) {
        this.state.frames = newFrames;
        this.state.activeFrameIndex = 0;
      } else {
        const startIndex = this.state.frames.length;
        this.state.frames = this.state.frames.concat(newFrames);
        this.state.activeFrameIndex = startIndex;
      }
      this.state.name = `${this.state.name}_${animationName}`;
      this.state.notify('frames_reloaded', { count: this.state.frames.length });
      return;
    }

    // 2. Overlay / Mix on Top: Superimpose onto existing animation
    if (mode === 'overlay') {
      const existing = this.state.frames;
      const isBlankSingle = existing.length === 1 && existing[0].data.every(v => v === 0);
      if (isBlankSingle) {
        this.state.frames = newFrames;
        this.state.activeFrameIndex = 0;
        this.state.name = animationName;
        this.state.notify('frames_reloaded', { count: newFrames.length });
        return;
      }

      const lenE = existing.length;
      const lenI = newFrames.length;

      // Calculate composite length (LCM or max)
      function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
      function lcm(a, b) { return (a * b) / gcd(a, b); }

      let compositeLen = Math.max(lenE, lenI);
      if (durationSync === 'loop') {
        const computedLcm = lcm(lenE, lenI);
        if (computedLcm <= 120 && computedLcm >= compositeLen) {
          compositeLen = computedLcm;
        }
      }

      const compositedFrames = [];

      for (let k = 0; k < compositeLen; k++) {
        const frameE = (durationSync === 'loop' || k < lenE) ? existing[k % lenE] : null;
        const frameI = (durationSync === 'loop' || k < lenI) ? newFrames[k % lenI] : null;

        const buffer = new Uint8Array(totalPixels);

        for (let p = 0; p < totalPixels; p++) {
          const valE = frameE ? frameE.data[p] : 0;
          const valI = frameI ? frameI.data[p] : 0;

          if (blendMode === 'add') {
            // Additive flare: superimposition with bright flare intersection!
            buffer[p] = Math.min(255, valE + valI);
          } else if (blendMode === 'max') {
            // Maximum / Lighten
            buffer[p] = Math.max(valE, valI);
          } else if (blendMode === 'overwrite') {
            // Non-zero of incoming replaces existing
            buffer[p] = valI > 0 ? valI : valE;
          } else if (blendMode === 'screen') {
            buffer[p] = Math.round(255 - ((255 - valE) * (255 - valI)) / 255);
          }
        }

        const dur = (frameE ? frameE.durationMs : 0) || (frameI ? frameI.durationMs : 0) || this.state.defaultDurationMs;

        compositedFrames.push({
          id: 'mix_' + Math.random().toString(36).substring(2, 9),
          durationMs: dur,
          data: buffer
        });
      }

      this.state.frames = compositedFrames;
      this.state.activeFrameIndex = 0;
      this.state.name = `${this.state.name}_mixed`;
      this.state.notify('frames_reloaded', { count: compositedFrames.length });
      return;
    }

    // 3. Default: Replace Timeline
    this.state.name = animationName;
    this.state.frames = newFrames;
    this.state.activeFrameIndex = 0;
    this.state.notify('frames_reloaded', { count: newFrames.length });
  }
}
