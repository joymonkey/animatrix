/**
 * DrawEngine.js
 * Implements pixel drawing tools: Pencil, Eraser, Eyedropper, Bucket Fill,
 * Line, Rectangle, Nudge/Shift, Invert, Flip, and Brightness adjustments.
 */

export class DrawEngine {
  constructor(matrixState, ledCanvas) {
    this.state = matrixState;
    this.canvas = ledCanvas;

    // Tool state
    this.currentTool = 'pencil'; // 'pencil', 'eraser', 'eyedropper', 'fill', 'line', 'rect', 'rect_filled'
    this.fgBrightness = 255;     // Foreground PWM (0 - 255)
    this.bgBrightness = 0;       // Background PWM (0 - 255)
    this.activeStrokeBrightness = 255;
    this.wrapShift = true;       // Wrap pixels around edges when shifting

    // Drag / Geometry Start Point
    this.dragStartX = -1;
    this.dragStartY = -1;
    this.isDragging = false;
    this.previewBuffer = null;

    this._setupCanvasCallbacks();
  }

  get brushBrightness() {
    return this.fgBrightness;
  }

  set brushBrightness(val) {
    this.setFgBrightness(val);
  }

  setTool(toolName) {
    this.currentTool = toolName;
  }

  setFgBrightness(val) {
    this.fgBrightness = Math.max(0, Math.min(255, Math.round(val)));
    if (this.onBrightnessChange) this.onBrightnessChange('fg', this.fgBrightness);
  }

  setBgBrightness(val) {
    this.bgBrightness = Math.max(0, Math.min(255, Math.round(val)));
    if (this.onBrightnessChange) this.onBrightnessChange('bg', this.bgBrightness);
  }

  setBrightness(val) {
    this.setFgBrightness(val);
  }

  swapFgBg() {
    const tmp = this.fgBrightness;
    this.fgBrightness = this.bgBrightness;
    this.bgBrightness = tmp;
    if (this.onBrightnessChange) {
      this.onBrightnessChange('fg', this.fgBrightness);
      this.onBrightnessChange('bg', this.bgBrightness);
    }
  }

  resetFgBg() {
    this.fgBrightness = 255;
    this.bgBrightness = 0;
    if (this.onBrightnessChange) {
      this.onBrightnessChange('fg', this.fgBrightness);
      this.onBrightnessChange('bg', this.bgBrightness);
    }
  }

  _setupCanvasCallbacks() {
    this.canvas.onPixelInteract = (x, y, isStart, isEnd, event) => {
      if (isStart) {
        this.state.pushUndo();
        this.dragStartX = x;
        this.dragStartY = y;
        this.isDragging = true;

        if (this.currentTool === 'pencil') {
          const currentVal = this.state.getPixel(x, y);
          // Clicking once sets to foreground PWM; clicking a second time sets to background PWM
          this.activeStrokeBrightness = (currentVal === this.fgBrightness) ? this.bgBrightness : this.fgBrightness;
          this.state.setPixel(x, y, this.activeStrokeBrightness);
        } else if (this.currentTool === 'eraser') {
          this.state.setPixel(x, y, 0);
        } else if (this.currentTool === 'eyedropper') {
          const picked = this.state.getPixel(x, y);
          if (this.onEyedropperPick) {
            this.onEyedropperPick(picked, event);
          } else {
            this.setFgBrightness(picked);
          }
        } else if (this.currentTool === 'fill') {
          this.floodFill(x, y, this.fgBrightness);
        } else if (this.currentTool === 'line' || this.currentTool === 'rect' || this.currentTool === 'rect_filled') {
          // Clone buffer for previewing shapes while dragging
          this.previewBuffer = new Uint8Array(this.state.activeFrame.data);
        }
      } else if (this.isDragging && !isEnd) {
        if (this.currentTool === 'pencil') {
          this.state.setPixel(x, y, this.activeStrokeBrightness);
        } else if (this.currentTool === 'eraser') {
          this.state.setPixel(x, y, 0);
        } else if (this.currentTool === 'line' && this.previewBuffer) {
          this._previewShape((buf) => this._rasterizeLine(this.dragStartX, this.dragStartY, x, y, this.fgBrightness, buf));
        } else if (this.currentTool === 'rect' && this.previewBuffer) {
          this._previewShape((buf) => this._rasterizeRect(this.dragStartX, this.dragStartY, x, y, this.fgBrightness, false, buf));
        } else if (this.currentTool === 'rect_filled' && this.previewBuffer) {
          this._previewShape((buf) => this._rasterizeRect(this.dragStartX, this.dragStartY, x, y, this.fgBrightness, true, buf));
        }
      } else if (isEnd) {
        if (this.previewBuffer) {
          if (this.currentTool === 'line') {
            this._rasterizeLine(this.dragStartX, this.dragStartY, x, y, this.fgBrightness);
          } else if (this.currentTool === 'rect') {
            this._rasterizeRect(this.dragStartX, this.dragStartY, x, y, this.fgBrightness, false);
          } else if (this.currentTool === 'rect_filled') {
            this._rasterizeRect(this.dragStartX, this.dragStartY, x, y, this.fgBrightness, true);
          }
          this.previewBuffer = null;
        }
        this.isDragging = false;
        this.dragStartX = -1;
        this.dragStartY = -1;
      }
    };
  }

