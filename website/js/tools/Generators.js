/**
 * Generators.js
 * Procedural animation generators for Daft Punk helmet visors and custom LED matrices.
 * Fully resolution-agnostic (supports any W x H) and strictly frame-quantized.
 * Includes:
 * 1. Text Marquee Scroller (using MicroFont 3-row bitmap, vertically auto-centered)
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
   * Generates a smooth scrolling text marquee across the matrix.
   * Auto-centers vertically on matrices of any height H >= 3.
   */
  generateMarquee(text = 'DAFT PUNK', options = {}) {
    const {
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

    // Center font vertically for any matrix height
    const startY = Math.max(0, Math.floor((matrixH - textHeight) / 2));
    const totalSteps = leadInBlankCols + textWidth + leadOutBlankCols;
    const frameDurationMs = this.state.defaultDurationMs;
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
   * Supports targetTotalFrames for exact timeline conforming.
   */
  generateCylonScanner(options = {}) {
    let {
      shape = 'fading_line',            // 'single_line', 'chevron', 'fading_line', 'fading_chevron'
      leftEndMode = 'offscreen',        // 'offscreen', 'edge', 'margin_2', 'margin_4', 'margin_8'
      rightEndMode = 'offscreen',       // 'offscreen', 'edge', 'margin_2', 'margin_4', 'margin_8'
      beamWidth = 3,
      tailLength = 6,
      headBrightness = 255,
      framesPerPass = 24,               // Number of frames for a single pass
      repetitions = 1,                  // Number of cycles / sweeps
      roundTrip = true,                 // true = bounce back and forth; false = one-way
      startDirection = 'left_to_right', // 'left_to_right' or 'right_to_left'
      targetTotalFrames = null          // If set, conforms framesPerPass to hit this total
    } = options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = this.state.defaultDurationMs;
    const newFrames = [];

    // If targetTotalFrames specified, conform framesPerPass
    if (targetTotalFrames && targetTotalFrames > 0) {
      const passesPerRep = roundTrip ? 2 : 1;
      framesPerPass = Math.max(2, Math.floor(targetTotalFrames / (Math.max(1, repetitions) * passesPerRep)));
    }

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

    if (minX >= maxX) {
      minX = 0;
      maxX = w - 1;
    }

    // Assemble steps
    const stepList = [];
    const count = Math.max(2, framesPerPass);

    for (let rep = 0; rep < repetitions; rep++) {
      if (roundTrip) {
        const totalCycle = count * 2;
        const dir1 = (startDirection === 'left_to_right') ? 1 : -1;
        const startX = (dir1 === 1) ? minX : maxX;
        const endX = (dir1 === 1) ? maxX : minX;

        for (let i = 0; i < totalCycle; i++) {
          let t, dir;
          if (i < count) {
            t = i / count;
            dir = dir1;
          } else {
            t = (totalCycle - i) / count;
            dir = -dir1;
          }
          const headX = startX + (endX - startX) * t;
          stepList.push({ headX, dir });
        }
      } else {
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

    // If targetTotalFrames was explicitly set, pad or trim stepList to match exact count
    if (targetTotalFrames && targetTotalFrames > 0 && stepList.length !== targetTotalFrames) {
      while (stepList.length < targetTotalFrames) {
        stepList.push(stepList[stepList.length % (roundTrip ? count * 2 : count)]);
      }
      stepList.length = targetTotalFrames;
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

          // Core beam
          if (dist <= beamWidth / 2) {
            buffer[y * w + x] = headBrightness;
          }

          // Fading tail trailing behind motion
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
   * Generates an Audio Spectrum / Equalizer simulation.
   * Dynamically adapts band counts and vertical bar heights to any matrix W x H.
   */
  generateEqualizer(options = {}) {
    const {
      style = 'solid',      // 'solid', 'peak_dots', 'waveform'
      bands = 16,           // Requested frequency bands
      numFrames = 48,
      targetTotalFrames = null
    } = options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = this.state.defaultDurationMs;
    const totalFrames = targetTotalFrames || numFrames;
    const newFrames = [];

    // Constrain bands to width
    const actualBands = Math.max(2, Math.min(bands, w));
    const colPerBand = Math.max(1, Math.floor(w / actualBands));

    const peakPositions = new Float32Array(actualBands);

    for (let f = 0; f < totalFrames; f++) {
      const buffer = new Uint8Array(w * h);
      const t = f * 0.35;

      for (let b = 0; b < actualBands; b++) {
        const rawHeight = (Math.sin(t + b * 0.85) * 0.45 + 0.5) * (Math.cos(t * 1.3 - b * 0.4) * 0.35 + 0.65);
        const level = rawHeight * h;

        if (level > peakPositions[b]) {
          peakPositions[b] = level;
        } else {
          peakPositions[b] = Math.max(0, peakPositions[b] - (h / 12));
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
              if (rowFromBottom < Math.floor(level)) {
                buffer[y * w + col] = 180;
              }
              const peakRow = Math.min(h - 1, Math.round(peakPositions[b]));
              if (rowFromBottom === peakRow) {
                buffer[y * w + col] = 255;
              }
            } else if (style === 'waveform') {
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
   * Generates Robot Eye Expression sequences.
   * Strictly frame-quantized to project FPS and parameterized for arbitrary W x H.
   */
  generateRobotEyes(options = {}) {
    const {
      expression = 'blink',  // 'blink', 'wink_left', 'wink_right', 'squint', 'scan', 'shock'
      style = 'block',       // 'block', 'slit', 'brackets'
      eyeWidth = 10,
      targetTotalFrames = null,
      holdFrames = null,
      holdDurationMs = 1200
    } = typeof options === 'string' ? { expression: options } : options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = this.state.defaultDurationMs;
    const newFrames = [];

    // Constrain eye width so two eyes fit with at least 1-2px center gap
    const maxEyeW = Math.max(1, Math.floor((w - 2) / 2));
    const actualEyeW = Math.max(1, Math.min(eyeWidth, maxEyeW));

    // Calculate left and right eye boundaries
    const wHalf = Math.floor(w / 2);
    const outerMargin = Math.max(0, Math.floor((wHalf - actualEyeW) / 2));

    const leftEyeStart = outerMargin;
    const leftEyeEnd = leftEyeStart + actualEyeW - 1;

    const rightEyeEnd = (w - 1) - outerMargin;
    const rightEyeStart = rightEyeEnd - actualEyeW + 1;

    // Adaptive vertical eyelid rows
    const midY = Math.floor((h - 1) / 2);

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
                if (y === midY || (h % 2 === 0 && y === midY + 1)) buf[y * w + x] = 255;
              } else {
                buf[y * w + x] = 255; // solid block
              }
            } else if (eyeState === 'half') {
              // Eyelid closes top half of matrix
              const isTopHalf = y < Math.ceil(h / 2);
              if (!isTopHalf) {
                buf[y * w + x] = 210;
              }
            } else if (eyeState === 'slit') {
              if (y === midY || (h % 2 === 0 && y === midY + 1)) buf[y * w + x] = 255;
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

    // Determine target total frame count (uniform timebase)
    let totalFrames = targetTotalFrames;
    if (!totalFrames || totalFrames <= 0) {
      if (holdFrames && holdFrames > 0) {
        totalFrames = Math.max(12, holdFrames + 12);
      } else {
        const computedHold = Math.round(holdDurationMs / frameDurationMs);
        totalFrames = Math.max(24, computedHold + 12);
      }
    }

    const pushN = (count, eyeL, eyeR, offL = 0, offR = 0, prefix = 'eye') => {
      const c = Math.max(0, Math.round(count));
      for (let i = 0; i < c; i++) {
        newFrames.push({
          id: `${prefix}_${i}_` + Math.random().toString(36).substring(2, 6),
          durationMs: frameDurationMs,
          data: makeEyeFrame(eyeL, eyeR, offL, offR)
        });
      }
    };

    if (expression === 'blink') {
      // Natural blink sequence: open -> half -> slit -> shut -> slit -> half -> open
      const transitionFrames = (totalFrames <= 16) ? 4 : 6;
      const openFrames = Math.max(2, totalFrames - transitionFrames);
      const openLead = Math.floor(openFrames * 0.6);
      const openTail = openFrames - openLead;

      pushN(openLead, 'open', 'open', 0, 0, 'open1');
      if (transitionFrames === 4) {
        pushN(1, 'half', 'half', 0, 0, 'half_dn');
        pushN(2, 'closed', 'closed', 0, 0, 'shut');
        pushN(1, 'half', 'half', 0, 0, 'half_up');
      } else {
        pushN(1, 'half', 'half', 0, 0, 'half_dn');
        pushN(1, 'slit', 'slit', 0, 0, 'slit_dn');
        pushN(2, 'closed', 'closed', 0, 0, 'shut');
        pushN(1, 'slit', 'slit', 0, 0, 'slit_up');
        pushN(1, 'half', 'half', 0, 0, 'half_up');
      }
      pushN(openTail, 'open', 'open', 0, 0, 'open2');
    } else if (expression === 'wink_left' || expression === 'wink_right') {
      const isLeft = (expression === 'wink_left');
      const winkShutFrames = Math.max(2, Math.round(totalFrames * 0.25));
      const trans = 2; // 1 slit down, 1 slit up
      const openFrames = Math.max(2, totalFrames - winkShutFrames - trans);
      const openLead = Math.floor(openFrames * 0.6);
      const openTail = openFrames - openLead;

      pushN(openLead, 'open', 'open', 0, 0, 'open_lead');
      pushN(1, isLeft ? 'slit' : 'open', isLeft ? 'open' : 'slit', 0, 0, 'wink_dn');
      pushN(winkShutFrames, isLeft ? 'closed' : 'open', isLeft ? 'open' : 'closed', 0, 0, 'wink_hold');
      pushN(1, isLeft ? 'slit' : 'open', isLeft ? 'open' : 'slit', 0, 0, 'wink_up');
      pushN(openTail, 'open', 'open', 0, 0, 'open_tail');
    } else if (expression === 'squint') {
      const open1 = Math.max(1, Math.floor(totalFrames * 0.25));
      const squintHold = Math.max(2, Math.floor(totalFrames * 0.5));
      const open2 = Math.max(1, totalFrames - open1 - squintHold);

      pushN(open1, 'open', 'open', 0, 0, 'open1');
      pushN(squintHold, 'slit', 'slit', 0, 0, 'squint');
      pushN(open2, 'open', 'open', 0, 0, 'open2');
    } else if (expression === 'scan') {
      const maxShift = Math.max(1, Math.min(4, Math.round(actualEyeW * 0.35)));
      const scanShift = outerMargin > 0 ? Math.max(1, Math.min(maxShift, outerMargin)) : 1;

      const c1 = Math.max(1, Math.floor(totalFrames * 0.15));
      const left = Math.max(2, Math.floor(totalFrames * 0.3));
      const c2 = Math.max(1, Math.floor(totalFrames * 0.1));
      const right = Math.max(2, Math.floor(totalFrames * 0.3));
      const c3 = Math.max(1, totalFrames - c1 - left - c2 - right);

      pushN(c1, 'open', 'open', 0, 0, 'scan_c1');
      pushN(left, 'open', 'open', -scanShift, -scanShift, 'scan_l');
      pushN(c2, 'open', 'open', 0, 0, 'scan_c2');
      pushN(right, 'open', 'open', scanShift, scanShift, 'scan_r');
      pushN(c3, 'open', 'open', 0, 0, 'scan_c3');
    } else if (expression === 'shock') {
      const norm = Math.max(1, Math.floor(totalFrames * 0.3));
      const wide = Math.max(1, totalFrames - norm);

      pushN(norm, 'half', 'half', 0, 0, 'shock_norm');
      pushN(wide, 'open', 'open', 0, 0, 'shock_wide');
    }

    // Ensure exact conform to totalFrames
    while (newFrames.length < totalFrames) {
      newFrames.push({
        id: 'eye_pad_' + Math.random().toString(36).substring(2, 6),
        durationMs: frameDurationMs,
        data: makeEyeFrame('open', 'open')
      });
    }
    if (newFrames.length > totalFrames) {
      newFrames.length = totalFrames;
    }

    this._applyGeneratedFrames(newFrames, `robot_eyes_${expression}`, options.insertion);
  }

  /**
   * Generates a Strobe or Pulse animation.
   * Quantized to exact project FPS frames and adaptable to any matrix size.
   */
  generatePulse(options = {}) {
    let {
      pattern = 'breathe',  // 'breathe', 'heartbeat', 'strobe', 'curtain'
      numPulses = 2,
      framesPerCycle = 24,
      targetTotalFrames = null
    } = typeof options === 'number' ? { numPulses: options } : options;

    const w = this.state.width;
    const h = this.state.height;
    const frameDurationMs = this.state.defaultDurationMs;
    const newFrames = [];

    const totalFrames = targetTotalFrames || (numPulses * framesPerCycle);
    const safePulses = Math.max(1, numPulses);
    const framesPerP = Math.max(4, Math.floor(totalFrames / safePulses));

    if (pattern === 'heartbeat') {
      // Quantized double-thump heartbeat
      for (let p = 0; p < safePulses; p++) {
        const thump1Frames = Math.max(1, Math.round(framesPerP * 0.18));
        const pause1Frames = Math.max(1, Math.round(framesPerP * 0.12));
        const thump2Frames = Math.max(2, Math.round(framesPerP * 0.28));
        const pause2Frames = Math.max(1, framesPerP - thump1Frames - pause1Frames - thump2Frames);

        // Thump 1
        for (let i = 0; i < thump1Frames; i++) {
          const b = Math.round(220 * Math.sin(((i + 1) / (thump1Frames + 1)) * Math.PI));
          const buf = new Uint8Array(w * h);
          buf.fill(b);
          newFrames.push({ id: 'hb1_' + Math.random().toString(36).substring(2, 6), durationMs: frameDurationMs, data: buf });
        }
        // Pause 1
        for (let i = 0; i < pause1Frames; i++) {
          newFrames.push({ id: 'p1_' + i, durationMs: frameDurationMs, data: new Uint8Array(w * h) });
        }
        // Thump 2 (stronger)
        for (let i = 0; i < thump2Frames; i++) {
          const b = Math.round(255 * Math.sin(((i + 1) / (thump2Frames + 1)) * Math.PI));
          const buf = new Uint8Array(w * h);
          buf.fill(b);
          newFrames.push({ id: 'hb2_' + Math.random().toString(36).substring(2, 6), durationMs: frameDurationMs, data: buf });
        }
        // Pause 2
        for (let i = 0; i < pause2Frames; i++) {
          newFrames.push({ id: 'p2_' + i, durationMs: frameDurationMs, data: new Uint8Array(w * h) });
        }
      }
    } else if (pattern === 'strobe') {
      const toggleInterval = Math.max(1, Math.floor(totalFrames / (safePulses * 6)));
      let isOn = true;
      let counter = 0;
      for (let f = 0; f < totalFrames; f++) {
        const buf = new Uint8Array(w * h);
        if (isOn) buf.fill(255);
        newFrames.push({ id: 'str_' + f, durationMs: frameDurationMs, data: buf });
        counter++;
        if (counter >= toggleInterval) {
          counter = 0;
          isOn = !isOn;
        }
      }
    } else if (pattern === 'curtain') {
      const midX = (w - 1) / 2;
      const maxDist = Math.ceil(w / 2);

      for (let f = 0; f < totalFrames; f++) {
        // Ping-pong triangular phase [0 -> 1 -> 0]
        const phase = (f % framesPerP) / (framesPerP - 1);
        const curRadius = (phase <= 0.5 ? phase * 2 : (1 - phase) * 2) * maxDist;
        const buf = new Uint8Array(w * h);

        for (let x = 0; x < w; x++) {
          if (Math.abs(x - midX) <= curRadius) {
            for (let y = 0; y < h; y++) {
              buf[y * w + x] = 255;
            }
          }
        }
        newFrames.push({ id: 'curtain_' + f, durationMs: frameDurationMs, data: buf });
      }
    } else {
      // Standard smooth sinusoidal breathing
      for (let f = 0; f < totalFrames; f++) {
        const rad = ((f % framesPerP) / framesPerP) * Math.PI * 2;
        // Cosine inverted for natural breath cycle 0 -> 255 -> 0
        const brightness = Math.round(255 * (0.5 - 0.5 * Math.cos(rad)));
        const buf = new Uint8Array(w * h);
        buf.fill(brightness);

        newFrames.push({
          id: 'pulse_' + Math.random().toString(36).substring(2, 6),
          durationMs: frameDurationMs,
          data: buf
        });
      }
    }

    // Exact conform
    if (newFrames.length > totalFrames) newFrames.length = totalFrames;
    while (newFrames.length < totalFrames) {
      newFrames.push({ id: 'pad_' + newFrames.length, durationMs: frameDurationMs, data: new Uint8Array(w * h) });
    }

    this._applyGeneratedFrames(newFrames, `visor_${pattern}`, options.insertion);
  }

  /**
   * Applies generated frames according to the insertion/compositing options:
   * mode: 'replace' | 'overlay' | 'append'
   * blendMode: 'add' (additive flare) | 'max' (lighten) | 'overwrite' | 'screen' | 'stencil' (mask) | 'subtract'
   */
  _applyGeneratedFrames(newFrames, animationName, insertionOptions = {}) {
    if (!newFrames || newFrames.length === 0) return;
    this.state.pushUndo();

    const {
      mode = 'replace',
      blendMode = 'add'
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

      // Conforming rule: In overlay mode, composite length strictly equals the existing timeline length!
      const compositeLen = existing.length;
      const incomingLen = newFrames.length;
      const compositedFrames = [];

      for (let k = 0; k < compositeLen; k++) {
        const frameE = existing[k];
        const frameI = newFrames[k % incomingLen];

        const buffer = new Uint8Array(totalPixels);

        for (let p = 0; p < totalPixels; p++) {
          const valE = frameE.data[p] || 0;
          const valI = (frameI && frameI.data[p] !== undefined) ? frameI.data[p] : 0;

          if (blendMode === 'add') {
            // Additive flare: superimposition with bright flare intersection
            buffer[p] = Math.min(255, valE + valI);
          } else if (blendMode === 'max') {
            // Maximum / Lighten
            buffer[p] = Math.max(valE, valI);
          } else if (blendMode === 'overwrite') {
            // Non-zero of incoming replaces existing
            buffer[p] = valI > 0 ? valI : valE;
          } else if (blendMode === 'screen') {
            // Soft filmic highlight
            buffer[p] = Math.round(255 - ((255 - valE) * (255 - valI)) / 255);
          } else if (blendMode === 'stencil') {
            // Mask / Stencil: Existing layer only shines through where incoming is lit
            buffer[p] = Math.round((valE * valI) / 255);
          } else if (blendMode === 'subtract') {
            // Subtract / Cutout
            buffer[p] = Math.max(0, valE - valI);
          }
        }

        compositedFrames.push({
          id: 'mix_' + Math.random().toString(36).substring(2, 9),
          durationMs: frameE.durationMs || this.state.defaultDurationMs,
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
