/**
 * AnimationPlayer.js
 * High-precision animation playback controller supporting variable per-frame durations,
 * loop modes (infinite, once, ping-pong), and frame stepping.
 */

export class AnimationPlayer {
  constructor(matrixState) {
    this.state = matrixState;
    this.isPlaying = false;
    this.direction = 1; // 1 = forward, -1 = reverse (for ping-pong)
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;
    this.rafId = null;

    this.listeners = new Set();

    // Listen to state changes
    this.state.subscribe((event) => {
      if (event === 'frame_deleted' || event === 'matrix_resized' || event === 'frames_reloaded') {
        if (this.state.activeFrameIndex >= this.state.frames.length) {
          this.state.setActiveFrame(0);
        }
      }
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(event, data = {}) {
    for (const l of this.listeners) {
      l(event, data);
    }
  }

  play() {
    if (this.isPlaying) return;
    if (this.state.frames.length <= 1) return;

    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this._notify('play_state_change', { isPlaying: true });

    const loop = (now) => {
      if (!this.isPlaying) return;

      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;
      this.accumulatedTime += delta;

      const currentFrame = this.state.activeFrame;
      const targetDuration = currentFrame ? currentFrame.durationMs : this.state.defaultDurationMs;

      if (this.accumulatedTime >= targetDuration) {
        this.accumulatedTime -= targetDuration;
        this._advanceFrame();
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._notify('play_state_change', { isPlaying: false });
  }

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  stop() {
    this.pause();
    this.state.setActiveFrame(0);
    this.direction = 1;
    this._notify('stop');
  }

  _advanceFrame() {
    const total = this.state.frames.length;
    if (total <= 1) return;

    let nextIdx = this.state.activeFrameIndex + this.direction;

    if (this.state.loopMode === 'ping_pong') {
      if (nextIdx >= total) {
        this.direction = -1;
        nextIdx = total - 2;
      } else if (nextIdx < 0) {
        this.direction = 1;
        nextIdx = 1;
      }
    } else if (this.state.loopMode === 'once') {
      if (nextIdx >= total) {
        this.pause();
        return;
      }
    } else {
      // Default: infinite loop
      if (nextIdx >= total) {
        nextIdx = 0;
      } else if (nextIdx < 0) {
        nextIdx = total - 1;
      }
    }

    this.state.setActiveFrame(nextIdx);
  }

  stepForward() {
    this.pause();
    const total = this.state.frames.length;
    if (total <= 1) return;
    const nextIdx = (this.state.activeFrameIndex + 1) % total;
    this.state.setActiveFrame(nextIdx);
  }

  stepBackward() {
    this.pause();
    const total = this.state.frames.length;
    if (total <= 1) return;
    const prevIdx = (this.state.activeFrameIndex - 1 + total) % total;
    this.state.setActiveFrame(prevIdx);
  }
}
