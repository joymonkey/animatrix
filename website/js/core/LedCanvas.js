/**
 * LedCanvas.js
 * High-performance 2D Canvas renderer providing photorealistic red LED matrix simulation.
 * Includes bloom glow, 8-bit PWM brightness shading, and visor filter effects.
 */

const LED_COLOR_PALETTES = {
  red: {
    unlit: '#220808',
    glowRgb: '255, 30, 20',
    high: ['#ffffff', '#ff8070', '#ff0800', '#990000'],
    mid:  ['#ff9988', '#ff2010', '#770000'],
    low:  ['#ff4030', '#aa1000', '#440000']
  },
  green: {
    unlit: '#082208',
    glowRgb: '20, 255, 60',
    high: ['#ffffff', '#a0ffb0', '#00e030', '#006610'],
    mid:  ['#c0ffc0', '#00c025', '#005008'],
    low:  ['#60e060', '#008010', '#003004']
  },
  blue: {
    unlit: '#081022',
    glowRgb: '30, 130, 255',
    high: ['#ffffff', '#a0d0ff', '#0077ff', '#003099'],
    mid:  ['#b8d8ff', '#0060e0', '#002277'],
    low:  ['#60a0ff', '#0040aa', '#001555']
  },
  amber: {
    unlit: '#221808',
    glowRgb: '255, 170, 0',
    high: ['#ffffff', '#fff0a0', '#ffaa00', '#885500'],
    mid:  ['#ffea90', '#ee9000', '#663800'],
    low:  ['#ffc040', '#aa6600', '#442200']
  },
  white: {
    unlit: '#181820',
    glowRgb: '220, 230, 255',
    high: ['#ffffff', '#ffffff', '#e0ebff', '#607090'],
    mid:  ['#ffffff', '#d0e0ff', '#506078'],
    low:  ['#e0e8ff', '#90a0c0', '#303848']
  }
};

export class LedCanvas {
  constructor(canvasElement, matrixState) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.state = matrixState;

    // View & Display Options
    this.userLedSize = parseInt(localStorage.getItem('animatrix_led_size'), 10) || 24;
    this.pixelSize = this.userLedSize; // Base LED bead size
    this.pixelGap = Math.max(2, Math.round(this.pixelSize * 0.25));   // Gap between beads
    this.ledShape = 'circle'; // 'circle' or 'rounded_square'
    this.ledColor = localStorage.getItem('animatrix_led_color') || this.state.color || 'red';
    this.showGrid = true;
    this.showGlow = true;
    this.showVisorFilter = false;
    this.showCenterAxis = true;
    this.showCenterDivider = true; // backwards compatibility alias

    // Interaction state
    this.hoverX = -1;
    this.hoverY = -1;
    this.isPointerDown = false;

    // Callbacks
    this.onPixelInteract = null; // (x, y, isStart, isEnd, event) => {}
    this.onHoverChange = null;   // (x, y) => {}

