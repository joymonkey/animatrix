/**
 * JsonHandler.js
 * Implements export and import routines for the Animatrix v2 JSON animation specification.
 * Standardizes purely on a flat, compact array of hex strings (2 hex chars per LED)
 * with resolution-agnostic headers (width, height, color, fps, loop).
 */

export class JsonHandler {
  constructor(matrixState) {
    this.state = matrixState;
  }

  /**
   * Serializes current animation state into an animatrix-v2 JSON object
   */
  exportToJsonObject() {
    const w = this.state.width;
    const h = this.state.height;
    const expectedBytes = w * h;

    const exportObj = {
      $schema: 'animatrix-v2',
      name: this.state.name || 'daft_punk_anim',
      author: this.state.author || 'Maker',
      matrix: {
        width: w,
        height: h,
        color: this.state.color || 'red'
      },
      playback: {
        fps: this.state.globalFps || 24,
        loop: this.state.loopMode || 'infinite'
      },
      total_frames: this.state.frames.length,
      frames: []
    };

    for (const frame of this.state.frames) {
      let hexStr = '';
      for (let i = 0; i < expectedBytes; i++) {
        const val = frame.data[i] || 0;
        hexStr += (val < 16 ? '0' : '') + val.toString(16);
      }
      exportObj.frames.push(hexStr);
    }

    return exportObj;
  }

  /**
   * Returns JSON string with optional indentation
   */
  exportToJsonString(options = {}) {
    const obj = this.exportToJsonObject();
    const space = options.indent ? 2 : 0;
    return JSON.stringify(obj, null, space);
  }

  /**
   * Triggers browser download of the animation JSON file
   */
  downloadJson(options = {}) {
    const jsonStr = this.exportToJsonString(options);
    const filename = `${this.state.name || 'daft_punk_anim'}.json`;
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Imports animation from parsed JSON object or JSON string.
   * Auto-resizes the matrix canvas if imported dimensions differ.
   */
  importFromJson(jsonInput) {
    let obj = jsonInput;
    if (typeof jsonInput === 'string') {
      try {
        obj = JSON.parse(jsonInput);
      } catch (err) {
        throw new Error(`Invalid JSON syntax: ${err.message}`);
      }
    }

    if (!obj || !Array.isArray(obj.frames) || obj.frames.length === 0) {
      throw new Error('Unrecognized animation format. Expected an object with a "frames" array.');
    }

    // Extract metadata
    const matrixMeta = obj.matrix || {};
    const newWidth = parseInt(matrixMeta.width, 10) || this.state.width;
    const newHeight = parseInt(matrixMeta.height, 10) || this.state.height;
    const expectedPixels = newWidth * newHeight;

    // Resize matrix if imported dimensions differ
    if (newWidth !== this.state.width || newHeight !== this.state.height) {
      this.state.resize(newWidth, newHeight);
    }

    if (obj.name) this.state.name = obj.name;
    if (obj.author) this.state.author = obj.author;
    if (matrixMeta.color) this.state.setColor(matrixMeta.color);
    if (obj.playback) {
      if (obj.playback.fps) this.state.setGlobalFps(obj.playback.fps);
      if (obj.playback.loop) this.state.loopMode = obj.playback.loop;
    }

    const frameDurationMs = this.state.defaultDurationMs;
    const importedFrames = [];

    for (let f = 0; f < obj.frames.length; f++) {
      const srcFrame = obj.frames[f];
      const buffer = new Uint8Array(expectedPixels);

      // Read hex string
      const hexStr = (typeof srcFrame === 'string') ? srcFrame.trim() : (srcFrame.data || '');
      const hexLen = hexStr.length;

      for (let i = 0; i < expectedPixels; i++) {
        if (i * 2 + 1 < hexLen) {
          const byteStr = hexStr.substring(i * 2, i * 2 + 2);
          buffer[i] = parseInt(byteStr, 16) || 0;
        }
      }

      importedFrames.push({
        id: 'imp_' + Math.random().toString(36).substring(2, 9),
        durationMs: frameDurationMs,
        data: buffer
      });
    }

    this.state.pushUndo();
    this.state.frames = importedFrames;
    this.state.activeFrameIndex = 0;
    this.state.notify('frames_reloaded', { count: importedFrames.length });

    return {
      name: this.state.name,
      framesCount: importedFrames.length,
      width: newWidth,
      height: newHeight
    };
  }
}
