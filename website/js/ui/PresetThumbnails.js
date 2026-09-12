/**
 * PresetThumbnails.js
 * 
 * Live Micro-Canvas Animation Renderer for Animatrix Generator Tabs.
 * Renders miniature LED dot matrix previews for:
 * 1. Cylon Sweep (bouncing beam with phosphor tail)
 * 2. Robotic Eyes (dual eye clusters with blinking/squinting expressions)
 * 3. Text Marquee (smooth scrolling dot-matrix typography)
 * 4. Audio EQ (dancing spectrum frequency bars with peak decay)
 * 5. Visor Pulse (sinusoidal breathing / heartbeat wave)
 * 
 * Features:
 * - Circular LED optics with bloom and realistic unlit lens dimming
 * - Sharp retina display scaling
 * - Zero-CPU when modal is closed (lifecycle hooked to modal state)
 */

export class PresetThumbnails {
  static instances = new Map();
  static animFrameId = null;
  static isRunning = false;
  static tick = 0;

  // 3x5 font map for Marquee thumbnail
  static FONT_3x5 = {
    'A': [0x7, 0x5, 0x7, 0x5, 0x5],
    'N': [0x5, 0x7, 0x7, 0x5, 0x5],
    'I': [0x7, 0x2, 0x2, 0x2, 0x7],
    'M': [0x5, 0x7, 0x5, 0x5, 0x5],
    'T': [0x7, 0x2, 0x2, 0x2, 0x2],
    'R': [0x6, 0x5, 0x6, 0x5, 0x5],
    'X': [0x5, 0x5, 0x2, 0x5, 0x5],
    ' ': [0x0, 0x0, 0x0, 0x0, 0x0]
  };

  /**
   * Initializes all thumbnail canvases and mounts them into [data-thumb] slots.
   */
  static init() {
    const slots = document.querySelectorAll('.preset-thumb-slot[data-thumb]');
    slots.forEach(slot => {
      const type = slot.getAttribute('data-thumb');
      if (this.instances.has(type)) return;

      const canvas = document.createElement('canvas');
      canvas.className = 'preset-thumb-canvas';
      slot.innerHTML = '';
      slot.appendChild(canvas);

      const dpr = window.devicePixelRatio || 1;
      const rect = slot.getBoundingClientRect();
      const width = rect.width || 76;
      const height = rect.height || 22;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      this.instances.set(type, {
        canvas,
        ctx,
        type,
        width,
        height,
        // State storage for EQ peaks, etc.
        state: {
          peaks: [0, 0, 0, 0, 0, 0, 0, 0],
          peakDecay: [0, 0, 0, 0, 0, 0, 0, 0]
        }
      });
    });
  }

  /**
   * Starts the animation loop if not already running.
   */
  static start() {
    if (this.instances.size === 0) {
      this.init();
    }
    if (this.isRunning) return;
    this.isRunning = true;
    this._loop();
  }

  /**
   * Stops the animation loop to save CPU when modal is closed.
   */
  static stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  static _loop() {
    if (!PresetThumbnails.isRunning) return;
    PresetThumbnails.tick++;
    PresetThumbnails.renderAll();
    PresetThumbnails.animFrameId = requestAnimationFrame(() => PresetThumbnails._loop());
  }

  /**
   * Renders all active preset thumbnail canvases.
   */
  static renderAll() {
    const t = this.tick;
    this.instances.forEach((item, type) => {
      const { ctx, width, height, state } = item;
      ctx.clearRect(0, 0, width, height);

      switch (type) {
        case 'cylon':
          this._renderCylon(ctx, width, height, t);
          break;
        case 'robot_eyes':
          this._renderRobotEyes(ctx, width, height, t);
          break;
        case 'marquee':
          this._renderMarquee(ctx, width, height, t);
          break;
        case 'equalizer':
          this._renderEqualizer(ctx, width, height, t, state);
          break;
        case 'pulse':
          this._renderPulse(ctx, width, height, t);
          break;
      }
    });
  }