    this._bindEvents();
    this.resizeCanvas();
  }

  _bindEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;

      const pitch = this.pixelSize + this.pixelGap;
      const offsetX = this.offsetX || 0;
      const offsetY = this.offsetY || 0;

      const x = Math.floor((canvasX - offsetX) / pitch);
      const y = Math.floor((canvasY - offsetY) / pitch);

      return {
        x: Math.max(0, Math.min(this.state.width - 1, x)),
        y: Math.max(0, Math.min(this.state.height - 1, y)),
        inside: x >= 0 && x < this.state.width && y >= 0 && y < this.state.height
      };
    };

    const handlePointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return; // Left click only
      this.isPointerDown = true;
      const pos = getPos(e);
      if (pos.inside && this.onPixelInteract) {
        this.onPixelInteract(pos.x, pos.y, true, false, e);
      }
    };

    const handlePointerMove = (e) => {
      const pos = getPos(e);
      if (pos.x !== this.hoverX || pos.y !== this.hoverY) {
        this.hoverX = pos.inside ? pos.x : -1;
        this.hoverY = pos.inside ? pos.y : -1;
        if (this.onHoverChange) {
          this.onHoverChange(this.hoverX, this.hoverY);
        }
      }

      if (this.isPointerDown && pos.inside && this.onPixelInteract) {
        this.onPixelInteract(pos.x, pos.y, false, false, e);
      }
      this.render();
    };

    const handlePointerUp = (e) => {
      if (this.isPointerDown) {
        this.isPointerDown = false;
        const pos = getPos(e);
        if (this.onPixelInteract) {
          this.onPixelInteract(pos.x, pos.y, false, true, e);
        }
      }
    };

    const handlePointerLeave = () => {
      this.hoverX = -1;
      this.hoverY = -1;
      this.isPointerDown = false;
      if (this.onHoverChange) this.onHoverChange(-1, -1);
      this.render();
    };

    this.canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    this.canvas.addEventListener('mouseleave', handlePointerLeave);

    // Touch events for tablets / mobile
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handlePointerDown(e);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isPointerDown) {
        e.preventDefault();
        handlePointerMove(e);
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      handlePointerUp(e);
    });
  }

  setLedSize(sizeInPx) {
    this.userLedSize = Math.max(10, Math.min(64, Math.round(sizeInPx)));
    localStorage.setItem('animatrix_led_size', this.userLedSize);
    this.resizeCanvas();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const calculatedPixelSize = this.userLedSize;
    const calculatedPixelGap = Math.max(2, Math.round(this.userLedSize * 0.25));

    const finalPitch = calculatedPixelSize + calculatedPixelGap;
    const finalW = this.state.width * finalPitch + calculatedPixelGap;
    const finalH = this.state.height * finalPitch + calculatedPixelGap;

    this.pixelSize = calculatedPixelSize;
    this.pixelGap = calculatedPixelGap;

    this.canvas.width = finalW;
    this.canvas.height = finalH;

    this.offsetX = calculatedPixelGap;
    this.offsetY = calculatedPixelGap;

    this.render();
  }

  /**
   * Main Render Routine
   */
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Clear background (deep matte obsidian PCB)
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw PCB trace pattern or subtle grid housing
    this._drawGridHousing(ctx);

    // 3. Draw Active Frame LEDs
    const activeFrame = this.state.activeFrame;
    if (!activeFrame) return;

    const pitch = this.pixelSize + this.pixelGap;
    const radius = this.pixelSize / 2;

    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const brightness = this.state.getPixel(x, y);
        const cx = this.offsetX + x * pitch + radius;
        const cy = this.offsetY + y * pitch + radius;

        this._drawLed(ctx, cx, cy, radius, brightness);
      }
    }

    // 5. Center Axis Crosshairs Indicator (Horizontal & Vertical Guidelines)
    if (this.showCenterAxis || this.showCenterDivider) {
      this._drawCenterAxis(ctx);
    }

    // 6. Draw Hover Cursor Reticle
    if (this.hoverX >= 0 && this.hoverY >= 0) {
      const cx = this.offsetX + this.hoverX * pitch + radius;
      const cy = this.offsetY + this.hoverY * pitch + radius;
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 4;
      ctx.strokeRect(cx - radius - 2, cy - radius - 2, this.pixelSize + 4, this.pixelSize + 4);
      ctx.restore();
    }

    // 7. Visor Acrylic Filter Simulation (Smoke Tint & Scanlines)
    if (this.showVisorFilter) {
      this._drawVisorOverlay(ctx, w, h);
    }
  }

  _drawGridHousing(ctx) {
    const pitch = this.pixelSize + this.pixelGap;
    const radius = this.pixelSize / 2;

    ctx.save();
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const cx = this.offsetX + x * pitch + radius;
        const cy = this.offsetY + y * pitch + radius;

        // Unlit reflector cup
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
        ctx.fillStyle = '#14141c';
        ctx.fill();

        ctx.strokeStyle = '#222230';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  setLedColor(colorName) {
    if (LED_COLOR_PALETTES[colorName]) {
      this.ledColor = colorName;
      this.state.color = colorName;
      localStorage.setItem('animatrix_led_color', colorName);
      this.render();
    }
  }

  _drawLed(ctx, cx, cy, radius, brightness) {
    const norm = brightness / 255;
    const pal = LED_COLOR_PALETTES[this.ledColor] || LED_COLOR_PALETTES.red;

    // Unlit LED appearance
    if (brightness === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.fillStyle = pal.unlit;
      ctx.fill();
      return;
    }

    // Active Glowing LED
    ctx.save();

    // 1. Bloom Glow (if enabled)
    if (this.showGlow && norm > 0.05) {
      const glowRadius = radius * (1.8 + norm * 1.6);
      const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, glowRadius);
      glowGrad.addColorStop(0, `rgba(${pal.glowRgb}, ${0.45 * norm})`);
      glowGrad.addColorStop(0.5, `rgba(${pal.glowRgb}, ${0.2 * norm})`);
      glowGrad.addColorStop(1, `rgba(${pal.glowRgb}, 0)`);

      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }

    // 2. LED Bead Body (Phosphor Base)
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
    
    // Gradient for authentic convex LED lens highlight
    const beadGrad = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, radius * 0.1, cx, cy, radius);
    
    if (norm > 0.8) {
      beadGrad.addColorStop(0, pal.high[0]);
      beadGrad.addColorStop(0.25, pal.high[1]);
      beadGrad.addColorStop(0.7, pal.high[2]);
      beadGrad.addColorStop(1, pal.high[3]);
    } else if (norm > 0.4) {
      beadGrad.addColorStop(0, pal.mid[0]);
      beadGrad.addColorStop(0.3, pal.mid[1]);
      beadGrad.addColorStop(1, pal.mid[2]);
    } else {
      beadGrad.addColorStop(0, pal.low[0]);
      beadGrad.addColorStop(0.5, pal.low[1]);
      beadGrad.addColorStop(1, pal.low[2]);
    }

    ctx.fillStyle = beadGrad;
    ctx.fill();

    ctx.restore();
  }

  _drawCenterAxis(ctx) {
    const centerX = Math.round(this.canvas.width / 2);
    const centerY = Math.round(this.canvas.height / 2);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.45)';
    ctx.lineWidth = 1.5;

    // Vertical Center Axis
    ctx.beginPath();
    ctx.moveTo(centerX, 2);
    ctx.lineTo(centerX, this.canvas.height - 2);
    ctx.stroke();

    // Horizontal Center Axis
    ctx.beginPath();
    ctx.moveTo(2, centerY);
    ctx.lineTo(this.canvas.width - 2, centerY);
    ctx.stroke();

    // Subtle center intersection reticle
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.6)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawCenterDivider(ctx) {
    this._drawCenterAxis(ctx);
  }

  _drawVisorOverlay(ctx, w, h) {
    ctx.save();
    // Smoke acrylic tint
    ctx.fillStyle = 'rgba(10, 5, 15, 0.35)';
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    // Curved visor glass glare highlight
    const glareGrad = ctx.createLinearGradient(0, 0, w, h);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    glareGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.02)');
    glareGrad.addColorStop(0.31, 'rgba(255, 255, 255, 0.0)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
    ctx.fillStyle = glareGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }
}
