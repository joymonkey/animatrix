/**
 * JsonHandler.js
 * Implements export and import routines for the Animatrix v1 JSON animation specification.
 * Supports both compact 'hex_stream' (optimized for ESP32 flash/RAM) and readable 'raw_array'.
 */

export class JsonHandler {
  constructor(matrixState) {
    this.state = matrixState;
  }

  /**
   * Serializes current animation state into an Animatrix JSON object
   */
  exportToJsonObject(options = {}) {
    const {
      encoding = 'hex_stream', // 'hex_stream' or 'raw_array'
      indent = false
    } = options;

    const w = this.state.width;
    const h = this.state.height;

    const exportObj = {
      $schema: 'animatrix-v1',
      name: this.state.name || 'daft_punk_anim',
      author: this.state.author || 'Maker',
      version: 1,
      matrix: {
        width: w,
        height: h,
        color: 'red',
        grayscale_depth: 8
      },
      playback: {
        fps: this.state.globalFps,
        loop: this.state.loopMode,
        ping_pong: (this.state.loopMode === 'ping_pong')
      },
      total_frames: this.state.frames.length,
      frames: []
    };

    for (const frame of this.state.frames) {
      const frameRecord = {
        duration_ms: frame.durationMs,
        encoding: encoding
      };

      if (encoding === 'hex_stream') {
        // 2 hex characters per pixel: e.g. 255 -> "ff", 0 -> "00"
        let hexStr = '';
        for (let i = 0; i < frame.data.length; i++) {
          const val = frame.data[i];
          hexStr += (val < 16 ? '0' : '') + val.toString(16);
        }
        frameRecord.data = hexStr;
      } else {
        // Raw 2D array of rows
        const rows = [];
        for (let y = 0; y < h; y++) {
          const row = [];
          for (let x = 0; x < w; x++) {
            row.push(frame.data[y * w + x]);
          }
          rows.push(row);
        }
        frameRecord.data = rows;
      }

      exportObj.frames.push(frameRecord);
    }

    return exportObj;
  }

  /**
   * Returns JSON string with optional formatting
   */
  exportToJsonString(options = {}) {
    const obj = this.exportToJsonObject(options);
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
   * Imports animation from parsed JSON object or JSON string
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

    // Validate structure
    if (!obj || (!obj.frames && !Array.isArray(obj))) {
      throw new Error('Unrecognized animation format. Expected an object with a "frames" array.');
    }

    const rawFrames = Array.isArray(obj) ? obj : obj.frames;
    if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
      throw new Error('Animation must contain at least one frame.');
    }

    // Metadata extraction
    const matrixMeta = obj.matrix || {};
    const newWidth = parseInt(matrixMeta.width, 10) || this.state.width;
    const newHeight = parseInt(matrixMeta.height, 10) || this.state.height;

    // Resize matrix if imported dimensions differ
    if (newWidth !== this.state.width || newHeight !== this.state.height) {
      this.state.resize(newWidth, newHeight);
    }

    if (obj.name) this.state.name = obj.name;
    if (obj.author) this.state.author = obj.author;
    if (obj.playback) {
      if (obj.playback.fps) this.state.setGlobalFps(obj.playback.fps);
      if (obj.playback.loop) this.state.loopMode = obj.playback.loop;
    }

    const importedFrames = [];
    const expectedLength = newWidth * newHeight;

    for (let f = 0; f < rawFrames.length; f++) {
      const srcFrame = rawFrames[f];
      const duration = parseInt(srcFrame.duration_ms || srcFrame.duration || this.state.defaultDurationMs, 10);
      const buffer = new Uint8Array(expectedLength);

      if (srcFrame.encoding === 'hex_stream' && typeof srcFrame.data === 'string') {
        const hex = srcFrame.data.trim();
        for (let i = 0; i < expectedLength; i++) {
          const byteStr = hex.substring(i * 2, i * 2 + 2);
          buffer[i] = parseInt(byteStr, 16) || 0;
        }
      } else if (Array.isArray(srcFrame.data)) {
        if (Array.isArray(srcFrame.data[0])) {
          // 2D Array of rows
          for (let y = 0; y < Math.min(newHeight, srcFrame.data.length); y++) {
            const row = srcFrame.data[y];
            for (let x = 0; x < Math.min(newWidth, row.length); x++) {
              buffer[y * newWidth + x] = Math.max(0, Math.min(255, row[x] || 0));
            }
          }
        } else {
          // Flat 1D Array
          for (let i = 0; i < Math.min(expectedLength, srcFrame.data.length); i++) {
            buffer[i] = Math.max(0, Math.min(255, srcFrame.data[i] || 0));
          }
        }
      } else if (typeof srcFrame === 'string') {
        // Direct hex string frame
        for (let i = 0; i < expectedLength; i++) {
          const byteStr = srcFrame.substring(i * 2, i * 2 + 2);
          buffer[i] = parseInt(byteStr, 16) || 0;
        }
      }

      importedFrames.push({
        id: 'imp_' + Math.random().toString(36).substring(2, 9),
        durationMs: duration,
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