  _previewShape(drawer) {
    const frame = this.state.activeFrame;
    if (!frame || !this.previewBuffer) return;
    
    // Copy clean preview buffer
    frame.data.set(this.previewBuffer);
    drawer(frame.data);
    this.canvas.render();
  }

  /**
   * Flood Fill algorithm
   */
  floodFill(startX, startY, fillBrightness) {
    const targetBrightness = this.state.getPixel(startX, startY);
    if (targetBrightness === fillBrightness) return;

    const w = this.state.width;
    const h = this.state.height;
    const queue = [[startX, startY]];
    const visited = new Uint8Array(w * h);

    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      const idx = cy * w + cx;

      if (visited[idx]) continue;
      visited[idx] = 1;

      if (this.state.getPixel(cx, cy) === targetBrightness) {
        this.state.setPixel(cx, cy, fillBrightness, this.state.activeFrameIndex, false);

        if (cx > 0) queue.push([cx - 1, cy]);
        if (cx < w - 1) queue.push([cx + 1, cy]);
        if (cy > 0) queue.push([cx, cy - 1]);
        if (cy < h - 1) queue.push([cx, cy + 1]);
      }
    }

    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }

  /**
   * Bresenham Line Drawing
   */
  _rasterizeLine(x0, y0, x1, y1, brightness, customBuf = null) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      if (customBuf) {
        if (cx >= 0 && cx < this.state.width && cy >= 0 && cy < this.state.height) {
          customBuf[cy * this.state.width + cx] = brightness;
        }
      } else {
        this.state.setPixel(cx, cy, brightness, this.state.activeFrameIndex, false);
      }

      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }

    if (!customBuf) {
      this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
    }
  }

  /**
   * Rectangle Drawing
   */
  _rasterizeRect(x0, y0, x1, y1, brightness, filled = false, customBuf = null) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const isBorder = (x === minX || x === maxX || y === minY || y === maxY);
        if (filled || isBorder) {
          if (customBuf) {
            if (x >= 0 && x < this.state.width && y >= 0 && y < this.state.height) {
              customBuf[y * this.state.width + x] = brightness;
            }
          } else {
            this.state.setPixel(x, y, brightness, this.state.activeFrameIndex, false);
          }
        }
      }
    }

    if (!customBuf) {
      this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
    }
  }

  /**
   * Shift / Nudge Pixels Left, Right, Up, or Down
   */
  shift(dx, dy) {
    const frame = this.state.activeFrame;
    if (!frame) return;

    this.state.pushUndo();
    const w = this.state.width;
    const h = this.state.height;
    const old = new Uint8Array(frame.data);
    const updated = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let targetX = x + dx;
        let targetY = y + dy;

        if (this.wrapShift) {
          targetX = (targetX % w + w) % w;
          targetY = (targetY % h + h) % h;
          updated[targetY * w + targetX] = old[y * w + x];
        } else {
          if (targetX >= 0 && targetX < w && targetY >= 0 && targetY < h) {
            updated[targetY * w + targetX] = old[y * w + x];
          }
        }
      }
    }

    frame.data.set(updated);
    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }

  /**
   * Flip Horizontal
   */
  flipHorizontal() {
    const frame = this.state.activeFrame;
    if (!frame) return;

    this.state.pushUndo();
    const w = this.state.width;
    const h = this.state.height;
    const old = new Uint8Array(frame.data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const oppX = w - 1 - x;
        frame.data[y * w + x] = old[y * w + oppX];
      }
    }

    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }

  /**
   * Flip Vertical
   */
  flipVertical() {
    const frame = this.state.activeFrame;
    if (!frame) return;

    this.state.pushUndo();
    const w = this.state.width;
    const h = this.state.height;
    const old = new Uint8Array(frame.data);

    for (let y = 0; y < h; y++) {
      const oppY = h - 1 - y;
      for (let x = 0; x < w; x++) {
        frame.data[y * w + x] = old[oppY * w + x];
      }
    }

    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }

  /**
   * Invert Pixel Brightness
   */
  invert() {
    const frame = this.state.activeFrame;
    if (!frame) return;

    this.state.pushUndo();
    for (let i = 0; i < frame.data.length; i++) {
      frame.data[i] = 255 - frame.data[i];
    }

    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }

  /**
   * Brightness Scaling (+/- percent)
   */
  scaleBrightness(factor) {
    const frame = this.state.activeFrame;
    if (!frame) return;

    this.state.pushUndo();
    for (let i = 0; i < frame.data.length; i++) {
      if (frame.data[i] > 0) {
        frame.data[i] = Math.max(0, Math.min(255, Math.round(frame.data[i] * factor)));
      }
    }

    this.state.notify('pixel_change', { frameIndex: this.state.activeFrameIndex });
  }
}
