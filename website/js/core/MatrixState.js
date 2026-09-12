/**
 * MatrixState.js
 * Central state store for matrix dimensions, frame buffers, timeline ordering, and undo/redo.
 */

export class MatrixState {
  constructor(width = 40, height = 3) {
    this.name = 'cylon_visor_sweep';
    this.author = 'Maker';
    this.width = width;
    this.height = height;
    this.color = localStorage.getItem('animatrix_led_color') || 'red';
    this.globalFps = 24;
    this.loopMode = 'infinite'; // 'infinite', 'once', 'ping_pong'
    this.activeFrameIndex = 0;
    
    // Frames array: [{ id, durationMs, data: Uint8Array(width * height) }]
    this.frames = [];
    
    // History stacks for Undo / Redo
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;

    // Listeners
    this.listeners = new Set();

    // Initialize with 1 empty frame
    this.addFrame(0, false);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data = {}) {
    for (const listener of this.listeners) {
      listener(event, data, this);
    }
  }

  /**
   * Generates a unique frame ID
   */
  _generateId() {
    return 'f_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  /**
   * Total number of pixels
   */
  get totalPixels() {
    return this.width * this.height;
  }

  /**
   * Default frame duration in ms derived from global FPS
   */
  get defaultDurationMs() {
    return Math.round(1000 / Math.max(1, this.globalFps));
  }

  /**
   * Creates a new blank pixel buffer
   */
  createBuffer() {
    return new Uint8Array(this.totalPixels);
  }

  /**
   * Get active frame
   */
  get activeFrame() {
    if (this.activeFrameIndex < 0 || this.activeFrameIndex >= this.frames.length) {
      this.activeFrameIndex = 0;
    }
    return this.frames[this.activeFrameIndex];
  }

  /**
   * Snapshot active frame data for undo history
   */
  pushUndo() {
    const frame = this.activeFrame;
    if (!frame) return;

    this.undoStack.push({
      frameIndex: this.activeFrameIndex,
      data: new Uint8Array(frame.data)
    });

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // Clear redo on new action
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const item = this.undoStack.pop();
    
    // Push current to redo
    const currentFrame = this.frames[item.frameIndex];
    if (currentFrame) {
      this.redoStack.push({
        frameIndex: item.frameIndex,
        data: new Uint8Array(currentFrame.data)
      });

      this.activeFrameIndex = item.frameIndex;
      currentFrame.data.set(item.data);
      this.notify('pixel_change', { frameIndex: this.activeFrameIndex });
      return true;
    }
    return false;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const item = this.redoStack.pop();
    const currentFrame = this.frames[item.frameIndex];
    if (currentFrame) {
      this.undoStack.push({
        frameIndex: item.frameIndex,
        data: new Uint8Array(currentFrame.data)
      });

      this.activeFrameIndex = item.frameIndex;
      currentFrame.data.set(item.data);
      this.notify('pixel_change', { frameIndex: this.activeFrameIndex });
      return true;
    }
    return false;
  }

  /**
   * Get pixel brightness (0 - 255)
   */
  getPixel(x, y, frameIndex = this.activeFrameIndex) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    const frame = this.frames[frameIndex];
    if (!frame) return 0;
    const idx = y * this.width + x;
    return frame.data[idx] || 0;
  }