  // --- LED Drawing Helper ---
  static _drawLed(ctx, x, y, radius, brightness) {
    // Unlit base socket
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();

    if (brightness > 0.02) {
      // Glow bloom
      if (brightness > 0.4) {
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 30, 10, ${brightness * 0.25})`;
        ctx.fill();
      }

      // Main lit LED core
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, ${Math.floor(25 + brightness * 160)}, ${Math.floor(10 + brightness * 60)}, ${brightness})`;
      ctx.fill();
    }
  }

  // --- 1. Cylon Sweep ---
  static _renderCylon(ctx, w, h, t) {
    const cols = 17;
    const rows = 3;
    const spacingX = (w - 10) / (cols - 1);
    const spacingY = (h - 8) / (rows - 1);
    const startX = 5;
    const startY = 4;
    const radius = 1.35;

    // Beam bounce position (0 to cols - 1)
    const speed = 0.35;
    const sweepRange = cols - 1;
    const rawPos = (t * speed) % (sweepRange * 2);
    const beamPos = rawPos < sweepRange ? rawPos : (sweepRange * 2 - rawPos);
    const dir = rawPos < sweepRange ? 1 : -1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX;
        const y = startY + r * spacingY;

        // Chevron offset: top and bottom rows trail slightly behind center
        const colOffset = (r === 1) ? 0 : (dir * -0.6);
        const dist = Math.abs(c - (beamPos + colOffset));

        let b = 0;
        if (dist < 0.8) {
          b = 1.0 - (dist / 0.8) * 0.3;
        } else {
          // Phosphor tail behind beam
          const tailDist = dir > 0 ? (beamPos - c) : (c - beamPos);
          if (tailDist > 0 && tailDist < 4.5) {
            b = Math.max(0, 0.75 * Math.exp(-tailDist * 0.8));
          }
        }

        this._drawLed(ctx, x, y, radius, b);
      }
    }
  }

  // --- 2. Robotic Eyes ---
  static _renderRobotEyes(ctx, w, h, t) {
    const cols = 17;
    const rows = 4;
    const spacingX = (w - 10) / (cols - 1);
    const spacingY = (h - 8) / (rows - 1);
    const startX = 5;
    const startY = 4;
    const radius = 1.35;

    // Eye clusters: Left (cols 2..6), Right (cols 10..14)
    // Blink cycle: 110 ticks
    const cycle = t % 110;
    let eyelidHeight = 1.0; // 1 = fully open (rows 0..3), 0 = closed

    if (cycle > 70 && cycle <= 76) {
      // First quick blink down
      eyelidHeight = Math.max(0.1, 1.0 - (cycle - 70) / 3);
    } else if (cycle > 76 && cycle <= 82) {
      // First blink up
      eyelidHeight = Math.min(1.0, (cycle - 76) / 4);
    } else if (cycle > 88 && cycle <= 93) {
      // Second cute slit-squint
      eyelidHeight = 0.35;
    } else if (cycle > 93 && cycle <= 98) {
      eyelidHeight = 0.35 + ((cycle - 93) / 5) * 0.65;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX;
        const y = startY + r * spacingY;

        const isLeftEye = c >= 2 && c <= 6;
        const isRightEye = c >= 10 && c <= 14;

        let b = 0;
        if (isLeftEye || isRightEye) {
          // Inner pupil brightness slightly higher
          const isPupil = (c === 4 && (r === 1 || r === 2)) || (c === 12 && (r === 1 || r === 2));
          // Check eyelid vertical coverage
          const centerRow = 1.5;
          const distFromCenter = Math.abs(r - centerRow);
          const maxDist = eyelidHeight * 1.6;

          if (distFromCenter <= maxDist) {
            b = isPupil ? 1.0 : 0.85;
          }
        }

        this._drawLed(ctx, x, y, radius, b);
      }
    }
  }

  // --- 3. Text Marquee ---
  static _renderMarquee(ctx, w, h, t) {
    const text = 'ANIMATRIX ';
    const cols = 17;
    const rows = 5;
    const spacingX = (w - 8) / (cols - 1);
    const spacingY = (h - 6) / (rows - 1);
    const startX = 4;
    const startY = 3;
    const radius = 1.25;

    // Build virtual text matrix column bits
    const fullCols = [];
    for (const ch of text) {
      const glyph = this.FONT_3x5[ch] || this.FONT_3x5[' '];
      for (let x = 0; x < 3; x++) {
        let colMask = 0;
        for (let y = 0; y < 5; y++) {
          if ((glyph[y] & (1 << (2 - x))) !== 0) {
            colMask |= (1 << y);
          }
        }
        fullCols.push(colMask);
      }
      fullCols.push(0); // 1-col gap between letters
    }

    const scrollSpeed = 0.22;
    const scrollOffset = Math.floor(t * scrollSpeed) % fullCols.length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX;
        const y = startY + r * spacingY;

        const virtualColIdx = (c + scrollOffset) % fullCols.length;
        const mask = fullCols[virtualColIdx];
        const isLit = (mask & (1 << r)) !== 0;

        this._drawLed(ctx, x, y, radius, isLit ? 0.95 : 0);
      }
    }
  }

  // --- 4. Audio EQ ---
  static _renderEqualizer(ctx, w, h, t, state) {
    const numBars = 8;
    const maxRows = 5;
    const spacingX = (w - 12) / (numBars - 1);
    const spacingY = (h - 6) / (maxRows - 1);
    const startX = 6;
    const startY = 3;
    const radius = 1.3;

    for (let i = 0; i < numBars; i++) {
      // Dynamic frequency synthesis using harmonized sines
      const f1 = Math.sin(t * 0.12 + i * 1.1);
      const f2 = Math.cos(t * 0.21 - i * 0.7);
      const val = Math.max(0.15, Math.min(1.0, (f1 * 0.5 + f2 * 0.5 + 0.9) / 1.7));
      const targetHeight = Math.round(val * maxRows);

      // Track peak decay dot
      if (targetHeight >= state.peaks[i]) {
        state.peaks[i] = targetHeight;
        state.peakDecay[i] = 12; // hold peak frames
      } else if (state.peakDecay[i] > 0) {
        state.peakDecay[i]--;
      } else if (state.peaks[i] > 0) {
        state.peaks[i] -= 0.18;
      }

      const barX = startX + i * spacingX;

      for (let r = 0; r < maxRows; r++) {
        // Row 0 is top, maxRows-1 is bottom
        const invertedRow = maxRows - 1 - r;
        const y = startY + (maxRows - 1 - invertedRow) * spacingY;

        let b = 0;
        if (invertedRow < targetHeight) {
          // Higher rows are hotter/brighter
          b = 0.65 + (invertedRow / maxRows) * 0.35;
        } else if (Math.round(state.peaks[i]) === invertedRow + 1) {
          // Floating peak dot
          b = 1.0;
        }

        this._drawLed(ctx, barX, y, radius, b);
      }
    }
  }

  // --- 5. Visor Pulse ---
  static _renderPulse(ctx, w, h, t) {
    const cols = 17;
    const rows = 3;
    const spacingX = (w - 10) / (cols - 1);
    const spacingY = (h - 8) / (rows - 1);
    const startX = 5;
    const startY = 4;
    const radius = 1.35;

    // Heartbeat / expanding radar sine wave
    const waveSpeed = 0.14;
    const centerCol = (cols - 1) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX;
        const y = startY + r * spacingY;

        const distFromCenter = Math.abs(c - centerCol);
        // Expanding circular ripple
        const wave = Math.sin(distFromCenter * 0.75 - t * waveSpeed);
        // Intensity envelope: center stays slightly warmer
        const centerWarmth = Math.max(0, 1.0 - (distFromCenter / centerCol) * 0.5);
        const b = Math.max(0, Math.min(1.0, (wave * 0.6 + 0.4) * (0.4 + centerWarmth * 0.6)));

        this._drawLed(ctx, x, y, radius, b);
      }
    }
  }
}