  /**
   * Set pixel brightness (0 - 255)
   */
  setPixel(x, y, brightness, frameIndex = this.activeFrameIndex, notify = true) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const frame = this.frames[frameIndex];
    if (!frame) return;
    const idx = y * this.width + x;
    const clamped = Math.max(0, Math.min(255, Math.round(brightness)));
    if (frame.data[idx] !== clamped) {
      frame.data[idx] = clamped;
      if (notify) {
        this.notify('pixel_change', { x, y, brightness: clamped, frameIndex });
      }
    }
  }

  /**
   * Set entire frame buffer
   */
  setFrameData(frameIndex, buffer) {
    const frame = this.frames[frameIndex];
    if (!frame) return;
    frame.data = new Uint8Array(buffer);
    this.notify('pixel_change', { frameIndex });
  }

  /**
   * Add a frame directly after active frame (or at specific index)
   */
  addFrame(index = this.activeFrameIndex + 1, copyCurrent = false) {
    const newBuffer = this.createBuffer();
    let duration = this.defaultDurationMs;

    if (copyCurrent && this.activeFrame) {
      newBuffer.set(this.activeFrame.data);
      duration = this.activeFrame.durationMs;
    }

    const frame = {
      id: this._generateId(),
      durationMs: duration,
      data: newBuffer
    };

    const targetIdx = Math.max(0, Math.min(this.frames.length, index));
    this.frames.splice(targetIdx, 0, frame);
    this.activeFrameIndex = targetIdx;

    this.notify('frame_added', { frameIndex: targetIdx, frame });
    return frame;
  }

  /**
   * Duplicate active or specified frame directly after the source frame
   */
  duplicateFrame(index = this.activeFrameIndex) {
    const sourceIndex = Math.max(0, Math.min(this.frames.length - 1, index));
    const sourceFrame = this.frames[sourceIndex];
    const newBuffer = this.createBuffer();
    let duration = this.defaultDurationMs;

    if (sourceFrame) {
      newBuffer.set(sourceFrame.data);
      duration = sourceFrame.durationMs;
    }

    const frame = {
      id: this._generateId(),
      durationMs: duration,
      data: newBuffer
    };

    const targetIdx = sourceIndex + 1;
    this.frames.splice(targetIdx, 0, frame);
    this.activeFrameIndex = targetIdx;

    this.notify('frame_added', { frameIndex: targetIdx, frame });
    return frame;
  }

  /**
   * Delete a frame
   */
  deleteFrame(index = this.activeFrameIndex) {
    if (this.frames.length <= 1) {
      // Clear instead of deleting the last remaining frame
      this.clearFrame(0);
      return;
    }

    this.frames.splice(index, 1);
    if (this.activeFrameIndex >= this.frames.length) {
      this.activeFrameIndex = this.frames.length - 1;
    }

    this.notify('frame_deleted', { deletedIndex: index, newActiveIndex: this.activeFrameIndex });
  }

  /**
   * Move frame from one position to another
   */
  moveFrame(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.frames.length || toIndex >= this.frames.length) {
      return;
    }

    const [moved] = this.frames.splice(fromIndex, 1);
    this.frames.splice(toIndex, 0, moved);
    this.activeFrameIndex = toIndex;

    this.notify('frames_reordered', { fromIndex, toIndex });
  }

  /**
   * Reverse all frames order
   */
  reverseFrames() {
    this.frames.reverse();
    this.activeFrameIndex = 0;
    this.notify('frames_reversed');
  }

  /**
   * Invert all LED PWM values across all frames in the animation
   */
  invertAllFrames() {
    if (!this.frames || this.frames.length === 0) return;
    for (const frame of this.frames) {
      for (let i = 0; i < frame.data.length; i++) {
        frame.data[i] = 255 - frame.data[i];
      }
    }
    this.notify('frames_reloaded');
  }

  /**
   * Completely clear the animation and start with a blank slate (1 empty frame)
   */
  clearAnimation() {
    this.frames = [];
    this.undoStack = [];
    this.redoStack = [];
    this.addFrame(0, false);
    this.activeFrameIndex = 0;
    this.notify('frames_reloaded');
  }

  /**
   * Select a frame as active
   */
  setActiveFrame(index) {
    if (index >= 0 && index < this.frames.length) {
      this.activeFrameIndex = index;
      this.notify('active_frame_change', { activeFrameIndex: index });
    }
  }

  /**
   * Set per-frame duration in ms
   */
  setFrameDuration(index, ms) {
    const frame = this.frames[index];
    if (frame) {
      frame.durationMs = Math.max(10, Math.min(60000, Math.round(ms)));
      this.notify('frame_duration_change', { frameIndex: index, durationMs: frame.durationMs });
    }
  }

  /**
   * Set global FPS and optionally apply to all frames
   */
  setGlobalFps(fps, applyToAll = false) {
    const oldFps = this.globalFps;
    this.globalFps = Math.max(1, Math.min(60, Math.round(fps)));
    if (applyToAll && this.frames.length > 0) {
      const dur = this.defaultDurationMs;
      const firstDur = this.frames[0].durationMs;
      const isUniform = this.frames.every((f) => Math.abs(f.durationMs - firstDur) <= 1);

      if (isUniform) {
        this.frames.forEach((f) => { f.durationMs = dur; });
      } else if (oldFps !== this.globalFps) {
        const ratio = oldFps / this.globalFps;
        this.frames.forEach((f) => {
          f.durationMs = Math.max(10, Math.round(f.durationMs * ratio));
        });
      }
    }
    this.notify('global_fps_change', { fps: this.globalFps });
  }

  /**
   * Clear all pixels in a frame
   */
  clearFrame(index = this.activeFrameIndex) {
    const frame = this.frames[index];
    if (!frame) return;
    this.pushUndo();
    frame.data.fill(0);
    this.notify('pixel_change', { frameIndex: index });
  }

  /**
   * Fill all pixels in a frame with a brightness
   */
  fillFrame(brightness = 255, index = this.activeFrameIndex) {
    const frame = this.frames[index];
    if (!frame) return;
    this.pushUndo();
    frame.data.fill(Math.max(0, Math.min(255, Math.round(brightness))));
    this.notify('pixel_change', { frameIndex: index });
  }

  /**
   * Resize matrix dimensions with optional anchoring (top-left)
   */
  resize(newWidth, newHeight) {
    if (newWidth === this.width && newHeight === this.height) return;
    if (newWidth < 1 || newHeight < 1 || newWidth > 128 || newHeight > 64) return;

    const oldWidth = this.width;
    const oldHeight = this.height;

    this.width = newWidth;
    this.height = newHeight;

    // Reallocate buffers for each frame
    for (const frame of this.frames) {
      const oldData = frame.data;
      const newData = new Uint8Array(newWidth * newHeight);

      // Copy overlapping pixels
      const minW = Math.min(oldWidth, newWidth);
      const minH = Math.min(oldHeight, newHeight);

      for (let y = 0; y < minH; y++) {
        for (let x = 0; x < minW; x++) {
          const oldIdx = y * oldWidth + x;
          const newIdx = y * newWidth + x;
          newData[newIdx] = oldData[oldIdx];
        }
      }
      frame.data = newData;
    }

    this.undoStack = [];
    this.redoStack = [];
    this.notify('matrix_resized', { width: newWidth, height: newHeight });
  }

  /**
   * Set active LED color/phosphor profile
   */
  setColor(colorName) {
    if (!colorName) return;
    this.color = colorName;
    localStorage.setItem('animatrix_led_color', colorName);
    this.notify('color_change', { color: colorName });
  }
}
